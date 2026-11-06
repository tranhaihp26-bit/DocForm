import assert from "node:assert/strict";
import JSZip from "jszip";
import { auditCanonicalND30, evidenceFromDocumentXml, subjectUnderlineProofFromDocumentXml } from "../src/canonical/nd30/canonicalAudit.ts";
import { DocumentFormatSchema, validateND30Compliance } from "../src/shared/schemas/document.schema.ts";
import { generateND30DocxUint8Array } from "../src/utils/docxExport.ts";
import {
  SYSTEM_FORMAL_LINE_THICKNESS_CSS,
  SYSTEM_FORMAL_LINE_THICKNESS_EMU,
  SYSTEM_FORMAL_LINE_THICKNESS_PT,
} from "../src/utils/formalLineThickness.ts";

assert.equal(SYSTEM_FORMAL_LINE_THICKNESS_PT, 0.75, "Every system line uses a 0.75 pt stroke");
assert.equal(SYSTEM_FORMAL_LINE_THICKNESS_EMU, 9525, "0.75 pt is encoded as 9525 EMU in DrawingML");
assert.equal(SYSTEM_FORMAL_LINE_THICKNESS_CSS, "0.75pt", "The preview uses the same physical 0.75 pt thickness");

const base = DocumentFormatSchema.parse({
  regime: "administrative",
  headerProfile: "generic",
  fontFamily: "Times New Roman",
  fontSize: 13,
  orgHeader1: "CƠ QUAN MẪU",
  orgHeader2: "ĐƠN VỊ MẪU",
  referenceNumber: "Số: 01/KH-MAU",
  locationAndDate: "Hà Nội, ngày 20 tháng 10 năm 2026",
  nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
  documentType: "KẾ HOẠCH",
  subject: "Tổ chức chương trình tổng kết công tác hàng hải năm 2026",
  bodyHtml: "<p>Nội dung thử nghiệm đã khử nhận dạng.</p>",
  signTitle: "GIÁM ĐỐC",
  signName: "NGƯỜI ĐẠI DIỆN",
  recipients: "Lưu: VT.",
});

async function documentXml(data: typeof base): Promise<string> {
  const zip = await JSZip.loadAsync(await generateND30DocxUint8Array(data));
  return await zip.file("word/document.xml")!.async("string");
}

function subjectParagraphs(xml: string) {
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(match => match[0]);
}

for (const [label, subject] of [
  ["one line", "Kế hoạch công tác năm 2026"],
  ["explicit multiple lines", "Tổng kết công tác năm 2026\nVà triển khai nhiệm vụ năm 2027"],
  ["long wrapped title", "Tổ chức chương trình tổng kết công tác bảo đảm an toàn hàng hải và biểu dương các tập thể, cá nhân có thành tích xuất sắc điển hình trong năm 2026"],
] as const) {
  const xml = await documentXml({ ...base, subject });
  const paragraphs = subjectParagraphs(xml);
  const subjectIndex = paragraphs.findIndex(paragraph => paragraph.includes(subject.split("\n")[0]));
  if (label === "explicit multiple lines") {
    assert.equal((paragraphs[subjectIndex]?.match(/<w:br\b/g) ?? []).length, 1,
      label + ": a requested subject line break must be encoded as a Word break element");
  }
  assert.ok(subjectIndex >= 0, `${label}: subject paragraph must be present`);
  const lineParagraph = paragraphs[subjectIndex + 1];
  assert.ok(lineParagraph?.includes('name="ND30 Plain Line 3"'), `${label}: the subject line must follow the subject paragraph`);
  assert.ok(lineParagraph.includes("<wp:inline"), `${label}: the subject line must participate in text flow`);
  assert.ok(!/<wp:position[HV]\b/.test(lineParagraph), `${label}: the subject line must not use page-relative coordinates`);

  const subjectSpacing = paragraphs[subjectIndex].match(/<w:spacing\b([^>]*)\/?>/)?.[1] ?? "";
  assert.ok(/w:after="0"/.test(subjectSpacing), `${label}: subject paragraph must have 0 after-spacing to keep line close`);
  const lineSpacing = lineParagraph.match(/<w:spacing\b([^>]*)\/?>/)?.[1] ?? "";
  assert.ok(/w:before="0"/.test(lineSpacing) && /w:line="20"/.test(lineSpacing) && /w:lineRule="exact"/.test(lineSpacing),
    `${label}: subject line paragraph must use tight 1pt exact line box with 0 before-spacing`);

  const drawingWidthEmu = Number(lineParagraph.match(/<wp:extent\b[^>]*cx="(\d+)"/)?.[1]);
  const fallbackLine = lineParagraph.match(/<v:line\b[^>]*from="([^"]+)"[^>]*to="([^"]+)"[^>]*>/)?.[0] ?? "";
  const fallbackTo = fallbackLine.match(/to="([\d.]+)pt,0pt"/)?.[1];
  const drawingLine = lineParagraph.match(/<a:ln\b[^>]*>/)?.[0] ?? "";
  assert.match(drawingLine, /\bw="9525"/, label + ": DrawingML subject underline must be 0.75 pt");
  assert.match(lineParagraph, /<v:stroke\b[^>]*\bweight="0\.75pt"/, label + ": VML subject underline fallback must be 0.75 pt");
  assert.ok(drawingWidthEmu > 0, `${label}: inline DrawingML width must be measured`);
  assert.ok(fallbackLine.includes("position:relative"), `${label}: VML fallback must flow with text`);
  assert.ok(!fallbackLine.includes("position:absolute") && !fallbackLine.includes("relative:page"), `${label}: VML fallback must not be page-anchored`);
  assert.ok(Math.abs(Math.round(drawingWidthEmu / 635) - Math.round(Number(fallbackTo) * 20)) <= 1, `${label}: VML fallback width must match DrawingML`);

  const fraction = evidenceFromDocumentXml(xml).subject_underline_fraction;
  assert.ok(typeof fraction === "number", `${label}: canonical evidence must measure the subject underline`);
  assert.ok(fraction >= 1 / 3 && fraction <= 1 / 2, `${label}: underline must be between one third and one half of the longest displayed line (got ${fraction})`);
  const finding = auditCanonicalND30(evidenceFromDocumentXml(xml)).findings.find(item => item.ruleId === "ND30.PL1.I.II.5B.NAMED_SUBJECT_UNDERLINE_RANGE");
  assert.equal(finding?.status, "PASS", `${label}: the existing canonical rule should evaluate from generated OOXML`);
}

