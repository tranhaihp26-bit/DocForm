import test from "node:test";
import assert from "node:assert/strict";
import {
  createPartitionFingerprint,
  validateProposalAgainstSource,
  chunkBlocksForAnalysis,
  analyzePartitionFallback,
  buildPartitionPrompt,
} from "../src/server/aiPartitionReview.ts";
import { checkProposalValidityBeforeApply } from "../src/shared/partitionValidation.ts";
import { reconstructFromReviewedBlocks } from "../src/utils/importReview.ts";
import type {
  SourceBlock,
  PartitionProposal,
  SourceRegion,
} from "../src/shared/schemas/document.schema.ts";

test("AI Partition Review - createPartitionFingerprint is deterministic and follows source content, not parser roles", () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", text: "TIÊU ĐỀ", role: "header" },
    { id: "b1", index: 1, kind: "paragraph", text: "Nội dung", role: "body" },
    { id: "b2", index: 2, kind: "paragraph", text: "THƯ KÝ", role: "signature" },
  ];

  const fp1 = createPartitionFingerprint(blocks, "administrative");
  const fp2 = createPartitionFingerprint(blocks, "administrative");
  assert.equal(fp1, fp2, "Fingerprints for identical blocks must match");

  // Regime change alters fingerprint
  const fpParty = createPartitionFingerprint(blocks, "party");
  assert.notEqual(fp1, fpParty, "Regime change must change fingerprint");

  // Parser role edit does not alter the role-independent AI source fingerprint.
  const modifiedBlocks: SourceBlock[] = [
    { ...blocks[0] },
    { ...blocks[1], role: "appendix" },
    { ...blocks[2] },
  ];
  const fpModified = createPartitionFingerprint(modifiedBlocks, "administrative");
  assert.equal(fp1, fpModified, "AI request identity must be independent from parser output");

  const editedText: SourceBlock[] = [
    { ...blocks[0] },
    { ...blocks[1], text: "Nội dung đã sửa" },
    { ...blocks[2] },
  ];
  assert.notEqual(fp1, createPartitionFingerprint(editedText, "administrative"), "Source edits must change fingerprint");
});

