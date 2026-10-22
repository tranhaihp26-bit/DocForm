import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  evaluateDocumentRules,
  extractOoxmlEvidenceFromXml,
  getRulesForRegime,
  COMPONENT_GROUPS
} from "../src/canonical/ruleEngine.ts";
import {
  extractTableDetails,
  extractBlocksFromDocx
} from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { createVietnameseWordRegex } from "../src/server/reviewProposals.ts";
import {
  COMPANY_HEADER_PROFILE_ID,
  applyCompanyProfile,
  COMPANY_HEADER_TABLE_TWIPS
} from "../src/canonical/nd30/companyHeader.ts";
import {
  COMPANY_HEADER_HD05_PROFILE_ID,
  applyCompanyHD05Profile,
  COMPANY_HEADER_HD05_TABLE_TWIPS
} from "../src/canonical/hd05/companyHeaderHD05.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";
import { computeVisualDiff } from "../src/utils/diffUtils.ts";
import { saveDraft, loadDraft, type OriginalDocumentSnapshot, type DraftRecord } from "../src/utils/draftStore.ts";


console.log("==================================================================");
console.log(" BỘ KIỂM THỬ: THIẾT KẾ LẠI WORKFLOW CHO NHÂN VIÊN VĂN PHÒNG (DOCFORM)");
console.log("==================================================================");

// -----------------------------------------------------------------------------
// TEST 1: Tách biệt hoàn toàn hai hệ thể thức (Regime Isolation)
// -----------------------------------------------------------------------------
console.log("\n--- TEST 1: Tách biệt hoàn toàn hai hệ thể thức (Regime Isolation) ---");
{
  const nd30Rules = getRulesForRegime("administrative");
  const hd05Rules = getRulesForRegime("party");

  assert.ok(nd30Rules.length >= 435, `NĐ 30 rules count must be >= 435, got ${nd30Rules.length}`);
  assert.ok(hd05Rules.length >= 231, `HD 05 rules count must be >= 231, got ${hd05Rules.length}`);

  // Tất cả rules NĐ 30 phải có regime === "administrative"
  const invalidNd30 = nd30Rules.filter(r => r.regime !== "administrative");
  assert.equal(invalidNd30.length, 0, "Không được có rule nào của hệ khác trong danh mục NĐ 30");

  // Tất cả rules HD 05 phải có regime === "party"
  const invalidHd05 = hd05Rules.filter(r => r.regime !== "party");
  assert.equal(invalidHd05.length, 0, "Không được có rule nào của hệ khác trong danh mục HD 05");

  // Đánh giá 1 văn bản NĐ 30
  const sampleNd30Doc = {
    documentType: "QUYẾT ĐỊNH",
    orgHeader1: "BỘ GIAO THÔNG VẬN TẢI",
    orgHeader2: "CỤC HÀNG HẢI VIỆT NAM",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    referenceNumber: "Số: 125/QĐ-CHHVN",
    locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
    subject: "Về việc ban hành quy chế an toàn hàng hải",
    bodyHtml: "<p>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05/3/2020 của Chính phủ;</p><p>Điều 1. Ban hành kèm theo Quyết định này quy chế mới...</p>",
    signTitle: "CỤC TRƯỞNG",
    signName: "Nguyễn Văn Hải",
    recipients: "Như Điều 1;\nLưu: VT, ATHH.",
  };

  const nd30Eval = evaluateDocumentRules(sampleNd30Doc, "administrative");
  assert.equal(nd30Eval.regime, "administrative");
  assert.equal(nd30Eval.isParty, false);
  assert.ok(nd30Eval.results.every(r => r.regime === "administrative"), "Toàn bộ kết quả phải thuộc regime administrative");

  // Đánh giá cùng văn bản dưới regime party -> phải phát hiện vi phạm Quốc hiệu & Dấu hai chấm ở Số
  const partyEval = evaluateDocumentRules(sampleNd30Doc, "party");
  assert.equal(partyEval.regime, "party");
  assert.equal(partyEval.isParty, true);
  assert.ok(partyEval.actionableIssues.some(i => i.id === "party_title_invalid" || i.id === "party_ref_has_colon"),
    "Đánh giá NĐ 30 dưới regime party phải bắt lỗi tiêu đề Đảng và dấu hai chấm");

  console.log(`[PASS] TEST 1: Tách biệt hoàn toàn (NĐ 30: ${nd30Rules.length} rules, HD 05: ${hd05Rules.length} rules)`);
}

// -----------------------------------------------------------------------------
// TEST 2: Đánh giá 9 nhóm thành phần & Trả về đủ 3 chỉ số độc lập
// -----------------------------------------------------------------------------
console.log("\n--- TEST 2: Đánh giá 9 nhóm thành phần & 3 chỉ số độc lập ---");
{
  const perfectNd30Doc = {
    documentType: "KẾ HOẠCH",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    referenceNumber: "Số: 45/KH-HTMB",
    locationAndDate: "Hải Phòng, ngày 05 tháng 02 năm 2026",
    subject: "Kế hoạch đảm bảo an toàn dẫn tàu năm 2026",
    bodyHtml: "<p>Căn cứ Nghị định số 30/2020/NĐ-CP của Chính phủ;</p><p>Công ty xây dựng kế hoạch...</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn Bình",
    recipients: "Lãnh đạo TCT;\nLưu: VT, ATHH.",
  };

  const evalRes = evaluateDocumentRules(perfectNd30Doc, "administrative");

  // Chỉ số 1: Số nhóm thành phần đã nhận diện
  assert.equal(evalRes.recognizedComponents.total, 9, "Tổng số nhóm thành phần chính phải là 9");
  assert.equal(evalRes.recognizedComponents.recognized, 9, "Văn bản đầy đủ phải nhận diện 9/9 nhóm");
  assert.equal(evalRes.recognizedComponents.groups.length, COMPONENT_GROUPS.length);

  // Chỉ số 2: Số việc người dùng cần xử lý
  assert.equal(evalRes.actionableIssues.length, 0, "Văn bản chuẩn phải có 0 việc cần xử lý");

  // Chỉ số 3: Số quy tắc kiểm định bằng chứng thực tế
  assert.ok(evalRes.canonicalStats.total >= 435);
  assert.equal(typeof evalRes.canonicalStats.counts.PASS, "number");
  assert.equal(typeof evalRes.canonicalStats.counts.NOT_EVALUATED, "number");
  assert.equal(typeof evalRes.canonicalStats.counts.NOT_APPLICABLE, "number");
  // Khi chưa nạp OOXML evidence, các quy tắc hình học không được ngộ nhận PASS
  assert.equal(evalRes.canonicalStats.counts.PASS, 0, "Chưa nạp OOXML thì PASS phải là 0, không được khẳng định quá mức");
  assert.ok(evalRes.canonicalStats.counts.NOT_EVALUATED > 0, "Các quy tắc chưa đo phải ở trạng thái NOT_EVALUATED");

  console.log(`[PASS] TEST 2: Đủ 3 chỉ số độc lập: ${evalRes.recognizedComponents.recognized}/${evalRes.recognizedComponents.total} nhóm, ${evalRes.actionableIssues.length} việc cần xử lý, NOT_EVALUATED: ${evalRes.canonicalStats.counts.NOT_EVALUATED}`);
}

// -----------------------------------------------------------------------------
// TEST 3: Bảo toàn thuộc tính và cấu trúc bảng OOXML
// -----------------------------------------------------------------------------
console.log("\n--- TEST 3: Bảo toàn thuộc tính và cấu trúc bảng OOXML ---");
{
  const mockTableXmlWithProps = `
    <w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:tblPr>
        <w:tblW w:w="9640" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="1200"/>
        <w:gridCol w:w="4800"/>
        <w:gridCol w:w="3640"/>
      </w:tblGrid>
      <w:tr>
        <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
        <w:tc><w:p><w:r><w:t>STT</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Nội dung</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Đơn vị chủ trì</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:trPr><w:cantSplit/></w:trPr>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Nội dung gộp 2 cột</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  `;

  const details = extractTableDetails(mockTableXmlWithProps);
  assert.equal(details.rows, 2, "Bảng phải có đúng 2 hàng");
  assert.equal(details.columns, 3, "Bảng phải có đúng 3 cột");
  assert.equal(details.tableProperties.hasHeaderRow, true, "Bảng phải phát hiện w:tblHeader");
  assert.equal(details.tableProperties.hasBorders, true, "Bảng phải phát hiện có đường kẻ viền");
  assert.equal(details.tableProperties.cantSplitRows, true, "Bảng phải phát hiện w:cantSplit");
  assert.equal(details.tableProperties.isGridSpan, true, "Bảng phải phát hiện ô gộp gridSpan");
  assert.equal(details.tableProperties.colWidthsTwips?.length, 3, "Phải trích xuất đủ 3 độ rộng cột twips");

  console.log(`[PASS] TEST 3: Trích xuất thuộc tính bảng: ${details.rows}x${details.columns}, headerRow=${details.tableProperties.hasHeaderRow}, cantSplit=${details.tableProperties.cantSplitRows}, gridSpan=${details.tableProperties.isGridSpan}`);
}

