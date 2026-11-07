import JSZip from "jszip";
import type { DocumentFormatType } from "../shared/schemas/document.schema.ts";
import { COMPANY_HEADER_PROFILE_ID, COMPANY_HEADER_PARENT, COMPANY_HEADER_ISSUER, COMPANY_DEFAULT_NUMBER, COMPANY_DEFAULT_DATE } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID, COMPANY_HEADER_HD05_PARENT, COMPANY_HEADER_HD05_ISSUER, COMPANY_HEADER_HD05_DEFAULT_NUMBER, COMPANY_HEADER_HD05_REFERENCE_DATE } from "../canonical/hd05/companyHeaderHD05.ts";
import { ND30_HOA_TIEU_TABLE_XML, ND30_HOA_TIEU_SETTINGS_XML, HD05_HOA_TIEU_TABLE_XML, HD05_HOA_TIEU_SETTINGS_XML } from "./hoaTieuHeaderReferenceXml.ts";
import { SYSTEM_FORMAL_LINE_THICKNESS_EMU, SYSTEM_FORMAL_LINE_THICKNESS_PT } from "./formalLineThickness.ts";

const normalized = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("vi-VN");
const xmlText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const WORDPROCESSINGML_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WORDPROCESSING_DRAWING_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const VML_NAMESPACE = "urn:schemas-microsoft-com:vml";

function normalizeSystemFormalLineThickness(tableXml: string): string {
  const drawingML = tableXml.replace(/(<a:ln\b[^>]*\bw=")\d+(")/g, "$1" + SYSTEM_FORMAL_LINE_THICKNESS_EMU + "$2");
  return drawingML.replace(/<v:line\b[\s\S]*?<\/v:line>/g, line => {
    const stroke = line.match(/<v:stroke\b[^>]*\/>/)?.[0];
    const weightAttribute = ' weight="' + SYSTEM_FORMAL_LINE_THICKNESS_PT + 'pt"';
    if (stroke) {
      const weightedStroke = /\bweight="/.test(stroke)
        ? stroke.replace(/\bweight="[^"]*"/, 'weight="' + SYSTEM_FORMAL_LINE_THICKNESS_PT + 'pt"')
        : stroke.replace(/\/>$/, weightAttribute + "/>");
      return line.replace(stroke, weightedStroke);
    }
    return line.replace(/(<v:line\b[^>]*>)/, '$1<v:stroke weight="' + SYSTEM_FORMAL_LINE_THICKNESS_PT + 'pt"/>');
  });
}

function profileParts(data: DocumentFormatType) {
  const administrative = data.regime === "administrative" && data.headerProfile === COMPANY_HEADER_PROFILE_ID;
  const party = data.regime === "party" && data.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID;
  if (!administrative && !party) return null;
  const parent = administrative ? COMPANY_HEADER_PARENT : COMPANY_HEADER_HD05_PARENT;
  const issuer = administrative ? COMPANY_HEADER_ISSUER : COMPANY_HEADER_HD05_ISSUER;
  // The literal reference table has fixed organization lines. Never silently replace custom organization data.
  if ((data.orgHeader1 && normalized(data.orgHeader1) !== normalized(parent)) ||
      (data.orgHeader2 && normalized(data.orgHeader2) !== normalized(issuer))) return null;
  return administrative
    ? { table: ND30_HOA_TIEU_TABLE_XML, settings: ND30_HOA_TIEU_SETTINGS_XML, number: COMPANY_DEFAULT_NUMBER, date: COMPANY_DEFAULT_DATE }
    : { table: HD05_HOA_TIEU_TABLE_XML, settings: HD05_HOA_TIEU_SETTINGS_XML, number: COMPANY_HEADER_HD05_DEFAULT_NUMBER, date: COMPANY_HEADER_HD05_REFERENCE_DATE };
}

