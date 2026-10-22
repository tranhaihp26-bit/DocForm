import test from "node:test";
import assert from "node:assert/strict";
import { selectRulesForUnit } from "../src/canonical/semanticRuleSelector.ts";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { applyUserSemanticDecision, createSemanticState } from "../src/utils/semanticState.ts";
import { appendix, paragraph, SOURCE_SHA } from "./support/semantic-fixtures.ts";

const context = { sourceSha256: SOURCE_SHA, sourceGeneration: 2, partitionFingerprint: "p", workingRevision: 1 };
function confirmed(unit: ReturnType<typeof classifyLocalSemantics>[number]["unit"], regime: "state" | "party" = "state") {
  const local = [{ sourceSha256: SOURCE_SHA, sourceGeneration: 2, partitionFingerprint: "p", workingRevision: 1, unit, rationale: "synthetic", evidence: "source_text" as const }];
  const state = createSemanticState(local, [], context);
  return applyUserSemanticDecision(state, unit.id, "user_confirmed", state.revision.fingerprint).decisions[unit.id];
}

test("selects only regime-matched paragraph rules after user confirmation", () => {
  const unit = classifyLocalSemantics({ ...context, blocks: [paragraph("block-1", 1, "Nội dung tổng hợp")], regime: "state", documentType: "BIÊN BẢN" })[0].unit;
  assert.equal(unit.label, "narrative");
  const approval = confirmed(unit);
  const stateRules = selectRulesForUnit(unit, { ...context, regime: "state", documentType: "BIÊN BẢN", profile: "generic", decision: approval });
  assert.deepEqual(stateRules.map(item => item.ruleId), ["BODY.PARAGRAPH.LINE_SPACING", "BODY.PARAGRAPH.FIRST_LINE_INDENT"]);
  assert.ok(stateRules.every(item => item.applicability?.scope === "body" &&
    item.applicability.transaction === "single-plain-body-paragraph" &&
    item.applicability.documentType === "non-empty" && item.applicability.profile === "generic" &&
    /Nghị định 30\/2020\/NĐ-CP/u.test(item.applicability.sourceReference)));
  const partyRules = selectRulesForUnit(unit, { ...context, regime: "party", documentType: "BIÊN BẢN", profile: "generic", decision: approval });
  assert.deepEqual(partyRules.map(item => item.ruleId), ["HD05-BODY-LINE-SPACING", "HD05-BODY-FIRST-LINE-INDENT"]);
  assert.ok(partyRules.every(item => item.regime === "party"));
  assert.ok(partyRules.every(item => /Hướng dẫn 05-HD\/VPTW/u.test(item.applicability?.sourceReference ?? "")));
});

test("blocks unapproved, wrong-scope, unknown, and missing-document-type units", () => {
  const block = paragraph("block-app", 1, "Phụ lục tổng hợp", "appendix");
  const unit = classifyLocalSemantics({ ...context, blocks: [block], appendices: [appendix("app-1", block)], regime: "state", documentType: "BIÊN BẢN" })[0].unit;
  const approved = confirmed(unit);
  assert.equal(selectRulesForUnit(unit, { ...context, regime: "state", documentType: "BIÊN BẢN", profile: "generic", decision: approved })[0].executable, false);
  assert.equal(selectRulesForUnit(unit, { ...context, regime: "state", documentType: "", profile: "generic", decision: approved })[0].executable, false);
  assert.equal(selectRulesForUnit(unit, { ...context, regime: "state", documentType: "BIÊN BẢN", profile: "generic" })[0].executable, false);
  const unsupportedBlock = paragraph("unsupported", 2, "Nội dung có cấu trúc chưa hỗ trợ");
  const unsupportedUnit = { ...classifyLocalSemantics({ ...context, blocks: [unsupportedBlock], regime: "state", documentType: "BIÊN BẢN" })[0].unit,
    unsupportedEvidence: true, needsReview: true, risk: "high" as const };
  const unsupportedApproval = confirmed(unsupportedUnit);
  assert.equal(selectRulesForUnit(unsupportedUnit, { ...context, regime: "state", documentType: "BIÊN BẢN", profile: "generic", decision: unsupportedApproval })[0].executable, false);
});

test("does not offer paragraph formatting for source blocks split into multiple semantic lines", () => {
  const block = paragraph("multiline", 1, "Dòng thứ nhất\nDòng thứ hai");
  const unit = classifyLocalSemantics({ ...context, blocks: [block], regime: "state", documentType: "BIÊN BẢN" })[0].unit;
  const approval = confirmed(unit);
  const selection = selectRulesForUnit(unit, { ...context, regime: "state", documentType: "BIÊN BẢN", profile: "generic", decision: approval });
  assert.equal(selection[0].executable, false);
  assert.match(selection[0].reason, /nhiều dòng con/u);
});

test("does not mark unsupported heading or table rules executable", () => {
  const headingBlock = paragraph("article-heading", 1, "Điều 1. Phạm vi điều chỉnh");
  const heading = classifyLocalSemantics({ ...context, blocks: [headingBlock], regime: "state", documentType: "QUY ĐỊNH" })[0].unit;
  const headingApproval = confirmed(heading);
  const headingSelection = selectRulesForUnit(heading, { ...context, regime: "state", documentType: "QUY ĐỊNH", profile: "generic", decision: headingApproval });
  assert.equal(headingSelection[0].executable, false);
  assert.match(headingSelection[0].reason, /chưa được hỗ trợ/u);

  const paragraphUnit = classifyLocalSemantics({ ...context, blocks: [paragraph("table-header", 1, "Tên nội dung")], regime: "state", documentType: "BIÊN BẢN" })[0].unit;
  const tableHeader = { ...paragraphUnit, label: "table_header_cell" as const };
  const tableApproval = confirmed(tableHeader);
  const tableSelection = selectRulesForUnit(tableHeader, { ...context, regime: "state", documentType: "BIÊN BẢN", profile: "generic", decision: tableApproval });
  assert.equal(tableSelection[0].executable, false);
  assert.match(tableSelection[0].reason, /bảng chưa được hỗ trợ/u);
});
