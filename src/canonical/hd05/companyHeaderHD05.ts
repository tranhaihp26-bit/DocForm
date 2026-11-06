/**
 * @file companyHeaderHD05.ts
 * @description Organization profile: fixed display header for Party documents of
 * Đảng ủy Công ty Hoa tiêu hàng hải miền Bắc theo Hướng dẫn số 05-HD/VPTW.
 * 
 * Nguồn đối chiếu:
 * - header-reference.docx và profile.json tại src/canonical/hd05/profiles/hoa-tieu-hang-hai-mien-bac/
 * - Toàn văn Hướng dẫn 05-HD/VPTW ngày 27/5/2026 (Phần II.I và Phụ lục 1, 2)
 */
import {
  AlignmentType, BorderStyle, TableLayoutType, Table, TableCell, TableRow, Paragraph,
  TextRun, WidthType, convertMillimetersToTwip,
} from "docx";

export const COMPANY_HEADER_HD05_PROFILE_ID = "HOA-TIEU-MIEN-BAC-PARTY-HD05-HEADER-2026" as const;

export const COMPANY_HEADER_HD05_PARENT_LINES = [
  "ĐẢNG BỘ TỔNG CÔNG TY",
  "BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
] as const;

export const COMPANY_HEADER_HD05_ISSUER_LINES = [
  "ĐẢNG ỦY CÔNG TY",
  "HOA TIÊU HÀNG HẢI MIỀN BẮC",
] as const;

export const COMPANY_HEADER_HD05_PARENT = COMPANY_HEADER_HD05_PARENT_LINES.join("\n");
export const COMPANY_HEADER_HD05_ISSUER = COMPANY_HEADER_HD05_ISSUER_LINES.join("\n");
export const COMPANY_HEADER_HD05_TITLE = "ĐẢNG CỘNG SẢN VIỆT NAM";
// Giá trị có sẵn trong DOCX tham chiếu, chỉ dùng để nhận diện đoạn cần thay khi đóng dấu mẫu.
// Không dùng chuỗi này làm dữ liệu mặc định trong văn bản xuất.
export const COMPANY_HEADER_HD05_REFERENCE_DATE = "Hải Phòng, ngày … tháng … năm 2026";
export const COMPANY_HEADER_HD05_DEFAULT_NUMBER = "Số …-…/ĐU";

// Kích thước đo đạc từ mẫu Wide Header V3 (DEMO_HD05_DangUy_CongTy_WideHeader_2Dong(3).docx):
// 5540 + 4440 = 9980 twips, thụt lề -593 twips.
export const COMPANY_HEADER_HD05_TABLE_TWIPS = Object.freeze({
  width: 9980,
  left: 5540,
  right: 4440,
  indent: -593,
});
const SOURCE_TABLE_TWIPS = COMPANY_HEADER_HD05_TABLE_TWIPS;

const mm = (twips: number) => (twips * 25.4) / 1440;

export const COMPANY_HEADER_HD05_GEOMETRY_MM = Object.freeze({
  pageWidth: 210,
  pageHeight: 297,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 30,
  marginRight: 15,
  headerWidth: mm(SOURCE_TABLE_TWIPS.width),
  bodyWidth: 165,
  leftColumn: mm(SOURCE_TABLE_TWIPS.left),
  rightColumn: mm(SOURCE_TABLE_TWIPS.right),
  headerIndent: mm(SOURCE_TABLE_TWIPS.indent),
});

const NO_BORDER = Object.freeze({
  style: BorderStyle.NONE,
  size: 0,
  color: "auto",
});

const INVISIBLE = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

const RUN = (text: string, size: number, bold = false, italic = false, characterSpacing?: number) =>
  new TextRun({ text, font: "Times New Roman", size: Math.round(size * 2), bold, italics: italic, characterSpacing });

const centered = (runs: TextRun[], line = 340, after = 20) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line, lineRule: "exact", before: 0, after },
    keepLines: true,
    children: runs,
  });

const rightAligned = (runs: TextRun[], line = 360, after = 0) =>
  new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { line, lineRule: "exact", before: 0, after },
    keepLines: true,
    children: runs,
  });

/**
 * Tạo bảng tiêu đề phần đầu cho Đảng ủy Công ty Hoa tiêu hàng hải miền Bắc theo mẫu Word chuẩn
 * Hỗ trợ hiển thị tổ chức cấp trên, cơ quan ban hành và ban/đoàn/chi bộ trực thuộc
 */
