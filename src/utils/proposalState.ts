/**
 * @file proposalState.ts
 * @description Quản lý trạng thái đề xuất AI và đồng bộ một nguồn chân lý (Single Source of Truth)
 * cho chu trình: Phân vùng lại -> Áp dụng đề xuất -> Soạn thảo -> Xuất bản Word -> Kiểm chứng Gate.
 * 
 * TUÂN THỦ NGHIÊM NGẶT:
 * 1. Không mutate trực tiếp state React.
 * 2. Không đánh dấu đã áp dụng trước khi kiểm tra tính hợp lệ của original text.
 * 3. Hỗ trợ áp dụng tuần tự (sequential fold) tránh xung đột khi sửa nhiều chỗ cùng 1 block.
 */

import type { 
  SourceBlock, 
  StructuredImport, 
  ReviewProposal,
  DocumentState,
  SourceRegion,
  AppendixDocument
} from "../shared/schemas/document.schema.ts";
import { reconcileRunsWithNewText } from "./tableFormatUtils.ts";
import { tableModelToHtmlView } from "../shared/tableModel.ts";

export interface ReviewProposalBatchContext {
  sourceGeneration: number;
  standardType: "state" | "party";
  partitionRevision: number;
  partitionFingerprint?: string;
}

/**
 * S1-F01 (tái audit 20/10/2026): ngữ cảnh của đề xuất "AI tinh chỉnh"
 * (`/api/ai/refine-text`). Kênh này ghi đè **toàn bộ** `bodyHtml` nên phải
 * ràng buộc chặt hơn kênh đề xuất rà soát: đề xuất chỉ được hiện và áp dụng
 * cho đúng thế hệ nguồn, đúng thể thức, đúng revision phân vùng và đúng
 * mã băm nguồn mà nó được tạo ra.
 */
export interface RefineProposalContext {
  sourceGeneration: number;
  standardType: "state" | "party";
  partitionRevision: number;
  sourceHash: string;
}

/**
 * Kiểm tra ngữ cảnh đề xuất tinh chỉnh còn hiệu lực hay không.
 * Trả `false` khi ngữ cảnh thiếu, khi thế hệ nguồn / thể thức / revision phân
 * vùng đã đổi, hoặc khi mã băm nguồn không còn khớp (người dùng đã đổi nguồn
 * sang tệp khác, kể cả cùng bytes).
 */
export function isRefineProposalContextValid(
  proposalContext: RefineProposalContext | null | undefined,
  currentContext: RefineProposalContext
): boolean {
  if (!proposalContext) return false;
  return (
    proposalContext.sourceGeneration === currentContext.sourceGeneration &&
    proposalContext.standardType === currentContext.standardType &&
    proposalContext.partitionRevision === currentContext.partitionRevision &&
    proposalContext.sourceHash === currentContext.sourceHash
  );
}

export function computePartitionFingerprint(blocks: SourceBlock[]): string {
  if (!blocks || blocks.length === 0) return "";
  return blocks.map(b => `${b.id}:${b.role || "unclassified"}`).join(";");
}

export function isReviewProposalBatchValid(
  batchContext: ReviewProposalBatchContext | null | undefined,
  currentContext: ReviewProposalBatchContext
): boolean {
  if (!batchContext) return false;
  return (
    batchContext.sourceGeneration === currentContext.sourceGeneration &&
    batchContext.standardType === currentContext.standardType &&
    batchContext.partitionRevision === currentContext.partitionRevision
  );
}

export interface CanonicalWorkflowState {
  reviewBlocks: SourceBlock[];
  structuredImport?: StructuredImport | null;
  doc: DocumentState;
  acceptedProposalIds: Set<string>;
  proposalBatchContext?: ReviewProposalBatchContext | null;
  currentContext?: ReviewProposalBatchContext;
}

export interface ProposalApplyResult {
  success: boolean;
  reason?: string;
  nextState?: CanonicalWorkflowState;
}

/**
 * Đổi vai trò phân vùng của một khối và cập nhật đồng bộ cả blocks lẫn manifest
 */
export function changeBlockRole(
  blocks: SourceBlock[],
  blockId: string,
  newRole: SourceRegion,
  structuredImport?: StructuredImport | null
): { nextBlocks: SourceBlock[]; nextImport?: StructuredImport | null } {
  const nextBlocks = blocks.map(b => b.id === blockId ? { ...b, role: newRole } : b);
  
  let nextImport: StructuredImport | null = null;
  if (structuredImport) {
    nextImport = {
      ...structuredImport,
      blocks: nextBlocks,
      // Source inventory is immutable provenance. Export policy must account for
      // role tables explicitly instead of deleting IDs to make the gate pass.
      importFidelityManifest: structuredImport.importFidelityManifest,
    };
  }

  return { nextBlocks, nextImport };
}