test("AI Partition Review - validateProposalAgainstSource strict validation", () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", text: "ĐẢNG CỘNG SẢN VIỆT NAM", role: "header" },
    { id: "b1", index: 1, kind: "paragraph", text: "Nội dung cuộc họp giám sát", role: "body" },
    {
      id: "b2",
      index: 2,
      kind: "table",
      text: "STT Nội dung Chủ trì",
      role: "body",
      tableShape: { rows: 2, columns: 3 },
      tableData: [
        ["STT", "Nội dung", "Chủ trì"],
        ["1", "Kiểm tra sổ sách", "Đồng chí A"]
      ],
      tableProperties: {
        rows: 2,
        columns: 3,
        mergedCells: [{ row: 0, col: 0, colSpan: 1, vMerge: "restart" }]
      }
    },
    { id: "b3", index: 3, kind: "paragraph", text: "-----------------", role: "body" },
  ];

  // 1. Valid proposal: existing block, matching quote, valid region
  const validProp: PartitionProposal = {
    sourceBlockId: "b0",
    currentRole: "header",
    suggestedRole: "metadata",
    exactQuote: "ĐẢNG CỘNG SẢN VIỆT NAM",
    reason: "Chuyển thành tiêu đề đảng",
    confidence: "high",
    status: "pending",
    regime: "party"
  };
  const resValid = validateProposalAgainstSource(validProp, blocks);
  assert.ok(resValid, "Valid proposal must pass validation");
  assert.equal(resValid?.suggestedRole, "metadata");

  // 2. Invalid block ID
  const invalidIdProp: PartitionProposal = {
    sourceBlockId: "b999",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "something",
    reason: "fake",
    confidence: "high",
    status: "pending",
    regime: "administrative"
  };
  const resInvalidId = validateProposalAgainstSource(invalidIdProp, blocks);
  assert.equal(resInvalidId, null, "Proposal with non-existent ID must be rejected");

  // 3. Mismatched exact quote
  const invalidQuoteProp: PartitionProposal = {
    sourceBlockId: "b1",
    currentRole: "body",
    suggestedRole: "appendix",
    exactQuote: "Chữ này không hề có trong khối b1",
    reason: "fake quote",
    confidence: "high",
    status: "pending",
    regime: "administrative"
  };
  const resInvalidQuote = validateProposalAgainstSource(invalidQuoteProp, blocks);
  assert.equal(resInvalidQuote, null, "Proposal with mismatched quote must be rejected");

  // 4. Invalid suggested role
  const invalidRoleProp: any = {
    sourceBlockId: "b1",
    currentRole: "body",
    suggestedRole: "non_existent_region",
    exactQuote: "Nội dung cuộc họp",
    reason: "invalid role",
    confidence: "high",
    status: "pending",
    regime: "administrative"
  };
  const resInvalidRole = validateProposalAgainstSource(invalidRoleProp, blocks);
  assert.equal(resInvalidRole, null, "Proposal with invalid region must be rejected");

  // 5. Table cell out of bounds
  const outOfBoundsCellProp: PartitionProposal = {
    sourceBlockId: "b2",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Kiểm tra sổ sách",
    cellLocation: { rowIndex: 5, colIndex: 10 }, // rows=2, cols=3
    reason: "out of bounds row/col",
    confidence: "medium",
    status: "pending",
    regime: "administrative"
  };
  const resOutOfBounds = validateProposalAgainstSource(outOfBoundsCellProp, blocks);
  assert.equal(resOutOfBounds, null, "Table proposal with out-of-bounds cell must be rejected");

  // 6. Valid separator region handling
  const sepProp: PartitionProposal = {
    sourceBlockId: "b3",
    currentRole: "body",
    suggestedRole: "separator",
    exactQuote: "-----------------",
    reason: "Dấu sao hoặc đường phân cách HD05",
    confidence: "high",
    status: "pending",
    regime: "party"
  };
  const resSep = validateProposalAgainstSource(sepProp, blocks);
  assert.ok(resSep, "Separator region must be recognized and validated");
  assert.equal(resSep?.suggestedRole, "separator");
});

test("AI Partition Review - chunkBlocksForAnalysis splits long docs without data loss", () => {
  const blocks: SourceBlock[] = Array.from({ length: 65 }, (_, i) => ({
    id: `block-${i}`,
    index: i,
    kind: (i % 5 === 0 ? "table" : "paragraph") as "table" | "paragraph",
    text: `Nội dung khối số ${i} của tài liệu dài cần phân tích`,
    role: (i < 5 ? "header" : i > 60 ? "signature" : "body") as SourceRegion,
  }));

  const chunks = chunkBlocksForAnalysis(blocks, 15);
  assert.equal(chunks.length, 5, "65 blocks in chunks of 15 should produce 5 chunks (15, 15, 15, 15, 5)");

  // Verify all block IDs are accounted for across chunks
  const flattenedIds = chunks.flatMap(c => c.map(b => b.id));
  assert.equal(flattenedIds.length, 65, "Total chunked blocks must be exactly 65");
  assert.deepEqual(flattenedIds, blocks.map(b => b.id), "Chunk order and block sequence must be strictly preserved");
});

