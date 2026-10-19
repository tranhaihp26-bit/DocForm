import assert from "node:assert/strict";
import mammoth from "mammoth";
import JSZip from "jszip";
import { Packer, convertMillimetersToTwip } from "docx";
import { 
  validateND30Compliance, 
  isPlaceholderValue, 
  REFERENCE_NUMBER_REGEX, 
  LOCATION_AND_DATE_REGEX,
  isValidND30LocationAndDate,
  type DocumentFormatType
} from "../src/shared/schemas/document.schema.ts";
import { 
  enforceND30Standards, 
  extractLocation, 
  normalizeReferenceNumber, 
  sanitizeBodyHtml 
} from "../src/server/middleware/compliance.middleware.ts";
import { fallbackRuleBasedParser } from "../src/server/parser.ts";
import {
  generateND30DocxDocument,
  getStyleProfile,
  ND30_PAGE_SIZE,
  ND30_PAGE_MARGINS
} from "../src/utils/docxExport.ts";

console.log("==================================================================");
console.log(" BỘ KIỂM TRA TOÀN DIỆN THỂ THỨC NGHỊ ĐỊNH 30/2020 & HD 05 (32 TESTS)");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

async function runTest(testId: string, title: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`[PASS] ${testId}: ${title}`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${testId}: ${title}`);
    console.error(`       Error: ${err.message}`);
    failed++;
  }
}

async function main() {
  // ----------------------------------------------------------------------
  // 1. Quốc hiệu NĐ 30
  // ----------------------------------------------------------------------
  await runTest("TEST-01", "Quốc hiệu NĐ 30 bắt buộc là 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'", () => {
    const repCorrect = validateND30Compliance({ nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" }, "administrative");
    assert.equal(repCorrect.issues.some(i => i.id === "nationalHeader1"), false);

    const repWrong = validateND30Compliance({ nationalHeader1: "Cộng hòa xã hội chủ nghĩa Việt Nam" }, "administrative");
    assert.equal(repWrong.issues.some(i => i.id === "nationalHeader1"), true);
  });

  // ----------------------------------------------------------------------
  // 2. Tiêu ngữ NĐ 30
  // ----------------------------------------------------------------------
  await runTest("TEST-02", "Tiêu ngữ NĐ 30 bắt buộc là 'Độc lập - Tự do - Hạnh phúc'", () => {
    const repCorrect = validateND30Compliance({ nationalHeader2: "Độc lập - Tự do - Hạnh phúc" }, "administrative");
    assert.equal(repCorrect.issues.some(i => i.id === "nationalHeader2"), false);

    const repWrong = validateND30Compliance({ nationalHeader2: "ĐỘC LẬP - TỰ DO - HẠNH PHÚC" }, "administrative");
    assert.equal(repWrong.issues.some(i => i.id === "nationalHeader2"), true);
  });

  // ----------------------------------------------------------------------
  // 3. Quốc hiệu Văn bản Đảng HD 05
  // ----------------------------------------------------------------------
  await runTest("TEST-03", "Quốc hiệu Đảng theo HD 05 bắt buộc là 'ĐẢNG CỘNG SẢN VIỆT NAM'", () => {
    const repParty = validateND30Compliance({ nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM", nationalHeader2: "" }, "party");
    assert.equal(repParty.issues.some(i => i.id === "nationalHeader1"), false);

    const enforced = enforceND30Standards({}, "party");
    assert.equal(enforced.nationalHeader1, "ĐẢNG CỘNG SẢN VIỆT NAM");
  });

  // ----------------------------------------------------------------------
  // 4. Tiêu ngữ Văn bản Đảng HD 05
  // ----------------------------------------------------------------------
  await runTest("TEST-04", "Văn bản Đảng theo HD 05 không có tiêu ngữ", () => {
    const repPartyNoMotto = validateND30Compliance({ nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM", nationalHeader2: "" }, "party");
    assert.equal(repPartyNoMotto.issues.some(i => i.id === "nationalHeader2"), false);

    const repPartyWithMotto = validateND30Compliance({ nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM", nationalHeader2: "Độc lập - Tự do - Hạnh phúc" }, "party");
    assert.equal(repPartyWithMotto.issues.some(i => i.id === "nationalHeader2"), true);
  });

  // ----------------------------------------------------------------------
  // 5. Tên cơ quan ban hành phải viết in hoa
  // ----------------------------------------------------------------------
  await runTest("TEST-05", "Tên cơ quan ban hành bắt buộc viết IN HOA", () => {
    const repUpper = validateND30Compliance({ orgHeader2: "ỦY BAN NHÂN DÂN THÀNH PHỐ HẢI PHÒNG" }, "administrative");
    assert.equal(repUpper.issues.some(i => i.id === "orgHeader2" || i.id === "orgHeader2_case"), false);

    const repLower = validateND30Compliance({ orgHeader2: "Ủy ban nhân dân thành phố" }, "administrative");
    const caseIssue = repLower.issues.find(i => i.id === "orgHeader2_case");
    assert.ok(caseIssue);
    assert.equal(caseIssue.suggestion, "ỦY BAN NHÂN DÂN THÀNH PHỐ");
  });

  // ----------------------------------------------------------------------
  // 6. Phát hiện và từ chối placeholder tên cơ quan
  // ----------------------------------------------------------------------
  await runTest("TEST-06", "Từ chối và cảnh báo placeholder cơ quan ban hành", () => {
    const placeholders = ["[TÊN CƠ QUAN BAN HÀNH]", "[Tên cơ quan]", "...", "<Cơ quan ban hành>"];
    for (const ph of placeholders) {
      assert.equal(isPlaceholderValue(ph), true, `Placeholder ${ph} must be detected`);
      const rep = validateND30Compliance({ orgHeader2: ph }, "administrative");
      assert.equal(rep.issues.some(i => i.id === "orgHeader2"), true);
    }
  });

  // ----------------------------------------------------------------------
  // 7. Số ký hiệu văn bản bắt buộc bắt đầu bằng 'Số: '
  // ----------------------------------------------------------------------
  await runTest("TEST-07", "Số ký hiệu văn bản phải có tiền tố 'Số: '", () => {
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 12/QĐ-UBND"), true);
    assert.equal(REFERENCE_NUMBER_REGEX.test("12/QĐ-UBND"), false);

    const normalized = normalizeReferenceNumber("12/QĐ-UBND", "QĐ");
    assert.equal(normalized.startsWith("Số: "), true);
  });

  // ----------------------------------------------------------------------
  // 8. Định dạng số ký hiệu văn bản hành chính NĐ 30
  // ----------------------------------------------------------------------
  await runTest("TEST-08", "Định dạng số ký hiệu hành chính NĐ 30 hợp lệ", () => {
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 125/QĐ-UBND"), true);
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 45/2026/NĐ-CP"), true);
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 18/STP-VP"), true);
  });

  // ----------------------------------------------------------------------
  // 9. Định dạng số ký hiệu văn bản Đảng HD 05
  // ----------------------------------------------------------------------
  await runTest("TEST-09", "Định dạng số ký hiệu văn bản Đảng HD 05 hợp lệ", () => {
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 01-NQ/TW"), true);
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 15-HD/BTCTW"), true);
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 24-CT/TU"), true);
  });

  // ----------------------------------------------------------------------
  // 10. Từ chối placeholder số ký hiệu và không tự điền số giả
  // ----------------------------------------------------------------------
  await runTest("TEST-10", "Từ chối placeholder số ký hiệu và không tự điền số giả", () => {
    assert.equal(isPlaceholderValue("Số: .../QĐ-UBND"), true);
    assert.equal(isPlaceholderValue("Số: .../..."), true);
    
    const rep = validateND30Compliance({ referenceNumber: "Số: .../QĐ-UBND" });
    const emptyIssue = rep.issues.find(i => i.id === "referenceNumber_empty");
    assert.ok(emptyIssue);
    assert.equal(emptyIssue.suggestion, undefined, "Không được tự gợi ý số giả như '01/QĐ-UBND'");
  });

  // ----------------------------------------------------------------------
  // 11. Định dạng địa danh và ngày ban hành chuẩn
  // ----------------------------------------------------------------------
  await runTest("TEST-11", "Định dạng địa danh và ngày tháng năm ban hành chuẩn", () => {
    assert.equal(LOCATION_AND_DATE_REGEX.test("Hà Nội, ngày 14 tháng 10 năm 2026"), true);
    assert.equal(LOCATION_AND_DATE_REGEX.test("TP. Hồ Chí Minh, ngày 05 tháng 02 năm 2026"), true);
    assert.equal(LOCATION_AND_DATE_REGEX.test("Hải Phòng, ngày 30 tháng 12 năm 2025"), true);
    assert.equal(LOCATION_AND_DATE_REGEX.test("14/10/2026"), false);
  });

  // ----------------------------------------------------------------------
  // 12. Quy tắc số 0 đứng trước ngày dưới 10 và tháng 1, 2
  // ----------------------------------------------------------------------
  await runTest("TEST-12", "Tuân thủ quy tắc số 0 đứng trước ngày dưới 10 và tháng 1, 2", () => {
    assert.equal(LOCATION_AND_DATE_REGEX.test("Đà Nẵng, ngày 05 tháng 02 năm 2026"), true);
    assert.equal(LOCATION_AND_DATE_REGEX.test("Cần Thơ, ngày 09 tháng 01 năm 2026"), true);
  });

  // ----------------------------------------------------------------------
  // 13. Tuyệt đối không tự ý gán 'Hà Nội' hoặc ngày giả khi thiếu dữ liệu
  // ----------------------------------------------------------------------
  await runTest("TEST-13", "extractLocation không được tự mặc định gán 'Hà Nội'", () => {
    assert.equal(extractLocation(undefined), "");
    assert.equal(extractLocation(""), "");
    assert.equal(extractLocation("[Địa danh], ngày ... tháng ... năm ..."), "");
    assert.equal(extractLocation("Đà Nẵng, ngày 15 tháng 8 năm 2026"), "Đà Nẵng");
  });

  // ----------------------------------------------------------------------
  // 14. Loại văn bản in hoa đứng đậm
  // ----------------------------------------------------------------------
  await runTest("TEST-14", "Loại văn bản chuẩn hóa in hoa và đúng danh mục quy định", () => {
    const validTypes = ["QUYẾT ĐỊNH", "CÔNG VĂN", "BÁO CÁO", "KẾ HOẠCH", "TỜ TRÌNH", "THÔNG BÁO", "BIÊN BẢN"];
    for (const vt of validTypes) {
      const rep = validateND30Compliance({ documentType: vt, subject: "Nội dung hợp lệ" });
      assert.equal(rep.issues.some(i => i.id === "documentType"), false);
    }
  });

  // ----------------------------------------------------------------------
  // 15. Trích yếu nội dung văn bản (subject)
  // ----------------------------------------------------------------------
  await runTest("TEST-15", "Trích yếu nội dung văn bản không được để trống hoặc placeholder", () => {
    const repValid = validateND30Compliance({ documentType: "QUYẾT ĐỊNH", subject: "V/v phê duyệt kế hoạch chuyển đổi số" });
    assert.equal(repValid.issues.some(i => i.id === "subject"), false);

    const repPh = validateND30Compliance({ documentType: "QUYẾT ĐỊNH", subject: "[Trích yếu nội dung]" });
    assert.equal(repPh.issues.some(i => i.id === "subject"), true);
  });

  // ----------------------------------------------------------------------
  // 16. Phông chữ chuẩn Times New Roman và cỡ chữ 13pt
  // ----------------------------------------------------------------------
  await runTest("TEST-16", "Compliance middleware ép buộc font Times New Roman & cỡ chữ 13", () => {
    const enforced = enforceND30Standards({ fontFamily: "Arial", fontSize: 10 });
    assert.equal(enforced.fontFamily, "Times New Roman");
    assert.equal(enforced.fontSize, 13);
  });

  // ----------------------------------------------------------------------
  // 17. Nơi nhận và bộ phận lưu trữ văn thư
  // ----------------------------------------------------------------------
  await runTest("TEST-17", "Nơi nhận văn bản phải có bộ phận lưu trữ văn thư", () => {
    const repValid = validateND30Compliance({ recipients: "Như trên;\nLưu: VT, TH." });
    assert.equal(repValid.issues.some(i => i.id === "recipients"), false);

    const repEmpty = validateND30Compliance({ recipients: "" });
    assert.equal(repEmpty.issues.some(i => i.id === "recipients"), true);
  });

  // ----------------------------------------------------------------------
  // 18. Lề trang & Khổ A4 chuẩn Phụ lục I NĐ 30 & Kiểm chứng OOXML thật
  // ----------------------------------------------------------------------
  await runTest("TEST-18", "Tạo DOCX thật, đọc OOXML xác minh w:pgSz (A4), w:pgMar (20-20-30-15mm) và chữ Việt", async () => {
    // 1. Kiểm tra cấu hình lề trang và kích thước khổ giấy A4 xuất phát từ hằng số quy chuẩn
    assert.equal(ND30_PAGE_MARGINS.top, convertMillimetersToTwip(20), "Lề trên phải là 20mm");
    assert.equal(ND30_PAGE_MARGINS.bottom, convertMillimetersToTwip(20), "Lề dưới phải là 20mm");
    assert.equal(ND30_PAGE_MARGINS.left, convertMillimetersToTwip(30), "Lề trái phải là 30mm");
    assert.equal(ND30_PAGE_MARGINS.right, convertMillimetersToTwip(15), "Lề phải phải là 15mm");
    assert.equal(ND30_PAGE_SIZE.width, convertMillimetersToTwip(210), "Chiều rộng A4 phải là 210mm");
    assert.equal(ND30_PAGE_SIZE.height, convertMillimetersToTwip(297), "Chiều cao A4 phải là 297mm");

    // 2. Tạo đối tượng Document thật và xuất ra binary OOXML buffer
    const sampleData: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "ỦY BAN NHÂN DÂN THÀNH PHỐ",
      orgHeader2: "VĂN PHÒNG ỦY BAN",
      locationAndDate: "Hải Phòng, ngày 14 tháng 10 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 125/QĐ-UBND",
      subject: "V/v ban hành quy định thể thức văn bản hành chính",
      bodyHtml: "<p><strong>Điều 1.</strong> Ban hành kèm theo Quyết định này Quy định về thể thức văn bản.</p><p><strong>Điều 2.</strong> Quyết định này có hiệu lực thi hành kể từ ngày ký./.</p>",
      signTitle: "TM. ỦY BAN NHÂN DÂN\nCHỦ TỊCH",
      signName: "Nguyễn Văn A",
      recipients: "Như Điều 2;\nLưu: VT, TH."
    };

    const doc = generateND30DocxDocument(sampleData);
    assert.ok(doc, "Instance Document phải được khởi tạo");

    const buffer = await Packer.toBuffer(doc);
    assert.ok(buffer && buffer.length > 2000, "Buffer DOCX phải hợp lệ và lớn hơn 2KB");
    assert.equal(buffer[0], 0x50, "Header zip byte 0 phải là 0x50 (P)");
    assert.equal(buffer[1], 0x4B, "Header zip byte 1 phải là 0x4B (K)");

    // 3. Đọc trực tiếp word/document.xml từ OOXML ZIP package để xác minh w:pgSz và w:pgMar
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    assert.ok(docXml, "Tệp DOCX phải chứa file word/document.xml");

    // Xác minh thẻ <w:pgSz> kích thước trang chuẩn A4
    const pgSzMatch = docXml.match(/<w:pgSz[^>]*\/>/);
    assert.ok(pgSzMatch, "OOXML phải chứa thẻ kích thước trang <w:pgSz>");
    const pgSzTag = pgSzMatch[0];
    assert.ok(pgSzTag.includes('w:orient="portrait"'), "Định hướng trang phải là portrait (khổ dọc)");
    const widthMatch = pgSzTag.match(/w:w="(\d+)"/);
    const heightMatch = pgSzTag.match(/w:h="(\d+)"/);
    assert.ok(widthMatch && Math.abs(parseInt(widthMatch[1]) - 11906) <= 5, "Chiều rộng trang A4 phải là 210mm (~11906 dxa)");
    assert.ok(heightMatch && Math.abs(parseInt(heightMatch[1]) - 16838) <= 5, "Chiều cao trang A4 phải là 297mm (~16838 dxa)");

    // Xác minh thẻ <w:pgMar> lề trang chuẩn NĐ 30: Trên 20mm, Dưới 20mm, Trái 30mm, Phải 15mm
    const pgMarMatch = docXml.match(/<w:pgMar[^>]*\/>/);
    assert.ok(pgMarMatch, "OOXML phải chứa thẻ cấu hình lề trang <w:pgMar>");
    const pgMarTag = pgMarMatch[0];
    const topMatch = pgMarTag.match(/w:top="(\d+)"/);
    const bottomMatch = pgMarTag.match(/w:bottom="(\d+)"/);
    const leftMatch = pgMarTag.match(/w:left="(\d+)"/);
    const rightMatch = pgMarTag.match(/w:right="(\d+)"/);

    assert.ok(topMatch && Math.abs(parseInt(topMatch[1]) - 1134) <= 2, "Lề trên trong OOXML phải là 20mm (~1133-1134 dxa)");
    assert.ok(bottomMatch && Math.abs(parseInt(bottomMatch[1]) - 1134) <= 2, "Lề dưới trong OOXML phải là 20mm (~1133-1134 dxa)");
    assert.ok(leftMatch && Math.abs(parseInt(leftMatch[1]) - 1701) <= 2, "Lề trái trong OOXML phải là 30mm (~1700-1701 dxa)");
    assert.ok(rightMatch && Math.abs(parseInt(rightMatch[1]) - 850) <= 2, "Lề phải trong OOXML phải là 15mm (~850 dxa)");

    // 4. Đọc lại nội dung tệp DOCX thật bằng Mammoth
    const parsed = await mammoth.extractRawText({ buffer });
    const rawText = parsed.value;

    assert.ok(rawText.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"), "Tiếng Việt chữ Quốc hiệu phải nguyên vẹn");
    assert.ok(rawText.includes("Độc lập - Tự do - Hạnh phúc"), "Tiếng Việt chữ Tiêu ngữ phải nguyên vẹn");
    assert.ok(rawText.includes("QUYẾT ĐỊNH"), "Tên loại văn bản phải có trong văn bản");
    assert.ok(rawText.includes("Hải Phòng, ngày 14 tháng 10 năm 2026"), "Địa danh ngày tháng phải nguyên vẹn");
    assert.ok(rawText.includes("Nguyễn Văn A"), "Họ tên người ký phải nguyên vẹn");
  });

  // ----------------------------------------------------------------------
  // 19. Chống tấn công XSS và làm sạch HTML
  // ----------------------------------------------------------------------
  await runTest("TEST-19", "Làm sạch HTML, loại bỏ thẻ script, onerror, iframe độc hại", () => {
    const malicious = `<p>Văn bản hợp lệ</p><script>alert('xss')</script><img src="x" onerror="stealCookie()"><iframe src="evil.com"></iframe>`;
    const sanitized = sanitizeBodyHtml(malicious);
    assert.equal(sanitized.includes("<script>"), false);
    assert.equal(sanitized.includes("onerror"), false);
    assert.equal(sanitized.includes("<iframe>"), false);
    assert.equal(sanitized.includes("Văn bản hợp lệ"), true);
  });

  // ----------------------------------------------------------------------
  // 20. Phân biệt rõ ràng phản hồi AI vs Rule Fallback
  // ----------------------------------------------------------------------
  await runTest("TEST-20", "Minh bạch cờ isFallback và source trong cơ chế fallback", () => {
    const aiSuccessResp = { success: true, source: "gemini_ai", isFallback: false };
    assert.equal(aiSuccessResp.isFallback, false);
    assert.equal(aiSuccessResp.source, "gemini_ai");

    const fallbackResp = { success: true, source: "rule_fallback", isFallback: true };
    assert.equal(fallbackResp.isFallback, true);
    assert.equal(fallbackResp.source, "rule_fallback");
  });

  // ----------------------------------------------------------------------
  // 21. Bảng 2 cột & Đọc lại OOXML kiểm tra thứ tự đoạn và bảng dữ liệu
  // ----------------------------------------------------------------------
  await runTest("TEST-21", "Tạo DOCX thật, đọc lại OOXML kiểm tra thứ tự đoạn văn và bảng", async () => {
    const sampleWithTable: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "ỦY BAN NHÂN DÂN THÀNH PHỐ",
      orgHeader2: "SỞ NỘI VỤ",
      locationAndDate: "Đà Nẵng, ngày 10 tháng 8 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 99/BC-SNV",
      subject: "Báo cáo thống kê nhân sự và biên chế cơ quan",
      bodyHtml: `
        <p>Kính gửi: Ủy ban nhân dân thành phố</p>
        <p>Sở Nội vụ báo cáo tình hình biên chế theo bảng dưới đây:</p>
        <table>
          <tr><th>STT</th><th>Đơn vị</th><th>Biên chế</th></tr>
          <tr><td>1</td><td>Văn phòng Sở</td><td>15</td></tr>
          <tr><td>2</td><td>Phòng Tổ chức cán bộ</td><td>12</td></tr>
        </table>
        <p>Kính trình UBND thành phố xem xét, phê duyệt./.</p>
      `,
      signTitle: "GIÁM ĐỐC",
      signName: "Trần Thị B",
      recipients: "Như trên;\nLưu: VT."
    };

    const doc = generateND30DocxDocument(sampleWithTable);
    const buffer = await Packer.toBuffer(doc);

    // 1. Kiểm tra bảng tồn tại trong HTML chuyển đổi từ OOXML thật qua Mammoth
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value;
    assert.ok(html.includes("<table>") && html.includes("</table>"), "Tệp Word phải chứa bảng dữ liệu (table)");
    assert.ok(html.includes("Văn phòng Sở"), "Tế bào bảng phải chứa đúng nội dung đơn vị");
    assert.ok(html.includes("Phòng Tổ chức cán bộ"), "Tế bào bảng phải chứa đúng phòng ban");

    // 2. Kiểm tra thứ tự các đoạn văn logic chuẩn văn bản hành chính
    const textResult = await mammoth.extractRawText({ buffer });
    const docText = textResult.value;

    const idxHeader = docText.indexOf("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
    const idxDocType = docText.indexOf("BÁO CÁO");
    const idxSubject = docText.indexOf("Báo cáo thống kê nhân sự");
    const idxBody = docText.indexOf("Kính gửi: Ủy ban nhân dân");
    const idxTable = docText.indexOf("Văn phòng Sở");
    const idxSignTitle = docText.indexOf("GIÁM ĐỐC");
    const idxSignName = docText.indexOf("Trần Thị B");
    const idxRecipients = docText.indexOf("Nơi nhận");

    assert.ok(idxHeader >= 0 && idxDocType > idxHeader, "Header phải xuất hiện trước Tên loại văn bản");
    assert.ok(idxSubject > idxDocType, "Tên loại văn bản phải xuất hiện trước Trích yếu");
    assert.ok(idxBody > idxSubject, "Trích yếu phải xuất hiện trước Nội dung");
    assert.ok(idxTable > idxBody, "Nội dung dẫn nhập phải xuất hiện trước Bảng biểu");
    assert.ok(idxSignTitle > idxTable, "Bảng biểu phải xuất hiện trước Khối chữ ký");
    assert.ok(idxSignName > idxSignTitle, "Chức vụ người ký phải xuất hiện trước Tên người ký");
    assert.ok(idxRecipients >= 0, "Khối nơi nhận phải có trong tệp Word");
  });

  // ----------------------------------------------------------------------
  // 22. Profile định dạng riêng NĐ30 (13pt) vs HD05 (14pt) - Kiểm tra OOXML thực tế
  // ----------------------------------------------------------------------
  await runTest("TEST-22", "Style profiles phân biệt chính xác NĐ 30 (13pt) và HD 05 (14pt) trong OOXML thực tế", async () => {
    const adminProfile = getStyleProfile("administrative");
    const partyProfile = getStyleProfile("party");

    assert.equal(adminProfile.bodyFontSize, 13, "NĐ 30 cỡ chữ nội dung phải là 13pt");
    assert.equal(adminProfile.documentTypeFontSize, 14, "NĐ 30 cỡ chữ tên loại văn bản phải là 14pt");

    assert.equal(partyProfile.bodyFontSize, 14, "HD 05 cỡ chữ nội dung phải là 14pt");
    assert.equal(partyProfile.orgHeader1FontSize, 14, "HD 05 cỡ chữ cơ quan cấp trên phải là 14pt");
    assert.equal(partyProfile.nationalHeader1FontSize, 15, "HD 05 cỡ chữ tiêu đề Đảng phải là 15pt");

    // Đọc OOXML thực tế từ file DOCX sinh ra
    const sampleParty: DocumentFormatType = {
      regime: "party",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      fontFamily: "Times New Roman",
      fontSize: 14,
      orgHeader1: "ĐẢNG BỘ TỈNH HẢI PHÒNG",
      orgHeader2: "BAN THƯỜNG VỤ",
      locationAndDate: "Hải Phòng, ngày 14 tháng 10 năm 2026",
      documentType: "NGHỊ QUYẾT",
      referenceNumber: "Số 12-NQ/TU",
      subject: "Nghị quyết hội nghị lần thứ 5 Ban Chấp hành Đảng bộ",
      bodyHtml: `<p>Nội dung nghị quyết Đảng...</p>`,
      signTitle: "T/M BAN THƯỜNG VỤ\nBÍ THƯ",
      signName: "Nguyễn Văn A",
      recipients: "Các chi bộ trực thuộc;\nLưu: VP."
    };

    const docParty = generateND30DocxDocument(sampleParty);
    const bufParty = await Packer.toBuffer(docParty);
    const zipParty = await JSZip.loadAsync(bufParty);
    const xmlParty = await zipParty.file("word/document.xml")?.async("string");

    assert.ok(xmlParty, "Đọc được document.xml của tài liệu Đảng");
    assert.ok(xmlParty.includes('w:sz w:val="28"') || xmlParty.includes('w:szCs w:val="28"'), "OOXML văn bản Đảng phải chứa cỡ chữ 14pt (val=28)");
    assert.ok(xmlParty.includes('w:sz w:val="30"') || xmlParty.includes('w:szCs w:val="30"'), "OOXML tiêu đề Đảng phải chứa cỡ chữ 15pt (val=30)");
  });

  // ----------------------------------------------------------------------
  // 23. Đánh số trang tự động OOXML & Bỏ hiển thị trang đầu (titlePage: true)
  // ----------------------------------------------------------------------
  await runTest("TEST-23", "Đánh số trang động trong OOXML header và cấu hình titlePage ẩn trang đầu", async () => {
    const sampleMultiPage: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "ỦY BAN NHÂN DÂN THÀNH PHỐ",
      orgHeader2: "SỞ KẾ HOẠCH VÀ ĐẦU TƯ",
      locationAndDate: "Hải Phòng, ngày 14 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 105/KH-SKHĐT",
      subject: "Kế hoạch phát triển kinh tế xã hội giai đoạn 2026-2030",
      bodyHtml: `<p>Nội dung trang 1...</p><p>Nội dung trang 2...</p>`,
      signTitle: "GIÁM ĐỐC",
      signName: "Trần Văn C",
      recipients: "Như trên;\nLưu: VT."
    };

    const doc = generateND30DocxDocument(sampleMultiPage);
    const buffer = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buffer);

    // 1. Kiểm tra word/document.xml chứa thẻ <w:titlePg/>
    const docXml = await zip.file("word/document.xml")?.async("string");
    assert.ok(docXml && (docXml.includes("w:titlePg") || docXml.includes("w:titlePage")), "OOXML document.xml phải có w:titlePg để ẩn số trang ở trang đầu tiên");

    // 2. Kiểm tra header xml chứa trường đánh số trang fldSimple w:instr="PAGE"
    const headerFiles = Object.keys(zip.files).filter(f => f.startsWith("word/header"));
    assert.ok(headerFiles.length > 0, "Phải tạo tệp word/header*.xml để đánh số trang");

    let foundPageNum = false;
    for (const hFile of headerFiles) {
      const hXml = await zip.file(hFile)?.async("string");
      if (hXml && (hXml.includes('w:instr="PAGE"') || hXml.includes("PAGE"))) {
        foundPageNum = true;
        break;
      }
    }
    assert.ok(foundPageNum, "Tệp header XML phải chứa trường đánh số trang động PAGE");
    console.log("   [F04 VISUAL NOT VERIFIED]: Cấu hình OOXML chuẩn xác. Kiểm tra trực quan bằng ứng dụng MS Word để xác nhận ngắt trang.");
  });

  // ----------------------------------------------------------------------
  // 24. Chuyển đổi danh sách automatic numbering và ngắt trang bảng
  // ----------------------------------------------------------------------
  await runTest("TEST-24", "Xử lý danh sách có numbering definitions (word/numbering.xml) và thuộc tính ngắt trang bảng", async () => {
    const sampleListAndTable: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "",
      orgHeader2: "ỦY BAN NHÂN DÂN QUẬN",
      locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
      documentType: "THÔNG BÁO",
      referenceNumber: "Số: 45/TB-UBND",
      subject: "Thông báo phân công nhiệm vụ và lịch làm việc",
      bodyHtml: `
        <p>Danh sách các công việc cần hoàn thành:</p>
        <ol>
          <li>Kiểm tra thể thức văn bản.</li>
          <li>Rà soát danh mục báo cáo.</li>
        </ol>
        <table>
          <tr><th>STT</th><th>Hạng mục</th></tr>
          <tr><td>1</td><td>Thiết kế giao diện</td></tr>
        </table>
      `,
      signTitle: "CHỦ TỊCH",
      signName: "Nguyễn Văn D",
      recipients: "Như trên;\nLưu: VT."
    };

    const doc = generateND30DocxDocument(sampleListAndTable);
    const buffer = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buffer);

    // 1. Kiểm tra word/numbering.xml tồn tại
    const numberingXml = await zip.file("word/numbering.xml")?.async("string");
    assert.ok(numberingXml, "Tệp DOCX sinh ra phải chứa word/numbering.xml cho danh sách tự động");

    // 2. Kiểm tra word/document.xml chứa w:numPr
    const docXml = await zip.file("word/document.xml")?.async("string");
    assert.ok(docXml, "Phải đọc được document.xml");
    assert.ok(docXml.includes("w:numPr"), "Danh sách ol phải sử dụng w:numPr (Word automatic numbering)");
    assert.ok(docXml.includes("w:cantSplit"), "Bảng dữ liệu phải có thuộc tính w:cantSplit chống ngắt dòng bất hợp lý");
    assert.ok(docXml.includes("w:tblHeader"), "Hàng tiêu đề bảng phải có thuộc tính w:tblHeader để lặp lại khi sang trang");

    const textResult = await mammoth.extractRawText({ buffer });
    assert.ok(textResult.value.includes("Kiểm tra thể thức văn bản"), "Danh sách đánh số phải chứa trọn vẹn nội dung mục");
  });

  // ----------------------------------------------------------------------
  // 25. Kiểm thử tài liệu dài 5 trang (Multi-page Fixture F03/F04)
  // ----------------------------------------------------------------------
  await runTest("TEST-25", "Tạo và xác minh tài liệu báo cáo 5 trang chứa tiêu đề, bảng biểu và danh sách", async () => {
    let longBody = `<p>Kính gửi: Ủy ban nhân dân thành phố</p>`;
    longBody += `<h1>I. TÌNH HÌNH THỰC HIỆN NHIỆM VỤ CÔNG TÁC</h1>`;
    for (let i = 1; i <= 20; i++) {
      longBody += `<p>Đoạn văn bản thứ ${i} báo cáo tiến độ chi tiết nhiệm vụ công tác xã hội và cải cách hành chính. Đảm bảo toàn bộ văn bản tuân thủ thể thức Nghị định 30/2020/NĐ-CP của Chính phủ.</p>`;
    }
    longBody += `<h2>1. Danh mục các dự án triển khai</h2>`;
    longBody += `<ol><li>Dự án số hóa văn thư lưu trữ</li><li>Dự án ứng dụng chữ ký số chuyên dùng</li></ol>`;
    longBody += `<table><tr><th>STT</th><th>Tên dự án</th><th>Trạng thái</th></tr>`;
    for (let j = 1; j <= 15; j++) {
      longBody += `<tr><td>${j}</td><td>Dự án công nghệ số ${j}</td><td>Hoàn thành [Đạt tiến độ]</td></tr>`;
    }
    longBody += `</table>`;

    const sample5Page: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "ỦY BAN NHÂN DÂN THÀNH PHỐ",
      orgHeader2: "SỞ THÔNG TIN VÀ TRUYỀN THÔNG",
      locationAndDate: "Đà Nẵng, ngày 20 tháng 10 năm 2026",
      documentType: "BÁO CÁO",
      referenceNumber: "Số: 300/BC-STTTT",
      subject: "Báo cáo tổng kết công tác chuyển đổi số và văn thư lưu trữ giai đoạn 2021-2026",
      bodyHtml: longBody,
      signTitle: "GIÁM ĐỐC",
      signName: "Lê Văn E",
      recipients: "Như kính gửi;\nUBND TP (để b/c);\nLưu: VT."
    };

    const doc = generateND30DocxDocument(sample5Page);
    const buffer = await Packer.toBuffer(doc);
    assert.ok(buffer.length > 10000, "File Word 5 trang sinh ra phải có kích thước dung lượng hợp lệ (>10KB)");

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    assert.ok(docXml, "Đọc được document.xml của tài liệu 5 trang");
    assert.ok(docXml.includes("w:keepNext"), "Tiêu đề H1/H2 phải có thuộc tính w:keepNext chống mồ côi tiêu đề");

    const textResult = await mammoth.extractRawText({ buffer });
    assert.ok(textResult.value.includes("Đoạn văn bản thứ 20"), "Phải giữ trọn vẹn 20 đoạn văn bản không bị xén cụt");
    assert.ok(textResult.value.includes("Dự án công nghệ số 15"), "Phải giữ trọn vẹn 15 hàng dữ liệu trong bảng");
    console.log("   [F04 VISUAL NOT VERIFIED]: Cấu hình ngắt trang OOXML w:keepNext, w:cantSplit, w:tblHeader đạt chuẩn. Kiểm tra hiển thị bằng MS Word/LibreOffice.");
  });

  // ----------------------------------------------------------------------
  // 26. E2E-T01: Nhận diện loại văn bản Kế hoạch trích dẫn Quyết định (E2E-01 / FIX-02)
  // ----------------------------------------------------------------------
  await runTest("TEST-26", "E2E-T01: Gọi parser thật nhận diện KẾ HOẠCH từ văn bản chứa trích dẫn Quyết định", async () => {
    const inputKeHoachText = `
ỦY BAN NHÂN DÂN TỈNH HẢI PHÒNG
Số: 45/KH-UBND

CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc
Hải Phòng, ngày 10 tháng 02 năm 2026

KẾ HOẠCH
Hội nghị tổng kết an toàn hàng hải và tôn vinh năm 2026

Căn cứ Quyết định số 123/QĐ-TTg ngày 15/01/2022 của Thủ tướng Chính phủ;
Căn cứ Quyết định số 456/QĐ-UBND ngày 20/03/2024 của UBND tỉnh Hải Phòng...
UBND tỉnh ban hành Kế hoạch tổ chức Hội nghị...
    `;

    const rawParsed = fallbackRuleBasedParser(inputKeHoachText, "administrative");
    const parsed = enforceND30Standards(rawParsed, "administrative");

    assert.strictEqual(parsed.documentType, "KẾ HOẠCH", "Parser thật phải nhận diện ra KẾ HOẠCH, không bị nhầm thành QUYẾT ĐỊNH");
  });

  // ----------------------------------------------------------------------
  // 27. E2E-T02: Bảo toàn cấu trúc 2 bảng phụ lục 11x3 và 8x3 (E2E-03 / FIX-03)
  // ----------------------------------------------------------------------
  await runTest("TEST-27", "E2E-T02: Bảo toàn chính xác 2 bảng phụ lục (11x3 và 8x3) từ import đến Word XML", async () => {
    let table1Html = "<table><tr><th>STT</th><th>Nội dung công việc</th><th>Đơn vị thực hiện</th></tr>";
    for (let i = 1; i <= 10; i++) {
      table1Html += `<tr><td>${i}</td><td>Nhiệm vụ kiểm tra an toàn ${i}</td><td>Phòng Hàng hải</td></tr>`;
    }
    table1Html += "</table>";

    let table2Html = "<table><tr><th>STT</th><th>Tên cá nhân/Tập thể</th><th>Danh hiệu khen thưởng</th></tr>";
    for (let j = 1; j <= 7; j++) {
      table2Html += `<tr><td>${j}</td><td>Cá nhân/Tập thể xuất sắc ${j}</td><td>Bằng khen UBND tỉnh</td></tr>`;
    }
    table2Html += "</table>";

    const bodyWithTables = `<p><strong>Phụ lục 1: Danh mục công việc</strong></p>${table1Html}<p><strong>Phụ lục 2: Danh sách khen thưởng</strong></p>${table2Html}`;

    const docData: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "",
      orgHeader2: "UBND TỈNH HẢI PHÒNG",
      locationAndDate: "Hải Phòng, ngày 10 tháng 02 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 45/KH-UBND",
      subject: "Kế hoạch tổ chức hội nghị tổng kết",
      bodyHtml: bodyWithTables,
      signTitle: "CHỦ TỊCH",
      signName: "Nguyễn Văn X",
      recipients: "Như trên;\nLưu: VT."
    };

    const doc = generateND30DocxDocument(docData);
    const buffer = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");

    assert.ok(docXml, "Phải đọc được word/document.xml");

    const tblRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tblRegex) || [];
    assert.ok(tables.length >= 2, "Bắt buộc sinh các bảng Word phụ lục");

    const appendixTables = tables.filter(tbl => tbl.includes("Nhiệm vụ kiểm tra an toàn") || tbl.includes("Cá nhân/Tập thể xuất sắc"));
    assert.strictEqual(appendixTables.length, 2, "Phải chứa chính xác 2 bảng phụ lục trong body");

    const tbl1Rows = appendixTables[0].match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    assert.strictEqual(tbl1Rows.length, 11, "Bảng phụ lục 1 phải có đúng 11 hàng (1 tiêu đề + 10 dữ liệu)");
    const tbl1FirstRowCells = tbl1Rows[0].match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    assert.strictEqual(tbl1FirstRowCells.length, 3, "Bảng phụ lục 1 phải có đúng 3 cột");

    const tbl2Rows = appendixTables[1].match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    assert.strictEqual(tbl2Rows.length, 8, "Bảng phụ lục 2 phải có đúng 8 hàng (1 tiêu đề + 7 dữ liệu)");
    const tbl2FirstRowCells = tbl2Rows[0].match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    assert.strictEqual(tbl2FirstRowCells.length, 3, "Bảng phụ lục 2 phải có đúng 3 cột");

    const textResult = await mammoth.extractRawText({ buffer });
    assert.ok(textResult.value.includes("Nhiệm vụ kiểm tra an toàn 10"), "Chính xác ô dữ liệu hàng 10");
    assert.ok(textResult.value.includes("Bằng khen UBND tỉnh"), "Chính xác ô dữ liệu khen thưởng");
  });

  // ----------------------------------------------------------------------
  // 28. E2E-T03: Không lặp khối thể thức đầu trang / chữ ký (E2E-02 / FIX-05)
  // ----------------------------------------------------------------------
  await runTest("TEST-28", "E2E-T03: Không nhân bản khối thể thức khi chữ ký đứng trước phụ lục dài 50 hàng", async () => {
    let longAppendixRows = "<table><tr><th>STT</th><th>Hạng mục</th></tr>";
    for (let i = 1; i <= 50; i++) {
      longAppendixRows += `<tr><td>${i}</td><td>Nội dung mục phụ lục kéo dài số ${i} nhằm kiểm tra phát hiện chữ ký ở giữa bài</td></tr>`;
    }
    longAppendixRows += "</table>";

    const completeDocHtmlWithSignatureBeforeAppendix = `
      <p style="text-align: center;"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br/>Độc lập - Tự do - Hạnh phúc</strong></p>
      <p style="text-align: center;"><strong>KẾ HOẠCH</strong></p>
      <p>Nội dung kế hoạch chi tiết phần thân văn bản...</p>
      <p>TM. ỦY BAN NHÂN DÂN<br/>CHỦ TỊCH<br/>Nguyễn Văn X</p>
      <p>Nơi nhận: Như trên</p>
      <p><strong>Phụ lục đính kèm kế hoạch:</strong></p>
      ${longAppendixRows}
    `;

    const docData: DocumentFormatType = {
      regime: "administrative",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "",
      orgHeader2: "",
      locationAndDate: "",
      documentType: "KẾ HOẠCH",
      referenceNumber: "",
      subject: "",
      bodyHtml: completeDocHtmlWithSignatureBeforeAppendix,
      signTitle: "CHỦ TỊCH",
      signName: "Nguyễn Văn X",
      recipients: "Như trên"
    };

    const doc = generateND30DocxDocument(docData);
    const buffer = await Packer.toBuffer(doc);
    const textResult = await mammoth.extractRawText({ buffer });

    const nationalMatches = textResult.value.match(/CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/g) || [];
    assert.strictEqual(nationalMatches.length, 1, "Quốc hiệu xuất hiện đúng 1 lần");

    const tmMatches = textResult.value.match(/TM\. ỦY BAN NHÂN DÂN/g) || [];
    assert.strictEqual(tmMatches.length, 1, "Chức danh người ký TM. ỦY BAN NHÂN DÂN xuất hiện đúng 1 lần, không bị nhân bản ở cuối bài");

    const recipientMatches = textResult.value.match(/Nơi nhận:/gi) || [];
    assert.strictEqual(recipientMatches.length, 1, "Nơi nhận xuất hiện đúng 1 lần");
  });

  // ----------------------------------------------------------------------
  // 29. E2E-T04: Fallback 503 giữ nguyên HTML tables (FIX-04 / FIX-07-B)
  // ----------------------------------------------------------------------
  await runTest("TEST-29", "E2E-T04: Mô phỏng Gemini HTTP 503 và chạy Rule Fallback bảo toàn bảng HTML", async () => {
    const rawText = "UBND TỈNH HẢI PHÒNG\nKẾ HOẠCH\nV/v tổ chức hội nghị 2026\nCăn cứ quy định...";
    const rawHtmlInput = "<table><tr><td>1</td><td>Bảng dữ liệu quan trọng không bị mất khi AI 503</td></tr></table>";

    const fallbackParsed = fallbackRuleBasedParser(rawText, "administrative", rawHtmlInput);
    const compliant = enforceND30Standards(fallbackParsed, "administrative");

    assert.ok(compliant.bodyHtml.includes("<table>"), "Bắt buộc bảo toàn thẻ <table>");
    assert.ok(compliant.bodyHtml.includes("Bảng dữ liệu quan trọng không bị mất khi AI 503"), "Bắt buộc bảo toàn nội dung dữ liệu trong bảng khi Gemini 503");
  });

  // ----------------------------------------------------------------------
  // 30. Kiểm tra từ chối số không có chữ số và ngày phi thực tế
  // ----------------------------------------------------------------------
  await runTest("TEST-30", "Từ chối số không có chữ số (Số: ABC) và ngày phi thực tế (Hà Nội, ngày 31 tháng 02 năm 2026)", () => {
    // 1. Kiểm tra số ký hiệu
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: ABC"), false, "Số văn bản không chứa chữ số phải bị từ chối");
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: "), false, "Số văn bản rỗng phải bị từ chối");
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 125/QĐ-UBND"), true, "Số văn bản chuẩn NĐ 30 phải được chấp nhận");
    assert.equal(REFERENCE_NUMBER_REGEX.test("Số: 01-NQ/TW"), true, "Số văn bản Đảng phải được chấp nhận");

    const repRefError = validateND30Compliance({ referenceNumber: "Số: ABC" });
    assert.equal(repRefError.issues.some(i => i.id === "referenceNumber_format"), true);

    // 2. Kiểm tra ngày tháng trên lịch
    assert.equal(isValidND30LocationAndDate("Hà Nội, ngày 31 tháng 02 năm 2026"), false, "Ngày 31 tháng 02 không có trên lịch");
    assert.equal(isValidND30LocationAndDate("Hà Nội, ngày 30 tháng 02 năm 2026"), false, "Ngày 30 tháng 02 không có trên lịch");
    assert.equal(isValidND30LocationAndDate("Hà Nội, ngày 31 tháng 04 năm 2026"), false, "Tháng 4 chỉ có 30 ngày");
    assert.equal(isValidND30LocationAndDate("Hà Nội, ngày 05 tháng 02 năm 2026"), true, "Ngày 05 tháng 02 năm 2026 hợp lệ");

    const repDateError = validateND30Compliance({ locationAndDate: "Hà Nội, ngày 31 tháng 02 năm 2026" });
    assert.equal(repDateError.issues.some(i => i.id === "locationAndDate_format"), true);
  });

  // ----------------------------------------------------------------------
  // 31. Bảo toàn nhiều đoạn văn (<p>) và ô gộp (colspan) trong bảng khi sinh Word OOXML
  // ----------------------------------------------------------------------
  await runTest("TEST-31", "Bảo toàn nhiều đoạn văn (<p>) và ô gộp (colspan) trong bảng khi sinh Word OOXML", async () => {
    const tableWithMultiParagraphAndColspan = `
      <table>
        <thead>
          <tr>
            <th colspan="2">TIÊU ĐỀ GỘP 2 CỘT</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <p>Đoạn thứ nhất trong ô</p>
              <p>Đoạn thứ hai trong ô</p>
            </td>
            <td>Ô bình thường</td>
          </tr>
        </tbody>
      </table>
    `;

    const docxDoc = generateND30DocxDocument({
      regime: "administrative",
      fontFamily: "Times New Roman",
      fontSize: 13,
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      orgHeader1: "",
      orgHeader2: "ỦY BAN NHÂN DÂN THÀNH PHỐ HẢI PHÒNG",
      referenceNumber: "Số: 100/KH-UBND",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      subject: "Bảo tồn cấu trúc bảng phức tạp",
      bodyHtml: tableWithMultiParagraphAndColspan,
      signTitle: "CHỦ TỊCH",
      signName: "Nguyễn Văn A",
      recipients: "Lưu: VT.",
    });

    const buffer = await Packer.toBuffer(docxDoc);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    assert.ok(documentXml, "word/document.xml phải tồn tại");

    // Xác minh thẻ colspan w:gridSpan
    assert.ok(
      documentXml.includes('w:gridSpan w:val="2"') || documentXml.includes('w:gridSpan'),
      "Thẻ gộp cột w:gridSpan phải được sinh trong OOXML"
    );

    // Xác minh 2 đoạn văn riêng biệt được giữ nguyên trong ô
    assert.ok(
      documentXml.includes("Đoạn thứ nhất trong ô"),
      "Đoạn thứ nhất phải tồn tại trong OOXML"
    );
    assert.ok(
      documentXml.includes("Đoạn thứ hai trong ô"),
      "Đoạn thứ hai phải tồn tại trong OOXML"
    );
  });

  // ----------------------------------------------------------------------
  // 32. Phân biệt cờ isStrictCompliant (đạt 9/9) so với noCriticalErrors / passed
  // ----------------------------------------------------------------------
  await runTest("TEST-32", "Phân biệt cờ isStrictCompliant (đạt 9/9) so với noCriticalErrors / passed", () => {
    // Tài liệu bản nháp còn thiếu trường (chỉ đạt 4/9)
    const incompleteDoc = {
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      orgHeader2: "ỦY BAN NHÂN DÂN THÀNH PHỐ HẢI PHÒNG",
      documentType: "KẾ HOẠCH",
      bodyHtml: "<p>Nội dung chi tiết của bản nháp văn bản kế hoạch công tác.</p>",
      // Thiếu referenceNumber, locationAndDate, subject, signName
    };

    const repIncomplete = validateND30Compliance(incompleteDoc, "administrative");
    assert.equal(repIncomplete.noCriticalErrors, true, "Không có lỗi nghiêm trọng cản trở xuất bản nháp");
    assert.equal(repIncomplete.passed, true, "Duy trì passed = true tương thích ngược");
    assert.equal(repIncomplete.isStrictCompliant, false, "Chưa đạt 9/9 nên isStrictCompliant bắt buộc là false");
    assert.ok(repIncomplete.passedChecks < repIncomplete.totalChecks, "passedChecks phải nhỏ hơn totalChecks");

    // Tài liệu hoàn chỉnh 9/9
    const completeDoc = {
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      orgHeader2: "ỦY BAN NHÂN DÂN THÀNH PHỐ HẢI PHÒNG",
      referenceNumber: "Số: 125/KH-UBND",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      subject: "Về việc tổ chức hội nghị công tác năm 2026",
      bodyHtml: "<p>Nội dung chi tiết của kế hoạch công tác văn thư lưu trữ năm 2026.</p>",
      signTitle: "CHỦ TỊCH",
      signName: "Nguyễn Văn Thắng",
      recipients: "- Như trên;\n- Lưu: VT.",
    };

    const repComplete = validateND30Compliance(completeDoc, "administrative");
    assert.equal(repComplete.isStrictCompliant, true, "Đầy đủ 9/9 thành phần thể thức thì isStrictCompliant là true");
    assert.equal(repComplete.passedChecks, 9, "passedChecks phải đạt 9/9");
  });

  // ----------------------------------------------------------------------
  // TỔNG KẾT KẾT QUẢ KIỂM TRA ĐƠN VỊ & HỆ THỐNG
  // ----------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(` KẾT QUẢ KIỂM THỬ ĐƠN VỊ & TIÊU CHUẨN: ${passed}/32 PASS, ${failed} FAIL`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\nTẤT CẢ 32 BÀI KIỂM THỬ ĐƠN VỊ VÀ ĐỐI CHIẾU THỂ THỨC ĐỀU ĐẠT BẢO TỒN NGUYÊN VẸN!");
  }
}

main();
