/**
 * @file partitionValidation.ts
 * @description Pure shared validation rules for AI & rule-based partition review proposals.
 * Can be safely imported in both Node.js (server) and browser (React) environments without Node built-in dependencies.
 */

import type {
  SourceBlock,
  SourceRegion,
  PartitionProposal,
} from "./schemas/document.schema.ts";
import { toPartitionAiBlock } from "./partitionAiProtocol.ts";
import { embeddedRecipientsSignatureTable } from "./embeddedSignatureTable.ts";

export const VALID_SOURCE_REGIONS: readonly SourceRegion[] = [
  "header",
  "metadata",
  "body",
  "signature",
  "recipients",
  "appendix",
  "separator",
  "unclassified",
] as const;

/**
 * Checks if a block is a table.
 */
export function isTableBlock(block: SourceBlock): boolean {
  return block.kind === "table" || Boolean(block.tableData && block.tableData.length > 0);
}

/**
 * Checks if a table has complex/merged structures or unreliable cell mapping:
 * - gridSpan (isGridSpan: true, or colSpan > 1 in mergedCells)
 * - vMerge (isVMerge: true, or rowSpan > 1 or vMerge in mergedCells)
 * - mergedCells (non-empty mergedCells array)
 * - partiallyPreserved (partiallyPreserved: true)
 * - unreliable cell map:
 *   - missing tableData or empty tableData
 *   - ragged rows (different column lengths across rows)
 *   - tableShape row/col count mismatch with tableData
 *   - mergedCells with coordinates outside tableData bounds
 */
export function hasUntrustedTableStructure(block: SourceBlock): boolean {
  if (!isTableBlock(block)) return false;

  const props = block.tableProperties;

  // 1. Explicit mergedCells
  if (props?.mergedCells && props.mergedCells.length > 0) {
    return true;
  }

  // 2. gridSpan
  if (props?.isGridSpan || props?.mergedCells?.some(m => typeof m.colSpan === "number" && m.colSpan > 1)) {
    return true;
  }

  // 3. vMerge
  if (props?.isVMerge || props?.mergedCells?.some(m => (typeof m.rowSpan === "number" && m.rowSpan > 1) || Boolean(m.vMerge))) {
    return true;
  }

  // 4. partiallyPreserved
  if (props?.partiallyPreserved) {
    return true;
  }

  // 5. Unreliable cell map (bản đồ ô thiếu tin cậy)
  if (!block.tableData || !Array.isArray(block.tableData) || block.tableData.length === 0) {
    return true;
  }

  const numCols = block.tableData[0]?.length;
  if (typeof numCols !== "number" || numCols === 0) {
    return true;
  }

  for (let r = 0; r < block.tableData.length; r++) {
    const row = block.tableData[r];
    if (!Array.isArray(row) || row.length !== numCols) {
      return true; // Ragged row length
    }
  }

  if (block.tableShape) {
    if (block.tableShape.rows !== block.tableData.length) {
      return true;
    }
    if (typeof block.tableShape.columns === "number" && block.tableShape.columns !== numCols) {
      return true;
    }
  }

  return false;
}

/**
 * Validates a single AI proposal against the source blocks and strict constraints.
 * Rejects proposals with nonexistent IDs, invalid regions, non-verbatim quotes, or invalid cell coordinates.
 */
