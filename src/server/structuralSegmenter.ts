/**
 * @file structuralSegmenter.ts
 * @description Pure structural segmenter and field mapping engine for Docs-ND30.
 * Operates offline, adheres strictly to "One Block - One Owner" and Zero Data Loss.
 */

import type {
  SourceBlock,
  StructuredImport,
  ExtractedField,
  AppendixDocument,
  SourceRegion,
} from "../shared/schemas/document.schema.ts";
import { classifyTable, HEADER_MARKER_REGEX, type TableClassificationResult, type TableOwner, type TableRole } from "./tableRoleClassifier.ts";
import { isSeparatorParagraph } from "../shared/separator.ts";
import { embeddedRecipientsSignatureTable } from "../shared/embeddedSignatureTable.ts";
export { classifyTable, type TableClassificationResult, type TableOwner, type TableRole };
export { isSeparatorParagraph };

/**
 * Standard regex patterns for Vietnamese administrative & party documents
 */
export const NATIONAL_HEADER_1_REGEX = /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM|ĐẢNG CỘNG SẢN VIỆT NAM/i;
export const NATIONAL_HEADER_2_REGEX = /Độc lập\s*-\s*Tự do\s*-\s*Hạnh phúc/i;
export const DATE_LOCATION_REGEX = /(?:^|\b)([\p{L}\s\.\-]+),\s*ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})(?:\b|$)/u;
export const REF_NUMBER_REGEX = /(?:^|[\r\n\t|;])\s*(?:Số:\s*([^\n\r,;\t|]+)|Số\s+([0-9]+[^\n\r,;\t|]*)|Số\s*(\.{2,}[^\n\r,;\t|]*))/i;

export const DOC_TYPE_KEYWORDS = [
  "QUYẾT ĐỊNH", "KẾ HOẠCH", "TỜ TRÌNH", "THÔNG BÁO", "NGHỊ QUYẾT",
  "BÁO CÁO", "NGHỊ ĐỊNH", "CHỈ THỊ", "HƯỚNG DẪN", "CÔNG VĂN", "BIÊN BẢN"
];

/**
 * True when the letters in `text` are mostly uppercase (>= 80%). Header titles
 * and org names are uppercase; body prose is normally mixed case.
 */
function isUpperDominantText(text: string, threshold = 0.8): boolean {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return false;
  let upper = 0;
  for (const ch of letters) {
    if (ch.toUpperCase() === ch && ch.toLowerCase() !== ch) upper += 1;
  }
  return upper / letters.length >= threshold;
}

/** Match a standalone document-type title line (exact, or short uppercase heading). */
function matchDocumentTypeTitle(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  const draftTitle = /^DỰ\s+THẢO\s+/u.test(trimmed.toUpperCase());
  const upper = trimmed.toUpperCase().replace(/^DỰ\s+THẢO\s+/u, "");
  for (const kw of DOC_TYPE_KEYWORDS) {
    if (upper === kw) return kw;
    if (draftTitle) continue;
    if ((upper.startsWith(kw + " ") || upper.startsWith(kw + ":")) && trimmed.length <= 120 && isUpperDominantText(trimmed)) {
      return kw;
    }
  }
  return null;
}

/**
 * Normalise a reference-number line according to the **confirmed** regime.
 * Party documents keep the "Số " form (no colon); administrative documents
 * use "Số: ". This is the single normalisation path used by segmentation,
 * reconstruction and the UI regime switch.
 */
export function formatReferenceNumber(rawLine: string, standardType?: string): string {
  const trimmed = rawLine.trim();
  if (!trimmed) return trimmed;
  const isParty = standardType === "party";
  // Preserve an explicit colon written in the source (data preservation).
  if (/^Số\s*:/iu.test(trimmed)) return trimmed;
  const value = trimmed.replace(/^Số\s+/iu, "").trim();
  if (!value) return trimmed;
  return isParty ? `Số ${value}` : `Số: ${value}`;
}

/**
 * A leading paragraph may only become an organisation header when it looks like
 * an org name (uppercase-dominant or a recognisable org prefix), not when it is
 * a normal body sentence. Prevents case F (no header) from swallowing the body.
 */
export function isOrgNameLikeLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 140) return false;
  if (/[.;:,]\s*$/u.test(trimmed)) return false;
  if (/^(?:[-+*•]|\d+[.)])\s+/u.test(trimmed)) return false;
  if (isUpperDominantText(trimmed)) return true;
  return /^(?:CÔNG TY|TỔNG CÔNG TY|SỞ|PHÒNG|BAN|CHI CỤC|TRUNG TÂM|VIỆN|TRƯỜNG|CỤC|ĐOÀN|HỘI|ỦY BAN|UBND|ĐẢNG ỦY|ĐẢNG BỘ|CHI BỘ)\b/iu.test(trimmed);
}

/**
 * A table can carry the document-type title (1-column title table, or a table
 * whose non-empty cells are all title lines). Returns the matched type and the
 * cell coordinate so the field keeps real provenance.
 */
function findDocumentTypeInTable(
  block: SourceBlock
): { value: string; cell: { rowIndex: number; colIndex: number }; quote: string } | null {
  const rows = block.tableData || [];
  const nonEmpty: Array<{ text: string; rowIndex: number; colIndex: number }> = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const text = (row[colIndex] || "").trim();
      if (text) nonEmpty.push({ text, rowIndex, colIndex });
    }
  }
  if (nonEmpty.length === 0) return null;

  for (const cell of nonEmpty) {
    const keyword = matchDocumentTypeTitle(cell.text);
    if (!keyword) continue;
    // For multi-cell tables only accept when every non-empty cell is a title line,
    // so a data table is never removed from the body just because one cell matches.
    if (nonEmpty.length > 1 && !nonEmpty.every((c) => Boolean(matchDocumentTypeTitle(c.text)))) {
      continue;
    }
    return { value: keyword, cell: { rowIndex: cell.rowIndex, colIndex: cell.colIndex }, quote: cell.text };
  }
  return null;
}



