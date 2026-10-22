import test from "node:test";
import assert from "node:assert/strict";
import {
  applySemanticRuleFormatting,
  readSemanticParagraphFormatting,
  resolveSemanticRuleFormatting,
  type SemanticRuleId,
} from "../src/utils/semanticRuleFormatting.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../src/canonical/nd30/companyHeader.ts";
import { approvedMixedWorkspace } from "./support/workspaceFixtures.ts";
import { transactWorkspace } from "../src/utils/workspaceTransactions.ts";
import { workspaceInvariantErrors } from "../src/utils/workspaceState.ts";
import { convertHtmlToDocxElements } from "../src/utils/docxExport.ts";

function confirmedDecision(snapshot: ReturnType<typeof approvedMixedWorkspace>, blockId: string) {
  const source = snapshot.workspace.source!;
  return { unitId: `semantic.v1.body.body.${blockId}.p0`, status: "user_confirmed" as const,
    reason: "Người dùng xác nhận nhãn và bằng chứng nguồn.", decidedBy: "user" as const,
    sourceSha256: source.blobHash, sourceGeneration: source.generation,
    partitionFingerprint: snapshot.workspace.partition.fingerprint,
    workingRevision: snapshot.workspace.workingRevision, evidenceFingerprint: "synthetic-evidence" };
}

test("resolves explicit regime and profile values for semantic paragraph rules", () => {
  assert.deepEqual(resolveSemanticRuleFormatting("state", "generic", [
    "BODY.PARAGRAPH.LINE_SPACING", "BODY.PARAGRAPH.FIRST_LINE_INDENT",
  ]), { lineSpacing: "1.15", firstLineIndent: "1.27cm" });
  assert.deepEqual(resolveSemanticRuleFormatting("party", "generic", [
    "HD05-BODY-LINE-SPACING", "HD05-BODY-FIRST-LINE-INDENT",
  ]), { lineSpacing: "18pt", firstLineIndent: "1cm" });
  assert.deepEqual(resolveSemanticRuleFormatting("state", COMPANY_HEADER_PROFILE_ID, [
    "BODY.PARAGRAPH.LINE_SPACING", "BODY.PARAGRAPH.FIRST_LINE_INDENT",
  ]), { lineSpacing: "19pt", firstLineIndent: "0.5in" });
  assert.throws(() => resolveSemanticRuleFormatting("party", "generic", ["BODY.PARAGRAPH.LINE_SPACING"]), /rule_regime_mismatch/);
});

test("applies approved formatting metadata to one exact simple paragraph and preserves text/marks", () => {
  const html = '<p style="text-align:justify" data-block-id="block-1"><strong>Nội dung</strong> đã duyệt</p>';
  const format = resolveSemanticRuleFormatting("state", "generic", [
    "BODY.PARAGRAPH.LINE_SPACING", "BODY.PARAGRAPH.FIRST_LINE_INDENT",
  ]);
  const result = applySemanticRuleFormatting(html, "Nội dung đã duyệt", format);
  assert.deepEqual(result, {
    ok: true,
    html: '<p style="text-align:justify" data-block-id="block-1" data-df-line-spacing="1.15" data-df-first-line-indent="1.27cm"><strong>Nội dung</strong> đã duyệt</p>',
  });
  assert.deepEqual(readSemanticParagraphFormatting(result.html!), format);
});

test("fails closed for mismatched, multiline, multiple, or structurally rich paragraphs", () => {
  const format = resolveSemanticRuleFormatting("state", "generic", ["BODY.PARAGRAPH.FIRST_LINE_INDENT"]);
  assert.deepEqual(applySemanticRuleFormatting("<p>Văn bản khác</p>", "Nội dung", format), { ok: false, reason: "paragraph_text_mismatch" });
  assert.deepEqual(applySemanticRuleFormatting("<p>Đoạn 1<br>Đoạn 2</p>", "Đoạn 1", format), { ok: false, reason: "multiline_paragraph_unsupported" });
  assert.deepEqual(applySemanticRuleFormatting("<p>Một</p><p>Hai</p>", "Một", format), { ok: false, reason: "paragraph_anchor_ambiguous" });
  assert.deepEqual(applySemanticRuleFormatting("<div><p>Nội dung</p></div>", "Nội dung", format), { ok: false, reason: "paragraph_structure_unsupported" });
});

