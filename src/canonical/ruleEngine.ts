/**
 * @file ruleEngine.ts
 * @description Unified Canonical Rule Engine for DocForm-30.
 * Implements 2 independent regimes × 9 core component groups:
 * 1. Administrative (Nghị định 30/2020/NĐ-CP)
 * 2. Party (Hướng dẫn 05-HD/VPTW ngày 27/5/2026)
 *
 * Rules are strictly categorized into:
 * - mandatory_legal: Quy định pháp lý bắt buộc
 * - official_guidance: Hướng dẫn kỹ thuật chính thức
 * - company_profile: Profile riêng của Công ty Hoa tiêu hàng hải miền Bắc (không nới lỏng rule pháp lý)
 * - style_spelling: Khuyến nghị chính tả, ngữ pháp, văn phong
 *
 * Strict 5-state execution status:
 * - PASS: Đạt chuẩn (đã được đo đạc/kiểm chứng bằng chứng OOXML hoặc văn bản cụ thể)
 * - FAIL: Vi phạm quy chuẩn
 * - NOT_EVALUATED: Chưa thể đánh giá (thiếu runtime/bằng chứng, KHÔNG TÍNH VÀO PASS)
 * - NEEDS_REVIEW: Cần người dùng/chuyên viên văn phòng đối chiếu trực quan
 * - NOT_APPLICABLE: Không áp dụng cho loại văn bản hiện tại
 */

import rawNd30Catalog from "./nd30/rules.generated.json";
import rawHd05Catalog from "./hd05/rules.2026.json";
import { COMPANY_HEADER_PROFILE_ID, COMPANY_HEADER_TABLE_TWIPS } from "./nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID, COMPANY_HEADER_HD05_TABLE_TWIPS } from "./hd05/companyHeaderHD05.ts";
import { evidenceFromDocumentXml } from "./nd30/canonicalAudit.ts";
import { extractHD05EvidenceFromXml } from "./hd05/canonicalAuditHD05.ts";
import { extractBodyOoxmlEvidence } from "./bodyOoxmlEvidence.ts";
import { resolveRuleApplicability } from "./bodyRuleApplicability.ts";

export type RuleRegime = "administrative" | "party";

export type ComponentGroupId =
  | 1 // Tiêu đề hệ thể thức (Quốc hiệu/Tiêu ngữ NĐ30 vs Tiêu đề Đảng HD05)
  | 2 // Cơ quan ban hành
  | 3 // Số, ký hiệu văn bản
  | 4 // Địa danh và ngày tháng ban hành
  | 5 // Tên loại và trích yếu
  | 6 // Nội dung văn bản (đoạn văn, cấp đề mục, bảng biểu, danh sách, căn cứ, ngắt trang)
  | 7 // Quyền hạn, chức vụ, họ tên và chữ ký
  | 8 // Dấu, chữ ký số của cơ quan
  | 9 // Nơi nhận
  | "supp_appendix"           // Phụ lục văn bản
  | "supp_security_urgency"   // Dấu chỉ mức độ mật / khẩn
  | "supp_distribution"       // Chỉ dẫn phát hành / người soạn
  | "supp_copy"               // Thể thức bản sao
  | "supp_page_setup";        // Khổ trang và phân trang

export type RuleCategory = "mandatory_legal" | "official_guidance" | "company_profile" | "style_spelling";
export type VerificationType = "text" | "layout" | "semantic" | "external" | "visual";
export type RuleSeverity = "LEGAL_ERROR" | "WARNING" | "INFO";
export type FixPolicy = "AUTO_FIX" | "USER_CONFIRM_ONLY" | "PROHIBITED";
export type CanonicalStatus = "PASS" | "FAIL" | "NOT_EVALUATED" | "NEEDS_REVIEW" | "NOT_APPLICABLE";

export interface CanonicalRuleDef {
  id: string;
  regime: RuleRegime;
  componentGroup: ComponentGroupId;
  category: RuleCategory;
  sourceId: string;
  sourceLocator: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  maturity?: string;
  rawRegime?: string;
  appliesWhen?: {
    documentTypes?: string[]; // e.g. ["CONG_VAN", "QUYET_DINH"] or empty for all
    conditions?: string[];
  };
  target: {
    objectType: string;
    property: string;
  };
  expected: {
    type: "equals" | "range_inclusive" | "regex" | "one_of" | "custom";
    value?: unknown;
    min?: number;
    max?: number;
    pattern?: string;
    description: string;
  };
  evidenceType: VerificationType;
  checkMethod: "ooxml_measurement" | "regex_match" | "structural_ast" | "manual_visual" | "semantic_review";
  severity: RuleSeverity;
  fixPolicy: FixPolicy;
  title: string;
  description: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  regime: RuleRegime;
  componentGroup: ComponentGroupId;
  category: RuleCategory;
  title: string;
  status: CanonicalStatus;
  sourceLocator: string;
  expected: unknown;
  actual?: unknown;
  reason: string;
  severity: RuleSeverity;
  fixPolicy: FixPolicy;
  suggestion?: string;
}

export interface ComponentGroupMeta {
  id: ComponentGroupId;
  name: string;
  shortName: string;
  description: string;
  isSupplementary: boolean;
  order: number;
}

export const COMPONENT_GROUPS: ComponentGroupMeta[] = [
  {
    id: 1,
    name: "1. Tiêu đề hệ thể thức",
    shortName: "Tiêu đề",
    description: "NĐ 30: Quốc hiệu & Tiêu ngữ | HD 05: Tiêu đề Đảng Cộng sản Việt Nam",
    isSupplementary: false,
    order: 1,
  },
  {
    id: 2,
    name: "2. Cơ quan ban hành",
    shortName: "Cơ quan",
    description: "Tên cơ quan, cơ quan chủ quản, đường kẻ 1/3-1/2 (NĐ30) hoặc dấu hoa thị '*' (HD05)",
    isSupplementary: false,
    order: 2,
  },
  {
    id: 3,
    name: "3. Số, ký hiệu văn bản",
    shortName: "Số hiệu",
    description: "NĐ 30: 'Số: ...' (có dấu hai chấm) | HD 05: 'Số ...' (không có dấu hai chấm)",
    isSupplementary: false,
    order: 3,
  },
  {
    id: 4,
    name: "4. Địa danh và ngày tháng",
    shortName: "Ngày tháng",
    description: "Địa danh, ngày tháng ban hành (in nghiêng, ngày < 10 và tháng 1, 2 có số 0 ở trước)",
    isSupplementary: false,
    order: 4,
  },
  {
    id: 5,
    name: "5. Tên loại và trích yếu",
    shortName: "Trích yếu",
    description: "Tên loại văn bản và trích yếu nội dung (công văn Đảng đặt ở cột trái dưới số hiệu)",
    isSupplementary: false,
    order: 5,
  },
  {
    id: 6,
    name: "6. Nội dung văn bản",
    shortName: "Nội dung",
    description: "Căn cứ, cấp đề mục, đoạn văn, khoảng cách, thụt lề, bảng biểu và danh sách",
    isSupplementary: false,
    order: 6,
  },
  {
    id: 7,
    name: "7. Quyền hạn, chức vụ và chữ ký",
    shortName: "Người ký",
    description: "Thẩm quyền ký, chức vụ, họ tên người ký và chữ ký",
    isSupplementary: false,
    order: 7,
  },
  {
    id: 8,
    name: "8. Dấu và chữ ký số cơ quan",
    shortName: "Con dấu",
    description: "Vị trí con dấu trùm 1/3 chữ ký bên trái hoặc chữ ký số cơ quan chuẩn XML/PDF",
    isSupplementary: false,
    order: 8,
  },
  {
    id: 9,
    name: "9. Nơi nhận văn bản",
    shortName: "Nơi nhận",
    description: "Nơi nhận văn bản, bộ phận lưu trữ văn thư (không bắt buộc với biên bản)",
    isSupplementary: false,
    order: 9,
  },
  // Supplementary groups (conditional, not 10th main component)
  {
    id: "supp_appendix",
    name: "Bổ sung: Phụ lục văn bản",
    shortName: "Phụ lục",
    description: "Tiêu đề, số thứ tự phụ lục, trích dẫn văn bản ban hành kèm theo",
    isSupplementary: true,
    order: 10,
  },
  {
    id: "supp_security_urgency",
    name: "Bổ sung: Độ mật và độ khẩn",
    shortName: "Mật / Khẩn",
    description: "Chỉ dẫn mức độ mật (MẬT, TỐI MẬT, TUYỆT MẬT) và độ khẩn (HỎA TỐC, KHẨN)",
    isSupplementary: true,
    order: 11,
  },
  {
    id: "supp_distribution",
    name: "Bổ sung: Chỉ dẫn phát hành",
    shortName: "Chỉ dẫn",
    description: "Ký hiệu người soạn thảo và số lượng bản phát hành",
    isSupplementary: true,
    order: 12,
  },
  {
    id: "supp_copy",
    name: "Bổ sung: Thể thức bản sao",
    shortName: "Bản sao",
    description: "Hình thức sao (sao y, sao lục, trích sao), cơ quan sao, số và ngày sao",
    isSupplementary: true,
    order: 13,
  },
  {
    id: "supp_page_setup",
    name: "Bổ sung: Khổ trang và phân trang",
    shortName: "Trang & Lề",
    description: "Khổ giấy A4, lề trang tiêu chuẩn, đánh số trang từ trang thứ 2",
    isSupplementary: true,
    order: 14,
  },
];

/**
 * Builds the comprehensive rule registry for both regimes
 */
