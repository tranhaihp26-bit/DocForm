import test from "node:test";
import assert from "node:assert/strict";
import {
  computePartitionFingerprint,
  isReviewProposalBatchValid,
  applySingleProposal,
  applyAllProposalsSequentially,
  type CanonicalWorkflowState,
  type ReviewProposalBatchContext,
} from "../src/utils/proposalState.ts";
import type { ReviewProposal, SourceBlock, DocumentState } from "../src/shared/schemas/document.schema.ts";

function createDummyDoc(): DocumentState {
  return {
    headerProfile: "generic",
    orgHeader1: "CƠ QUAN CHỦ QUẢN",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 101/KH-TEST",
    subject: "V/v Kế hoạch kiểm thử tính an toàn của đề xuất",
    bodyHtml: "<p>Nội dung đoạn văn thứ nhất.</p><p>Nội dung đoạn văn thứ hai.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký Mẫu",
    recipients: "Như trên;\nLưu: VT.",
  };
}

function createDummyBlocks(): SourceBlock[] {
  return [
    {
      id: "block-0",
      index: 0,
      kind: "paragraph",
      role: "header",
      text: "CƠ QUAN CHỦ QUẢN",
      html: "<p>CƠ QUAN CHỦ QUẢN</p>",
    },
    {
      id: "block-1",
      index: 1,
      kind: "paragraph",
      role: "metadata",
      text: "V/v Kế hoạch kiểm thử tính an toàn của đề xuất",
      html: "<p>V/v Kế hoạch kiểm thử tính an toàn của đề xuất</p>",
    },
    {
      id: "block-2",
      index: 2,
      kind: "paragraph",
      role: "body",
      text: "Nội dung đoạn văn thứ nhất.",
      html: "<p>Nội dung đoạn văn thứ nhất.</p>",
    },
  ];
}

test("Unit 1: computePartitionFingerprint reflects block IDs and roles accurately", () => {
  const blocks = createDummyBlocks();
  const fp1 = computePartitionFingerprint(blocks);
  assert.equal(fp1, "block-0:header;block-1:metadata;block-2:body");

  // Changing a block role changes the fingerprint
  const modifiedBlocks: SourceBlock[] = [
    blocks[0],
    { ...blocks[1], role: "body" },
    blocks[2],
  ];
  const fp2 = computePartitionFingerprint(modifiedBlocks);
  assert.notEqual(fp1, fp2);
  assert.equal(fp2, "block-0:header;block-1:body;block-2:body");
});

test("Unit 2: isReviewProposalBatchValid validates sourceGeneration, standardType, and monotonic partitionRevision", () => {
  const baseCtx: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "state",
    partitionRevision: 1,
    partitionFingerprint: "block-0:header;block-1:metadata",
  };

  // Exact match
  assert.equal(isReviewProposalBatchValid(baseCtx, { ...baseCtx }), true);

  // Mismatched regime (e.g. switched to party HD 05)
  assert.equal(isReviewProposalBatchValid(baseCtx, { ...baseCtx, standardType: "party" }), false);

  // Mismatched sourceGeneration (e.g. new file uploaded)
  assert.equal(isReviewProposalBatchValid(baseCtx, { ...baseCtx, sourceGeneration: 2 }), false);

  // Mismatched partitionRevision (e.g. block role edited or undone)
  assert.equal(
    isReviewProposalBatchValid(baseCtx, { ...baseCtx, partitionRevision: 2 }),
    false
  );

  // Null batch context
  assert.equal(isReviewProposalBatchValid(null, baseCtx), false);
  assert.equal(isReviewProposalBatchValid(undefined, baseCtx), false);
});

