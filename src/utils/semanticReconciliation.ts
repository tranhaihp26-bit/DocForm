import type {
  AlignedAiObservation,
  FullTextSemanticObservation,
  ParserObservation,
  SemanticDecision,
  SemanticRisk,
} from "../shared/semanticDocument.ts";

export interface SemanticReconciliationContext {
  sourceSha256: string;
  sourceGeneration: number;
  partitionFingerprint: string;
  workingRevision: number;
}

export interface SemanticReconciliationDecision extends SemanticDecision {
  localLabel: ParserObservation["unit"]["label"];
  aiLabel?: AlignedAiObservation["label"];
  scope: ParserObservation["unit"]["scope"];
  appendixId?: string;
  quote: string;
  anchor: ParserObservation["unit"]["anchor"];
  risk: SemanticRisk;
}

export function reconcileSemantics(
  local: ParserObservation[],
  ai: AlignedAiObservation[],
  context: SemanticReconciliationContext,
): SemanticReconciliationDecision[] {
  const aiByUnit = new Map<string, AlignedAiObservation[]>();
  for (const item of ai) aiByUnit.set(item.unitId, [...(aiByUnit.get(item.unitId) ?? []), item]);
  return local.map(observation => {
    const unit = observation.unit;
    const candidates = aiByUnit.get(unit.id) ?? [];
    const match = candidates.length === 1 ? candidates[0] : undefined;
    const exact = Boolean(match && match.alignment === "aligned" && match.sourceSha256 === context.sourceSha256 &&
      match.sourceGeneration === context.sourceGeneration && match.scope === unit.scope &&
      match.appendixId === unit.appendixId && match.parentUnitId === unit.parentUnitId &&
      match.label === unit.label && match.quote === unit.quote &&
      match.anchor.blockId === unit.anchor.blockId && match.anchor.tableId === unit.anchor.tableId &&
      match.anchor.cellId === unit.anchor.cellId && match.anchor.rowIndex === unit.anchor.rowIndex &&
      match.anchor.colIndex === unit.anchor.colIndex && match.anchor.paragraphIndex === unit.anchor.paragraphIndex &&
      match.anchor.charStart === unit.anchor.charStart && match.anchor.charEnd === unit.anchor.charEnd);
    const autoEligible = exact && unit.risk === "low" && !unit.needsReview && unit.scope === "body" &&
      !["meeting_attendance", "meeting_decision", "appendix_title", "appendix_reference", "table", "table_cell", "table_header_cell", "unknown"].includes(unit.label);
    const status = autoEligible ? "auto_confirmed" : unit.label === "unknown" || unit.needsReview ? "unsupported" : "needs_review";
    const reason = autoEligible
      ? "Nhãn, trích dẫn, vị trí và nguồn khớp chính xác giữa máy đọc local và AI."
      : !match ? "Chưa có quan sát AI đã neo vào cùng nguồn; cần người dùng duyệt."
      : match.alignment !== "aligned" ? `Quan sát AI chưa căn chỉnh: ${match.alignmentReason ?? match.alignment}.`
      : unit.risk === "high" ? "Đơn vị có tác động cao hoặc thuộc bảng/phụ lục; luôn cần người dùng xác nhận."
      : "Nhãn, phạm vi, cha hoặc vị trí chưa khớp hoàn toàn; cần người dùng duyệt.";
    return {
      unitId: unit.id, status, reason, decidedBy: autoEligible ? "policy" : "user",
      sourceSha256: context.sourceSha256, sourceGeneration: context.sourceGeneration,
      partitionFingerprint: context.partitionFingerprint, workingRevision: context.workingRevision,
      evidenceFingerprint: JSON.stringify({ id: unit.id, quote: unit.quote, anchor: unit.anchor, label: unit.label,
        scope: unit.scope, appendixId: unit.appendixId, ai: match ? { label: match.label, quote: match.quote,
          anchor: match.anchor, alignment: match.alignment } : null }),
      localLabel: unit.label, ...(match ? { aiLabel: match.label } : {}), scope: unit.scope,
      ...(unit.appendixId ? { appendixId: unit.appendixId } : {}), quote: unit.quote, anchor: unit.anchor, risk: unit.risk,
    } as SemanticReconciliationDecision;
  });
}

