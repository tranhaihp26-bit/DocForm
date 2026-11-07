import JSZip from "jszip";

export type FontSizeAuditStatus = "PASS" | "FAIL" | "NOT_EVALUATED" | "NOT_APPLICABLE";
export type FontSizeAuditOrigin = "engine_managed" | "untouched_source";
export type FontSizeChannel = "sz" | "szCs";

/**
 * A caller-owned manifest identifies only runs whose formatting the engine owns.
 * Paragraph and run indexes are zero-based in document order within a package part.
 * Omitting runIndex selects text-bearing runs in that paragraph. Unlisted runs are
 * deliberately outside the audit; callers must never infer ownership from text.
 */
interface FontSizeAuditScopeBase {
  role: string;
  partPath: string;
  paragraphIndex: number;
  runIndex?: number;
}

export type FontSizeAuditScope =
  | (FontSizeAuditScopeBase & { origin: "engine_managed"; expectedPt: number })
  | (FontSizeAuditScopeBase & { origin: "untouched_source"; expectedPt?: undefined });

export interface FontSizeChannelValue {
  halfPoints: number | null;
  fontSizePt: number | null;
  rawValue: string | null;
  source: string | null;
  reason?: string;
}

export interface FontSizeAuditResult {
  role: string;
  expected: { fontSizePt: number } | null;
  actual: Record<FontSizeChannel, FontSizeChannelValue> | null;
  origin: FontSizeAuditOrigin;
  status: FontSizeAuditStatus;
  evidence: string;
  reason?: string;
}

export interface FontSizeAuditReport {
  results: FontSizeAuditResult[];
  evaluatedManagedRuns: number;
  failedManagedRuns: number;
  notEvaluatedManagedRuns: number;
  untouchedSourceRuns: number;
}

const WORD_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const STYLES_PART = "word/styles.xml";

interface XmlAttribute {
  qName: string;
  localName: string;
  namespaceURI: string;
  value: string;
}

interface XmlNode {
  qName: string;
  localName: string;
  namespaceURI: string;
  attributes: XmlAttribute[];
  children: XmlNode[];
  parent: XmlNode | null;
}

interface ParsedStyle {
  id: string;
  type: string;
  basedOn: string | null;
  runProperties: XmlNode | null;
  conditionalRunProperties: XmlNode[];
}

interface StyleIndex {
  available: boolean;
  error: string | null;
  documentDefaultRunProperties: XmlNode | null;
  documentDefaultParagraphRunProperties: XmlNode | null;
  defaultParagraphStyleId: string | null;
  defaultTableStyleId: string | null;
  styles: Map<string, ParsedStyle>;
}

type PropertyResolution =
  | { kind: "found"; rawValue: string; source: string }
  | { kind: "unset" }
  | { kind: "unknown"; reason: string };

type TreeResult = { kind: "ok"; roots: XmlNode[] } | { kind: "error"; reason: string };

function localName(qName: string): string {
  const colon = qName.lastIndexOf(":");
  return colon < 0 ? qName : qName.slice(colon + 1);
}

function decodeAttribute(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    switch (entity.toLowerCase()) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      default: return _match;
    }
  });
}

function parseAttributes(source: string, parentNamespaces: Map<string, string>): {
  attributes: XmlAttribute[];
  namespaces: Map<string, string>;
} {
  const raw: Array<{ qName: string; value: string }> = [];
  const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let match = attributePattern.exec(source); match; match = attributePattern.exec(source)) {
    raw.push({ qName: match[1], value: decodeAttribute(match[2] ?? match[3] ?? "") });
  }

  const namespaces = new Map(parentNamespaces);
  for (const attribute of raw) {
    if (attribute.qName === "xmlns") namespaces.set("", attribute.value);
    else if (attribute.qName.startsWith("xmlns:")) namespaces.set(attribute.qName.slice(6), attribute.value);
  }

  const attributes = raw.map(({ qName, value }): XmlAttribute => {
    const colon = qName.indexOf(":");
    const prefix = colon < 0 ? "" : qName.slice(0, colon);
    const namespaceURI = qName === "xmlns" || prefix === "xmlns"
      ? XMLNS_NAMESPACE
      : prefix === "xml"
        ? XML_NAMESPACE
        : (prefix ? namespaces.get(prefix) : "") ?? "";
    return { qName, localName: localName(qName), namespaceURI, value };
  });
  return { attributes, namespaces };
}

