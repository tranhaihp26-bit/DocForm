/**
 * @file tableFormatUtils.ts
 * @description Bộ tiện ích tối ưu hóa định dạng Bảng biểu (Tables) và Nội dung (Body)
 * chuẩn hóa theo Nghị định số 30/2020/NĐ-CP (Phụ lục I) và Hướng dẫn số 05-HD/VPTW.
 * 
 * CÁC QUY CHUẨN THỂ THỨC CANONICAL (ĐỐI CHIẾU TRỰC TIẾP TỪ REPO ND30):
 * - ND30.PL1.I.II.6E.BODY_JUSTIFIED: Căn lề hai bên (alignment: justify)
 * - ND30.PL1.I.II.6E.BODY_LINE_SPACING_RANGE: Giãn dòng 1.0 - 1.5 dòng (chuẩn 1.15 - 1.25)
 * - ND30.PL1.I.II.6E.BODY_SIZE: Cỡ chữ 13pt - 14pt (chữ thường, đứng)
 * - ND30.PL1.I.II.6E.FIRST_LINE_INDENT: Thụt đầu dòng 1.00cm - 1.27cm (567 - 720 dxa)
 * - ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN: Khoảng cách giữa các đoạn tối thiểu 6pt (120 dxa)
 * - ND30.PL1.I.II.6A.LEGAL_BASIS_ITALIC: Căn cứ pháp lý in nghiêng, kết thúc bằng dấu chấm phẩy
 * - ND30.PL1.I.II.6D.STRUCTURE_TITLES_REQUIRED: Tiêu đề Điều, Khoản in đậm, đứng
 * - Bảng biểu (Tables): Tự động phân bổ độ rộng cột (STT 7-9%, Nội dung 45-60%), 
 *   lặp lại header trang (w:tblHeader), chống vỡ dòng (w:cantSplit), padding chuẩn.
 */

import { AlignmentType } from "docx";
import type { TableModel, TableCellRun, TableCellModel, TableRowModel } from "../shared/tableModel.ts";

export type ColumnSemanticType = 
  | "stt"          // Số thứ tự (STT, TT, No, No.)
  | "content"      // Nội dung chính (Nội dung, Công việc, Hạng mục, Tên...)
  | "department"   // Đơn vị, Phòng ban, Cơ quan, Người thực hiện, Chủ trì, Phối hợp
  | "time"         // Thời gian, Tiến độ, Thời hạn, Ngày hoàn thành
  | "quantity"     // Số lượng, Khối lượng, Kinh phí, Dự toán
  | "unit"         // Đơn vị tính (ĐVT)
  | "note"         // Ghi chú, Lưu ý, Kết quả
  | "general";     // Cột thông thường

/**
 * Nhận diện ngữ nghĩa của cột dựa trên nội dung tiêu đề (Header text)
 */
export function detectColumnSemanticType(headerText: string): ColumnSemanticType {
  const norm = headerText.toLowerCase().trim().replace(/[:.]/g, "");
  
  // 1. Cột STT
  if (/^(stt|số\s*tt|tt|no|no\.|sô\s*tt|stt\.)$/i.test(norm)) {
    return "stt";
  }

  // 2. Cột Đơn vị tính
  if (/^(đvt|đơn\s*vị\s*tính|dvt)$/i.test(norm)) {
    return "unit";
  }

  // 3. Cột Số lượng / Định lượng / Kinh phí
  if (/^(số\s*lượng|khối\s*lượng|kinh\s*phí|thành\s*tiền|đơn\s*giá|dự\s*toán|số\s*tiền)$/i.test(norm)) {
    return "quantity";
  }

  // 4. Cột Thời gian / Tiến độ
  if (/(thời\s*gian|tiến\s*độ|thời\s*hạn|ngày\s*hoàn\s*thành|bắt\s*đầu|kết\s*thúc|hạn\s*chót|kỳ\s*báo\s*cáo)/i.test(norm)) {
    return "time";
  }

  // 5. Cột Đơn vị / Người thực hiện / Phòng ban
  if (/(đơn\s*vị|chủ\s*trì|phối\s*hợp|người\s*thực\s*hiện|bộ\s*phận|phòng\s*ban|cơ\s*quan|trách\s*nhiệm)/i.test(norm)) {
    return "department";
  }

  // 6. Cột Ghi chú
  if (/(ghi\s*chú|note|lưu\s*ý|kết\s*quả|trạng\s*thái)/i.test(norm)) {
    return "note";
  }

  // 7. Cột Nội dung chính
  if (/(nội\s*dung|công\s*việc|nhiệm\s*vụ|hạng\s*mục|tên\s*thiết\s*bị|tên\s*dự\s*án|danh\s*mục|tiêu\s*chí|chỉ\s*tiêu|mục\s*đích|quy\s*cách)/i.test(norm)) {
    return "content";
  }

  return "general";
}

/**
 * Tính toán tỉ lệ phần trăm phân bổ cột thông minh cho bảng
 * Đảm bảo: Cột STT gọn (~8%), Cột Nội dung rộng rãi (~50-60%), Tổng đúng 100%.
 */
