import assert from "node:assert/strict";
import JSZip from "jszip";
import { 
  generateND30DocxDocument, 
  generateND30DocxBuffer, 
  getStyleProfile 
} from "../src/utils/docxExport.ts";
import { 
  type DocumentFormatType, 
  validateND30Compliance,
  REFERENCE_NUMBER_ND30_REGEX,
  REFERENCE_NUMBER_HD05_REGEX
} from "../src/shared/schemas/document.schema.ts";
import { 
  COMPANY_HEADER_PROFILE_ID, 
  createCompanyHeaderTable, 
  applyCompanyProfile,
  COMPANY_HEADER_TABLE_TWIPS
} from "../src/canonical/nd30/companyHeader.ts";
import { 
  COMPANY_HEADER_HD05_PROFILE_ID, 
  createCompanyHeaderHD05Table, 
  applyCompanyHD05Profile,
  COMPANY_HEADER_HD05_TABLE_TWIPS
} from "../src/canonical/hd05/companyHeaderHD05.ts";
import { 
  evidenceFromDocumentXml, 
  auditCanonicalND30 
} from "../src/canonical/nd30/canonicalAudit.ts";
import { 
  extractHD05EvidenceFromXml, 
  auditCanonicalHD05 
} from "../src/canonical/hd05/canonicalAuditHD05.ts";

console.log("==================================================================");
console.log(" BỘ KIỂM THỬ TÁCH BIỆT HAI HỆ THỐNG THỂ THỨC (NĐ 30 & HD 05)");
console.log("==================================================================\n");

