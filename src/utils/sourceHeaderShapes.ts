/**
 * @file sourceHeaderShapes.ts
 * @description Nhận diện và kiểm tra các đường kẻ Shape DrawingML/VML trong phần đầu văn bản (Đợt C).
 * Phân biệt chính xác giữa đường kẻ thẳng/hơi nghiêng với ảnh, textbox và đối tượng chưa hỗ trợ.
 */

/**
 * Kiểm tra xem một đoạn AlternateContent có phải là đường kẻ trang trí hay không.
 * Hỗ trợ đường ngang tuyệt đối (cy=0) và đường hơi nghiêng/độ dày nét trong ngưỡng an toàn (cy <= 25400 EMUs ~ 2pt, cx > cy * 5).
 * Đọc thuộc tính XML độc lập thứ tự và kiểm tra tính tương ứng giữa DrawingML Choice và VML Fallback.
 */
export function isDecorativeLineShape(fragment: string): boolean {
  if ((fragment.match(/<w:drawing\b/g) ?? []).length !== 1 || (fragment.match(/<w:pict\b/g) ?? []).length !== 1) return false;
  if (/<(?:a:blip|a:t|v:textbox|wps:txbx|w:txbxContent)\b/.test(fragment)) return false;
  if (/<v:imagedata\b[^>]*(?:\br:(?:id|href|relid)|\bsrc)\s*=/i.test(fragment)) return false;
  if (/\br:(?:embed|link|id|href|relid)\s*=/i.test(fragment)) return false;

  // Cả Choice (DrawingML) và Fallback (VML) phải đều biểu diễn đường kẻ theo hợp đồng hỗ trợ
  const hasChoiceDrawing = /<mc:Choice\b[\s\S]*?<w:drawing\b/.test(fragment);
  const hasFallbackPict = /<mc:Fallback\b[\s\S]*?<w:pict\b/.test(fragment);
  if (!hasChoiceDrawing || !hasFallbackPict) return false;

  const hasLineGeom = /<a:prstGeom\b[^>]*\bprst="(?:line|straightConnector1)"/.test(fragment);
  const hasVmlLine = /<v:line\b/.test(fragment);
  if (!hasLineGeom || !hasVmlLine) return false;

  // Đọc cx và cy độc lập thứ tự thuộc tính trong thẻ <wp:extent>
  const extentTagMatch = fragment.match(/<wp:extent\b([^>]*)\/?>/i);
  if (!extentTagMatch) return false;
  const extentAttrs = extentTagMatch[1];
  const cxMatch = extentAttrs.match(/\bcx="([1-9]\d*)"/i);
  const cyMatch = extentAttrs.match(/\bcy="(\d+)"/i);
  if (!cxMatch || !cyMatch) return false;

  const cx = parseInt(cxMatch[1], 10);
  const cy = parseInt(cyMatch[1], 10);

  if (cy === 0) return true;

  // Đường có độ dày nét vẽ (cy <= 25400 EMUs ~ 2pt, cx > cy * 5)
  if (cy <= 25400 && cx > cy * 5) {
    // Kiểm tra VML line không bị xoay nghiêng quá mức
    const vmlLineMatch = fragment.match(/<v:line\b([^>]*)\/?>/i);
    if (vmlLineMatch) {
      const vmlAttrs = vmlLineMatch[1];
      const fromMatch = vmlAttrs.match(/\bfrom="([^"]+)"/i);
      const toMatch = vmlAttrs.match(/\bto="([^"]+)"/i);
      if (fromMatch && toMatch) {
        const fromY = parseFloat(fromMatch[1].split(",")[1] || "0");
        const toY = parseFloat(toMatch[1].split(",")[1] || "0");
        // Độ chênh lệch tọa độ Y không vượt quá 2pt (ngang thực tế)
        if (Math.abs(fromY - toY) > 2) return false;
      }
    }
    return true;
  }

  return false;
}

/** A metadata header may be replaced by the selected Hoa Tieu profile only
 * when its OOXML objects are the known, self-contained decorative straight lines.
 * Media, fields and other drawings remain export blockers. */
export function hasReplaceableHeaderShapeLines(sourceTableXml: string): boolean {
  const fragments = [...sourceTableXml.matchAll(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/g)].map(match => match[0]);
  if (fragments.length === 0 ||
      (sourceTableXml.match(/<w:drawing\b/g) ?? []).length !== fragments.length ||
      (sourceTableXml.match(/<w:pict\b/g) ?? []).length !== fragments.length ||
      /<(?:w:object|w:fldSimple|w:fldChar|w:hyperlink|w:sdt|w:altChunk|w:ins|w:del|w:moveFrom|w:moveTo|a:blip|v:textbox|wps:txbx)\b|\br:(?:embed|link|id)\s*=/i.test(sourceTableXml) ||
      /<v:imagedata\b[^>]*(?:\br:(?:id|href|relid)|\bsrc)\s*=/i.test(sourceTableXml)) return false;
  return fragments.every(isDecorativeLineShape);
}

/**
 * A source paragraph may replace only its own simple ND30 subject underline.
 * The paragraph text must match the selected subject exactly, and the Shape
 * must have a horizontal DrawingML line with a matching VML fallback.
 */