function stampedTable(data: DocumentFormatType): { table: string; settings: string } | null {
  const parts = profileParts(data);
  if (!parts) return null;
  return {
    table: normalizeSystemFormalLineThickness(parts.table)
      .replace(`>${parts.number}</w:t>`, `>${xmlText(data.referenceNumber?.trim() || parts.number)}</w:t>`)
      .replace(`>${parts.date}</w:t>`, `>${xmlText(data.locationAndDate?.trim() ?? "")}</w:t>`),
    settings: parts.settings,
  };
}

interface XmlElementToken {
  name: string;
  start: number;
  openTagEnd: number;
  end: number;
  attributes: Map<string, string>;
  parent: XmlElementToken | null;
  children: XmlElementToken[];
  selfClosing: boolean;
}

interface ParsedXmlDocument {
  root: XmlElementToken;
  elements: XmlElementToken[];
}

interface ParsedXmlTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: Map<string, string>;
}

function findXmlTagEnd(xml: string, start: number): number {
  let quote = "";
  for (let cursor = start + 1; cursor < xml.length; cursor++) {
    const character = xml[cursor];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor;
    }
  }
  return -1;
}

function parseXmlTag(xml: string, start: number, end: number): ParsedXmlTag | null {
  let content = xml.slice(start + 1, end);
  const closing = content.startsWith("/");
  if (closing) content = content.slice(1);
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(content);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  let cursor = name.length;
  const attributes = new Map<string, string>();
  if (closing) return content.slice(cursor).trim() === "" ? { name, closing: true, selfClosing: false, attributes } : null;

  while (cursor < content.length) {
    while (cursor < content.length && /\s/.test(content[cursor])) cursor++;
    if (cursor >= content.length) break;
    if (content[cursor] === "/") {
      cursor++;
      while (cursor < content.length && /\s/.test(content[cursor])) cursor++;
      return cursor === content.length ? { name, closing: false, selfClosing: true, attributes } : null;
    }
    const attributeNameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(content.slice(cursor));
    if (!attributeNameMatch) return null;
    const attributeName = attributeNameMatch[1];
    if (attributes.has(attributeName)) return null;
    cursor += attributeName.length;
    while (cursor < content.length && /\s/.test(content[cursor])) cursor++;
    if (content[cursor] !== "=") return null;
    cursor++;
    while (cursor < content.length && /\s/.test(content[cursor])) cursor++;
    const quote = content[cursor];
    if (quote !== "\"" && quote !== "'") return null;
    cursor++;
    const valueStart = cursor;
    while (cursor < content.length && content[cursor] !== quote) {
      if (content[cursor] === "<") return null;
      cursor++;
    }
    if (cursor >= content.length) return null;
    attributes.set(attributeName, content.slice(valueStart, cursor));
    cursor++;
  }
  return { name, closing: false, selfClosing: false, attributes };
}

/** Parse actual XML element tokens; comments and processing instructions are never treated as elements. */
function parseXmlDocument(xml: string): ParsedXmlDocument | null {
  const stack: XmlElementToken[] = [];
  const elements: XmlElementToken[] = [];
  let root: XmlElementToken | null = null;
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) {
      if (stack.length === 0 && xml.slice(cursor).trim() !== "") return null;
      cursor = xml.length;
      break;
    }
    if (stack.length === 0 && xml.slice(cursor, start).trim() !== "") return null;
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      if (stack.length === 0) return null;
      const end = xml.indexOf("]]>", start + 9);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2);
      if (end < 0) return null;
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<!", start)) return null;
    const tagEnd = findXmlTagEnd(xml, start);
    if (tagEnd < 0) return null;
    const tag = parseXmlTag(xml, start, tagEnd);
    if (!tag) return null;
    if (tag.closing) {
      const openElement = stack.pop();
      if (!openElement || openElement.name !== tag.name) return null;
      openElement.end = tagEnd + 1;
    } else {
      const parent = stack.at(-1) ?? null;
      const element: XmlElementToken = {
        name: tag.name,
        start,
        openTagEnd: tagEnd + 1,
        end: tag.selfClosing ? tagEnd + 1 : -1,
        attributes: tag.attributes,
        parent,
        children: [],
        selfClosing: tag.selfClosing,
      };
      if (parent) parent.children.push(element);
      else if (root) return null;
      else root = element;
      elements.push(element);
      if (!tag.selfClosing) stack.push(element);
    }
    cursor = tagEnd + 1;
  }
  return root && stack.length === 0 && elements.every(element => element.end >= 0) ? { root, elements } : null;
}

