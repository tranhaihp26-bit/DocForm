import crypto from "node:crypto";
import {
  FULL_TEXT_REVIEW_SCHEMA_VERSION,
  FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS,
  type FullTextAiObservation,
  type FullTextChunkResult,
  type FullTextCrossReference,
  type FullTextReviewCoverage,
  type FullTextReviewRequest,
  type FullTextExcludedItem,
  type FullTextPartInventoryItem,
  type FullTextSegment,
  type FullTextSegmentReviewResult,
  type FullTextSynthesisResult,
} from "../shared/fullDocumentTextProtocol.ts";
import { runBoundedTasks } from "./aiTextChunkRunner.ts";
import {
  buildFullTextSemanticPrompt,
  buildFullTextSynthesisPrompt,
  type FullTextReviewChunk,
} from "./fullTextSemanticPrompt.ts";

export interface FullTextAiProviderResult { text: string; model?: string }
export type FullTextAiProvider = (prompt: string, signal: AbortSignal) => Promise<FullTextAiProviderResult>;

export class FullTextReviewRequestError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "FullTextReviewRequestError";
  }
}

export interface FullTextReviewOptions {
  timeoutMs?: number;
  concurrency?: number;
  signal?: AbortSignal;
  chunkOptions?: {
    maxEstimatedTokens?: number;
    promptReserveTokens?: number;
    contextSegmentLimit?: number;
    maxContextCharacters?: number;
  };
  onChunkResult?: (result: FullTextChunkResult) => void;
  onSynthesisResult?: (result: FullTextSynthesisResult) => void;
}

const HASH = /^[a-f0-9]{64}$/;
const REQUEST_KEYS = new Set([
  "schemaVersion", "requestId", "provider", "consent", "sourceSha256", "sourceGeneration", "manifestSha256",
  "regime", "documentType", "textScope", "extractionCoverage", "parts", "excluded", "segments", "retry",
]);
const CONSENT_KEYS = new Set(["scope", "accepted", "consentId", "provider", "sourceSha256", "sourceGeneration", "manifestSha256"]);
const COVERAGE_KEYS = new Set(["status", "totalIncludedSegments", "excludedCount", "includedParts", "partialParts", "excludedParts"]);
const SEGMENT_KEYS = new Set([
  "id", "sourceSha256", "sourceGeneration", "packagePartUri", "sourceAnchor", "storyKind", "documentOrder",
  "sourceBlockId", "tableId", "cellId", "rowIndex", "cellIndex", "paragraphIndex", "noteId", "relationshipId",
  "visibilityClass", "text", "textSha256",
]);
const STORIES = new Set(["body", "header", "footer", "footnote", "endnote", "textbox"]);
const EXCLUDED_CODES = new Set([
  "hidden_text", "tracked_changes", "field_instruction", "drawing_visual_content", "nested_table", "unsupported_wrapper",
  "comments_excluded", "unsupported_text_part", "unreferenced_story", "unresolved_relationship", "missing_note_part",
  "media_unreadable", "embedded_object_unreadable", "malformed_story",
]);
const ALLOWED_LABELS = new Set([
  "section_heading", "legal_basis", "lead", "narrative", "article", "clause", "point", "list_item", "table_header",
  "table_data", "note", "source_note", "media_unsupported", "appendix_title", "appendix_reference", "appendix_heading", "explanation", "meeting_time_place",
  "participants", "chair_secretary", "agenda", "discussion", "vote", "conclusion", "assignment", "closing",
  "header_footer", "footnote", "endnote", "textbox", "unknown",
]);
const MAX_SEGMENTS = 20_000;
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
const DEFAULT_TOKEN_BUDGET = 6_000;
const DEFAULT_PROMPT_RESERVE = 1_200;
const DEFAULT_CONTEXT_LIMIT = 2;
const DEFAULT_CONTEXT_CHARACTERS = 1_200;
const MAX_SYNTHESIS_PROMPT_CHARACTERS = 24_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function safeHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
function manifestFingerprint(
  sourceSha256: string,
  sourceGeneration: number,
  segments: FullTextSegment[],
  parts: FullTextPartInventoryItem[],
  excluded: FullTextExcludedItem[],
): string {
  const hashMaterial = JSON.stringify({
    extractionVersion: "docx-text-manifest-v1",
    sourceSha256,
    sourceGeneration,
    segments: segments.map(({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId,
      cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    }) => ({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId,
      cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    })),
    parts,
    excluded,
  });
  return sha256(hashMaterial);
}
function validSegment(raw: unknown, request: Record<string, unknown>): raw is FullTextSegment {
  if (!isRecord(raw) || !onlyKeys(raw, SEGMENT_KEYS)) return false;
  if (typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 256 ||
      raw.sourceSha256 !== request.sourceSha256 || raw.sourceGeneration !== request.sourceGeneration ||
      typeof raw.packagePartUri !== "string" || raw.packagePartUri.length > 512 ||
      typeof raw.sourceAnchor !== "string" || !raw.sourceAnchor.trim() || raw.sourceAnchor.length > 2048 ||
      !STORIES.has(String(raw.storyKind)) || !Number.isSafeInteger(raw.documentOrder) || (raw.documentOrder as number) < 0 ||
      raw.visibilityClass !== "visible_text" || typeof raw.text !== "string" || raw.text.length > 1_000_000 ||
      !safeHash(raw.textSha256) || raw.textSha256 !== sha256(raw.text)) return false;
  for (const key of ["sourceBlockId", "tableId", "cellId", "noteId", "relationshipId"] as const) {
    if (raw[key] !== undefined && (typeof raw[key] !== "string" || raw[key].length > 512)) return false;
  }
  for (const key of ["rowIndex", "cellIndex", "paragraphIndex"] as const) {
    if (raw[key] !== undefined && (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0)) return false;
  }
  return true;
}