export function createCompanyHeaderHD05Table(
  referenceNumber?: string,
  locationAndDate?: string,
  customOrgHeader1?: string,
  customOrgHeader2?: string,
  showNationalHeader = true
): Table {
  const cleanRef = (referenceNumber || "").trim();
  const cleanDate = (locationAndDate || "").trim();

  // Xử lý các dòng của cơ quan cấp trên
  const org1Lines = (customOrgHeader1 && customOrgHeader1.trim() && !customOrgHeader1.includes("[Cơ quan"))
    ? customOrgHeader1.split("\n").map(s => s.trim()).filter(Boolean)
    : [...COMPANY_HEADER_HD05_PARENT_LINES];

  // Xử lý các dòng của cơ quan ban hành và đơn vị trực thuộc (Đoàn giám sát, chi bộ...)
  const org2Lines = (customOrgHeader2 && customOrgHeader2.trim() && !customOrgHeader2.includes("[Tên"))
    ? customOrgHeader2.split("\n").map(s => s.trim()).filter(Boolean)
    : [...COMPANY_HEADER_HD05_ISSUER_LINES];

  // S05: hình học bảng phần đầu phải bám đúng mẫu Word chuẩn.
  // Đo từ `header-reference.docx` của profile: tblW = 10170 twips,
  // tblInd = -540 twips, tblGrid = 5580 + 4590, tcW = 5580 / 4590.
  // Trước đây bộ xuất dùng 4490 + 4865 (9355 twips) và không thụt lề nên
  // candidate lệch mẫu, đồng thời làm rule `PROFILE.HD05.HOA_TIEU_MB.TABLE_WIDTH`
  // FAIL. Không đổi mẫu, không đổi profile, không đổi rule — sửa bộ xuất.
  const colLeft = SOURCE_TABLE_TWIPS.left;
  const colRight = SOURCE_TABLE_TWIPS.right;
  const tableWidth = SOURCE_TABLE_TWIPS.width;

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    indent: { size: SOURCE_TABLE_TWIPS.indent, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [colLeft, colRight],
    borders: INVISIBLE,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          // Cột trái: cỡ 14pt, giãn chữ mặc định và giãn dòng 18pt như header-reference.docx.
          new TableCell({
            width: { size: colLeft, type: WidthType.DXA },
            borders: INVISIBLE,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              ...org1Lines.map(line => centered([RUN(line, 14)], 340, 0)),
              ...org2Lines.map(line => centered([RUN(line, 14, true)], 340, 0)),
              // Dấu * căn giữa dưới tên cơ quan ban hành theo HD05 Phần II.I.2.2.1
              centered([RUN("*", 14)], 300, 0),
              // Số ký hiệu cân đối dưới dấu * (Before 1pt / 20 twips theo V3)
              ...(cleanRef ? [new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 340, lineRule: "exact", before: 20, after: 0 },
                keepLines: true,
                children: [RUN(cleanRef, 14)],
              })] : []),
            ],
          }),

          // Cột phải: ĐẢNG CỘNG SẢN VIỆT NAM (15pt đậm, căn giữa), Shape Line chuẩn 72.09mm, đoạn đệm 19pt, Ngày tháng (14pt nghiêng, căn giữa)
          new TableCell({
            width: { size: colRight, type: WidthType.DXA },
            borders: INVISIBLE,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [
              ...(showNationalHeader ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 380, lineRule: "exact", before: 0, after: 0 },
                  keepLines: true,
                  children: [
                    new TextRun({ text: "[[HD05_SHAPE_LINE_TITLE]]" }),
                    RUN(COMPANY_HEADER_HD05_TITLE, 15, true),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { line: 380, lineRule: "exact", before: 0, after: 0 },
                  keepLines: true,
                  children: [new TextRun({ text: "" })],
                }),
              ] : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { line: 380, lineRule: "exact", before: 100, after: 0 },
                keepLines: true,
                children: [RUN(cleanDate, 14, false, true)],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Gán cấu hình Đảng ủy Công ty Hoa tiêu hàng hải miền Bắc vào tài liệu
 * Bảo toàn cơ quan cấp trên, cơ quan ban hành và đơn vị trực thuộc đã xác định từ văn bản
 */
export function applyCompanyHD05Profile<T extends object>(
  input: T
): T & { headerProfile: typeof COMPANY_HEADER_HD05_PROFILE_ID } {
  const existingOrg1 = (input as any).orgHeader1;
  const existingOrg2 = (input as any).orgHeader2;
  const hasExistingOrg1 = typeof existingOrg1 === "string" && existingOrg1.trim() && !existingOrg1.includes("[Cơ quan") && !existingOrg1.includes("…");
  const hasExistingOrg2 = typeof existingOrg2 === "string" && existingOrg2.trim() && !existingOrg2.includes("[Tên") && !existingOrg2.includes("…");

  return {
    ...input,
    regime: "party",
    headerProfile: COMPANY_HEADER_HD05_PROFILE_ID,
    orgHeader1: hasExistingOrg1 ? existingOrg1 : COMPANY_HEADER_HD05_PARENT,
    orgHeader2: hasExistingOrg2 ? existingOrg2 : COMPANY_HEADER_HD05_ISSUER,
    nationalHeader1: COMPANY_HEADER_HD05_TITLE,
    nationalHeader2: "",
    fontSize: 14,
    referenceNumber: typeof (input as any).referenceNumber === "string"
      ? (input as any).referenceNumber : COMPANY_HEADER_HD05_DEFAULT_NUMBER,
    locationAndDate: typeof (input as any).locationAndDate === "string"
      ? (input as any).locationAndDate
      : "",
  };
}

export const LOCKED_COMPANY_HD05_FIELDS = new Set([
  "nationalHeader1", "nationalHeader2",
]);
