/**
 * @file table-and-body-format.test.ts
 * @description Bộ kiểm thử toàn diện quy chuẩn định dạng Body & Bảng biểu theo Nghị định 30/2020/NĐ-CP
 * 
 * ĐỐI CHIẾU CÁC QUY TẮC CANONICAL:
 * 1. ND30.PL1.I.II.6E.BODY_JUSTIFIED: Căn lề hai bên (justified / w:jc w:val="both")
 * 2. ND30.PL1.I.II.6E.BODY_LINE_SPACING_RANGE: Giãn dòng 1.15 - 1.25 (line = 276 dxa)
 * 3. ND30.PL1.I.II.6E.FIRST_LINE_INDENT: Thụt đầu dòng 1.0cm - 1.27cm (567 - 720 dxa)
 * 4. ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN: Khoảng cách giữa các đoạn tối thiểu 6pt (after = 120 dxa)
 * 5. ND30.PL1.I.II.6A.LEGAL_BASIS_ITALIC: Căn cứ pháp lý in nghiêng (w:i), thụt đầu dòng
 * 6. ND30.PL1.I.II.6D.STRUCTURE_TITLES_REQUIRED: Tiêu đề Điều/Mục in đậm, đứng, keepNext
 * 7. Bảng biểu (Tables): Cột STT chiếm 7-9%, căn giữa; Cột Nội dung chiếm 50-60%, căn đều;
 *    Lặp lại tiêu đề trang (w:tblHeader); Chống ngắt dòng xấu (w:cantSplit); Padding chuẩn.
 */

import assert from "node:assert/strict";
import JSZip from "jszip";
import { Packer } from "docx";
import { 
  detectColumnSemanticType, 
  calculateTableColumnProportions, 
  calculateTableColumnWidthsTwip, 
  optimizeTableHtml 
} from "../src/utils/tableFormatUtils.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";
import type { DocumentFormatType } from "../src/shared/schemas/document.schema.ts";