export function buildCanonicalRuleRegistry(): CanonicalRuleDef[] {
  const registry: CanonicalRuleDef[] = [];

  // =========================================================================
  // 1. NĐ 30 ADMINISTRATIVE REGIME RULES (Mapping from rules.generated.json)
  // =========================================================================
  const nd30Catalog = rawNd30Catalog as unknown as { rules: any[] };
  if (Array.isArray(nd30Catalog.rules)) {
    for (const r of nd30Catalog.rules) {
      let group: ComponentGroupId = 6; // default body
      const id = String(r.id || "");
      const targetObj = String(r.target?.object_type || "");
      const prop = String(r.target?.property || "");

      if (id.includes(".I.1A") || id.includes("NATIONAL_TITLE") || id.includes("MOTTO")) {
        group = 1;
      } else if (id.includes(".I.2A") || id.includes("ISSUER") || targetObj === "issuer") {
        group = 2;
      } else if (id.includes(".I.3A") || id.includes("REFERENCE_NUMBER") || prop.includes("reference_number")) {
        group = 3;
      } else if (id.includes(".I.4A") || id.includes("LOCATION_AND_DATE") || prop.includes("location") || prop.includes("date")) {
        group = 4;
      } else if (id.includes(".I.5A") || id.includes("DOCUMENT_TYPE") || id.includes("SUBJECT") || prop.includes("subject")) {
        group = 5;
      } else if (id.includes(".I.7A") || id.includes("SIGNER") || targetObj === "signer" || prop.includes("sign")) {
        group = 7;
      } else if (id.includes(".I.8A") || id.includes("SEAL") || prop.includes("seal")) {
        group = 8;
      } else if (id.includes(".I.9A") || id.includes("RECIPIENTS") || prop.includes("recipients")) {
        group = 9;
      } else if (id.includes("APPENDIX") || targetObj.includes("appendix")) {
        group = "supp_appendix";
      } else if (id.includes("SECURITY") || id.includes("URGENCY")) {
        group = "supp_security_urgency";
      } else if (id.includes("PAGE") || id.includes("MARGIN") || targetObj === "section") {
        group = "supp_page_setup";
      } else if (id.includes("COPY")) {
        group = "supp_copy";
      }

      // Canonical Appendix I IDs include the nested `I.II.<section>` path;
      // route those explicit component sections before relying on keyword fallback.
      const appendixIComponent = id.match(/\.PL1\.I\.II\.([1-9])(?:[A-Z]|\.)/);
      if (appendixIComponent) {
        group = Number(appendixIComponent[1]) as Extract<ComponentGroupId, number>;
      }
      if (targetObj === "seal_application" || targetObj === "seal") {
        group = 8;
      }

      const cTypeRaw = String(r.constraint?.type || "equals");
      const mappedType: CanonicalRuleDef["expected"]["type"] =
        cTypeRaw === "numeric_range" || cTypeRaw === "range_inclusive"
          ? "range_inclusive"
          : cTypeRaw === "one_of"
          ? "one_of"
          : cTypeRaw === "regex"
          ? "regex"
          : cTypeRaw === "equals"
          ? "equals"
          : "custom";

      const isSemanticReview = cTypeRaw === "semantic_review";

      registry.push({
        id,
        regime: "administrative",
        componentGroup: group,
        category: id.includes("PROFILE") ? "company_profile" : "mandatory_legal",
        sourceId: r.source?.source_id || "VN-STATE-ND30-2020",
        sourceLocator: r.source?.locator || "",
        effectiveFrom: r.temporality?.effective_from || "2020-03-05",
        effectiveTo: r.temporality?.effective_to || null,
        maturity: r.maturity,
        rawRegime: r.regime,
        target: {
          objectType: targetObj,
          property: prop,
        },
        expected: {
          type: mappedType,
          value: cTypeRaw === "one_of" ? r.constraint?.values : r.constraint?.value,
          min: r.constraint?.min,
          max: r.constraint?.max,
          description: r.constraint ? JSON.stringify(r.constraint) : "Quy chuẩn NĐ 30",
        },
        evidenceType: isSemanticReview ? "semantic" : (r.target?.object_type === "section" ? "layout" : "text"),
        checkMethod: isSemanticReview ? "semantic_review" : (r.target?.object_type === "section" ? "ooxml_measurement" : "structural_ast"),
        severity: r.validation?.severity === "LEGAL_ERROR" ? "LEGAL_ERROR" : "WARNING",
        fixPolicy: r.autofix?.policy === "PROHIBITED" ? "PROHIBITED" : "USER_CONFIRM_ONLY",
        title: id,
        description: `Quy tắc thể thức NĐ 30: ${r.source?.locator || id}`,
      });
    }
  }

  // =========================================================================
  // 2. HD 05 PARTY REGIME RULES (Mapping from rules.2026.json)
  // =========================================================================
  const hd05Catalog = rawHd05Catalog as unknown as { rules: (string | number)[][] };
  if (Array.isArray(hd05Catalog.rules)) {
    for (const tuple of hd05Catalog.rules) {
      const id = String(tuple[0]);
      const locator = String(tuple[1]);
      const targetObj = String(tuple[4]);
      const prop = String(tuple[5]);
      const operator = String(tuple[6]);
      const expectedVal = tuple[7];
      const verification = String(tuple[8]) as VerificationType;

      let group: ComponentGroupId = 6;
      if (id.startsWith("HD05.HEAD")) group = 1;
      else if (id.startsWith("HD05.ORG")) group = 2;
      else if (id.startsWith("HD05.NUM")) group = 3;
      else if (id.startsWith("HD05.DATE") || prop.includes("date") || prop.includes("place")) group = 4;
      else if (id.startsWith("HD05.TITLE")) group = 5;
      else if (id.startsWith("HD05.SIGN") || targetObj === "signer") group = 7;
      else if (id.startsWith("HD05.SEAL") || targetObj === "seal") group = 8;
      else if (id.startsWith("HD05.RECIP") || id.startsWith("HD05.REC.") || targetObj === "recipients") group = 9;
      else if (id.startsWith("HD05.APP") || targetObj === "appendix") group = "supp_appendix";
      else if (id.startsWith("HD05.SEC")) group = "supp_security_urgency";
      else if (id.startsWith("HD05.COPY")) group = "supp_copy";
      else if (id.startsWith("HD05.PAGE") || targetObj === "page" || targetObj === "paper") group = "supp_page_setup";
      else if (id.startsWith("HD05.STYLE")) {
        if (id === "HD05.STYLE.01") group = 1;
        else if (id === "HD05.STYLE.07" || id === "HD05.STYLE.08") group = 5;
        else group = 6;
      }

      registry.push({
        id,
        regime: "party",
        componentGroup: group,
        category: "mandatory_legal",
        sourceId: "VN-PARTY-HD05-2026",
        sourceLocator: locator,
        effectiveFrom: "2026-05-27",
        effectiveTo: null,
        target: {
          objectType: targetObj,
          property: prop,
        },
        expected: {
          type: operator === "range_inclusive" || operator === "range" ? "range_inclusive" : "equals",
          value: expectedVal,
          min: Array.isArray(expectedVal) && typeof expectedVal[0] === "number" ? expectedVal[0] : undefined,
          max: Array.isArray(expectedVal) && typeof expectedVal[1] === "number" ? expectedVal[1] : undefined,
          description: Array.isArray(expectedVal) ? JSON.stringify(expectedVal) : String(expectedVal),
        },
        evidenceType: verification || "text",
        checkMethod:
          verification === "layout"
            ? "ooxml_measurement"
            : verification === "visual"
            ? "manual_visual"
            : verification === "semantic"
            ? "semantic_review"
            : "structural_ast",
        severity: "LEGAL_ERROR",
        fixPolicy: "USER_CONFIRM_ONLY",
        title: id,
        description: `Quy tắc thể thức Đảng HD 05: ${locator}`,
      });
    }
  }


  // =========================================================================
  // 3. COMPANY PROFILES RULES (Hoa Tiêu Hàng Hải Miền Bắc)
  // =========================================================================
  // NĐ 30 Company Profile
  registry.push({
    id: "PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH",
    regime: "administrative",
    componentGroup: 2,
    category: "company_profile",
    sourceId: "PROFILE-HOA-TIEU-MB-ND30",
    sourceLocator: "header-reference.docx Table Grid",
    target: { objectType: "header_table", property: "width_twips" },
    expected: { type: "equals", value: COMPANY_HEADER_TABLE_TWIPS.width, description: `${COMPANY_HEADER_TABLE_TWIPS.width} twips` },
    evidenceType: "layout",
    checkMethod: "ooxml_measurement",
    severity: "INFO",
    fixPolicy: "AUTO_FIX",
    title: "Khung bảng Header Đơn vị NĐ 30",
    description: `Bảng Header mẫu đơn vị đạt chính xác ${COMPANY_HEADER_TABLE_TWIPS.width} twips (5187/5245)`,
  });
  registry.push({
    id: "PROFILE.ND30.HOA_TIEU_MB.SHAPE_LINES",
    regime: "administrative",
    componentGroup: 2,
    category: "company_profile",
    sourceId: "PROFILE-HOA-TIEU-MB-ND30",
    sourceLocator: "header-reference.docx DrawingML / VML",
    target: { objectType: "header_shape_lines", property: "drawingml_vml" },
    expected: { type: "equals", value: true, description: "Plain Line 1 & Plain Line 2" },
    evidenceType: "layout",
    checkMethod: "ooxml_measurement",
    severity: "INFO",
    fixPolicy: "AUTO_FIX",
    title: "Shape Lines DrawingML & VML NĐ 30",
    description: "Shape Lines chính xác từ bản mẫu Word của đơn vị",
  });

  // HD 05 Company Profile
  registry.push({
    id: "PROFILE.HD05.HOA_TIEU_MB.TABLE_WIDTH",
    regime: "party",
    componentGroup: 2,
    category: "company_profile",
    sourceId: "PROFILE-HOA-TIEU-MB-HD05",
    sourceLocator: "header-reference.docx Table Grid",
    target: { objectType: "header_table", property: "width_twips" },
    expected: { type: "equals", value: COMPANY_HEADER_HD05_TABLE_TWIPS.width, description: `${COMPANY_HEADER_HD05_TABLE_TWIPS.width} twips` },
    evidenceType: "layout",
    checkMethod: "ooxml_measurement",
    severity: "INFO",
    fixPolicy: "AUTO_FIX",
    title: "Khung bảng Header Đảng bộ",
    description: `Bảng Header Đảng bộ mẫu đạt chính xác ${COMPANY_HEADER_HD05_TABLE_TWIPS.width} twips (5580/4590)`,
  });
  registry.push({
    id: "PROFILE.HD05.HOA_TIEU_MB.SHAPE_LINE_TITLE",
    regime: "party",
    componentGroup: 1,
    category: "company_profile",
    sourceId: "PROFILE-HOA-TIEU-MB-HD05",
    sourceLocator: "header-reference.docx Straight Connector 1",
    target: { objectType: "party_title_line", property: "drawingml" },
    expected: { type: "equals", value: true, description: "Straight Connector 1 (207pt / 2628900 EMU)" },
    evidenceType: "layout",
    checkMethod: "ooxml_measurement",
    severity: "INFO",
    fixPolicy: "AUTO_FIX",
    title: "Shape Line Tiêu đề Đảng Đơn vị",
    description: "Độ dài đường kẻ 207pt bằng 100% dòng chữ ĐẢNG CỘNG SẢN VIỆT NAM",
  });

  // =========================================================================
  // 4. GROUP 6 SUB-RULES FOR BODY CONTENT (Tables, Headings, Bases, Paragraphs)
  // =========================================================================
  const bodySubRules: Array<{ id: string; title: string; regime: RuleRegime; prop: string; desc: string }> = [
    { id: "BODY.LEGAL_BASIS.FORMAT", title: "Định dạng Căn cứ pháp lý", regime: "administrative", prop: "legal_bases", desc: "Căn cứ pháp lý ban hành in thường, nghiêng, kết thúc bằng dấu chấm phẩy ';'" },
    { id: "BODY.HEADING.ARTICLE_FORMAT", title: "Định dạng Điều khoản", regime: "administrative", prop: "article_headings", desc: "Từ 'Điều ...' viết hoa chữ cái đầu, đậm; nội dung điều bắt đầu cùng dòng" },
    { id: "BODY.TABLE.PRESERVATION", title: "Bảo toàn Bảng biểu nội dung", regime: "administrative", prop: "table_geometry", desc: "Bảo toàn số hàng, số cột, ô gộp ngang/dọc và nội dung ô của bảng" },
    { id: "BODY.TABLE.HEADER_ROW", title: "Hàng tiêu đề Bảng biểu", regime: "administrative", prop: "table_header_row", desc: "Hàng đầu bảng in đậm, căn giữa, lặp lại trên trang mới nếu bảng ngắt trang" },
    { id: "BODY.PARAGRAPH.LINE_SPACING", title: "Khoảng cách dòng", regime: "administrative", prop: "line_spacing", desc: "Giãn dòng thân bài theo khoảng từ đơn đến 1.5 dòng; profile Hoa Tiêu MB áp dụng exactly 19pt" },
    { id: "BODY.PARAGRAPH.FIRST_LINE_INDENT", title: "Thụt lề đầu dòng", regime: "administrative", prop: "first_line_indent", desc: "Đầu dòng đoạn văn thụt lề từ 1cm đến 1.27cm (567 - 720 twips)" },
    { id: "BODY.PARTY.FIVE_HYPHENS", title: "5 dấu gạch nối trước nội dung", regime: "party", prop: "five_hyphens", desc: "Văn bản Đảng có tên loại phải có đúng 5 dấu gạch nối '-----' trước nội dung" },
    { id: "BODY.PARTY.SUBJECT_UPRIGHT_BOLD", title: "Trích yếu đứng đậm", regime: "party", prop: "subject_format", desc: "Trích yếu văn bản Đảng có tên loại in thường, đứng, đậm (không in nghiêng)" },
    { id: "HD05-BODY-LINE-SPACING", title: "Khoảng cách dòng văn bản Đảng", regime: "party", prop: "line_spacing", desc: "Dãn dòng cố định (exactly) từ 18pt đến 22pt" },
  ];

  for (const b of bodySubRules) {
    registry.push({
      id: b.id,
      regime: b.regime,
      componentGroup: 6,
      category: "official_guidance",
      sourceId: b.regime === "party" ? "VN-PARTY-HD05-2026" : "VN-STATE-ND30-2020",
      sourceLocator: "Phần nội dung văn bản",
      target: { objectType: "body_content", property: b.prop },
      expected: { type: "custom", description: b.desc },
      evidenceType: "text",
      checkMethod: "structural_ast",
      severity: "WARNING",
      fixPolicy: "USER_CONFIRM_ONLY",
      title: b.title,
      description: b.desc,
    });
  }

  return registry;
}