export function validateFullTextReviewRequest(value: unknown): { valid: boolean; reason?: string; request?: FullTextReviewRequest } {
  const reject = (reason: string) => ({ valid: false as const, reason });
  if (!isRecord(value) || !onlyKeys(value, REQUEST_KEYS)) return reject("Yêu cầu rà soát toàn văn có trường ngoài schema hoặc không phải object.");
  if (value.schemaVersion !== FULL_TEXT_REVIEW_SCHEMA_VERSION) return reject("Phiên bản schema rà soát toàn văn không được hỗ trợ.");
  if (typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.length > 128) return reject("Mã yêu cầu rà soát toàn văn không hợp lệ.");
  if (value.provider !== "gemini" && value.provider !== "chatgpt") return reject("Nhà cung cấp AI không hợp lệ.");
  if (!safeHash(value.sourceSha256) || !safeHash(value.manifestSha256) || !Number.isSafeInteger(value.sourceGeneration) || (value.sourceGeneration as number) < 0) {
    return reject("SHA nguồn, manifest hoặc thế hệ nguồn không hợp lệ.");
  }
  if (value.regime !== "administrative" && value.regime !== "party") return reject("Hệ thể thức không hợp lệ.");
  if (typeof value.documentType !== "string" || !value.documentType.trim() || value.documentType.length > 120) return reject("Loại văn bản không hợp lệ.");
  if (value.textScope !== "all_extracted_text") return reject("Phạm vi rà soát không hợp lệ.");
  if (!isRecord(value.consent) || !onlyKeys(value.consent, CONSENT_KEYS) || value.consent.scope !== "all_extracted_text" || value.consent.accepted !== true ||
      typeof value.consent.consentId !== "string" || !value.consent.consentId.trim() || value.consent.consentId.length > 128 ||
      value.consent.provider !== value.provider || value.consent.sourceSha256 !== value.sourceSha256 ||
      value.consent.sourceGeneration !== value.sourceGeneration || value.consent.manifestSha256 !== value.manifestSha256) {
    return reject("Cần consent riêng cho đúng nhà cung cấp, tệp nguồn và thế hệ nguồn trước khi gửi toàn văn.");
  }
  if (!isRecord(value.extractionCoverage) || !onlyKeys(value.extractionCoverage, COVERAGE_KEYS) ||
      (value.extractionCoverage.status !== "complete" && value.extractionCoverage.status !== "partial") ||
      !Number.isSafeInteger(value.extractionCoverage.totalIncludedSegments) || (value.extractionCoverage.totalIncludedSegments as number) < 0 ||
      !Number.isSafeInteger(value.extractionCoverage.excludedCount) || (value.extractionCoverage.excludedCount as number) < 0 ||
      !Number.isSafeInteger(value.extractionCoverage.includedParts) || (value.extractionCoverage.includedParts as number) < 0 ||
      !Number.isSafeInteger(value.extractionCoverage.partialParts) || (value.extractionCoverage.partialParts as number) < 0 ||
      !Number.isSafeInteger(value.extractionCoverage.excludedParts) || (value.extractionCoverage.excludedParts as number) < 0) {
    return reject("Coverage trích xuất không hợp lệ.");
  }
  if (!Array.isArray(value.segments) || value.segments.length > MAX_SEGMENTS ||
      !Array.isArray(value.parts) || !Array.isArray(value.excluded) ||
      value.extractionCoverage.totalIncludedSegments !== value.segments.length ||
      value.extractionCoverage.excludedCount !== value.excluded.length) {
    return reject("Danh sách đoạn nguồn không khớp coverage hoặc vượt giới hạn.");
  }
  const seen = new Set<string>();
  for (const raw of value.segments) {
    if (!validSegment(raw, value)) return reject("Đoạn nguồn sai schema, sai SHA hoặc không thuộc đúng thế hệ nguồn.");
    if (seen.has(raw.id)) return reject("ID đoạn nguồn bị trùng.");
    seen.add(raw.id);
  }
  const partSegmentIds = new Set<string>();
  const partUris = new Set<string>();
  for (const rawPart of value.parts) {
    if (!isRecord(rawPart) || !onlyKeys(rawPart, new Set(["partUri", "status", "segmentIds", "reason"])) ||
        typeof rawPart.partUri !== "string" || !rawPart.partUri.startsWith("/") || rawPart.partUri.length > 512 ||
        !["included", "partial", "excluded"].includes(String(rawPart.status)) || !Array.isArray(rawPart.segmentIds) ||
        (rawPart.reason !== undefined && typeof rawPart.reason !== "string")) return reject("Danh mục package part sai schema.");
    if (partUris.has(rawPart.partUri)) return reject("Package part bị lặp trong manifest.");
    partUris.add(rawPart.partUri);
    for (const id of rawPart.segmentIds) {
      if (typeof id !== "string" || !seen.has(id) || partSegmentIds.has(id)) return reject("Package part tham chiếu segment thiếu hoặc trùng.");
      const segment = value.segments.find(item => isRecord(item) && item.id === id) as Record<string, unknown> | undefined;
      if (!segment || segment.packagePartUri !== rawPart.partUri) return reject("Segment không khớp package part nguồn.");
      partSegmentIds.add(id);
    }
  }
  if (partSegmentIds.size !== seen.size) return reject("Manifest không kiểm kê đủ mọi segment.");
  for (const rawExcluded of value.excluded) {
    if (!isRecord(rawExcluded) || !onlyKeys(rawExcluded, new Set(["code", "packagePartUri", "anchor", "reason"])) ||
        !EXCLUDED_CODES.has(String(rawExcluded.code)) || typeof rawExcluded.packagePartUri !== "string" ||
        typeof rawExcluded.reason !== "string" || (rawExcluded.anchor !== undefined && typeof rawExcluded.anchor !== "string")) {
      return reject("Mục bị loại trong manifest sai schema.");
    }
  }
  const actualIncludedParts = value.parts.filter(part => isRecord(part) && part.status === "included").length;
  const actualPartialParts = value.parts.filter(part => isRecord(part) && part.status === "partial").length;
  const actualExcludedParts = value.parts.filter(part => isRecord(part) && part.status === "excluded").length;
  if (value.extractionCoverage.includedParts !== actualIncludedParts ||
      value.extractionCoverage.partialParts !== actualPartialParts ||
      value.extractionCoverage.excludedParts !== actualExcludedParts) return reject("Coverage số package part không khớp manifest.");
  const shouldBeComplete = value.excluded.length === 0 && actualPartialParts === 0 && actualExcludedParts === 0;
  if ((value.extractionCoverage.status === "complete") !== shouldBeComplete) return reject("Trạng thái extraction coverage không khớp manifest.");
  if (manifestFingerprint(
    value.sourceSha256 as string,
    value.sourceGeneration as number,
    value.segments as FullTextSegment[],
    value.parts as FullTextPartInventoryItem[],
    value.excluded as FullTextExcludedItem[],
  ) !== value.manifestSha256) return reject("SHA manifest không khớp segments, package parts và các phần bị loại.");
  if (value.retry !== undefined) {
    if (!isRecord(value.retry) || !onlyKeys(value.retry, new Set(["segmentIds", "priorResults"])) ||
        !Array.isArray(value.retry.segmentIds) || value.retry.segmentIds.length === 0 ||
        !Array.isArray(value.retry.priorResults)) return reject("Phạm vi retry không hợp lệ.");
    const selectedIds = new Set<string>();
    for (const id of value.retry.segmentIds) {
      if (typeof id !== "string" || !seen.has(id) || selectedIds.has(id)) return reject("Retry phải chỉ định các đoạn lỗi duy nhất trong manifest.");
      selectedIds.add(id);
    }
    const priorIds = new Set<string>();
    for (const rawResult of value.retry.priorResults) {
      if (!isRecord(rawResult) || !onlyKeys(rawResult, new Set(["segmentId", "status", "observations"])) ||
          typeof rawResult.segmentId !== "string" || !seen.has(rawResult.segmentId) || selectedIds.has(rawResult.segmentId) ||
          priorIds.has(rawResult.segmentId) || !["reviewed", "no_finding", "unsupported"].includes(String(rawResult.status)) ||
          !Array.isArray(rawResult.observations)) return reject("Kết quả đã hoàn thành trước đó bị trùng hoặc sai schema.");
      priorIds.add(rawResult.segmentId);
      const segment = (value.segments as FullTextSegment[]).find(item => item.id === rawResult.segmentId)!;
      for (const rawObservation of rawResult.observations) {
        if (!isRecord(rawObservation) || !onlyKeys(rawObservation, new Set([
          "sourceSha256", "sourceGeneration", "segmentId", "sourceAnchor", "exactQuote", "scope", "label",
          "parentSegmentId", "appendixHeadingSegmentId", "reason", "confidence",
        ])) || rawObservation.sourceSha256 !== value.sourceSha256 || rawObservation.sourceGeneration !== value.sourceGeneration ||
            rawObservation.segmentId !== segment.id || rawObservation.sourceAnchor !== segment.sourceAnchor ||
            typeof rawObservation.exactQuote !== "string" || !rawObservation.exactQuote.trim() || rawObservation.exactQuote.length > FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS || !segment.text.includes(rawObservation.exactQuote) ||
            !["body", "appendix", "other"].includes(String(rawObservation.scope)) || !ALLOWED_LABELS.has(String(rawObservation.label)) ||
            typeof rawObservation.reason !== "string" || !rawObservation.reason.trim() || rawObservation.reason.length > 1000 ||
            !["high", "medium", "low"].includes(String(rawObservation.confidence)) ||
            (rawObservation.parentSegmentId !== undefined && !seen.has(String(rawObservation.parentSegmentId))) ||
            (rawObservation.appendixHeadingSegmentId !== undefined && !seen.has(String(rawObservation.appendixHeadingSegmentId)))) {
          return reject("Kết quả retry đã có không còn khớp với văn bản nguồn.");
        }
      }
    }
    if (selectedIds.size + priorIds.size !== seen.size) return reject("Retry phải giữ nguyên kết quả đã hợp lệ và chỉ chọn các đoạn còn thiếu.");
  }
  try {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_REQUEST_BYTES) return reject("Toàn văn vượt giới hạn payload an toàn; không có đoạn nào được gửi.");
  } catch { return reject("Không thể kiểm tra kích thước yêu cầu toàn văn."); }
  return { valid: true, request: value as unknown as FullTextReviewRequest };
}