function elementXml(xml: string, element: XmlElementToken): string {
  return xml.slice(element.start, element.end);
}

function effectiveNamespaceUri(element: XmlElementToken, prefix: string): string | null {
  for (let current: XmlElementToken | null = element; current; current = current.parent) {
    const namespace = current.attributes.get(`xmlns:${prefix}`);
    if (namespace !== undefined) return namespace;
  }
  return null;
}

function documentBody(xml: string): XmlElementToken | null {
  const parsed = parseXmlDocument(xml);
  if (parsed?.root.name !== "w:document" || effectiveNamespaceUri(parsed.root, "w") !== WORDPROCESSINGML_NAMESPACE) return null;
  const bodies = parsed.root.children.filter(child => child.name === "w:body");
  if (bodies.length !== 1 || effectiveNamespaceUri(bodies[0], "w") !== WORDPROCESSINGML_NAMESPACE) return null;
  return bodies[0];
}

function elementHasShapeName(element: XmlElementToken, expectedShape: string): boolean {
  const pending = [element];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const isDrawingShape = current.name === "wp:docPr" && current.parent?.name === "wp:anchor" &&
      effectiveNamespaceUri(current, "wp") === WORDPROCESSING_DRAWING_NAMESPACE &&
      effectiveNamespaceUri(current.parent, "wp") === WORDPROCESSING_DRAWING_NAMESPACE &&
      current.attributes.get("name") === expectedShape;
    const isVmlShape = current.name === "v:line" && current.parent?.name === "w:pict" &&
      effectiveNamespaceUri(current, "v") === VML_NAMESPACE &&
      effectiveNamespaceUri(current.parent, "w") === WORDPROCESSINGML_NAMESPACE &&
      current.attributes.get("id") === expectedShape;
    if (isDrawingShape || isVmlShape) return true;
    pending.push(...current.children);
  }
  return false;
}

function actualHeaderTable(xml: string, expectedShape: string): XmlElementToken | null {
  const body = documentBody(xml);
  if (!body) return null;
  const tables = body.children.filter(child =>
    child.name === "w:tbl" && effectiveNamespaceUri(child, "w") === WORDPROCESSINGML_NAMESPACE &&
      elementHasShapeName(child, expectedShape)
  );
  return tables.length === 1 ? tables[0] : null;
}

function settingsDocument(xml: string): ParsedXmlDocument | null {
  const parsed = parseXmlDocument(xml);
  return parsed?.root.name === "w:settings" ? parsed : null;
}

function ensureSettingsNamespace(xml: string, referenceXml: string, prefix: string): string | null {
  const parsed = settingsDocument(xml);
  const reference = settingsDocument(referenceXml);
  if (!parsed || !reference) return null;
  const attributeName = `xmlns:${prefix}`;
  const expectedNamespace = reference.root.attributes.get(attributeName);
  const currentNamespace = parsed.root.attributes.get(attributeName);
  if (!expectedNamespace) return null;
  if (currentNamespace !== undefined) return currentNamespace === expectedNamespace ? xml : null;
  if (parsed.root.selfClosing) return null;
  const rootOpenTag = xml.slice(parsed.root.start, parsed.root.openTagEnd);
  const newOpenTag = rootOpenTag.replace(/>$/, ` ${attributeName}="${expectedNamespace}">`);
  return xml.slice(0, parsed.root.start) + newOpenTag + xml.slice(parsed.root.openTagEnd);
}

