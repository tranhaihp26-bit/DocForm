import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FullTextSegment } from "../src/shared/fullDocumentTextProtocol.ts";

const api = await import("../src/server/fullTextSemanticService.ts").catch(() => undefined) as any;
const promptApi = await import("../src/server/fullTextSemanticPrompt.ts").catch(() => undefined) as any;

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceSha256 = "a".repeat(64);
function segment(id: string, order: number, text: string): FullTextSegment {
  return {
    id, sourceSha256, sourceGeneration: 7, packagePartUri: "/word/document.xml",
    sourceAnchor: `body:p[${order}]`, storyKind: "body", documentOrder: order,
    sourceBlockId: `block-${order}`, visibilityClass: "visible_text", text, textSha256: sha(text),
  };
}
function request(segments: FullTextSegment[]) {
  const parts = [{ partUri: "/word/document.xml", status: "included", segmentIds: segments.map(item => item.id) }];
  const excluded: any[] = [];
  const manifestSha256 = sha(JSON.stringify({
    extractionVersion: "docx-text-manifest-v1",
    sourceSha256,
    sourceGeneration: 7,
    segments: segments.map(({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId,
      cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    }) => ({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId,
      cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    })),
    parts,
    excluded,
  }));
  return {
    schemaVersion: 1,
    requestId: "synthetic-request-1",
    provider: "gemini",
    consent: { scope: "all_extracted_text", accepted: true, consentId: "synthetic-consent-1", provider: "gemini", sourceSha256, sourceGeneration: 7, manifestSha256 },
    sourceSha256, sourceGeneration: 7, manifestSha256,
    regime: "administrative", documentType: "biên bản", textScope: "all_extracted_text",
    extractionCoverage: { status: "complete", totalIncludedSegments: segments.length, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
    parts,
    excluded,
    segments,
  };
}
function parsePrimary(prompt: string) {
  const start = prompt.indexOf("PRIMARY_SEGMENTS_JSON\n") + "PRIMARY_SEGMENTS_JSON\n".length;
  const end = prompt.indexOf("\nCONTEXT_SEGMENTS_JSON", start);
  return JSON.parse(prompt.slice(start, end));
}
function chunkResponse(prompt: string) {
  const envelope = JSON.parse(prompt.slice(0, prompt.indexOf("\nINSTRUCTIONS\n")));
  const primary = parsePrimary(prompt);
  return JSON.stringify({
    schemaVersion: 1,
    sourceSha256: envelope.sourceSha256,
    sourceGeneration: envelope.sourceGeneration,
    chunkId: envelope.chunkId,
    segmentResults: primary.map((item: any) => ({
      segmentId: item.id, status: "reviewed", observations: [{ scope: "body", label: "narrative", exactQuote: item.text.slice(0, 320), reason: "Synthetic review", confidence: "high" }],
    })),
  });
}

test("full-text request requires provider-bound consent and source-bound segment hashes", () => {
  assert.ok(api?.validateFullTextReviewRequest, "full-text semantic service must expose strict request validation");
  const valid = request([segment("s1", 0, "Synthetic source text")]);
  assert.equal(api.validateFullTextReviewRequest(valid).valid, true);
  assert.equal(api.validateFullTextReviewRequest({ ...valid, consent: { ...valid.consent, provider: "chatgpt" } }).valid, false);
  assert.equal(api.validateFullTextReviewRequest({ ...valid, docxBytes: "must-not-be-accepted" }).valid, false);
  assert.equal(api.validateFullTextReviewRequest({ ...valid, segments: [{ ...valid.segments[0], sourceGeneration: 6 }] }).valid, false);
  assert.equal(api.validateFullTextReviewRequest({ ...valid, segments: [{ ...valid.segments[0], textSha256: "c".repeat(64) }] }).valid, false);
});

test("chunk planning assigns each selected segment once and reports an oversized segment explicitly", () => {
  assert.ok(api?.buildFullTextReviewChunks, "full-text chunk planner must exist");
  const items = [segment("s1", 0, "A".repeat(600)), segment("s2", 1, "B".repeat(600)), segment("s3", 2, "C".repeat(6000))];
  const chunks = api.buildFullTextReviewChunks(items, { maxEstimatedTokens: 1000, promptReserveTokens: 100, contextSegmentLimit: 0 });
  const assigned = chunks.flatMap((chunk: any) => chunk.primarySegments.map((item: any) => item.id));
  assert.deepEqual(assigned, ["s1", "s2"]);
  assert.equal(chunks.filter((chunk: any) => chunk.status === "preflight_failed").flatMap((chunk: any) => chunk.failedSegmentIds).join(","), "s3");
});

test("prompt sends source text and anchors without parser findings or DOCX bytes", () => {
  assert.ok(promptApi?.buildFullTextSemanticPrompt, "full-text semantic prompt builder must exist");
  const req = request([segment("s1", 0, "PROMPT_SOURCE_SENTINEL")]);
  const chunk = api.buildFullTextReviewChunks(req.segments, { maxEstimatedTokens: 2000, promptReserveTokens: 100, contextSegmentLimit: 0 })[0];
  const prompt = promptApi.buildFullTextSemanticPrompt(req, chunk);
  assert.match(prompt, /PROMPT_SOURCE_SENTINEL/);
  assert.match(prompt, /body:p\[0\]/);
  assert.match(prompt, /EVIDENCE QUOTE LIMIT:.*at most 320 characters/i);
  assert.doesNotMatch(prompt, /docxBytes|parserRole|parserLabel|localSemanticObservation/i);
});

test("all selected segments need validated responses; omission stays partial and synthesis cannot fill it", async () => {
  assert.ok(api?.reviewFullExtractedText, "full-text semantic review service must exist");
  const req = request([
    segment("s1", 0, "A".repeat(500)),
    segment("s2", 1, "B".repeat(500)),
    segment("s3", 2, "C".repeat(500)),
  ]);
  let calls = 0;
  const result = await api.reviewFullExtractedText(req, async (prompt: string) => {
    calls += 1;
    if (prompt.includes("SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS")) {
      return { text: JSON.stringify({ schemaVersion: 1, sourceSha256, sourceGeneration: 7, crossReferences: [] }), model: "mock" };
    }
    const response = JSON.parse(chunkResponse(prompt));
    response.segmentResults = response.segmentResults.filter((item: any) => item.segmentId !== "s2");
    return { text: JSON.stringify(response), model: "mock" };
  }, { chunkOptions: { maxEstimatedTokens: 500, promptReserveTokens: 100, contextSegmentLimit: 0 } });
  assert.ok(calls >= 4, "multiple text chunks plus synthesis should make separate provider calls; observed " + calls);
  assert.equal(result.coverage.semanticResponse.status, "partial");
  assert.deepEqual(result.coverage.semanticResponse.failedSegmentIds, ["s2"]);
  assert.equal(result.synthesis.status, "completed");
  assert.equal(result.results.some((item: any) => item.segmentId === "s2"), false);
});

test("complete response coverage is tied to the exact source and generation", async () => {
  assert.ok(api?.reviewFullExtractedText, "full-text semantic review service must exist");
  const req = request([segment("s1", 0, "Synthetic source text.")]);
  const result = await api.reviewFullExtractedText(req, async (prompt: string) => ({ text: chunkResponse(prompt), model: "mock" }));
  assert.equal(result.coverage.status, "complete");
  assert.equal(result.coverage.extraction.status, "complete");
  assert.deepEqual(result.coverage.transfer.responseReceivedSegmentIds, ["s1"]);
  assert.deepEqual(result.coverage.semanticResponse.reviewedSegmentIds, ["s1"]);
  assert.equal(result.sourceSha256, sourceSha256);
  assert.equal(result.sourceGeneration, 7);
});

test("rejects a full-segment quote that exceeds the persisted short-evidence limit", async () => {
  assert.ok(api?.reviewFullExtractedText, "full-text semantic review service must exist");
  const req = request([segment("s1", 0, "Q".repeat(400))]);
  const result = await api.reviewFullExtractedText(req, async (prompt: string) => {
    const response = JSON.parse(chunkResponse(prompt));
    response.segmentResults[0].observations[0].exactQuote = "Q".repeat(321);
    return { text: JSON.stringify(response), model: "mock" };
  });
  assert.equal(result.coverage.status, "partial");
  assert.deepEqual(result.coverage.semanticResponse.failedSegmentIds, ["s1"]);
  assert.deepEqual(result.results, []);
});

test("context overflow splits the chunk and retries without truncating or changing provider", async () => {
  assert.ok(api?.reviewFullExtractedText, "full-text semantic review service must exist");
  const req = request([segment("s1", 0, "First synthetic source."), segment("s2", 1, "Second synthetic source.")]);
  let calls = 0;
  const result = await api.reviewFullExtractedText(req, async (prompt: string) => {
    calls += 1;
    if (calls === 1) throw new Error("Request too large: 413 context limit");
    return { text: chunkResponse(prompt), model: "mock" };
  }, { chunkOptions: { maxEstimatedTokens: 8000, promptReserveTokens: 100, contextSegmentLimit: 0 } });
  assert.equal(calls, 4);
  assert.equal(result.coverage.status, "complete");
  assert.deepEqual(result.coverage.semanticResponse.failedSegmentIds, []);
  assert.deepEqual(result.coverage.semanticResponse.reviewedSegmentIds, ["s1", "s2"]);
});

test("provider errors and oversized chunks are explicit, with no provider fallback", async () => {
  assert.ok(api?.reviewFullExtractedText, "full-text semantic review service must exist");
  const req = request([segment("s1", 0, "A".repeat(7000))]);
  let called = 0;
  const result = await api.reviewFullExtractedText(req, async () => {
    called += 1;
    throw new Error("provider down");
  }, { chunkOptions: { maxEstimatedTokens: 1000, promptReserveTokens: 100, contextSegmentLimit: 0 } });
  assert.equal(called, 0);
  assert.deepEqual(result.coverage.semanticResponse.failedSegmentIds, ["s1"]);
  assert.equal(result.coverage.status, "partial");
});

test("retry processes only failed segments and preserves validated earlier responses", async () => {
  const req = request([segment("s1", 0, "First source paragraph."), segment("s2", 1, "Second source paragraph.")]);
  const first = await api.reviewFullExtractedText(req, async (prompt: string) => {
    if (prompt.includes("SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS")) {
      return { text: JSON.stringify({ schemaVersion: 1, sourceSha256, sourceGeneration: 7, crossReferences: [] }) };
    }
    const full = JSON.parse(chunkResponse(prompt));
    full.segmentResults = full.segmentResults.filter((item: any) => item.segmentId === "s1");
    return { text: JSON.stringify(full) };
  }, { chunkOptions: { maxEstimatedTokens: 500, promptReserveTokens: 100, contextSegmentLimit: 0 } });
  assert.deepEqual(first.coverage.semanticResponse.failedSegmentIds, ["s2"]);

  const retryRequest = { ...req, requestId: "synthetic-retry-1", retry: {
    segmentIds: first.coverage.semanticResponse.failedSegmentIds,
    priorResults: first.results,
  } };
  assert.equal(api.validateFullTextReviewRequest(retryRequest).valid, true);
  let retriedPrimaryIds: string[] = [];
  const retried = await api.reviewFullExtractedText(retryRequest, async (prompt: string) => {
    if (prompt.includes("SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS")) {
      return { text: JSON.stringify({ schemaVersion: 1, sourceSha256, sourceGeneration: 7, crossReferences: [] }) };
    }
    retriedPrimaryIds = parsePrimary(prompt).map((item: any) => item.id);
    return { text: chunkResponse(prompt) };
  }, { chunkOptions: { maxEstimatedTokens: 500, promptReserveTokens: 100, contextSegmentLimit: 0 } });

  assert.deepEqual(retriedPrimaryIds, ["s2"]);
  assert.deepEqual(retried.results.map((item: any) => item.segmentId).sort(), ["s1", "s2"]);
  assert.equal(retried.coverage.status, "complete");
  assert.deepEqual(retried.coverage.semanticResponse.failedSegmentIds, []);
  assert.deepEqual(retried.coverage.transfer.responseReceivedSegmentIds.sort(), ["s1", "s2"]);
});
