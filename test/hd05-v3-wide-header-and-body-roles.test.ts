import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { generateND30DocxUint8Array } from "../src/utils/docxExport.ts";
import { applyCompanyHD05Profile, COMPANY_HEADER_HD05_TABLE_TWIPS } from "../src/canonical/hd05/companyHeaderHD05.ts";
import { COMPANY_HD05_BODY_PROFILE } from "../src/canonical/nd30/companyBodyProfile.ts";
import { evaluateDocumentRules, extractOoxmlEvidenceFromXml } from "../src/canonical/ruleEngine.ts";

describe("HD05 Wide Header V3 & Body Role-Based Formatting Verification", () => {
  it("should generate Wide Header V3 matching user reference file measurements exactly", async () => {
    assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.width, 9980, "tblW must be 9980 twips");
    assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.left, 5540, "Left column must be 5540 twips");
    assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.right, 4440, "Right column must be 4440 twips");
    assert.equal(COMPANY_HEADER_HD05_TABLE_TWIPS.indent, -593, "tblInd must be -593 twips");

    const docData = applyCompanyHD05Profile({
      regime: "party" as const,
      documentType: "NGHỊ QUYẾT",
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY\nBẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "ĐẢNG ỦY CÔNG TY\nHOA TIÊU HÀNG HẢI MIỀN BẮC",
      referenceNumber: "Số 01-NQ/ĐU",
      locationAndDate: "Hải Phòng, ngày 05 tháng 11 năm 2026",
      subject: "Về việc thực hiện nhiệm vụ công tác năm 2026",
      bodyHtml: `
        <h1>PHẦN I: TỔNG QUAN TÌNH HÌNH</h1>
        <p>Đoạn văn mở đầu thứ nhất của nghị quyết về tình hình thực hiện nhiệm vụ.</p>
        <p>Bảng 1. Danh mục chỉ tiêu kế hoạch năm 2026</p>
        <p>Điều 1. Mục tiêu và phương hướng trọng tâm</p>
        <p>1. Cụ thể hóa các chỉ tiêu về an toàn hàng hải và dẫn tàu.</p>
        <p>Căn cứ Nghị quyết Đại hội Đảng bộ Công ty nhiệm kỳ 2025-2030;</p>
      `,
      signTitle: "T/M ĐẢNG ỦY\nBÍ THƯ",
      signName: "Nguyễn Văn B",
      recipients: "- Các chi bộ trực thuộc;\n- Lưu: VP Đảng ủy.",
      fontFamily: "Times New Roman",
      fontSize: 14,
    });

    const buf = await generateND30DocxUint8Array(docData as any);
    assert.ok(buf && buf.length > 0, "DOCX buffer must be generated");

    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string") || "";

    // 1. Kiểm tra Bảng Header V3
    const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
    assert.ok(tblMatch, "Header table must exist");
    const tbl = tblMatch[0];

    assert.ok(tbl.includes('w:w="9980"'), "Table width must be 9980 dxa");
    assert.ok(tbl.includes('w:w="-593"'), "Table indent must be -593 dxa");
    assert.ok(tbl.includes('<w:gridCol w:w="5540"/>'), "Left column grid must be 5540 dxa");
    assert.ok(tbl.includes('<w:gridCol w:w="4440"/>'), "Right column grid must be 4440 dxa");

    // 2. Cả 2 ô đều căn giữa
    const cells = Array.from(tbl.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map(m => m[0]);
    assert.equal(cells.length, 2, "Header table must have 2 cells");
    assert.ok(cells[0].includes('w:jc w:val="center"'), "Left cell paragraphs must be center-aligned");
    assert.ok(cells[1].includes('w:jc w:val="center"'), "Right cell paragraphs must be center-aligned in V3");

    // 3. Shape line DrawingML V3 neo trong đoạn tiêu đề
    assert.ok(xml.includes('cx="2595245"'), "Shape line width must match 2595245 EMU (~72.09mm)");
    assert.ok(xml.includes('<wp:posOffset>113030</wp:posOffset>'), "Shape line positionH offset must match 113030 EMU");
    assert.ok(xml.includes('<wp:posOffset>240665</wp:posOffset>'), "Shape line positionV offset must match 240665 EMU");
    assert.ok(xml.includes('relativeFrom="column"'), "Shape line must anchor relativeFrom column");
    assert.ok(xml.includes('relativeFrom="paragraph"'), "Shape line must anchor relativeFrom paragraph");

    // 4. Kiểm tra thụt đầu dòng HD05 Body ~10mm (567 twips)
    assert.equal(Math.round(COMPANY_HD05_BODY_PROFILE.body.firstLineIndentIn * 1440), 567, "Company HD05 body first line indent must be 567 twips (~10mm)");

    // 5. Kiểm tra Role-based separation: H1 và Tiêu đề bảng KHÔNG bị ép Justify hay First-line 720
    const bodyXml = xml.slice(xml.indexOf("</w:tbl>"));

    // H1 phải căn giữa (center), không có thụt đầu dòng w:firstLine="720"
    const h1Match = bodyXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?PHẦN I: TỔNG QUAN TÌNH HÌNH(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/);
    assert.ok(h1Match, "H1 paragraph must exist");
    assert.ok(h1Match[0].includes('w:jc w:val="center"'), "H1 must be center-aligned");
    assert.ok(!h1Match[0].includes('w:firstLine="720"'), "H1 must NOT have 720 firstLine indent");

    // Tiêu đề bảng phải không có w:firstLine="720"
    const tblTitleMatch = bodyXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?Bảng 1\. Danh mục chỉ tiêu(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/);
    assert.ok(tblTitleMatch, "Table title paragraph must exist");
    assert.ok(!tblTitleMatch[0].includes('w:firstLine="720"'), "Table title must NOT have 720 firstLine indent");

    // Đoạn văn thân bài thường phải có thụt đầu dòng 567 twips
    const pNormalMatch = bodyXml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?Đoạn văn mở đầu thứ nhất(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/);
    assert.ok(pNormalMatch, "Normal paragraph must exist");
    assert.ok(pNormalMatch[0].includes('w:firstLine="567"'), "Normal HD05 body paragraph must have 567 firstLine indent");

    // 6. Kiểm tra rule evaluation đạt chuẩn
    const ev = extractOoxmlEvidenceFromXml(xml, "party");
    const audit = evaluateDocumentRules(docData, "party", ev);
    assert.ok(audit, "Audit must execute successfully");
    const indentRule = audit.results.find((rule: any) => rule.ruleId === "HD05-BODY-FIRST-LINE-INDENT");
    assert.equal(indentRule?.status, "PASS", "Generated 567 dxa HD05 body indent must pass its rule");
  });
});