/** Small namespace-aware XML reader for the WordprocessingML structures this auditor uses. */
function parseXml(source: string): TreeResult {
  if (/<!DOCTYPE\b/i.test(source)) return { kind: "error", reason: "DOCTYPE is not supported in OOXML parts." };

  const documentNode: XmlNode = {
    qName: "#document", localName: "#document", namespaceURI: "", attributes: [], children: [], parent: null,
  };
  const stack: Array<{ node: XmlNode; namespaces: Map<string, string> }> = [
    { node: documentNode, namespaces: new Map([ ["xml", XML_NAMESPACE] ]) },
  ];
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g) ?? [];

  for (const token of tokens) {
    if (token.startsWith("<!--") || token.startsWith("<?") || token.startsWith("<![CDATA[")) continue;
    if (token.startsWith("</")) {
      const closingName = token.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.node.qName !== closingName) {
        return { kind: "error", reason: `Mismatched closing element ${closingName}.` };
      }
      continue;
    }
    if (token.startsWith("<!")) return { kind: "error", reason: "Unsupported XML declaration in OOXML part." };
    if (token.startsWith("<")) {
      const selfClosing = /\/\s*>$/.test(token);
      const body = token.slice(1, selfClosing ? token.lastIndexOf("/") : -1).trim();
      const nameMatch = /^([^\s/>]+)/.exec(body);
      if (!nameMatch) return { kind: "error", reason: "An XML element has no name." };
      const qName = nameMatch[1];
      const parsed = parseAttributes(body.slice(nameMatch[0].length), stack[stack.length - 1].namespaces);
      const prefix = qName.includes(":") ? qName.slice(0, qName.indexOf(":")) : "";
      const node: XmlNode = {
        qName,
        localName: localName(qName),
        namespaceURI: parsed.namespaces.get(prefix) ?? "",
        attributes: parsed.attributes,
        children: [],
        parent: stack[stack.length - 1].node,
      };
      stack[stack.length - 1].node.children.push(node);
      if (!selfClosing) stack.push({ node, namespaces: parsed.namespaces });
      continue;
    }
  }

  if (stack.length !== 1) return { kind: "error", reason: `Unclosed XML element ${stack[stack.length - 1].node.qName}.` };
  return { kind: "ok", roots: documentNode.children };
}

function isWordNode(node: XmlNode | null | undefined): node is XmlNode {
  return Boolean(node && WORD_NAMESPACES.has(node.namespaceURI));
}

function wordAttribute(node: XmlNode | null | undefined, name: string): string | null {
  if (!node) return null;
  return node.attributes.find((attribute) => attribute.localName === name && WORD_NAMESPACES.has(attribute.namespaceURI))?.value ?? null;
}

function children(node: XmlNode | null | undefined, name: string): XmlNode[] {
  return node?.children.filter((child) => isWordNode(child) && child.localName === name) ?? [];
}

function firstChild(node: XmlNode | null | undefined, name: string): XmlNode | null {
  return children(node, name)[0] ?? null;
}

function descendants(node: XmlNode, predicate: (candidate: XmlNode) => boolean): XmlNode[] {
  const result: XmlNode[] = [];
  const visit = (candidate: XmlNode): void => {
    for (const child of candidate.children) {
      if (predicate(child)) result.push(child);
      visit(child);
    }
  };
  visit(node);
  return result;
}