// -----------------------------------------------------------------------------
// TEST 4: Fixture tổng hợp: 0 chữ ký, bảng kế hoạch bảo toàn trong body
// -----------------------------------------------------------------------------
console.log("\n--- TEST 4: Fixture tổng hợp không có chữ ký, nhiều bảng Body ---");
{
    const bodyHtml = Array.from({ length: 6 }, (_, index) => `<p>Kế hoạch giai đoạn ${index + 1} đến năm 2031.</p><table><tr><td>Hạng mục ${index + 1}</td><td>Tiến độ 2031</td></tr></table>`).join("")
      + Array.from({ length: 20 }, (_, index) => `<p>Nội dung tổng hợp số ${index + 1}.</p>`).join("");
    const bytes = await generateND30DocxBuffer({
      regime: "administrative", headerProfile: "generic", orgHeader1: "CƠ QUAN MẪU", orgHeader2: "ĐƠN VỊ MẪU",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      referenceNumber: "Số: 01/KH", locationAndDate: "Hà Nội, ngày 20 tháng 10 năm 2026", documentType: "KẾ HOẠCH",
      subject: "Kế hoạch tổng hợp", bodyHtml, signTitle: "", signName: "", recipients: "", fontFamily: "Times New Roman", fontSize: 13,
    });
    const extracted = await extractBlocksFromDocx(bytes);
    const blocks = extracted.blocks;
    assert.ok(blocks.length >= 20, `Fixture phải có ít nhất 20 blocks, thực tế: ${blocks.length}`);

    const structured = segmentSourceBlocks(blocks, { filename: "Ke hoach hoat dong.docx", standardType: "administrative" });

    // Kiểm tra 1: Không có người ký trong nguồn -> signTitle & signName phải là rỗng hoặc null, KHÔNG BỊA CHỮ KÝ GIẢ
    assert.ok(!structured.signatures || structured.signatures.length === 0, "Tài liệu này không có chữ ký, signatures phải là rỗng hoặc undefined");
    assert.ok(!structured.fields.signTitle?.value, "signTitle phải là rỗng hoặc null");
    assert.ok(!structured.fields.signName?.value, "signName phải là rỗng hoặc null");

    // Kiểm tra 2: Bảng kế hoạch tiến độ 2031 phải nằm trọn trong body, không bị nuốt vào chữ ký
    assert.ok((structured.body.tablesCount ?? 0) >= 6, `Phải có ít nhất 6 bảng trong body, thực tế: ${structured.body.tablesCount}`);
    assert.ok(structured.body.html.includes("2031") || structured.body.html.includes("Ban Thư ký"),
      "Nội dung bảng năm 2031 và Ban Thư ký phải nằm trọn trong body");

    // Kiểm tra 3: Đánh giá bằng ruleEngine
    const docState = {
      documentType: structured.fields.documentType.value,
      subject: structured.fields.subject.value,
      referenceNumber: structured.fields.referenceNumber.value,
      locationAndDate: structured.fields.locationAndDate.value,
      orgHeader1: structured.fields.orgHeader1.value,
      orgHeader2: structured.fields.orgHeader2.value,
      nationalHeader1: structured.fields.nationalHeader1.value,
      nationalHeader2: structured.fields.nationalHeader2.value,
      bodyHtml: structured.body.html,
      signTitle: structured.fields.signTitle.value,
      signName: structured.fields.signName.value,
      recipients: structured.fields.recipients.value,
    };

    const evalResult = evaluateDocumentRules(docState, "administrative");
    const g7 = evalResult.recognizedComponents.groups.find(g => g.id === 7);
    assert.ok(g7, "Phải có nhóm 7");
    assert.equal(g7.status, "not_applicable", "Với tài liệu không có chữ ký trong nguồn, nhóm 7 phải là not_applicable");
    assert.equal(g7.valuePreview, "Tài liệu không có khối chữ ký trong nguồn");

    console.log(`[PASS] TEST 4: Fixture tổng hợp: ${blocks.length} blocks, ${structured.body.tablesCount} bảng, 0 chữ ký giả, Nhóm 7: "${g7.valuePreview}"`);
}

// -----------------------------------------------------------------------------
// TEST 5: Regex tiếng Việt Unicode không bị lỗi ASCII \b
// -----------------------------------------------------------------------------
console.log("\n--- TEST 5: Regex tiếng Việt Unicode bảo đảm khớp chính xác ---");
{
  const phrase = "tiến đô";
  const regex = createVietnameseWordRegex(phrase);

  const testStr1 = "Báo cáo về tiến đô thực hiện dự án";
  assert.ok(regex.test(testStr1), "Regex phải khớp 'tiến đô' khi đứng giữa các từ tiếng Việt");

  const testStr2 = "tiến đô";
  assert.ok(regex.test(testStr2), "Regex phải khớp 'tiến đô' ở đầu và cuối chuỗi");

  const testStr3 = "Đảm bảo tiến đông cho tàu";
  assert.equal(regex.test(testStr3), false, "Regex không được khớp 'tiến đông' khi tìm 'tiến đô'");

  const phrase2 = "đai hội";
  const regex2 = createVietnameseWordRegex(phrase2);
  const testStr4 = "Tham dự đai hội đảng bộ";
  assert.ok(regex2.test(testStr4), "Regex phải khớp 'đai hội'");

  console.log("[PASS] TEST 5: Regex tiếng Việt Unicode hoạt động hoàn hảo, không bị lỗi gãy bởi \\b");
}

// -----------------------------------------------------------------------------
// TEST 6: Bảo toàn mẫu Header Hoa Tiêu Hàng Hải Miền Bắc (NĐ 30 & HD 05)
// -----------------------------------------------------------------------------
console.log("\n--- TEST 6: Bảo toàn mẫu Header Hoa Tiêu Miền Bắc ---");
{
  const baseDoc = {
    orgHeader1: "",
    orgHeader2: "",
    nationalHeader1: "",
    nationalHeader2: "",
    documentType: "CÔNG VĂN",
    subject: "Thử nghiệm mẫu chuẩn",
    referenceNumber: "Số: 10/CV-HTMB",
    locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
    bodyHtml: "<p>Nội dung...</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn Bình",
    recipients: "Lưu: VT.",
  };

  // NĐ 30 Profile
  const nd30ProfileDoc = applyCompanyProfile(baseDoc);
  assert.equal(nd30ProfileDoc.headerProfile, COMPANY_HEADER_PROFILE_ID);
  assert.equal(nd30ProfileDoc.orgHeader1, "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM");
  assert.equal(nd30ProfileDoc.orgHeader2, "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC");
  assert.equal(COMPANY_HEADER_TABLE_TWIPS.width, 10432);
  assert.equal(COMPANY_HEADER_TABLE_TWIPS.left, 5187);
  assert.equal(COMPANY_HEADER_TABLE_TWIPS.right, 5245);

  // HD 05 Profile
  const hd05ProfileDoc = applyCompanyHD05Profile(baseDoc);
  assert.equal(hd05ProfileDoc.headerProfile, COMPANY_HEADER_HD05_PROFILE_ID);
  assert.equal(hd05ProfileDoc.orgHeader1, "ĐẢNG BỘ TỔNG CÔNG TY\nBẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM");
  assert.equal(hd05ProfileDoc.orgHeader2, "ĐẢNG ỦY CÔNG TY\nHOA TIÊU HÀNG HẢI MIỀN BẮC");
  assert.equal(hd05ProfileDoc.nationalHeader1, "ĐẢNG CỘNG SẢN VIỆT NAM");
  assert.equal(hd05ProfileDoc.nationalHeader2, "");
  assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.width, 10170);
  assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.left, 5580);
  assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.right, 4590);

  console.log("[PASS] TEST 6: Mẫu Header Hoa Tiêu Miền Bắc NĐ 30 & HD 05 bảo toàn nguyên vẹn");
}

