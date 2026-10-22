import type {
  AiSemanticObservation,
  AlignedAiObservation,
  FullDocumentEvidenceBundle,
  FullTextSemanticObservation,
  ParserObservation,
  SemanticLabel,
} from "../shared/semanticDocument.ts";
import type { FullTextSegment } from "../shared/fullDocumentTextProtocol.ts";

const LABELS = new Set<SemanticLabel>([
  "section_heading", "legal_basis", "lead", "narrative", "article", "clause", "point", "table_header", "table_data",
  "media_unsupported", "meeting_time_place", "participants", "chair_secretary", "agenda", "discussion", "vote",
  "conclusion", "assignment", "closing", "explanation", "source_note", "header_footer", "footnote", "endnote", "textbox",
  "heading", "body_paragraph", "meeting_attendance", "meeting_agenda", "meeting_discussion", "meeting_decision",
  "appendix_title", "appendix_reference", "appendix_heading", "table", "table_header_cell", "table_cell", "list_item", "note", "unknown",
]);

export type AiSemanticValidation =
  | { valid: true; observations: AiSemanticObservation[] }
  | { valid: false; reason: string };

function exactAnchor(a: AiSemanticObservation["anchor"], b: ParserObservation["unit"]["anchor"]): boolean {
  return a.blockId === b.blockId && a.blockIndex === b.blockIndex && a.tableId === b.tableId && a.cellId === b.cellId &&
    a.rowIndex === b.rowIndex && a.colIndex === b.colIndex && a.paragraphIndex === b.paragraphIndex &&
    a.charStart === b.charStart && a.charEnd === b.charEnd;
}

function pageCoverageComplete(evidence: FullDocumentEvidenceBundle): boolean {
  return evidence.visualReview === "PASS" && evidence.completePageCount > 0 &&
    evidence.pageHashes.length === evidence.completePageCount && evidence.pageHashes.every(hash => /^[a-f0-9]{64}$/i.test(hash));
}

export function validateAiSemanticResult(raw: unknown, evidence: FullDocumentEvidenceBundle): AiSemanticValidation {
  if (evidence.fileTransfer !== "PASS" || evidence.providerRead !== "PASS" || evidence.codeRead !== "PASS") {
    return { valid: false, reason: "full_document_evidence_missing" };
  }
  if (!raw || typeof raw !== "object") return { valid: false, reason: "invalid_payload" };
  const payload = raw as { sourceSha256?: unknown; sourceGeneration?: unknown; observations?: unknown };
  if (payload.sourceSha256 !== evidence.sourceSha256 || payload.sourceGeneration !== evidence.sourceGeneration) {
    return { valid: false, reason: "source_context_mismatch" };
  }
  if (!Array.isArray(payload.observations)) return { valid: false, reason: "observations_missing" };
  const result: AiSemanticObservation[] = [];
  for (const item of payload.observations) {
    if (!item || typeof item !== "object") return { valid: false, reason: "invalid_observation" };
    const obs = item as Record<string, any>;
    if (typeof obs.unitId !== "string" || !obs.unitId || !LABELS.has(obs.label) ||
        !["body", "appendix"].includes(obs.scope) || typeof obs.quote !== "string" ||
        !obs.anchor || typeof obs.anchor.blockId !== "string" || !Number.isSafeInteger(obs.anchor.blockIndex)) {
      return { valid: false, reason: "invalid_observation" };
    }
    const visualClaim = obs.visualClaim === true;
    if (visualClaim && (!Number.isSafeInteger(obs.page) || obs.page < 1 || obs.page > evidence.completePageCount || !pageCoverageComplete(evidence))) {
      return { valid: false, reason: "visual_evidence_missing" };
    }
    result.push({ ...obs, sourceSha256: evidence.sourceSha256, sourceGeneration: evidence.sourceGeneration } as AiSemanticObservation);
  }
  return { valid: true, observations: result };
}

function localUnitsForSegment(segment: FullTextSegment, local: ParserObservation[]): ParserObservation[] {
  if (!segment.sourceBlockId) return [];
  return local.filter(observation => {
    const anchor = observation.unit.anchor;
    if (anchor.blockId !== segment.sourceBlockId) return false;
    if (segment.cellId && anchor.cellId !== segment.cellId) return false;
    if (segment.rowIndex !== undefined && anchor.rowIndex !== segment.rowIndex) return false;
    if (segment.cellIndex !== undefined && anchor.colIndex !== segment.cellIndex) return false;
    if (segment.paragraphIndex !== undefined && anchor.paragraphIndex !== undefined && anchor.paragraphIndex !== segment.paragraphIndex) return false;
    return true;
  });
}

