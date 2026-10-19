import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyTable } from "../src/server/tableRoleClassifier.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import type { SourceBlock } from "../src/shared/schemas/document.schema.ts";

describe("Task 5: Table Role & Contextual Partitioning", () => {
  it("Bảng 2 cột ở đầu tài liệu có chữ cột trái nhưng KHÔNG có Quốc hiệu/Đảng -> KHÔNG nhận là header", () => {
    const tableBlock: SourceBlock = {
      id: "tbl_top_no_header",
      index: 0,
      kind: "table",
      role: "unclassified",
      text: "CÔNG TY ABC | BẢNG TIÊU CHUẨN ĐÁNH GIÁ",
      tableShape: { rows: 2, columns: 2 },
      tableData: [
        ["CÔNG TY ABC", "BẢNG TIÊU CHUẨN ĐÁNH GIÁ"],
        ["Phòng Kỹ thuật", "Áp dụng nội bộ"],
      ],
      html: "<table><tr><td>CÔNG TY ABC</td><td>BẢNG TIÊU CHUẨN ĐÁNH GIÁ</td></tr></table>",
    };

    const res = classifyTable(tableBlock, []);
    assert.notEqual(res.owner, "header", "Bảng không có Quốc hiệu/Đảng tuyệt đối không được nhận là header");
    assert.equal(res.role, "layout");
    assert.equal(res.owner, "unknown");
  });

  it("Bảng 2 cột ở đầu tài liệu CÓ Quốc hiệu và Tiêu ngữ -> nhận chính xác là header", () => {
    const tableBlock: SourceBlock = {
      id: "tbl_top_header",
      index: 0,
      kind: "table",
      role: "unclassified",
      text: "UBND TỈNH QUẢNG NINH | CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      tableShape: { rows: 2, columns: 2 },
      tableData: [
        ["UBND TỈNH QUẢNG NINH\nSỞ GTVT", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc"],
        ["Số: 123/SGTVT", "Quảng Ninh, ngày 15 tháng 10 năm 2026"],
      ],
      html: "<table><tr><td>UBND</td><td>CỘNG HÒA</td></tr></table>",
    };

    const res = classifyTable(tableBlock, []);
    assert.equal(res.owner, "header");
    assert.equal(res.role, "header");
    assert.equal(res.confidence, "high");
  });

  it("Đoạn văn mở đầu thân bài sau tên loại KHÔNG bị nhận nhầm thành trích yếu (subject)", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "BIÊN BẢN HỌP GIAO BAN", html: "<p>BIÊN BẢN HỌP GIAO BAN</p>", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "Hôm nay, vào lúc 08 giờ 30 phút ngày 15/10/2026, tại phòng họp số 1:", html: "<p>Hôm nay, vào lúc 08 giờ 30 phút ngày 15/10/2026, tại phòng họp số 1:</p>", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "1. Thành phần tham dự gồm có Ông Nguyễn Văn A - Chủ trì.", html: "<p>1. Thành phần tham dự gồm có Ông Nguyễn Văn A - Chủ trì.</p>", role: "unclassified" },
    ];

    const result = segmentSourceBlocks(blocks, { filename: "bienban.docx", fileType: "docx" });
    assert.equal(result.fields.documentType.value, "BIÊN BẢN HỌP GIAO BAN");
    // Đoạn mở đầu phải ở trong thân bài, KHÔNG làm trích yếu
    assert.ok(!result.fields.subject.value, "Câu mở đầu thân bài không được coi là trích yếu");
    assert.ok(result.body.html.includes("Hôm nay, vào lúc 08 giờ 30 phút"), "Thân bài phải chứa câu mở đầu cuộc họp");
  });

  it("Bảng nằm sau tiêu đề phụ lục được nhận diện chính xác là appendix_data và không vào thân bài", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "KẾ HOẠCH", html: "<p>KẾ HOẠCH</p>", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "Về việc triển khai công tác quý IV năm 2026", html: "<p>Về việc triển khai công tác quý IV năm 2026</p>", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "Nội dung kế hoạch chi tiết như sau.", html: "<p>Nội dung kế hoạch chi tiết như sau.</p>", role: "unclassified" },
      { id: "b3", index: 3, kind: "paragraph", text: "PHỤ LỤC I", html: "<p><strong>PHỤ LỤC I</strong></p>", role: "unclassified" },
      { id: "b4", index: 4, kind: "table", text: "STT | Hạng mục | Dự toán", tableShape: { rows: 2, columns: 3 },
        tableData: [["STT", "Hạng mục", "Dự toán"], ["1", "Thiết bị", "50.000.000"]],
        html: "<table><tr><td>STT</td><td>Hạng mục</td><td>Dự toán</td></tr><tr><td>1</td><td>Thiết bị</td><td>50.000.000</td></tr></table>", role: "unclassified" },
    ];

    const result = segmentSourceBlocks(blocks, { filename: "kehoach.docx", fileType: "docx" });
    assert.equal(result.appendices.length, 1);
    assert.ok(!result.body.html.includes("Thiết bị"), "Dữ liệu bảng phụ lục không được lẫn vào thân bài");
    assert.ok(result.appendices[0].html?.includes("Thiết bị"), "Phụ lục phải giữ nguyên bảng dữ liệu");
  });

  it("Không ép metadata hoặc separator thành body khi thân bài rỗng", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "QUYẾT ĐỊNH", html: "<p>QUYẾT ĐỊNH</p>", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "Về việc kiện toàn nhân sự", html: "<p>Về việc kiện toàn nhân sự</p>", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "------------------", html: "<p>------------------</p>", role: "unclassified" },
    ];

    const result = segmentSourceBlocks(blocks, { filename: "quyetdinh.docx", fileType: "docx" });
    assert.equal(result.fields.documentType.value, "QUYẾT ĐỊNH");
    assert.equal(result.fields.subject.value, "Về việc kiện toàn nhân sự");
    // Separator và metadata không bị ép thành body
    assert.ok(!result.body.html.includes("QUYẾT ĐỊNH"), "Tiêu đề không bị đẩy vào body");
  });
});
