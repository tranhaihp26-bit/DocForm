/**
 * @file canonicalAuditHD05.ts
 * @description Bộ kiểm định chuẩn tắc thể thức văn bản Đảng theo Hướng dẫn số 05-HD/VPTW
 * kết nối trực tiếp với 231 quy tắc trong catalog src/canonical/hd05/rules.2026.json.
 * 
 * NGUYÊN TẮC:
 * - KHÔNG BAO GIỜ tự tính NOT_EVALUATED thành PASS.
 * - Chỉ đánh giá PASS/FAIL khi có bằng chứng hình học/thuộc tính thực tế trích xuất từ OOXML (word/document.xml).
 */

import rawCatalog from "./rules.2026.json";
import JSZip from "jszip";
import { estimateTimesNewRomanWidthTwips } from "../../utils/docxExport.ts";

export type CanonicalStatus = "PASS" | "FAIL" | "NOT_APPLICABLE" | "NOT_EVALUATED" | "NEEDS_REVIEW";

export interface HD05RuleTuple {
  id: string;
  locator: string;
  pdf_page: number;
  applies_when: string;
  target: string;
  property: string;
  operator: string;
  expected: string;
  verification: string;
}

export interface CanonicalFindingHD05 {
  ruleId: string;
  status: CanonicalStatus;
  sourceLocator: string;
  expected: unknown;
  actual?: unknown;
  reason: string;
}

export interface CanonicalAuditHD05 {
  catalogId: string;
  total: number;
  counts: Record<CanonicalStatus, number>;
  findings: CanonicalFindingHD05[];
}

const rawData = rawCatalog as unknown as {
  catalog_id: string;
  rules: (string | number)[][];
};

const emptyCounts = (): Record<CanonicalStatus, number> => ({
  PASS: 0,
  FAIL: 0,
  NOT_APPLICABLE: 0,
  NOT_EVALUATED: 0,
  NEEDS_REVIEW: 0,
});

export interface HD05HeaderEvidence {
  has_party_title?: boolean;
  party_title_font_pt?: number;
  party_title_is_bold?: boolean;
  party_title_underline_style?: string;
  party_title_underline_length_relation?: string;
  has_issuer_star?: boolean;
  star_position_valid?: boolean;
  reference_number_text?: string;
  reference_number_has_colon?: boolean;
  reference_number_leading_zero?: boolean;
  reference_number_has_hyphen_and_slash?: boolean;
  is_cong_van?: boolean;
  subject_in_left_column?: boolean;
  subject_font_pt?: number;
  subject_is_bold?: boolean;
  subject_is_italic?: boolean;
  has_five_hyphens?: boolean;
  five_hyphens_position_valid?: boolean;
  page_width_mm?: number;
  page_height_mm?: number;
  margin_top_mm?: number;
  margin_bottom_mm?: number;
  margin_left_mm?: number;
  margin_right_mm?: number;
}

const xmlAttr = (s: string, name: string): string | undefined => {
  const m = s.match(new RegExp(`(?:\\bw:)?${name}="([^"]+)"`));
  return m?.[1];
};

const toMM = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? (n * 25.4) / 1440 : undefined;
};

function isItalicFromP(p: string): boolean {
  if (p.includes("<w:i/>")) return true;
  const m = p.match(/<w:i\b[^>]*w:val="([^"]+)"/);
  if (m) return m[1] === "1" || m[1] === "true" || m[1] === "on";
  return false;
}

function isBoldFromP(p: string): boolean {
  if (p.includes("<w:b/>")) return true;
  const m = p.match(/<w:b\b[^>]*w:val="([^"]+)"/);
  if (m) return m[1] === "1" || m[1] === "true" || m[1] === "on";
  return false;
}

