/**
 * @file regimeDetection.ts
 * @description Deterministic, pure detection of the governing regime
 * ("state" = Nghị định 30/2020/NĐ-CP, "party" = Hướng dẫn 05-HD/VPTW)
 * from **raw, unsegmented** source blocks (Chặng 2).
 *
 * Design rules (see docs/superpowers/plans/2026-10-19-docform-stage2-implementation-plan.md):
 * - Never read `role` assigned by the segmenter; every extracted block is `unclassified`.
 * - Only inspect the leading region of the source, in block -> line -> table-cell order.
 * - "chi bộ" / "Đảng ủy" appearing inside a body sentence, recipient list or appendix must
 *   NOT decide the regime: only standalone, uppercase, org-name-shaped header lines count.
 * - Both administrative marks and party marks are handled symmetrically.
 * - Filename/hash are never used as evidence.
 * - Return `null` + `insufficient` when there is no trustworthy anchor.
 */

import type {
  DocumentTypeEvidenceRecord,
  RegimeEvidenceCell,
  RegimeEvidenceRecord,
  SourceBlock,
} from "../shared/schemas/document.schema.ts";

export type Regime = "state" | "party";
export type RegimeConfidence = "high" | "medium" | "low";
export type RegimeEvidenceStrength = "high" | "medium";

export type RegimeEvidenceKind =
  | "national_header_state"
  | "national_header_party"
  | "motto_state"
  | "party_org_header"
  | "reference_number_state"
  | "reference_number_party";

export interface RegimeEvidence extends RegimeEvidenceRecord {
  kind: RegimeEvidenceKind;
}

export type DocumentTypeEvidence = DocumentTypeEvidenceRecord;

export interface RegimeDetectionResult {
  suggestedRegime: Regime | null;
  confidence: RegimeConfidence;
  conflict: boolean;
  insufficient: boolean;
  evidence: RegimeEvidence[];
  documentTypeEvidence: DocumentTypeEvidence | null;
}

export interface RegimeDetectionOptions {
  /** Maximum number of leading blocks inspected. Defaults to 12. */
  maxFrontBlocks?: number;
  /**
   * Maximum block index where a party organisation header line may be accepted.
   * Party org names belong to the very top of the document; anything deeper is
   * treated as body/recipients/appendix content. Defaults to 5.
   */
  maxOrgHeaderBlockIndex?: number;
}

export const STATE_NATIONAL_HEADER = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
export const PARTY_NATIONAL_HEADER = "ĐẢNG CỘNG SẢN VIỆT NAM";
export const STATE_MOTTO = "Độc lập - Tự do - Hạnh phúc";

export const DOCUMENT_TYPE_KEYWORDS = [
  "QUYẾT ĐỊNH",
  "KẾ HOẠCH",
  "TỜ TRÌNH",
  "THÔNG BÁO",
  "NGHỊ QUYẾT",
  "BÁO CÁO",
  "NGHỊ ĐỊNH",
  "CHỈ THỊ",
  "HƯỚNG DẪN",
  "CÔNG VĂN",
  "BIÊN BẢN",
] as const;

const STATE_NATIONAL_HEADER_REGEX = /CỘNG\s+HÒA\s+XÃ\s+HỘI\s+CHỦ\s+NGHĨA\s+VIỆT\s+NAM/iu;
const PARTY_NATIONAL_HEADER_REGEX = /ĐẢNG\s+CỘNG\s+SẢN\s+VIỆT\s+NAM/iu;
const STATE_MOTTO_REGEX = /Độc\s*lập\s*[-–—]\s*Tự\s*do\s*[-–—]\s*Hạnh\s*phúc/iu;

/**
 * Party organisation names may start with one of these tokens. The match is
 * anchored at the beginning of the line so a body sentence that merely mentions
 * "chi bộ" in the middle is never accepted.
 *
 * The trailing guard is a Unicode-aware negative lookahead for a letter or digit,
 * NOT `\b`: Vietnamese uppercase letters such as "Ộ" are not ASCII word
 * characters, so `\b` never fires between "Ộ" and a following space and lines
 * like "CHI BỘ CƠ QUAN A" were silently dropped (acceptance finding S2-F03).
 */