function estimatedTokens(segments: FullTextSegment[]): number {
  const serialized = JSON.stringify(segments.map(segment => ({ id: segment.id, anchor: segment.sourceAnchor, order: segment.documentOrder, text: segment.text })));
  // Two UTF-8 bytes per estimated token is deliberately conservative for Vietnamese prose.
  return Math.ceil(Buffer.byteLength(serialized, "utf8") / 2);
}

export function buildFullTextReviewChunks(
  segments: FullTextSegment[],
  options: { maxEstimatedTokens?: number; promptReserveTokens?: number; contextSegmentLimit?: number; maxContextCharacters?: number } = {},
): FullTextReviewChunk[] {
  const tokenBudget = Math.max(500, Math.floor(options.maxEstimatedTokens ?? DEFAULT_TOKEN_BUDGET));
  const promptReserve = Math.max(100, Math.min(tokenBudget - 100, Math.floor(options.promptReserveTokens ?? DEFAULT_PROMPT_RESERVE)));
  const contextLimit = Math.max(0, Math.min(4, Math.floor(options.contextSegmentLimit ?? DEFAULT_CONTEXT_LIMIT)));
  const maxContextCharacters = Math.max(0, Math.floor(options.maxContextCharacters ?? DEFAULT_CONTEXT_CHARACTERS));
  const chunks: FullTextReviewChunk[] = [];
  let primary: FullTextSegment[] = [];
  let context: FullTextSegment[] = [];
  const previous: FullTextSegment[] = [];
  const pushReady = () => {
    if (!primary.length) return;
    chunks.push({
      chunkId: "text-chunk-" + chunks.length,
      primarySegments: primary,
      contextSegments: context,
      status: "ready",
      estimatedInputTokens: promptReserve + estimatedTokens([...context, ...primary]),
    });
    previous.push(...primary);
    primary = [];
    context = [];
  };
  const contextForNext = () => contextLimit === 0
    ? []
    : previous.slice(-contextLimit).filter(segment => segment.text.length <= maxContextCharacters);

  for (const segment of segments) {
    if (primary.length === 0) context = contextForNext();
    if (promptReserve + estimatedTokens([...context, ...primary, segment]) <= tokenBudget) {
      primary.push(segment);
      continue;
    }
    if (primary.length) {
      pushReady();
      context = contextForNext();
    }
    if (promptReserve + estimatedTokens([...context, segment]) <= tokenBudget) {
      primary.push(segment);
      continue;
    }
    chunks.push({
      chunkId: "text-chunk-" + chunks.length,
      primarySegments: [],
      contextSegments: context,
      status: "preflight_failed",
      failedSegmentIds: [segment.id],
      error: "Đoạn nguồn vượt ngân sách đầu vào an toàn; không bị cắt ngắn.",
      estimatedInputTokens: promptReserve + estimatedTokens([...context, segment]),
    });
    previous.push(segment);
    context = [];
  }
  pushReady();
  return chunks;
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch { return null; }
}
function errorText(error: unknown): string {
  if (error instanceof Error && /abort/i.test(error.name)) return "Yêu cầu AI đã bị hủy.";
  return "Nhà cung cấp AI không hoàn tất chunk này.";
}
function isContextOverflow(error: unknown): boolean {
  const message = error instanceof Error ? error.name + " " + error.message : String(error);
  return /context|token limit|too many tokens|request.{0,12}too large|payload.{0,12}too large|413/i.test(message);
}