function insertSettingsElement(xml: string, element: string): string | null {
  const parsed = settingsDocument(xml);
  if (!parsed || parsed.root.selfClosing) return null;
  const closingTag = `</${parsed.root.name}>`;
  const closeStart = parsed.root.end - closingTag.length;
  return closeStart >= parsed.root.openTagEnd && xml.slice(closeStart, parsed.root.end) === closingTag
    ? xml.slice(0, closeStart) + element + xml.slice(closeStart)
    : null;
}

function fragmentForSingleRootChild(xml: string, parsed: ParsedXmlDocument, name: string): string | null {
  const matches = parsed.root.children.filter(child => child.name === name);
  return matches.length === 1 ? elementXml(xml, matches[0]) : null;
}

/** Preserve source settings while carrying only the reference settings needed by stamped shapes. */
function mergeHeaderShapeSettings(sourceSettingsXml: string, referenceSettingsXml: string): string | null {
  const reference = settingsDocument(referenceSettingsXml);
  if (!reference) return null;
  const referenceShapeDefaults = fragmentForSingleRootChild(referenceSettingsXml, reference, "w:shapeDefaults");
  if (!referenceShapeDefaults) return null;

  let merged = sourceSettingsXml;
  for (const prefix of ["w", "o", "v"]) {
    const withNamespace = ensureSettingsNamespace(merged, referenceSettingsXml, prefix);
    if (!withNamespace) return null;
    merged = withNamespace;
  }

  let source = settingsDocument(merged);
  if (!source) return null;
  const sourceShapeDefaults = source.root.children.filter(child => child.name === "w:shapeDefaults");
  if (sourceShapeDefaults.length > 1) return null;
  if (sourceShapeDefaults.length === 1) {
    if (elementXml(merged, sourceShapeDefaults[0]) !== referenceShapeDefaults) return null;
  } else {
    const withShapeDefaults = insertSettingsElement(merged, referenceShapeDefaults);
    if (!withShapeDefaults) return null;
    merged = withShapeDefaults;
    source = settingsDocument(merged);
    if (!source) return null;
  }

  const referenceWpsFeatures = reference.elements.filter(element => element.name === "wpsCustomData:typoFeatureVersion");
  if (referenceWpsFeatures.length > 0) {
    const referenceWpsFeature = elementXml(referenceSettingsXml, referenceWpsFeatures[0]);
    const referenceAlternateContent = reference.root.children.filter(child =>
      child.name === "mc:AlternateContent" &&
      child.children.some(grandchild => grandchild.name === "mc:Choice" &&
        grandchild.children.some(feature => feature.name === "wpsCustomData:typoFeatureVersion"))
    );
    if (referenceWpsFeatures.length !== 1 || referenceAlternateContent.length !== 1) return null;
    const alternateContent = elementXml(referenceSettingsXml, referenceAlternateContent[0]);
    for (const prefix of ["mc", "wpsCustomData"]) {
      const withNamespace = ensureSettingsNamespace(merged, referenceSettingsXml, prefix);
      if (!withNamespace) return null;
      merged = withNamespace;
    }

    source = settingsDocument(merged);
    if (!source) return null;
    const sourceWpsFeatures = source.elements.filter(element => element.name === "wpsCustomData:typoFeatureVersion");
    if (sourceWpsFeatures.length > 1) return null;
    if (sourceWpsFeatures.length === 1) {
      const feature = sourceWpsFeatures[0];
      const choice = feature.parent;
      const sourceAlternate = choice?.parent;
      if (elementXml(merged, feature) !== referenceWpsFeature ||
          choice?.name !== "mc:Choice" ||
          sourceAlternate?.name !== "mc:AlternateContent" ||
          sourceAlternate.parent !== source.root ||
          elementXml(merged, sourceAlternate) !== alternateContent) return null;
    } else {
      const withAlternateContent = insertSettingsElement(merged, alternateContent);
      if (!withAlternateContent) return null;
      merged = withAlternateContent;
    }
  }
  return merged;
}

