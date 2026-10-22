import type { SourceBlock } from "./schemas/document.schema.ts";
import type { FullTextReviewCoverage } from "./fullDocumentTextProtocol.ts";

export type SemanticScope = "body" | "appendix";
export type SemanticLabel =
  | "section_heading"
  | "legal_basis"
  | "lead"
  | "narrative"
  | "article"
  | "clause"
  | "point"
  | "table_header"
  | "table_data"
  | "media_unsupported"
  | "meeting_time_place"
  | "participants"
  | "chair_secretary"
  | "agenda"
  | "discussion"
  | "vote"
  | "conclusion"
  | "assignment"
  | "closing"
  | "explanation"
  | "source_note"
  | "header_footer"
  | "footnote"
  | "endnote"
  | "textbox"
  | "table"
  | "appendix_title"
  | "appendix_reference"
  | "appendix_heading"
  | "list_item"
  | "note"
  | "unknown"
  // Legacy labels remain readable for persisted V1 semantic state.
  | "heading"
  | "body_paragraph"
  | "meeting_attendance"
  | "meeting_agenda"
  | "meeting_discussion"
  | "meeting_decision"
  | "table_header_cell"
  | "table_cell";
export type SemanticDecisionStatus = "unreviewed" | "auto_confirmed" | "user_confirmed" | "rejected" | "needs_review" | "unsupported";
export type SemanticRisk = "low" | "high";

export interface SemanticSourceAnchor {
  blockId: string;
  blockIndex: number;
  sourcePath?: string;
  tableId?: string;
  cellId?: string;
  rowIndex?: number;
  colIndex?: number;
  paragraphIndex?: number;
  charStart?: number;
  charEnd?: number;
}

export interface SemanticUnit {
  id: string;
  scope: SemanticScope;
  appendixId?: string;
  parentUnitId?: string;
  label: SemanticLabel;
  quote: string;
  anchor: SemanticSourceAnchor;
  risk: SemanticRisk;
  needsReview: boolean;
  unsupportedEvidence?: boolean;
  formattingUnsupportedReason?: string;
  sourceBlockIds: string[];
}

export interface ParserObservation {
  sourceSha256: string;
  sourceGeneration: number;
  partitionFingerprint: string;
  workingRevision: number;
  unit: SemanticUnit;
  rationale: string;
  evidence: "source_text" | "table_cell" | "unsupported_structure";
}

export interface AiSemanticObservation {
  sourceSha256: string;
  sourceGeneration: number;
  unitId: string;
  scope: SemanticScope;
  appendixId?: string;
  parentUnitId?: string;
  label: SemanticLabel;
  quote: string;
  anchor: SemanticSourceAnchor;
  page?: number;
  visualClaim?: boolean;
}

export interface AlignedAiObservation extends AiSemanticObservation {
  alignment: "aligned" | "unaligned" | "ambiguous";
  alignmentReason?: string;
}

export interface FullTextSemanticObservation {
  sourceSha256: string;
  sourceGeneration: number;
  segmentId: string;
  sourceAnchor: string;
  sourceBlockId?: string;
  tableId?: string;
  cellId?: string;
  rowIndex?: number;
  cellIndex?: number;
  paragraphIndex?: number;
  scope: SemanticScope | "other";
  appendixId?: string;
  parentSegmentId?: string;
  parentUnitId?: string;
  appendixHeadingSegmentId?: string;
  label: SemanticLabel;
  quote: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  alignment: "aligned" | "unaligned" | "ambiguous";
  alignmentReason?: string;
  localUnitId?: string;
}

export interface SemanticDecision {
  unitId: string;
  status: SemanticDecisionStatus;
  reason: string;
  decidedBy: "policy" | "user";
  sourceSha256: string;
  sourceGeneration: number;
  partitionFingerprint: string;
  workingRevision: number;
  evidenceFingerprint: string;
}

export interface SemanticRevision {
  version: 1;
  sourceSha256: string;
  sourceGeneration: number;
  partitionFingerprint: string;
  workingRevision: number;
  fingerprint: string;
}

export interface SemanticState {
  revision: SemanticRevision;
  observations: ParserObservation[];
  aiObservations: AlignedAiObservation[];
  fullTextAiObservations?: FullTextSemanticObservation[];
  fullTextCoverage?: FullTextReviewCoverage;
  decisions: Record<string, SemanticDecision>;
  decisionFingerprint: string;
}

export interface FullDocumentEvidenceBundle {
  sourceSha256: string;
  sourceGeneration: number;
  fileTransfer: "PASS" | "BLOCKED_BY_PROVIDER" | "NOT_VERIFIED";
  providerRead: "PASS" | "BLOCKED_BY_PROVIDER" | "NOT_VERIFIED";
  codeRead: "PASS" | "BLOCKED_BY_PROVIDER" | "NOT_VERIFIED";
  visualReview: "PASS" | "BLOCKED_BY_PROVIDER" | "NOT_VERIFIED";
  completePageCount: number;
  pageHashes: string[];
  sourceBlocks: SourceBlock[];
}