test("Unit 3: applySingleProposal rejects proposal when batch context does NOT match current context", () => {
  const doc = createDummyDoc();
  const blocks = createDummyBlocks();
  const fp = computePartitionFingerprint(blocks);

  const proposalND30: ReviewProposal = {
    id: "prop-subject-nd30",
    type: "format",
    target: "subject",
    original: doc.subject,
    suggested: "V/v Kế hoạch kiểm thử đã được chuẩn hóa NĐ 30",
    reason: "Chuẩn hóa trích yếu theo NĐ 30",
    confidence: "high",
  };

  const batchContextState: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "state",
    partitionRevision: 1,
    partitionFingerprint: fp,
  };

  // Current context has switched to "party" (HD 05)
  const currentContextParty: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "party",
    partitionRevision: 1,
    partitionFingerprint: fp,
  };

  const workflowState: CanonicalWorkflowState = {
    reviewBlocks: blocks,
    doc,
    acceptedProposalIds: new Set(),
    proposalBatchContext: batchContextState,
    currentContext: currentContextParty,
  };

  const result = applySingleProposal(proposalND30, workflowState);
  assert.equal(result.success, false);
  assert.match(result.reason || "", /hết hiệu lực do thể thức, nguồn hoặc phân vùng/);
  // Document remains unchanged
  assert.equal(workflowState.doc.subject, "V/v Kế hoạch kiểm thử tính an toàn của đề xuất");
});

test("Unit 4: applySingleProposal applies successfully when context matches, and sibling proposals remain applicable", () => {
  const doc = createDummyDoc();
  const blocks = createDummyBlocks();
  const fp = computePartitionFingerprint(blocks);

  const proposal1: ReviewProposal = {
    id: "prop-1",
    type: "format",
    target: "subject",
    original: doc.subject,
    suggested: "V/v Kế hoạch kiểm thử đã được chuẩn hóa",
    reason: "Chuẩn hóa trích yếu",
    confidence: "high",
  };

  const proposal2: ReviewProposal = {
    id: "prop-2",
    type: "format",
    target: "signTitle",
    original: doc.signTitle,
    suggested: "TỔNG GIÁM ĐỐC",
    reason: "Chuẩn hóa chức vụ",
    confidence: "high",
  };

  const context: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "state",
    partitionRevision: 1,
    partitionFingerprint: fp,
  };

  const workflowState: CanonicalWorkflowState = {
    reviewBlocks: blocks,
    doc,
    acceptedProposalIds: new Set(),
    proposalBatchContext: context,
    currentContext: context,
  };

  // Apply proposal 1
  const res1 = applySingleProposal(proposal1, workflowState);
  assert.equal(res1.success, true);
  assert.ok(res1.nextState);
  assert.equal(res1.nextState.doc.subject, "V/v Kế hoạch kiểm thử đã được chuẩn hóa");
  assert.equal(res1.nextState.acceptedProposalIds.has("prop-1"), true);
  assert.equal(res1.nextState.acceptedProposalIds.has("prop-2"), false);

  // Apply sibling proposal 2 on nextState (without being invalidated by proposal 1)
  const res2 = applySingleProposal(proposal2, res1.nextState);
  assert.equal(res2.success, true);
  assert.ok(res2.nextState);
  assert.equal(res2.nextState.doc.signTitle, "TỔNG GIÁM ĐỐC");
  assert.equal(res2.nextState.doc.subject, "V/v Kế hoạch kiểm thử đã được chuẩn hóa");
  assert.equal(res2.nextState.acceptedProposalIds.has("prop-1"), true);
  assert.equal(res2.nextState.acceptedProposalIds.has("prop-2"), true);
});

