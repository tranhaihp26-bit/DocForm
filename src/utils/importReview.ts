import type { 
  StructuredImport, 
  SourceBlock, 
  AppendixDocument 
} from "../shared/schemas/document.schema.ts";
import { 
  parseOrgHeaders, 
  REF_NUMBER_REGEX, 
  DOC_TYPE_KEYWORDS, 
  DATE_LOCATION_REGEX,
  NATIONAL_HEADER_1_REGEX,
  NATIONAL_HEADER_2_REGEX
} from "../server/structuralSegmenter.ts";

export interface ReconstructedDocumentState {
  fields: {
    orgHeader1?: string;
    orgHeader2?: string;
    nationalHeader1?: string;
    nationalHeader2?: string;
    referenceNumber?: string;
    locationAndDate?: string;
    documentType?: string;
    subject?: string;
    signTitle?: string;
    signName?: string;
    recipients?: string;
  };
  draftNote?: string;
  bodyHtml: string;
  signatureHtml?: string;
  appendices: AppendixDocument[];
  unclassified: SourceBlock[];
  validationErrors: string[];
}

export function composeImportedBodyHtml(source: StructuredImport): string {
  // Single source of truth: Signature blocks belong to the signature region
  // (managed by signTitle/signName/recipients), NEVER appended to body.html.
  return source.body.html;
}

export function updateImportField(source: StructuredImport, field: string, value: string): StructuredImport {
  const previous = source.fields[field];
  if (!previous) return source;
  return {
    ...source,
    fields: {
      ...source.fields,
      [field]: { ...previous, value, status: "user_confirmed" },
    },
  };
}

export function deriveImportStatus(source: StructuredImport, approved: boolean): "confirmed" | "needs_review" {
  if (!approved || source.unclassified.length > 0) return "needs_review";
  if (Object.values(source.fields).some((field) => field.status === "missing" || field.status === "ambiguous")) {
    return "needs_review";
  }
  if (source.appendices.some((appendix) => appendix.extractionStatus === "needs_review")) {
    return "needs_review";
  }
  return "confirmed";
}

/**
 * Kiểm tra tính toàn vẹn của danh sách SourceBlock khi người dùng điều chỉnh phân vùng:
 * - Bảo đảm số lượng khối khớp với ban đầu (không mất khối, không thừa khối).
 * - Bảo đảm không có khối nào bị lặp lại (unique IDs).
 * - Đối chiếu chính xác tập ID khối đã duyệt với tập ID nguồn (phát hiện mất ID nguồn bị thay bằng ID mới).
 * - Bảo đảm các khối gán vào vùng chức năng (đầu trang, thể thức, khối ký) có đủ dữ liệu.
 * - Bảo đảm văn bản có ít nhất nội dung trong thân bài, phụ lục hoặc khối chưa phân loại.
 */
