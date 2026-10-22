import JSZip from "jszip";
import { extractDirectChildren } from "../server/blockExtractor.ts";
import type {
  FullTextExcludedItem,
  FullTextIssueCode,
  FullTextManifest,
  FullTextPartInventoryItem,
  FullTextSegment,
  FullTextStoryKind,
} from "../shared/fullDocumentTextProtocol.ts";

interface SegmentAnchor {
  packagePartUri: string;
  storyKind: FullTextStoryKind;
  anchor: string;
  sourceBlockId?: string;
  tableId?: string;
  cellId?: string;
  rowIndex?: number;
  cellIndex?: number;
  paragraphIndex?: number;
  noteId?: string;
  relationshipId?: string;
}

interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

const EXTRACTOR_VERSION = "docx-text-manifest-v1" as const;
const WORDPROCESSINGML_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const BLOCK_CHILDREN = new Set(["w:p", "w:tbl", "w:sectPr"]);
const TABLE_CHILDREN = new Set(["w:p", "w:tbl"]);
const TEXTBOX_CHILDREN = new Set(["w:p", "w:tbl"]);
const TEXT_BEARING_XML = /<(?:[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}.\-\u00B7\u0300-\u036F\u203F-\u2040]*:)?(?:t|instrText|delText|delInstrText|text)\b/iu;

interface WordNamespaceProfile {
  safePrefixes: string[];
  ambiguousPrefixes: string[];
}

function bytesView(sourceBytes: Uint8Array | ArrayBuffer): Uint8Array {
  return sourceBytes instanceof Uint8Array ? sourceBytes : new Uint8Array(sourceBytes);
}

async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeXmlText(value: string): string {
  const decodeEntities = (text: string) => text
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
      const normalized = token.toLowerCase();
      if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as const)[normalized as "amp" | "lt" | "gt" | "quot" | "apos"];
    });
  let decoded = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("<![CDATA[", cursor);
    if (start < 0) return decoded + decodeEntities(value.slice(cursor));
    decoded += decodeEntities(value.slice(cursor, start));
    const end = value.indexOf("]]>", start + 9);
    if (end < 0) return decoded + value.slice(start);
    decoded += value.slice(start + 9, end);
    cursor = end + 3;
  }
  return decoded;
}

function escapeXmlCdataSectionsForParsing(xml: string): string {
  let result = "";
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) return result + xml.slice(cursor);
    result += xml.slice(cursor, start);
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) return result;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2);
      if (end < 0) return result;
      cursor = end + 2;
      continue;
    }
    if (!xml.startsWith("<![CDATA[", start)) {
      result += "<";
      cursor = start + 1;
      continue;
    }
    const contentStart = start + 9;
    const end = xml.indexOf("]]>", contentStart);
    const contentEnd = end < 0 ? xml.length : end;
    result += xml.slice(contentStart, contentEnd)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (end < 0) return result;
    cursor = end + 3;
  }
  return result;
}

function parseAttributes(tagXml: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const tagEnd = tagXml.indexOf(">") + 1;
  const openingTag = tagXml.slice(0, tagEnd > 0 ? tagEnd : tagXml.length);
  const expression = /([\w:.-]+)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(openingTag)) !== null) attributes[match[1]] = decodeXmlText(match[3]);
  return attributes;
}

function wordNamespaceProfile(xml: string): WordNamespaceProfile {
  const bindings = new Map<string, Set<string>>();
  scanXmlTags(xml, (_rawTag, tag) => {
    for (const attribute of tag.attributes) {
      const prefix = attribute.name === "xmlns"
        ? ""
        : attribute.name.startsWith("xmlns:") ? attribute.name.slice("xmlns:".length) : undefined;
      if (prefix === undefined) continue;
      const values = bindings.get(prefix) ?? new Set<string>();
      values.add(decodeXmlText(attribute.value));
      bindings.set(prefix, values);
    }
  });
  const safePrefixes: string[] = [];
  const ambiguousPrefixes: string[] = [];
  for (const [prefix, values] of bindings) {
    if (!values.has(WORDPROCESSINGML_NAMESPACE)) continue;
    if (values.size === 1) safePrefixes.push(prefix);
    else ambiguousPrefixes.push(prefix);
  }
  // Preserve legacy parsing for older files without an explicit w binding.
  if (!bindings.has("w")) safePrefixes.push("w");
  return { safePrefixes: [...new Set(safePrefixes)], ambiguousPrefixes };
}

const XML_NAME_PART = String.raw`[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}.\-\u00B7\u0300-\u036F\u203F-\u2040]*`;
const XML_QNAME_AT_START = new RegExp("^" + XML_NAME_PART + "(?::" + XML_NAME_PART + ")?", "u");

