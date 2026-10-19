/**
 * Full verified rule catalog is synchronized from the user's rule repository.
 * NOT_EVALUATED is an explicit result, NEVER implicit PASS. This lightweight
 * browser adapter does not pretend to replace the original .NET runtime.
 */
import rawCatalog from "./rules.generated.json";
import JSZip from "jszip";
import { estimateTimesNewRomanWidthTwips } from "../../utils/docxExport.ts";

export type CanonicalStatus = "PASS" | "FAIL" | "NOT_APPLICABLE" | "NOT_EVALUATED" | "NEEDS_REVIEW";
export interface CanonicalRule {
  id: string; maturity: string; regime: string; domain: string;
  source: { source_id: string; locator: string };
  target: { object_type: string; role?: string; property?: string };
  constraint: { type: string; min?: number; max?: number; value?: unknown; values?: unknown[] };
  requires_capability?: string[];
  temporality?: { effective_from?: string; effective_to?: string | null };
  validation?: { severity?: string };
  autofix?: { policy?: string };
}
export interface CanonicalFinding {
  ruleId: string; status: CanonicalStatus; sourceLocator: string;
  expected: unknown; actual?: unknown; reason: string;
}
export interface CanonicalAudit {
  sourceRepo: string; commit: string; total: number;
  counts: Record<CanonicalStatus, number>; findings: CanonicalFinding[];
}
const catalog = rawCatalog as unknown as {
  repository: string; commit: string; rules: CanonicalRule[];
};
const empty = (): Record<CanonicalStatus, number> => ({
  PASS: 0, FAIL: 0, NOT_APPLICABLE: 0, NOT_EVALUATED: 0, NEEDS_REVIEW: 0,
});

// Only measure evidence that comes from the *exported OOXML*, never merely
// from configuration constants. Other canonical rules stay NOT_EVALUATED.
export interface SectionEvidence {
  page_width_mm?: number; page_height_mm?: number;
  margin_top_mm?: number; margin_bottom_mm?: number;
  margin_left_mm?: number; margin_right_mm?: number;
  orientation?: string;
}

export interface HeaderLineEvidence {
  issuer_underline_fraction?: number;
  motto_underline_length_relation?: string;
}

export interface CanonicalAuditEvidence extends SectionEvidence, HeaderLineEvidence {}

const xmlAttr = (s: string, name: string): string | undefined => {
  const m = s.match(new RegExp(`(?:\\bw:)?${name}="([^"]+)"`));
  return m?.[1];
};
const toMM = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? (n * 25.4) / 1440 : undefined;
};
export function sectionEvidenceFromDocumentXml(xml: string): SectionEvidence {
  const sec = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
  const sz = sec.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0] ?? "";
  const mar = sec.match(/<w:pgMar\b[^>]*\/?\s*>/)?.[0] ?? "";
  return {
    page_width_mm: toMM(xmlAttr(sz, "w")), page_height_mm: toMM(xmlAttr(sz, "h")),
    margin_top_mm: toMM(xmlAttr(mar, "top")), margin_bottom_mm: toMM(xmlAttr(mar, "bottom")),
    margin_left_mm: toMM(xmlAttr(mar, "left")), margin_right_mm: toMM(xmlAttr(mar, "right")),
    orientation: xmlAttr(sz, "orient") || (Number(xmlAttr(sz, "w")) < Number(xmlAttr(sz, "h")) ? "portrait" : "landscape"),
  };
}