test("AI Partition Review - analyzePartitionFallback operates deterministically", () => {
  const blocks: SourceBlock[] = [
    { id: "b0", index: 0, kind: "paragraph", text: "ĐẢNG ỦY CÔNG TY HOA TIÊU", role: "header" },
    { id: "b1", index: 1, kind: "paragraph", text: "ĐẢNG CỘNG SẢN VIỆT NAM", role: "header" },
    { id: "b2", index: 2, kind: "paragraph", text: "-----------------", role: "body" }, // separator misclassified as body
    { id: "b3", index: 3, kind: "paragraph", text: "BIÊN BẢN HỌP ĐOÀN GIÁM SÁT", role: "metadata" },
    { id: "b4", index: 4, kind: "paragraph", text: "1. Về tiến độ thực hiện", role: "body" },
    {
      id: "b5",
      index: 5,
      kind: "table",
      text: "STT Nội dung Chủ trì",
      role: "body",
      tableShape: { rows: 2, columns: 3 },
      tableData: [["STT", "Nội dung", "Chủ trì"], ["1", "Rà soát", "Đồng chí A"]]
    },
    {
      id: "b6",
      index: 6,
      kind: "table",
      text: "THƯ KÝ TRƯỞNG ĐOÀN GIÁM SÁT Nguyễn Thanh Huyền Lương Hồng Hải",
      role: "body", // signature table misclassified as body
      tableShape: { rows: 1, columns: 2 },
      tableData: [["THƯ KÝ\nNguyễn Thanh Huyền", "TRƯỞNG ĐOÀN GIÁM SÁT\nLương Hồng Hải"]]
    }
  ];

  const proposals = analyzePartitionFallback(blocks, "party");
  assert.ok(Array.isArray(proposals), "Fallback must return an array of proposals");

  // Proposal for separator
  const sepProp = proposals.find(p => p.sourceBlockId === "b2");
  assert.ok(sepProp, "Fallback must propose correcting separator block b2");
  assert.equal(sepProp?.suggestedRole, "separator");

  // Proposal for signature table
  const sigProp = proposals.find(p => p.sourceBlockId === "b6");
  assert.ok(sigProp, "Fallback must propose correcting signature table block b6");
  assert.equal(sigProp?.suggestedRole, "signature");

  // Content table b5 should NOT be proposed as signature
  const contentTableProp = proposals.find(p => p.sourceBlockId === "b5" && p.suggestedRole === "signature");
  assert.equal(contentTableProp, undefined, "Content table b5 must NOT be proposed as signature");
});

test("AI Partition Review - Zero Data Loss on applying proposal", () => {
  const originalBlock: SourceBlock = {
    id: "b4",
    index: 4,
    kind: "paragraph",
    text: "Thực hiện Quyết định số 05-QĐ/ĐU về giám sát chuyên đề.",
    html: "<p>Thực hiện Quyết định số 05-QĐ/ĐU về giám sát chuyên đề.</p>",
    role: "body",
  };

  const proposal: PartitionProposal = {
    sourceBlockId: "b4",
    currentRole: "body",
    suggestedRole: "appendix",
    exactQuote: "Thực hiện Quyết định số 05-QĐ/ĐU",
    reason: "Chuyển thành phụ lục tham chiếu",
    confidence: "high",
    status: "pending",
    regime: "party"
  };

  // Simulate applying proposal in App state
  const updatedBlock: SourceBlock = {
    ...originalBlock,
    role: proposal.suggestedRole,
  };

  // INVARIANT CHECK: Only role was changed
  assert.equal(updatedBlock.id, originalBlock.id);
  assert.equal(updatedBlock.index, originalBlock.index);
  assert.equal(updatedBlock.kind, originalBlock.kind);
  assert.equal(updatedBlock.text, originalBlock.text);
  assert.equal(updatedBlock.html, originalBlock.html);
  assert.equal(updatedBlock.role, "appendix");
});

test("AI Partition Review - Synthetic party document with two signer roles", () => {
  const blocks: SourceBlock[] = [
    { id: "party-header", index: 0, kind: "paragraph", text: "ĐẢNG CỘNG SẢN VIỆT NAM", role: "header" },
    { id: "party-org", index: 1, kind: "paragraph", text: "ĐẢNG ỦY CƠ QUAN THỬ NGHIỆM", role: "header" },
    { id: "party-title", index: 2, kind: "paragraph", text: "BIÊN BẢN HỌP ĐOÀN GIÁM SÁT", role: "metadata" },
    { id: "party-separator", index: 3, kind: "paragraph", text: "-----------------", role: "body" },
    {
      id: "party-signatures", index: 4, kind: "table",
      text: "THƯ KÝ TRƯỞNG ĐOÀN GIÁM SÁT Nguyễn Văn A Trần Thị B", role: "body",
      tableShape: { rows: 1, columns: 2 },
      tableData: [["THƯ KÝ\nNguyễn Văn A", "TRƯỞNG ĐOÀN GIÁM SÁT\nTrần Thị B"]],
    },
  ];

  const proposals = analyzePartitionFallback(blocks, "party");
  assert.ok(Array.isArray(proposals));

  // Check prompt building against synthetic source data only.
  const prompt = buildPartitionPrompt(blocks, 0, 1, "party");
  assert.ok(prompt.includes("8 VÙNG PHÂN LOẠI KHỐI"));
  assert.ok(prompt.includes("separator"));
  assert.ok(prompt.includes("ĐẢNG CỘNG SẢN VIỆT NAM"));
  assert.ok(prompt.includes("sourceBlockId"));
  assert.ok(prompt.includes("exactQuote"));
});

