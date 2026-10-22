import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FullTextManifest } from "../src/shared/fullDocumentTextProtocol.ts";
import * as client from "../src/utils/fullTextReviewClient.ts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceSha256 = "a".repeat(64);
const manifest: FullTextManifest = {
  extractionVersion: "docx-text-manifest-v1", sourceSha256, sourceGeneration: 4, manifestSha256: "b".repeat(64),
  segments: [{ id: "seg-1", sourceSha256, sourceGeneration: 4, packagePartUri: "/word/document.xml",
    sourceAnchor: "body:p[0]", storyKind: "body", documentOrder: 0, sourceBlockId: "block-0",
    visibilityClass: "visible_text", text: "Synthetic source paragraph.", textSha256: sha("Synthetic source paragraph.") }],
  parts: [{ partUri: "/word/document.xml", status: "included", segmentIds: ["seg-1"] }], excluded: [],
  coverage: { status: "complete", complete: true, totalIncludedSegments: 1, includedParts: 1, partialParts: 0, excludedParts: 0 },
};
const coverage = {
  status: "partial" as const,
  extraction: { status: "complete" as const, totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
  transfer: { status: "partial" as const, selectedSegmentIds: ["seg-1"], attemptedSegmentIds: [], responseReceivedSegmentIds: [], failedSegmentIds: ["seg-1"] },
  semanticResponse: { status: "partial" as const, totalSegmentIds: ["seg-1"], reviewedSegmentIds: [], noFindingSegmentIds: [], unsupportedSegmentIds: [], failedSegmentIds: ["seg-1"] },
  chunks: { total: 1, completed: 0, partial: 0, failed: 1, failedChunkIds: ["chunk-1"] },
};

test("consent is bound to provider, source SHA and generation and is never accepted by the default-provider preference", () => {
  assert.ok(client.createFullTextConsent);
  const consent = client.createFullTextConsent("gemini", sourceSha256, 4, manifest.manifestSha256);
  assert.equal(client.isFullTextConsentCurrent(consent, "gemini", sourceSha256, 4, manifest.manifestSha256), true);
  assert.equal(client.isFullTextConsentCurrent(consent, "chatgpt", sourceSha256, 4, manifest.manifestSha256), false);
  assert.equal(client.isFullTextConsentCurrent(consent, "gemini", "c".repeat(64), 4, manifest.manifestSha256), false);
  assert.equal(client.isFullTextConsentCurrent(consent, "gemini", sourceSha256, 5, manifest.manifestSha256), false);
  assert.equal(client.isFullTextConsentCurrent(consent, "gemini", sourceSha256, 4, "c".repeat(64)), false);
});

test("a retry result cannot be reused after its partition, regime, or document type changes", () => {
  assert.ok(client.isFullTextReviewContextCurrent);
  const reviewedUnder = {
    provider: "gemini" as const,
    sourceSha256,
    sourceGeneration: 4,
    manifestSha256: manifest.manifestSha256,
    partitionFingerprint: "partition-a",
    regime: "state" as const,
    documentType: "KẾ HOẠCH",
  };
  assert.equal(client.isFullTextReviewContextCurrent(reviewedUnder, { ...reviewedUnder }), true);
  assert.equal(client.isFullTextReviewContextCurrent(reviewedUnder, { ...reviewedUnder, partitionFingerprint: "partition-b" }), false);
  assert.equal(client.isFullTextReviewContextCurrent(reviewedUnder, { ...reviewedUnder, regime: "party" }), false);
  assert.equal(client.isFullTextReviewContextCurrent(reviewedUnder, { ...reviewedUnder, documentType: "BIÊN BẢN" }), false);
  assert.equal(client.isFullTextReviewContextCurrent(undefined, reviewedUnder), false);
});

test("review request sends the extracted-text manifest only and retries only failed segments", () => {
  assert.ok(client.buildFullTextReviewRequest);
  const consent = client.createFullTextConsent("gemini", sourceSha256, 4, manifest.manifestSha256);
  const initial = client.buildFullTextReviewRequest(manifest, "gemini", consent, "administrative", "BIÊN BẢN");
  assert.equal(initial.textScope, "all_extracted_text");
  assert.equal(initial.segments[0].text, "Synthetic source paragraph.");
  assert.equal("docxBytes" in initial, false);
  const retry = client.buildFullTextReviewRequest(manifest, "gemini", consent, "administrative", "BIÊN BẢN", {
    coverage, results: [],
  });
  assert.deepEqual(retry.retry?.segmentIds, ["seg-1"]);
  assert.deepEqual(retry.retry?.priorResults, []);
  assert.notEqual(retry.requestId, initial.requestId);
});

test("stream parser reports chunk progress and binds the final response to this request", async () => {
  assert.ok(client.readFullTextReviewStream);
  const consent = client.createFullTextConsent("gemini", sourceSha256, 4, manifest.manifestSha256);
  const request = client.buildFullTextReviewRequest(manifest, "gemini", consent, "administrative", "BIÊN BẢN");
  const completeCoverage = {
    status: "complete" as const,
    extraction: { status: "complete" as const, totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
    transfer: { status: "complete" as const, selectedSegmentIds: ["seg-1"], attemptedSegmentIds: ["seg-1"], responseReceivedSegmentIds: ["seg-1"], failedSegmentIds: [] },
    semanticResponse: { status: "complete" as const, totalSegmentIds: ["seg-1"], reviewedSegmentIds: ["seg-1"], noFindingSegmentIds: [], unsupportedSegmentIds: [], failedSegmentIds: [] },
    chunks: { total: 1, completed: 1, partial: 0, failed: 0, failedChunkIds: [] },
  };
  const responsePayload = { schemaVersion: 1, requestId: request.requestId, provider: "gemini", sourceSha256,
    sourceGeneration: 4, manifestSha256: manifest.manifestSha256, coverage: completeCoverage,
    chunks: [{ chunkId: "chunk-1", status: "completed", primarySegmentIds: ["seg-1"], completedSegmentIds: ["seg-1"], failedSegmentIds: [] }],
    results: [{ segmentId: "seg-1", status: "reviewed", observations: [] }],
    synthesis: { status: "not_needed", crossReferences: [] } };
  const source = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "chunk", chunk: {
      chunkId: "chunk-1", status: "completed", primarySegmentIds: ["seg-1"], completedSegmentIds: ["seg-1"], failedSegmentIds: [],
    } }) + "\n"));
    controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "final", response: responsePayload }) + "\n"));
    controller.close();
  } });
  const seen: unknown[] = [];
  const result = await client.readFullTextReviewStream(new Response(source, { headers: { "Content-Type": "application/x-ndjson" } }), request, event => seen.push(event));
  assert.equal(seen.length, 1);
  assert.equal(result.requestId, request.requestId);
  const stale = new Response(JSON.stringify({ type: "final", response: { ...responsePayload, sourceGeneration: 3 } }) + "\n",
    { headers: { "Content-Type": "application/x-ndjson" } });
  await assert.rejects(() => client.readFullTextReviewStream(stale, request, () => {}), /không khớp/);
});
