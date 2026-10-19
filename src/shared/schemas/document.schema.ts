import { z } from "zod";
import { COMPANY_HEADER_PROFILE_ID } from "../../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../../canonical/hd05/companyHeaderHD05.ts";
import { auditCanonicalND30 } from "../../canonical/nd30/canonicalAudit.ts";
import { auditCanonicalHD05 } from "../../canonical/hd05/canonicalAuditHD05.ts";
import type { ImportFidelityManifest, ExportSafetyResult, UnsupportedFeature } from "../importFidelity.ts";
export * from "../importFidelity.ts";
import type { TableModel } from "../tableModel.ts";
export * from "../tableModel.ts";

/**
 * @file document.schema.ts
 * @description Zod validation schema cho cấu trúc văn bản hành chính nhà nước (Nghị định 30/2020/NĐ-CP)
 * và văn bản Đảng (Hướng dẫn số 05-HD/VPTW).
 * 
 * NGUYÊN TẮC "ZERO TRUST AI OUTPUT":
 * - Các thuộc tính thể thức cứng (Quốc hiệu, Tiêu ngữ, Phông chữ, Cỡ chữ) phải tuân thủ nghiêm ngặt 100%.
 * - Các thuộc tính nội dung do AI sinh ra phải được xác thực kiểu dữ liệu và chuẩn hóa qua regex.
 */

/**
 * Regex chuẩn hóa số, ký hiệu văn bản hành chính theo Điều 8 & Phụ lục I Nghị định 30/2020/NĐ-CP:
 * BẮT BUỘC có 'Số: ' (có dấu hai chấm) và phần chữ số đăng ký:
 * - Văn bản QPPL / Cá biệt: "Số: 123/QĐ-UBND", "Số: 45/2026/NĐ-CP"
 * - Công văn hành chính: "Số: 12/STP-VP", "Số: 123"
 */
export const REFERENCE_NUMBER_ND30_REGEX = /^Số:\s*\d+([a-zA-ZđĐ]?|[/\-][\d\p{L}\.\-\/]+)*$/ui;

/**
 * Regex chuẩn hóa số, ký hiệu văn bản Đảng theo Hướng dẫn 05-HD/VPTW (Mục II.I.3.2.1):
 * BẮT BUỘC: 'Số ' (KHÔNG có dấu hai chấm), số nhỏ hơn 10 có số 0 ở đầu (01, 02...),
 * dấu nối '-' giữa số và tên loại, dấu gạch chéo '/' giữa tên loại và cơ quan:
 * - "Số 12-NQ/ĐU", "Số 01-NQ/TW", "Số 05-HD/VPTW", "Số 12-QĐ/TU"
 */
export const REFERENCE_NUMBER_HD05_REGEX = /^Số\s+(?:0[1-9]|[1-9]\d*)-[\p{L}\d]+(?:\.[\p{L}\d]+)*\/[\p{L}\d\-\.]+$/u;

/**
 * Tương thích ngược: mặc định tham chiếu đến REFERENCE_NUMBER_ND30_REGEX
 */
export const REFERENCE_NUMBER_REGEX = REFERENCE_NUMBER_ND30_REGEX;

/**
 * Regex chuẩn hóa cú pháp địa danh và ngày, tháng, năm ban hành văn bản:
 * Phải có dạng: "[Tên địa danh], ngày [dd] tháng [mm] năm [yyyy]"
 * Hỗ trợ cả số ngày/tháng có số 0 ở đầu và không có số 0 ở đầu, địa danh có dấu chấm viết tắt (TP., TX.)
 * Ví dụ: 
 * - "Hà Nội, ngày 13 tháng 10 năm 2026"
 * - "TP. Hồ Chí Minh, ngày 05 tháng 02 năm 2026"
 * - "TX. Sơn Tây, ngày 05 tháng 03 năm 2026"
 */
