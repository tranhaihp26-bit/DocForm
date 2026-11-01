import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  COMPANY_ND30_BODY_PROFILE,
  COMPANY_HD05_BODY_PROFILE,
  resolveCompanyBodyProfile,
} from "../src/canonical/nd30/companyBodyProfile.ts";
import {
  COMPANY_HEADER_PROFILE_ID,
  COMPANY_HEADER_PARENT_LINES,
  COMPANY_HEADER_ISSUER_LINES,
} from "../src/canonical/nd30/companyHeader.ts";
import {
  COMPANY_HEADER_HD05_PROFILE_ID,
  COMPANY_HEADER_HD05_PARENT_LINES,
  COMPANY_HEADER_HD05_ISSUER_LINES,
} from "../src/canonical/hd05/companyHeaderHD05.ts";
import { generateND30DocxBuffer, convertHtmlToDocxElements } from "../src/utils/docxExport.ts";
import { resolveSemanticRuleFormatting } from "../src/utils/semanticRuleFormatting.ts";
import { evaluateDocumentRules } from "../src/canonical/ruleEngine.ts";
import type { DocumentFormatType } from "../src/shared/schemas/document.schema.ts";

test("resolveCompanyBodyProfile correctly resolves by regime and header profile without cross-leaks", () => {
  assert.equal(resolveCompanyBodyProfile("administrative", COMPANY_HEADER_PROFILE_ID), COMPANY_ND30_BODY_PROFILE);
  assert.equal(resolveCompanyBodyProfile("party", COMPANY_HEADER_HD05_PROFILE_ID), COMPANY_HD05_BODY_PROFILE);

  // Cross-regime combinations must return null
  assert.equal(resolveCompanyBodyProfile("administrative", COMPANY_HEADER_HD05_PROFILE_ID), null);
  assert.equal(resolveCompanyBodyProfile("party", COMPANY_HEADER_PROFILE_ID), null);

  // Generic or undefined profiles return null
  assert.equal(resolveCompanyBodyProfile("administrative", "generic"), null);
  assert.equal(resolveCompanyBodyProfile("party", "generic"), null);
  assert.equal(resolveCompanyBodyProfile("administrative", undefined), null);
  assert.equal(resolveCompanyBodyProfile(undefined, undefined), null);
});

test("semantic rule formatting resolves 19pt line spacing and 0.5in indent for HD05 company profile", () => {
  const partyCompany = resolveSemanticRuleFormatting("party", COMPANY_HEADER_HD05_PROFILE_ID, [
    "HD05-BODY-LINE-SPACING",
    "HD05-BODY-FIRST-LINE-INDENT",
  ]);
  assert.deepEqual(partyCompany, { lineSpacing: "19pt", firstLineIndent: "0.5in" });

  const partyGeneric = resolveSemanticRuleFormatting("party", "generic", [
    "HD05-BODY-LINE-SPACING",
    "HD05-BODY-FIRST-LINE-INDENT",
  ]);
  assert.deepEqual(partyGeneric, { lineSpacing: "18pt", firstLineIndent: "1cm" });

  const adminCompany = resolveSemanticRuleFormatting("state", COMPANY_HEADER_PROFILE_ID, [
    "BODY.PARAGRAPH.LINE_SPACING",
    "BODY.PARAGRAPH.FIRST_LINE_INDENT",
  ]);
  assert.deepEqual(adminCompany, { lineSpacing: "19pt", firstLineIndent: "0.5in" });
});

test("export DOCX for Administrative Company Profile applies 14pt, line 380 exact, after 120 dxa to body paragraphs", async () => {
  const doc: any = {
    regime: "administrative",
    headerProfile: COMPANY_HEADER_PROFILE_ID,
    fontFamily: "Times New Roman",
    fontSize: 14,
    orgHeader1: COMPANY_HEADER_PARENT_LINES.join("\n"),
    orgHeader2: COMPANY_HEADER_ISSUER_LINES.join("\n"),
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    documentType: "THÔNG BÁO",
    subject: "Về việc áp dụng profile công ty thống nhất",
    locationAndDate: "Hải Phòng, ngày 01 tháng 11 năm 2026",
    referenceNumber: "Số: 100/TB-HTMB",
    bodyHtml: `
      <p>Đoạn văn thân bài thứ nhất của công ty Hoa Tiêu MB.</p>
      <p data-df-line-spacing="1.15" data-df-first-line-indent="1.27cm">Đoạn văn có semantic style cố override nhưng profile công ty phải thắng.</p>
      <ul><li>Mục danh sách thân bài có bullet.</li></ul>
      <table border="1">
        <tr><th>Cột 1</th><th>Cột 2</th></tr>
        <tr><td>Ô bảng 1</td><td>Ô bảng 2</td></tr>
      </table>
    `,
    recipients: "",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
  };

  const buffer = await generateND30DocxBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  assert.ok(xml, "Document XML generated");

  // Verify body paragraph line spacing is 380 dxa exact
  assert.ok(xml.includes('w:line="380"'), "Contains w:line=380 for company body");
  assert.ok(xml.includes('w:lineRule="exact"'), "Contains w:lineRule=exact for company body");
  assert.ok(xml.includes('w:after="120"'), "Contains w:after=120 for company body");
  assert.ok(xml.includes('w:sz w:val="28"'), "Contains w:sz val=28 (14pt) for company body");

  // Table cells must retain independent styling (not 380 exact line spacing)
  // Table cells use line 240
  assert.ok(xml.includes('w:line="240"'), "Table cells retain independent line spacing (240 dxa)");
});