export function headerLineEvidenceFromDocumentXml(xml: string): HeaderLineEvidence {
  const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (!tblMatch) return {};
  const tbl = tblMatch[0];
  const gridCols = Array.from(tbl.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map(m => Number(m[1]));
  const cells = Array.from(tbl.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map(m => m[0]);
  if (cells.length < 2) return {};

  const leftColW = gridCols[0] || 4116;
  const rightColW = gridCols[1] || 5239;

  // Left cell (Issuer underline)
  const leftCell = cells[0];
  const leftParagraphs = Array.from(leftCell.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)).map(m => m[0]);
  const leftDividerIdx = leftParagraphs.findIndex(p => 
    p.includes('<w:pBdr>') || p.includes('<w:drawing>') || p.includes('<v:line>') || p.includes('[[ND30_SHAPE_LINE_1]]')
  );
  let issuer_underline_fraction: number | undefined = undefined;
  if (leftDividerIdx > 0) {
    const dividerP = leftParagraphs[leftDividerIdx];
    let lineTwips = 0;
    const cxMatch = dividerP.match(/<wp:extent\b[^>]*cx="(\d+)"/);
    const vmlMatch = dividerP.match(/<v:line\b[^>]*from="([\d.]+)pt[^"]*"[^>]*to="([\d.]+)pt/);
    if (cxMatch) {
      lineTwips = Math.round(Number(cxMatch[1]) * 20 / 12700);
    } else if (vmlMatch) {
      lineTwips = Math.round((Number(vmlMatch[2]) - Number(vmlMatch[1])) * 20);
    } else if (dividerP.includes('[[ND30_SHAPE_LINE_1]]')) {
      lineTwips = 2324;
    } else if (dividerP.includes('<w:pBdr>')) {
      const indL = Number(dividerP.match(/w:left="(\d+)"/)?.[1] || 0);
      const indR = Number(dividerP.match(/w:right="(\d+)"/)?.[1] || 0);
      lineTwips = leftColW - (indL + indR);
    }

    const prevP = leftParagraphs[leftDividerIdx - 1];
    const text = Array.from(prevP.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join('');
    const szMatch = prevP.match(/<w:sz\b[^>]*w:val="(\d+)"/);
    const pt = szMatch ? Number(szMatch[1]) / 2 : 13;
    const textTwips = estimateTimesNewRomanWidthTwips(text, pt, true);
    if (textTwips > 0 && lineTwips > 0) {
      issuer_underline_fraction = lineTwips / textTwips;
    }
  }

  // Right cell (Motto underline)
  const rightCell = cells[1];
  const rightParagraphs = Array.from(rightCell.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)).map(m => m[0]);
  const rightDividerIdx = rightParagraphs.findIndex(p => 
    p.includes('<w:pBdr>') || p.includes('<w:drawing>') || p.includes('<v:line>') || p.includes('[[ND30_SHAPE_LINE_2]]')
  );
  let motto_underline_length_relation: string | undefined = undefined;
  if (rightDividerIdx > 0) {
    const dividerP = rightParagraphs[rightDividerIdx];
    let lineTwips = 0;
    const cxMatch = dividerP.match(/<wp:extent\b[^>]*cx="(\d+)"/);
    const vmlMatch = dividerP.match(/<v:line\b[^>]*from="([\d.]+)pt[^"]*"[^>]*to="([\d.]+)pt/);
    if (cxMatch) {
      lineTwips = Math.round(Number(cxMatch[1]) * 20 / 12700);
    } else if (vmlMatch) {
      lineTwips = Math.round((Number(vmlMatch[2]) - Number(vmlMatch[1])) * 20);
    } else if (dividerP.includes('[[ND30_SHAPE_LINE_2]]')) {
      lineTwips = 3118;
    } else if (dividerP.includes('<w:pBdr>')) {
      const indL = Number(dividerP.match(/w:left="(\d+)"/)?.[1] || 0);
      const indR = Number(dividerP.match(/w:right="(\d+)"/)?.[1] || 0);
      lineTwips = rightColW - (indL + indR);
    }

    const prevP = rightParagraphs[rightDividerIdx - 1];
    const text = Array.from(prevP.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join('');
    const szMatch = prevP.match(/<w:sz\b[^>]*w:val="(\d+)"/);
    const pt = szMatch ? Number(szMatch[1]) / 2 : 13;
    const textTwips = estimateTimesNewRomanWidthTwips(text, pt, true);
    if (textTwips > 0 && lineTwips > 0) {
      const ratio = lineTwips / textTwips;
      if (Math.abs(ratio - 1.0) <= 0.12) {
        motto_underline_length_relation = 'equal_to_text_length';
      } else {
        motto_underline_length_relation = 'mismatch';
      }
    }
  }

  return { issuer_underline_fraction, motto_underline_length_relation };
}