function parseStyleIndex(xml: string | null): StyleIndex {
  const empty: StyleIndex = {
    available: xml !== null,
    error: null,
    documentDefaultRunProperties: null,
    documentDefaultParagraphRunProperties: null,
    defaultParagraphStyleId: null,
    defaultTableStyleId: null,
    styles: new Map(),
  };
  if (xml === null) return empty;
  const parsed = parseXml(xml);
  if (parsed.kind === "error") return { ...empty, error: parsed.reason };
  const root = parsed.roots.find((candidate) => isWordNode(candidate) && candidate.localName === "styles");
  if (!root) return { ...empty, error: "word/styles.xml has no WordprocessingML styles root." };

  const docDefaults = firstChild(root, "docDefaults");
  const rPrDefault = firstChild(firstChild(docDefaults, "rPrDefault"), "rPr");
  const pPrDefaultRunProperties = firstChild(firstChild(firstChild(docDefaults, "pPrDefault"), "pPr"), "rPr");
  for (const styleNode of children(root, "style")) {
    const id = wordAttribute(styleNode, "styleId");
    const type = wordAttribute(styleNode, "type");
    if (!id || !type) continue;
    const parsedStyle: ParsedStyle = {
      id,
      type,
      basedOn: wordAttribute(firstChild(styleNode, "basedOn"), "val"),
      runProperties: firstChild(styleNode, "rPr") ?? firstChild(firstChild(styleNode, "pPr"), "rPr"),
      conditionalRunProperties: children(styleNode, "tblStylePr")
        .map((conditional) => firstChild(conditional, "rPr"))
        .filter((candidate): candidate is XmlNode => candidate !== null),
    };
    empty.styles.set(id, parsedStyle);
    const isDefault = ["1", "true", "on"].includes((wordAttribute(styleNode, "default") ?? "").toLowerCase());
    if (isDefault && type === "paragraph") empty.defaultParagraphStyleId = id;
    if (isDefault && type === "table") empty.defaultTableStyleId = id;
  }
  empty.documentDefaultRunProperties = rPrDefault;
  empty.documentDefaultParagraphRunProperties = pPrDefaultRunProperties;
  return empty;
}

function directSizeProperty(runProperties: XmlNode | null, channel: FontSizeChannel, source: string): PropertyResolution {
  if (!runProperties) return { kind: "unset" };
  const property = firstChild(runProperties, channel);
  if (!property) return { kind: "unset" };
  const rawValue = wordAttribute(property, "val");
  if (rawValue === null) return { kind: "unknown", reason: `${source}/${channel} has no w:val.` };
  return { kind: "found", rawValue, source: `${source}/${channel}` };
}

function resolveStyleProperty(
  styleId: string,
  channel: FontSizeChannel,
  styles: StyleIndex,
  sourceLabel: string,
  expectedType?: string,
  visited = new Set<string>(),
): PropertyResolution {
  if (visited.has(styleId)) return { kind: "unknown", reason: `${sourceLabel} style cycle at ${styleId}.` };
  const style = styles.styles.get(styleId);
  if (!style) return { kind: "unknown", reason: `${sourceLabel} references unresolved style ${styleId}.` };
  if (expectedType && style.type !== expectedType) {
    return { kind: "unknown", reason: `${sourceLabel} style ${styleId} has type ${style.type}, expected ${expectedType}.` };
  }
  const value = directSizeProperty(style.runProperties, channel, `${sourceLabel}:${styleId}`);
  if (value.kind !== "unset") return value;
  if (!style.basedOn) return { kind: "unset" };
  const nextVisited = new Set(visited);
  nextVisited.add(styleId);
  return resolveStyleProperty(style.basedOn, channel, styles, `${sourceLabel}.basedOn`, undefined, nextVisited);
}

function getParagraphStyleId(paragraph: XmlNode, styles: StyleIndex): { id: string | null; explicit: boolean } {
  const explicitId = wordAttribute(firstChild(firstChild(paragraph, "pPr"), "pStyle"), "val");
  return explicitId ? { id: explicitId, explicit: true } : { id: styles.defaultParagraphStyleId, explicit: false };
}