function validateChunkResponse(value: unknown, request: FullTextReviewRequest, chunk: FullTextReviewChunk): {
  results: FullTextSegmentReviewResult[];
  failedIds: string[];
  reason?: string;
} {
  const failAll = (reason: string) => ({
    results: [] as FullTextSegmentReviewResult[],
    failedIds: chunk.primarySegments.map(segment => segment.id),
    reason,
  });
  if (!isRecord(value) || !onlyKeys(value, new Set(["schemaVersion", "sourceSha256", "sourceGeneration", "chunkId", "segmentResults"]))) {
    return failAll("Phản hồi AI không đúng schema.");
  }
  if (value.schemaVersion !== FULL_TEXT_REVIEW_SCHEMA_VERSION || value.sourceSha256 !== request.sourceSha256 ||
      value.sourceGeneration !== request.sourceGeneration || value.chunkId !== chunk.chunkId || !Array.isArray(value.segmentResults)) {
    return failAll("Phản hồi AI không khớp tệp, thế hệ nguồn hoặc chunk.");
  }
  const primaryIds = new Set(chunk.primarySegments.map(segment => segment.id));
  const segmentsById = new Map(request.segments.map(segment => [segment.id, segment]));
  const seen = new Set<string>();
  const results: FullTextSegmentReviewResult[] = [];
  let invalidEntry = false;
  for (const raw of value.segmentResults) {
    if (!isRecord(raw) || !onlyKeys(raw, new Set(["segmentId", "status", "observations"])) ||
        typeof raw.segmentId !== "string" || !primaryIds.has(raw.segmentId) || seen.has(raw.segmentId) ||
        !["reviewed", "no_finding", "unsupported"].includes(String(raw.status)) || !Array.isArray(raw.observations)) {
      invalidEntry = true;
      continue;
    }
    seen.add(raw.segmentId);
    const source = segmentsById.get(raw.segmentId)!;
    const observations: FullTextAiObservation[] = [];
    let valid = true;
    for (const observation of raw.observations) {
      if (!isRecord(observation) || !onlyKeys(observation, new Set([
        "scope", "label", "exactQuote", "parentSegmentId", "appendixHeadingSegmentId", "reason", "confidence",
      ])) ||
          !["body", "appendix", "other"].includes(String(observation.scope)) ||
          !ALLOWED_LABELS.has(String(observation.label)) ||
          typeof observation.exactQuote !== "string" || !observation.exactQuote.trim() || observation.exactQuote.length > FULL_TEXT_MAX_EVIDENCE_QUOTE_CHARS || !source.text.includes(observation.exactQuote) ||
          typeof observation.reason !== "string" || !observation.reason.trim() || observation.reason.length > 1000 ||
          !["high", "medium", "low"].includes(String(observation.confidence)) ||
          (observation.parentSegmentId !== undefined && !segmentsById.has(String(observation.parentSegmentId))) ||
          (observation.appendixHeadingSegmentId !== undefined && !segmentsById.has(String(observation.appendixHeadingSegmentId)))) {
        valid = false;
        break;
      }
      observations.push({
        sourceSha256: request.sourceSha256,
        sourceGeneration: request.sourceGeneration,
        segmentId: source.id,
        sourceAnchor: source.sourceAnchor,
        exactQuote: observation.exactQuote as string,
        scope: observation.scope as FullTextAiObservation["scope"],
        label: observation.label as string,
        ...(observation.parentSegmentId !== undefined ? { parentSegmentId: observation.parentSegmentId as string } : {}),
        ...(observation.appendixHeadingSegmentId !== undefined ? { appendixHeadingSegmentId: observation.appendixHeadingSegmentId as string } : {}),
        reason: observation.reason as string,
        confidence: observation.confidence as FullTextAiObservation["confidence"],
      });
    }
    if (!valid) { invalidEntry = true; continue; }
    results.push({ segmentId: source.id, status: raw.status as FullTextSegmentReviewResult["status"], observations });
  }
  const failedIds = chunk.primarySegments
    .filter(segment => !seen.has(segment.id) || !results.some(result => result.segmentId === segment.id))
    .map(segment => segment.id);
  return { results, failedIds, ...(invalidEntry ? { reason: "Một hoặc nhiều kết quả AI không hợp lệ hoặc bị lặp; chỉ nhận các đoạn đã xác thực." } : {}) };
}

