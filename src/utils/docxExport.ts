/**
 * @file docxExport.ts
 * @description Trình xuất file Microsoft Word (.docx) chuẩn theo Phụ lục I Nghị định số 30/2020/NĐ-CP
 * về công tác văn thư và Hướng dẫn số 05-HD/VPTW về thể thức văn bản Đảng.
 * 
 * CÁC QUY CHUẨN BẮT BUỘC ĐÃ ĐƯỢC CẤU HÌNH CỨNG (DETERMINISTIC):
 * - Khổ giấy: A4 (210mm x 297mm), định hướng dọc (Portrait).
 * - Phông chữ mặc định: Times New Roman.
 * - Cỡ chữ nội dung mặc định: 13pt (size = 26 half-points).
 * - Lề trang (Margins):
 *   + Lề trên: 20mm (1134 dxa)
 *   + Lề dưới: 20mm (1134 dxa)
 *   + Lề trái: 30mm (1701 dxa)
 *   + Lề phải: 15mm (850 dxa)
 * - Dãn dòng (Line spacing): 1.15 đến 1.25 (line = 276).
 * - Thụt đầu dòng (First line indent): 1.27cm (720 dxa).
 */

import { 
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Tab,
  WidthType, BorderStyle, AlignmentType, convertMillimetersToTwip, PageOrientation,
  Header, PageNumber, LevelFormat, PageBreak, SectionType, TableLayoutType, VerticalMergeType, HeightRule,
  XmlComponent, Attributes, LineRuleType, Bookmark
} from "docx";
import JSZip from "jszip";
import { stampHoaTieuHeader } from "./hoaTieuHeaderStamp.ts";
import { type DocumentFormatType, type SourceBlock, isPlaceholderValue } from "../shared/schemas/document.schema.ts";
import { containsSeparatorParagraph } from "../shared/separator.ts";
import type { TableModel } from "../shared/tableModel.ts";
import { COMPANY_HEADER_PROFILE_ID, createCompanyHeaderTable, COMPANY_HEADER_GEOMETRY_MM } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_ND30_BODY_PROFILE } from "../canonical/nd30/companyBodyProfile.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID, createCompanyHeaderHD05Table, COMPANY_HEADER_HD05_GEOMETRY_MM } from "../canonical/hd05/companyHeaderHD05.ts";
import { readSemanticParagraphFormatting, type SemanticFirstLineIndent, type SemanticLineSpacing } from "./semanticRuleFormatting.ts";
import { classifyTableMarkup, type TableFormatScope } from "../server/tableRoleClassifier.ts";
import { 
  calculateTableColumnWidthsTwip, 
  calculateUnheadedColumnWidthsTwip,
  detectColumnSemanticType, 
  getColumnDocxAlignment,
  syncTableModelFromHtml,
  syncImportedTablesFromHtml,
  decodeHtmlEntities,
  extractHtmlTextWithBreaks
} from "./tableFormatUtils.ts";

/**
 * Interface cho Style Profile của chế độ văn bản (Nghị định 30 vs Hướng dẫn 05)
 */
export interface DocumentStyleProfile {
  regime: "administrative" | "party";
  bodyFontSize: number;          // Cỡ chữ nội dung (13pt vs 14pt)
  heading1FontSize: number;      // Cỡ chữ H1 (14pt vs 15pt)
  heading2FontSize: number;      // Cỡ chữ H2 (13pt vs 14pt)
  heading3FontSize: number;      // Cỡ chữ H3 (13pt vs 14pt)
  documentTypeFontSize: number;  // Cỡ chữ tên loại văn bản (14pt vs 15pt)
  orgHeader1FontSize: number;    // Cỡ chữ cơ quan cấp trên (12pt)
  orgHeader2FontSize: number;    // Cỡ chữ cơ quan ban hành (13pt)
  nationalHeader1FontSize: number; // Cỡ chữ Quốc hiệu/Đảng (13pt vs 14pt)
  nationalHeader2FontSize: number; // Cỡ chữ Tiêu ngữ (13pt vs 0)
  signTitleFontSize: number;     // Cỡ chữ Chức vụ (13pt vs 14pt)
  signNameFontSize: number;      // Cỡ chữ Họ tên người ký (13pt vs 14pt)
  pageNumberFontSize: number;    // Cỡ chữ số trang (13pt vs 14pt)
}

/**
 * Trả về Style Profile theo Nghị định 30/2020/NĐ-CP (Hành chính) hoặc Hướng dẫn 05-HD/VPTW (Đảng)
 */
export function getStyleProfile(
  regime: "administrative" | "party" = "administrative",
  headerProfile?: string
): DocumentStyleProfile {
  if (regime === "party") {
    return {
      regime: "party",
      bodyFontSize: 14,
      heading1FontSize: 15,
      heading2FontSize: 14,
      heading3FontSize: 14,
      documentTypeFontSize: 15,
      orgHeader1FontSize: 14, // 14pt cho tên cơ quan cấp trên
      orgHeader2FontSize: 14, // 14pt cho tên cơ quan ban hành
      nationalHeader1FontSize: 15, // 15pt cho ĐẢNG CỘNG SẢN VIỆT NAM
      nationalHeader2FontSize: 0,
      signTitleFontSize: 14, // 14pt cho chức danh người ký
      signNameFontSize: 14, // 14pt cho tên người ký
      pageNumberFontSize: 14, // 14pt cho số trang
    };
  }
  const administrativeProfile: DocumentStyleProfile = {
    regime: "administrative",
    bodyFontSize: 13,
    heading1FontSize: 14,
    heading2FontSize: 13,
    heading3FontSize: 13,
    documentTypeFontSize: 14,
    orgHeader1FontSize: 12,
    orgHeader2FontSize: 13,
    nationalHeader1FontSize: 13,
    nationalHeader2FontSize: 13,
    signTitleFontSize: 13,
    signNameFontSize: 13,
    pageNumberFontSize: 13,
  };
  if (headerProfile === COMPANY_ND30_BODY_PROFILE.id) {
    return {
      ...administrativeProfile,
      bodyFontSize: COMPANY_ND30_BODY_PROFILE.body.fontSizePt,
      heading1FontSize: COMPANY_ND30_BODY_PROFILE.body.fontSizePt,
      heading2FontSize: COMPANY_ND30_BODY_PROFILE.body.fontSizePt,
      heading3FontSize: COMPANY_ND30_BODY_PROFILE.body.fontSizePt,
    };
  }
  return administrativeProfile;
}

/**
 * Ước lượng chính xác độ rộng của chuỗi ký tự theo phông Times New Roman (tính bằng twips, 1pt = 20 twips).
 * Được chuẩn hóa theo bảng metric ký tự chuẩn của Microsoft Word.
 */
export function estimateTimesNewRomanWidthTwips(text: string, fontSizePt: number, bold = false): number {
  if (!text) return 0;
  let emTotal = 0;
  for (const ch of text.normalize("NFC")) {
    if (ch === " ") { emTotal += 0.25; continue; }
    if (ch === "-") { emTotal += 0.333; continue; }
    if (ch === "–" || ch === "—") { emTotal += 0.50; continue; }
    if (ch >= "0" && ch <= "9") { emTotal += bold ? 0.54 : 0.50; continue; }
    if ("IJijlí.,:;'!|/()[]{}".includes(ch)) { emTotal += bold ? 0.33 : 0.28; continue; }
    if ("MWmw".includes(ch)) { emTotal += bold ? 0.94 : 0.88; continue; }
    if ("OQCGCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAMĐ".includes(ch)) {
      if ("IJ".includes(ch)) { emTotal += bold ? 0.38 : 0.33; continue; }
      if ("TFZE".includes(ch)) { emTotal += bold ? 0.65 : 0.61; continue; }
      if ("ĐOQCG".includes(ch)) { emTotal += bold ? 0.75 : 0.72; continue; }
      emTotal += bold ? 0.72 : 0.67;
      continue;
    }
    if (ch >= "A" && ch <= "Z") {
      if ("IJ".includes(ch)) { emTotal += bold ? 0.38 : 0.33; continue; }
      if ("TFZ".includes(ch)) { emTotal += bold ? 0.65 : 0.61; continue; }
      emTotal += bold ? 0.72 : 0.67;
      continue;
    }
    if ("ftr".includes(ch)) { emTotal += bold ? 0.36 : 0.33; continue; }
    emTotal += bold ? 0.54 : 0.50;
  }
  return Math.round(emTotal * fontSizePt * 20);
}

/**
 * Định nghĩa kích thước khổ giấy A4 chuẩn (210mm x 297mm) theo Phụ lục I Nghị định 30/2020/NĐ-CP
 */
export const ND30_PAGE_SIZE = {
  width: convertMillimetersToTwip(210),   // 210mm = 11906 twips (dxa)
  height: convertMillimetersToTwip(297),  // 297mm = 16838 twips (dxa)
  orientation: PageOrientation.PORTRAIT,
};

/**
 * Định nghĩa kích thước lề trang chuẩn Nghị định 30/2020/NĐ-CP (Phụ lục I Mục I.3)
 */
export const ND30_PAGE_MARGINS = {
  top: convertMillimetersToTwip(20),     // 20mm = 1134 dxa
  bottom: convertMillimetersToTwip(20),  // 20mm = 1134 dxa
  left: convertMillimetersToTwip(30),    // 30mm = 1701 dxa
  right: convertMillimetersToTwip(15),   // 15mm = 850 dxa
};

/** Đường viền ẩn cho các bảng cấu trúc 2 cột (Header, Signature) */
const INVISIBLE_CELL_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

export const ND30_SHAPE_LINE_1_XML = `<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658752" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1" wp14:anchorId="A0B0C0D1" wp14:editId="B0C0D0E1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>1433830</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>1308100</wp:posOffset></wp:positionV><wp:extent cx="1475740" cy="0"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="30001" name="ND30 Plain Line 1"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvCnPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1475740" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:ln><a:effectLst/><a:extLst><a:ext uri="{AF507438-7753-43E0-B8FC-AC1667EBCBE1}"><a14:hiddenEffects xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a14:hiddenEffects></a:ext></a:extLst></wps:spPr><wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></wps:style><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:line w14:anchorId="C0D0E0F1" id="ND30 Plain Line 1" o:spid="_x0000_s3001" style="position:absolute;z-index:251658752;visibility:visible;mso-wrap-style:square;mso-wrap-distance-left:9pt;mso-wrap-distance-top:0;mso-wrap-distance-right:9pt;mso-wrap-distance-bottom:0;mso-position-horizontal:absolute;mso-position-horizontal-relative:page;mso-position-vertical:absolute;mso-position-vertical-relative:page" from="112.9pt,103pt" to="229.1pt,103pt" o:allowincell="f"><v:shadow color="black" opacity="24903f" origin=",.5" offset="0,.55556mm"/><w10:wrap anchorx="page" anchory="page"/></v:line></w:pict></mc:Fallback></mc:AlternateContent>`;

export const ND30_SHAPE_LINE_2_XML = `<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658752" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1" wp14:anchorId="A0B0C0D2" wp14:editId="B0C0D0E2"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>4490720</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>1123950</wp:posOffset></wp:positionV><wp:extent cx="1979930" cy="0"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="30002" name="ND30 Plain Line 2"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvCnPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1979930" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:ln><a:effectLst/><a:extLst><a:ext uri="{AF507438-7753-43E0-B8FC-AC1667EBCBE1}"><a14:hiddenEffects xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a14:hiddenEffects></a:ext></a:extLst></wps:spPr><wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></wps:style><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:line w14:anchorId="C0D0E0F2" id="ND30 Plain Line 2" o:spid="_x0000_s3002" style="position:absolute;z-index:251658752;visibility:visible;mso-wrap-style:square;mso-wrap-distance-left:9pt;mso-wrap-distance-top:0;mso-wrap-distance-right:9pt;mso-wrap-distance-bottom:0;mso-position-horizontal:absolute;mso-position-horizontal-relative:page;mso-position-vertical:absolute;mso-position-vertical-relative:page" from="353.6pt,88.5pt" to="509.5pt,88.5pt" o:allowincell="f"><v:shadow color="black" opacity="24903f" origin=",.5" offset="0,.55556mm"/><w10:wrap anchorx="page" anchory="page"/></v:line></w:pict></mc:Fallback></mc:AlternateContent>`;