export function calculateTableColumnProportions(headers: string[]): number[] {
  const colCount = headers.length;
  if (colCount <= 0) return [];
  if (colCount === 1) return [100];

  const types = headers.map(h => detectColumnSemanticType(h));

  // 1. Phân bổ cố định 8% cho cột STT nếu có
  const hasStt = types.some(t => t === "stt");
  const remainingBudget = hasStt ? 92 : 100;

  // 2. Trọng số cơ sở (base weights) theo ngữ nghĩa cho các cột còn lại
  const nonSttWeights = types.map((type, idx) => {
    if (type === "stt") return 0;
    switch (type) {
      case "unit":
        return 9; // ĐVT ~9%
      case "quantity":
        return 12; // Số lượng ~12%
      case "time":
        return 16; // Thời gian ~16%
      case "department":
        return 24; // Đơn vị ~24%
      case "note":
        return 14; // Ghi chú ~14%
      case "content":
        return 50; // Nội dung chính ~50%
      case "general":
      default:
        // Nếu cột đầu tiên không nhận diện được loại nhưng colCount > 2
        if (idx === 0 && colCount > 2) return 8;
        return 20;
    }
  });

  const totalOtherWeight = nonSttWeights.reduce((sum: number, w: number) => sum + w, 0) || 1;

  // 3. Phân bổ phần trăm
  let proportions = types.map((type, idx) => {
    if (type === "stt") return 8;
    return Math.round((nonSttWeights[idx] / totalOtherWeight) * remainingBudget);
  });

  // 4. Tìm cột nội dung chính để bù trừ sai số làm tròn cho tổng chính xác 100%
  let contentIdx = types.findIndex(t => t === "content");
  if (contentIdx === -1) {
    if (types[0] === "stt" && colCount >= 2) {
      contentIdx = 1;
    } else {
      contentIdx = 0;
    }
  }

  const diff = 100 - proportions.reduce((sum, p) => sum + p, 0);
  proportions[contentIdx] += diff;

  return proportions;
}

/**
 * Tính toán độ rộng cột bằng đơn vị twips (dxa) cho Microsoft Word DOCX
 * @param headers Danh sách tiêu đề các cột
 * @param totalWidthDxa Tổng chiều rộng bảng tính bằng twips (Mặc định: 9355 twips = 165mm)
 */
export function calculateTableColumnWidthsTwip(headers: string[], totalWidthDxa: number = 9355): number[] {
  const proportions = calculateTableColumnProportions(headers);
  const widthsTwip = proportions.map(pct => Math.round((pct / 100) * totalWidthDxa));

  // Điều chỉnh sai số làm tròn để tổng bằng đúng totalWidthDxa
  const currentTotal = widthsTwip.reduce((sum, w) => sum + w, 0);
  const diff = totalWidthDxa - currentTotal;
  if (widthsTwip.length > 0 && diff !== 0) {
    // Thêm sai số vào cột có độ rộng lớn nhất (thường là cột Nội dung)
    let maxIdx = 0;
    for (let i = 1; i < widthsTwip.length; i++) {
      if (widthsTwip[i] > widthsTwip[maxIdx]) maxIdx = i;
    }
    widthsTwip[maxIdx] += diff;
  }

  return widthsTwip;
}

/**
 * Trả về kiểu căn lề DOCX (AlignmentType) phù hợp theo loại cột
 */
export function getColumnDocxAlignment(
  type: ColumnSemanticType, 
  isHeader: boolean
): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (isHeader) return AlignmentType.CENTER;
  switch (type) {
    case "stt":
    case "unit":
    case "time":
      return AlignmentType.CENTER;
    case "quantity":
      return AlignmentType.RIGHT;
    case "content":
      return AlignmentType.JUSTIFIED;
    case "department":
    case "note":
    case "general":
    default:
      return AlignmentType.LEFT;
  }
}

/**
 * Trả về chuỗi CSS text-align phù hợp theo loại cột
 */
export function getColumnCssAlignment(type: ColumnSemanticType, isHeader: boolean): "center" | "justify" | "left" | "right" {
  if (isHeader) return "center";
  switch (type) {
    case "stt":
    case "unit":
    case "time":
      return "center";
    case "quantity":
      return "right";
    case "content":
      return "justify";
    case "department":
    case "note":
    case "general":
    default:
      return "left";
  }
}

/**
 * Tối ưu hóa chuỗi HTML chứa bảng:
 * 1. Chèn thẻ <colgroup> với độ rộng % chuẩn cho từng cột
 * 2. Thiết lập table-layout: fixed và width: 100%
 * 3. Chuẩn hóa padding, viền, cỡ chữ trong ô
 * 4. Căn lề chuẩn cho cột STT (căn giữa) và cột Nội dung (căn đều)
 */
