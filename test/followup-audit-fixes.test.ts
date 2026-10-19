import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { 
  type TableModel, 
  tableModelToHtmlView 
} from "../src/shared/tableModel.ts";
import { 
  generateND30DocxUint8Array, 
  convertHtmlToDocxElements 
} from "../src/utils/docxExport.ts";
import { 
  compareTableFidelity, 
  verifyCandidateExportFidelity 
} from "../src/utils/tableRoundtrip.ts";
import { 
  extractBodyOoxmlEvidence, 
  extractDirectBodyParagraphs 
} from "../src/canonical/bodyOoxmlEvidence.ts";
import { evaluateDocumentRules } from "../src/canonical/ruleEngine.ts";
import { syncTableModelFromHtml } from "../src/utils/tableFormatUtils.ts";
import { saveSourceBlob } from "../src/utils/draftStore.ts";

describe("Follow-up Audit Fixes: Red -> Green Verification", () => {

  describe("P0 - F01: Sửa nội dung ô bảng không bị mất khi xuất DOCX", () => {
    const baseModel: TableModel = {
      tableId: "table_edit_test",
      rowsCount: 2,
      columnsCount: 2,
      gridColumnsTwips: [4000, 4000],
      tableWidthTwips: 8000,
      widthType: "dxa",
      alignment: "center",
      hasBorders: true,
      rows: [
        {
          rowIndex: 0,
          isHeader: true,
          cantSplit: true,
          cells: [
            { cellId: "c_0_0", rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "Tiêu đề 1", paragraphs: [{ text: "Tiêu đề 1" }] },
            { cellId: "c_0_1", rowIndex: 0, colIndex: 1, gridColumn: 1, gridSpan: 1, text: "Tiêu đề 2", paragraphs: [{ text: "Tiêu đề 2" }] },
          ],
        },
        {
          rowIndex: 1,
          isHeader: false,
          cantSplit: true,
          cells: [
            { cellId: "c_1_0", rowIndex: 1, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "NGUON", paragraphs: [{ text: "NGUON" }] },
            { cellId: "c_1_1", rowIndex: 1, colIndex: 1, gridColumn: 1, gridSpan: 1, text: "0123", paragraphs: [{ text: "0123" }] },
          ],
        },
      ],
    };

    it("1.1 syncTableModelFromHtml cập nhật nội dung ô đã sửa, giữ nguyên số 0 đầu và cấu trúc", () => {
      // HTML mô phỏng TipTap editor sau khi người dùng sửa "NGUON" thành "DA SUA", xóa bớt hoặc giữ số 0123
      const editedHtml = `
        <table data-source-table-id="table_edit_test">
          <tbody>
            <tr>
              <th data-cell-id="c_0_0"><p>Tiêu đề 1</p></th>
              <th data-cell-id="c_0_1"><p>Tiêu đề 2</p></th>
            </tr>
            <tr>
              <td data-cell-id="c_1_0"><p>DA SUA</p></td>
              <td data-cell-id="c_1_1"><p>0123</p></td>
            </tr>
          </tbody>
        </table>
      `;

      const { effectiveModel, userEdits } = syncTableModelFromHtml(editedHtml, baseModel);

      assert.equal(effectiveModel.rows[1].cells[0].text, "DA SUA", "Ô c_1_0 phải chứa nội dung 'DA SUA'");
      assert.equal(effectiveModel.rows[1].cells[1].text, "0123", "Số có số 0 đầu '0123' không được ép kiểu thành số 123");
      assert.equal(userEdits.length, 1, "Phải ghi nhận 1 ô đã được sửa đổi");
      assert.equal(userEdits[0].cellId, "c_1_0");
      assert.equal(userEdits[0].oldText, "NGUON");
      assert.equal(userEdits[0].newText, "DA SUA");
    });

    it("1.2 DOCX ứng viên xuất ra phải chứa 'DA SUA' và KHÔNG chứa 'NGUON' khi người dùng đã sửa", async () => {
      const editedHtml = `
        <table data-source-table-id="table_edit_test">
          <tbody>
            <tr>
              <th data-cell-id="c_0_0"><p>Tiêu đề 1</p></th>
              <th data-cell-id="c_0_1"><p>Tiêu đề 2</p></th>
            </tr>
            <tr>
              <td data-cell-id="c_1_0"><p>DA SUA</p></td>
              <td data-cell-id="c_1_1"><p>0123</p></td>
            </tr>
          </tbody>
        </table>
      `;

      const formatData: any = {
        regime: "administrative",
        headerProfile: "generic",
        documentType: "BÁO CÁO",
        subject: "Về việc thử nghiệm sửa bảng",
        bodyHtml: editedHtml,
        importedTables: {
          table_edit_test: baseModel,
        },
      };

      const candidateBytes = await generateND30DocxUint8Array(formatData);
      const zip = await JSZip.loadAsync(candidateBytes);
      const xml = await zip.file("word/document.xml")?.async("string");

      assert.ok(xml, "Phải sinh được OOXML document.xml");
      assert.ok(xml.includes("DA SUA"), "DOCX xuất ra bắt buộc phải chứa nội dung mới 'DA SUA'");
      assert.ok(!xml.includes("NGUON"), "DOCX xuất ra tuyệt đối KHÔNG được chứa chữ cũ 'NGUON'");
    });

    it("1.3 verifyCandidateExportFidelity phát hiện khi bản xuất không phản ánh sửa đổi người dùng", async () => {
      const editedHtml = `
        <table data-source-table-id="table_edit_test">
          <tbody>
            <tr>
              <th data-cell-id="c_0_0"><p>Tiêu đề 1</p></th>
              <th data-cell-id="c_0_1"><p>Tiêu đề 2</p></th>
            </tr>
            <tr>
              <td data-cell-id="c_1_0"><p>DA SUA</p></td>
              <td data-cell-id="c_1_1"><p>0123</p></td>
            </tr>
          </tbody>
        </table>
      `;

      // Candidate DOCX đúng
      const formatData: any = {
        regime: "administrative",
        headerProfile: "generic",
        documentType: "BÁO CÁO",
        subject: "Về việc thử nghiệm sửa bảng",
        bodyHtml: editedHtml,
        importedTables: {
          table_edit_test: baseModel,
        },
      };

      const candidateBytes = await generateND30DocxUint8Array(formatData);
      
      // Kiểm tra fidelity với effectiveModel (trạng thái đã duyệt)
      const { effectiveModel } = syncTableModelFromHtml(editedHtml, baseModel);
      const fidelity = await verifyCandidateExportFidelity(candidateBytes, {
        table_edit_test: effectiveModel,
      });

      assert.ok(fidelity.safe, `Candidate DOCX phản ánh đúng nội dung đã sửa: ${JSON.stringify(fidelity.diffs)}`);
      assert.equal(fidelity.diffs.length, 0);

      // Nếu gate dùng nhầm baseModel (cũ) trong khi candidate có 'DA SUA', gate phải báo content_mismatch
      const oldFidelity = await verifyCandidateExportFidelity(candidateBytes, {
        table_edit_test: baseModel,
      });
      assert.ok(!oldFidelity.safe, "Gate phải phát hiện sai khác nếu so sánh với mô hình cũ");
      assert.ok(oldFidelity.diffs.some(d => d.type === "content_mismatch"));
    });
  });

  describe("P1 - F02 & F04: Cổng kiểm chứng bảng hai chiều & sâu thuộc tính", () => {
    it("2.1 Phát hiện bảng bị thiếu, hoán đổi hoặc thừa khi đối chiếu hai chiều", async () => {
      const model1: TableModel = {
        tableId: "tbl_1",
        rowsCount: 1,
        columnsCount: 1,
        gridColumnsTwips: [5000],
        tableWidthTwips: 5000,
        widthType: "dxa",
        alignment: "center",
        hasBorders: true,
        rows: [{
          rowIndex: 0, isHeader: false, cantSplit: true,
          cells: [{ cellId: "c1", rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "Bảng 1", paragraphs: [{ text: "Bảng 1" }] }]
        }]
      };

      const model2: TableModel = {
        tableId: "tbl_2",
        rowsCount: 1,
        columnsCount: 1,
        gridColumnsTwips: [5000],
        tableWidthTwips: 5000,
        widthType: "dxa",
        alignment: "center",
        hasBorders: true,
        rows: [{
          rowIndex: 0, isHeader: false, cantSplit: true,
          cells: [{ cellId: "c2", rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "Bảng 2", paragraphs: [{ text: "Bảng 2" }] }]
        }]
      };

      // Xuất DOCX chỉ có tbl_1 nhưng importedTables yêu cầu cả tbl_1 và tbl_2
      const htmlOnly1 = `<table data-source-table-id="tbl_1"><tbody><tr><td data-cell-id="c1"><p>Bảng 1</p></td></tr></tbody></table>`;
      const formatData: any = {
        regime: "administrative",
        headerProfile: "generic",
        documentType: "BÁO CÁO",
        subject: "Kiểm thử thiếu bảng",
        bodyHtml: htmlOnly1,
        importedTables: { tbl_1: model1, tbl_2: model2 },
      };

      const candidateBytes = await generateND30DocxUint8Array(formatData);
      const fidelity = await verifyCandidateExportFidelity(candidateBytes, { tbl_1: model1, tbl_2: model2 });

      assert.ok(!fidelity.safe, "Phải từ chối an toàn khi bảng tbl_2 bị thiếu hoàn toàn");
      assert.ok(fidelity.diffs.some(d => d.tableId === "tbl_2" && d.messageVi.includes("thiếu")));
    });

    it("2.2 compareTableFidelity so sánh đầy đủ căn lề, viền, cantSplit, tblHeader, và mọi run", () => {
      const source: TableModel = {
        tableId: "t_deep",
        rowsCount: 2,
        columnsCount: 1,
        gridColumnsTwips: [5000],
        tableWidthTwips: 5000,
        widthType: "dxa",
        alignment: "center",
        hasBorders: true,
        rows: [
          {
            rowIndex: 0,
            isHeader: true,
            cantSplit: true,
            cells: [{
              cellId: "c0",
              rowIndex: 0,
              colIndex: 0,
              gridColumn: 0,
              gridSpan: 1,
              text: "Tiêu đề",
              paragraphs: [{
                text: "Tiêu đề",
                alignment: "center",
                runs: [{ text: "Tiêu đề", font: "Times New Roman", sizeHalfPt: 24, bold: true }]
              }]
            }]
          },
          {
            rowIndex: 1,
            isHeader: false,
            cantSplit: true,
            cells: [{
              cellId: "c1",
              rowIndex: 1,
              colIndex: 0,
              gridColumn: 0,
              gridSpan: 1,
              text: "Nội dung",
              paragraphs: [{
                text: "Nội dung",
                alignment: "left",
                runs: [
                  { text: "Nội dung run 1", font: "Times New Roman", sizeHalfPt: 24, bold: false },
                  { text: "Nội dung run 2", font: "Times New Roman", sizeHalfPt: 24, bold: true }
                ]
              }]
            }]
          }
        ]
      };

      // Bản output bị thay đổi alignment ở hàng 0 và mất bold ở run 2
      const modifiedOutput: TableModel = JSON.parse(JSON.stringify(source));
      modifiedOutput.rows[0].cells[0].paragraphs[0].alignment = "left";
      modifiedOutput.rows[1].cells[0].paragraphs[0].runs![1].bold = false;

      const diffs = compareTableFidelity(source, modifiedOutput);
      assert.ok(diffs.length > 0, "Phải phát hiện sai khác khi alignment hoặc run formatting bị thay đổi");
      assert.ok(diffs.some(d => d.messageVi.includes("Căn đoạn") || d.messageVi.includes("alignment") || d.type === "format_mismatch"));
    });
  });

  describe("P1 - F05 & F06: Chấm rule theo bằng chứng thật của đúng vùng", () => {
    it("5.1 BODY.TABLE.PRESERVATION và BODY.TABLE.HEADER_ROW không được PASS cố định", () => {
      // Khi không có candidate fidelity result, rule bảng phải trả NOT_EVALUATED thay vì PASS
      const emptyOoxmlEv: any = {
        header_profile: "generic",
        body_evidence: { hasDirectBodyParagraphs: true, directParagraphs: [] },
      };

      const result = evaluateDocumentRules("administrative", {} as any, emptyOoxmlEv, undefined, "Quyết định");
      const tablePres = result.results.find(r => r.ruleId === "BODY.TABLE.PRESERVATION");
      const tableHdr = result.results.find(r => r.ruleId === "BODY.TABLE.HEADER_ROW");

      assert.notEqual(tablePres?.status, "PASS", "BODY.TABLE.PRESERVATION không được tự động PASS khi chưa có kiểm chứng");
      assert.notEqual(tableHdr?.status, "PASS", "BODY.TABLE.HEADER_ROW không được tự động PASS khi chưa có kiểm chứng");
    });

    it("5.2 HD05-BODY-LINE-SPACING đánh giá MỌI đoạn thân bài: 1 đoạn sai là FAIL", () => {
      const ooxmlWithMixedSpacing: any = {
        header_profile: "generic",
        body_evidence: {
          hasDirectBodyParagraphs: true,
          directParagraphs: [
            { text: "Đoạn 1 đạt chuẩn", lineRule: "exact", lineSpacingDxa: 400, isEligibleBody: true },
            { text: "Đoạn 2 không đạt chuẩn (auto)", lineRule: "auto", lineSpacingDxa: 240, isEligibleBody: true },
          ],
        },
      };

      const result = evaluateDocumentRules("party", {} as any, ooxmlWithMixedSpacing, undefined, "Báo cáo");
      const lineRule = result.results.find(r => r.ruleId === "HD05-BODY-LINE-SPACING");

      assert.equal(lineRule?.status, "FAIL", "HD05-BODY-LINE-SPACING phải FAIL nếu có đoạn thân bài không đạt exact 18-22pt");
    });

    it("6.1 extractBodyOoxmlEvidence loại trừ tiêu đề văn bản, trích yếu, nơi nhận khỏi chỉ số thân bài", () => {
      const mockDocXml = `
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <!-- Tiêu đề văn bản 16pt căn giữa -->
            <w:p>
              <w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:rPr><w:sz w:val="32"/><w:b/></w:rPr><w:t>QUYẾT ĐỊNH</w:t></w:r>
            </w:p>
            <!-- Trích yếu 14pt in đậm căn giữa -->
            <w:p>
              <w:pPr><w:jc w:val="center"/></w:pPr>
              <w:r><w:rPr><w:sz w:val="28"/><w:b/></w:rPr><w:t>Về việc phân công công tác</w:t></w:r>
            </w:p>
            <!-- Đoạn thân bài 1 14pt thụt lề 1.27cm -->
            <w:p>
              <w:pPr>
                <w:ind w:firstLine="720"/>
                <w:jc w:val="both"/>
                <w:spacing w:line="360" w:lineRule="exact"/>
              </w:pPr>
              <w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>Căn cứ Luật Doanh nghiệp số 59/2020/QH14 ngày 17/6/2020;</w:t></w:r>
            </w:p>
            <!-- Nơi nhận 11pt -->
            <w:p>
              <w:pPr><w:jc w:val="left"/></w:pPr>
              <w:r><w:rPr><w:sz w:val="22"/><w:b/></w:rPr><w:t>Nơi nhận:</w:t></w:r>
            </w:p>
          </w:body>
        </w:document>
      `;

      const ev = extractBodyOoxmlEvidence(mockDocXml);

      // Thân bài thực sự chỉ có 1 đoạn "Căn cứ Luật..." với cỡ chữ 14pt (sz=28)
      assert.ok(ev.fontSizeRangePt, "Phải có dải cỡ chữ thân bài");
      assert.equal(ev.fontSizeRangePt.min, 14, "Cỡ chữ min của thân bài phải là 14pt (không bị kéo xuống 11pt bởi Nơi nhận)");
      assert.equal(ev.fontSizeRangePt.max, 14, "Cỡ chữ max của thân bài phải là 14pt (không bị kéo lên 16pt bởi Tiêu đề)");
    });
  });

  describe("P2 - F07 & F08: Báo trạng thái lưu nguồn & đơn vị preview", () => {
    it("7.1 saveSourceBlob trả rõ trạng thái lưu ('indexeddb' hoặc 'memory')", async () => {
      const res = await saveSourceBlob({
        hash: "dummy_hash_123",
        fileName: "test.docx",
        fileType: "docx",
        fileSize: 1000,
        uploadedAt: new Date().toISOString(),
        bytes: new ArrayBuffer(100),
      });

      assert.ok(res, "saveSourceBlob phải trả về kết quả trạng thái lưu");
      assert.ok(res.storage === "indexeddb" || res.storage === "memory", "storage phải là indexeddb hoặc memory");
      assert.equal(typeof res.persisted, "boolean");
    });

    it("8.1 tableModelToHtmlView không dùng đơn vị CSS twip và co dãn hợp lệ", () => {
      const model: TableModel = {
        tableId: "tbl_css",
        rowsCount: 1,
        columnsCount: 2,
        gridColumnsTwips: [2880, 5760],
        tableWidthTwips: 8640,
        widthType: "dxa",
        alignment: "center",
        hasBorders: true,
        rows: [{
          rowIndex: 0, isHeader: false, cantSplit: true,
          cells: [
            { cellId: "c1", rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "A", paragraphs: [{ text: "A" }] },
            { cellId: "c2", rowIndex: 0, colIndex: 1, gridColumn: 1, gridSpan: 1, text: "B", paragraphs: [{ text: "B" }] },
          ]
        }]
      };

      const html = tableModelToHtmlView(model);
      assert.ok(!html.includes("twip;"), "HTML view tuyệt đối KHÔNG được chứa đơn vị không chuẩn 'twip;'");
      assert.ok(html.includes("px") || html.includes("pt") || html.includes("%"), "HTML view phải dùng đơn vị CSS hợp lệ (px, pt hoặc %)");
    });
  });

});