async function main() {
  let passedCount = 0;

  // --------------------------------------------------------------------------
  // CASE 1: NĐ 30 Văn bản hành chính nhà nước (Generic)
  // --------------------------------------------------------------------------
  console.log("--- CASE 1: NĐ 30 Văn bản hành chính nhà nước (Generic) ---");
  {
    const docData: DocumentFormatType = {
      regime: "administrative",
      headerProfile: "generic",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "BỘ GIAO THÔNG VẬN TẢI",
      orgHeader2: "CỤC HÀNG HẢI VIỆT NAM",
      locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 125/KH-CHHVN",
      subject: "V/v Triển khai công tác an toàn hàng hải mùa mưa bão năm 2026",
      bodyHtml: "<p>Nội dung kế hoạch công tác hành chính...</p>",
      signTitle: "CỤC TRƯỞNG",
      signName: "Đặng Minh Quân",
      recipients: "Các cảng vụ hàng hải;\nLưu: VT, AT.",
    };

    // Schema validation
    const report = validateND30Compliance(docData, "administrative");
    if (report.passedChecks !== 9) {
      console.log("Case 1 issues:", report.issues);
    }
    assert.equal(report.passedChecks, 9, "Đạt 9/9 trường dữ liệu cơ bản");
    assert.equal(report.noCriticalErrors, true);
    assert.equal(REFERENCE_NUMBER_ND30_REGEX.test(docData.referenceNumber), true);

    // OOXML Generation
    const buffer = await generateND30DocxBuffer(docData);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml, "Đã sinh word/document.xml");

    // Evidence & Audit
    const evidence = evidenceFromDocumentXml(xml);
    assert.ok(evidence.page_width_mm && Math.abs(evidence.page_width_mm - 210) < 1.0, "Khổ rộng A4 210mm");
    assert.ok(evidence.page_height_mm && Math.abs(evidence.page_height_mm - 297) < 1.0, "Khổ cao A4 297mm");
    assert.ok(evidence.margin_left_mm && Math.abs(evidence.margin_left_mm - 30) < 1.0, "Lề trái 30mm");
    assert.ok(evidence.margin_right_mm && Math.abs(evidence.margin_right_mm - 15) < 1.0, "Lề phải 15mm");
    assert.equal(evidence.motto_underline_length_relation, "equal_to_text_length", "Đường kẻ tiêu ngữ 100%");
    assert.ok(evidence.issuer_underline_fraction && evidence.issuer_underline_fraction >= 0.33 && evidence.issuer_underline_fraction <= 0.50, "Đường kẻ cơ quan 1/3 đến 1/2");

    const audit = auditCanonicalND30(evidence);
    assert.ok(audit.counts.PASS >= 5, "Audit NĐ 30 đạt ít nhất 5 quy tắc có bằng chứng OOXML");
    console.log(`[PASS] Case 1 NĐ 30 Generic: PASS=${audit.counts.PASS}, NOT_EVALUATED=${audit.counts.NOT_EVALUATED}`);
    passedCount++;
  }

  // --------------------------------------------------------------------------
  // CASE 2: NĐ 30 Profile Công ty Hoa tiêu Hàng hải Miền Bắc
  // --------------------------------------------------------------------------
  console.log("\n--- CASE 2: NĐ 30 Profile Công ty Hoa tiêu Hàng hải Miền Bắc ---");
  {
    const baseDoc: DocumentFormatType = {
      regime: "administrative",
      headerProfile: COMPANY_HEADER_PROFILE_ID,
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 45/QĐ-HTMB",
      subject: "V/v Kiện toàn hội đồng an toàn hoa tiêu",
      bodyHtml: "<p>Nội dung quyết định của công ty...</p>",
      signTitle: "GIÁM ĐỐC",
      signName: "Trần Văn B",
      recipients: "Như Điều 3;\nLưu: VT, TCHC.",
    };

    const docData = applyCompanyProfile(baseDoc);
    const buffer = await generateND30DocxBuffer(docData);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml, "Đã sinh word/document.xml cho profile công ty NĐ 30");

    // Kiểm tra cấu trúc hình học bảng gốc Word
    assert.ok(xml.includes(`w:w="${COMPANY_HEADER_TABLE_TWIPS.width}"`), `Bảng có độ rộng ${COMPANY_HEADER_TABLE_TWIPS.width} twips`);
    assert.ok(xml.includes(`w:w="${COMPANY_HEADER_TABLE_TWIPS.left}"`), `Cột trái có độ rộng ${COMPANY_HEADER_TABLE_TWIPS.left} twips`);
    assert.ok(xml.includes(`w:w="${COMPANY_HEADER_TABLE_TWIPS.right}"`), `Cột phải có độ rộng ${COMPANY_HEADER_TABLE_TWIPS.right} twips`);

    // Kiểm tra Shape Lines (DrawingML & VML fallback)
    const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
    const cells = tblMatch ? Array.from(tblMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map(m => m[0]) : [];
    console.log("Cell 0 text preview:", cells[0]?.replace(/<[^>]+>/g, " "));
    console.log("Cell 0 raw snippet:", cells[0]?.substring(cells[0].length - 400));
    assert.ok(xml.includes('name="ND30 Plain Line 1"'), "DrawingML Shape Line 1 hiện diện");
    assert.ok(xml.includes('name="ND30 Plain Line 2"'), "DrawingML Shape Line 2 hiện diện");
    assert.ok(xml.includes('id="ND30 Plain Line 1"'), "VML Fallback Line 1 hiện diện");
    assert.ok(xml.includes('id="ND30 Plain Line 2"'), "VML Fallback Line 2 hiện diện");

    // Đánh giá kiểm chuẩn tự động đo Shape Line
    const evidence = evidenceFromDocumentXml(xml);
    console.log("Case 2 evidence:", evidence);
    assert.equal(evidence.motto_underline_length_relation, "equal_to_text_length", "Shape Line tiêu ngữ bằng 100% dòng chữ");
    assert.ok(evidence.issuer_underline_fraction && evidence.issuer_underline_fraction >= 0.33 && evidence.issuer_underline_fraction <= 0.52, "Shape Line cơ quan đạt ~45-50% (trong khoảng 1/3 - 1/2 quy chuẩn)");

    const audit = auditCanonicalND30(evidence);
    assert.ok(audit.counts.PASS >= 5, "Audit đo OOXML Shape Line PASS trọn vẹn");
    console.log(`[PASS] Case 2 NĐ 30 Company Profile: Shape Lines đo chuẩn, PASS=${audit.counts.PASS}`);
    passedCount++;
  }

  // --------------------------------------------------------------------------
  // CASE 3: HD 05 Văn bản Đảng thông thường (Generic Nghị Quyết)
  // --------------------------------------------------------------------------
  console.log("\n--- CASE 3: HD 05 Văn bản Đảng thông thường (Generic Nghị Quyết) ---");
  {
    const docData: DocumentFormatType = {
      regime: "party",
      headerProfile: "generic",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      fontFamily: "Times New Roman",
      fontSize: 14,
      orgHeader1: "ĐẢNG BỘ KHỐI DOANH NGHIỆP TRUNG ƯƠNG",
      orgHeader2: "BAN THƯỜNG VỤ",
      locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
      documentType: "NGHỊ QUYẾT",
      referenceNumber: "Số 05-NQ/ĐUK", // HD 05: KHÔNG có dấu hai chấm!
      subject: "Về nâng cao chất lượng sinh hoạt chi bộ trong doanh nghiệp nhà nước",
      bodyHtml: "<p>Nội dung nghị quyết Đảng...</p>",
      signTitle: "T/M BAN THƯỜNG VỤ\nBÍ THƯ",
      signName: "Lê Văn C",
      recipients: "Các đảng bộ trực thuộc;\nLưu: Văn phòng.",
    };

    // Schema validation
    const report = validateND30Compliance(docData, "party");
    assert.equal(report.passedChecks, 9, "Đạt 9/9 trường dữ liệu văn bản Đảng");
    assert.equal(REFERENCE_NUMBER_HD05_REGEX.test(docData.referenceNumber), true, "Số ký hiệu chuẩn HD 05");

    // Từ chối nếu văn bản Đảng dùng 'Số: '
    assert.equal(docData.referenceNumber.startsWith("Số:"), false, "Không có dấu hai chấm");

    // OOXML Generation
    const buffer = await generateND30DocxBuffer(docData);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml, "Đã sinh word/document.xml cho HD 05 generic");

    // Evidence extraction
    const evidence = extractHD05EvidenceFromXml(xml);
    assert.equal(evidence.has_issuer_star, true, "Có dấu hoa thị * cân đối dưới cơ quan ban hành");
    assert.equal(evidence.party_title_underline_length_relation, "equal_to_title_length", "Đường kẻ Đảng Cộng sản VN đạt 100% độ dài");
    assert.equal(evidence.reference_number_has_colon, false, "Từ 'Số' không có dấu hai chấm");
    assert.equal(evidence.has_five_hyphens, true, "Có chính xác 5 dấu gạch nối ----- phân cách giữa trích yếu và nội dung");
    assert.equal(evidence.subject_is_bold, true, "Trích yếu văn bản Đảng in đậm");
    assert.equal(evidence.subject_is_italic, false, "Trích yếu văn bản Đảng đứng (không in nghiêng)");

    const audit = auditCanonicalHD05(evidence);
    assert.ok(audit.counts.PASS >= 5, "Audit HD 05 PASS các quy tắc thể thức Đảng có bằng chứng");
    console.log(`[PASS] Case 3 HD 05 Generic: PASS=${audit.counts.PASS}, NOT_EVALUATED=${audit.counts.NOT_EVALUATED}`);
    passedCount++;
  }

  // --------------------------------------------------------------------------
  // CASE 4: HD 05 Profile Đảng Bộ Công ty Hoa tiêu Hàng hải Miền Bắc
  // --------------------------------------------------------------------------
  console.log("\n--- CASE 4: HD 05 Profile Đảng Bộ Công ty Hoa tiêu Hàng hải Miền Bắc ---");
  {
    const baseDoc: DocumentFormatType = {
      regime: "party",
      headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      fontFamily: "Times New Roman",
      fontSize: 14,
      orgHeader1: "",
      orgHeader2: "",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số 12-QĐ/ĐU",
      subject: "Về việc chuẩn y kết nạp đảng viên mới",
      bodyHtml: "<p>Nội dung quyết định chuẩn y kết nạp...</p>",
      signTitle: "T/M ĐẢNG ỦY\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "Chi bộ Hoa tiêu 1;\nĐảng viên mới;\nLưu: VP Đảng ủy.",
    };

    const docData = applyCompanyHD05Profile(baseDoc);
    assert.equal(docData.headerProfile, COMPANY_HEADER_HD05_PROFILE_ID);

    const buffer = await generateND30DocxBuffer(docData);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml, "Đã sinh word/document.xml cho HD 05 company profile");

    // Kiểm tra cấu trúc bảng chuẩn mẫu Đảng bộ
    assert.ok(xml.includes(`w:w="${COMPANY_HEADER_HD05_TABLE_TWIPS.width}"`), `Bảng HD 05 có độ rộng ${COMPANY_HEADER_HD05_TABLE_TWIPS.width} twips`);
    assert.ok(xml.includes(`w:w="${COMPANY_HEADER_HD05_TABLE_TWIPS.left}"`), `Cột trái có độ rộng ${COMPANY_HEADER_HD05_TABLE_TWIPS.left} twips`);
    assert.ok(xml.includes(`w:w="${COMPANY_HEADER_HD05_TABLE_TWIPS.right}"`), `Cột phải có độ rộng ${COMPANY_HEADER_HD05_TABLE_TWIPS.right} twips`);

    // Kiểm tra Shape Line tiêu đề Đảng (Straight Connector 1)
    assert.ok(xml.includes('name="Straight Connector 1"'), "DrawingML Straight Connector 1 hiện diện");
    assert.ok(xml.includes('id="Straight Connector 1"'), "VML Fallback Straight Connector 1 hiện diện");
    assert.ok(xml.includes('cx="2628900"'), "Độ rộng Shape Line 207pt (2628900 EMU) khớp 100% độ dài dòng chữ");

    // Kiểm tra không có underline dưới cơ quan Đảng
    const evidence = extractHD05EvidenceFromXml(xml);
    assert.equal(evidence.has_issuer_star, true);
    assert.equal(evidence.party_title_underline_length_relation, "equal_to_title_length");

    const audit = auditCanonicalHD05(evidence);
    assert.ok(audit.counts.PASS >= 5, "Audit HD 05 Company Profile PASS trọn vẹn");
    console.log(`[PASS] Case 4 HD 05 Company Profile: Shape Line & Bảng chuẩn mẫu Word, PASS=${audit.counts.PASS}`);
    passedCount++;
  }

  // --------------------------------------------------------------------------
  // CASE 5: HD 05 Công Văn Đảng (Trích yếu cột trái, không tiêu đề giữa)
  // --------------------------------------------------------------------------
  console.log("\n--- CASE 5: HD 05 Công Văn Đảng (Trích yếu cột trái, không tiêu đề giữa) ---");
  {
    const docData: DocumentFormatType = {
      regime: "party",
      headerProfile: "generic",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      fontFamily: "Times New Roman",
      fontSize: 14,
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
      orgHeader2: "ĐẢNG ỦY CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "CÔNG VĂN", // Công văn Đảng
      referenceNumber: "Số 08-CV/ĐU",
      subject: "V/v hướng dẫn chuẩn bị Đại hội Chi bộ nhiệm kỳ 2025 - 2027",
      bodyHtml: "<p>Kính gửi: Các chi bộ trực thuộc Đảng bộ Công ty,</p><p>Thực hiện chỉ đạo của Đảng ủy cấp trên...</p>",
      signTitle: "T/M ĐẢNG ỦY\nPHÓ BÍ THƯ",
      signName: "Đỗ Quốc H",
      recipients: "Như trên;\nLưu: VP Đảng ủy.",
    };

    const buffer = await generateND30DocxBuffer(docData);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml, "Đã sinh word/document.xml cho Công văn Đảng");

    const evidence = extractHD05EvidenceFromXml(xml);
    assert.equal(evidence.subject_in_left_column, true, "Trích yếu công văn được bố trí ở cột trái dưới số hiệu");
    assert.equal(evidence.has_five_hyphens, false, "Công văn Đảng không có 5 dấu gạch nối giữa trang");
    assert.equal(evidence.reference_number_has_colon, false, "Số công văn Đảng không có dấu hai chấm");

    // Kiểm tra cỡ chữ trích yếu công văn: 12pt (val=24), in nghiêng (w:i)
    assert.ok(xml.includes('<w:sz w:val="24"/>') && xml.includes('<w:i/>'), "Trích yếu công văn cột trái có cỡ 12pt in nghiêng");

    const audit = auditCanonicalHD05(evidence);
    assert.ok(audit.counts.PASS >= 5, "Audit Công văn Đảng PASS");
    console.log(`[PASS] Case 5 HD 05 Công Văn Đảng: Trích yếu đặt cột trái 12pt nghiêng, không tiêu đề giữa, PASS=${audit.counts.PASS}`);
    passedCount++;
  }

  console.log("\n==================================================================");
  console.log(` KẾT QUẢ KIỂM THỬ TÁCH BIỆT THỂ THỨC: ${passedCount}/5 CASES PASS, 0 FAIL`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Lỗi kiểm thử:", err);
  process.exit(1);
});
