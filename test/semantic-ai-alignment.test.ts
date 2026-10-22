import test from "node:test";
import assert from "node:assert/strict";
import { alignFullTextAiResults, alignSemanticObservations, validateAiSemanticResult } from "../src/utils/semanticAlignment.ts";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { paragraph, SOURCE_SHA } from "./support/semantic-fixtures.ts";
import { createHash } from "node:crypto";
import type { FullTextSegment } from "../src/shared/fullDocumentTextProtocol.ts";

const block = paragraph("block-1", 1, "Nội dung tổng hợp");
const context = { sourceSha256: SOURCE_SHA, sourceGeneration: 3, partitionFingerprint: "p", workingRevision: 1,
  blocks: [block], regime: "state" as const, documentType: "BIÊN BẢN" };
const local = classifyLocalSemantics(context);
const unit = local[0].unit;
const evidence = { sourceSha256: SOURCE_SHA, sourceGeneration: 3, fileTransfer: "PASS" as const, providerRead: "PASS" as const,
  codeRead: "PASS" as const, visualReview: "PASS" as const, completePageCount: 2, pageHashes: ["b".repeat(64), "c".repeat(64)], sourceBlocks: [block] };
const aiItem = { unitId: unit.id, scope: unit.scope, label: unit.label, quote: unit.quote, anchor: unit.anchor };

test("rejects AI semantic observations unless original file, provider reading, and code evidence all pass", () => {
  const blocked = validateAiSemanticResult({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, observations: [aiItem] },
    { ...evidence, codeRead: "BLOCKED_BY_PROVIDER" });
  assert.deepEqual(blocked, { valid: false, reason: "full_document_evidence_missing" });
});

test("validates exact source SHA and anchors AI observations without guessing repeated text", () => {
  const validated = validateAiSemanticResult({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, observations: [aiItem] }, evidence);
  assert.equal(validated.valid, true);
  if (!validated.valid) return;
  assert.equal(alignSemanticObservations(validated.observations, local, evidence)[0].alignment, "aligned");
  const wrong = { ...aiItem, anchor: { ...unit.anchor, blockId: "missing-block" } };
  const wrongValidated = validateAiSemanticResult({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, observations: [wrong] }, evidence);
  assert.equal(wrongValidated.valid, true);
  if (wrongValidated.valid) assert.equal(alignSemanticObservations(wrongValidated.observations, local, evidence)[0].alignment, "unaligned");
  assert.deepEqual(validateAiSemanticResult({ sourceSha256: "0".repeat(64), sourceGeneration: 3, observations: [aiItem] }, evidence),
    { valid: false, reason: "source_context_mismatch" });
});

test("visual claims need complete page hashes and an in-range page index", () => {
  const visual = { ...aiItem, visualClaim: true, page: 3 };
  assert.deepEqual(validateAiSemanticResult({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, observations: [visual] }, evidence),
    { valid: false, reason: "visual_evidence_missing" });
  assert.deepEqual(validateAiSemanticResult({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, observations: [visual] },
    { ...evidence, pageHashes: ["b".repeat(64)] }), { valid: false, reason: "visual_evidence_missing" });
});

test("aligns text-only AI observations by segment anchors without requiring file or code evidence", () => {
  const blockA = paragraph("text-ai-a", 0, "Lặp lại; Lặp lại.");
  const blockB = paragraph("text-ai-b", 1, "Lặp lại; Lặp lại.");
  const localObservations = classifyLocalSemantics({ ...context, blocks: [blockA, blockB] });
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const makeSegment = (id: string, sourceBlockId: string, documentOrder: number, text: string): FullTextSegment => ({
    id, sourceSha256: SOURCE_SHA, sourceGeneration: 3, packagePartUri: "/word/document.xml",
    sourceAnchor: "body:p[" + documentOrder + "]", storyKind: "body", documentOrder, sourceBlockId,
    paragraphIndex: 0, visibilityClass: "visible_text", text, textSha256: sha(text),
  });
  const segments = [
    makeSegment("seg-a", blockA.id, 0, blockA.text),
    makeSegment("seg-b", blockB.id, 1, blockB.text),
  ];
  const result = alignFullTextAiResults([
    { segmentId: "seg-a", status: "reviewed", observations: [
      { sourceSha256: SOURCE_SHA, sourceGeneration: 3, segmentId: "seg-a", sourceAnchor: segments[0].sourceAnchor,
        exactQuote: "Lặp lại", scope: "body", label: "lead", reason: "Synthetic semantic proposal", confidence: "medium" },
      { sourceSha256: SOURCE_SHA, sourceGeneration: 3, segmentId: "seg-a", sourceAnchor: segments[0].sourceAnchor,
        exactQuote: blockA.text, scope: "body", label: "narrative", reason: "Full source sentence", confidence: "high" },
    ] },
    { segmentId: "seg-b", status: "reviewed", observations: [
      { sourceSha256: SOURCE_SHA, sourceGeneration: 3, segmentId: "seg-b", sourceAnchor: segments[1].sourceAnchor,
        exactQuote: blockB.text, scope: "body", label: "narrative", reason: "Full source sentence", confidence: "high" },
    ] },
  ], segments, localObservations, { sourceSha256: SOURCE_SHA, sourceGeneration: 3 });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.observations[0].alignment, "ambiguous");
  assert.equal(result.observations[1].alignment, "aligned");
  assert.equal(result.observations[1].localUnitId, localObservations[0].unit.id);
  assert.equal(result.observations[1].label, "narrative");
  assert.equal(result.observations[2].alignment, "aligned");
  assert.equal(result.observations[2].localUnitId, localObservations[1].unit.id);
  assert.deepEqual(result.missingSegmentIds, []);
});

