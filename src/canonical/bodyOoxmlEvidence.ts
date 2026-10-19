/**
 * @file bodyOoxmlEvidence.ts
 * @description Element-based OOXML Evidence Extraction for Document Body.
 * Strictly measures direct `<w:p>` children of `<w:body>`, distinguishing them from
 * paragraphs inside `<w:tbl>` cells or appendices, preventing phantom passes and false metrics.
 */

import { extractDirectChildren } from "../server/blockExtractor.ts";

export type ParagraphSemanticRole = 
  | "body_paragraph"
  | "document_type"
  | "subject"
  | "heading"
  | "recipients"
  | "signature"
  | "appendix_header"
  | "empty_spacer";

export interface DirectParagraphEvidence {
  index: number;
  text: string;
  role: ParagraphSemanticRole;
  isEligibleBody: boolean;
  fontSizePt?: number;
  fontSizesPt?: number[];
  firstLineIndentDxa?: number;
  leftIndentDxa?: number;
  rightIndentDxa?: number;
  lineSpacingDxa?: number;
  lineRule?: "auto" | "exact" | "atLeast";
  spaceBeforeDxa?: number;
  spaceAfterDxa?: number;
  alignment?: "both" | "left" | "center" | "right";
  isBold?: boolean;
  isItalic?: boolean;
}

export interface BodyOoxmlEvidence {
  directParagraphsCount: number;
  directParagraphs: DirectParagraphEvidence[];
  hasDirectBodyParagraphs: boolean;
  evaluatedParagraphsCount: number;
  excludedParagraphsCount: number;
  firstLineIndentRangeDxa?: { min: number; max: number };
  fontSizeRangePt?: { min: number; max: number };
  lineSpacingRangeDxa?: { min: number; max: number };
}