const invalid = await documentXml(base);
const noVMLFallback = invalid.replace(/<v:line\b[\s\S]*?<\/v:line>/, "<v:rect/> ");
assert.equal(evidenceFromDocumentXml(noVMLFallback).subject_underline_fraction, undefined, "a missing line fallback must not produce canonical PASS evidence");
assert.equal(subjectUnderlineProofFromDocumentXml(noVMLFallback).width_twips, undefined, "preview fallback metadata must be unavailable without a valid source Shape");
const anchoredInsteadOfInline = invalid.replace("<wp:inline", "<wp:anchor");
assert.equal(evidenceFromDocumentXml(anchoredInsteadOfInline).subject_underline_fraction, undefined, "a page-anchored drawing must remain NOT_EVALUATED");
const subjectParagraph = subjectParagraphs(invalid).find(paragraph => paragraph.includes(base.subject))!;
for (const unsupported of ["<w:fldSimple/>", "<w:txbxContent/>", "<a:blip/>"]) {
  const xml = invalid.replace(subjectParagraph, subjectParagraph.replace("</w:p>", `${unsupported}</w:p>`));
  assert.equal(evidenceFromDocumentXml(xml).subject_underline_fraction, undefined, `${unsupported} must keep the canonical line rule NOT_EVALUATED`);
  assert.equal(subjectUnderlineProofFromDocumentXml(xml).width_twips, undefined, `${unsupported} must not create a preview line`);
}

const validProof = subjectUnderlineProofFromDocumentXml(invalid);
assert.ok(validProof.width_twips && validProof.subject_text, "valid candidate XML must provide the exact line width and adjacent subject text for preview fallback");

// Strict proof against expected subject
assert.ok(subjectUnderlineProofFromDocumentXml(invalid, base.subject).subject_underline_fraction !== undefined,
  "strict proof must pass when candidate subject matches expectedSubject");
assert.equal(subjectUnderlineProofFromDocumentXml(invalid, "Chủ đề hoàn toàn khác").subject_underline_fraction, undefined,
  "strict proof must fail-closed when candidate subject text does not match expectedSubject");

// Line paragraph with unexpected text
const lineParagraphWithText = invalid.replace('name="ND30 Plain Line 3"', 'name="ND30 Plain Line 3"/><w:r><w:t>Văn bản phụ</w:t></w:r>');
assert.equal(subjectUnderlineProofFromDocumentXml(lineParagraphWithText).subject_underline_fraction, undefined,
  "a line paragraph containing substantive text must fail proof");