test("export DOCX for Party Company Profile applies 14pt, line 380 exact, after 120 dxa to body paragraphs", async () => {
  const doc: any = {
    regime: "party",
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
    fontFamily: "Times New Roman",
    fontSize: 14,
    orgHeader1: COMPANY_HEADER_HD05_PARENT_LINES.join("\n"),
    orgHeader2: COMPANY_HEADER_HD05_ISSUER_LINES.join("\n"),
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    documentType: "NGHỊ QUYẾT",
    subject: "Về việc thực hiện nhiệm vụ công tác quý IV năm 2026",
    locationAndDate: "Hải Phòng, ngày 01 tháng 11 năm 2026",
    referenceNumber: "Số: 45-NQ/ĐU",
    bodyHtml: `
      <p>Đoạn văn thân bài Đảng của Đảng bộ Hoa Tiêu MB.</p>
      <p data-df-line-spacing="18pt">Đoạn văn Đảng với semantic style 18pt nhưng profile công ty 19pt exact phải thắng.</p>
      <ul><li>Nhiệm vụ trọng tâm quý IV.</li></ul>
      <table border="1">
        <tr><th>STT</th><th>Nội dung</th></tr>
        <tr><td>1</td><td>Chỉ tiêu sản xuất kinh doanh</td></tr>
      </table>
    `,
    recipients: "",
    signTitle: "BÍ THƯ",
    signName: "Trần Văn B",
  };

  const buffer = await generateND30DocxBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  assert.ok(xml, "Document XML generated");

  // Verify body paragraph line spacing is 380 dxa exact
  assert.ok(xml.includes('w:line="380"'), "Contains w:line=380 for party company body");
  assert.ok(xml.includes('w:lineRule="exact"'), "Contains w:lineRule=exact for party company body");
  assert.ok(xml.includes('w:after="120"'), "Contains w:after=120 for party company body");
  assert.ok(xml.includes('w:sz w:val="28"'), "Contains w:sz val=28 (14pt) for party company body");

  // Table cells retain independent styling
  assert.ok(xml.includes('w:line="240"'), "Table cells retain independent line spacing (240 dxa)");
});

test("generic administrative and generic party fall back to standard spacing", async () => {
  const adminGenericDoc: any = {
    regime: "administrative",
    headerProfile: "generic",
    fontFamily: "Times New Roman",
    fontSize: 13,
    orgHeader1: "BỘ GIAO THÔNG VẬN TẢI",
    orgHeader2: "CỤC HÀNG HẢI VIỆT NAM",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    documentType: "CÔNG VĂN",
    subject: "Về việc triển khai nhiệm vụ",
    locationAndDate: "Hà Nội, ngày 01 tháng 11 năm 2026",
    referenceNumber: "Số: 123/CHHVN",
    bodyHtml: `<p>Đoạn văn hành chính thông thường.</p>`,
    recipients: "",
    signTitle: "",
    signName: "",
  };
  const adminBuffer = await generateND30DocxBuffer(adminGenericDoc);
  const adminZip = await JSZip.loadAsync(adminBuffer);
  const adminXml = await adminZip.file("word/document.xml")?.async("string");
  assert.ok(adminXml);
  // Generic administrative body uses 13pt (sz: 26) and line 276
  assert.ok(adminXml.includes('w:line="276"'), "Generic administrative uses line 276 (1.15x)");
  assert.ok(adminXml.includes('w:sz w:val="26"'), "Generic administrative uses 13pt (sz 26)");

  const partyGenericDoc: any = {
    regime: "party",
    headerProfile: "generic",
    fontFamily: "Times New Roman",
    fontSize: 14,
    orgHeader1: "TỈNH ỦY",
    orgHeader2: "VĂN PHÒNG",
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    documentType: "NGHỊ QUYẾT",
    subject: "Về việc ban hành kế hoạch",
    locationAndDate: "Ngày 01 tháng 11 năm 2026",
    referenceNumber: "Số: 12-NQ/TU",
    bodyHtml: `<p>Đoạn văn văn bản Đảng thông thường.</p>`,
    recipients: "",
    signTitle: "",
    signName: "",
  };
  const partyBuffer = await generateND30DocxBuffer(partyGenericDoc);
  const partyZip = await JSZip.loadAsync(partyBuffer);
  const partyXml = await partyZip.file("word/document.xml")?.async("string");
  assert.ok(partyXml);
  // Generic party uses 14pt (sz: 28) and line 360 (18pt exact)
  assert.ok(partyXml.includes('w:line="360"'), "Generic party uses line 360 (18pt exact)");
  assert.ok(partyXml.includes('w:sz w:val="28"'), "Generic party uses 14pt (sz 28)");
});

