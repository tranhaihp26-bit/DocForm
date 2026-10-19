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
import { detectDocumentType } from "./parser.ts";
import { classifyTable, type TableClassificationResult, type TableOwner, type TableRole } from "./tableRoleClassifier.ts";
export { classifyTable, type TableClassificationResult, type TableOwner, type TableRole };

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

  for (let i = 0; i < Math.min(total, 4); i++) {
    const b = blocks[i];
    if (b.kind === "paragraph" && !b.text.trim()) {
      b.role = "separator";
      continue;
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
    const headerBlock = blocks[headerTableIdx];
    headerBlock.role = "header";
    headerBlockIds.push(headerBlock.id);
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

    // Parse Location and Date if present in right cell
    const dateMatch = extractHeaderDate(rightText);
    if (dateMatch) {
      fields.locationAndDate = {
        ...dateMatch,
        sourceBlockIds: [headerBlock.id],
      };
    }

    // Parse Org headers and Reference number from left cell
    const leftLines = leftText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const nonRefLines: string[] = [];
    for (const line of leftLines) {
      const refMatch = line.match(REF_NUMBER_REGEX);
      if (refMatch) {
        fields.referenceNumber = {
          value: line.startsWith("Số:") ? line : `Số: ${line.replace(/^Số\s*/i, "").trim()}`,
          confidence: "high",
          status: "extracted",
          sourceBlockIds: [headerBlock.id],
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
              value: part.startsWith("Số:") ? part : `Số: ${part.replace(/^Số\s*/i, "").trim()}`,
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
            value: part.startsWith("Số:") ? part : `Số: ${part.replace(/^Số\s*/i, "").trim()}`,
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
      } else if (!fields.nationalHeader1.value && pIdx < 3 && text.length <= 120 && !/[.!?]\s+[A-ZĐ]/.test(text)) {
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
  const docTypeKeywords = [
    "QUYẾT ĐỊNH", "KẾ HOẠCH", "TỜ TRÌNH", "THÔNG BÁO", "NGHỊ QUYẾT",
    "BÁO CÁO", "NGHỊ ĐỊNH", "CHỈ THỊ", "HƯỚNG DẪN", "CÔNG VĂN", "BIÊN BẢN"
  ];

  let docTypeIndex = -1;
  const docTypeSearchStart = options.fileType === "txt" ? 0 : nextStartIndex;
  for (let i = docTypeSearchStart; i < Math.min(docTypeSearchStart + 8, total); i++) {
    const b = blocks[i];
    if (b.kind !== "paragraph") continue;
    const text = b.text.trim().toUpperCase();
    if (!text) continue;

    for (const kw of docTypeKeywords) {
      if (text === kw || text.startsWith(kw + " ") || text.startsWith(kw + ":")) {
        docTypeIndex = i;
        b.role = "metadata";
        fields.documentType = {
          value: text,
          confidence: "high",
          status: "extracted",
          sourceBlockIds: [b.id],
        };
        break;
      }
    }
    if (docTypeIndex !== -1) break;
  }

  if (docTypeIndex === -1) {
    // Infer only when the source actually mentions a document type.
    const fullText = blocks.slice(0, 10).map(b => b.text).join("\n");
    if (docTypeKeywords.some(keyword => fullText.toUpperCase().includes(keyword))) {
      const detected = detectDocumentType(fullText, options.standardType);
      fields.documentType = {
        value: detected,
        confidence: "medium",
        status: "extracted",
        sourceBlockIds: [],
      };
    }
  } else {
    nextStartIndex = Math.max(nextStartIndex, docTypeIndex + 1);
  }

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

  while (nextStartIndex < total) {
    const b = blocks[nextStartIndex];
    if (b.kind === "paragraph" && /^[-–—_\s*]{3,10}$/.test(b.text.trim())) {
      if (exporterWillRenderSeparator) {
        b.role = "separator";
      } else {
        b.role = "body";
      }
      nextStartIndex++;
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
      const endIdx = aIdx + 1 < appendixStartIndices.length ? appendixStartIndices[aIdx + 1] : total;
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
        extractionStatus: "confirmed",
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
            const titles = extractedCols.map(c => c.title || "").filter(Boolean);
            const names = extractedCols.map(c => c.name || "").filter(Boolean);

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
          const leftCol = data.map(r => r[0] || "").join("\n");
          const rightCol = data.map(r => r[r.length - 1] || "").join("\n");

          if (/Nơi nhận\s*:/i.test(leftCol)) {
            fields.recipients = {
              value: leftCol.trim(),
              confidence: "high",
              status: "extracted",
              sourceBlockIds: [b.id],
            };
          }

          const rightLines = rightCol.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          // Filter out sign notes like (Ký, đóng dấu) from title/name
          const cleanRight = rightLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));

          if (cleanRight.length >= 2) {
            fields.signTitle = { value: cleanRight.slice(0, -1).join("\n"), confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
            fields.signName = { value: cleanRight[cleanRight.length - 1], confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
          } else if (cleanRight.length === 1) {
            fields.signTitle = { value: cleanRight[0], confidence: "high", status: "extracted", sourceBlockIds: [b.id] };
          }
        }
        break;
      }
    }
  }

  // If no signature table was found, search for paragraph footer cluster (recipients and signature paragraphs)
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
      bodyEndExclusive = footerStart;
      sigFoundIndex = footerStart;

      const recipientLines: string[] = [];
      const signTitleLines: string[] = [];
      let signName = "";
      const recipientBlockIds: string[] = [];
      const signBlockIds: string[] = [];

      for (let i = footerStart; i < originalBodyEnd; i++) {
        const b = blocks[i];
        const text = b.text.trim();
        if (!text) {
          b.role = "separator";
          continue;
        }

        const parts = text.split(/(?:\t+| {2,}|\s*\|\s*)/).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (/^nơi nhận\s*:/i.test(parts[0]) || /^[-*+•]/.test(parts[0])) {
            recipientLines.push(parts[0]);
            recipientBlockIds.push(b.id);
          }
          const right = parts[parts.length - 1];
          if (isSignFormula(right)) {
            signTitleLines.push(right);
            signBlockIds.push(b.id);
          } else if (!signName && signTitleLines.length > 0 && !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(right)) {
            signName = right;
            signBlockIds.push(b.id);
          }
          b.role = "signature";
        } else {
          const part = parts[0];
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
          } else if (b.html?.includes("text-align: right") && !signName && signTitleLines.length > 0) {
            signName = part;
            signBlockIds.push(b.id);
            b.role = "signature";
          } else {
            b.role = signTitleLines.length > 0 ? "signature" : "recipients";
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

  // If a signature block was identified, body ends before signature block!
  if (sigFoundIndex !== -1) {
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

    // Check if empty separator paragraph
    if (b.kind === "paragraph" && !b.text.trim()) {
      b.role = "separator";
      continue;
    }

    b.role = "body";
    bodyBlockIds.push(b.id);
    bodyHtmlParts.push(b.html || `<p>${b.text}</p>`);
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