export function validateReviewedBlocks(
  blocks: SourceBlock[], 
  expectedSource?: number | string[] | SourceBlock[]
): string[] {
  const errors: string[] = [];

  if (!blocks || blocks.length === 0) {
    errors.push("Danh sách khối rà soát trống. Vui lòng tải lại tệp.");
    return errors;
  }

  // Chuẩn hóa expectedCount và expectedIds nếu được truyền vào
  let expectedCount: number | undefined;
  let expectedIds: Set<string> | undefined;

  if (typeof expectedSource === "number") {
    expectedCount = expectedSource;
  } else if (Array.isArray(expectedSource) && expectedSource.length > 0) {
    expectedCount = expectedSource.length;
    expectedIds = new Set(
      typeof expectedSource[0] === "string" 
        ? (expectedSource as string[]) 
        : (expectedSource as SourceBlock[]).map(b => b.id)
    );
  }

  // 1. Kiểm tra số lượng khối
  if (expectedCount !== undefined && expectedCount > 0 && blocks.length !== expectedCount) {
    errors.push(`Số lượng khối (${blocks.length}) không khớp với tài liệu gốc (${expectedCount} khối). Không thể xác nhận khi thiếu hoặc thừa khối.`);
  }

  // 2. Kiểm tra khối bị lặp (duplicate IDs)
  const idCounts = new Map<string, number>();
  for (const b of blocks) {
    idCounts.set(b.id, (idCounts.get(b.id) || 0) + 1);
  }
  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      errors.push(`Khối #${id.slice(0, 8)} bị lặp lại ${count} lần trong danh sách.`);
    }
  }

  // 3. Đối chiếu chính xác tập ID khối đã duyệt với tập ID nguồn
  if (expectedIds && expectedIds.size > 0) {
    const currentIdSet = new Set(blocks.map(b => b.id));

    // Phát hiện các ID nguồn bị mất
    const missingSourceIds: string[] = [];
    for (const srcId of expectedIds) {
      if (!currentIdSet.has(srcId)) {
        missingSourceIds.push(srcId);
      }
    }

    // Phát hiện các ID lạ/mới không tồn tại trong nguồn (ví dụ tráo đổi ID để giữ nguyên tổng số khối)
    const unknownNewIds: string[] = [];
    for (const curId of currentIdSet) {
      if (!expectedIds.has(curId)) {
        unknownNewIds.push(curId);
      }
    }

    if (missingSourceIds.length > 0 || unknownNewIds.length > 0) {
      if (missingSourceIds.length > 0 && unknownNewIds.length > 0) {
        errors.push(
          `Sai lệch định danh khối: Mất ${missingSourceIds.length} khối nguồn (${missingSourceIds.map(id => "#" + id.slice(0, 8)).join(", ")}) ` +
          `nhưng bị thay thế bằng ${unknownNewIds.length} khối không rõ nguồn gốc (${unknownNewIds.map(id => "#" + id.slice(0, 8)).join(", ")}).`
        );
      } else if (missingSourceIds.length > 0) {
        errors.push(
          `Phát hiện ${missingSourceIds.length} khối nguồn bị thất lạc: ${missingSourceIds.map(id => "#" + id.slice(0, 8)).join(", ")}.`
        );
      } else if (unknownNewIds.length > 0) {
        errors.push(
          `Phát hiện ${unknownNewIds.length} khối lạ không thuộc tài liệu nguồn: ${unknownNewIds.map(id => "#" + id.slice(0, 8)).join(", ")}.`
        );
      }
    }
  }

  // 4. Kiểm tra khối được gán vào vùng cần thêm thông tin nhưng chưa đủ dữ liệu
  for (const b of blocks) {
    const role = b.role || "unclassified";
    const textClean = (b.text || "").trim();
    const hasTableData = b.tableData && b.tableData.some(row => row.some(cell => cell.trim().length > 0));

    if (role === "header") {
      if (!textClean && !hasTableData) {
        errors.push(`Khối #${b.id.slice(0, 8)} được gán vào 'Đầu trang' nhưng rỗng hoàn toàn, không có thông tin cơ quan hay số hiệu.`);
      }
    } else if (role === "metadata") {
      if (!textClean && !hasTableData) {
        errors.push(`Khối #${b.id.slice(0, 8)} được gán vào 'Thông tin thể thức' nhưng không có nội dung chữ (tên loại hoặc trích yếu).`);
      }
    } else if (role === "signature") {
      if (!textClean && !hasTableData) {
        errors.push(`Khối #${b.id.slice(0, 8)} được gán vào 'Khối ký' nhưng không có nội dung chức vụ hay họ tên.`);
      }
    }
  }

  // 5. Kiểm tra tài liệu có ít nhất nội dung thể hiện
  const bodyBlocks = blocks.filter(b => b.role === "body");
  const appendixBlocks = blocks.filter(b => b.role === "appendix");
  const unclassifiedBlocks = blocks.filter(b => b.role === "unclassified");

  if (bodyBlocks.length === 0 && appendixBlocks.length === 0 && unclassifiedBlocks.length === 0) {
    errors.push("Văn bản chưa có nội dung trong thân bài, phụ lục hoặc khối chưa phân loại.");
  }

  return errors;
}

/**
 * Tái cấu trúc toàn bộ dữ liệu đích từ danh sách khối reviewBlocks đã được người dùng duyệt.
 * Không dùng các field cũ của structuredImport cho những khối đã đổi vùng.
 * Mỗi SourceBlock có đúng một vùng sở hữu xác định.
 */