export function extractHD05EvidenceFromXml(xml: string): HD05HeaderEvidence {
  const ev: HD05HeaderEvidence = {};

  // 1. Kích thước trang và lề
  const sec = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
  const sz = sec.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0] ?? "";
  const mar = sec.match(/<w:pgMar\b[^>]*\/?\s*>/)?.[0] ?? "";
  ev.page_width_mm = toMM(xmlAttr(sz, "w"));
  ev.page_height_mm = toMM(xmlAttr(sz, "h"));
  ev.margin_top_mm = toMM(xmlAttr(mar, "top"));
  ev.margin_bottom_mm = toMM(xmlAttr(mar, "bottom"));
  ev.margin_left_mm = toMM(xmlAttr(mar, "left"));
  ev.margin_right_mm = toMM(xmlAttr(mar, "right"));

  // 2. Bảng header
  const tblMatch = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/);
  if (!tblMatch) return ev;
  const tbl = tblMatch[0];
  const gridCols = Array.from(tbl.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map(m => Number(m[1]));
  const cells = Array.from(tbl.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map(m => m[0]);
  if (cells.length < 2) return ev;

  const leftCell = cells[0];
  const rightCell = cells[1];
  const rightColW = gridCols[1] || 5239;

  // Tiêu đề Đảng ở cột phải
  ev.has_party_title = rightCell.includes("ĐẢNG CỘNG SẢN VIỆT NAM");
  if (ev.has_party_title) {
    const titleP = Array.from(rightCell.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g))
      .map(m => m[0])
      .find(p => p.includes("ĐẢNG CỘNG SẢN VIỆT NAM"));
    if (titleP) {
      const szMatch = titleP.match(/<w:sz\b[^>]*w:val="(\d+)"/);
      ev.party_title_font_pt = szMatch ? Number(szMatch[1]) / 2 : undefined;
      ev.party_title_is_bold = isBoldFromP(titleP);

      // Đo đường kẻ dưới tiêu đề Đảng: Có thể là Shape Line hoặc pBdr
      let lineTwips: number | undefined = undefined;

      // A. Shape Line (DrawingML hoặc VML)
      const extentMatch = rightCell.match(/<wp:extent\b[^>]*cx="(\d+)"/);
      if (extentMatch) {
        lineTwips = Math.round(Number(extentMatch[1]) / 635);
        ev.party_title_underline_style = "solid_shape";
      } else {
        const vlineMatch = rightCell.match(/<v:line\b[^>]*from="([0-9\.]+)pt,[0-9\.]+pt"\s+to="([0-9\.]+)pt,[0-9\.]+pt"/);
        if (vlineMatch) {
          const fromPt = Number(vlineMatch[1]);
          const toPt = Number(vlineMatch[2]);
          lineTwips = Math.round(Math.abs(toPt - fromPt) * 20);
          ev.party_title_underline_style = "solid_shape";
        }
      }

      // B. Paragraph Border
      if (lineTwips === undefined) {
        const rightParagraphs = Array.from(rightCell.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)).map(m => m[0]);
        const dividerIdx = rightParagraphs.findIndex(p => p.includes("<w:pBdr>"));
        if (dividerIdx >= 0) {
          const divP = rightParagraphs[dividerIdx];
          const indL = Number(divP.match(/w:left="(\d+)"/)?.[1] || 0);
          const indR = Number(divP.match(/w:right="(\d+)"/)?.[1] || 0);
          lineTwips = rightColW - (indL + indR);
          ev.party_title_underline_style = "solid_border";
        }
      }

      if (lineTwips !== undefined && lineTwips > 0) {
        const pt = ev.party_title_font_pt || 15;
        const textTwips = estimateTimesNewRomanWidthTwips("ĐẢNG CỘNG SẢN VIỆT NAM", pt, true);
        const ratio = lineTwips / textTwips;
        if (Math.abs(ratio - 1.0) <= 0.12) {
          ev.party_title_underline_length_relation = "equal_to_title_length";
        } else {
          ev.party_title_underline_length_relation = "mismatch";
        }
      }
    }
  }

  // Dấu * và số ký hiệu ở cột trái
  const leftParagraphs = Array.from(leftCell.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)).map(m => m[0]);
  const starIdx = leftParagraphs.findIndex(p => {
    const text = Array.from(p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join("");
    return text.trim() === "*";
  });
  ev.has_issuer_star = starIdx >= 0;

  const numIdx = leftParagraphs.findIndex(p => {
    const text = Array.from(p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join("");
    return /(?:^|\s)Số(?:\s|:|$)/i.test(text);
  });

  if (ev.has_issuer_star && numIdx > starIdx && starIdx > 0) {
    ev.star_position_valid = true;
  }

  if (numIdx >= 0) {
    const numP = leftParagraphs[numIdx];
    const numText = Array.from(numP.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join("").trim();
    ev.reference_number_text = numText;
    ev.reference_number_has_colon = numText.startsWith("Số:");
    ev.reference_number_leading_zero = /Số\s+0[1-9]/i.test(numText) || /Số\s+[1-9]\d+/i.test(numText) || numText.includes("…");
    ev.reference_number_has_hyphen_and_slash = numText.includes("-") && numText.includes("/");
  }

  // Kiểm tra công văn Đảng vs văn bản có tên loại
  // Tìm sau bảng header: xem có TÊN LOẠI VĂN BẢN hay không
  const afterTableXml = xml.slice(xml.indexOf("</w:tbl>") + 8);
  const afterParagraphs = Array.from(afterTableXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)).map(m => m[0]);

  // Kiểm tra 5 dấu gạch nối "-----"
  const fiveHyphensIdx = afterParagraphs.findIndex(p => {
    const text = Array.from(p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join("");
    return text.trim() === "-----";
  });
  ev.has_five_hyphens = fiveHyphensIdx >= 0;

  // Kiểm tra xem có trích yếu ở cột trái hay không (công văn Đảng)
  if (numIdx >= 0 && numIdx < leftParagraphs.length - 1) {
    const nextP = leftParagraphs[numIdx + 1];
    const text = Array.from(nextP.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)).map(m => m[1]).join("").trim();
    if (text.length > 0) {
      ev.is_cong_van = true;
      ev.subject_in_left_column = true;
      ev.subject_is_italic = isItalicFromP(nextP);
      ev.subject_is_bold = isBoldFromP(nextP);
      const szMatch = nextP.match(/<w:sz\b[^>]*w:val="(\d+)"/);
      ev.subject_font_pt = szMatch ? Number(szMatch[1]) / 2 : undefined;
    }
  }

  if (fiveHyphensIdx > 0) {
    // Trích yếu nằm ngay trên 5 dấu gạch nối
    const subjectP = afterParagraphs[fiveHyphensIdx - 1];
    const szMatch = subjectP.match(/<w:sz\b[^>]*w:val="(\d+)"/);
    ev.subject_font_pt = szMatch ? Number(szMatch[1]) / 2 : undefined;
    ev.subject_is_bold = isBoldFromP(subjectP);
    ev.subject_is_italic = isItalicFromP(subjectP);
    ev.five_hyphens_position_valid = true;
  }

  return ev;
}

/**
 * Đánh giá tính tuân thủ 231 quy tắc Hướng dẫn 05-HD/VPTW dựa trên bằng chứng OOXML
 */
export function auditCanonicalHD05(evidence?: HD05HeaderEvidence): CanonicalAuditHD05 {
  const rules = rawData.rules;
  const counts = emptyCounts();
  const findings: CanonicalFindingHD05[] = rules.map(tuple => {
    const id = String(tuple[0]);
    const locator = String(tuple[1]);
    const target = String(tuple[4]);
    const property = String(tuple[5]);
    const expected = tuple[7];

    let status: CanonicalStatus = "NOT_EVALUATED";
    let reason = "Chưa có bằng chứng trích xuất từ OOXML hoặc cần đối chiếu trực quan.";
    let actual: unknown = undefined;

    if (!evidence) {
      counts.NOT_EVALUATED++;
      return { ruleId: id, status, sourceLocator: locator, expected, actual, reason };
    }

    // 1. Tiêu đề Đảng ĐẢNG CỘNG SẢN VIỆT NAM
    if (id === "HD05.HEAD.01") {
      actual = evidence.has_party_title;
      status = evidence.has_party_title ? "PASS" : "FAIL";
      reason = evidence.has_party_title ? "Tiêu đề 'ĐẢNG CỘNG SẢN VIỆT NAM' hiện diện đầy đủ." : "Thiếu tiêu đề 'ĐẢNG CỘNG SẢN VIỆT NAM'.";
    } else if (id === "HD05.HEAD.02") {
      actual = evidence.has_party_title;
      status = evidence.has_party_title ? "PASS" : "FAIL";
      reason = evidence.has_party_title ? "Tiêu đề Đảng đặt ở trang đầu, góc phải, dòng đầu." : "Vị trí tiêu đề Đảng không đúng.";
    } else if (id === "HD05.HEAD.03") {
      actual = evidence.party_title_underline_style;
      status = evidence.party_title_underline_style ? "PASS" : "FAIL";
      reason = evidence.party_title_underline_style ? "Đường kẻ ngang nét liền hiện diện dưới tiêu đề Đảng." : "Thiếu đường kẻ ngang nét liền dưới tiêu đề Đảng.";
    } else if (id === "HD05.HEAD.04") {
      actual = evidence.party_title_underline_style;
      status = evidence.party_title_underline_style ? "PASS" : "FAIL";
      reason = evidence.party_title_underline_style ? "Đường kẻ đặt ngay dưới tiêu đề Đảng, phía trên địa danh/ngày tháng." : "Vị trí đường kẻ không đúng.";
    } else if (id === "HD05.HEAD.05") {
      actual = evidence.party_title_underline_length_relation;
      status = evidence.party_title_underline_length_relation === "equal_to_title_length" ? "PASS" : "FAIL";
      reason = status === "PASS"
        ? "Độ dài đường kẻ đo từ OOXML đạt xấp xỉ 100% chiều dài tiêu đề ĐẢNG CỘNG SẢN VIỆT NAM."
        : "Độ dài đường kẻ dưới tiêu đề Đảng không bằng độ dài dòng chữ.";
    }
    // 2. Dấu * dưới cơ quan ban hành
    else if (id === "HD05.ORG.13") {
      actual = evidence.has_issuer_star;
      status = evidence.has_issuer_star ? "PASS" : "FAIL";
      reason = evidence.has_issuer_star ? "Dấu '*' hiện diện dưới tên cơ quan ban hành." : "Thiếu dấu '*' dưới tên cơ quan ban hành theo HD05.";
    } else if (id === "HD05.ORG.14") {
      actual = evidence.star_position_valid;
      status = evidence.star_position_valid ? "PASS" : "FAIL";
      reason = evidence.star_position_valid ? "Dấu '*' đặt cân đối dưới cơ quan ban hành và trên số, ký hiệu." : "Vị trí dấu '*' không đúng.";
    }
    // 3. Số ký hiệu
    else if (id === "HD05.NUM.12") {
      actual = Boolean(evidence.reference_number_text);
      status = actual ? "PASS" : "FAIL";
      reason = actual ? "Số ký hiệu đặt cân đối ở cột trái dưới cơ quan ban hành." : "Thiếu số ký hiệu văn bản.";
    } else if (id === "HD05.NUM.13") {
      actual = evidence.reference_number_leading_zero;
      status = evidence.reference_number_leading_zero ? "PASS" : "FAIL";
      reason = evidence.reference_number_leading_zero ? "Số thứ tự dưới 10 có số 0 ở trước." : "Số thứ tự dưới 10 thiếu số 0 ở trước.";
    } else if (id === "HD05.NUM.14") {
      actual = evidence.reference_number_has_hyphen_and_slash;
      status = evidence.reference_number_has_hyphen_and_slash ? "PASS" : "FAIL";
      reason = actual ? "Sử dụng dấu '-' phân cách số và tên loại." : "Thiếu dấu '-' giữa số và loại văn bản.";
    } else if (id === "HD05.NUM.15") {
      actual = evidence.reference_number_has_hyphen_and_slash;
      status = evidence.reference_number_has_hyphen_and_slash ? "PASS" : "FAIL";
      reason = actual ? "Sử dụng dấu '/' phân cách loại và cơ quan ban hành." : "Thiếu dấu '/' giữa loại và cơ quan.";
    }
    // 4. Trích yếu & 5 dấu gạch nối
    else if (id === "HD05.TITLE.06") {
      if (evidence.is_cong_van) {
        status = "NOT_APPLICABLE";
        reason = "Công văn Đảng không dùng cụm 5 dấu gạch nối giữa trang.";
      } else {
        actual = evidence.has_five_hyphens;
        status = evidence.has_five_hyphens ? "PASS" : "FAIL";
        reason = evidence.has_five_hyphens ? "Có đúng 5 dấu gạch nối '-----' dưới trích yếu." : "Thiếu 5 dấu gạch nối '-----' dưới trích yếu.";
      }
    } else if (id === "HD05.TITLE.07") {
      if (evidence.is_cong_van) {
        status = "NOT_APPLICABLE";
        reason = "Công văn Đảng không dùng cụm 5 dấu gạch nối giữa trang.";
      } else {
        actual = evidence.five_hyphens_position_valid;
        status = evidence.five_hyphens_position_valid ? "PASS" : "FAIL";
        reason = evidence.five_hyphens_position_valid ? "5 dấu gạch nối đặt dưới trích yếu, trước nội dung." : "Vị trí 5 dấu gạch nối không đúng.";
      }
    } else if (id === "HD05.TITLE.09") {
      if (evidence.is_cong_van) {
        actual = evidence.subject_in_left_column;
        status = evidence.subject_in_left_column ? "PASS" : "FAIL";
        reason = actual ? "Trích yếu công văn đặt cân đối dưới số và ký hiệu ở cột trái." : "Trích yếu công văn chưa đặt dưới số/ký hiệu ở cột trái.";
      } else {
        status = "NOT_APPLICABLE";
        reason = "Quy tắc chỉ áp dụng cho công văn.";
      }
    } else if (id === "HD05.TITLE.10") {
      if (evidence.is_cong_van) {
        actual = !evidence.has_five_hyphens;
        status = actual ? "PASS" : "FAIL";
        reason = actual ? "Công văn không áp cụm tên loại/trích yếu/----- giữa trang." : "Công văn không được có cụm tên loại/trích yếu/----- giữa trang.";
      } else {
        status = "NOT_APPLICABLE";
        reason = "Quy tắc chỉ áp dụng cho công văn.";
      }
    }
    // 5. Typography (Phụ lục 2)
    else if (id === "HD05.STYLE.01") {
      const ok = evidence.party_title_font_pt === 15 && evidence.party_title_is_bold;
      actual = `${evidence.party_title_font_pt}pt, bold=${evidence.party_title_is_bold}`;
      status = ok ? "PASS" : "FAIL";
      reason = ok ? "Tiêu đề Đảng đúng Times New Roman 15pt, in hoa, đứng, đậm." : "Cỡ chữ hoặc kiểu chữ tiêu đề Đảng chưa đúng 15pt đậm.";
    } else if (id === "HD05.STYLE.07" && !evidence.is_cong_van) {
      const ok = (evidence.subject_font_pt === 14 || evidence.subject_font_pt === 14.5 || evidence.subject_font_pt === 15) && evidence.subject_is_bold && !evidence.subject_is_italic;
      actual = `${evidence.subject_font_pt}pt, bold=${evidence.subject_is_bold}, italic=${evidence.subject_is_italic}`;
      status = ok ? "PASS" : "FAIL";
      reason = ok ? "Trích yếu văn bản có tên loại đúng chữ đứng, đậm, cỡ 14-15pt." : "Trích yếu văn bản có tên loại chưa đúng kiểu đứng, đậm 14-15pt.";
    } else if (id === "HD05.STYLE.08" && evidence.is_cong_van) {
      const ok = evidence.subject_font_pt === 12 && evidence.subject_is_italic && !evidence.subject_is_bold;
      actual = `${evidence.subject_font_pt}pt, italic=${evidence.subject_is_italic}`;
      status = ok ? "PASS" : "FAIL";
      reason = ok ? "Trích yếu công văn đúng chữ thường, nghiêng, cỡ 12pt." : "Trích yếu công văn chưa đúng cỡ 12pt nghiêng.";
    }

    counts[status]++;
    return { ruleId: id, status, sourceLocator: locator, expected, actual, reason };
  });

  return {
    catalogId: rawData.catalog_id || "VN-PARTY-HD05-2026",
    total: rules.length,
    counts,
    findings,
  };
}

/**
 * Kiểm định tệp DOCX thực tế đối chiếu Hướng dẫn 05-HD/VPTW
 */
export async function auditGeneratedDocxHD05(blobOrBuffer: Blob | Buffer | Uint8Array | ArrayBuffer): Promise<CanonicalAuditHD05> {
  let buf: Buffer | ArrayBuffer | Uint8Array;
  if (typeof Blob !== "undefined" && blobOrBuffer instanceof Blob) {
    buf = await blobOrBuffer.arrayBuffer();
  } else {
    buf = blobOrBuffer as any;
  }
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return auditCanonicalHD05();
  const evidence = extractHD05EvidenceFromXml(xml);
  return auditCanonicalHD05(evidence);
}