export function optimizeTableHtml(tableHtml: string): string {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    // Regex-based fallback cho Node.js / Server-side
    return tableHtml.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (_match, tableAttrs, tableInner) => {
      // Bảng nhập ở chế độ preserve không được tự ý tối ưu hóa hay đổi style
      if (/data-source-table-id|data-preserve=["']true["']/i.test(tableAttrs)) {
        return _match;
      }

      // Tìm các thẻ th trong hàng đầu tiên
      const thMatches = tableInner.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      const headers = thMatches.map((th: string) => th.replace(/<[^>]*>/g, "").trim());
      
      if (headers.length === 0) {
        return `<table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;"${tableAttrs}>${tableInner}</table>`;
      }

      const proportions = calculateTableColumnProportions(headers);
      const colgroupHtml = `<colgroup>${proportions.map(p => `<col style="width: ${p}%;">`).join("")}</colgroup>`;

      // Gán style chuẩn cho table
      const cleanTableAttrs = tableAttrs.replace(/style="[^"]*"/gi, "");
      return `<table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 14px 0; font-size: 12pt;" ${cleanTableAttrs}>${colgroupHtml}${tableInner}</table>`;
    });
  }

  // DOMParser-based implementation trong Browser
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${tableHtml}</div>`, "text/html");
    const tables = doc.querySelectorAll("table");

    tables.forEach((table) => {
      // Bảng nhập ở chế độ preserve không được tự ý tối ưu hóa hay đổi style
      if (table.hasAttribute("data-source-table-id") || table.getAttribute("data-preserve") === "true") {
        return;
      }
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.tableLayout = "fixed";
      table.style.marginTop = "14px";
      table.style.marginBottom = "14px";
      table.style.fontSize = "12pt";
      table.style.lineHeight = "1.25";

      // Đọc header cells
      const firstRow = table.querySelector("tr");
      if (!firstRow) return;

      const headerCells = Array.from(firstRow.querySelectorAll("th, td"));
      const headers = headerCells.map(c => c.textContent?.trim() || "");
      if (headers.length === 0) return;

      const types = headers.map(h => detectColumnSemanticType(h));
      const proportions = calculateTableColumnProportions(headers);

      // Thêm hoặc cập nhật <colgroup>
      let colgroup = table.querySelector("colgroup");
      if (!colgroup) {
        colgroup = doc.createElement("colgroup");
        table.insertBefore(colgroup, table.firstChild);
      }
      colgroup.innerHTML = proportions.map(pct => `<col style="width: ${pct}%;">`).join("");

      // Định dạng từng hàng và ô
      const rows = Array.from(table.querySelectorAll("tr"));
      rows.forEach((row, rowIdx) => {
        const cells = Array.from(row.querySelectorAll("th, td"));
        const isHeaderRow = rowIdx === 0 && (row.querySelector("th") !== null || row.parentElement?.tagName.toLowerCase() === "thead");

        cells.forEach((cell, colIdx) => {
          const type = types[colIdx] || "general";
          const isHeader = cell.tagName.toLowerCase() === "th" || isHeaderRow;
          
          cell.setAttribute("style", `
            border: 1px solid #000000;
            padding: ${isHeader ? "6px 8px" : "5px 8px"};
            text-align: ${getColumnCssAlignment(type, isHeader)};
            font-weight: ${isHeader ? "bold" : "normal"};
            background-color: ${isHeader ? "#f8fafc" : "transparent"};
            vertical-align: ${isHeader ? "middle" : "top"};
            font-size: 12pt;
            line-height: 1.25;
            word-wrap: break-word;
            overflow-wrap: break-word;
          `.replace(/\s+/g, " ").trim());
        });
      });
    });

    return doc.body.firstElementChild?.innerHTML || tableHtml;
  } catch (err) {
    console.warn("Error optimizing table HTML:", err);
    return tableHtml;
  }
}

/**
 * Chuẩn hóa toàn bộ nội dung HTML phần Thân văn bản (Body)
 * Áp dụng đầy đủ 7 quy tắc chuẩn hóa theo Phụ lục I NĐ 30/2020/NĐ-CP:
 * 1. Đoạn văn: Căn đều (text-align: justify), thụt đầu dòng 1.0cm, giãn dòng 1.25, after 6pt
 * 2. Căn cứ pháp lý: Chữ in nghiêng, kết thúc bằng dấu chấm phẩy, căn cứ cuối là dấu chấm
 * 3. Tiêu đề Điều / Mục: Chữ in đậm, đứng, khoảng cách before 10pt, after 4pt
 * 4. Bảng biểu: Bố cục cột cân đối, cột STT hẹp gọn (~8%), cột Nội dung thông thoáng (~55%)
 */
export function formatND30BodyHtml(rawHtml: string, regime: "administrative" | "party" = "administrative"): string {
  if (!rawHtml || !rawHtml.trim()) return rawHtml;
  return optimizeTableHtml(rawHtml);
}

export interface CellEditDiff {
  tableId: string;
  cellId: string;
  row: number;
  col: number;
  oldText: string;
  newText: string;
}

export interface SyncTableResult {
  effectiveModel: TableModel;
  hasEdits: boolean;
  userEdits: CellEditDiff[];
}

/**
 * Trích xuất các runs từ chuỗi HTML của một đoạn văn (môi trường Node.js / Regex)
 */
const NAMED_HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Giải mã các HTML entities chính xác một lần duy nhất, hỗ trợ toàn dải Unicode (> 0xFFFF)
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, dec, name) => {
    if (hex) {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (dec) {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (name) {
      const lower = name.toLowerCase();
      if (lower in NAMED_HTML_ENTITIES) {
        return NAMED_HTML_ENTITIES[lower];
      }
    }
    return match;
  });
}

/**
 * Trích xuất các thuộc tính CSS inline từ chuỗi style="..."
 */
function parseCssStyleDeclarations(styleStr: string): {
  font?: string;
  sizeHalfPt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
} {
  const result: {
    font?: string;
    sizeHalfPt?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
  } = {};

  const declarations = styleStr.split(";");
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();

    if (prop === "font-family") {
      const firstFont = val.split(",")[0].trim().replace(/^['"]+|['"]+$/g, "");
      if (firstFont) result.font = firstFont;
    } else if (prop === "font-size") {
      const ptMatch = val.match(/^([\d\.]+)\s*pt$/i);
      const pxMatch = val.match(/^([\d\.]+)\s*px$/i);
      if (ptMatch) {
        result.sizeHalfPt = Math.round(parseFloat(ptMatch[1]) * 2);
      } else if (pxMatch) {
        result.sizeHalfPt = Math.round(parseFloat(pxMatch[1]) * 1.5);
      }
    } else if (prop === "font-weight") {
      const v = val.toLowerCase();
      if (v === "bold" || parseInt(v, 10) >= 700) {
        result.bold = true;
      } else if (v === "normal" || parseInt(v, 10) <= 400) {
        result.bold = false;
      }
    } else if (prop === "font-style") {
      const v = val.toLowerCase();
      if (v === "italic" || v === "oblique") {
        result.italic = true;
      } else if (v === "normal") {
        result.italic = false;
      }
    } else if (prop === "text-decoration" || prop === "text-decoration-line") {
      const v = val.toLowerCase();
      if (v.includes("underline")) {
        result.underline = true;
      } else if (v.includes("none")) {
        result.underline = false;
      }
    } else if (prop === "color") {
      const c = val.replace(/^#/, "").trim();
      if (c) result.color = c;
    }
  }

  return result;
}

function mergeAdjacentIdenticalRuns(runs: TableCellRun[]): TableCellRun[] {
  if (runs.length <= 1) return runs;
  const merged: TableCellRun[] = [];
  let current = { ...runs[0] };
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    const same =
      Boolean(r.bold) === Boolean(current.bold) &&
      Boolean(r.italic) === Boolean(current.italic) &&
      Boolean(r.underline) === Boolean(current.underline) &&
      r.font === current.font &&
      r.sizeHalfPt === current.sizeHalfPt &&
      (r.color || "").toUpperCase() === (current.color || "").toUpperCase();

    if (same) {
      current.text += r.text;
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Trích xuất các runs từ chuỗi HTML của một đoạn văn (môi trường Node.js / Regex)
 */
export function parseRunsFromHtmlString(pHtml: string, templateRun?: TableCellRun): TableCellRun[] {
  const baseRun: TableCellRun = {
    text: "",
    font: templateRun?.font,
    sizeHalfPt: templateRun?.sizeHalfPt,
    bold: templateRun?.bold ?? false,
    italic: templateRun?.italic ?? false,
    underline: templateRun?.underline ?? false,
    color: templateRun?.color,
  };

  const inner = pHtml.replace(/^<p\b[^>]*>/i, "").replace(/<\/p>$/i, "");
  const hasFormattingTags = /<(?:strong|b|em|i|u|span)\b/i.test(inner);
  if (!hasFormattingTags) {
    return [];
  }

  const runs: TableCellRun[] = [];
  const tagRegex = /<(\/)?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  const styleStack: TableCellRun[] = [{ ...baseRun }];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(inner)) !== null) {
    const isClose = Boolean(match[1]);
    const tagName = match[2]?.toLowerCase();
    const attrsStr = match[3] || "";
    const textContent = match[4];

    if (tagName) {
      if (isClose) {
        if (styleStack.length > 1) {
          styleStack.pop();
        }
      } else {
        const current = styleStack[styleStack.length - 1];
        const nextStyle: TableCellRun = { ...current };

        if (tagName === "strong" || tagName === "b") {
          nextStyle.bold = true;
        } else if (tagName === "em" || tagName === "i") {
          nextStyle.italic = true;
        } else if (tagName === "u") {
          nextStyle.underline = true;
        }

        const styleMatch = attrsStr.match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
        if (styleMatch) {
          const styleVal = styleMatch[1] ?? styleMatch[2] ?? "";
          const parsed = parseCssStyleDeclarations(styleVal);
          if (parsed.font !== undefined) nextStyle.font = parsed.font;
          if (parsed.sizeHalfPt !== undefined) nextStyle.sizeHalfPt = parsed.sizeHalfPt;
          if (parsed.bold !== undefined) nextStyle.bold = parsed.bold;
          if (parsed.italic !== undefined) nextStyle.italic = parsed.italic;
          if (parsed.underline !== undefined) nextStyle.underline = parsed.underline;
          if (parsed.color !== undefined) nextStyle.color = parsed.color;
        }

        styleStack.push(nextStyle);
      }
    } else if (textContent) {
      const decoded = decodeHtmlEntities(textContent);

      if (decoded.length > 0) {
        runs.push({
          ...styleStack[styleStack.length - 1],
          text: decoded,
        });
      }
    }
  }

  return mergeAdjacentIdenticalRuns(runs);
}

/**
 * Trích xuất các runs từ phần tử DOM của một đoạn văn (môi trường Browser)
 */
export function parseRunsFromDomElement(pEl: Element, templateRun?: TableCellRun): TableCellRun[] {
  const baseRun: TableCellRun = {
    text: "",
    font: templateRun?.font,
    sizeHalfPt: templateRun?.sizeHalfPt,
    bold: templateRun?.bold ?? false,
    italic: templateRun?.italic ?? false,
    underline: templateRun?.underline ?? false,
    color: templateRun?.color,
  };

  const hasFormattingTags = pEl.querySelector("strong, b, em, i, u, span") !== null;
  if (!hasFormattingTags) {
    return [];
  }

  const runs: TableCellRun[] = [];

  function walk(node: Node, currentStyle: TableCellRun) {
    if (node.nodeType === 3) { // Text node
      const text = decodeHtmlEntities(node.textContent || "");
      if (text.length > 0) {
        runs.push({
          ...currentStyle,
          text,
        });
      }
    } else if (node.nodeType === 1) { // Element node
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const nextStyle: TableCellRun = { ...currentStyle };

      if (tag === "strong" || tag === "b") nextStyle.bold = true;
      if (tag === "em" || tag === "i") nextStyle.italic = true;
      if (tag === "u") nextStyle.underline = true;

      const styleAttr = el.getAttribute ? el.getAttribute("style") : undefined;
      if (styleAttr) {
        const parsed = parseCssStyleDeclarations(styleAttr);
        if (parsed.font !== undefined) nextStyle.font = parsed.font;
        if (parsed.sizeHalfPt !== undefined) nextStyle.sizeHalfPt = parsed.sizeHalfPt;
        if (parsed.bold !== undefined) nextStyle.bold = parsed.bold;
        if (parsed.italic !== undefined) nextStyle.italic = parsed.italic;
        if (parsed.underline !== undefined) nextStyle.underline = parsed.underline;
        if (parsed.color !== undefined) nextStyle.color = parsed.color;
      } else if (el.style) {
        if (el.style.fontFamily) {
          const f = el.style.fontFamily.split(",")[0].trim().replace(/^['"]+|['"]+$/g, "");
          if (f) nextStyle.font = f;
        }
        if (el.style.fontSize) {
          const ptMatch = el.style.fontSize.match(/^([\d\.]+)\s*pt$/i);
          const pxMatch = el.style.fontSize.match(/^([\d\.]+)\s*px$/i);
          if (ptMatch) nextStyle.sizeHalfPt = Math.round(parseFloat(ptMatch[1]) * 2);
          else if (pxMatch) nextStyle.sizeHalfPt = Math.round(parseFloat(pxMatch[1]) * 1.5);
        }
        if (el.style.fontWeight) {
          const fw = el.style.fontWeight.toLowerCase();
          if (fw === "bold" || parseInt(fw, 10) >= 700) nextStyle.bold = true;
          else if (fw === "normal" || parseInt(fw, 10) <= 400) nextStyle.bold = false;
        }
        if (el.style.fontStyle) {
          const fs = el.style.fontStyle.toLowerCase();
          if (fs === "italic" || fs === "oblique") nextStyle.italic = true;
          else if (fs === "normal") nextStyle.italic = false;
        }
        if (el.style.textDecoration) {
          const td = el.style.textDecoration.toLowerCase();
          if (td.includes("underline")) nextStyle.underline = true;
          else if (td.includes("none")) nextStyle.underline = false;
        }
        if (el.style.color) {
          const c = el.style.color.replace(/^#/, "").trim();
          if (c) nextStyle.color = c;
        }
      }

      node.childNodes.forEach(child => walk(child, nextStyle));
    }
  }

  pEl.childNodes.forEach(child => walk(child, baseRun));
  return mergeAdjacentIdenticalRuns(runs);
}

/**
 * Tái cấu trúc các runs khi người dùng sửa văn bản trong ô (kể cả khi HTML gửi lên là plain text).
 * Giữ nguyên định dạng của các từ không đổi, ánh xạ run sửa đổi dựa trên thuật toán LCS / Multi-site Alignment.
 */
export function reconcileRunsWithNewText(
  existingRuns: TableCellRun[] | undefined,
  newText: string,
  defaultTemplateRun?: TableCellRun
): TableCellRun[] {
  const templateRun: TableCellRun = defaultTemplateRun || existingRuns?.[0] || {
    text: "",
    font: "Times New Roman",
    sizeHalfPt: 24,
    bold: false,
    italic: false,
    underline: false,
  };

  if (!existingRuns || existingRuns.length === 0) {
    return [{ ...templateRun, text: newText }];
  }

  if (existingRuns.length === 1) {
    return [{ ...existingRuns[0], text: newText }];
  }

  if (newText === "") {
    return [{ ...templateRun, text: "" }];
  }

  const oldFullText = existingRuns.map(r => r.text).join("");
  if (oldFullText === newText) {
    return existingRuns;
  }

  // Mở rộng existingRuns thành danh sách style từng ký tự
  const oldCharStyles: TableCellRun[] = [];
  for (const r of existingRuns) {
    for (let c = 0; c < r.text.length; c++) {
      oldCharStyles.push(r);
    }
  }

  // 1. Tìm tiền tố chung dài nhất
  let preLen = 0;
  while (preLen < oldFullText.length && preLen < newText.length && oldFullText[preLen] === newText[preLen]) {
    preLen++;
  }

  // 2. Tìm hậu tố chung dài nhất
  let sufLen = 0;
  while (
    sufLen < (oldFullText.length - preLen) &&
    sufLen < (newText.length - preLen) &&
    oldFullText[oldFullText.length - 1 - sufLen] === newText[newText.length - 1 - sufLen]
  ) {
    sufLen++;
  }

  const newCharStyles: TableCellRun[] = new Array(newText.length);

  // Ánh xạ tiền tố
  for (let i = 0; i < preLen; i++) {
    newCharStyles[i] = oldCharStyles[i];
  }

  // Ánh xạ hậu tố
  for (let s = 0; s < sufLen; s++) {
    const newIdx = newText.length - sufLen + s;
    const oldIdx = oldFullText.length - sufLen + s;
    newCharStyles[newIdx] = oldCharStyles[oldIdx];
  }

  // Phần giữa (middle)
  const midOld = oldFullText.slice(preLen, oldFullText.length - sufLen);
  const midNew = newText.slice(preLen, newText.length - sufLen);
  const M = midOld.length;
  const N = midNew.length;

  if (M === 0 && N > 0) {
    // Chèn thuần túy ở giữa
    const insertStyle = preLen > 0 ? oldCharStyles[preLen - 1] : (oldCharStyles[0] || templateRun);
    for (let j = 0; j < N; j++) {
      newCharStyles[preLen + j] = insertStyle;
    }
  } else if (M > 0 && N === 0) {
    // Xóa thuần túy ở giữa (đã xong)
  } else if (M > 0 && N > 0) {
    if (M * N <= 250000) {
      // Tính bảng LCS
      const dp = Array.from({ length: M + 1 }, () => new Int32Array(N + 1));
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
          if (midOld[i] === midNew[j]) {
            dp[i + 1][j + 1] = dp[i][j] + 1;
          } else {
            dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
          }
        }
      }

      // Truy vết
      const ops: Array<{ op: "eq" | "del" | "ins"; midOldIdx: number; midNewIdx: number }> = [];
      let i = M, j = N;
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
          ops.push({ op: "eq", midOldIdx: i - 1, midNewIdx: j - 1 });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          ops.push({ op: "ins", midOldIdx: -1, midNewIdx: j - 1 });
          j--;
        } else if (i > 0) {
          ops.push({ op: "del", midOldIdx: i - 1, midNewIdx: -1 });
          i--;
        }
      }
      ops.reverse();

      // Gán style dựa trên truy vết
      let activeStyle: TableCellRun = preLen > 0 ? oldCharStyles[preLen - 1] : (oldCharStyles[preLen] || templateRun);
      for (const op of ops) {
        if (op.op === "eq") {
          const oldCharIdx = preLen + op.midOldIdx;
          const newCharIdx = preLen + op.midNewIdx;
          activeStyle = oldCharStyles[oldCharIdx];
          newCharStyles[newCharIdx] = activeStyle;
        } else if (op.op === "del") {
          const oldCharIdx = preLen + op.midOldIdx;
          activeStyle = oldCharStyles[oldCharIdx];
        } else if (op.op === "ins") {
          const newCharIdx = preLen + op.midNewIdx;
          newCharStyles[newCharIdx] = activeStyle;
        }
      }
    } else {
      // Fallback theo tỷ lệ nếu chuỗi giữa quá lớn
      for (let j = 0; j < N; j++) {
        const approxOldIdx = preLen + Math.min(M - 1, Math.floor((j / N) * M));
        newCharStyles[preLen + j] = oldCharStyles[approxOldIdx] || templateRun;
      }
    }
  }

  // 5. Gom nhóm các ký tự liền kề thành runs
  return mergeAdjacentIdenticalRuns(
    newCharStyles.map((s, idx) => ({ ...(s || templateRun), text: newText[idx] }))
  );
}

/**
 * Đồng bộ hóa nội dung người dùng chỉnh sửa trong ô bảng HTML (TipTap) vào TableModel.
 * Bảo toàn 100% hình học lưới, căn lề, viền, margins, shading, số có số 0 đầu,
 * trong khi cập nhật chính xác text và paragraphs mới.
 */
export function syncTableModelFromHtml(
  tableHtmlOrElement: string | any,
  baseModel: TableModel
): SyncTableResult {
  const effectiveModel: TableModel = JSON.parse(JSON.stringify(baseModel));
  const userEdits: CellEditDiff[] = [];
  const tableId = effectiveModel.tableId || "table";

  // Map tất cả ô trong effectiveModel theo cellId để tra cứu nhanh O(1)
  const cellMapById = new Map<string, { cell: any; rowIdx: number; colIdx: number }>();
  for (let r = 0; r < effectiveModel.rows.length; r++) {
    const row = effectiveModel.rows[r];
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      if (cell.cellId) {
        cellMapById.set(cell.cellId, { cell, rowIdx: r, colIdx: c });
      }
    }
  }

  // Phân tích HTML ô
  interface ExtractedParagraph {
    text: string;
    runs?: TableCellRun[];
  }

  interface ExtractedCell {
    cellId?: string;
    rowIdx: number;
    colIdx: number;
    text: string;
    paragraphs: ExtractedParagraph[];
  }

  const extractedCells: ExtractedCell[] = [];
  let htmlRowCount = 0;

  // Môi trường Trình duyệt (DOM Element)
  if (typeof tableHtmlOrElement === "object" && tableHtmlOrElement !== null && "querySelectorAll" in tableHtmlOrElement) {
    const tableEl = tableHtmlOrElement as Element;
    const trEls = Array.from(tableEl.querySelectorAll("tr"));
    htmlRowCount = trEls.length;
    trEls.forEach((tr, rIdx) => {
      const cellEls = Array.from(tr.querySelectorAll("th, td"));
      cellEls.forEach((cellEl, cIdx) => {
        const cellId = cellEl.getAttribute("data-cell-id") || undefined;
        const pEls = Array.from(cellEl.querySelectorAll("p"));
        const cellParas: ExtractedParagraph[] = [];

        if (pEls.length > 0) {
          pEls.forEach(p => {
            const text = (p.textContent || "").trim();
            const runs = parseRunsFromDomElement(p);
            cellParas.push({ text, runs: runs.length > 0 ? runs : undefined });
          });
        } else {
          const text = (cellEl.textContent || "").trim();
          const runs = parseRunsFromDomElement(cellEl);
          cellParas.push({ text, runs: runs.length > 0 ? runs : undefined });
        }

        const fullText = cellParas.map(p => p.text).join(" ").trim();
        extractedCells.push({ cellId, rowIdx: rIdx, colIdx: cIdx, text: fullText, paragraphs: cellParas });
      });
    });
  } else {
    // Môi trường Node.js / Regex parsing
    const rawHtml = String(tableHtmlOrElement);
    const trMatches = rawHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    htmlRowCount = trMatches.length;
    trMatches.forEach((trHtml, rIdx) => {
      const cellMatches = trHtml.match(/<(?:td|th)\b[\s\S]*?<\/(?:td|th)>/gi) || [];
      cellMatches.forEach((cellHtml, cIdx) => {
        const idMatch = cellHtml.match(/data-cell-id=["']([^"']+)["']/i);
        const cellId = idMatch ? idMatch[1] : undefined;

        // Trích xuất các đoạn <p>
        const pMatches = cellHtml.match(/<p\b[\s\S]*?<\/p>/gi);
        const cellParas: ExtractedParagraph[] = [];

        if (pMatches && pMatches.length > 0) {
          pMatches.forEach(pTag => {
            const text = decodeHtmlEntities(pTag.replace(/<[^>]*>/g, "")).trim();
            const runs = parseRunsFromHtmlString(pTag);
            cellParas.push({ text, runs: runs.length > 0 ? runs : undefined });
          });
        } else {
          const text = decodeHtmlEntities(cellHtml.replace(/<[^>]*>/g, "")).trim();
          const runs = parseRunsFromHtmlString(cellHtml);
          cellParas.push({ text, runs: runs.length > 0 ? runs : undefined });
        }

        const fullText = cellParas.map(p => p.text).join(" ").trim();
        extractedCells.push({ cellId, rowIdx: rIdx, colIdx: cIdx, text: fullText, paragraphs: cellParas });
      });
    });
  }

  const hasAnyCellId = extractedCells.some(c => Boolean(c.cellId));
  const canUsePositionalFallback = !hasAnyCellId && (htmlRowCount === effectiveModel.rows.length);

  // Áp dụng các thay đổi vào effectiveModel
  for (const extracted of extractedCells) {
    let targetEntry: { cell: any; rowIdx: number; colIdx: number } | undefined;
    if (extracted.cellId && cellMapById.has(extracted.cellId)) {
      targetEntry = cellMapById.get(extracted.cellId);
    } else if (canUsePositionalFallback) {
      // Fallback vị trí (bỏ qua các ô vMerge continue vì chúng không sinh HTML td)
      let currentR = 0;
      for (const row of effectiveModel.rows) {
        if (currentR === extracted.rowIdx) {
          const visibleCells = row.cells.filter(c => c.vMerge !== "continue");
          if (visibleCells[extracted.colIdx]) {
            targetEntry = {
              cell: visibleCells[extracted.colIdx],
              rowIdx: currentR,
              colIdx: extracted.colIdx,
            };
          }
          break;
        }
        currentR++;
      }
    }

    if (targetEntry) {
      const { cell, rowIdx, colIdx } = targetEntry;
      const oldNorm = (cell.text || "").replace(/\s+/g, " ").trim();
      const newNorm = (extracted.text || "").replace(/\s+/g, " ").trim();

      // Kiểm tra xem có thay đổi văn bản hoặc thay đổi định dạng runs không
      const hasTextChange = oldNorm !== newNorm;
      const hasRunsChange = extracted.paragraphs.some((pExtracted, pIdx) => {
        const existingP = cell.paragraphs?.[pIdx];
        if (!existingP) return true;
        if (!pExtracted.runs || pExtracted.runs.length === 0) return false;
        const existingRuns = existingP.runs || [];
        if (pExtracted.runs.length !== existingRuns.length) return true;
        for (let rIdx = 0; rIdx < pExtracted.runs.length; rIdx++) {
          const nr = pExtracted.runs[rIdx];
          const or = existingRuns[rIdx];
          if (!or) return true;
          if (Boolean(nr.bold) !== Boolean(or.bold)) return true;
          if (Boolean(nr.italic) !== Boolean(or.italic)) return true;
          if (Boolean(nr.underline) !== Boolean(or.underline)) return true;
          if (nr.font && nr.font !== or.font) return true;
          if (nr.sizeHalfPt && nr.sizeHalfPt !== or.sizeHalfPt) return true;
          if (nr.color && (nr.color || "").toUpperCase() !== (or.color || "").toUpperCase()) return true;
        }
        return false;
      });

      const hasCellChange = hasTextChange || hasRunsChange;

      if (hasCellChange) {
        userEdits.push({
          tableId,
          cellId: cell.cellId || `cell_${rowIdx}_${colIdx}`,
          row: rowIdx,
          col: colIdx,
          oldText: cell.text,
          newText: extracted.text,
        });

        cell.text = extracted.text;

        const templateRun: TableCellRun = cell.paragraphs?.[0]?.runs?.[0] || {
          font: "Times New Roman",
          sizeHalfPt: 24,
          bold: false,
          italic: false,
        };

        if (extracted.paragraphs.length > 0) {
          cell.paragraphs = extracted.paragraphs.map((pExtracted, pIdx) => {
            const existingP = cell.paragraphs?.[pIdx];
            const pAlign = cell.alignment || existingP?.alignment;

            let updatedRuns: TableCellRun[] = [];
            if (pExtracted.runs && pExtracted.runs.length > 0) {
              // Nếu HTML có chứa tag định dạng cụ thể (strong, em...), nạp trực tiếp và kế thừa font/cỡ chữ nguồn từ đúng run tương ứng
              updatedRuns = pExtracted.runs.map((r, rIdx) => {
                const sourceRun =
                  existingP?.runs?.find((sr: TableCellRun) => sr.text === r.text) ||
                  existingP?.runs?.[rIdx] ||
                  existingP?.runs?.[0] ||
                  templateRun;

                return {
                  ...templateRun,
                  ...r,
                  font: r.font || sourceRun.font || templateRun.font,
                  sizeHalfPt: r.sizeHalfPt || sourceRun.sizeHalfPt || templateRun.sizeHalfPt,
                  color: r.color || sourceRun.color || templateRun.color,
                };
              });
            } else if (existingP?.runs && existingP.runs.length > 1) {
              // HTML là plain text nhưng ô nguồn có nhiều run -> Reconcile bảo toàn phân đoạn run
              updatedRuns = reconcileRunsWithNewText(existingP.runs, pExtracted.text, templateRun);
            } else {
              // Run đơn lẻ
              const singleRun = existingP?.runs?.[0] || templateRun;
              updatedRuns = [{
                ...singleRun,
                text: pExtracted.text,
              }];
            }

            return {
              text: pExtracted.text,
              alignment: pAlign,
              runs: updatedRuns,
            };
          });
        } else {
          cell.paragraphs = [{
            text: extracted.text,
            alignment: cell.alignment,
            runs: [{
              ...templateRun,
              text: extracted.text,
            }],
          }];
        }
      }
    } else if (hasAnyCellId) {
      // Ô mới phát sinh (thêm hàng hoặc thêm cột trong HTML của bảng đã có cellId)
      const targetRowIdx = extracted.rowIdx;
      const targetColIdx = extracted.colIdx;

      // Nếu hàng chưa tồn tại, tạo hàng mới
      while (effectiveModel.rows.length <= targetRowIdx) {
        effectiveModel.rows.push({
          rowIndex: effectiveModel.rows.length,
          isHeader: false,
          cantSplit: true,
          cells: [],
        });
      }

      const row = effectiveModel.rows[targetRowIdx];

      // Đảm bảo gridColumnsTwips có đủ độ rộng cho cột này
      if (!effectiveModel.gridColumnsTwips) {
        effectiveModel.gridColumnsTwips = [];
      }
      while (effectiveModel.gridColumnsTwips.length <= targetColIdx) {
        const fallbackWidth = effectiveModel.gridColumnsTwips.length > 0
          ? effectiveModel.gridColumnsTwips[effectiveModel.gridColumnsTwips.length - 1]
          : 2000;
        effectiveModel.gridColumnsTwips.push(fallbackWidth);
      }

      const newCellId = extracted.cellId || `added_cell_${targetRowIdx}_${targetColIdx}_${Date.now()}`;
      const newRuns: TableCellRun[] = (extracted.paragraphs?.[0]?.runs && extracted.paragraphs[0].runs.length > 0)
        ? extracted.paragraphs[0].runs
        : [{
            text: extracted.text,
            font: "Times New Roman",
            sizeHalfPt: 24,
            bold: false,
            italic: false,
          }];

      const newCell: TableCellModel = {
        cellId: newCellId,
        rowIndex: targetRowIdx,
        colIndex: targetColIdx,
        gridColumn: targetColIdx,
        gridSpan: 1,
        text: extracted.text,
        paragraphs: extracted.paragraphs.length > 0
          ? extracted.paragraphs.map(p => ({
              text: p.text,
              runs: p.runs && p.runs.length > 0 ? p.runs : [{ text: p.text, font: "Times New Roman", sizeHalfPt: 24 }]
            }))
          : [{ text: extracted.text, runs: newRuns }],
      };

      if (targetColIdx < row.cells.length) {
        row.cells[targetColIdx] = newCell;
      } else {
        while (row.cells.length < targetColIdx) {
          const emptyColIdx = row.cells.length;
          row.cells.push({
            cellId: `added_cell_${targetRowIdx}_${emptyColIdx}_${Date.now()}`,
            rowIndex: targetRowIdx,
            colIndex: emptyColIdx,
            gridColumn: emptyColIdx,
            gridSpan: 1,
            text: "",
            paragraphs: [{ text: "", runs: [{ text: "", font: "Times New Roman", sizeHalfPt: 24 }] }],
          });
        }
        row.cells.push(newCell);
      }

      userEdits.push({
        tableId,
        cellId: newCellId,
        row: targetRowIdx,
        col: targetColIdx,
        oldText: "",
        newText: extracted.text,
      });
    }
  }

  // Kiểm tra và loại bỏ các hàng đã bị người dùng xóa trong HTML
  const originalRowsCount = baseModel.rows.length;
  const presentOriginalRowIndices = new Set<number>();
  for (const extracted of extractedCells) {
    if (extracted.cellId && cellMapById.has(extracted.cellId)) {
      presentOriginalRowIndices.add(cellMapById.get(extracted.cellId)!.rowIdx);
    }
  }

  if (hasAnyCellId && presentOriginalRowIndices.size > 0 && presentOriginalRowIndices.size < originalRowsCount) {
    effectiveModel.rows.forEach((row, rIdx) => {
      if (rIdx < originalRowsCount && !presentOriginalRowIndices.has(rIdx)) {
        userEdits.push({
          tableId,
          cellId: row.cells[0]?.cellId || `row_${rIdx}`,
          row: rIdx,
          col: 0,
          oldText: row.cells.map(c => c.text).join(" "),
          newText: "",
        });
      }
    });
    const originalRowsToKeep = effectiveModel.rows.slice(0, originalRowsCount).filter((_, rIdx) => presentOriginalRowIndices.has(rIdx));
    const addedRows = effectiveModel.rows.slice(originalRowsCount);
    effectiveModel.rows = [...originalRowsToKeep, ...addedRows];
  }

  effectiveModel.rowsCount = effectiveModel.rows.length;
  effectiveModel.columnsCount = Math.max(
    effectiveModel.columnsCount,
    ...effectiveModel.rows.map(r => r.cells.length),
    effectiveModel.gridColumnsTwips?.length || 0
  );
  effectiveModel.rows.forEach((r, idx) => {
    r.rowIndex = idx;
    r.cells.forEach(c => { c.rowIndex = idx; });
  });

  return {
    effectiveModel,
    hasEdits: userEdits.length > 0,
    userEdits,
  };
}

/**
 * Đồng bộ hóa toàn bộ danh sách importedTables với nội dung HTML hiện hành
 */
export function syncImportedTablesFromHtml(
  html: string,
  baseTables?: Record<string, TableModel>
): { syncedTables: Record<string, TableModel>; userEdits: CellEditDiff[] } {
  if (!baseTables || Object.keys(baseTables).length === 0) {
    return { syncedTables: {}, userEdits: [] };
  }

  const syncedTables: Record<string, TableModel> = {};
  const allEdits: CellEditDiff[] = [];

  // Môi trường DOM
  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const tableEls = Array.from(doc.querySelectorAll("table[data-source-table-id]"));
    
    // Gán bản sao mặc định
    for (const [id, model] of Object.entries(baseTables)) {
      syncedTables[id] = model;
    }

    tableEls.forEach(tableEl => {
      const tableId = tableEl.getAttribute("data-source-table-id");
      if (tableId && baseTables[tableId]) {
        const { effectiveModel, userEdits } = syncTableModelFromHtml(tableEl, baseTables[tableId]);
        syncedTables[tableId] = effectiveModel;
        allEdits.push(...userEdits);
      }
    });
  } else {
    // Regex parsing
    const tableMatches = html.match(/<table\b[^>]*data-source-table-id=["']([^"']+)["'][\s\S]*?<\/table>/gi) || [];
    for (const [id, model] of Object.entries(baseTables)) {
      syncedTables[id] = model;
    }

    tableMatches.forEach(tableHtml => {
      const idMatch = tableHtml.match(/data-source-table-id=["']([^"']+)["']/i);
      const tableId = idMatch ? idMatch[1] : undefined;
      if (tableId && baseTables[tableId]) {
        const { effectiveModel, userEdits } = syncTableModelFromHtml(tableHtml, baseTables[tableId]);
        syncedTables[tableId] = effectiveModel;
        allEdits.push(...userEdits);
      }
    });
  }

  return { syncedTables, userEdits: allEdits };
}