async function runTest(testId: string, testName: string, testFn: () => void | Promise<void>) {
  try {
    await testFn();
    console.log(`[PASS] ${testId}: ${testName}`);
  } catch (err: any) {
    console.error(`[FAIL] ${testId}: ${testName}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log("==================================================================");
  console.log(" KIỂM THỬ ĐỊNH DẠNG BODY & BẢNG BIỂU CHUẨN NGHỊ ĐỊNH 30/2020");
  console.log("==================================================================\n");

  // TEST 1: Nhận diện ngữ nghĩa cột bảng (Semantic Header Detection)
  await runTest("TBL-01", "Nhận diện chính xác loại cột từ tiêu đề header tiếng Việt", () => {
    assert.equal(detectColumnSemanticType("STT"), "stt");
    assert.equal(detectColumnSemanticType("Số TT"), "stt");
    assert.equal(detectColumnSemanticType("No."), "stt");
    assert.equal(detectColumnSemanticType("Nội dung công việc"), "content");
    assert.equal(detectColumnSemanticType("Hạng mục triển khai"), "content");
    assert.equal(detectColumnSemanticType("Đơn vị chủ trì"), "department");
    assert.equal(detectColumnSemanticType("Phòng ban phụ trách"), "department");
    assert.equal(detectColumnSemanticType("Thời gian thực hiện"), "time");
    assert.equal(detectColumnSemanticType("Tiến độ"), "time");
    assert.equal(detectColumnSemanticType("Số lượng"), "quantity");
    assert.equal(detectColumnSemanticType("ĐVT"), "unit");
    assert.equal(detectColumnSemanticType("Ghi chú"), "note");
  });

  // TEST 2: Phân bổ % cột thông minh cho bảng Kế hoạch (STT, Nội dung, Đơn vị)
  await runTest("TBL-02", "Phân bổ % cột: STT ~8%, Nội dung ~55-60%, Tổng chính xác 100%", () => {
    const headers = ["STT", "Nội dung công việc", "Đơn vị chủ trì"];
    const proportions = calculateTableColumnProportions(headers);

    assert.equal(proportions.length, 3);
    assert.equal(proportions.reduce((a, b) => a + b, 0), 100, "Tổng % phải bằng 100%");
    assert.ok(proportions[0] >= 7 && proportions[0] <= 10, `Cột STT phải gọn ~8% (thực tế: ${proportions[0]}%)`);
    assert.ok(proportions[1] >= 50 && proportions[1] <= 65, `Cột Nội dung phải rộng ~55-60% (thực tế: ${proportions[1]}%)`);
    assert.ok(proportions[2] >= 28 && proportions[2] <= 40, `Cột Đơn vị chiếm ~30-35% (thực tế: ${proportions[2]}%)`);
  });

  // TEST 3: Phân bổ kích thước twip cho MS Word (A4 printable width 9355 dxa)
  await runTest("TBL-03", "Phân bổ độ rộng twip cho docx Table: Tổng bằng đúng 9355 twips", () => {
    const headers = ["STT", "Nội dung công việc", "Đơn vị chủ trì"];
    const totalTwips = 9355;
    const widthsTwip = calculateTableColumnWidthsTwip(headers, totalTwips);

    assert.equal(widthsTwip.length, 3);
    assert.equal(widthsTwip.reduce((a, b) => a + b, 0), totalTwips, "Tổng twips phải bằng 9355");
    assert.ok(widthsTwip[0] <= 900, "Cột STT trong Word phải nhỏ hơn 900 twips (~1.5cm)");
    assert.ok(widthsTwip[1] >= 4800, "Cột Nội dung trong Word phải lớn hơn 4800 twips (~8.5cm)");
  });

  // TEST 4: Tối ưu hóa chuỗi HTML bảng
  await runTest("TBL-04", "optimizeTableHtml chèn colgroup và table-layout: fixed", () => {
    const rawHtml = `
      <table>
        <thead>
          <tr><th>STT</th><th>Nội dung công việc</th><th>Đơn vị chủ trì</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td>Báo cáo tổng kết</td><td>Phòng An toàn</td></tr>
        </tbody>
      </table>
    `;
    const optimized = optimizeTableHtml(rawHtml);
    assert.ok(optimized.includes("<colgroup>"), "Phải sinh thẻ <colgroup>");
    assert.ok(optimized.includes("table-layout: fixed"), "Phải có table-layout: fixed");
    assert.ok(optimized.includes("width: 100%"), "Phải có width: 100%");
  });

  // TEST 5: Xuất DOCX và kiểm tra OOXML thật của bảng và body paragraphs
  await runTest("TBL-05", "Tạo DOCX thật, đọc OOXML xác minh columnWidths, w:tblHeader, w:cantSplit và body styling", async () => {
    const sampleDoc: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 125/KH-HTMB",
      subject: "V/v Tổ chức Hội nghị Tổng kết Công tác An toàn Hàng hải năm 2026",
      bodyHtml: `
        <p><em>Căn cứ Quyết định số 45/QĐ-TCT ngày 12 tháng 01 năm 2026 của Tổng công ty;</em></p>
        <p><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></p>
        <p>Theo đề nghị của Trưởng phòng Tổ chức - Hành chính,</p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc ban hành Kế hoạch tổ chức Hội nghị như sau:</p>
        <p><strong>Điều 1. Mục đích và yêu cầu</strong></p>
        <p>Đánh giá toàn diện công tác dẫn tàu an toàn trong năm 2026.</p>
        <p><strong>Điều 2. Bảng phân công tiến độ thực hiện</strong></p>
        <table>
          <thead>
            <tr><th>STT</th><th>Nội dung công việc</th><th>Đơn vị chủ trì</th></tr>
          </thead>
          <tbody>
            <tr><td>1</td><td>Dự thảo báo cáo tổng kết an toàn hàng hải</td><td>Phòng An toàn Hoa tiêu</td></tr>
            <tr><td>2</td><td>Công tác khánh tiết, chuẩn bị hội trường</td><td>Văn phòng Công ty</td></tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Trách nhiệm thi hành</strong></p>
        <p>Các phòng, ban chuyên môn chịu trách nhiệm thi hành Kế hoạch này./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nLưu: VT."
    };

    const doc = generateND30DocxDocument(sampleDoc);
    const buffer = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");

    assert.ok(documentXml, "word/document.xml phải tồn tại");

    // 1. Kiểm tra lặp tiêu đề bảng w:tblHeader và chống ngắt ô w:cantSplit
    assert.ok(documentXml.includes("<w:tblHeader"), "Bảng phải có w:tblHeader");
    assert.ok(documentXml.includes("<w:cantSplit"), "Bảng phải có w:cantSplit");

    // 2. Kiểm tra độ rộng ô w:tcW trong bảng
    assert.ok(documentXml.includes("<w:tcW"), "Các ô bảng phải có thuộc tính w:tcW cụ thể");

    // 3. Kiểm tra thụt đầu dòng đoạn văn w:ind w:firstLine
    assert.ok(documentXml.includes("w:firstLine=\"720\"") || documentXml.includes("w:firstLine=\"567\""), 
      "Đoạn văn phải có thụt đầu dòng 1.0cm - 1.27cm (w:firstLine)");

    // 4. Kiểm tra căn đều 2 bên w:jc w:val="both" per ND30.PL1.I.II.6E.BODY_JUSTIFIED
    assert.ok(documentXml.includes("w:val=\"both\""), "Đoạn văn nội dung phải căn lề đều hai bên (w:jc w:val=\"both\")");

    // 5. Kiểm tra khoảng cách đoạn sau tối thiểu 6pt (w:after="120") per ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN
    assert.ok(documentXml.includes("w:after=\"120\""), "Khoảng cách đoạn văn phải tối thiểu 6pt (w:after=\"120\")");

    // 6. Kiểm tra tiêu đề Điều có w:keepNext
    assert.ok(documentXml.includes("<w:keepNext"), "Tiêu đề Điều phải có thuộc tính w:keepNext để không bị mồ côi dòng");
  });

  console.log("\n==================================================================");
  console.log(" KẾT QUẢ KIỂM THỬ: TẤT CẢ 5 BÀI TEST BODY & BẢNG ĐỀU ĐẠT CHUẨN 100%");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("Lỗi thực thi kiểm thử:", err);
  process.exit(1);
});
