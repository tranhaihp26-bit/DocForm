/**
 * @file tableRoleClassifier.ts
 * @description Contextual table classification engine according to ND30/HD05 standards.
 * Classifies tables into distinct owners and roles without forcing unknown/ambiguous tables
 * into header or body.
 */

import type { SourceBlock } from "../shared/schemas/document.schema.ts";
import { embeddedRecipientsSignatureTable } from "../shared/embeddedSignatureTable.ts";

export type TableOwner = "header" | "body" | "signature" | "appendix" | "unknown";
export type TableRole = "header" | "signature" | "appendix_data" | "body_data" | "layout" | "unknown";

export interface TableClassificationResult {
  owner: TableOwner;
  role: TableRole;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export type TableFormatScope = "body" | "appendix" | "other";

export interface TableMarkupClassification extends TableClassificationResult {
  scope: TableFormatScope;
  isContentTable: boolean;
  canAutoFormat: boolean;
  hasHeaderRow: boolean;
  headers: string[];
  rowsCount: number;
  columnsCount: number;
  preservedSource: boolean;
  requiresManualReview: boolean;
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

const CONTENT_HEADER_KEYWORDS = [
  "STT", "SỐ TT", "SỐ THỨ TỰ", "HỌ VÀ TÊN", "TÊN", "CHỨC DANH", "CHỨC VỤ",
  "CẤP QUẢN LÝ", "NỘI DUNG", "HẠNG MỤC", "ĐƠN VỊ", "CƠ QUAN", "PHÒNG BAN",
  "THỜI GIAN", "THỜI HẠN", "TIẾN ĐỘ", "SỐ LƯỢNG", "ĐƠN GIÁ", "THÀNH TIỀN",
  "DỰ TOÁN", "KINH PHÍ", "GHI CHÚ", "KẾT QUẢ", "TRẠNG THÁI", "ĐỊA ĐIỂM"
];

function decodeMarkupText(text: string): string {
  return text
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, digits) => {
      const codePoint = Number(digits);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, digits) => {
      const codePoint = parseInt(digits, 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function hasContentHeaderLabel(text: string): boolean {
  const normalized = text.toLocaleUpperCase("vi-VN").replace(/[:.]/g, "").trim();
  return CONTENT_HEADER_KEYWORDS.some(keyword => {
    const normalizedKeyword = keyword.toLocaleUpperCase("vi-VN");
    return normalized === normalizedKeyword || normalized.startsWith(`${normalizedKeyword} `);
  });
}

/**
 * Classifies a table before applying the content-table presentation preset.
 * Imported source tables, structural/header/signature tables, merged grids,
 * and nested tables stay out of automatic formatting.
 */
export function classifyTableMarkup(
  markup: string,
  scope: TableFormatScope = "body",
  regime: "administrative" | "party" = "administrative"
): TableMarkupClassification {
  const tableMatch = markup.match(/<table\b([^>]*)>([\s\S]*?)<\/table\s*>/i);
  const empty: Omit<TableMarkupClassification, "owner" | "role" | "evidence" | "confidence"> = {
    scope,
    isContentTable: false,
    canAutoFormat: false,
    hasHeaderRow: false,
    headers: [],
    rowsCount: 0,
    columnsCount: 0,
    preservedSource: false,
    requiresManualReview: true,
  };
  if (!tableMatch) {
    return { ...empty, owner: "unknown", role: "unknown", evidence: "Không tìm thấy cấu trúc bảng HTML.", confidence: "low" };
  }

  const [, tableAttrs, innerHtml] = tableMatch;
  const preservedSource = /\bdata-source-table-id\s*=|\bdata-preserve\s*=\s*["']true["']/i.test(tableAttrs);
  const nestedTable = /<table\b/i.test(innerHtml);
  const rowMatches = innerHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi) || [];
  const rows = rowMatches.map(row => {
    const cells = Array.from(row.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi));
    return cells.map(match => ({
      tag: String(match[1]).toLowerCase(),
      text: decodeMarkupText(match[3] || ""),
    }));
  });
  const tableData = rows.map(row => row.map(cell => cell.text));
  const rowsCount = rows.length;
  const columnsCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const firstRow = rows[0] || [];
  const headers = firstRow.map(cell => cell.text);
  const explicitHeaderRow = firstRow.some(cell => cell.tag === "th") || /<thead\b[^>]*>[\s\S]*?<tr\b/i.test(innerHtml);
  const semanticHeaderRow = headers.filter(hasContentHeaderLabel).length >= 2 ||
    (headers.length === 1 && hasContentHeaderLabel(headers[0] || ""));
  const hasHeaderRow = explicitHeaderRow || semanticHeaderRow;
  const hasContentRows = rowsCount > 1;
  const hasMergedCells = /\b(?:colspan|rowspan)\s*=\s*["']?\d+/i.test(innerHtml);
  const explicitContent = /\bdata-docform-table-purpose\s*=\s*["']content["']/i.test(tableAttrs);

  const sourceBlock: SourceBlock = {
    id: "markup-table",
    index: 1,
    kind: "table",
    role: scope === "appendix" ? "appendix" : "body",
    text: tableData.flat().join(" | "),
    html: tableMatch[0],
    tableShape: { rows: rowsCount, columns: columnsCount },
    tableData,
  };
  const structural = nestedTable
    ? { owner: "unknown" as const, role: "unknown" as const, evidence: "Bảng có bảng lồng nhau.", confidence: "low" as const }
    : classifyTable(sourceBlock, [], regime);
  const protectedRole = structural.role === "header" || structural.role === "signature";
  const markedContent = explicitContent && !protectedRole;
  const dataRole = structural.role === "body_data" || structural.role === "appendix_data";
  const contentShape = rowsCount >= 3 && columnsCount >= 2;
  const isContentTable = scope !== "other" && !protectedRole && (
    markedContent || (semanticHeaderRow && hasContentRows) || (dataRole && contentShape) || contentShape
  );
  const confidence = markedContent || structural.confidence === "high" || protectedRole
    ? "high"
    : (semanticHeaderRow && hasContentRows) || contentShape ? "medium" : structural.confidence;
  const requiresManualReview = nestedTable || hasMergedCells || (isContentTable && confidence === "low");
  const canAutoFormat = isContentTable && !preservedSource && !requiresManualReview;

  let owner: TableOwner = structural.owner;
  let role: TableRole = structural.role;
  if (isContentTable) {
    owner = scope === "appendix" ? "appendix" : "body";
    role = scope === "appendix" ? "appendix_data" : "body_data";
  }

  let evidence = structural.evidence;
  if (preservedSource && isContentTable) evidence = "Bảng nguồn có dữ liệu; giữ nguyên định dạng theo cơ chế bảo toàn DOCX.";
  else if (requiresManualReview) evidence = nestedTable
    ? "Bảng có bảng lồng nhau; không tự áp preset nội dung."
    : "Bảng nội dung có ô gộp; cần kiểm tra bố cục trước khi áp preset.";
  else if (!isContentTable && scope === "other") evidence = "Bảng nằm ngoài phạm vi Body và Phụ lục.";
  else if (!isContentTable) evidence = structural.evidence;
  else if (hasHeaderRow) evidence = "Bảng nội dung có hàng tiêu đề nhận diện được.";

  return {
    scope, owner, role, evidence, confidence, isContentTable, canAutoFormat,
    hasHeaderRow, headers, rowsCount, columnsCount, preservedSource, requiresManualReview,
  };
}

/** Returns classifications for top-level tables in a document region. */
export function classifyTablesInMarkup(
  markup: string,
  scope: TableFormatScope,
  regime: "administrative" | "party" = "administrative"
): TableMarkupClassification[] {
  const tables = markup.match(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi) || [];
  return tables.map(table => classifyTableMarkup(table, scope, regime));
}

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

  if (embeddedRecipientsSignatureTable(block)) {
    return {
      owner: "body",
      role: "layout",
      evidence: "Một bảng vật lý chứa Nơi nhận ở ô trái và người ký ở ô phải; giữ nguyên bảng, nhận diện theo ô",
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
  const hasSequenceColumn = firstRow.some(cell =>
    /^(?:STT|SỐ\s*TT|SỐ\s*THỨ\s*TỰ|TT|NO\.?)[.:]?$/i.test(cell.trim())
  );
  const isDataTable = isDataTableHeaders.length >= 2 || (hasSequenceColumn && rowsCount > 1);

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
