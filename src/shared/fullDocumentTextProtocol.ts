export type FullTextStoryKind = "body" | "header" | "footer" | "footnote" | "endnote" | "textbox";

export type FullTextIssueCode =
  | "hidden_text"
  | "tracked_changes"
  | "field_instruction"
  | "drawing_visual_content"
  | "nested_table"
  | "unsupported_wrapper"
  | "comments_excluded"
  | "unsupported_text_part"
  | "unreferenced_story"
  | "unresolved_relationship"
  | "missing_note_part"
  | "media_unreadable"
  | "embedded_object_unreadable"
  | "malformed_story";

export interface FullTextSegment {
  id: string;
  sourceSha256: string;
  sourceGeneration: number;
  packagePartUri: string;
  sourceAnchor: string;
  storyKind: FullTextStoryKind;
  documentOrder: number;
  sourceBlockId?: string;
  tableId?: string;
  cellId?: string;
  rowIndex?: number;
  cellIndex?: number;
  paragraphIndex?: number;
  noteId?: string;
  relationshipId?: string;
  visibilityClass: "visible_text";
  text: string;
  textSha256: string;
}

export interface FullTextExcludedItem {
  code: FullTextIssueCode;
  packagePartUri: string;
  anchor?: string;
  reason: string;
}

export interface FullTextPartInventoryItem {
  partUri: string;
  status: "included" | "partial" | "excluded";
  segmentIds: string[];
  reason?: string;
}

export interface FullTextManifest {
  extractionVersion: "docx-text-manifest-v1";
  sourceSha256: string;
  sourceGeneration: number;
  manifestSha256: string;
  segments: FullTextSegment[];
  parts: FullTextPartInventoryItem[];
  excluded: FullTextExcludedItem[];
  coverage: {
    status: "complete" | "partial";
    complete: boolean;
    totalIncludedSegments: number;
    includedParts: number;
    partialParts: number;
    excludedParts: number;
  };
}

export const FULL_TEXT_REVIEW_SCHEMA_VERSION = 1 as const;
export const FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS = 320 as const;
export type FullTextAiProviderKind = "gemini" | "chatgpt";
export type FullTextReviewTextScope = "all_extracted_text";
export type FullTextSegmentReviewStatus = "reviewed" | "no_finding" | "unsupported";
export type FullTextSemanticScope = "body" | "appendix" | "other";
export type FullTextSemanticConfidence = "high" | "medium" | "low";

export interface FullTextReviewConsent {
  scope: FullTextReviewTextScope;
  accepted: true;
  consentId: string;
  provider: FullTextAiProviderKind;
  sourceSha256: string;
  sourceGeneration: number;
  manifestSha256: string;
}

export interface FullTextReviewRequest {
  schemaVersion: typeof FULL_TEXT_REVIEW_SCHEMA_VERSION;
  requestId: string;
  provider: FullTextAiProviderKind;
  consent: FullTextReviewConsent;
  sourceSha256: string;
  sourceGeneration: number;
  manifestSha256: string;
  regime: "administrative" | "party";
  documentType: string;
  textScope: FullTextReviewTextScope;
  extractionCoverage: {
    status: "complete" | "partial";
    totalIncludedSegments: number;
    excludedCount: number;
    includedParts: number;
    partialParts: number;
    excludedParts: number;
  };
  parts: FullTextPartInventoryItem[];
  excluded: FullTextExcludedItem[];
  segments: FullTextSegment[];
  /** Re-run only listed failures, carrying forward previously source-validated results. */
  retry?: {
    segmentIds: string[];
    priorResults: FullTextSegmentReviewResult[];
  };
}

export interface FullTextAiObservation {
  sourceSha256: string;
  sourceGeneration: number;
  segmentId: string;
  sourceAnchor: string;
  exactQuote: string;
  scope: FullTextSemanticScope;
  label: string;
  parentSegmentId?: string;
  appendixHeadingSegmentId?: string;
  reason: string;
  confidence: FullTextSemanticConfidence;
}

export interface FullTextSegmentReviewResult {
  segmentId: string;
  status: FullTextSegmentReviewStatus;
  observations: FullTextAiObservation[];
}

export type FullTextChunkStatus = "completed" | "partial" | "failed" | "timed_out" | "invalid_response" | "preflight_failed";

export interface FullTextChunkResult {
  chunkId: string;
  status: FullTextChunkStatus;
  primarySegmentIds: string[];
  completedSegmentIds: string[];
  failedSegmentIds: string[];
  model?: string;
  error?: string;
}

export interface FullTextCrossReference {
  fromSegmentId: string;
  toSegmentId: string;
  relation: string;
  reason: string;
}

export interface FullTextSynthesisResult {
  status: "completed" | "not_needed" | "failed" | "timed_out" | "invalid_response" | "omitted_large_input";
  crossReferences: FullTextCrossReference[];
  model?: string;
  error?: string;
}

export interface FullTextReviewCoverage {
  status: "complete" | "partial";
  extraction: {
    status: "complete" | "partial";
    totalIncludedSegments: number;
    excludedCount: number;
    includedParts: number;
    partialParts: number;
    excludedParts: number;
  };
  transfer: {
    status: "complete" | "partial";
    selectedSegmentIds: string[];
    attemptedSegmentIds: string[];
    responseReceivedSegmentIds: string[];
    failedSegmentIds: string[];
  };
  semanticResponse: {
    status: "complete" | "partial";
    totalSegmentIds: string[];
    reviewedSegmentIds: string[];
    noFindingSegmentIds: string[];
    unsupportedSegmentIds: string[];
    failedSegmentIds: string[];
  };
  chunks: {
    total: number;
    completed: number;
    partial: number;
    failed: number;
    failedChunkIds: string[];
  };
}
