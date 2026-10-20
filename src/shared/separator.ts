/**
 * @file separator.ts
 * @description Shared definition of the standalone horizontal-rule paragraph
 * ("-----", "___", "- - -", "* * *") used by the party document type.
 *
 * Chặng 2 / S2-F02: the structural segmenter and the DOCX exporter must agree
 * on what a separator is. When they disagreed, a source "-----" that was not
 * the first element of the body stayed inside `bodyHtml` **and** the exporter
 * rendered its own separator, so the delivered Word file contained two
 * separator lines (HD 05 Phần II.I.5.2.1 requires exactly five dashes).
 *
 * This module is dependency-free so both the server-side segmenter and the
 * browser-side exporter can use it without pulling extra code in.
 */

/** True when a paragraph text is nothing but a horizontal rule. */
export function isSeparatorParagraph(text: string): boolean {
  return /^[-–—_\s*]{3,10}$/.test(text.trim());
}

/**
 * True when the given HTML body carries at least one standalone separator
 * paragraph — anywhere, not only at the very beginning.
 */
export function containsSeparatorParagraph(bodyHtml?: string | null): boolean {
  if (!bodyHtml) return false;
  const paragraphs = bodyHtml.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  for (const paragraph of paragraphs) {
    const text = paragraph
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#160;/g, " ")
      .trim();
    if (isSeparatorParagraph(text)) return true;
  }
  return false;
}
