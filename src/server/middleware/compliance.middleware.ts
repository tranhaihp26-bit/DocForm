/**
 * @file compliance.middleware.ts
 * @description Compliance Middleware & Hybrid Safety Net cho Nghị định số 30/2020/NĐ-CP
 * và Hướng dẫn số 05-HD/VPTW.
 * 
 * NGUYÊN TẮC:
 * 1. "AI gợi ý ngữ nghĩa, Rule Engine chốt hạ thể thức": AI chỉ phụ trách phân tích và sinh nội dung thô.
 *    Toàn bộ cấu trúc quy chuẩn cứng (Quốc hiệu, Tiêu ngữ, Font, Size, Lề) do Rule Engine quyết định.
 * 2. "Zero Trust AI Output": Mọi output từ AI đều bị coi là không đáng tin cậy cho tới khi được ghi đè
 *    (Override) và xác thực thành công qua Zod Schema.
 */

import { DocumentFormatSchema, type DocumentFormatType, LOCATION_AND_DATE_REGEX, isPlaceholderValue } from "../../shared/schemas/document.schema.ts";

/**
 * Tạo chuỗi địa danh và ngày, tháng, năm theo đúng quy định Phụ lục I Mục II.2 Nghị định 30/2020/NĐ-CP:
 * - Đối với những ngày nhỏ hơn 10 (từ ngày 01 đến ngày 09) và tháng 1, tháng 2 phải ghi thêm số 0 ở trước.
 * - Ví dụ: "Hà Nội, ngày 05 tháng 02 năm 2026", "Hải Phòng, ngày 15 tháng 3 năm 2026".
 */
export function formatStandardDate(location: string = "[Địa danh]", date: Date = new Date()): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const dayStr = day < 10 ? `0${day}` : `${day}`;
  const monthStr = (month === 1 || month === 2) ? `0${month}` : `${month}`;
  const cleanLocation = location.trim().replace(/,$/, "") || "[Địa danh]";
  return `${cleanLocation}, ngày ${dayStr} tháng ${monthStr} năm ${year}`;
}

/**
 * Trích xuất địa danh từ chuỗi do AI sinh ra (nếu có)
 */
export function extractLocation(rawDateStr?: string): string {
  if (!rawDateStr || typeof rawDateStr !== "string") return "";
  
  let loc = "";
  const commaIdx = rawDateStr.indexOf(",");
  if (commaIdx > 0) {
    loc = rawDateStr.slice(0, commaIdx).trim();
  } else {
    const ngayMatch = rawDateStr.match(/^(.*?)\s+ngày/i);
    if (ngayMatch && ngayMatch[1]) {
      loc = ngayMatch[1].trim();
    }
  }

  if (loc && loc.length >= 2 && !isPlaceholderValue(loc) && !/^(ngày|tháng|năm|số|cộng|độc|tiêu)/i.test(loc)) {
    return loc;
  }

  return "";
}

/**
 * Chuẩn hóa số ký hiệu văn bản theo NĐ 30 Điều 10 (Hành chính) hoặc HD 05 Phần II.I.3.2.1 (Đảng)
 * - Văn bản hành chính: Bắt đầu bằng tiền tố "Số: "
 * - Văn bản Đảng: Bắt đầu bằng tiền tố "Số " (KHÔNG có dấu hai chấm ":")
 */
export function normalizeReferenceNumber(
  rawNum?: string,
  docType: string = "CV",
  regime: "administrative" | "party" = "administrative"
): string {
  if (!rawNum || typeof rawNum !== "string" || !rawNum.trim() || rawNum.includes("...") || rawNum.includes("…")) {
    const acronym = docType
      .split(/\s+/)
      .map(w => w[0]?.toUpperCase())
      .filter(Boolean)
      .join("") || "CV";
    return regime === "party" ? `Số ...-${acronym}/...` : `Số: .../${acronym}`;
  }

  let clean = rawNum.trim();
  if (regime === "party") {
    if (clean.startsWith("Số:")) {
      clean = clean.replace(/^Số:\s*/, "Số ");
    } else if (!clean.startsWith("Số ")) {
      clean = `Số ${clean}`;
    }
  } else {
    if (!clean.startsWith("Số:") && !clean.startsWith("Số ")) {
      clean = `Số: ${clean}`;
    } else if (clean.startsWith("Số ") && !clean.startsWith("Số: ")) {
      clean = clean.replace(/^Số\s+/, "Số: ");
    }
  }

  return clean;
}

/**
 * Làm sạch và định dạng lại nội dung HTML để đảm bảo an toàn & đúng ngữ nghĩa
 */
export function sanitizeBodyHtml(rawHtml?: string): string {
  if (!rawHtml || typeof rawHtml !== "string" || !rawHtml.trim()) {
    return "<p>Văn bản chưa có nội dung chi tiết.</p>";
  }

  // Loại bỏ các thẻ nguy hiểm
  let cleaned = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, "")
    .replace(/<\/?(form|input|button|textarea|select|option)\b[^>]*>/gi, "")
    .replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']?\s*javascript:[^"'>]*["']?/gi, 'href="#"')
    .trim();

  // Đảm bảo văn bản được bọc trong các thẻ đoạn văn nếu chỉ là plain text
  if (!/<(p|div|h[1-6]|ul|ol|table)/i.test(cleaned)) {
    cleaned = cleaned
      .split(/\r?\n\r?\n/)
      .filter(Boolean)
      .map(par => `<p>${par.trim()}</p>`)
      .join("");
  }

  return cleaned;
}

