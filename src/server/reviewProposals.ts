/**
 * @file reviewProposals.ts
 * @description Engine generate rule-based and AI-assisted proposals for DocForm 30.
 * Adheres strictly to Zero Data Loss, untrusted input containment, and deterministic fallback.
 * Every proposal references targetBlockId and cellIndex whenever available to prevent misplaced replacements.
 */

import type {
  StructuredImport,
  ReviewProposal,
  SourceBlock,
} from "../shared/schemas/document.schema.ts";
import { isValidCalendarDate } from "../shared/schemas/document.schema.ts";

/**
 * Helper creates Unicode-compliant word boundary regex for Vietnamese words with accents
 */
export function createVietnameseWordRegex(phrase: string, flags = "iu"): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<=^|[^\\p{L}\\d])${escaped}(?=[^\\p{L}\\d]|$)`, flags);
}

/**
 * Common Vietnamese administrative spelling errors and standard replacements.
 * Uses Unicode lookbehind/lookahead instead of \b to ensure reliable matching for accented characters.
 */
const COMMON_SPELLING_PAIRS: Array<{ wrong: RegExp; fix: string; reason: string }> = [
  { wrong: createVietnameseWordRegex("uỷ ban"), fix: "ủy ban", reason: "Chuẩn hóa chính tả 'ủy ban' theo quy định chuẩn văn thư Nhà nước" },
  { wrong: createVietnameseWordRegex("qui định"), fix: "quy định", reason: "Chuẩn hóa âm 'y' dài trong 'quy định' theo chuẩn chính tả NĐ 30" },
  { wrong: createVietnameseWordRegex("qui trình"), fix: "quy trình", reason: "Chuẩn hóa âm 'y' dài trong 'quy trình'" },
  { wrong: createVietnameseWordRegex("nghị đinh"), fix: "nghị định", reason: "Sửa lỗi chính tả dấu nặng trong 'nghị định'" },
  { wrong: createVietnameseWordRegex("quyêt định"), fix: "quyết định", reason: "Sửa lỗi chính tả dấu sắc trong 'quyết định'" },
  { wrong: createVietnameseWordRegex("kế hoach"), fix: "kế hoạch", reason: "Sửa lỗi chính tả dấu nặng trong 'kế hoạch'" },
  { wrong: createVietnameseWordRegex("tờ trinh"), fix: "tờ trình", reason: "Sửa lỗi chính tả dấu huyền trong 'tờ trình'" },
  { wrong: createVietnameseWordRegex("biên ban"), fix: "biên bản", reason: "Sửa lỗi chính tả dấu hỏi trong 'biên bản'" },
  { wrong: createVietnameseWordRegex("giám đôc"), fix: "giám đốc", reason: "Sửa lỗi chính tả dấu sắc trong 'giám đốc'" },
  { wrong: createVietnameseWordRegex("chuẩn bi"), fix: "chuẩn bị", reason: "Sửa lỗi chính tả dấu nặng trong 'chuẩn bị'" },
  { wrong: createVietnameseWordRegex("thực hiên"), fix: "thực hiện", reason: "Sửa lỗi chính tả dấu nặng trong 'thực hiện'" },
  { wrong: createVietnameseWordRegex("tiến đô"), fix: "tiến độ", reason: "Sửa lỗi chính tả dấu nặng trong 'tiến độ'" },
  { wrong: createVietnameseWordRegex("đai hội"), fix: "đại hội", reason: "Sửa lỗi chính tả dấu nặng trong 'đại hội'" },
  { wrong: createVietnameseWordRegex("hội nghi"), fix: "hội nghị", reason: "Sửa lỗi chính tả dấu nặng trong 'hội nghị'" },
  { wrong: createVietnameseWordRegex("nhiêm vụ"), fix: "nhiệm vụ", reason: "Sửa lỗi chính tả dấu nặng trong 'nhiệm vụ'" },
  { wrong: createVietnameseWordRegex("nhiêm kỳ"), fix: "nhiệm kỳ", reason: "Sửa lỗi chính tả dấu nặng trong 'nhiệm kỳ'" },
];

/**
 * Generates deterministic rule-based proposals for a structured document.
 * Operates 100% offline without requiring any AI API keys.
 * Accurately tracks targetBlockId and cellIndex.
 */
export function generateRuleBasedProposals(
  structured: StructuredImport,
  regime: "administrative" | "party" = "administrative",
  rawText?: string,
  blocks?: SourceBlock[]
): ReviewProposal[] {
  const proposals: ReviewProposal[] = [];
  const fields = structured.fields;

  // 1. NATIONAL HEADER & MOTTO
  if (regime === "administrative") {
    const nh1 = fields.nationalHeader1?.value || "";
    if (nh1 && nh1 !== "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") {
      proposals.push({
        id: `prop-nh1-${Date.now()}-1`,
        type: "format",
        target: "nationalHeader1",
        targetBlockId: fields.nationalHeader1?.sourceBlockIds?.[0],
        original: nh1,
        suggested: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        reason: "Quốc hiệu dòng 1 phải viết in hoa theo quy định tại Phụ lục I Mục I.1 Nghị định 30/2020/NĐ-CP.",
        confidence: "high",
        source: "rule_fallback",
      });
    }
    const nh2 = fields.nationalHeader2?.value || "";
    if (nh2 && nh2 !== "Độc lập - Tự do - Hạnh phúc") {
      proposals.push({
        id: `prop-nh2-${Date.now()}-2`,
        type: "format",
        target: "nationalHeader2",
        targetBlockId: fields.nationalHeader2?.sourceBlockIds?.[0],
        original: nh2,
        suggested: "Độc lập - Tự do - Hạnh phúc",
        reason: "Tiêu ngữ phải viết chính xác 'Độc lập - Tự do - Hạnh phúc' theo Phụ lục I Mục I.1 Nghị định 30/2020/NĐ-CP.",
        confidence: "high",
        source: "rule_fallback",
      });
    }
  } else {
    // Party regime
    const nh1 = fields.nationalHeader1?.value || "";
    if (nh1 && nh1 !== "ĐẢNG CỘNG SẢN VIỆT NAM") {
      proposals.push({
        id: `prop-party-nh1-${Date.now()}-1`,
        type: "format",
        target: "nationalHeader1",
        targetBlockId: fields.nationalHeader1?.sourceBlockIds?.[0],
        original: nh1,
        suggested: "ĐẢNG CỘNG SẢN VIỆT NAM",
        reason: "Văn bản Đảng dùng tiêu đề 'ĐẢNG CỘNG SẢN VIỆT NAM' theo Hướng dẫn số 05-HD/VPTW.",
        confidence: "high",
        source: "rule_fallback",
      });
    }
    const nh2 = fields.nationalHeader2?.value || "";
    if (nh2 && nh2.trim()) {
      proposals.push({
        id: `prop-party-nh2-${Date.now()}-2`,
        type: "format",
        target: "nationalHeader2",
        targetBlockId: fields.nationalHeader2?.sourceBlockIds?.[0],
        original: nh2,
        suggested: "",
        reason: "Văn bản của Đảng không có tiêu ngữ theo Hướng dẫn số 05-HD/VPTW.",
        confidence: "high",
        source: "rule_fallback",
      });
    }
  }

  // 2. ISSUING ORGANIZATION (orgHeader2)
  const org2 = fields.orgHeader2?.value || "";
  if (org2 && org2 !== org2.toUpperCase() && !org2.includes("…")) {
    proposals.push({
      id: `prop-org2-${Date.now()}-3`,
      type: "format",
      target: "orgHeader2",
      targetBlockId: fields.orgHeader2?.sourceBlockIds?.[0],
      original: org2,
      suggested: org2.toUpperCase(),
      reason: "Tên cơ quan, tổ chức ban hành văn bản phải được trình bày bằng chữ in hoa theo Điều 9 Nghị định 30/2020/NĐ-CP.",
      confidence: "high",
      source: "rule_fallback",
    });
  }

  // 3. REFERENCE NUMBER (Strictly separated between NĐ 30 and HD 05)
  const refNum = fields.referenceNumber?.value || "";
  if (refNum) {
    if (regime === "administrative") {
      if (!refNum.startsWith("Số:") && !refNum.startsWith("Số :")) {
        proposals.push({
          id: `prop-refnum-${Date.now()}-4`,
          type: "format",
          target: "referenceNumber",
          targetBlockId: fields.referenceNumber?.sourceBlockIds?.[0],
          original: refNum,
          suggested: `Số: ${refNum.replace(/^Số\s*/i, "").trim()}`,
          reason: "Từ 'Số:' được trình bày bằng chữ in thường, ký hiệu phân cách bởi dấu hai chấm theo Điều 8 Nghị định 30/2020/NĐ-CP.",
          confidence: "high",
          source: "rule_fallback",
        });
      }
    } else {
      // Party regime: TUYỆT ĐỐI KHÔNG thêm dấu hai chấm!
      if (refNum.startsWith("Số:")) {
        proposals.push({
          id: `prop-party-refnum-${Date.now()}-4`,
          type: "format",
          target: "referenceNumber",
          targetBlockId: fields.referenceNumber?.sourceBlockIds?.[0],
          original: refNum,
          suggested: refNum.replace(/^Số:\s*/i, "Số ").trim(),
          reason: "Theo Hướng dẫn số 05-HD/VPTW, từ 'Số' trong văn bản Đảng không có dấu hai chấm ':' (VD: Số 12-NQ/ĐU).",
          confidence: "high",
          source: "rule_fallback",
        });
      }
    }
  }

  // 4. LOCATION AND DATE
  const locDate = fields.locationAndDate?.value || "";
  if (locDate) {
    // Check missing leading zero for single digit day
    const dayMatch = locDate.match(/(,\s*ngày\s+)(\d)(\s+tháng)/i);
    if (dayMatch) {
      const fixed = locDate.replace(dayMatch[0], `${dayMatch[1]}0${dayMatch[2]}${dayMatch[3]}`);
      proposals.push({
        id: `prop-date-day-${Date.now()}-5`,
        type: "format",
        target: "locationAndDate",
        targetBlockId: fields.locationAndDate?.sourceBlockIds?.[0],
        original: locDate,
        suggested: fixed,
        reason: "Số chỉ ngày nhỏ hơn 10 phải ghi thêm số 0 ở trước theo Phụ lục I Mục I.4 Nghị định 30/2020/NĐ-CP.",
        confidence: "high",
        source: "rule_fallback",
      });
    }

    // Check missing leading zero for month 1 or 2
    const monthMatch = locDate.match(/(\s+tháng\s+)([12])(\s+năm)/i);
    if (monthMatch) {
      const fixed = locDate.replace(monthMatch[0], `${monthMatch[1]}0${monthMatch[2]}${monthMatch[3]}`);
      proposals.push({
        id: `prop-date-month-${Date.now()}-6`,
        type: "format",
        target: "locationAndDate",
        targetBlockId: fields.locationAndDate?.sourceBlockIds?.[0],
        original: locDate,
        suggested: fixed,
        reason: "Tháng 1 và tháng 2 phải ghi thêm số 0 ở trước theo Phụ lục I Mục I.4 Nghị định 30/2020/NĐ-CP.",
        confidence: "high",
        source: "rule_fallback",
      });
    }

    // Calendar date existence check
    const fullDateMatch = locDate.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
    if (fullDateMatch) {
      const d = parseInt(fullDateMatch[1], 10);
      const m = parseInt(fullDateMatch[2], 10);
      const y = parseInt(fullDateMatch[3], 10);
      if (!isValidCalendarDate(d, m, y)) {
        proposals.push({
          id: `prop-date-invalid-${Date.now()}-7`,
          type: "consistency",
          target: "locationAndDate",
          targetBlockId: fields.locationAndDate?.sourceBlockIds?.[0],
          original: locDate,
          suggested: locDate,
          reason: `Ngày ${d} tháng ${m} năm ${y} không tồn tại trên lịch thực tế. Vui lòng kiểm tra lại thời gian ban hành.`,
          confidence: "high",
          source: "rule_fallback",
        });
      }
    }
  }

  // 5. DOCUMENT TYPE
  const docType = fields.documentType?.value || "";
  if (docType && docType !== docType.toUpperCase()) {
    proposals.push({
      id: `prop-doctype-${Date.now()}-8`,
      type: "format",
      target: "documentType",
      targetBlockId: fields.documentType?.sourceBlockIds?.[0],
      original: docType,
      suggested: docType.toUpperCase(),
      reason: "Tên loại văn bản phải được trình bày bằng chữ in hoa, cỡ chữ 13-14, đứng, đậm theo Phụ lục I Mục I.5 Nghị định 30/2020/NĐ-CP.",
      confidence: "high",
      source: "rule_fallback",
    });
  }

  // 6. SUBJECT (Trích yếu nội dung)
  // Quy chuẩn NĐ 30: Chỉ CÔNG VĂN HÀNH CHÍNH (không có tên loại) mới có tiền tố "V/v".
  // Các văn bản có tên loại rõ ràng (KẾ HOẠCH, QUYẾT ĐỊNH, BÁO CÁO, TỜ TRÌNH, THÔNG BÁO...)
  // TUYỆT ĐỐI KHÔNG ép buộc tiền tố "V/v" vào trích yếu.
  const subject = fields.subject?.value || "";
  const isDocMinutes = docType.toUpperCase().includes("BIÊN BẢN");
  const isCongVan = docType.toUpperCase().includes("CÔNG VĂN") || !docType.trim();
  if (subject && regime === "administrative" && isCongVan && !isDocMinutes) {
    if (!/^v\/v\s+/i.test(subject) && !/^về việc\s+/i.test(subject)) {
      proposals.push({
        id: `prop-subject-prefix-${Date.now()}-9`,
        type: "format",
        target: "subject",
        targetBlockId: fields.subject?.sourceBlockIds?.[0],
        original: subject,
        suggested: `V/v ${subject}`,
        reason: "Trích yếu nội dung công văn hành chính bắt đầu bằng 'V/v' theo Phụ lục I Mục I.6 Nghị định 30/2020/NĐ-CP.",
        confidence: "medium",
        source: "rule_fallback",
      });
    }
  }

  // Absence of a signature is a document state, never replacement text.
  // ADMINISTRATIVE SPELLING AUDIT (Precise Block and Cell Tracking)
  if (blocks && blocks.length > 0) {
    for (const b of blocks) {
      if (b.role === "header") continue; // Header fields handled above

      if (b.kind === "paragraph" && b.text) {
        for (const pair of COMMON_SPELLING_PAIRS) {
          const match = b.text.match(pair.wrong);
          if (match) {
            proposals.push({
              id: `prop-spell-${b.id}-${Date.now()}-${proposals.length + 1}`,
              type: "spelling",
              target: "body",
              targetBlockId: b.id,
              original: match[0],
              suggested: pair.fix,
              reason: pair.reason,
              confidence: "high",
              source: "rule_fallback",
            });
          }
        }
      } else if (b.kind === "table" && b.tableData) {
        for (let r = 0; r < b.tableData.length; r++) {
          for (let c = 0; c < (b.tableData[r] || []).length; c++) {
            const cellText = b.tableData[r][c] || "";
            for (const pair of COMMON_SPELLING_PAIRS) {
              const match = cellText.match(pair.wrong);
              if (match) {
                proposals.push({
                  id: `prop-spell-${b.id}-r${r}c${c}-${Date.now()}-${proposals.length + 1}`,
                  type: "spelling",
                  target: "body",
                  targetBlockId: b.id,
                  cellIndex: { row: r, col: c },
                  original: match[0],
                  suggested: pair.fix,
                  reason: pair.reason,
                  confidence: "high",
                  source: "rule_fallback",
                });
              }
            }
          }
        }
      }
    }
  } else {
    // Fallback if blocks array not supplied
    const textToScan = (rawText || "") + " " + (structured.body?.html || "").replace(/<[^>]+>/g, " ");
    for (const pair of COMMON_SPELLING_PAIRS) {
      const match = textToScan.match(pair.wrong);
      if (match) {
        proposals.push({
          id: `prop-spell-${Date.now()}-${proposals.length + 1}`,
          type: "spelling",
          target: "body",
          original: match[0],
          suggested: pair.fix,
          reason: pair.reason,
          confidence: "high",
          source: "rule_fallback",
        });
      }
    }
  }

  return proposals;
}

/**
 * Computes summary counts by category
 */
export function summarizeProposals(proposals: ReviewProposal[]) {
  return {
    total: proposals.length,
    segmentationCount: proposals.filter(p => p.type === "segmentation").length,
    formatCount: proposals.filter(p => p.type === "format").length,
    spellingCount: proposals.filter(p => p.type === "spelling").length,
    consistencyCount: proposals.filter(p => p.type === "consistency").length,
  };
}
