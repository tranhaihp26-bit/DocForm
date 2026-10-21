/**
 * Organization profile: fixed display header for selected company documents.
 * Source of the visual layout: the original header-reference.docx supplied by the user.
 * Source of legal rule constraints: the user's canonical ND30 repository, not legacy Markdown.
 */
import {
  AlignmentType, BorderStyle, TableLayoutType, Table, TableCell, TableRow, Paragraph,
  TextRun, WidthType, convertMillimetersToTwip,
} from "docx";

export const COMPANY_HEADER_PROFILE_ID = "hoa-tieu-mien-bac-administrative-v1" as const;
export const COMPANY_HEADER_PARENT_LINES = ["TỔNG CÔNG TY BẢO ĐẢM", "AN TOÀN HÀNG HẢI VIỆT NAM"] as const;
export const COMPANY_HEADER_ISSUER_LINES = ["CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC"] as const;
export const COMPANY_HEADER_PARENT = COMPANY_HEADER_PARENT_LINES.join("\n");
export const COMPANY_HEADER_ISSUER = COMPANY_HEADER_ISSUER_LINES.join("\n");
export const COMPANY_NATIONAL_HEADER = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
export const COMPANY_MOTTO = "Độc lập - Tự do - Hạnh phúc";
export const COMPANY_DEFAULT_DATE = "Hải Phòng, ngày … tháng … năm …";
export const COMPANY_DEFAULT_NUMBER = "Số: …/…";

// Measured from the source Word table: 5187 + 5245 twips, indented -874 twips.
// Its wider footprint is deliberate: both 12 pt bold headings stay on one line
// while the table remains inside the physical A4 page.
export const COMPANY_HEADER_TABLE_TWIPS = Object.freeze({ width: 10432, left: 5187, right: 5245, indent: -874 });
const SOURCE_TABLE_TWIPS = COMPANY_HEADER_TABLE_TWIPS;
const mm = (twips: number) => (twips * 25.4) / 1440;

export const COMPANY_HEADER_GEOMETRY_MM = Object.freeze({
  pageWidth: 210, pageHeight: 297,
  marginTop: 20, marginBottom: 20, marginLeft: 30, marginRight: 15,
  headerWidth: mm(SOURCE_TABLE_TWIPS.width), bodyWidth: 155,
  leftColumn: mm(SOURCE_TABLE_TWIPS.left), rightColumn: mm(SOURCE_TABLE_TWIPS.right),
  headerIndent: mm(SOURCE_TABLE_TWIPS.indent),
  bodyInset: 5,
});

const NO_BORDER = Object.freeze({
  style: BorderStyle.NONE, size: 0, color: "auto",
});
const INVISIBLE = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};
const RUN = (text: string, size: number, bold = false, italic = false) =>
  new TextRun({ text, font: "Times New Roman", size: size * 2, bold, italics: italic });

const centered = (runs: TextRun[], line = 300, after = 0) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { line, lineRule: "exact", before: 0, after },
  keepLines: true,
  children: runs,
});

const rightAligned = (runs: TextRun[], line = 320, after = 0) => new Paragraph({
  alignment: AlignmentType.RIGHT,
  spacing: { line, lineRule: "exact", before: 0, after },
  keepLines: true,
  children: runs,
});

/**
 * Company header follows the source Word table; contains NO visible table grid.
 * Uses exact Shape Lines (DrawingML & VML fallback) matching header-reference.docx.
 */
export function createCompanyHeaderTable(referenceNumber?: string, locationAndDate?: string, showNationalHeader = true): Table {
  const cleanRef = (referenceNumber || "").trim() || COMPANY_DEFAULT_NUMBER;
  const cleanDate = (locationAndDate || "").trim() || COMPANY_DEFAULT_DATE;

  return new Table({
    width: { size: SOURCE_TABLE_TWIPS.width, type: WidthType.DXA },
    indent: { size: SOURCE_TABLE_TWIPS.indent, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [SOURCE_TABLE_TWIPS.left, SOURCE_TABLE_TWIPS.right],
    borders: INVISIBLE,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: SOURCE_TABLE_TWIPS.left, type: WidthType.DXA },
            borders: INVISIBLE,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              centered([RUN(COMPANY_HEADER_PARENT_LINES[0], 12), new TextRun({ break: 1 }), RUN(COMPANY_HEADER_PARENT_LINES[1], 12)], 300, 0),
              centered([RUN(COMPANY_HEADER_ISSUER, 12, true)], 320, 0),
              // Đoạn văn chứa Shape Line 1 (độ rộng 116.2pt ~ 2324 twips, thụt lề 1431 dxa mỗi bên)
              new Paragraph({
                alignment: AlignmentType.CENTER,
                indent: { left: 1431, right: 1431 },
                spacing: { line: 20, lineRule: "exact", before: 0, after: 0 },
                children: [new TextRun({ text: "[[ND30_SHAPE_LINE_1]]" })],
              }),
            ],
          }),
          new TableCell({
            width: { size: SOURCE_TABLE_TWIPS.right, type: WidthType.DXA },
            borders: INVISIBLE,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: showNationalHeader ? [
              centered([RUN(COMPANY_NATIONAL_HEADER, 12, true)], 300, 0),
              centered([RUN(COMPANY_MOTTO, 13, true)], 320, 0),
              // Đoạn văn chứa Shape Line 2 (độ rộng 155.9pt ~ 3118 twips, thụt lề 1064 dxa mỗi bên)
              new Paragraph({
                alignment: AlignmentType.CENTER,
                indent: { left: 1064, right: 1064 },
                spacing: { line: 20, lineRule: "exact", before: 0, after: 0 },
                children: [new TextRun({ text: "[[ND30_SHAPE_LINE_2]]" })],
              }),
            ] : [new Paragraph({ text: "" })],
          }),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: SOURCE_TABLE_TWIPS.left, type: WidthType.DXA },
            borders: INVISIBLE,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [centered([RUN(cleanRef, 13)], 320, 0)],
          }),
          new TableCell({
            width: { size: SOURCE_TABLE_TWIPS.right, type: WidthType.DXA },
            borders: INVISIBLE,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [rightAligned([RUN(cleanDate, 13, false, true)], 320, 0)],
          }),
        ],
      }),
    ],
  });
}

export function applyCompanyProfile<T extends object>(input: T): T & {headerProfile: typeof COMPANY_HEADER_PROFILE_ID} {
  return {
    ...input,
    regime: "administrative",
    headerProfile: COMPANY_HEADER_PROFILE_ID,
    orgHeader1: COMPANY_HEADER_PARENT,
    orgHeader2: COMPANY_HEADER_ISSUER,
    nationalHeader1: COMPANY_NATIONAL_HEADER,
    nationalHeader2: COMPANY_MOTTO,
    locationAndDate: typeof (input as any).locationAndDate === "string" &&
      (input as any).locationAndDate.trim() && !(input as any).locationAndDate.includes("[Địa danh]")
      ? (input as any).locationAndDate : COMPANY_DEFAULT_DATE,
  };
}

export const LOCKED_COMPANY_FIELDS = new Set([
  "orgHeader1", "orgHeader2", "nationalHeader1", "nationalHeader2",
]);
