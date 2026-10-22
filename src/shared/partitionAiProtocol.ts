import type { SourceBlock, SourceRegion } from "./schemas/document.schema.ts";

export const PARTITION_AI_SCHEMA_VERSION = 1 as const;

export type PartitionAiProviderKind = "gemini" | "chatgpt";

export type PartitionAiRegime = "administrative" | "party";

export interface PartitionAiCell {
  cellId: string;
  rowIndex: number;
  colIndex: number;
  text: string;
}

export interface PartitionAiBlock {
  id: string;
  index: number;
  kind: SourceBlock["kind"];
  text: string;
  cells?: PartitionAiCell[];
}

export interface PartitionAiRequest {
  schemaVersion: typeof PARTITION_AI_SCHEMA_VERSION;
  consent: true;
  /** Explicit provider selection; an omitted value remains Gemini for older clients. */
  provider?: PartitionAiProviderKind;
  requestId: string;
  regime: PartitionAiRegime;
  sourceGeneration: number;
  partitionRevision: number;
  blocks: PartitionAiBlock[];
}

export interface PartitionAiProposal {
  sourceBlockId: string;
  suggestedRole: SourceRegion;
  fieldKey?: string;
  exactQuote: string;
  cellLocation?: { rowIndex: number; colIndex: number; cellId: string };
  reason: string;
  confidence: "high" | "medium" | "low";
}

export type PartitionAiChunkStatus = "completed" | "failed" | "timed_out" | "invalid_response";

export interface PartitionAiChunkResult {
  chunkIndex: number;
  status: PartitionAiChunkStatus;
  blockIds: string[];
  proposals: PartitionAiProposal[];
  error?: string;
}

export interface PartitionAiResponse {
  schemaVersion: typeof PARTITION_AI_SCHEMA_VERSION;
  provider?: PartitionAiProviderKind;
  requestId: string;
  requestFingerprint: string;
  regime: PartitionAiRegime;
  sourceGeneration: number;
  partitionRevision: number;
  totalBlocks: number;
  aiReviewedBlockIds: string[];
  failedBlockIds: string[];
  chunks: PartitionAiChunkResult[];
  model?: string;
}

export const PARTITION_AI_ROLES: readonly SourceRegion[] = [
  "header", "metadata", "body", "signature", "recipients", "appendix", "separator", "unclassified",
];

function tableModelCellId(block: SourceBlock, rowIndex: number, colIndex: number): string | undefined {
  const row = block.tableModel?.rows.find(candidate => candidate.rowIndex === rowIndex);
  return row?.cells.find(cell => cell.rowIndex === rowIndex && cell.colIndex === colIndex)?.cellId;
}

function fallbackCellId(blockId: string, rowIndex: number, colIndex: number): string {
  return `source-cell:${blockId}:${rowIndex}:${colIndex}`;
}

/** Build the only source shape allowed to cross the AI boundary. */
export function toPartitionAiBlock(block: SourceBlock): PartitionAiBlock {
  const aiBlock: PartitionAiBlock = {
    id: block.id,
    index: block.index,
    kind: block.kind,
    text: block.text,
  };

  if (block.kind === "table") {
    const rows = Array.isArray(block.tableData) ? block.tableData : [];
    aiBlock.cells = rows.flatMap((row, rowIndex) =>
      Array.isArray(row)
        ? row.map((text, colIndex) => ({
            cellId: tableModelCellId(block, rowIndex, colIndex) || fallbackCellId(block.id, rowIndex, colIndex),
            rowIndex,
            colIndex,
            text: typeof text === "string" ? text : "",
          }))
        : [],
    );
  }

  return aiBlock;
}

export function toPartitionAiBlocks(blocks: SourceBlock[]): PartitionAiBlock[] {
  return blocks.map(toPartitionAiBlock);
}