export const HD05_SHAPE_LINE_TITLE_XML = `<mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251658752" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1" wp14:anchorId="6E09589C" wp14:editId="4A2BB494"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>4573476</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>966470</wp:posOffset></wp:positionV><wp:extent cx="2628900" cy="0"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="1922038351" name="Straight Connector 1"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvCnPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2628900" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:ln><a:effectLst/><a:extLst><a:ext uri="{AF507438-7753-43E0-B8FC-AC1667EBCBE1}"><a14:hiddenEffects xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a14:hiddenEffects></a:ext></a:extLst></wps:spPr><wps:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></wps:style><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:line w14:anchorId="0321C8D0" id="Straight Connector 1" o:spid="_x0000_s1026" style="position:absolute;z-index:251658752;visibility:visible;mso-wrap-style:square;mso-wrap-distance-left:9pt;mso-wrap-distance-top:0;mso-wrap-distance-right:9pt;mso-wrap-distance-bottom:0;mso-position-horizontal:absolute;mso-position-horizontal-relative:page;mso-position-vertical:absolute;mso-position-vertical-relative:page" from="360.1pt,76.1pt" to="567.1pt,76.1pt" o:allowincell="f"><v:shadow color="black" opacity="24903f" origin=",.5" offset="0,.55556mm"/><w10:wrap anchorx="page" anchory="page"/></v:line></w:pict></mc:Fallback></mc:AlternateContent>`;

/**
 * Hậu xử lý OOXML buffer/Uint8Array để thay thế các placeholder Shape Line thành DrawingML & VML nguyên bản.
 * Hoạt động độc lập không phụ thuộc nodebuffer, tương thích 100% trên cả Trình duyệt và Node.js.
 */
export async function postProcessDocxShapes(buffer: Uint8Array | ArrayBuffer | Blob | Buffer): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    if (buffer instanceof Uint8Array) return buffer;
    if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
    const arrayBuf = await (buffer as Blob).arrayBuffer();
    return new Uint8Array(arrayBuf);
  }

  let xml = await docXmlFile.async("string");
  let modified = false;

  if (xml.includes("[[ND30_SHAPE_LINE_1]]")) {
    xml = xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?\[\[ND30_SHAPE_LINE_1\]\](?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, () => `<w:r>${ND30_SHAPE_LINE_1_XML}</w:r>`);
    modified = true;
  }
  if (xml.includes("[[ND30_SHAPE_LINE_2]]")) {
    xml = xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?\[\[ND30_SHAPE_LINE_2\]\](?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, () => `<w:r>${ND30_SHAPE_LINE_2_XML}</w:r>`);
    modified = true;
  }
  if (xml.includes("[[HD05_SHAPE_LINE_TITLE]]")) {
    xml = xml.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?\[\[HD05_SHAPE_LINE_TITLE\]\](?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, () => `<w:r><w:rPr><w:rFonts w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:b/><w:noProof/><w:sz w:val="30"/></w:rPr>${HD05_SHAPE_LINE_TITLE_XML}</w:r>`);
    modified = true;
  }

  if (modified) {
    zip.file("word/document.xml", xml);
  }

  // Luôn tạo output dạng uint8array nén DEFLATE level 6 chuẩn OOXML/OPC (tương thích cả Browser và Node.js)
  return await zip.generateAsync({
    type: "uint8array",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6,
    },
  });
}


/**
 * Danh sách các thẻ nguy hiểm tuyệt đối không được render vào văn bản Word
 */
export const DANGEROUS_HTML_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "applet", "noscript", "svg", "link", "meta"
]);

/**
 * Làm sạch mã HTML trước khi chuyển đổi sang các phần tử Word (.docx),
 * loại bỏ hoàn toàn các thẻ thực thi mã (script, iframe, style, object, embed, v.v.)
 * và các thuộc tính sự kiện nguy hiểm (onerror, onload, onclick, v.v.).
 */
export function sanitizeHtmlForDocx(rawHtml?: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return "";

  // 1. Loại bỏ các khối thẻ nguy hiểm và toàn bộ nội dung bên trong chúng
  let clean = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

  // 2. Loại bỏ các thẻ đơn nguy hiểm nếu còn sót
  clean = clean
    .replace(/<\/?(script|iframe|style|object|embed|applet|noscript|svg|form|input|button|textarea|select|option)\b[^>]*>/gi, "");

  // 3. Loại bỏ thuộc tính sự kiện và javascript: URI
  clean = clean
    .replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']?\s*javascript:[^"'>]*["']?/gi, 'href="#"');

  return clean.trim();
}

/**
 * Dựng Table docx chuẩn từ TableModel, bảo toàn chính xác:
 * - w:tblHeader (lặp header trên trang mới nếu isHeader)
 * - w:cantSplit theo từng hàng (chỉ bật khi nguồn bật, không ép đại trà)
 * - w:vMerge (VerticalMergeType.RESTART và VerticalMergeType.CONTINUE)
 * - w:gridSpan (columnSpan)
 * - w:gridCol (columnWidths theo twips từ nguồn)
 */
class TableCaptionXml extends XmlComponent {
  constructor(val: string) {
    super("w:tblCaption");
    this.root.push(new Attributes({ val }));
  }
}

/**
 * Tách một chuỗi có ngắt dòng "\n" thành các đoạn run, đoạn sau ngắt dòng
 * được gắn `break: 1` để bộ xuất ghi `<w:br/>` (giữ nguyên cấu trúc dòng khi
 * tái nhập). Không tách nếu chuỗi không có ngắt dòng.
 */
function splitTextWithBreaks(
  text: string,
  startWithBreak = false
): Array<{ text: string; break?: number }> {
  if (!text) return [{ text: "" }];
  if (!text.includes("\n")) return [{ text, ...(startWithBreak ? { break: 1 } : {}) }];
  const parts = text.split("\n");
  return parts.map((part, index) => ({
    text: part,
    ...(index > 0 || startWithBreak ? { break: 1 } : {}),
  }));
}

/**
 * Tách nội dung ô (nhiều đoạn được nối bằng "\n" khi trích xuất) thành từng
 * đoạn để bộ xuất tạo đúng số Paragraph — nhờ vậy nội dung ô tái nhập khớp
 * với nguồn và cổng fidelity không báo content_mismatch.
 */
function splitCellTextIntoParagraphs(text: string): string[] {
  if (!text) return [""];
  const lines = text.split("\n");
  return lines.length > 0 ? lines : [text];
}

export function buildDocxTableFromModel(model: TableModel, headerProfile?: string): Table {
  const useCompanyTableFormat = headerProfile === COMPANY_ND30_BODY_PROFILE.id;
  const tableFontHalfPoints = useCompanyTableFormat
    ? COMPANY_ND30_BODY_PROFILE.table.fontSizePt * 2
    : undefined;
  const mapBorder = (b?: { style?: string; size?: number; color?: string }) => {
    if (!b || b.style === "none") return { style: BorderStyle.NONE, size: 0, color: "auto" };
    let style: any = BorderStyle.SINGLE;
    if (b.style === "double") style = BorderStyle.DOUBLE;
    else if (b.style === "dotted") style = BorderStyle.DOTTED;
    else if (b.style === "dashed") style = BorderStyle.DASHED;
    return {
      style,
      size: typeof b.size === "number" ? b.size : 4,
      color: b.color || "000000",
    };
  };

  const tableRows = model.rows.map((row, rowIndex) => {
    const isHeaderRow = Boolean(row.isHeader || (useCompanyTableFormat && rowIndex === COMPANY_ND30_BODY_PROFILE.table.headerRowIndex));
    return new TableRow({
      cantSplit: row.cantSplit ? true : undefined,
      tableHeader: isHeaderRow ? true : undefined,
      height: row.heightTwips ? { value: row.heightTwips, rule: HeightRule.ATLEAST } : undefined,
      children: row.cells.map((cell) => {
        let colWidth = model.gridColumnsTwips[cell.gridColumn] || 2000;
        if (cell.gridSpan > 1 && model.gridColumnsTwips.length > 0) {
          const spanTwips = model.gridColumnsTwips
            .slice(cell.gridColumn, cell.gridColumn + cell.gridSpan)
            .reduce((a, b) => a + b, 0);
          if (spanTwips > 0) colWidth = spanTwips;
        }

        let verticalMerge: (typeof VerticalMergeType)[keyof typeof VerticalMergeType] | undefined = undefined;
        if (cell.vMerge === "restart") {
          verticalMerge = VerticalMergeType.RESTART;
        } else if (cell.vMerge === "continue") {
          verticalMerge = VerticalMergeType.CONTINUE;
        }

        // S2/S5 (Chặng 5): nội dung ô có thể chứa nhiều đoạn (được nối bằng
        // "\n" khi trích xuất) hoặc có ngắt dòng `<w:br/>` bên trong một đoạn.
        // Nếu ghi thẳng chuỗi có "\n" vào một TextRun thì Word **bỏ mất** các
        // khoảng trắng/nội dung tại ngắt dòng (ví dụ "BẢO ĐẢM AN TOÀN" →
        // "BẢO ĐẢMAN TOÀN"), và cổng fidelity fail-closed từ chối xuất.
        // Vì vậy: ngắt dòng trong một đoạn → `<w:br/>`; ranh giới đoạn trong
        // ô → mỗi đoạn một Paragraph.
        const paragraphs: Paragraph[] = (cell.paragraphs && cell.paragraphs.length > 0)
          ? cell.paragraphs.map(p => {
              const runs = (p.runs && p.runs.length > 0)
                ? p.runs.flatMap((r, runIndex) => splitTextWithBreaks(r.text, runIndex > 0).map(part => new TextRun({
                    text: part.text,
                    break: part.break,
                    font: useCompanyTableFormat ? COMPANY_ND30_BODY_PROFILE.table.fontFace : (r.font || "Times New Roman"),
                    size: tableFontHalfPoints ?? r.sizeHalfPt ?? 24,
                    // A repeat-header marker controls pagination, not visual emphasis.
                    // Preserve imported run formatting unless the explicit company preset owns it.
                    bold: useCompanyTableFormat && isHeaderRow ? true : r.bold,
                    italics: r.italic,
                    underline: r.underline ? {} : undefined,
                    color: r.color,
                  })))
                : splitTextWithBreaks(p.text || "").map(part => new TextRun({
                    text: part.text,
                    break: part.break,
                    font: COMPANY_ND30_BODY_PROFILE.table.fontFace,
                    size: tableFontHalfPoints ?? 24,
                    bold: useCompanyTableFormat && isHeaderRow,
                  }));

              return new Paragraph({
                alignment: useCompanyTableFormat && rowIndex === COMPANY_ND30_BODY_PROFILE.table.headerRowIndex
                  ? AlignmentType.CENTER
                  : p.alignment === "center"
                  ? AlignmentType.CENTER 
                  : (p.alignment === "right" 
                    ? AlignmentType.RIGHT 
                    : (p.alignment === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT)),
                spacing: { line: 240, before: 20, after: 20 },
                children: runs,
              });
            })
          : splitCellTextIntoParagraphs(cell.text || "").map((line, lineIndex) =>
              new Paragraph({
                alignment: isHeaderRow ? AlignmentType.CENTER : AlignmentType.LEFT,
                spacing: { line: 240, before: 20, after: 20 },
                children: [
                  new TextRun({
                    text: line,
                    font: useCompanyTableFormat ? COMPANY_ND30_BODY_PROFILE.table.fontFace : "Times New Roman",
                    size: tableFontHalfPoints ?? 24,
                    bold: useCompanyTableFormat && isHeaderRow,
                  })
                ],
              })
            );

        // Margins / padding
        const cellMargins = cell.margins ? {
          top: cell.margins.top ?? 120,
          bottom: cell.margins.bottom ?? 120,
          left: cell.margins.left ?? 160,
          right: cell.margins.right ?? 160,
        } : undefined;

        // Borders
        let cellBorders: any = undefined;
        if (cell.borders) {
          cellBorders = {
            top: mapBorder(cell.borders.top),
            bottom: mapBorder(cell.borders.bottom),
            left: mapBorder(cell.borders.left),
            right: mapBorder(cell.borders.right),
          };
        } else if (!model.hasBorders && !model.borders) {
          cellBorders = INVISIBLE_CELL_BORDER;
        }

        return new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          columnSpan: cell.gridSpan > 1 ? cell.gridSpan : undefined,
          verticalMerge,
          margins: cellMargins,
          borders: cellBorders,
          children: paragraphs,
        });
      })
    });
  });

  const mapTableBorders = (b?: Record<string, { style?: string; size?: number; color?: string }>) => {
    if (!b) return undefined;
    return {
      top: mapBorder(b.top),
      bottom: mapBorder(b.bottom),
      left: mapBorder(b.left),
      right: mapBorder(b.right),
      insideHorizontal: mapBorder(b.insideH),
      insideVertical: mapBorder(b.insideV),
    };
  };

  const docxTable = new Table({
    width: { size: model.tableWidthTwips || 9355, type: WidthType.DXA },
    columnWidths: model.gridColumnsTwips.length > 0 ? model.gridColumnsTwips : undefined,
    borders: model.borders ? mapTableBorders(model.borders) : (model.hasBorders ? undefined : {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    }),
    margins: model.margins ? {
      top: model.margins.top,
      bottom: model.margins.bottom,
      left: model.margins.left,
      right: model.margins.right,
    } : undefined,
    rows: tableRows,
  });

  if (model.tableId && (docxTable as any).root?.[0]?.root) {
    (docxTable as any).root[0].root.push(new TableCaptionXml(model.tableId));
  }

  return docxTable;
}

