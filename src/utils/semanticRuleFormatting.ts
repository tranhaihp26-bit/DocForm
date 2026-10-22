import { COMPANY_HEADER_PROFILE_ID } from "../canonical/nd30/companyHeader.ts";

export type SemanticRuleRegime = "state" | "party";
export type SemanticLineSpacing = "1.15" | "18pt" | "19pt";
export type SemanticFirstLineIndent = "1cm" | "1.27cm" | "0.5in";
export interface SemanticParagraphFormatting {
  lineSpacing?: SemanticLineSpacing;
  firstLineIndent?: SemanticFirstLineIndent;
}
export type SemanticRuleId =
  | "BODY.PARAGRAPH.LINE_SPACING"
  | "BODY.PARAGRAPH.FIRST_LINE_INDENT"
  | "HD05-BODY-LINE-SPACING"
  | "HD05-BODY-FIRST-LINE-INDENT";

const STATE_LINE = "BODY.PARAGRAPH.LINE_SPACING";
const STATE_INDENT = "BODY.PARAGRAPH.FIRST_LINE_INDENT";
const PARTY_LINE = "HD05-BODY-LINE-SPACING";
const PARTY_INDENT = "HD05-BODY-FIRST-LINE-INDENT";
const LINE_VALUES = new Set<SemanticLineSpacing>(["1.15", "18pt", "19pt"]);
const INDENT_VALUES = new Set<SemanticFirstLineIndent>(["1cm", "1.27cm", "0.5in"]);

export function isSemanticLineSpacing(value: string): value is SemanticLineSpacing { return LINE_VALUES.has(value as SemanticLineSpacing); }
export function isSemanticFirstLineIndent(value: string): value is SemanticFirstLineIndent { return INDENT_VALUES.has(value as SemanticFirstLineIndent); }

export function resolveSemanticRuleFormatting(
  regime: SemanticRuleRegime,
  profile: string,
  ruleIds: readonly string[],
): SemanticParagraphFormatting {
  if (!ruleIds.length || new Set(ruleIds).size !== ruleIds.length) throw new Error("semantic_rule_set_invalid");
  const expected = regime === "state" ? new Set([STATE_LINE, STATE_INDENT]) : new Set([PARTY_LINE, PARTY_INDENT]);
  if (ruleIds.some(ruleId => !expected.has(ruleId))) throw new Error("rule_regime_mismatch");
  const companyStateProfile = regime === "state" && profile === COMPANY_HEADER_PROFILE_ID;
  return {
    ...(ruleIds.includes(regime === "state" ? STATE_LINE : PARTY_LINE)
      ? { lineSpacing: regime === "party" ? "18pt" as const : companyStateProfile ? "19pt" as const : "1.15" as const }
      : {}),
    ...(ruleIds.includes(regime === "state" ? STATE_INDENT : PARTY_INDENT)
      ? { firstLineIndent: regime === "party" ? "1cm" as const : companyStateProfile ? "0.5in" as const : "1.27cm" as const }
      : {}),
  };
}

function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/[\t\r\n ]+/g, " ").trim();
}

function decodeHtmlText(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, token: string) => {
    if (token[0] === "#") {
      const hex = token[1]?.toLowerCase() === "x";
      const code = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return named[token.toLowerCase()] ?? whole;
  });
}

function paragraphParts(html: string): { attributes: string; innerHtml: string } | null {
  const match = html.trim().match(/^<p\b([^>]*)>([\s\S]*)<\/p>$/i);
  if (!match || /<(?:p|div|ul|ol|li|table|img|svg|iframe|object|canvas|video|audio)\b/i.test(match[2]) || /<br\b/i.test(match[2])) return null;
  return { attributes: match[1], innerHtml: match[2] };
}

function plainInlineText(innerHtml: string): string {
  return decodeHtmlText(innerHtml.replace(/<!--([\s\S]*?)-->/g, "").replace(/<[^>]*>/g, ""));
}

function readAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2];
}

function upsertAttribute(attributes: string, name: string, value: string): string {
  const matcher = new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  if (matcher.test(attributes)) return attributes.replace(matcher, ` ${name}="${value}"`);
  return `${attributes} ${name}="${value}"`;
}

export function applySemanticRuleFormatting(
  html: string,
  expectedText: string,
  formatting: SemanticParagraphFormatting,
): { ok: true; html: string } | { ok: false; reason: string } {
  if (!formatting.lineSpacing && !formatting.firstLineIndent) return { ok: false, reason: "semantic_rule_set_invalid" };
  if (formatting.lineSpacing && !isSemanticLineSpacing(formatting.lineSpacing)) return { ok: false, reason: "line_spacing_value_unsupported" };
  if (formatting.firstLineIndent && !isSemanticFirstLineIndent(formatting.firstLineIndent)) return { ok: false, reason: "first_line_indent_value_unsupported" };
  if (/<\/p>\s*<p\b/i.test(html.trim())) return { ok: false, reason: "paragraph_anchor_ambiguous" };
  const parts = paragraphParts(html);
  if (!parts) {
    const trimmed = html.trim();
    return { ok: false, reason: /^<p\b[\s\S]*<\/p>$/i.test(trimmed) ? "multiline_paragraph_unsupported" : "paragraph_structure_unsupported" };
  }
  if (!normalizeText(plainInlineText(parts.innerHtml)) || normalizeText(plainInlineText(parts.innerHtml)) !== normalizeText(expectedText)) {
    return { ok: false, reason: "paragraph_text_mismatch" };
  }
  let attributes = parts.attributes;
  if (formatting.lineSpacing) attributes = upsertAttribute(attributes, "data-df-line-spacing", formatting.lineSpacing);
  if (formatting.firstLineIndent) attributes = upsertAttribute(attributes, "data-df-first-line-indent", formatting.firstLineIndent);
  return { ok: true, html: `<p${attributes}>${parts.innerHtml}</p>` };
}

export function readSemanticParagraphFormatting(html: string): SemanticParagraphFormatting {
  const parts = paragraphParts(html);
  if (!parts) return {};
  const lineSpacing = readAttribute(parts.attributes, "data-df-line-spacing");
  const firstLineIndent = readAttribute(parts.attributes, "data-df-first-line-indent");
  return {
    ...(lineSpacing && isSemanticLineSpacing(lineSpacing) ? { lineSpacing } : {}),
    ...(firstLineIndent && isSemanticFirstLineIndent(firstLineIndent) ? { firstLineIndent } : {}),
  };
}