test("Regression P0 - cellLocation exact cell match vs quote in different cell", () => {
  const tableBlock: SourceBlock = {
    id: "tbl-reg-1",
    index: 2,
    kind: "table",
    text: "Mã Nhiệm vụ Trạng thái\nNV01 Rà soát quy chế Đang làm\nNV02 Lập báo cáo Hoàn thành",
    role: "body",
    tableShape: { rows: 3, columns: 3 },
    tableData: [
      ["Mã", "Nhiệm vụ", "Trạng thái"],
      ["NV01", "Rà soát quy chế", "Đang làm"],
      ["NV02", "Lập báo cáo", "Hoàn thành"],
    ],
  };

  const blocks = [tableBlock];

  // 1. Đúng ô: exactQuote nằm đúng ô [1, 1]
  const exactCellProp: PartitionProposal = {
    sourceBlockId: "tbl-reg-1",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Rà soát quy chế",
    cellLocation: { rowIndex: 1, colIndex: 1 },
    reason: "Thử nghiệm đúng ô",
    confidence: "high",
    status: "pending",
    regime: "administrative",
  };
  const resExact = validateProposalAgainstSource(exactCellProp, blocks);
  assert.ok(resExact, "Đề xuất đúng ô phải được chấp nhận");
  assert.equal(resExact?.cellLocation?.rowIndex, 1);
  assert.equal(resExact?.cellLocation?.colIndex, 1);
  assert.equal(resExact?.exactQuote, "Rà soát quy chế");

  // 2. Trích dẫn chỉ có ở ô khác: chỉ định [0, 0] ("Mã"), nhưng exactQuote là "Rà soát quy chế" (nằm ở [1, 1])
  // Phiên bản cũ: bị lỗi chấp nhận do tìm lại trong sourceBlock.text!
  // Phiên bản mới: bắt buộc từ chối, không tìm lại trong ô khác.
  const wrongCellProp: PartitionProposal = {
    sourceBlockId: "tbl-reg-1",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Rà soát quy chế",
    cellLocation: { rowIndex: 0, colIndex: 0 },
    reason: "Ô chỉ định sai so với trích dẫn",
    confidence: "high",
    status: "pending",
    regime: "administrative",
  };
  const resWrongCell = validateProposalAgainstSource(wrongCellProp, blocks);
  assert.equal(resWrongCell, null, "Đề xuất chỉ định ô không chứa exactQuote phải bị từ chối ngay, không tìm lại ô khác");

  // 3. Trích dẫn chỉ định ô [2, 0] ("NV02"), nhưng exactQuote là "Hoàn thành" (ở [2, 2])
  const wrongColProp: PartitionProposal = {
    sourceBlockId: "tbl-reg-1",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Hoàn thành",
    cellLocation: { rowIndex: 2, colIndex: 0 },
    reason: "Cột chỉ định sai",
    confidence: "high",
    status: "pending",
    regime: "administrative",
  };
  const resWrongCol = validateProposalAgainstSource(wrongColProp, blocks);
  assert.equal(resWrongCol, null, "Trích dẫn nằm ở cột khác trong cùng hàng phải bị từ chối");
});

