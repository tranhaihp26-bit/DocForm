import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { applyUserSemanticDecision, createFullTextSemanticState, createSemanticState, invalidateSemanticState, isPersistedUserSemanticDecisionCurrent, semanticApprovalContextKey, semanticDecisionIsCurrent } from "../src/utils/semanticState.ts";
import { paragraph, SOURCE_SHA } from "./support/semantic-fixtures.ts";

const baseContext = { sourceSha256: SOURCE_SHA, sourceGeneration: 2, partitionFingerprint: "p2", workingRevision: 1 };
function stateFor(block = paragraph("block-1", 1, "Nội dung tổng hợp")) {
  const local = classifyLocalSemantics({ ...baseContext, blocks: [block], regime: "state", documentType: "BIÊN BẢN" });
  return createSemanticState(local, [], baseContext);
}

test("semantic approval context ignores unrelated working-draft revisions but binds source and classification context", () => {
  const base = { sourceSha256: SOURCE_SHA, sourceGeneration: 2, partitionFingerprint: "p2", regime: "state" as const, documentType: " BIÊN BẢN " };
  const key = semanticApprovalContextKey(base);
  assert.equal(semanticApprovalContextKey({ ...base, documentType: "biên bản" }), key);
  assert.notEqual(semanticApprovalContextKey({ ...base, sourceGeneration: 3 }), key);
  assert.notEqual(semanticApprovalContextKey({ ...base, partitionFingerprint: "p3" }), key);
  assert.notEqual(semanticApprovalContextKey({ ...base, regime: "party" }), key);
  assert.notEqual(semanticApprovalContextKey({ ...base, documentType: "KẾ HOẠCH" }), key);
});

test("legacy or AI-missing semantics start unapproved and require current user approval", () => {
  const state = stateFor();
  const id = state.observations[0].unit.id;
  assert.equal(state.decisions[id].status, "needs_review");
  const approved = applyUserSemanticDecision(state, id, "user_confirmed", state.revision.fingerprint);
  assert.equal(semanticDecisionIsCurrent(approved.decisions[id], baseContext), true);
  assert.equal(semanticDecisionIsCurrent(approved.decisions[id], { ...baseContext, sourceGeneration: 3 }), false);
  assert.throws(() => applyUserSemanticDecision(state, id, "user_confirmed", "stale"), /stale_semantic_revision/);
});