function extractHeaderDate(text: string): Pick<ExtractedField<string>, "value" | "confidence" | "status"> | null {
  for (const sourceLine of text.split(/\r?\n/)) {
    const trimmedLine = sourceLine.trim();
    if (!trimmedLine) continue;

    // Check full line first (supports templates where spaces are left for blank day/month)
    const fullComplete = trimmedLine.match(DATE_LOCATION_REGEX);
    if (fullComplete) return { value: fullComplete[0].trim(), confidence: "high", status: "extracted" };

    const fullPartial = trimmedLine.match(/^([\p{L}\s.\-]+),\s*ngày\s*(.*?)\s*tháng\s*(.*?)\s*năm\s*(.*?)\s*$/u);
    if (fullPartial) {
      const location = fullPartial[1].trim();
      const parts = fullPartial.slice(2).map((part, index) => {
        const value = part.trim();
        if (!value || /^[.…\s]+$/.test(value)) return "…";
        if (index < 2 && /^\d{1,2}$/.test(value)) return value;
        if (index === 2 && /^\d{4}$/.test(value)) return value;
        return null;
      });
      if (location && location.length <= 60 && !parts.some((part) => part === null)) {
        return {
          value: `${location}, ngày ${parts[0]} tháng ${parts[1]} năm ${parts[2]}`,
          confidence: "medium",
          status: "ambiguous",
        };
      }
    }

    // If line has tab or pipe or multi-column, test individual segments
    const segments = trimmedLine.split(/(?:\t+|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
    for (const line of segments) {
      const complete = line.match(DATE_LOCATION_REGEX);
      if (complete) return { value: complete[0].trim(), confidence: "high", status: "extracted" };

      const partial = line.match(/(?:^|[,:\t\-])\s*([\p{L}\s.\-]+),\s*ngày\s*(.*?)\s*tháng\s*(.*?)\s*năm\s*(.*?)\s*$/u);
      if (!partial) continue;
      const location = partial[1].trim();
      const parts = partial.slice(2).map((part, index) => {
        const value = part.trim();
        if (!value || /^[.…\s]+$/.test(value)) return "…";
        if (index < 2 && /^\d{1,2}$/.test(value)) return value;
        if (index === 2 && /^\d{4}$/.test(value)) return value;
        return null;
      });
      if (!location || location.length > 60 || parts.some((part) => part === null)) continue;
      return {
        value: `${location}, ngày ${parts[0]} tháng ${parts[1]} năm ${parts[2]}`,
        confidence: "medium",
        status: "ambiguous",
      };
    }
  }
  return null;
}

export function parseOrgHeaders(rawLeftLines: string[]): { orgHeader1: string; orgHeader2: string; draftNote?: string } {
  const expanded: string[] = [];
  for (const raw of rawLeftLines) {
    const sub = raw.split(/(?: {3,}|\t+)/).map(s => s.trim()).filter(Boolean);
    expanded.push(...sub);
  }

  // Filter out dividers (dashes, underscores) and asterisks
  const nonDivider = expanded.filter(l => l && !/^[_–—\-]+$/.test(l) && !/^\s*\*+\s*$/.test(l));

  // Separate draft status notes from org lines
  const DRAFT_NOTE_REGEX = /^(?:BẢN\s+)?(?:HOÀN\s+THIỆN|DỰ\s+THẢO|BẢN\s+THẢO|TÀI\s+LIỆU\s+LƯU\s+HÀNH\s+NỘI\s+BỘ|XEM\s+XÉT[,\s]+TRÌNH\s+KÝ)\b/i;
  let draftNote: string | undefined;
  const lines: string[] = [];
  for (const l of nonDivider) {
    if (DRAFT_NOTE_REGEX.test(l) || /\b(?:xem xét,\s*trình ký|dự thảo lần)\b/i.test(l)) {
      draftNote = draftNote ? `${draftNote}; ${l}` : l;
    } else {
      lines.push(l);
    }
  }

  if (lines.length === 0) return { orgHeader1: "", orgHeader2: "", draftNote };
  if (lines.length === 1) return { orgHeader1: "", orgHeader2: lines[0], draftNote };
  if (lines.length === 2) return { orgHeader1: lines[0], orgHeader2: lines[1], draftNote };

  const CHILD_KEYWORDS = /^(CÔNG TY|CHI CỤC|TRUNG TÂM|PHÒNG|BAN|VIỆN|TRƯỜNG|CỤC|DOANH NGHIỆP|ĐOÀN|TỔ|HỘI ĐỒNG|CHI BỘ|ĐẢNG BỘ)\b/i;
  const childIdx = lines.findIndex((l, idx) => idx > 0 && CHILD_KEYWORDS.test(l));
  if (childIdx > 0) {
    return {
      orgHeader1: lines.slice(0, childIdx).join("\n"),
      orgHeader2: lines.slice(childIdx).join("\n"),
      draftNote,
    };
  }

  const half = Math.floor(lines.length / 2);
  return {
    orgHeader1: lines.slice(0, half).join("\n"),
    orgHeader2: lines.slice(half).join("\n"),
    draftNote,
  };
}

function isSignFormula(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 80) return false;
  if (/^[-*+•\d.]/.test(clean)) return false;
  if (/^(kính gửi|nơi nhận|lưu\s*:)/i.test(clean)) return false;
  if (/[./]\./.test(clean) || /;\s*$/.test(clean)) return false;
  if (/\b(kính trình|xem xét|báo cáo|quyết định|yêu cầu|đề nghị|căn cứ)\b/i.test(clean)) return false;

  const upper = clean.toUpperCase();
  // Support both dot and non-dot authority prefixes (TM., T/M., TM , T/M , KT., TL., TUQ.)
  if (/^\s*(?:TM[\.\s]|T\/M[\.\s]|KT[\.\s]|TL[\.\s]|TUQ[\.\s]|TM$|T\/M$|KT$|TL$|TUQ$)/i.test(clean)) {
    return true;
  }

  const titles = [
    "GIÁM ĐỐC", "TỔNG GIÁM ĐỐC", "PHÓ GIÁM ĐỐC",
    "CHỦ TỊCH", "PHÓ CHỦ TỊCH",
    "BÍ THƯ", "PHÓ BÍ THƯ",
    "TRƯỞNG BAN", "PHÓ TRƯỞNG BAN",
    "TRƯỞNG PHÒNG", "PHÓ TRƯỞNG PHÒNG",
    "TRƯỞNG ĐOÀN", "PHÓ TRƯỞNG ĐOÀN",
    "TỔ TRƯỞNG", "PHÓ TỔ TRƯỞNG",
    "ĐOÀN TRƯỞNG", "ĐỘI TRƯỞNG",
    "CHỦ NHIỆM", "PHÓ CHỦ NHIỆM",
    "VIỆN TRƯỞNG", "HIỆU TRƯỞNG",
    "CHỦ TỌA", "THƯ KÝ", "NGƯỜI LẬP", "ĐẠI DIỆN"
  ];
  return titles.some(t => upper === t || upper.startsWith(t + " ") || upper.startsWith(t + "\t") || upper.startsWith(t + "\n"));
}

function isAppendixHeading(text: string): boolean {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();
  // Standalone heading or starts with PHỤ LỤC
  if (!upper.startsWith("PHỤ LỤC")) return false;
  // If text is long narrative sentence, it is not a heading
  if (trimmed.length > 90) return false;
  // Must match PHỤ LỤC, PHỤ LỤC I, PHỤ LỤC 01, PHỤ LỤC:..., PHỤ LỤC SỐ...
  return /^PHỤ LỤC(?:\s+[IVXLCDM\d]+|\s*[:\-\.]|\s*$)/i.test(upper);
}

/**
 * Detects whether a table is an action plan, schedule, matrix, or content data table.
 * Uses semantic analysis of column headers, index sequences, and task timelines rather than a rigid row count,
 * ensuring genuine multi-row signature tables (e.g. 5-6 rows with spacing and multi-tier signers) are preserved.
 */
export function isActionPlanOrDataTable(b: SourceBlock): boolean {
  if (b.kind !== "table" || !b.tableShape) return false;
  const { rows, columns } = b.tableShape;
  const data = b.tableData || [];
  if (data.length === 0) return false;

  // Inspect first 2 rows for common administrative table header terms
  const row0 = (data[0] || []).map(c => (c || "").trim().toLowerCase());
  const row1 = data.length > 1 ? (data[1] || []).map(c => (c || "").trim().toLowerCase()) : [];
  const headers = [...row0, ...row1];

  // Specific column header markers for action plans and task matrices
  const planKeywords = [
    "tt", "stt", "số tt", "số thứ tự",
    "nội dung", "nội dung công việc", "nhiệm vụ", "hạng mục", "công việc", "hoạt động",
    "chủ trì", "đơn vị chủ trì", "cơ quan chủ trì", "người chủ trì", "phụ trách",
    "phối hợp", "đơn vị phối hợp", "cơ quan phối hợp", "cơ quan tham gia", "thành phần",
    "thời gian", "thời gian thực hiện", "thời hạn", "tiến độ", "kỳ thực hiện",
    "kinh phí", "dự toán", "nguồn vốn", "ngân sách",
    "kết quả", "sản phẩm", "đầu ra", "chỉ tiêu", "địa điểm", "ghi chú"
  ];

  const matchedKeywords = headers.filter(h =>
    planKeywords.some(kw => h === kw || h.startsWith(kw + " ") || h.includes(kw))
  );

  const hasIndexCol = headers.some(h => /^(?:tt|stt|số\s*tt|số\s*thứ\s*tự)$/i.test(h.trim()));
  
  // 1. Definite plan markers: index column or 2+ task headers
  if (hasIndexCol && columns >= 2) return true;
  if (matchedKeywords.length >= 2) return true;

  // 2. Check if column 0 contains sequential ordinal numbers (1, 2, 3, 4...)
  // Signature tables NEVER have an index column of ordinal numbers
  if (data.length >= 3) {
    const col0Items = data.slice(1).map(r => (r[0] || "").trim());
    const numericCount = col0Items.filter(item => /^\d{1,3}$/.test(item)).length;
    if (numericCount >= 3 && numericCount >= (col0Items.length * 0.5)) {
      return true;
    }
  }

  // 3. Check for task scheduling cells (Quý I, Quý II, năm 2026-2031...)
  const flat = data.flat().join(" ");
  if (/quý\s+[I|V|X\d]+/i.test(flat) && (rows >= 3 || columns >= 3)) return true;
  if (/\b(?:202\d|203\d)\s*-\s*(?:202\d|203\d)\b/.test(flat) && rows >= 3) return true;

  // 4. Check for substantive narrative task descriptions (> 60 chars per cell in body cells)
  let longNarrativeCells = 0;
  for (let r = 1; r < data.length; r++) {
    for (const cell of (data[r] || [])) {
      if (cell && cell.length > 60 && /[a-zà-ỹ]\s+[a-zà-ỹ]/i.test(cell)) {
        longNarrativeCells++;
      }
    }
  }
  if (longNarrativeCells >= 3) {
    return true;
  }

  return false;
}

/**
 * Main Structural Segmentation function
 */
function isSignatureOrRecipientsBlock(b: SourceBlock): boolean {
  if (b.kind === "table" && b.tableShape && b.tableShape.columns >= 2) {
    if (embeddedRecipientsSignatureTable(b)) return false;
    if (isActionPlanOrDataTable(b)) return false;
    const data = b.tableData || [];
    const flatText = data.flat().join(" ");
    const leftColText = data.map(r => r[0] || "").join("\n");
    const rightColText = data.map(r => r[r.length - 1] || "").join("\n");
    const hasRecipients = /Nơi nhận\s*:/i.test(leftColText) || /Nơi nhận\s*:/i.test(flatText);
    const rightLines = rightColText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const hasSign = rightLines.some(l => isSignFormula(l)) ||
                    isSignFormula(flatText) ||
                    rightColText.toUpperCase().includes("GIÁM ĐỐC") ||
                    rightColText.toUpperCase().includes("TRƯỞNG ĐOÀN") ||
                    /^\s*(?:TM[\.\s]|T\/M[\.\s]|KT[\.\s]|TL[\.\s]|TUQ[\.\s])/i.test(rightColText.trim());
    return Boolean((hasRecipients && hasSign) || (b.tableShape.rows <= 3 && hasSign) || hasRecipients);
  }
  if (b.kind === "paragraph") {
    const text = b.text.trim();
    if (/^Nơi nhận\s*:/i.test(text)) return true;
    if (isSignFormula(text)) return true;
    if (/^\s*(?:TM[\.\s]|T\/M[\.\s]|KT[\.\s]|TL[\.\s]|TUQ[\.\s])\b/i.test(text)) return true;
  }
  return false;
}

export function segmentSourceBlocks(
  rawBlocks: SourceBlock[],
  options: {
    filename?: string;
    fileType?: "docx" | "txt";
    standardType?: string;
  } = {}
): StructuredImport {
  // Deep clone blocks so caller data remains untouched
  const blocks: SourceBlock[] = rawBlocks.map(b => ({
    ...b,
    tableShape: b.tableShape ? { ...b.tableShape } : undefined,
    tableData: b.tableData ? b.tableData.map(r => [...r]) : undefined,
    role: "unclassified" as SourceRegion,
  }));

  const fields: Record<string, ExtractedField<string>> = {
    orgHeader1: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    orgHeader2: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    nationalHeader1: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    nationalHeader2: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    referenceNumber: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    locationAndDate: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    documentType: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    subject: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    signTitle: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    signName: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
    recipients: { value: null, confidence: "low", status: "missing", sourceBlockIds: [] },
  };

  const total = blocks.length;
  let draftNote: string | undefined = undefined;
  if (total === 0) {
    return {
      source: {
        filename: options.filename || "untitled",
        type: options.fileType || "docx",
        blockCount: 0,
      },
      fields,
      body: { html: "", sourceBlockIds: [] },
      appendices: [],
      unclassified: [],
      order: [],
    };
  }

  // =========================================================================
  // STEP 1: HEADER EXTRACTION (Block 0 table or top paragraphs)
  // =========================================================================
  let headerBlockIds: string[] = [];
  let nextStartIndex = 0;
  let headerTableIdx = -1;

  const markerBlockIds: string[] = [];
  let markerDraftNote: string | undefined;

  for (let i = 0; i < Math.min(total, 4); i++) {
    const b = blocks[i];
    if (b.kind === "paragraph") {
      const cleanText = b.text.trim();
      if (!cleanText || /^[---_\s*]{3,}$/.test(cleanText)) {
        b.role = "separator";
        continue;
      }
      if (cleanText.length <= 60 && HEADER_MARKER_REGEX.test(cleanText)) {
        b.role = "header";
        markerBlockIds.push(b.id);
        if (!markerDraftNote) markerDraftNote = cleanText;
        continue;
      }
      break;
    }
    if (b.kind === "table" && b.tableShape && b.tableShape.columns >= 2) {
      const classification = classifyTable(b, blocks.slice(0, i), options.standardType === "party" ? "party" : "administrative");
      if (classification.owner === "header") {
        headerTableIdx = i;
        break;
      }
      // Nếu là bảng nhưng không phải header (ví dụ bảng không có Quốc hiệu/Đảng), dừng quét header table
      break;
    }
    break;
  }

  if (headerTableIdx !== -1) {
    if (markerDraftNote && !draftNote) {
      draftNote = markerDraftNote;
    }
    const headerBlock = blocks[headerTableIdx];
    headerBlock.role = "header";
    headerBlockIds.push(...markerBlockIds, headerBlock.id);
    nextStartIndex = headerTableIdx + 1;

    const tableData = headerBlock.tableData || [];
    const firstRow = tableData[0] || [];
    const leftText = (firstRow[0] || "").trim();
    const rightText = (firstRow[1] || "").trim();

    // Parse National Header & Motto from right cell
    if (/ĐẢNG CỘNG SẢN VIỆT NAM/i.test(rightText)) {
      fields.nationalHeader1 = { value: "ĐẢNG CỘNG SẢN VIỆT NAM", confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id] };
      fields.nationalHeader2 = { value: "", confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id] };
    } else if (NATIONAL_HEADER_1_REGEX.test(rightText)) {
      fields.nationalHeader1 = { value: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id] };
      fields.nationalHeader2 = { value: "Độc lập - Tự do - Hạnh phúc", confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id] };
    }

    // Header tables may put the date in a later row, beside the reference line.
    for (let rowIndex = 0; rowIndex < tableData.length && !fields.locationAndDate.value; rowIndex++) {
      for (const rawLine of (tableData[rowIndex]?.[1] || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        const dateMatch = extractHeaderDate(line);
        if (!dateMatch) continue;
        fields.locationAndDate = {
          ...dateMatch,
          sourceBlockIds: [headerBlock.id],
          sourceCell: { rowIndex, colIndex: 1 },
          exactQuote: line,
        };
        break;
      }
    }

    // Parse Org headers and Reference number from left cell
    const leftLines = leftText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const nonRefLines: string[] = [];
    for (const line of leftLines) {
      const refMatch = line.match(REF_NUMBER_REGEX);
      if (refMatch) {
        fields.referenceNumber = {
          value: formatReferenceNumber(line, options.standardType),
          confidence: "high",
          status: "extracted",
          sourceBlockIds: [headerBlock.id],
          sourceCell: { rowIndex: 0, colIndex: 0 },
          exactQuote: line,
        };
      } else if (!line.includes("---") && !line.includes("___")) {
        nonRefLines.push(line);
      }
    }

    const orgs = parseOrgHeaders(nonRefLines);
    if (orgs.draftNote) {
      draftNote = orgs.draftNote;
    }
    if (orgs.orgHeader1) {
      fields.orgHeader1 = { value: orgs.orgHeader1, confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id] };
    }
    if (orgs.orgHeader2) {
      fields.orgHeader2 = {
        value: orgs.orgHeader2,
        confidence: "high",
        status: "extracted",
        sourceBlockIds: [headerBlock.id],
        note: orgs.draftNote ? `Ghi chú bản thảo nguồn: ${orgs.draftNote}` : undefined,
      };
    }

    // The lower left cell can contain both "Số:" and the official-letter
    // subject. Keep each line's exact source quote for table coverage checks.
    for (let rowIndex = 1; rowIndex < tableData.length; rowIndex++) {
      for (const rawLine of (tableData[rowIndex]?.[0] || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!fields.referenceNumber.value && REF_NUMBER_REGEX.test(line)) {
          fields.referenceNumber = {
            value: formatReferenceNumber(line, options.standardType),
            confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id],
            sourceCell: { rowIndex, colIndex: 0 }, exactQuote: line,
          };
        } else if (!fields.subject.value && /^(?:V\/v|Về việc)\s+/i.test(line)) {
          fields.subject = {
            value: line, confidence: "high", status: "extracted", sourceBlockIds: [headerBlock.id],
            sourceCell: { rowIndex, colIndex: 0 }, exactQuote: line,
          };
        }
      }
    }

    // Check subsequent paragraph(s) for referenceNumber or Date
    for (let i = nextStartIndex; i < Math.min(nextStartIndex + 3, total); i++) {
      const b = blocks[i];
      if (b.kind === "paragraph") {
        const text = b.text.trim();
        if (!text) {
          b.role = "separator";
          continue;
        }
        if (DOC_TYPE_KEYWORDS.some(kw => text.toUpperCase() === kw || text.toUpperCase().startsWith(kw + " ") || text.toUpperCase().startsWith(kw + ":"))) {
          break;
        }
        const parts = text.split(/(?:\t+| {2,}|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
        let foundMeta = false;
        for (const part of parts) {
          const refMatch = part.match(REF_NUMBER_REGEX);
          if (refMatch && !fields.referenceNumber.value) {
            fields.referenceNumber = {
              value: formatReferenceNumber(part, options.standardType),
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [b.id],
            };
            foundMeta = true;
          }
          const dMatch = extractHeaderDate(part);
          if (dMatch && !fields.locationAndDate.value) {
            fields.locationAndDate = { ...dMatch, sourceBlockIds: [b.id] };
            foundMeta = true;
          }
        }
        if (foundMeta) {
          b.role = "metadata";
          nextStartIndex = i + 1;
        } else {
          break;
        }
      } else {
        break;
      }
    }
  } else {
    for (const bId of markerBlockIds) {
      const b = blocks.find(x => x.id === bId);
      if (b && b.role === "header") b.role = "unclassified";
    }
    // Header in top paragraphs
    let pIdx = 0;
    while (pIdx < Math.min(total, 8)) {
      const b = blocks[pIdx];
      if (b.kind !== "paragraph") break;
      const text = b.text.trim();
      if (!text) {
        b.role = "separator";
        pIdx++;
        continue;
      }
      if (DOC_TYPE_KEYWORDS.some(kw => text.toUpperCase() === kw || text.toUpperCase().startsWith(kw + " ") || text.toUpperCase().startsWith(kw + ":"))) {
        break;
      }

      // Hướng dẫn 05 uses a standalone asterisk beneath the issuing unit.
      // It is part of the party header only when embedded within the party header cluster
      // (preceded by issuing unit lines and followed by reference number, Party title, date, or doc type).
      if (options.standardType === "party" && (text === "*" || text === "***")) {
        const hasPrecedingOrg = pIdx > 0 && headerBlockIds.length > 0;
        const remainingBlocks = blocks.slice(pIdx + 1, Math.min(total, 8));
        const hasFollowingPartyContext = remainingBlocks.some(nextB => {
          if (nextB.kind !== "paragraph") return false;
          const nextText = nextB.text.trim();
          return NATIONAL_HEADER_1_REGEX.test(nextText) ||
                 REF_NUMBER_REGEX.test(nextText) ||
                 extractHeaderDate(nextText) !== null ||
                 DOC_TYPE_KEYWORDS.some(kw => nextText.toUpperCase() === kw || nextText.toUpperCase().startsWith(kw + " "));
        });

        if (hasPrecedingOrg && hasFollowingPartyContext) {
          b.role = "header";
          headerBlockIds.push(b.id);
          nextStartIndex = pIdx + 1;
          pIdx++;
          continue;
        } else {
          // Without preceding party organ and following party context, do not classify as party header.
          break;
        }
      }

      let isHeaderPart = false;
      const parts = text.split(/(?:\t+| {2,}|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (NATIONAL_HEADER_1_REGEX.test(part) && !fields.nationalHeader1.value) {
          fields.nationalHeader1 = {
            value: /ĐẢNG/i.test(part) ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
            confidence: "high", status: "extracted", sourceBlockIds: [b.id]
          };
          isHeaderPart = true;
        }
        if (NATIONAL_HEADER_2_REGEX.test(part) && !fields.nationalHeader2.value) {
          fields.nationalHeader2 = { value: "Độc lập - Tự do - Hạnh phúc", confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
          isHeaderPart = true;
        }
        const refMatch = part.match(REF_NUMBER_REGEX);
        if (refMatch && !fields.referenceNumber.value) {
          fields.referenceNumber = {
            value: formatReferenceNumber(part, options.standardType),
            confidence: "high", status: "extracted", sourceBlockIds: [b.id]
          };
          isHeaderPart = true;
        }
        const dateMatch = extractHeaderDate(part);
        if (dateMatch && !fields.locationAndDate.value) {
          fields.locationAndDate = { ...dateMatch, sourceBlockIds: [b.id] };
          isHeaderPart = true;
        }
      }

      if (isHeaderPart) {
        b.role = "header";
        headerBlockIds.push(b.id);
        nextStartIndex = pIdx + 1;
      } else if (!fields.nationalHeader1.value && pIdx < 3 && text.length <= 120 && isOrgNameLikeLine(text)) {
        if (!fields.orgHeader2.value) {
          fields.orgHeader2 = { value: text, confidence: "medium", status: "extracted", sourceBlockIds: [b.id] };
        } else if (!fields.orgHeader1.value) {
          fields.orgHeader1 = fields.orgHeader2;
          fields.orgHeader2 = { value: text, confidence: "medium", status: "extracted", sourceBlockIds: [b.id] };
        }
        b.role = "header";
        headerBlockIds.push(b.id);
        nextStartIndex = pIdx + 1;
      } else {
        break;
      }
      pIdx++;
    }
  }

  // Plain text documents often put the title before the reference/date. Keep
  // these early metadata lines even when the header scanner stopped at title.
  if (options.fileType === "txt" && !fields.referenceNumber.value) {
    for (const block of blocks.slice(0, Math.min(6, total))) {
      if (block.kind !== "paragraph" || !/^Số\s*:/i.test(block.text.trim())) continue;
      fields.referenceNumber = { value: block.text.trim(), confidence: "high", status: "extracted", sourceBlockIds: [block.id] };
      block.role = "metadata";
      break;
    }
  }

  // =========================================================================
  // STEP 2: DATE & LOCATION (if not in header)
  // =========================================================================
  if (!fields.locationAndDate.value && nextStartIndex < total) {
    for (let i = nextStartIndex; i < Math.min(nextStartIndex + 3, total); i++) {
      const b = blocks[i];
      if (b.kind === "paragraph" && b.text.trim()) {
        const dateMatch = extractHeaderDate(b.text);
        if (dateMatch) {
          b.role = "metadata";
          fields.locationAndDate = {
            ...dateMatch,
            sourceBlockIds: [b.id],
          };
          nextStartIndex = Math.max(nextStartIndex, i + 1);
          break;
        }
      }
    }
  }

  // =========================================================================
  // STEP 3: DOCUMENT TYPE & SUBJECT
  // =========================================================================
  // The document-type keyword list is `DOC_TYPE_KEYWORDS`; the title is matched
  // through `matchDocumentTypeTitle` so the paragraph path and the table path
  // apply exactly the same rule (S2-F01).
  let docTypeIndex = -1;
  // Search order: the original window (blocks after the header/date steps) first,
  // then the earlier lead blocks. The title may precede a body opening that also
  // carries the date, so we must not lose it. Only blocks/cells with real content
  // are accepted as provenance; no provenance-free inference.
  const primaryStart = options.fileType === "txt" ? 0 : nextStartIndex;
  const candidateIndexes: number[] = [];
  for (let i = primaryStart; i < Math.min(primaryStart + 8, total); i++) candidateIndexes.push(i);
  if (options.fileType !== "txt") {
    for (let i = 0; i < Math.min(primaryStart, 10); i++) {
      if (!candidateIndexes.includes(i)) candidateIndexes.push(i);
    }
  }

  for (const i of candidateIndexes) {
    const b = blocks[i];
    if (!b || b.role === "header") continue;

    if (b.kind === "table") {
      const tableTitle = findDocumentTypeInTable(b);
      if (tableTitle) {
        docTypeIndex = i;
        b.role = "metadata";
        fields.documentType = {
          value: tableTitle.value,
          confidence: "high",
          status: "extracted",
          sourceBlockIds: [b.id],
          sourceCell: tableTitle.cell,
          exactQuote: tableTitle.quote,
        };
        break;
      }
      continue;
    }

    if (b.kind !== "paragraph") continue;
    const trimmed = b.text.trim();
    const text = trimmed.toUpperCase();
    if (!text) continue;

    // S2-F01 (tái audit 20/10/2026): a body sentence that merely *starts* with
    // a document-type keyword ("Báo cáo tình hình thực hiện nhiệm vụ …") must
    // NOT be promoted to the document type and must NOT leave the body. The
    // paragraph path now uses exactly the same rule as the table path
    // (`matchDocumentTypeTitle`): an exact keyword, or a short
    // uppercase-dominant heading. The detector (`regimeDetection.ts`) already
    // applied this rule, so the two stages no longer disagree.
    const keyword = matchDocumentTypeTitle(trimmed);
    if (keyword) {
      docTypeIndex = i;
      b.role = "metadata";
      const isDraftTitle = /^DỰ\s+THẢO\s+/u.test(text);
      if (isDraftTitle && !draftNote) draftNote = "DỰ THẢO";
      fields.documentType = {
        value: isDraftTitle ? keyword : text,
        confidence: "high",
        status: "extracted",
        sourceBlockIds: [b.id],
        exactQuote: trimmed,
      };
      break;
    }
  }

  if (docTypeIndex !== -1) {
    nextStartIndex = Math.max(nextStartIndex, docTypeIndex + 1);
  }
  // No provenance-free inference: when no block or table cell actually carries
  // a title, `documentType` stays missing and the user can choose it manually.

  // Subject extraction (block following documentType)
  if (nextStartIndex < total) {
    const b = blocks[nextStartIndex];
    if (b.kind === "paragraph" && b.text.trim()) {
      const text = b.text.trim();
      const isBodyIntro = /^(?:Hôm nay|Vào hồi|Tại|Thực hiện|Nhằm|Căn cứ|Theo đề nghị|Xét đề nghị)\b/i.test(text) || text.endsWith(":");
      const isExplicitSubject = /^(?:V\/v|Về việc|Kế hoạch|Quyết định|Về)\s+/i.test(text);
      const isStyledSubject = (b.html?.includes("<strong>") || b.html?.includes("<em>")) && (text.length <= 150) && !isBodyIntro;

      const isIntro = (isExplicitSubject || isStyledSubject) && !isBodyIntro;
      if (isIntro) {
        b.role = "metadata";
        fields.subject = {
          value: text,
          confidence: "high",
          status: "extracted",
          sourceBlockIds: [b.id],
        };
        nextStartIndex++;
      }
    }
  }

  // Check for standalone separator paragraph right after subject (e.g. "-----", "___", "- - -")
  // CHỈ đánh dấu là separator (loại khỏi body.html) khi là thể thức Đảng non-công văn có subject (bộ xuất docxExport sẽ tự sinh lại).
  // Nếu là NĐ30 hoặc tài liệu không tự sinh lại dấu này, giữ nguyên trong body để không bị mất!
  const exporterWillRenderSeparator = 
    options.standardType === "party" && 
    (fields.documentType?.value || "").trim().toUpperCase() !== "CÔNG VĂN" && 
    Boolean(fields.subject?.value);

  let partySubjectSeparatorMapped = false;
  while (nextStartIndex < total) {
    const b = blocks[nextStartIndex];
    if (b.kind === "paragraph" && isSeparatorParagraph(b.text)) {
      if (exporterWillRenderSeparator && !partySubjectSeparatorMapped) {
        b.role = "separator";
        partySubjectSeparatorMapped = true;
        nextStartIndex++;
        break; // Only the first separator under subject is mapped to profile separator!
      } else {
        // Administrative regime (NĐ30) or additional separator:
        // Do NOT consume here; let Step 6 extract it as Body!
        break;
      }
    } else {
      break;
    }
  }

  // =========================================================================
  // STEP 4: APPENDICES DETECTION (Looking from end forward or finding headings)
  // =========================================================================
  const appendices: AppendixDocument[] = [];
  const appendixStartIndices: number[] = [];

  // Find all appendix header block indices (must be after subject/docType)
  for (let i = nextStartIndex; i < total; i++) {
    const b = blocks[i];
    if (b.kind === "paragraph" && isAppendixHeading(b.text)) {
      // Must not be a brief mention inside an article
      appendixStartIndices.push(i);
    }
  }

  let bodyEndExclusive = total;

  if (appendixStartIndices.length > 0) {
    bodyEndExclusive = appendixStartIndices[0];

    for (let aIdx = 0; aIdx < appendixStartIndices.length; aIdx++) {
      const startIdx = appendixStartIndices[aIdx];
      let endIdx = aIdx + 1 < appendixStartIndices.length ? appendixStartIndices[aIdx + 1] : total;

      if (aIdx + 1 === appendixStartIndices.length) {
        // Do not absorb trailing signature / recipients blocks into the last appendix!
        let trailingSigStart = -1;
        for (let i = total - 1; i > startIdx; i--) {
          // A signer-like table after an appendix is ambiguous: it may be a
          // form contained in the appendix. Keep its physical source ownership
          // with the appendix and let STEP 5B request review rather than
          // promoting it to the main document footer.
          if (blocks[i].kind !== "table" && isSignatureOrRecipientsBlock(blocks[i])) {
            trailingSigStart = i;
          } else if (trailingSigStart !== -1 && blocks[i].kind === "paragraph" && !blocks[i].text.trim()) {
            trailingSigStart = i;
          } else if (trailingSigStart !== -1) {
            break;
          }
        }
        if (trailingSigStart !== -1) {
          // A recipients list immediately before a signer is part of the same
          // uncertain footer cluster. Do not assign it to an appendix by default.
          for (let i = trailingSigStart - 1; i > startIdx && i >= trailingSigStart - 10; i--) {
            const text = blocks[i].text.trim();
            if (blocks[i].kind !== "paragraph") break;
            if (/^Nơi nhận\s*:/i.test(text)) {
              trailingSigStart = i;
              break;
            }
            if (text && !/^(?:[-–•]\s*|Kính gửi\s*:)/i.test(text)) break;
          }
          endIdx = trailingSigStart;
        }
      }

      const appBlocks = blocks.slice(startIdx, endIdx);

      // Mark roles as appendix
      appBlocks.forEach(b => {
        b.role = "appendix";
      });

      // Extract title and reference text
      const headingBlock = appBlocks[0];
      let title = headingBlock.text.trim();
      let refText = "";
      let contentStart = 1;

      if (appBlocks.length > 1 && appBlocks[1].kind === "paragraph") {
        const nextText = appBlocks[1].text.trim();
        if (/^(Kèm theo|Ban hành kèm theo|\(Kèm theo)/i.test(nextText)) {
          refText = nextText;
          contentStart = 2;
        } else if (!title.includes(":") && title.length < 30) {
          title = `${title}: ${nextText}`;
          contentStart = 2;
        }
      }

      // Collect tables in this appendix
      const appTables = appBlocks
        .filter(b => b.kind === "table" && b.tableShape)
        .map(b => ({
          rows: b.tableShape!.rows,
          columns: b.tableShape!.columns,
          rowCount: b.tableShape!.rows,
          colCount: b.tableShape!.columns,
          data: b.tableData,
        }));

      appendices.push({
        id: `appendix-${aIdx + 1}`,
        title: title || `Phụ lục ${aIdx + 1}`,
        referenceText: refText,
        html: appBlocks.slice(contentStart).map(b => b.html || `<p>${b.text}</p>`).join(""),
        blocks: appBlocks,
        sourceBlockIds: appBlocks.map(b => b.id),
        titleBlockId: headingBlock.id,
        referenceBlockId: contentStart === 2 ? appBlocks[1].id : undefined,
        extractionStatus: endIdx < total && aIdx + 1 === appendixStartIndices.length ? "needs_review" : "confirmed",
        tables: appTables,
      });
    }
  }

  // =========================================================================
  // STEP 5: SIGNATURE & RECIPIENTS DETECTION (Before appendix or end of doc)
  // =========================================================================
  // Search from bodyEndExclusive - 1 backwards
  let sigFoundIndex = -1;
  let signatureHtml: string | undefined;
  for (let i = bodyEndExclusive - 1; i >= nextStartIndex; i--) {
    const b = blocks[i];
    if (b.kind === "table" && b.tableShape && b.tableShape.columns >= 2) {
      if (embeddedRecipientsSignatureTable(b)) continue;
      // 1. Guard against data tables and task schedules: NEVER classify as signature
      if (isActionPlanOrDataTable(b)) {
        continue;
      }

      const data = b.tableData || [];
      const flatText = data.flat().join(" ");
      const leftColText = data.map(r => r[0] || "").join("\n");
      const rightColText = data.map(r => r[r.length - 1] || "").join("\n");
      const hasRecipients = /Nơi nhận\s*:/i.test(leftColText) || /Nơi nhận\s*:/i.test(flatText);

      const rightLines = rightColText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const hasSign = rightLines.some(l => isSignFormula(l)) ||
                      isSignFormula(flatText) ||
                      rightColText.toUpperCase().includes("GIÁM ĐỐC") ||
                      rightColText.toUpperCase().includes("TRƯỞNG ĐOÀN") ||
                      /^\s*(?:TM[\.\s]|T\/M[\.\s]|KT[\.\s]|TL[\.\s]|TUQ[\.\s])/i.test(rightColText.trim());

      // Check if it's meeting minutes / multi-signer table (e.g. 2, 3 or more signers)
      const hasExplicitRecipients = /Nơi nhận\s*:/i.test(leftColText) || /Nơi nhận\s*:/i.test(flatText);
      const isDocMinutes = (fields.documentType?.value || "").toUpperCase().includes("BIÊN BẢN");
      
      const SIGNER_ROLE_REGEX = /^\s*(?:TM\.|T\/M\.|KT\.|TL\.|TUQ\.)?\s*(?:CHỦ TỌA|THƯ KÝ|NGƯỜI LẬP|NGƯỜI GHI|ĐẠI DIỆN|BÊN A|BÊN B|BÊN C|CÁN BỘ|TRƯỞNG ĐOÀN|GIÁM ĐỐC|CHỦ TỊCH|HIỆU TRƯỞNG|TỔ TRƯỞNG)\b/i;
      const isOrgCommittee = (s: string) => /^\s*(?:Ban|Phòng|Tổ)\s+(?:Thư ký|Chủ tọa|Giám sát)\s+[A-ZÀ-Ỵ]/i.test(s.trim());

      const firstRow = data[0] || [];
      const signerColCount = firstRow.filter(cell => {
        const trimmed = (cell || "").trim();
        return trimmed.length <= 60 && SIGNER_ROLE_REGEX.test(trimmed) && !isOrgCommittee(trimmed);
      }).length;
      const hasSignatureNote = /\(k[ýí]/i.test(flatText);

      const isMinutesSignTable = !hasExplicitRecipients && (
        (signerColCount >= 2) ||
        (isDocMinutes && (signerColCount >= 1 || hasSignatureNote)) ||
        (hasSignatureNote && b.tableShape.columns <= 4 && !hasRecipients)
      );

      if ((hasRecipients && hasSign) || isMinutesSignTable || (b.tableShape.rows <= 3 && hasSign)) {
        sigFoundIndex = i;
        b.role = "signature";
        if (isMinutesSignTable) {
          // Format signature table with clean borderless styling for official ND 30 compliance
          signatureHtml = (b.html || "")
            .replace(/border:\s*1px\s*solid\s*#000;?/gi, "border: none;")
            .replace(/<td([^>]*)style="([^"]*)"/gi, (_match, prefix, style) => {
              const cleanStyle = style.replace(/border:\s*1px\s*solid\s*#000;?/gi, "border: none;");
              return `<td${prefix}style="${cleanStyle}; text-align: center; vertical-align: top;"`;
            });
        }

        // Handle multi-signer table (minutes, agreements, 3-column signatures)
        if (isMinutesSignTable && !hasExplicitRecipients) {
          const numCols = b.tableShape.columns;
          const extractedCols: Array<{ title: string; name: string }> = [];

          const isLikelyPersonName = (s: string) => {
            const clean = s.trim();
            if (!clean || clean.length > 45) return false;
            if (/^\d+$/.test(clean)) return false;
            if (/^(?:quý|ngày|tháng|năm|sau|trước|tại|theo)\b/i.test(clean)) return false;
            if (/[;:,]/.test(clean)) return false;
            return true;
          };

          for (let col = 0; col < numCols; col++) {
            const rawColLines = data.map(r => (r[col] || "").trim()).filter(Boolean);
            const flatCol = rawColLines.join("\n");
            const lines = flatCol.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

            // Filter out signature instruction notes like (Ký, ghi rõ họ tên), (Ký, đóng dấu)
            const contentLines = lines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));

            let colTitle = "";
            let colName = "";

            if (contentLines.length >= 2) {
              colTitle = contentLines.slice(0, -1).join("\n");
              const candidate = contentLines[contentLines.length - 1];
              if (isLikelyPersonName(candidate)) {
                colName = candidate;
              } else {
                colTitle = contentLines.join("\n");
              }
            } else if (contentLines.length === 1) {
              const upper = contentLines[0].toUpperCase();
              if (upper.includes("ĐẠI DIỆN") || upper.includes("THƯ KÝ") || upper.includes("CHỦ TỌA") ||
                  upper.includes("CÁN BỘ") || upper.includes("GIÁM ĐỐC") || upper.includes("BÊN") ||
                  upper.includes("NGƯỜI") || upper === contentLines[0]) {
                colTitle = contentLines[0];
              } else if (isLikelyPersonName(contentLines[0])) {
                colName = contentLines[0];
              }
            }

            if (colTitle || colName) {
              extractedCols.push({ title: colTitle, name: colName });
            }
          }

          if (extractedCols.length > 0) {
            // Keep titles and names strictly synchronized at identical indices
            const titles = extractedCols.map(c => c.title || "");
            const names = extractedCols.map(c => c.name || "");

            fields.signTitle = {
              value: titles.join(" | "),
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [b.id],
            };
            fields.signName = {
              value: names.join(" | "),
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [b.id],
            };
          }

          // In minutes documents, recipients is not an error if absent
          if (!fields.recipients.value) {
            fields.recipients = {
              value: "",
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [],
              note: "Biên bản làm việc không bắt buộc thành phần nơi nhận riêng biệt theo Mẫu 1.9 Nghị định 30/2020/NĐ-CP"
            };
          }
        } else {
          // Standard 2-column signature table (Recipients left, Signer right)
          // OR multi-column signature table with Recipients in col 0 and multiple signers in remaining columns
          const numCols = b.tableShape.columns;
          const leftCol = data.map(r => r[0] || "").join("\n");

          if (/Nơi nhận\s*:/i.test(leftCol)) {
            fields.recipients = {
              value: leftCol.trim(),
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [b.id],
            };
          }

          if (numCols > 2) {
            const extractedCols: Array<{ title: string; name: string }> = [];
            for (let col = 1; col < numCols; col++) {
              const colRawLines = data.map(r => (r[col] || "").trim()).filter(Boolean);
              if (colRawLines.length === 0) continue;
              const cleanLines = colRawLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
              let colTitle = "";
              let colName = "";
              if (cleanLines.length >= 2) {
                colTitle = cleanLines.slice(0, -1).join("\n");
                colName = cleanLines[cleanLines.length - 1];
              } else if (cleanLines.length === 1) {
                if (isSignFormula(cleanLines[0]) || cleanLines[0] === cleanLines[0].toUpperCase()) {
                  colTitle = cleanLines[0];
                } else {
                  colName = cleanLines[0];
                }
              }
              if (colTitle || colName) {
                extractedCols.push({ title: colTitle, name: colName });
              }
            }
            if (extractedCols.length > 0) {
              const titles = extractedCols.map(c => c.title || "");
              const names = extractedCols.map(c => c.name || "");
              fields.signTitle = { value: titles.join(" | "), confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
              fields.signName = { value: names.join(" | "), confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
            }
          } else {
            const rightCol = data.map(r => r[r.length - 1] || "").join("\n");
            const rightLines = rightCol.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const cleanRight = rightLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));

            if (cleanRight.length >= 2) {
              fields.signTitle = { value: cleanRight.slice(0, -1).join("\n"), confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
              fields.signName = { value: cleanRight[cleanRight.length - 1], confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
            } else if (cleanRight.length === 1) {
              fields.signTitle = { value: cleanRight[0], confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
            }
          }
        }
        break;
      }
    }
  }

  // If no signature table was found before appendix, search trailing blocks after last appendix
  if (sigFoundIndex === -1 && appendixStartIndices.length > 0 && appendices.length > 0) {
    const lastApp = appendices[appendices.length - 1];
    const postAppStart = lastApp.blocks.length > 0
      ? blocks.findIndex(b => b.id === lastApp.blocks[lastApp.blocks.length - 1].id) + 1
      : total;

    for (let i = total - 1; i >= postAppStart; i--) {
      const b = blocks[i];
      if (b.kind === "table" && b.tableShape && b.tableShape.columns >= 2) {
        if (embeddedRecipientsSignatureTable(b)) continue;
        if (isActionPlanOrDataTable(b)) continue;
        const data = b.tableData || [];
        const flatText = data.flat().join(" ");
        const leftColText = data.map(r => r[0] || "").join("\n");
        const rightColText = data.map(r => r[r.length - 1] || "").join("\n");
        const hasRecipients = /Nơi nhận\s*:/i.test(leftColText) || /Nơi nhận\s*:/i.test(flatText);
        const rightLines = rightColText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const hasSign = rightLines.some(l => isSignFormula(l)) ||
                        isSignFormula(flatText) ||
                        rightColText.toUpperCase().includes("GIÁM ĐỐC") ||
                        rightColText.toUpperCase().includes("TRƯỞNG ĐOÀN") ||
                        /^\s*(?:TM[\.\s]|T\/M[\.\s]|KT[\.\s]|TL[\.\s]|TUQ[\.\s])/i.test(rightColText.trim());

        if ((hasRecipients && hasSign) || (b.tableShape.rows <= 3 && hasSign)) {
          sigFoundIndex = i;
          b.role = "signature";
          const leftCol = data.map(r => r[0] || "").join("\n");
          if (/Nơi nhận\s*:/i.test(leftCol)) {
            fields.recipients = {
              value: leftCol.trim(),
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [b.id],
            };
          }
          const rightCol = data.map(r => r[r.length - 1] || "").join("\n");
          const cleanRight = rightCol.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
            .filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
          if (cleanRight.length >= 2) {
            fields.signTitle = { value: cleanRight.slice(0, -1).join("\n"), confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
            fields.signName = { value: cleanRight[cleanRight.length - 1], confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
          } else if (cleanRight.length === 1) {
            fields.signTitle = { value: cleanRight[0], confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
          }
          break;
        }
      }
    }
  }

  // A confidently recognized mixed recipients/signer table is a footer source
  // block. Extract its cell fields and assign it to the signature region so it
  // is not included in Body; the original source block and cell references stay
  // available for provenance and the footer fields are rendered separately.
  const embeddedFooterBlock = sigFoundIndex === -1
    ? blocks.slice(nextStartIndex, Math.min(bodyEndExclusive, appendixStartIndices[0] ?? total))
      .reverse().find(block => embeddedRecipientsSignatureTable(block))
    : undefined;
  const embeddedFooter = embeddedFooterBlock && embeddedRecipientsSignatureTable(embeddedFooterBlock);
  if (embeddedFooterBlock && embeddedFooter) {
    embeddedFooterBlock.role = "signature";
    if (!fields.recipients.value) {
      fields.recipients = { value: embeddedFooter.recipients, confidence: "high", status: "extracted",
        sourceBlockIds: [embeddedFooterBlock.id], sourceCell: { rowIndex: 0, colIndex: 0 }, exactQuote: embeddedFooter.recipients };
    }
    if (!fields.signTitle.value) {
      fields.signTitle = { value: embeddedFooter.signTitle, confidence: "high", status: "extracted",
        sourceBlockIds: [embeddedFooterBlock.id], sourceCell: { rowIndex: 0, colIndex: 1 }, exactQuote: embeddedFooter.signTitle };
    }
    if (!fields.signName.value) {
      fields.signName = { value: embeddedFooter.signName, confidence: "high", status: "extracted",
        sourceBlockIds: [embeddedFooterBlock.id], sourceCell: { rowIndex: 0, colIndex: 1 }, exactQuote: embeddedFooter.signName };
    }
  }

  // Search paragraph footer clusters even when an embedded physical table was
  // found; the cluster may contain additional recipient lines. The recognized
  // table has already been assigned to the signature region above.
  if (sigFoundIndex === -1) {
    let footerStart = -1;
    for (let i = bodyEndExclusive - 1; i >= nextStartIndex; i--) {
      const b = blocks[i];
      if (b.kind === "paragraph") {
        const text = b.text.trim();
        if (!text) continue;
        const parts = text.split(/(?:\t+| {2,}|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
        const hasRecip = parts.some(p => /^nơi nhận\s*:/i.test(p));
        const hasSign = parts.some(p => isSignFormula(p));
        if (hasRecip || hasSign) {
          footerStart = i;
        }
      }
    }

    if (footerStart !== -1) {
      const originalBodyEnd = bodyEndExclusive;
      if (!embeddedFooterBlock) bodyEndExclusive = footerStart;
      sigFoundIndex = footerStart;

      const recipientLines: string[] = [];
      const signTitleLines: string[] = [];
      let signName = "";
      const recipientBlockIds: string[] = [];
      const signBlockIds: string[] = [];

      for (let i = footerStart; i < originalBodyEnd; i++) {
        const b = blocks[i];
        if (b.kind !== "paragraph") continue;
        const text = b.text.trim();
        if (!text) {
          b.role = "separator";
          continue;
        }

        const parts = text.split(/(?:\t+| {2,}|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const left = parts[0];
          if (/^nơi nhận\s*:/i.test(left) || /^[-*+•]/.test(left) || (recipientLines.length > 0 && !isSignFormula(left) && signTitleLines.length === 0)) {
            recipientLines.push(left);
            recipientBlockIds.push(b.id);
          }
          const right = parts[parts.length - 1];
          const rightSubLines = right.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const cleanRight = rightSubLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
          if (cleanRight.length >= 2) {
            signTitleLines.push(cleanRight.slice(0, -1).join("\n"));
            if (!signName) signName = cleanRight[cleanRight.length - 1];
            signBlockIds.push(b.id);
          } else if (cleanRight.length === 1) {
            if (isSignFormula(cleanRight[0])) {
              signTitleLines.push(cleanRight[0]);
              signBlockIds.push(b.id);
            } else if (!signName && signTitleLines.length > 0) {
              signName = cleanRight[0];
              signBlockIds.push(b.id);
            }
          }
          b.role = "signature";
        } else {
          // Single part: handle logical newlines in paragraph
          const subLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (subLines.length >= 2) {
            const hasRecipInSub = subLines.some(l => /^nơi nhận\s*:/i.test(l));
            const hasSignFormulaInSub = subLines.some(l => isSignFormula(l));
            if (hasSignFormulaInSub && !hasRecipInSub) {
              const cleanSub = subLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
              if (cleanSub.length >= 2) {
                signTitleLines.push(cleanSub.slice(0, -1).join("\n"));
                if (!signName) signName = cleanSub[cleanSub.length - 1];
              } else if (cleanSub.length === 1) {
                signTitleLines.push(cleanSub[0]);
              }
              signBlockIds.push(b.id);
              b.role = "signature";
            } else if (hasRecipInSub) {
              subLines.forEach(sl => recipientLines.push(sl));
              recipientBlockIds.push(b.id);
              b.role = "recipients";
            } else {
              if (recipientLines.length > 0 && signTitleLines.length === 0) {
                subLines.forEach(sl => recipientLines.push(sl));
                recipientBlockIds.push(b.id);
                b.role = "recipients";
              } else {
                b.role = "signature";
              }
            }
          } else {
            const part = subLines[0] || parts[0];
            if (/^nơi nhận\s*:/i.test(part) || /^[-*+•]/.test(part)) {
              recipientLines.push(part);
              recipientBlockIds.push(b.id);
              b.role = "recipients";
            } else if (isSignFormula(part)) {
              signTitleLines.push(part);
              signBlockIds.push(b.id);
              b.role = "signature";
            } else if (/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(part)) {
              signBlockIds.push(b.id);
              b.role = "signature";
            } else if (!signName && signTitleLines.length > 0 && part.split(/\s+/).length <= 6 && !/[.;]$/.test(part)) {
              signName = part;
              signBlockIds.push(b.id);
              b.role = "signature";
            } else if (recipientLines.length > 0 && signTitleLines.length === 0 && !isSignFormula(part) && (/[;,]\s*$/.test(part) || /lưu\s*:/i.test(part) || part.length <= 60)) {
              // Non-bullet recipient continuation line!
              recipientLines.push(part);
              recipientBlockIds.push(b.id);
              b.role = "recipients";
            } else if (b.html?.includes("text-align: right") && !signName && signTitleLines.length > 0) {
              signName = part;
              signBlockIds.push(b.id);
              b.role = "signature";
            } else {
              b.role = signTitleLines.length > 0 ? "signature" : "recipients";
            }
          }
        }
      }

      if (recipientLines.length > 0) {
        fields.recipients = {
          value: recipientLines.join("\n"),
          confidence: "high",
          status: "extracted",
          sourceBlockIds: recipientBlockIds,
        };
      }
      if (signTitleLines.length > 0) {
        fields.signTitle = {
          value: signTitleLines.join("\n"),
          confidence: "high",
          status: "extracted",
          sourceBlockIds: signBlockIds,
        };
      }
      if (signName) {
        fields.signName = {
          value: signName,
          confidence: "high",
          status: "extracted",
          sourceBlockIds: signBlockIds,
        };
      }
    }
  }

  // STEP 5B: Flag ambiguous signing tables after an appendix without changing ownership
  if (sigFoundIndex === -1 && appendixStartIndices.length > 0 && appendices.length > 0) {
    const lastAppIdx = appendixStartIndices[appendixStartIndices.length - 1];
    let termSigFoundIndex = -1;

    for (let i = total - 1; i > lastAppIdx; i--) {
      const b = blocks[i];
      if (b.kind === "table" && b.tableShape && b.tableShape.columns >= 2) {
        if (isActionPlanOrDataTable(b)) continue;

        const data = b.tableData || [];
        const flatText = data.flat().join(" ");
        const leftColText = data.map(r => r[0] || "").join("\n");
        const rightColText = data.map(r => r[r.length - 1] || "").join("\n");
        const hasRecipients = /Nơi nhận\s*:/i.test(leftColText) || /Nơi nhận\s*:/i.test(flatText);
        const rightLines = rightColText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const hasSign = rightLines.some(l => isSignFormula(l)) ||
                        isSignFormula(flatText) ||
                        rightColText.toUpperCase().includes("GIÁM ĐỐC") ||
                        rightColText.toUpperCase().includes("TRƯỞNG ĐOÀN") ||
                        /^\s*(?:TM[\.\s]|T\/M[\.\s]|KT[\.\s]|TL[\.\s]|TUQ[\.\s])/i.test(rightColText.trim());

        if ((hasRecipients && hasSign) || (b.tableShape.rows <= 3 && hasSign)) {
          termSigFoundIndex = i;
          break;
        }
      }
    }

    if (termSigFoundIndex !== -1) {
      // A signing table inside an appendix can belong to an attached form rather
      // than the main document. Labels and row count do not establish ownership.
      // Preserve all source blocks and ask for partition review instead of
      // promoting an appendix signer into the main document fields.
      appendices[appendices.length - 1].extractionStatus = "needs_review";
    }
  }

  // If a signature block was identified before appendix, body ends before signature block!
  if (sigFoundIndex !== -1 && !embeddedFooterBlock && (appendixStartIndices.length === 0 || sigFoundIndex < appendixStartIndices[0])) {
    bodyEndExclusive = sigFoundIndex;
  }

  // =========================================================================
  // STEP 6: BODY EXTRACTION (Between nextStartIndex and bodyEndExclusive)
  // =========================================================================
  const bodyBlockIds: string[] = [];
  const bodyHtmlParts: string[] = [];

  for (let i = nextStartIndex; i < bodyEndExclusive; i++) {
    const b = blocks[i];
    if (b.role !== "unclassified") continue;

    // Check if empty separator paragraph (spacing only)
    if (b.kind === "paragraph" && !b.text.trim()) {
      b.role = "separator";
      continue;
    }

    // If party exporter will render separator, and no separator under subject was mapped yet
    // (e.g. a preamble paragraph appeared between subject and separator), map the FIRST separator only.
    if (exporterWillRenderSeparator && !partySubjectSeparatorMapped && b.kind === "paragraph" && isSeparatorParagraph(b.text)) {
      b.role = "separator";
      partySubjectSeparatorMapped = true;
      continue;
    }

    b.role = "body";
    bodyBlockIds.push(b.id);
    bodyHtmlParts.push(b.html || `<p>${b.text}</p>`);
  }

  // BẢO ĐẢM NGUYÊN TẮC: Mọi khối có role === 'body' BẮT BUỘC phải nằm trong bodyBlockIds và bodyHtmlParts!
  for (const b of blocks) {
    if (b.role === "body" && !bodyBlockIds.includes(b.id)) {
      bodyBlockIds.push(b.id);
      bodyHtmlParts.push(b.html || `<p>${b.text}</p>`);
    }
  }

  // Resilient fallback: Chỉ phục hồi các khối thực sự chưa được phân loại (unclassified),
  // TUYỆT ĐỐI không biến metadata hay separator đã phân loại thành body!
  if (bodyHtmlParts.length === 0 && blocks.length > 0) {
    for (const b of blocks) {
      if (b.role === "unclassified" && b.kind === "paragraph" && b.text.trim()) {
        b.role = "body";
        bodyBlockIds.push(b.id);
        bodyHtmlParts.push(b.html || `<p>${b.text}</p>`);
      }
    }
  }

  // Empty source paragraphs may also occur before the title, outside the
  // body range. They are spacing separators rather than uncertain content.
  for (const b of blocks) {
    if (b.role === "unclassified" && b.kind === "paragraph" && !b.text.trim()) {
      b.role = "separator";
    }
  }

  // =========================================================================
  // STEP 7: OWNERSHIP INVARIANTS & UNCLASSIFIED AUDIT (Gate B)
  // =========================================================================
  const unclassifiedBlocks: SourceBlock[] = [];

  blocks.forEach(b => {
    if (b.role === "unclassified") {
      unclassifiedBlocks.push(b);
    }
  });

  const order = blocks.map(b => b.id);
  const bodyBlocks = blocks.filter(b => b.role === "body");
  const paragraphsCount = bodyBlocks.filter(b => b.kind === "paragraph").length;
  const tablesCount = bodyBlocks.filter(b => b.kind === "table").length;

  const signatures: NonNullable<StructuredImport["signatures"]> = [];
  if (fields.signTitle.value || fields.signName.value) {
    const titles = (fields.signTitle.value || "").split("|").map(t => t.trim());
    const names = (fields.signName.value || "").split("|").map(n => n.trim());
    const count = Math.max(titles.length, names.length);
    for (let sIdx = 0; sIdx < count; sIdx++) {
      signatures.push({
        id: `sig-${sIdx + 1}`,
        title: titles[sIdx] || "",
        name: names[sIdx] || "",
        isMultiSigner: count > 1,
        sourceBlockIds: [...fields.signTitle.sourceBlockIds, ...fields.signName.sourceBlockIds],
        confidence: fields.signTitle.confidence,
        confirmed: fields.signTitle.status === "user_confirmed",
      });
    }
  }

  const recipientsData: StructuredImport["recipients"] = fields.recipients.value ? {
    items: fields.recipients.value.split("\n").map(l => l.trim()).filter(Boolean),
    rawText: fields.recipients.value,
    sourceBlockIds: fields.recipients.sourceBlockIds,
  } : undefined;

  const frontData: StructuredImport["front"] = {
    orgHeader1: fields.orgHeader1.value || undefined,
    orgHeader2: fields.orgHeader2.value || undefined,
    nationalHeader1: fields.nationalHeader1.value || undefined,
    nationalHeader2: fields.nationalHeader2.value || undefined,
    referenceNumber: fields.referenceNumber.value || undefined,
    locationAndDate: fields.locationAndDate.value || undefined,
    documentType: fields.documentType.value || undefined,
    subject: fields.subject.value || undefined,
    sourceBlockIds: Array.from(new Set([
      ...fields.orgHeader1.sourceBlockIds,
      ...fields.orgHeader2.sourceBlockIds,
      ...fields.nationalHeader1.sourceBlockIds,
      ...fields.nationalHeader2.sourceBlockIds,
      ...fields.referenceNumber.sourceBlockIds,
      ...fields.locationAndDate.sourceBlockIds,
      ...fields.documentType.sourceBlockIds,
      ...fields.subject.sourceBlockIds,
    ])),
  };

  return {
    source: {
      filename: options.filename || "untitled",
      type: options.fileType || "docx",
      blockCount: total,
      tableCount: blocks.filter(b => b.kind === "table").length,
      appendixCount: appendices.length,
    },
    fields,
    front: frontData,
    draftNote,
    body: {
      html: bodyHtmlParts.join(""),
      sourceBlockIds: bodyBlockIds,
      paragraphsCount,
      tablesCount,
    },
    signatureHtml,
    signatures: signatures.length > 0 ? signatures : undefined,
    recipients: recipientsData,
    appendices,
    unclassified: unclassifiedBlocks,
    blocks,
    order,
  };
}
