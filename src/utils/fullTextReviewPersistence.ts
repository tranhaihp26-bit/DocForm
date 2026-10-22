import { FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS, type FullTextReviewCoverage, type FullTextAiProviderKind } from "../shared/fullDocumentTextProtocol.ts";
import type { FullTextSemanticObservation } from "../shared/semanticDocument.ts";

export interface PersistedFullTextSemanticReview {
  provider: FullTextAiProviderKind;
  sourceSha256: string;
  sourceGeneration: number;
  manifestSha256: string;
  partitionFingerprint: string;
  regime: "state" | "party";
  documentType: string;
  observations: FullTextSemanticObservation[];
  coverage: FullTextReviewCoverage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isHash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value); }
function isCount(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function stringIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.length > 0 && item.length <= 256) && new Set(value).size === value.length;
}

export function isPersistedFullTextSemanticReviewValid(value: unknown): value is PersistedFullTextSemanticReview {
  if (!isRecord(value) || Object.keys(value).some(key => ![
    "provider", "sourceSha256", "sourceGeneration", "manifestSha256", "partitionFingerprint", "observations", "coverage",
    "regime", "documentType",
  ].includes(key)) || (value.provider !== "gemini" && value.provider !== "chatgpt") || !isHash(value.sourceSha256) ||
      !isHash(value.manifestSha256) || !Number.isSafeInteger(value.sourceGeneration) || (value.sourceGeneration as number) < 0 ||
      typeof value.partitionFingerprint !== "string" || !value.partitionFingerprint || value.partitionFingerprint.length > 500_000 ||
      (value.regime !== "state" && value.regime !== "party") || typeof value.documentType !== "string" || !value.documentType.trim() || value.documentType.length > 120 ||
      !Array.isArray(value.observations) || value.observations.length > 20_000 || !isRecord(value.coverage)) return false;
  const coverage = value.coverage;
  if (Object.keys(coverage).some(key => !["status", "extraction", "transfer", "semanticResponse", "chunks"].includes(key)) ||
      !["complete", "partial"].includes(String(coverage.status)) || !isRecord(coverage.extraction) ||
      !isRecord(coverage.transfer) || !isRecord(coverage.semanticResponse) || !isRecord(coverage.chunks)) return false;
  const extraction = coverage.extraction;
  if (!["complete", "partial"].includes(String(extraction.status)) || !isCount(extraction.totalIncludedSegments) ||
      !isCount(extraction.excludedCount) || !isCount(extraction.includedParts) || !isCount(extraction.partialParts) ||
      !isCount(extraction.excludedParts)) return false;
  const transfer = coverage.transfer;
  if (!["complete", "partial"].includes(String(transfer.status)) || !stringIds(transfer.selectedSegmentIds) ||
      !stringIds(transfer.attemptedSegmentIds) || !stringIds(transfer.responseReceivedSegmentIds) || !stringIds(transfer.failedSegmentIds)) return false;
  const selectedIds = transfer.selectedSegmentIds as string[];
  const attemptedIds = transfer.attemptedSegmentIds as string[];
  const responseReceivedIds = transfer.responseReceivedSegmentIds as string[];
  const failedTransferIds = transfer.failedSegmentIds as string[];
  const selected = new Set(selectedIds);
  const responseReceived = new Set(responseReceivedIds);
  if (selectedIds.length !== extraction.totalIncludedSegments ||
      !attemptedIds.every(id => selected.has(id)) || !responseReceivedIds.every(id => selected.has(id)) ||
      !failedTransferIds.every(id => selected.has(id)) ||
      failedTransferIds.length !== selected.size - responseReceived.size ||
      failedTransferIds.some(id => responseReceived.has(id)) ||
      (transfer.status === "complete") !== (transfer.failedSegmentIds.length === 0)) return false;
  const semantic = coverage.semanticResponse;
  if (!["complete", "partial"].includes(String(semantic.status)) || !stringIds(semantic.totalSegmentIds) ||
      !stringIds(semantic.reviewedSegmentIds) || !stringIds(semantic.noFindingSegmentIds) ||
      !stringIds(semantic.unsupportedSegmentIds) || !stringIds(semantic.failedSegmentIds)) return false;
  const semanticGroups = [semantic.reviewedSegmentIds, semantic.noFindingSegmentIds, semantic.unsupportedSegmentIds, semantic.failedSegmentIds] as string[][];
  const classified = new Set<string>();
  for (const group of semanticGroups) for (const id of group) {
    if (!selected.has(id) || classified.has(id)) return false;
    classified.add(id);
  }
  if (semantic.totalSegmentIds.length !== selected.size || semantic.totalSegmentIds.some((id, index) => id !== selectedIds[index]) ||
      classified.size !== selected.size || (semantic.status === "complete") !== (semantic.failedSegmentIds.length === 0)) return false;
  const chunks = coverage.chunks;
  if (!isCount(chunks.total) || !isCount(chunks.completed) || !isCount(chunks.partial) || !isCount(chunks.failed) ||
      !stringIds(chunks.failedChunkIds) || chunks.completed + chunks.partial + chunks.failed > chunks.total ||
      chunks.failedChunkIds.length > chunks.total) return false;
  const allResults = new Set([...semantic.reviewedSegmentIds, ...semantic.noFindingSegmentIds, ...semantic.unsupportedSegmentIds]);
  for (const raw of value.observations) {
    if (!isRecord(raw) || Object.keys(raw).some(key => ![
      "sourceSha256", "sourceGeneration", "segmentId", "sourceAnchor", "sourceBlockId", "tableId", "cellId", "rowIndex",
      "cellIndex", "paragraphIndex", "scope", "appendixId", "parentSegmentId", "parentUnitId", "appendixHeadingSegmentId",
      "label", "quote", "reason", "confidence", "alignment", "alignmentReason", "localUnitId",
    ].includes(key)) || raw.sourceSha256 !== value.sourceSha256 || raw.sourceGeneration !== value.sourceGeneration ||
        typeof raw.segmentId !== "string" || !allResults.has(raw.segmentId) || typeof raw.sourceAnchor !== "string" || !raw.sourceAnchor ||
        (raw.sourceBlockId !== undefined && typeof raw.sourceBlockId !== "string") ||
        (raw.tableId !== undefined && typeof raw.tableId !== "string") || (raw.cellId !== undefined && typeof raw.cellId !== "string") ||
        (raw.rowIndex !== undefined && !isCount(raw.rowIndex)) || (raw.cellIndex !== undefined && !isCount(raw.cellIndex)) ||
        (raw.paragraphIndex !== undefined && !isCount(raw.paragraphIndex)) || !["body", "appendix", "other"].includes(String(raw.scope)) ||
        !["body", "appendix", "other"].includes(String(raw.scope)) || typeof raw.label !== "string" || !raw.label || raw.label.length > 80 ||
        typeof raw.quote !== "string" || !raw.quote.trim() || raw.quote.length > FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS ||
        typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 1000 ||
        !["high", "medium", "low"].includes(String(raw.confidence)) || !["aligned", "unaligned", "ambiguous"].includes(String(raw.alignment)) ||
        (raw.alignmentReason !== undefined && typeof raw.alignmentReason !== "string") ||
        (raw.appendixId !== undefined && typeof raw.appendixId !== "string") ||
        (raw.parentSegmentId !== undefined && typeof raw.parentSegmentId !== "string") ||
        (raw.parentUnitId !== undefined && typeof raw.parentUnitId !== "string") ||
        (raw.appendixHeadingSegmentId !== undefined && typeof raw.appendixHeadingSegmentId !== "string") ||
        (raw.localUnitId !== undefined && typeof raw.localUnitId !== "string")) return false;
  }
  return true;
}
