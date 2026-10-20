/** A metadata header may be replaced by the selected Hoa Tieu profile only
 * when its OOXML objects are the known, self-contained decorative straight lines.
 * Media, fields and other drawings remain export blockers. */
export function hasReplaceableHeaderShapeLines(sourceTableXml: string): boolean {
  const fragments = [...sourceTableXml.matchAll(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/g)].map(match => match[0]);
  if (fragments.length === 0 ||
      (sourceTableXml.match(/<w:drawing\b/g) ?? []).length !== fragments.length ||
      (sourceTableXml.match(/<w:pict\b/g) ?? []).length !== fragments.length ||
      /<(?:w:object|w:fldSimple|w:fldChar|w:hyperlink|w:sdt|w:altChunk|w:ins|w:del|w:moveFrom|w:moveTo|a:blip|v:imagedata|v:textbox|wps:txbx)\b|\br:(?:embed|link|id)\s*=/.test(sourceTableXml)) return false;
  return fragments.every(fragment =>
    (fragment.match(/<w:drawing\b/g) ?? []).length === 1 &&
    (fragment.match(/<w:pict\b/g) ?? []).length === 1 &&
    /<a:prstGeom\b[^>]*\bprst="line"/.test(fragment) &&
    /<v:line\b/.test(fragment) &&
    /<wp:extent\b[^>]*\bcx="[1-9]\d*"[^>]*\bcy="0"/.test(fragment) &&
    !/<(?:a:blip|a:t|v:imagedata|v:textbox|wps:txbx|w:txbxContent)\b/.test(fragment)
  );
}

/** Verify that the candidate actually contains the profile's replacement Shapes. */
export function hasProfileHeaderShapeLines(candidateXml: string, regime: "administrative" | "party"): boolean {
  if (regime === "administrative")
    return candidateXml.includes('name="ND30 Plain Line 1"') && candidateXml.includes('name="ND30 Plain Line 2"') &&
      (candidateXml.match(/<w:drawing\b/g) ?? []).length >= 2 && (candidateXml.match(/<w:pict\b/g) ?? []).length >= 2;
  return candidateXml.includes('name="Straight Connector 1"') &&
    /<w:drawing\b/.test(candidateXml) && /<w:pict\b/.test(candidateXml);
}
