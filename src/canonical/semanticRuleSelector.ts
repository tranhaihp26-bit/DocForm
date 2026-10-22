import type { SemanticDecision, SemanticUnit } from "../shared/semanticDocument.ts";
import { semanticDecisionIsCurrent } from "../utils/semanticState.ts";
import type { SemanticReconciliationContext } from "../utils/semanticReconciliation.ts";

export type SemanticRuleCategory = "mandatory_legal" | "official_guidance" | "company_profile" | "aesthetic_preset" | "not_applicable";

export interface SemanticRuleSelection {
  unitId: string;
  ruleId?: string;
  title: string;
  regime: "state" | "party";
  category: SemanticRuleCategory;
  executable: boolean;
  reason: string;
  sourceReference?: string;
  applicability?: {
    scope: "body";
    labels: readonly ["body_paragraph", "narrative"];
    documentType: "non-empty";
    profile: string;
    evidenceRequirement: "current-user-confirmed-or-low-risk-auto-confirmed";
    transaction: "single-plain-body-paragraph";
    sourceReference: string;
  };
}

const BODY_PARAGRAPH_RULES = {
  state: [
    { ruleId: "BODY.PARAGRAPH.LINE_SPACING", title: "Khoảng cách dòng thân bài",
      sourceReference: "Nghị định 30/2020/NĐ-CP, Phụ lục I, Phần I, mục 2, điểm e; giá trị phải nằm trong dải cho phép và được giải theo profile." },
    { ruleId: "BODY.PARAGRAPH.FIRST_LINE_INDENT", title: "Thụt lề đầu dòng",
      sourceReference: "Nghị định 30/2020/NĐ-CP, Phụ lục I, Phần I, mục 2, điểm e; giá trị phải là 1 cm hoặc 1,27 cm theo profile." },
  ],
  party: [
    { ruleId: "HD05-BODY-LINE-SPACING", title: "Khoảng cách dòng thân bài Đảng",
      sourceReference: "Hướng dẫn 05-HD/VPTW ngày 27/5/2026, Phần II, Mục I, khoản 6.2.2; chính xác trong dải 18–22 pt." },
    { ruleId: "HD05-BODY-FIRST-LINE-INDENT", title: "Thụt lề đầu dòng văn bản Đảng",
      sourceReference: "Hướng dẫn 05-HD/VPTW ngày 27/5/2026, Phần II, Mục I, khoản 6.2.2; lùi đầu dòng khoảng 10 mm." },
  ],
} as const;

export interface SemanticRuleContext extends SemanticReconciliationContext {
  regime: "state" | "party";
  documentType: string;
  profile: string;
  decision?: SemanticDecision;
}

export function selectRulesForUnit(unit: SemanticUnit, context: SemanticRuleContext): SemanticRuleSelection[] {
  const confirmed = semanticDecisionIsCurrent(context.decision, context);
  const docType = context.documentType.trim().toLocaleUpperCase("vi-VN");
  const disabled = (reason: string): SemanticRuleSelection[] => [{ unitId: unit.id, title: "Chưa chọn quy tắc định dạng",
    regime: context.regime, category: "not_applicable", executable: false, reason }];
  if (!docType) return disabled("Chưa xác nhận loại văn bản; không chọn quy tắc.");
  if (!confirmed) return disabled("Cần duyệt đơn vị ngữ nghĩa trên đúng nguồn trước khi chọn hoặc áp dụng quy tắc.");
  if (unit.scope !== "body") return disabled("Chưa có quy tắc định dạng phụ lục được ánh xạ riêng; quy tắc thân bài không áp chéo.");
  if (unit.label === "unknown") return disabled("Đơn vị chưa được phân loại; cần rà soát thủ công.");
  if (unit.formattingUnsupportedReason) return disabled(unit.formattingUnsupportedReason);
  const isBodyParagraph = unit.label === "body_paragraph" || unit.label === "narrative";
  if (isBodyParagraph && (unit.anchor.paragraphIndex !== 0 || /[\r\n]/.test(unit.quote))) return disabled("Neo đang chỉ một dòng con trong khối nguồn; chưa thể áp quy tắc cho riêng đoạn.");
  if (unit.unsupportedEvidence) return disabled("Đơn vị chứa cấu trúc hoặc nội dung chưa hỗ trợ; chỉ đọc để rà soát, không áp quy tắc tự động.");
  if ((unit.risk === "high" || unit.needsReview) && context.decision?.status !== "user_confirmed") {
    return disabled("Đơn vị có rủi ro cao hoặc chứng cứ chưa đủ; cần xác nhận thủ công.");
  }

  const selections: SemanticRuleSelection[] = [];
  if (isBodyParagraph) {
    const sourceRules = BODY_PARAGRAPH_RULES[context.regime];
    selections.push(...sourceRules.map(rule => ({
      unitId: unit.id, ruleId: rule.ruleId, title: rule.title, regime: context.regime,
      category: "official_guidance" as const, executable: true,
      reason: `Đoạn Body đã được duyệt; giá trị cụ thể được giải theo profile ${context.profile}.`,
      sourceReference: rule.sourceReference,
      applicability: {
        scope: "body" as const,
        labels: ["body_paragraph", "narrative"] as const,
        documentType: "non-empty" as const,
        profile: context.profile,
        evidenceRequirement: "current-user-confirmed-or-low-risk-auto-confirmed" as const,
        transaction: "single-plain-body-paragraph" as const,
        sourceReference: rule.sourceReference,
      },
    })));
  } else if ((unit.label === "heading" || unit.label === "article") && context.regime === "state" && /^điều\s+\d+/iu.test(unit.quote.trim())) {
    return disabled("Tiêu đề Điều khoản đã được nhận diện; thao tác áp dụng định dạng cho tiêu đề chưa được hỗ trợ.");
  } else if (unit.label === "table_header_cell" && context.regime === "state") {
    return disabled("Đã nhận diện ô tiêu đề bảng; thao tác áp dụng quy tắc cho bảng chưa được hỗ trợ.");
  } else if (unit.label === "list_item") {
    return disabled("Danh sách cần quy tắc riêng cho cấp thụt và đánh số; không dùng thụt đầu dòng thân bài.");
  }
  return selections.length ? selections : disabled("Không có quy tắc hiện hành khớp chính xác đơn vị, hệ thể thức và loại văn bản này.");
}
