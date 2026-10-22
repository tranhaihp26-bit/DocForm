import {
  FULL_TEXT_REVIEW_SCHEMA_VERSION,
  type FullTextChunkResult,
  type FullTextReviewConsent,
  type FullTextReviewCoverage,
  type FullTextReviewRequest,
  type FullTextSegmentReviewResult,
  type FullTextSynthesisResult,
  type FullTextManifest,
} from "../shared/fullDocumentTextProtocol.ts";

export interface FullTextReviewSemanticContext {
  provider: FullTextReviewRequest["provider"];
  sourceSha256: string;
  sourceGeneration: number;
  manifestSha256: string;
  partitionFingerprint: string;
  regime: "state" | "party";
  documentType: string;
}

export function isFullTextReviewContextCurrent(
  reviewed: FullTextReviewSemanticContext | null | undefined,
  current: FullTextReviewSemanticContext,
): boolean {
  return Boolean(reviewed && reviewed.provider === current.provider &&
    reviewed.sourceSha256 === current.sourceSha256 && reviewed.sourceGeneration === current.sourceGeneration &&
    reviewed.manifestSha256 === current.manifestSha256 && reviewed.partitionFingerprint === current.partitionFingerprint &&
    reviewed.regime === current.regime && reviewed.documentType === current.documentType);
}

export interface FullTextReviewServerResponse {
  schemaVersion: typeof FULL_TEXT_REVIEW_SCHEMA_VERSION;
  requestId: string;
  provider: FullTextReviewRequest["provider"];
  sourceSha256: string;
  sourceGeneration: number;
  manifestSha256: string;
  coverage: FullTextReviewCoverage;
  chunks: FullTextChunkResult[];
  results: FullTextSegmentReviewResult[];
  synthesis: FullTextSynthesisResult;
}

export type FullTextReviewStreamEvent =
  | { type: "chunk"; chunk: FullTextChunkResult }
  | { type: "synthesis"; synthesis: FullTextSynthesisResult }
  | { type: "final"; response: FullTextReviewServerResponse };

export function createFullTextConsent(
  provider: FullTextReviewConsent["provider"],
  sourceSha256: string,
  sourceGeneration: number,
  manifestSha256: string,
): FullTextReviewConsent {
  const consentId = globalThis.crypto?.randomUUID?.() ?? `consent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { scope: "all_extracted_text", accepted: true, consentId, provider, sourceSha256, sourceGeneration, manifestSha256 };
}

export function isFullTextConsentCurrent(
  consent: FullTextReviewConsent | null | undefined,
  provider: FullTextReviewConsent["provider"],
  sourceSha256: string,
  sourceGeneration: number,
  manifestSha256: string,
): consent is FullTextReviewConsent {
  return Boolean(consent?.accepted && consent.scope === "all_extracted_text" && consent.provider === provider &&
    consent.sourceSha256 === sourceSha256 && consent.sourceGeneration === sourceGeneration &&
    consent.manifestSha256 === manifestSha256 && consent.consentId.trim());
}

export function buildFullTextReviewRequest(
  manifest: FullTextManifest,
  provider: FullTextReviewConsent["provider"],
  consent: FullTextReviewConsent,
  regime: FullTextReviewRequest["regime"],
  documentType: string,
  previous?: Pick<FullTextReviewServerResponse, "coverage" | "results">,
): FullTextReviewRequest {
  if (!isFullTextConsentCurrent(consent, provider, manifest.sourceSha256, manifest.sourceGeneration, manifest.manifestSha256)) {
    throw new Error("Cần consent riêng cho đúng nhà cung cấp, tệp nguồn và thế hệ nguồn trước khi gửi toàn văn.");
  }
  if (!documentType.trim()) throw new Error("Cần xác nhận loại văn bản trước khi rà soát toàn văn.");
  const request: FullTextReviewRequest = {
    schemaVersion: FULL_TEXT_REVIEW_SCHEMA_VERSION,
    requestId: globalThis.crypto?.randomUUID?.() ?? `review-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    provider,
    consent: structuredClone(consent),
    sourceSha256: manifest.sourceSha256,
    sourceGeneration: manifest.sourceGeneration,
    manifestSha256: manifest.manifestSha256,
    regime,
    documentType: documentType.trim(),
    textScope: "all_extracted_text",
    extractionCoverage: {
      status: manifest.coverage.status,
      totalIncludedSegments: manifest.coverage.totalIncludedSegments,
      excludedCount: manifest.excluded.length,
      includedParts: manifest.coverage.includedParts,
      partialParts: manifest.coverage.partialParts,
      excludedParts: manifest.coverage.excludedParts,
    },
    parts: structuredClone(manifest.parts),
    excluded: structuredClone(manifest.excluded),
    segments: structuredClone(manifest.segments),
  };
  if (previous) {
    const failedIds = [...previous.coverage.semanticResponse.failedSegmentIds];
    if (!failedIds.length) throw new Error("Không còn đoạn lỗi cần thử lại.");
    request.retry = { segmentIds: failedIds, priorResults: structuredClone(previous.results) };
  }
  return request;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : `Yêu cầu AI thất bại (${response.status}).`;
  } catch { return `Yêu cầu AI thất bại (${response.status}).`; }
}

