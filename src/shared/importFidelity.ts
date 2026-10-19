/**
 * @file importFidelity.ts
 * @description Manifest và cổng an toàn (safety gate) bảo toàn độ chính xác tài liệu và bảng biểu nhập khẩu.
 * Đảm bảo nguyên tắc: fail-closed trước khi chứng minh roundtrip, không làm mất cấu trúc, và luôn bảo toàn đường lấy lại tệp gốc.
 */

export type UnsupportedFeatureCode =
  | "nested_table"
  | "drawing_or_image"
  | "complex_field"
  | "hyperlink_in_table"
  | "vmerge_continue_has_content"
  | "vmerge_unsupported"
  | "unsupported_table_geometry"
  | "unverified_roundtrip"
  | "content_overflow";

export interface UnsupportedFeature {
  code: UnsupportedFeatureCode;
  tableId?: string;
  blockId?: string;
  description: string;
}

export interface ImportFidelityManifest {
  sourceKind: "uploaded_docx" | "uploaded_txt" | "system_template" | "scratch";
  sourceHash?: string;
  sourceFilename?: string;
  sourceBlockIds: string[];
  tableIds: string[];
  unsupportedFeatures: UnsupportedFeature[];
  changedBlockIds?: string[];
  roundtripProven?: boolean;
}

export interface ExportSafetyViolation {
  code: string;
  tableId?: string;
  blockId?: string;
  messageVi: string;
  canDownloadOriginal: boolean;
}

export interface ExportSafetyResult {
  decision: "allow" | "reject";
  violations: ExportSafetyViolation[];
  canDownloadOriginal: boolean;
  userNotice?: string;
}

/**
 * Đánh giá độ an toàn xuất bản Word biến đổi.
 * Không khẳng định sai pháp lý; chỉ phản ánh an toàn cấu trúc và bảo toàn dữ liệu.
 */
export function assessExportSafety(
  manifest: ImportFidelityManifest | null | undefined,
  proposedDocument?: {
    candidateFidelityResult?: { safe: boolean; diffs: any[]; violations: any[] };
    roundtripVerified?: boolean;
    [key: string]: any;
  }
): ExportSafetyResult {
  // Kiểm tra tính toàn vẹn candidate DOCX: nếu candidate không an toàn, từ chối xuất bất kể manifest
  if (proposedDocument?.candidateFidelityResult && !proposedDocument.candidateFidelityResult.safe) {
    const violations: ExportSafetyViolation[] = [];
    const canDownloadOriginal = Boolean(manifest?.sourceHash || manifest?.sourceFilename);
    for (const diff of proposedDocument.candidateFidelityResult.diffs || []) {
      violations.push({
        code: diff.type,
        tableId: diff.tableId,
        messageVi: diff.messageVi,
        canDownloadOriginal,
      });
    }
    for (const v of proposedDocument.candidateFidelityResult.violations || []) {
      violations.push(v);
    }
    const errorSummary = violations.length > 0
      ? violations.map(v => v.messageVi).join(" ")
      : ((proposedDocument.candidateFidelityResult as any)?.summaryVi || "Tệp DOCX ứng viên không hợp lệ.");
    return {
      decision: "reject",
      violations,
      canDownloadOriginal,
      userNotice: `Xuất bản Word biến đổi bị từ chối để bảo vệ toàn vẹn dữ liệu. Lý do: ${errorSummary}`,
    };
  }

  // 1. Văn bản tạo mới hoặc không có nguồn DOCX -> An toàn xuất, không bị ràng buộc bởi bảng nhập
  if (!manifest || manifest.sourceKind === "system_template" || manifest.sourceKind === "scratch" || manifest.sourceKind === "uploaded_txt") {
    return {
      decision: "allow",
      violations: [],
      canDownloadOriginal: false,
    };
  }

  const violations: ExportSafetyViolation[] = [];
  const canDownloadOriginal = Boolean(manifest.sourceHash || manifest.sourceFilename);

  // 2. Kiểm tra các tính năng chưa hỗ trợ đã phát hiện
  if (manifest.unsupportedFeatures && manifest.unsupportedFeatures.length > 0) {
    for (const feat of manifest.unsupportedFeatures) {
      violations.push({
        code: feat.code,
        tableId: feat.tableId,
        blockId: feat.blockId,
        messageVi: `Bảng biểu ${feat.tableId || ""} chứa tính năng chưa hỗ trợ bảo toàn trọn vẹn: ${feat.description}.`,
        canDownloadOriginal,
      });
    }
  }

  // 3. Quy tắc Fail-Closed: Bảng biểu nhập khẩu từ DOCX bắt buộc phải được chứng minh roundtrip an toàn trên chính candidate
  const isCandidateVerified = proposedDocument?.candidateFidelityResult
    ? proposedDocument.candidateFidelityResult.safe
    : (proposedDocument?.roundtripVerified ?? manifest.roundtripProven);

  if (proposedDocument?.candidateFidelityResult && !proposedDocument.candidateFidelityResult.safe) {
    for (const diff of proposedDocument.candidateFidelityResult.diffs) {
      violations.push({
        code: diff.type,
        tableId: diff.tableId,
        messageVi: diff.messageVi,
        canDownloadOriginal,
      });
    }
    for (const v of proposedDocument.candidateFidelityResult.violations) {
      violations.push(v);
    }
  }

  if (manifest.tableIds && manifest.tableIds.length > 0 && !isCandidateVerified) {
    // Nếu chưa có vi phạm cùng loại, bổ sung cảnh báo unverified_roundtrip
    if (!violations.some(v => v.code === "unverified_roundtrip")) {
      violations.push({
        code: "unverified_roundtrip",
        messageVi: "Bảng biểu từ tệp DOCX nhập khẩu chưa được chứng minh roundtrip bảo toàn ô gộp/lưới OOXML an toàn trên bản xuất này.",
        canDownloadOriginal,
      });
    }
  }

  if (violations.length > 0) {
    const errorSummary = violations.map(v => v.messageVi).join(" ");
    return {
      decision: "reject",
      violations,
      canDownloadOriginal,
      userNotice: `Xuất bản Word biến đổi bị từ chối để bảo vệ toàn vẹn dữ liệu. Lý do: ${errorSummary} Bạn vẫn có thể xem trước, rà soát hoặc tải lại tệp Word gốc.`,
    };
  }

  return {
    decision: "allow",
    violations: [],
    canDownloadOriginal,
  };
}