const PARTY_ORG_PREFIX_REGEX =
  /^(ĐẢNG\s+ỦY|ĐẢNG\s+BỘ|CHI\s+BỘ|BAN\s+CHẤP\s+HÀNH|BAN\s+THƯỜNG\s+VỤ|ĐẢNG\s+ĐOÀN)(?![\p{L}\p{N}])/iu;

function splitCandidateLines(text: string): string[] {
  return text
    .split(/\r?\n|\t+|\s*\|\s*|\s{2,}/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function upperRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return 0;
  let upper = 0;
  for (const ch of letters) {
    if (ch.toUpperCase() === ch && ch.toLowerCase() !== ch) upper += 1;
  }
  return upper / letters.length;
}

function isUpperDominant(text: string, threshold = 0.8): boolean {
  return upperRatio(text) >= threshold;
}

/**
 * A party organisation line must look like a header: uppercase-dominant,
 * no terminal sentence punctuation, no bullet prefix, and a sane length.
 */
export function isPartyOrgHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 140) return false;
  if (!PARTY_ORG_PREFIX_REGEX.test(trimmed)) return false;
  if (/[.;:,]\s*$/u.test(trimmed)) return false;
  if (/^(?:[-+*•]|\d+[.)])\s+/u.test(trimmed)) return false;
  return isUpperDominant(trimmed);
}

function matchDocumentTypeLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  for (const keyword of DOCUMENT_TYPE_KEYWORDS) {
    if (upper === keyword) return keyword;
    if (upper.startsWith(keyword + ":") || upper.startsWith(keyword + " ")) {
      // Only a short, uppercase-dominant heading counts; body prose is rejected.
      if (trimmed.length <= 120 && isUpperDominant(trimmed)) return keyword;
    }
  }
  return null;
}

function makeEvidence(
  kind: RegimeEvidenceKind,
  regime: Regime,
  strength: RegimeEvidenceStrength,
  block: SourceBlock,
  exactQuote: string,
  lineIndex?: number,
  cell?: RegimeEvidenceCell,
): RegimeEvidence {
  return {
    kind,
    regime,
    strength,
    sourceBlockId: block.id,
    blockIndex: block.index,
    ...(lineIndex !== undefined ? { lineIndex } : {}),
    ...(cell ? { cell } : {}),
    exactQuote,
  };
}

interface ScanAccumulator {
  evidence: RegimeEvidence[];
  documentTypeEvidence: DocumentTypeEvidence | null;
}

function scanLine(
  line: string,
  block: SourceBlock,
  lineIndex: number,
  cell: RegimeEvidenceCell | undefined,
  acc: ScanAccumulator,
  maxOrgHeaderBlockIndex: number,
  headerZoneEnd: number,
): void {
  if (STATE_NATIONAL_HEADER_REGEX.test(line)) {
    acc.evidence.push(makeEvidence("national_header_state", "state", "high", block, line, lineIndex, cell));
  }
  if (PARTY_NATIONAL_HEADER_REGEX.test(line)) {
    acc.evidence.push(makeEvidence("national_header_party", "party", "high", block, line, lineIndex, cell));
  }
  if (STATE_MOTTO_REGEX.test(line)) {
    acc.evidence.push(makeEvidence("motto_state", "state", "high", block, line, lineIndex, cell));
  }

  // Reference number: "Số:" belongs to the administrative system, "Số <value>"
  // (no colon) belongs to the party system. Only accept short reference lines.
  const trimmed = line.trim();
  if (trimmed.length <= 120) {
    if (/^Số\s*:/iu.test(trimmed)) {
      acc.evidence.push(makeEvidence("reference_number_state", "state", "medium", block, trimmed, lineIndex, cell));
    } else if (/^Số\s+\S/iu.test(trimmed)) {
      acc.evidence.push(makeEvidence("reference_number_party", "party", "medium", block, trimmed, lineIndex, cell));
    }
  }

  // Party organisation header (only near the very top, only for header-shaped
  // lines). This is a STRONG anchor: a standalone, uppercase "ĐẢNG ỦY …" /
  // "CHI BỘ …" line is as trustworthy as the party national header. Only bare
  // reference numbers stay at "medium" strength (S2-F02).
  //
  // S2-F03 (tái audit 20/10/2026): the line must also sit inside the *issuing
  // organisation* zone — before the document type, the subject, the recipient
  // list, an appendix or the body. Without that bound, an uppercase "CHI BỘ …"
  // in the body / nơi nhận / phụ lục produced a false "both systems present"
  // conflict and showed the wrong quote in the confirmation modal.
  if (
    block.index <= maxOrgHeaderBlockIndex &&
    block.index < headerZoneEnd &&
    isPartyOrgHeaderLine(trimmed)
  ) {
    acc.evidence.push(makeEvidence("party_org_header", "party", "high", block, trimmed, lineIndex, cell));
  }

  if (!acc.documentTypeEvidence) {
    const docType = matchDocumentTypeLine(line);
    if (docType) {
      acc.documentTypeEvidence = {
        value: docType,
        sourceBlockId: block.id,
        blockIndex: block.index,
        ...(lineIndex !== undefined ? { lineIndex } : {}),
        ...(cell ? { cell } : {}),
        exactQuote: trimmed,
      };
    }
  }
}

