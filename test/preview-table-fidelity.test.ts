import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimizeTableHtml } from "../src/utils/tableFormatUtils.ts";

describe("Task 8: Preview Fidelity & Opt-in Table Presets", () => {
  it("Bảng có data-source-table-id được optimizeTableHtml giữ nguyên 100%, không bị chèn colgroup làm đẹp ngầm", () => {
    const rawPreservedTableHtml = `<table data-source-table-id="tbl_import_1" style="width: 85%; margin: 10px;"><tr><td style="width: 2500px;">Ô nguyên bản</td></tr></table>`;
    const optimized = optimizeTableHtml(rawPreservedTableHtml);

    assert.equal(optimized, rawPreservedTableHtml, "Bảng có data-source-table-id không được bị thay đổi");
    assert.ok(!optimized.includes("<colgroup>"), "Không được tự chèn colgroup vào bảng nhập");
  });

  it("Bảng có data-preserve='true' được optimizeTableHtml giữ nguyên vẹn", () => {
    const rawCustomTableHtml = `<table data-preserve="true"><tr><td>Bảng đặc thù</td></tr></table>`;
    const optimized = optimizeTableHtml(rawCustomTableHtml);

    assert.equal(optimized, rawCustomTableHtml);
  });

  it("Bảng soạn thảo thông thường (không có data-source-table-id) vẫn được optimizeTableHtml phân bổ tỷ lệ cột", () => {
    const regularTableHtml = `<table><tr><th>STT</th><th>Nội dung</th><th>Đơn vị</th></tr><tr><td>1</td><td>A</td><td>B</td></tr></table>`;
    const optimized = optimizeTableHtml(regularTableHtml);

    assert.ok(optimized.includes("<colgroup>"), "Bảng soạn thảo thông thường có colgroup tối ưu");
    assert.ok(optimized.includes("table-layout: fixed;"), "Bảng thường có table-layout fixed");
  });
});
