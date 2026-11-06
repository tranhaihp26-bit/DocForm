import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeDocumentFormatData } from "../src/utils/documentComposer.ts";
import { prepareImportedFileBundle } from "../src/utils/importSessionLifecycle.ts";
import { parseLocalFile } from "../src/utils/localFileImport.ts";
import { enforceND30Standards } from "../src/server/middleware/compliance.middleware.ts";
import { evaluateDocumentRules } from "../src/canonical/ruleEngine.ts";
import {
  COMPANY_HEADER_PARENT, COMPANY_HEADER_ISSUER, COMPANY_HEADER_PROFILE_ID,
} from "../src/canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../src/canonical/hd05/companyHeaderHD05.ts";
import type { DocumentState } from "../src/shared/schemas/document.schema.ts";

const baseDoc: DocumentState = {
  headerProfile: "generic",
  orgHeader1: COMPANY_HEADER_PARENT,
  orgHeader2: COMPANY_HEADER_ISSUER,
  nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
  locationAndDate: "",
  documentType: "THÔNG BÁO",
  referenceNumber: "",
  subject: "Kiểm tra profile",
  bodyHtml: "<p>Đoạn nội dung thử nghiệm.</p>",
  signTitle: "", signName: "", recipients: "",
};

test("company agency text cannot silently activate profile during export composition", () => {
  const generic = composeDocumentFormatData({
    doc: { ...baseDoc }, standardType: "state", reviewBlocks: [], structuredImport: null,
  });
  assert.equal(generic.headerProfile, "generic");
  assert.equal(generic.fontSize, 13, "generic ND30 uses the regime fallback");
  const selected = composeDocumentFormatData({
    doc: { ...baseDoc, headerProfile: COMPANY_HEADER_PROFILE_ID },
    standardType: "state", reviewBlocks: [], structuredImport: null,
  });
  assert.equal(selected.headerProfile, COMPANY_HEADER_PROFILE_ID);
  assert.equal(selected.fontSize, 14, "confirmed company body profile supplies 14pt");
});

test("new imported company source is generic until user explicitly confirms its profile", async () => {
  const text = [
    COMPANY_HEADER_PARENT,
    COMPANY_HEADER_ISSUER,
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "THÔNG BÁO",
    "Nội dung văn bản chưa duyệt profile.",
  ].join("\n");
  const source = new File([text], "thong-bao-nguon.txt", { type: "text/plain" });
  const parsed = await parseLocalFile(source, "administrative");
  const bundle = prepareImportedFileBundle(parsed, "state");
  assert.equal(bundle.doc.headerProfile, "generic");
  assert.match(bundle.doc.bodyHtml, /Nội dung|văn bản/u);
});

test("AI cannot select company profile; only trusted explicit profile enters compliance formatting", () => {
  const raw = { orgHeader2: COMPANY_HEADER_ISSUER, headerProfile: COMPANY_HEADER_PROFILE_ID,
    subject: "Thông tin kiểm thử", bodyHtml: "<p>Nội dung thử.</p>" };
  const fromAi = enforceND30Standards(raw, "administrative");
  assert.equal(fromAi.headerProfile, "generic");
  assert.equal(fromAi.fontSize, 13);
  const trusted = enforceND30Standards(raw, "administrative", COMPANY_HEADER_PROFILE_ID);
  assert.equal(trusted.headerProfile, COMPANY_HEADER_PROFILE_ID);
  assert.equal(trusted.fontSize, 14);
  const wrongRegime = enforceND30Standards(raw, "party", COMPANY_HEADER_PROFILE_ID);
  assert.equal(wrongRegime.headerProfile, "generic", "company ND30 profile must not leak into Party");
  const trustedParty = enforceND30Standards(raw, "party", COMPANY_HEADER_HD05_PROFILE_ID);
  assert.equal(trustedParty.headerProfile, COMPANY_HEADER_HD05_PROFILE_ID);
  assert.equal(trustedParty.fontSize, 14);
});

test("export UI describes technical checks without claiming legal issuance approval", () => {
  const source = readFileSync("src/components/WorkspaceExport.tsx", "utf8");
  assert.doesNotMatch(source, /Văn bản đủ điều kiện ban hành\./u);
  assert.match(source, /Cần rà soát nội dung, thông số profile và phê duyệt nghiệp vụ riêng/u);
});

test("canonical audit prefers confirmed ND30 profile over legal-looking generic values", () => {
  const evidence: any = {
    header_profile: COMPANY_HEADER_PROFILE_ID,
    margin_left_mm: 31, // allowed by general ND30 range; not the company's 30mm
    motto_underline_length_relation: "wrong",
    issuer_underline_fraction: 0.1,
    body_evidence: {
      hasDirectBodyParagraphs: true,
      fontSizeRangePt: { min: 14, max: 14 },
      firstLineIndentRangeDxa: { min: 720, max: 720 },
      lineSpacingRangeDxa: { min: 380, max: 380 },
      directParagraphs: [{ text: "Nội dung", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 380 }],
    },
  };
  const report = evaluateDocumentRules({
    headerProfile: COMPANY_HEADER_PROFILE_ID, documentType: "THÔNG BÁO",
  }, "administrative", evidence);
  const rule = (id: string) => report.results.find(r => r.ruleId === id);
  assert.equal(rule("ND30.PL1.I.GENERAL.MARGIN_LEFT")?.status, "FAIL");
  assert.equal(rule("ND30.PL1.I.GENERAL.MARGIN_LEFT")?.category, "company_profile");
  assert.equal(rule("ND30.PL1.I.GENERAL.MARGIN_LEFT")?.expected, 30);
  assert.equal(rule("ND30.PL1.I.II.1B.MOTTO_UNDERLINE_LENGTH")?.status, "NOT_APPLICABLE");
  assert.equal(rule("ND30.PL1.I.II.2B.ISSUER_UNDERLINE_RANGE")?.status, "NOT_APPLICABLE");
  assert.equal(rule("ND30-BODY-FONT-SIZE")?.status, "PASS");
  assert.equal(rule("ND30-BODY-FONT-SIZE")?.category, "company_profile");
  const generic = evaluateDocumentRules({ headerProfile: "generic", documentType: "THÔNG BÁO" }, "administrative", evidence);
  assert.equal(generic.results.find(r => r.ruleId === "ND30.PL1.I.GENERAL.MARGIN_LEFT")?.status, "PASS");
});

test("confirmed HD05 company body enforces the profile's 14pt and 567twip, not broad generic ranges", () => {
  const evidence: any = {
    header_profile: COMPANY_HEADER_HD05_PROFILE_ID,
    body_evidence: {
      hasDirectBodyParagraphs: true,
      fontSizeRangePt: { min: 15, max: 15 }, // generic HD05 would allow this
      firstLineIndentRangeDxa: { min: 576, max: 576 }, // generic 540-600 permits
      lineSpacingRangeDxa: { min: 380, max: 380 },
      directParagraphs: [{ text: "Nội dung", isEligibleBody: true, lineRule: "exact", lineSpacingDxa: 380 }],
    },
  };
  const report = evaluateDocumentRules({
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID, documentType: "NGHỊ QUYẾT",
  }, "party", evidence);
  for (const id of ["HD05-BODY-FONT-SIZE", "HD05-BODY-FIRST-LINE-INDENT"]) {
    const result = report.results.find(r => r.ruleId === id);
    assert.equal(result?.status, "FAIL", id);
    assert.equal(result?.category, "company_profile", id);
    assert.match(result?.reason ?? "", /profile Công ty/u);
  }
});