test("persisted user approval is bound to the exact semantic evidence and cannot carry to changed AI evidence", () => {
  const block = paragraph("evidence-bound", 0, "Synthetic narrative paragraph.");
  const local = classifyLocalSemantics({ ...baseContext, blocks: [block], regime: "state", documentType: "CÔNG VĂN" });
  const contextKey = semanticApprovalContextKey({ sourceSha256: SOURCE_SHA, sourceGeneration: 2,
    partitionFingerprint: "p2", regime: "state", documentType: "CÔNG VĂN" });
  const unitId = local[0].unit.id;
  const coverage = {
    status: "complete" as const,
    extraction: { status: "complete" as const, totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
    transfer: { status: "complete" as const, selectedSegmentIds: ["segment-evidence-bound"], attemptedSegmentIds: ["segment-evidence-bound"],
      responseReceivedSegmentIds: ["segment-evidence-bound"], failedSegmentIds: [] },
    semanticResponse: { status: "complete" as const, totalSegmentIds: ["segment-evidence-bound"], reviewedSegmentIds: ["segment-evidence-bound"],
      noFindingSegmentIds: [], unsupportedSegmentIds: [], failedSegmentIds: [] },
    chunks: { total: 1, completed: 1, partial: 0, failed: 0, failedChunkIds: [] },
  };
  const aiFor = (label: "narrative" | "legal_basis") => [{
    sourceSha256: SOURCE_SHA, sourceGeneration: 2, segmentId: "segment-evidence-bound", sourceAnchor: "body:p[0]",
    sourceBlockId: block.id, scope: "body" as const, label, quote: block.text, reason: "Synthetic",
    confidence: "high" as const, alignment: "aligned" as const, localUnitId: unitId,
  }];
  const initial = createFullTextSemanticState(local, aiFor("narrative"), coverage, baseContext);
  const saved = { contextKey, status: "user_confirmed" as const,
    evidenceFingerprint: initial.decisions[unitId].evidenceFingerprint };
  assert.equal(isPersistedUserSemanticDecisionCurrent(saved, initial, contextKey, unitId), true);
  const changedEvidence = createFullTextSemanticState(local, aiFor("legal_basis"), coverage, baseContext);
  assert.equal(isPersistedUserSemanticDecisionCurrent(saved, changedEvidence, contextKey, unitId), false);
  assert.equal(isPersistedUserSemanticDecisionCurrent({ contextKey, status: "user_confirmed" }, changedEvidence, contextKey, unitId), false,
    "legacy approval without AI evidence fingerprint must not cross into a full-text review");
});

test("source replacement and repartition invalidate approvals; block edits remove only anchored evidence", () => {
  const state = stateFor();
  const id = state.observations[0].unit.id;
  const approved = applyUserSemanticDecision(state, id, "user_confirmed", state.revision.fingerprint);
  const changed = { ...baseContext, workingRevision: 2 };
  const blockEdit = invalidateSemanticState(approved, { kind: "source_block_edited", blockId: "block-1", next: changed });
  assert.equal(Object.keys(blockEdit.decisions).length, 0);
  assert.equal(blockEdit.observations.length, 0);
  const repartition = invalidateSemanticState(approved, { kind: "partition_approval_changed", next: { ...changed, partitionFingerprint: "p3" } });
  assert.equal(Object.keys(repartition.decisions).length, 0);
  const replacement = invalidateSemanticState(approved, { kind: "source_replaced", next: { ...changed, sourceSha256: "d".repeat(64), sourceGeneration: 3 } });
  assert.equal(replacement.observations.length, 0);
});

test("persists source-bound full-text observations and coverage in the semantic revision", () => {
  const block = paragraph("fulltext-state", 0, "Synthetic narrative paragraph.");
  const local = classifyLocalSemantics({ ...baseContext, blocks: [block], regime: "state", documentType: "CÔNG VĂN" });
  const ai = [{
    sourceSha256: SOURCE_SHA,
    sourceGeneration: 2,
    segmentId: "segment-fulltext-state",
    sourceAnchor: "body:p[0]",
    sourceBlockId: block.id,
    scope: "body" as const,
    label: "narrative" as const,
    quote: block.text,
    reason: "Synthetic exact agreement",
    confidence: "high" as const,
    alignment: "aligned" as const,
    localUnitId: local[0].unit.id,
  }];
  const coverage = {
    status: "complete" as const,
    extraction: { status: "complete" as const, totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
    transfer: { status: "complete" as const, selectedSegmentIds: ["segment-fulltext-state"], attemptedSegmentIds: ["segment-fulltext-state"],
      responseReceivedSegmentIds: ["segment-fulltext-state"], failedSegmentIds: [] },
    semanticResponse: { status: "complete" as const, totalSegmentIds: ["segment-fulltext-state"], reviewedSegmentIds: ["segment-fulltext-state"],
      noFindingSegmentIds: [], unsupportedSegmentIds: [], failedSegmentIds: [] },
    chunks: { total: 1, completed: 1, partial: 0, failed: 0, failedChunkIds: [] },
  };
  const state = createFullTextSemanticState(local, ai, coverage, baseContext);
  const unitId = local[0].unit.id;
  assert.equal(state.decisions[unitId].status, "auto_confirmed");
  assert.deepEqual(state.fullTextAiObservations, ai);
  assert.equal(state.fullTextCoverage?.semanticResponse.reviewedSegmentIds[0], "segment-fulltext-state");
  const changed = invalidateSemanticState(state, {
    kind: "source_block_edited",
    blockId: block.id,
    next: { ...baseContext, workingRevision: 2 },
  });
  assert.deepEqual(changed.fullTextAiObservations, []);
  assert.equal(Object.prototype.hasOwnProperty.call(changed.decisions, unitId), false);
  const replaced = invalidateSemanticState(state, {
    kind: "source_replaced",
    next: { ...baseContext, sourceSha256: "f".repeat(64), sourceGeneration: 3, workingRevision: 2 },
  });
  assert.equal(replaced.fullTextCoverage, undefined);
  assert.notEqual(changed.revision.fingerprint, state.revision.fingerprint);
});
