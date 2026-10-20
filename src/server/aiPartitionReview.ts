/**
 * @file aiPartitionReview.ts
 * @description Dedicated AI-assisted partition review and structural component analysis.
 * Adheres strictly to Zero Data Loss: AI only suggests role reassignments and field mapping proposals.
 * Never modifies source text, html, tableData, block IDs, order, or original files.
 */

import crypto from "node:crypto";
import type { 
  SourceBlock, 
  SourceRegion, 
  PartitionProposal, 
  PartitionCheckResult 
} from "../shared/schemas/document.schema.ts";
import {
  toPartitionAiBlocks,
  type PartitionAiBlock,
} from "../shared/partitionAiProtocol.ts";

export {
  VALID_SOURCE_REGIONS,
  isTableBlock,
  hasUntrustedTableStructure,
  validateProposalAgainstSource,
} from "../shared/partitionValidation.ts";
export { analyzePartitionFallback } from "../shared/partitionFallback.ts";

export interface PartitionRequestPayload {
  blocks: SourceBlock[];
  regime: "administrative" | "party";
  filename?: string;
  userModifiedBlockIds?: string[];
  requestFingerprint?: string;
  mode?: "ai" | "local_only";
}

/**
 * Creates a deterministic fingerprint of the blocks and regime at the time of request.
 * Used to detect if the user has changed roles, switched regime, or uploaded another file
 * before the AI response returns.
 */
export function createPartitionFingerprint(
  blocks: SourceBlock[], 
  regime: "administrative" | "party", 
  _filename = ""
): string {
  const safeBlocks = toPartitionAiBlocks(blocks);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ regime, blocks: safeBlocks }))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Chunks blocks into manageable ordered batches for Gemini API.
 * Ensures long documents are NOT truncated at 15k or 20k characters silently.
 */
export function chunkBlocksForAnalysis(
  blocks: SourceBlock[], 
  maxBlocksPerChunk = 25
): SourceBlock[][] {
  if (blocks.length === 0) return [];
  const chunks: SourceBlock[][] = [];
  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk));
  }
  return chunks;
}

/**
 * Builds the structured prompt for a chunk of blocks sent to Gemini.
 */
export function buildPartitionPrompt(
  chunk: SourceBlock[],
  chunkIndex: number,
  totalChunks: number,
  regime: "administrative" | "party"
): string {
  return buildPartitionAiPrompt(toPartitionAiBlocks(chunk), chunkIndex, totalChunks, regime);
}

export function buildPartitionAiPrompt(
  blockManifest: PartitionAiBlock[],
  chunkIndex: number,
  totalChunks: number,
  regime: "administrative" | "party"
): string {
  const regimeDesc = regime === "party"
    ? "Hướng dẫn số 05-HD/VPTW về thể thức văn bản Đảng (Tiêu đề: ĐẢNG CỘNG SẢN VIỆT NAM, không tiêu ngữ, dấu hoa thị cơ quan, dấu gạch nối '-----' dưới trích yếu, chữ ký chức danh)."
    : "Nghị định số 30/2020/NĐ-CP về thể thức văn bản hành chính (Quốc hiệu: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM, Tiêu ngữ: Độc lập - Tự do - Hạnh phúc, đường kẻ cơ quan 1/3-1/2, chữ ký và nơi nhận).";

  return `
Bạn là chuyên gia kiểm định phân vùng tài liệu hành chính và văn bản Đảng Việt Nam theo ${regimeDesc}.
Đang xử lý cụm ${chunkIndex + 1}/${totalChunks} (gồm ${blockManifest.length} khối).

8 VÙNG PHÂN LOẠI KHỐI (SourceRegion) HỢP LỆ:
1. "header": Quốc hiệu/Tiêu đề, Tiêu ngữ, Cơ quan ban hành, Số ký hiệu, Địa danh ngày tháng ở đầu trang.
2. "metadata": Tên loại văn bản (QUYẾT ĐỊNH, KẾ HOẠCH, BIÊN BẢN...) và trích yếu nội dung.
3. "body": Toàn bộ căn cứ, điều khoản, bảng số liệu công việc, tiến độ thực hiện trong thân bài.
4. "signature": Khối chức vụ, họ tên người ký ở cuối văn bản (hoặc bảng 2-3 cột chức vụ người ký).
5. "recipients": Nơi nhận văn bản, danh sách gửi và lưu trữ.
6. "appendix": Phụ lục, bảng đính kèm sau khối ký.
7. "separator": Dòng phân cách (ví dụ 5 dấu gạch nối '-----' của HD05 dưới trích yếu, hoặc dòng kẻ phân định rỗng).
8. "unclassified": Khối chưa đủ căn cứ phân loại.

RÀNG BUỘC AN TOÀN TUYỆT ĐỐI (ZERO DATA LOSS):
- TUYỆT ĐỐI KHÔNG sửa nội dung text, html, tableData, id, thứ tự khối.
- Phân loại độc lập; không có vai trò parser hiện tại. Chỉ dùng nguyên văn nội dung nguồn bên dưới.
- CHỈ đề xuất thay đổi role nếu có bằng chứng rõ ràng khối đó đang bị phân loại sai vùng.
- BẮT BUỘC cung cấp "exactQuote" là cụm từ nguyên văn nằm trong khối đó.
- Với khối bảng, BẮT BUỘC trích từ một ô trong "cells" và cung cấp đúng rowIndex, colIndex, cellId của ô ấy.
- Không suy diễn tọa độ hoặc cellId; nếu không đủ bằng chứng, trả về mảng proposals rỗng.
- Không tự bịa đặt họ tên người ký, số hiệu, ngày tháng. Kế hoạch hoặc dự thảo chưa ký phải giữ nguyên, không biến bảng phân công thành chữ ký.
- Bảng phân công công việc (STT, Nội dung, Thời gian, Chủ trì) trong thân bài PHẢI là "body", KHÔNG ĐƯỢC gán thành "signature".

<danh_sach_khoi>
${JSON.stringify(blockManifest, null, 2)}
</danh_sach_khoi>

Trả về JSON thuần túy (không bọc markdown \`\`\`):
{
  "proposals": [
    {
      "sourceBlockId": "id khối bị phân vùng sai (VD: block-4)",
      "suggestedRole": "một trong 8 vùng hợp lệ",
      "fieldKey": "trường đích nếu thuộc header/metadata/signature (VD: nationalHeader1, signTitle, subject...)",
      "exactQuote": "cụm từ nguyên văn trích từ khối đó hoặc ô được chỉ định",
      "cellLocation": { "rowIndex": 0, "colIndex": 0, "cellId": "ID ô trong danh sách cells" },
      "reason": "lý do thể thức theo NĐ 30 hoặc HD 05",
      "confidence": "high"
    }
  ],
  "schemaVersion": 1
}
`;
}