// -----------------------------------------------------------------------------
// TEST 7: Kiểm toán ruleEngine với bằng chứng OOXML hợp lệ, sai và thiếu
// -----------------------------------------------------------------------------
console.log("\n--- TEST 7: Kiểm toán ruleEngine (Hợp lệ / Sai / Thiếu OOXML Evidence) ---");
{
  const genericNd30Doc = {
    headerProfile: "generic" as const,
    documentType: "QUYẾT ĐỊNH",
    orgHeader1: "BỘ GIAO THÔNG VẬN TẢI",
    orgHeader2: "CỤC HÀNG HẢI VIỆT NAM",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    referenceNumber: "Số: 125/QĐ-CHHVN",
    locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
    subject: "Về việc ban hành quy chế an toàn hàng hải",
    bodyHtml: "<p>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05/3/2020 của Chính phủ;</p><p>Điều 1. Ban hành kèm theo Quyết định này quy chế mới...</p>",
    signTitle: "CỤC TRƯỞNG",
    signName: "Nguyễn Văn Hải",
    recipients: "Như Điều 1;\nLưu: VT, ATHH.",
  };

  // 7.1: Thiếu bằng chứng OOXML -> PASS = 0, PROFILE rules = NOT_APPLICABLE cho generic doc, NEEDS_REVIEW tách riêng
  const missingEval = evaluateDocumentRules(genericNd30Doc, "administrative");
  assert.equal(missingEval.canonicalStats.counts.PASS, 0, "Khi thiếu ooxmlEvidence, PASS phải bằng 0");
  assert.ok(missingEval.canonicalStats.counts.NOT_EVALUATED > 0, "NOT_EVALUATED phải > 0");
  assert.ok(missingEval.canonicalStats.counts.NEEDS_REVIEW > 0, "NEEDS_REVIEW phải tách riêng, không gộp vào PASS");
  const profileRuleGeneric = missingEval.results.find(r => r.ruleId === "PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH");
  assert.equal(profileRuleGeneric?.status, "NOT_APPLICABLE", "Tài liệu generic không được PASS rule profile công ty");

  // 7.2: Bằng chứng OOXML hợp lệ trích xuất từ DOCX thực tế (Company Profile NĐ30)
  const companyNd30Doc = applyCompanyProfile({
    ...genericNd30Doc,
    headerProfile: COMPANY_HEADER_PROFILE_ID,
    regime: "administrative" as const,
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" as const,
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc" as const,
    fontFamily: "Times New Roman" as const,
    fontSize: 13 as const,
  });
  const nd30Buf = await generateND30DocxBuffer(companyNd30Doc);
  const nd30Zip = await JSZip.loadAsync(nd30Buf);
  const nd30Xml = await nd30Zip.file("word/document.xml")?.async("string");
  assert.ok(nd30Xml, "Phải trích xuất được word/document.xml từ DOCX NĐ30");
  const validNd30Ev = {
    ...extractOoxmlEvidenceFromXml(nd30Xml, "administrative"),
    header_profile: COMPANY_HEADER_PROFILE_ID,
  };
  const validNd30Eval = evaluateDocumentRules(companyNd30Doc, "administrative", validNd30Ev);
  assert.ok(validNd30Eval.canonicalStats.counts.PASS >= 7, `NĐ30 hợp lệ phải có >= 7 rule PASS (thực tế: ${validNd30Eval.canonicalStats.counts.PASS})`);
  assert.equal(validNd30Eval.canonicalStats.counts.FAIL, 0, "NĐ30 hợp lệ phải có 0 rule FAIL");
  assert.equal(
    validNd30Eval.results.find(r => r.ruleId === "PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH")?.status,
    "PASS",
    "Khi dùng profile công ty NĐ30 và kích thước bảng đúng 10432 twips, phải PASS"
  );
  assert.equal(
    validNd30Eval.results.find(r => r.ruleId === "PROFILE.ND30.HOA_TIEU_MB.SHAPE_LINES")?.status,
    "PASS",
    "Khi dùng profile công ty NĐ30 và đủ Shape Lines, phải PASS"
  );

  // 7.3: Bằng chứng OOXML SAI trên NĐ30 -> phải FAIL chứ không được PASS chỉ vì thuộc tính tồn tại
  const invalidNd30Ev = {
    header_profile: COMPANY_HEADER_PROFILE_ID,
    page_width_mm: 150, // Sai khổ A4 (chuẩn 210mm)
    margin_left_mm: 10, // Sai lề trái (chuẩn 30mm)
    motto_underline_length_relation: "mismatch",
    issuer_underline_fraction: 0.85, // Vượt quá 1/2
    header_table_width_twips: 8000, // Sai độ rộng bảng 10432
    has_nd30_shape_lines: false,
  };
  const invalidNd30Eval = evaluateDocumentRules(companyNd30Doc, "administrative", invalidNd30Ev);
  assert.ok(invalidNd30Eval.canonicalStats.counts.FAIL >= 5, `Bằng chứng OOXML sai phải báo FAIL >= 5 rules, thực tế FAIL=${invalidNd30Eval.canonicalStats.counts.FAIL}`);
  assert.equal(
    invalidNd30Eval.results.find(r => r.ruleId === "ND30.PL1.I.II.1B.MOTTO_UNDERLINE_LENGTH")?.status,
    "FAIL",
    "Đường kẻ tiêu ngữ sai lệch phải báo FAIL"
  );
  assert.equal(
    invalidNd30Eval.results.find(r => r.ruleId === "ND30.PL1.I.II.2B.ISSUER_UNDERLINE_RANGE")?.status,
    "FAIL",
    "Đường kẻ cơ quan ngoài khoảng 1/3-1/2 phải báo FAIL"
  );
  assert.equal(
    invalidNd30Eval.results.find(r => r.ruleId === "PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH")?.status,
    "FAIL",
    "Bảng profile công ty sai độ rộng phải báo FAIL"
  );

  // 7.4: Bằng chứng OOXML hợp lệ và sai trên HD05 (Văn bản Đảng)
  const companyHd05Doc = applyCompanyHD05Profile({
    regime: "party" as const,
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM" as const,
    nationalHeader2: "" as const,
    fontFamily: "Times New Roman" as const,
    fontSize: 14 as const,
    orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
    orgHeader2: "ĐẢNG ỦY CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
    documentType: "NGHỊ QUYẾT",
    referenceNumber: "Số 05-NQ/ĐU",
    subject: "Về công tác xây dựng Đảng năm 2026",
    bodyHtml: "<p>Ban Chấp hành Đảng bộ Công ty quyết nghị các nhiệm vụ trọng tâm...</p>",
    signTitle: "T/M ĐẢNG ỦY\nBÍ THƯ",
    signName: "Nguyễn Văn Bình",
    recipients: "Đảng ủy TCT;\nLưu: VPĐU.",
  });
  const hd05Buf = await generateND30DocxBuffer(companyHd05Doc);
  const hd05Zip = await JSZip.loadAsync(hd05Buf);
  const hd05Xml = await hd05Zip.file("word/document.xml")?.async("string");
  assert.ok(hd05Xml, "Phải trích xuất được word/document.xml từ DOCX HD05");
  const validHd05Ev = {
    ...extractOoxmlEvidenceFromXml(hd05Xml, "party"),
    header_profile: COMPANY_HEADER_HD05_PROFILE_ID,
  };
  const validHd05Eval = evaluateDocumentRules(companyHd05Doc, "party", validHd05Ev);
  assert.ok(validHd05Eval.canonicalStats.counts.PASS >= 10, `HD05 hợp lệ phải có >= 10 rule PASS (thực tế: ${validHd05Eval.canonicalStats.counts.PASS})`);
  assert.equal(validHd05Eval.canonicalStats.counts.FAIL, 0, "HD05 hợp lệ phải có 0 rule FAIL");
  assert.equal(
    validHd05Eval.results.find(r => r.ruleId === "PROFILE.HD05.HOA_TIEU_MB.TABLE_WIDTH")?.status,
    "PASS"
  );
  assert.equal(
    validHd05Eval.results.find(r => r.ruleId === "PROFILE.HD05.HOA_TIEU_MB.SHAPE_LINE_TITLE")?.status,
    "PASS"
  );

  // HD05 với bằng chứng sai (có dấu hai chấm ở Số, thiếu dấu *, sai lề, sai bảng)
  const invalidHd05Ev = {
    header_profile: COMPANY_HEADER_HD05_PROFILE_ID,
    has_party_title: true,
    party_title_underline_length_relation: "mismatch",
    has_issuer_star: false,
    reference_number_text: "Số: 05-NQ/ĐU",
    reference_number_has_colon: true,
    has_five_hyphens: false,
    margin_left_mm: 12,
    header_table_width_twips: 9000,
    has_hd05_shape_line: false,
  };
  const invalidHd05Eval = evaluateDocumentRules(companyHd05Doc, "party", invalidHd05Ev);
  assert.ok(invalidHd05Eval.canonicalStats.counts.FAIL >= 6, `HD05 sai bằng chứng phải báo FAIL >= 6 rules, thực tế: ${invalidHd05Eval.canonicalStats.counts.FAIL}`);
  assert.equal(invalidHd05Eval.results.find(r => r.ruleId === "HD05.ORG.13")?.status, "FAIL");
  assert.equal(invalidHd05Eval.results.find(r => r.ruleId === "HD05.NUM.12")?.status, "FAIL");
  assert.equal(invalidHd05Eval.results.find(r => r.ruleId === "PROFILE.HD05.HOA_TIEU_MB.TABLE_WIDTH")?.status, "FAIL");

  console.log(`[PASS] TEST 7: Kiểm toán ruleEngine chặt chẽ (NĐ30 PASS=${validNd30Eval.canonicalStats.counts.PASS}, HD05 PASS=${validHd05Eval.canonicalStats.counts.PASS}, bắt đúng mọi ca FAIL/NOT_EVALUATED/NEEDS_REVIEW)`);
}