// Cached rule registry
let _registryCache: CanonicalRuleDef[] | null = null;
export function getRuleRegistry(): CanonicalRuleDef[] {
  if (!_registryCache) {
    _registryCache = buildCanonicalRuleRegistry();
  }
  return _registryCache;
}

/**
 * Filter rules for a specific regime and optional component group
 */
export function getRulesForRegime(regime: RuleRegime, componentGroup?: ComponentGroupId): CanonicalRuleDef[] {
  const all = getRuleRegistry();
  return all.filter(r => r.regime === regime && (componentGroup === undefined || r.componentGroup === componentGroup));
}

/**
 * Comprehensive Evaluation of the 9 Component Groups for a Document
 * Produces structured metrics separated into:
 * 1. Recognized component count (e.g. 8/9 components)
 * 2. Actionable issues count (e.g. 2 issues to resolve)
 * 3. Evidence-backed canonical audit (PASS / FAIL / NOT_EVALUATED / NEEDS_REVIEW / NOT_APPLICABLE)
 */
export interface DocumentEvaluationSummary {
  regime: RuleRegime;
  documentType: string;
  isParty: boolean;
  isCongVan: boolean;

  // Metric 1: 9 Core Component Recognition
  recognizedComponents: {
    total: number;
    recognized: number;
    groups: Array<{
      id: ComponentGroupId;
      name: string;
      shortName: string;
      status: "recognized" | "missing" | "needs_action" | "not_applicable";
      statusLabel: string;
      valuePreview?: string;
      issuesCount: number;
    }>;
  };

  // Metric 2: Actionable issues for office worker
  actionableIssues: Array<{
    id: string;
    componentGroup: ComponentGroupId;
    category: RuleCategory;
    title: string;
    message: string;
    severity: RuleSeverity;
    suggestion?: string;
    targetField?: string;
    targetBlockId?: string;
    canAutoFix: boolean;
  }>;

  // Metric 3: Strict Evidence-backed Canonical Rule Stats
  canonicalStats: {
    total: number;
    counts: Record<CanonicalStatus, number>;
    hasSufficientEvidence: boolean;
    evidenceNotes: string[];
  };

  // Metric 4: Formal 6-State Verification Gate
  verificationGate: {
    status: "PASS" | "FAIL" | "PARTIAL" | "NOT_EVALUATED" | "MANUAL_REVIEW" | "BLOCKED";
    label: string;
    isStandardValidated: boolean;
    description: string;
  };

  results: RuleEvaluationResult[];
}

/**
 * Executes evaluation of the document against the 2 regimes × 9 groups architecture.
 * Strictly separates NOT_EVALUATED and NEEDS_REVIEW from PASS.
 */
