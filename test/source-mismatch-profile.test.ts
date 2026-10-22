import test from "node:test";
import assert from "node:assert/strict";
import * as sourceMismatch from "../src/utils/sourceMismatch.ts";
import {
  COMPANY_HEADER_PARENT,
  COMPANY_HEADER_ISSUER,
} from "../src/canonical/nd30/companyHeader.ts";
import {
  COMPANY_HEADER_HD05_PARENT,
  COMPANY_HEADER_HD05_ISSUER,
} from "../src/canonical/hd05/companyHeaderHD05.ts";
import type { StructuredImport } from "../src/shared/schemas/document.schema.ts";

type ProfileEvidence = "company" | "other" | "unknown";
const evidenceHelper = sourceMismatch.sourceProfileEvidence as unknown as (
  regime: "state" | "party",
  orgHeader1: string | null | undefined,
  orgHeader2: string | null | undefined,
) => ProfileEvidence;

function importedOrg(orgHeader1?: string, orgHeader2?: string) {
  return {
    fields: {
      documentType: { value: "BIÊN BẢN" },
      orgHeader1: orgHeader1 === undefined ? undefined : { value: orgHeader1 },
      orgHeader2: orgHeader2 === undefined ? undefined : { value: orgHeader2 },
    },
  } as unknown as StructuredImport;
}

function mismatchFor(orgHeader1: string | undefined, orgHeader2: string | undefined, isCompanyProfile: boolean) {
  return sourceMismatch.deriveSourceMismatch({
    hasSelectedSource: true,
    hasImportedFile: true,
    structuredImport: importedOrg(orgHeader1, orgHeader2),
    originalSnapshot: null,
    templates: [],
    isCompanyProfile,
    chosenRegime: "state",
    chosenDocType: "BIÊN BẢN",
  });
}

test("source profile helper exists and recognizes exact administrative company pair", () => {
  assert.equal(typeof sourceMismatch.sourceProfileEvidence, "function");
  assert.equal(evidenceHelper("state", COMPANY_HEADER_PARENT, COMPANY_HEADER_ISSUER), "company");
});

test("source profile helper recognizes exact Party company pair independently", () => {
  assert.equal(evidenceHelper("party", COMPANY_HEADER_HD05_PARENT, COMPANY_HEADER_HD05_ISSUER), "company");
});

test("source profile comparison tolerates whitespace and casing but not other names containing Hoa tiêu", () => {
  assert.equal(
    evidenceHelper("state", "  " + COMPANY_HEADER_PARENT.toLowerCase() + " ", " " + COMPANY_HEADER_ISSUER.toLowerCase() + "  "),
    "company",
  );
  assert.equal(
    evidenceHelper("state", "HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM", "BAN CHẤP HÀNH"),
    "other",
  );
});

test("missing organization evidence is unknown, not a company or a mismatch by itself", () => {
  assert.equal(evidenceHelper("state", undefined, undefined), "unknown");
  assert.equal(evidenceHelper("state", COMPANY_HEADER_PARENT, undefined), "unknown");
  assert.equal(mismatchFor(undefined, undefined, false).profileMismatch, false);
  assert.equal(mismatchFor(undefined, undefined, true).profileMismatch, true);
});

test("an imported source without structured data still requires confirmation for a company profile", () => {
  const result = sourceMismatch.deriveSourceMismatch({
    hasSelectedSource: true,
    hasImportedFile: true,
    structuredImport: null,
    originalSnapshot: null,
    templates: [],
    isCompanyProfile: true,
    chosenRegime: "state",
    chosenDocType: "BIÊN BẢN",
  });
  assert.equal(result.sourceProfile, "unknown");
  assert.equal(result.profileMismatch, true);
});

test("a different Hoa tiêu organization conflicts with the selected company profile", () => {
  const result = mismatchFor("HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM", "BAN CHẤP HÀNH", true);
  assert.equal(result.sourceProfile, "other");
  assert.equal(result.profileMismatch, true);
});

test("the generic profile does not conflict with a different organization", () => {
  const result = mismatchFor("HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM", "BAN CHẤP HÀNH", false);
  assert.equal(result.sourceProfile, "other");
  assert.equal(result.profileMismatch, false);
});
