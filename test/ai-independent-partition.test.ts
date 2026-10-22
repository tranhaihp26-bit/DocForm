import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPartitionPrompt,
  createPartitionFingerprint,
  validateProposalAgainstSource,
} from "../src/server/aiPartitionReview.ts";
import { runPartitionAiService } from "../src/server/aiPartitionService.ts";
import { applyPartitionProposalBatch } from "../src/shared/partitionApply.ts";
import { checkProposalValidityBeforeApply } from "../src/shared/partitionValidation.ts";
import {
  PARTITION_AI_SCHEMA_VERSION,
  validatePartitionAiRequest,
  validatePartitionAiResponse,
  type PartitionAiRequest,
} from "../src/shared/partitionAiProtocol.ts";
import type { SourceBlock } from "../src/shared/schemas/document.schema.ts";

test("AI prompt uses full source evidence without parser roles or shortened previews", () => {
  const longText = `Đoạn mở đầu ${"nội dung đầy đủ ".repeat(40)}đoạn cuối phải được giữ nguyên`;
  const source: SourceBlock[] = [
    {
      id: "p-1",
      index: 0,
      kind: "paragraph",
      text: longText,
      role: "body",
    },
    {
      id: "t-1",
      index: 1,
      kind: "table",
      text: "Bảng lịch công tác",
      role: "body",
      tableData: [["Cột A", "Cột B"], ["hàng hai", "ô cuối đầy đủ"]],
    },
  ];

  const prompt = buildPartitionPrompt(source, 0, 1, "administrative");
  assert.ok(prompt.includes(longText), "AI must receive the complete paragraph evidence");
  assert.ok(prompt.includes("ô cuối đầy đủ"), "AI must receive every table row and cell");
  assert.doesNotMatch(prompt, /currentRole|textSnippet|firstRowPreview|tableHasMergedCells/);
  assert.doesNotMatch(prompt, /\"role\"\s*:/, "Parser role must not be sent as AI context");
});

test("partition fingerprint follows source content and regime, not parser role or filename", () => {
  const first: SourceBlock[] = [
    { id: "p-1", index: 0, kind: "paragraph", text: "Nội dung nguồn", role: "body" },
  ];
  const reclassified = [{ ...first[0], role: "appendix" as const }];
  const edited = [{ ...first[0], text: "Nội dung nguồn đã sửa" }];

  const originalFingerprint = createPartitionFingerprint(first, "administrative", "A.docx");
  assert.equal(
    createPartitionFingerprint(reclassified, "administrative", "B.docx"),
    originalFingerprint,
    "AI request identity must not depend on rule-parser output or local filename",
  );
  assert.notEqual(
    createPartitionFingerprint(edited, "administrative"),
    originalFingerprint,
    "Source content edits must produce a new request identity",
  );
  assert.notEqual(
    createPartitionFingerprint(first, "party"),
    originalFingerprint,
    "The selected document regime remains part of request identity",
  );
});

test("a table proposal with a mismatched source cell id is rejected", () => {
  const table: SourceBlock = {
    id: "table-1",
    index: 0,
    kind: "table",
    text: "Chức vụ",
    role: "body",
    tableData: [["THƯ KÝ"]],
    tableModel: {
      tableId: "tbl-src-1",
      rowsCount: 1,
      columnsCount: 1,
      gridColumnsTwips: [900],
      tableWidthTwips: 900,
      widthType: "dxa",
      alignment: "left",
      hasBorders: true,
      rows: [{
        rowIndex: 0,
        isHeader: false,
        cantSplit: false,
        cells: [{
          cellId: "source-cell-r0-c0",
          rowIndex: 0,
          colIndex: 0,
          gridColumn: 0,
          gridSpan: 1,
          text: "THƯ KÝ",
          paragraphs: [{ text: "THƯ KÝ" }],
        }],
      }],
    },
  };

  const validated = validateProposalAgainstSource({
    sourceBlockId: "table-1",
    suggestedRole: "signature",
    exactQuote: "THƯ KÝ",
    cellLocation: { rowIndex: 0, colIndex: 0, cellId: "other-cell" },
    reason: "Chức danh ký",
    confidence: "high",
  }, [table]);

  assert.equal(validated, null, "AI cell identity must be checked against the exact source coordinate");
});

test("AI request schema rejects parser role and non-source payload fields", () => {
  const request: PartitionAiRequest = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    consent: true,
    requestId: "req-1",
    regime: "administrative",
    sourceGeneration: 2,
    partitionRevision: 3,
    blocks: [{ id: "p-1", index: 0, kind: "paragraph", text: "Nguồn đầy đủ" }],
  };
  assert.equal(validatePartitionAiRequest(request).valid, true);
  assert.equal(validatePartitionAiRequest({ ...request, consent: false }).valid, false);
  assert.equal(validatePartitionAiRequest({
    ...request,
    blocks: [{ ...request.blocks[0], role: "body" }],
  }).valid, false, "Role must be rejected at the server boundary");
  assert.equal(validatePartitionAiRequest({
    ...request,
    blocks: [{ ...request.blocks[0], rawXml: "<secret/>" }],
  }).valid, false, "Heavy or source markup fields must be rejected at the server boundary");
});