function tableStyleId(paragraph: XmlNode, styles: StyleIndex): string | null {
  let table: XmlNode | null = paragraph.parent;
  while (table && !(isWordNode(table) && table.localName === "tbl")) table = table.parent;
  if (!table) return null;
  const explicitId = wordAttribute(firstChild(firstChild(table, "tblPr"), "tblStyle"), "val");
  return explicitId ?? styles.defaultTableStyleId;
}

function resolveTableStyleProperty(styleId: string, channel: FontSizeChannel, styles: StyleIndex): PropertyResolution {
  const style = styles.styles.get(styleId);
  if (!style) return { kind: "unknown", reason: `Table style ${styleId} cannot be resolved.` };
  if (style.type !== "table") return { kind: "unknown", reason: `Table style ${styleId} has type ${style.type}.` };

  const visited = new Set<string>();
  let current: ParsedStyle | undefined = style;
  while (current) {
    if (visited.has(current.id)) return { kind: "unknown", reason: `Table style cycle at ${current.id}.` };
    visited.add(current.id);
    if (current.conditionalRunProperties.some((rPr) => directSizeProperty(rPr, channel, `tableStyle:${current!.id}:conditional`).kind !== "unset")) {
      return { kind: "unknown", reason: `Conditional table style ${current.id} may override ${channel}; its table region is not resolved.` };
    }
    const value = directSizeProperty(current.runProperties, channel, `tableStyle:${current.id}`);
    if (value.kind !== "unset") return value;
    if (!current.basedOn) return { kind: "unset" };
    current = styles.styles.get(current.basedOn);
    if (!current) return { kind: "unknown", reason: `Table style basedOn ${style.basedOn} cannot be resolved.` };
    if (current.type !== "table") return { kind: "unknown", reason: `Table style basedOn ${current.id} has type ${current.type}.` };
  }
  return { kind: "unset" };
}

function resolveRunChannel(run: XmlNode, paragraph: XmlNode, channel: FontSizeChannel, styles: StyleIndex): PropertyResolution {
  const runProperties = firstChild(run, "rPr");
  const directRun = directSizeProperty(runProperties, channel, "directRun");
  if (directRun.kind !== "unset") return directRun;

  const runStyleId = wordAttribute(firstChild(runProperties, "rStyle"), "val");
  if (runStyleId) {
    const characterStyle = resolveStyleProperty(runStyleId, channel, styles, "characterStyle", "character");
    if (characterStyle.kind !== "unset") return characterStyle;
  }

  const paragraphProperties = firstChild(paragraph, "pPr");
  const paragraphMark = directSizeProperty(firstChild(paragraphProperties, "rPr"), channel, "directParagraph");
  if (paragraphMark.kind !== "unset") return paragraphMark;

  const paragraphStyle = getParagraphStyleId(paragraph, styles);
  if (paragraphStyle.id) {
    const styleValue = resolveStyleProperty(
      paragraphStyle.id,
      channel,
      styles,
      paragraphStyle.explicit ? "paragraphStyle" : "defaultParagraphStyle",
      "paragraph",
    );
    if (styleValue.kind !== "unset") return styleValue;
  }

  if (firstChild(paragraphProperties, "numPr")) {
    return { kind: "unknown", reason: "Numbering style inheritance is not resolved by this auditor." };
  }

  const tableId = tableStyleId(paragraph, styles);
  if (tableId) {
    const tableValue = resolveTableStyleProperty(tableId, channel, styles);
    if (tableValue.kind !== "unset") return tableValue;
  }

  if (styles.error) return { kind: "unknown", reason: `Style part could not be parsed: ${styles.error}` };
  if (!styles.available) return { kind: "unknown", reason: "word/styles.xml is missing; docDefaults and style inheritance are unavailable." };

  const defaultRunValue = directSizeProperty(styles.documentDefaultRunProperties, channel, "docDefaults.rPrDefault");
  const defaultParagraphValue = directSizeProperty(styles.documentDefaultParagraphRunProperties, channel, "docDefaults.pPrDefault");
  if (defaultRunValue.kind === "unknown") return defaultRunValue;
  if (defaultParagraphValue.kind === "unknown") return defaultParagraphValue;
  if (defaultRunValue.kind === "found" && defaultParagraphValue.kind === "found" && defaultRunValue.rawValue !== defaultParagraphValue.rawValue) {
    return { kind: "unknown", reason: `Conflicting document-default ${channel} values require a full Word style engine.` };
  }
  if (defaultRunValue.kind === "found") return defaultRunValue;
  if (defaultParagraphValue.kind === "found") return defaultParagraphValue;
  return { kind: "unknown", reason: `No direct or inherited ${channel} size is declared.` };
}