export function reconstructFromReviewedBlocks(
  blocks: SourceBlock[],
  standardType: "state" | "party",
  baseImport?: StructuredImport
): ReconstructedDocumentState {
  const sourceBlocks = baseImport ? (baseImport.blocks || []) : [];
  const expectedSource = sourceBlocks.length > 0 
    ? sourceBlocks.map(b => b.id) 
    : (baseImport?.source?.blockCount || undefined);

  const validationErrors = validateReviewedBlocks(blocks, expectedSource);

  // Group blocks by role
  const headerBlocks = blocks.filter(b => b.role === "header");
  const metaBlocks = blocks.filter(b => b.role === "metadata");
  const bodyBlocks = blocks.filter(b => b.role === "body").sort((a, b) => a.index - b.index);
  const sigBlocks = blocks.filter(b => b.role === "signature" || b.role === "recipients");
  const appendixBlocks = blocks.filter(b => b.role === "appendix").sort((a, b) => a.index - b.index);
  const unclassifiedBlocks = blocks.filter(b => b.role === "unclassified").sort((a, b) => a.index - b.index);

  // 1. RECONSTRUCT HEADER REGION
  let orgHeader1 = "";
  let orgHeader2 = "";
  let draftNote = "";
  let nationalHeader1 = standardType === "party" ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
  let nationalHeader2 = standardType === "party" ? "" : "Độc lập - Tự do - Hạnh phúc";
  let locationAndDate = "";
  let referenceNumber = "";

  // Check if header blocks are unchanged from baseImport
  const baseHeaderBlockIds = new Set(
    baseImport ? [
      ...(baseImport.fields.orgHeader1?.sourceBlockIds || []),
      ...(baseImport.fields.orgHeader2?.sourceBlockIds || []),
      ...(baseImport.fields.nationalHeader1?.sourceBlockIds || []),
      ...(baseImport.fields.nationalHeader2?.sourceBlockIds || []),
      ...(baseImport.fields.locationAndDate?.sourceBlockIds || []),
      ...(baseImport.fields.referenceNumber?.sourceBlockIds || []),
    ] : []
  );

  const currentHeaderBlockIds = new Set(headerBlocks.map(b => b.id));
  const isHeaderUnchanged = baseImport && baseHeaderBlockIds.size > 0 && 
    baseHeaderBlockIds.size === currentHeaderBlockIds.size && 
    Array.from(baseHeaderBlockIds).every(id => currentHeaderBlockIds.has(id));

  if (isHeaderUnchanged && baseImport) {
    orgHeader1 = baseImport.fields.orgHeader1?.value || "";
    orgHeader2 = baseImport.fields.orgHeader2?.value || "";
    draftNote = baseImport.draftNote || "";
    nationalHeader1 = baseImport.fields.nationalHeader1?.value || nationalHeader1;
    nationalHeader2 = baseImport.fields.nationalHeader2?.value ?? nationalHeader2;
    locationAndDate = baseImport.fields.locationAndDate?.value || "";
    referenceNumber = baseImport.fields.referenceNumber?.value || "";
  } else if (headerBlocks.length > 0) {
    // Dynamically reconstruct header from current header blocks
    for (const b of headerBlocks) {
      if (b.kind === "table" && b.tableData && b.tableData.length > 0 && b.tableData[0].length >= 2) {
        // Table header: column 0 is left (org, ref, draftNote), column 1 is right (national, date)
        const leftText = b.tableData.map(r => r[0]).filter(Boolean).join("\n");
        const rightText = b.tableData.map(r => r[1]).filter(Boolean).join("\n");

        const leftLines = leftText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const nonRefLines: string[] = [];
        for (const line of leftLines) {
          const refMatch = line.match(REF_NUMBER_REGEX);
          if (refMatch && !referenceNumber) {
            referenceNumber = line.startsWith("Số:") ? line : `Số: ${line.replace(/^Số\s*/i, "").trim()}`;
          } else if (!line.includes("---") && !line.includes("___")) {
            nonRefLines.push(line);
          }
        }
        const orgs = parseOrgHeaders(nonRefLines);
        orgHeader1 = orgs.orgHeader1 || "";
        orgHeader2 = orgs.orgHeader2 || "";
        if (orgs.draftNote) draftNote = orgs.draftNote;

        const rightLines = rightText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of rightLines) {
          if (NATIONAL_HEADER_1_REGEX.test(line)) {
            nationalHeader1 = /ĐẢNG/i.test(line) ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
          }
          if (NATIONAL_HEADER_2_REGEX.test(line)) {
            nationalHeader2 = "Độc lập - Tự do - Hạnh phúc";
          }
          const dMatch = line.match(DATE_LOCATION_REGEX);
          if (dMatch) {
            locationAndDate = dMatch[0].trim();
          }
        }
      } else {
        // Paragraphs in header
        const lines = (b.text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const nonRefLines: string[] = [];
        for (const line of lines) {
          if (NATIONAL_HEADER_1_REGEX.test(line)) {
            nationalHeader1 = /ĐẢNG/i.test(line) ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
            continue;
          }
          if (NATIONAL_HEADER_2_REGEX.test(line)) {
            nationalHeader2 = "Độc lập - Tự do - Hạnh phúc";
            continue;
          }
          const dMatch = line.match(DATE_LOCATION_REGEX);
          if (dMatch) {
            locationAndDate = dMatch[0].trim();
            continue;
          }
          const refMatch = line.match(REF_NUMBER_REGEX);
          if (refMatch && !referenceNumber) {
            if (/^Số\s*[:\s]/i.test(line)) {
              referenceNumber = line.trim();
            } else {
              referenceNumber = standardType === "party" ? `Số ${line.trim()}` : `Số: ${line.trim()}`;
            }
            continue;
          }
          nonRefLines.push(line);
        }
        if (nonRefLines.length > 0) {
          const orgs = parseOrgHeaders(nonRefLines);
          if (orgs.orgHeader1) orgHeader1 = orgs.orgHeader1;
          if (orgs.orgHeader2) orgHeader2 = orgs.orgHeader2;
          if (orgs.draftNote) draftNote = orgs.draftNote;
        }
      }
    }
  }

  // 2. RECONSTRUCT METADATA REGION
  let documentType = "";
  let subject = "";

  const baseMetaBlockIds = new Set(
    baseImport ? [
      ...(baseImport.fields.documentType?.sourceBlockIds || []),
      ...(baseImport.fields.subject?.sourceBlockIds || []),
    ] : []
  );
  const currentMetaBlockIds = new Set(metaBlocks.map(b => b.id));
  const isMetaUnchanged = baseImport && baseMetaBlockIds.size > 0 &&
    baseMetaBlockIds.size === currentMetaBlockIds.size &&
    Array.from(baseMetaBlockIds).every(id => currentMetaBlockIds.has(id));

  if (isMetaUnchanged && baseImport) {
    documentType = baseImport.fields.documentType?.value || "";
    subject = baseImport.fields.subject?.value || "";
    if (!referenceNumber) referenceNumber = baseImport.fields.referenceNumber?.value || "";
  } else if (metaBlocks.length > 0) {
    for (const b of metaBlocks) {
      const text = (b.text || "").trim();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const upper = line.toUpperCase();
        const matchedDocType = DOC_TYPE_KEYWORDS.find(kw => upper === kw || upper.startsWith(kw + " ") || upper.startsWith(kw + ":"));
        if (matchedDocType && !documentType) {
          documentType = matchedDocType;
          const remainder = line.slice(matchedDocType.length).replace(/^[:\s-]+/, "").trim();
          if (remainder && !subject) {
            subject = remainder;
          }
        } else if (/^(?:V\/v|Về việc)\s+/i.test(line)) {
          if (!subject) subject = line;
        } else if (!subject && documentType && line !== documentType) {
          subject = line;
        }
      }
    }
  }

  // 3. RECONSTRUCT BODY REGION
  const bodyHtml = bodyBlocks.map(b => b.html || `<p>${b.text}</p>`).join("");

  // 4. RECONSTRUCT SIGNATURE & RECIPIENTS REGION
  let signTitle = "";
  let signName = "";
  let recipients = "";
  let signatureHtml: string | undefined = undefined;

  const baseSigBlockIds = new Set(
    baseImport ? [
      ...(baseImport.fields.signTitle?.sourceBlockIds || []),
      ...(baseImport.fields.signName?.sourceBlockIds || []),
      ...(baseImport.fields.recipients?.sourceBlockIds || []),
    ] : []
  );
  const currentSigBlockIds = new Set(sigBlocks.map(b => b.id));
  const isSigUnchanged = baseImport && baseSigBlockIds.size > 0 &&
    baseSigBlockIds.size === currentSigBlockIds.size &&
    Array.from(baseSigBlockIds).every(id => currentSigBlockIds.has(id));

  if (isSigUnchanged && baseImport) {
    signTitle = baseImport.fields.signTitle?.value || "";
    signName = baseImport.fields.signName?.value || "";
    recipients = baseImport.fields.recipients?.value || "";
    signatureHtml = baseImport.signatureHtml;
  } else if (sigBlocks.length > 0) {
    for (const b of sigBlocks) {
      if (b.kind === "table" && b.tableData && b.tableData.length > 0) {
        const numCols = b.tableShape?.columns || b.tableData[0]?.length || 1;
        const leftText = b.tableData.map(r => r[0] || "").filter(Boolean).join("\n");
        const hasExplicitRecipients = /Nơi nhận\s*:/i.test(leftText);

        if (numCols >= 2 && !hasExplicitRecipients) {
          // Multi-signer table without recipients (Biên bản làm việc, thoả thuận, etc.)
          const titles: string[] = [];
          const names: string[] = [];
          for (let col = 0; col < numCols; col++) {
            const colLines = b.tableData.map(r => (r[col] || "").trim()).filter(Boolean);
            const cleanLines = colLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
            if (cleanLines.length >= 2) {
              titles.push(cleanLines.slice(0, -1).join("\n"));
              names.push(cleanLines[cleanLines.length - 1]);
            } else if (cleanLines.length === 1) {
              titles.push(cleanLines[0]);
              names.push("");
            }
          }
          if (titles.length > 0) {
            signTitle = titles.join(" | ");
            signName = names.join(" | ");
          }
        } else if (numCols >= 2 && hasExplicitRecipients) {
          // Table with recipients in Col 0, signers in remaining columns
          recipients = leftText;
          if (numCols > 2) {
            const titles: string[] = [];
            const names: string[] = [];
            for (let col = 1; col < numCols; col++) {
              const colLines = b.tableData.map(r => (r[col] || "").trim()).filter(Boolean);
              const cleanLines = colLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
              if (cleanLines.length >= 2) {
                titles.push(cleanLines.slice(0, -1).join("\n"));
                names.push(cleanLines[cleanLines.length - 1]);
              } else if (cleanLines.length === 1) {
                titles.push(cleanLines[0]);
                names.push("");
              }
            }
            if (titles.length > 0) {
              signTitle = titles.join(" | ");
              signName = names.join(" | ");
            }
          } else {
            // Standard 2 columns: Col 0 recipients, Col 1 single signer
            const rightText = b.tableData.map(r => r[1] || "").filter(Boolean).join("\n");
            const rightLines = rightText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const cleanRight = rightLines.filter(l => !/^\s*[\(\[](?:k[ýí]|ghi rõ|đóng dấu|chữ ký).*?[\)\]]\s*$/i.test(l));
            if (cleanRight.length >= 2) {
              signTitle = cleanRight.slice(0, -1).join("\n");
              signName = cleanRight[cleanRight.length - 1];
            } else if (cleanRight.length === 1) {
              signTitle = cleanRight[0];
            }
          }
        }
      } else {
        // Paragraphs in signature / recipients
        const text = (b.text || "").trim();
        if (b.role === "recipients" || /^Nơi nhận\s*:/i.test(text)) {
          recipients = recipients ? `${recipients}\n${text}` : text;
        } else {
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length === 1) {
            if (/^[A-ZÀ-Ỹ\s]+$/.test(lines[0]) && lines[0].length > 3 && !/TM\.|KT\.|TL\./i.test(lines[0])) {
              signName = lines[0];
            } else {
              signTitle = signTitle ? `${signTitle}\n${lines[0]}` : lines[0];
            }
          } else if (lines.length >= 2) {
            signTitle = lines.slice(0, lines.length - 1).join("\n");
            signName = lines[lines.length - 1];
          }
        }
      }
    }
  }

  // 5. RECONSTRUCT APPENDICES
  let appendices: AppendixDocument[] = [];
  if (baseImport && baseImport.appendices && baseImport.appendices.length > 0) {
    // Preserve base appendices whose blocks are still assigned to appendix
    for (const app of baseImport.appendices) {
      const stillInApp = app.blocks.filter(b => blocks.some(rb => rb.id === b.id && rb.role === "appendix"));
      if (stillInApp.length > 0) {
        appendices.push({
          ...app,
          blocks: stillInApp,
          html: stillInApp.map(b => b.html || `<p>${b.text}</p>`).join(""),
          sourceBlockIds: stillInApp.map(b => b.id),
        });
      }
    }
  }

  // Find blocks assigned to appendix that are not yet in any appendix
  const accountedAppBlockIds = new Set(appendices.flatMap(a => a.sourceBlockIds));
  const newAppBlocks = appendixBlocks.filter(b => !accountedAppBlockIds.has(b.id));
  if (newAppBlocks.length > 0) {
    appendices.push({
      id: `appendix-${appendices.length + 1}`,
      title: `Phụ lục ${appendices.length > 0 ? (appendices.length + 1) : ""}`.trim(),
      html: newAppBlocks.map(b => b.html || `<p>${b.text}</p>`).join(""),
      blocks: newAppBlocks,
      sourceBlockIds: newAppBlocks.map(b => b.id),
      extractionStatus: "confirmed",
    });
  }

  // 6. RECONSTRUCT UNCLASSIFIED
  const unclassified = unclassifiedBlocks;

  return {
    fields: {
      orgHeader1,
      orgHeader2,
      nationalHeader1,
      nationalHeader2,
      referenceNumber,
      locationAndDate,
      documentType,
      subject,
      signTitle,
      signName,
      recipients,
    },
    draftNote,
    bodyHtml,
    signatureHtml,
    appendices,
    unclassified,
    validationErrors,
  };
}
