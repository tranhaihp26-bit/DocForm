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

export {
  VALID_SOURCE_REGIONS,
  isTableBlock,
  hasUntrustedTableStructure,
  validateProposalAgainstSource,
} from "../shared/partitionValidation.ts";

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
  filename = ""
): string {
  const contentDigest = blocks
    .map(b => `${b.id}:${b.role || "unclassified"}`)
    .join(";");
  return crypto
    .createHash("sha256")
    .update(`${regime}|${filename}|${contentDigest}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Offline / Rule-based Fallback Partition Analyzer
 * Identifies high-confidence misclassifications deterministically without calling external AI.
 */
export function analyzePartitionFallback(
  blocks: SourceBlock[],
  regime: "administrative" | "party",
  userModifiedBlockIds: string[] = []
): PartitionProposal[] {
  const userSet = new Set(userModifiedBlockIds);
  const proposals: PartitionProposal[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const b = blocks[idx];
    if (userSet.has(b.id)) continue;

    const currentRole = b.role || "unclassified";
    const text = (b.text || "").trim();
    const upper = text.toUpperCase();

    // 1. Separator detection in HD05 (dashes "-----" or stars after metadata)
    if (regime === "party" && /^[-–—_*~]{3,40}$/.test(text) && currentRole !== "separator") {
      proposals.push({
        id: `fb-sep-${b.id}`,
        sourceBlockId: b.id,
        currentRole,
        suggestedRole: "separator",
        exactQuote: text,
        reason: "Dấu gạch nối '-----' phân cách thể thức Đảng (HD05), cần đặt là separator để tránh lẫn vào thân bài",
        confidence: "high",
        status: "pending",
        regime,
      });
      continue;
    }

    // 2. Multi-column signature table misclassified as body
    if (b.kind === "table" && b.tableData && b.tableData.length > 0 && currentRole === "body") {
      const numCols = b.tableShape?.columns || b.tableData[0]?.length || 1;
      const combinedText = b.text.toUpperCase();
      const hasSigKeywords = 
        (combinedText.includes("THƯ KÝ") && combinedText.includes("TRƯỞNG ĐOÀN")) ||
        (combinedText.includes("CHỦ TỊCH") || combinedText.includes("GIÁM ĐỐC") || combinedText.includes("NGƯỜI LẬP BIÊN BẢN"));

      if (numCols >= 2 && hasSigKeywords && idx >= Math.floor(blocks.length * 0.5)) {
        // Find exact quote from signature table
        const quote = combinedText.includes("THƯ KÝ") ? "THƯ KÝ" : (b.tableData[0][0] || text.slice(0, 30));
        proposals.push({
          id: `fb-sig-${b.id}`,
          sourceBlockId: b.id,
          currentRole,
          suggestedRole: "signature",
          fieldKey: "signTitle",
          exactQuote: quote,
          reason: "Bảng ở cuối văn bản chứa các chức danh ký kết (biên bản / phân công ký), không phải bảng dữ liệu thân bài",
          confidence: "high",
          status: "pending",
          regime,
          componentGroupIndex: 7,
          requiresUserVerification: true,
        });
        continue;
      }
    }

    // 3. National header or Party header misclassified as body
    if (idx < 5 && currentRole === "body") {
      if (regime === "party" && upper.includes("ĐẢNG CỘNG SẢN VIỆT NAM")) {
        proposals.push({
          id: `fb-hdr-${b.id}`,
          sourceBlockId: b.id,
          currentRole,
          suggestedRole: "header",
          fieldKey: "nationalHeader1",
          exactQuote: "ĐẢNG CỘNG SẢN VIỆT NAM",
          reason: "Tiêu đề Đảng ở đầu văn bản thuộc vùng header",
          confidence: "high",
          status: "pending",
          regime,
          componentGroupIndex: 1,
        });
      } else if (regime === "administrative" && upper.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM")) {
        proposals.push({
          id: `fb-hdr-${b.id}`,
          sourceBlockId: b.id,
          currentRole,
          suggestedRole: "header",
          fieldKey: "nationalHeader1",
          exactQuote: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
          reason: "Quốc hiệu NĐ 30 ở đầu văn bản thuộc vùng header",
          confidence: "high",
          status: "pending",
          regime,
          componentGroupIndex: 1,
        });
      }
    }
  }

  return proposals;
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
  const regimeDesc = regime === "party"
    ? "Hướng dẫn số 05-HD/VPTW về thể thức văn bản Đảng (Tiêu đề: ĐẢNG CỘNG SẢN VIỆT NAM, không tiêu ngữ, dấu hoa thị cơ quan, dấu gạch nối '-----' dưới trích yếu, chữ ký chức danh)."
    : "Nghị định số 30/2020/NĐ-CP về thể thức văn bản hành chính (Quốc hiệu: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM, Tiêu ngữ: Độc lập - Tự do - Hạnh phúc, đường kẻ cơ quan 1/3-1/2, chữ ký và nơi nhận).";

  const blockManifest = chunk.map(b => ({
    id: b.id,
    index: b.index,
    kind: b.kind,
    currentRole: b.role || "unclassified",
    tableShape: b.tableShape,
    tableHasMergedCells: Boolean(b.tableProperties?.mergedCells?.length || b.tableProperties?.isGridSpan || b.tableProperties?.isVMerge),
    textSnippet: (b.text || "").slice(0, 350),
    firstRowPreview: b.tableData?.[0]?.slice(0, 4),
  }));

  return `
Bạn là chuyên gia kiểm định phân vùng tài liệu hành chính và văn bản Đảng Việt Nam theo ${regimeDesc}.
Đang xử lý cụm ${chunkIndex + 1}/${totalChunks} (gồm ${chunk.length} khối).

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
- CHỈ đề xuất thay đổi role nếu có bằng chứng rõ ràng khối đó đang bị phân loại sai vùng.
- BẮT BUỘC cung cấp "exactQuote" là cụm từ nguyên văn nằm trong khối đó.
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
      "exactQuote": "cụm từ nguyên văn trích từ khối đó",
      "reason": "lý do thể thức theo NĐ 30 hoặc HD 05",
      "confidence": "high"
    }
  ]
}
`;
}