test("AI service reports completed, invalid and failed chunks independently", async () => {
  const request: PartitionAiRequest = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    consent: true,
    requestId: "req-partial",
    regime: "party",
    sourceGeneration: 7,
    partitionRevision: 4,
    blocks: [0, 1, 2].map(index => ({
      id: `p-${index}`,
      index,
      kind: "paragraph" as const,
      text: `Nội dung ${index}`,
    })),
  };
  const response = await runPartitionAiService(request, async (prompt) => {
    if (prompt.includes('"id": "p-0"')) {
      return {
        model: "mock-model",
        text: JSON.stringify({
          schemaVersion: PARTITION_AI_SCHEMA_VERSION,
          proposals: [{
            sourceBlockId: "p-0",
            suggestedRole: "metadata",
            exactQuote: "Nội dung 0",
            reason: "Tên văn bản",
            confidence: "high",
          }],
        }),
      };
    }
    if (prompt.includes('"id": "p-1"')) throw new Error("synthetic provider failure");
    return { text: "{not-json" };
  }, { chunkSize: 1, concurrency: 1 });

  assert.equal(response.schemaVersion, PARTITION_AI_SCHEMA_VERSION);
  assert.equal(response.requestId, "req-partial");
  assert.equal(response.regime, "party");
  assert.deepEqual(response.aiReviewedBlockIds, ["p-0"]);
  assert.deepEqual(response.failedBlockIds, ["p-1", "p-2"]);
  assert.deepEqual(response.chunks.map(chunk => chunk.status), ["completed", "failed", "invalid_response"]);
  assert.equal(response.chunks[0].proposals.length, 1);
  assert.equal(response.chunks[1].error, "Dịch vụ AI không hoàn tất lô này.");
});

test("AI service times out a stuck chunk and aborts its provider signal", async () => {
  const request: PartitionAiRequest = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    consent: true,
    requestId: "req-timeout",
    regime: "administrative",
    sourceGeneration: 1,
    partitionRevision: 1,
    blocks: [{ id: "p-1", index: 0, kind: "paragraph", text: "Nội dung" }],
  };
  let signalAborted = false;
  const response = await runPartitionAiService(request, async (_prompt, signal) => {
    signal.addEventListener("abort", () => { signalAborted = true; }, { once: true });
    return await new Promise(() => {});
  }, { timeoutMs: 1000, chunkSize: 1 });

  assert.equal(signalAborted, true);
  assert.equal(response.chunks[0].status, "timed_out");
  assert.deepEqual(response.failedBlockIds, ["p-1"]);
});