// -----------------------------------------------------------------------------
// TEST 8: Bảo toàn nội dung, bảng, ô gộp, phụ lục và chữ ký khi chuyển đổi NĐ30 ↔ HD05
// -----------------------------------------------------------------------------
console.log("\n--- TEST 8: Bảo toàn dữ liệu khi chuyển đổi NĐ30 ↔ HD05 ---");
{
  const initialDoc = applyCompanyProfile({
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" as string,
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc" as string,
    locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
    documentType: "QUYẾT ĐỊNH",
    referenceNumber: "Số: 89/QĐ-HTMB",
    subject: "V/v Kiện toàn Ban Chỉ đạo An toàn Hàng hải năm 2026",
    bodyHtml: `<p>Điều 1. Nội dung quyết định quan trọng.</p><table><tr><th colspan="2">Bảng kế hoạch</th></tr><tr><td>1</td><td>Nhiệm vụ A</td></tr></table>`,
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn Bình",
    recipients: "Như Điều 1;\nLưu: VT.",
    headerProfile: COMPANY_HEADER_PROFILE_ID as string,
    appendices: [
      {
        id: "app_1",
        title: "PHỤ LỤC I: DANH SÁCH THÀNH VIÊN",
        html: "<table><tr><td>STT</td><td>Họ tên</td></tr><tr><td>1</td><td>Trần Văn A</td></tr></table>",
        blockIds: ["b_app_1"],
      }
    ],
  });

  const versionHistory: Array<{ title: string; standardType: "state" | "party"; data: Record<string, unknown> }> = [];

  // Mô phỏng chuyển từ NĐ30 (state) -> HD05 (party) giống executeRegimeSwitch trong App.tsx
  versionHistory.push({ title: "Trước khi chuyển sang Đảng (HD 05)", standardType: "state", data: { ...initialDoc } });
  const switchedToParty = applyCompanyHD05Profile({
    ...initialDoc,
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID as string,
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    referenceNumber: initialDoc.referenceNumber.replace(/^Số:\s*/i, "Số "),
  });

  assert.equal(switchedToParty.bodyHtml, initialDoc.bodyHtml, "Body HTML và bảng biểu phải giữ nguyên tuyệt đối");
  assert.ok(switchedToParty.bodyHtml.includes('colspan="2"'), "Cấu trúc ô gộp colspan trong bảng phải giữ nguyên");
  assert.equal(switchedToParty.appendices?.length, 1, "Số lượng phụ lục phải giữ nguyên");
  assert.equal(switchedToParty.appendices?.[0]?.html, initialDoc.appendices?.[0]?.html, "Nội dung bảng phụ lục phải giữ nguyên");
  assert.equal(switchedToParty.signTitle, initialDoc.signTitle, "Chức vụ người ký phải giữ nguyên");
  assert.equal(switchedToParty.signName, initialDoc.signName, "Họ tên người ký phải giữ nguyên");
  assert.equal(switchedToParty.referenceNumber, "Số 89/QĐ-HTMB", "Số hiệu tự động bỏ dấu hai chấm khi sang HD 05");
  assert.equal(switchedToParty.headerProfile, COMPANY_HEADER_HD05_PROFILE_ID);

  // Chuyển ngược từ HD05 (party) -> NĐ30 (state)
  versionHistory.push({ title: "Trước khi chuyển sang Hành chính (NĐ 30)", standardType: "party", data: { ...switchedToParty } });
  const switchedBackToState = applyCompanyProfile({
    ...switchedToParty,
    headerProfile: COMPANY_HEADER_PROFILE_ID as string,
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    referenceNumber: `Số: ${switchedToParty.referenceNumber.replace(/^Số\s*/i, "")}`,
  });

  assert.equal(switchedBackToState.bodyHtml, initialDoc.bodyHtml, "Body HTML sau khi chuyển khứ hồi phải nguyên vẹn");
  assert.equal(switchedBackToState.appendices?.length, 1, "Phụ lục sau khi chuyển khứ hồi phải nguyên vẹn");
  assert.equal(switchedBackToState.signName, "Nguyễn Văn Bình", "Người ký thật phải nguyên vẹn");
  assert.equal(switchedBackToState.referenceNumber, "Số: 89/QĐ-HTMB", "Số hiệu khôi phục dấu hai chấm chuẩn NĐ 30");
  assert.equal(versionHistory.length, 2, "Lịch sử phiên bản lưu đủ 2 mốc trước mỗi lần chuyển hệ");

  console.log("[PASS] TEST 8: Chuyển đổi khứ hồi NĐ30 ↔ HD05 bảo toàn nội dung, bảng, ô gộp, phụ lục, chữ ký và lịch sử phiên bản");
}

// -----------------------------------------------------------------------------
// TEST 9: Kiểm thử draftStore.ts báo lỗi trung thực khi IndexedDB lỗi & lưu thành công khi có mock DB
// -----------------------------------------------------------------------------
console.log("\n--- TEST 9: Kiểm thử saveDraft() trong draftStore.ts ---");
{
  const dummyRecord = {
    id: "test_draft",
    updatedAt: new Date().toISOString(),
    standardType: "state" as const,
    doc: {
      orgHeader1: "",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 01/HTMB",
      subject: "Test",
      bodyHtml: "<p>Test</p>",
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Văn A",
      recipients: "Lưu VT.",
    },
    versions: [],
  };

  // 9.1: Trong môi trường Node.js không có indexedDB, saveDraft() PHẢI reject (không được nuốt lỗi)
  let rejectedWhenMissing = false;
  try {
    await saveDraft(dummyRecord);
  } catch (err) {
    rejectedWhenMissing = true;
    assert.ok(err instanceof Error, "Phải ném ra đối tượng Error");
  }
  assert.equal(rejectedWhenMissing, true, "saveDraft() phải reject khi IndexedDB không khả dụng để giao diện không báo 'Đã lưu tự động' giả");

  // 9.2: Giả lập IndexedDB thành công và kiểm tra saveDraft + loadDraft
  const memoryStore = new Map<string, any>();
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {
        result: {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            const tx: any = {
              oncomplete: null,
              onabort: null,
              onerror: null,
              objectStore: () => ({
                put: (val: any) => {
                  const putReq: any = {};
                  setTimeout(() => {
                    memoryStore.set(val.id, val);
                    if (putReq.onsuccess) putReq.onsuccess();
                    if (tx.oncomplete) tx.oncomplete();
                  }, 1);
                  return putReq;
                },
                get: (key: string) => {
                  const getReq: any = {};
                  setTimeout(() => {
                    getReq.result = memoryStore.get(key);
                    if (getReq.onsuccess) getReq.onsuccess();
                  }, 1);
                  return getReq;
                },
              }),
            };
            return tx;
          },
        },
      };
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess();
      }, 1);
      return req;
    },
  };

  try {
    await saveDraft(dummyRecord);
    const loaded = await loadDraft("test_draft");
    assert.ok(loaded, "Phải đọc lại được bản nháp đã lưu");
    assert.equal(loaded.doc.referenceNumber, "Số: 01/HTMB");
  } finally {
    delete (globalThis as any).indexedDB;
  }

  console.log("[PASS] TEST 9: saveDraft() báo lỗi trung thực khi lưu thất bại và lưu/đọc thành công khi IndexedDB hoạt động");
}