async function callWithTimeout(
  provider: FullTextAiProvider,
  prompt: string,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<{ result: FullTextAiProviderResult }> {
  const controller = new AbortController();
  const abortParent = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", abortParent, { once: true });
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("Full text chunk timeout"));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([provider(prompt, controller.signal), timeout]);
    if (parentSignal?.aborted) throw new Error("Full text review was cancelled.");
    return { result };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error("AI provider error");
    Object.assign(normalized, { timedOut });
    throw normalized;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    parentSignal?.removeEventListener("abort", abortParent);
  }
}

interface ProcessedChunk {
  chunkResults: FullTextChunkResult[];
  segmentResults: FullTextSegmentReviewResult[];
  attemptedSegmentIds: string[];
  responseReceivedSegmentIds: string[];
}

async function processChunkRecursively(
  request: FullTextReviewRequest,
  chunk: FullTextReviewChunk,
  provider: FullTextAiProvider,
  options: FullTextReviewOptions,
): Promise<ProcessedChunk> {
  if (options.signal?.aborted) throw new Error("Full text review was cancelled.");
  if (chunk.status === "preflight_failed") {
    const failed = chunk.failedSegmentIds || [];
    const result: FullTextChunkResult = {
      chunkId: chunk.chunkId, status: "preflight_failed", primarySegmentIds: failed,
      completedSegmentIds: [], failedSegmentIds: failed, error: chunk.error,
    };
    try { options.onChunkResult?.(result); } catch { /* progress callback is non-authoritative */ }
    return { chunkResults: [result], segmentResults: [], attemptedSegmentIds: [], responseReceivedSegmentIds: [] };
  }

  let response: FullTextAiProviderResult | undefined;
  let problem: unknown;
  let timedOut = false;
  try {
    const called = await callWithTimeout(
      provider,
      buildFullTextSemanticPrompt(request, chunk),
      options.signal,
      Math.max(1000, options.timeoutMs ?? 120_000),
    );
    response = called.result;
  } catch (error: any) {
    problem = error;
    timedOut = Boolean(error?.timedOut);
  }

  if (problem && isContextOverflow(problem) && chunk.primarySegments.length > 1) {
    const middle = Math.ceil(chunk.primarySegments.length / 2);
    const first = chunk.primarySegments.slice(0, middle);
    const second = chunk.primarySegments.slice(middle);
    const child = (suffix: string, primarySegments: FullTextSegment[]): FullTextReviewChunk => ({
      chunkId: chunk.chunkId + "-" + suffix,
      primarySegments,
      contextSegments: chunk.contextSegments,
      status: "ready",
      estimatedInputTokens: 0,
    });
    const children = await Promise.all([
      processChunkRecursively(request, child("a", first), provider, options),
      processChunkRecursively(request, child("b", second), provider, options),
    ]);
    return {
      chunkResults: children.flatMap(item => item.chunkResults),
      segmentResults: children.flatMap(item => item.segmentResults),
      attemptedSegmentIds: children.flatMap(item => item.attemptedSegmentIds),
      responseReceivedSegmentIds: children.flatMap(item => item.responseReceivedSegmentIds),
    };
  }

  const attemptedSegmentIds = chunk.primarySegments.map(segment => segment.id);
  const responseObject = response ? jsonObject(response.text) : null;
  const validated = responseObject
    ? validateChunkResponse(responseObject, request, chunk)
    : { results: [] as FullTextSegmentReviewResult[], failedIds: attemptedSegmentIds, reason: "Phản hồi AI không phải JSON hợp lệ." };
  const completedSegmentIds = validated.results.map(result => result.segmentId);
  const status: FullTextChunkResult["status"] = problem
    ? timedOut ? "timed_out" : "failed"
    : !responseObject ? "invalid_response"
    : validated.failedIds.length === 0 ? "completed"
    : completedSegmentIds.length > 0 ? "partial" : "invalid_response";
  const result: FullTextChunkResult = {
    chunkId: chunk.chunkId,
    status,
    primarySegmentIds: attemptedSegmentIds,
    completedSegmentIds,
    failedSegmentIds: validated.failedIds,
    ...(response?.model ? { model: response.model } : {}),
    ...(status !== "completed" ? { error: problem ? errorText(problem) : validated.reason || "Một số đoạn không có phản hồi hợp lệ." } : {}),
  };
  try { options.onChunkResult?.(result); } catch { /* progress callback is non-authoritative */ }
  return {
    chunkResults: [result],
    segmentResults: validated.results,
    attemptedSegmentIds,
    responseReceivedSegmentIds: responseObject ? completedSegmentIds : [],
  };
}

