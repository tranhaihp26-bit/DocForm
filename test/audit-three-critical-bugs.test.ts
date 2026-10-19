import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Document, Paragraph, Table, TableRow, TableCell, WidthType, Packer, TextRun } from "docx";

import type {
  SourceBlock,
  StructuredImport,
  DocumentState,
  ReviewProposal,
  AppendixDocument,
  TableModel,
  TableCellRun
} from "../src/shared/schemas/document.schema.ts";
import {
  applySingleProposal,
  applyAllProposalsSequentially,
  type CanonicalWorkflowState
} from "../src/utils/proposalState.ts";
import {
  parseRunsFromHtmlString,
  reconcileRunsWithNewText,
  syncImportedTablesFromHtml
} from "../src/utils/tableFormatUtils.ts";
import {
  verifyCandidateExportFidelity
} from "../src/utils/tableRoundtrip.ts";
import { generateND30DocxUint8Array } from "../src/utils/docxExport.ts";

function createDocumentState(overrides: Partial<DocumentState> = {}): DocumentState {
  return {
    orgHeader1: "",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 17 tháng 10 năm 2026",
    documentType: "THÔNG BÁO",
    referenceNumber: "Số: 15/TB-HTMB",
    subject: "Về việc thử nghiệm",
    bodyHtml: "",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn Bình",
    recipients: "Như trên;\nLưu: VT.",
    ...overrides,
  };
}