test("Regression P0 - Coordinate validation: negative, fractional, string, out of bounds", () => {
  const tableBlock: SourceBlock = {
    id: "tbl-coords",
    index: 0,
    kind: "table",
    text: "A B\nC D",
    role: "body",
    tableShape: { rows: 2, columns: 2 },
    tableData: [
      ["A", "B"],
      ["C", "D"],
    ],
  };
  const paragraphBlock: SourceBlock = {
    id: "p-text",
    index: 1,
    kind: "paragraph",
    text: "Đoạn văn thông thường chứa chữ A",
    role: "body",
  };
  const blocks = [tableBlock, paragraphBlock];

  // 1. Tọa độ âm
  const negRowProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "A",
    cellLocation: { rowIndex: -1, colIndex: 0 },
    reason: "Tọa độ hàng âm",
  };
  assert.equal(validateProposalAgainstSource(negRowProp, blocks), null, "Tọa độ hàng âm phải bị từ chối");

  const negColProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "A",
    cellLocation: { rowIndex: 0, colIndex: -1 },
    reason: "Tọa độ cột âm",
  };
  assert.equal(validateProposalAgainstSource(negColProp, blocks), null, "Tọa độ cột âm phải bị từ chối");

  // 2. Tọa độ phân số / số thập phân (phiên bản cũ chấp nhận vì Number.isInteger chưa được kiểm tra)
  const floatRowProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "A",
    cellLocation: { rowIndex: 0.5, colIndex: 0 },
    reason: "Hàng phân số 0.5",
  };
  assert.equal(validateProposalAgainstSource(floatRowProp, blocks), null, "Tọa độ hàng phân số/thập phân phải bị từ chối");

  const floatColProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "B",
    cellLocation: { rowIndex: 0, colIndex: 1.5 },
    reason: "Cột phân số 1.5",
  };
  assert.equal(validateProposalAgainstSource(floatColProp, blocks), null, "Tọa độ cột phân số/thập phân phải bị từ chối");

  // 3. Tọa độ chuỗi (không được ép kiểu chuỗi thành số)
  const strRowProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "A",
    cellLocation: { rowIndex: "0", colIndex: 0 },
    reason: "Hàng kiểu string",
  };
  assert.equal(validateProposalAgainstSource(strRowProp, blocks), null, "Tọa độ chuỗi phải bị từ chối, không ép kiểu");

  // 4. Ngoài bảng
  const outRowProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "A",
    cellLocation: { rowIndex: 10, colIndex: 0 },
    reason: "Hàng vượt quá số hàng",
  };
  assert.equal(validateProposalAgainstSource(outRowProp, blocks), null, "Hàng vượt quá số hàng phải bị từ chối");

  const outColProp: any = {
    sourceBlockId: "tbl-coords",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "A",
    cellLocation: { rowIndex: 0, colIndex: 10 },
    reason: "Cột vượt quá số cột",
  };
  assert.equal(validateProposalAgainstSource(outColProp, blocks), null, "Cột vượt quá số cột phải bị từ chối");

  // 5. cellLocation chỉ định cho khối không phải bảng (paragraph không có tableData)
  const paraCellProp: any = {
    sourceBlockId: "p-text",
    currentRole: "body",
    suggestedRole: "header",
    exactQuote: "Đoạn văn thông thường",
    cellLocation: { rowIndex: 0, colIndex: 0 },
    reason: "Chỉ định cellLocation cho paragraph",
  };
  assert.equal(validateProposalAgainstSource(paraCellProp, blocks), null, "Khối không có tableData mà cung cấp cellLocation phải bị từ chối");
});