/** Reconciles the extracted-text AI lane separately from raw-file/code/visual evidence. */
export function reconcileFullTextSemantics(
  local: ParserObservation[],
  ai: FullTextSemanticObservation[],
  context: SemanticReconciliationContext,
): SemanticReconciliationDecision[] {
  return local.map(observation => {
    const unit = observation.unit;
    const candidates = ai.filter(item => {
      if (item.sourceSha256 !== context.sourceSha256 || item.sourceGeneration !== context.sourceGeneration) return false;
      if (item.localUnitId) return item.localUnitId === unit.id;
      return Boolean(item.sourceBlockId && unit.sourceBlockIds.includes(item.sourceBlockId) &&
        (!item.cellId || item.cellId === unit.anchor.cellId) &&
        (item.rowIndex === undefined || item.rowIndex === unit.anchor.rowIndex) &&
        (item.cellIndex === undefined || item.cellIndex === unit.anchor.colIndex) &&
        (item.paragraphIndex === undefined || item.paragraphIndex === unit.anchor.paragraphIndex));
    });
    const match = candidates.length === 1 ? candidates[0] : undefined;
    const exact = Boolean(match &&
      match.alignment === "aligned" &&
      match.localUnitId === unit.id &&
      match.scope === unit.scope &&
      match.appendixId === unit.appendixId &&
      match.parentUnitId === unit.parentUnitId &&
      match.label === unit.label &&
      match.quote === unit.quote &&
      match.sourceBlockId === unit.anchor.blockId &&
      (!match.cellId || match.cellId === unit.anchor.cellId) &&
      (match.rowIndex === undefined || match.rowIndex === unit.anchor.rowIndex) &&
      (match.cellIndex === undefined || match.cellIndex === unit.anchor.colIndex) &&
      (match.paragraphIndex === undefined || match.paragraphIndex === unit.anchor.paragraphIndex));
    const unsupported = unit.label === "unknown" || unit.label === "media_unsupported" || unit.unsupportedEvidence === true;
    const autoEligible = exact && unit.risk === "low" && !unit.needsReview && unit.scope === "body" &&
      match?.confidence === "high" && !unsupported;
    const status = autoEligible ? "auto_confirmed" : unsupported ? "unsupported" : "needs_review";
    const reason = autoEligible
      ? "Nhãn, trích dẫn, anchor và thế hệ nguồn khớp chính xác giữa máy đọc local và AI text-only."
      : !match
        ? candidates.length > 1 ? "Có nhiều quan sát AI cùng trỏ vào đơn vị nguồn; cần người dùng phân xử."
          : "Chưa có quan sát AI đã căn chỉnh vào cùng đơn vị nguồn; cần người dùng duyệt."
        : match.alignment !== "aligned"
          ? "Quan sát AI chưa căn chỉnh vào một anchor nguồn duy nhất: " + (match.alignmentReason ?? match.alignment) + "."
          : !exact
            ? "Nhãn, scope, cha, trích dẫn hoặc vị trí không khớp hoàn toàn; cần người dùng duyệt."
            : "Đơn vị có rủi ro cao, thuộc phụ lục/bảng/biểu quyết hoặc confidence chưa cao; luôn cần người dùng xác nhận.";
    return {
      unitId: unit.id,
      status,
      reason,
      decidedBy: "policy",
      sourceSha256: context.sourceSha256,
      sourceGeneration: context.sourceGeneration,
      partitionFingerprint: context.partitionFingerprint,
      workingRevision: context.workingRevision,
      evidenceFingerprint: JSON.stringify({
        id: unit.id,
        quote: unit.quote,
        anchor: unit.anchor,
        label: unit.label,
        scope: unit.scope,
        appendixId: unit.appendixId,
        ai: match ? {
          segmentId: match.segmentId,
          sourceAnchor: match.sourceAnchor,
          label: match.label,
          quote: match.quote,
          alignment: match.alignment,
          confidence: match.confidence,
        } : null,
      }),
      localLabel: unit.label,
      ...(match ? { aiLabel: match.label } : {}),
      scope: unit.scope,
      ...(unit.appendixId ? { appendixId: unit.appendixId } : {}),
      quote: unit.quote,
      anchor: unit.anchor,
      risk: unit.risk,
    } as SemanticReconciliationDecision;
  });
}
