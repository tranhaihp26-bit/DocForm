import test from "node:test";
import assert from "node:assert/strict";
import { reconcileFullTextSemantics, reconcileSemantics } from "../src/utils/semanticReconciliation.ts";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { paragraph, SOURCE_SHA, tableBlock } from "./support/semantic-fixtures.ts";

const context = { sourceSha256: SOURCE_SHA, sourceGeneration: 2, partitionFingerprint: "p2", workingRevision: 1 };

test("auto-confirms only exact low-risk Body agreement; high-impact and missing AI remain pending", () => {
  const low = paragraph("block-1", 1, "Nội dung tổng hợp");
  const table = tableBlock("block-2", 2);
  const local = classifyLocalSemantics({ ...context, blocks: [low, table], regime: "state", documentType: "BIÊN BẢN" });
  const ai = [{ ...local[0].unit, sourceSha256: SOURCE_SHA, sourceGeneration: 2, unitId: local[0].unit.id, alignment: "aligned" as const }];
  const decisions = reconcileSemantics(local, ai, context);
  assert.equal(decisions.find(item => item.unitId === local[0].unit.id)?.status, "auto_confirmed");
  assert.equal(decisions.find(item => item.unitId === local[1].unit.id)?.status, "unsupported");
  assert.equal(decisions.find(item => item.unitId === local[2].unit.id)?.status, "needs_review");
  const noAi = reconcileSemantics(local, [], context);
  assert.ok(noAi.every(item => item.status !== "auto_confirmed"));
});

test("agreement cannot override a parent, scope, or source-position conflict", () => {
  const source = paragraph("block-3", 3, "Nội dung tổng hợp");
  const local = classifyLocalSemantics({ ...context, blocks: [source], regime: "state", documentType: "BIÊN BẢN" });
  const item = local[0].unit;
  const disputed = [{ ...item, unitId: item.id, sourceSha256: SOURCE_SHA, sourceGeneration: 2,
    parentUnitId: "different-parent", alignment: "aligned" as const }];
  assert.equal(reconcileSemantics(local, disputed, context)[0].status, "needs_review");
});

test("text-lane reconciliation auto-confirms only exact low-risk Body agreements", () => {
  const narrative = paragraph("text-narrative", 0, "Synthetic narrative paragraph.");
  const vote = paragraph("text-vote", 1, "Biểu quyết: 5/5 đồng ý");
  const local = classifyLocalSemantics({ ...context, blocks: [narrative, vote], regime: "state", documentType: "BIÊN BẢN" });
  const ai = [{
    sourceSha256: SOURCE_SHA, sourceGeneration: context.sourceGeneration,
    segmentId: "segment-narrative", sourceAnchor: "body:p[0]", sourceBlockId: narrative.id,
    scope: "body" as const, label: "narrative" as const, quote: narrative.text,
    reason: "Synthetic exact agreement", confidence: "high" as const, alignment: "aligned" as const,
    localUnitId: local.find(item => item.unit.anchor.blockId === narrative.id)!.unit.id,
  }, {
    sourceSha256: SOURCE_SHA, sourceGeneration: context.sourceGeneration,
    segmentId: "segment-vote", sourceAnchor: "body:p[1]", sourceBlockId: vote.id,
    scope: "body" as const, label: "vote" as const, quote: vote.text,
    reason: "Synthetic vote proposal", confidence: "high" as const, alignment: "aligned" as const,
    localUnitId: local.find(item => item.unit.anchor.blockId === vote.id)!.unit.id,
  }];
  const decisions = reconcileFullTextSemantics(local, ai, context);
  assert.equal(decisions.find(item => item.unitId === local[0].unit.id)?.status, "auto_confirmed");
  assert.equal(decisions.find(item => item.unitId === local[1].unit.id)?.status, "needs_review");
  const disputed = [{ ...ai[0], label: "lead" as const }];
  assert.equal(reconcileFullTextSemantics([local[0]], disputed, context)[0].status, "needs_review");
  assert.equal(reconcileFullTextSemantics([local[0]], [], context)[0].status, "needs_review");
});
