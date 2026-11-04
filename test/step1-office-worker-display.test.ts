import test from "node:test";
import assert from "node:assert/strict";
import { getImportGroupAttention, getSourceVisualFailureMessage, semanticLabelForOfficeWorker } from "../src/utils/step1OfficeWorkerDisplay.ts";

test("semantic review labels use Vietnamese office wording and hide unknown parser codes", () => {
  assert.equal(semanticLabelForOfficeWorker("narrative"), "Đoạn văn hành chính");
  assert.equal(semanticLabelForOfficeWorker("list_item"), "Ý liệt kê / gạch đầu dòng");
  assert.equal(semanticLabelForOfficeWorker("legal_basis"), "Căn cứ pháp lý");
  assert.equal(semanticLabelForOfficeWorker("media_unsupported"), "Hình ảnh hoặc đồ họa chưa hỗ trợ");
  assert.equal(semanticLabelForOfficeWorker("table_data"), "Ô dữ liệu trong bảng");
  assert.equal(semanticLabelForOfficeWorker("future_parser_enum"), "Nội dung cần xem lại");
});

test("recognition summary separates groups that need confirmation from unverified or missing groups", () => {
  assert.deepEqual(getImportGroupAttention([
    { title: "Ngày tháng", status: "needs-review" },
    { title: "Dấu, chữ ký số", status: "unverified" },
    { title: "Nơi nhận", status: "missing" },
    { title: "Quốc hiệu", status: "identified" },
  ]), {
    unverified: ["Dấu, chữ ký số"],
    missing: ["Nơi nhận"],
  });
});

test("incomplete and unavailable source page previews explain what the user can do", () => {
  assert.match(getSourceVisualFailureMessage("incomplete"), /Chưa dựng đủ trang/u);
  assert.match(getSourceVisualFailureMessage("unavailable"), /mở tệp gốc bằng Word/u);
  assert.match(getSourceVisualFailureMessage("error"), /duyệt nội dung đã trích bên dưới/u);
});