export function hasReplaceableSubjectUnderlineShape(
  sourceParagraphXml: string,
  sourceText: string,
  expectedSubject: string,
): boolean {
  const paragraphs = [...sourceParagraphXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)].map(match => match[0]);
  if (paragraphs.length !== 1 ||
      !expectedSubject.trim() ||
      !sourceParagraphXml.includes("<w:pPr") ||
      !/<wp:inline\b/i.test(sourceParagraphXml) ||
      /<wp:anchor\b/i.test(sourceParagraphXml) ||
      !/<w:jc\b[^>]*w:val="center"/i.test(sourceParagraphXml) ||
      /<(?:w:object|w:fldSimple|w:fldChar|w:hyperlink|w:sdt|w:altChunk|w:ins|w:del|w:moveFrom|w:moveTo|a:blip|v:textbox|wps:txbx|w:txbxContent)\b|\br:(?:embed|link|id)\s*=/i.test(sourceParagraphXml) ||
      /<v:imagedata\b[^>]*(?:\br:(?:id|href|relid)|\bsrc)\s*=/i.test(sourceParagraphXml)) return false;

  const decodeXml = (value: string) => value
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const normalize = (value: string) => decodeXml(value).normalize("NFC").replace(/\s+/g, " ").trim();
  const paragraphText = [...sourceParagraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
    .map(match => match[1]).join("");

  const normParagraphText = normalize(paragraphText);
  const normExpectedSubject = normalize(expectedSubject);
  const normSourceText = normalize(sourceText);

  if (normParagraphText.length > 0) {
    if (normParagraphText !== normExpectedSubject || normSourceText !== normExpectedSubject) return false;
    if (!/<w:b\b(?![^>]*w:val="(?:0|false|off)")[^>]*\/?\s*>/i.test(sourceParagraphXml)) return false;
  } else {
    // Dedicated line paragraph: no substantive text, must be bound to expected subject via sourceText
    if (normSourceText !== normExpectedSubject) return false;
  }

  if (!hasReplaceableHeaderShapeLines(sourceParagraphXml)) return false;
  const fragments = [...sourceParagraphXml.matchAll(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/gi)].map(match => match[0]);
  if (fragments.length !== 1) return false;
  const fragment = fragments[0];
  const extentTagMatch = fragment.match(/<wp:extent\b([^>]*)\/?>/i);
  if (!extentTagMatch) return false;
  const extentAttrs = extentTagMatch[1];
  const cxMatch = extentAttrs.match(/\bcx="([1-9]\d*)"/i);
  const cyMatch = extentAttrs.match(/\bcy="(\d+)"/i);
  if (!cxMatch || !cyMatch) return false;
  const cx = parseInt(cxMatch[1], 10);
  const cy = parseInt(cyMatch[1], 10);

  const isDrawingLine = cx > 0 && (cy === 0 || (cy <= 25400 && cx > cy * 5));
  if (!isDrawingLine) return false;

  const vmlLine = fragment.match(/<v:line\b([^>]*)\/?\s*>/i)?.[1] ?? "";
  const from = vmlLine.match(/\bfrom="([^"]+)"/i)?.[1];
  const to = vmlLine.match(/\bto="([^"]+)"/i)?.[1];
  const parsePt = (val: string | undefined) => Number.parseFloat(val ?? "NaN");

  if (from && to) {
    const [fromX, fromY] = from.split(",").map(parsePt);
    const [toX, toY] = to.split(",").map(parsePt);
    if (!Number.isFinite(fromX) || !Number.isFinite(toX) || !Number.isFinite(fromY) || !Number.isFinite(toY)) return false;
    const vmlWidthPt = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);
    if (cy === 0 && dy !== 0) return false;
    if (dy > 2) return false;
    if (Math.abs(cx / 12700 - vmlWidthPt) > 0.5) return false;
    return true;
  }

  // Fallback: when from/to are absent, check VML style width and height
  const styleMatch = vmlLine.match(/\bstyle="([^"]+)"/i);
  if (styleMatch) {
    const style = styleMatch[1];
    const widthMatch = style.match(/\bwidth:\s*([\d.]+)\s*(pt|in|mm|px)?/i);
    const heightMatch = style.match(/\bheight:\s*([\d.]+)\s*(pt|in|mm|px)?/i);
    if (widthMatch) {
      const toPt = (val: number, unit?: string) => {
        if (unit === "in") return val * 72;
        if (unit === "mm") return val * (72 / 25.4);
        if (unit === "px") return val * 0.75;
        return val;
      };
      const widthPt = toPt(Number.parseFloat(widthMatch[1]), widthMatch[2]?.toLowerCase());
      const heightPt = heightMatch ? toPt(Number.parseFloat(heightMatch[1]), heightMatch[2]?.toLowerCase()) : 0;
      if (!Number.isFinite(widthPt) || widthPt <= 0 || !Number.isFinite(heightPt) || heightPt > 2) return false;
      if (heightPt > 0 && widthPt <= heightPt * 5) return false;
      if (Math.abs(cx / 12700 - widthPt) > 0.5) return false;
      if (cy === 0 && heightPt !== 0) return false;
      if (cy > 0 && Math.abs(cy / 12700 - heightPt) > 0.5) return false;
      return true;
    }
  }

  return false;
}

/** Verify that the candidate actually contains the profile's replacement Shapes. */
export function hasProfileHeaderShapeLines(candidateXml: string, regime: "administrative" | "party"): boolean {
  if (regime === "administrative")
    return candidateXml.includes('name="ND30 Plain Line 1"') && candidateXml.includes('name="ND30 Plain Line 2"') &&
      (candidateXml.match(/<w:drawing\b/g) ?? []).length >= 2 && (candidateXml.match(/<w:pict\b/g) ?? []).length >= 2;
  return candidateXml.includes('name="Straight Connector 1"') &&
    /<w:drawing\b/.test(candidateXml) && /<w:pict\b/.test(candidateXml);
}