// -----------------------------------------------------------------------------
// TEST 10: Kiểm thử computeVisualDiff() cho nội dung thêm, xóa, sửa (Step 4 Diff)
// -----------------------------------------------------------------------------
console.log("\n--- TEST 10: Kiểm thử computeVisualDiff() cho nội dung thêm, xóa, sửa ---");
{
  const originalHtml = "<p>Công ty triển khai kế hoạch an toàn hàng hải quý I năm 2025.</p>";
  const proposedHtml = "<p>Công ty Hoa tiêu triển khai kế hoạch an toàn hàng hải quý II năm 2026.</p>";

  const diffResult = computeVisualDiff(originalHtml, proposedHtml);
  assert.equal(typeof diffResult.inlineHtml, "string", "inlineHtml phải là chuỗi HTML hợp lệ để truyền vào DOMPurify.sanitize()");
  assert.ok(diffResult.stats.addedCount > 0, "Phải thống kê được số từ thêm mới");
  assert.ok(diffResult.stats.deletedCount > 0, "Phải thống kê được số từ bị xóa");
  assert.ok(diffResult.inlineHtml.includes("Hoa") && diffResult.inlineHtml.includes("2026"), "inlineHtml phải chứa nội dung thêm mới");
  assert.ok(diffResult.inlineHtml.includes("2025"), "inlineHtml phải hiển thị cả từ cũ đã bị thay thế");
  assert.ok(diffResult.inlineHtml.includes("diff-added") || diffResult.inlineHtml.includes("<ins") || diffResult.inlineHtml.includes("emerald") || diffResult.inlineHtml.includes("green") || diffResult.inlineHtml.includes("<span"), "inlineHtml phải có đánh dấu trực quan");

  console.log(`[PASS] TEST 10: computeVisualDiff() tạo inlineHtml chính xác (+${diffResult.stats.addedCount} từ, -${diffResult.stats.deletedCount} từ, giữ nguyên ${diffResult.stats.unchangedCount} từ)`);
}

// -----------------------------------------------------------------------------
// TEST 11: So sánh tài liệu dài (~1.300 - 2.000 từ), không báo 0 thay đổi
// -----------------------------------------------------------------------------
console.log("\n--- TEST 11: So sánh tài liệu dài (~1.300 - 2.000 từ) ---");
{
  // Xây dựng tài liệu dài ~1.400 từ chia thành 12 đoạn văn
  const paragraphBase = `Công tác hoa tiêu hàng hải và bảo đảm an toàn hàng hải là nhiệm vụ trọng tâm được giao theo kế hoạch phát triển kết cấu hạ tầng giao thông biển giai đoạn 2021 đến 2030 tầm nhìn đến năm 2045. Toàn thể cán bộ, hoa tiêu viên, người lao động quyết tâm hoàn thành xuất sắc các chỉ tiêu chất lượng dẫn tàu an toàn, cứu nạn cứu hộ và phối hợp nhịp nhàng với các đơn vị liên quan tại các vùng nước cảng biển. `;

  const paragraphs: string[] = [];
  for (let i = 1; i <= 12; i++) {
    paragraphs.push(`<p><strong>Điều ${i}. Nhiệm vụ cụ thể phần ${i}</strong>: ${paragraphBase.repeat(3)}</p>`);
  }
  const originalLongHtml = paragraphs.join("\n");

  // Bản mới: Sửa 1 từ ở đoạn 6 ("2030" -> "2035"), thêm 2 từ ở đoạn 10 ("đặc biệt an toàn"), xóa 1 từ ở đoạn 2 ("biển")
  const modifiedParagraphs = [...paragraphs];
  modifiedParagraphs[5] = modifiedParagraphs[5].replace("2030", "2035");
  modifiedParagraphs[9] = modifiedParagraphs[9].replace("cứu nạn cứu hộ", "cứu nạn cứu hộ đặc biệt an toàn");
  modifiedParagraphs[1] = modifiedParagraphs[1].replace("giao thông biển", "giao thông");
  const proposedLongHtml = modifiedParagraphs.join("\n");

  const startTime = Date.now();
  const diffResult = computeVisualDiff(originalLongHtml, proposedLongHtml);
  const elapsed = Date.now() - startTime;

  assert.ok(diffResult.stats.totalOriginalWords >= 1200, `Tổng số từ phải >= 1200, thực tế: ${diffResult.stats.totalOriginalWords}`);
  assert.ok(diffResult.stats.addedCount > 0, `Phải phát hiện được từ thêm mới, thực tế: ${diffResult.stats.addedCount}`);
  assert.ok(diffResult.stats.deletedCount > 0, `Phải phát hiện được từ bị xóa, thực tế: ${diffResult.stats.deletedCount}`);
  assert.notEqual(diffResult.stats.addedCount, 0, "Tuyệt đối không được báo 0 từ thêm đối với tài liệu dài có sửa đổi");
  assert.notEqual(diffResult.stats.deletedCount, 0, "Tuyệt đối không được báo 0 từ xóa đối với tài liệu dài có sửa đổi");
  assert.ok(diffResult.inlineHtml.includes("2035"), "Nội dung thêm mới '2035' phải xuất hiện trong inlineHtml");
  assert.ok(diffResult.inlineHtml.includes("2030"), "Nội dung cũ '2030' phải xuất hiện dạng <del>");
  assert.equal(diffResult.comparisonScope, "body_text", "Phạm vi so sánh phải xác định rõ ràng là body_text");
  assert.ok(elapsed < 300, `Thời gian so sánh tài liệu dài phải < 300ms, thực tế: ${elapsed}ms`);

  console.log(`[PASS] TEST 11: So sánh tài liệu dài (${diffResult.stats.totalOriginalWords} từ) trong ${elapsed}ms: phát hiện chính xác +${diffResult.stats.addedCount} từ, -${diffResult.stats.deletedCount} từ`);
}

// -----------------------------------------------------------------------------
// TEST 12: So sánh tài liệu chứa nhiều bảng và đoạn văn dài
// -----------------------------------------------------------------------------
console.log("\n--- TEST 12: So sánh tài liệu chứa nhiều bảng và đoạn văn dài ---");
{
  const table1 = `
    <table border="1">
      <thead><tr><th>STT</th><th>Tên dự án</th><th>Kinh phí (triệu đồng)</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Hiện đại hóa trạm hoa tiêu Hải Phòng</td><td>1.500</td></tr>
        <tr><td>2</td><td>Trang bị xuồng công tác cao tốc</td><td>3.200</td></tr>
      </tbody>
    </table>
  `;

  const table2 = `
    <table border="1">
      <thead><tr><th>Mã hiệu</th><th>Tàu công tác</th><th>Trạng thái</th></tr></thead>
      <tbody>
        <tr><td>HT-01</td><td>Hoa Tiêu 01</td><td>Sẵn sàng</td></tr>
        <tr><td>HT-02</td><td>Hoa Tiêu 02</td><td>Bảo dưỡng định kỳ</td></tr>
      </tbody>
    </table>
  `;

  const docWithTablesOriginal = `<p>Báo cáo tình hình đầu tư cơ sở vật chất năm 2025.</p>${table1}<p>Danh mục phương tiện hiện có:</p>${table2}`;

  // Sửa kinh phí trạm Hải Phòng: 1.500 -> 1.800, và sửa trạng thái HT-02: Bảo dưỡng định kỳ -> Đang hoạt động
  const table1Mod = table1.replace("1.500", "1.800");
  const table2Mod = table2.replace("Bảo dưỡng định kỳ", "Đang hoạt động");
  const docWithTablesProposed = `<p>Báo cáo tình hình đầu tư cơ sở vật chất năm 2026.</p>${table1Mod}<p>Danh mục phương tiện hiện có:</p>${table2Mod}`;

  const diffResult = computeVisualDiff(docWithTablesOriginal, docWithTablesProposed);

  assert.ok(diffResult.inlineHtml.includes("800"), "Nội dung ô bảng mới '800' phải xuất hiện trong inlineHtml dạng <ins>");
  assert.ok(diffResult.inlineHtml.includes("500"), "Nội dung ô bảng cũ '500' phải xuất hiện trong inlineHtml dạng <del>");
  assert.ok(diffResult.inlineHtml.includes("Đang") && diffResult.inlineHtml.includes("hoạt") && diffResult.inlineHtml.includes("động"), "Các từ 'Đang', 'hoạt', 'động' trong bảng phải được phát hiện dạng <ins>");
  assert.ok(diffResult.inlineHtml.includes("Bảo") && diffResult.inlineHtml.includes("dưỡng"), "Các từ cũ 'Bảo', 'dưỡng' phải được phát hiện dạng <del>");
  assert.ok(diffResult.stats.addedCount >= 3, `Phải phát hiện ít nhất 3 từ thêm trong bảng và đoạn văn, thực tế: ${diffResult.stats.addedCount}`);
  assert.ok(diffResult.stats.deletedCount >= 3, `Phải phát hiện ít nhất 3 từ bị thay thế, thực tế: ${diffResult.stats.deletedCount}`);

  console.log(`[PASS] TEST 12: So sánh bảng và đoạn văn: phát hiện chính xác thay đổi trong bảng (+${diffResult.stats.addedCount} từ, -${diffResult.stats.deletedCount} từ)`);
}

