import assert from "node:assert/strict";
import { deriveImportStatus, updateImportField } from "../src/utils/importReview.ts";
import type { StructuredImport } from "../src/shared/schemas/document.schema.ts";

function source(): StructuredImport {
  return {
    source: { filename: "ke-hoach.docx", type: "docx", blockCount: 2 },
    fields: {
      documentType: { value: "KẾ HOẠCH", confidence: "high", status: "extracted", sourceBlockIds: ["block-0"] },
      signName: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    },
    body: { html: "<p>Nội dung chính</p>", sourceBlockIds: ["block-1"] },
    appendices: [],
    unclassified: [],
    order: ["block-0", "block-1"],
  };
}

const initial = source();
assert.equal(deriveImportStatus(initial, true), "needs_review");
assert.equal(deriveImportStatus(initial, false), "needs_review");

const edited = updateImportField(initial, "signName", "Nguyễn Văn B");
assert.equal(initial.fields.signName.value, null);
assert.equal(edited.fields.signName.value, "Nguyễn Văn B");
assert.equal(edited.fields.signName.status, "user_confirmed");
assert.equal(deriveImportStatus(edited, true), "confirmed");
assert.equal(deriveImportStatus(edited, false), "needs_review");

const unresolved = { ...edited, unclassified: [{ id: "block-2", index: 2, kind: "table" as const, text: "Bảng chưa gán", role: "unclassified" as const }] };
assert.equal(deriveImportStatus(unresolved, true), "needs_review");
console.log("[PASS] Import review requires explicit approval and leaves missing/unclassified content for review");