/**
 * Chuẩn hóa chuỗi văn bản trích xuất từ HTML/XML và chuyển thành TextRun / Tab:
 * 1. Chuyển đổi các chuỗi 4-nbsp hoặc 4 dấu cách không ngắt (&nbsp;&nbsp;&nbsp;&nbsp;, \u00a0\u00a0\u00a0\u00a0) thành ký tự Tab (\t)
 * 2. Giải mã toàn bộ HTML entities (&nbsp;, &amp;, &lt;, &gt;, &quot;, &#160;...)
 * 3. Chuyển đổi mọi ký tự &nbsp; hoặc \u00a0 còn lại thành dấu cách thường ' '
 * 4. Tách theo \t để chèn đối tượng Tab chuẩn Word OOXML (<w:tab/>)
 */
export function createRunsAndTabsFromText(
  rawText: string,
  fontSizeHalfPoints: number,
  format: { bold?: boolean; italics?: boolean; underline?: boolean } = {}
): (TextRun | Tab)[] {
  if (!rawText) return [];

  // Bước 1: Chuẩn hóa 4 &nbsp; liên tiếp hoặc 4 non-breaking spaces thành \t (nguyên bản là <w:tab/> từ nguồn)
  let cleaned = rawText
    .replace(/&nbsp;&nbsp;&nbsp;&nbsp;/gi, "\t")
    .replace(/\u00a0\u00a0\u00a0\u00a0/g, "\t");

  // Bước 2: Giải mã HTML entities (xử lý cả trường hợp double-escaped &amp;nbsp;)
  cleaned = decodeHtmlEntities(cleaned);
  cleaned = decodeHtmlEntities(cleaned);

  // Sau khi decode, nếu có 4 non-breaking spaces hoặc 4 dấu cách xuất phát từ &nbsp;&nbsp;&nbsp;&nbsp;
  cleaned = cleaned
    .replace(/&nbsp;&nbsp;&nbsp;&nbsp;/gi, "\t")
    .replace(/\u00a0\u00a0\u00a0\u00a0/g, "\t")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ");

  // Bước 3: Tách chuỗi theo \t để tạo các TextRun xen kẽ đối tượng Tab (<w:tab/>)
  // Chặng 5 / P1: ngắt dòng "\n" phải được xuất thành <w:br/> — nếu đưa thẳng
  // vào <w:t> thì Word sẽ bỏ mất khoảng trắng ở ngắt dòng ("BẢO ĐẢM" +
  // "AN TOÀN" → "BẢO ĐẢMAN TOÀN") và cổng fidelity sẽ từ chối xuất.
  const result: (TextRun | Tab)[] = [];
  const parts = cleaned.split("\t");

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      result.push(new TextRun({ children: [new Tab()] }));
    }
    const lines = parts[i].split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      if (lineIndex > 0) {
        result.push(
          new TextRun({
            text: "",
            break: 1,
            font: "Times New Roman",
            size: fontSizeHalfPoints,
            bold: format.bold,
            italics: format.italics,
            underline: format.underline ? {} : undefined,
          })
        );
      }
      if (lines[lineIndex]) {
        result.push(
          new TextRun({
            text: lines[lineIndex],
            font: "Times New Roman",
            size: fontSizeHalfPoints,
            bold: format.bold,
            italics: format.italics,
            underline: format.underline ? {} : undefined,
          })
        );
      }
    }
  }

  return result;
}

/**
 * Chuyển đổi mã HTML từ Tiptap Editor thành danh sách Paragraph & Table trong DOCX
 */
