import type {
  FullTextReviewRequest,
  FullTextSegment,
} from "../shared/fullDocumentTextProtocol.ts";
import { FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS } from "../shared/fullDocumentTextProtocol.ts";

export interface FullTextReviewChunk {
  chunkId: string;
  primarySegments: FullTextSegment[];
  contextSegments: FullTextSegment[];
  status?: "ready" | "preflight_failed";
  failedSegmentIds?: string[];
  error?: string;
  estimatedInputTokens: number;
}

function sourceView(segment: FullTextSegment) {
  return {
    id: segment.id,
    sourceAnchor: segment.sourceAnchor,
    packagePartUri: segment.packagePartUri,
    storyKind: segment.storyKind,
    documentOrder: segment.documentOrder,
    sourceBlockId: segment.sourceBlockId,
    tableId: segment.tableId,
    cellId: segment.cellId,
    rowIndex: segment.rowIndex,
    cellIndex: segment.cellIndex,
    paragraphIndex: segment.paragraphIndex,
    noteId: segment.noteId,
    text: segment.text,
  };
}

export function buildFullTextSemanticPrompt(request: FullTextReviewRequest, chunk: FullTextReviewChunk): string {
  const envelope = {
    schemaVersion: 1,
    sourceSha256: request.sourceSha256,
    sourceGeneration: request.sourceGeneration,
    manifestSha256: request.manifestSha256,
    requestId: request.requestId,
    chunkId: chunk.chunkId,
    regime: request.regime,
    documentType: request.documentType,
    primarySegmentIds: chunk.primarySegments.map(segment => segment.id),
  };
  const instructions = "Review the provided source text as an independent semantic reader. Use document order, source anchors, nearby context, hierarchy, and text clues to understand meaning. Do not assume local parser classifications. Do not infer missing words, identity, signatures, recipients, dates, or legal facts. Return strict JSON only. For every primary segment return exactly one result: reviewed, no_finding, or unsupported. Every quote must be an exact substring of that primary segment. Use context segments only to understand context; never return a context-only segment as a result. For Appendix observations, reference an appendixHeadingSegmentId only if it identifies a provided source segment. If uncertain, use low confidence and explain why. Use these output labels: section_heading, legal_basis, lead, narrative, article, clause, point, list_item, table_header, table_data, note, source_note, media_unsupported, appendix_title, appendix_reference, appendix_heading, explanation, meeting_time_place, participants, chair_secretary, agenda, discussion, vote, conclusion, assignment, closing, header_footer, footnote, endnote, textbox, unknown. Output schema: {\"schemaVersion\":1,\"sourceSha256\":\"...\",\"sourceGeneration\":0,\"chunkId\":\"...\",\"segmentResults\":[{\"segmentId\":\"...\",\"status\":\"reviewed|no_finding|unsupported\",\"observations\":[{\"scope\":\"body|appendix|other\",\"label\":\"...\",\"exactQuote\":\"...\",\"parentSegmentId\":\"optional source segment id\",\"appendixHeadingSegmentId\":\"optional source segment id\",\"reason\":\"...\",\"confidence\":\"high|medium|low\"}]}]}.";
  const quotePolicy = `EVIDENCE QUOTE LIMIT: every exactQuote is an exact source substring of at most ${FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS} characters. Never copy an entire long segment into evidence.`;
  return JSON.stringify(envelope) + "\nINSTRUCTIONS\n" + quotePolicy + "\n" + instructions +
    "\nPRIMARY_SEGMENTS_JSON\n" + JSON.stringify(chunk.primarySegments.map(sourceView)) +
    "\nCONTEXT_SEGMENTS_JSON\n" + JSON.stringify(chunk.contextSegments.map(sourceView));
}

export function buildFullTextSynthesisPrompt(params: {
  request: FullTextReviewRequest;
  observations: Array<{
    chunkId: string;
    segmentId: string;
    sourceAnchor: string;
    exactQuote: string;
    scope: string;
    label: string;
    parentSegmentId?: string;
    appendixHeadingSegmentId?: string;
    reason: string;
    confidence: string;
  }>;
  segmentOrder: Array<{ segmentId: string; documentOrder: number; sourceAnchor: string }>;
}): string {
  const envelope = {
    marker: "SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS",
    schemaVersion: 1,
    sourceSha256: params.request.sourceSha256,
    sourceGeneration: params.request.sourceGeneration,
    requestId: params.request.requestId,
  };
  const instructions = "Identify only cross-segment references or hierarchy links supported by these already-validated observations and source anchors. Do not create new semantic observations, rewrite quotes, or claim any unobserved segment was reviewed. Return strict JSON only with schema {\"schemaVersion\":1,\"sourceSha256\":\"...\",\"sourceGeneration\":0,\"crossReferences\":[{\"fromSegmentId\":\"...\",\"toSegmentId\":\"...\",\"relation\":\"...\",\"reason\":\"...\"}]}. Every segment ID must occur in the supplied observations; references should connect different chunks.";
  return JSON.stringify(envelope) + "\nINSTRUCTIONS\n" + instructions +
    "\nVALIDATED_OBSERVATIONS_JSON\n" + JSON.stringify(params.observations) +
    "\nSEGMENT_ORDER_JSON\n" + JSON.stringify(params.segmentOrder);
}
