import crypto from "node:crypto";
import {
  PARTITION_AI_SCHEMA_VERSION,
  validatePartitionAiModelResponse,
  validatePartitionAiRequest,
  type PartitionAiBlock,
  type PartitionAiChunkResult,
  type PartitionAiRequest,
  type PartitionAiResponse,
} from "../shared/partitionAiProtocol.ts";
import { buildPartitionAiPrompt } from "./aiPartitionReview.ts";

export interface PartitionAiProviderResult {
  text: string;
  model?: string;
}

export type PartitionAiProvider = (prompt: string, signal: AbortSignal) => Promise<PartitionAiProviderResult>;

export class PartitionAiRequestError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PartitionAiRequestError";
    this.statusCode = statusCode;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function fingerprint(request: PartitionAiRequest): string {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ regime: request.regime, blocks: request.blocks }))
    .digest("hex")
    .slice(0, 16);
}

function parseStrictJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeError(error: unknown, timedOut: boolean): string {
  if (timedOut) return "Hết thời gian chờ cho lô này.";
  if (error instanceof Error && /abort/i.test(error.name)) return "Yêu cầu lô này đã bị hủy.";
  return "Dịch vụ AI không hoàn tất lô này.";
}

async function processChunk(
  chunkBlocks: PartitionAiBlock[],
  chunkIndex: number,
  totalChunks: number,
  request: PartitionAiRequest,
  provider: PartitionAiProvider,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<{ result: PartitionAiChunkResult; model?: string }> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("Partition AI chunk timeout"));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      provider(buildPartitionAiPrompt(chunkBlocks, chunkIndex, totalChunks, request.regime), controller.signal),
      timeoutPromise,
    ]);
    if (controller.signal.aborted) {
      return {
        result: {
          chunkIndex,
          status: timedOut ? "timed_out" : "failed",
          blockIds: chunkBlocks.map(block => block.id),
          proposals: [],
          error: safeError(null, timedOut),
        },
      };
    }

    const parsed = parseStrictJson(response.text);
    const validated = parsed === null
      ? { valid: false as const, reason: "Phản hồi AI không phải JSON hợp lệ." }
      : validatePartitionAiModelResponse(parsed, chunkBlocks);
    if (!validated.valid) {
      return {
        model: response.model,
        result: {
          chunkIndex,
          status: "invalid_response",
          blockIds: chunkBlocks.map(block => block.id),
          proposals: [],
          error: validated.reason,
        },
      };
    }
    return {
      model: response.model,
      result: {
        chunkIndex,
        status: "completed",
        blockIds: chunkBlocks.map(block => block.id),
        proposals: validated.proposals,
      },
    };
  } catch (error) {
    return {
      result: {
        chunkIndex,
        status: timedOut ? "timed_out" : "failed",
        blockIds: chunkBlocks.map(block => block.id),
        proposals: [],
        error: safeError(error, timedOut),
      },
    };
  } finally {
    clearTimeout(timeoutHandle!);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

/** Server boundary: validate consent and role-free payload, then report AI coverage per chunk. */
export async function runPartitionAiService(
  input: unknown,
  provider: PartitionAiProvider,
  options: {
    timeoutMs?: number;
    chunkSize?: number;
    concurrency?: number;
    signal?: AbortSignal;
    onChunkResult?: (result: PartitionAiChunkResult) => void;
  } = {},
): Promise<PartitionAiResponse> {
  const validation = validatePartitionAiRequest(input);
  if (!validation.valid || !validation.request) {
    const statusCode = isConsentError(validation.reason) ? 403 : 400;
    throw new PartitionAiRequestError(validation.reason || "Yêu cầu AI không hợp lệ.", statusCode);
  }

  const request = validation.request;
  const grouped = chunk(request.blocks, options.chunkSize ?? 25);
  const chunks: Array<{ result: PartitionAiChunkResult; model?: string } | undefined> = new Array(grouped.length);
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));

  const worker = async () => {
    while (true) {
      if (options.signal?.aborted) return;
      const index = nextIndex++;
      if (index >= grouped.length) return;
      chunks[index] = await processChunk(
        grouped[index], index, grouped.length, request, provider,
        Math.max(1000, options.timeoutMs ?? 30000), options.signal,
      );
      try {
        options.onChunkResult?.(chunks[index]!.result);
      } catch {
        // Progress delivery must never turn a valid chunk into an AI failure.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, grouped.length) }, () => worker()));
  if (options.signal?.aborted) throw new Error("Partition AI request was cancelled.");

  const chunkResults = chunks.map(entry => entry!.result);
  const aiReviewedBlockIds = chunkResults
    .filter(result => result.status === "completed")
    .flatMap(result => result.blockIds);
  const failedBlockIds = chunkResults
    .filter(result => result.status !== "completed")
    .flatMap(result => result.blockIds);
  const model = chunks.map(entry => entry?.model).find(Boolean);

  return {
    schemaVersion: PARTITION_AI_SCHEMA_VERSION,
    requestId: request.requestId,
    requestFingerprint: fingerprint(request),
    regime: request.regime,
    sourceGeneration: request.sourceGeneration,
    partitionRevision: request.partitionRevision,
    totalBlocks: request.blocks.length,
    aiReviewedBlockIds,
    failedBlockIds,
    chunks: chunkResults,
    model,
  };
}

function isConsentError(reason?: string): boolean {
  return Boolean(reason?.includes("xác nhận cho phép"));
}