export function convertHtmlToDocxElements(
  html: string,
  regime: "administrative" | "party" = "administrative",
  bodyInsetMm = 0,
  importedTables?: Record<string, TableModel>,
  headerProfile?: string,
  scope: TableFormatScope = "body"
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const profile = getStyleProfile(regime, headerProfile);
  const useCompanyBodyFormat = regime === "administrative" && headerProfile === COMPANY_ND30_BODY_PROFILE.id;
  const defaultHalfPoints = profile.bodyFontSize * 2;
  const companyBodyLineTwips = COMPANY_ND30_BODY_PROFILE.body.lineSpacingPt * 20;
  const companyBodyFirstLineTwips = COMPANY_ND30_BODY_PROFILE.body.firstLineIndentIn * 1440;
  const companyBodyAfterTwips = COMPANY_ND30_BODY_PROFILE.body.paragraphAfterPt * 20;
  const bodyInsetTwips = convertMillimetersToTwip(bodyInsetMm);
  const semanticSpacing = (value?: SemanticLineSpacing): { line: number; lineRule?: typeof LineRuleType[keyof typeof LineRuleType] } | undefined => value === "18pt" ? { line: 360, lineRule: LineRuleType.EXACT }
    : value === "19pt" ? { line: 380, lineRule: LineRuleType.EXACT }
      : value === "1.15" ? { line: 276 } : undefined;
  const semanticIndent = (value?: SemanticFirstLineIndent) => value === "1cm" ? 567
    : value === "1.27cm" ? 720 : value === "0.5in" ? 720 : undefined;

  // Luôn làm sạch HTML trước khi parse để triệt tiêu mọi mã độc hoặc payload XSS
  const safeHtml = sanitizeHtmlForDocx(html);
  if (!safeHtml) return elements;

  // Sử dụng DOMParser nếu chạy trong môi trường trình duyệt
  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${safeHtml}</div>`, "text/html");
    const container = doc.body.firstElementChild || doc.body;

    Array.from(container.children).forEach((child) => {
      const tagName = child.tagName.toLowerCase();
      // Bỏ qua tuyệt đối các thẻ nguy hiểm
      if (DANGEROUS_HTML_TAGS.has(tagName)) return;

      const styleAttr = child.getAttribute("style") || "";
      const semanticFormatting = readSemanticParagraphFormatting(child.outerHTML);
      const textContent = child.textContent?.trim() || "";
      if (!textContent && tagName !== "table") return;

      const isCentered = styleAttr.includes("center") || /^(QUYẾT ĐỊNH:|NGHỊ QUYẾT:|BAN HÀNH:)/i.test(textContent);
      const isRight = styleAttr.includes("right");

      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.JUSTIFIED;
      if (isCentered) alignment = AlignmentType.CENTER;
      else if (isRight) alignment = AlignmentType.RIGHT;

      // Xử lý bảng biểu HTML nếu có
      if (tagName === "table") {
        const sourceTableId = child.getAttribute("data-source-table-id");
        if (sourceTableId && importedTables && importedTables[sourceTableId]) {
          const { effectiveModel } = syncTableModelFromHtml(child, importedTables[sourceTableId]);
          elements.push(buildDocxTableFromModel(effectiveModel, headerProfile));
          return;
        }

        const tableDecision = classifyTableMarkup(child.outerHTML, scope, regime);
        const applyContentPreset = tableDecision.canAutoFormat;

        const trElements = Array.from(child.querySelectorAll("tr"));
        if (trElements.length > 0) {
          const borderAttr = child.getAttribute("border")?.trim();
          const isHiddenTable = styleAttr.includes("border: none") || child.classList.contains("border-none") || child.getAttribute("data-borders") === "false";
          const hasExplicitBorder = Boolean(borderAttr && !/^(?:0|none|false)$/i.test(borderAttr)) || /\bborder\s*:/i.test(styleAttr) ||
            child.querySelector("td[style*='border'],th[style*='border']") !== null;
          const useGridBorders = applyContentPreset || hasExplicitBorder ||
            (tableDecision.isContentTable && tableDecision.requiresManualReview);
          const tableBorders = isHiddenTable || !useGridBorders
            ? {
                top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
              }
            : {
                top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              };

          const totalTableWidthTwips = bodyInsetMm 
            ? convertMillimetersToTwip(COMPANY_HEADER_GEOMETRY_MM.bodyWidth) 
            : convertMillimetersToTwip(165); // 9355 dxa = 165mm

          // Trích xuất tiêu đề các cột từ hàng đầu tiên
          const firstRowCells = Array.from(trElements[0].children).filter(
            c => c.tagName.toLowerCase() === "td" || c.tagName.toLowerCase() === "th"
          );
          const useSemanticColumns = applyContentPreset && tableDecision.hasHeaderRow;
          const headerTexts = useSemanticColumns
            ? tableDecision.headers
            : firstRowCells.map(c => c.textContent?.trim() || "");
          const tableRowsText = trElements.map(row => Array.from(row.children)
            .filter(cell => cell.tagName.toLowerCase() === "td" || cell.tagName.toLowerCase() === "th")
            .map(cell => cell.textContent?.trim() || ""));
          const colWidths = applyContentPreset
            ? useSemanticColumns
              ? calculateTableColumnWidthsTwip(headerTexts, totalTableWidthTwips)
              : calculateUnheadedColumnWidthsTwip(tableRowsText, totalTableWidthTwips)
            : calculateTableColumnWidthsTwip(headerTexts, totalTableWidthTwips);
          const hasOrdinalFirstColumn = tableRowsText.length > 1 && tableRowsText.every(row => /^\s*\d{1,4}[.)]?\s*$/.test(row[0] || ""));
          const colTypes = applyContentPreset && !useSemanticColumns
            ? []
            : headerTexts.map(h => detectColumnSemanticType(h));

          const docxRows = trElements.map((tr, index) => {
            const cellElements = Array.from(tr.children).filter(
              c => c.tagName.toLowerCase() === "td" || c.tagName.toLowerCase() === "th"
            );
            const isHeaderRow = applyContentPreset && index === 0 && tableDecision.hasHeaderRow;

            return new TableRow({
              cantSplit: applyContentPreset ? true : undefined,
              tableHeader: isHeaderRow,
              children: cellElements.map((cell, colIdx) => {
                const isSemanticHeader = cell.tagName.toLowerCase() === "th" || isHeaderRow;
                const isHeader = applyContentPreset && isSemanticHeader;
                const colWidth = colWidths[colIdx] || Math.round(totalTableWidthTwips / (cellElements.length || 1));
                const colType = applyContentPreset
                  ? useSemanticColumns ? (colTypes[colIdx] || "general") : hasOrdinalFirstColumn && colIdx === 0 ? "stt" : "general"
                  : (colTypes[colIdx] || "general");
                const inlineCellAlignment = (cell.getAttribute("style") || "").match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1]?.toLowerCase();
                const cellAlignment = applyContentPreset
                  ? getColumnDocxAlignment(colType, isHeader)
                  : inlineCellAlignment === "center" ? AlignmentType.CENTER
                    : inlineCellAlignment === "right" ? AlignmentType.RIGHT
                      : inlineCellAlignment === "justify" ? AlignmentType.JUSTIFIED
                        : getColumnDocxAlignment(colType, isSemanticHeader);
                const tableFontHalfPoints = applyContentPreset ? 26 : (profile.bodyFontSize - 1) * 2;

                // Hỗ trợ colspan và rowspan từ HTML
                const colSpanAttr = cell.getAttribute("colspan");
                const rowSpanAttr = cell.getAttribute("rowspan");
                const colSpanNum = colSpanAttr ? parseInt(colSpanAttr, 10) : undefined;
                const rowSpanNum = rowSpanAttr ? parseInt(rowSpanAttr, 10) : undefined;

                // Kiểm tra xem ô có nhiều đoạn văn (<p>, <div>) hay không
                // Tránh tình trạng gộp toàn bộ text của nhiều đoạn vào 1 Paragraph duy nhất làm mất ngắt dòng
                const childParagraphEls = Array.from(cell.children).filter(
                  c => c.tagName.toLowerCase() === "p" || c.tagName.toLowerCase() === "div"
                );

                let cellParagraphs: Paragraph[] = [];
                if (childParagraphEls.length > 0) {
                  cellParagraphs = childParagraphEls.map((pEl, pIdx) => {
                    const pRuns = parseInlineNodes(pEl, tableFontHalfPoints, { forceBold: cell.tagName.toLowerCase() === "th" || isHeaderRow });
                    return new Paragraph({
                      alignment: cellAlignment,
                      spacing: {
                        line: 240,
                        before: pIdx === 0 ? 30 : 20,
                        after: pIdx === childParagraphEls.length - 1 ? 30 : 20,
                      },
                      children: pRuns.length > 0 ? pRuns : createRunsAndTabsFromText(
                        pEl.textContent?.trim() || "",
                        tableFontHalfPoints,
                        { bold: cell.tagName.toLowerCase() === "th" || isHeaderRow }
                      ),
                    });
                  });
                } else {
                  const cellRuns = parseInlineNodes(cell, tableFontHalfPoints, { forceBold: cell.tagName.toLowerCase() === "th" || isHeaderRow });
                  cellParagraphs = [
                    new Paragraph({
                      alignment: cellAlignment,
                      spacing: { line: 240, before: 40, after: 40 },
                      children: cellRuns.length > 0 ? cellRuns : createRunsAndTabsFromText(
                        cell.textContent?.trim() || "",
                        tableFontHalfPoints,
                        { bold: cell.tagName.toLowerCase() === "th" || isHeaderRow }
                      ),
                    }),
                  ];
                }

                return new TableCell({
                  width: { size: colWidth, type: WidthType.DXA },
                  columnSpan: colSpanNum && colSpanNum > 1 ? colSpanNum : undefined,
                  rowSpan: rowSpanNum && rowSpanNum > 1 ? rowSpanNum : undefined,
                  borders: isHiddenTable ? INVISIBLE_CELL_BORDER : undefined,
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  children: cellParagraphs,
                });
              }),
            });
          });

          elements.push(
            new Table({
              width: { size: totalTableWidthTwips, type: WidthType.DXA },
              columnWidths: colWidths,
              borders: tableBorders,
              rows: docxRows,
            })
          );
          return;
        }
      }

      // Xử lý thẻ đường kẻ ngang <hr> thành Paragraph Border chuẩn Word OOXML nét liền
      if (tagName === "hr") {
        elements.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: {
              bottom: {
                color: "000000",
                style: BorderStyle.SINGLE,
                size: 6, // 0.75 pt nét liền
                space: 1,
              },
            },
            indent: { left: 1800, right: 1800 },
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({ text: " ", size: 4, font: "Times New Roman" }),
            ],
          })
        );
        return;
      }

      // Xử lý các thẻ tiêu đề (H1, H2, H3) theo profile
      if (tagName === "h1") {
        elements.push(
          new Paragraph({
            alignment: useCompanyBodyFormat ? AlignmentType.JUSTIFIED : AlignmentType.CENTER,
            indent: useCompanyBodyFormat
              ? { ...(bodyInsetMm ? { left: bodyInsetTwips, right: bodyInsetTwips } : {}), firstLine: companyBodyFirstLineTwips }
              : undefined,
            keepNext: true,
            spacing: useCompanyBodyFormat
              ? { before: 180, after: companyBodyAfterTwips, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
              : { before: 180, after: 80, line: 276 },
            children: [
              new TextRun({
                text: textContent.toUpperCase(),
                bold: true,
                size: profile.heading1FontSize * 2,
                font: "Times New Roman",
              }),
            ],
          })
        );
        return;
      }

      if (tagName === "h2") {
        elements.push(
          new Paragraph({
            alignment: useCompanyBodyFormat ? AlignmentType.JUSTIFIED : AlignmentType.CENTER,
            indent: useCompanyBodyFormat
              ? { ...(bodyInsetMm ? { left: bodyInsetTwips, right: bodyInsetTwips } : {}), firstLine: companyBodyFirstLineTwips }
              : undefined,
            keepNext: true,
            spacing: useCompanyBodyFormat
              ? { before: 140, after: companyBodyAfterTwips, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
              : { before: 140, after: 60, line: 276 },
            children: [
              new TextRun({
                text: textContent.toUpperCase(),
                bold: true,
                size: profile.heading2FontSize * 2,
                font: "Times New Roman",
              }),
            ],
          })
        );
        return;
      }

      if (tagName === "h3") {
        elements.push(
          new Paragraph({
            alignment: useCompanyBodyFormat ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
            indent: bodyInsetMm
              ? { left: bodyInsetTwips, right: bodyInsetTwips, firstLine: useCompanyBodyFormat ? companyBodyFirstLineTwips : 720 }
              : { firstLine: useCompanyBodyFormat ? companyBodyFirstLineTwips : 720 },
            keepNext: true,
            spacing: useCompanyBodyFormat
              ? { before: 100, after: companyBodyAfterTwips, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
              : { before: 100, after: 60, line: 276 },
            children: [
              new TextRun({
                text: textContent,
                bold: true,
                size: profile.heading3FontSize * 2,
                font: "Times New Roman",
              }),
            ],
          })
        );
        return;
      }

      // Xử lý danh sách (ul/ol)
      if (tagName === "ul" || tagName === "ol") {
        Array.from(child.children).forEach((li) => {
          const inlineRuns = parseInlineNodes(li, defaultHalfPoints);

          elements.push(
            new Paragraph({
              bullet: tagName === "ul" ? { level: 0 } : undefined,
              numbering: tagName === "ol" ? { reference: "nd30-numbered-list", level: 0 } : undefined,
              indent: { left: 720 },
              alignment: useCompanyBodyFormat ? AlignmentType.JUSTIFIED : undefined,
              spacing: useCompanyBodyFormat
                ? { before: 0, after: companyBodyAfterTwips, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
                : { before: 40, after: 40, line: 276 },
              children: inlineRuns.length > 0 ? inlineRuns : createRunsAndTabsFromText(
                li.textContent?.trim() || "",
                defaultHalfPoints
              ),
            })
          );
        });
        return;
      }

      // Xử lý đoạn văn thông thường (<p>, <div>)
      const trimmedText = textContent.trim();
      const isDividerOnly = trimmedText.length >= 3 && /^[-—–_.\s]+$/.test(trimmedText);
      if (isDividerOnly && regime !== "party") {
        elements.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: {
              bottom: {
                color: "000000",
                style: BorderStyle.SINGLE,
                size: 6, // 0.75 pt nét liền
                space: 1,
              },
            },
            indent: { left: 1800, right: 1800 },
            spacing: { before: 60, after: 80 },
            children: [
              new TextRun({ text: " ", size: 4, font: "Times New Roman" }),
            ],
          })
        );
        return;
      }

      const runs = parseInlineNodes(child, defaultHalfPoints);
      const isArticleHeader = /^(Điều\s+\d+|Khoản\s+\d+|Điểm\s+[a-zđ]|Phần\s+[I|V|X]+|Mục\s+[I|V|X\d]+|Chương\s+[I|V|X\d]+)/i.test(textContent);
      const isTableTitle = /^(Bảng\s+\d+|Bảng\s+phân\s+công|Bảng\s+tổng\s+hợp|Bảng\s+tiến\s+độ|Danh\s+mục)/i.test(textContent);
      const isLegalBasis = /^Căn\s+cứ\s+/i.test(textContent) || /^Theo\s+đề\s+nghị\s+của\s+/i.test(textContent);

      // Thụt đầu dòng chuẩn NĐ 30: 1.0cm - 1.27cm (567 - 720 dxa)
      const firstLineIndentTwips = 720;
      
      let pAlignment: (typeof AlignmentType)[keyof typeof AlignmentType] = isDividerOnly ? AlignmentType.CENTER : alignment;
      let pBefore = 0;
      let pAfter = 120; // Tối thiểu 6pt theo ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN và HD05.BODY.11
      let pKeepNext = isDividerOnly;
      let pIndent: any = (isCentered || isRight || isDividerOnly) ? undefined : { firstLine: firstLineIndentTwips };

      if (isArticleHeader) {
        pAlignment = AlignmentType.JUSTIFIED;
        pBefore = 120;
        pAfter = 60;
        pKeepNext = true;
        pIndent = { firstLine: firstLineIndentTwips };
      } else if (isTableTitle) {
        pAlignment = isCentered ? AlignmentType.CENTER : AlignmentType.LEFT;
        pBefore = 120;
        pAfter = 60;
        pKeepNext = true;
        pIndent = undefined;
      } else if (isLegalBasis) {
        pAlignment = AlignmentType.JUSTIFIED;
        pBefore = 0;
        pAfter = 80;
        pIndent = { firstLine: firstLineIndentTwips };
      }

      if (useCompanyBodyFormat && !isDividerOnly) {
        pAlignment = AlignmentType.JUSTIFIED;
        pAfter = companyBodyAfterTwips;
        pIndent = { firstLine: companyBodyFirstLineTwips };
      }

      if (bodyInsetMm) {
        pIndent = {
          left: bodyInsetTwips,
          right: bodyInsetTwips,
          ...(pIndent?.firstLine ? { firstLine: pIndent.firstLine } : {})
        };
      }
      const ruleIndent = semanticIndent(semanticFormatting.firstLineIndent);
      if (ruleIndent !== undefined) pIndent = { ...(pIndent ?? {}), firstLine: ruleIndent };
      const ruleSpacing = semanticSpacing(semanticFormatting.lineSpacing);

      elements.push(
        new Paragraph({
          alignment: pAlignment,
          indent: pIndent,
          keepNext: pKeepNext,
          spacing: ruleSpacing ?? (useCompanyBodyFormat && !isDividerOnly
            ? { before: pBefore, after: pAfter, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
            : regime === "party"
              ? { before: pBefore, after: pAfter, line: 360, lineRule: LineRuleType.EXACT }
              : { before: pBefore, after: pAfter, line: 276 }),
          children: runs.length > 0 ? runs : createRunsAndTabsFromText(
            textContent,
            defaultHalfPoints,
            {
              bold: isArticleHeader || isTableTitle,
              italics: isLegalBasis,
            }
          ),
        })
      );
    });

    return elements;
  }

  // Fallback: Parser cho môi trường Node.js / Server-side hỗ trợ cả đoạn văn, danh sách và bảng biểu HTML
  const blockRegex = /<table[\s\S]*?<\/table>|<ol[\s\S]*?<\/ol>|<ul[\s\S]*?<\/ul>|<(?:p|div|h[1-3]|li)[\s\S]*?<\/(?:p|div|h[1-3]|li)>|[^<]+/gi;
  const blocks = safeHtml.match(blockRegex) || [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (/^<(?:\/)?(?:script|style|iframe|object|embed|applet|noscript|svg)\b/i.test(trimmed)) continue;

    // 1. Xử lý Bảng
    if (trimmed.toLowerCase().startsWith("<table")) {
      const sourceTableIdMatch = trimmed.match(/data-source-table-id=["']([^"']+)["']/i);
      const sourceTableId = sourceTableIdMatch ? sourceTableIdMatch[1] : undefined;
      if (sourceTableId && importedTables && importedTables[sourceTableId]) {
        const { effectiveModel } = syncTableModelFromHtml(trimmed, importedTables[sourceTableId]);
        elements.push(buildDocxTableFromModel(effectiveModel, headerProfile));
        continue;
      }

      const tableDecision = classifyTableMarkup(trimmed, scope, regime);
      const applyContentPreset = tableDecision.canAutoFormat;
      const tableAttrs = trimmed.match(/^<table\b([^>]*)>/i)?.[1] || "";
      const tableStyle = tableAttrs.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "";
      const isHiddenTable = /border\s*:\s*none/i.test(tableStyle) || /\bborder-none\b/i.test(tableAttrs) || /data-borders=["']false["']/i.test(tableAttrs);
      const borderAttr = tableAttrs.match(/\bborder\s*=\s*(["']?)([^"'\s>]+)\1/i)?.[2];
      const hasExplicitBorder = /\bborder\s*:/i.test(tableStyle) || Boolean(borderAttr && !/^(?:0|none|false)$/i.test(borderAttr)) || /\bstyle\s*=["'][^"']*border\s*:/i.test(trimmed);
      const useGridBorders = !isHiddenTable && (
        applyContentPreset || hasExplicitBorder || (tableDecision.isContentTable && tableDecision.requiresManualReview)
      );
      const tableBorders = useGridBorders ? {
        top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
      } : {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
      };

      const rowMatches = trimmed.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      if (rowMatches.length > 0) {
        const totalTableWidthTwips = bodyInsetMm
          ? convertMillimetersToTwip(COMPANY_HEADER_GEOMETRY_MM.bodyWidth)
          : convertMillimetersToTwip(165);

        // Dùng header ngữ nghĩa nếu bảng nội dung có header; bảng khác giữ cách căn theo markup.
        const firstRowCells = rowMatches[0]?.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
        const useSemanticColumns = applyContentPreset && tableDecision.hasHeaderRow;
        const headerTexts = useSemanticColumns
          ? tableDecision.headers
          : firstRowCells.map(c => extractHtmlTextWithBreaks(c));
        const tableRowsText = rowMatches.map(row => (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(extractHtmlTextWithBreaks));
        const colWidths = applyContentPreset
          ? useSemanticColumns
            ? calculateTableColumnWidthsTwip(headerTexts, totalTableWidthTwips)
            : calculateUnheadedColumnWidthsTwip(tableRowsText, totalTableWidthTwips)
          : calculateTableColumnWidthsTwip(headerTexts, totalTableWidthTwips);
        const hasOrdinalFirstColumn = tableRowsText.length > 1 && tableRowsText.every(row => /^\s*\d{1,4}[.)]?\s*$/.test(row[0] || ""));
        const colTypes = applyContentPreset && !useSemanticColumns
          ? []
          : headerTexts.map(h => detectColumnSemanticType(h));

        const docxRows = rowMatches.map((trHtml, rowIndex) => {
          const cellMatches = trHtml.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || [];
          const isThRow = applyContentPreset && rowIndex === 0 && tableDecision.hasHeaderRow;

          return new TableRow({
            cantSplit: applyContentPreset ? true : undefined,
            tableHeader: isThRow,
            children: cellMatches.map((cellHtml, colIdx) => {
              const explicitTh = cellHtml.toLowerCase().startsWith("<th");
              const isTh = applyContentPreset && (explicitTh || isThRow);
              const colWidth = colWidths[colIdx] || Math.round(totalTableWidthTwips / (cellMatches.length || 1));
              const colType = useSemanticColumns
                ? (colTypes[colIdx] || "general")
                : applyContentPreset && hasOrdinalFirstColumn && colIdx === 0 ? "stt" : (colTypes[colIdx] || "general");
              const cellStyle = cellHtml.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || "";
              const inlineAlignment = cellStyle.match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1]?.toLowerCase();
              const alignment = applyContentPreset
                ? getColumnDocxAlignment(colType, isTh)
                : inlineAlignment === "center" ? AlignmentType.CENTER
                  : inlineAlignment === "right" ? AlignmentType.RIGHT
                    : inlineAlignment === "justify" ? AlignmentType.JUSTIFIED
                      : getColumnDocxAlignment(colType, explicitTh);
              const tableFontHalfPoints = applyContentPreset ? 26 : (profile.bodyFontSize - 1) * 2;

              // 1. Kiểm tra colspan & rowspan
              const colSpanMatch = cellHtml.match(/colspan=["']?(\d+)["']?/i);
              const rowSpanMatch = cellHtml.match(/rowspan=["']?(\d+)["']?/i);
              const columnSpan = colSpanMatch ? parseInt(colSpanMatch[1], 10) : undefined;
              const rowSpan = rowSpanMatch ? parseInt(rowSpanMatch[1], 10) : undefined;

              // 2. Tách các đoạn văn con (<p>...</p>) trong ô nếu có để bảo toàn ranh giới đoạn
              const pMatches = cellHtml.match(/<p[\s\S]*?<\/p>/gi) || [];
              let cellParagraphs: Paragraph[] = [];

              if (pMatches.length > 0) {
                cellParagraphs = pMatches.map((pHtml, pIdx) => {
                  const pText = extractHtmlTextWithBreaks(pHtml);
                  return new Paragraph({
                    alignment,
                    spacing: {
                      line: 240,
                      before: pIdx === 0 ? 30 : 20,
                      after: pIdx === pMatches.length - 1 ? 30 : 20,
                    },
                    children: createRunsAndTabsFromText(pText, tableFontHalfPoints, {
                      bold: explicitTh || isThRow,
                    }),
                  });
                });
              } else {
                const cellText = extractHtmlTextWithBreaks(cellHtml);
                cellParagraphs = [
                  new Paragraph({
                    alignment,
                    spacing: { line: 240, before: 40, after: 40 },
                    children: createRunsAndTabsFromText(cellText, tableFontHalfPoints, {
                      bold: explicitTh || isThRow,
                    }),
                  }),
                ];
              }

              return new TableCell({
                width: { size: colWidth, type: WidthType.DXA },
                columnSpan: columnSpan && columnSpan > 1 ? columnSpan : undefined,
                rowSpan: rowSpan && rowSpan > 1 ? rowSpan : undefined,
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                borders: useGridBorders ? {
                  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
                } : INVISIBLE_CELL_BORDER,
                children: cellParagraphs,
              });
            }),
          });
        });

        elements.push(
          new Table({
            width: { size: totalTableWidthTwips, type: WidthType.DXA },
            columnWidths: colWidths,
            borders: tableBorders,
            rows: docxRows,
          })
        );
        continue;
      }
    }

    // 2. Xử lý Danh sách (ol, ul)
    if (trimmed.toLowerCase().startsWith("<ol") || trimmed.toLowerCase().startsWith("<ul")) {
      const isOl = trimmed.toLowerCase().startsWith("<ol");
      const liMatches = trimmed.match(/<li[\s\S]*?<\/li>/gi) || [];
      liMatches.forEach((liHtml) => {
        const text = extractHtmlTextWithBreaks(liHtml);
        elements.push(
          new Paragraph({
            bullet: !isOl ? { level: 0 } : undefined,
            numbering: isOl ? { reference: "nd30-numbered-list", level: 0 } : undefined,
            indent: { left: 720 },
            spacing: regime === "party"
              ? { before: 20, after: 20, line: 360, lineRule: LineRuleType.EXACT }
              : useCompanyBodyFormat
                ? { before: 0, after: companyBodyAfterTwips, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
                : { before: 40, after: 40, line: 276 },
            alignment: useCompanyBodyFormat ? AlignmentType.JUSTIFIED : undefined,
            children: createRunsAndTabsFromText(text, defaultHalfPoints),
          })
        );
      });
      continue;
    }

    // 3. Xử lý Đoạn văn
    const text = extractHtmlTextWithBreaks(trimmed);
    if (text) {
      const semanticFormatting = readSemanticParagraphFormatting(trimmed);
      const isDividerOnly = text.length >= 3 && /^[-—–_.\s]+$/.test(text);
      const isCenteredBlock = /text-align\s*:\s*center/i.test(trimmed) || isDividerOnly;
      const isRightBlock = /text-align\s*:\s*right/i.test(trimmed);
      const isArticleHeader = /^(Điều\s+\d+|Khoản\s+\d+|Điểm\s+[a-zđ]|Phần\s+[I|V|X]+|Mục\s+[I|V|X\d]+|Chương\s+[I|V|X\d]+)/i.test(text);
      const isTableTitle = /^(Bảng\s+\d+|Bảng\s+phân\s+công|Bảng\s+tổng\s+hợp|Bảng\s+tiến\s+độ|Danh\s+mục)/i.test(text);
      const isLegalBasis = /^Căn\s+cứ\s+/i.test(text) || /^Theo\s+đề\s+nghị\s+của\s+/i.test(text);
      
      const firstLineIndentTwips = 720;
      let pBefore = 0;
      let pAfter = 120; // 6pt tối thiểu theo ND30.PL1.I.II.6E.PARAGRAPH_GAP_MIN và HD05.BODY.11
      let pKeepNext = isDividerOnly;
      let pAlignment = isCenteredBlock ? AlignmentType.CENTER : (isRightBlock ? AlignmentType.RIGHT : AlignmentType.JUSTIFIED);
      let pIndent: any = (isCenteredBlock || isRightBlock) ? undefined : { firstLine: firstLineIndentTwips };

      if (isArticleHeader) {
        pBefore = 120;
        pAfter = 60;
        pKeepNext = true;
      } else if (isTableTitle) {
        pBefore = 120;
        pAfter = 60;
        pKeepNext = true;
        pIndent = undefined;
      } else if (isLegalBasis) {
        pBefore = 0;
        pAfter = 80;
      }

      if (useCompanyBodyFormat && !isDividerOnly) {
        pAlignment = AlignmentType.JUSTIFIED;
        pAfter = companyBodyAfterTwips;
        pIndent = { firstLine: companyBodyFirstLineTwips };
      }

      if (bodyInsetMm) {
        pIndent = {
          left: bodyInsetTwips,
          right: bodyInsetTwips,
          ...(pIndent?.firstLine ? { firstLine: pIndent.firstLine } : {})
        };
      }
      const ruleIndent = semanticIndent(semanticFormatting.firstLineIndent);
      if (ruleIndent !== undefined) pIndent = { ...(pIndent ?? {}), firstLine: ruleIndent };
      const ruleSpacing = semanticSpacing(semanticFormatting.lineSpacing);

      elements.push(
        new Paragraph({
          alignment: pAlignment,
          indent: pIndent,
          keepNext: pKeepNext,
          spacing: ruleSpacing ?? (useCompanyBodyFormat && !isDividerOnly
            ? { before: pBefore, after: pAfter, line: companyBodyLineTwips, lineRule: LineRuleType.EXACT }
            : regime === "party"
              ? { before: pBefore, after: pAfter, line: 360, lineRule: LineRuleType.EXACT }
              : { before: pBefore, after: pAfter, line: 276 }),
          children: createRunsAndTabsFromText(text, defaultHalfPoints, {
            bold: isArticleHeader || isTableTitle,
            italics: isLegalBasis,
          }),
        })
      );
    }
  }

  return elements;
}

/**
 * Trích xuất các node inline (strong, em, u, text) trong một thẻ HTML
 */
function parseInlineNodes(
  element: Element,
  fontSizeHalfPoints: number = 26,
  options: { forceBold?: boolean } = {}
): (TextRun | Tab)[] {
  const runs: (TextRun | Tab)[] = [];

  const traverse = (node: Node, currentFormat: { bold: boolean; italic: boolean; underline: boolean }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) {
        runs.push(
          ...createRunsAndTabsFromText(text, fontSizeHalfPoints, {
            bold: currentFormat.bold,
            italics: currentFormat.italic,
            underline: currentFormat.underline,
          })
        );
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (DANGEROUS_HTML_TAGS.has(tag)) return;
      // Chặng 5 / P1: ngắt dòng `<br>` phải được giữ thành `<w:br/>` trong
      // Word, nếu không hai từ ở hai đầu ngắt dòng sẽ bị dính liền.
      if (tag === "br") {
        runs.push(new TextRun({ text: "", break: 1, font: "Times New Roman", size: fontSizeHalfPoints }));
        return;
      }
      const newFormat = {
        bold: currentFormat.bold || tag === "strong" || tag === "b",
        italic: currentFormat.italic || tag === "em" || tag === "i",
        underline: currentFormat.underline || tag === "u",
      };

      Array.from(el.childNodes).forEach((childNode) => {
        traverse(childNode, newFormat);
      });
    }
  };

  Array.from(element.childNodes).forEach((child) => {
    traverse(child, { bold: options.forceBold === true, italic: false, underline: false });
  });

  return runs;
}

/**
 * Phát hiện xem trong bodyHtml đã có khối Header Quốc hiệu / Cơ quan hay chưa.
 * Tránh nhận nhầm các câu trích dẫn Căn cứ pháp lý (như "Căn cứ Điều lệ Đảng Cộng sản Việt Nam").
 */
export function detectEmbeddedHeader(bodyHtml: string): boolean {
  if (!bodyHtml || typeof bodyHtml !== "string") return false;
  const topSlice = bodyHtml.slice(0, 1500);

  const paragraphs = topSlice.split(/<\/p>|<\/div>|<br\s*\/?>|<\/tr>/i);
  for (const p of paragraphs.slice(0, 10)) {
    const text = p.replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    // Bỏ qua các câu căn cứ pháp lý, điều lệ, trích dẫn văn bản
    if (/^(Căn cứ|Theo|Quy định|Hiến pháp|Thực hiện|Nghị quyết)/i.test(text)) continue;

    const norm = text.toUpperCase();
    if (
      norm === "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" ||
      norm === "ĐẢNG CỘNG SẢN VIỆT NAM" ||
      norm.startsWith("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") ||
      norm.startsWith("ĐẢNG CỘNG SẢN VIỆT NAM")
    ) {
      if (text.length <= 60) {
        return true;
      }
    }
  }
  return false;
}

function normalizeHeaderText(value:string):string{return decodeHtmlEntities(value).normalize("NFC").replace(/[\t \r\n]+/g," ").trim().toLocaleUpperCase("vi");}
export function detectEmbeddedHeaderField(bodyHtml:string,value?:string):boolean{
  if(!bodyHtml||!value?.trim())return false;
  const expected=normalizeHeaderText(value),paragraphs=bodyHtml.slice(0,5000).split(/<\/p>|<\/div>|<br\s*\/?>|<\/tr>/i).slice(0,24);
  return paragraphs.some(p=>normalizeHeaderText(p.replace(/<[^>]+>/g,""))===expected);
}
export interface HeaderRenderPlan{renderSystemHeader:boolean;renderType:boolean;renderSubject:boolean;renderPartySeparator:boolean;isCongVanParty:boolean;isCongVanState:boolean}
/** Independent header decisions keep content fields even when the organization/reference block is absent. */
export function getHeaderRenderPlan(data:DocumentFormatType):HeaderRenderPlan{
  const isParty=data.regime==="party",company=data.headerProfile===COMPANY_HEADER_PROFILE_ID||data.headerProfile===COMPANY_HEADER_HD05_PROFILE_ID;
  const isCongVanParty=isParty&&(data.documentType??"").trim().toUpperCase()==="CÔNG VĂN";
  const normalizedDocumentType=(data.documentType??"").trim().toLocaleUpperCase("vi-VN");
  // A subject beginning with "V/v" is only a fallback signal when the type is
  // absent. It must not suppress an explicitly selected type such as QUYẾT ĐỊNH.
  const isCongVanState=!isParty&&(normalizedDocumentType==="CÔNG VĂN"||(!normalizedDocumentType&&/^(?:V\/v|Về việc)\s+/i.test((data.subject??"").trim())));
  const hasEmbeddedHeader=detectEmbeddedHeader(data.bodyHtml??"");
  const hasOfficeReference=Boolean(data.orgHeader2&&!isPlaceholderValue(data.orgHeader2)||data.referenceNumber&&!isPlaceholderValue(data.referenceNumber));
  const renderSystemHeader=!hasEmbeddedHeader&&(company||hasOfficeReference);
  const renderType=Boolean(data.documentType&&!isCongVanParty&&!isCongVanState&&!detectEmbeddedHeaderField(data.bodyHtml??"",data.documentType));
  const renderSubject=Boolean(data.subject&&!detectEmbeddedHeaderField(data.bodyHtml??"",data.subject));
  const renderPartySeparator=Boolean(isParty&&!isCongVanParty&&renderSubject&&data.subject&&!containsSeparatorParagraph(data.bodyHtml??""));
  return{renderSystemHeader,renderType,renderSubject,renderPartySeparator,isCongVanParty,isCongVanState};
}

/**
 * Tạo đối tượng `Document` của thư viện `docx` với bố cục chuẩn Nghị định 30/2020/NĐ-CP
 * 
 * @param data Dữ liệu văn bản tuân thủ DocumentFormatType
 * @returns Instance Document của `docx`
 */
export function detectEmbeddedSignature(bodyHtml: string): boolean {
  if (!bodyHtml || typeof bodyHtml !== "string") return false;

  const tables = bodyHtml.match(/<table\b[^>]*>[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const rawText = table.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Guard: Normal data tables must NEVER be misidentified as signature tables
    const isDataTable = /\b(STT|Số lượng|Đơn giá|Thành tiền|Tiến độ|Thời gian thực hiện|Chỉ tiêu)\b/i.test(rawText);
    if (isDataTable) continue;

    const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (rows.length === 0 || rows.length > 6) continue;

    const firstRow = rows[0] || "";
    const firstRowCells = firstRow.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    const cellTexts = firstRowCells.map(c => c.replace(/<[^>]+>/g, "").trim());

    const signerRoleRegex = /\b(THƯ KÝ|TRƯỞNG ĐOÀN|CHỦ TỌA|CHỦ TRÌ|NGƯỜI LẬP|ĐẠI DIỆN|BÊN A|BÊN B|BÊN C|CÁN BỘ|GIÁM ĐỐC|TỔNG GIÁM ĐỐC|CHỦ TỊCH|BÍ THƯ|PHỤ TRÁCH PHÒNG)\b/i;
    const signerCount = cellTexts.filter(t => signerRoleRegex.test(t)).length;
    const hasSigNote = /\(k[ýí]\s*(?:,|và)?\s*(?:ghi rõ|đóng dấu|chữ ký)/i.test(rawText);

    // 1. Multi-signer table (2 or more columns with signer roles or signature notes)
    if (firstRowCells.length >= 2 && (signerCount >= 2 || (signerCount >= 1 && hasSigNote))) {
      return true;
    }

    // 2. Standard 2-column signature table (Recipients left, Signer right)
    if (firstRowCells.length === 2) {
      const leftCol = cellTexts[0] || "";
      const rightCol = cellTexts[1] || "";
      if (/Nơi nhận\s*:/i.test(leftCol) && (signerRoleRegex.test(rightCol) || hasSigNote || /\b(TM\.|T\/M\.|KT\.|TL\.|TUQ\.)\b/i.test(rightCol))) {
        return true;
      }
    }
  }

  const hasRecipients = /NƠI NHẬN\s*:/i.test(bodyHtml);
  const hasFormula = /\b(TM\.|T\/M\.|KT\.|TL\.|TUQ\.)\b/i.test(bodyHtml);

  // If both Nơi nhận and a signature formula appear in the document, signature block is embedded
  if (hasRecipients && hasFormula) {
    return true;
  }

  // Check for signature block lines (standalone short lines with signature titles)
  const paragraphs = bodyHtml.split(/<\/p>|<\/div>|<br\s*\/?>/i);
  for (const p of paragraphs) {
    const textOnly = p.replace(/<[^>]+>/g, "").trim().toUpperCase();
    if (textOnly.length > 0 && textOnly.length <= 60) {
      const isSignatureLine =
        /^TM\.\s+/i.test(textOnly) ||
        /^T\/M\.\s+/i.test(textOnly) ||
        /^KT\.\s+/i.test(textOnly) ||
        /^TL\.\s+/i.test(textOnly) ||
        /^TUQ\.\s+/i.test(textOnly) ||
        textOnly === "GIÁM ĐỐC" ||
        textOnly === "CHỦ TỊCH" ||
        textOnly === "BÍ THƯ" ||
        textOnly === "TRƯỞNG BAN" ||
        textOnly === "TỔNG GIÁM ĐỐC" ||
        textOnly === "PHÓ GIÁM ĐỐC" ||
        textOnly === "PHÓ CHỦ TỊCH";

      if (isSignatureLine && (hasRecipients || hasFormula)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Chuẩn hóa danh sách các dòng nơi nhận:
 * Loại bỏ dòng tiêu đề "Nơi nhận:" lặp lại, chuẩn hóa các gạch đầu dòng "- ",
 * bảo đảm bản xuất Word chỉ có đúng 1 tiêu đề "Nơi nhận:" và không có dòng đạn thừa mang tiêu đề.
 */
export function parseRecipientLines(rawRecipients?: string): string[] {
  if (!rawRecipients || !rawRecipients.trim()) {
    return ["Như trên;", "Lưu: VT."];
  }

  const lines = rawRecipients
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const cleanedItems: string[] = [];

  for (const line of lines) {
    // Kiểm tra dòng tiêu đề "Nơi nhận:" (đứng riêng hoặc kèm người nhận cùng dòng)
    const headerMatch = line.match(/^(?:[-*•]\s*)?Nơi nhận(?:\s*:\s*(.*))?$/i);
    if (headerMatch) {
      // Nếu có người nhận cùng dòng sau "Nơi nhận:" (ví dụ "Nơi nhận: Ban A;")
      const inlineRecipient = headerMatch[1]?.trim();
      if (inlineRecipient) {
        const itemText = inlineRecipient.replace(/^[-*•]\s*/, "").trim();
        if (itemText) {
          cleanedItems.push(itemText);
        }
      }
      // Dù có hay không có inline recipient, dòng này đã được tiêu đề của Word đảm nhiệm,
      // nên tiêu đề "Nơi nhận:" không bị đưa vào cleanedItems.
      continue;
    }

    // Các dòng thông thường khác, loại bỏ gạch đầu dòng nếu có để thống nhất khi render
    const itemText = line.replace(/^[-*•]\s*/, "").trim();
    if (itemText) {
      cleanedItems.push(itemText);
    }
  }

  return cleanedItems.length > 0 ? cleanedItems : ["Như trên;", "Lưu: VT."];
}

/** Invisible anchors bind candidate sections to working IDs. */
export function candidateSectionName(id: string): string {
  // Two independent 64-bit lanes fit Word's 40-character bookmark name limit.
  // The semantic gate also rejects any name collision in the complete expected ID set.
  const mask = (1n << 64n) - 1n;
  let a = 0xcbf29ce484222325n, b = 0x84222325cbf29ce4n;
  for (const byte of new TextEncoder().encode(id)) {
    a = ((a ^ BigInt(byte)) * 0x100000001b3n) & mask;
    b = ((b ^ BigInt(byte)) * 0x100000001b3n) & mask;
  }
  return "df_" + a.toString(16).padStart(16, "0") + b.toString(16).padStart(16, "0");
}
function candidateSectionMarker(id: string): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0, line: 1, lineRule: "exact" },
    children: [new Bookmark({ id: candidateSectionName(id), children: [] })] });
}

export function generateND30DocxDocument(data: DocumentFormatType): Document {
  const isParty = data.regime === "party";
  const useCompanyND30Header = !isParty && data.headerProfile === COMPANY_HEADER_PROFILE_ID;
  const useCompanyHD05Header = isParty && data.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID;
  const useCompanyHeader = useCompanyND30Header || useCompanyHD05Header;
  const profile = getStyleProfile(data.regime, data.headerProfile);
  const bodyParagraphs = convertHtmlToDocxElements(
    data.bodyHtml || "",
    data.regime,
    useCompanyND30Header ? COMPANY_HEADER_GEOMETRY_MM.bodyInset : 0,
    data.importedTables,
    data.headerProfile,
    "body"
  );

  const nationalHeader1Text = isParty
    ? "ĐẢNG CỘNG SẢN VIỆT NAM"
    : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";

  const renderPlan=getHeaderRenderPlan(data);
  const renderSystemHeader=renderPlan.renderSystemHeader;
  const hasEmbeddedSignature = detectEmbeddedSignature(data.bodyHtml);

  const isSignaturePlaceholder = (!data.signTitle || isPlaceholderValue(data.signTitle)) && (!data.signName || isPlaceholderValue(data.signName));
  const isCongVanParty=renderPlan.isCongVanParty;
  // Recipients remain document content even when the signer fields are cleared.
  const shouldRenderSignature = !hasEmbeddedSignature && (Boolean(data.recipients?.trim()) || (!isSignaturePlaceholder && (Boolean(data.signTitle) || Boolean(data.signName))));

  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            font: "Times New Roman",
            size: profile.pageNumberFontSize * 2,
          }),
        ],
      }),
    ],
  });

  const appendixItems = data.appendices && Array.isArray(data.appendices) ? data.appendices : [];
  const appendixSections = appendixItems.length > 0 ? [{
    properties: {
      titlePage: false,
      type: SectionType.NEXT_PAGE,
      page: {
        size: ND30_PAGE_SIZE,
        margin: ND30_PAGE_MARGINS,
        ...(useCompanyND30Header ? { pageNumbers: { start: COMPANY_ND30_BODY_PROFILE.appendix.pageNumberStart } } : {}),
      },
    },
    headers: { default: pageHeader },
    children: appendixItems.flatMap((app: any, index: number) => [
      ...(index > 0 ? [new Paragraph({ children: [new PageBreak()] })] : []),
      candidateSectionMarker(`appendix:${app.id}:start`),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 120, line: 276 },
        children: [
          new TextRun({
            text: (app.title || "PHỤ LỤC").toUpperCase(),
            font: "Times New Roman",
            size: profile.bodyFontSize * 2,
            bold: true,
          }),
        ],
      }),
      ...(app.referenceText ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 180, line: 276 },
          children: [
            new TextRun({
              text: app.referenceText,
              font: "Times New Roman",
              size: profile.bodyFontSize * 2,
              italics: true,
            }),
          ],
        }),
      ] : []),
      ...convertHtmlToDocxElements(app.html || "", data.regime, 0, data.importedTables, data.headerProfile, "appendix"),
      candidateSectionMarker(`appendix:${app.id}:end`),
    ]),
  }] : [];

  const unclassifiedElements: (Paragraph | Table)[] = [
    candidateSectionMarker("unclassified:start"),
    ...((data.unclassified && Array.isArray(data.unclassified) && data.unclassified.length > 0)
      ? [
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            children: [new TextRun({ text: "KHỐI CHƯA PHÂN LOẠI — CẦN ĐỐI CHIẾU BẢN GỐC", bold: true, font: "Times New Roman", size: profile.bodyFontSize * 2 })],
          }),
          ...(data.unclassified as SourceBlock[]).flatMap((block) => {
            const fallback = `<p>${(block.text || "[Khối không có văn bản]").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
            return [
              new Paragraph({ text: `Khối #${block.index + 1} (${block.kind})` }),
              ...convertHtmlToDocxElements(block.html || fallback, data.regime, 0, data.importedTables, data.headerProfile, "other"),
            ];
          }),
        ]
      : []),
    candidateSectionMarker("unclassified:end"),
  ];
  if (appendixSections.length > 0) {
    appendixSections[appendixSections.length - 1].children.push(...unclassifiedElements);
  }

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: profile.bodyFontSize * 2, // 26 (13pt) cho nhà nước, 28 (14pt) cho Đảng
            color: "000000",
          },
          paragraph: {
            spacing: { line: 276, before: 60, after: 60 },
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "nd30-numbered-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
                run: {
                  font: "Times New Roman",
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true, // Bật chế độ trang đầu riêng (không hiển thị header/số trang ở trang 1)
          page: {
            size: ND30_PAGE_SIZE,
            margin: ND30_PAGE_MARGINS,
          },
        },
        headers: { default: pageHeader },
        children: [
          // ==========================================
          // 1. HEADER KHỐI ĐẦU TRANG (BẢNG ẨN 2 CỘT)
          // ==========================================
          ...(renderSystemHeader && useCompanyND30Header ? [
            createCompanyHeaderTable(data.referenceNumber, data.locationAndDate, !data.omitNationalHeader),
            new Paragraph({ text: "", spacing: { after: 120 } }),
          ] : []),
          ...(renderSystemHeader && useCompanyHD05Header ? [
            createCompanyHeaderHD05Table(data.referenceNumber, data.locationAndDate, data.orgHeader1, data.orgHeader2, !data.omitNationalHeader),
            new Paragraph({ text: "", spacing: { after: 120 } }),
          ] : []),
          ...(renderSystemHeader && !useCompanyHeader ? [
            (() => {
              // Tính toán nhu cầu chiều rộng thực tế của hai cột (Dynamic Content-Aware Distribution)
              const dateText = data.locationAndDate || "";
              const dateWidthTwips = estimateTimesNewRomanWidthTwips(dateText, 14, false); // 14pt nghiêng
              const partyTitleWidthTwips = estimateTimesNewRomanWidthTwips(nationalHeader1Text, profile.nationalHeader1FontSize, true);
              const mottoText = data.nationalHeader2 || "Độc lập - Tự do - Hạnh phúc";
              const mottoWidthTwips = estimateTimesNewRomanWidthTwips(mottoText, profile.nationalHeader2FontSize, true);

              // Chiều rộng tối thiểu cột phải cần để không bao giờ bị rớt dòng ngày tháng
              const minNeededRightTwips = Math.max(dateWidthTwips + 120, partyTitleWidthTwips + 80, isParty ? 0 : mottoWidthTwips + 80);

              // Tách các dòng của cơ quan ban hành (hỗ trợ văn bản nhiều dòng)
              const org1Lines = (data.orgHeader1 || "").split("\n").map(s => s.trim()).filter(Boolean);
              const org2Lines = (data.orgHeader2 || "").split("\n").map(s => s.trim()).filter(Boolean);
              if (org2Lines.length === 0) org2Lines.push("CƠ QUAN BAN HÀNH");
              const org2FirstLines = org2Lines.slice(0, -1);
              const org2LastLine = org2Lines[org2Lines.length - 1];

              const allLeftLines = [...org1Lines, ...org2Lines];
              const maxLeftLineWidthTwips = allLeftLines.reduce((max, line) => {
                const w = estimateTimesNewRomanWidthTwips(line, profile.orgHeader2FontSize || 13, true);
                return Math.max(max, w);
              }, 0);
              const minNeededLeftTwips = Math.max(maxLeftLineWidthTwips + 120, isParty ? 4100 : 3800);

              // Tổng chiều rộng vùng in khả dụng A4 (210mm - 45mm lề = 165mm = 9355 dxa)
              // Phân bổ mặc định: HD05 là 48% / 52% (4490 / 4865 dxa) vừa vặn "ĐOÀN GIÁM SÁT SỐ 05-QĐ/ĐU" và ngày tháng 14pt.
              // NĐ 30 hành chính: 44% / 56% (4116 / 5239 dxa).
              const headerTotalWidth = 9355;
              let headerLeftColWidth = isParty ? 4490 : 4116;
              let headerRightColWidth = isParty ? 4865 : 5239;

              if (isParty) {
                // Điều phối co dãn tự động bảo đảm cả hai bên không bị ngắt dòng
                if (minNeededRightTwips > headerRightColWidth && (headerTotalWidth - minNeededRightTwips) >= Math.max(3800, maxLeftLineWidthTwips)) {
                  headerRightColWidth = Math.min(minNeededRightTwips, headerTotalWidth - Math.max(3800, maxLeftLineWidthTwips));
                  headerLeftColWidth = headerTotalWidth - headerRightColWidth;
                } else if (minNeededLeftTwips > headerLeftColWidth && (headerTotalWidth - minNeededLeftTwips) >= Math.max(4500, dateWidthTwips)) {
                  headerLeftColWidth = Math.min(minNeededLeftTwips, headerTotalWidth - Math.max(4500, dateWidthTwips));
                  headerRightColWidth = headerTotalWidth - headerLeftColWidth;
                }
              } else {
                if (minNeededLeftTwips > headerLeftColWidth && (headerTotalWidth - minNeededLeftTwips) >= Math.max(4800, minNeededRightTwips)) {
                  headerLeftColWidth = Math.min(minNeededLeftTwips, headerTotalWidth - Math.max(4800, minNeededRightTwips));
                  headerRightColWidth = headerTotalWidth - headerLeftColWidth;
                }
              }

              if (minNeededLeftTwips + minNeededRightTwips > headerTotalWidth) {
                console.warn("[DocForm Header Warning] Nội dung tiêu đề hoặc ngày tháng dài vượt ngưỡng tổng độ rộng hữu dụng A4 (" +
                  headerTotalWidth + " twips). Giữ nguyên cỡ chữ 14pt theo thể thức và phân bổ tối ưu.");
              }

              // Tính độ dài đường kẻ cơ quan ban hành chuẩn NĐ 30: 1/3 đến 1/2 độ dài dòng chữ cuối cùng (chọn 0.42 nằm chuẩn giữa)
              const lastLineWidthTwips = estimateTimesNewRomanWidthTwips(org2LastLine, profile.orgHeader2FontSize, true);
              const issuerLineLengthTwips = Math.min(Math.round(lastLineWidthTwips * 0.42), headerLeftColWidth - 200);
              const leftIndent = Math.max(0, Math.round((headerLeftColWidth - issuerLineLengthTwips) / 2));

              // Tính độ dài đường kẻ tiêu ngữ: xấp xỉ 100% độ dài cụm từ "Độc lập - Tự do - Hạnh phúc"
              const mottoLineLengthTwips = Math.min(mottoWidthTwips, headerRightColWidth - 200);
              const rightIndent = Math.max(0, Math.round((headerRightColWidth - mottoLineLengthTwips) / 2));

              // Tính độ dài đường kẻ tiêu đề Đảng theo HD05: Bằng 100% chiều dài tiêu đề ĐẢNG CỘNG SẢN VIỆT NAM (bỏ hệ số 0.42)
              const partyWidthTwips = estimateTimesNewRomanWidthTwips(nationalHeader1Text, profile.nationalHeader1FontSize, true);
              const partyLineLengthTwips = Math.min(partyWidthTwips, headerRightColWidth - 100);
              const partyIndent = Math.max(0, Math.round((headerRightColWidth - partyLineLengthTwips) / 2));

              const headerTbl = new Table({
                width: { size: headerTotalWidth, type: WidthType.DXA },
                columnWidths: [headerLeftColWidth, headerRightColWidth],
                layout: TableLayoutType.FIXED,
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
                },
                rows: [
                  new TableRow({
                    cantSplit: true,
                    children: [
                      // Cột trái: Tên cơ quan chủ quản, Tên cơ quan ban hành, Dấu * hoặc Đường kẻ, Số ký hiệu
                      new TableCell({
                        width: { size: headerLeftColWidth, type: WidthType.DXA },
                        borders: INVISIBLE_CELL_BORDER,
                        margins: { top: 0, bottom: 0, left: 0, right: 0 },
                        children: [
                          ...(data.orgHeader1 ? [
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: isParty ? 340 : 240, after: 20 },
                              children: [
                                new TextRun({
                                  text: data.orgHeader1.toUpperCase(),
                                  font: "Times New Roman",
                                  size: profile.orgHeader1FontSize * 2, // 12pt cho nhà nước, 14pt cho Đảng
                                }),
                              ],
                            }),
                          ] : []),
                          ...org2FirstLines.map(line =>
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: isParty ? 340 : 240, after: 20 },
                              children: [
                                new TextRun({
                                  text: line.toUpperCase(),
                                  font: "Times New Roman",
                                  size: profile.orgHeader2FontSize * 2,
                                  bold: true,
                                }),
                              ],
                            })
                          ),
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { line: isParty ? 340 : 240, after: 0 },
                            children: [
                              new TextRun({
                                text: org2LastLine.toUpperCase(),
                                font: "Times New Roman",
                                size: profile.orgHeader2FontSize * 2, // 13pt cho nhà nước, 14pt cho Đảng
                                bold: true,
                              }),
                            ],
                          }),
                          ...(!isParty ? [
                            // Đường kẻ ngang nét liền dưới dòng cuối tên cơ quan ban hành chuẩn NĐ 30 (dài 1/3 đến 1/2)
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              indent: { left: leftIndent, right: leftIndent },
                              border: {
                                bottom: {
                                  color: "000000",
                                  style: BorderStyle.SINGLE,
                                  size: 6, // 0.75 pt nét liền
                                  space: 1,
                                },
                              },
                              spacing: { line: 20, lineRule: "exact", before: 0, after: 40 },
                              children: [
                                new TextRun({ text: "", size: 2, font: "Times New Roman" }),
                              ],
                            }),
                          ] : [
                            // Văn bản Đảng theo HD05 Phần II.I.2.2.1: Một dấu "*" cân đối dưới tên cơ quan ban hành, nằm giữa cơ quan và số/ký hiệu (không kẻ dòng)
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: 360, lineRule: "exact", before: 0, after: 40 },
                              children: [
                                new TextRun({
                                  text: "*",
                                  font: "Times New Roman",
                                  size: 28, // 14pt
                                }),
                              ],
                            }),
                          ]),
                          // Số, ký hiệu văn bản (cỡ 13 cho NĐ 30, cỡ 14 cho Đảng theo HD 05)
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { line: isParty ? 360 : 240, lineRule: isParty ? "exact" : undefined, after: (isCongVanParty || (data.draftNote && data.includeDraftNoteInExport !== false)) ? 20 : 60 },
                            children: [
                              new TextRun({
                                text: data.referenceNumber,
                                font: "Times New Roman",
                                size: (isParty ? 14 : profile.bodyFontSize) * 2,
                              }),
                            ],
                          }),
                          ...(data.draftNote && data.includeDraftNoteInExport !== false ? [
                            // Ghi chú bản thảo nguồn (ví dụ: BẢN HOÀN THIỆN ĐỂ ĐOÀN GIÁM SÁT XEM XÉT, TRÌNH KÝ)
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: 240, before: 10, after: isCongVanParty ? 20 : 60 },
                              children: [
                                new TextRun({
                                  text: data.draftNote,
                                  font: "Times New Roman",
                                  size: 20, // 10pt
                                  italics: true,
                                }),
                              ],
                            }),
                          ] : []),
                          ...((isCongVanParty || renderPlan.isCongVanState) && renderPlan.renderSubject ? [
                            // Công văn giữ trích yếu ở cột trái ngay dưới số, ký hiệu.
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: 240, before: 20, after: 60 },
                              children: [
                                new TextRun({
                                  text: data.subject,
                                  font: "Times New Roman",
                                  size: 24, // 12pt
                                  italics: isCongVanParty,
                                  bold: false,
                                }),
                              ],
                            }),
                          ] : []),
                        ],
                      }),

                      // Cột phải: Quốc hiệu, Tiêu ngữ, Địa danh & Ngày tháng năm
                      new TableCell({
                        width: { size: headerRightColWidth, type: WidthType.DXA },
                        borders: INVISIBLE_CELL_BORDER,
                        margins: { top: 0, bottom: 0, left: 0, right: 0 },
                        children: [
                          ...(!data.omitNationalHeader ? [new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { line: 240, after: 0 },
                            children: [
                              new TextRun({
                                text: nationalHeader1Text,
                                font: "Times New Roman",
                                size: profile.nationalHeader1FontSize * 2,
                                bold: true,
                              }),
                            ],
                          })] : []),
                          ...(!data.omitNationalHeader && !isParty && data.nationalHeader2 ? [
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: 240, after: 0 },
                              children: [
                                new TextRun({
                                  text: data.nationalHeader2,
                                  font: "Times New Roman",
                                  size: profile.nationalHeader2FontSize * 2,
                                  bold: true,
                                }),
                              ],
                            }),
                            // Đường kẻ ngang nét liền dưới tiêu ngữ chuẩn NĐ 30 (dài xấp xỉ 100% dòng tiêu ngữ)
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              indent: { left: rightIndent, right: rightIndent },
                              border: {
                                bottom: {
                                  color: "000000",
                                  style: BorderStyle.SINGLE,
                                  size: 6, // 0.75 pt nét liền
                                  space: 1,
                                },
                              },
                              spacing: { line: 20, lineRule: "exact", before: 0, after: 40 },
                              children: [
                                new TextRun({ text: "", size: 2, font: "Times New Roman" }),
                              ],
                            }),
                          ] : !data.omitNationalHeader && isParty ? [
                            // Đường kẻ ngang nét liền dưới Quốc hiệu Đảng chuẩn Hướng dẫn 05: Dài bằng chiều dài tiêu đề (100%), không nhân 0.42!
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              indent: { left: partyIndent, right: partyIndent },
                              border: {
                                bottom: {
                                  color: "000000",
                                  style: BorderStyle.SINGLE,
                                  size: 6, // 0.75 pt nét liền
                                  space: 1,
                                },
                              },
                              spacing: { line: 20, lineRule: "exact", before: 0, after: 40 },
                              children: [
                                new TextRun({ text: "", size: 2, font: "Times New Roman" }),
                              ],
                            }),
                          ] : []),
                          // Địa danh và ngày, tháng, năm ban hành
                          new Paragraph({
                            alignment: isParty ? AlignmentType.RIGHT : AlignmentType.CENTER,
                            spacing: { line: isParty ? 360 : 240, lineRule: isParty ? "exact" : undefined, after: 60 },
                            children: [
                              new TextRun({
                                text: data.locationAndDate,
                                font: "Times New Roman",
                                size: (isParty ? 14 : profile.bodyFontSize) * 2,
                                italics: true,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              });
              if ((headerTbl as any).root?.[0]?.root) {
                (headerTbl as any).root[0].root.push(new TableCaptionXml("system_header_layout_table"));
              }
              return headerTbl;
            })(),
            new Paragraph({ text: "", spacing: { after: 120 } }),
          ] : []),

          ...((isCongVanParty || renderPlan.isCongVanState) && renderPlan.renderSubject && !renderSystemHeader ? [
            // Công văn thiếu khối cơ quan/số vẫn giữ trích yếu trước nội dung.
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 120, after: 120, line: 240 },
              children: [new TextRun({ text: data.subject, font: "Times New Roman", size: 24, italics: isCongVanParty })],
            }),
          ] : []),

          // ==========================================
          // 2. TÊN LOẠI VĂN BẢN & TRÍCH YẾU
          // ==========================================
          ...(!isParty ? [
            // Văn bản hành chính theo NĐ 30
            ...(renderPlan.renderType ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                keepNext: true,
                spacing: { before: 120, after: 60, line: 276 },
                children: [
                  new TextRun({
                    text: data.documentType.toUpperCase(),
                    font: "Times New Roman",
                    size: profile.documentTypeFontSize * 2,
                    bold: true,
                  }),
                ],
              }),
            ] : []),
            ...(renderPlan.renderSubject && (!renderPlan.isCongVanState || useCompanyHeader) ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                keepNext: true,
                spacing: { before: 60, after: 180, line: 276 },
                children: [
                  new TextRun({
                    text: data.subject,
                    font: "Times New Roman",
                    size: profile.bodyFontSize * 2,
                    bold: true,
                    italics: (data.documentType || "").toUpperCase().includes("CÔNG VĂN"),
                  }),
                ],
              }),
            ] : []),
          ] : [
            // Văn bản Đảng theo HD 05
            // Nếu là công văn Đảng: Trích yếu đã nằm ở cột trái dưới số/ký hiệu; KHÔNG tạo cụm tên loại/trích yếu/"-----" giữa trang
            ...((!isCongVanParty && renderPlan.renderType) ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                keepNext: true,
                spacing: { before: 200, after: 40, line: 400, lineRule: "exact" },
                children: [
                  new TextRun({
                    text: data.documentType.toUpperCase(),
                    font: "Times New Roman",
                    size: 31, // 15.5pt (HD05 quy định 15-16pt)
                    bold: true,
                  }),
                ],
              }),
            ] : []),
            ...((!isCongVanParty && renderPlan.renderSubject) ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                keepNext: true,
                spacing: { before: 0, after: 40, line: 400, lineRule: "exact" },
                children: data.subject.split(/\r?\n/).map((line, idx) =>
                  new TextRun({
                    text: line,
                    break: idx > 0 ? 1 : 0,
                    font: "Times New Roman",
                    size: 28, // 14pt (HD05 quy định 14-15pt, in thường, đứng, đậm)
                    bold: true,
                    italics: false,
                  })
                ),
              }),
              // Đúng 5 dấu gạch nối "-----" ở dưới trích yếu, trước nội dung (HD05 Phần II.I.5.2.1)
              // S2-F02 (tái audit 20/10/2026): bộ xuất chỉ tự sinh dấu khi thân bài
              // **không còn** dòng kẻ dạng dấu gạch nào. Trước đây điều kiện chỉ
              // kiểm tra phần đầu bodyHtml, nên một dấu "-----" còn sót lại ở giữa
              // thân bài vẫn bị bộ xuất sinh thêm một dấu nữa → Word có hai dấu.
              ...(renderPlan.renderPartySeparator ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  keepNext: true,
                  spacing: { before: 0, after: 120, line: 360, lineRule: "exact" },
                  children: [
                    new TextRun({
                      text: "-----",
                      font: "Times New Roman",
                      size: 28,
                    }),
                  ],
                }),
              ] : []),
            ] : []),
          ]),

          // ==========================================
          // 4. TOÀN BỘ NỘI DUNG VĂN BẢN (TỪ TIPTAP HTML)
          // ==========================================
          candidateSectionMarker("body:start"),
          ...bodyParagraphs,
          candidateSectionMarker("body:end"),

          // Khoảng cách trống trước khối chữ ký
          new Paragraph({ text: "", spacing: { after: 180 } }),

          // ==========================================
          // 5. KHỐI CHỮ KÝ & NƠI NHẬN (BẢNG ẨN 2 CỘT)
          // ==========================================
          ...(shouldRenderSignature ? (() => {
            const sigTable = new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
              },
              rows: (data.signTitle && data.signTitle.includes("|"))
                ? [
                    // Hàng ký nhiều người (Biên bản làm việc, Biên bản nghiệm thu, v.v.)
                    new TableRow({
                      cantSplit: true,
                      children: data.signTitle.split("|").map((titlePart, idx) => {
                        const names = (data.signName || "").split("|").map(n => n.trim());
                        const namePart = names[idx] || "";
                        const totalCols = Math.max(data.signTitle.split("|").length, 1);
                        const colWidth = Math.floor(100 / totalCols);

                        return new TableCell({
                          width: { size: colWidth, type: WidthType.PERCENTAGE },
                          borders: INVISIBLE_CELL_BORDER,
                          children: [
                            ...titlePart
                              .split("\n")
                              .map(l => l.trim())
                              .filter(Boolean)
                              .map(line => {
                                const isSignNote = /^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(line);
                                return new Paragraph({
                                  alignment: AlignmentType.CENTER,
                                  keepNext: true,
                                  spacing: { line: 240, after: 20 },
                                  children: [
                                    new TextRun({
                                      text: isSignNote ? line : line.toUpperCase(),
                                      font: "Times New Roman",
                                      size: isSignNote ? 20 : profile.signTitleFontSize * 2,
                                      bold: !isSignNote,
                                      italics: isSignNote,
                                    }),
                                  ],
                                });
                              }),
                            new Paragraph({ text: "", keepNext: true, spacing: { before: 120, after: 240 } }),
                            new Paragraph({
                              alignment: AlignmentType.CENTER,
                              spacing: { line: 240, before: 60 },
                              children: [
                                new TextRun({
                                  text: namePart || "[Họ và tên]",
                                  font: "Times New Roman",
                                  size: profile.signNameFontSize * 2,
                                  bold: true,
                                }),
                              ],
                            }),
                          ],
                        });
                      }),
                    }),
                    ...(data.recipients?.trim() ? [
                      new TableRow({
                        cantSplit: true,
                        children: [
                          new TableCell({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            borders: INVISIBLE_CELL_BORDER,
                            children: [
                              new Paragraph({ children: [new TextRun({ text: "Nơi nhận:", font: "Times New Roman", size: 24, bold: true, italics: true })] }),
                              ...parseRecipientLines(data.recipients).map(item => new Paragraph({ children: [new TextRun({ text: "- " + item, font: "Times New Roman", size: 22 })] })),
                            ],
                          }),
                        ],
                      }),
                    ] : []),
                  ]
                : [
                    new TableRow({
                      cantSplit: true,
                      children: [
                        // Cột trái: Nơi nhận (cỡ 12pt, nghiêng, đậm; các dòng con cỡ 11pt, thường)
                        new TableCell({
                          width: { size: 38, type: WidthType.PERCENTAGE },
                          borders: INVISIBLE_CELL_BORDER,
                          children: (data.recipients && data.recipients.trim()) ? [
                            new Paragraph({
                              spacing: { line: 240, after: 40 },
                              children: [
                                new TextRun({
                                  text: "Nơi nhận:",
                                  font: "Times New Roman",
                                  size: 24, // 12pt
                                  bold: true,
                                  italics: true,
                                }),
                              ],
                            }),
                            ...parseRecipientLines(data.recipients).map(item => 
                              new Paragraph({
                                spacing: { line: 220, before: 20, after: 20 },
                                children: [
                                  new TextRun({
                                    text: `- ${item}`,
                                    font: "Times New Roman",
                                    size: 22, // 11pt
                                  }),
                                ],
                              })
                            ),
                          ] : [
                            // Ô trái để trống nếu tài liệu không có nơi nhận (ví dụ biên bản 1 người ký)
                            new Paragraph({ text: "" }),
                          ],
                        }),

                        // Cột phải: Chức vụ, chữ ký, họ và tên
                        new TableCell({
                          width: { size: 62, type: WidthType.PERCENTAGE },
                          borders: INVISIBLE_CELL_BORDER,
                          children: [
                            // Chức vụ (in hoa, đứng, đậm, cỡ 13-14pt)
                            ...(data.signTitle ? data.signTitle
                              .split("\n")
                              .map(line => line.trim())
                              .filter(Boolean)
                              .map(line =>
                                new Paragraph({
                                  alignment: AlignmentType.CENTER,
                                  keepNext: true,
                                  spacing: { line: 240, after: 20 },
                                  children: [
                                    new TextRun({
                                      text: line.toUpperCase(),
                                      font: "Times New Roman",
                                      size: profile.signTitleFontSize * 2,
                                      bold: true,
                                    }),
                                  ],
                                })
                              ) : []),
                            // Lời ghi chú "(Ký, đóng dấu)"
                            ...(data.signTitle ? [
                              new Paragraph({
                                alignment: AlignmentType.CENTER,
                                keepNext: true,
                                spacing: { line: 240, after: 40 },
                                children: [
                                  new TextRun({
                                    text: "(Ký, đóng dấu)",
                                    font: "Times New Roman",
                                    size: 20, // 10pt
                                    italics: true,
                                  }),
                                ],
                              }),
                            ] : []),
                            // Khoảng trống ký tên
                            new Paragraph({ text: "", keepNext: true, spacing: { before: 180, after: 240 } }),
                            // Họ và tên người ký (chữ thường, đứng, đậm, cỡ 13-14pt)
                            ...(data.signName ? [
                              new Paragraph({
                                alignment: AlignmentType.CENTER,
                                spacing: { line: 240, before: 80 },
                                children: [
                                  new TextRun({
                                    text: data.signName,
                                    font: "Times New Roman",
                                    size: profile.signNameFontSize * 2,
                                    bold: true,
                                  }),
                                ],
                              }),
                            ] : []),
                          ],
                        }),
                      ],
                    }),
                  ],
            });
            if ((sigTable as any).root?.[0]?.root) {
              (sigTable as any).root[0].root.push(new TableCaptionXml("system_signature_layout_table"));
            }
            return [sigTable];
          })() : []),

          // ==========================================
          // 6. PHỤ LỤC ĐỘC LẬP (NẾU CÓ TRONG data.appendices)
          // ==========================================
          candidateSectionMarker("signature:end"),
          ...(appendixSections.length === 0 ? unclassifiedElements : []),
        ],
      },
      ...appendixSections,
    ],
  });
}