interface XmlAttributeToken {
  name: string;
  value: string;
  start: number;
  end: number;
}

interface XmlTagToken {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  nameStart: number;
  nameEnd: number;
  attributes: XmlAttributeToken[];
}

function parseXmlTagToken(rawTag: string): XmlTagToken | null {
  const inner = rawTag.slice(1, -1);
  let cursor = 0;
  while (/\s/.test(inner[cursor] ?? "")) cursor++;
  const closing = inner[cursor] === "/";
  if (closing) {
    cursor++;
    while (/\s/.test(inner[cursor] ?? "")) cursor++;
  }
  const nameMatch = XML_QNAME_AT_START.exec(inner.slice(cursor));
  if (!nameMatch) return null;
  const name = nameMatch[0];
  const nameStart = cursor + 1;
  const nameEnd = nameStart + name.length;
  cursor += name.length;
  const attributes: XmlAttributeToken[] = [];

  while (!closing && cursor < inner.length) {
    while (/\s/.test(inner[cursor] ?? "")) cursor++;
    if (cursor >= inner.length || inner[cursor] === "/") break;
    const attributeMatch = XML_QNAME_AT_START.exec(inner.slice(cursor));
    if (!attributeMatch) {
      cursor++;
      continue;
    }
    const attributeName = attributeMatch[0];
    const attributeStart = cursor + 1;
    const attributeEnd = attributeStart + attributeName.length;
    cursor += attributeName.length;
    while (/\s/.test(inner[cursor] ?? "")) cursor++;
    if (inner[cursor] !== "=") continue;
    cursor++;
    while (/\s/.test(inner[cursor] ?? "")) cursor++;
    const quote = inner[cursor];
    if (quote !== "\"" && quote !== "'") continue;
    const valueEnd = inner.indexOf(quote, cursor + 1);
    if (valueEnd < 0) break;
    attributes.push({
      name: attributeName,
      value: inner.slice(cursor + 1, valueEnd),
      start: attributeStart,
      end: attributeEnd,
    });
    cursor = valueEnd + 1;
  }

  return {
    name,
    closing,
    selfClosing: !closing && /\/\s*$/.test(inner),
    nameStart,
    nameEnd,
    attributes,
  };
}

function scanXmlTags(xml: string, visit: (rawTag: string, tag: XmlTagToken, start: number, end: number) => void): void {
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) return;
    if (xml.startsWith("<!--", start) || xml.startsWith("<![CDATA[", start) || xml.startsWith("<?", start)) {
      const terminator = xml.startsWith("<!--", start) ? "-->" : xml.startsWith("<![CDATA[", start) ? "]]>": "?>";
      const close = xml.indexOf(terminator, start + 2);
      if (close < 0) return;
      cursor = close + terminator.length;
      continue;
    }

    let end = start + 1;
    let quote: string | null = null;
    for (; end < xml.length; end++) {
      const character = xml[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === "\"" || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end >= xml.length) return;
    const rawTag = xml.slice(start, end + 1);
    if (!rawTag.startsWith("<!")) {
      const tag = parseXmlTagToken(rawTag);
      if (tag) visit(rawTag, tag, start, end + 1);
    }
    cursor = end + 1;
  }
}

function namespaceUriForPrefix(prefix: string, namespaces: Map<string, string>, namespaceProfile: WordNamespaceProfile): string {
  if (namespaces.has(prefix)) return namespaces.get(prefix) ?? "";
  return prefix === "w" && namespaceProfile.safePrefixes.includes("w") ? WORDPROCESSINGML_NAMESPACE : "";
}

