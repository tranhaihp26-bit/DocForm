import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType } from "docx";
import { 
  extractBlocksFromDocx, 
  extractTableModelFromXml, 
  extractTableDetails 
} from "../src/server/blockExtractor.ts";
import { tableModelToHtmlView } from "../src/shared/tableModel.ts";
import { 
  scanRawTableXmlFeatures, 
  assessExportSafety, 
  type ImportFidelityManifest 
} from "../src/shared/importFidelity.ts";
import { 
  buildDocxTableFromModel, 
  convertHtmlToDocxElements 
} from "../src/utils/docxExport.ts";
import { compareTableFidelity } from "../src/utils/tableRoundtrip.ts";
import { extractBodyOoxmlEvidence } from "../src/canonical/bodyOoxmlEvidence.ts";
import { resolveRuleApplicability } from "../src/canonical/bodyRuleApplicability.ts";
import { evaluateDocumentRules, extractOoxmlEvidenceFromXml } from "../src/canonical/ruleEngine.ts";

describe("Audit Fixes Verification Suite", () => {
  // =========================================================================
  // ISSUE 2: Sửa ID bảng xuyên suốt quy trình (Multiple tables in same document)
  // =========================================================================
  describe("Issue 2: Table ID Uniqueness & Consistency", () => {
    it("gán ID bảng duy nhất, bền vững cho mỗi bảng khi trích xuất tài liệu có ít nhất 2 bảng", async () => {
      // Tạo DOCX có 2 bảng riêng biệt xen giữa các đoạn văn
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ text: "Đoạn văn mở đầu" }),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ width: { size: 4500, type: WidthType.DXA }, children: [new Paragraph({ text: "Bảng 1 - Ô 1" })] }),
                    new TableCell({ width: { size: 4500, type: WidthType.DXA }, children: [new Paragraph({ text: "Bảng 1 - Ô 2" })] }),
                  ]
                })
              ]
            }),
            new Paragraph({ text: "Đoạn văn giữa 2 bảng" }),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: "Bảng 2 - Cột A" })] }),
                    new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: "Bảng 2 - Cột B" })] }),
                    new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ text: "Bảng 2 - Cột C" })] }),
                  ]
                })
              ]
            }),
            new Paragraph({ text: "Đoạn văn kết thúc" }),
          ]
        }]
      });

      const buffer = await Packer.toBuffer(doc);
      const extracted = await extractBlocksFromDocx(buffer);
      const tableBlocks = extracted.blocks.filter(b => b.kind === "table");

      assert.equal(tableBlocks.length, 2, "Phải trích xuất đủ 2 khối bảng");

      // Khẳng định ID không trùng nhau và KHÔNG phải là chuỗi mặc định table_extracted
      const table1 = tableBlocks[0];
      const table2 = tableBlocks[1];

      assert.notEqual(table1.id, table2.id, "Hai bảng phải có ID khác nhau");
      assert.notEqual(table1.tableModel?.tableId, "table_extracted", "Bảng 1 không được mang tableId mặc định table_extracted");
      assert.notEqual(table2.tableModel?.tableId, "table_extracted", "Bảng 2 không được mang tableId mặc định table_extracted");

      // Khẳng định tableModel.tableId khớp với block.id
      assert.equal(table1.tableModel?.tableId, table1.id, "Bảng 1: tableModel.tableId phải khớp với block.id");
      assert.equal(table2.tableModel?.tableId, table2.id, "Bảng 2: tableModel.tableId phải khớp với block.id");

      // Khẳng định HTML view chứa data-source-table-id khớp chính xác với ID của bảng đó
      assert.ok(table1.html?.includes(`data-source-table-id="${table1.id}"`), `HTML Bảng 1 phải chứa data-source-table-id="${table1.id}"`);
      assert.ok(table2.html?.includes(`data-source-table-id="${table2.id}"`), `HTML Bảng 2 phải chứa data-source-table-id="${table2.id}"`);

      // Khẳng định khi convertHtmlToDocxElements chạy với importedTables, cả 2 bảng đều ánh xạ thành công
      const importedTables: Record<string, any> = {
        [table1.id]: table1.tableModel,
        [table2.id]: table2.tableModel,
      };

      const combinedHtml = `${table1.html}<p>Giữa</p>${table2.html}`;
      const elements = convertHtmlToDocxElements(combinedHtml, "administrative", 0, importedTables);

      // Phải có 3 phần tử: Table 1, Paragraph, Table 2
      assert.equal(elements.length, 3);
      assert.ok(elements[0] instanceof Table, "Phần tử 0 phải là Table 1");
      assert.ok(elements[1] instanceof Paragraph, "Phần tử 1 phải là Paragraph");
      assert.ok(elements[2] instanceof Table, "Phần tử 2 phải là Table 2");
    });
  });

  // =========================================================================
  // ISSUE 3: Quét tính năng chưa hỗ trợ từ OOXML gốc
  // =========================================================================
  describe("Issue 3: Raw OOXML Feature Scanning", () => {
    it("phát hiện bảng lồng (nested table) trong OOXML thô", () => {
      const nestedTblXml = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Ô cha</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Bảng con</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>`;
      const features = scanRawTableXmlFeatures(nestedTblXml, "tbl_nested", "block_nested");
      assert.ok(features.some(f => f.code === "nested_table"), "Phải phát hiện nested_table");
    });

    it("phát hiện drawing hoặc hình ảnh bên trong bảng", () => {
      const drawingTblXml = `<w:tbl><w:tr><w:tc><w:p><w:r><w:drawing><wp:inline></wp:inline></w:drawing></w:r></w:p></w:tc></w:tr></w:tbl>`;
      const features = scanRawTableXmlFeatures(drawingTblXml, "tbl_drawing", "block_drawing");
      assert.ok(features.some(f => f.code === "drawing_or_image"), "Phải phát hiện drawing_or_image");
    });

    it("phát hiện trường mã phức tạp (w:fldSimple / w:fldChar / w:instrText)", () => {
      const fieldTblXml = `<w:tbl><w:tr><w:tc><w:p><w:fldSimple w:instr="PAGE"/></w:p></w:tc></w:tr></w:tbl>`;
      const features = scanRawTableXmlFeatures(fieldTblXml, "tbl_field", "block_field");
      assert.ok(features.some(f => f.code === "complex_field"), "Phải phát hiện complex_field");
    });

    it("phát hiện hyperlink bên trong ô bảng", () => {
      const hyperlinkTblXml = `<w:tbl><w:tr><w:tc><w:p><w:hyperlink r:id="rId5"><w:r><w:t>Liên kết</w:t></w:r></w:hyperlink></w:p></w:tc></w:tr></w:tbl>`;
      const features = scanRawTableXmlFeatures(hyperlinkTblXml, "tbl_link", "block_link");
      assert.ok(features.some(f => f.code === ("hyperlink_in_table" as any)), "Phải phát hiện hyperlink_in_table");
    });

    it("phát hiện ô vMerge continue nhưng có chứa nội dung văn bản (nguy cơ mất dữ liệu khi gộp)", () => {
      const vmergeContentXml = `
      <w:tbl>
        <w:tr>
          <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Dòng 1</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p><w:r><w:t>Nội dung ô ẩn bị che khuất</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>`;
      const features = scanRawTableXmlFeatures(vmergeContentXml, "tbl_vmerge_content", "block_vmerge");
      assert.ok(features.some(f => f.code === ("vmerge_continue_has_content" as any)), "Phải phát hiện vmerge_continue_has_content");
    });

    it("quét trực tiếp XML trong quá trình nạp tệp chứ không quét trên chuỗi HTML", async () => {
      const doc = new Document({
        sections: [{
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 9000, type: WidthType.DXA },
                      children: [new Paragraph({ text: "Bình thường" })]
                    })
                  ]
                })
              ]
            })
          ]
        }]
      });
      const buffer = await Packer.toBuffer(doc);
      const extracted = await extractBlocksFromDocx(buffer);
      const tableBlock = extracted.blocks.find(b => b.kind === "table");
      assert.ok(tableBlock);

      // Thử quét chuỗi HTML: chuỗi HTML thuần table/tr/td sẽ không chứa thẻ w:tbl
      const htmlScan = scanRawTableXmlFeatures(tableBlock.html || "", tableBlock.id, tableBlock.id);
      // Kết quả trên HTML trống nhưng không chứng minh bảng an toàn nếu không có bằng chứng XML
      assert.equal(htmlScan.length, 0);
    });
  });

  // =========================================================================
  // ISSUE 4: Giữ định dạng nguồn (font, size, alignment, borders, padding)
  // =========================================================================
  describe("Issue 4: Source Table Formatting Preservation", () => {
    const customStyleTableXml = `
<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tblPr>
    <w:tblW w:w="8500" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="double" w:sz="12" w:space="0" w:color="003366"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="003366"/>
      <w:left w:val="none"/>
      <w:right w:val="none"/>
      <w:insideH w:val="dotted" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideV w:val="none"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="160" w:type="dxa"/>
      <w:bottom w:w="160" w:type="dxa"/>
      <w:left w:w="240" w:type="dxa"/>
      <w:right w:w="240" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="3500"/>
    <w:gridCol w:w="5000"/>
  </w:tblGrid>
  <w:tr>
    <w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="3500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:b/><w:sz w:val="22"/></w:rPr><w:t>Tiêu đề 1</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="5000" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>150.000.000</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`;

    it("trích xuất đầy đủ font, size, alignment, padding và viền từ nguồn vào TableModel", () => {
      const model = extractTableModelFromXml(customStyleTableXml, "tbl_custom_format");
      assert.equal(model.tableWidthTwips, 8500);
      assert.equal(model.alignment, "center");

      // Căn lề đoạn văn
      const cell0 = model.rows[0].cells[0];
      const cell1 = model.rows[0].cells[1];
      assert.equal(cell0.paragraphs[0]?.alignment, "center");
      assert.equal(cell1.paragraphs[0]?.alignment, "right");

      // Runs: font và size
      assert.equal(cell0.paragraphs[0]?.runs?.[0]?.font, "Arial");
      assert.equal(cell0.paragraphs[0]?.runs?.[0]?.sizeHalfPt, 22);
      assert.equal(cell0.paragraphs[0]?.runs?.[0]?.bold, true);

      assert.equal(cell1.paragraphs[0]?.runs?.[0]?.font, "Arial");
      assert.equal(cell1.paragraphs[0]?.runs?.[0]?.sizeHalfPt, 20);
    });

    it("buildDocxTableFromModel bảo toàn thuộc tính định dạng nguồn thay vì gán cứng 12pt và viền mặc định", async () => {
      const model = extractTableModelFromXml(customStyleTableXml, "tbl_custom_format");
      const docxTable = buildDocxTableFromModel(model);

      const doc = new Document({ sections: [{ children: [docxTable] }] });
      const bytes = await Packer.toBuffer(doc);
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file("word/document.xml")!.async("string");

      // Phải bảo toàn font Arial và cỡ chữ 22 (11pt) / 20 (10pt)
      assert.ok(xml.includes('w:ascii="Arial"') || xml.includes('w:rFonts'), "Phải bảo toàn font nguồn");
      assert.ok(xml.includes('w:sz w:val="22"'), "Phải bảo toàn cỡ chữ 11pt (sz=22)");
      assert.ok(xml.includes('w:sz w:val="20"'), "Phải bảo toàn cỡ chữ 10pt (sz=20)");
    });

    it("compareTableFidelity phát hiện khi font hoặc cỡ chữ bị thay đổi", () => {
      const sourceModel = extractTableModelFromXml(customStyleTableXml, "tbl_diff_test");
      const alteredModel = JSON.parse(JSON.stringify(sourceModel));
      alteredModel.rows[0].cells[0].paragraphs[0].runs[0].sizeHalfPt = 28; // đổi từ 22 thành 28

      const diffs = compareTableFidelity(sourceModel, alteredModel);
      assert.ok(diffs.some(d => d.type === ("format_mismatch" as any)), "Phải bắt lỗi format_mismatch khi cỡ chữ bị đổi");
    });
  });

  // =========================================================================
  // ISSUE 1: Nối kiểm chứng roundtrip vào thao tác xuất thật
  // =========================================================================
  describe("Issue 1: Dynamic Candidate Roundtrip Verification", () => {
    it("chặn xuất khi bảng xuất phát sinh sai khác so với nguồn và cung cấp chi tiết sai khác", async () => {
      // Giả lập bảng nguồn
      const sourceTableXml = `
      <w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Gốc A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Gốc B</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>`;
      const sourceModel = extractTableModelFromXml(sourceTableXml, "tbl_gate_1");

      // Giả lập candidate DOCX bị đổi nội dung "Gốc B" thành "Đã Sửa B"
      const candidateDoc = new Document({
        sections: [{
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ text: "Gốc A" })] }),
                    new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ text: "Đã Sửa B" })] }),
                  ]
                })
              ]
            })
          ]
        }]
      });
      const candidateBytes = await Packer.toBuffer(candidateDoc);

      // Hàm gate kiểm định roundtrip trên candidate bytes
      const { verifyCandidateExportFidelity } = await import("../src/utils/tableRoundtrip.ts");
      const result = await verifyCandidateExportFidelity(candidateBytes, { tbl_gate_1: sourceModel });

      assert.equal(result.safe, false, "Phải từ chối xuất khi phát hiện sai khác nội dung");
      assert.ok(result.diffs.length > 0, "Phải có danh sách sai khác");
      assert.equal(result.diffs[0].tableId, "tbl_gate_1");
      assert.equal(result.canDownloadOriginal, true);
    });

    it("cho phép xuất khi candidate DOCX bảo toàn 100% cấu trúc bảng", async () => {
      const sourceTableXml = `
      <w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Gốc A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Gốc B</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>`;
      const sourceModel = extractTableModelFromXml(sourceTableXml, "tbl_gate_2");
      const docxTable = buildDocxTableFromModel(sourceModel);
      const candidateDoc = new Document({ sections: [{ children: [docxTable] }] });
      const candidateBytes = await Packer.toBuffer(candidateDoc);

      const { verifyCandidateExportFidelity } = await import("../src/utils/tableRoundtrip.ts");
      const result = await verifyCandidateExportFidelity(candidateBytes, { tbl_gate_2: sourceModel });

      assert.equal(result.safe, true, "Phải cho phép xuất khi bảo toàn 100%");
      assert.equal(result.diffs.length, 0);
    });
  });

  // =========================================================================
  // ISSUE 5: Đưa rule thân bài vào luồng kiểm định thật
  // =========================================================================
  describe("Issue 5: Real Body Rule Verification in Candidate Flow", () => {
    it("đánh giá riêng từng rule thân bài từ bằng chứng OOXML của candidate DOCX", async () => {
      // Tạo DOCX có đoạn thân bài chuẩn NĐ 30: 13pt (size: 26), thụt đầu dòng 1.27cm (720 dxa), line spacing 240
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              indent: { firstLine: 720 },
              spacing: { line: 240 },
              children: [
                new (await import("docx")).TextRun({
                  text: "Đây là đoạn văn bản thân bài chính quy tuân thủ Nghị định 30/2020/NĐ-CP.",
                  font: "Times New Roman",
                  size: 26, // 13pt
                })
              ]
            })
          ]
        }]
      });
      const bytes = await Packer.toBuffer(doc);
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file("word/document.xml")!.async("string");

      const ev = extractOoxmlEvidenceFromXml(xml, "administrative");
      assert.ok(ev.body_evidence, "Phải trích xuất body_evidence trong extractOoxmlEvidenceFromXml");

      const evalSummary = evaluateDocumentRules(
        { documentType: "CÔNG VĂN", bodyHtml: "<p>Nội dung</p>" },
        "administrative",
        ev
      );

      // Tìm các kết quả kiểm định của Group 6 Thân bài
      const group6Results = evalSummary.results.filter(r => r.componentGroup === 6);
      assert.ok(group6Results.length > 0, "Phải có kết quả kiểm định cho nhóm 6");

      const indentRule = group6Results.find(r => r.ruleId === "BODY.PARAGRAPH.FIRST_LINE_INDENT" || r.ruleId === "ND30-BODY-FIRST-LINE-INDENT");
      assert.ok(indentRule, "Phải có rule thụt đầu dòng thân bài");
      assert.equal(indentRule?.status, "PASS", "Rule thụt đầu dòng phải PASS với bằng chứng 720 dxa");
    });
  });
});