function sourceAnchorMatchesUnit(segment: FullTextSegment, quote: string, observation: ParserObservation): boolean {
  const unit = observation.unit;
  return Boolean(segment.sourceBlockId && unit.anchor.blockId === segment.sourceBlockId &&
    (!segment.cellId || unit.anchor.cellId === segment.cellId) &&
    (segment.rowIndex === undefined || unit.anchor.rowIndex === segment.rowIndex) &&
    (segment.cellIndex === undefined || unit.anchor.colIndex === segment.cellIndex) &&
    (segment.paragraphIndex === undefined || unit.anchor.paragraphIndex === undefined || unit.anchor.paragraphIndex === segment.paragraphIndex) &&
    (unit.quote === segment.text || unit.quote === quote || unit.quote.includes(quote)));
}

export type FullTextAiAlignmentValidation =
  | { valid: true; observations: FullTextSemanticObservation[]; missingSegmentIds: string[] }
  | { valid: false; reason: string };

/** Validates the text-only lane independently of original-file/code/visual evidence. */
export function alignFullTextAiResults(
  rawResults: unknown,
  segments: FullTextSegment[],
  local: ParserObservation[],
  context: { sourceSha256: string; sourceGeneration: number },
): FullTextAiAlignmentValidation {
  if (!Array.isArray(rawResults)) return { valid: false, reason: "invalid_payload" };
  const segmentById = new Map<string, FullTextSegment>();
  for (const segment of segments) {
    if (segment.sourceSha256 !== context.sourceSha256 || segment.sourceGeneration !== context.sourceGeneration ||
        segmentById.has(segment.id)) return { valid: false, reason: "source_context_mismatch" };
    segmentById.set(segment.id, segment);
  }
  const seenResults = new Set<string>();
  const observations: FullTextSemanticObservation[] = [];
  for (const rawResult of rawResults) {
    if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) return { valid: false, reason: "invalid_segment_result" };
    const result = rawResult as Record<string, unknown>;
    if (Object.keys(result).some(key => !["segmentId", "status", "observations"].includes(key)) ||
        typeof result.segmentId !== "string" || !segmentById.has(result.segmentId) ||
        !["reviewed", "no_finding", "unsupported"].includes(String(result.status)) ||
        !Array.isArray(result.observations) || seenResults.has(result.segmentId)) {
      return { valid: false, reason: "invalid_segment_result" };
    }
    seenResults.add(result.segmentId);
    const segment = segmentById.get(result.segmentId)!;
    for (const rawObservation of result.observations) {
      if (!rawObservation || typeof rawObservation !== "object" || Array.isArray(rawObservation)) {
        return { valid: false, reason: "invalid_observation" };
      }
      const item = rawObservation as Record<string, unknown>;
      const allowed = new Set([
        "sourceSha256", "sourceGeneration", "segmentId", "sourceAnchor", "exactQuote", "scope", "label",
        "parentSegmentId", "appendixHeadingSegmentId", "reason", "confidence",
      ]);
      if (Object.keys(item).some(key => !allowed.has(key)) ||
          item.sourceSha256 !== context.sourceSha256 || item.sourceGeneration !== context.sourceGeneration ||
          item.segmentId !== segment.id || item.sourceAnchor !== segment.sourceAnchor ||
          typeof item.exactQuote !== "string" || !item.exactQuote.trim() || !segment.text.includes(item.exactQuote)) {
        return { valid: false, reason: item.sourceSha256 !== context.sourceSha256 || item.sourceGeneration !== context.sourceGeneration
          ? "source_context_mismatch" : "invalid_source_quote" };
      }
      if (!LABELS.has(item.label as SemanticLabel) ||
          !["body", "appendix", "other"].includes(String(item.scope)) ||
          typeof item.reason !== "string" || !item.reason.trim() || item.reason.length > 1000 ||
          !["high", "medium", "low"].includes(String(item.confidence)) ||
          (item.parentSegmentId !== undefined && !segmentById.has(String(item.parentSegmentId))) ||
          (item.appendixHeadingSegmentId !== undefined && !segmentById.has(String(item.appendixHeadingSegmentId)))) {
        return { valid: false, reason: "invalid_observation" };
      }
      const candidates = localUnitsForSegment(segment, local).filter(candidate => sourceAnchorMatchesUnit(segment, item.exactQuote as string, candidate));
      const quote = item.exactQuote as string;
      const repeatedQuote = segment.text.indexOf(quote) !== segment.text.lastIndexOf(quote);
      let alignment: FullTextSemanticObservation["alignment"] = "aligned";
      let alignmentReason: string | undefined;
      if (repeatedQuote) {
        alignment = "ambiguous";
        alignmentReason = "quote_repeats_in_segment";
      } else if (candidates.length > 1) {
        alignment = "ambiguous";
        alignmentReason = "multiple_local_units_share_anchor";
      } else if (candidates.length === 0) {
        alignment = "unaligned";
        alignmentReason = "local_source_anchor_not_found";
      }
      const candidate = candidates.length === 1 ? candidates[0] : undefined;
      let appendixId = candidate?.unit.appendixId;
      const appendixHeadingSegmentId = typeof item.appendixHeadingSegmentId === "string" ? item.appendixHeadingSegmentId : undefined;
      if (!appendixId && appendixHeadingSegmentId) {
        const titleSegment = segmentById.get(appendixHeadingSegmentId)!;
        const titleAppendices = [...new Set(localUnitsForSegment(titleSegment, local)
          .map(item => item.unit.appendixId).filter((value): value is string => Boolean(value)))];
        if (titleAppendices.length === 1) appendixId = titleAppendices[0];
      }
      let parentUnitId: string | undefined;
      const parentSegmentId = typeof item.parentSegmentId === "string" ? item.parentSegmentId : undefined;
      if (parentSegmentId) {
        const parentSegment = segmentById.get(parentSegmentId)!;
        const parents = localUnitsForSegment(parentSegment, local);
        if (parents.length === 1) parentUnitId = parents[0].unit.id;
      }
      observations.push({
        sourceSha256: context.sourceSha256,
        sourceGeneration: context.sourceGeneration,
        segmentId: segment.id,
        sourceAnchor: segment.sourceAnchor,
        ...(segment.sourceBlockId ? { sourceBlockId: segment.sourceBlockId } : {}),
        ...(segment.tableId ? { tableId: segment.tableId } : {}),
        ...(segment.cellId ? { cellId: segment.cellId } : {}),
        ...(segment.rowIndex !== undefined ? { rowIndex: segment.rowIndex } : {}),
        ...(segment.cellIndex !== undefined ? { cellIndex: segment.cellIndex } : {}),
        ...(segment.paragraphIndex !== undefined ? { paragraphIndex: segment.paragraphIndex } : {}),
        scope: item.scope as FullTextSemanticObservation["scope"],
        ...(appendixId ? { appendixId } : {}),
        ...(parentSegmentId ? { parentSegmentId } : {}),
        ...(parentUnitId ? { parentUnitId } : {}),
        ...(appendixHeadingSegmentId ? { appendixHeadingSegmentId } : {}),
        label: item.label as SemanticLabel,
        quote,
        reason: item.reason as string,
        confidence: item.confidence as FullTextSemanticObservation["confidence"],
        alignment,
        ...(alignmentReason ? { alignmentReason } : {}),
        ...(candidate && alignment === "aligned" ? { localUnitId: candidate.unit.id } : {}),
      });
    }
  }
  return {
    valid: true,
    observations,
    missingSegmentIds: segments.filter(segment => !seenResults.has(segment.id)).map(segment => segment.id),
  };
}

