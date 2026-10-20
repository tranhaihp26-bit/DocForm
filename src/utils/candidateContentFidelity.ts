import { COMPANY_HEADER_PROFILE_ID } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../canonical/hd05/companyHeaderHD05.ts";
import type { DocumentFormatType } from "../shared/schemas/document.schema.ts";
import { candidateSectionName, parseRecipientLines, getHeaderRenderPlan } from "./docxExport.ts";
import { decodeHtmlEntities } from "./tableFormatUtils.ts";
import { validateOoxmlWellFormed } from "./tableRoundtrip.ts";

export interface ContentFidelityResult { safe: boolean; violations: Array<{ code: string; targetId?: string; messageVi: string }> }
/** Preserve word boundaries. Only whitespace runs and empty layout paragraphs are normalized. */
export function normalizeSemanticText(value: string): string {
  return value.normalize("NFC").replace(/\u00a0/g, " ").replace(/[\t \r\n]+/g, " ").trim();
}
export function semanticHtmlParagraphs(html: string): string[] {
  return decodeHtmlEntities(html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|td|th|tr|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map(normalizeSemanticText).filter(Boolean);
}
export function semanticXmlParagraphs(xml: string): string[] {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs.flatMap(p => {
    const text = [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br)\b[^>]*\/?\s*>/g)]
      .map(m => m[2] ? (m[2] === "tab" ? "\t" : "\n") : decodeHtmlEntities(m[1])).join("");
    return text.split("\n").map(normalizeSemanticText).filter(Boolean);
  });
}
const marker = (id: string) => candidateSectionName(id);
/** Read actual paragraphs between anchors; marker metadata never substitutes for their text. */
export function verifyCandidateContentFidelity(xml: string, data: DocumentFormatType): ContentFidelityResult {
  const violations: ContentFidelityResult["violations"] = [];
  const fail = (code: string, targetId?: string) => violations.push({ code, targetId, messageVi: `Không chứng minh được bảo toàn nội dung ứng viên: ${code}${targetId ? ` (${targetId})` : ""}.` });
  if (!validateOoxmlWellFormed(xml).valid) { fail("content_invalid_xml"); return { safe: false, violations }; }
  const apps = data.appendices ?? [];
  if (new Set(apps.map(a => a.id)).size !== apps.length || apps.some(a => !a.id)) fail("duplicate_or_missing_appendix_id");
  const ids = ["body:start", "body:end", "signature:end", ...apps.flatMap(a => [`appendix:${a.id}:start`, `appendix:${a.id}:end`]), "unclassified:start", "unclassified:end"];
  if (new Set(ids.map(marker)).size !== ids.length) fail("semantic_anchor_collision");
  const actualAnchors = [...xml.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]+)"[^>]*\/?\s*>/g)]
    .filter(m => m[1].startsWith("df_")).map(m => m[1]);
  if (JSON.stringify(actualAnchors) !== JSON.stringify(ids.map(marker))) fail("section_id_order_mismatch");
  const pos = (id: string): number => xml.indexOf(`w:name="${marker(id)}"`);
  const section = (start: string, end: string): string => {
    const a = pos(start), b = pos(end);
    if (a < 0 || b <= a) { fail("section_missing", start); return ""; }
    // Begin after the marker's containing empty paragraph and stop before the end marker paragraph.
    return xml.slice(xml.indexOf("</w:p>", a) + 6, xml.lastIndexOf("<w:p", b));
  };
  const compare = (id: string, expected: string[], actual: string[]) => {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) fail("ordered_content_mismatch", id);
  };
  compare("body", semanticHtmlParagraphs(data.bodyHtml ?? ""), semanticXmlParagraphs(section("body:start", "body:end")));
  for (const app of apps) compare(app.id,
    [normalizeSemanticText((app.title || "PHỤ LỤC").toUpperCase()), ...(app.referenceText ? [normalizeSemanticText(app.referenceText)] : []), ...semanticHtmlParagraphs(app.html ?? "")],
    semanticXmlParagraphs(section(`appendix:${app.id}:start`, `appendix:${app.id}:end`)));
  const expectedUnclassified = (data.unclassified?.length ? ["KHỐI CHƯA PHÂN LOẠI — CẦN ĐỐI CHIẾU BẢN GỐC", ...data.unclassified.flatMap(b => [`Khối #${b.index + 1} (${b.kind})`, ...(b.html ? semanticHtmlParagraphs(b.html) : [normalizeSemanticText(b.text || "[Khối không có văn bản]")])])] : []);
  compare("unclassified", expectedUnclassified, semanticXmlParagraphs(section("unclassified:start", "unclassified:end")));
  const prefixParagraphs = semanticXmlParagraphs(xml.slice(0, pos("body:start")));
  const lines = (text?: string) => (text ?? "").split(/\r?\n/).map(normalizeSemanticText).filter(Boolean);
  const party = data.regime === "party", companyState = data.headerProfile === COMPANY_HEADER_PROFILE_ID, companyParty = data.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID;
  const company = companyState || companyParty, renderPlan=getHeaderRenderPlan(data), letterParty=renderPlan.isCongVanParty;
  const expectedPrefix: string[] = [];
  if (renderPlan.renderSystemHeader) {
    expectedPrefix.push(...lines(companyParty ? data.orgHeader1 : data.orgHeader1?.toUpperCase()), ...lines(companyParty ? data.orgHeader2 : data.orgHeader2?.toUpperCase()));
    if (party) expectedPrefix.push("*");
    if (!companyState) expectedPrefix.push(...lines(data.referenceNumber));
    if (!company && data.includeDraftNoteInExport !== false) expectedPrefix.push(...lines(data.draftNote));
    if (!company && letterParty && renderPlan.renderSubject) expectedPrefix.push(...lines(data.subject));
    expectedPrefix.push(party ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");
    if (!party) expectedPrefix.push("Độc lập - Tự do - Hạnh phúc");
    if (companyState) expectedPrefix.push(...lines(data.referenceNumber));
    expectedPrefix.push(...lines(data.locationAndDate));
  }
  if(letterParty&&renderPlan.renderSubject&&!renderPlan.renderSystemHeader)expectedPrefix.push(...lines(data.subject));
  if(renderPlan.renderType)expectedPrefix.push(...lines(data.documentType?.toUpperCase()));
  if(!letterParty&&renderPlan.renderSubject)expectedPrefix.push(...lines(data.subject));
  if(renderPlan.renderPartySeparator)expectedPrefix.push("-----");
  compare("header-fields", expectedPrefix, prefixParagraphs);
  const signature = semanticXmlParagraphs(section("body:end", "signature:end"));
  const expectedSignature: string[] = [];
  if (data.signTitle?.includes("|")) {
    data.signTitle.split("|").forEach((title, i) => {
      expectedSignature.push(...title.split("\n").map(l => l.trim()).filter(Boolean).map(l => normalizeSemanticText(/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l) ? l : l.toUpperCase())), normalizeSemanticText(data.signName?.split("|")[i]?.trim() || "[Họ và tên]"));
    });
    if (data.recipients?.trim()) expectedSignature.push("Nơi nhận:", ...parseRecipientLines(data.recipients).map(l => normalizeSemanticText("- " + l)));
  } else {
    if (data.recipients?.trim()) expectedSignature.push("Nơi nhận:", ...parseRecipientLines(data.recipients).map(l => normalizeSemanticText(`- ${l}`)));
    if (data.signTitle) expectedSignature.push(...data.signTitle.split("\n").map(l => normalizeSemanticText(l.toUpperCase())).filter(Boolean), "(Ký, đóng dấu)");
    if (data.signName) expectedSignature.push(normalizeSemanticText(data.signName));
  }
  compare("signature", expectedSignature, signature);
  // No nonempty paragraph may hide between or outside the owned semantic sections.
  const allExpected = [...expectedPrefix, ...semanticHtmlParagraphs(data.bodyHtml ?? ""), ...expectedSignature,
    ...apps.flatMap(app => [normalizeSemanticText((app.title || "PHỤ LỤC").toUpperCase()), ...(app.referenceText ? lines(app.referenceText) : []), ...semanticHtmlParagraphs(app.html ?? "")]), ...expectedUnclassified];
  compare("whole-document", allExpected, semanticXmlParagraphs(xml));
  return { safe: violations.length === 0, violations };
}