function normalizeXmlTagNames(
  rawTag: string,
  tag: XmlTagToken,
  namespaceProfile: WordNamespaceProfile,
  inheritedNamespaces: Map<string, string>,
): { xml: string; namespaces: Map<string, string> } {
  const namespaces = new Map(inheritedNamespaces);
  if (!tag.closing) {
    for (const attribute of tag.attributes) {
      if (attribute.name === "xmlns") namespaces.set("", decodeXmlText(attribute.value));
      else if (attribute.name.startsWith("xmlns:")) {
        namespaces.set(attribute.name.slice("xmlns:".length), decodeXmlText(attribute.value));
      }
    }
  }

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const elementColon = tag.name.indexOf(":");
  const elementPrefix = elementColon < 0 ? "" : tag.name.slice(0, elementColon);
  const elementLocalName = elementColon < 0 ? tag.name : tag.name.slice(elementColon + 1);
  const elementNamespace = namespaceUriForPrefix(elementPrefix, namespaces, namespaceProfile);
  if (elementNamespace === WORDPROCESSINGML_NAMESPACE &&
      (elementPrefix === "" || (elementPrefix !== "w" && namespaceProfile.safePrefixes.includes(elementPrefix)))) {
    replacements.push({ start: tag.nameStart, end: tag.nameEnd, value: "w:" + elementLocalName });
  }

  for (const attribute of tag.attributes) {
    const colonIndex = attribute.name.indexOf(":");
    if (colonIndex < 0) continue;
    const prefix = attribute.name.slice(0, colonIndex);
    if (prefix === "xmlns" || prefix === "w" || !namespaceProfile.safePrefixes.includes(prefix)) continue;
    if (namespaceUriForPrefix(prefix, namespaces, namespaceProfile) !== WORDPROCESSINGML_NAMESPACE) continue;
    replacements.push({
      start: attribute.start,
      end: attribute.end,
      value: "w:" + attribute.name.slice(colonIndex + 1),
    });
  }

  let normalized = rawTag;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    normalized = normalized.slice(0, replacement.start) + replacement.value + normalized.slice(replacement.end);
  }
  return { xml: normalized, namespaces };
}

function normalizeWordprocessingMlElements(xml: string, namespaceProfile: WordNamespaceProfile): string {
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const namespaceStack: Map<string, string>[] = [];
  scanXmlTags(xml, (rawTag, tag, start, end) => {
    const inherited = namespaceStack[namespaceStack.length - 1] ?? new Map<string, string>();
    const normalized = normalizeXmlTagNames(rawTag, tag, namespaceProfile, inherited);
    if (normalized.xml !== rawTag) replacements.push({ start, end, value: normalized.xml });

    if (tag.closing) namespaceStack.pop();
    else if (!tag.selfClosing) namespaceStack.push(normalized.namespaces);
  });

  let normalizedXml = xml;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    normalizedXml = normalizedXml.slice(0, replacement.start) + replacement.value + normalizedXml.slice(replacement.end);
  }
  return normalizedXml;
}

function qualifiedNames(prefixes: string[], localNames: string[]): string[] {
  return prefixes.flatMap(prefix => localNames.map(localName => prefix ? `${prefix}:${localName}` : localName));
}

function namePattern(names: string[]): string {
  return names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

function extractRelationships(xml: string): Relationship[] {
  const relationships: Relationship[] = [];
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?\s*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if (!attrs.Id || !attrs.Type || !attrs.Target) continue;
    relationships.push({
      id: attrs.Id,
      type: attrs.Type,
      target: attrs.Target,
      external: attrs.TargetMode?.toLowerCase() === "external",
    });
  }
  return relationships;
}