/**
 * Compliance Middleware: Cưỡng chế thực thi 100% tiêu chuẩn Nghị định 30/2020/NĐ-CP & Hướng dẫn 05-HD/VPTW.
 * 
 * Lớp này sẽ:
 * 1. Ghi đè (Override) toàn bộ các trường thể thức bắt buộc (Quốc hiệu, Tiêu ngữ, Font, Size).
 * 2. Giữ nguyên tính trung thực, không tự bịa đặt thông tin nghiệp vụ giả (người ký, số ký hiệu, cơ quan).
 * 3. Chạy qua Zod Schema Validation để bảo đảm tính đúng đắn và an toàn kiểu dữ liệu.
 */
export function enforceND30Standards(
  rawAiJson: any,
  regime: "administrative" | "party" = "administrative"
): DocumentFormatType {
  const isParty = regime === "party";
  const source = typeof rawAiJson === "object" && rawAiJson !== null ? rawAiJson : {};

  // 1. RULE OVERRIDE: Quốc hiệu (Dòng 1)
  const nationalHeader1 = isParty
    ? "ĐẢNG CỘNG SẢN VIỆT NAM"
    : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";

  // 2. RULE OVERRIDE: Tiêu ngữ (Dòng 2)
  const nationalHeader2 = isParty ? "" : ("Độc lập - Tự do - Hạnh phúc" as const);

  // 3. RULE OVERRIDE: Phông chữ & Cỡ chữ bắt buộc (NĐ 30: 13pt; HD 05: 14pt)
  const fontFamily = "Times New Roman" as const;
  const fontSize = (isParty ? 14 : 13) as 13 | 14;

  // 4. RULE OVERRIDE: Loại văn bản chuẩn hóa
  const documentType = (source.documentType || (isParty ? "NGHỊ QUYẾT" : "CÔNG VĂN")).toString().trim().toUpperCase();

  // 5. RULE REPAIR: Số và ký hiệu văn bản (Không tự bịa số giả, phân biệt theo regime)
  const referenceNumber = normalizeReferenceNumber(source.referenceNumber, documentType, regime);

  // 6. RULE REPAIR: Địa danh và Ngày tháng năm (Không tự bịa ngày nếu không có)
  let locationAndDate = (source.locationAndDate || "").toString().trim();
  if (!locationAndDate || locationAndDate === "[Địa danh], ngày ... tháng ... năm ...") {
    locationAndDate = "[Địa danh], ngày ... tháng ... năm ...";
  } else if (!LOCATION_AND_DATE_REGEX.test(locationAndDate)) {
    const loc = extractLocation(locationAndDate);
    if (loc) {
      locationAndDate = `${loc}, ngày ... tháng ... năm ...`;
    } else {
      locationAndDate = "[Địa danh], ngày ... tháng ... năm ...";
    }
  }

  // 7. Cơ quan ban hành (Không tự bịa cơ quan cụ thể)
  const orgHeader1 = (source.orgHeader1 || "").toString().trim().toUpperCase();
  const orgHeader2 = (source.orgHeader2 || (isParty ? "[CƠ QUAN ĐẢNG BAN HÀNH]" : "[TÊN CƠ QUAN BAN HÀNH]")).toString().trim().toUpperCase();

  // 8. Trích yếu nội dung
  const defaultSubject = isParty
    ? (documentType === "CÔNG VĂN" ? "V/v ..." : `${documentType.toLowerCase()} về ...`)
    : (documentType === "BIÊN BẢN" ? "Biên bản ..." : `V/v ${documentType.toLowerCase()} theo quy định`);
  const subject = (source.subject || defaultSubject).toString().trim();

  // 9. Nội dung chi tiết được làm sạch HTML
  const bodyHtml = sanitizeBodyHtml(source.bodyHtml);

  // 10. Chức vụ & Người ký (Không tự bịa 'Nguyễn Văn A')
  const defaultSignTitle = isParty ? "T/M BAN THƯỜNG VỤ\n[CHỨC VỤ]" : "TM. ỦY BAN NHÂN DÂN\n[CHỨC VỤ]";
  const signTitle = (source.signTitle || defaultSignTitle).toString().trim();
  const signName = (source.signName && source.signName !== "Nguyễn Văn A") ? source.signName.toString().trim() : "[Họ và tên người ký]";

  // 11. Nơi nhận
  const defaultRecipients = isParty
    ? "Như trên;\nLưu: VT, Ban Tổ chức."
    : "Như trên;\nLưu: VT, TH.";
  const recipients = (source.recipients || defaultRecipients).toString().trim();

  // Tạo đối tượng đã chuẩn hóa toàn diện
  const normalizedCandidate = {
    regime,
    headerProfile: source.headerProfile,
    nationalHeader1,
    nationalHeader2,
    fontFamily,
    fontSize,
    orgHeader1,
    orgHeader2,
    locationAndDate,
    documentType,
    referenceNumber,
    subject,
    bodyHtml,
    signTitle,
    signName,
    recipients,
    appendices: Array.isArray(source.appendices) ? source.appendices : [],
    unclassified: Array.isArray(source.unclassified) ? source.unclassified : [],
    importMetadata: source.importMetadata,
  };

  // 12. ZERO TRUST: Chạy qua Zod Schema Validation
  const validated = DocumentFormatSchema.parse(normalizedCandidate);
  return validated;
}