function validateSynthesis(
  text: string,
  request: FullTextReviewRequest,
  allowedIds: Set<string>,
  chunkBySegment: Map<string, string>,
): { references: FullTextCrossReference[]; valid: boolean } {
  const value = jsonObject(text);
  if (!value || !onlyKeys(value, new Set(["schemaVersion", "sourceSha256", "sourceGeneration", "crossReferences"])) ||
      value.schemaVersion !== FULL_TEXT_REVIEW_SCHEMA_VERSION || value.sourceSha256 !== request.sourceSha256 ||
      value.sourceGeneration !== request.sourceGeneration || !Array.isArray(value.crossReferences)) {
    return { references: [], valid: false };
  }
  const references: FullTextCrossReference[] = [];
  for (const raw of value.crossReferences) {
    if (!isRecord(raw) || !onlyKeys(raw, new Set(["fromSegmentId", "toSegmentId", "relation", "reason"])) ||
        typeof raw.fromSegmentId !== "string" || typeof raw.toSegmentId !== "string" ||
        !allowedIds.has(raw.fromSegmentId) || !allowedIds.has(raw.toSegmentId) ||
        raw.fromSegmentId === raw.toSegmentId ||
        chunkBySegment.get(raw.fromSegmentId) === chunkBySegment.get(raw.toSegmentId) ||
        typeof raw.relation !== "string" || !raw.relation.trim() || raw.relation.length > 120 ||
        typeof raw.reason !== "string" || !raw.reason.trim() || raw.reason.length > 500) {
      return { references: [], valid: false };
    }
    references.push({
      fromSegmentId: raw.fromSegmentId,
      toSegmentId: raw.toSegmentId,
      relation: raw.relation,
      reason: raw.reason,
    });
  }
  return { references, valid: true };
}

