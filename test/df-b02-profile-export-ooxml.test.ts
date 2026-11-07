import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  COMPANY_HEADER_PROFILE_ID,
} from "../src/canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../src/canonical/hd05/companyHeaderHD05.ts";
import { evaluateDocumentRules, extractOoxmlEvidenceFromXml } from "../src/canonical/ruleEngine.ts";
import { composeDocumentFormatData } from "../src/utils/documentComposer.ts";
import { generateND30DocxBuffer, getStyleProfile } from "../src/utils/docxExport.ts";
import type { DocumentState } from "../src/shared/schemas/document.schema.ts";

const bodyHtml = [
  "<p>BODYANCHOR</p>",
  "<h1>I. HEADINGONEANCHOR</h1>",
  "<h2>1.1. HEADINGTWOANCHOR</h2>",
  "<h3>1.1.1. HEADINGTHREEANCHOR</h3>",
].join("");

const baseDoc: DocumentState = {
  headerProfile: "generic",
  orgHeader1: "ĐƠN VỊ TỔNG HỢP",
  orgHeader2: "CÔNG TY TỔNG HỢP",
  nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
  locationAndDate: "Hải Phòng, ngày 01 tháng 01 năm 2026",
  documentType: "THÔNG BÁO",
  referenceNumber: "Số: 01/TB-SYNTHETIC",
  subject: "Về việc kiểm tra profile",
  bodyHtml,
  signTitle: "",
  signName: "",
  recipients: "",
};

function compose(
  regime: "administrative" | "party",
  profile: "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID,
) {
  const isParty = regime === "party";
  return composeDocumentFormatData({
    doc: {
      ...baseDoc,
      headerProfile: profile,
      nationalHeader1: isParty ? "ĐẢNG CỘNG SẢN VIỆT NAM" : baseDoc.nationalHeader1,
      nationalHeader2: isParty ? "" : baseDoc.nationalHeader2,
    },
    standardType: isParty ? "party" : "state",
    reviewBlocks: [],
    structuredImport: null,
  });
}

class SyntheticHtmlElement {
  readonly tagName: string;
  readonly textContent: string;
  readonly childNodes: Array<{ nodeType: number; textContent: string }>;
  readonly outerHTML: string;

  constructor(tagName: string, private readonly innerHtml: string) {
    this.tagName = tagName.toUpperCase();
    this.textContent = innerHtml.replace(/<[^>]*>/gu, "");
    this.childNodes = [{ nodeType: 3, textContent: this.textContent }];
    this.outerHTML = `<${tagName}>${innerHtml}</${tagName}>`;
  }

  getAttribute(_name: string) { return null; }
  querySelector(_selector: string) { return null; }
}

class SyntheticHtmlDomParser {
  parseFromString(source: string) {
    const innerHtml = source.replace(/^<div>/u, "").replace(/<\/div>$/u, "");
    const children = [...innerHtml.matchAll(/<(p|h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/giu)]
      .map(match => new SyntheticHtmlElement(match[1].toLowerCase(), match[2]));
    return { body: { firstElementChild: { children } } };
  }
}

async function withSyntheticHtmlParser<T>(work: () => Promise<T>) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDomParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  const originalNode = Object.getOwnPropertyDescriptor(globalThis, "Node");
  const parserWindow = { DOMParser: SyntheticHtmlDomParser, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: parserWindow });
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: SyntheticHtmlDomParser });
  Object.defineProperty(globalThis, "Node", { configurable: true, value: parserWindow.Node });
  try {
    return await work();
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDomParser) Object.defineProperty(globalThis, "DOMParser", originalDomParser);
    else Reflect.deleteProperty(globalThis, "DOMParser");
    if (originalNode) Object.defineProperty(globalThis, "Node", originalNode);
    else Reflect.deleteProperty(globalThis, "Node");
  }
}

async function paragraphMap(data: ReturnType<typeof compose>) {
  const bytes = await withSyntheticHtmlParser(() => generateND30DocxBuffer(data));
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  assert.ok(documentXml, "post-stamp DOCX contains word/document.xml");
  const paragraphs = [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gu)]
    .map(match => match[0]);
  const byAnchor = (anchor: string) => {
    const paragraph = paragraphs.find(candidate => candidate.includes(anchor));
    assert.ok(paragraph, `DOCX contains paragraph ${anchor}`);
    return paragraph;
  };
  return { byAnchor, documentXml };
}