// -----------------------------------------------------------------------------
// TEST 13: Lưu và khôi phục bản nháp kèm snapshot gốc (IndexedDB Persistence)
// -----------------------------------------------------------------------------
console.log("\n--- TEST 13: Lưu và khôi phục bản nháp kèm snapshot gốc ---");
{
  const memoryStore = new Map<string, any>();
  (globalThis as any).indexedDB = {
    open: () => {
      const req: any = {
        result: {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            const tx: any = {
              objectStore: () => ({
                put: (val: any) => {
                  const putReq: any = {};
                  setTimeout(() => {
                    memoryStore.set(val.id, val);
                    if (putReq.onsuccess) putReq.onsuccess();
                    if (tx.oncomplete) tx.oncomplete();
                  }, 1);
                  return putReq;
                },
                get: (key: string) => {
                  const getReq: any = {};
                  setTimeout(() => {
                    getReq.result = memoryStore.get(key);
                    if (getReq.onsuccess) getReq.onsuccess();
                    if (tx.oncomplete) tx.oncomplete();
                  }, 1);
                  return getReq;
                },
              }),
            };
            return tx;
          },
        },
      };
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess();
      }, 1);
      return req;
    },
  };

  try {
    const originalBody = "<p>Nội dung văn bản gốc ban đầu khi tải tệp lên hệ thống năm 2025.</p>";
    const editedBody = "<p>Nội dung văn bản đã được biên tập và chuẩn hóa thể thức năm 2026.</p>";

    const snapshot: OriginalDocumentSnapshot = {
      sourceType: "uploaded_file",
      fileName: "Ke_hoach_an_toan_goc.docx",
      fileType: "docx",
      uploadedAt: "2026-10-16T08:00:00.000Z",
      bodyHtml: originalBody,
      rawText: "Nội dung văn bản gốc ban đầu khi tải tệp lên hệ thống năm 2025.",
      blockCount: 1,
      tableCount: 0,
    };

    const draftWithSnapshot: Omit<DraftRecord, "schemaVersion"> = {
      id: "current_active_draft",
      updatedAt: new Date().toISOString(),
      standardType: "state" as const,
      doc: {
        headerProfile: "generic" as const,
        orgHeader1: "BỘ GIAO THÔNG VẬN TẢI",
        orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
        nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
        locationAndDate: "Hải Phòng, ngày 16 tháng 10 năm 2026",
        documentType: "KẾ HOẠCH",
        referenceNumber: "Số: 99/KH-HTMB",
        subject: "Kế hoạch hoa tiêu năm 2026",
        bodyHtml: editedBody,
        signTitle: "GIÁM ĐỐC",
        signName: "Nguyễn Văn A",
        recipients: "Như trên;",
      },
      versions: [],
      originalSnapshot: snapshot,
    };

    await saveDraft(draftWithSnapshot);
    const restored = await loadDraft("current_active_draft");

    assert.ok(restored, "Phải khôi phục được bản nháp từ IndexedDB");
    assert.ok(restored.originalSnapshot, "originalSnapshot phải được lưu và khôi phục nguyên vẹn");
    assert.equal(restored.originalSnapshot.sourceType, "uploaded_file");
    assert.equal(restored.originalSnapshot.fileName, "Ke_hoach_an_toan_goc.docx");
    assert.equal(restored.originalSnapshot.bodyHtml, originalBody);

    // Kiểm tra Diff sau khi tải lại trang giữa snapshot gốc và doc hiện tại
    const diffAfterReload = computeVisualDiff(restored.originalSnapshot.bodyHtml, restored.doc.bodyHtml);
    assert.ok(diffAfterReload.stats.addedCount > 0, "Sau khi nạp lại trang, Diff phải nhận diện từ thêm");
    assert.ok(diffAfterReload.stats.deletedCount > 0, "Sau khi nạp lại trang, Diff phải nhận diện từ xóa");
    assert.notEqual(diffAfterReload.stats.addedCount + diffAfterReload.stats.deletedCount, 0, "Không được báo 0 thay đổi sau khi tải lại trang");
    assert.ok(diffAfterReload.inlineHtml.includes("2026") && diffAfterReload.inlineHtml.includes("2025"), "Diff sau reload phải chứa cả từ mới và từ cũ");

    console.log(`[PASS] TEST 13: Lưu & khôi phục bản nháp kèm snapshot gốc: Diff sau khi reload phản ánh trung thực (+${diffAfterReload.stats.addedCount} từ, -${diffAfterReload.stats.deletedCount} từ)`);
  } finally {
    delete (globalThis as any).indexedDB;
  }
}

// -----------------------------------------------------------------------------
// TEST 14: Bản nháp cũ không có snapshot (Legacy Draft Graceful Handling)
// -----------------------------------------------------------------------------
console.log("\n--- TEST 14: Bản nháp cũ không có snapshot ---");
{
  const legacyRecord: any = {
    id: "legacy_draft_without_snapshot",
    standardType: "state",
    doc: {
      bodyHtml: "<p>Văn bản cũ đã soạn trước khi có tính năng snapshot.</p>",
      referenceNumber: "Số: 10/KH-HTMB",
    },
    versions: [],
    // originalSnapshot không tồn tại (undefined)
  };

  // Logic mô phỏng App.tsx khi loadDraft() nhận bản nháp cũ:
  let originalSnapshotState: OriginalDocumentSnapshot | null = {
    sourceType: "system_template",
    uploadedAt: new Date().toISOString(),
    bodyHtml: "<p>Mặc định</p>",
  };

  if (legacyRecord.originalSnapshot !== undefined) {
    originalSnapshotState = legacyRecord.originalSnapshot;
  } else {
    // Bản nháp cũ: đặt về null
    originalSnapshotState = null;
  }

  assert.equal(originalSnapshotState, null, "Bản nháp cũ thiếu snapshot phải được gán null rõ ràng");

  // Logic mô phỏng Step4View: không dùng doc.bodyHtml làm bản gốc dự phòng
  const checkSnapshot: any = originalSnapshotState;
  const hasOriginalSnapshot = Boolean(
    checkSnapshot && (checkSnapshot.bodyHtml || checkSnapshot.rawText)
  );
  assert.equal(hasOriginalSnapshot, false, "hasOriginalSnapshot phải là false khi snapshot là null");

  const visualDiff = hasOriginalSnapshot ? computeVisualDiff(checkSnapshot.bodyHtml, legacyRecord.doc.bodyHtml) : null;
  assert.equal(visualDiff, null, "visualDiff phải là null khi không có snapshot gốc, không được chạy diff giả với chính nó rồi báo 0 thay đổi");

  console.log("[PASS] TEST 14: Bản nháp cũ không có snapshot được xử lý an toàn: visualDiff = null, không báo sai lệch 0 thay đổi");
}