export function evaluateDocumentRules(
  docOrRegime: Record<string, any> | RuleRegime,
  regimeOrDoc: RuleRegime | Record<string, any> = "administrative",
  ooxmlEvidence?: any,
  _unusedParam?: any,
  _legacyDocType?: string
): DocumentEvaluationSummary {
  let doc: Record<string, any> = {};
  let effectiveRegime: RuleRegime = "administrative";

  if (typeof docOrRegime === "string" && (docOrRegime === "party" || docOrRegime === "administrative")) {
    effectiveRegime = docOrRegime;
    doc = (typeof regimeOrDoc === "object" && regimeOrDoc !== null) ? regimeOrDoc : {};
  } else {
    doc = (typeof docOrRegime === "object" && docOrRegime !== null) ? docOrRegime : {};
    effectiveRegime = (regimeOrDoc === "party" || doc.regime === "party") ? "party" : "administrative";
  }

  const isParty = effectiveRegime === "party";
  const docType = String(doc.documentType || "").trim().toUpperCase();
  const isCongVan = docType.includes("CÔNG VĂN");
  const isMinutes = docType.includes("BIÊN BẢN");

  const rules = getRulesForRegime(effectiveRegime);
  const results: RuleEvaluationResult[] = [];
  const actionableIssues: DocumentEvaluationSummary["actionableIssues"] = [];

  const counts: Record<CanonicalStatus, number> = {
    PASS: 0,
    FAIL: 0,
    NOT_EVALUATED: 0,
    NEEDS_REVIEW: 0,
    NOT_APPLICABLE: 0,
  };

  const evidenceNotes: string[] = [];

  // Group status tracking
  const groupStatusMap = new Map<ComponentGroupId, {
    status: "recognized" | "missing" | "needs_action" | "not_applicable";
    valuePreview?: string;
    issuesCount: number;
  }>();

  // Initialize all 9 groups + supplementary
  for (const cg of COMPONENT_GROUPS) {
    groupStatusMap.set(cg.id, {
      status: "missing",
      issuesCount: 0,
    });
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 1: Tiêu đề hệ thể thức
  // -------------------------------------------------------------------------
  {
    const g1 = groupStatusMap.get(1)!;
    if (isParty) {
      const h1 = doc.nationalHeader1 || "";
      g1.valuePreview = h1 || "ĐẢNG CỘNG SẢN VIỆT NAM";
      if (h1 === "ĐẢNG CỘNG SẢN VIỆT NAM") {
        g1.status = "recognized";
        if (doc.nationalHeader2 && doc.nationalHeader2.trim()) {
          g1.status = "needs_action";
          g1.issuesCount++;
          actionableIssues.push({
            id: "party_no_motto",
            componentGroup: 1,
            category: "mandatory_legal",
            title: "Văn bản Đảng không có tiêu ngữ",
            message: "Theo Hướng dẫn 05-HD/VPTW, văn bản Đảng chỉ có tiêu đề 'ĐẢNG CỘNG SẢN VIỆT NAM', không có tiêu ngữ 'Độc lập - Tự do - Hạnh phúc'.",
            severity: "LEGAL_ERROR",
            suggestion: "",
            targetField: "nationalHeader2",
            canAutoFix: true,
          });
        }
      } else {
        g1.status = "needs_action";
        g1.issuesCount++;
        actionableIssues.push({
          id: "party_title_invalid",
          componentGroup: 1,
          category: "mandatory_legal",
          title: "Sai tiêu đề Đảng",
          message: "Tiêu đề bắt buộc là 'ĐẢNG CỘNG SẢN VIỆT NAM' (in hoa, đứng, đậm, 15pt).",
          severity: "LEGAL_ERROR",
          suggestion: "ĐẢNG CỘNG SẢN VIỆT NAM",
          targetField: "nationalHeader1",
          canAutoFix: true,
        });
      }
    } else {
      // NĐ 30
      const h1 = doc.nationalHeader1 || "";
      const h2 = doc.nationalHeader2 || "";
      g1.valuePreview = `${h1}\n${h2}`;
      if (h1 === "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" && h2 === "Độc lập - Tự do - Hạnh phúc") {
        g1.status = "recognized";
      } else {
        g1.status = "needs_action";
        g1.issuesCount++;
        actionableIssues.push({
          id: "nd30_national_header_invalid",
          componentGroup: 1,
          category: "mandatory_legal",
          title: "Quốc hiệu hoặc Tiêu ngữ chưa đúng chuẩn",
          message: "Quốc hiệu phải là 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' (12-13pt in hoa đậm) và Tiêu ngữ 'Độc lập - Tự do - Hạnh phúc' (13-14pt thường đậm).",
          severity: "LEGAL_ERROR",
          suggestion: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc",
          targetField: "nationalHeader1",
          canAutoFix: true,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 2: Cơ quan ban hành
  // -------------------------------------------------------------------------
  {
    const g2 = groupStatusMap.get(2)!;
    const org = doc.orgHeader2 || "";
    g2.valuePreview = [doc.orgHeader1, org].filter(Boolean).join(" / ");
    if (!org.trim() || org.includes("…") || org.includes("[Tên cơ quan")) {
      g2.status = "missing";
      g2.issuesCount++;
      actionableIssues.push({
        id: "issuer_empty",
        componentGroup: 2,
        category: "mandatory_legal",
        title: "Cần bổ sung tên cơ quan ban hành",
        message: "Văn bản thiếu tên cơ quan, tổ chức ban hành thực tế.",
        severity: "LEGAL_ERROR",
        targetField: "orgHeader2",
        canAutoFix: false,
      });
    } else if (org !== org.toUpperCase()) {
      g2.status = "needs_action";
      g2.issuesCount++;
      actionableIssues.push({
        id: "issuer_case",
        componentGroup: 2,
        category: "official_guidance",
        title: "Tên cơ quan ban hành phải viết in hoa",
        message: "Tên cơ quan ban hành phải được viết bằng chữ in hoa, đứng, đậm.",
        severity: "WARNING",
        suggestion: org.toUpperCase(),
        targetField: "orgHeader2",
        canAutoFix: true,
      });
    } else {
      g2.status = "recognized";
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 3: Số, ký hiệu văn bản
  // -------------------------------------------------------------------------
  {
    const g3 = groupStatusMap.get(3)!;
    const ref = (doc.referenceNumber || "").trim();
    g3.valuePreview = ref;
    if (!ref || ref.includes("…") || ref.includes("[Số")) {
      g3.status = "missing";
      g3.issuesCount++;
      actionableIssues.push({
        id: "reference_empty",
        componentGroup: 3,
        category: "mandatory_legal",
        title: "Cần bổ sung số, ký hiệu văn bản",
        message: "Số và ký hiệu văn bản đang là ký hiệu giữ chỗ hoặc để trống.",
        severity: "WARNING",
        targetField: "referenceNumber",
        canAutoFix: false,
      });
    } else if (isParty) {
      if (ref.startsWith("Số:")) {
        g3.status = "needs_action";
        g3.issuesCount++;
        actionableIssues.push({
          id: "party_ref_has_colon",
          componentGroup: 3,
          category: "mandatory_legal",
          title: "Số ký hiệu văn bản Đảng không dùng dấu hai chấm",
          message: "Theo HD 05-HD/VPTW, từ 'Số' trong văn bản Đảng không có dấu hai chấm ':' (VD: Số 12-NQ/ĐU).",
          severity: "LEGAL_ERROR",
          suggestion: ref.replace(/^Số:\s*/i, "Số "),
          targetField: "referenceNumber",
          canAutoFix: true,
        });
      } else if (!/^Số\s+(?:0[1-9]|[1-9]\d*)-[\p{L}\d]+(?:\.[\p{L}\d]+)*\/[\p{L}\d\-\.]+$/u.test(ref)) {
        g3.status = "needs_action";
        g3.issuesCount++;
        actionableIssues.push({
          id: "party_ref_format",
          componentGroup: 3,
          category: "official_guidance",
          title: "Định dạng số ký hiệu văn bản Đảng chưa chuẩn",
          message: "Cần theo mẫu: 'Số [số]-[loại]/[cơ quan]'. Số nhỏ hơn 10 có số 0 ở trước (VD: Số 05-NQ/ĐUK).",
          severity: "WARNING",
          targetField: "referenceNumber",
          canAutoFix: false,
        });
      } else {
        g3.status = "recognized";
      }
    } else {
      // NĐ 30
      if (!ref.startsWith("Số:") && !ref.startsWith("Số :")) {
        g3.status = "needs_action";
        g3.issuesCount++;
        actionableIssues.push({
          id: "nd30_ref_missing_colon",
          componentGroup: 3,
          category: "mandatory_legal",
          title: "Số ký hiệu văn bản hành chính bắt buộc có 'Số: '",
          message: "Theo NĐ 30/2020/NĐ-CP, từ 'Số' bắt buộc có dấu hai chấm ':' (VD: Số: 125/KH-HTMB).",
          severity: "LEGAL_ERROR",
          suggestion: `Số: ${ref.replace(/^Số\s*/i, "")}`,
          targetField: "referenceNumber",
          canAutoFix: true,
        });
      } else {
        g3.status = "recognized";
      }
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 4: Địa danh và ngày tháng
  // -------------------------------------------------------------------------
  {
    const g4 = groupStatusMap.get(4)!;
    const locDate = (doc.locationAndDate || "").trim();
    g4.valuePreview = locDate;
    if (!locDate || locDate.includes("…") || locDate.includes("[Địa danh")) {
      g4.status = "missing";
      g4.issuesCount++;
      actionableIssues.push({
        id: "date_missing",
        componentGroup: 4,
        category: "mandatory_legal",
        title: "Cần bổ sung địa danh hoặc ngày tháng",
        message: "Chưa xác định đầy đủ địa danh hoặc ngày ban hành chính thức.",
        severity: "WARNING",
        targetField: "locationAndDate",
        canAutoFix: false,
      });
    } else if (!/^[\p{L}\s\.\-]+,\s*ngày\s+(?:0[1-9]|[12]\d|3[01])\s+tháng\s+(?:0[12]|[3-9]|1[0-2])\s+năm\s+\d{4}$/u.test(locDate)) {
      g4.status = "needs_action";
      g4.issuesCount++;
      actionableIssues.push({
        id: "date_format_invalid",
        componentGroup: 4,
        category: "official_guidance",
        title: "Định dạng ngày tháng chưa chuẩn",
        message: "Định dạng chuẩn: '[Địa danh], ngày dd tháng mm năm yyyy'. Số ngày < 10 và tháng 1, 2 phải có số 0 ở trước.",
        severity: "WARNING",
        targetField: "locationAndDate",
        canAutoFix: false,
      });
    } else {
      g4.status = "recognized";
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 5: Tên loại và trích yếu
  // -------------------------------------------------------------------------
  {
    const g5 = groupStatusMap.get(5)!;
    const type = (doc.documentType || "").trim();
    const sub = (doc.subject || "").trim();
    g5.valuePreview = type ? `${type}: ${sub}` : sub;
    if (!type && !isCongVan) {
      g5.status = "missing";
      g5.issuesCount++;
      actionableIssues.push({
        id: "doc_type_missing",
        componentGroup: 5,
        category: "mandatory_legal",
        title: "Cần xác định loại văn bản",
        message: "Văn bản chưa có tên loại (QUYẾT ĐỊNH, KẾ HOẠCH, BÁO CÁO, TỜ TRÌNH...).",
        severity: "LEGAL_ERROR",
        targetField: "documentType",
        canAutoFix: false,
      });
    } else if (!sub || sub.includes("…") || sub.includes("[Trích yếu")) {
      g5.status = "needs_action";
      g5.issuesCount++;
      actionableIssues.push({
        id: "subject_missing",
        componentGroup: 5,
        category: "mandatory_legal",
        title: "Cần bổ sung trích yếu nội dung",
        message: "Trích yếu tóm tắt nội dung văn bản còn để trống hoặc giữ chỗ.",
        severity: "WARNING",
        targetField: "subject",
        canAutoFix: false,
      });
    } else {
      g5.status = "recognized";
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 6: Nội dung văn bản
  // -------------------------------------------------------------------------
  {
    const g6 = groupStatusMap.get(6)!;
    const bodyHtml = String(doc.bodyHtml || "").trim();
    const cleanText = bodyHtml.replace(/<[^>]*>/g, " ").trim();
    g6.valuePreview = cleanText.length > 80 ? cleanText.slice(0, 80) + "…" : cleanText;
    if (!cleanText || cleanText.length < 20) {
      g6.status = "missing";
      g6.issuesCount++;
      actionableIssues.push({
        id: "body_too_short",
        componentGroup: 6,
        category: "mandatory_legal",
        title: "Nội dung văn bản chưa đầy đủ",
        message: "Nội dung văn bản quá ngắn hoặc chưa được đưa vào soạn thảo.",
        severity: "LEGAL_ERROR",
        targetField: "bodyHtml",
        canAutoFix: false,
      });
    } else {
      g6.status = "recognized";
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 7: Quyền hạn, chức vụ và chữ ký
  // -------------------------------------------------------------------------
  {
    const g7 = groupStatusMap.get(7)!;
    const title = (doc.signTitle || "").trim();
    const name = (doc.signName || "").trim();
    g7.valuePreview = [title, name].filter(Boolean).join(" - ");
    if (!title && !name) {
      // Document genuinely does not have signature (e.g. Draft plan, internal schedule)
      g7.status = "not_applicable";
      g7.valuePreview = "Tài liệu không có khối chữ ký trong nguồn";
    } else if (!name || name.includes("…") || name.toLowerCase().includes("nguyễn văn a")) {
      g7.status = "needs_action";
      g7.issuesCount++;
      actionableIssues.push({
        id: "signer_name_placeholder",
        componentGroup: 7,
        category: "official_guidance",
        title: "Cần xác nhận họ tên người ký",
        message: "Họ và tên người ký đang sử dụng dữ liệu giữ chỗ hoặc mẫu minh họa.",
        severity: "WARNING",
        targetField: "signName",
        canAutoFix: false,
      });
    } else {
      g7.status = "recognized";
    }
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 8: Dấu và chữ ký số
  // -------------------------------------------------------------------------
  {
    const g8 = groupStatusMap.get(8)!;
    g8.status = "recognized";
    g8.valuePreview = "Vị trí đóng dấu thẩm quyền theo quy định";
  }

  // -------------------------------------------------------------------------
  // EVALUATION GROUP 9: Nơi nhận văn bản
  // -------------------------------------------------------------------------
  {
    const g9 = groupStatusMap.get(9)!;
    const rec = (doc.recipients || "").trim();
    g9.valuePreview = rec.length > 60 ? rec.slice(0, 60) + "…" : rec;
    if (isMinutes) {
      g9.status = "not_applicable";
      g9.valuePreview = "Biên bản không bắt buộc nơi nhận riêng";
    } else if (!rec || rec.includes("…") || rec.includes("[Nơi nhận")) {
      g9.status = "needs_action";
      g9.issuesCount++;
      actionableIssues.push({
        id: "recipients_missing",
        componentGroup: 9,
        category: "mandatory_legal",
        title: "Cần bổ sung nơi nhận văn bản",
        message: "Chỉ định cơ quan nhận văn bản và bộ phận lưu trữ văn thư (Lưu: VT...).",
        severity: "WARNING",
        targetField: "recipients",
        canAutoFix: false,
      });
    } else {
      g9.status = "recognized";
    }
  }

  // -------------------------------------------------------------------------
  // SUPPLEMENTARY GROUPS
  // -------------------------------------------------------------------------
  {
    const suppApp = groupStatusMap.get("supp_appendix")!;
    const apps = doc.appendices;
    if (Array.isArray(apps) && apps.length > 0) {
      suppApp.status = "recognized";
      suppApp.valuePreview = `${apps.length} phụ lục đính kèm`;
    } else {
      suppApp.status = "not_applicable";
      suppApp.valuePreview = "Không có phụ lục";
    }

    const suppPage = groupStatusMap.get("supp_page_setup")!;
    suppPage.status = "recognized";
    suppPage.valuePreview = "Khổ giấy A4, Lề 20-20-30-15mm";
  }

  // -------------------------------------------------------------------------
  // PROCESS CANONICAL OOXML AUDIT (Strict 5-State Verification)
  // -------------------------------------------------------------------------
  const isUsingNd30CompanyProfile =
    doc.headerProfile === COMPANY_HEADER_PROFILE_ID ||
    ooxmlEvidence?.header_profile === COMPANY_HEADER_PROFILE_ID;
  const isUsingHd05CompanyProfile =
    doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID ||
    ooxmlEvidence?.header_profile === COMPANY_HEADER_HD05_PROFILE_ID;

  if (ooxmlEvidence) {
    evidenceNotes.push("Đã nạp bằng chứng thực tế trích xuất từ OOXML Word (.docx).");
    for (const r of rules) {
      let status: CanonicalStatus = "NOT_EVALUATED";
      let actual: unknown = undefined;
      let reason = "Chưa có bằng chứng đo lường trên phần tử này.";

      const asOf = "2026-10-15";
      const isOutOfScopeOrMaturity =
        (r.maturity !== undefined && r.maturity !== "verified") ||
        (r.rawRegime !== undefined && r.rawRegime !== "administrative") ||
        Boolean(r.effectiveFrom && r.effectiveFrom > asOf) ||
        Boolean(r.effectiveTo && r.effectiveTo < asOf);

      if (effectiveRegime === "administrative") {
        if (isOutOfScopeOrMaturity) {
          status = "NOT_APPLICABLE";
          reason = "Ngoài phạm vi, trạng thái hoặc thời điểm hiệu lực.";
        } else if (r.id === "ND30.PL1.I.II.1B.MOTTO_UNDERLINE_LENGTH") {
          if (ooxmlEvidence.motto_underline_length_relation !== undefined) {
            actual = ooxmlEvidence.motto_underline_length_relation;
            status = actual === "equal_to_text_length" ? "PASS" : "FAIL";
            reason = status === "PASS"
              ? "Đường kẻ dưới tiêu ngữ đạt 100% độ dài dòng chữ."
              : "Độ dài đường kẻ dưới tiêu ngữ không khớp độ dài dòng chữ.";
          }
        } else if (r.id === "ND30.PL1.I.II.2B.ISSUER_UNDERLINE_RANGE") {
          if (typeof ooxmlEvidence.issuer_underline_fraction === "number") {
            const frac = ooxmlEvidence.issuer_underline_fraction;
            actual = frac;
            const min = typeof r.expected.min === "number" ? r.expected.min : 0.3333;
            const max = typeof r.expected.max === "number" ? r.expected.max : 0.5;
            const ok = frac + 0.02 >= min && frac - 0.02 <= max;
            status = ok ? "PASS" : "FAIL";
            reason = ok
              ? `Đường kẻ cơ quan ban hành đạt ${(frac * 100).toFixed(1)}% (trong khoảng 1/3 - 1/2 quy chuẩn).`
              : `Đường kẻ cơ quan ban hành (${(frac * 100).toFixed(1)}%) không nằm trong khoảng 1/3 đến 1/2 dòng chữ.`;
          }
        } else if (r.id === "ND30.PL1.I.GENERAL.ORIENTATION_LANDSCAPE_TABLE_EXCEPTION" && !ooxmlEvidence.has_landscape_table_exception) {
          status = "NOT_APPLICABLE";
          reason = "Quy tắc chỉ áp dụng cho trường hợp ngoại lệ bảng biểu rộng trình bày theo chiều ngang (landscape).";
        } else if (r.target.objectType === "section" && r.target.property) {
          let val = ooxmlEvidence[r.target.property];
          if (val === undefined && r.target.property === "page_size" && typeof ooxmlEvidence.page_width_mm === "number") {
            val = Math.abs(ooxmlEvidence.page_width_mm - 210) <= 0.5 &&
                  (ooxmlEvidence.page_height_mm === undefined || Math.abs(ooxmlEvidence.page_height_mm - 297) <= 0.5)
              ? "A4"
              : "OTHER";
          }
          if (val !== undefined) {
            actual = val;
            let matched: boolean | null = null;
            if (r.expected.type === "range_inclusive" && typeof val === "number" && typeof r.expected.min === "number" && typeof r.expected.max === "number") {
              matched = val + 0.08 >= r.expected.min && val - 0.08 <= r.expected.max;
            } else if (r.expected.type === "equals") {
              if (typeof val === "number" && typeof r.expected.value === "number") {
                matched = Math.abs(val - r.expected.value) <= 0.5;
              } else {
                matched = val === r.expected.value;
              }
            } else if (r.expected.type === "one_of" && Array.isArray(r.expected.value)) {
              matched = r.expected.value.includes(val);
            }
            if (matched !== null) {
              status = matched ? "PASS" : "FAIL";
              reason = matched
                ? "Kích thước hình học trang đo từ OOXML đạt chuẩn."
                : `Kích thước hình học trang đo từ OOXML (${String(val)}) không khớp quy chuẩn (${r.expected.description}).`;
            }
          }
        } else if (r.id === "PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH") {
          if (!isUsingNd30CompanyProfile) {
            status = "NOT_APPLICABLE";
            reason = "Tài liệu không sử dụng profile Công ty Hoa tiêu Hàng hải miền Bắc (NĐ 30).";
          } else if (typeof ooxmlEvidence.header_table_width_twips === "number") {
            actual = ooxmlEvidence.header_table_width_twips;
            const colsMatch =
              (ooxmlEvidence.header_left_col_twips === undefined || ooxmlEvidence.header_left_col_twips === COMPANY_HEADER_TABLE_TWIPS.left) &&
              (ooxmlEvidence.header_right_col_twips === undefined || ooxmlEvidence.header_right_col_twips === COMPANY_HEADER_TABLE_TWIPS.right);
            const ok = actual === COMPANY_HEADER_TABLE_TWIPS.width && colsMatch;
            status = ok ? "PASS" : "FAIL";
            reason = ok
              ? `Khung bảng Header khớp mẫu chuẩn đơn vị (${COMPANY_HEADER_TABLE_TWIPS.width} twips: 5187/5245).`
              : `Khung bảng Header (${String(actual)} twips) không khớp mẫu chuẩn đơn vị (${COMPANY_HEADER_TABLE_TWIPS.width} twips).`;
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có thông số đo độ rộng bảng Header từ OOXML.";
          }
        } else if (r.id === "PROFILE.ND30.HOA_TIEU_MB.SHAPE_LINES") {
          if (!isUsingNd30CompanyProfile) {
            status = "NOT_APPLICABLE";
            reason = "Tài liệu không sử dụng profile Công ty Hoa tiêu Hàng hải miền Bắc (NĐ 30).";
          } else if (typeof ooxmlEvidence.has_nd30_shape_lines === "boolean") {
            actual = ooxmlEvidence.has_nd30_shape_lines;
            status = actual ? "PASS" : "FAIL";
            reason = actual
              ? "Đầy đủ Shape Lines DrawingML & VML khớp mẫu chuẩn của Công ty."
              : "Thiếu hoặc sai lệch Shape Lines DrawingML & VML của mẫu chuẩn Công ty.";
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có bằng chứng kiểm tra Shape Lines từ OOXML.";
          }
        } else if (r.id === "BODY.PARAGRAPH.FIRST_LINE_INDENT" || r.id === "ND30-BODY-FIRST-LINE-INDENT") {
          const app = resolveRuleApplicability(r.id, "administrative", docType, "body");
          if (app.status === "not_applicable") {
            status = "NOT_APPLICABLE";
            reason = app.reason;
          } else {
            const bEv = ooxmlEvidence.body_evidence;
            if (!bEv || !bEv.hasDirectBodyParagraphs || !bEv.firstLineIndentRangeDxa) {
              status = "NOT_EVALUATED";
              reason = "Chưa có bằng chứng đo lường thụt đầu dòng của các đoạn thân bài trực tiếp.";
            } else {
              const min = bEv.firstLineIndentRangeDxa.min;
              const max = bEv.firstLineIndentRangeDxa.max;
              actual = `${min} - ${max} dxa`;
              const ok = min >= 560 && max <= 730;
              status = ok ? "PASS" : "FAIL";
              reason = ok
                ? `Thụt đầu dòng đoạn thân bài (${min}-${max} dxa) đạt chuẩn 1.0-1.27cm (567-720 dxa) theo NĐ 30.`
                : `Thụt đầu dòng đoạn thân bài (${min}-${max} dxa) nằm ngoài khoảng 1.0-1.27cm (567-720 dxa).`;
            }
          }
        } else if (r.id === "BODY.PARAGRAPH.LINE_SPACING" || r.id === "ND30-BODY-LINE-SPACING") {
          const app = resolveRuleApplicability(r.id, "administrative", docType, "body");
          if (app.status === "not_applicable") {
            status = "NOT_APPLICABLE";
            reason = app.reason;
          } else {
            const bEv = ooxmlEvidence.body_evidence;
            if (!bEv || !bEv.hasDirectBodyParagraphs || !bEv.lineSpacingRangeDxa) {
              status = "NOT_EVALUATED";
              reason = "Chưa có bằng chứng đo lường khoảng cách dòng thân bài.";
            } else {
              const min = bEv.lineSpacingRangeDxa.min;
              const max = bEv.lineSpacingRangeDxa.max;
              actual = `${min} - ${max} dxa`;
              if (isUsingNd30CompanyProfile) {
                const bodyParagraphs = bEv.directParagraphs.filter((p: any) =>
                  p.text.trim().length > 0 && (p.isEligibleBody || p.role === "heading")
                );
                const exactCompanySpacing = bodyParagraphs.length > 0 && bodyParagraphs.every((p: any) =>
                  p.lineRule === "exact" && p.lineSpacingDxa === 380
                );
                status = exactCompanySpacing ? "PASS" : "FAIL";
                reason = exactCompanySpacing
                  ? "Các đoạn và đề mục thân bài của profile Hoa Tiêu MB dùng Exactly 19pt (380 twips)."
                  : "Profile Hoa Tiêu MB yêu cầu các đoạn và đề mục thân bài dùng Exactly 19pt (380 twips).";
              } else {
                const ok = min >= 240 && max <= 360;
                status = ok ? "PASS" : "FAIL";
                reason = ok
                  ? `Khoảng cách dòng thân bài (${min}-${max} dxa) đạt chuẩn từ đơn đến 1.5 dòng (240-360 dxa).`
                  : `Khoảng cách dòng thân bài (${min}-${max} dxa) không thuộc khoảng đơn đến 1.5 dòng.`;
              }
            }
          }
        } else if (r.id === "ND30-BODY-FONT-SIZE") {
          const app = resolveRuleApplicability(r.id, "administrative", docType, "body");
          if (app.status === "not_applicable") {
            status = "NOT_APPLICABLE";
            reason = app.reason;
          } else {
            const bEv = ooxmlEvidence.body_evidence;
            if (!bEv || !bEv.hasDirectBodyParagraphs || !bEv.fontSizeRangePt) {
              status = "NOT_EVALUATED";
              reason = "Chưa có bằng chứng cỡ chữ thân bài từ OOXML.";
            } else {
              const min = bEv.fontSizeRangePt.min;
              const max = bEv.fontSizeRangePt.max;
              actual = `${min} - ${max} pt`;
              const ok = min >= 13 && max <= 14;
              status = ok ? "PASS" : "FAIL";
              reason = ok
                ? `Cỡ chữ thân bài (${min}-${max}pt) đạt chuẩn 13-14pt theo NĐ 30.`
                : `Cỡ chữ thân bài (${min}-${max}pt) không nằm trong khoảng 13-14pt.`;
            }
          }
        } else if (r.id === "BODY.TABLE.PRESERVATION") {
          const hasAnyTables = Boolean(
            (doc.importedTables && Object.keys(doc.importedTables).length > 0) ||
            /<table\b/i.test(doc.bodyHtml || "")
          );
          if (!hasAnyTables) {
            status = "NOT_APPLICABLE";
            reason = "Văn bản không chứa bảng biểu nội dung.";
          } else if (ooxmlEvidence.candidate_fidelity_result) {
            const safe = Boolean(ooxmlEvidence.candidate_fidelity_result.safe);
            status = safe ? "PASS" : "FAIL";
            reason = safe
              ? "Cấu trúc bảng biểu nội dung được bảo toàn qua lưới OOXML và kiểm chứng roundtrip."
              : `Phát hiện ${ooxmlEvidence.candidate_fidelity_result.diffs?.length || 0} điểm sai khác cấu trúc bảng trong DOCX ứng viên.`;
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có kết quả kiểm chứng roundtrip trên DOCX ứng viên thực tế.";
          }
        } else if (r.id === "BODY.TABLE.HEADER_ROW") {
          const hasAnyTables = Boolean(
            (doc.importedTables && Object.keys(doc.importedTables).length > 0) ||
            /<table\b/i.test(doc.bodyHtml || "")
          );
          const hasTablesWithHeaderRow = isUsingNd30CompanyProfile
            ? hasAnyTables
            : Boolean(
                (doc.importedTables && Object.values(doc.importedTables as Record<string, any>).some((t: any) => t.rows && t.rows.some((row: any) => row.isHeader))) ||
                /<th\b/i.test(doc.bodyHtml || "")
              );
          if (!hasAnyTables || !hasTablesWithHeaderRow) {
            status = "NOT_APPLICABLE";
            reason = "Văn bản không có bảng yêu cầu hàng tiêu đề lặp lại.";
          } else if (ooxmlEvidence.candidate_fidelity_result) {
            const candidateXml = ooxmlEvidence.candidate_fidelity_result.candidateXml || "";
            const hasHeaderDiff = ooxmlEvidence.candidate_fidelity_result.diffs?.some((d: any) => d.messageVi?.includes("tblHeader") || d.messageVi?.includes("tiêu đề"));
            const hasTblHeaderXml = candidateXml
              ? isUsingNd30CompanyProfile
                ? (() => {
                    const bodyTables = (candidateXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/gi) || [])
                      .filter((tableXml: string) => !/w:tblCaption\b[^>]*w:val=["']system_(?:header_layout|signature_layout)_table["']/i.test(tableXml));
                    return bodyTables.length > 0 && bodyTables.every((tableXml: string) => {
                      const firstRow = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/i)?.[0] || "";
                      return /<w:tblHeader\b/i.test(firstRow);
                    });
                  })()
                : /<w:tblHeader\b/i.test(candidateXml)
              : !hasHeaderDiff;
            status = (!hasHeaderDiff && hasTblHeaderXml) ? "PASS" : "FAIL";
            reason = status === "PASS"
              ? "Hàng tiêu đề bảng được định dạng và gán thuộc tính lặp w:tblHeader trên DOCX ứng viên."
              : "Hàng tiêu đề bảng bị mất thuộc tính lặp w:tblHeader trong DOCX ứng viên.";
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có bằng chứng DOCX ứng viên để kiểm tra thuộc tính lặp w:tblHeader.";
          }
        } else if (r.checkMethod === "semantic_review" || r.evidenceType === "visual" || r.evidenceType === "semantic") {
          status = "NEEDS_REVIEW";
          reason = "Quy tắc cần người dùng/chuyên viên đối chiếu nghiệp vụ hoặc trực quan; không tự tính PASS.";
        }
      } else {
        // Party HD 05
        const effectiveCongVan = typeof ooxmlEvidence.is_cong_van === "boolean" ? ooxmlEvidence.is_cong_van : isCongVan;

        if (r.id === "HD05.HEAD.01" || r.id === "HD05.HEAD.02") {
          if (typeof ooxmlEvidence.has_party_title === "boolean") {
            actual = ooxmlEvidence.has_party_title;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "Tiêu đề 'ĐẢNG CỘNG SẢN VIỆT NAM' hiện diện đầy đủ." : "Thiếu tiêu đề Đảng.";
          }
        } else if (r.id === "HD05.HEAD.03" || r.id === "HD05.HEAD.04") {
          if (ooxmlEvidence.party_title_underline_style !== undefined) {
            actual = ooxmlEvidence.party_title_underline_style;
            status = Boolean(actual) ? "PASS" : "FAIL";
            reason = status === "PASS" ? "Đường kẻ ngang nét liền hiện diện dưới tiêu đề Đảng." : "Thiếu đường kẻ ngang nét liền dưới tiêu đề Đảng.";
          }
        } else if (r.id === "HD05.HEAD.05") {
          if (ooxmlEvidence.party_title_underline_length_relation !== undefined) {
            actual = ooxmlEvidence.party_title_underline_length_relation;
            status = actual === "equal_to_title_length" ? "PASS" : "FAIL";
            reason = status === "PASS" ? "Đường kẻ dưới ĐCSVN đạt 100% độ dài dòng chữ." : "Độ dài đường kẻ dưới tiêu đề Đảng không khớp độ dài dòng chữ.";
          }
        } else if (r.id === "HD05.ORG.13") {
          if (typeof ooxmlEvidence.has_issuer_star === "boolean") {
            actual = ooxmlEvidence.has_issuer_star;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "Dấu '*' hiện diện cân đối dưới cơ quan ban hành." : "Thiếu dấu '*' dưới cơ quan ban hành.";
          }
        } else if (r.id === "HD05.ORG.14") {
          if (typeof ooxmlEvidence.star_position_valid === "boolean") {
            actual = ooxmlEvidence.star_position_valid;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "Dấu '*' đặt cân đối dưới cơ quan ban hành và trên số, ký hiệu." : "Vị trí dấu '*' chưa đúng.";
          }
        } else if (r.id === "HD05.NUM.12") {
          if (ooxmlEvidence.reference_number_text !== undefined) {
            const hasNoColon = ooxmlEvidence.reference_number_has_colon !== true;
            actual = ooxmlEvidence.reference_number_text;
            status = Boolean(actual) && hasNoColon ? "PASS" : "FAIL";
            reason = status === "PASS"
              ? "Số ký hiệu văn bản Đảng hiện diện chuẩn ở cột trái (không có dấu hai chấm)."
              : "Thiếu số ký hiệu hoặc sai quy cách dấu hai chấm trong văn bản Đảng.";
          }
        } else if (r.id === "HD05.NUM.13") {
          if (typeof ooxmlEvidence.reference_number_leading_zero === "boolean") {
            actual = ooxmlEvidence.reference_number_leading_zero;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "Số thứ tự dưới 10 có số 0 ở trước." : "Số thứ tự dưới 10 thiếu số 0 ở trước.";
          }
        } else if (r.id === "HD05.NUM.14" || r.id === "HD05.NUM.15") {
          if (typeof ooxmlEvidence.reference_number_has_hyphen_and_slash === "boolean") {
            actual = ooxmlEvidence.reference_number_has_hyphen_and_slash;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "Sử dụng đúng dấu '-' và '/' trong số, ký hiệu văn bản Đảng." : "Thiếu dấu '-' hoặc '/' trong số, ký hiệu văn bản Đảng.";
          }
        } else if (r.id === "HD05.TITLE.06" || r.id === "BODY.PARTY.FIVE_HYPHENS") {
          if (effectiveCongVan) {
            status = "NOT_APPLICABLE";
            reason = "Công văn Đảng không dùng cụm 5 dấu gạch nối giữa trang.";
          } else if (typeof ooxmlEvidence.has_five_hyphens === "boolean") {
            actual = ooxmlEvidence.has_five_hyphens;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "Có đúng 5 dấu gạch nối '-----' dưới trích yếu." : "Thiếu 5 dấu gạch nối '-----'.";
          }
        } else if (r.id === "HD05.TITLE.07") {
          if (effectiveCongVan) {
            status = "NOT_APPLICABLE";
            reason = "Công văn Đảng không dùng cụm 5 dấu gạch nối giữa trang.";
          } else if (typeof ooxmlEvidence.five_hyphens_position_valid === "boolean") {
            actual = ooxmlEvidence.five_hyphens_position_valid;
            status = actual ? "PASS" : "FAIL";
            reason = actual ? "5 dấu gạch nối đặt dưới trích yếu, trước nội dung." : "Vị trí 5 dấu gạch nối không đúng.";
          }
        } else if (r.id === "HD05.TITLE.09") {
          if (effectiveCongVan) {
            if (typeof ooxmlEvidence.subject_in_left_column === "boolean") {
              actual = ooxmlEvidence.subject_in_left_column;
              status = actual ? "PASS" : "FAIL";
              reason = actual ? "Trích yếu công văn đặt ở cột trái dưới số hiệu." : "Trích yếu công văn chưa đúng vị trí.";
            }
          } else {
            status = "NOT_APPLICABLE";
            reason = "Quy tắc chỉ áp dụng cho công văn.";
          }
        } else if (r.id === "HD05.TITLE.10") {
          if (effectiveCongVan) {
            if (typeof ooxmlEvidence.has_five_hyphens === "boolean") {
              actual = !ooxmlEvidence.has_five_hyphens;
              status = actual ? "PASS" : "FAIL";
              reason = actual ? "Công văn không áp cụm tên loại/trích yếu/----- giữa trang." : "Công văn không được có cụm ----- giữa trang.";
            }
          } else {
            status = "NOT_APPLICABLE";
            reason = "Quy tắc chỉ áp dụng cho công văn.";
          }
        } else if (r.id === "HD05.PAGE.03") {
          if (typeof ooxmlEvidence.page_width_mm === "number" && typeof ooxmlEvidence.page_height_mm === "number") {
            actual = [ooxmlEvidence.page_width_mm, ooxmlEvidence.page_height_mm];
            const ok = Math.abs(ooxmlEvidence.page_width_mm - 210) <= 0.5 && Math.abs(ooxmlEvidence.page_height_mm - 297) <= 0.5;
            status = ok ? "PASS" : "FAIL";
            reason = ok ? "Khổ giấy A4 (210x297mm) đạt chuẩn." : `Khổ giấy (${ooxmlEvidence.page_width_mm.toFixed(1)}x${ooxmlEvidence.page_height_mm.toFixed(1)}mm) không khớp A4 (210x297mm).`;
          }
        } else if (r.id === "HD05.PAGE.05") {
          if (ooxmlEvidence.orientation !== undefined) {
            actual = ooxmlEvidence.orientation;
            status = actual === "portrait" ? "PASS" : "FAIL";
            reason = status === "PASS" ? "Hướng trang dọc (portrait) đạt chuẩn." : "Hướng trang không phải portrait.";
          }
        } else if (r.id === "HD05.PAGE.06" || r.id === "HD05.PAGE.07" || r.id === "HD05.PAGE.08" || r.id === "HD05.PAGE.09") {
          const propKey = r.target.property;
          const val = ooxmlEvidence[propKey];
          if (typeof val === "number" && typeof r.expected.value === "number") {
            actual = val;
            const ok = Math.abs(val - r.expected.value) <= 0.5;
            status = ok ? "PASS" : "FAIL";
            reason = ok ? `Lề trang (${propKey}) đạt chuẩn ${r.expected.value}mm.` : `Lề trang (${propKey}=${val.toFixed(1)}mm) không khớp chuẩn ${r.expected.value}mm.`;
          }
        } else if (r.id === "HD05.STYLE.01") {
          if (typeof ooxmlEvidence.party_title_font_pt === "number" && typeof ooxmlEvidence.party_title_is_bold === "boolean") {
            const ok = ooxmlEvidence.party_title_font_pt === 15 && ooxmlEvidence.party_title_is_bold;
            actual = `${ooxmlEvidence.party_title_font_pt}pt, bold=${ooxmlEvidence.party_title_is_bold}`;
            status = ok ? "PASS" : "FAIL";
            reason = ok ? "Tiêu đề Đảng đúng cỡ 15pt đậm." : "Tiêu đề Đảng chưa đúng cỡ 15pt đậm.";
          }
        } else if (r.id === "PROFILE.HD05.HOA_TIEU_MB.TABLE_WIDTH") {
          if (!isUsingHd05CompanyProfile) {
            status = "NOT_APPLICABLE";
            reason = "Tài liệu không sử dụng profile Đảng bộ Công ty Hoa tiêu Hàng hải miền Bắc (HD 05).";
          } else if (typeof ooxmlEvidence.header_table_width_twips === "number") {
            actual = ooxmlEvidence.header_table_width_twips;
            const colsMatch =
              (ooxmlEvidence.header_left_col_twips === undefined || ooxmlEvidence.header_left_col_twips === COMPANY_HEADER_HD05_TABLE_TWIPS.left) &&
              (ooxmlEvidence.header_right_col_twips === undefined || ooxmlEvidence.header_right_col_twips === COMPANY_HEADER_HD05_TABLE_TWIPS.right);
            const ok = actual === COMPANY_HEADER_HD05_TABLE_TWIPS.width && colsMatch;
            status = ok ? "PASS" : "FAIL";
            reason = ok
              ? `Khung bảng Header Đảng bộ khớp mẫu chuẩn (${COMPANY_HEADER_HD05_TABLE_TWIPS.width} twips: 5580/4590).`
              : `Khung bảng Header Đảng bộ (${String(actual)} twips) không khớp mẫu chuẩn (${COMPANY_HEADER_HD05_TABLE_TWIPS.width} twips).`;
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có thông số đo độ rộng bảng Header Đảng bộ từ OOXML.";
          }
        } else if (r.id === "PROFILE.HD05.HOA_TIEU_MB.SHAPE_LINE_TITLE") {
          if (!isUsingHd05CompanyProfile) {
            status = "NOT_APPLICABLE";
            reason = "Tài liệu không sử dụng profile Đảng bộ Công ty Hoa tiêu Hàng hải miền Bắc (HD 05).";
          } else if (typeof ooxmlEvidence.has_hd05_shape_line === "boolean") {
            actual = ooxmlEvidence.has_hd05_shape_line;
            status = actual ? "PASS" : "FAIL";
            reason = actual
              ? "Shape Line Straight Connector 1 (207pt) khớp mẫu chuẩn Word."
              : "Thiếu hoặc sai lệch Shape Line Straight Connector 1 của mẫu Đảng bộ.";
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có bằng chứng kiểm tra Shape Line tiêu đề Đảng từ OOXML.";
          }
        } else if (r.id === "HD05-BODY-FONT-SIZE") {
          const app = resolveRuleApplicability(r.id, "party", docType, "body");
          if (app.status === "not_applicable") {
            status = "NOT_APPLICABLE";
            reason = app.reason;
          } else {
            const bEv = ooxmlEvidence.body_evidence;
            if (!bEv || !bEv.hasDirectBodyParagraphs || !bEv.fontSizeRangePt) {
              status = "NOT_EVALUATED";
              reason = "Chưa có bằng chứng cỡ chữ thân bài văn bản Đảng.";
            } else {
              const min = bEv.fontSizeRangePt.min;
              const max = bEv.fontSizeRangePt.max;
              actual = `${min} - ${max} pt`;
              const ok = min >= 14 && max <= 15;
              status = ok ? "PASS" : "FAIL";
              reason = ok
                ? `Cỡ chữ thân bài văn bản Đảng (${min}-${max}pt) đạt chuẩn 14-15pt theo HD 05.`
                : `Cỡ chữ thân bài văn bản Đảng (${min}-${max}pt) không thuộc khoảng 14-15pt.`;
            }
          }
        } else if (r.id === "HD05-BODY-FIRST-LINE-INDENT") {
          const app = resolveRuleApplicability(r.id, "party", docType, "body");
          if (app.status === "not_applicable") {
            status = "NOT_APPLICABLE";
            reason = app.reason;
          } else {
            const bEv = ooxmlEvidence.body_evidence;
            if (!bEv || !bEv.hasDirectBodyParagraphs || !bEv.firstLineIndentRangeDxa) {
              status = "NOT_EVALUATED";
              reason = "Chưa có bằng chứng thụt đầu dòng thân bài văn bản Đảng.";
            } else {
              const min = bEv.firstLineIndentRangeDxa.min;
              const max = bEv.firstLineIndentRangeDxa.max;
              actual = `${min} - ${max} dxa`;
              const ok = min >= 500 && max <= 650;
              status = ok ? "PASS" : "FAIL";
              reason = ok
                ? `Thụt đầu dòng văn bản Đảng (${min}-${max} dxa) đạt chuẩn ~10mm theo HD 05.`
                : `Thụt đầu dòng văn bản Đảng (${min}-${max} dxa) không khớp quy chuẩn ~10mm.`;
            }
          }
        } else if (r.id === "HD05-BODY-LINE-SPACING") {
          const bEv = ooxmlEvidence.body_evidence;
          if (!bEv || !bEv.hasDirectBodyParagraphs) {
            status = "NOT_EVALUATED";
            reason = "Chưa có bằng chứng dãn dòng thân bài văn bản Đảng.";
          } else {
            const eligible = bEv.directParagraphs.filter((p: any) => p.text.trim().length > 0 && (p.isEligibleBody ?? true));
            if (eligible.length === 0) {
              status = "NOT_EVALUATED";
              reason = "Chưa có đoạn thân bài hợp lệ để đo dãn dòng.";
            } else {
              const lineExact = eligible.filter((p: any) => p.lineRule === "exact" && p.lineSpacingDxa && p.lineSpacingDxa >= 360 && p.lineSpacingDxa <= 440);
              const allOk = lineExact.length === eligible.length;
              actual = allOk ? "exact 18-22pt" : `chỉ đạt ${lineExact.length}/${eligible.length} đoạn`;
              status = allOk ? "PASS" : "FAIL";
              reason = allOk
                ? `Toàn bộ ${eligible.length} đoạn thân bài dãn dòng cố định (exactly) từ 18pt đến 22pt đạt chuẩn Hướng dẫn 05.`
                : `Có ${eligible.length - lineExact.length}/${eligible.length} đoạn thân bài không đạt dãn dòng cố định (exact) 18-22pt theo quy định văn bản Đảng.`;
            }
          }
        } else if (r.id === "HD05-TABLE-CELL-FONT-SIZE") {
          status = "NOT_APPLICABLE";
          reason = "Quy tắc cỡ chữ ô bảng phụ lục (12-13pt) chỉ áp dụng cho bảng biểu phụ lục.";
        } else if (r.id === "BODY.PARTY.SUBJECT_UPRIGHT_BOLD") {
          const sEv = ooxmlEvidence?.subject_evidence || ooxmlEvidence?.body_evidence?.directParagraphs?.find((p: any) => p.role === "subject");
          const hasBold = ooxmlEvidence?.subject_is_bold !== undefined ? ooxmlEvidence.subject_is_bold : sEv?.isBold;
          const hasItalic = ooxmlEvidence?.subject_is_italic !== undefined ? ooxmlEvidence.subject_is_italic : sEv?.isItalic;
          if (hasBold !== undefined || hasItalic !== undefined) {
            const isBold = Boolean(hasBold);
            const isItalic = Boolean(hasItalic);
            if (isBold && !isItalic) {
              status = "PASS";
              reason = "Trích yếu văn bản Đảng có tên loại in thường, đứng, đậm đạt chuẩn Hướng dẫn 05.";
            } else {
              status = "FAIL";
              reason = "Trích yếu văn bản Đảng phải in đứng, đậm (không in nghiêng).";
            }
          } else {
            status = "NOT_EVALUATED";
            reason = "Chưa có bằng chứng OOXML để kiểm chứng định dạng đứng, đậm của trích yếu nội dung.";
          }
        } else if (r.checkMethod === "semantic_review" || r.checkMethod === "manual_visual" || r.evidenceType === "visual" || r.evidenceType === "semantic") {
          status = "NEEDS_REVIEW";
          reason = "Quy tắc cần người dùng/chuyên viên đối chiếu trực quan hoặc nghiệp vụ; không tự tính PASS.";
        }
      }

      counts[status]++;
      results.push({
        ruleId: r.id,
        regime: effectiveRegime,
        componentGroup: r.componentGroup,
        category: r.category,
        title: r.title,
        status,
        sourceLocator: r.sourceLocator,
        expected: r.expected.description,
        actual,
        reason,
        severity: r.severity,
        fixPolicy: r.fixPolicy,
      });
    }
  } else {
    // No OOXML evidence provided yet — never claim PASS without measured evidence
    evidenceNotes.push("Chưa xuất hoặc nạp tệp OOXML Word (.docx). Các quy tắc hình học trang ở trạng thái CHƯA KIỂM ĐỊNH.");
    for (const r of rules) {
      let status: CanonicalStatus = "NOT_EVALUATED";
      let reason = "Cần xuất bản và đối chiếu bằng chứng OOXML thực tế để xác minh.";

      if (r.id.startsWith("PROFILE.ND30.") && !isUsingNd30CompanyProfile) {
        status = "NOT_APPLICABLE";
        reason = "Tài liệu không sử dụng profile Công ty Hoa tiêu Hàng hải miền Bắc (NĐ 30).";
      } else if (r.id.startsWith("PROFILE.HD05.") && !isUsingHd05CompanyProfile) {
        status = "NOT_APPLICABLE";
        reason = "Tài liệu không sử dụng profile Đảng bộ Công ty Hoa tiêu Hàng hải miền Bắc (HD 05).";
      } else if ((r.id === "HD05.TITLE.06" || r.id === "HD05.TITLE.07" || r.id === "BODY.PARTY.FIVE_HYPHENS") && isCongVan) {
        status = "NOT_APPLICABLE";
        reason = "Công văn Đảng không dùng cụm 5 dấu gạch nối giữa trang.";
      } else if ((r.id === "HD05.TITLE.09" || r.id === "HD05.TITLE.10") && !isCongVan) {
        status = "NOT_APPLICABLE";
        reason = "Quy tắc chỉ áp dụng cho công văn.";
      } else if (r.checkMethod === "semantic_review" || r.checkMethod === "manual_visual" || r.evidenceType === "visual" || r.evidenceType === "semantic") {
        status = "NEEDS_REVIEW";
        reason = "Quy tắc cần người dùng/chuyên viên đối chiếu trực quan hoặc nghiệp vụ; không tự tính PASS.";
      }

      counts[status]++;
      results.push({
        ruleId: r.id,
        regime: effectiveRegime,
        componentGroup: r.componentGroup,
        category: r.category,
        title: r.title,
        status,
        sourceLocator: r.sourceLocator,
        expected: r.expected.description,
        reason,
        severity: r.severity,
        fixPolicy: r.fixPolicy,
      });
    }
  }


  // Format 9 groups list
  const groupsList = COMPONENT_GROUPS.map(cg => {
    const data = groupStatusMap.get(cg.id)!;
    let statusLabel = "Đã nhận diện";
    if (data.status === "missing") statusLabel = "Cần bổ sung";
    else if (data.status === "needs_action") statusLabel = "Cần xử lý";
    else if (data.status === "not_applicable") statusLabel = "Không áp dụng";

    return {
      id: cg.id,
      name: cg.name,
      shortName: cg.shortName,
      status: data.status,
      statusLabel,
      valuePreview: data.valuePreview,
      issuesCount: data.issuesCount,
    };
  });

  const recognizedCoreCount = groupsList.filter(g => typeof g.id === "number" && (g.status === "recognized" || g.status === "not_applicable")).length;

  let gateStatus: "PASS" | "FAIL" | "PARTIAL" | "NOT_EVALUATED" | "MANUAL_REVIEW" | "BLOCKED" = "NOT_EVALUATED";
  let gateLabel = "Chưa kiểm định OOXML";
  let isStandardValidated = false;
  let gateDescription = "Tài liệu chưa được phân tích cấu trúc hình học OOXML từ tệp Word thực tế.";

  if (!ooxmlEvidence) {
    gateStatus = "NOT_EVALUATED";
    gateLabel = "NOT_EVALUATED";
    gateDescription = "Chưa có bằng chứng hình học OOXML thực tế để xác nhận quy chuẩn.";
  } else if (counts.FAIL > 0) {
    gateStatus = "FAIL";
    gateLabel = "FAIL";
    gateDescription = `Phát hiện ${counts.FAIL} sai lệch thể thức bắt buộc cần khắc phục.`;
  } else if (actionableIssues.length > 0) {
    gateStatus = "PARTIAL";
    gateLabel = "PARTIAL";
    gateDescription = `${actionableIssues.length} thành phần thể thức cần bạn bổ sung hoặc xử lý.`;
  } else if (counts.NEEDS_REVIEW > 0) {
    gateStatus = "MANUAL_REVIEW";
    gateLabel = "MANUAL_REVIEW";
    gateDescription = `${counts.NEEDS_REVIEW} quy tắc nghiệp vụ/trực quan cần chuyên viên rà soát đối chiếu.`;
  } else if (counts.NOT_EVALUATED > 0) {
    gateStatus = "PARTIAL";
    gateLabel = "PARTIAL";
    gateDescription = `Đã kiểm tra được ${counts.PASS}/${rules.length} quy tắc; còn ${counts.NOT_EVALUATED} quy tắc chưa đủ bằng chứng.`;
  } else if (counts.FAIL === 0 && actionableIssues.length === 0 && counts.NOT_EVALUATED === 0 && counts.NEEDS_REVIEW === 0 && counts.PASS > 0) {
    gateStatus = "PASS";
    gateLabel = isParty ? "HD05_VALIDATED" : "ND30_VALIDATED";
    isStandardValidated = true;
    gateDescription = isParty
      ? "Tài liệu đã được kiểm chứng đầy đủ 100% bằng chứng OOXML đạt chuẩn Hướng dẫn 05-HD/VPTW."
      : "Tài liệu đã được kiểm chứng đầy đủ 100% bằng chứng OOXML đạt chuẩn Nghị định 30/2020/NĐ-CP.";
  }

  return {
    regime: effectiveRegime,
    documentType: docType,
    isParty,
    isCongVan,
    recognizedComponents: {
      total: 9,
      recognized: recognizedCoreCount,
      groups: groupsList,
    },
    actionableIssues,
    canonicalStats: {
      total: rules.length,
      counts,
      hasSufficientEvidence: counts.PASS >= 5,
      evidenceNotes,
    },
    verificationGate: {
      status: gateStatus,
      label: gateLabel,
      isStandardValidated,
      description: gateDescription,
    },
    results,
  };
}

/**
 * Extracts comprehensive OOXML evidence from a `word/document.xml` string for both regimes
 * and for the frozen company profiles.
 */
export function extractOoxmlEvidenceFromXml(
  xml: string,
  regime: RuleRegime = "administrative"
): Record<string, any> {
  const nd30Ev = evidenceFromDocumentXml(xml);
  const hd05Ev = extractHD05EvidenceFromXml(xml);
  const body_evidence = extractBodyOoxmlEvidence(xml);

  const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  const tbl = tblMatch ? tblMatch[0] : "";
  const tblWMatch = tbl.match(/<w:tblW\b[^>]*w:w="(\d+)"/);
  const header_table_width_twips = tblWMatch ? Number(tblWMatch[1]) : undefined;
  const gridCols = Array.from(tbl.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map(m => Number(m[1]));
  const header_left_col_twips = gridCols[0];
  const header_right_col_twips = gridCols[1];

  const has_nd30_shape_lines =
    xml.includes('name="ND30 Plain Line 1"') &&
    xml.includes('name="ND30 Plain Line 2"') &&
    xml.includes('id="ND30 Plain Line 1"') &&
    xml.includes('id="ND30 Plain Line 2"');

  const has_hd05_shape_line =
    xml.includes('name="Straight Connector 1"') &&
    xml.includes('id="Straight Connector 1"') &&
    xml.includes('cx="2628900"');

  const baseResult = {
    header_table_width_twips,
    header_left_col_twips,
    header_right_col_twips,
    has_nd30_shape_lines,
    has_hd05_shape_line,
    body_evidence,
  };

  if (regime === "party") {
    return {
      ...nd30Ev,
      ...hd05Ev,
      ...baseResult,
    };
  }

  return {
    ...hd05Ev,
    ...nd30Ev,
    ...baseResult,
  };
}