test("ruleEngine evaluates exact 19pt line spacing for both ND30 and HD05 company profiles", () => {
  // ND30 company profile
  const nd30Doc: any = {
    regime: "administrative",
    headerProfile: COMPANY_HEADER_PROFILE_ID,
    documentType: "THÔNG BÁO",
  };
  const nd30Evidence: any = {
    header_profile: COMPANY_HEADER_PROFILE_ID,
    body_evidence: {
      hasDirectBodyParagraphs: true,
      lineSpacingRangeDxa: { min: 380, max: 380 },
      fontSizeRangePt: { min: 14, max: 14 },
      firstLineIndentRangeDxa: { min: 720, max: 720 },
      directParagraphs: [
        { text: "Đoạn 1", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 380 },
        { text: "Đoạn 2", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 380 },
      ],
    },
  };
  const nd30Result = evaluateDocumentRules(nd30Doc, "administrative", nd30Evidence);
  const nd30RuleStatus = nd30Result.results.find((r: any) => r.ruleId === "BODY.PARAGRAPH.LINE_SPACING");
  assert.equal(nd30RuleStatus?.status, "PASS", "ND30 company profile passes with exactly 19pt (380 dxa)");

  // HD05 company profile
  const hd05Doc: any = {
    regime: "party",
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
    documentType: "NGHỊ QUYẾT",
  };
  const hd05Evidence: any = {
    header_profile: COMPANY_HEADER_HD05_PROFILE_ID,
    body_evidence: {
      hasDirectBodyParagraphs: true,
      lineSpacingRangeDxa: { min: 380, max: 380 },
      fontSizeRangePt: { min: 14, max: 14 },
      firstLineIndentRangeDxa: { min: 720, max: 720 },
      directParagraphs: [
        { text: "Đoạn Đảng 1", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 380 },
        { text: "Đoạn Đảng 2", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 380 },
      ],
    },
  };
  const hd05Result = evaluateDocumentRules(hd05Doc, "party", hd05Evidence);
  const hd05LineStatus = hd05Result.results.find((r: any) => r.ruleId === "HD05-BODY-LINE-SPACING");
  const hd05IndentStatus = hd05Result.results.find((r: any) => r.ruleId === "HD05-BODY-FIRST-LINE-INDENT");
  assert.equal(hd05LineStatus?.status, "PASS", "HD05 company profile passes with exactly 19pt (380 dxa)");
  assert.equal(hd05IndentStatus?.status, "PASS", "HD05 company profile passes with 720 dxa (0.5 inch indent)");

  // Negative test: HD05 company profile with 360 dxa (18pt) fails company requirement
  const hd05MismatchEvidence: any = {
    header_profile: COMPANY_HEADER_HD05_PROFILE_ID,
    body_evidence: {
      hasDirectBodyParagraphs: true,
      lineSpacingRangeDxa: { min: 360, max: 360 },
      directParagraphs: [
        { text: "Đoạn lệch", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 360 },
      ],
    },
  };
  const hd05MismatchResult = evaluateDocumentRules(hd05Doc, "party", hd05MismatchEvidence);
  const hd05MismatchStatus = hd05MismatchResult.results.find((r: any) => r.ruleId === "HD05-BODY-LINE-SPACING");
  assert.equal(hd05MismatchStatus?.status, "FAIL", "HD05 company profile fails when line spacing is 360 dxa instead of 380 dxa");
});
