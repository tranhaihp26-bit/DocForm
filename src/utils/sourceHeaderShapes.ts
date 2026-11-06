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
  if (/<(?:a:blip|a:t|v:imagedata|v:textbox|wps:txbx|w:txbxContent)\b/.test(fragment)) return false;

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
      /<(?:w:object|w:fldSimple|w:fldChar|w:hyperlink|w:sdt|w:altChunk|w:ins|w:del|w:moveFrom|w:moveTo|a:blip|v:imagedata|v:textbox|wps:txbx)\b|\br:(?:embed|link|id)\s*=/.test(sourceTableXml)) return false;
  return fragments.every(isDecorativeLineShape);
}

/** Verify that the candidate actually contains the profile's replacement Shapes. */
export function hasProfileHeaderShapeLines(candidateXml: string, regime: "administrative" | "party"): boolean {
  if (regime === "administrative")
    return candidateXml.includes('name="ND30 Plain Line 1"') && candidateXml.includes('name="ND30 Plain Line 2"') &&
      (candidateXml.match(/<w:drawing\b/g) ?? []).length >= 2 && (candidateXml.match(/<w:pict\b/g) ?? []).length >= 2;
  return candidateXml.includes('name="Straight Connector 1"') &&
    /<w:drawing\b/.test(candidateXml) && /<w:pict\b/.test(candidateXml);
}
