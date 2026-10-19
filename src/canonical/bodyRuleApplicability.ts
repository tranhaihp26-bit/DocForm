/**
 * @file bodyRuleApplicability.ts
 * @description Contextual Rule Applicability Engine for Document Body and Tables.
 * Distinguishes administrative (ND30) vs party (HD05) regimes, separates mandatory legal rules
 * from aesthetic presets, and restricts rules to their appropriate elements (paragraphs vs table cells).
 */

export type ApplicabilityStatus = "applies" | "not_applicable" | "unknown";
export type RuleCategory = "mandatory_legal" | "official_guidance" | "company_profile" | "aesthetic_preset";

export interface RuleApplicabilityResult {
  status: ApplicabilityStatus;
  category: RuleCategory;
  reason: string;
}

/**
 * Ma trận đối chiếu các Rule Nhóm 6 (Thân bài & Bảng biểu)
 */
export interface BodyRuleSpec {
  id: string;
  regime: "administrative" | "party" | "both";
  category: RuleCategory;
  sourceRef: string;
  targetElement: "body_paragraph" | "heading" | "table_cell" | "table_grid" | "any_body";
  descriptionVi: string;
}

export const BODY_RULES_CATALOG: Record<string, BodyRuleSpec> = {
  // ND30 Body rules
  "ND30-BODY-FONT-SIZE": {
    id: "ND30-BODY-FONT-SIZE",
    regime: "administrative",
    category: "mandatory_legal",
    sourceRef: "NĐ 30/2020/NĐ-CP Phụ lục I Mục II Điểm 6.b",
    targetElement: "body_paragraph",
    descriptionVi: "Cỡ chữ nội dung văn bản từ 13pt đến 14pt",
  },
  "ND30-BODY-FIRST-LINE-INDENT": {
    id: "ND30-BODY-FIRST-LINE-INDENT",
    regime: "administrative",
    category: "mandatory_legal",
    sourceRef: "NĐ 30/2020/NĐ-CP Phụ lục I Mục II Điểm 6.c",
    targetElement: "body_paragraph",
    descriptionVi: "Thụt đầu dòng đoạn văn từ 1.0cm (567 dxa) đến 1.27cm (720 dxa)",
  },
  "ND30-BODY-LINE-SPACING": {
    id: "ND30-BODY-LINE-SPACING",
    regime: "administrative",
    category: "official_guidance",
    sourceRef: "NĐ 30/2020/NĐ-CP Phụ lục I Mục II Điểm 6.c",
    targetElement: "body_paragraph",
    descriptionVi: "Dãn dòng từ đơn (line=240) đến tối đa 1.5 dòng (line=360)",
  },
  "ND30-BODY-PARAGRAPH-GAP": {
    id: "ND30-BODY-PARAGRAPH-GAP",
    regime: "administrative",
    category: "official_guidance",
    sourceRef: "NĐ 30/2020/NĐ-CP Phụ lục I Mục II Điểm 6.c",
    targetElement: "body_paragraph",
    descriptionVi: "Dãn khoảng cách giữa các đoạn tối thiểu 6pt",
  },
  "ND30-TABLE-BORDER-PRESET": {
    id: "ND30-TABLE-BORDER-PRESET",
    regime: "administrative",
    category: "aesthetic_preset",
    sourceRef: "Thiết lập thẩm mỹ DocForm-30 (không bắt buộc theo luật)",
    targetElement: "table_grid",
    descriptionVi: "Khung lưới bảng viền đơn đen mảnh 0.5pt đến 0.75pt",
  },

  // HD05 Party Body rules
  "HD05-BODY-FONT-SIZE": {
    id: "HD05-BODY-FONT-SIZE",
    regime: "party",
    category: "mandatory_legal",
    sourceRef: "Hướng dẫn 05-HD/VPTW Điểm 6",
    targetElement: "body_paragraph",
    descriptionVi: "Cỡ chữ nội dung văn bản Đảng từ 14pt đến 15pt",
  },
  "HD05-BODY-FIRST-LINE-INDENT": {
    id: "HD05-BODY-FIRST-LINE-INDENT",
    regime: "party",
    category: "mandatory_legal",
    sourceRef: "Hướng dẫn 05-HD/VPTW Điểm 6",
    targetElement: "body_paragraph",
    descriptionVi: "Thụt đầu dòng đoạn văn Đảng khoảng 10mm (567 dxa)",
  },
  "HD05-BODY-LINE-SPACING": {
    id: "HD05-BODY-LINE-SPACING",
    regime: "party",
    category: "mandatory_legal",
    sourceRef: "Hướng dẫn 05-HD/VPTW Điểm 6",
    targetElement: "body_paragraph",
    descriptionVi: "Dãn dòng cố định (exactly) từ 18pt đến 22pt",
  },
  "HD05-TABLE-CELL-FONT-SIZE": {
    id: "HD05-TABLE-CELL-FONT-SIZE",
    regime: "party",
    category: "official_guidance",
    sourceRef: "Hướng dẫn 05-HD/VPTW Điểm 6 (bảng phụ lục)",
    targetElement: "table_cell",
    descriptionVi: "Ô bảng biểu trong văn bản Đảng có thể dùng cỡ chữ nhỏ hơn (12pt-13pt)",
  },
};