const TOP_LEVEL_KEYS = new Set(["schemaVersion", "consent", "provider", "requestId", "regime", "sourceGeneration", "partitionRevision", "blocks"]);
const BLOCK_KEYS = new Set(["id", "index", "kind", "text", "cells"]);
const CELL_KEYS = new Set(["cellId", "rowIndex", "colIndex", "text"]);
const PROPOSAL_KEYS = new Set(["sourceBlockId", "suggestedRole", "fieldKey", "exactQuote", "cellLocation", "reason", "confidence"]);
const CELL_LOCATION_KEYS = new Set(["rowIndex", "colIndex", "cellId"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

export interface PartitionAiRequestValidation {
  valid: boolean;
  reason?: string;
  request?: PartitionAiRequest;
}

export function validatePartitionAiRequest(value: unknown): PartitionAiRequestValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, TOP_LEVEL_KEYS)) {
    return { valid: false, reason: "Yêu cầu AI có trường ngoài schema hoặc không phải object." };
  }
  if (value.consent !== true) return { valid: false, reason: "Chưa có xác nhận cho phép gửi nguồn lên AI." };
  if (value.provider !== undefined && value.provider !== "gemini" && value.provider !== "chatgpt") {
    return { valid: false, reason: "Nhà cung cấp AI không hợp lệ." };
  }
  if (value.schemaVersion !== PARTITION_AI_SCHEMA_VERSION) return { valid: false, reason: "Phiên bản schema yêu cầu AI không được hỗ trợ." };
  if (value.regime !== "administrative" && value.regime !== "party") return { valid: false, reason: "Hệ thể thức không hợp lệ." };
  if (typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.length > 128) {
    return { valid: false, reason: "Mã yêu cầu AI không hợp lệ." };
  }
  if (!Number.isSafeInteger(value.sourceGeneration) || (value.sourceGeneration as number) < 0 ||
      !Number.isSafeInteger(value.partitionRevision) || (value.partitionRevision as number) < 0) {
    return { valid: false, reason: "Phiên bản nguồn hoặc phân vùng không hợp lệ." };
  }
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > 500) {
    return { valid: false, reason: "Số khối nguồn phải từ 1 đến 500." };
  }

  const ids = new Set<string>();
  for (const rawBlock of value.blocks) {
    if (!isRecord(rawBlock) || !hasOnlyKeys(rawBlock, BLOCK_KEYS)) {
      return { valid: false, reason: "Khối nguồn có trường ngoài schema." };
    }
    if (typeof rawBlock.id !== "string" || !rawBlock.id.trim() || ids.has(rawBlock.id) ||
        !Number.isSafeInteger(rawBlock.index) || (rawBlock.index as number) < 0 ||
        !["paragraph", "table", "section-break"].includes(String(rawBlock.kind)) ||
        typeof rawBlock.text !== "string") {
      return { valid: false, reason: "Khối nguồn thiếu ID, thứ tự, loại hoặc nội dung hợp lệ." };
    }
    ids.add(rawBlock.id);

    if (rawBlock.kind !== "table" && rawBlock.cells !== undefined) {
      return { valid: false, reason: "Chỉ khối bảng mới được chứa danh sách ô." };
    }
    if (rawBlock.kind === "table" && !Array.isArray(rawBlock.cells)) {
      return { valid: false, reason: "Khối bảng phải chứa danh sách ô đã chuẩn hóa." };
    }
    if (Array.isArray(rawBlock.cells)) {
      const cellIds = new Set<string>();
      const coordinates = new Set<string>();
      for (const rawCell of rawBlock.cells) {
        if (!isRecord(rawCell) || !hasOnlyKeys(rawCell, CELL_KEYS) ||
            typeof rawCell.cellId !== "string" || !rawCell.cellId.trim() ||
            !Number.isSafeInteger(rawCell.rowIndex) || (rawCell.rowIndex as number) < 0 ||
            !Number.isSafeInteger(rawCell.colIndex) || (rawCell.colIndex as number) < 0 ||
            typeof rawCell.text !== "string") {
          return { valid: false, reason: "Ô bảng có schema hoặc tọa độ không hợp lệ." };
        }
        const coordinate = `${rawCell.rowIndex}:${rawCell.colIndex}`;
        if (cellIds.has(rawCell.cellId) || coordinates.has(coordinate)) {
          return { valid: false, reason: "ID hoặc tọa độ ô bảng bị trùng." };
        }
        cellIds.add(rawCell.cellId);
        coordinates.add(coordinate);
      }
    }
  }

  return { valid: true, request: value as unknown as PartitionAiRequest };
}

