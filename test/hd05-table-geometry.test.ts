/**
 * @file hd05-table-geometry.test.ts
 * @description Automated regression tests for HD05 header table layout, zero cell margins,
 * dynamic column width allocation, and 14pt date wrapping prevention.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { generateND30DocxUint8Array, estimateTimesNewRomanWidthTwips } from "../src/utils/docxExport.ts";
import { applyCompanyHD05Profile } from "../src/canonical/hd05/companyHeaderHD05.ts";
import { evaluateDocumentRules, extractOoxmlEvidenceFromXml } from "../src/canonical/ruleEngine.ts";

describe("HD05 Header Table Geometry and Date Wrapping Prevention", () => {
  it("should generate zero-margin cells and match the approved 10170-twip HD05 reference geometry", async () => {
    const docData = applyCompanyHD05Profile({
      regime: "party" as const,
      documentType: "BIÊN BẢN HỌP",
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "ĐẢNG ỦY CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nĐOÀN GIÁM SÁT SỐ 05-QĐ/ĐU",
      referenceNumber: "Số 05-QĐ/ĐU",
      locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
      subject: "Biên bản họp đoàn giám sát",
      bodyHtml: "<p>Nội dung cuộc họp đoàn giám sát ngày 19/10/2026.</p>",
      signTitle: "TRƯỞNG ĐOÀN GIÁM SÁT",
      signName: "Nguyễn Văn C",
      recipients: "",
      fontFamily: "Times New Roman",
      fontSize: 14,
    });

    const buf = await generateND30DocxUint8Array(docData as any);
    assert.ok(buf && buf.length > 0, "Buffer must be generated");

    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string") || "";

    // 1. Verify Table 1 presence
    const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
    assert.ok(tblMatch, "Header table must exist");
    const tbl = tblMatch[0];

    // 2. Verify column widths in table grid
    const gridCols = Array.from(tbl.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map(m => Number(m[1]));
    assert.equal(gridCols.length, 2, "Table must have exactly 2 columns");
    const [leftCol, rightCol] = gridCols;

    assert.equal(leftCol, 5580, "HD05 left column must match the approved Word reference");
    assert.equal(rightCol, 4590, "HD05 right column must match the approved Word reference");
    assert.equal(leftCol + rightCol, 10170, "Total header table width must match the approved Word reference");
    assert.match(tbl, /<w:tblInd[^>]*w:w="-540"/, "Header table must retain the reference indent");

    // 3. Verify zero margins in both cells (<w:tcMar>)
    const cells = Array.from(tbl.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map(m => m[0]);
    assert.equal(cells.length, 2, "Header table must have 2 cells");

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      assert.ok(
        cell.includes('<w:left w:type="dxa" w:w="0"/>') || cell.includes('<w:left w:w="0"'),
        `Cell ${i} must have w:left w:w="0" margin`
      );
      assert.ok(
        cell.includes('<w:right w:type="dxa" w:w="0"/>') || cell.includes('<w:right w:w="0"'),
        `Cell ${i} must have w:right w:w="0" margin`
      );
    }

    // 4. Verify Date paragraph
    const rightCell = cells[1];
    assert.ok(rightCell.includes("Hải Phòng, ngày 19 tháng 10 năm 2026"), "Right cell must contain date string");
    assert.ok(!rightCell.includes("<w:br"), "Date paragraph must NOT contain forced break <w:br/>");
    assert.ok(rightCell.includes('w:val="28"'), "Date font size must be exactly 14pt (28 half-points)");

    // 5. Mathematical slack calculation
    const textWidth = estimateTimesNewRomanWidthTwips("Hải Phòng, ngày 19 tháng 10 năm 2026", 14, false);
    const availableWidth = rightCol; // because margins are 0
    const slack = availableWidth - textWidth;
    assert.ok(slack > 0, `Available width (${availableWidth}) must exceed text width (${textWidth}) by positive slack (${slack} twips)`);
    assert.ok(slack >= 100, `Slack must be at least 100 twips for safe rendering (actual: ${slack} twips)`);

    // 6. Verify Left cell preserves supervisory team line
    const leftCell = cells[0];
    assert.ok(leftCell.includes("ĐOÀN GIÁM SÁT SỐ 05-QĐ/ĐU"), "Left cell must preserve supervisory team line");
  });

  it("should preserve NĐ 30 administrative geometry (4116 / 5239 twips) without cross-regime distortion", async () => {
    const adminDoc = {
      regime: "administrative" as const,
      documentType: "CÔNG VĂN",
      orgHeader1: "BỘ TÀI CHÍNH",
      orgHeader2: "TỔNG CỤC THUẾ",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      referenceNumber: "Số: 789/TCT-CS",
      locationAndDate: "Hà Nội, ngày 19 tháng 10 năm 2026",
      subject: "Về việc hướng dẫn chính sách thuế",
      bodyHtml: "<p>Kính gửi: Các Cục Thuế tỉnh, thành phố trực thuộc Trung ương.</p>",
      signTitle: "TỔNG CỤC TRƯỞNG",
      signName: "Lê Văn D",
      recipients: "- Như trên;\n- Lưu: VT.",
      fontFamily: "Times New Roman",
      fontSize: 14,
    };

    const buf = await generateND30DocxUint8Array(adminDoc as any);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string") || "";

    const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
    assert.ok(tblMatch, "Admin header table must exist");
    const gridCols = Array.from(tblMatch[0].matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map(m => Number(m[1]));

    assert.equal(gridCols[0], 4116, "Admin left column must be 4116 twips");
    assert.equal(gridCols[1], 5239, "Admin right column must be 5239 twips");
    assert.equal(gridCols[0] + gridCols[1], 9355, "Total must be 9355 twips");
  });

  it("should provide formal 6-state verificationGate in evaluateDocumentRules", async () => {
    const doc = {
      regime: "party" as const,
      documentType: "BIÊN BẢN HỌP",
      orgHeader1: "ĐẢNG ỦY CÔNG TY",
      orgHeader2: "ĐOÀN GIÁM SÁT",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      referenceNumber: "Số 05-QĐ/ĐU",
      locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
      bodyHtml: "<p>Nội dung biên bản.</p>",
    };

    // When no OOXML evidence is provided
    const noEvSummary = evaluateDocumentRules(doc, "party", undefined);
    assert.equal(noEvSummary.verificationGate.status, "NOT_EVALUATED");
    assert.equal(noEvSummary.verificationGate.isStandardValidated, false);

    // When OOXML evidence is provided from generated docx
    const buf = await generateND30DocxUint8Array(doc as any);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")?.async("string") || "";
    const ev = extractOoxmlEvidenceFromXml(xml, "party");

    const evSummary = evaluateDocumentRules(doc, "party", ev);
    assert.ok(
      ["PASS", "FAIL", "PARTIAL", "NOT_EVALUATED", "MANUAL_REVIEW", "BLOCKED"].includes(evSummary.verificationGate.status),
      "verificationGate must conform to 6 formal states"
    );
  });
});