function validateFinal(value: unknown, request: FullTextReviewRequest): value is FullTextReviewServerResponse {
  if (!isRecord(value) || value.schemaVersion !== FULL_TEXT_REVIEW_SCHEMA_VERSION || value.requestId !== request.requestId ||
      value.provider !== request.provider || value.sourceSha256 !== request.sourceSha256 ||
      value.sourceGeneration !== request.sourceGeneration || value.manifestSha256 !== request.manifestSha256 ||
      !isRecord(value.coverage) || !Array.isArray(value.chunks) || !Array.isArray(value.results) || !isRecord(value.synthesis)) return false;
  const coverage = value.coverage as Record<string, any>;
  const extraction = coverage.extraction;
  const transfer = coverage.transfer;
  const semantic = coverage.semanticResponse;
  const chunkCoverage = coverage.chunks;
  const expectedIds = request.segments.map(segment => segment.id);
  const idsValid = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every(id => typeof id === "string") && new Set(ids).size === ids.length;
  if (!["complete", "partial"].includes(String(coverage.status)) || !isRecord(extraction) || !isRecord(transfer) ||
      !isRecord(semantic) || !isRecord(chunkCoverage) || !["complete", "partial"].includes(String(extraction.status)) ||
      !["complete", "partial"].includes(String(transfer.status)) || !["complete", "partial"].includes(String(semantic.status)) ||
      !idsValid(transfer.selectedSegmentIds) || !idsValid(transfer.attemptedSegmentIds) || !idsValid(transfer.responseReceivedSegmentIds) ||
      !idsValid(transfer.failedSegmentIds) || !idsValid(semantic.totalSegmentIds) || !idsValid(semantic.reviewedSegmentIds) ||
      !idsValid(semantic.noFindingSegmentIds) || !idsValid(semantic.unsupportedSegmentIds) || !idsValid(semantic.failedSegmentIds) ||
      !Array.isArray(value.results) || !Array.isArray(value.chunks) || !Number.isSafeInteger(chunkCoverage.total) ||
      !Number.isSafeInteger(chunkCoverage.completed) || !Number.isSafeInteger(chunkCoverage.partial) || !Number.isSafeInteger(chunkCoverage.failed) ||
      !idsValid(chunkCoverage.failedChunkIds)) return false;
  const selectedSegmentIds = transfer.selectedSegmentIds as string[];
  const attemptedSegmentIds = transfer.attemptedSegmentIds as string[];
  const responseReceivedSegmentIds = transfer.responseReceivedSegmentIds as string[];
  const transferFailedSegmentIds = transfer.failedSegmentIds as string[];
  const totalSegmentIds = semantic.totalSegmentIds as string[];
  const reviewedSegmentIds = semantic.reviewedSegmentIds as string[];
  const noFindingSegmentIds = semantic.noFindingSegmentIds as string[];
  const unsupportedSegmentIds = semantic.unsupportedSegmentIds as string[];
  const semanticFailedSegmentIds = semantic.failedSegmentIds as string[];
  const completedChunks = chunkCoverage.completed as number;
  const partialChunks = chunkCoverage.partial as number;
  const failedChunks = chunkCoverage.failed as number;
  const expected = new Set(expectedIds);
  const resultIds = value.results.map((item: any) => item && item.segmentId).filter((id: unknown): id is string => typeof id === "string");
  if (resultIds.length !== value.results.length || new Set(resultIds).size !== resultIds.length ||
      expectedIds.some((id, index) => selectedSegmentIds[index] !== id || totalSegmentIds[index] !== id) ||
      selectedSegmentIds.length !== expectedIds.length || totalSegmentIds.length !== expectedIds.length ||
      !attemptedSegmentIds.every((id: string) => expected.has(id)) ||
      !responseReceivedSegmentIds.every((id: string) => expected.has(id)) ||
      !transferFailedSegmentIds.every((id: string) => expected.has(id)) ||
      resultIds.some((id: string) => !expected.has(id)) || resultIds.some((id: string) => !responseReceivedSegmentIds.includes(id)) ||
      responseReceivedSegmentIds.some((id: string) => !resultIds.includes(id)) ||
      transferFailedSegmentIds.some((id: string) => responseReceivedSegmentIds.includes(id)) ||
      transferFailedSegmentIds.length + responseReceivedSegmentIds.length !== expectedIds.length) return false;
  const resultById = new Map(value.results.map((item: any) => [item.segmentId, item.status]));
  const groupIds: Array<[string[], string]> = [
    [reviewedSegmentIds, "reviewed"], [noFindingSegmentIds, "no_finding"],
    [unsupportedSegmentIds, "unsupported"],
  ];
  const classified = new Set<string>();
  for (const [ids, status] of groupIds) for (const id of ids) {
    if (!expected.has(id) || classified.has(id) || resultById.get(id) !== status) return false;
    classified.add(id);
  }
  const unreturned = expectedIds.filter(id => !resultById.has(id));
  if (unreturned.length !== semanticFailedSegmentIds.length || unreturned.some(id => !semanticFailedSegmentIds.includes(id)) ||
      classified.size + semanticFailedSegmentIds.length !== expectedIds.length ||
      (semantic.status === "complete") !== (semanticFailedSegmentIds.length === 0) ||
      (transfer.status === "complete") !== (transferFailedSegmentIds.length === 0) ||
      chunkCoverage.total !== value.chunks.length || completedChunks + partialChunks + failedChunks > chunkCoverage.total ||
      !["completed", "not_needed", "failed", "timed_out", "invalid_response", "omitted_large_input"].includes(String(value.synthesis.status)) ||
      !Array.isArray(value.synthesis.crossReferences)) return false;
  const expectedComplete = extraction.status === "complete" && transfer.status === "complete" && semantic.status === "complete";
  return (coverage.status === "complete") === expectedComplete;
}