export function detectParagraphRole(
  text: string, 
  alignment?: string, 
  isBold?: boolean, 
  isItalic?: boolean, 
  fontSizePt?: number
): ParagraphSemanticRole {
  const trimmed = text.trim();
  if (!trimmed) return "empty_spacer";

  // 1. Phụ lục
  if (/^(PHỤ LỤC|PHU LUC|KÈM THEO|KEM THEO)/i.test(trimmed)) {
    return "appendix_header";
  }

  // 2. Nơi nhận
  if (/^(Nơi nhận:|Noi nhan:|Kính gửi:|Kinh gui:|- Như trên|- Nhu tren)/i.test(trimmed)) {
    return "recipients";
  }

  // 3. Ký tên / chức vụ người ký
  if (/^(TM\.|KT\.|TL\.|TUQ\.|GIÁM ĐỐC|CHỦ TỊCH|TỔNG GIÁM ĐỐC|BÍ THƯ|PHÓ BÍ THƯ|\(Đã ký\)|\(Ký, ghi rõ)/i.test(trimmed) && alignment !== "both") {
    return "signature";
  }

  // 4. Tên loại văn bản (all uppercase, centered, bold, matches standard doc types)
  const DOC_TYPES = /^(QUYẾT ĐỊNH|NGHỊ QUYẾT|CHỈ THỊ|THÔNG TƯ|KẾ HOẠCH|TỜ TRÌNH|CÔNG VĂN|BÁO CÁO|THÔNG BÁO|KẾT LUẬN|QUY ĐỊNH|QUY CHẾ|BIÊN BẢN|HỢP ĐỒNG|GIẤY MỜI|CHƯƠNG TRÌNH)$/i;
  if (DOC_TYPES.test(trimmed) && (alignment === "center" || isBold)) {
    return "document_type";
  }

  // 5. Trích yếu nội dung: chỉ nhận diện là trích yếu tiêu đề khi độ dài ngắn (<= 150 ký tự), 
  // không căn đều hai bên (vì văn bản thân bài thường căn đều hai bên "both")
  if (/^(V\/v|Về việc|Ve viec)\b/i.test(trimmed) && alignment !== "both" && trimmed.length <= 150) {
    return "subject";
  }

  // 6. Tiêu đề đề mục lớn (Heading):
  // - Số La Mã: I-, I., II., III- ...
  // - Số Ả Rập: 1., 2., 1-, 1.1...
  // - Từ khóa cấu trúc: Phần I, Chương II, Mục 1, Điều 1, Khoản 2...
  if (
    /^[IVXLCDM]+[\.\-\s]+[^\s]/i.test(trimmed) ||
    /^\d+([\.\-]\d+)*[\.\-]\s*[^\s]/i.test(trimmed) ||
    /^(PHẦN|CHƯƠNG|MỤC|ĐIỀU|KHOẢN)\s+([IVXLCDM\d]+|[A-ZÀ-Ỹ]+)/i.test(trimmed)
  ) {
    return "heading";
  }

  // Nếu không thuộc các thành phần trên -> Đoạn văn thân bài (body_paragraph)
  return "body_paragraph";
}

/**
 * Trích xuất chỉ các đoạn văn <w:p> trực tiếp là con của <w:body>.
 * Tuyệt đối không quét phẳng vào trong các ô bảng biểu (<w:tc>) hoặc phụ lục.
 */
export function extractDirectBodyParagraphs(documentXml: string): DirectParagraphEvidence[] {
  // Lấy nội dung bên trong <w:body>...</w:body>
  const bodyMatch = documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i);
  if (!bodyMatch) return [];

  const bodyInnerXml = `<w:body>${bodyMatch[1]}</w:body>`;

  // Dùng extractDirectChildren để chỉ lấy các thẻ <w:p> là con trực tiếp của <w:body>
  const directChildren = extractDirectChildren(bodyInnerXml, "w:body", new Set(["w:p", "w:tbl"]));
  
  const paragraphs: DirectParagraphEvidence[] = [];
  let inAppendix = false;

  for (let idx = 0; idx < directChildren.length; idx++) {
    const child = directChildren[idx];
    if (child.tag !== "w:p") continue;

    const pXml = child.xml;

    // 1. Trích xuất text thuần của đoạn văn
    const textMatches = Array.from(pXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g));
    const text = textMatches.map(m => m[1]).join("");

    // 2. Thụt đầu dòng (w:ind)
    const indMatch = pXml.match(/<w:ind\b([^>]*)/i);
    let firstLineIndentDxa: number | undefined;
    let leftIndentDxa: number | undefined;
    let rightIndentDxa: number | undefined;

    if (indMatch) {
      const attrs = indMatch[1];
      const flMatch = attrs.match(/w:firstLine=["'](\d+)["']/i);
      const leftMatch = attrs.match(/w:left=["'](\d+)["']/i);
      const rightMatch = attrs.match(/w:right=["'](\d+)["']/i);
      if (flMatch) firstLineIndentDxa = parseInt(flMatch[1], 10);
      if (leftMatch) leftIndentDxa = parseInt(leftMatch[1], 10);
      if (rightMatch) rightIndentDxa = parseInt(rightMatch[1], 10);
    }

    // 3. Giãn dòng và khoảng cách đoạn (w:spacing)
    const spacingMatch = pXml.match(/<w:spacing\b([^>]*)/i);
    let lineSpacingDxa: number | undefined;
    let lineRule: "auto" | "exact" | "atLeast" | undefined;
    let spaceBeforeDxa: number | undefined;
    let spaceAfterDxa: number | undefined;

    if (spacingMatch) {
      const attrs = spacingMatch[1];
      const lineM = attrs.match(/w:line=["'](\d+)["']/i);
      const ruleM = attrs.match(/w:lineRule=["']([^"']+)["']/i);
      const beforeM = attrs.match(/w:before=["'](\d+)["']/i);
      const afterM = attrs.match(/w:after=["'](\d+)["']/i);

      if (lineM) lineSpacingDxa = parseInt(lineM[1], 10);
      if (ruleM) lineRule = ruleM[1] as any;
      if (beforeM) spaceBeforeDxa = parseInt(beforeM[1], 10);
      if (afterM) spaceAfterDxa = parseInt(afterM[1], 10);
    }

    // 4. Căn lề (w:jc)
    const jcMatch = pXml.match(/<w:jc\b[^>]*w:val=["']([^"']+)["']/i);
    const alignment = jcMatch ? (jcMatch[1] as any) : undefined;

    // 5. Cỡ chữ (w:sz: half-points) của tất cả các run có chữ trong paragraph
    const fontSizesPt: number[] = [];
    const runMatches = Array.from(pXml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g));
    for (const rMatch of runMatches) {
      const rXml = rMatch[0];
      if (/<w:t\b[^>]*>[\s\S]*?<\/w:t>/i.test(rXml)) {
        const szM = rXml.match(/<w:sz\b[^>]*w:val=["'](\d+)["']/i);
        if (szM) {
          fontSizesPt.push(parseInt(szM[1], 10) / 2);
        }
      }
    }
    if (fontSizesPt.length === 0) {
      const pPrSz = pXml.match(/<w:sz\b[^>]*w:val=["'](\d+)["']/i);
      if (pPrSz) {
        fontSizesPt.push(parseInt(pPrSz[1], 10) / 2);
      }
    }
    const fontSizePt = fontSizesPt.length > 0 ? fontSizesPt[0] : undefined;

    // 6. Kiểu chữ (in đậm, in nghiêng)
    const isBold = /<w:b\b(?![^>]*w:val=["'](?:0|false|off)["'])/i.test(pXml);
    const isItalic = /<w:i\b(?![^>]*w:val=["'](?:0|false|off)["'])/i.test(pXml);

    let role = inAppendix ? "appendix_header" as const : detectParagraphRole(text, alignment, isBold, isItalic, fontSizePt);
    if (role === "appendix_header") {
      inAppendix = true;
    }
    const isEligibleBody = !inAppendix && role === "body_paragraph";

    paragraphs.push({
      index: paragraphs.length,
      text,
      role,
      isEligibleBody,
      fontSizePt,
      fontSizesPt,
      firstLineIndentDxa,
      leftIndentDxa,
      rightIndentDxa,
      lineSpacingDxa,
      lineRule,
      spaceBeforeDxa,
      spaceAfterDxa,
      alignment,
      isBold,
      isItalic,
    });
  }

  return paragraphs;
}

/**
 * Tính toán tập chỉ số đo đạc thực tế của thân bài từ OOXML
 */
export function extractBodyOoxmlEvidence(documentXml: string): BodyOoxmlEvidence {
  const directParagraphs = extractDirectBodyParagraphs(documentXml);

  const eligibleBodyParas = directParagraphs.filter(p => p.isEligibleBody && p.text.trim().length > 0);

  const indentValues = eligibleBodyParas
    .map(p => p.firstLineIndentDxa)
    .filter((v): v is number => typeof v === "number");

  const fontValues: number[] = [];
  for (const p of eligibleBodyParas) {
    if (p.fontSizesPt && p.fontSizesPt.length > 0) {
      fontValues.push(...p.fontSizesPt);
    } else if (typeof p.fontSizePt === "number") {
      fontValues.push(p.fontSizePt);
    }
  }

  const lineValues = eligibleBodyParas
    .map(p => p.lineSpacingDxa)
    .filter((v): v is number => typeof v === "number");

  return {
    directParagraphsCount: directParagraphs.length,
    directParagraphs,
    hasDirectBodyParagraphs: eligibleBodyParas.length > 0,
    evaluatedParagraphsCount: eligibleBodyParas.length,
    excludedParagraphsCount: directParagraphs.length - eligibleBodyParas.length,
    firstLineIndentRangeDxa: indentValues.length > 0 ? {
      min: Math.min(...indentValues),
      max: Math.max(...indentValues),
    } : undefined,
    fontSizeRangePt: fontValues.length > 0 ? {
      min: Math.min(...fontValues),
      max: Math.max(...fontValues),
    } : undefined,
    lineSpacingRangeDxa: lineValues.length > 0 ? {
      min: Math.min(...lineValues),
      max: Math.max(...lineValues),
    } : undefined,
  };
}