function allParagraphs(roots: XmlNode[]): XmlNode[] {
  const result: XmlNode[] = [];
  for (const root of roots) {
    if (isWordNode(root) && root.localName === "p") result.push(root);
    result.push(...descendants(root, (candidate) => isWordNode(candidate) && candidate.localName === "p"));
  }
  return result;
}

function runsInParagraph(paragraph: XmlNode): XmlNode[] {
  const result: XmlNode[] = [];
  const visit = (node: XmlNode): void => {
    for (const child of node.children) {
      if (!isWordNode(child)) continue;
      if (child.localName === "p") continue;
      if (child.localName === "r") result.push(child);
      visit(child);
    }
  };
  visit(paragraph);
  return result;
}

function hasText(run: XmlNode): boolean {
  return descendants(run, (candidate) => isWordNode(candidate) && (candidate.localName === "t" || candidate.localName === "delText")).length > 0;
}

function fontChannelValue(resolution: PropertyResolution): FontSizeChannelValue {
  if (resolution.kind === "unset") {
    return { halfPoints: null, fontSizePt: null, rawValue: null, source: null, reason: "No value was declared at this level." };
  }
  if (resolution.kind === "unknown") {
    return { halfPoints: null, fontSizePt: null, rawValue: null, source: null, reason: resolution.reason };
  }
  const parsed = Number(resolution.rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      halfPoints: null,
      fontSizePt: null,
      rawValue: resolution.rawValue,
      source: resolution.source,
      reason: "OOXML half-point value must be a positive integer.",
    };
  }
  return { halfPoints: parsed, fontSizePt: parsed / 2, rawValue: resolution.rawValue, source: resolution.source };
}

function partParseFailure(scope: FontSizeAuditScope, reason: string): FontSizeAuditResult {
  const origin = scope.origin;
  return {
    role: scope.role,
    expected: scope.expectedPt === undefined ? null : { fontSizePt: scope.expectedPt },
    actual: null,
    origin,
    status: origin === "untouched_source" ? "NOT_APPLICABLE" : "NOT_EVALUATED",
    evidence: `${scope.partPath}#p[${scope.paragraphIndex}]${scope.runIndex === undefined ? "" : `/r[${scope.runIndex}]`}`,
    reason: origin === "untouched_source" ? "Untouched source is excluded from the engine font policy." : reason,
  };
}