describe("Audit 3 Critical Bugs: Red Reproduction & Verification", () => {
  // =========================================================================
  // NHÓM 1: Lỗi 1 (P0) - Đề xuất AI sửa đúng mô hình nhưng sai vị trí trong HTML
  // =========================================================================
  describe("Bug 1 (P0): Target Block & Cell Precision in Proposal State & HTML Sync", () => {
    it("1.1 Đoạn văn: Hai block cùng chứa 'SAME', đề xuất sửa block thứ hai 'b1' phải sửa đúng đoạn 2 trong HTML", () => {
      const b0: SourceBlock = {
        id: "b0",
        index: 0,
        kind: "paragraph",
        role: "body",
        text: "SAME",
        html: "<p>SAME</p>",
      };
      const b1: SourceBlock = {
        id: "b1",
        index: 1,
        kind: "paragraph",
        role: "body",
        text: "SAME",
        html: "<p>SAME</p>",
      };

      const reviewBlocks: SourceBlock[] = [b0, b1];
      const doc: DocumentState = createDocumentState({
        bodyHtml: "<p>SAME</p><p>SAME</p>",
      });
      const structuredImport: StructuredImport = {
        source: { filename: "test.docx", type: "docx", blockCount: 2 },
        fields: {},
        body: { html: "<p>SAME</p><p>SAME</p>", sourceBlockIds: ["b0", "b1"] },
        appendices: [],
        unclassified: [],
        order: ["body"],
      };

      const proposal: ReviewProposal = {
        id: "prop-p1",
        type: "consistency",
        target: "body",
        targetBlockId: "b1",
        original: "SAME",
        suggested: "EDIT",
        reason: "Sửa lỗi chính tả ở đoạn 2",
        confidence: "high",
      };

      const result = applySingleProposal(proposal, {
        reviewBlocks,
        structuredImport,
        doc,
        acceptedProposalIds: new Set(),
      });

      assert.equal(result.success, true, `applySingleProposal failed: ${result.reason}`);
      const next = result.nextState!;

      // Kiểm tra reviewBlocks: b0 giữ nguyên SAME, b1 thành EDIT
      assert.equal(next.reviewBlocks[0].text, "SAME");
      assert.equal(next.reviewBlocks[1].text, "EDIT");
      assert.equal(next.reviewBlocks[0].html, "<p>SAME</p>");
      assert.equal(next.reviewBlocks[1].html, "<p>EDIT</p>");

      // doc.bodyHtml PHẢI là <p>SAME</p><p>EDIT</p>, KHÔNG ĐƯỢC là <p>EDIT</p><p>SAME</p>!
      assert.equal(next.doc.bodyHtml, "<p>SAME</p><p>EDIT</p>");

      // structuredImport.body.html cũng phải đồng bộ chính xác
      assert.equal(next.structuredImport?.body.html, "<p>SAME</p><p>EDIT</p>");
    });

    it("1.2 Ô bảng: Hai ô cùng hàng chứa 'SAME', đề xuất sửa ô 2 [0, 1] phải giữ ô 1 [0, 0] là 'SAME' sau khi sync HTML", () => {
      const initialTableModel: TableModel = {
        tableId: "table-same",
        rowsCount: 1,
        columnsCount: 2,
        gridColumnsTwips: [4677, 4678],
        tableWidthTwips: 9355,
        widthType: "dxa",
        hasBorders: true,
        alignment: "center",
        rows: [
          {
            rowIndex: 0,
            isHeader: false,
            cantSplit: true,
            cells: [
              {
                cellId: "cell_0_0",
                rowIndex: 0,
                colIndex: 0,
                gridColumn: 0,
                text: "SAME",
                gridSpan: 1,
                paragraphs: [
                  {
                    text: "SAME",
                    runs: [{ text: "SAME", font: "Times New Roman", sizeHalfPt: 24 }],
                  },
                ],
              },
              {
                cellId: "cell_0_1",
                rowIndex: 0,
                colIndex: 1,
                gridColumn: 1,
                text: "SAME",
                gridSpan: 1,
                paragraphs: [
                  {
                    text: "SAME",
                    runs: [{ text: "SAME", font: "Times New Roman", sizeHalfPt: 24 }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const tableBlock: SourceBlock = {
        id: "block-table",
        index: 0,
        kind: "table",
        role: "body",
        text: "SAME SAME",
        html: `<table data-source-table-id="table-same"><tbody><tr><td data-cell-id="cell_0_0"><p>SAME</p></td><td data-cell-id="cell_0_1"><p>SAME</p></td></tr></tbody></table>`,
        tableModel: initialTableModel,
        tableData: [["SAME", "SAME"]],
      };

      const proposal: ReviewProposal = {
        id: "prop-cell-2",
        type: "consistency",
        target: "table_cell",
        targetBlockId: "block-table",
        cellIndex: { row: 0, col: 1 },
        original: "SAME",
        suggested: "EDIT",
        reason: "Sửa ô thứ hai",
        confidence: "high",
      };

      const result = applySingleProposal(proposal, {
        reviewBlocks: [tableBlock],
        structuredImport: null,
        doc: createDocumentState({
          bodyHtml: tableBlock.html!,
        }),
        acceptedProposalIds: new Set(),
      });

      assert.equal(result.success, true, `applySingleProposal failed: ${result.reason}`);
      const updatedBlock = result.nextState!.reviewBlocks[0];

      // Kiểm tra mô hình bảng ngay sau applySingleProposal
      assert.equal(updatedBlock.tableModel?.rows[0].cells[0].text, "SAME");
      assert.equal(updatedBlock.tableModel?.rows[0].cells[1].text, "EDIT");

      // BÂY GIỜ: Kiểm tra bước sync HTML (mô phỏng người dùng hoặc bộ xuất đọc HTML)
      // updatedBlock.html KHÔNG ĐƯỢC biến ô 0 thành EDIT và ô 1 thành SAME!
      const syncResult = syncImportedTablesFromHtml(updatedBlock.html!, {
        "table-same": updatedBlock.tableModel!,
      });

      const syncedModel = syncResult.syncedTables["table-same"];
      assert.ok(syncedModel, "syncedModel must exist");
      assert.equal(syncedModel.rows[0].cells[0].text, "SAME", "Ô 0 phải vẫn là SAME");
      assert.equal(syncedModel.rows[0].cells[1].text, "EDIT", "Ô 1 phải là EDIT");
    });

    it("1.3 Phụ lục: Hai phụ lục cùng chứa 'SAME', đề xuất sửa block trong phụ lục 2 phải không làm đổi phụ lục 1", () => {
      const appBlock1: SourceBlock = {
        id: "app-b1",
        index: 0,
        kind: "paragraph",
        role: "appendix",
        text: "SAME",
        html: "<p>SAME</p>",
      };
      const appBlock2: SourceBlock = {
        id: "app-b2",
        index: 1,
        kind: "paragraph",
        role: "appendix",
        text: "SAME",
        html: "<p>SAME</p>",
      };

      const app1: AppendixDocument = {
        id: "app-1",
        title: "Phụ lục 1",
        html: "<p>SAME</p>",
        blocks: [appBlock1],
        sourceBlockIds: ["app-b1"],
        extractionStatus: "confirmed",
      };
      const app2: AppendixDocument = {
        id: "app-2",
        title: "Phụ lục 2",
        html: "<p>SAME</p>",
        blocks: [appBlock2],
        sourceBlockIds: ["app-b2"],
        extractionStatus: "confirmed",
      };

      const proposal: ReviewProposal = {
        id: "prop-app-2",
        type: "consistency",
        target: "appendix",
        targetBlockId: "app-b2",
        original: "SAME",
        suggested: "EDIT_IN_APP2",
        reason: "Sửa trong phụ lục 2",
        confidence: "high",
      };

      const result = applySingleProposal(proposal, {
        reviewBlocks: [appBlock1, appBlock2],
        structuredImport: {
          source: { filename: "test.docx", type: "docx", blockCount: 2 },
          fields: {},
          body: { html: "", sourceBlockIds: [] },
          appendices: [app1, app2],
          unclassified: [],
          order: ["appendix"],
        },
        doc: createDocumentState({
          bodyHtml: "",
          appendices: [app1, app2],
        }),
        acceptedProposalIds: new Set(),
      });

      assert.equal(result.success, true);
      const nextDoc = result.nextState!.doc;
      assert.equal(nextDoc.appendices?.[0].html, "<p>SAME</p>", "Phụ lục 1 không được bị thay đổi");
      assert.equal(nextDoc.appendices?.[1].html, "<p>EDIT_IN_APP2</p>", "Phụ lục 2 phải có nội dung mới");
    });

    it("1.4 Xuất DOCX ứng viên thực tế sau khi áp dụng đề xuất và xác minh OOXML bảo toàn đúng đoạn mục tiêu", async () => {
      const b0: SourceBlock = {
        id: "b0",
        index: 0,
        kind: "paragraph",
        role: "body",
        text: "DOAN_VAN_GOC_1",
        html: "<p>DOAN_VAN_GOC_1</p>",
      };
      const b1: SourceBlock = {
        id: "b1",
        index: 1,
        kind: "paragraph",
        role: "body",
        text: "DOAN_VAN_GOC_1",
        html: "<p>DOAN_VAN_GOC_1</p>",
      };

      const proposal: ReviewProposal = {
        id: "prop-docx-1",
        type: "consistency",
        target: "body",
        targetBlockId: "b1",
        original: "DOAN_VAN_GOC_1",
        suggested: "DOAN_VAN_DA_SUA_O_CUOI",
        reason: "Sửa đoạn văn 2",
        confidence: "high",
      };

      const result = applySingleProposal(proposal, {
        reviewBlocks: [b0, b1],
        structuredImport: {
          source: { filename: "test.docx", type: "docx", blockCount: 2 },
          fields: {},
          body: { html: "<p>DOAN_VAN_GOC_1</p><p>DOAN_VAN_GOC_1</p>", sourceBlockIds: ["b0", "b1"] },
          appendices: [],
          unclassified: [],
          order: ["body"],
        },
        doc: createDocumentState({
          bodyHtml: "<p>DOAN_VAN_GOC_1</p><p>DOAN_VAN_GOC_1</p>",
          nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
          nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
          orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
          locationAndDate: "Hải Phòng, ngày 17 tháng 10 năm 2026",
          documentType: "THÔNG BÁO",
          subject: "Về việc thử nghiệm xuất bản",
          signTitle: "GIÁM ĐỐC",
          signName: "Nguyễn Văn Bình",
          recipients: "Như trên;\nLưu: VT.",
        }),
        acceptedProposalIds: new Set(),
      });

      assert.equal(result.success, true);
      const nextDoc = result.nextState!.doc;

      // Sinh candidate DOCX
      const candidateBytes = await generateND30DocxUint8Array({
        ...nextDoc,
        regime: "administrative",
        headerProfile: "generic",
      } as any);

      const zip = await JSZip.loadAsync(candidateBytes);
      const xml = await zip.file("word/document.xml")?.async("string");
      assert.ok(xml, "Phải đọc được word/document.xml");

      // OOXML phải chứa DOAN_VAN_GOC_1 trước, sau đó đến DOAN_VAN_DA_SUA_O_CUOI
      const idxOld = xml.indexOf("DOAN_VAN_GOC_1");
      const idxNew = xml.indexOf("DOAN_VAN_DA_SUA_O_CUOI");
      assert.ok(idxOld !== -1, "Đoạn 1 phải vẫn giữ nguyên");
      assert.ok(idxNew !== -1, "Đoạn 2 phải có nội dung sửa");
      assert.ok(idxOld < idxNew, "Đoạn 1 phải đứng trước đoạn 2 trong DOCX ứng viên");
    });
  });

  // =========================================================================
  // NHÓM 2: Lỗi 2 (P0) - Mất style khi sửa nhiều vị trí và không parse span style
  // =========================================================================
  describe("Bug 2 (P0): Multi-site Edit Run Preservation & CSS Span Style Parsing", () => {
    it("2.1 reconcileRunsWithNewText: 'Abc MIDDLE xyZ' từ 'abc' (đậm) + ' MIDDLE ' (nghiêng) + 'xyz' (gạch chân) phải giữ đúng 3 style riêng biệt", () => {
      const existingRuns: TableCellRun[] = [
        { text: "abc", bold: true, italic: false, underline: false, font: "Times New Roman", sizeHalfPt: 24 },
        { text: " MIDDLE ", bold: false, italic: true, underline: false, font: "Times New Roman", sizeHalfPt: 24 },
        { text: "xyz", bold: false, italic: false, underline: true, font: "Times New Roman", sizeHalfPt: 24 },
      ];

      const newText = "Abc MIDDLE xyZ";
      const reconciled = reconcileRunsWithNewText(existingRuns, newText);

      // Phải có ít nhất 3 runs và bảo toàn đúng style
      const full = reconciled.map(r => r.text).join("");
      assert.equal(full, newText);

      // 'Abc' phải là đậm
      const runAbc = reconciled.find(r => r.text.includes("Abc"));
      assert.ok(runAbc, "Phải tìm thấy run chứa Abc");
      assert.equal(runAbc.bold, true, "Abc phải giữ bold: true");
      assert.equal(runAbc.italic, false, "Abc không được bị gán italic");

      // ' MIDDLE ' phải là nghiêng
      const runMiddle = reconciled.find(r => r.text.includes("MIDDLE"));
      assert.ok(runMiddle, "Phải tìm thấy run chứa MIDDLE");
      assert.equal(runMiddle.italic, true, "MIDDLE phải giữ italic: true");
      assert.equal(runMiddle.bold, false, "MIDDLE không được bị biến thành bold!");

      // 'xyZ' phải là gạch chân
      const runXyz = reconciled.find(r => r.text.includes("xyZ"));
      assert.ok(runXyz, "Phải tìm thấy run chứa xyZ");
      assert.equal(runXyz.underline, true, "xyZ phải giữ underline: true");
      assert.equal(runXyz.bold, false, "xyZ không được bị biến thành bold!");
    });

    it("2.2 reconcileRunsWithNewText: Chèn và xóa nhiều vùng trong chuỗi nhiều run vẫn bảo toàn run không bị sửa", () => {
      const existingRuns: TableCellRun[] = [
        { text: "CỘNG HÒA ", bold: true, italic: false, underline: false },
        { text: "XÃ HỘI ", bold: false, italic: true, underline: false },
        { text: "CHỦ NGHĨA", bold: false, italic: false, underline: true },
      ];

      // Sửa "CỘNG HÒA " -> "CỘNG HOÀ TRẺ " và "CHỦ NGHĨA" -> "VIỆT NAM"
      const newText = "CỘNG HOÀ TRẺ XÃ HỘI VIỆT NAM";
      const reconciled = reconcileRunsWithNewText(existingRuns, newText);

      const full = reconciled.map(r => r.text).join("");
      assert.equal(full, newText);

      const midRun = reconciled.find(r => r.text.includes("XÃ HỘI"));
      assert.ok(midRun, "XÃ HỘI phải được giữ lại");
      assert.equal(midRun.italic, true, "XÃ HỘI vẫn phải là italic");
    });

    it("2.3 parseRunsFromHtmlString: Phải trích xuất được font, size, weight từ inline style của <span>", () => {
      const html = `<p><span style="font-family: Arial; font-size: 18pt; font-weight: bold;">Tiêu đề lớn</span></p>`;
      const runs = parseRunsFromHtmlString(html);

      assert.equal(runs.length, 1);
      assert.equal(runs[0].text, "Tiêu đề lớn");
      assert.equal(runs[0].font, "Arial");
      assert.equal(runs[0].sizeHalfPt, 36); // 18pt = 36 half-points
      assert.equal(runs[0].bold, true);
    });

    it("2.4 parseRunsFromHtmlString: Xử lý thẻ lồng nhau và thuộc tính style tắt 'font-weight: normal'", () => {
      const html = `<p><b>Chữ đậm <span style="font-weight: normal; font-style: italic;">Chữ thường nghiêng</span> Đậm lại</b></p>`;
      const runs = parseRunsFromHtmlString(html);

      assert.equal(runs.length, 3);
      assert.equal(runs[0].text, "Chữ đậm ");
      assert.equal(runs[0].bold, true);
      assert.equal(runs[0].italic, false);

      assert.equal(runs[1].text, "Chữ thường nghiêng");
      assert.equal(runs[1].bold, false, "font-weight: normal phải tắt bold");
      assert.equal(runs[1].italic, true, "font-style: italic phải bật italic");

      assert.equal(runs[2].text, " Đậm lại");
      assert.equal(runs[2].bold, true, "Thẻ b cha phải khôi phục bold sau khi đóng span");
    });
  });

  // =========================================================================
  // NHÓM 3: Lỗi 3 (P1) - Cổng kiểm chứng bảng bỏ qua bảng mới khi importedTables rỗng
  // =========================================================================
  describe("Bug 3 (P1): Table Gate Coverage When importedTables Is Empty", () => {
    it("3.1 importedTables rỗng nhưng candidate DOCX chứa bảng nội dung chưa duyệt -> Gate PHẢI chặn (safe: false, unexplained_new_table)", async () => {
      // Tạo một file Word candidate chứa 1 bảng nội dung không được duyệt
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: "Thân bài trước bảng" }),
              new Table({
                width: { size: 9355, type: WidthType.DXA },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({ text: "Bảng không duyệt" })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          },
        ],
      });

      const candidateBytes = await Packer.toBuffer(doc);

      // Gọi verifyCandidateExportFidelity với candidateBytes là đối số 1, importedTables = {} (rỗng) là đối số 2
      const report = await verifyCandidateExportFidelity(
        candidateBytes,
        {}, // Không có bảng nguồn
        null, // Manifest không có bảng
        { approvedNewTableIds: [] } // Không có ID nào được duyệt
      );

      // Gate KHÔNG ĐƯỢC trả safe: true!
      assert.equal(report.safe, false, "Gate phải từ chối khi có bảng nội dung chưa duyệt dù importedTables rỗng");
      assert.ok(
        report.violations.some(v => v.code === "unexplained_new_table"),
        "Phải có vi phạm unexplained_new_table"
      );
    });

    it("3.2 importedTables rỗng và candidate DOCX chỉ chứa bảng layout thể thức hợp lệ (system header) -> Gate cho phép (safe: true)", async () => {
      // Tạo DOCX candidate chỉ có bảng layout header ND30 (1 hàng 2 cột, không viền, text quốc hiệu)
      const doc = new Document({
        sections: [
          {
            children: [
              new Table({
                width: { size: 9355, type: WidthType.DXA },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({ text: "CÔNG TY HOA TIÊU" })],
                      }),
                      new TableCell({
                        children: [new Paragraph({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" })],
                      }),
                    ],
                  }),
                ],
              }),
              new Paragraph({ text: "Nội dung văn bản" }),
            ],
          },
        ],
      });

      const candidateBytes = await Packer.toBuffer(doc);

      const report = await verifyCandidateExportFidelity(candidateBytes, {}, null, { approvedNewTableIds: [] });
      assert.equal(report.safe, true, "Bảng layout hệ thống hợp lệ không được bị coi là bảng nội dung phát sinh");
    });

    it("3.3 importedTables rỗng nhưng candidate DOCX chứa bảng mới có ID nằm trong approvedNewTableIds -> Gate cho phép (safe: true)", async () => {
      // Giả lập candidate DOCX có bảng và đã duyệt ID
      const doc = new Document({
        sections: [
          {
            children: [
              new Table({
                width: { size: 9355, type: WidthType.DXA },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [new Paragraph({ text: "Bảng mới đã duyệt" })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          },
        ],
      });

      const candidateBytes = await Packer.toBuffer(doc);

      // candidate_table_0
      const report = await verifyCandidateExportFidelity(
        candidateBytes,
        {},
        null,
        { approvedNewTableIds: ["candidate_table_0"] }
      );

      assert.equal(report.safe, true, "Bảng mới có ID được duyệt phải được chấp thuận");
    });

    it("3.4 importedTables rỗng nhưng candidateDocxBytes bị hỏng (corrupt) -> Gate PHẢI chặn (safe: false, candidate_unpack_failed)", async () => {
      const corruptBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const report = await verifyCandidateExportFidelity(corruptBytes, {}, null);
      assert.equal(report.safe, false, "Tệp Word hỏng phải bị chặn kiểm chứng");
      assert.ok(
        report.violations.some(v => v.code === "candidate_unpack_failed"),
        "Phải có vi phạm candidate_unpack_failed"
      );
    });
  });
});
