import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { 
  assessExportSafety, 
  type ImportFidelityManifest,
  type UnsupportedFeature
} from "../src/shared/importFidelity.ts";

describe("Task 1: Import Fidelity Gate & Export Safety Contract", () => {
  it("cho phép xuất với tài liệu tạo mới từ template hoặc soạn thảo từ đầu", () => {
    const manifest: ImportFidelityManifest = {
      sourceKind: "system_template",
      sourceBlockIds: ["b1", "b2"],
      tableIds: [],
      unsupportedFeatures: [],
    };
    const result = assessExportSafety(manifest);
    assert.equal(result.decision, "allow");
    assert.equal(result.violations.length, 0);
  });

  it("cho phép xuất khi không có manifest (văn bản tạo mới trống)", () => {
    const result = assessExportSafety(null);
    assert.equal(result.decision, "allow");
    assert.equal(result.violations.length, 0);
  });

  it("chặn xuất (reject) khi bảng nguồn có tính năng chưa hỗ trợ và nêu đúng tableId", () => {
    const manifest: ImportFidelityManifest = {
      sourceKind: "uploaded_docx",
      sourceHash: "abc123hash",
      sourceFilename: "baocao.docx",
      sourceBlockIds: ["b1", "b2_tbl"],
      tableIds: ["table_nested_1"],
      unsupportedFeatures: [
        {
          code: "nested_table",
          tableId: "table_nested_1",
          blockId: "b2_tbl",
          description: "Bảng lồng nhau bên trong ô chưa được hỗ trợ bảo toàn",
        },
      ],
      roundtripProven: true,
    };
    const result = assessExportSafety(manifest);
    assert.equal(result.decision, "reject");
    assert.equal(result.canDownloadOriginal, true);
    assert.ok(result.violations.some(v => v.tableId === "table_nested_1"));
    assert.ok(result.violations.some(v => v.code === "nested_table"));
    assert.ok(result.userNotice?.includes("gốc"));
  });

  it("fail closed: chặn xuất tài liệu DOCX có bảng khi chưa chứng minh roundtrip", () => {
    const manifest: ImportFidelityManifest = {
      sourceKind: "uploaded_docx",
      sourceHash: "hash_456",
      sourceFilename: "hopdong.docx",
      sourceBlockIds: ["b1", "tbl_1"],
      tableIds: ["tbl_1"],
      unsupportedFeatures: [],
      roundtripProven: false, // Chưa chứng minh roundtrip
    };
    const result = assessExportSafety(manifest);
    assert.equal(result.decision, "reject");
    assert.ok(result.violations.some(v => v.code === "unverified_roundtrip"));
    assert.equal(result.canDownloadOriginal, true);
  });

  it("cho phép xuất khi DOCX có bảng đã được chứng minh roundtrip và không có lỗi chưa hỗ trợ", () => {
    const manifest: ImportFidelityManifest = {
      sourceKind: "uploaded_docx",
      sourceHash: "hash_789",
      sourceFilename: "vanban_chuan.docx",
      sourceBlockIds: ["b1", "tbl_1"],
      tableIds: ["tbl_1"],
      unsupportedFeatures: [],
      roundtripProven: true,
    };
    const result = assessExportSafety(manifest);
    assert.equal(result.decision, "allow");
    assert.equal(result.violations.length, 0);
  });
});