export function alignSemanticObservations(
  ai: AiSemanticObservation[],
  local: ParserObservation[],
  evidence: FullDocumentEvidenceBundle,
): AlignedAiObservation[] {
  return ai.map(item => {
    if (item.sourceSha256 !== evidence.sourceSha256 || item.sourceGeneration !== evidence.sourceGeneration) {
      return { ...item, alignment: "unaligned", alignmentReason: "source_context_mismatch" };
    }
    if (item.visualClaim && (!pageCoverageComplete(evidence) || !item.page || item.page > evidence.completePageCount)) {
      return { ...item, alignment: "unaligned", alignmentReason: "visual_evidence_missing" };
    }
    const matches = local.filter(obs => obs.unit.id === item.unitId && obs.sourceSha256 === item.sourceSha256 &&
      obs.sourceGeneration === item.sourceGeneration && exactAnchor(item.anchor, obs.unit.anchor));
    if (matches.length > 1) return { ...item, alignment: "ambiguous", alignmentReason: "duplicate_source_anchor" };
    const match = matches[0];
    if (!match) return { ...item, alignment: "unaligned", alignmentReason: "source_anchor_not_found" };
    if (match.unit.quote !== item.quote || match.unit.scope !== item.scope || match.unit.appendixId !== item.appendixId ||
        match.unit.parentUnitId !== item.parentUnitId || match.unit.label !== item.label) {
      return { ...item, alignment: "unaligned", alignmentReason: "semantic_evidence_mismatch" };
    }
    return { ...item, alignment: "aligned" };
  });
}

export function hasCompleteVisualEvidence(evidence: FullDocumentEvidenceBundle): boolean {
  return pageCoverageComplete(evidence);
}