export const LOCATION_AND_DATE_REGEX = /^[\p{L}\s\.\-]+,\s*ngày\s+(?:0[1-9]|[12]\d|3[01])\s+tháng\s+(?:0[12]|[3-9]|1[0-2])\s+năm\s+\d{4}$/u;

/**
 * Kiểm tra xem ngày, tháng, năm có thực sự tồn tại trên lịch hay không (xét cả năm nhuận).
 * Từ chối các ngày phi thực tế như ngày 31 tháng 02, ngày 30 tháng 02, hoặc ngày 29 tháng 02 năm không nhuận.
 */
export function isValidCalendarDate(day: number, month: number, year: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonths[month - 1];
}

/**
 * Kiểm tra tính hợp lệ toàn diện của Địa danh và ngày tháng theo Nghị định 30/2020/NĐ-CP:
 * 1. Đúng cấu trúc: "[Địa danh], ngày dd tháng mm năm yyyy"
 * 2. Ngày tháng năm phải có thật trên lịch.
 * 3. Bắt buộc có số 0 ở trước đối với ngày nhỏ hơn 10 và tháng 1, tháng 2.
 */
export function isValidND30LocationAndDate(val?: string | null): boolean {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.trim();
  if (isPlaceholderValue(trimmed)) return false;

  const match = trimmed.match(/^([\p{L}\s\.\-]+),\s*ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})$/u);
  if (!match) return false;

  const location = match[1].trim();
  if (!location || isPlaceholderValue(location)) return false;

  const dayStr = match[2];
  const monthStr = match[3];
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(match[4], 10);

  // Quy chuẩn NĐ 30: Số chỉ ngày nhỏ hơn 10 và tháng 1, 2 phải ghi thêm số 0 ở trước
  if (day < 10 && !dayStr.startsWith("0")) return false;
  if ((month === 1 || month === 2) && !monthStr.startsWith("0")) return false;

  // Kiểm tra ngày thực tế trên lịch
  return isValidCalendarDate(day, month, year);
}

/**
 * Kiểm tra xem một giá trị chuỗi có phải là văn bản giữ chỗ (placeholder), mẫu minh họa, hoặc dữ liệu chưa hoàn thiện hay không.
 */
export function isPlaceholderValue(val?: string | null): boolean {
  if (!val || typeof val !== "string") return true;
  const s = val.trim();
  if (!s) return true;
  if (s.includes("...") || s.includes("…")) return true;
  
  if (/^\[.*\]$/s.test(s) || /^<.*>$/s.test(s) || /^\{.*\}$/s.test(s)) return true;

  const lower = s.toLowerCase();
  const placeholderPatterns = [
    "[tên cơ quan",
    "tên cơ quan",
    "cơ quan ban hành",
    "cơ quan chủ quản",
    "[địa danh]",
    "địa danh",
    "nguyễn văn a",
    "[họ và tên",
    "họ và tên người ký",
    "[chức vụ",
    "chức vụ người ký",
    "[trích yếu",
    "trích yếu nội dung",
    "vd:",
    "ví dụ:",
    "ví dụ",
    "sample",
    "placeholder"
  ];

  return placeholderPatterns.some(p => lower.includes(p));
}

/**
 * Zod Schema cho chuẩn thể thức văn bản hành chính và văn bản Đảng
 */
