/**
 * @file tableRoleClassifier.ts
 * @description Contextual table classification engine according to ND30/HD05 standards.
 * Classifies tables into distinct owners and roles without forcing unknown/ambiguous tables
 * into header or body.
 */

import type { SourceBlock } from "../shared/schemas/document.schema.ts";

export type TableOwner = "header" | "body" | "signature" | "appendix" | "unknown";
export type TableRole = "header" | "signature" | "appendix_data" | "body_data" | "layout" | "unknown";

export interface TableClassificationResult {
  owner: TableOwner;
  role: TableRole;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

const NATIONAL_HEADER_1_REGEX = /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM|ĐẢNG CỘNG SẢN VIỆT NAM/i;
const NATIONAL_HEADER_2_REGEX = /Độc lập\s*-\s*Tự do\s*-\s*Hạnh phúc/i;
const DATE_LOCATION_REGEX = /(?:^|\b)([\p{L}\s\.\-]+),\s*ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})(?:\b|$)/u;
const REF_NUMBER_REGEX = /(?:^|[\r\n\t|;])\s*(?:Số:\s*([^\n\r,;\t|]+)|Số\s+([0-9]+[^\n\r,;\t|]*))/i;

const SIGNATURE_TITLE_KEYWORDS = [
  "GIÁM ĐỐC", "TỔNG GIÁM ĐỐC", "CHỦ TỊCH", "PHÓ CHỦ TỊCH", "PHÓ GIÁM ĐỐC",
  "TRƯỞNG PHÒNG", "PHÓ TRƯỞNG PHÒNG", "THƯ KÝ", "ĐẠI DIỆN", "NGƯỜI LẬP BIỂU",
  "KẾ TOÁN TRƯỞNG", "THỦ TRƯỞNG", "BÍ THƯ", "PHÓ BÍ THƯ"
];

const DATA_TABLE_COL_KEYWORDS = [
  "STT", "SỐ TT", "HẠNG MỤC", "NỘI DUNG", "SỐ LƯỢNG", "ĐƠN VỊ TÍNH", "ĐVT",
  "ĐƠN GIÁ", "THÀNH TIỀN", "TIẾN ĐỘ", "THỜI GIAN", "KẾT QUẢ", "ĐƠN VỊ THỰC HIỆN",
  "NGƯỜI PHỤ TRÁCH", "GHI CHÚ"
];

/**
 * Phân loại vai trò bảng dựa trên cấu trúc, nội dung ô và khối lân cận
 */
