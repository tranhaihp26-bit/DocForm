import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { classifyTable } from "../src/server/tableRoleClassifier.ts";
import { embeddedRecipientsSignatureTable } from "../src/shared/embeddedSignatureTable.ts";
import { reconstructFromReviewedBlocks, reconstructAppendixHtml } from "../src/utils/importReview.ts";
import { applySingleProposal, applyAllProposalsSequentially } from "../src/utils/proposalState.ts";
import { generateND30DocxUint8Array } from "../src/utils/docxExport.ts";
import { verifyCandidateContentFidelity } from "../src/utils/candidateContentFidelity.ts";
import { semanticHtmlParagraphs } from "../src/utils/candidateContentFidelity.ts";
import { prepareExportCandidate, type ExportCandidateSnapshot } from "../src/utils/exportCandidate.ts";
import { createWorkspaceSnapshot } from "../src/utils/workspaceState.ts";
import { approveWorkspacePartition } from "../src/utils/workspaceTransactions.ts";
import type { SourceBlock, DocumentState, DocumentFormatType, ReviewProposal } from "../src/shared/schemas/document.schema.ts";

describe("Task 3 & 4: Final Section and Appendix Roundtrip Contract", () => {
  it("preserves an inline source page break in the exported DOCX", async () => {
    const bytes = await generateND30DocxUint8Array({
      regime: "administrative",
      documentType: "THÔNG BÁO",
      subject: "Thử nghiệm ngắt trang nguồn",
      bodyHtml: '<p>Đoạn trước<span class="docx-page-break" data-page-break="true" title="Ngắt trang"></span>đoạn sau</p>',
    } as DocumentFormatType);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml);
    assert.match(xml, /<w:br\b[^>]*w:type="page"/,
      "Ngắt trang nội dòng từ nguồn phải được giữ trong candidate DOCX");
    assert.match(xml, /Đoạn trước[\s\S]*đoạn sau/,
      "Văn bản hai phía của ngắt trang phải được giữ theo đúng thứ tự");
  });

  it("compares an explicit page break as a semantic paragraph boundary", () => {
    assert.deepEqual(
      semanticHtmlParagraphs('<p>Trước ngắt<span class="docx-page-break" data-page-break="true"></span>sau ngắt</p>'),
      ["Trước ngắt", "sau ngắt"],
      "Candidate fidelity should compare text on each side of a page break separately",
    );
  });

  it("Task 3: Appendix source title/reference/content blocks output metadata exactly once", async () => {
    // 1. Synthetic source blocks mimicking pilot structure
    const blocks: SourceBlock[] = [
      { id: "b0_head", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "b1_org", index: 1, kind: "paragraph", role: "header", text: "CÔNG TY HOA TIÊU" },
      { id: "b2_type", index: 2, kind: "paragraph", role: "metadata", text: "KẾ HOẠCH\nVề việc kiểm tra phụ lục" },
      { id: "b3_body", index: 3, kind: "paragraph", role: "body", text: "Nội dung kế hoạch chính trong phần thân bài." },
      { id: "b4_app_title", index: 4, kind: "paragraph", role: "appendix", text: "PHỤ LỤC I: DANH SÁCH THỰC HIỆN" },
      { id: "b5_app_ref", index: 5, kind: "paragraph", role: "appendix", text: "(Kèm theo Kế hoạch số 01/KH-HT ngày 01 tháng 11 năm 2026)" },
      { id: "b6_app_p", index: 6, kind: "paragraph", role: "appendix", text: "Chi tiết các hạng mục được giao nhiệm vụ triển khai." },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "test.docx", fileType: "docx", standardType: "administrative" });
    assert.equal(segmented.appendices.length, 1, "Phải nhận diện đúng 1 phụ lục");
    const app = segmented.appendices[0];
    assert.equal(app.title, "PHỤ LỤC I: DANH SÁCH THỰC HIỆN");
    assert.equal(app.referenceText, "(Kèm theo Kế hoạch số 01/KH-HT ngày 01 tháng 11 năm 2026)");
    assert.equal(app.titleBlockId, "b4_app_title");
    assert.equal(app.referenceBlockId, "b5_app_ref");

    // app.html must ONLY contain content, NOT title or reference
    assert.ok(!app.html.includes("PHỤ LỤC I"), "app.html ban đầu không được chứa tiêu đề phụ lục");
    assert.ok(!app.html.includes("Kèm theo Kế hoạch"), "app.html ban đầu không được chứa referenceText");
    assert.ok(app.html.includes("Chi tiết các hạng mục"), "app.html phải chứa nội dung phụ lục");

    // 2. Reconstruct from reviewed blocks
    const reconstructed = reconstructFromReviewedBlocks(blocks, "state", segmented);
    assert.equal(reconstructed.appendices?.length, 1);
    const recApp = reconstructed.appendices![0];
    assert.ok(!recApp.html.includes("PHỤ LỤC I"), "app.html sau reconstruct không được chứa tiêu đề phụ lục");
    assert.ok(!recApp.html.includes("Kèm theo Kế hoạch"), "app.html sau reconstruct không được chứa referenceText");
    assert.ok(recApp.html.includes("Chi tiết các hạng mục"), "app.html phải giữ nguyên nội dung");

    // 3. User modifies content block text via AI proposal
    const proposal: ReviewProposal = {
      id: "prop_app_1",
      target: "appendix",
      targetBlockId: "b6_app_p",
      type: "spelling",
      title: "Cập nhật nội dung",
      original: "Chi tiết các hạng mục được giao nhiệm vụ triển khai.",
      suggested: "Chi tiết các hạng mục được phân công nhiệm vụ triển khai.",
      reason: "Đổi từ chính xác",
      confidence: "high",
    };

    const docState: DocumentState = {
      orgHeader1: "", orgHeader2: "CÔNG TY HOA TIÊU",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" as const,
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 01 tháng 11 năm 2026",
      documentType: "KẾ HOẠCH", referenceNumber: "Số: 01/KH-HT",
      subject: "Về việc kiểm tra phụ lục",
      bodyHtml: "<p>Nội dung kế hoạch chính trong phần thân bài.</p>",
      signTitle: "GIÁM ĐỐC", signName: "Nguyễn Văn A", recipients: "Như trên",
      appendices: reconstructed.appendices,
    };

    const applied = applySingleProposal(proposal, {
      reviewBlocks: blocks,
      doc: docState,
      structuredImport: segmented,
      acceptedProposalIds: new Set(),
    });
    assert.ok(applied.success);
    assert.ok(applied.nextState);
    const updatedApp = applied.nextState.doc.appendices![0];
    assert.ok(updatedApp.html.includes("được phân công nhiệm vụ"), "Nội dung sửa đổi phải đi vào app.html");
    assert.ok(!updatedApp.html.includes("PHỤ LỤC I"), "Sửa đề xuất không được làm lọt tiêu đề vào app.html");

    // 4. Export to DOCX and inspect OOXML
    const snapshotInput: ExportCandidateSnapshot = {
      doc: applied.nextState.doc,
      standardType: "state",
      reviewBlocks: applied.nextState.reviewBlocks,
      structuredImport: applied.nextState.structuredImport || null,
    };

    const wsSnapshot = createWorkspaceSnapshot(snapshotInput, { blobHash: "hash-app-test", generation: 1, blocks: applied.nextState.reviewBlocks });
    const approvedResult = approveWorkspacePartition(wsSnapshot);
    assert.ok(approvedResult.ok);

    const candidate = await prepareExportCandidate(approvedResult.snapshot);
    assert.ok(candidate);
    assert.equal(candidate.safe, true, `Candidate phải an toàn: ${JSON.stringify(candidate.blockers)}`);

    const zip = await JSZip.loadAsync(candidate.bytes);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml);

    // Count occurrences of title and reference in XML
    const titleMatches = (xml.match(/PHỤ LỤC I: DANH SÁCH THỰC HIỆN/g) || []).length;
    const refMatches = (xml.match(/Kèm theo Kế hoạch số 01\/KH-HT/g) || []).length;
    assert.equal(titleMatches, 1, `Tiêu đề phụ lục phải xuất hiện đúng 1 lần trong XML, thực tế: ${titleMatches}`);
    assert.equal(refMatches, 1, `ReferenceText phụ lục phải xuất hiện đúng 1 lần trong XML, thực tế: ${refMatches}`);
  });

  it("Task 3: Hai phụ lục có tiêu đề hoặc nội dung trùng text vẫn độc lập theo ID và xuất đúng", async () => {
    const blocks: SourceBlock[] = [
      { id: "b_app1_title", index: 0, kind: "paragraph", role: "appendix", text: "PHỤ LỤC: BẢNG KÊ" },
      { id: "b_app1_content", index: 1, kind: "paragraph", role: "appendix", text: "Nội dung quy định chung." },
      { id: "b_app2_title", index: 2, kind: "paragraph", role: "appendix", text: "PHỤ LỤC: BẢNG KÊ" },
      { id: "b_app2_content", index: 3, kind: "paragraph", role: "appendix", text: "Nội dung quy định chung." },
    ];

    const baseImport: any = {
      fields: {},
      appendices: [
        {
          id: "appendix-1",
          title: "PHỤ LỤC: BẢNG KÊ",
          titleBlockId: "b_app1_title",
          html: "<p>Nội dung quy định chung.</p>",
          blocks: [blocks[0], blocks[1]],
          sourceBlockIds: ["b_app1_title", "b_app1_content"],
          extractionStatus: "confirmed",
        },
        {
          id: "appendix-2",
          title: "PHỤ LỤC: BẢNG KÊ",
          titleBlockId: "b_app2_title",
          html: "<p>Nội dung quy định chung.</p>",
          blocks: [blocks[2], blocks[3]],
          sourceBlockIds: ["b_app2_title", "b_app2_content"],
          extractionStatus: "confirmed",
        },
      ],
    };

    const reconstructed = reconstructFromReviewedBlocks(blocks, "state", baseImport);
    assert.equal(reconstructed.appendices?.length, 2, "Cả hai phụ lục trùng text phải được giữ nguyên");
    assert.equal(reconstructed.appendices![0].id, "appendix-1");
    assert.equal(reconstructed.appendices![1].id, "appendix-2");
    assert.deepEqual(reconstructed.appendices![0].sourceBlockIds, ["b_app1_title", "b_app1_content"]);
    assert.deepEqual(reconstructed.appendices![1].sourceBlockIds, ["b_app2_title", "b_app2_content"]);

    // Neither html has duplicate title
    assert.ok(!reconstructed.appendices![0].html.includes("PHỤ LỤC: BẢNG KÊ"));
    assert.ok(!reconstructed.appendices![1].html.includes("PHỤ LỤC: BẢNG KÊ"));
  });

  it("Task 3: Candidate gate phát hiện và từ chối khi candidate bị chèn lặp tiêu đề hoặc mất khối", async () => {
    const docFormat: DocumentFormatType = {
      regime: "administrative",
      fontFamily: "Times New Roman",
      fontSize: 14,
      orgHeader1: "", orgHeader2: "CƠ QUAN MẪU",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hà Nội, ngày 01 tháng 11 năm 2026",
      documentType: "THÔNG BÁO", referenceNumber: "Số: 01/TB",
      subject: "Kiểm tra",
      bodyHtml: "<p>Thân bài chuẩn.</p>",
      signTitle: "GIÁM ĐỐC", signName: "Nguyễn Văn A", recipients: "Như trên",
      appendices: [
        {
          id: "app-1",
          title: "PHỤ LỤC I",
          html: "<p>Nội dung phụ lục 1.</p>",
          blocks: [],
          sourceBlockIds: ["block_app1"],
          extractionStatus: "confirmed",
        },
      ],
    };

    // Candidate bytes with correctly formatted document
    const validBytes = await generateND30DocxUint8Array(docFormat);

    const zip = await JSZip.loadAsync(validBytes);
    let validXml = await zip.file("word/document.xml")!.async("string");

    // Case A: Duplicate title injected into candidate XML
    const injectedXml = validXml.replace("PHỤ LỤC I", "PHỤ LỤC I</w:t></w:r></w:p><w:p><w:r><w:t>PHỤ LỤC I");
    const checkA = verifyCandidateContentFidelity(injectedXml, docFormat);
    assert.equal(checkA.safe, false, "Gate phải từ chối khi tiêu đề phụ lục bị lặp hai lần trong candidate");

    // Case B: Content block dropped from candidate XML
    const droppedXml = validXml.replace("Nội dung phụ lục 1.", "");
    const checkB = verifyCandidateContentFidelity(droppedXml, docFormat);
    assert.equal(checkB.safe, false, "Gate phải từ chối khi nội dung phụ lục bị mất");
  });

  it("Task 4: Signing table after appendix stays preserved pending ownership review", () => {
    const blocks: SourceBlock[] = [
      { id: "b0_head", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "b1_org", index: 1, kind: "paragraph", role: "header", text: "CÔNG TY HOA TIÊU" },
      { id: "b2_type", index: 2, kind: "paragraph", role: "metadata", text: "QUYẾT ĐỊNH\nVề việc ban hành quy chế" },
      { id: "b3_body", index: 3, kind: "paragraph", role: "body", text: "Ban hành kèm theo quyết định này quy chế hoạt động." },
      { id: "b4_app_title", index: 4, kind: "paragraph", role: "appendix", text: "PHỤ LỤC: QUY CHẾ HOẠT ĐỘNG" },
      { id: "b5_app_body", index: 5, kind: "paragraph", role: "appendix", text: "Điều 1. Phạm vi điều chỉnh và đối tượng áp dụng." },
      {
        id: "b6_term_sig", index: 6, kind: "table", role: "unclassified",
        text: "Nơi nhận:\n- Như trên\n\nGIÁM ĐỐC\n(Ký, đóng dấu)\nNguyễn Văn Cường",
        tableShape: { rows: 1, columns: 2 },
        tableData: [
          ["Nơi nhận:\n- Như trên;\n- Lưu: VT.", "GIÁM ĐỐC\n(Ký, đóng dấu)\nNguyễn Văn Cường"],
        ],
      },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "test.docx", fileType: "docx" });
    assert.equal(segmented.appendices.length, 1, "Có đúng 1 phụ lục");
    const app = segmented.appendices[0];
    assert.equal(app.sourceBlockIds.includes("b6_term_sig"), true, "Giữ bảng nguồn khi chưa chứng minh thuộc văn bản chính hay mẫu phụ lục");
    assert.equal(app.extractionStatus, "needs_review");
    assert.equal(Boolean(segmented.fields.signTitle?.value), false);
    assert.equal(Boolean(segmented.fields.signName?.value), false);
    assert.equal(Boolean(segmented.fields.recipients?.value), false);
  });

  it("Precommit: appendix form signing area does not invent a main-document signer", () => {
    const blocks: SourceBlock[] = [
      { id: "h", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "t", index: 1, kind: "paragraph", role: "metadata", text: "KẾ HOẠCH\nVề việc ban hành biểu mẫu" },
      { id: "p", index: 2, kind: "paragraph", role: "body", text: "Biểu mẫu kèm theo để tham khảo." },
      { id: "a", index: 3, kind: "paragraph", role: "appendix", text: "PHỤ LỤC: BIỂU MẪU BÁO CÁO" },
      { id: "c", index: 4, kind: "paragraph", role: "appendix", text: "Mẫu báo cáo nội bộ để điền." },
      { id: "s", index: 5, kind: "table", role: "appendix", text: "NGƯỜI LẬP | GIÁM ĐỐC", tableShape: { rows: 2, columns: 2 }, tableData: [["NGƯỜI LẬP", "GIÁM ĐỐC"], ["Người mẫu A", "Người mẫu B"]] },
    ];
    const result = segmentSourceBlocks(blocks, { filename: "synthetic.docx", fileType: "docx" });
    assert.equal(Boolean(result.fields.signName?.value), false, JSON.stringify(result.fields, null, 2));
    assert.equal(Boolean(result.fields.signTitle?.value), false);
    assert.equal(result.appendices[0].extractionStatus, "needs_review");
    assert.deepEqual(result.appendices[0].sourceBlockIds, ["a", "c", "s"]);
    assert.ok(result.appendices[0].html.includes("NGƯỜI LẬP"));
  });

  it("Precommit: reviewed appendix title/reference edits and clears update rendered metadata", async () => {
    const blocks: SourceBlock[] = [
      { id: "h", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "o", index: 1, kind: "paragraph", role: "header", text: "CƠ QUAN MẪU" },
      { id: "d", index: 2, kind: "paragraph", role: "metadata", text: "KẾ HOẠCH\nVề việc kiểm tra dữ liệu" },
      { id: "b", index: 3, kind: "paragraph", role: "body", text: "Thân bài kiểm tra tổng hợp." },
      { id: "at", index: 4, kind: "paragraph", role: "appendix", text: "PHỤ LỤC I: OLD_TITLE_SENTINEL" },
      { id: "ar", index: 5, kind: "paragraph", role: "appendix", text: "(Kèm theo OLD_REFERENCE_SENTINEL)" },
      { id: "ac", index: 6, kind: "paragraph", role: "appendix", text: "Nội dung phụ lục được giữ nguyên." },
    ];
    const segmented = segmentSourceBlocks(blocks, { filename: "synthetic.docx", fileType: "docx" });
    const edited = blocks.map(b => b.id === "at" ? { ...b, text: "PHỤ LỤC I: NEW_TITLE_SENTINEL" } : b.id === "ar" ? { ...b, text: "(Kèm theo NEW_REFERENCE_SENTINEL)" } : b);
    const reconstructed = reconstructFromReviewedBlocks(edited, "state", segmented);
    assert.equal(reconstructed.appendices![0].title, "PHỤ LỤC I: NEW_TITLE_SENTINEL");
    assert.equal(reconstructed.appendices![0].referenceText, "(Kèm theo NEW_REFERENCE_SENTINEL)");
    const cleared = reconstructFromReviewedBlocks(edited.map(b => ["at", "ar"].includes(b.id) ? { ...b, text: "" } : b), "state", segmented);
    assert.equal(cleared.appendices![0].title, "");
    assert.equal(cleared.appendices![0].referenceText, "");

    const doc: DocumentState = {
      orgHeader1: "", orgHeader2: "CƠ QUAN MẪU", nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hà Nội, ngày 02 tháng 11 năm 2026", documentType: "KẾ HOẠCH", referenceNumber: "Số: 01/KH", subject: "Về việc kiểm tra dữ liệu",
      bodyHtml: "<p>Thân bài kiểm tra tổng hợp.</p>", signTitle: "", signName: "", recipients: "", appendices: segmented.appendices,
    };
    const proposals: ReviewProposal[] = [
      { id: "edit-title", target: "appendix", targetBlockId: "at", type: "spelling", original: "OLD_TITLE_SENTINEL", suggested: "NEW_TITLE_SENTINEL", reason: "Synthetic edit", confidence: "high" },
      { id: "edit-reference", target: "appendix", targetBlockId: "ar", type: "spelling", original: "OLD_REFERENCE_SENTINEL", suggested: "NEW_REFERENCE_SENTINEL", reason: "Synthetic edit", confidence: "high" },
    ];
    const applied = applyAllProposalsSequentially(proposals, { reviewBlocks: blocks, doc, structuredImport: segmented, acceptedProposalIds: new Set() });
    assert.equal(applied.appliedCount, 2);
    const final = applied.finalState;
    assert.equal(final.doc.appendices![0].title, "PHỤ LỤC I: NEW_TITLE_SENTINEL");
    assert.equal(final.structuredImport!.appendices[0].referenceText, "(Kèm theo NEW_REFERENCE_SENTINEL)");
    const snapshot = createWorkspaceSnapshot({ doc: final.doc, standardType: "state", reviewBlocks: final.reviewBlocks, structuredImport: final.structuredImport ?? null }, { blobHash: "synthetic-title-ref", generation: 1, blocks: final.reviewBlocks });
    const approved = approveWorkspacePartition(snapshot);
    assert.ok(approved.ok);
    const candidate = await prepareExportCandidate(approved.snapshot);
    assert.equal(candidate.safe, true, JSON.stringify(candidate.blockers));
    const xml = await (await JSZip.loadAsync(candidate.bytes)).file("word/document.xml")!.async("string");
    assert.ok(xml.includes("NEW_TITLE_SENTINEL"));
    assert.ok(xml.includes("NEW_REFERENCE_SENTINEL"));
    assert.ok(!xml.includes("OLD_TITLE_SENTINEL"));
    assert.ok(!xml.includes("OLD_REFERENCE_SENTINEL"));
  });

  it("Precommit: legacy content starting with Phụ lục is not removed as metadata", () => {
    const content: SourceBlock = { id: "legacy-content", index: 0, kind: "paragraph", role: "appendix", text: "Phụ lục này gồm các bảng tham khảo." };
    const result = reconstructFromReviewedBlocks([content], "state", {
      fields: {},
      appendices: [{ id: "legacy-app", title: "PHỤ LỤC I", referenceText: "(Kèm theo văn bản tổng hợp)", html: `<p>${content.text}</p>`, blocks: [content], sourceBlockIds: [content.id], extractionStatus: "confirmed" }],
    } as any);
    assert.equal(result.appendices![0].title, "PHỤ LỤC I");
    assert.equal(result.appendices![0].referenceText, "(Kèm theo văn bản tổng hợp)");
    assert.ok(result.appendices![0].html.includes(content.text));
    assert.deepEqual(result.appendices![0].sourceBlockIds, [content.id]);
  });

  it("Task 4: Ambiguous table inside appendix is kept in appendix and NOT misclassified as document signature", () => {
    const blocks: SourceBlock[] = [
      { id: "b0_head", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "b1_type", index: 1, kind: "paragraph", role: "metadata", text: "KẾ HOẠCH\nPhân công công việc" },
      { id: "b2_body", index: 2, kind: "paragraph", role: "body", text: "Nội dung phân công chi tiết tại phụ lục." },
      { id: "b3_app_title", index: 3, kind: "paragraph", role: "appendix", text: "PHỤ LỤC: BẢNG PHÂN CÔNG" },
      {
        id: "b4_app_table", index: 4, kind: "table", role: "appendix",
        text: "STT | Nội dung | Cán bộ phụ trách",
        tableShape: { rows: 2, columns: 3 },
        tableData: [
          ["STT", "Nội dung", "Cán bộ phụ trách"],
          ["1", "Kiểm tra hiện trường", "Nguyễn Văn Thắng"],
        ],
      },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "plan.docx", fileType: "docx" });
    assert.equal(segmented.appendices.length, 1);
    assert.equal((segmented.appendices[0]?.tables || []).length, 1, "Bảng phân công phải thuộc phụ lục");
    assert.equal(Boolean(segmented.fields.signTitle?.value), false, "Không được tự ý suy đoán signer từ cột cán bộ phụ trách");
    assert.equal(Boolean(segmented.fields.signName?.value), false, "Không được tự ý suy đoán signName");
  });

  it("Task 4: Paragraph with line break (w:br / newline) preserves title and name without uppercase mutation", () => {
    const blocks: SourceBlock[] = [
      { id: "b0_head", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "b1_type", index: 1, kind: "paragraph", role: "metadata", text: "THÔNG BÁO\nVề việc nghỉ lễ" },
      { id: "b2_body", index: 2, kind: "paragraph", role: "body", text: "Toàn thể cán bộ nhân viên được nghỉ lễ theo quy định." },
      {
        id: "b3_sig", index: 3, kind: "paragraph", role: "unclassified",
        text: "GIÁM ĐỐC\n(Ký, đóng dấu)\nNguyễn Đức Thành",
      },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "tb.docx", fileType: "docx" });
    assert.equal(segmented.fields.signTitle?.value, "GIÁM ĐỐC");
    assert.equal(segmented.fields.signName?.value, "Nguyễn Đức Thành", "Tên người ký phải giữ nguyên hoa/thường ban đầu, không ép uppercase");
  });

  it("Task 4: One physical footer table maps recipients and signer by cell while preserving the table in Body", () => {
    const blocks: SourceBlock[] = [
      { id: "footer_head", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
      { id: "footer_subject", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc phối hợp" },
      { id: "footer_body", index: 2, kind: "paragraph", role: "unclassified", text: "Các đơn vị thực hiện nhiệm vụ theo thông báo." },
      {
        id: "footer_table", index: 3, kind: "table", role: "unclassified",
        text: "Nơi nhận: - Ban Giám đốc; - Lưu: VT. | GIÁM ĐỐC Nguyễn Văn Mẫu",
        tableShape: { rows: 1, columns: 2 },
        tableData: [["Nơi nhận:\n- Ban Giám đốc;\n- Lưu: VT.", "GIÁM ĐỐC\nNguyễn Văn Mẫu"]],
      },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "synthetic-footer.docx", fileType: "docx", standardType: "administrative" });
    const footer = (segmented.blocks || []).find(block => block.id === "footer_table");

    assert.equal(footer?.role, "signature", "The mixed footer table belongs to the final section, outside Body");
    assert.equal(segmented.fields.recipients?.value, "Nơi nhận:\n- Ban Giám đốc;\n- Lưu: VT.");
    assert.equal(segmented.fields.signTitle?.value, "GIÁM ĐỐC");
    assert.equal(segmented.fields.signName?.value, "Nguyễn Văn Mẫu");
    assert.deepEqual(segmented.fields.recipients?.sourceCell, { rowIndex: 0, colIndex: 0 });
    assert.deepEqual(segmented.fields.signTitle?.sourceCell, { rowIndex: 0, colIndex: 1 });
    assert.deepEqual(segmented.fields.signName?.sourceCell, { rowIndex: 0, colIndex: 1 });
    assert.equal(segmented.body.sourceBlockIds.includes("footer_table"), false, "The footer table must not be part of Body");
    assert.equal(segmented.body.html.includes("GIÁM ĐỐC"), false, "The footer table HTML must not be rendered in Body");
  });

  it("Task 4 regression: a multi-line signing formula with committee authority stays one mixed footer table", () => {
    const table: SourceBlock = {
      id: "footer_table_committee_chair", index: 3, kind: "table", role: "unclassified",
      text: "Nơi nhận: - Như trên; - Lưu: VT. | TM. BAN CHẤP HÀNH | CHỦ TỊCH | Người Mẫu",
      tableShape: { rows: 1, columns: 2 },
      tableData: [["Nơi nhận:\n- Như trên;\n- Lưu: VT.", "TM. BAN CHẤP HÀNH\nCHỦ TỊCH\nNgười Mẫu"]],
    };
    const blocks: SourceBlock[] = [
      { id: "committee_head", index: 0, kind: "paragraph", role: "unclassified", text: "QUYẾT ĐỊNH" },
      { id: "committee_subject", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc ban hành quy chế" },
      { id: "committee_body", index: 2, kind: "paragraph", role: "unclassified", text: "Nội dung quyết định." },
      table,
    ];

    const classification = classifyTable(table, blocks.slice(0, 3), "administrative");
    const segmented = segmentSourceBlocks(blocks, { filename: "synthetic-committee-footer.docx", fileType: "docx", standardType: "administrative" });
    const retained = segmented.blocks?.find(block => block.id === table.id);

    assert.equal(classification.owner, "signature", "The physical mixed footer table belongs to signature region, outside Body");
    assert.equal(embeddedRecipientsSignatureTable(table)?.signTitle, "TM. BAN CHẤP HÀNH\nCHỦ TỊCH");
    assert.equal(retained?.role, "signature");
    assert.equal(segmented.body.sourceBlockIds.includes(table.id), false, "The footer table must not be part of Body");
    assert.equal(segmented.fields.recipients?.value, "Nơi nhận:\n- Như trên;\n- Lưu: VT.");
    assert.equal(segmented.fields.signTitle?.value, "TM. BAN CHẤP HÀNH\nCHỦ TỊCH");
    assert.equal(segmented.fields.signName?.value, "Người Mẫu");
    assert.deepEqual(segmented.fields.recipients?.sourceCell, { rowIndex: 0, colIndex: 0 });
    assert.deepEqual(segmented.fields.signTitle?.sourceCell, { rowIndex: 0, colIndex: 1 });
    assert.deepEqual(segmented.fields.signName?.sourceCell, { rowIndex: 0, colIndex: 1 });
  });

  it("Task 4: One-line chức danh và họ tên trong bảng Nơi nhận vẫn được tách theo đúng ô nguồn", () => {
    const table: SourceBlock = {
      id: "footer_table_inline_signer", index: 3, kind: "table", role: "unclassified",
      text: "Nơi nhận: - Lãnh đạo cơ quan | GIÁM ĐỐC Nguyễn Văn Mẫu",
      tableShape: { rows: 1, columns: 2 },
      tableData: [["Nơi nhận:\n- Lãnh đạo cơ quan", "GIÁM ĐỐC Nguyễn Văn Mẫu"]],
      html: "<table><tr><td>Nơi nhận:<br/>- Lãnh đạo cơ quan</td><td>GIÁM ĐỐC Nguyễn Văn Mẫu</td></tr></table>",
    };
    const blocks: SourceBlock[] = [
      { id: "head", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
      { id: "subject", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc phối hợp" },
      { id: "body", index: 2, kind: "paragraph", role: "unclassified", text: "Các đơn vị thực hiện nhiệm vụ theo thông báo." },
      table,
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "synthetic-inline-footer.docx", fileType: "docx", standardType: "administrative" });
    const retained = segmented.blocks?.find(block => block.id === table.id);
    assert.equal(retained?.role, "signature", "The mixed footer table belongs to the final section, outside Body");
    assert.equal(segmented.body.sourceBlockIds.includes(table.id), false, "The footer table must not be part of Body");
    assert.equal(segmented.body.html.includes(table.html!), false, "The footer table HTML must not be rendered in Body");
    assert.equal(segmented.fields.recipients?.value, "Nơi nhận:\n- Lãnh đạo cơ quan");
    assert.equal(segmented.fields.signTitle?.value, "GIÁM ĐỐC");
    assert.equal(segmented.fields.signName?.value, "Nguyễn Văn Mẫu");
    assert.deepEqual(segmented.fields.signTitle?.sourceCell, { rowIndex: 0, colIndex: 1 });
    assert.deepEqual(segmented.fields.signName?.sourceCell, { rowIndex: 0, colIndex: 1 });
  });

  it("Task 4: Bảng cuối bổ sung các trường còn thiếu khi nơi nhận đã được nhận diện riêng", () => {
    const footer: SourceBlock = {
      id: "footer_table_partial_fields", index: 5, kind: "table", role: "unclassified",
      text: "Nơi nhận: - Lãnh đạo cơ quan | GIÁM ĐỐC Nguyễn Văn Mẫu",
      tableShape: { rows: 1, columns: 2 },
      tableData: [["Nơi nhận:\n- Lãnh đạo cơ quan", "GIÁM ĐỐC Nguyễn Văn Mẫu"]],
    };
    const blocks: SourceBlock[] = [
      { id: "head_partial", index: 0, kind: "paragraph", role: "unclassified", text: "THÔNG BÁO" },
      { id: "subject_partial", index: 1, kind: "paragraph", role: "unclassified", text: "Về việc phối hợp" },
      { id: "body_partial", index: 2, kind: "paragraph", role: "unclassified", text: "Các đơn vị thực hiện nhiệm vụ theo thông báo." },
      { id: "recipients_partial", index: 3, kind: "paragraph", role: "unclassified", text: "Nơi nhận:\n- Lãnh đạo cơ quan" },
      { id: "recipient_filing_partial", index: 4, kind: "paragraph", role: "unclassified", text: "- Lưu: VT." },
      footer,
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "synthetic-partial-footer.docx", fileType: "docx", standardType: "administrative" });
    assert.deepEqual(embeddedRecipientsSignatureTable(footer)?.signTitle, "GIÁM ĐỐC");
    assert.ok(segmented.fields.recipients?.value?.includes("Nơi nhận:") && segmented.fields.recipients?.value?.includes("- Lưu: VT."));
    assert.equal(segmented.fields.signTitle?.value, "GIÁM ĐỐC", `Missing signer title should be filled from the physical footer cell: ${JSON.stringify(segmented.fields.signTitle)}`);
    assert.equal(segmented.fields.signName?.value, "Nguyễn Văn Mẫu", `Missing signer name should be filled from the same source cell: ${JSON.stringify(segmented.fields.signName)}`);
    assert.equal(segmented.blocks?.find(block => block.id === footer.id)?.role, "signature", "The physical footer table belongs to the final section");
    assert.equal(segmented.body.sourceBlockIds.includes(footer.id), false, "The footer table must not be part of Body");

    const reviewedBlocks = (segmented.blocks || []).map(block => block.id === "recipients_partial"
      ? { ...block, role: "recipients" as const }
      : block);
    const reconstructed = reconstructFromReviewedBlocks(reviewedBlocks, "state", segmented);
    assert.equal(reconstructed.fields.recipients, "Nơi nhận:\n- Lãnh đạo cơ quan\n- Lưu: VT.");
    assert.equal(reconstructed.fields.signTitle, "GIÁM ĐỐC", "Reconstruction should fill the signer title when recipient paragraphs already supply a field");
    assert.equal(reconstructed.fields.signName, "Nguyễn Văn Mẫu", "Reconstruction should fill the signer name from the separate footer table");
  });

  it("Task 4: Multi-column signature table with Recipients + 2 signers keeps pairs synchronized with spacer column", () => {
    const blocks: SourceBlock[] = [
      { id: "b0_head", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "b1_type", index: 1, kind: "paragraph", role: "metadata", text: "BÁO CÁO\nTài chính quý" },
      { id: "b2_body", index: 2, kind: "paragraph", role: "body", text: "Báo cáo số liệu tài chính." },
      {
        id: "b3_table", index: 3, kind: "table", role: "unclassified",
        text: "Nơi nhận | Kế toán | | Giám đốc",
        tableShape: { rows: 2, columns: 4 },
        tableData: [
          ["Nơi nhận:\n- Ban Giám đốc;\n- Lưu: VT.", "KẾ TOÁN TRƯỞNG", "", "GIÁM ĐỐC"],
          ["", "Trần Thị Mai", "", "Lê Văn Hùng"],
        ],
      },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "report.docx", fileType: "docx" });
    assert.ok(segmented.fields.recipients?.value?.includes("Nơi nhận:"));
    assert.ok(segmented.fields.recipients?.value?.includes("Ban Giám đốc;"));
    assert.equal(segmented.fields.signTitle?.value, "KẾ TOÁN TRƯỞNG | GIÁM ĐỐC");
    assert.equal(segmented.fields.signName?.value, "Trần Thị Mai | Lê Văn Hùng");
  });

  it("Task 4: Recipients cluster includes non-bullet continuation lines and stops at signature boundary", () => {
    const blocks: SourceBlock[] = [
      { id: "b0_head", index: 0, kind: "paragraph", role: "header", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc" },
      { id: "b1_type", index: 1, kind: "paragraph", role: "metadata", text: "CÔNG VĂN\nVề việc phối hợp" },
      { id: "b2_body", index: 2, kind: "paragraph", role: "body", text: "Đề nghị phối hợp thực hiện nhiệm vụ." },
      { id: "b3_recip_hdr", index: 3, kind: "paragraph", role: "unclassified", text: "Nơi nhận:" },
      { id: "b4_recip_l1", index: 4, kind: "paragraph", role: "unclassified", text: "Ban Giám đốc;" },
      { id: "b5_recip_l2", index: 5, kind: "paragraph", role: "unclassified", text: "Các đơn vị thành viên;" },
      { id: "b6_recip_l3", index: 6, kind: "paragraph", role: "unclassified", text: "Lưu: VT." },
      { id: "b7_sig", index: 7, kind: "paragraph", role: "unclassified", text: "GIÁM ĐỐC\nNguyễn Văn A" },
    ];

    const segmented = segmentSourceBlocks(blocks, { filename: "cv.docx", fileType: "docx" });
    const recipVal = segmented.fields.recipients?.value || "";
    assert.ok(recipVal.includes("Nơi nhận:"), "Chứa tiêu đề Nơi nhận:");
    assert.ok(recipVal.includes("Ban Giám đốc;"), "Chứa dòng không bullet 1");
    assert.ok(recipVal.includes("Các đơn vị thành viên;"), "Chứa dòng không bullet 2");
    assert.ok(recipVal.includes("Lưu: VT."), "Chứa dòng lưu VT");
    assert.equal(segmented.fields.signTitle?.value, "GIÁM ĐỐC");
    assert.equal(segmented.fields.signName?.value, "Nguyễn Văn A");
  });

  it("Task 4: Proposal modifying signature block with same block ID updates fields instead of reusing stale fields", () => {
    const originalBlocks: SourceBlock[] = [
      {
        id: "sig_block", index: 0, kind: "table", role: "signature",
        text: "Nơi nhận | Giám đốc",
        tableShape: { rows: 2, columns: 2 },
        tableData: [
          ["Nơi nhận:\n- Như trên;", "GIÁM ĐỐC"],
          ["", "Nguyễn Văn Cũ"],
        ],
      },
    ];

    const baseImport: any = {
      blocks: originalBlocks,
      fields: {
        signTitle: { value: "GIÁM ĐỐC", sourceBlockIds: ["sig_block"] },
        signName: { value: "Nguyễn Văn Cũ", sourceBlockIds: ["sig_block"] },
        recipients: { value: "Nơi nhận:\n- Như trên;", sourceBlockIds: ["sig_block"] },
      },
    };

    // Modified blocks with the SAME id "sig_block" but changed cell text
    const editedBlocks: SourceBlock[] = [
      {
        id: "sig_block", index: 0, kind: "table", role: "signature",
        text: "Nơi nhận | Giám đốc",
        tableShape: { rows: 2, columns: 2 },
        tableData: [
          ["Nơi nhận:\n- Như trên;", "GIÁM ĐỐC"],
          ["", "Nguyễn Văn Mới"],
        ],
      },
    ];

    const reconstructed = reconstructFromReviewedBlocks(editedBlocks, "state", baseImport);
    assert.equal(reconstructed.fields.signName, "Nguyễn Văn Mới", "Tên người ký phải được cập nhật từ nội dung ô mới, không tái sử dụng giá trị cũ từ baseImport");
  });
});