function fontHalfPoints(paragraph: string) {
  const values = [...paragraph.matchAll(/<w:sz\b[^>]*\bw:val="(\d+)"/gu)]
    .map(match => Number(match[1]));
  assert.ok(values.length > 0, "paragraph contains explicit w:sz evidence");
  assert.equal(new Set(values).size, 1, "paragraph runs use one expected font size");
  return values[0];
}

function paragraphSpacing(paragraph: string) {
  const spacing = paragraph.match(/<w:spacing\b[^>]*\/>/u)?.[0];
  assert.ok(spacing, "paragraph contains direct w:spacing evidence");
  return spacing;
}

test("DF-B02 keeps body profile OOXML and heading fallback roles separate", async () => {
  const regimes = [
    {
      regime: "administrative" as const,
      profile: COMPANY_HEADER_PROFILE_ID,
      genericHeadingPt: [14, 13, 13],
      bodyFirstLineTwips: 720,
    },
    {
      regime: "party" as const,
      profile: COMPANY_HEADER_HD05_PROFILE_ID,
      genericHeadingPt: [15, 14, 14],
      bodyFirstLineTwips: 567,
    },
  ];

  for (const scenario of regimes) {
    const generic = await paragraphMap(compose(scenario.regime, "generic"));
    const selected = await paragraphMap(compose(scenario.regime, scenario.profile));

    const genericBody = generic.byAnchor("BODYANCHOR");
    const profileBody = selected.byAnchor("BODYANCHOR");
    assert.equal(fontHalfPoints(profileBody), 28, `${scenario.regime} profile body uses 14pt`);
    assert.equal(fontHalfPoints(genericBody), scenario.regime === "party" ? 28 : 26);
    assert.match(profileBody, /<w:rFonts\b[^>]*w:ascii="Times New Roman"/u);
    assert.match(profileBody, new RegExp(`<w:spacing\\b[^>]*w:after="120"[^>]*w:line="380"[^>]*w:lineRule="exact"`));
    assert.match(profileBody, new RegExp(`<w:ind\\b[^>]*w:firstLine="${scenario.bodyFirstLineTwips}"`));

    const genericStyle = getStyleProfile(scenario.regime);
    const selectedStyle = getStyleProfile(scenario.regime, scenario.profile);
    assert.deepEqual(
      [selectedStyle.heading1FontSize, selectedStyle.heading2FontSize, selectedStyle.heading3FontSize],
      scenario.genericHeadingPt,
      `${scenario.regime} headings use the existing regime fallback values`,
    );
    assert.deepEqual(
      [selectedStyle.heading1FontSize, selectedStyle.heading2FontSize, selectedStyle.heading3FontSize],
      [genericStyle.heading1FontSize, genericStyle.heading2FontSize, genericStyle.heading3FontSize],
      `${scenario.regime} body profile does not override unconfigured heading roles`,
    );

    for (const [index, anchor] of ["HEADINGONEANCHOR", "HEADINGTWOANCHOR", "HEADINGTHREEANCHOR"].entries()) {
      const genericHeading = generic.byAnchor(anchor);
      const profileHeading = selected.byAnchor(anchor);
      assert.equal(fontHalfPoints(profileHeading), scenario.genericHeadingPt[index] * 2, `${scenario.regime} ${anchor} uses its regime fallback font`);
      assert.equal(fontHalfPoints(profileHeading), fontHalfPoints(genericHeading), `${scenario.regime} profile does not change ${anchor} font`);
      assert.equal(paragraphSpacing(profileHeading), paragraphSpacing(genericHeading), `${scenario.regime} body spacing does not leak into ${anchor}`);
    }

    const evidence = extractOoxmlEvidenceFromXml(selected.documentXml, scenario.regime);
    const audit = evaluateDocumentRules({
      headerProfile: scenario.profile,
      documentType: "THÔNG BÁO",
    }, scenario.regime, evidence);
    const bodyRuleIds = scenario.regime === "party"
      ? ["HD05-BODY-FONT-SIZE", "HD05-BODY-FIRST-LINE-INDENT", "HD05-BODY-LINE-SPACING"]
      : ["ND30-BODY-FONT-SIZE", "BODY.PARAGRAPH.FIRST_LINE_INDENT", "BODY.PARAGRAPH.LINE_SPACING"];
    for (const ruleId of bodyRuleIds) {
      const result = audit.results.find(item => item.ruleId === ruleId);
      assert.equal(
        result?.status,
        "PASS",
        `${scenario.regime} ${ruleId} audit passes on the stamped OOXML: ${result?.reason ?? "missing audit result"}`,
      );
    }
  }
});