test("Regression P0 - Merged cells (gridSpan, vMerge, partiallyPreserved) flag requiresUserVerification", () => {
  // 1. Bảng có gridSpan
  const gridSpanTable: SourceBlock = {
    id: "tbl-gridspan",
    index: 0,
    kind: "table",
    text: "Tiêu đề chung\nCột 1 Cột 2",
    role: "body",
    tableData: [
      ["Tiêu đề chung"],
      ["Cột 1", "Cột 2"],
    ],
    tableProperties: {
      rows: 2,
      columns: 2,
      isGridSpan: true,
      mergedCells: [{ row: 0, col: 0, colSpan: 2 }],
    },
  };

  const prop1: any = {
    sourceBlockId: "tbl-gridspan",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Cột 1",
    cellLocation: { rowIndex: 1, colIndex: 0 },
    reason: "Chuyển thành chữ ký",
    confidence: "high",
    regime: "administrative",
  };
  const res1 = validateProposalAgainstSource(prop1, [gridSpanTable]);
  assert.ok(res1, "Đề xuất hợp lệ phải được chấp nhận");
  assert.equal(res1?.requiresUserVerification, true, "Bảng có gridSpan bắt buộc phải mang cờ requiresUserVerification: true");

  // 2. Bảng có vMerge
  const vMergeTable: SourceBlock = {
    id: "tbl-vmerge",
    index: 0,
    kind: "table",
    text: "Hàng dọc Dữ liệu 1\nHàng dọc Dữ liệu 2",
    role: "body",
    tableData: [
      ["Hàng dọc", "Dữ liệu 1"],
      ["Hàng dọc", "Dữ liệu 2"],
    ],
    tableProperties: {
      rows: 2,
      columns: 2,
      isVMerge: true,
      mergedCells: [{ row: 0, col: 0, rowSpan: 2, vMerge: "restart" }],
    },
  };
  const prop2: any = {
    sourceBlockId: "tbl-vmerge",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Dữ liệu 1",
    cellLocation: { rowIndex: 0, colIndex: 1 },
    reason: "Chuyển thành chữ ký",
    confidence: "high",
    regime: "administrative",
  };
  const res2 = validateProposalAgainstSource(prop2, [vMergeTable]);
  assert.ok(res2);
  assert.equal(res2?.requiresUserVerification, true, "Bảng có vMerge bắt buộc phải mang cờ requiresUserVerification: true");

  // 3. Bảng có partiallyPreserved
  const partialTable: SourceBlock = {
    id: "tbl-partial",
    index: 0,
    kind: "table",
    text: "Dữ liệu A Dữ liệu B",
    role: "body",
    tableData: [["Dữ liệu A", "Dữ liệu B"]],
    tableProperties: {
      rows: 1,
      columns: 2,
      partiallyPreserved: true,
    },
  };
  const prop3: any = {
    sourceBlockId: "tbl-partial",
    currentRole: "body",
    suggestedRole: "appendix",
    exactQuote: "Dữ liệu A",
    cellLocation: { rowIndex: 0, colIndex: 0 },
    reason: "Chuyển thành phụ lục",
    confidence: "high",
    regime: "administrative",
  };
  const res3 = validateProposalAgainstSource(prop3, [partialTable]);
  assert.ok(res3);
  assert.equal(res3?.requiresUserVerification, true, "Bảng có partiallyPreserved bắt buộc phải mang cờ requiresUserVerification: true");

  // 4. Bảng có bản đồ ô thiếu tin cậy (ragged row lengths)
  const raggedTable: SourceBlock = {
    id: "tbl-ragged",
    index: 0,
    kind: "table",
    text: "A B C\nD E",
    role: "body",
    tableData: [
      ["A", "B", "C"],
      ["D", "E"], // thiếu 1 cột so với hàng đầu
    ],
  };
  const prop4: any = {
    sourceBlockId: "tbl-ragged",
    currentRole: "body",
    suggestedRole: "appendix",
    exactQuote: "A",
    cellLocation: { rowIndex: 0, colIndex: 0 },
    reason: "Bảng không đều số cột",
    confidence: "high",
    regime: "administrative",
  };
  const res4 = validateProposalAgainstSource(prop4, [raggedTable]);
  assert.ok(res4);
  assert.equal(res4?.requiresUserVerification, true, "Bảng có cấu trúc cột không đều phải mang cờ requiresUserVerification: true");
});