async function runSynthesis(
  request: FullTextReviewRequest,
  chunkResults: FullTextChunkResult[],
  segmentResults: FullTextSegmentReviewResult[],
  provider: FullTextAiProvider,
  options: FullTextReviewOptions,
): Promise<FullTextSynthesisResult> {
  const segmentChunk = new Map<string, string>();
  for (const chunk of chunkResults) for (const id of chunk.completedSegmentIds) segmentChunk.set(id, chunk.chunkId);
  const observations = segmentResults.flatMap(result => result.observations.map(observation => ({
    chunkId: segmentChunk.get(result.segmentId) || "unknown",
    segmentId: observation.segmentId,
    sourceAnchor: observation.sourceAnchor,
    exactQuote: observation.exactQuote,
    scope: observation.scope,
    label: observation.label,
    ...(observation.parentSegmentId ? { parentSegmentId: observation.parentSegmentId } : {}),
    ...(observation.appendixHeadingSegmentId ? { appendixHeadingSegmentId: observation.appendixHeadingSegmentId } : {}),
    reason: observation.reason,
    confidence: observation.confidence,
  })));
  const distinctChunks = new Set(observations.map(observation => observation.chunkId));
  if (distinctChunks.size < 2 || observations.length === 0) return { status: "not_needed", crossReferences: [] };

  const segmentById = new Map(request.segments.map(segment => [segment.id, segment]));
  const prompt = buildFullTextSynthesisPrompt({
    request,
    observations,
    segmentOrder: [...new Set(observations.map(observation => observation.segmentId))].map(segmentId => ({
      segmentId,
      documentOrder: segmentById.get(segmentId)?.documentOrder ?? -1,
      sourceAnchor: segmentById.get(segmentId)?.sourceAnchor ?? "",
    })),
  });
  if (prompt.length > MAX_SYNTHESIS_PROMPT_CHARACTERS) {
    const result: FullTextSynthesisResult = {
      status: "omitted_large_input",
      crossReferences: [],
      error: "Tổng hợp liên đoạn vượt ngân sách an toàn; coverage từng đoạn được giữ nguyên.",
    };
    try { options.onSynthesisResult?.(result); } catch { /* callback is non-authoritative */ }
    return result;
  }
  try {
    const { result: response } = await callWithTimeout(
      provider,
      prompt,
      options.signal,
      Math.max(1000, options.timeoutMs ?? 120_000),
    );
    const validated = validateSynthesis(
      response.text,
      request,
      new Set(observations.map(observation => observation.segmentId)),
      segmentChunk,
    );
    const result: FullTextSynthesisResult = validated.valid
      ? { status: "completed", crossReferences: validated.references, ...(response.model ? { model: response.model } : {}) }
      : { status: "invalid_response", crossReferences: [], error: "Phản hồi tổng hợp không hợp lệ; coverage từng đoạn được giữ nguyên." };
    try { options.onSynthesisResult?.(result); } catch { /* callback is non-authoritative */ }
    return result;
  } catch (error: any) {
    const result: FullTextSynthesisResult = {
      status: error?.timedOut ? "timed_out" : "failed",
      crossReferences: [],
      error: errorText(error),
    };
    try { options.onSynthesisResult?.(result); } catch { /* callback is non-authoritative */ }
    return result;
  }
}

