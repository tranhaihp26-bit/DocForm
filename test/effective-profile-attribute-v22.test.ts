import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveAttribute, type ProfileAttributeLayer } from "../src/canonical/effectiveProfileAttribute.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../src/canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../src/canonical/hd05/companyHeaderHD05.ts";
import { COMPANY_ND30_BODY_PROFILE, COMPANY_HD05_BODY_PROFILE } from "../src/canonical/nd30/companyBodyProfile.ts";
import { composeDocumentFormatData } from "../src/utils/documentComposer.ts";
import type { DocumentState } from "../src/shared/schemas/document.schema.ts";

const profileId = "company-v2-validated";
const approved = (values: Record<string, unknown>, priority = 100): ProfileAttributeLayer => ({
  profileId, approval: "approved", priority, sourceRef: "unit-profile", values,
});
const fb = (values: Record<string, unknown>, regime: "administrative" | "party" = "administrative") => ({
  regime, sourceRef: "regime-catalog-existing-values", values,
});
const resolve = (path: string, layers: readonly ProfileAttributeLayer[], fallback?: ReturnType<typeof fb>) =>
  resolveEffectiveAttribute({ path, regime: "administrative", profileId, profileLayers: layers, fallback });

test("DF-B01: zero, false and intentional empty string are SET profile values, not missing", () => {
  const layer = approved({ body: { paragraphAfterPt: 0, pageBreakBefore: false, marker: "" } });
  for (const [path, expected] of [
    ["body.paragraphAfterPt", 0], ["body.pageBreakBefore", false], ["body.marker", ""],
  ] as const) {
    const result = resolve(path, [layer], fb({ body: { paragraphAfterPt: 6, pageBreakBefore: true, marker: "ND30" } }));
    assert.equal(result.state, "SET");
    assert.equal(result.source, "company-profile");
    assert.equal(result.value, expected);
  }
});

test("DF-B01: fallback is per attribute, and only for matching document regime", () => {
  const profile = approved({ body: { fontSizePt: 14 } });
  const fallback = fb({ body: { fontSizePt: 13, paragraphAfterPt: 6 } });
  assert.equal(resolve("body.fontSizePt", [profile], fallback).value, 14);
  const gap = resolve("body.paragraphAfterPt", [profile], fallback);
  assert.equal(gap.value, 6);
  assert.equal(gap.source, "nd30-fallback");
  assert.equal(resolve("body.unspecified", [profile], fallback).state, "UNSPECIFIED");
  assert.equal(resolve("body.paragraphAfterPt", [profile], fb({ body: { paragraphAfterPt: 7 } }, "party")).state, "UNSPECIFIED");
  assert.equal(resolveEffectiveAttribute({
    regime: "party", profileId, path: "body.paragraphAfterPt", profileLayers: [],
    fallback: fb({ body: { paragraphAfterPt: 7 } }, "party"),
  }).source, "hd05-fallback");
});

test("DF-B01: no profile confirmation and draft layers cannot apply the company profile", () => {
  const value = { body: { fontSizePt: 14 } };
  const wrongProfile = resolveEffectiveAttribute({
    regime: "administrative", profileId: "generic", path: "body.fontSizePt",
    profileLayers: [approved(value)], fallback: fb({ body: { fontSizePt: 13 } }),
  });
  assert.equal(wrongProfile.source, "nd30-fallback");
  const draftResult = resolve("body.fontSizePt",
    [{ ...approved(value), approval: "draft" }], fb({ body: { fontSizePt: 13 } }));
  assert.equal(draftResult.value, 13);
  assert.equal(draftResult.source, "nd30-fallback");
});

test("DF-B01: higher-priority approved layer wins, same-priority disagreements are PROFILE_CONFLICT", () => {
  const preferred = approved({ body: { fontSizePt: 14 } }, 200);
  const lower = approved({ body: { fontSizePt: 13 } }, 100);
  assert.equal(resolve("body.fontSizePt", [lower, preferred]).value, 14);
  const conflict = resolve("body.fontSizePt", [preferred, approved({ body: { fontSizePt: 13 } }, 200)], fb({ body: { fontSizePt: 13 } }));
  assert.equal(conflict.state, "PROFILE_CONFLICT");
  assert.equal(conflict.value, undefined);
  assert.equal(conflict.source, undefined);
});

test("DF-B01: null is invalid until defined by schema; invalid profile fonts never fall back or round", () => {
  const badNull = resolve("body.fontSizePt", [approved({ body: { fontSizePt: null } })], fb({ body: { fontSizePt: 13 } }));
  assert.equal(badNull.state, "INVALID");
  assert.equal(badNull.reason, "NULL_SEMANTICS_NOT_DEFINED");
  const badFont = resolve("body.fontSizePt", [approved({ body: { fontSizePt: 15.5 } })], fb({ body: { fontSizePt: 13 } }));
  assert.equal(badFont.state, "INVALID");
  assert.equal(badFont.reason, "INVALID_PROFILE_FONT_SIZE");
  assert.equal(badFont.source, undefined);
  assert.equal(resolve("body.fontSizePt", [approved({ body: { fontSizePt: 0 } })]).state, "INVALID");
  assert.equal(resolve("body.fontSizePt", [approved({ body: { fontSizePt: 15 } })]).value, 15);
});

test("DF-B01: actual company body/table profile values remain unchanged for both regimes", () => {
  const scenarios = [
    { regime: "administrative" as const, p: COMPANY_ND30_BODY_PROFILE, id: COMPANY_HEADER_PROFILE_ID },
    { regime: "party" as const, p: COMPANY_HD05_BODY_PROFILE, id: COMPANY_HEADER_HD05_PROFILE_ID },
  ];
  for (const { regime, p, id } of scenarios) {
    for (const [path, value] of [
      ["body.fontSizePt", 14], ["body.lineSpacingPt", 19], ["body.paragraphAfterPt", 6],
      ["table.fontSizePt", 13], ["table.repeatHeader", true],
    ] as const) {
      const actual = resolveEffectiveAttribute({
        regime, profileId: id, path,
        profileLayers: [{ profileId: id, approval: "approved", priority: 100,
          sourceRef: "src/canonical/nd30/companyBodyProfile.ts",
          values: { body: p.body, table: p.table } }],
        fallback: fb({ body: { fontSizePt: regime === "party" ? 14 : 13 }, table: { fontSizePt: 11 } }, regime),
      });
      assert.equal(actual.value, value, path);
      assert.equal(actual.source, "company-profile", path);
    }
  }
});

test("DF-B01: live DocumentComposer retains confirmed company 14pt and generic ND30 13pt", () => {
  const doc: DocumentState = {
    orgHeader1: "ĐƠN VỊ", orgHeader2: "CÔNG TY",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    documentType: "THÔNG BÁO", subject: "Kiểm chứng", bodyHtml: "<p>Nội dung.</p>",
    referenceNumber: "", locationAndDate: "", recipients: "", signTitle: "", signName: "",
    headerProfile: "generic",
  };
  const generic = composeDocumentFormatData({ doc, standardType: "state", reviewBlocks: [], structuredImport: null });
  assert.equal(generic.fontSize, 13);
  assert.equal(generic.headerProfile, "generic");
  const company = composeDocumentFormatData({ doc: { ...doc, headerProfile: COMPANY_HEADER_PROFILE_ID }, standardType: "state", reviewBlocks: [], structuredImport: null });
  assert.equal(company.fontSize, 14);
  assert.equal(company.headerProfile, COMPANY_HEADER_PROFILE_ID);
});