export function validatePartitionAiProposal(
  value: unknown,
  blocks: PartitionAiBlock[],
): PartitionAiProposal | null {
  if (!isRecord(value) || !hasOnlyKeys(value, PROPOSAL_KEYS)) return null;
  const block = blocks.find(candidate => candidate.id === value.sourceBlockId);
  if (!block || typeof value.sourceBlockId !== "string") return null;
  if (!PARTITION_AI_ROLES.includes(value.suggestedRole as SourceRegion)) return null;
  if (typeof value.exactQuote !== "string" || !value.exactQuote.trim() || value.exactQuote !== value.exactQuote.trim()) return null;
  if (typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 1000) return null;
  if (!(value.confidence === "high" || value.confidence === "medium" || value.confidence === "low")) return null;
  if (value.fieldKey !== undefined && (typeof value.fieldKey !== "string" || !value.fieldKey.trim() || value.fieldKey.length > 80)) return null;

  let cellLocation: PartitionAiProposal["cellLocation"];
  if (block.kind === "table") {
    if (!isRecord(value.cellLocation) || !hasOnlyKeys(value.cellLocation, CELL_LOCATION_KEYS)) return null;
    const { rowIndex, colIndex, cellId } = value.cellLocation;
    if (!Number.isSafeInteger(rowIndex) || !Number.isSafeInteger(colIndex) || typeof cellId !== "string") return null;
    const cell = block.cells?.find(candidate =>
      candidate.rowIndex === rowIndex && candidate.colIndex === colIndex && candidate.cellId === cellId,
    );
    if (!cell || !cell.text.includes(value.exactQuote)) return null;
    cellLocation = { rowIndex: rowIndex as number, colIndex: colIndex as number, cellId };
  } else {
    if (value.cellLocation !== undefined || !block.text.includes(value.exactQuote)) return null;
  }

  return {
    sourceBlockId: value.sourceBlockId,
    suggestedRole: value.suggestedRole as SourceRegion,
    fieldKey: value.fieldKey as string | undefined,
    exactQuote: value.exactQuote,
    cellLocation,
    reason: value.reason,
    confidence: value.confidence,
  };
}

export function validatePartitionAiModelResponse(
  value: unknown,
  blocks: PartitionAiBlock[],
): { valid: true; proposals: PartitionAiProposal[] } | { valid: false; reason: string } {
  if (!isRecord(value) || Object.keys(value).some(key => key !== "schemaVersion" && key !== "proposals") ||
      value.schemaVersion !== PARTITION_AI_SCHEMA_VERSION || !Array.isArray(value.proposals)) {
    return { valid: false, reason: "Phản hồi AI không đúng schema phiên bản hóa." };
  }

  const proposals: PartitionAiProposal[] = [];
  const seenBlocks = new Set<string>();
  for (const raw of value.proposals) {
    const validated = validatePartitionAiProposal(raw, blocks);
    if (!validated || seenBlocks.has(validated.sourceBlockId)) {
      return { valid: false, reason: "Phản hồi AI chứa đề xuất sai bằng chứng hoặc trùng khối." };
    }
    seenBlocks.add(validated.sourceBlockId);
    proposals.push(validated);
  }
  return { valid: true, proposals };
}

