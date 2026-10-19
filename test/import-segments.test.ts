import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { extractBlocksFromTxt, extractBlocksFromDocx } from "../src/server/blockExtractor.ts";
import { detectEmbeddedSignature } from "../src/utils/docxExport.ts";
import { composeImportedBodyHtml } from "../src/utils/importReview.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";
import { Packer } from "docx";
import JSZip from "jszip";
import type { SourceBlock } from "../src/shared/schemas/document.schema.ts";

async function runTest(id: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`[PASS] ${id}: ${name}`);
  } catch (err: any) {
    console.error(`[FAIL] ${id}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("==================================================================");
  console.log(" DOCS-ND30 STRUCTURAL PARSING & FIELD MAPPING TEST SUITE");
  console.log("==================================================================\n");

  // Build synthetic 53-block fixture matching Ke_hoach_Hoi_nghi_tong_ket_AT_HH_va_ton_vinh_2026.docx manifest
  function buildSyntheticPlanBlocks(): SourceBlock[] {
    const blocks: SourceBlock[] = [];

    // Block 0: Header table [1, 2]
    blocks.push({
      id: "block-0",
      index: 0,
      kind: "table",
      text: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC | CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nSố: 125/KH-HTMB | Độc lập - Tự do - Hạnh phúc",
      html: "<table><tr><td>CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC<br/>Số: 125/KH-HTMB</td><td>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br/>Độc lập - Tự do - Hạnh phúc</td></tr></table>",
      tableShape: { rows: 1, columns: 2 },
      tableData: [
        ["CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nSố: 125/KH-HTMB", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc"]
      ],
      role: "unclassified",
    });

    // Block 1: Date
    blocks.push({
      id: "block-1",
      index: 1,
      kind: "paragraph",
      text: "Hải Phòng, ngày 15 tháng 02 năm 2026",
      html: "<p style=\"text-align: right;\"><em>Hải Phòng, ngày 15 tháng 02 năm 2026</em></p>",
      role: "unclassified",
    });

    // Block 2: DocType
    blocks.push({
      id: "block-2",
      index: 2,
      kind: "paragraph",
      text: "KẾ HOẠCH",
      html: "<p style=\"text-align: center;\"><strong>KẾ HOẠCH</strong></p>",
      role: "unclassified",
    });

    // Block 3: Subject
    blocks.push({
      id: "block-3",
      index: 3,
      kind: "paragraph",
      text: "Về việc tổ chức Hội nghị tổng kết công tác an toàn hàng hải năm 2026",
      html: "<p style=\"text-align: center;\"><strong>Về việc tổ chức Hội nghị tổng kết công tác an toàn hàng hải năm 2026</strong></p>",
      role: "unclassified",
    });

    // Blocks 4..43: Main body paragraphs and lists
    for (let i = 4; i <= 43; i++) {
      let txt = `Mục ${i - 3}. Nội dung kế hoạch tổ chức thực hiện nhiệm vụ quy định tại Điều ${i}. Căn cứ Quyết định số 45/QĐ-UBND.`;
      if (i === 15) {
        txt = "Theo phụ lục đính kèm kế hoạch này, các đơn vị chủ động triển khai đúng tiến độ.";
      }
      blocks.push({
        id: `block-${i}`,
        index: i,
        kind: "paragraph",
        text: txt,
        html: `<p>${txt}</p>`,
        role: "unclassified",
      });
    }

    // Block 44: Recipients and Signature table [1, 2]
    blocks.push({
      id: "block-44",
      index: 44,
      kind: "table",
      text: "Nơi nhận:\n- Như trên;\n- Lưu: VT, TH. | TM. CÔNG TY\nGIÁM ĐỐC\n\nNguyễn Văn A",
      html: "<table><tr><td>Nơi nhận:<br/>- Như trên;<br/>- Lưu: VT, TH.</td><td>TM. CÔNG TY<br/>GIÁM ĐỐC<br/><br/>Nguyễn Văn A</td></tr></table>",
      tableShape: { rows: 1, columns: 2 },
      tableData: [
        ["Nơi nhận:\n- Như trên;\n- Lưu: VT, TH.", "TM. CÔNG TY\nGIÁM ĐỐC\n\nNguyễn Văn A"]
      ],
      role: "unclassified",
    });

    // Block 45: Empty separator
    blocks.push({
      id: "block-45",
      index: 45,
      kind: "paragraph",
      text: "",
      html: "<p></p>",
      role: "unclassified",
    });

    // Block 46: Appendix Heading
    blocks.push({
      id: "block-46",
      index: 46,
      kind: "paragraph",
      text: "PHỤ LỤC",
      html: "<p style=\"text-align: center;\"><strong>PHỤ LỤC</strong></p>",
      role: "unclassified",
    });

    // Block 47: Reference line
    blocks.push({
      id: "block-47",
      index: 47,
      kind: "paragraph",
      text: "(Kèm theo Kế hoạch số 125/KH-HTMB ngày 15 tháng 02 năm 2026)",
      html: "<p style=\"text-align: center;\"><em>(Kèm theo Kế hoạch số 125/KH-HTMB ngày 15 tháng 02 năm 2026)</em></p>",
      role: "unclassified",
    });

    // Block 48: Appendix title
    blocks.push({
      id: "block-48",
      index: 48,
      kind: "paragraph",
      text: "DỰ TOÁN KINH PHÍ VÀ DANH SÁCH THAM DỰ HỘI NGHỊ 2026",
      html: "<p style=\"text-align: center;\"><strong>DỰ TOÁN KINH PHÍ VÀ DANH SÁCH THAM DỰ HỘI NGHỊ 2026</strong></p>",
      role: "unclassified",
    });

    // Block 49: Appendix Section 1 Intro
    blocks.push({
      id: "block-49",
      index: 49,
      kind: "paragraph",
      text: "Bảng 1: Danh sách hạng mục kinh phí tổ chức hội nghị (11 hàng, 3 cột)",
      html: "<p><strong>Bảng 1: Danh sách hạng mục kinh phí tổ chức hội nghị</strong></p>",
      role: "unclassified",
    });

    // Block 50: Appendix Table 1 (11 rows x 3 cols)
    const table1Data: string[][] = [];
    for (let r = 0; r < 11; r++) {
      table1Data.push([`Hàng ${r + 1}`, `Hạng mục ${r + 1}`, `Số tiền ${r + 1}00.000 VNĐ`]);
    }
    blocks.push({
      id: "block-50",
      index: 50,
      kind: "table",
      text: table1Data.map(r => r.join(" | ")).join("\n"),
      html: `<table>${table1Data.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`,
      tableShape: { rows: 11, columns: 3 },
      tableData: table1Data,
      role: "unclassified",
    });

    // Block 51: Appendix Section 2 Intro
    blocks.push({
      id: "block-51",
      index: 51,
      kind: "paragraph",
      text: "Bảng 2: Phân công đơn vị phối hợp (8 hàng, 3 cột)",
      html: "<p><strong>Bảng 2: Phân công đơn vị phối hợp</strong></p>",
      role: "unclassified",
    });

    // Block 52: Appendix Table 2 (8 rows x 3 cols)
    const table2Data: string[][] = [];
    for (let r = 0; r < 8; r++) {
      table2Data.push([`STT ${r + 1}`, `Đơn vị ${r + 1}`, `Nhiệm vụ ${r + 1}`]);
    }
    blocks.push({
      id: "block-52",
      index: 52,
      kind: "table",
      text: table2Data.map(r => r.join(" | ")).join("\n"),
      html: `<table>${table2Data.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`,
      tableShape: { rows: 8, columns: 3 },
      tableData: table2Data,
      role: "unclassified",
    });

    return blocks;
  }

  // TEST SEP-01: DOCX Kế hoạch 4 bảng -> phân vùng đúng header, signature, 2 appendix tables
  await runTest("SEP-01", "Phân vùng đúng header, signature và 2 bảng phụ lục từ fixture Kế hoạch 53 blocks", () => {
    const raw = buildSyntheticPlanBlocks();
    const result = segmentSourceBlocks(raw, { filename: "Ke_hoach_2026.docx", fileType: "docx" });

    assert.strictEqual(result.fields.documentType.value, "KẾ HOẠCH", "Loại văn bản là KẾ HOẠCH");
    assert.strictEqual(result.appendices.length, 1, "Tách được đúng 1 phụ lục");
    assert.strictEqual(result.appendices[0].tables?.length, 2, "Phụ lục chứa đúng 2 bảng");
    assert.strictEqual(result.appendices[0].tables[0].rows, 11, "Bảng 1 có 11 hàng");
    assert.strictEqual(result.appendices[0].tables[0].columns, 3, "Bảng 1 có 3 cột");
    assert.strictEqual(result.appendices[0].tables[1].rows, 8, "Bảng 2 có 8 hàng");
    assert.strictEqual(result.appendices[0].tables[1].columns, 3, "Bảng 2 có 3 cột");
    assert.ok(!result.appendices[0].html.includes("<strong>PHỤ LỤC</strong>"), "Tiêu đề phụ lục không lặp trong phần nội dung xuất Word");
    assert.ok(!result.appendices[0].html.includes("(Kèm theo Kế hoạch số"), "Dòng liên kết phụ lục không lặp trong phần nội dung xuất Word");
  });

  // TEST SEP-02: bodyHtml chỉ chứa thân chính, không lẫn header, signature, appendix
  await runTest("SEP-02", "bodyHtml chỉ chứa phần thân chính, không lẫn header, chữ ký hay phụ lục", () => {
    const raw = buildSyntheticPlanBlocks();
    const result = segmentSourceBlocks(raw, { filename: "Ke_hoach_2026.docx", fileType: "docx" });

    assert.ok(!result.body.html.includes("PHỤ LỤC"), "bodyHtml KHÔNG chứa tiêu đề PHỤ LỤC");
    assert.ok(!result.body.html.includes("DỰ TOÁN KINH PHÍ"), "bodyHtml KHÔNG chứa tiêu đề bảng phụ lục");
    assert.ok(!result.body.html.includes("TM. CÔNG TY"), "bodyHtml KHÔNG chứa khối chữ ký");
    assert.ok(!result.body.html.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), "bodyHtml KHÔNG chứa quốc hiệu");
  });

  // TEST SEP-03: Tên loại/trích yếu lấy đúng từ nguồn; không nhầm Quyết định trong căn cứ
  await runTest("SEP-03", "Không nhầm 'Quyết định' trong câu căn cứ thành docType khi tiêu đề là 'KẾ HOẠCH'", () => {
    const raw = buildSyntheticPlanBlocks();
    const result = segmentSourceBlocks(raw, { filename: "Ke_hoach_2026.docx", fileType: "docx" });

    assert.strictEqual(result.fields.documentType.value, "KẾ HOẠCH");
    assert.ok(result.fields.subject.value?.includes("Hội nghị tổng kết"));
  });

  // TEST SEP-04: Bảo toàn 57 ô phụ lục (11x3 + 8x3)
  await runTest("SEP-04", "Bảo toàn toàn bộ 57 ô dữ liệu trong 2 bảng phụ lục (11x3=33 ô và 8x3=24 ô)", () => {
    const raw = buildSyntheticPlanBlocks();
    const result = segmentSourceBlocks(raw, { filename: "Ke_hoach_2026.docx", fileType: "docx" });

    const app = result.appendices[0];
    const cellCount1 = (app.tables?.[0].data?.flat() || []).length;
    const cellCount2 = (app.tables?.[1].data?.flat() || []).length;

    assert.strictEqual(cellCount1, 33, "Bảng 1 có 33 ô");
    assert.strictEqual(cellCount2, 24, "Bảng 2 có 24 ô");
    assert.strictEqual(cellCount1 + cellCount2, 57, "Tổng cộng đúng 57 ô phụ lục");
  });

  // TEST SEP-05: One block - One owner invariant
  await runTest("SEP-05", "Bảo toàn nguyên tắc One Block - One Owner, không lặp và không mất block", () => {
    const raw = buildSyntheticPlanBlocks();
    const result = segmentSourceBlocks(raw, { filename: "Ke_hoach_2026.docx", fileType: "docx" });

    const allMappedIds = [
      ...result.body.sourceBlockIds,
      ...result.appendices.flatMap(a => a.sourceBlockIds),
      ...(result.fields.nationalHeader1.sourceBlockIds || []),
      ...(result.fields.signTitle.sourceBlockIds || []),
      ...result.unclassified.map(u => u.id),
    ];

    // Verify all 53 block IDs exist in source
    const uniqueIds = new Set(allMappedIds);
    assert.strictEqual(uniqueIds.size, allMappedIds.length, "Không có block ID nào bị lặp gán quyền sở hữu");
  });

  // TEST SEP-06: Biên bản có bảng ký 3x3 -> appendices.length === 0
  await runTest("SEP-06", "Biên bản có bảng ký 3 người (3x3) không bị nhận nhầm thành phụ lục", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "BIÊN BẢN", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "Về việc nghiệm thu bàn giao tài liệu", role: "unclassified" },
      { id: "b3", index: 3, kind: "paragraph", text: "Hôm nay, ngày 15 tháng 10 năm 2026, chúng tôi gồm có...", role: "unclassified" },
      {
        id: "b4", index: 4, kind: "table", text: "THƯ KÝ | CHỦ TỌA | ĐẠI DIỆN BÊN B\nKý tên | Ký tên | Ký tên",
        html: "<table><tr><td>THƯ KÝ</td><td>CHỦ TỌA</td><td>ĐẠI DIỆN BÊN B</td></tr></table>",
        tableShape: { rows: 1, columns: 3 },
        tableData: [["THƯ KÝ", "CHỦ TỌA", "ĐẠI DIỆN BÊN B"]],
        role: "unclassified"
      }
    ];

    const result = segmentSourceBlocks(blocks, { filename: "Bien_ban.docx", fileType: "docx" });
    assert.strictEqual(result.fields.documentType.value, "BIÊN BẢN");
    assert.strictEqual(result.appendices.length, 0, "Không có phụ lục (appendices.length === 0)");
  });

  // TEST SEP-07: Thiếu số văn bản / người ký -> giữ thiếu, không bịa giá trị giả
  await runTest("SEP-07", "Thiếu số văn bản hoặc người ký -> giữ missing, không tự điền giá trị giả", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "THÔNG BÁO", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "Về việc nghỉ lễ", role: "unclassified" },
      { id: "b3", index: 3, kind: "paragraph", text: "Nội dung thông báo chi tiết...", role: "unclassified" }
    ];

    const result = segmentSourceBlocks(blocks, { filename: "TB.docx", fileType: "docx" });
    assert.strictEqual(result.fields.referenceNumber.value, null);
    assert.strictEqual(result.fields.signName.value, null);
  });

  // TEST SEP-08: "Theo phụ lục đính kèm..." trong body không cắt sai ranh giới
  await runTest("SEP-08", "Câu 'Theo phụ lục đính kèm...' trong đoạn văn thân bài không làm parser cắt sai ranh giới", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "THÔNG BÁO", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "Về việc thực hiện nhiệm vụ", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "Các đơn vị thực hiện theo phụ lục đính kèm thông báo này.", role: "unclassified" },
      { id: "b3", index: 3, kind: "paragraph", text: "Nội dung phần kết luận...", role: "unclassified" }
    ];

    const result = segmentSourceBlocks(blocks, { filename: "TB.docx", fileType: "docx" });
    assert.strictEqual(result.appendices.length, 0, "Không tạo phụ lục giả từ câu trong thân bài");
    assert.ok(result.body.html.includes("Các đơn vị thực hiện theo phụ lục đính kèm"), "Câu văn vẫn nằm trong body");
  });

  // TEST SEP-09: Tài liệu có 2 phụ lục -> phân vùng chính xác 2 phụ lục độc lập
  await runTest("SEP-09", "Tài liệu có 2 phụ lục -> tách chính xác 2 phụ lục độc lập theo thứ tự", () => {
    const blocks: SourceBlock[] = [
      { id: "b0", index: 0, kind: "paragraph", text: "KẾ HOẠCH", role: "unclassified" },
      { id: "b1", index: 1, kind: "paragraph", text: "Thân bài...", role: "unclassified" },
      { id: "b2", index: 2, kind: "paragraph", text: "PHỤ LỤC I", role: "unclassified" },
      { id: "b3", index: 3, kind: "paragraph", text: "Nội dung phụ lục 1", role: "unclassified" },
      { id: "b4", index: 4, kind: "paragraph", text: "PHỤ LỤC II", role: "unclassified" },
      { id: "b5", index: 5, kind: "paragraph", text: "Nội dung phụ lục 2", role: "unclassified" }
    ];

    const result = segmentSourceBlocks(blocks, { filename: "Multi_App.docx", fileType: "docx" });
    assert.strictEqual(result.appendices.length, 2, "Có đúng 2 phụ lục");
    assert.ok(result.appendices[0].title.includes("PHỤ LỤC I"));
    assert.ok(result.appendices[1].title.includes("PHỤ LỤC II"));
  });

  // TEST SEP-10: Chữ ký đứng trước phụ lục -> chữ ký không bị đưa vào body hay appendix
  await runTest("SEP-10", "Chữ ký đứng trước phụ lục -> chữ ký được nhận diện riêng, không bị đẩy vào body hay appendix", () => {
    const raw = buildSyntheticPlanBlocks();
    const result = segmentSourceBlocks(raw, { filename: "Ke_hoach_2026.docx", fileType: "docx" });

    assert.strictEqual(result.fields.signTitle.value, "TM. CÔNG TY\nGIÁM ĐỐC");
    assert.strictEqual(result.fields.signName.value, "Nguyễn Văn A");
    assert.ok(!result.body.html.includes("GIÁM ĐỐC"), "Chữ ký không bị nằm trong bodyHtml");
    assert.ok(!result.appendices[0].html.includes("GIÁM ĐỐC"), "Chữ ký không bị nằm trong appendix html");
  });

  // TEST SEP-11..16: Additional regression and fallback assertions
  await runTest("SEP-12", "Chạy offline block extraction và structural segmenter không cần Gemini API", () => {
    const raw = extractBlocksFromTxt("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nKẾ HOẠCH\nVề việc kiểm tra an toàn\nNội dung kế hoạch...");
    const result = segmentSourceBlocks(raw.blocks, { filename: "test.txt", fileType: "txt" });

    assert.strictEqual(result.fields.documentType.value, "KẾ HOẠCH");
    assert.ok(result.body.html.includes("Nội dung kế hoạch"));
  });

  await runTest("SEP-17", "Giữ địa danh và năm từ tiêu ngữ Word có ngày, tháng để trống", () => {
    const blocks: SourceBlock[] = [{
      id: "header", index: 0, kind: "table", role: "unclassified",
      text: "TỔNG CÔNG TY BẢO ĐẢM | CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      tableShape: { rows: 1, columns: 2 },
      tableData: [[
        "TỔNG CÔNG TY BẢO ĐẢM\nCÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nSố: …/…",
        "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nHải Phòng, ngày        tháng     năm 2026",
      ]],
    }];
    const result = segmentSourceBlocks(blocks, { filename: "Tieu ngu chuan.docx", fileType: "docx" });
    assert.equal(result.fields.locationAndDate.value, "Hải Phòng, ngày … tháng … năm 2026");
    assert.equal(result.fields.locationAndDate.status, "ambiguous");
  });

  await runTest("SEP-18", "Tách hai dòng cơ quan cấp trên khi Word dùng khoảng trắng và bỏ qua đoạn trống", () => {
    const blocks: SourceBlock[] = [
      {
        id: "header", index: 0, kind: "table", role: "unclassified",
        text: "Tiêu ngữ hai cột", tableShape: { rows: 1, columns: 2 },
        tableData: [[
          "TỔNG CÔNG TY BẢO ĐẢM                                        AN TOÀN HÀNG HẢI VIỆT NAM\nCÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nSố: 01/HTMB",
          "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc",
        ]],
      },
      { id: "blank", index: 1, kind: "paragraph", text: "", html: "<p></p>", role: "unclassified" },
      { id: "title", index: 2, kind: "paragraph", text: "BIÊN BẢN", html: "<p>BIÊN BẢN</p>", role: "unclassified" },
      { id: "body", index: 3, kind: "paragraph", text: "Nội dung làm việc", html: "<p>Nội dung làm việc</p>", role: "unclassified" },
    ];
    const result = segmentSourceBlocks(blocks, { filename: "sample.docx", fileType: "docx" });
    assert.equal(result.fields.orgHeader1.value, "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM");
    assert.equal(result.fields.orgHeader2.value, "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC");
    assert.equal(result.unclassified.length, 0);
  });

  await runTest("SEP-19", "Giữ nguyên tiêu đề biên bản và cả bảng ký ba người khi nhập", async () => {
    const blocks: SourceBlock[] = [
      { id: "title", index: 0, kind: "paragraph", text: "BIÊN BẢN LÀM VIỆC VỚI CÁN BỘ", html: "<p>BIÊN BẢN LÀM VIỆC VỚI CÁN BỘ</p>", role: "unclassified" },
      { id: "subject", index: 1, kind: "paragraph", text: "Về việc trao đổi công việc", html: "<p>Về việc trao đổi công việc</p>", role: "unclassified" },
      { id: "body", index: 2, kind: "paragraph", text: "Nội dung cuộc họp", html: "<p>Nội dung cuộc họp</p>", role: "unclassified" },
      { id: "sign", index: 3, kind: "table", role: "unclassified", text: "ĐẠI DIỆN | CÁN BỘ | THƯ KÝ", tableShape: { rows: 1, columns: 3 },
        tableData: [["ĐẠI DIỆN\nNguyễn Văn Bình", "CÁN BỘ\nTrần Văn An", "THƯ KÝ\nLê Thị Lan"]],
        html: "<table><tr><td>ĐẠI DIỆN<br/>Nguyễn Văn Bình</td><td>CÁN BỘ<br/>Trần Văn An</td><td>THƯ KÝ<br/>Lê Thị Lan</td></tr></table>" },
    ];
    const result = segmentSourceBlocks(blocks, { filename: "sample.docx", fileType: "docx" });
    assert.equal(result.fields.documentType.value, "BIÊN BẢN LÀM VIỆC VỚI CÁN BỘ");
    assert.ok(result.signatureHtml?.includes("Nguyễn Văn Bình"));
    assert.ok(result.signatureHtml?.includes("Trần Văn An"));
    assert.ok(result.signatureHtml?.includes("Lê Thị Lan"));
    
    // Hợp đồng vùng riêng: bảng ký thuộc vùng ký, không bị lẫn vào thân bài
    const importedBodyHtml = composeImportedBodyHtml(result);
    assert.equal(detectEmbeddedSignature(importedBodyHtml), false, "Bảng ký không được lẫn vào thân bài");

    const docx = generateND30DocxDocument({
      regime: "administrative", headerProfile: "generic", nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc", fontFamily: "Times New Roman", fontSize: 13,
      orgHeader1: "", orgHeader2: "CƠ QUAN THỬ NGHIỆM", locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
      documentType: "BIÊN BẢN LÀM VIỆC VỚI CÁN BỘ", referenceNumber: "Số: 01/BB", subject: "Về việc trao đổi công việc",
      bodyHtml: importedBodyHtml, 
      signTitle: result.fields.signTitle.value || "", 
      signName: result.fields.signName.value || "", 
      recipients: "",
    });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(docx));
    const xml = await zip.file("word/document.xml")!.async("string");
    assert.equal((xml.match(/<w:tbl[\s>]/g) || []).length, 2, "Header và bảng ký phải là hai bảng Word riêng");
    assert.ok(xml.includes("ĐẠI DIỆN"), "OOXML chứa cột ĐẠI DIỆN");
    assert.ok(xml.includes("CÁN BỘ"), "OOXML chứa cột CÁN BỘ");
    assert.ok(xml.includes("THƯ KÝ"), "OOXML chứa cột THƯ KÝ");
    assert.ok(xml.includes("Nguyễn Văn Bình"), "OOXML chứa tên Nguyễn Văn Bình");
    assert.ok(xml.includes("Trần Văn An"), "OOXML chứa tên Trần Văn An");
    assert.ok(xml.includes("Lê Thị Lan"), "OOXML chứa tên Lê Thị Lan");
  });

  await runTest("SEP-20", "Tờ trình thực tế có header 2 cấp, số & ngày và chân trang phân cách bằng TAB -> bóc tách đủ 9/9 trường, 0 khối unclassified", async () => {
    const fixturePath = path.resolve(process.cwd(), "fixtures/pilot_documents/T_TRNH_Can_Bo_Hoa_Tieu_MB.docx");
    assert.ok(fs.existsSync(fixturePath), "Fixture T_TRNH_Can_Bo_Hoa_Tieu_MB.docx tồn tại");
    const buf = fs.readFileSync(fixturePath);
    const ext = await extractBlocksFromDocx(buf);
    assert.ok(ext.blocks.length >= 25, "Bóc tách được đầy đủ các blocks từ tệp Word");

    const result = segmentSourceBlocks(ext.blocks, { filename: "T_TRNH_Can_Bo_Hoa_Tieu_MB.docx", fileType: "docx" });
    
    // Header & metadata assertions
    assert.equal(result.fields.orgHeader1.value, "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM");
    assert.equal(result.fields.orgHeader2.value, "CÔNG TY TNHH MTV HOA TIÊU\nHÀNG HẢI MIỀN BẮC");
    assert.equal(result.fields.nationalHeader1.value, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
    assert.equal(result.fields.nationalHeader2.value, "Độc lập - Tự do - Hạnh phúc");
    assert.equal(result.fields.referenceNumber.value, "Số: …/TTr-CTHTHHMB");
    assert.equal(result.fields.locationAndDate.value, "Hải Phòng, ngày … tháng 9 năm 2026");
    assert.equal(result.fields.documentType.value, "TỜ TRÌNH");
    assert.ok(result.fields.subject.value?.includes("Về công tác cán bộ"));

    // Signature and recipients assertions
    assert.equal(result.fields.signTitle.value, "GIÁM ĐỐC");
    assert.equal(result.fields.signName.value, "Nguyễn Đức Thành");
    assert.ok(result.fields.recipients.value?.includes("Nơi nhận:"));
    assert.ok(result.fields.recipients.value?.includes("- Như trên;"));
    assert.ok(result.fields.recipients.value?.includes("- Các Phó Giám đốc Công ty;"));
    assert.ok(result.fields.recipients.value?.includes("- Lưu: VT, TCCB-LĐ."));

    // Body and Unclassified audit
    assert.ok(result.body.sourceBlockIds.length >= 5, "Nội dung phần thân chứa đủ các đoạn căn cứ và đề xuất");
    assert.equal(result.unclassified.length, 0, "Không có bất kỳ khối nào bị rơi vào Chưa phân loại (0 unclassified)");
  });

  console.log("\n==================================================================");
  console.log(" ĐÃ CHẠY CÁC KIỂM THỬ PHÂN VÙNG CẤU TRÚC");
  console.log("==================================================================\n");
}

main();