/**
 * Terminators of the *issuing organisation* zone. Everything from a terminator
 * onwards belongs to the document content (subject, body, recipient list,
 * appendix) and must never provide regime evidence.
 *
 * S2-F03 (tái audit 20/10/2026): a standalone uppercase "CHI BỘ …" / "ĐẢNG ỦY …"
 * line inside the body, the recipient list or an appendix was harvested as
 * `party_org_header` evidence because the only positional guard was
 * `block.index <= 5`. The front zone is now bounded by real document landmarks.
 */
const SUBJECT_LINE_REGEX = /^V\/v(?![\p{L}\p{N}])/iu;
const RECIPIENT_MARKER_REGEX = /^(?:Nơi nhận|Nhận)(?![\p{L}\p{N}])/iu;
const APPENDIX_HEADING_REGEX = /^(?:PHỤ LỤC|ĐÍNH KÈM)(?![\p{L}\p{N}])/iu;
const BODY_OPENER_REGEX =
  /^(?:Căn cứ|Hôm nay|Vào hồi|Tại|Thực hiện|Nhằm|Theo đề nghị|Xét đề nghị|Điều\s+\d+)(?![\p{L}\p{N}])/iu;

/**
 * The leading region ends at the first clearly body-shaped paragraph. This keeps
 * recipient lists, appendices and body sentences containing "chi bộ"/"Đảng ủy"
 * out of the evidence region even for exceptionally long headers.
 */
function computeFrontEnd(blocks: SourceBlock[], maxFrontBlocks: number): number {
  const limit = Math.min(blocks.length, maxFrontBlocks);
  for (let i = 0; i < limit; i++) {
    const block = blocks[i];
    if (block.kind !== "paragraph") continue;
    const text = block.text.trim();
    if (!text) continue;
    if (text.length >= 220) return i;
    // Unicode-aware guard (not `\b`): Vietnamese words ending in a diacritic
    // such as "cứ"/"nghị" are not ASCII word characters, so `\b` would never
    // match and the body region would never start.
    if (BODY_OPENER_REGEX.test(text)) {
      return i;
    }
  }
  return limit;
}

/**
 * End of the *issuing organisation* zone (exclusive). A party organisation
 * header is only meaningful before the document type, the subject, the
 * recipient list, an appendix or the body — i.e. where the issuing organ is
 * actually printed. This is deliberately stricter than `computeFrontEnd`,
 * which only bounds how far the detector *scans* for regime marks.
 */
function computeHeaderZoneEnd(blocks: SourceBlock[], maxFrontBlocks: number): number {
  const limit = Math.min(blocks.length, maxFrontBlocks);
  for (let i = 0; i < limit; i++) {
    const block = blocks[i];
    if (block.kind !== "paragraph") continue;
    const text = block.text.trim();
    if (!text) continue;
    if (text.length >= 220) return i;
    // The document type marks the end of the printed header area: everything
    // after it is subject / body / recipients / appendix.
    if (matchDocumentTypeLine(text)) return i;
    if (SUBJECT_LINE_REGEX.test(text)) return i;
    if (RECIPIENT_MARKER_REGEX.test(text)) return i;
    if (APPENDIX_HEADING_REGEX.test(text)) return i;
    if (BODY_OPENER_REGEX.test(text)) return i;
  }
  return limit;
}