test("batch apply revalidates each proposal and skips unverified table evidence", () => {
  const blocks: SourceBlock[] = [
    { id: "p-1", index: 0, kind: "paragraph", text: "TÊN VĂN BẢN", html: "<p>TÊN VĂN BẢN</p>", role: "body" },
    { id: "t-1", index: 1, kind: "table", text: "THƯ KÝ", tableData: [["THƯ KÝ"]], role: "body" },
  ];
  const proposals = [
    {
      id: "p1-first", sourceBlockId: "p-1", currentRole: "body", suggestedRole: "metadata",
      exactQuote: "TÊN VĂN BẢN", reason: "Tiêu đề", confidence: "high", status: "pending", regime: "administrative",
    },
    {
      id: "p1-stale", sourceBlockId: "p-1", currentRole: "body", suggestedRole: "appendix",
      exactQuote: "TÊN VĂN BẢN", reason: "Phụ lục", confidence: "medium", status: "pending", regime: "administrative",
    },
    {
      id: "t1-table", sourceBlockId: "t-1", currentRole: "body", suggestedRole: "signature",
      exactQuote: "THƯ KÝ", cellLocation: { rowIndex: 0, colIndex: 0 }, reason: "Chức danh",
      confidence: "high", status: "pending", regime: "administrative", requiresUserVerification: true,
    },
  ] as any;

  const withoutVerification = applyPartitionProposalBatch(proposals, blocks, "administrative");
  assert.deepEqual(withoutVerification.appliedProposalIds, ["p1-first"]);
  assert.equal(withoutVerification.nextBlocks[0].role, "metadata");
  assert.equal(withoutVerification.nextBlocks[0].text, blocks[0].text);
  assert.equal(withoutVerification.nextBlocks[0].html, blocks[0].html);
  assert.deepEqual(withoutVerification.skipped.map(item => item.proposalId), ["p1-stale", "t1-table"]);

  const afterManualEdit = checkProposalValidityBeforeApply(proposals[0], blocks, "administrative", ["p-1"]);
  assert.equal(afterManualEdit.valid, false, "Single and batch application must share the manual-edit invalidation gate");

  const contextualProposal = {
    ...proposals[0],
    sourceGeneration: 9,
    partitionRevision: 12,
  };
  const afterRegimeRoundTrip = checkProposalValidityBeforeApply(
    contextualProposal,
    blocks,
    "administrative",
    [],
    { sourceGeneration: 9, partitionRevision: 14 },
  );
  assert.equal(afterRegimeRoundTrip.valid, false,
    "A proposal from an earlier partition revision must stay stale after switching away and back");
  const afterSourceReplacement = checkProposalValidityBeforeApply(
    contextualProposal,
    blocks,
    "administrative",
    [],
    { sourceGeneration: 10, partitionRevision: 12 },
  );
  assert.equal(afterSourceReplacement.valid, false,
    "A proposal must not cross a source generation even when IDs and quoted text happen to match");

  const withVerification = applyPartitionProposalBatch(proposals, blocks, "administrative", [], new Set(["t1-table"]));
  assert.deepEqual(withVerification.appliedProposalIds, ["p1-first", "t1-table"]);
  assert.equal(withVerification.nextBlocks[1].role, "signature");
});

test("client rejects server responses for the wrong generation, regime or schema", () => {
  const request: PartitionAiRequest = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    consent: true,
    requestId: "req-current",
    regime: "administrative",
    sourceGeneration: 5,
    partitionRevision: 9,
    blocks: [{ id: "p-1", index: 0, kind: "paragraph", text: "Nội dung nguồn" }],
  };
  const response = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    requestId: request.requestId,
    requestFingerprint: "0123456789abcdef",
    regime: request.regime,
    sourceGeneration: request.sourceGeneration,
    partitionRevision: request.partitionRevision,
    totalBlocks: 1,
    aiReviewedBlockIds: ["p-1"],
    failedBlockIds: [],
    chunks: [{
      chunkIndex: 0,
      status: "completed",
      blockIds: ["p-1"],
      proposals: [{
        sourceBlockId: "p-1",
        suggestedRole: "metadata",
        exactQuote: "Nội dung nguồn",
        reason: "Tên loại văn bản",
        confidence: "high",
      }],
    }],
  };

  assert.equal(validatePartitionAiResponse(response, request).valid, true);
  assert.equal(validatePartitionAiResponse({ ...response, sourceGeneration: 4 }, request).valid, false);
  assert.equal(validatePartitionAiResponse({ ...response, regime: "party" }, request).valid, false);
  assert.equal(validatePartitionAiResponse({ ...response, unexpected: "role" }, request).valid, false);
  assert.equal(validatePartitionAiResponse({
    ...response,
    chunks: [{ ...response.chunks[0], proposals: [{ ...response.chunks[0].proposals[0], currentRole: "body" }] }],
  }, request).valid, false, "The AI must not return parser role data");
});

test("client rejects duplicate block IDs within one completed response chunk", () => {
  const request: PartitionAiRequest = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    consent: true,
    requestId: "req-duplicate-chunk",
    regime: "administrative",
    sourceGeneration: 2,
    partitionRevision: 4,
    blocks: [
      { id: "p-a", index: 0, kind: "paragraph", text: "Nguồn A" },
      { id: "p-b", index: 1, kind: "paragraph", text: "Nguồn B" },
    ],
  };
  const response = {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    requestId: request.requestId,
    requestFingerprint: "0123456789abcdef",
    regime: request.regime,
    sourceGeneration: request.sourceGeneration,
    partitionRevision: request.partitionRevision,
    totalBlocks: 2,
    aiReviewedBlockIds: ["p-a", "p-a", "p-b"],
    failedBlockIds: [],
    chunks: [{
      chunkIndex: 0,
      status: "completed",
      blockIds: ["p-a", "p-a", "p-b"],
      proposals: [],
    }],
  };

  assert.equal(validatePartitionAiResponse(response, request).valid, false,
    "Duplicate IDs in a single chunk must not overcount validated AI coverage");
});