test("rejects text-only AI observations with a stale source or non-source quote", () => {
  const source = paragraph("text-ai-source", 0, "Synthetic source sentence.");
  const localObservations = classifyLocalSemantics({ ...context, blocks: [source] });
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const segment: FullTextSegment = {
    id: "text-segment", sourceSha256: SOURCE_SHA, sourceGeneration: 3, packagePartUri: "/word/document.xml",
    sourceAnchor: "body:p[0]", storyKind: "body", documentOrder: 0, sourceBlockId: source.id, paragraphIndex: 0,
    visibilityClass: "visible_text", text: source.text, textSha256: sha(source.text),
  };
  const base = { segmentId: segment.id, status: "reviewed", observations: [{
    sourceSha256: SOURCE_SHA, sourceGeneration: 3, segmentId: segment.id, sourceAnchor: segment.sourceAnchor,
    exactQuote: source.text, scope: "body", label: "narrative", reason: "Synthetic", confidence: "high",
  }] };
  assert.deepEqual(alignFullTextAiResults([{ ...base, observations: [{ ...base.observations[0], exactQuote: "invented text" }] }],
    [segment], localObservations, { sourceSha256: SOURCE_SHA, sourceGeneration: 3 }), { valid: false, reason: "invalid_source_quote" });
  assert.deepEqual(alignFullTextAiResults([base], [segment], localObservations,
    { sourceSha256: "0".repeat(64), sourceGeneration: 3 }), { valid: false, reason: "source_context_mismatch" });
});

test("maps an AI Appendix observation to the matching local Appendix and parent heading", () => {
  const title = paragraph("appendix-ai-title", 0, "PHỤ LỤC I");
  const child = paragraph("appendix-ai-child", 1, "Nội dung giải thích trong phụ lục.");
  const appendixId = "appendix-ai-one";
  const local = classifyLocalSemantics({
    ...context,
    blocks: [title, child],
    appendices: [{
      id: appendixId, title: "PHỤ LỤC I", html: "", blocks: [title, child],
      sourceBlockIds: [title.id, child.id], extractionStatus: "needs_review",
    }],
  });
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  const segment = (id: string, sourceBlockId: string, documentOrder: number, text: string): FullTextSegment => ({
    id, sourceSha256: SOURCE_SHA, sourceGeneration: 3, packagePartUri: "/word/document.xml",
    sourceAnchor: "body:p[" + documentOrder + "]", storyKind: "body", documentOrder, sourceBlockId,
    paragraphIndex: 0, visibilityClass: "visible_text", text, textSha256: sha(text),
  });
  const titleSegment = segment("appendix-title-segment", title.id, 0, title.text);
  const childSegment = segment("appendix-child-segment", child.id, 1, child.text);
  const aligned = alignFullTextAiResults([{
    segmentId: childSegment.id,
    status: "reviewed",
    observations: [{
      sourceSha256: SOURCE_SHA, sourceGeneration: 3, segmentId: childSegment.id,
      sourceAnchor: childSegment.sourceAnchor, exactQuote: child.text, scope: "appendix",
      label: "explanation", parentSegmentId: titleSegment.id, appendixHeadingSegmentId: titleSegment.id,
      reason: "Synthetic Appendix relation", confidence: "medium",
    }],
  }], [titleSegment, childSegment], local, { sourceSha256: SOURCE_SHA, sourceGeneration: 3 });
  assert.equal(aligned.valid, true);
  if (!aligned.valid) return;
  assert.equal(aligned.observations[0].alignment, "aligned");
  assert.equal(aligned.observations[0].appendixId, appendixId);
  assert.equal(aligned.observations[0].parentUnitId, local.find(item => item.unit.anchor.blockId === title.id)?.unit.id);
  assert.equal(aligned.observations[0].localUnitId, local.find(item => item.unit.anchor.blockId === child.id)?.unit.id);
});