export function validateProposalAgainstSource(
  proposal: any,
  blocksInput: SourceBlock[] | Map<string, SourceBlock>,
  userModifiedInput?: string[] | Set<string>,
  regime: "administrative" | "party" = "administrative"
): PartitionProposal | null {
  if (!proposal || typeof proposal !== "object") return null;

  const blocksById = Array.isArray(blocksInput)
    ? new Map<string, SourceBlock>(blocksInput.map(b => [b.id, b]))
    : blocksInput;

  const userModifiedSet = Array.isArray(userModifiedInput)
    ? new Set<string>(userModifiedInput)
    : (userModifiedInput || new Set<string>());

  const {
    id,
    sourceBlockId,
    suggestedRole,
    fieldKey,
    exactQuote,
    cellLocation,
    reason,
    confidence,
  } = proposal;

  if (typeof sourceBlockId !== "string" || !blocksById.has(sourceBlockId)) {
    return null; // ID does not exist in source blocks
  }

  // Conflict prevention: do not override a block the user has explicitly modified in this session
  if (userModifiedSet.has(sourceBlockId)) {
    return null;
  }

  const sourceBlock = blocksById.get(sourceBlockId)!;
  const currentRole = sourceBlock.role || "unclassified";

  // The cited cell is evidence, not the target of a role mutation. A mixed
  // recipients/signature table cannot safely be moved to either single role.
  if (embeddedRecipientsSignatureTable(sourceBlock) &&
      (suggestedRole === "signature" || suggestedRole === "recipients")) return null;

  // Validate suggestedRole is one of the 8 valid SourceRegion values
  if (!VALID_SOURCE_REGIONS.includes(suggestedRole as SourceRegion)) {
    return null;
  }

  // If suggested role is identical to current role, no change is needed
  if (suggestedRole === currentRole) {
    return null;
  }

  // Exact quote verification: MUST be an exact non-empty substring
  if (typeof exactQuote !== "string" || exactQuote.trim().length === 0) {
    return null;
  }

  const cleanQuote = exactQuote.trim();
  let validatedCellLocation: { rowIndex: number; colIndex: number; cellId?: string } | undefined = undefined;
  let requiresUserVerification = false;

  const hasCellLocation = cellLocation !== undefined && cellLocation !== null;

  if (hasCellLocation) {
    if (typeof cellLocation !== "object") {
      return null;
    }

    const rawRow = cellLocation.rowIndex !== undefined ? cellLocation.rowIndex : cellLocation.row;
    const rawCol = cellLocation.colIndex !== undefined ? cellLocation.colIndex : cellLocation.col;

    // Ràng buộc nghiêm ngặt: chỉ chấp nhận số nguyên không âm (typeof === "number", Number.isInteger, >= 0).
    // Không ép chuỗi, không chấp nhận số thập phân (phân số), số âm, NaN, v.v.
    if (typeof rawRow !== "number" || !Number.isInteger(rawRow) || rawRow < 0) {
      return null;
    }
    if (typeof rawCol !== "number" || !Number.isInteger(rawCol) || rawCol < 0) {
      return null;
    }

    // Khối phải có dữ liệu bảng tableData
    if (!sourceBlock.tableData || !Array.isArray(sourceBlock.tableData)) {
      return null;
    }

    // Tọa độ phải nằm trong giới hạn của tableData
    if (rawRow >= sourceBlock.tableData.length) {
      return null;
    }
    const rowData = sourceBlock.tableData[rawRow];
    if (!Array.isArray(rowData) || rawCol >= rowData.length) {
      return null;
    }

    // exactQuote phải xuất hiện nguyên văn trong ĐÚNG ô được chỉ định.
    // Nếu sai, từ chối proposal; không tìm lại trong ô khác hoặc text chung của bảng.
    const cellText = rowData[rawCol];
    if (typeof cellText !== "string" || !cellText.includes(cleanQuote)) {
      return null;
    }

    const rawCellId = cellLocation.cellId;
    if (rawCellId !== undefined) {
      if (typeof rawCellId !== "string" || !rawCellId.trim()) return null;
      const sourceCell = toPartitionAiBlock(sourceBlock).cells?.find(cell =>
        cell.rowIndex === rawRow && cell.colIndex === rawCol,
      );
      if (!sourceCell || sourceCell.cellId !== rawCellId) return null;
      validatedCellLocation = { rowIndex: rawRow, colIndex: rawCol, cellId: rawCellId };
    } else {
      validatedCellLocation = { rowIndex: rawRow, colIndex: rawCol };
    }

    // Bảng có gridSpan, vMerge, mergedCells, partiallyPreserved hoặc bản đồ ô thiếu tin cậy
    if (hasUntrustedTableStructure(sourceBlock)) {
      requiresUserVerification = true;
    }
  } else {
    // Không có cellLocation
    if (isTableBlock(sourceBlock)) {
      // Proposal cho bảng nhưng không có cellLocation:
      // Chỉ chấp nhận trích dẫn có thật trong dữ liệu nguồn (tableData hoặc text)
      let foundInTable = false;
      if (sourceBlock.tableData && Array.isArray(sourceBlock.tableData)) {
        for (const row of sourceBlock.tableData) {
          if (Array.isArray(row)) {
            for (const cell of row) {
              if (typeof cell === "string" && cell.includes(cleanQuote)) {
                foundInTable = true;
                break;
              }
            }
          }
          if (foundInTable) break;
        }
      }
      if (!foundInTable && typeof sourceBlock.text === "string" && sourceBlock.text.includes(cleanQuote)) {
        foundInTable = true;
      }

      if (!foundInTable) {
        return null; // Trích dẫn không có thật trong dữ liệu nguồn
      }

      // Đánh dấu requiresUserVerification: true vì chưa xác định chắc ô
      requiresUserVerification = true;
    } else {
      // Khối paragraph thông thường
      const blockText = sourceBlock.text || "";
      if (!blockText.includes(cleanQuote)) {
        return null;
      }
    }
  }

  // Determine component group index (1..9) if applicable
  let componentGroupIndex: number | undefined = undefined;
  if (suggestedRole === "header") {
    if (fieldKey === "nationalHeader1" || fieldKey === "nationalHeader2") componentGroupIndex = 1;
    else if (fieldKey === "orgHeader1" || fieldKey === "orgHeader2") componentGroupIndex = 2;
    else if (fieldKey === "referenceNumber") componentGroupIndex = 3;
    else if (fieldKey === "locationAndDate") componentGroupIndex = 4;
  } else if (suggestedRole === "metadata") {
    componentGroupIndex = fieldKey === "locationAndDate" ? 4 : 5; // Địa danh/ngày tháng hoặc tên loại & trích yếu
  } else if (suggestedRole === "body") {
    componentGroupIndex = 6; // Nội dung
  } else if (suggestedRole === "signature") {
    componentGroupIndex = 7; // Chức vụ, họ tên người ký
  } else if (suggestedRole === "recipients") {
    componentGroupIndex = 9; // Nơi nhận
  }

  return {
    id: typeof id === "string" && id ? id : `prop-part-${sourceBlockId}`,
    sourceBlockId,
    currentRole,
    suggestedRole: suggestedRole as SourceRegion,
    fieldKey: typeof fieldKey === "string" && fieldKey ? fieldKey : undefined,
    exactQuote: cleanQuote,
    cellLocation: validatedCellLocation,
    reason: typeof reason === "string" ? reason : "Đề xuất rà soát phân vùng",
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "medium",
    status: "pending",
    regime,
    componentGroupIndex,
    requiresUserVerification: requiresUserVerification ? true : undefined,
  };
}