export function classifyTable(
  block: SourceBlock,
  neighboringBlocks: SourceBlock[] = [],
  regime: "administrative" | "party" = "administrative"
): TableClassificationResult {
  if (block.kind !== "table") {
    return {
      owner: "unknown",
      role: "unknown",
      evidence: "Khối không phải là bảng (kind !== 'table')",
      confidence: "low",
    };
  }

  const tableData = block.tableData || [];
  const rowsCount = block.tableShape?.rows || tableData.length || 0;
  const colsCount = block.tableShape?.columns || (tableData[0]?.length || 0);

  const flatText = tableData.flat().join(" ").trim();
  const firstRow = tableData[0] || [];
  const leftColText = tableData.map(r => r[0] || "").join("\n").trim();
  const rightColText = tableData.map(r => r[r.length - 1] || "").join("\n").trim();

  // 1. Kiểm tra Bảng Phụ Lục
  // Dấu hiệu: nằm sau một khối có tiêu đề phụ lục (trong neighboringBlocks) hoặc có chữ "Phụ lục" rõ ràng
  const precedingBlocks = neighboringBlocks.filter(b => b.index < block.index);
  const immediatelyPreceding = precedingBlocks.length > 0 ? precedingBlocks[precedingBlocks.length - 1] : undefined;
  
  const isPrecededByAppendixTitle = precedingBlocks.some(b => 
    b.kind === "paragraph" && /^(?:PHỤ LỤC|Phụ lục)\s*([0-9IVX]+)?/i.test(b.text.trim())
  );
  if (isPrecededByAppendixTitle) {
    return {
      owner: "appendix",
      role: "appendix_data",
      evidence: "Bảng nằm sau khối tiêu đề Phụ lục",
      confidence: "high",
    };
  }

  // 2. Kiểm tra Bảng Chữ Ký (Signature)
  // Dấu hiệu: có Nơi nhận ở cột trái, hoặc chứa các chức danh ký chuẩn ở cột phải / các cột,
  // hoặc có cụm từ "(Ký, ghi rõ họ tên)" / "(Ký, đóng dấu)"
  const hasRecipients = /Nơi nhận\s*:/i.test(leftColText) || /Nơi nhận\s*:/i.test(flatText);
  const hasSignAnnotation = /\(Ký[,\s]+(?:ghi rõ họ tên|đóng dấu)\)/i.test(flatText);
  const hasSignTitleKeyword = SIGNATURE_TITLE_KEYWORDS.some(kw => 
    rightColText.toUpperCase().includes(kw) || 
    (colsCount >= 2 && firstRow.some(cell => cell.toUpperCase().includes(kw)))
  );

  // Loại trừ: nếu là bảng kế hoạch hành động hoặc bảng dữ liệu thì không phải signature
  const isDataTableHeaders = DATA_TABLE_COL_KEYWORDS.filter(kw => 
    firstRow.some(cell => cell.toUpperCase().includes(kw))
  );
  const isDataTable = isDataTableHeaders.length >= 2;

  if (!isDataTable && (hasRecipients || hasSignAnnotation || (hasSignTitleKeyword && rowsCount <= 4))) {
    return {
      owner: "signature",
      role: "signature",
      evidence: hasRecipients 
        ? "Bảng chứa khu vực Nơi nhận và chức danh người ký" 
        : "Bảng chứa tiêu đề/chức danh và vị trí ký văn bản",
      confidence: "high",
    };
  }

  // 3. Kiểm tra Bảng Phần Đầu (Header)
  // Dấu hiệu: nằm ở đầu văn bản (chỉ sau khoảng trắng/separator), có 2 cột.
  // BẮT BUỘC: Cột phải có Quốc hiệu/Tiêu ngữ/Đảng, HOẶC cột trái có Số hiệu VÀ cột phải có Địa danh/Ngày tháng.
  const hasNational = NATIONAL_HEADER_1_REGEX.test(rightColText) || NATIONAL_HEADER_2_REGEX.test(rightColText);
  const hasRefNumber = REF_NUMBER_REGEX.test(leftColText);
  const hasDateLocation = DATE_LOCATION_REGEX.test(rightColText);

  // Kiểm tra xem bảng có nằm ở vùng đầu tài liệu hay không
  const isAtDocumentTop = precedingBlocks.every(b => 
    b.kind === "paragraph" && (!b.text.trim() || /^[---_\s*]{3,}$/.test(b.text.trim()))
  );

  if (isAtDocumentTop && colsCount >= 2) {
    if (hasNational || (hasRefNumber && hasDateLocation)) {
      return {
        owner: "header",
        role: "header",
        evidence: hasNational 
          ? "Bảng ở đầu văn bản chứa Quốc hiệu hoặc Tiêu đề Đảng" 
          : "Bảng ở đầu văn bản chứa cặp Số văn bản và Địa danh - Ngày tháng",
        confidence: "high",
      };
    }
    // Nếu ở đầu văn bản nhưng KHÔNG CÓ Quốc hiệu và KHÔNG CÓ cặp Số/Ngày:
    // Tuyệt đối không ép thành header!
    return {
      owner: "unknown",
      role: "layout",
      evidence: "Bảng 2 cột ở đầu văn bản nhưng không chứa Quốc hiệu/Đảng hay cặp Số-Ngày hợp lệ",
      confidence: "medium",
    };
  }

  // 4. Kiểm tra Bảng Dữ Liệu Thân Bài (Body Data)
  if (isDataTable || rowsCount > 3 || colsCount >= 3) {
    return {
      owner: "body",
      role: "body_data",
      evidence: isDataTable 
        ? `Bảng dữ liệu thân bài chứa các cột nghiệp vụ (${isDataTableHeaders.join(", ")})`
        : `Bảng lưới dữ liệu thân bài (${rowsCount} hàng x ${colsCount} cột)`,
      confidence: "high",
    };
  }

  // 5. Bảng 2 cột dàn trang thông thường (Layout)
  if (colsCount === 2 && rowsCount <= 2) {
    return {
      owner: "body",
      role: "layout",
      evidence: "Bảng dàn trang hai cột trong thân bài",
      confidence: "medium",
    };
  }

  // 6. Chưa rõ vai trò
  return {
    owner: "unknown",
    role: "unknown",
    evidence: "Bảng chưa có đủ bằng chứng cấu trúc để phân loại chắc chắn",
    confidence: "low",
  };
}