export const DocumentFormatSchema = z.object({
  /**
   * Chế độ văn bản:
   * - 'administrative': Văn bản hành chính nhà nước (NĐ 30/2020/NĐ-CP)
   * - 'party': Văn bản của Đảng (Hướng dẫn số 05-HD/VPTW)
   */
  regime: z.enum(["administrative", "party"]).default("administrative"),
  headerProfile: z.enum(["generic", COMPANY_HEADER_PROFILE_ID, COMPANY_HEADER_HD05_PROFILE_ID]).optional(),

  /**
   * Quốc hiệu (Dòng 1):
   * - Nhà nước: Bắt buộc là "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" (in hoa, cỡ 12-13, đứng, đậm)
   * - Đảng: Bắt buộc là "ĐẢNG CỘNG SẢN VIỆT NAM" (in hoa, cỡ 13-14, đứng, đậm)
   */
  nationalHeader1: z.enum([
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "ĐẢNG CỘNG SẢN VIỆT NAM"
  ]),

  /**
   * Tiêu ngữ (Dòng 2):
   * - Nhà nước: "Độc lập - Tự do - Hạnh phúc" (chữ in thường, cỡ 13-14, đứng, đậm)
   * - Đảng: Để trống "" (Hướng dẫn số 05-HD/VPTW không có tiêu ngữ)
   */
  nationalHeader2: z.union([
    z.literal("Độc lập - Tự do - Hạnh phúc"),
    z.literal("")
  ]).default("Độc lập - Tự do - Hạnh phúc"),

  /**
   * Phông chữ bắt buộc: Times New Roman (Nghị định 30 Điều 8 khoản 1)
   */
  fontFamily: z.literal("Times New Roman").default("Times New Roman"),

  /**
   * Cỡ chữ chuẩn nội dung văn bản: 13pt hoặc 14pt (Nghị định 30 Phụ lục I Mục II.1)
   */
  fontSize: z.union([z.literal(13), z.literal(14)]).default(13),

  /**
   * Tên cơ quan, tổ chức chủ quản cấp trên trực tiếp (nếu có)
   * Ví dụ: "BỘ GIÁO DỤC VÀ ĐÀO TẠO" hoặc "ỦY BAN NHÂN DÂN THÀNH PHỐ HÀ NỘI"
   */
  orgHeader1: z.string().default(""),

  /**
   * Tên cơ quan, tổ chức ban hành văn bản
   * Ví dụ: "VĂN PHÒNG ỦY BAN" hoặc "SỞ TƯ PHÁP"
   */
  orgHeader2: z.string().min(1, "Tên cơ quan ban hành không được để trống"),

  /**
   * Địa danh và thời gian ban hành văn bản
   * Định dạng chuẩn NĐ 30: "Địa danh, ngày ... tháng ... năm ..." (chữ nghiêng, cỡ 13-14)
   */
  locationAndDate: z.string().min(5, "Địa danh và ngày tháng không hợp lệ"),

  /**
   * Tên loại văn bản
   * Ví dụ: "QUYẾT ĐỊNH", "CÔNG VĂN", "KẾ HOẠCH", "BÁO CÁO", "TỜ TRÌNH", "NGHỊ QUYẾT"
   */
  documentType: z.string().min(1, "Loại văn bản không được để trống"),

  /**
   * Số và ký hiệu của văn bản
   * Phải bắt đầu bằng "Số: " theo chuẩn Điều 10 NĐ 30/2020/NĐ-CP
   */
  referenceNumber: z.string().min(1, "Số ký hiệu không được để trống"),

  /**
   * Trích yếu nội dung văn bản
   * Ví dụ: "V/v ban hành quy chế làm việc của cơ quan..."
   */
  subject: z.string().min(1, "Trích yếu nội dung văn bản không được để trống"),

  /**
   * Nội dung chi tiết văn bản (HTML ngữ nghĩa)
   * Phân chia thành các căn cứ, Điều, Khoản, Điểm hoặc Phần I, II, III...
   */
  bodyHtml: z.string().min(1, "Nội dung văn bản không được để trống"),

  /**
   * Chức vụ, quyền hạn người ký
   * Ví dụ: "TM. ỦY BAN NHÂN DÂN\nCHỦ TỊCH" hoặc "KT. BỘ TRƯỞNG\nTHỨ TRƯỞNG"
   */
  signTitle: z.string().min(1, "Chức vụ người ký không được để trống"),

  /**
   * Họ và tên người ký
   */
  signName: z.string().min(1, "Họ tên người ký không được để trống"),

  /**
   * Nơi nhận văn bản
   * Ví dụ: "Như Điều 3;\nLưu: VT, TH."
   */
  recipients: z.string().min(1, "Nơi nhận văn bản không được để trống"),

  /**
   * Phụ lục văn bản độc lập (P0-07 / P0-B / P0-C)
   */
  appendices: z.array(z.any()).optional(),

  /**
   * Các khối chưa phân loại (unclassified blocks)
   */
  unclassified: z.array(z.any()).optional(),

  /**
   * Ghi chú bản thảo nguồn (ví dụ: BẢN HOÀN THIỆN ĐỂ ĐOÀN GIÁM SÁT XEM XÉT, TRÌNH KÝ)
   */
  draftNote: z.string().optional(),
  includeDraftNoteInExport: z.boolean().optional(),

  /**
   * Metadata nguồn tải lên / import
   */
  importMetadata: z.object({
    sourceType: z.enum(["template", "docx", "txt", "paste"]).optional(),
    status: z.enum(["parsed", "needs_review", "confirmed"]).optional(),
    sourceFilename: z.string().optional(),
  }).optional(),

  /**
   * Bảng biểu nguồn từ DOCX nhập khẩu, lưu giữ nguyên vẹn lưới và ô gộp OOXML
   */
  importedTables: z.record(z.string(), z.any()).optional(),
});