export interface ProposalValidityCheckResult {
  valid: boolean;
  reason?: string;
}

export interface PartitionProposalContext {
  sourceGeneration: number;
  partitionRevision: number;
}

/**
 * Checks proposal validity immediately before applying it against the current document state.
 * Reports expired/invalid if block was removed, quote changed, role changed, or regime changed.
 */
export function checkProposalValidityBeforeApply(
  proposal: PartitionProposal,
  currentBlocks: SourceBlock[],
  currentRegime: "administrative" | "party",
  userModifiedBlockIds: readonly string[] = [],
  currentContext?: PartitionProposalContext,
): ProposalValidityCheckResult {
  if (!proposal || !proposal.sourceBlockId) {
    return { valid: false, reason: "Đề xuất không hợp lệ" };
  }

  if (userModifiedBlockIds.includes(proposal.sourceBlockId)) {
    return { valid: false, reason: `Khối #${proposal.sourceBlockId} đã được người dùng chỉnh sửa trong phiên này` };
  }

  if (currentContext && proposal.sourceGeneration !== currentContext.sourceGeneration) {
    return { valid: false, reason: "Đề xuất thuộc một thế hệ nguồn khác" };
  }
  if (currentContext && proposal.partitionRevision !== currentContext.partitionRevision) {
    return { valid: false, reason: "Đề xuất thuộc phiên bản phân vùng cũ" };
  }

  // 1. Chế độ thể thức đã thay đổi
  if (proposal.regime && proposal.regime !== currentRegime) {
    return {
      valid: false,
      reason: `Chế độ thể thức đã thay đổi (đề xuất cho "${proposal.regime}", hiện tại là "${currentRegime}")`
    };
  }

  // 2. Block không tồn tại
  const block = currentBlocks.find(b => b.id === proposal.sourceBlockId);
  if (!block) {
    return {
      valid: false,
      reason: `Khối #${proposal.sourceBlockId} không còn tồn tại trong tài liệu`
    };
  }
  if (embeddedRecipientsSignatureTable(block) && (proposal.suggestedRole === 'signature' || proposal.suggestedRole === 'recipients')) {
    return { valid: false, reason: 'Bảng Nơi nhận và chữ ký phải giữ nguyên một bảng trong thân văn bản' };
  }

  // 3. Vai trò đã thay đổi so với khi tạo đề xuất
  const currentRole = block.role || "unclassified";
  if (currentRole === proposal.suggestedRole) {
    return {
      valid: false,
      reason: `Khối #${proposal.sourceBlockId} đã ở vùng "${proposal.suggestedRole}"`
    };
  }
  if (currentRole !== proposal.currentRole) {
    return {
      valid: false,
      reason: `Vùng của khối #${proposal.sourceBlockId} đã thay đổi (hiện tại là "${currentRole}", đề xuất ban đầu dựa trên "${proposal.currentRole}")`
    };
  }

  // 4. Nội dung (exactQuote) không còn khớp
  const cleanQuote = (proposal.exactQuote || "").trim();
  if (!cleanQuote) {
    return {
      valid: false,
      reason: "Trích dẫn trong đề xuất rỗng hoặc không hợp lệ"
    };
  }

  if (proposal.cellLocation) {
    const { rowIndex, colIndex } = proposal.cellLocation;
    if (
      !Number.isInteger(rowIndex) ||
      !Number.isInteger(colIndex) ||
      rowIndex < 0 ||
      colIndex < 0 ||
      !block.tableData ||
      rowIndex >= block.tableData.length ||
      !block.tableData[rowIndex] ||
      colIndex >= block.tableData[rowIndex].length
    ) {
      return {
        valid: false,
        reason: `Tọa độ ô [${rowIndex}, ${colIndex}] không còn hợp lệ trên bảng hiện tại`
      };
    }

    const cellText = block.tableData[rowIndex][colIndex] || "";
    if (!cellText.includes(cleanQuote)) {
      return {
        valid: false,
        reason: `Nội dung ô [${rowIndex}, ${colIndex}] đã thay đổi, không còn chứa trích dẫn "${cleanQuote}"`
      };
    }
    if (proposal.cellLocation.cellId !== undefined) {
      const sourceCell = toPartitionAiBlock(block).cells?.find(cell =>
        cell.rowIndex === rowIndex && cell.colIndex === colIndex,
      );
      if (!sourceCell || sourceCell.cellId !== proposal.cellLocation.cellId) {
        return {
          valid: false,
          reason: `Định danh ô [${rowIndex}, ${colIndex}] không còn khớp với nguồn hiện tại`,
        };
      }
    }
  } else {
    if (isTableBlock(block)) {
      let quoteInTable = false;
      if (block.tableData) {
        for (const r of block.tableData) {
          if (Array.isArray(r)) {
            for (const cell of r) {
              if (typeof cell === "string" && cell.includes(cleanQuote)) {
                quoteInTable = true;
                break;
              }
            }
          }
          if (quoteInTable) break;
        }
      }
      if (!quoteInTable && block.text && block.text.includes(cleanQuote)) {
        quoteInTable = true;
      }
      if (!quoteInTable) {
        return {
          valid: false,
          reason: `Nội dung bảng không còn chứa trích dẫn "${cleanQuote}"`
        };
      }
    } else {
      const text = block.text || "";
      if (!text.includes(cleanQuote)) {
        return {
          valid: false,
          reason: `Nội dung khối không còn chứa trích dẫn "${cleanQuote}"`
        };
      }
    }
  }

  return { valid: true };
}