export async function reviewFullExtractedText(
  input: unknown,
  provider: FullTextAiProvider,
  options: FullTextReviewOptions = {},
): Promise<{
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
}> {
  const validation = validateFullTextReviewRequest(input);
  if (!validation.valid || !validation.request) {
    const forbidden = validation.reason?.includes("consent riêng");
    throw new FullTextReviewRequestError(validation.reason || "Yêu cầu rà soát toàn văn không hợp lệ.", forbidden ? 403 : 400);
  }
  const request = validation.request;
  const retry = request.retry;
  const selectedIds = retry ? new Set(retry.segmentIds) : undefined;
  const selectedSegments = selectedIds ? request.segments.filter(segment => selectedIds.has(segment.id)) : request.segments;
  const planned = buildFullTextReviewChunks(selectedSegments, options.chunkOptions);
  const processed = await runBoundedTasks(
    planned,
    chunk => processChunkRecursively(request, chunk, provider, options),
    {
      concurrency: options.concurrency ?? (request.provider === "chatgpt" ? 1 : 2),
      signal: options.signal,
    },
  );
  const processedChunks = processed.flatMap(item => item.chunkResults);
  const priorResults = retry?.priorResults ?? [];
  const priorChunk: FullTextChunkResult[] = priorResults.length ? [{
    chunkId: "prior-validated-results", status: "completed",
    primarySegmentIds: priorResults.map(item => item.segmentId),
    completedSegmentIds: priorResults.map(item => item.segmentId), failedSegmentIds: [],
  }] : [];
  const chunks = [...priorChunk, ...processedChunks];
  const results = [...priorResults, ...processed.flatMap(item => item.segmentResults)];
  const attempted = [...new Set([...priorResults.map(item => item.segmentId), ...processed.flatMap(item => item.attemptedSegmentIds)])];
  const responseReceived = [...new Set([...priorResults.map(item => item.segmentId), ...processed.flatMap(item => item.responseReceivedSegmentIds)])];
  const resultById = new Map(results.map(result => [result.segmentId, result]));
  const allIds = request.segments.map(segment => segment.id);
  const failedIds = allIds.filter(id => !resultById.has(id));
  const reviewed = results.filter(result => result.status === "reviewed").map(result => result.segmentId);
  const noFinding = results.filter(result => result.status === "no_finding").map(result => result.segmentId);
  const unsupported = results.filter(result => result.status === "unsupported").map(result => result.segmentId);
  const synthesis = await runSynthesis(request, chunks, results, provider, options);
  const extraction = {
    status: request.extractionCoverage.status,
    totalIncludedSegments: request.extractionCoverage.totalIncludedSegments,
    excludedCount: request.extractionCoverage.excludedCount,
    includedParts: request.extractionCoverage.includedParts,
    partialParts: request.extractionCoverage.partialParts,
    excludedParts: request.extractionCoverage.excludedParts,
  } as const;
  const transferComplete = attempted.length === allIds.length && responseReceived.length === allIds.length;
  const semanticComplete = failedIds.length === 0;
  const failedChunks = chunks.filter(chunk => chunk.status !== "completed");
  const overallComplete = extraction.status === "complete" && transferComplete && semanticComplete;
  const coverage: FullTextReviewCoverage = {
    status: overallComplete ? "complete" : "partial",
    extraction,
    transfer: {
      status: transferComplete ? "complete" : "partial",
      selectedSegmentIds: allIds,
      attemptedSegmentIds: attempted,
      responseReceivedSegmentIds: responseReceived,
      failedSegmentIds: allIds.filter(id => !responseReceived.includes(id)),
    },
    semanticResponse: {
      status: semanticComplete ? "complete" : "partial",
      totalSegmentIds: allIds,
      reviewedSegmentIds: reviewed,
      noFindingSegmentIds: noFinding,
      unsupportedSegmentIds: unsupported,
      failedSegmentIds: failedIds,
    },
    chunks: {
      total: chunks.length,
      completed: chunks.filter(chunk => chunk.status === "completed").length,
      partial: chunks.filter(chunk => chunk.status === "partial").length,
      failed: chunks.filter(chunk => chunk.status !== "completed" && chunk.status !== "partial").length,
      failedChunkIds: failedChunks.map(chunk => chunk.chunkId),
    },
  };
  return {
    schemaVersion: FULL_TEXT_REVIEW_SCHEMA_VERSION,
    requestId: request.requestId,
    provider: request.provider,
    sourceSha256: request.sourceSha256,
    sourceGeneration: request.sourceGeneration,
    manifestSha256: request.manifestSha256,
    coverage,
    chunks,
    results,
    synthesis,
  };
}