function evaluateScope(scope: FontSizeAuditScope, partXml: string | null, styles: StyleIndex): FontSizeAuditResult[] {
  const origin = scope.origin;
  const expected = scope.expectedPt === undefined ? null : { fontSizePt: scope.expectedPt };
  const evidencePrefix = `${scope.partPath}#p[${scope.paragraphIndex}]`;
  if (origin === "untouched_source") {
    return [{
      role: scope.role,
      expected,
      actual: null,
      origin,
      status: "NOT_APPLICABLE",
      evidence: `${evidencePrefix}${scope.runIndex === undefined ? "" : `/r[${scope.runIndex}]`}`,
      reason: "Untouched source is outside the engine-owned font policy; no font-size failure is attributed to it.",
    }];
  }
  if (scope.expectedPt === undefined || !Number.isInteger(scope.expectedPt) || scope.expectedPt <= 0) {
    return [{
      role: scope.role,
      expected,
      actual: null,
      origin,
      status: "FAIL",
      evidence: evidencePrefix,
      reason: "Engine-managed roles require an explicit positive integer expectedPt; values are not rounded.",
    }];
  }
  if (partXml === null) return [partParseFailure(scope, "Requested OOXML part is missing from the DOCX package.")];

  const parsed = parseXml(partXml);
  if (parsed.kind === "error") return [partParseFailure(scope, `OOXML part could not be parsed: ${parsed.reason}`)];
  const paragraphs = allParagraphs(parsed.roots);
  const paragraph = paragraphs[scope.paragraphIndex];
  if (!paragraph) return [partParseFailure(scope, "Requested paragraph index does not exist in this OOXML part.")];
  const allRuns = runsInParagraph(paragraph);
  const selectedRuns = scope.runIndex === undefined
    ? allRuns.filter(hasText)
    : allRuns[scope.runIndex] ? [allRuns[scope.runIndex]] : [];
  if (selectedRuns.length === 0) return [partParseFailure(scope, "No selected text-bearing run exists at the requested paragraph/run locator.")];

  return selectedRuns.map((run) => {
    const runIndex = allRuns.indexOf(run);
    const evidence = `${evidencePrefix}/r[${runIndex}]`;
    const szResolution = resolveRunChannel(run, paragraph, "sz", styles);
    const szCsResolution = resolveRunChannel(run, paragraph, "szCs", styles);
    const actual = { sz: fontChannelValue(szResolution), szCs: fontChannelValue(szCsResolution) };
    const channelValues = [actual.sz, actual.szCs];
    const invalid = channelValues.some((value) => value.rawValue !== null && value.halfPoints === null);
    const mismatched = channelValues.some((value) => value.halfPoints !== null && value.halfPoints !== scope.expectedPt! * 2);
    const unresolved = channelValues.some((value) => value.halfPoints === null && value.rawValue === null);
    const status: FontSizeAuditStatus = invalid || mismatched
      ? "FAIL"
      : unresolved
        ? "NOT_EVALUATED"
        : "PASS";
    const reason = invalid
      ? "A declared w:sz/w:szCs value is not a positive integer half-point value."
      : mismatched
        ? `Resolved font size differs from the expected ${scope.expectedPt}pt; no rounding is applied.`
        : unresolved
          ? [actual.sz.reason, actual.szCs.reason].filter(Boolean).join(" ")
          : undefined;
    return { role: scope.role, expected, actual, origin, status, evidence, ...(reason ? { reason } : {}) };
  });
}

function summarize(results: FontSizeAuditResult[]): FontSizeAuditReport {
  return {
    results,
    evaluatedManagedRuns: results.filter((result) => result.origin === "engine_managed" && (result.status === "PASS" || result.status === "FAIL")).length,
    failedManagedRuns: results.filter((result) => result.origin === "engine_managed" && result.status === "FAIL").length,
    notEvaluatedManagedRuns: results.filter((result) => result.origin === "engine_managed" && result.status === "NOT_EVALUATED").length,
    untouchedSourceRuns: results.filter((result) => result.origin === "untouched_source").length,
  };
}

/**
 * Audits exact, caller-designated engine-owned runs in a DOCX package. It does not
 * infer roles by reading visible text and never scans unlisted source runs as failures.
 * The ZIP/XML result is structural evidence only; it does not prove Word/WPS rendering.
 */
export async function auditDocxFontSizes(
  docxBytes: Uint8Array | ArrayBuffer,
  scopes: FontSizeAuditScope[],
): Promise<FontSizeAuditReport> {
  const zip = await JSZip.loadAsync(docxBytes);
  const partNames = new Set(scopes.map((scope) => scope.partPath));
  partNames.add(STYLES_PART);
  const parts = new Map<string, string | null>();
  await Promise.all([...partNames].map(async (partPath) => {
    const file = zip.file(partPath);
    parts.set(partPath, file ? await file.async("string") : null);
  }));
  const styles = parseStyleIndex(parts.get(STYLES_PART) ?? null);
  const results = scopes.flatMap((scope) => evaluateScope(scope, parts.get(scope.partPath) ?? null, styles));
  return summarize(results);
}
