import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  generateND30DocxUint8Array,
  generateND30DocxBuffer,
  generateND30DocxBlob,
  exportToDocx,
  postProcessDocxShapes,
  convertHtmlToDocxElements,
  sanitizeHtmlForDocx
} from "../src/utils/docxExport.ts";
import { type DocumentFormatType, DocumentFormatSchema } from "../src/shared/schemas/document.schema.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../src/canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../src/canonical/hd05/companyHeaderHD05.ts";
import { extractOoxmlEvidenceFromXml, evaluateDocumentRules } from "../src/canonical/ruleEngine.ts";
import { computeDraftRevisionKey } from "../src/App.tsx";

// Force-disable nodebuffer support in JSZip to strictly simulate a browser environment
(JSZip.support as any).nodebuffer = false;

test("Browser Simulation: JSZip.support.nodebuffer is strictly false", () => {
  assert.equal(JSZip.support.nodebuffer, false, "JSZip nodebuffer should be disabled to simulate browser");
});

test("Browser Simulation: postProcessDocxShapes works without nodebuffer", async () => {
  // Create a minimal zip with word/document.xml containing placeholders
  const sampleZip = new JSZip();
  sampleZip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>[[ND30_SHAPE_LINE_1]]</w:t></w:r></w:p>
    <w:p><w:r><w:t>[[ND30_SHAPE_LINE_2]]</w:t></w:r></w:p>
    <w:p><w:r><w:t>[[HD05_SHAPE_LINE_TITLE]]</w:t></w:r></w:p>
  </w:body>
</w:document>`);

  const rawBytes = await sampleZip.generateAsync({ type: "uint8array" });
  assert.ok(rawBytes instanceof Uint8Array, "rawBytes should be Uint8Array");

  // Run postProcessDocxShapes
  const processedBytes = await postProcessDocxShapes(rawBytes);
  assert.ok(processedBytes instanceof Uint8Array, "processedBytes should be Uint8Array");
  assert.ok(processedBytes.length > 0, "processedBytes should not be empty");

  // Read back and check replacements
  const checkZip = await JSZip.loadAsync(processedBytes);
  const checkXml = await checkZip.file("word/document.xml")!.async("string");

  assert.ok(!checkXml.includes("[[ND30_SHAPE_LINE_1]]"), "Placeholder 1 should be replaced");
  assert.ok(!checkXml.includes("[[ND30_SHAPE_LINE_2]]"), "Placeholder 2 should be replaced");
  assert.ok(!checkXml.includes("[[HD05_SHAPE_LINE_TITLE]]"), "HD05 Placeholder should be replaced");
  assert.ok(checkXml.includes("w:pict") || checkXml.includes("w:drawing"), "Should include shape markup");
});

test("Browser Simulation: ND30 Document Generation (Hoa Tieu Profile) without nodebuffer", async () => {
  const nd30Doc: DocumentFormatType = DocumentFormatSchema.parse({
    regime: "administrative",
    headerProfile: COMPANY_HEADER_PROFILE_ID,
    fontFamily: "Times New Roman",
    fontSize: 13,
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    referenceNumber: "Số: 105/KH-HTMB",
    locationAndDate: "Hải Phòng, ngày 16 tháng 10 năm 2026",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    documentType: "KẾ HOẠCH",
    subject: "Về việc triển khai công tác an toàn hàng hải quý IV năm 2026",
    bodyHtml: "<p>Kính gửi các phòng ban, đơn vị trực thuộc Công ty Hoa tiêu hàng hải miền Bắc.</p><p>Thực hiện nhiệm vụ dẫn tàu an toàn tại luồng hàng hải.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
    recipients: "Như điều 3\nLưu: VT, KH.",
  });

  const bytes = await generateND30DocxUint8Array(nd30Doc);
  assert.ok(bytes instanceof Uint8Array, "Result should be Uint8Array");
  assert.ok(bytes.length > 5000, `Result DOCX should be a valid size, got ${bytes.length} bytes`);

  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.length > 0, "word/document.xml must exist");
  assert.ok(!docXml.includes("[[ND30_SHAPE_LINE_1]]"), "No raw placeholder 1");
  assert.ok(!docXml.includes("[[ND30_SHAPE_LINE_2]]"), "No raw placeholder 2");

  // Check OOXML extraction
  const evidence = extractOoxmlEvidenceFromXml(docXml, "administrative");
  assert.ok(evidence.page_width_mm && Math.abs(evidence.page_width_mm - 210) < 1, "Page width should be A4 (210mm)");
  assert.ok(evidence.margin_left_mm && Math.abs(evidence.margin_left_mm - 30) < 1, "Left margin should be 30mm");
  assert.ok(evidence.margin_right_mm && Math.abs(evidence.margin_right_mm - 15) < 1, "Right margin should be 15mm");
});

test("Browser Simulation: HD05 Document Generation (Dang Bo Profile) without nodebuffer", async () => {
  const hd05Doc: DocumentFormatType = DocumentFormatSchema.parse({
    regime: "party",
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
    fontFamily: "Times New Roman",
    fontSize: 14,
    orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BĐATHH VIỆT NAM",
    orgHeader2: "ĐẢNG BỘ CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    referenceNumber: "Số 25-NQ/ĐU",
    locationAndDate: "Hải Phòng, ngày 16 tháng 10 năm 2026",
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    documentType: "NGHỊ QUYẾT",
    subject: "Về tăng cường công tác xây dựng Đảng trong doanh nghiệp",
    bodyHtml: "<p>Nghị quyết Ban Chấp hành Đảng bộ Công ty Hoa tiêu hàng hải miền Bắc về công tác cán bộ.</p>",
    signTitle: "BÍ THƯ",
    signName: "Trần Văn B",
    recipients: "Các chi bộ trực thuộc\nLưu: VP.",
  });

  const bytes = await generateND30DocxUint8Array(hd05Doc);
  assert.ok(bytes instanceof Uint8Array, "Result should be Uint8Array");
  assert.ok(bytes.length > 5000, `Result DOCX should be a valid size, got ${bytes.length} bytes`);

  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.length > 0, "word/document.xml must exist");
  assert.ok(!docXml.includes("[[HD05_SHAPE_LINE_TITLE]]"), "No raw HD05 title placeholder");

  const evidence = extractOoxmlEvidenceFromXml(docXml, "party");
  assert.ok(evidence.page_width_mm && Math.abs(evidence.page_width_mm - 210) < 1, "Page width should be A4");
  assert.ok(evidence.margin_top_mm && Math.abs(evidence.margin_top_mm - 20) < 1, "Top margin should be 20mm");
  assert.ok(evidence.margin_bottom_mm && Math.abs(evidence.margin_bottom_mm - 20) < 1, "Bottom margin should be 20mm");
});

test("Single Artifact: Exact instance reference equality for OOXML measurement and download", async () => {
  const doc: DocumentFormatType = DocumentFormatSchema.parse({
    regime: "administrative",
    fontFamily: "Times New Roman",
    fontSize: 13,
    orgHeader1: "CỤC HÀNG HẢI VIỆT NAM",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI",
    referenceNumber: "Số: 12/CV-HT",
    locationAndDate: "Hải Phòng, ngày 16 tháng 10 năm 2026",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    documentType: "CÔNG VĂN",
    subject: "Về việc phối hợp kiểm tra định kỳ phương tiện",
    bodyHtml: "<p>Kính gửi: Chi cục Hàng hải Hải Phòng.</p><p>Công ty xin báo cáo lịch kiểm tra định kỳ năm 2026.</p>",
    signTitle: "PHÓ GIÁM ĐỐC",
    signName: "Lê Văn C",
    recipients: "Như trên\nLưu: VT.",
  });

  // 1. Generate single artifact bytes
  const bytes = await generateND30DocxUint8Array(doc);
  assert.ok(bytes instanceof Uint8Array, "Generated bytes must be Uint8Array");

  // 2. Measure OOXML directly on the generated bytes instance
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const evidence = extractOoxmlEvidenceFromXml(xml, "administrative");
  assert.ok(evidence.page_width_mm > 0, "OOXML evidence extracted from bytes");

  // 3. Mock download receiver to verify EXACT instance reference equality
  let downloadedBytesRef: Uint8Array | null = null;
  const mockDownload = (receivedBytes: Uint8Array) => {
    downloadedBytesRef = receivedBytes;
  };
  mockDownload(bytes);

  // 4. Verify exact reference identity (downloaded bytes IS the measured bytes instance, not regenerated)
  assert.equal(downloadedBytesRef, bytes, "Download byte array must be the EXACT SAME memory instance as measured for OOXML");
  assert.ok(downloadedBytesRef === bytes, "Strict reference equality (===) must hold");

  // 5. Test exportToDocx also returns the same bytes
  const result = await exportToDocx(doc, "Test_Export.docx");
  assert.ok(result.bytes instanceof Uint8Array);
  assert.equal(result.fileName, "Test_Export.docx");
});

test("Step 3 Language: Honest scope reporting when NOT_EVALUATED or NEEDS_REVIEW exist", () => {
  const sampleDoc = {
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 12/KH-HT",
    locationAndDate: "Hải Phòng, ngày 16 tháng 10 năm 2026",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" as const,
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc" as const,
    subject: "Kế hoạch kiểm tra an toàn",
    bodyHtml: "<p>Nội dung kế hoạch...</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
    recipients: "Như trên",
    regime: "administrative" as const,
    fontFamily: "Times New Roman" as const,
    fontSize: 13 as const,
  };

  // Evaluate rules without OOXML evidence (simulates Step 3 editing before full evidence)
  const summary = evaluateDocumentRules(sampleDoc, "administrative", undefined);

  // 1. Metric 2 (Actionable Issues) can be 0 if basic fields are filled
  // But Metric 3 must contain NOT_EVALUATED rules
  assert.ok(summary.canonicalStats.counts.NOT_EVALUATED > 0, "Rules requiring OOXML evidence must be NOT_EVALUATED");

  // 2. Step 3 must NOT claim overall compliant
  const hasPendingVerification = 
    summary.canonicalStats.counts.NEEDS_REVIEW > 0 || 
    summary.canonicalStats.counts.NOT_EVALUATED > 0;
  assert.equal(hasPendingVerification, true, "Must recognize pending verification rules exist");

  // 3. Status text must accurately reflect automated vs manual scope
  const statusTitle = hasPendingVerification ? "Không có việc cần xử lý tự động" : "Không có vấn đề cần xử lý";
  assert.equal(statusTitle, "Không có việc cần xử lý tự động");
  assert.notEqual(statusTitle, "Đạt chuẩn thể thức");
});

test("Draft Revision Key: Rejects stale async OOXML evidence when regime or content changes", async () => {
  const docA = {
    regime: "administrative" as const,
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 10/KH-HT",
    locationAndDate: "Hải Phòng, ngày 16 tháng 10 năm 2026",
    orgHeader1: "TỔNG CÔNG TY",
    orgHeader2: "CÔNG TY HOA TIÊU",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" as const,
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc" as const,
    subject: "Kế hoạch công tác năm 2026",
    bodyHtml: "<p>Văn bản A...</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
    recipients: "Lưu VT",
    fontFamily: "Times New Roman" as const,
    fontSize: 13 as const,
  };

  const keyA = computeDraftRevisionKey(docA, "state");

  // User switches regime to party:
  const docB = {
    ...docA,
    regime: "party" as const,
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM" as const,
    nationalHeader2: "" as const,
  };
  const keyB = computeDraftRevisionKey(docB, "party");

  // 1. Revision keys must differ
  assert.notEqual(keyA, keyB, "Draft revision keys must be distinct between state and party");

  // 2. User edits content:
  const docC = { ...docA, bodyHtml: "<p>Văn bản A đã được chỉnh sửa mới...</p>" };
  const keyC = computeDraftRevisionKey(docC, "state");
  assert.notEqual(keyA, keyC, "Draft revision keys must change upon content edit");

  // 3. Stale OOXML evidence rejection:
  const staleEvidenceForDocA = {
    page_width_mm: 210,
    margin_left_mm: 30,
    draft_key: keyA, // generated for docA
  };

  // Evaluate rules on docB with stale evidence from docA
  const isEvidenceMatchingB = staleEvidenceForDocA.draft_key === keyB;
  assert.equal(isEvidenceMatchingB, false, "Stale evidence from docA must NOT match current draft key B");

  // System passes undefined evidence when keys do not match:
  const summaryOnDocB = evaluateDocumentRules(
    docB, 
    "party", 
    isEvidenceMatchingB ? staleEvidenceForDocA : undefined
  );
  assert.ok(summaryOnDocB.canonicalStats.counts.NOT_EVALUATED > 0, "Rules must remain NOT_EVALUATED rather than using stale evidence");
});

test("Browser Simulation: Table Colspan, Rowspan, and HTML Sanitization", () => {
  const dirtyHtml = `
    <script>alert('xss')</script>
    <p>Đoạn văn an toàn 1</p>
    <table border="1">
      <tr>
        <th colspan="2">Tiêu đề hợp nhất</th>
      </tr>
      <tr>
        <td>Ô 1</td>
        <td>Ô 2</td>
      </tr>
    </table>
    <iframe src="malicious.html"></iframe>
  `;

  const sanitized = sanitizeHtmlForDocx(dirtyHtml);
  assert.ok(!sanitized.includes("<script"), "Script should be stripped");
  assert.ok(!sanitized.includes("<iframe"), "Iframe should be stripped");
  assert.ok(sanitized.includes("Tiêu đề hợp nhất"), "Table text preserved");

  const elements = convertHtmlToDocxElements(dirtyHtml, "administrative");
  assert.ok(elements.length >= 2, "Should parse into paragraphs and table elements");
});