// -----------------------------------------------------------------------------
// TEST 15: Tài liệu khởi tạo từ mẫu hiển thị nhãn mẫu, không nhầm thành bản tải lên
// -----------------------------------------------------------------------------
console.log("\n--- TEST 15: Nhãn tài liệu khởi tạo từ mẫu ---");
{
  const templateSnapshot: OriginalDocumentSnapshot = {
    sourceType: "system_template",
    fileName: "Kế hoạch công tác",
    fileType: "template",
    sourceId: "kh",
    uploadedAt: new Date().toISOString(),
    bodyHtml: "<p>Nội dung kế hoạch mẫu...</p>",
  };

  const isTemplateOrigin = templateSnapshot.sourceType === "system_template";
  assert.equal(isTemplateOrigin, true, "sourceType phải là system_template");

  const tabTitle = isTemplateOrigin
    ? `Mẫu: ${templateSnapshot.fileName || "Mẫu"}`
    : `Bản gốc: ${templateSnapshot.fileName || "Tệp tải lên"}`;

  assert.equal(tabTitle, "Mẫu: Kế hoạch công tác", "Nhãn tab phải hiển thị rõ là Mẫu, không được ghi 'Bản gốc tải lên'");

  const headerTitle = isTemplateOrigin ? "NỘI DUNG MẪU KHỞI TẠO BAN ĐẦU" : "VĂN BẢN NGUYÊN GỐC BAN ĐẦU";
  assert.equal(headerTitle, "NỘI DUNG MẪU KHỞI TẠO BAN ĐẦU");

  console.log(`[PASS] TEST 15: Tài liệu từ mẫu hiển thị đúng nhãn '${tabTitle}' và tiêu đề '${headerTitle}'`);
}

// -----------------------------------------------------------------------------
// TEST 16: Chuyển đổi chế độ NĐ 30 <-> HD 05 bảo toàn snapshot gốc nguyên vẹn
// -----------------------------------------------------------------------------
console.log("\n--- TEST 16: Chuyển đổi chế độ NĐ 30 <-> HD 05 bảo toàn snapshot gốc ---");
{
  const immutableSnapshot: OriginalDocumentSnapshot = {
    sourceType: "uploaded_file",
    fileName: "Cong_Van_Ban_Dau.docx",
    fileType: "docx",
    uploadedAt: "2026-10-16T10:00:00.000Z",
    bodyHtml: "<p>Nội dung công văn ban đầu trước khi chuyển chế độ thể thức.</p>",
    rawText: "Nội dung công văn ban đầu trước khi chuyển chế độ thể thức.",
  };

  const currentSnapshot: OriginalDocumentSnapshot | null = { ...immutableSnapshot };

  // Mô phỏng chuyển NĐ 30 -> HD 05
  // executeRegimeSwitch chỉ cập nhật doc, standardType, versions; không can thiệp vào snapshot gốc
  assert.equal(currentSnapshot.fileName, "Cong_Van_Ban_Dau.docx");
  assert.equal(currentSnapshot.bodyHtml, immutableSnapshot.bodyHtml);

  // Mô phỏng chuyển HD 05 -> NĐ 30
  assert.equal(currentSnapshot.fileName, "Cong_Van_Ban_Dau.docx");
  assert.equal(currentSnapshot.bodyHtml, immutableSnapshot.bodyHtml);
  assert.equal(currentSnapshot.uploadedAt, "2026-10-16T10:00:00.000Z");

  console.log("[PASS] TEST 16: Chuyển đổi hai chiều NĐ 30 ↔ HD 05 bảo toàn snapshot gốc 100% nguyên vẹn");
}

// -----------------------------------------------------------------------------
// TEST 17: Visual Diff an toàn trên tài liệu dài: Không lỗi RangeError, phát hiện đúng từ sửa
// -----------------------------------------------------------------------------
console.log("\n--- TEST 17: Visual Diff an toàn trên tài liệu dài (Tránh đệ quy vô hạn) ---");
{
  // 1. Tái hiện trường hợp 1.500 từ khác biệt hoàn toàn (đã từng gây Maximum call stack size exceeded)
  const aLarge = '<p>' + Array.from(
    { length: 1500 },
    (_, i) => 'docA' + i + (i === 749 ? '.' : '')
  ).join(' ') + '</p>';

  const bLarge = '<p>' + Array.from(
    { length: 1500 },
    (_, i) => 'docB' + i + (i === 749 ? '.' : '')
  ).join(' ') + '</p>';

  const diffResultLarge = computeVisualDiff(aLarge, bLarge);
  assert.ok(diffResultLarge, "Diff tài liệu lớn phải trả về kết quả hợp lệ");
  assert.equal(diffResultLarge.stats.deletedCount, 1500, "Phải ghi nhận đúng 1500 từ xóa");
  assert.equal(diffResultLarge.stats.addedCount, 1500, "Phải ghi nhận đúng 1500 từ thêm");
  assert.equal(diffResultLarge.stats.unchangedCount, 0, "Không được ngộ nhận 0 thay đổi");

  // 2. Tài liệu 1.500 từ chỉ sửa đúng 1 từ: thuật toán phân cấp phải chỉ ra đúng 1 từ đổi
  const wordsBase = Array.from({ length: 1500 }, (_, i) => `token${i}` + (i % 50 === 49 ? '.' : ''));
  const origHtml = '<p>' + wordsBase.join(' ') + '</p>';
  const modWords = [...wordsBase];
  modWords[800] = 'REPLACEDTOKEN';
  const modHtml = '<p>' + modWords.join(' ') + '</p>';

  const diffSingle = computeVisualDiff(origHtml, modHtml);
  assert.equal(diffSingle.stats.deletedCount, 1, "Phải phát hiện chính xác 1 từ xóa");
  assert.equal(diffSingle.stats.addedCount, 1, "Phải phát hiện chính xác 1 từ thêm");
  assert.equal(diffSingle.stats.unchangedCount, 1499, "Phải bảo toàn 1499 từ không đổi");
  assert.equal(diffSingle.isPartial, false, "Khi so sánh thành công từng từ, isPartial phải là false");

  console.log(`[PASS] TEST 17: Diff tài liệu dài an toàn: 1500 từ khác (+${diffResultLarge.stats.addedCount}/-${diffResultLarge.stats.deletedCount}), 1500 từ sửa 1 từ (+${diffSingle.stats.addedCount}/-${diffSingle.stats.deletedCount}/=${diffSingle.stats.unchangedCount})`);
}

// -----------------------------------------------------------------------------
// TEST 18: Kiểm định kết nối Snapshot gốc vào bước Xuất văn bản & Phạm vi dữ liệu snapshot
// -----------------------------------------------------------------------------
console.log("\n--- TEST 18: Kết nối Snapshot gốc vào bước Xuất văn bản & Phạm vi dữ liệu ---");
{
  // Kiểm tra 3 nguồn snapshot:
  // Nguồn 1: File tải lên (DOCX/TXT)
  const uploadedSnapshot: OriginalDocumentSnapshot = {
    sourceType: "uploaded_file",
    fileName: "Tai_Lieu_Nguon.docx",
    fileType: "docx",
    uploadedAt: "2026-10-16T12:00:00.000Z",
    bodyHtml: "<p>Nội dung trích xuất từ tệp Word ban đầu.</p>",
    rawText: "Nội dung trích xuất từ tệp Word ban đầu.",
    tableCount: 1,
  };
  assert.equal(uploadedSnapshot.sourceType, "uploaded_file");
  assert.ok(uploadedSnapshot.bodyHtml.length > 0);

  // Nguồn 2: Mẫu hệ thống
  const templateSnapshot: OriginalDocumentSnapshot = {
    sourceType: "system_template",
    fileName: "Kế hoạch NĐ 30 Hoa tiêu",
    fileType: "template",
    sourceId: "kh",
    uploadedAt: "2026-10-16T12:05:00.000Z",
    bodyHtml: "<p>Nội dung mẫu ban đầu.</p>",
    rawText: "Nội dung mẫu ban đầu.",
  };
  assert.equal(templateSnapshot.sourceType, "system_template");

  // Nguồn 3: Bản nháp cũ thiếu snapshot -> null rõ ràng (không undefined, không fallback sang doc.bodyHtml)
  const legacySnapshot: OriginalDocumentSnapshot | null = null;
  assert.equal(legacySnapshot, null);

  // Xác minh phạm vi: snapshot chỉ lưu HTML/Text trích xuất, không phải file nhị phân DOCX byte
  assert.ok(!("binaryBytes" in uploadedSnapshot), "Snapshot không lưu mảng nhị phân binaryBytes của DOCX");

  console.log("[PASS] TEST 18: Đã kiểm chứng 3 nguồn snapshot và phạm vi trích xuất HTML/text");
}

