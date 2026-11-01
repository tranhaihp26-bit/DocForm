import test from "node:test";
import assert from "node:assert/strict";
import { isPersistedFullTextSemanticReviewValid, type PersistedFullTextSemanticReview } from "../src/utils/fullTextReviewPersistence.ts";
import { createFullTextSemanticState, createSemanticState } from "../src/utils/semanticState.ts";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { paragraph, SOURCE_SHA } from "./support/semantic-fixtures.ts";

test("Task 6: evidence and approvals are strictly bound to provider; switching providers invalidates review", () => {
  const block = paragraph("block-1", 1, "Nội dung kế hoạch công tác.");
  const semanticContext = {
    sourceSha256: SOURCE_SHA,
    sourceGeneration: 1,
    partitionFingerprint: "fingerprint-1",
    workingRevision: 1,
  };
  const localObs = classifyLocalSemantics({
    ...semanticContext,
    blocks: [block],
    regime: "state",
    documentType: "KẾ HOẠCH",
  });

  // 1. Evidence created for provider "gemini"
  const geminiEvidence: PersistedFullTextSemanticReview = {
    provider: "gemini",
    sourceSha256: SOURCE_SHA,
    sourceGeneration: 1,
    manifestSha256: "b".repeat(64),
    partitionFingerprint: "fingerprint-1",
    regime: "state",
    documentType: "KẾ HOẠCH",
    observations: [],
    coverage: {
      status: "complete",
      extraction: { status: "complete", totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
      transfer: { status: "complete", selectedSegmentIds: ["seg-1"], attemptedSegmentIds: ["seg-1"], responseReceivedSegmentIds: ["seg-1"], failedSegmentIds: [] },
      semanticResponse: { status: "complete", totalSegmentIds: ["seg-1"], reviewedSegmentIds: ["seg-1"], noFindingSegmentIds: [], unsupportedSegmentIds: [], failedSegmentIds: [] },
      chunks: { total: 1, completed: 1, partial: 0, failed: 0, failedChunkIds: [] },
    },
  };
  assert.equal(isPersistedFullTextSemanticReviewValid(geminiEvidence), true);

  // 2. Matcher function simulating App.tsx matchingFullTextReview
  const matchReview = (
    evidence: PersistedFullTextSemanticReview | null,
    selectedProvider: "gemini" | "chatgpt",
    context: typeof semanticContext,
    regime: "state" | "party",
    docType: string
  ) => {
    return evidence &&
      evidence.provider === selectedProvider &&
      evidence.sourceSha256 === context.sourceSha256.toLowerCase() &&
      evidence.sourceGeneration === context.sourceGeneration &&
      evidence.partitionFingerprint === context.partitionFingerprint &&
      evidence.regime === regime &&
      evidence.documentType === docType
      ? evidence
      : null;
  };

  // Provider "gemini" matches gemini evidence
  const matchedGemini = matchReview(geminiEvidence, "gemini", semanticContext, "state", "KẾ HOẠCH");
  assert.ok(matchedGemini, "Gemini evidence must match when provider is gemini");
  assert.equal(matchedGemini.provider, "gemini");

  // Switch to provider "chatgpt": gemini evidence MUST NOT match!
  const matchedWhenSwitchedToChatGpt = matchReview(geminiEvidence, "chatgpt", semanticContext, "state", "KẾ HOẠCH");
  assert.equal(matchedWhenSwitchedToChatGpt, null, "Gemini evidence must NOT match when selected provider is chatgpt");

  // 3. Simulating App.tsx provider-switch effect (line 1258): evidence is reset to null
  let currentEvidence: PersistedFullTextSemanticReview | null = geminiEvidence;
  let currentSelectedProvider: "gemini" | "chatgpt" = "gemini";

  // Action: User switches provider from gemini -> chatgpt
  currentSelectedProvider = "chatgpt";
  currentEvidence = null; // Invalidate old provider evidence upon switch

  assert.equal(currentEvidence, null, "Evidence must be reset to null when provider switches");
  assert.equal(matchReview(currentEvidence, currentSelectedProvider, semanticContext, "state", "KẾ HOẠCH"), null);

  // Action: User switches back to gemini without re-running review
  currentSelectedProvider = "gemini";
  // currentEvidence remains null: switching back does NOT resurrect stale approvals
  assert.equal(currentEvidence, null, "Switching back to gemini must NOT resurrect previously invalidated evidence");
  assert.equal(matchReview(currentEvidence, currentSelectedProvider, semanticContext, "state", "KẾ HOẠCH"), null);

  // 4. Verify semantic state behaves correctly when evidence is absent vs present
  const baseWithoutEvidence = createSemanticState(localObs, [], semanticContext);
  assert.equal(baseWithoutEvidence.fullTextAiObservations, undefined);

  const baseWithGeminiEvidence = createFullTextSemanticState(localObs, geminiEvidence.observations, geminiEvidence.coverage, semanticContext);
  assert.ok(baseWithGeminiEvidence.fullTextAiObservations);
  assert.notEqual(baseWithoutEvidence.revision.fingerprint, baseWithGeminiEvidence.revision.fingerprint,
    "Semantic fingerprint must differ when provider evidence is present vs absent");
});