// Wrong stroke thickness in DrawingML or VML
const wrongDmlThickness = invalid.replace('w="9525"', 'w="12700"');
assert.equal(subjectUnderlineProofFromDocumentXml(wrongDmlThickness).subject_underline_fraction, undefined,
  "DrawingML stroke thickness different from 0.75 pt (9525 EMU) must fail proof");
const wrongVmlThickness = invalid.replace('weight="0.75pt"', 'weight="1pt"');
assert.equal(subjectUnderlineProofFromDocumentXml(wrongVmlThickness).subject_underline_fraction, undefined,
  "VML fallback stroke weight different from 0.75pt must fail proof");

// Duplicate subject line
const duplicateLine = invalid.replace('name="ND30 Plain Line 3"', 'name="ND30 Plain Line 3"')
  + '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline><wp:docPr id="30004" name="ND30 Plain Line 3"/></wp:inline></w:drawing></w:r></w:p>';
assert.equal(subjectUnderlineProofFromDocumentXml(duplicateLine).subject_underline_fraction, undefined,
  "duplicate ND30 Plain Line 3 elements must fail proof");

const overlongWidth = Math.round((validProof.width_twips / 0.4) * 0.7);
const lineP = subjectParagraphs(invalid).find(paragraph => paragraph.includes('name="ND30 Plain Line 3"'))!;
const overlongLineP = lineP
  .replace(/cx="\d+"/g, `cx="${overlongWidth * 635}"`)
  .replace(/to="[\d.]+pt,0pt"/, `to="${(overlongWidth / 20).toFixed(2)}pt,0pt"`);
const overlongXml = invalid.replace(lineP, overlongLineP);
const outOfRangeEvidence = evidenceFromDocumentXml(overlongXml);
const outOfRangeFinding = auditCanonicalND30(outOfRangeEvidence).findings.find(item => item.ruleId === "ND30.PL1.I.II.5B.NAMED_SUBJECT_UNDERLINE_RANGE");
assert.equal(outOfRangeFinding?.status, "FAIL", "a proven subject line outside the required fraction must FAIL, not PASS");

const letterXml = await documentXml({ ...base, documentType: "CÔNG VĂN", subject: "V/v phối hợp công tác năm 2026" });
assert.ok(!letterXml.includes('name="ND30 Plain Line 3"'), "official letters must not receive the named-document subject underline");
const partyXml = await documentXml({ ...base, regime: "party", documentType: "NGHỊ QUYẾT", subject: "Tăng cường công tác xây dựng Đảng" });
assert.ok(!partyXml.includes('name="ND30 Plain Line 3"'), "Party documents must not receive the ND30 subject underline");

const missingReference = validateND30Compliance({ ...base, referenceNumber: "Số: /KH-CTHTHHMB" }, "administrative");
const missingIssue = missingReference.issues.find(issue => issue.field === "referenceNumber");
assert.equal(missingIssue?.id, "referenceNumber_missing", "a suffix without an assigned number is a missing value, not a formatting error");
assert.equal(missingIssue?.suggestion, undefined, "the validator must never invent a serial number or propose unchanged text");
assert.match(missingIssue?.message ?? "", /chưa được cấp|chưa sẵn sàng ban hành/i);
assert.equal(missingIssue?.severity, "warning", "an unassigned serial remains a non-blocking review warning under the current gate");
assert.equal(missingReference.noCriticalErrors, true, "the missing serial must not become a critical export blocker");
assert.equal(validateND30Compliance({ ...base, referenceNumber: "Số: /KH-30MB" }, "administrative").issues.find(issue => issue.field === "referenceNumber")?.id,
  "referenceNumber_missing", "digits inside an agency suffix do not count as an assigned serial number");

const validReference = validateND30Compliance({ ...base, referenceNumber: "Số: 12/KH-UBND" }, "administrative");
assert.equal(validReference.issues.some(issue => issue.field === "referenceNumber"), false, "a valid assigned reference number should pass");
const malformedReference = validateND30Compliance({ ...base, referenceNumber: "Số: 12 KH-UBND" }, "administrative");
assert.equal(malformedReference.issues.find(issue => issue.field === "referenceNumber")?.id, "referenceNumber_format", "a number with malformed structure remains a formatting issue");

console.log("[SUBJECT UNDERLINE / REFERENCE WARNING] OOXML flow, evidence, regime exclusions, and missing serial handling checked.");