/**
 * Tạo byte array (Uint8Array) file DOCX hoàn chỉnh với đầy đủ các Shape Line DrawingML & VML đã được hậu xử lý.
 * Tương thích hoàn toàn trên cả Trình duyệt và Node.js (dùng Packer.toArrayBuffer thay vì Packer.toBuffer).
 */
export async function generateND30DocxUint8Array(data: DocumentFormatType): Promise<Uint8Array> {
  const doc = generateND30DocxDocument(data);
  const arrayBuffer = await Packer.toArrayBuffer(doc);
  const withShapes = await postProcessDocxShapes(new Uint8Array(arrayBuffer));
  return stampHoaTieuHeader(withShapes, data);
}

/**
 * Tạo buffer file DOCX (trả về Uint8Array, tương thích ngược với Buffer trong Node.js và không lỗi trong Browser)
 */
export async function generateND30DocxBuffer(data: DocumentFormatType): Promise<Uint8Array> {
  return await generateND30DocxUint8Array(data);
}

/**
 * Tạo Blob file DOCX phục vụ render preview (docx-preview) hoặc tải file
 */
export async function generateND30DocxBlob(data: DocumentFormatType): Promise<Blob> {
  const bytes = await generateND30DocxUint8Array(data);
  return new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * Tải file DOCX từ mảng byte Uint8Array trực tiếp trên trình duyệt
 */
export function downloadDocxUint8Array(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 1500);
  }
}

/**
 * Hàm chính thực thi việc xuất file DOCX và kích hoạt tải về máy của người dùng.
 * Trả về chính artifact vừa tạo ({ bytes, fileName }) để tránh sinh file 2 lần.
 * 
 * @param documentJson Đối tượng văn bản chuẩn DocumentFormatType
 * @param customFileName Tên file tùy biến (tùy chọn)
 */
export async function exportToDocx(
  documentJson: DocumentFormatType,
  customFileName?: string
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const bytes = await generateND30DocxUint8Array(documentJson);

  const cleanDocType = (documentJson.documentType || "Van_Ban")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w\d_]/g, "");

  const fileName = customFileName || `${cleanDocType}_${documentJson.regime === "party" ? "ChuanHD05" : "ChuanND30"}.docx`;

  downloadDocxUint8Array(bytes, fileName);
  return { bytes, fileName };
}

export default exportToDocx;