test("Unit 5: applyAllProposalsSequentially rejects all proposals if batch context is invalid for current context", () => {
  const doc = createDummyDoc();
  const blocks = createDummyBlocks();
  const fp = computePartitionFingerprint(blocks);

  const proposals: ReviewProposal[] = [
    {
      id: "prop-1",
      type: "format",
      target: "subject",
      original: doc.subject,
      suggested: "V/v Đề xuất 1",
      reason: "Lý do 1",
      confidence: "high",
    },
    {
      id: "prop-2",
      type: "format",
      target: "signTitle",
      original: doc.signTitle,
      suggested: "QUYỀN GIÁM ĐỐC",
      reason: "Lý do 2",
      confidence: "high",
    },
  ];

  const batchCtx: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "state",
    partitionRevision: 1,
    partitionFingerprint: fp,
  };

  const currentCtxMismatched: ReviewProposalBatchContext = {
    sourceGeneration: 2, // New source generation
    standardType: "state",
    partitionRevision: 1,
    partitionFingerprint: fp,
  };

  const state: CanonicalWorkflowState = {
    reviewBlocks: blocks,
    doc,
    acceptedProposalIds: new Set(),
    proposalBatchContext: batchCtx,
    currentContext: currentCtxMismatched,
  };

  const res = applyAllProposalsSequentially(proposals, state);
  assert.equal(res.appliedCount, 0);
  assert.equal(res.rejectedReasons.length, 1);
  assert.match(res.rejectedReasons[0], /hết hiệu lực/);
  assert.equal(res.finalState.doc.subject, doc.subject);
  assert.equal(res.finalState.doc.signTitle, doc.signTitle);
});

test("Unit 6: partition role roundtrip A -> B -> A must permanently invalidate batch context and prevent application", () => {
  const doc = createDummyDoc();
  const blocks = createDummyBlocks();
  const fpInitial = computePartitionFingerprint(blocks);

  const proposal: ReviewProposal = {
    id: "prop-stale-after-roundtrip",
    type: "format",
    target: "subject",
    original: doc.subject,
    suggested: "V/v Đề xuất cũ bị stale sau khi phân vùng đảo chiều",
    reason: "Kiểm tra an toàn đơn điệu",
    confidence: "high",
  };

  // AI review was performed when partitionRevision was 1
  const batchCtx: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "state",
    partitionRevision: 1,
    partitionFingerprint: fpInitial,
  };

  // Step 1: User changes block-0 from 'header' to 'body' (A -> B)
  // partitionRevision increments: 1 -> 2
  const modifiedBlocksB: SourceBlock[] = [
    { ...blocks[0], role: "body" },
    blocks[1],
    blocks[2],
  ];
  const fpB = computePartitionFingerprint(modifiedBlocksB);
  assert.notEqual(fpB, fpInitial);

  // Step 2: User changes block-0 back or undoes (B -> A)
  // partitionRevision increments monotonically: 2 -> 3
  const restoredBlocksA: SourceBlock[] = [
    { ...blocks[0], role: "header" },
    blocks[1],
    blocks[2],
  ];
  const fpRestored = computePartitionFingerprint(restoredBlocksA);
  // The fingerprint string has round-tripped back to initial!
  assert.equal(fpRestored, fpInitial);

  // But the current context has partitionRevision = 3 (monotonic!)
  const currentCtxAfterRoundtrip: ReviewProposalBatchContext = {
    sourceGeneration: 1,
    standardType: "state",
    partitionRevision: 3,
    partitionFingerprint: fpRestored,
  };

  // 1. isReviewProposalBatchValid MUST return false despite identical fingerprint
  const isValid = isReviewProposalBatchValid(batchCtx, currentCtxAfterRoundtrip);
  assert.equal(isValid, false, "Batch context must be invalid after partition role roundtrip A -> B -> A");

  // 2. applySingleProposal MUST reject the stale proposal
  const state: CanonicalWorkflowState = {
    reviewBlocks: restoredBlocksA,
    doc,
    acceptedProposalIds: new Set(),
    proposalBatchContext: batchCtx,
    currentContext: currentCtxAfterRoundtrip,
  };
  const singleRes = applySingleProposal(proposal, state);
  assert.equal(singleRes.success, false);
  assert.match(singleRes.reason || "", /hết hiệu lực do thể thức, nguồn hoặc phân vùng/);
  assert.equal(state.doc.subject, doc.subject);

  // 3. applyAllProposalsSequentially MUST also reject
  const allRes = applyAllProposalsSequentially([proposal], state);
  assert.equal(allRes.appliedCount, 0);
  assert.equal(allRes.rejectedReasons.length, 1);
  assert.match(allRes.rejectedReasons[0], /hết hiệu lực/);
  assert.equal(allRes.finalState.doc.subject, doc.subject);
});