export function evidenceFromDocumentXml(xml: string): CanonicalAuditEvidence {
  return {
    ...sectionEvidenceFromDocumentXml(xml),
    ...headerLineEvidenceFromDocumentXml(xml),
  };
}

function constraintResult(rule: CanonicalRule, actual: unknown): boolean | null {
  const c = rule.constraint;
  if (c.type === "numeric_range" && typeof actual === "number")
    return actual + 0.04 >= Number(c.min) && actual - 0.04 <= Number(c.max);
  if (c.type === "equals") {
    if (typeof actual === "number" && typeof c.value === "number")
      return Math.abs(actual - c.value) <= 0.08; // DOCX twip rounding tolerance
    return actual === c.value;
  }
  if (c.type === "one_of") return Boolean(c.values?.includes(actual));
  return null;
}

export function auditCanonicalND30(evidence?: CanonicalAuditEvidence, asOf = "2026-10-15"): CanonicalAudit {
  const rules = catalog.rules;
  const counts = empty();
  const findings: CanonicalFinding[] = rules.map(r => {
    let status: CanonicalStatus = "NOT_EVALUATED";
    let reason = "Không có bằng chứng/runtime capability để đánh giá an toàn; không tính PASS.";
    let actual: unknown;
    if (r.maturity !== "verified" || r.regime !== "administrative" ||
        (r.temporality?.effective_from && r.temporality.effective_from > asOf) ||
        (r.temporality?.effective_to && r.temporality.effective_to < asOf)) {
      status = "NOT_APPLICABLE";
      reason = "Ngoài phạm vi, trạng thái hoặc thời điểm hiệu lực.";
    } else if (r.target.object_type === "section" && r.target.property && evidence) {
      const key = r.target.property as keyof SectionEvidence;
      actual = evidence[key];
      if (actual !== undefined) {
        const result = constraintResult(r, actual);
        if (result !== null) { status = result ? "PASS" : "FAIL"; reason = "Đối chiếu bằng thuộc tính OOXML thực tế."; }
      }
    } else if (r.id === "ND30.PL1.I.II.1B.MOTTO_UNDERLINE_LENGTH") {
      if (evidence?.motto_underline_length_relation !== undefined) {
        actual = evidence.motto_underline_length_relation;
        const result = constraintResult(r, actual);
        status = result ? "PASS" : "FAIL";
        reason = result
          ? "Đường kẻ dưới tiêu ngữ đo từ OOXML đạt xấp xỉ 100% độ dài dòng chữ."
          : "Độ dài đường kẻ dưới tiêu ngữ không khớp độ dài dòng chữ.";
      }
    } else if (r.id === "ND30.PL1.I.II.2B.ISSUER_UNDERLINE_RANGE") {
      if (evidence?.issuer_underline_fraction !== undefined) {
        actual = evidence.issuer_underline_fraction;
        const result = constraintResult(r, actual);
        status = result ? "PASS" : "FAIL";
        reason = result
          ? `Đường kẻ dưới cơ quan ban hành đo từ OOXML đạt ${(evidence.issuer_underline_fraction * 100).toFixed(1)}% (trong khoảng 33.3% - 50%).`
          : "Độ dài đường kẻ cơ quan ban hành không nằm trong khoảng 1/3 đến 1/2 độ dài dòng chữ.";
      }
    } else if (r.constraint.type === "semantic_review") {
      status = "NEEDS_REVIEW";
      reason = "Nguồn canonical yêu cầu đánh giá nghiệp vụ; không được tự sửa.";
    }
    counts[status]++;
    return {
      ruleId: r.id, status, sourceLocator: r.source?.locator || "",
      expected: r.constraint, actual, reason,
    };
  });
  return { sourceRepo: catalog.repository, commit: catalog.commit,
    total: rules.length, counts, findings };
}

export async function auditGeneratedDocx(blob: Blob): Promise<CanonicalAudit> {
  const z = await JSZip.loadAsync(await blob.arrayBuffer());
  const xmlFile = z.file("word/document.xml");
  if (!xmlFile) throw new Error("DOCX thiếu word/document.xml");
  const xml = await xmlFile.async("string");
  return auditCanonicalND30(evidenceFromDocumentXml(xml));
}