/**
 * Pure detection entry point. Deterministic for a given block list and options.
 */
export function detectRegimeFromRawBlocks(
  rawBlocks: SourceBlock[],
  options: RegimeDetectionOptions = {},
): RegimeDetectionResult {
  const maxFrontBlocks = options.maxFrontBlocks ?? 12;
  const maxOrgHeaderBlockIndex = options.maxOrgHeaderBlockIndex ?? 5;

  const ordered = [...rawBlocks].sort((a, b) => a.index - b.index);
  const frontEnd = computeFrontEnd(ordered, maxFrontBlocks);
  const headerZoneEnd = computeHeaderZoneEnd(ordered, maxFrontBlocks);
  const acc: ScanAccumulator = { evidence: [], documentTypeEvidence: null };

  for (const block of ordered) {
    if (block.index >= frontEnd) break;

    if (block.kind === "paragraph") {
      const lines = splitCandidateLines(block.text || "");
      lines.forEach((line, lineIndex) => {
        scanLine(line, block, lineIndex, undefined, acc, maxOrgHeaderBlockIndex, headerZoneEnd);
      });
      continue;
    }

    if (block.kind === "table") {
      const rows = block.tableData || [];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex] || [];
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          const cellText = (row[colIndex] || "").trim();
          if (!cellText) continue;
          const cell = { rowIndex, colIndex };
          const lines = splitCandidateLines(cellText);
          lines.forEach((line, lineIndex) => {
            scanLine(line, block, lineIndex, cell, acc, maxOrgHeaderBlockIndex, headerZoneEnd);
          });
        }
      }
    }
  }

  const evidence = acc.evidence;
  const hasStateEvidence = evidence.some((e) => e.regime === "state");
  const hasPartyEvidence = evidence.some((e) => e.regime === "party");

  const insufficient = evidence.length === 0;
  // S2-F01: any evidence from BOTH systems in the leading region is a conflict.
  // We never let a higher score silently pick one system. A state national header
  // plus a party reference number (or the inverse) is exactly the case where the
  // user must decide, regardless of relative weight.
  const conflict = hasStateEvidence && hasPartyEvidence;

  let suggestedRegime: Regime | null = null;
  let confidence: RegimeConfidence = "low";

  if (!insufficient && !conflict) {
    const regime: Regime = hasStateEvidence ? "state" : "party";
    suggestedRegime = regime;
    // Only a strong anchor (national header, state motto, party organisation
    // header) may auto-proceed when it matches the chosen regime. A bare
    // reference number is "medium": it is a suggestion, never a silent commit
    // (S2-F02).
    confidence = evidence.some((e) => e.regime === regime && e.strength === "high")
      ? "high"
      : "medium";
  }

  return {
    suggestedRegime,
    confidence,
    conflict,
    insufficient,
    evidence,
    documentTypeEvidence: acc.documentTypeEvidence,
  };
}

/**
 * Decide whether the detected evidence requires explicit user confirmation.
 * Confirmation is mandatory when there is no trustworthy evidence, when both
 * systems are present, or when the evidence contradicts the currently chosen
 * regime. Auto-proceed is allowed ONLY for a strong (high-confidence) anchor
 * that matches the chosen regime; medium evidence (e.g. a lone reference number)
 * always asks, even when it points at the chosen regime (S2-F02).
 */
export function regimeNeedsConfirmation(
  detection: RegimeDetectionResult,
  chosenRegime: Regime,
): boolean {
  if (detection.insufficient || detection.conflict) return true;
  if (detection.suggestedRegime === null) return true;
  if (detection.confidence !== "high") return true;
  return detection.suggestedRegime !== chosenRegime;
}

/** Build the persistent provenance record stored on `StructuredImport`. */
export function toRegimeDetectionRecord(
  detection: RegimeDetectionResult,
  confirmedRegime: Regime,
  decidedBy: "auto" | "user",
) {
  return {
    suggestedRegime: detection.suggestedRegime,
    confirmedRegime,
    confidence: detection.confidence,
    conflict: detection.conflict,
    insufficient: detection.insufficient,
    decidedBy,
    evidence: detection.evidence.map((e) => ({ ...e })),
    documentType: detection.documentTypeEvidence ? { ...detection.documentTypeEvidence } : null,
  };
}