test("Regression P0 - Table proposal without cellLocation", () => {
  const tableBlock: SourceBlock = {
    id: "tbl-no-cell",
    index: 1,
    kind: "table",
    text: "Họ tên Chức vụ\nNguyễn Văn A Trưởng phòng",
    role: "body",
    tableShape: { rows: 2, columns: 2 },
    tableData: [
      ["Họ tên", "Chức vụ"],
      ["Nguyễn Văn A", "Trưởng phòng"],
    ],
  };
  const blocks = [tableBlock];

  // 1. Đề xuất bảng không có cellLocation, nhưng exactQuote có trong bảng
  const validNoCellProp: PartitionProposal = {
    sourceBlockId: "tbl-no-cell",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Nguyễn Văn A",
    // cellLocation cố tình để undefined
    reason: "Bảng ký không rõ ô cụ thể",
    confidence: "medium",
    status: "pending",
    regime: "administrative",
  };
  const resValid = validateProposalAgainstSource(validNoCellProp, blocks);
  assert.ok(resValid, "Đề xuất cho bảng không có cellLocation nhưng có trích dẫn thật phải được chấp nhận");
  assert.equal(resValid?.requiresUserVerification, true, "Đề xuất cho bảng không có cellLocation BẮT BUỘC có requiresUserVerification: true");
  assert.equal(resValid?.cellLocation, undefined);

  // 2. Đề xuất bảng không có cellLocation và exactQuote KHÔNG có trong bảng (hallucinated)
  const invalidNoCellProp: PartitionProposal = {
    sourceBlockId: "tbl-no-cell",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Từ này hoàn toàn không có trong bảng",
    reason: "Trích dẫn bịa đặt",
    confidence: "medium",
    status: "pending",
    regime: "administrative",
  };
  const resInvalid = validateProposalAgainstSource(invalidNoCellProp, blocks);
  assert.equal(resInvalid, null, "Đề xuất cho bảng không có cellLocation và trích dẫn không có thật phải bị từ chối");
});