/**
 * Quét nhanh các thẻ OOXML trong đoạn XML thô của bảng <w:tbl> để phát hiện cấu trúc chưa hỗ trợ
 */
export function scanRawTableXmlFeatures(tblXml: string, tableId?: string, blockId?: string): UnsupportedFeature[] {
  const features: UnsupportedFeature[] = [];

  // Kiểm tra tính hợp lệ của cấu trúc XML bảng
  if (!tblXml || typeof tblXml !== "string") {
    features.push({
      code: "unsupported_table_geometry",
      tableId,
      blockId,
      description: "Dữ liệu XML bảng rỗng hoặc không xác định",
    });
    return features;
  }

  const trimmed = tblXml.trim();
  if (trimmed.startsWith("<w:tbl") && !trimmed.endsWith("</w:tbl>")) {
    features.push({
      code: "unsupported_table_geometry",
      tableId,
      blockId,
      description: "Thẻ bảng OOXML không khép kín hoặc bị cắt cụt",
    });
  }

  // Bảng lồng: kiểm tra xem bên trong có thẻ <w:tbl> thứ 2 hay không
  const firstTblEnd = tblXml.indexOf(">");
  const innerXml = firstTblEnd >= 0 ? tblXml.slice(firstTblEnd + 1) : tblXml;
  if (/<w:tbl[\s>]/.test(innerXml)) {
    features.push({
      code: "nested_table",
      tableId,
      blockId,
      description: "Bảng lồng (nested table) bên trong ô",
    });
  }

  // Đối tượng vẽ, ảnh, smartart, shape
  if (/<w:drawing[\s>]|<w:pict[\s>]|<a:blip[\s>]|<v:shape[\s>]/.test(tblXml)) {
    features.push({
      code: "drawing_or_image",
      tableId,
      blockId,
      description: "Hình ảnh hoặc đối tượng đồ họa bên trong ô bảng",
    });
  }

  // Field mã phức tạp
  if (/<w:fldSimple[\s>]|<w:fldChar[\s>]|<w:instrText[\s>]/.test(tblXml)) {
    features.push({
      code: "complex_field",
      tableId,
      blockId,
      description: "Trường dữ liệu hoặc công thức tự động (Word field) bên trong ô bảng",
    });
  }

  // Hyperlink bên trong ô bảng
  if (/<w:hyperlink[\s>]/.test(tblXml)) {
    features.push({
      code: "hyperlink_in_table",
      tableId,
      blockId,
      description: "Liên kết hyperlink bên trong ô bảng",
    });
  }

  // Ô tiếp nối vMerge continue có chứa nội dung văn bản (nguy cơ mất dữ liệu khi gộp)
  const tcRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
  let tcMatch: RegExpExecArray | null;
  while ((tcMatch = tcRegex.exec(tblXml)) !== null) {
    const tcXml = tcMatch[0];
    const isVMergeRestart = /<w:vMerge\b[^>]*w:val="restart"/i.test(tcXml);
    const hasVMerge = /<w:vMerge\b/i.test(tcXml);
    const isContinue = hasVMerge && !isVMergeRestart;

    if (isContinue) {
      // Kiểm tra xem ô tiếp nối này có chứa text hay không
      const textMatches = Array.from(tcXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g));
      const cellText = textMatches.map(m => m[1]).join("").trim();
      if (cellText.length > 0) {
        features.push({
          code: "vmerge_continue_has_content",
          tableId,
          blockId,
          description: `Ô gộp dọc tiếp nối (vMerge continue) có chứa văn bản ("${cellText.slice(0, 30)}")`,
        });
        break; // Báo 1 lỗi đại diện cho bảng này
      }
    }
  }

  return features;
}