function resolvePartTarget(target: string): string {
  const decoded = (() => {
    try { return decodeURIComponent(target); } catch { return target; }
  })().replace(/\\/g, "/");
  const segments = decoded.startsWith("/") ? [] : ["word"];
  for (const segment of decoded.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

function paragraphUnsafeCode(xml: string, namespaceProfile: WordNamespaceProfile): { code: FullTextIssueCode; reason: string } | null {
  xml = escapeXmlCdataSectionsForParsing(xml);
  const hiddenNames = namePattern(qualifiedNames(namespaceProfile.safePrefixes, ["vanish", "webHidden"]));
  const hiddenPattern = new RegExp(`<(${hiddenNames})\\b([^>]*)\\/?\\s*>`, "gi");
  for (const match of xml.matchAll(hiddenPattern)) {
    const attrs = parseAttributes(`<${match[1]} ${match[2]}/>`);
    const value = Object.entries(attrs).find(([name]) => name === "val" || name.endsWith(":val"))?.[1]?.toLowerCase();
    if (!value || !["0", "false", "off"].includes(value)) {
      return { code: "hidden_text", reason: "Đoạn có văn bản ẩn; bỏ toàn đoạn để tránh gửi nội dung ẩn." };
    }
  }
  const trackedNames = namePattern(qualifiedNames(namespaceProfile.safePrefixes, ["ins", "del", "moveFrom", "moveTo", "delText"]));
  if (new RegExp(`<(${trackedNames})\\b`, "i").test(xml)) {
    return { code: "tracked_changes", reason: "Đoạn có nội dung sửa đổi theo dõi; chưa đưa vào phạm vi văn bản hiển thị đã xác nhận." };
  }
  const fieldNames = namePattern(qualifiedNames(namespaceProfile.safePrefixes, ["instrText", "delInstrText", "fldChar", "fldSimple"]));
  if (new RegExp(`<(${fieldNames})\\b`, "i").test(xml)) {
    return { code: "field_instruction", reason: "Đoạn có mã trường; chưa tách an toàn giá trị hiển thị khỏi lệnh trường." };
  }
  return null;
}

function hasAmbiguousWordTextTag(xml: string, namespaceProfile: WordNamespaceProfile): boolean {
  xml = escapeXmlCdataSectionsForParsing(xml);
  const textNames = namePattern(qualifiedNames(namespaceProfile.ambiguousPrefixes,
    ["t", "instrText", "delText", "delInstrText"]));
  return Boolean(textNames) && new RegExp(`<(${textNames})\\b`, "i").test(xml);
}

function hasAmbiguousWordElement(xml: string, namespaceProfile: WordNamespaceProfile): boolean {
  xml = escapeXmlCdataSectionsForParsing(xml);
  return namespaceProfile.ambiguousPrefixes.some(prefix => {
    if (!prefix) return /<\/?[A-Za-z_][\w.-]*(?=[\s/>])/i.test(xml);
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`<\\/?${escapedPrefix}:[A-Za-z_][\\w.-]*(?=[\\s/>])`, "i").test(xml);
  });
}

function extractVisibleParagraphText(xml: string, namespaceProfile: WordNamespaceProfile): string {
  xml = escapeXmlCdataSectionsForParsing(xml);
  const textboxNames = namePattern(["w:txbxContent"]);
  const withoutTextboxes = xml.replace(new RegExp(`<(${textboxNames})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi"), "");
  const textNames = namePattern(qualifiedNames(namespaceProfile.safePrefixes, ["t"]));
  const breakNames = namePattern(qualifiedNames(namespaceProfile.safePrefixes, ["tab", "br", "cr"]));
  const expression = new RegExp(`<(${textNames})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>|<(${breakNames})(?:\\s[^>]*)?\\/?\\s*>`, "gi");
  let text = "";
  let match: RegExpExecArray | null;
  while ((match = expression.exec(withoutTextboxes)) !== null) {
    if (match[2] !== undefined) text += decodeXmlText(match[2]);
    else if (match[3]?.split(":").pop()?.toLowerCase() === "tab") text += "\t";
    else text += "\n";
  }
  return text.normalize("NFC");
}

function relationReferences(documentXml: string): Array<{ id: string; kind: "header" | "footer" }> {
  const result: Array<{ id: string; kind: "header" | "footer" }> = [];
  for (const match of documentXml.matchAll(/<w:(headerReference|footerReference)\b[^>]*\/?\s*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const id = attrs["r:id"];
    if (id) result.push({ id, kind: match[1].toLowerCase().startsWith("header") ? "header" : "footer" });
  }
  return result;
}

function hasUnsupportedWrapper(xml: string): boolean {
  xml = escapeXmlCdataSectionsForParsing(xml);
  return /<w:(?:sdt|customXml|altChunk|contentPart)\b/i.test(xml);
}

function partUri(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Builds an ephemeral, source-linked text inventory from the exact uploaded
 * DOCX bytes. It does not persist the manifest or make a provider request.
 */
export async function buildFullTextManifest(
  sourceBytes: Uint8Array | ArrayBuffer,
  expectedSourceSha256: string,
  sourceGeneration: number,
): Promise<FullTextManifest> {
  if (!/^[a-f0-9]{64}$/i.test(expectedSourceSha256)) throw new Error("Invalid source SHA-256");
  if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 0) throw new Error("Invalid source generation");

  const immutableBytes = bytesView(sourceBytes);
  const sourceSha256 = await sha256(immutableBytes);
  if (sourceSha256 !== expectedSourceSha256.toLowerCase()) throw new Error("source hash mismatch");

  const zip = await JSZip.loadAsync(immutableBytes);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("Invalid DOCX: missing word/document.xml");
  const originalDocumentXml = await documentFile.async("string");
  const documentNamespaceProfile = wordNamespaceProfile(originalDocumentXml);
  const documentXml = normalizeWordprocessingMlElements(originalDocumentXml, documentNamespaceProfile);
  if (!/<w:body(?=[\s>])/i.test(documentXml)) throw new Error("Invalid DOCX: missing word/document.xml w:body");

  const segments: FullTextSegment[] = [];
  const excluded: FullTextExcludedItem[] = [];
  const partSegments = new Map<string, string[]>();
  const supportedStoryParts = new Set<string>(["word/document.xml"]);
  let documentOrder = 0;

  const addIssue = (code: FullTextIssueCode, path: string, anchor: string | undefined, reason: string) => {
    excluded.push({ code, packagePartUri: partUri(path), ...(anchor ? { anchor } : {}), reason });
  };

  const getSupportedDirectChildren = (
    xml: string,
    parentTag: string,
    supportedTags: Set<string>,
    path: string,
    anchor?: string,
    knownNonContentTags: Set<string> = new Set(),
  ) => {
    const allChildren = extractDirectChildren(xml, parentTag);
    for (const child of allChildren) {
      if (!supportedTags.has(child.tag) && !knownNonContentTags.has(child.tag)) {
        addIssue("unsupported_wrapper", path, anchor,
          `Khối con trực tiếp ${child.tag} chưa được hỗ trợ; không đưa nội dung bên trong vào manifest.`);
      }
    }
    return allChildren.filter(child => supportedTags.has(child.tag));
  };

  if (hasAmbiguousWordElement(originalDocumentXml, documentNamespaceProfile)) {
    addIssue("unsupported_text_part", "word/document.xml", undefined,
      "Có phần tử WordprocessingML dùng prefix được khai báo cho nhiều namespace; cấu trúc part chưa được kiểm kê đầy đủ.");
  }

  const addSegment = async (anchor: SegmentAnchor, text: string) => {
    if (!text.trim()) return;
    const canonicalAnchor = [anchor.packagePartUri, anchor.storyKind, anchor.anchor, sourceGeneration].join("|");
    const id = `seg-${(await sha256(`${sourceSha256}|${canonicalAnchor}`)).slice(0, 24)}`;
    const segment: FullTextSegment = {
      id,
      sourceSha256,
      sourceGeneration,
      packagePartUri: partUri(anchor.packagePartUri),
      sourceAnchor: anchor.anchor,
      storyKind: anchor.storyKind,
      documentOrder: documentOrder++,
      ...(anchor.sourceBlockId ? { sourceBlockId: anchor.sourceBlockId } : {}),
      ...(anchor.tableId ? { tableId: anchor.tableId } : {}),
      ...(anchor.cellId ? { cellId: anchor.cellId } : {}),
      ...(anchor.rowIndex !== undefined ? { rowIndex: anchor.rowIndex } : {}),
      ...(anchor.cellIndex !== undefined ? { cellIndex: anchor.cellIndex } : {}),
      ...(anchor.paragraphIndex !== undefined ? { paragraphIndex: anchor.paragraphIndex } : {}),
      ...(anchor.noteId ? { noteId: anchor.noteId } : {}),
      ...(anchor.relationshipId ? { relationshipId: anchor.relationshipId } : {}),
      visibilityClass: "visible_text",
      text,
      textSha256: await sha256(text),
    };
    segments.push(segment);
    const ids = partSegments.get(anchor.packagePartUri) ?? [];
    ids.push(id);
    partSegments.set(anchor.packagePartUri, ids);
  };

  const emitParagraph = async (
    xml: string,
    anchor: SegmentAnchor,
    namespaceProfile: WordNamespaceProfile,
    depth = 0,
  ): Promise<void> => {
    xml = escapeXmlCdataSectionsForParsing(normalizeWordprocessingMlElements(xml, namespaceProfile));
    if (hasAmbiguousWordTextTag(xml, namespaceProfile)) {
      addIssue("unsupported_text_part", anchor.packagePartUri, anchor.anchor,
        "Có phần tử text thuộc namespace WordprocessingML nhưng prefix bị khai báo không nhất quán; đoạn chưa được kiểm kê đầy đủ.");
    }
    const unsafe = paragraphUnsafeCode(xml, namespaceProfile);
    if (unsafe) {
      addIssue(unsafe.code, anchor.packagePartUri, anchor.anchor, unsafe.reason);
    } else {
      const text = extractVisibleParagraphText(xml, namespaceProfile);
      await addSegment(anchor, text);
    }

    if (/<w:(?:drawing|pict|object)\b/i.test(xml)) {
      addIssue("drawing_visual_content", anchor.packagePartUri, anchor.anchor, "Đoạn có hình/đối tượng; văn bản bên trong ảnh hoặc biểu đồ chưa được OCR/đọc trực quan.");
    }

    const textboxes = Array.from(xml.matchAll(/<w:txbxContent\b[^>]*>[\s\S]*?<\/w:txbxContent>/gi), match => match[0]);
    if (depth >= 2 && textboxes.length > 0) {
      addIssue("unsupported_wrapper", anchor.packagePartUri, anchor.anchor, "Text box lồng sâu hơn giới hạn trích xuất an toàn.");
      return;
    }
    for (let textboxIndex = 0; textboxIndex < textboxes.length; textboxIndex++) {
      const textboxXml = textboxes[textboxIndex];
      const children = getSupportedDirectChildren(textboxXml, "w:txbxContent", TEXTBOX_CHILDREN,
        anchor.packagePartUri, `${anchor.anchor}/textbox[${textboxIndex}]`);
      let paragraphIndex = 0;
      for (const child of children) {
        if (child.tag === "w:tbl") {
          addIssue("nested_table", anchor.packagePartUri, `${anchor.anchor}/textbox[${textboxIndex}]/table[${paragraphIndex}]`, "Bảng bên trong text box chưa có neo ô ổn định.");
          continue;
        }
        await emitParagraph(child.xml, {
          packagePartUri: anchor.packagePartUri,
          storyKind: "textbox",
          anchor: `${anchor.anchor}/textbox[${textboxIndex}]/p[${paragraphIndex}]`,
          sourceBlockId: anchor.sourceBlockId,
          tableId: anchor.tableId,
          cellId: anchor.cellId,
          rowIndex: anchor.rowIndex,
          cellIndex: anchor.cellIndex,
          paragraphIndex,
          relationshipId: anchor.relationshipId,
          noteId: anchor.noteId,
        }, namespaceProfile, depth + 1);
        paragraphIndex++;
      }
    }
  };

  const emitTable = async (
    xml: string,
    path: string,
    storyKind: FullTextStoryKind,
    tableId: string,
    namespaceProfile: WordNamespaceProfile,
    sourceBlockId?: string,
    parentAnchor?: string,
    relationshipId?: string,
    noteId?: string,
  ): Promise<void> => {
    xml = normalizeWordprocessingMlElements(xml, namespaceProfile);
    const rows = getSupportedDirectChildren(xml, "w:tbl", new Set(["w:tr"]), path, parentAnchor,
      new Set(["w:tblPr", "w:tblGrid"]));
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const rowAnchor = `${parentAnchor ? `${parentAnchor}/` : ""}${tableId}/r${rowIndex}`;
      const cells = getSupportedDirectChildren(rows[rowIndex].xml, "w:tr", new Set(["w:tc"]), path, rowAnchor,
        new Set(["w:trPr", "w:tblPrEx"]));
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
        const cellXml = cells[cellIndex].xml;
        const cellAnchor = `${parentAnchor ? `${parentAnchor}/` : ""}${tableId}/r${rowIndex}/c${cellIndex}`;
        if (hasUnsupportedWrapper(cellXml)) {
          addIssue("unsupported_wrapper", path, cellAnchor, "Ô chứa content control/custom XML chưa được kiểm kê từng phần tử con.");
        }
        const cellChildren = getSupportedDirectChildren(cellXml, "w:tc", TABLE_CHILDREN, path, cellAnchor,
          new Set(["w:tcPr"]));
        let paragraphIndex = 0;
        for (const child of cellChildren) {
          if (child.tag === "w:tbl") {
            addIssue("nested_table", path, `${cellAnchor}/nested-table`, "Bảng lồng chưa được hỗ trợ; nội dung của bảng lồng bị loại khỏi manifest.");
            continue;
          }
          await emitParagraph(child.xml, {
            packagePartUri: path,
            storyKind,
            anchor: `${cellAnchor}/p${paragraphIndex}`,
            sourceBlockId,
            tableId,
            cellId: `${tableId}:r${rowIndex}:c${cellIndex}`,
            rowIndex,
            cellIndex,
            paragraphIndex,
            relationshipId,
            noteId,
          }, namespaceProfile);
          paragraphIndex++;
        }
      }
    }
  };

  const emitStoryChildren = async (
    path: string,
    storyKind: FullTextStoryKind,
    xml: string,
    rootTag: string,
    prefix: string,
    relationshipId?: string,
    noteId?: string,
    namespaceProfile = wordNamespaceProfile(xml),
  ): Promise<void> => {
    const originalXml = xml;
    xml = normalizeWordprocessingMlElements(xml, namespaceProfile);
    if (hasAmbiguousWordElement(originalXml, namespaceProfile)) {
      addIssue("unsupported_text_part", path, undefined,
        "Có phần tử WordprocessingML dùng prefix được khai báo cho nhiều namespace; story chưa được kiểm kê đầy đủ.");
    }
    if (hasUnsupportedWrapper(xml)) {
      addIssue("unsupported_wrapper", path, undefined, "Story chứa content control/custom XML chưa được bao phủ đầy đủ.");
    }
    const children = getSupportedDirectChildren(xml, rootTag, new Set(["w:p", "w:tbl"]), path, prefix,
      new Set(["w:sectPr"]));
    let blockIndex = 0;
    for (const child of children) {
      if (child.tag === "w:p") {
        await emitParagraph(child.xml, {
          packagePartUri: path,
          storyKind,
          anchor: `${prefix}/p${blockIndex}`,
          sourceBlockId: storyKind === "body" ? `block-${blockIndex}` : `${storyKind}-${prefix}-${blockIndex}`,
          paragraphIndex: blockIndex,
          relationshipId,
          noteId,
        }, namespaceProfile);
      } else {
        const tableId = storyKind === "body" ? `block-${blockIndex}` : `${storyKind}-${prefix}-table-${blockIndex}`;
        await emitTable(
          child.xml,
          path,
          storyKind,
          tableId,
          namespaceProfile,
          storyKind === "body" ? tableId : undefined,
          `${prefix}/table[${blockIndex}]`,
          relationshipId,
          noteId,
        );
      }
      blockIndex++;
    }
  };

  const bodyChildren = getSupportedDirectChildren(documentXml, "w:body", BLOCK_CHILDREN,
    "word/document.xml", "body");
  let bodyBlockIndex = 0;
  for (const child of bodyChildren) {
    if (child.tag === "w:sectPr") continue;
    if (hasUnsupportedWrapper(child.xml)) {
      addIssue("unsupported_wrapper", "word/document.xml", `body-child-${bodyBlockIndex}`, "Khối trực tiếp của body có cấu trúc wrapper chưa được giải mã.");
    }
    if (child.tag === "w:p") {
      await emitParagraph(child.xml, {
        packagePartUri: "word/document.xml",
        storyKind: "body",
        anchor: `body/block-${bodyBlockIndex}`,
        sourceBlockId: `block-${bodyBlockIndex}`,
        paragraphIndex: bodyBlockIndex,
      }, documentNamespaceProfile);
    } else {
      await emitTable(child.xml, "word/document.xml", "body", `block-${bodyBlockIndex}`, documentNamespaceProfile,
        `block-${bodyBlockIndex}`);
    }
    bodyBlockIndex++;
  }

  const relationshipFile = zip.file("word/_rels/document.xml.rels");
  const relationships = relationshipFile ? extractRelationships(await relationshipFile.async("string")) : [];
  const relationshipById = new Map(relationships.map(relationship => [relationship.id, relationship]));
  const referencedStories = relationReferences(documentXml);
  const emittedStoryReferences = new Set<string>();
  for (const reference of referencedStories) {
    const referenceKey = `${reference.kind}:${reference.id}`;
    if (emittedStoryReferences.has(referenceKey)) continue;
    emittedStoryReferences.add(referenceKey);
    const relationship = relationshipById.get(reference.id);
    if (!relationship || relationship.external || !relationship.type.toLowerCase().endsWith(`/${reference.kind}`)) {
      addIssue("unresolved_relationship", "word/document.xml", `${reference.kind}:${reference.id}`, "Không giải được quan hệ nội bộ tới story header/footer được tham chiếu.");
      continue;
    }
    const target = resolvePartTarget(relationship.target);
    const file = zip.file(target);
    if (!file) {
      addIssue("unresolved_relationship", target || "word/document.xml", `${reference.kind}:${reference.id}`, "Part header/footer được tham chiếu không có trong gói DOCX.");
      continue;
    }
    supportedStoryParts.add(target);
    await emitStoryChildren(target, reference.kind, await file.async("string"), `w:${reference.kind === "header" ? "hdr" : "ftr"}`, `${reference.kind}-${reference.id}`, reference.id);
  }

  for (const [path, rootTag, noteTag, storyKind] of [
    ["word/footnotes.xml", "w:footnotes", "w:footnote", "footnote"],
    ["word/endnotes.xml", "w:endnotes", "w:endnote", "endnote"],
  ] as const) {
    const file = zip.file(path);
    const hasReference = new RegExp(`<w:${storyKind}Reference\\b`, "i").test(documentXml);
    if (!file) {
      if (hasReference) addIssue("missing_note_part", path, undefined, `Tài liệu tham chiếu ${storyKind} nhưng thiếu part tương ứng.`);
      continue;
    }
    supportedStoryParts.add(path);
    const originalXml = await file.async("string");
    const noteNamespaceProfile = wordNamespaceProfile(originalXml);
    const xml = normalizeWordprocessingMlElements(originalXml, noteNamespaceProfile);
    if (hasAmbiguousWordElement(originalXml, noteNamespaceProfile)) {
      addIssue("unsupported_text_part", path, undefined,
        "Có phần tử WordprocessingML dùng prefix được khai báo cho nhiều namespace; note part chưa được kiểm kê đầy đủ.");
    }
    const notes = getSupportedDirectChildren(xml, rootTag, new Set([noteTag]), path, undefined,
      new Set(["w:separator", "w:continuationSeparator", "w:continuationNotice"]));
    for (const note of notes) {
      const noteAttributes = parseAttributes(note.xml);
      const id = noteAttributes["w:id"] ?? noteAttributes.id;
      if (!id || id === "-1" || id === "0") continue;
      await emitStoryChildren(path, storyKind, note.xml, noteTag, `${storyKind}-${id}`, undefined, id, noteNamespaceProfile);
    }
  }

  if (/<w:(?:sdt|customXml|altChunk|contentPart)\b/i.test(documentXml) && !excluded.some(item => item.packagePartUri === "/word/document.xml" && item.code === "unsupported_wrapper")) {
    addIssue("unsupported_wrapper", "word/document.xml", undefined, "Tài liệu có content control/custom XML/altChunk ngoài phạm vi trích xuất ổn định.");
  }

  const entries = Object.values(zip.files).filter(file => !file.dir);
  for (const file of entries) {
    const path = file.name.replace(/\\/g, "/");
    if (/^word\/(?:media)\//i.test(path)) {
      addIssue("media_unreadable", path, undefined, "Ảnh/media có thể chứa chữ nhưng manifest văn bản không OCR hoặc gửi ảnh.");
      continue;
    }
    if (/^word\/embeddings\//i.test(path)) {
      addIssue("embedded_object_unreadable", path, undefined, "Đối tượng nhúng chưa được mở và kiểm kê nội dung.");
      continue;
    }
    if (!/\.xml$/i.test(path) || supportedStoryParts.has(path)) continue;
    let xml: string;
    try { xml = await file.async("string"); } catch {
      addIssue("unsupported_text_part", path, undefined, "Không giải mã được XML part để kiểm kê nội dung chữ.");
      continue;
    }
    if (!TEXT_BEARING_XML.test(xml)) continue;
    const comments = /(?:^|\/)comments(?:Extended|Ids|Extensible)?\.xml$/i.test(path);
    const unreferencedStory = /^word\/(?:header|footer)\d+\.xml$/i.test(path);
    addIssue(
      comments ? "comments_excluded" : unreferencedStory ? "unreferenced_story" : "unsupported_text_part",
      path,
      undefined,
      comments
        ? "Comments không thuộc phạm vi gửi mặc định và chưa được chọn riêng."
        : unreferencedStory
          ? "Header/footer có nội dung chữ nhưng không được tham chiếu từ document.xml; chưa đưa vào manifest."
          : "Part XML có nội dung chữ nhưng chưa có extractor/anchor được hỗ trợ.",
    );
  }

  const partsByPath = new Map<string, FullTextPartInventoryItem>();
  const allPartPaths = new Set<string>(["word/document.xml", ...supportedStoryParts]);
  for (const path of allPartPaths) {
    partsByPath.set(path, { partUri: partUri(path), status: "included", segmentIds: [...(partSegments.get(path) ?? [])] });
  }
  for (const item of excluded) {
    const existing = partsByPath.get(item.packagePartUri.replace(/^\//, ""));
    if (existing) {
      existing.status = "partial";
      existing.reason = "Có đoạn hoặc cấu trúc trong part chưa được trích xuất an toàn.";
    } else {
      partsByPath.set(item.packagePartUri.replace(/^\//, ""), {
        partUri: item.packagePartUri,
        status: "excluded",
        segmentIds: [],
        reason: item.reason,
      });
    }
  }
  const parts = Array.from(partsByPath.values()).sort((a, b) => a.partUri.localeCompare(b.partUri));
  const partialParts = parts.filter(part => part.status === "partial").length;
  const excludedParts = parts.filter(part => part.status === "excluded").length;
  const complete = excluded.length === 0 && partialParts === 0 && excludedParts === 0;
  const hashMaterial = JSON.stringify({
    extractionVersion: EXTRACTOR_VERSION,
    sourceSha256,
    sourceGeneration,
    segments: segments.map(({ id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId, cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256 }) => ({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId, cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    })),
    parts,
    excluded,
  });

  return {
    extractionVersion: EXTRACTOR_VERSION,
    sourceSha256,
    sourceGeneration,
    manifestSha256: await sha256(hashMaterial),
    segments,
    parts,
    excluded,
    coverage: {
      status: complete ? "complete" : "partial",
      complete,
      totalIncludedSegments: segments.length,
      includedParts: parts.filter(part => part.status === "included").length,
      partialParts,
      excludedParts,
    },
  };
}