/**
 * Tách một chuỗi HTML thành mảng các khối phần tử cấp cao nhất (top-level elements)
 */
export function splitTopLevelHtml(html: string): string[] {
  if (!html) return [];
  const blocks: string[] = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9]+)(?:\s+[^>]*)?(\/)?>/g;
  let depth = 0;
  let lastIndex = 0;
  let blockStart = 0;
  let match: RegExpExecArray | null;
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "meta", "link", "param", "source", "track", "wbr"]);

  while ((match = tagRegex.exec(html)) !== null) {
    const isClosing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    // The attribute matcher may consume the slash before the optional capture.
    // Inspect the complete token so <col ... /> cannot swallow later tables.
    const isSelfClosing = Boolean(match[3]) || /\/\s*>$/.test(match[0]) || voidTags.has(tagName);

    if (depth === 0) {
      if (match.index > lastIndex) {
        const textBefore = html.slice(lastIndex, match.index);
        if (textBefore.trim()) blocks.push(textBefore);
      }
      blockStart = match.index;
    }

    if (!isSelfClosing) {
      if (isClosing) depth = Math.max(0, depth - 1);
      else depth++;
    }

    if (depth === 0) {
      blocks.push(html.slice(blockStart, tagRegex.lastIndex));
      lastIndex = tagRegex.lastIndex;
    }
  }

  if (lastIndex < html.length) {
    const rem = html.slice(lastIndex);
    if (rem.trim()) blocks.push(rem);
  }

  return blocks;
}

export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/**
 * Tìm chỉ số khối tương ứng trong topBlocks của doc.bodyHtml cho targetBlock
 * Sử dụng căn chỉnh chuỗi (Sequence Alignment) kết hợp định danh ID và nội dung văn bản.
 */
function alignTargetBlockToTopBlocks(
  bodyBlocks: SourceBlock[],
  targetBlock: SourceBlock,
  topBlocks: string[],
  proposalOriginal?: string
): number {
  if (topBlocks.length === 0) return -1;

  // 1. Đối chiếu theo ID thuộc tính rõ ràng (data-block-id hoặc data-source-table-id)
  const targetTableId = targetBlock.tableModel?.tableId;
  for (let j = 0; j < topBlocks.length; j++) {
    const tb = topBlocks[j];
    const blockIdMatch = tb.match(/data-block-id\s*=\s*["']([^"']+)["']/i);
    if (blockIdMatch && blockIdMatch[1] === targetBlock.id) {
      return j;
    }
    if (targetTableId) {
      const tableIdMatch = tb.match(/data-source-table-id\s*=\s*["']([^"']+)["']/i);
      if (tableIdMatch && tableIdMatch[1] === targetTableId) {
        return j;
      }
    }
  }

  const targetBodyIdx = bodyBlocks.findIndex(b => b.id === targetBlock.id);
  if (targetBodyIdx === -1) return -1;

  // 2. Đối chiếu theo nội dung văn bản đặc trưng nếu là duy nhất (Unique exact text / HTML match)
  const targetText = (targetBlock.text || "").trim();
  const targetHtml = (targetBlock.html || "").trim();

  if (targetHtml) {
    const exactHtmlMatches: number[] = [];
    topBlocks.forEach((tb, idx) => {
      if (tb.trim() === targetHtml) {
        exactHtmlMatches.push(idx);
      }
    });
    if (exactHtmlMatches.length === 1) {
      return exactHtmlMatches[0];
    }
  }

  if (targetText) {
    const exactTextMatches: number[] = [];
    topBlocks.forEach((tb, idx) => {
      if (stripTags(tb).trim() === targetText) {
        exactTextMatches.push(idx);
      }
    });
    if (exactTextMatches.length === 1) {
      return exactTextMatches[0];
    }
    if (exactTextMatches.length > 1) {
      // Xác định thứ tự xuất hiện của targetBlock trong số các khối có cùng nội dung ở bodyBlocks
      let occurrenceIdx = 0;
      for (const b of bodyBlocks) {
        if (b.id === targetBlock.id) break;
        if ((b.text || "").trim() === targetText) {
          occurrenceIdx++;
        }
      }
      if (occurrenceIdx < exactTextMatches.length) {
        return exactTextMatches[occurrenceIdx];
      }
    }
  }

  // 3. Đối chiếu theo quan hệ chứa (Containment match) nếu chỉ có đúng 1 khối khớp
  if (targetText) {
    const containmentMatches: number[] = [];
    topBlocks.forEach((tb, idx) => {
      const tbText = stripTags(tb).trim();
      if (tbText && (tbText.includes(targetText) || targetText.includes(tbText))) {
        containmentMatches.push(idx);
      }
    });
    if (containmentMatches.length === 1) {
      return containmentMatches[0];
    }
  }

  // 4. Nếu có proposalOriginal, kiểm tra xem có đúng 1 khối chứa proposalOriginal không
  if (proposalOriginal) {
    const originalMatches: number[] = [];
    topBlocks.forEach((tb, idx) => {
      if (stripTags(tb).includes(proposalOriginal) || tb.includes(proposalOriginal)) {
        originalMatches.push(idx);
      }
    });
    if (originalMatches.length === 1) {
      return originalMatches[0];
    }
  }

  // 5. Nếu mơ hồ hoặc không tìm thấy anchor tin cậy, từ chối thay vì suy đoán sai vị trí
  return -1;
}