/**
 * Phân giải tính áp dụng của Rule dựa trên thể thức, loại văn bản, vai trò khối và vai trò bảng
 */
export function resolveRuleApplicability(
  ruleId: string,
  regime: "administrative" | "party",
  documentType?: string,
  blockRole?: "header" | "body" | "signature" | "appendix" | "unclassified",
  tableRole?: "header" | "signature" | "appendix_data" | "body_data" | "layout" | "unknown",
  sourceEvidence?: Record<string, unknown>
): RuleApplicabilityResult {
  const spec = BODY_RULES_CATALOG[ruleId];
  if (!spec) {
    return {
      status: "unknown",
      category: "official_guidance",
      reason: `Rule ID "${ruleId}" không có trong danh mục thân bài được quản lý`,
    };
  }

  // 1. Kiểm tra Regime (hành chính vs Đảng)
  if (spec.regime !== "both" && spec.regime !== regime) {
    return {
      status: "not_applicable",
      category: spec.category,
      reason: `Rule "${ruleId}" thuộc hệ thể thức ${spec.regime === "party" ? "Đảng (HD05)" : "Hành chính (ND30)"}, không áp dụng cho ${regime === "party" ? "Đảng" : "Hành chính"}`,
    };
  }

  // 2. Kiểm tra Block Role
  // Các rule thân bài chỉ áp dụng cho khối body (hoặc appendix nếu kiểm định phụ lục)
  if (blockRole && blockRole !== "body") {
    return {
      status: "not_applicable",
      category: spec.category,
      reason: `Rule thân bài không áp dụng cho khối có vai trò "${blockRole}" (chỉ áp dụng cho body)`,
    };
  }

  // 3. Phân biệt phần tử Đoạn văn thường vs Ô bảng biểu
  // Ô bảng biểu KHÔNG tự động kế thừa các rule thụt đầu dòng hay cỡ chữ của đoạn thân bài
  if (tableRole && tableRole !== "unknown") {
    if (spec.targetElement === "body_paragraph") {
      return {
        status: "not_applicable",
        category: spec.category,
        reason: `Rule "${ruleId}" chỉ áp dụng cho đoạn văn trực tiếp của thân bài, không áp dụng cho ô bảng biểu (${tableRole})`,
      };
    }
    if (spec.targetElement === "table_grid" && tableRole !== "body_data" && tableRole !== "appendix_data") {
      return {
        status: "not_applicable",
        category: spec.category,
        reason: `Rule lưới bảng không áp dụng cho bảng có vai trò "${tableRole}" (chỉ áp dụng cho bảng dữ liệu)`,
      };
    }
  }

  // 4. Nếu là đoạn văn nhưng rule chỉ áp dụng cho ô bảng biểu
  if (!tableRole && (spec.targetElement === "table_cell" || spec.targetElement === "table_grid")) {
    return {
      status: "not_applicable",
      category: spec.category,
      reason: `Rule "${ruleId}" chỉ áp dụng cho phần tử bảng biểu, không áp dụng cho đoạn văn thường`,
    };
  }

  return {
    status: "applies",
    category: spec.category,
    reason: `Áp dụng hợp lệ theo chuẩn ${regime.toUpperCase()}: ${spec.descriptionVi}`,
  };
}
