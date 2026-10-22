import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { applyUserSemanticDecision, createSemanticState } from "../src/utils/semanticState.ts";
import { paragraph, SOURCE_SHA } from "./support/semantic-fixtures.ts";

test("semantic approval uses optimistic revision and records source, partition, and working context", () => {
  const block = paragraph("block-1", 1, "Nội dung tổng hợp");
  const context = { sourceSha256: SOURCE_SHA, sourceGeneration: 4, partitionFingerprint: "partition-4", workingRevision: 7 };
  const local = classifyLocalSemantics({ ...context, blocks: [block], regime: "state", documentType: "BIÊN BẢN" });
  const initial = createSemanticState(local, [], context);
  const id = local[0].unit.id;
  const accepted = applyUserSemanticDecision(initial, id, "user_confirmed", initial.revision.fingerprint);
  assert.equal(accepted.decisions[id].sourceSha256, SOURCE_SHA);
  assert.equal(accepted.decisions[id].sourceGeneration, 4);
  assert.equal(accepted.decisions[id].partitionFingerprint, "partition-4");
  assert.equal(accepted.decisions[id].workingRevision, 7);
  assert.throws(() => applyUserSemanticDecision(accepted, id, "rejected", initial.revision.fingerprint), /stale_semantic_revision/);
});