/**
 * Thay thế nội dung chữ trong HTML ngay cả khi chuỗi chữ bị phân tách bởi các thẻ định dạng
 * (ví dụ: <strong>SA</strong>ME -> <strong>EDIT</strong>).
 * Không bao giờ thay thế giá trị thuộc tính HTML (ví dụ: title="SAME").
 */
export function replaceTextInHtml(html: string, original: string, suggested: string): string {
  if (!html || !original) return html;

  const tokenRegex = /(<[^>]+>)|([^<]+)/g;
  let match: RegExpExecArray | null;
  const tokens: Array<{ type: "tag" | "text"; raw: string }> = [];
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1]) {
      tokens.push({ type: "tag", raw: match[1] });
    } else {
      tokens.push({ type: "text", raw: match[2] });
    }
  }

  let fullText = "";
  const charMap: Array<{ tokenIndex: number; charIndex: number }> = [];
  tokens.forEach((tok, tIdx) => {
    if (tok.type === "text") {
      for (let c = 0; c < tok.raw.length; c++) {
        charMap.push({ tokenIndex: tIdx, charIndex: c });
        fullText += tok.raw[c];
      }
    }
  });

  const foundIdx = fullText.indexOf(original);
  if (foundIdx === -1) return html;

  const startMap = charMap[foundIdx];
  const endMap = charMap[foundIdx + original.length - 1];

  if (startMap.tokenIndex === endMap.tokenIndex) {
    const t = tokens[startMap.tokenIndex];
    t.raw = t.raw.slice(0, startMap.charIndex) + suggested + t.raw.slice(endMap.charIndex + 1);
  } else {
    const firstTok = tokens[startMap.tokenIndex];
    firstTok.raw = firstTok.raw.slice(0, startMap.charIndex) + suggested;
    for (let i = startMap.tokenIndex + 1; i < endMap.tokenIndex; i++) {
      if (tokens[i].type === "text") {
        tokens[i].raw = "";
      }
    }
    const lastTok = tokens[endMap.tokenIndex];
    lastTok.raw = lastTok.raw.slice(endMap.charIndex + 1);
  }

  return tokens.map(t => t.raw).join("");
}

/**
 * Áp dụng một đề xuất (ReviewProposal) theo mô hình bất biến thuần túy (pure immutable update).
 * Kiểm tra tính hợp lệ của đề xuất:
 * - targetBlockId tồn tại trong reviewBlocks.
 * - original text tồn tại trong khối (hoặc ô bảng tương ứng).
 * - nếu đề xuất đã hết hiệu lực hoặc mơ hồ -> từ chối với lý do rõ ràng.
 */