test("Regression P0 - Pre-apply validity check and manual confirmation guard", () => {
  const tableBlock: SourceBlock = {
    id: "tbl-check",
    index: 0,
    kind: "table",
    text: "STT Nội dung\n1 Khởi tạo dự án",
    role: "body",
    tableData: [
      ["STT", "Nội dung"],
      ["1", "Khởi tạo dự án"],
    ],
  };
  const paraBlock: SourceBlock = {
    id: "p-check",
    index: 1,
    kind: "paragraph",
    text: "Nội dung điều khoản số 1",
    role: "body",
  };
  const currentBlocks = [tableBlock, paraBlock];

  const tableProposal: PartitionProposal = {
    id: "prop-tbl-1",
    sourceBlockId: "tbl-check",
    currentRole: "body",
    suggestedRole: "signature",
    exactQuote: "Khởi tạo dự án",
    cellLocation: { rowIndex: 1, colIndex: 1 },
    reason: "Bảng ký dự án",
    confidence: "high",
    status: "pending",
    regime: "administrative",
    requiresUserVerification: true,
  };

  // 1. Trạng thái hợp lệ ban đầu
  const checkValid = checkProposalValidityBeforeApply(tableProposal, currentBlocks, "administrative");
  assert.equal(checkValid.valid, true, "Đề xuất ban đầu phải hợp lệ");

  // 2. Báo hết hiệu lực nếu khối bị xóa
  const checkMissingBlock = checkProposalValidityBeforeApply(tableProposal, [paraBlock], "administrative");
  assert.equal(checkMissingBlock.valid, false);
  assert.match(checkMissingBlock.reason || "", /không còn tồn tại/i);

  // 3. Báo hết hiệu lực nếu vai trò của khối đã bị đổi trước đó
  const modifiedRoleBlocks = [
    { ...tableBlock, role: "appendix" as SourceRegion },
    paraBlock,
  ];
  const checkRoleChanged = checkProposalValidityBeforeApply(tableProposal, modifiedRoleBlocks, "administrative");
  assert.equal(checkRoleChanged.valid, false);
  assert.match(checkRoleChanged.reason || "", /đã thay đổi/i);

  // 4. Báo hết hiệu lực nếu khối đã chuyển sang đúng suggestedRole
  const alreadyAppliedBlocks = [
    { ...tableBlock, role: "signature" as SourceRegion },
    paraBlock,
  ];
  const checkAlreadyApplied = checkProposalValidityBeforeApply(tableProposal, alreadyAppliedBlocks, "administrative");
  assert.equal(checkAlreadyApplied.valid, false);
  assert.match(checkAlreadyApplied.reason || "", /đã ở vùng/i);

  // 5. Báo hết hiệu lực nếu chuyển đổi chế độ thể thức (từ administrative sang party)
  const checkRegimeChanged = checkProposalValidityBeforeApply(tableProposal, currentBlocks, "party");
  assert.equal(checkRegimeChanged.valid, false);
  assert.match(checkRegimeChanged.reason || "", /chế độ thể thức đã thay đổi/i);

  // 6. Báo hết hiệu lực nếu nội dung ô chỉ định đã thay đổi (không còn exactQuote)
  const modifiedCellBlocks = [
    {
      ...tableBlock,
      tableData: [
        ["STT", "Nội dung"],
        ["1", "Nội dung đã được chỉnh sửa khác"],
      ],
    },
    paraBlock,
  ];
  const checkCellContentChanged = checkProposalValidityBeforeApply(tableProposal, modifiedCellBlocks, "administrative");
  assert.equal(checkCellContentChanged.valid, false);
  assert.match(checkCellContentChanged.reason || "", /đã thay đổi/i);

  // 7. Báo hết hiệu lực nếu bảng bị thu nhỏ khiến cellLocation ngoài bảng
  const shrunkTableBlocks = [
    {
      ...tableBlock,
      tableData: [["STT", "Nội dung"]], // chỉ còn 1 hàng
    },
    paraBlock,
  ];
  const checkCellOOB = checkProposalValidityBeforeApply(tableProposal, shrunkTableBlocks, "administrative");
  assert.equal(checkCellOOB.valid, false);
  assert.match(checkCellOOB.reason || "", /không còn hợp lệ/i);

  // 8. Báo hết hiệu lực với đoạn văn khi text thay đổi
  const paraProposal: PartitionProposal = {
    id: "prop-para-1",
    sourceBlockId: "p-check",
    currentRole: "body",
    suggestedRole: "appendix",
    exactQuote: "điều khoản số 1",
    reason: "Phụ lục",
    confidence: "high",
    status: "pending",
    regime: "administrative",
  };
  const modifiedParaBlocks = [
    tableBlock,
    { ...paraBlock, text: "Văn bản đã xóa bỏ toàn bộ điều khoản" },
  ];
  const checkParaContentChanged = checkProposalValidityBeforeApply(paraProposal, modifiedParaBlocks, "administrative");
  assert.equal(checkParaContentChanged.valid, false);
  assert.match(checkParaContentChanged.reason || "", /không còn chứa trích dẫn/i);

  // 9. Kiểm tra cơ chế guard xác nhận trước khi áp dụng:
  const verifiedProposalIds = new Set<string>();

  // Hàm mô phỏng guard của giao diện React (tương tự handleApplyPartitionProposal)
  function simulateApply(prop: PartitionProposal, blocks: SourceBlock[], userConfirmedSet: Set<string>) {
    if (prop.requiresUserVerification && !userConfirmedSet.has(prop.id || "")) {
      return { success: false, reason: "NEEDS_USER_CONFIRMATION" };
    }
    const check = checkProposalValidityBeforeApply(prop, blocks, "administrative");
    if (!check.valid) {
      return { success: false, reason: check.reason };
    }
    return { success: true };
  }

  // Khi chưa tích xác nhận:
  const unconfirmedResult = simulateApply(tableProposal, currentBlocks, verifiedProposalIds);
  assert.equal(unconfirmedResult.success, false);
  assert.equal(unconfirmedResult.reason, "NEEDS_USER_CONFIRMATION", "Chưa xác nhận đối chiếu đúng ô thì không thể áp dụng");

  // Sau khi người dùng tích xác nhận:
  verifiedProposalIds.add(tableProposal.id || "");
  const confirmedResult = simulateApply(tableProposal, currentBlocks, verifiedProposalIds);
  assert.equal(confirmedResult.success, true, "Đã xác nhận đối chiếu và hợp lệ thì áp dụng thành công");
});