function parseEvent(line: string, request: FullTextReviewRequest): FullTextReviewStreamEvent {
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw new Error("Luồng rà soát toàn văn có dòng JSON không hợp lệ."); }
  if (!isRecord(value)) throw new Error("Sự kiện rà soát toàn văn không hợp lệ.");
  if (value.type === "chunk" && isRecord(value.chunk) && typeof value.chunk.chunkId === "string" &&
      typeof value.chunk.status === "string" && Array.isArray(value.chunk.primarySegmentIds) &&
      Array.isArray(value.chunk.completedSegmentIds) && Array.isArray(value.chunk.failedSegmentIds)) {
    return value as FullTextReviewStreamEvent;
  }
  if (value.type === "synthesis" && isRecord(value.synthesis) && typeof value.synthesis.status === "string" &&
      Array.isArray(value.synthesis.crossReferences)) return value as FullTextReviewStreamEvent;
  if (value.type === "final" && validateFinal(value.response, request)) return value as FullTextReviewStreamEvent;
  throw new Error("Phản hồi rà soát toàn văn không khớp yêu cầu hiện tại hoặc sai schema.");
}

export async function readFullTextReviewStream(
  response: Response,
  request: FullTextReviewRequest,
  onEvent: (event: Exclude<FullTextReviewStreamEvent, { type: "final" }>) => void,
  signal?: AbortSignal,
): Promise<FullTextReviewServerResponse> {
  if (!response.ok) throw new Error(await responseError(response));
  if (!/application\/x-ndjson/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error("Máy chủ local không trả về luồng tiến độ rà soát toàn văn.");
  }
  if (!response.body) throw new Error("Máy chủ local không mở luồng kết quả rà soát.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let final: FullTextReviewServerResponse | undefined;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = parseEvent(line, request);
    if (event.type === "final") {
      if (final) throw new Error("Luồng rà soát gửi nhiều kết quả cuối.");
      final = event.response;
    } else {
      onEvent(event);
    }
  };
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Rà soát đã bị hủy.", "AbortError");
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        consumeLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) consumeLine(pending);
  } catch (error) {
    try { await reader.cancel(error); } catch { /* request already closed */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!final) throw new Error("Máy chủ đã đóng luồng trước khi gửi coverage cuối.");
  return final;
}
