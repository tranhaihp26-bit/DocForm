import test from "node:test";
import assert from "node:assert/strict";
import type { PersistedFullTextSemanticReview } from "../src/utils/fullTextReviewPersistence.ts";
import { isPersistedFullTextSemanticReviewValid } from "../src/utils/fullTextReviewPersistence.ts";

const sourceSha256 = "a".repeat(64);
const coverage: PersistedFullTextSemanticReview["coverage"] = {
  status: "complete",
  extraction: { status: "complete", totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
  transfer: { status: "complete", selectedSegmentIds: ["seg-1"], attemptedSegmentIds: ["seg-1"], responseReceivedSegmentIds: ["seg-1"], failedSegmentIds: [] },
  semanticResponse: { status: "complete", totalSegmentIds: ["seg-1"], reviewedSegmentIds: ["seg-1"], noFindingSegmentIds: [], unsupportedSegmentIds: [], failedSegmentIds: [] },
  chunks: { total: 1, completed: 1, partial: 0, failed: 0, failedChunkIds: [] },
};
const valid: PersistedFullTextSemanticReview = {
  provider: "gemini", sourceSha256, sourceGeneration: 2, manifestSha256: "b".repeat(64), partitionFingerprint: "partition-2", regime: "state", documentType: "BIÊN BẢN",
  observations: [{ sourceSha256, sourceGeneration: 2, segmentId: "seg-1", sourceAnchor: "body:p[0]", sourceBlockId: "block-1",
    scope: "body", label: "narrative", quote: "Synthetic text", reason: "Synthetic", confidence: "high", alignment: "aligned", localUnitId: "unit-1" }],
  coverage,
};

test("persisted text-review evidence accepts semantic observations and coverage without manifest text", () => {
  assert.equal(isPersistedFullTextSemanticReviewValid(valid), true);
  assert.equal(isPersistedFullTextSemanticReviewValid({ ...valid, segments: [{ text: "must not persist" }] }), false);
  assert.equal(isPersistedFullTextSemanticReviewValid({ ...valid, observations: [{ ...valid.observations[0], sourceSha256: "c".repeat(64) }] }), false);
  assert.equal(isPersistedFullTextSemanticReviewValid({ ...valid, observations: [{ ...valid.observations[0], quote: "Q".repeat(321) }] }), false,
    "Persisted AI evidence must not be able to duplicate a long source segment as its quote");
  assert.equal(isPersistedFullTextSemanticReviewValid({ ...valid, coverage: { ...coverage, transfer: { ...coverage.transfer, selectedSegmentIds: ["unknown"] } } }), false);
});