export function applySingleProposal(
  proposal: ReviewProposal,
  currentState: CanonicalWorkflowState
): ProposalApplyResult {
  const { reviewBlocks, structuredImport, doc, acceptedProposalIds, proposalBatchContext, currentContext } = currentState;

  if (proposalBatchContext && currentContext) {
    if (!isReviewProposalBatchValid(proposalBatchContext, currentContext)) {
      return {
        success: false,
        reason: "Đề xuất đã hết hiệu lực do thể thức, nguồn hoặc phân vùng tài liệu đã thay đổi.",
      };
    }
  }

  if (acceptedProposalIds.has(proposal.id)) {
    return {
      success: false,
      reason: `Đề xuất "${proposal.id}" đã được áp dụng trước đó.`,
    };
  }

  // 1. Nếu đề xuất nhắm tới trường metadata (fields)
  if (proposal.target && ((structuredImport?.fields && proposal.target in structuredImport.fields) || (proposal.target in doc))) {
    const docVal = (doc as any)[proposal.target];
    const currentFieldValue = (docVal !== undefined && docVal !== null)
      ? String(docVal)
      : String((structuredImport?.fields as any)?.[proposal.target]?.value || "");

    if (proposal.original && currentFieldValue !== proposal.original && !currentFieldValue.includes(proposal.original)) {
      return {
        success: false,
        reason: `Giá trị trường "${proposal.target}" hiện tại ("${currentFieldValue}") không còn khớp với giá trị gốc của đề xuất ("${proposal.original}").`,
      };
    }

    const nextImport: StructuredImport | undefined | null = structuredImport ? {
      ...structuredImport,
      fields: structuredImport.fields ? {
        ...structuredImport.fields,
        [proposal.target]: {
          ...(structuredImport.fields as any)[proposal.target],
          value: proposal.suggested,
          status: "user_confirmed",
        },
      } : structuredImport.fields,
    } : structuredImport;

    const nextDoc: DocumentState = {
      ...doc,
      [proposal.target]: proposal.suggested,
    };

    const nextAccepted = new Set(acceptedProposalIds).add(proposal.id);

    return {
      success: true,
      nextState: {
        reviewBlocks,
        structuredImport: nextImport,
        doc: nextDoc,
        acceptedProposalIds: nextAccepted,
        proposalBatchContext,
        currentContext,
      },
    };
  }

  // 2. Nếu đề xuất nhắm tới một khối cụ thể (targetBlockId)
  if (proposal.targetBlockId) {
    const blockIndex = reviewBlocks.findIndex(b => b.id === proposal.targetBlockId);
    if (blockIndex === -1) {
      return {
        success: false,
        reason: `Khối dữ liệu nguồn "${proposal.targetBlockId}" không còn tồn tại trong tài liệu.`,
      };
    }

    const targetBlock = reviewBlocks[blockIndex];
    const suggestedForHtml = escapeHtml(proposal.suggested);

    // Đối chiếu tính hợp lệ của proposal.original trong reviewBlocks
    if (proposal.cellIndex && (targetBlock.tableModel || targetBlock.tableData)) {
      const { row, col } = proposal.cellIndex;
      const cellText = targetBlock.tableModel?.rows?.[row]?.cells?.[col]?.text || targetBlock.tableData?.[row]?.[col] || "";
      if (proposal.original && !cellText.includes(proposal.original)) {
        return {
          success: false,
          reason: `Nội dung gốc "${proposal.original}" không còn tồn tại trong ô [hàng ${row + 1}, cột ${col + 1}]. Đề xuất đã hết hiệu lực.`,
        };
      }
    } else {
      const blockText = targetBlock.text || "";
      if (proposal.original && !blockText.includes(proposal.original)) {
        return {
          success: false,
          reason: `Nội dung gốc "${proposal.original}" không còn tồn tại trong khối "${targetBlock.id}". Đề xuất đã hết hiệu lực.`,
        };
      }
    }

    // Đối chiếu tính hợp lệ trên nội dung văn bản hiện hành (doc.bodyHtml)
    const bodyBlocks = reviewBlocks.filter(b => b.role === "body");
    const topBlocks = splitTopLevelHtml(doc.bodyHtml || "");
    let targetTopIdx = -1;

    if (targetBlock.role === "body" && topBlocks.length > 0) {
      targetTopIdx = alignTargetBlockToTopBlocks(bodyBlocks, targetBlock, topBlocks, proposal.original);
      if (targetTopIdx === -1) {
        return {
          success: false,
          reason: `Khối dữ liệu nguồn "${targetBlock.id}" không còn tồn tại trong nội dung văn bản. Đề xuất đã hết hiệu lực.`,
        };
      }

      const currentTargetHtml = topBlocks[targetTopIdx];
      if (proposal.original) {
        const textInTarget = stripTags(currentTargetHtml);
        if (!textInTarget.includes(proposal.original) && !currentTargetHtml.includes(proposal.original)) {
          return {
            success: false,
            reason: `Nội dung khối mục tiêu "${targetBlock.id}" trong văn bản đã thay đổi và không còn chứa "${proposal.original}". Đề xuất đã hết hiệu lực.`,
          };
        }
      }
    }

    // Nhân bản bất biến targetBlock và áp dụng thay đổi
    const updatedBlock: SourceBlock = JSON.parse(JSON.stringify(targetBlock));

    if (proposal.cellIndex && (updatedBlock.tableModel || updatedBlock.tableData)) {
      const { row, col } = proposal.cellIndex;
      if (updatedBlock.tableData && updatedBlock.tableData[row] && updatedBlock.tableData[row][col]) {
        updatedBlock.tableData[row][col] = updatedBlock.tableData[row][col].replace(proposal.original, proposal.suggested);
      }
      if (updatedBlock.tableModel) {
        const cell = updatedBlock.tableModel.rows?.[row]?.cells?.[col];
        if (cell) {
          cell.text = cell.text.replace(proposal.original, proposal.suggested);
          if (cell.paragraphs && cell.paragraphs.length > 0) {
            for (const p of cell.paragraphs) {
              if (p.text.includes(proposal.original)) {
                p.text = p.text.replace(proposal.original, proposal.suggested);
                if (p.runs && p.runs.length > 0) {
                  p.runs = reconcileRunsWithNewText(p.runs, p.text);
                }
                break; // Chỉ thay thế đúng 1 lần xuất hiện tương ứng với cell.text!
              }
            }
          }
        }
        // Tái tạo lại HTML của bảng từ chính TableModel để đảm bảo đúng ô data-cell-id
        updatedBlock.html = tableModelToHtmlView(updatedBlock.tableModel);
      } else if (updatedBlock.html && proposal.original) {
        updatedBlock.html = replaceTextInHtml(updatedBlock.html, proposal.original, suggestedForHtml);
      }

      if (updatedBlock.text && proposal.original) {
        updatedBlock.text = updatedBlock.text.replace(proposal.original, proposal.suggested);
      }
    } else {
      // Khối đoạn văn thông thường
      if (updatedBlock.text && proposal.original) {
        updatedBlock.text = updatedBlock.text.replace(proposal.original, proposal.suggested);
      }
      if (updatedBlock.html && proposal.original) {
        updatedBlock.html = replaceTextInHtml(updatedBlock.html, proposal.original, suggestedForHtml);
      }
    }

    // Cập nhật doc.bodyHtml và doc.appendices
    let nextDoc = { ...doc };
    if (targetBlock.role === "body") {
      if (topBlocks.length > 0) {
        if (targetTopIdx !== -1 && targetTopIdx < topBlocks.length) {
          topBlocks[targetTopIdx] = replaceTextInHtml(topBlocks[targetTopIdx], proposal.original, suggestedForHtml);
          nextDoc.bodyHtml = topBlocks.join("");
          if (!proposal.cellIndex) {
            updatedBlock.html = topBlocks[targetTopIdx];
            updatedBlock.text = stripTags(topBlocks[targetTopIdx]);
          }
        }
      }
    }

    const nextReviewBlocks = [
      ...reviewBlocks.slice(0, blockIndex),
      updatedBlock,
      ...reviewBlocks.slice(blockIndex + 1),
    ];

    if (targetBlock.role === "body" && !nextDoc.bodyHtml) {
      nextDoc.bodyHtml = nextReviewBlocks
        .filter(b => b.role === "body")
        .map(b => b.html || `<p>${b.text}</p>`)
        .join("");
    } else if (targetBlock.role === "appendix" && nextDoc.appendices) {
      nextDoc.appendices = nextDoc.appendices.map((app: AppendixDocument) => {
        const isTargetApp =
          (app.sourceBlockIds && app.sourceBlockIds.includes(targetBlock.id)) ||
          (app.blocks && app.blocks.some(b => b.id === targetBlock.id)) ||
          ((!app.sourceBlockIds || app.sourceBlockIds.length === 0) && (!app.blocks || app.blocks.length === 0) && nextDoc.appendices!.length === 1);

        if (!isTargetApp) {
          return app;
        }

        const nextAppBlocks = app.blocks && app.blocks.length > 0
          ? app.blocks.map(b => b.id === targetBlock.id ? updatedBlock : b)
          : app.blocks;

        const nextHtml = nextAppBlocks && nextAppBlocks.length > 0
          ? nextAppBlocks.map(b => b.html || `<p>${b.text}</p>`).join("")
          : (app.html && proposal.original ? replaceTextInHtml(app.html, proposal.original, suggestedForHtml) : app.html);

        return {
          ...app,
          blocks: nextAppBlocks,
          html: nextHtml,
        };
      });
    }

    // Cập nhật structuredImport
    let nextStructuredImport = structuredImport ? {
      ...structuredImport,
      blocks: nextReviewBlocks,
      body: {
        ...structuredImport.body,
        html: nextDoc.bodyHtml,
      },
      appendices: (targetBlock.role === "appendix" && structuredImport.appendices) ? structuredImport.appendices.map((app: AppendixDocument) => {
        const isTargetApp =
          (app.sourceBlockIds && app.sourceBlockIds.includes(targetBlock.id)) ||
          (app.blocks && app.blocks.some(b => b.id === targetBlock.id)) ||
          ((!app.sourceBlockIds || app.sourceBlockIds.length === 0) && (!app.blocks || app.blocks.length === 0) && structuredImport.appendices!.length === 1);

        if (!isTargetApp) {
          return app;
        }

        const nextAppBlocks = app.blocks && app.blocks.length > 0
          ? app.blocks.map(b => b.id === targetBlock.id ? updatedBlock : b)
          : app.blocks;

        const nextHtml = nextAppBlocks && nextAppBlocks.length > 0
          ? nextAppBlocks.map(b => b.html || `<p>${b.text}</p>`).join("")
          : (app.html && proposal.original ? replaceTextInHtml(app.html, proposal.original, proposal.suggested) : app.html);

        return {
          ...app,
          blocks: nextAppBlocks,
          html: nextHtml,
        };
      }) : structuredImport.appendices,
    } : structuredImport;

    const nextAccepted = new Set(acceptedProposalIds).add(proposal.id);

    return {
      success: true,
      nextState: {
        reviewBlocks: nextReviewBlocks,
        structuredImport: nextStructuredImport,
        doc: nextDoc,
        acceptedProposalIds: nextAccepted,
        proposalBatchContext,
        currentContext,
      },
    };
  }

  // 3. Fallback cho đề xuất không có targetBlockId nhưng có original text trong doc.bodyHtml
  if (proposal.original && proposal.suggested) {
    if (!doc.bodyHtml.includes(proposal.original) && !doc.bodyHtml.replace(/<[^>]+>/g, "").includes(proposal.original)) {
      return {
        success: false,
        reason: `Nội dung gốc "${proposal.original}" không còn tồn tại trong thân bài văn bản.`,
      };
    }

    const nextBodyHtml = replaceTextInHtml(doc.bodyHtml, proposal.original, proposal.suggested);
    const nextDoc: DocumentState = {
      ...doc,
      bodyHtml: nextBodyHtml,
    };

    const nextAccepted = new Set(acceptedProposalIds).add(proposal.id);

    return {
      success: true,
      nextState: {
        reviewBlocks,
        structuredImport,
        doc: nextDoc,
        acceptedProposalIds: nextAccepted,
        proposalBatchContext,
        currentContext,
      },
    };
  }


  return {
    success: false,
    reason: "Đề xuất thiếu thông tin mục tiêu (target/targetBlockId/original).",
  };
}