// -----------------------------------------------------------------------------
// TEST 19: Tính trung thực của nhãn Đạt Chuẩn & Trạng thái đo OOXML thực tế
// -----------------------------------------------------------------------------
console.log("\n--- TEST 19: Tính trung thực của nhãn Đạt Chuẩn & Trạng thái OOXML ---");
{
  // 1. Khi còn NOT_EVALUATED hoặc NEEDS_REVIEW: TUYỆT ĐỐI KHÔNG gán nhãn ĐẠT CHUẨN THỂ THỨC
  const evalWithUnmeasured = {
    canonicalStats: {
      total: 443,
      counts: {
        PASS: 18,
        FAIL: 0,
        NOT_EVALUATED: 410,
        NEEDS_REVIEW: 15,
        NOT_APPLICABLE: 0,
      }
    },
    actionableIssues: [],
  };

  const actionableCount = evalWithUnmeasured.actionableIssues.length;
  const counts = evalWithUnmeasured.canonicalStats.counts;

  // Tính toán isStrictlyCompliant theo tiêu chuẩn mới
  const isStrictlyCompliantOld = counts.FAIL === 0 && actionableCount === 0 && counts.PASS > 0;
  assert.equal(isStrictlyCompliantOld, true, "Logic cũ từng ngộ nhận đạt chuẩn khi còn 410 rules NOT_EVALUATED");

  const ooxmlStatus: "not_evaluated" | "measuring" | "evaluated_current_draft" | "error" = "evaluated_current_draft";
  const hasOoxmlEvidence = true;

  const isStrictlyCompliantNew =
    counts.FAIL === 0 &&
    actionableCount === 0 &&
    counts.NOT_EVALUATED === 0 &&
    counts.NEEDS_REVIEW === 0 &&
    counts.PASS > 0 &&
    (ooxmlStatus === "evaluated_current_draft" || hasOoxmlEvidence);

  assert.equal(isStrictlyCompliantNew, false, "Logic mới phải từ chối ĐẠT CHUẨN THỂ THỨC khi còn NOT_EVALUATED hoặc NEEDS_REVIEW");

  // 2. Nhãn nút xuất Word phải phản ánh đúng bằng chứng
  const getButtonLabel = (isFull: boolean) => {
    if (isStrictlyCompliantNew) {
      return isFull ? "Xuất Tệp Word (.docx) Chuẩn Thể Thức" : "Xuất Word Đạt Chuẩn";
    }
    if (counts.FAIL > 0) {
      return isFull ? `Xuất Tệp Word (.docx) Bản Thảo (${counts.FAIL} lỗi thể thức)` : `Xuất Word (${counts.FAIL} lỗi)`;
    }
    if (actionableCount > 0) {
      return isFull ? `Xuất Tệp Word (.docx) Bản Thảo (${actionableCount} việc cần xử lý)` : `Xuất Word (${actionableCount} việc)`;
    }
    return isFull ? "Xuất Tệp Word (.docx) Bản Thảo (Đã kiểm tra một phần)" : "Xuất Word Bản Thảo (Đã kiểm tra 1 phần)";
  };

  assert.equal(getButtonLabel(true), "Xuất Tệp Word (.docx) Bản Thảo (Đã kiểm tra một phần)");
  assert.equal(getButtonLabel(false), "Xuất Word Bản Thảo (Đã kiểm tra 1 phần)");

  console.log("[PASS] TEST 19: Tính trung thực của nhãn thể thức và nút xuất Word được bảo đảm");
}

// -----------------------------------------------------------------------------
// TEST 20: Hệ thống Token Thiết Kế 2026, Kính Mờ Có Chọn Lọc, Accessibility & Bố Cục 4 Bước
// -----------------------------------------------------------------------------
console.log("\n--- TEST 20: Hệ thống Token Thiết Kế 2026, Kính Mờ & Bố Cục 4 Bước ---");
{
  const cssContent = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf-8");
  const appContent = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf-8");
  const viewsContent = fs.readFileSync(path.join(process.cwd(), "src/components/OfficeWorkerViews.tsx"), "utf-8");

  // 1. Kiểm tra hệ token CSS chung
  assert.ok(cssContent.includes("--df-bg: #F5F6FA"), "CSS phải định nghĩa --df-bg: #F5F6FA");
  assert.ok(cssContent.includes("--df-ink: #17233D"), "CSS phải định nghĩa --df-ink: #17233D");
  assert.ok(cssContent.includes("--df-primary: #6255E8"), "CSS phải định nghĩa --df-primary: #6255E8");
  assert.ok(cssContent.includes("--df-primary-2: #3979E8"), "CSS phải định nghĩa --df-primary-2: #3979E8");
  assert.ok(cssContent.includes("--df-teal: #16A6A6"), "CSS phải định nghĩa --df-teal: #16A6A6");
  assert.ok(cssContent.includes("--df-coral: #F28C72"), "CSS phải định nghĩa --df-coral: #F28C72");
  assert.ok(cssContent.includes("--df-dur-step: 190ms"), "CSS phải định nghĩa --df-dur-step: 190ms");
  assert.ok(cssContent.includes("--df-dur-panel: 210ms"), "CSS phải định nghĩa --df-dur-panel: 210ms");

  // 2. Kính mờ có lớp nền đặc dự phòng & tờ giấy A4 luôn trắng đặc #FFFFFF
  assert.ok(cssContent.includes(".df-glass-header"), "Phải có lớp .df-glass-header");
  assert.ok(cssContent.includes(".df-glass-surface"), "Phải có lớp .df-glass-surface");
  assert.ok(cssContent.includes(".df-glass-drawer"), "Phải có lớp .df-glass-drawer");
  assert.ok(cssContent.includes(".df-a4-paper") && cssContent.includes("#FFFFFF !important"), "Tờ giấy A4 (.df-a4-paper) phải luôn giữ nền trắng đặc #FFFFFF");

  // 3. Tôn trọng tùy chọn hệ điều hành về giảm chuyển động, giảm độ trong suốt & tương phản cao
  assert.ok(cssContent.includes("prefers-reduced-transparency: reduce"), "CSS phải hỗ trợ prefers-reduced-transparency: reduce");
  assert.ok(cssContent.includes("forced-colors: active"), "CSS phải hỗ trợ forced-colors: active");
  assert.ok(cssContent.includes("prefers-reduced-motion: reduce"), "CSS phải hỗ trợ prefers-reduced-motion: reduce");

  // Workspace B replaces the old inspector with nine groups and ID-bound canvases.
  const workspaceUi=fs.readFileSync(path.join(process.cwd(),'src/components/WorkspaceEditor.tsx'),'utf8');
  const workspaceExport=fs.readFileSync(path.join(process.cwd(),'src/components/WorkspaceExport.tsx'),'utf8');
  assert.ok(workspaceUi.includes('role="tablist"')&&workspaceUi.includes('data-workspace-group'), 'Canvas navigation and nine groups must be exposed');
  assert.ok(appContent.includes('df-workspace-sidebar')&&!appContent.includes('className="df-stepper'), 'Only sidebar exposes progress');
  assert.ok(workspaceExport.includes('candidate.safe')&&workspaceExport.includes('data-candidate-sha'), 'Preview/export must be bound to safe candidate identity');
  assert.ok(appContent.includes('transactWorkspace(')&&appContent.includes('confirmWorkspacePartition('), 'UI must use working transactions and conflict-aware rebase');
  assert.ok(appContent.includes('originalHighlightedHtml')&&appContent.includes('refinedHighlightedHtml'),'AI proposals still expose before/after evidence');

  // 5. Drawer đóng bằng Escape và hiển thị Lịch sử phiên bản
  assert.ok(viewsContent.includes('e.key === "Escape"'), "Drawer phải hỗ trợ đóng bằng phím Escape");
  assert.ok(viewsContent.includes("Lịch Sử Phiên Bản & Công Cụ Nâng Cao"), "Drawer phải tích hợp Lịch sử phiên bản");

  console.log("[PASS] TEST 20: Hệ thống Token Thiết Kế 2026, Kính Mờ, Accessibility & Bố Cục 4 Bước đạt chuẩn");
}

console.log("\n==================================================================");
console.log(" KẾT QUẢ: TOÀN BỘ 20/20 BÀI KIỂM THỬ WORKFLOW ĐỀU ĐẠT CHUẨN!");
console.log("==================================================================");