test("applies confirmed rule values through one approved workspace transaction and invalidates the candidate revision", () => {
  const snapshot = approvedMixedWorkspace();
  const node = snapshot.workspace.nodes.find(item => item.lineage.includes("paragraph-before"))!;
  const result = transactWorkspace(snapshot, 0, {
    type: "applySemanticParagraphRules", sourceBlockId: "paragraph-before", expectedText: "Đoạn đầu", paragraphIndex: 0,
    ruleIds: ["BODY.PARAGRAPH.LINE_SPACING", "BODY.PARAGRAPH.FIRST_LINE_INDENT"], regime: "state", profile: "generic",
    decision: confirmedDecision(snapshot, "paragraph-before"),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const updated = result.snapshot.workspace.nodes.find(item => item.editableNodeId === node.editableNodeId)!;
  assert.equal(updated.html, '<p data-df-line-spacing="1.15" data-df-first-line-indent="1.27cm">Đoạn đầu</p>');
  assert.equal(result.snapshot.workspace.workingRevision, 1);
  assert.equal(result.snapshot.workspace.ledger.at(-1)?.sourceRefs[0], "paragraph-before");
  assert.deepEqual(workspaceInvariantErrors(result.snapshot), []);
  assert.equal(snapshot.workspace.nodes.find(item => item.editableNodeId === node.editableNodeId)?.html, "<p>Đoạn đầu</p>");
});

test("requires a current approved semantic decision at the transaction boundary", () => {
  const snapshot = approvedMixedWorkspace();
  const base = { type: "applySemanticParagraphRules" as const, sourceBlockId: "paragraph-before", expectedText: "Đoạn đầu", paragraphIndex: 0,
    ruleIds: ["BODY.PARAGRAPH.FIRST_LINE_INDENT"] as SemanticRuleId[], regime: "state" as const, profile: "generic" };
  const missing = transactWorkspace(snapshot, 0, base);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.deepEqual(missing.details, ["semantic_decision_not_currently_approved"]);
  const staleDecision = { ...confirmedDecision(snapshot, "paragraph-before"), workingRevision: -1 };
  const stale = transactWorkspace(snapshot, 0, { ...base, decision: staleDecision });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.deepEqual(stale.details, ["semantic_decision_not_currently_approved"]);
  const policyApproval = { ...confirmedDecision(snapshot, "paragraph-before"), status: "auto_confirmed" as const, decidedBy: "policy" as const };
  const automaticallyApproved = transactWorkspace(snapshot, 0, { ...base, decision: policyApproval });
  assert.equal(automaticallyApproved.ok, true, "A current low-risk policy auto-approval is also a valid semantic approval");
});

test("rejects stale paragraph text and non-body source anchors without changing the draft", () => {
  const snapshot = approvedMixedWorkspace();
  const node = snapshot.workspace.nodes.find(item => item.lineage.includes("paragraph-before"))!;
  const edited = transactWorkspace(snapshot, 0, { type: "editNode", id: node.editableNodeId, html: "<p>Đoạn đã sửa</p>" });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  const stale = transactWorkspace(edited.snapshot, 1, {
    type: "applySemanticParagraphRules", sourceBlockId: "paragraph-before", expectedText: "Đoạn đầu", paragraphIndex: 0,
    ruleIds: ["BODY.PARAGRAPH.FIRST_LINE_INDENT"], regime: "state", profile: "generic",
    decision: confirmedDecision(edited.snapshot, "paragraph-before"),
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.deepEqual(stale.details, ["paragraph_text_mismatch"]);
  const table = snapshot.workspace.nodes.find(item => item.html.includes("data-source-table-id"))!;
  const nonBody = transactWorkspace(snapshot, 0, {
    type: "applySemanticParagraphRules", sourceBlockId: snapshot.workspace.source!.blocks.find(block => block.kind === "table")!.id,
    expectedText: "TABLE ORIGINAL", paragraphIndex: 0, ruleIds: ["BODY.PARAGRAPH.FIRST_LINE_INDENT"], regime: "state", profile: "generic",
    decision: confirmedDecision(snapshot, snapshot.workspace.source!.blocks.find(block => block.kind === "table")!.id),
  });
  assert.equal(nonBody.ok, false);
  assert.ok(snapshot.workspace.nodes.includes(table));
});

test("exports applied semantic spacing and indentation into DOCX paragraph properties", () => {
  const paragraph = convertHtmlToDocxElements('<p data-df-line-spacing="18pt" data-df-first-line-indent="1cm">Nội dung</p>', "party")[0] as any;
  const properties = paragraph.root[0].root as any[];
  const spacing = properties.find(item => item.rootKey === "w:spacing").root[0].root;
  const indent = properties.find(item => item.rootKey === "w:ind").root[0].root;
  assert.equal(spacing.line.value, 360);
  assert.equal(spacing.lineRule.value, "exact");
  assert.equal(indent.firstLine.value, 567);
});
