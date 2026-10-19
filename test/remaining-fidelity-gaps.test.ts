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
  detectParagraphRole, 
  extractBodyOoxmlEvidence, 
  extractDirectBodyParagraphs 
} from "../src/canonical/bodyOoxmlEvidence.ts";
import { evaluateDocumentRules } from "../src/canonical/ruleEngine.ts";
import { syncTableModelFromHtml, syncImportedTablesFromHtml } from "../src/utils/tableFormatUtils.ts";
import { saveSourceBlob } from "../src/utils/draftStore.ts";
import { 
  applySingleProposal, 
  applyAllProposalsSequentially, 
  changeBlockRole, 
  type CanonicalWorkflowState 
} from "../src/utils/proposalState.ts";
import { reconstructFromReviewedBlocks } from "../src/utils/importReview.ts";
import type { 
  SourceBlock, 
  StructuredImport, 
  ReviewProposal, 
  DocumentState 
} from "../src/shared/schemas/document.schema.ts";

describe("Remaining Fidelity Gaps (Post F01-F09): Red Baseline & Verification", () => {
  function createFormatData(overrides: Record<string, any> = {}): any {
    return {
      regime: "administrative",
      headerProfile: "generic",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      orgHeader1: "",
      orgHeader2: "CƠ QUAN THỬ NGHIỆM",
      locationAndDate: "Hà Nội, ngày 17 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 01/KH-CQ",
      subject: "Về việc thử nghiệm bảng",
      bodyHtml: "<p>Nội dung</p>",
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Văn A",
      recipients: "Như trên;\nLưu: VT.",
      fontFamily: "Times New Roman",
      fontSize: 13,
      ...overrides,
    };
  }

  describe("Gap 3 (P0): Bảo toàn nhiều run định dạng trong ô khi sửa chữ", () => {
    const multiRunModel: TableModel = {
      tableId: "table_multi_run",
      rowsCount: 1,
      columnsCount: 1,
      gridColumnsTwips: [5000],
      tableWidthTwips: 5000,
      widthType: "dxa",
      alignment: "center",
      hasBorders: true,
      rows: [
        {
          rowIndex: 0,
          isHeader: false,
          cantSplit: true,
          cells: [
            {
              cellId: "cell_multi_run_0_0",
              rowIndex: 0,
              colIndex: 0,
              gridColumn: 0,
              gridSpan: 1,
              text: "A B",
              paragraphs: [
                {
                  text: "A B",
                  alignment: "left",
                  runs: [
                    { text: "A", bold: true, italic: false, font: "Times New Roman", sizeHalfPt: 26 },
                    { text: " B", bold: false, italic: true, font: "Times New Roman", sizeHalfPt: 26 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    it("3.1 Ô nguồn có 'A' đậm + ' B' nghiêng, sửa 'A B' thành 'A C' phải giữ 'A' đậm và ' C' nghiêng", () => {
      // Sửa "A B" thành "A C"
      const editedHtml = `
        <table data-source-table-id="table_multi_run">
          <tr>
            <td data-cell-id="cell_multi_run_0_0">
              <p><strong>A</strong> <em>C</em></p>
            </td>
          </tr>
        </table>
      `;

      const { effectiveModel, userEdits } = syncTableModelFromHtml(editedHtml, multiRunModel);
      assert.equal(userEdits.length, 1);
      assert.equal(userEdits[0].newText, "A C");

      const cell = effectiveModel.rows[0].cells[0];
      assert.equal(cell.text, "A C");
      const runs = cell.paragraphs?.[0]?.runs || [];

      // Phải có 2 run riêng biệt bảo toàn style: run 1 đậm ('A'), run 2 nghiêng (' C')
      // Không được làm phẳng toàn bộ thành 1 run đậm 'A C'
      assert.ok(runs.length >= 2, `Mong đợi ít nhất 2 runs nhưng nhận được ${runs.length}`);
      const runA = runs.find(r => r.text.includes("A"));
      const runC = runs.find(r => r.text.includes("C"));
      assert.ok(runA, "Phải tìm thấy run chứa 'A'");
      assert.ok(runC, "Phải tìm thấy run chứa 'C'");
      assert.equal(runA.bold, true, "Chữ 'A' phải giữ in đậm");
      assert.equal(runC.italic, true, "Chữ 'C' phải giữ in nghiêng");
    });

    it("3.2 Sửa text thuần 'A C' (không có HTML tags) vẫn map được phần chữ không đổi và giữ định dạng từng run", () => {
      const editedPlainHtml = `
        <table data-source-table-id="table_multi_run">
          <tr>
            <td data-cell-id="cell_multi_run_0_0">
              <p>A C</p>
            </td>
          </tr>
        </table>
      `;

      const { effectiveModel } = syncTableModelFromHtml(editedPlainHtml, multiRunModel);
      const cell = effectiveModel.rows[0].cells[0];
      const runs = cell.paragraphs?.[0]?.runs || [];

      assert.ok(runs.length >= 2, `Mong đợi bảo toàn phân đoạn run nhưng chỉ có ${runs.length} run`);
      assert.equal(runs[0].bold, true, "Run đầu 'A' phải giữ in đậm");
      assert.equal(runs[1].italic, true, "Run sau ' C' phải kế thừa in nghiêng");
    });
  });

  describe("Gap 2 (P0): Gate bảng phát hiện bảng mới và giải thích hai chiều", () => {
    const sourceModel: TableModel = {
      tableId: "source_table_1",
      rowsCount: 1,
      columnsCount: 1,
      gridColumnsTwips: [5000],
      tableWidthTwips: 5000,
      widthType: "dxa",
      alignment: "center",
      hasBorders: true,
      rows: [
        {
          rowIndex: 0,
          isHeader: false,
          cantSplit: true,
          cells: [
            { cellId: "c_0_0", rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, text: "Bảng nguồn 1", paragraphs: [{ text: "Bảng nguồn 1" }] },
          ],
        },
      ],
    };


    it("2.1 Phát hiện bảng mới không rõ nguồn gốc (unexplained new table) và từ chối safe: true", async () => {
      // Xuất tài liệu có 1 bảng nguồn và 1 bảng mới do người dùng/hệ thống chèn thêm vào bodyHtml
      const docxBytes = await generateND30DocxUint8Array(createFormatData({
        documentType: "KẾ HOẠCH",
        bodyHtml: `
          <table data-source-table-id="source_table_1">
            <tr><td>Bảng nguồn 1</td></tr>
          </table>
          <table data-user-table-id="unexpected_new_table">
            <tr><td>Bảng mới phát sinh ngoài dự kiến</td></tr>
          </table>
        `,
        importedTables: {
          source_table_1: sourceModel,
        },
      }));

      // Manifest chỉ khai báo source_table_1
      const fidelity = await verifyCandidateExportFidelity(docxBytes, { source_table_1: sourceModel }, {
        tableIds: ["source_table_1"],
      });

      assert.equal(fidelity.newTablesCount, 1);
      // Chính sách bảng mới: Nếu có bảng mới không rõ nguồn gốc/chưa duyệt, không được báo safe: true mà phải yêu cầu duyệt hoặc từ chối
      assert.equal(fidelity.safe, false, "Có bảng mới không rõ nguồn gốc thì safe phải là false");
      assert.ok(fidelity.violations.some(v => v.code === "unexplained_new_table" || v.code === "unexpected_candidate_table"), "Phải có violation về bảng mới");
    });

    it("2.2 Phát hiện ID bảng bị trùng (duplicate_table_id) trong candidate OOXML", async () => {
      // Sinh tài liệu với 2 bảng mang cùng tableId "source_table_1"
      const docxBytes = await generateND30DocxUint8Array(createFormatData({
        documentType: "BÁO CÁO",
        bodyHtml: `
          <table data-source-table-id="source_table_1">
            <tr><td>Bảng 1</td></tr>
          </table>
          <table data-source-table-id="source_table_1">
            <tr><td>Bảng trùng ID</td></tr>
          </table>
        `,
        importedTables: {
          source_table_1: sourceModel,
        },
      }));

      const fidelity = await verifyCandidateExportFidelity(docxBytes, { source_table_1: sourceModel });
      assert.equal(fidelity.safe, false);
      assert.ok(fidelity.violations.some(v => v.code === "duplicate_table_id"), "Phải phát hiện duplicate_table_id");
    });
  });

  describe("Gap 4 (P1): Nhận diện đúng vai trò đoạn thân bài và rule header row", () => {
    it("4.1 detectParagraphRole không được nhận nhầm câu thân bài bắt đầu 'Về việc...' là subject", () => {
      // Một đoạn văn thân bài căn đều hai bên ("both"), cỡ 14pt, bắt đầu bằng "Về việc triển khai nhiệm vụ..."
      const role = detectParagraphRole(
        "Về việc triển khai nhiệm vụ chuyên môn năm 2026, các phòng nghiệp vụ cần chủ động xây dựng kế hoạch chi tiết.",
        "both",
        false,
        false,
        14
      );
      assert.equal(role, "body_paragraph", "Câu thân bài căn đều hai bên phải là body_paragraph, không được là subject");
    });

    it("4.2 detectParagraphRole nhận diện đúng đề mục 'I- KẾT QUẢ THỰC HIỆN' và '1. Mục đích'", () => {
      const headingRoman = detectParagraphRole("I- KẾT QUẢ THỰC HIỆN NHIỆM VỤ NĂM 2025", "left", true, false, 14);
      assert.equal(headingRoman, "heading", "Đề mục số La Mã I- phải là heading");

      const headingArabic = detectParagraphRole("1. Mục đích, yêu cầu", "left", true, false, 14);
      assert.equal(headingArabic, "heading", "Đề mục 1. phải là heading");
    });

    it("4.3 BODY.TABLE.HEADER_ROW trả NOT_APPLICABLE khi tài liệu không có bảng nào yêu cầu hàng tiêu đề", () => {
      const summary = evaluateDocumentRules(
        {
          documentType: "CÔNG VĂN",
          bodyHtml: "<p>Nội dung công văn không có bảng biểu nào.</p>",
          importedTables: undefined,
        },
        "administrative",
        {
          header_profile: "generic",
          directParagraphsCount: 1,
          directParagraphs: [{ index: 0, text: "Nội dung", role: "body_paragraph", isEligibleBody: true }],
          candidate_fidelity_result: { safe: true, diffs: [] }
        }
      );

      const headerRule = summary.results.find(r => r.ruleId === "BODY.TABLE.HEADER_ROW");
      assert.ok(headerRule, "Quy tắc BODY.TABLE.HEADER_ROW phải tồn tại");
      assert.equal(headerRule.status, "NOT_APPLICABLE", "Tài liệu không có bảng có tiêu đề thì phải là NOT_APPLICABLE");
    });
  });

  describe("Gap 1 (P0): Single Source of Truth & Sequential AI Proposals", () => {
    const tableModel1: TableModel = {
      tableId: "table_mv",
      rowsCount: 1,
      columnsCount: 1,
      gridColumnsTwips: [5000],
      tableWidthTwips: 5000,
      widthType: "dxa",
      alignment: "center",
      hasBorders: true,
      rows: [{
        rowIndex: 0,
        isHeader: false,
        cantSplit: true,
        cells: [{
          cellId: "c_0_0",
          rowIndex: 0,
          colIndex: 0,
          gridColumn: 0,
          gridSpan: 1,
          text: "Dữ liệu ban đầu",
          paragraphs: [{ text: "Dữ liệu ban đầu" }],
        }],
      }],
    };

    it("1.1 changeBlockRole chuyển bảng giữa body và appendix cập nhật đồng bộ blocks, manifest và reconstruction", () => {
      const initialBlocks: SourceBlock[] = [
        {
          id: "block_tbl_1",
          index: 0,
          kind: "table",
          role: "body",
          text: "Dữ liệu ban đầu",
          html: `<table data-source-table-id="table_mv"><tr><td>Dữ liệu ban đầu</td></tr></table>`,
          tableModel: tableModel1,
        },
        {
          id: "block_p_1",
          index: 1,
          kind: "paragraph",
          role: "body",
          text: "Đoạn văn thân bài",
          html: "<p>Đoạn văn thân bài</p>",
        },
      ];

      const initialImport: StructuredImport = {
        source: { filename: "test.docx", type: "docx", blockCount: 2 },
        fields: {},
        body: { html: initialBlocks[0].html! + initialBlocks[1].html!, sourceBlockIds: ["block_tbl_1", "block_p_1"] },
        appendices: [],
        unclassified: [],
        order: ["body"],
        importFidelityManifest: {
          sourceKind: "uploaded_docx",
          sourceBlockIds: ["block_tbl_1", "block_p_1"],
          tableIds: ["table_mv"],
          unsupportedFeatures: [],
          roundtripProven: true,
        },
      };

      // 1. Chuyển bảng từ body sang appendix
      const { nextBlocks, nextImport } = changeBlockRole(initialBlocks, "block_tbl_1", "appendix", initialImport);
      assert.equal(nextBlocks[0].role, "appendix");
      assert.ok(nextImport?.importFidelityManifest?.tableIds.includes("table_mv"), "Bảng phụ lục vẫn phải được bảo toàn trong manifest");

      // Tái dựng lại văn bản từ blocks đã duyệt
      const reconstructed = reconstructFromReviewedBlocks(nextBlocks, "state", nextImport || undefined);
      assert.ok(!reconstructed.bodyHtml.includes("data-source-table-id=\"table_mv\""), "Body không còn chứa bảng");
      assert.equal(reconstructed.appendices?.length, 1, "Phải sinh ra 1 phụ lục");
      assert.ok(reconstructed.appendices?.[0].html.includes("data-source-table-id=\"table_mv\""), "Phụ lục phải chứa bảng");

      // 2. Chuyển bảng sang signature -> bảng không còn là content table
      const toSig = changeBlockRole(nextBlocks, "block_tbl_1", "signature", nextImport);
      assert.ok(!toSig.nextImport?.importFidelityManifest?.tableIds.includes("table_mv"), "Bảng ở signature không tính vào manifest nội dung");
    });

    it("1.2 applyAllProposalsSequentially áp dụng tuần tự 2 đề xuất AI trên cùng block mà không bị ghi đè", () => {
      const paragraphBlock: SourceBlock = {
        id: "b_text_1",
        index: 0,
        kind: "paragraph",
        role: "body",
        text: "Hoa tiêu viên dẫn tàu an toàn và chuẩn xác.",
        html: "<p>Hoa tiêu viên dẫn tàu an toàn và chuẩn xác.</p>",
      };

      const initialDoc: DocumentState = {
        nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
        orgHeader1: "",
        orgHeader2: "CÔNG TY HOA TIÊU",
        locationAndDate: "Hải Phòng, ngày 17 tháng 10 năm 2026",
        documentType: "KẾ HOẠCH",
        referenceNumber: "Số: 10/KH-HT",
        subject: "Về việc an toàn hàng hải",
        bodyHtml: "<p>Hoa tiêu viên dẫn tàu an toàn và chuẩn xác.</p>",
        signTitle: "GIÁM ĐỐC",
        signName: "Nguyễn Văn Bình",
        recipients: "Lưu: VT.",
      };

      const initialState: CanonicalWorkflowState = {
        reviewBlocks: [paragraphBlock],
        structuredImport: null,
        doc: initialDoc,
        acceptedProposalIds: new Set(),
      };

      const proposals: ReviewProposal[] = [
        {
          id: "prop_1",
          type: "spelling",
          target: "body",
          targetBlockId: "b_text_1",
          original: "dẫn tàu",
          suggested: "dẫn dắt tàu biển",
          reason: "Thuật ngữ chuyên ngành hàng hải chuẩn xác",
          confidence: "high",
        },
        {
          id: "prop_2",
          type: "consistency",
          target: "body",
          targetBlockId: "b_text_1",
          original: "chuẩn xác",
          suggested: "tuyệt đối chuẩn xác",
          reason: "Tăng tính chặt chẽ trong cam kết an toàn",
          confidence: "high",
        },
      ];

      const { finalState, appliedCount, rejectedReasons } = applyAllProposalsSequentially(proposals, initialState);

      assert.equal(appliedCount, 2, "Cả 2 đề xuất phải được áp dụng");
      assert.equal(rejectedReasons.length, 0);
      assert.equal(
        finalState.reviewBlocks[0].text,
        "Hoa tiêu viên dẫn dắt tàu biển an toàn và tuyệt đối chuẩn xác.",
        "Block text phải phản ánh cả hai đề xuất tuần tự"
      );
      assert.ok(
        finalState.doc.bodyHtml.includes("Hoa tiêu viên dẫn dắt tàu biển an toàn và tuyệt đối chuẩn xác."),
        "doc.bodyHtml phải phản ánh cả hai đề xuất mà không ghi đè"
      );
    });

    it("1.3 applySingleProposal từ chối đề xuất có original text không còn tồn tại", () => {
      const paragraphBlock: SourceBlock = {
        id: "b_text_2",
        index: 0,
        kind: "paragraph",
        role: "body",
        text: "Văn bản đã qua sửa đổi bởi người dùng.",
        html: "<p>Văn bản đã qua sửa đổi bởi người dùng.</p>",
      };

      const initialDoc: DocumentState = {
        nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
        orgHeader1: "",
        orgHeader2: "CÔNG TY HOA TIÊU",
        locationAndDate: "Hải Phòng, ngày 17 tháng 10 năm 2026",
        documentType: "KẾ HOẠCH",
        referenceNumber: "Số: 10/KH-HT",
        subject: "Về việc an toàn hàng hải",
        bodyHtml: "<p>Văn bản đã qua sửa đổi bởi người dùng.</p>",
        signTitle: "GIÁM ĐỐC",
        signName: "Nguyễn Văn Bình",
        recipients: "Lưu: VT.",
      };

      const state: CanonicalWorkflowState = {
        reviewBlocks: [paragraphBlock],
        structuredImport: null,
        doc: initialDoc,
        acceptedProposalIds: new Set(),
      };

      const staleProposal: ReviewProposal = {
        id: "prop_stale",
        type: "format",
        target: "body",
        targetBlockId: "b_text_2",
        original: "Nội dung ban đầu đã bị xóa",
        suggested: "Nội dung mới",
        reason: "Đề xuất đã lỗi thời",
        confidence: "high",
      };

      const result = applySingleProposal(staleProposal, state);
      assert.equal(result.success, false, "Phải từ chối đề xuất lỗi thời");
      assert.ok(result.reason?.includes("không còn tồn tại"), "Lý do từ chối phải rõ ràng");
      assert.equal(state.acceptedProposalIds.has("prop_stale"), false, "Không được ghi nhận là đã duyệt");
    });

    it("1.4 Áp dụng đề xuất AI sửa ô bảng và chứng minh roundtrip DOCX ứng viên thực tế", async () => {
      const initialTableBlock: SourceBlock = {
        id: "b_tbl_edit",
        index: 0,
        kind: "table",
        role: "body",
        text: "Dữ liệu ban đầu",
        html: `<table data-source-table-id="table_mv"><tbody><tr><td data-cell-id="c_0_0"><p>Dữ liệu ban đầu</p></td></tr></tbody></table>`,
        tableModel: tableModel1,
      };

      const initialDoc: DocumentState = {
        nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
        orgHeader1: "",
        orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
        locationAndDate: "Hải Phòng, ngày 17 tháng 10 năm 2026",
        documentType: "KẾ HOẠCH",
        referenceNumber: "Số: 15/KH-HTMB",
        subject: "Về việc điều động hoa tiêu",
        bodyHtml: `<table data-source-table-id="table_mv"><tbody><tr><td data-cell-id="c_0_0"><p>Dữ liệu ban đầu</p></td></tr></tbody></table>`,
        signTitle: "GIÁM ĐỐC",
        signName: "Nguyễn Văn Bình",
        recipients: "Như trên;\nLưu: VT.",
      };

      const state: CanonicalWorkflowState = {
        reviewBlocks: [initialTableBlock],
        structuredImport: {
          source: { filename: "pilot.docx", type: "docx", blockCount: 1 },
          fields: {},
          body: { html: initialTableBlock.html!, sourceBlockIds: ["b_tbl_edit"] },
          appendices: [],
          unclassified: [],
          order: ["body"],
          importFidelityManifest: {
            sourceKind: "uploaded_docx",
            sourceBlockIds: ["b_tbl_edit"],
            tableIds: ["table_mv"],
            unsupportedFeatures: [],
          },
        },
        doc: initialDoc,
        acceptedProposalIds: new Set(),
      };

      const cellProposal: ReviewProposal = {
        id: "prop_cell_1",
        type: "consistency",
        target: "table_cell",
        targetBlockId: "b_tbl_edit",
        cellIndex: { row: 0, col: 0 },
        original: "Dữ liệu ban đầu",
        suggested: "Dữ liệu AI đã chuẩn hóa",
        reason: "Chuẩn hóa dữ liệu ô bảng",
        confidence: "high",
      };

      const result = applySingleProposal(cellProposal, state);
      assert.ok(result.success, "Áp dụng sửa ô bảng phải thành công");
      const nextModel = result.nextState?.reviewBlocks[0].tableModel;
      assert.equal(nextModel?.rows[0].cells[0].text, "Dữ liệu AI đã chuẩn hóa");

      // Xuất candidate DOCX thực tế từ trạng thái sau khi duyệt
      const docxBytes = await generateND30DocxUint8Array(createFormatData({
        ...result.nextState!.doc,
        regime: "administrative",
        headerProfile: "generic",
        importedTables: {
          table_mv: nextModel!,
        },
      }));

      const zip = await JSZip.loadAsync(docxBytes);
      const xml = await zip.file("word/document.xml")?.async("string");
      assert.ok(xml, "Phải trích xuất được document.xml");
      assert.ok(xml.includes("Dữ liệu AI đã chuẩn hóa"), "Candidate DOCX phải chứa chữ mới trong ô bảng");
      assert.ok(!xml.includes("Dữ liệu ban đầu"), "Candidate DOCX không được chứa chữ cũ");

      // Gate verifyCandidateExportFidelity phải trả safe: true
      const fidelity = await verifyCandidateExportFidelity(docxBytes, {
        table_mv: nextModel!,
      }, { tableIds: ["table_mv"] });

      assert.equal(fidelity.safe, true, "Gate đối chiếu 2 chiều phải xác nhận an toàn");
      assert.equal(fidelity.diffs.length, 0);
    });
  });

  describe("Gap 5 (P1): Báo cáo trung thực trạng thái lưu trữ tệp gốc", () => {
    it("5.1 saveSourceBlob trả về storage: 'memory' và persisted: false khi không có IndexedDB", async () => {
      const blobResult = await saveSourceBlob({
        hash: "dummy_hash_123",
        fileName: "test_source.docx",
        fileType: "docx",
        fileSize: 4,
        uploadedAt: new Date().toISOString(),
        bytes: new Uint8Array([1, 2, 3, 4]).buffer,
      });
      assert.ok(blobResult, "Phải trả về kết quả lưu trữ");
      assert.equal(typeof blobResult.persisted, "boolean");
      assert.ok(blobResult.storage === "indexeddb" || blobResult.storage === "memory");

      // Trong môi trường Node.js không có IndexedDB thật, phải báo storage: 'memory', persisted: false
      if (typeof window === "undefined" || !window.indexedDB) {
        assert.equal(blobResult.storage, "memory");
        assert.equal(blobResult.persisted, false, "Môi trường Node.js/in-memory không được nói dối là đã persist vào IndexedDB");
      }
    });
  });
});