function hasRequiredHeaderShapeSettings(settingsXml: string, referenceSettingsXml: string): boolean {
  const settings = settingsDocument(settingsXml);
  const reference = settingsDocument(referenceSettingsXml);
  if (!settings || !reference) return false;
  for (const prefix of ["w", "o", "v"]) {
    const namespace = reference.root.attributes.get(`xmlns:${prefix}`);
    if (!namespace || settings.root.attributes.get(`xmlns:${prefix}`) !== namespace) return false;
  }
  const expectedShapeDefaults = fragmentForSingleRootChild(referenceSettingsXml, reference, "w:shapeDefaults");
  const actualShapeDefaults = settings.root.children.filter(child => child.name === "w:shapeDefaults");
  if (!expectedShapeDefaults || actualShapeDefaults.length !== 1 || elementXml(settingsXml, actualShapeDefaults[0]) !== expectedShapeDefaults) return false;

  const expectedWpsFeatures = reference.elements.filter(element => element.name === "wpsCustomData:typoFeatureVersion");
  if (expectedWpsFeatures.length === 0) return true;
  if (expectedWpsFeatures.length !== 1) return false;
  for (const prefix of ["mc", "wpsCustomData"]) {
    const namespace = reference.root.attributes.get(`xmlns:${prefix}`);
    if (!namespace || settings.root.attributes.get(`xmlns:${prefix}`) !== namespace) return false;
  }
  const actualWpsFeatures = settings.elements.filter(element => element.name === "wpsCustomData:typoFeatureVersion");
  if (actualWpsFeatures.length !== 1 || elementXml(settingsXml, actualWpsFeatures[0]) !== elementXml(referenceSettingsXml, expectedWpsFeatures[0])) return false;
  const actualFeature = actualWpsFeatures[0];
  const actualChoice = actualFeature.parent;
  const actualAlternateContent = actualChoice?.parent;
  const expectedAlternateContents = reference.root.children.filter(child => child.name === "mc:AlternateContent" &&
    child.children.some(grandchild => grandchild.name === "mc:Choice" &&
      grandchild.children.some(feature => feature.name === "wpsCustomData:typoFeatureVersion"))
  );
  return expectedAlternateContents.length === 1 &&
    actualChoice?.name === "mc:Choice" &&
    actualAlternateContent?.name === "mc:AlternateContent" &&
    actualAlternateContent.parent === settings.root &&
    elementXml(settingsXml, actualAlternateContent) === elementXml(referenceSettingsXml, expectedAlternateContents[0]);
}

/** Stamp the canonical header and merge only its shape settings into the existing document settings. */
export async function stampHoaTieuHeader(bytes: Uint8Array, data: DocumentFormatType): Promise<Uint8Array> {
  const stamp = stampedTable(data);
  if (!stamp) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return bytes;
  const sourceSettings = await zip.file("word/settings.xml")?.async("string");
  const settings = sourceSettings === undefined
    ? stamp.settings
    : mergeHeaderShapeSettings(sourceSettings, stamp.settings);
  if (!settings) return bytes;
  const expectedShape = data.regime === "administrative" ? "ND30 Plain Line 1" : "Straight Connector 1";
  const header = actualHeaderTable(xml, expectedShape);
  if (!header) return bytes;
  zip.file("word/document.xml", xml.slice(0, header.start) + stamp.table + xml.slice(header.end));
  zip.file("word/settings.xml", settings);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function hasStampedHoaTieuHeader(documentXml: string, settingsXml: string, data: DocumentFormatType): boolean {
  const stamp = stampedTable(data);
  if (!stamp || !hasRequiredHeaderShapeSettings(settingsXml, stamp.settings)) return false;
  const expectedShape = data.regime === "administrative" ? "ND30 Plain Line 1" : "Straight Connector 1";
  const header = actualHeaderTable(documentXml, expectedShape);
  return Boolean(header && elementXml(documentXml, header) === stamp.table);
}