export function validatePartitionAiResponse(
  value: unknown,
  request: PartitionAiRequest,
): { valid: true; response: PartitionAiResponse } | { valid: false; reason: string } {
  const responseKeys = new Set([
    "schemaVersion", "provider", "requestId", "requestFingerprint", "regime", "sourceGeneration",
    "partitionRevision", "totalBlocks", "aiReviewedBlockIds", "failedBlockIds", "chunks", "model",
  ]);
  const chunkKeys = new Set(["chunkIndex", "status", "blockIds", "proposals", "error"]);
  if (!isRecord(value) || !hasOnlyKeys(value, responseKeys) ||
      value.schemaVersion !== PARTITION_AI_SCHEMA_VERSION || value.requestId !== request.requestId ||
      value.regime !== request.regime || value.sourceGeneration !== request.sourceGeneration ||
      value.partitionRevision !== request.partitionRevision || value.totalBlocks !== request.blocks.length ||
      (value.provider !== undefined && value.provider !== "gemini" && value.provider !== "chatgpt") ||
      (request.provider === "chatgpt" && value.provider !== "chatgpt") ||
      (value.provider !== undefined && value.provider !== (request.provider ?? "gemini")) ||
      typeof value.requestFingerprint !== "string" || !/^[a-f0-9]{16}$/.test(value.requestFingerprint) ||
      !Array.isArray(value.aiReviewedBlockIds) || !Array.isArray(value.failedBlockIds) ||
      !Array.isArray(value.chunks) || (value.model !== undefined && typeof value.model !== "string")) {
    return { valid: false, reason: "Phản hồi máy chủ không khớp schema hoặc phiên nguồn hiện tại." };
  }

  const knownBlocks = new Set(request.blocks.map(block => block.id));
  const seenBlocks = new Set<string>();
  const aiReviewed: string[] = [];
  const failed: string[] = [];
  const chunks: PartitionAiChunkResult[] = [];
  for (let index = 0; index < value.chunks.length; index++) {
    const rawChunk = value.chunks[index];
    if (!isRecord(rawChunk) || !hasOnlyKeys(rawChunk, chunkKeys) || rawChunk.chunkIndex !== index ||
        !["completed", "failed", "timed_out", "invalid_response"].includes(String(rawChunk.status)) ||
        !Array.isArray(rawChunk.blockIds) || !Array.isArray(rawChunk.proposals) ||
        (rawChunk.error !== undefined && typeof rawChunk.error !== "string")) {
      return { valid: false, reason: "Phản hồi có trạng thái lô không hợp lệ." };
    }
    const blockIds = rawChunk.blockIds;
    if (blockIds.length === 0) {
      return { valid: false, reason: "Phản hồi có ID khối thiếu, lạ hoặc trùng." };
    }
    const chunkBlockIds = new Set<string>();
    for (const id of blockIds) {
      if (typeof id !== "string" || !knownBlocks.has(id) || seenBlocks.has(id) || chunkBlockIds.has(id)) {
        return { valid: false, reason: "Phản hồi có ID khối thiếu, lạ hoặc trùng." };
      }
      chunkBlockIds.add(id);
    }
    chunkBlockIds.forEach(id => seenBlocks.add(id));

    const chunkProposals: PartitionAiProposal[] = [];
    for (const rawProposal of rawChunk.proposals) {
      const proposal = validatePartitionAiProposal(rawProposal, request.blocks);
      if (!proposal || !blockIds.includes(proposal.sourceBlockId) || chunkProposals.some(p => p.sourceBlockId === proposal.sourceBlockId)) {
        return { valid: false, reason: "Phản hồi có đề xuất sai bằng chứng hoặc nằm ngoài lô." };
      }
      chunkProposals.push(proposal);
    }

    if (rawChunk.status === "completed") {
      if (rawChunk.error !== undefined) return { valid: false, reason: "Lô thành công không được kèm lỗi." };
      aiReviewed.push(...blockIds as string[]);
    } else {
      if (chunkProposals.length > 0 || typeof rawChunk.error !== "string" || !rawChunk.error.trim()) {
        return { valid: false, reason: "Lô lỗi không được báo đề xuất hoặc thiếu lý do." };
      }
      failed.push(...blockIds as string[]);
    }
    chunks.push({
      chunkIndex: index,
      status: rawChunk.status as PartitionAiChunkStatus,
      blockIds: blockIds as string[],
      proposals: chunkProposals,
      error: rawChunk.error as string | undefined,
    });
  }

  if (seenBlocks.size !== knownBlocks.size ||
      (value.aiReviewedBlockIds as unknown[]).some((id, index) => id !== aiReviewed[index]) ||
      (value.failedBlockIds as unknown[]).some((id, index) => id !== failed[index]) ||
      value.aiReviewedBlockIds.length !== aiReviewed.length || value.failedBlockIds.length !== failed.length) {
    return { valid: false, reason: "Báo cáo coverage không khớp danh sách lô đã xử lý." };
  }

  return {
    valid: true,
    response: {
      schemaVersion: PARTITION_AI_SCHEMA_VERSION,
      ...(value.provider ? { provider: value.provider as PartitionAiProviderKind } : {}),
      requestId: request.requestId,
      requestFingerprint: value.requestFingerprint,
      regime: request.regime,
      sourceGeneration: request.sourceGeneration,
      partitionRevision: request.partitionRevision,
      totalBlocks: request.blocks.length,
      aiReviewedBlockIds: aiReviewed,
      failedBlockIds: failed,
      chunks,
      model: value.model as string | undefined,
    },
  };
}
