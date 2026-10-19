/**
 * @file parser.ts
 * @description Pure rule-based parser for document structure, fallback processing, and type recognition.
 */

export function detectDocumentType(rawText: string, standardType: string = 'state'): string {
  const isParty = standardType === 'party' || rawText.includes("ĐẢNG CỘNG SẢN") || rawText.includes("ĐẢNG BỘ");
  
  // Search top portion (~30 lines / 1500 chars) for explicit type heading on standalone lines
  const topText = rawText.slice(0, 1500);
  const topLines = topText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  let docType = "CÔNG VĂN";
  const docTypeKeywords = ["QUYẾT ĐỊNH", "KẾ HOẠCH", "TỜ TRÌNH", "THÔNG BÁO", "NGHỊ QUYẾT", "BÁO CÁO", "BIÊN BẢN", "NGHỊ ĐỊNH", "CHỈ THỊ", "HƯỚNG DẪN", "CÔNG VĂN"];
  
  for (const line of topLines.slice(0, 15)) {
    const upper = line.toUpperCase();
    for (const kw of docTypeKeywords) {
      if (upper === kw || upper.startsWith(kw + " ") || upper.startsWith(kw + ":") || upper.startsWith(kw + " VỀ") || upper.startsWith(kw + " TỔ CHỨC")) {
        docType = kw;
        break;
      }
    }
    if (docType !== "CÔNG VĂN") break;
  }

  if (docType === "CÔNG VĂN") {
    if (/\bKẾ HOẠCH\b/i.test(topText)) docType = "KẾ HOẠCH";
    else if (/\bBIÊN BẢN\b/i.test(topText)) docType = "BIÊN BẢN";
    else if (/\bQUYẾT ĐỊNH\b/i.test(topText)) docType = "QUYẾT ĐỊNH";
    else if (/\bTỜ TRÌNH\b/i.test(topText)) docType = "TỜ TRÌNH";
    else if (/\bTHÔNG BÁO\b/i.test(topText)) docType = "THÔNG BÁO";
    else if (/\bNGHỊ QUYẾT\b/i.test(topText)) docType = isParty ? "NGHỊ QUYẾT" : "NGHỊ ĐỊNH / NGHỊ QUYẾT";
    else if (/\bBÁO CÁO\b/i.test(topText)) docType = "BÁO CÁO";
  }

  return docType;
}

export function fallbackRuleBasedParser(rawText: string, standardType: string, rawHtml?: string) {
  const isParty = standardType === 'party' || rawText.includes("ĐẢNG CỘNG SẢN") || rawText.includes("ĐẢNG BỘ");
  
  // 1. Structural Document Type Detection (FIX-02, E2E-01)
  const docType = detectDocumentType(rawText, standardType);

  // 2. Preserve HTML structure & tables with appendix separation (P0-04, FIX-03, FIX-04)
  let htmlBody = "";
  const appendices: any[] = [];

  if (rawHtml && (rawHtml.includes("<table") || rawHtml.trim().length > 0)) {
    // Check if rawHtml contains an appendix section
    const appendixMatch = rawHtml.search(/<p[^>]*>(?:<strong>|<em>|\s)*PHỤ LỤC\b/i);
    if (appendixMatch !== -1) {
      htmlBody = rawHtml.slice(0, appendixMatch).trim();
      const appendixHtml = rawHtml.slice(appendixMatch).trim();
      appendices.push({
        id: "appendix-1",
        title: "PHỤ LỤC",
        referenceText: "",
        html: appendixHtml,
        blocks: [],
        sourceBlockIds: [],
        extractionStatus: "confirmed" as const,
      });
    } else {
      htmlBody = rawHtml;
    }
  } else {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      if (/^(Điều|Khoản|Điểm)\s+\d+/i.test(line)) {
        htmlBody += `<p><strong>${line}</strong></p>`;
      } else if (/^(Căn cứ|Xét đề nghị|Theo quy định)/i.test(line)) {
        htmlBody += `<p><strong>${line}</strong></p>`;
      } else if (line.toUpperCase() === docType || /^(QUYẾT ĐỊNH:|NỘI DUNG:)/i.test(line)) {
        htmlBody += `<p style="text-align: center;"><strong>${line}</strong></p>`;
      } else {
        htmlBody += `<p>${line}</p>`;
      }
    });
  }

  if (!htmlBody) {
    htmlBody = `<p>${rawText}</p>`;
  }

  const refMatch = rawText.match(/Số:\s*([^\n\r,]+)/i) || rawText.match(/Số\s*([0-9]+[^\n\r,]*)/i);
  const refNum = refMatch ? `Số: ${refMatch[1].trim()}` : `Số: .../${docType.slice(0, 2).toUpperCase()}`;

  const subjMatch = rawText.match(/V\/v\s*([^\n\r]+)/i) || rawText.match(/Trích yếu:\s*([^\n\r]+)/i);
  const subjectStr = subjMatch ? subjMatch[1].trim() : `V/v ${docType.toLowerCase()} theo quy định`;

  return {
    orgHeader1: "",
    orgHeader2: isParty ? "[CƠ QUAN ĐẢNG BAN HÀNH]" : "[TÊN CƠ QUAN BAN HÀNH]",
    nationalHeader1: isParty ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: isParty ? "" : "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "[Địa danh], ngày ... tháng ... năm ...",
    documentType: docType,
    referenceNumber: refNum,
    subject: subjectStr,
    bodyHtml: htmlBody,
    signTitle: isParty ? "T/M BAN THƯỜNG VỤ\n[CHỨC VỤ]" : "TM. ỦY BAN NHÂN DÂN\n[CHỨC VỤ]",
    signName: "[Họ và tên người ký]",
    recipients: isParty ? "Như trên;\nLưu: VT, Ban Tổ chức." : "Như trên;\nLưu: VT, TH.",
    appendices,
  };
}