/**
 * Áp dụng tuần tự danh sách đề xuất trên trạng thái mới nhất, tránh ghi đè lẫn nhau.
 */
export function applyAllProposalsSequentially(
  proposals: ReviewProposal[],
  initialState: CanonicalWorkflowState
): {
  finalState: CanonicalWorkflowState;
  appliedCount: number;
  rejectedReasons: string[];
} {
  if (initialState.proposalBatchContext && initialState.currentContext) {
    if (!isReviewProposalBatchValid(initialState.proposalBatchContext, initialState.currentContext)) {
      return {
        finalState: initialState,
        appliedCount: 0,
        rejectedReasons: ["Đề xuất đã hết hiệu lực do thể thức, nguồn hoặc phân vùng tài liệu đã thay đổi."],
      };
    }
  }
  let state = initialState;
  let appliedCount = 0;
  const rejectedReasons: string[] = [];

  for (const p of proposals) {
    if (state.acceptedProposalIds.has(p.id)) continue;
    const result = applySingleProposal(p, state);
    if (result.success && result.nextState) {
      state = result.nextState;
      appliedCount++;
    } else if (result.reason) {
      rejectedReasons.push(`${p.label || p.id}: ${result.reason}`);
    }
  }

  return {
    finalState: state,
    appliedCount,
    rejectedReasons,
  };
}