export type DocumentFormatType = z.infer<typeof DocumentFormatSchema>;

export type SourceBlockKind = "paragraph" | "table" | "section-break";

export type SourceRegion =
  | "header"
  | "metadata"
  | "body"
  | "signature"
  | "recipients"
  | "appendix"
  | "separator"
  | "unclassified";

export interface TableProperties {
  rows: number;
  columns: number;
  hasHeaderRow?: boolean;
  hasBorders?: boolean;
  alignment?: string;
  colWidthsTwips?: number[];
  isGridSpan?: boolean;
  isVMerge?: boolean;
  cantSplitRows?: boolean;
  partiallyPreserved?: boolean;
  notes?: string[];
  mergedCells?: Array<{
    row: number;
    col: number;
    colSpan?: number;
    rowSpan?: number;
    vMerge?: "restart" | "continue";
  }>;
}

export interface TableCellCoordinate {
  rowIndex: number;
  colIndex: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface PartitionProposal {
  id?: string;
  sourceBlockId: string;
  currentRole: SourceRegion;
  suggestedRole: SourceRegion;
  fieldKey?: string;
  exactQuote: string;
  cellLocation?: {
    rowIndex: number;
    colIndex: number;
  };
  reason: string;
  confidence: "high" | "medium" | "low";
  status: "pending" | "accepted" | "rejected" | "skipped";
  regime: "administrative" | "party";
  componentGroupIndex?: number; // 1 to 9
  requiresUserVerification?: boolean;
}

export interface PartitionCheckResult {
  requestFingerprint?: string;
  totalBlocks: number;
  reviewedBlocksCount: number;
  unreviewedBlocksCount: number;
  proposals: PartitionProposal[];
  source: "gemini_ai" | "rule_fallback" | "unverified";
  model?: string;
  isFallback: boolean;
  notice?: string;
}

export interface SourceBlock {
  id: string;
  index: number;
  kind: SourceBlockKind;
  text: string;
  html?: string;
  rawXml?: string;
  unsupportedFeatures?: UnsupportedFeature[];
  tableShape?: {
    rows: number;
    columns: number;
  };
  tableData?: string[][];
  tableProperties?: TableProperties;
  tableModel?: TableModel;
  style?: string;
  role?: SourceRegion;
  sourcePath?: string;
  confidence?: "high" | "medium" | "low";
  isConfirmed?: boolean;
}

export interface ExtractedField<T = string> {
  value: T | null;
  confidence: "high" | "medium" | "low";
  status: "extracted" | "missing" | "ambiguous" | "user_confirmed";
  sourceBlockIds: string[];
  note?: string;
}

export interface AppendixDocument {
  id: string;
  title: string;
  referenceText?: string;
  html: string;
  blocks: SourceBlock[];
  sourceBlockIds: string[];
  extractionStatus: "confirmed" | "needs_review";
  tables?: Array<{
    rows: number;
    columns: number;
    rowCount?: number;
    colCount?: number;
    data?: string[][];
  }>;
}

export interface StructuredImport {
  source: {
    filename: string;
    type: "docx" | "txt";
    blockCount: number;
    fileSize?: number;
    pageCount?: number;
    tableCount?: number;
    appendixCount?: number;
  };
  fields: Record<string, ExtractedField<string>>;
  front?: {
    orgHeader1?: string;
    orgHeader2?: string;
    nationalHeader1?: string;
    nationalHeader2?: string;
    referenceNumber?: string;
    locationAndDate?: string;
    documentType?: string;
    subject?: string;
    sourceBlockIds: string[];
  };
  body: {
    html: string;
    sourceBlockIds: string[];
    paragraphsCount?: number;
    tablesCount?: number;
  };
  /** Original multi-signer table, kept separately from the body region. */
  signatureHtml?: string;
  signatures?: Array<{
    id: string;
    title: string;
    name: string;
    note?: string;
    authorityPrefix?: string;
    isMultiSigner: boolean;
    sourceBlockIds: string[];
    confidence: "high" | "medium" | "low";
    confirmed: boolean;
  }>;
  seal?: {
    type: "wet_seal" | "digital_signature" | "none";
    status: "present" | "missing" | "unverified";
    sourceBlockIds: string[];
  };
  recipients?: {
    items: string[];
    filingNote?: string;
    rawText: string;
    sourceBlockIds: string[];
  };
  appendices: AppendixDocument[];
  supplementary?: {
    security?: string;
    urgency?: string;
    drafterNotation?: string;
    copyInfo?: string;
  };
  draftNote?: string;
  unclassified: SourceBlock[];
  blocks?: SourceBlock[];
  importFidelityManifest?: ImportFidelityManifest;
  order: string[];
}

export interface DocumentState {
  headerProfile?: "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID;
  orgHeader1: string;
  orgHeader2: string;
  nationalHeader1: string;
  nationalHeader2: string;
  locationAndDate: string;
  documentType: string;
  referenceNumber: string;
  subject: string;
  bodyHtml: string;
  signTitle: string;
  signName: string;
  recipients: string;
  draftNote?: string;
  includeDraftNoteInExport?: boolean;
  appendices?: AppendixDocument[];
  unclassified?: SourceBlock[];
  importMetadata?: {
    sourceType?: "template" | "docx" | "txt" | "paste";
    status?: "parsed" | "needs_review" | "confirmed";
    sourceFilename?: string;
  };
}

/**
 * Loại cảnh báo / vi phạm thể thức
 */
export interface ND30ComplianceIssue {
  id: string;
  field: keyof DocumentFormatType | "general";
  title: string;
  message: string;
  severity: "error" | "warning" | "info";
  suggestion?: string;
}

/**
 * Kết quả kiểm tra thể thức văn bản theo Nghị định 30/2020/NĐ-CP hoặc Hướng dẫn 05-HD/VPTW
 */
export interface ND30ComplianceReport {
  /** True nếu văn bản không có lỗi nghiêm trọng (severity === 'error') cản trở xuất file */
  passed: boolean;
  /** True nếu không có bất kỳ lỗi nghiêm trọng nào */
  noCriticalErrors: boolean;
  /** True chỉ khi văn bản đạt trọn vẹn 9/9 tiêu chí bắt buộc và không có lỗi nghiêm trọng */
  isStrictCompliant: boolean;
  score: number;
  totalChecks: number;
  passedChecks: number;
  issues: ND30ComplianceIssue[];
  canonical?: { total: number; passed: number; failed: number; notEvaluated: number; needsReview: number; notApplicable: number; sourceCommit: string };
}

/**
 * Hàm kiểm tra sự tuân thủ thể thức Nghị định 30/2020/NĐ-CP và Hướng dẫn 05-HD/VPTW
 */
export function validateND30Compliance(
  doc: Record<string, any>,
  regime: "administrative" | "party" = "administrative"
): ND30ComplianceReport {
  const issues: ND30ComplianceIssue[] = [];
  const isParty = regime === "party" || doc.regime === "party";
  let passedChecks = 0;
  const totalChecks = 9;

  // 1. Quốc hiệu
  const expectedH1 = isParty ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
  if (doc.nationalHeader1 !== expectedH1) {
    issues.push({
      id: "nationalHeader1",
      field: "nationalHeader1",
      title: "Quốc hiệu chưa đúng",
      message: `Quốc hiệu bắt buộc phải là "${expectedH1}" (in hoa, đứng, đậm).`,
      severity: "error",
      suggestion: expectedH1,
    });
  } else {
    passedChecks++;
  }

  // 2. Tiêu ngữ
  if (!isParty) {
    if (doc.nationalHeader2 !== "Độc lập - Tự do - Hạnh phúc") {
      issues.push({
        id: "nationalHeader2",
        field: "nationalHeader2",
        title: "Tiêu ngữ chưa đúng",
        message: 'Tiêu ngữ bắt buộc là "Độc lập - Tự do - Hạnh phúc" (chữ thường, đứng, đậm, có vạch kẻ dưới).',
        severity: "error",
        suggestion: "Độc lập - Tự do - Hạnh phúc",
      });
    } else {
      passedChecks++;
    }
  } else {
    if (doc.nationalHeader2 && doc.nationalHeader2.trim()) {
      issues.push({
        id: "nationalHeader2",
        field: "nationalHeader2",
        title: "Văn bản Đảng không có Tiêu ngữ",
        message: "Theo Hướng dẫn số 05-HD/VPTW, văn bản của Đảng không có tiêu ngữ 'Độc lập - Tự do - Hạnh phúc'.",
        severity: "warning",
        suggestion: "",
      });
    } else {
      passedChecks++;
    }
  }

  // 3. Cơ quan ban hành
  if (isPlaceholderValue(doc.orgHeader2)) {
    issues.push({
      id: "orgHeader2",
      field: "orgHeader2",
      title: "Chưa xác định cơ quan ban hành",
      message: "Tên cơ quan, tổ chức ban hành văn bản không được để trống hoặc là placeholder. Vui lòng nhập tên cơ quan thực tế.",
      severity: "error",
    });
  } else if (doc.orgHeader2 !== doc.orgHeader2.toUpperCase()) {
    issues.push({
      id: "orgHeader2_case",
      field: "orgHeader2",
      title: "Cơ quan ban hành phải viết in hoa",
      message: "Tên cơ quan ban hành văn bản phải được trình bày bằng chữ in hoa, cỡ 12-13, đứng, đậm.",
      severity: "warning",
      suggestion: doc.orgHeader2.toUpperCase(),
    });
  } else {
    passedChecks++;
  }

  // 4. Số và ký hiệu văn bản
  if (isPlaceholderValue(doc.referenceNumber)) {
    issues.push({
      id: "referenceNumber_empty",
      field: "referenceNumber",
      title: "Chưa có số và ký hiệu văn bản chính thức",
      message: isParty
        ? "Văn bản chưa có số ký hiệu chính thức theo quy định Hướng dẫn số 05-HD/VPTW (đang sử dụng placeholder)."
        : "Văn bản chưa có số ký hiệu chính thức theo quy định Điều 10 NĐ 30/2020/NĐ-CP (đang sử dụng placeholder).",
      severity: "warning",
    });
  } else if (isParty) {
    const trimmedRef = doc.referenceNumber.trim();
    if (trimmedRef.startsWith("Số:")) {
      issues.push({
        id: "referenceNumber_format",
        field: "referenceNumber",
        title: "Số ký hiệu văn bản Đảng không dùng dấu hai chấm",
        message: "Theo Hướng dẫn số 05-HD/VPTW, từ 'Số' không có dấu hai chấm ':' phía sau (VD: Số 12-NQ/ĐU, Số 01-NQ/TW).",
        severity: "warning",
        suggestion: trimmedRef.replace(/^Số:\s*/i, "Số "),
      });
    } else if (!REFERENCE_NUMBER_HD05_REGEX.test(trimmedRef)) {
      issues.push({
        id: "referenceNumber_format",
        field: "referenceNumber",
        title: "Số ký hiệu văn bản Đảng chưa đúng quy cách",
        message: "Theo Hướng dẫn số 05-HD/VPTW (Mục II.I.3.2.1), số văn bản phải có dạng 'Số [số]-[tên loại]/[cơ quan]' (VD: Số 12-NQ/ĐU). Số nhỏ hơn 10 phải ghi số 0 ở trước (VD: Số 01-NQ/TW).",
        severity: "warning",
      });
    } else {
      passedChecks++;
    }
  } else {
    const trimmedRef = doc.referenceNumber.trim();
    if (!REFERENCE_NUMBER_ND30_REGEX.test(trimmedRef)) {
      issues.push({
        id: "referenceNumber_format",
        field: "referenceNumber",
        title: "Số ký hiệu chưa đúng quy cách",
        message: "Số ký hiệu phải bắt đầu bằng 'Số: ' kèm chữ số và ký hiệu viết tắt loại văn bản, cơ quan (VD: Số: 125/QĐ-UBND).",
        severity: "warning",
        suggestion: trimmedRef.startsWith("Số:") 
          ? trimmedRef 
          : `Số: ${trimmedRef.replace(/^Số\s*/i, "")}`,
      });
    } else {
      passedChecks++;
    }
  }

  // 5. Địa danh và ngày tháng
  if (isPlaceholderValue(doc.locationAndDate)) {
    issues.push({
      id: "locationAndDate_missing",
      field: "locationAndDate",
      title: "Chưa xác định địa danh hoặc ngày ban hành",
      message: "Văn bản chưa có địa danh hoặc ngày tháng ban hành cụ thể (đang sử dụng placeholder).",
      severity: "warning",
    });
  } else if (!isValidND30LocationAndDate(doc.locationAndDate.trim())) {
    issues.push({
      id: "locationAndDate_format",
      field: "locationAndDate",
      title: "Định dạng ngày tháng chưa chuẩn NĐ 30",
      message: "Phải có định dạng: '[Địa danh], ngày dd tháng mm năm yyyy' (in nghiêng), ngày tháng phải có thực trên lịch (từ chối ngày 31 tháng 02, v.v.). Ngày dưới 10 và tháng 1, 2 bắt buộc có số 0 ở trước.",
      severity: "warning",
    });
  } else {
    passedChecks++;
  }

  // 6. Loại văn bản và trích yếu
  if (!doc.documentType || !doc.documentType.trim()) {
    issues.push({
      id: "documentType",
      field: "documentType",
      title: "Chưa có tên loại văn bản",
      message: "Cần xác định loại văn bản (QUYẾT ĐỊNH, CÔNG VĂN, BÁO CÁO, KẾ HOẠCH...).",
      severity: "error",
    });
  } else if (isPlaceholderValue(doc.subject)) {
    issues.push({
      id: "subject",
      field: "subject",
      title: "Trích yếu nội dung còn để trống",
      message: "Trích yếu nội dung phải tóm tắt ngắn gọn, chính xác mục đích ban hành của văn bản (tránh để placeholder).",
      severity: "warning",
    });
  } else {
    passedChecks++;
  }

  // 7. Nội dung chi tiết
  const bodyText = (doc.bodyHtml || "").replace(/<[^>]*>/g, " ").trim();
  if (!bodyText || bodyText.length < 20) {
    issues.push({
      id: "bodyHtml",
      field: "bodyHtml",
      title: "Nội dung văn bản quá ngắn hoặc chưa có",
      message: "Nội dung văn bản cần được soạn thảo chi tiết theo bố cục các Điều khoản hoặc phân mục rõ ràng.",
      severity: "error",
    });
  } else {
    passedChecks++;
  }

  // 8. Chức vụ & Người ký
  // 8. Chức vụ & Người ký
  const isMultiSignerDoc = Boolean(doc.signTitle && doc.signTitle.includes("|"));
  const signNames = (doc.signName || "").split("|").map((n: string) => n.trim());
  const hasValidSigner = isMultiSignerDoc
    ? signNames.some((n: string) => n.length > 0 && !isPlaceholderValue(n))
    : !isPlaceholderValue(doc.signName) && Boolean(doc.signName && doc.signName.trim().length > 0);

  if (!hasValidSigner) {
    issues.push({
      id: "signName",
      field: "signName",
      title: "Chưa xác định họ tên người ký",
      message: "Họ và tên người ký cần được ghi rõ ràng (chữ thường, đứng, đậm). Tránh để họ tên giả định hoặc placeholder.",
      severity: "warning",
    });
  } else {
    passedChecks++;
  }

  // 9. Nơi nhận
  const isDocMinutes = (doc.documentType || "").toUpperCase().includes("BIÊN BẢN");
  if (!doc.recipients || !doc.recipients.trim() || doc.recipients.includes("...")) {
    if (isDocMinutes) {
      // Biên bản làm việc không bắt buộc thành phần Nơi nhận riêng theo Mẫu 1.9 Phụ lục I NĐ 30/2020/NĐ-CP
      passedChecks++;
    } else {
      issues.push({
        id: "recipients",
        field: "recipients",
        title: "Chưa có nơi nhận văn bản cụ thể",
        message: "Cần chỉ định nơi nhận văn bản và bộ phận lưu trữ văn thư (Lưu: VT...).",
        severity: "warning",
      });
    }
  } else {
    passedChecks++;
  }

  const score = Math.round((passedChecks / totalChecks) * 100);
  const hasErrors = issues.some(i => i.severity === "error");
  const noCriticalErrors = !hasErrors;
  const isStrictCompliant = noCriticalErrors && passedChecks === totalChecks;
  const passed = noCriticalErrors; // Duy trì tương thích ngược cho các bài test

  // The nine field checks ARE NOT a full legal compliance certification.
  // The verified 435-rule catalogue (ND30) or 231-rule catalogue (HD05) is counted, including NOT_EVALUATED.
  const canonicalAudit = isParty ? auditCanonicalHD05() : auditCanonicalND30();
  const canonical = canonicalAudit ? {
    total: canonicalAudit.total,
    passed: canonicalAudit.counts.PASS,
    failed: canonicalAudit.counts.FAIL,
    notEvaluated: canonicalAudit.counts.NOT_EVALUATED,
    needsReview: canonicalAudit.counts.NEEDS_REVIEW,
    notApplicable: canonicalAudit.counts.NOT_APPLICABLE,
    sourceCommit: (canonicalAudit as any).commit || (canonicalAudit as any).sourceVersion || "HD05-2026",
  } : undefined;
  // Keep the legacy 9-check issue list stable for P0 tests; show canonical coverage separately in UI.
  return {
    passed,
    noCriticalErrors,
    isStrictCompliant,
    score,
    totalChecks,
    passedChecks,
    issues,
    canonical,
  };
}

/**
 * AI-Assisted and Rule-Based Review Proposal interface
 * Allows targeted corrections with exact quotes and regulatory reasons without whole-document rewrite.
 */
export interface ReviewProposal {
  id: string;
  type: "segmentation" | "format" | "spelling" | "consistency";
  target: string;
  targetBlockId?: string;
  cellIndex?: { row: number; col: number };
  original: string;
  suggested: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  source?: "gemini_ai" | "rule_fallback";
  label?: string;
  title?: string;
}

export interface DocumentReviewResult {
  success: boolean;
  source: "gemini_ai" | "rule_fallback";
  model?: string;
  isFallback: boolean;
  proposals: ReviewProposal[];
  summary: {
    total: number;
    segmentationCount: number;
    formatCount: number;
    spellingCount: number;
    consistencyCount: number;
  };
  notice?: string;
}

