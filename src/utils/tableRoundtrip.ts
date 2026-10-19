/**
 * @file tableRoundtrip.ts
 * @description Bộ so sánh cấu trúc (diffing) và chứng minh roundtrip bảo toàn bảng OOXML.
 * So sánh bảng nguồn với bảng đầu ra trước khi cho phép người dùng tải tệp Word.
 */

import JSZip from "jszip";
import type { TableModel } from "../shared/tableModel.ts";
import { extractTableModelFromXml, extractDirectChildren } from "../server/blockExtractor.ts";
import { type ExportSafetyViolation, scanRawTableXmlFeatures } from "../shared/importFidelity.ts";

export interface TableDiff {
  type: 
    | "rows_mismatch" 
    | "columns_mismatch" 
    | "merge_mismatch" 
    | "content_mismatch" 
    | "property_mismatch"
    | "width_mismatch"
    | "format_mismatch";
  tableId: string;
  messageVi: string;
  location?: { row?: number; col?: number };
  sourceVal?: any;
  outputVal?: any;
}

function normalizeCellText(text: string): string {
  return (text || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function mergeAdjacentIdenticalRunsForFidelity(runs: any[]): any[] {
  if (!runs || runs.length <= 1) return runs || [];
  const merged: any[] = [];
  let current = { ...runs[0] };
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    const same =
      Boolean(r.bold) === Boolean(current.bold) &&
      Boolean(r.italic) === Boolean(current.italic) &&
      Boolean(r.underline) === Boolean(current.underline) &&
      (r.font || "") === (current.font || "") &&
      (r.sizeHalfPt || 0) === (current.sizeHalfPt || 0) &&
      (r.color || "").toUpperCase() === (current.color || "").toUpperCase();

    if (same) {
      current.text = (current.text || "") + (r.text || "");
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);
  return merged;
}

/**
 * So sánh độ toàn vẹn cấu trúc giữa TableModel nguồn và TableModel đầu ra từ file DOCX đã xuất.
 * Trả về danh sách TableDiff[] (rỗng nếu bảo toàn 100%).
 */
export function compareTableFidelity(source: TableModel, output: TableModel): TableDiff[] {
  const diffs: TableDiff[] = [];
  const tableId = source.tableId || output.tableId || "table";

  // 1. So khớp số lượng hàng
  if (source.rowsCount !== output.rowsCount) {
    diffs.push({
      type: "rows_mismatch",
      tableId,
      messageVi: `Số lượng hàng bị thay đổi: nguồn có ${source.rowsCount} hàng, đầu ra có ${output.rowsCount} hàng.`,
      sourceVal: source.rowsCount,
      outputVal: output.rowsCount,
    });
    // Không thể so chi tiết từng hàng nếu số hàng lệch
    return diffs;
  }

  // 2. So khớp số lượng cột
  if (source.columnsCount !== output.columnsCount) {
    diffs.push({
      type: "columns_mismatch",
      tableId,
      messageVi: `Số lượng cột bị thay đổi: nguồn có ${source.columnsCount} cột, đầu ra có ${output.columnsCount} cột.`,
      sourceVal: source.columnsCount,
      outputVal: output.columnsCount,
    });
  }

  // 3. So khớp độ rộng cột gridColumnsTwips (nếu nguồn có)
  if (source.gridColumnsTwips.length > 0) {
    if (output.gridColumnsTwips.length === 0) {
      diffs.push({
        type: "width_mismatch",
        tableId,
        messageVi: `Lưới độ rộng cột (w:tblGrid) bị biến mất hoàn toàn trong tệp đầu ra.`,
        sourceVal: source.gridColumnsTwips,
        outputVal: output.gridColumnsTwips,
      });
    } else if (source.gridColumnsTwips.length !== output.gridColumnsTwips.length) {
      diffs.push({
        type: "width_mismatch",
        tableId,
        messageVi: `Số cột lưới twips không khớp: nguồn ${source.gridColumnsTwips.length}, đầu ra ${output.gridColumnsTwips.length}.`,
        sourceVal: source.gridColumnsTwips,
        outputVal: output.gridColumnsTwips,
      });
    } else {
      for (let i = 0; i < source.gridColumnsTwips.length; i++) {
        const sW = source.gridColumnsTwips[i];
        const oW = output.gridColumnsTwips[i];
        // Cho phép dung sai 10 twips do làm tròn đơn vị
        if (Math.abs(sW - oW) > 10) {
          diffs.push({
            type: "width_mismatch",
            tableId,
            location: { col: i },
            messageVi: `Độ rộng cột ${i + 1} bị thay đổi: nguồn ${sW} twips, đầu ra ${oW} twips.`,
            sourceVal: sW,
            outputVal: oW,
          });
        }
      }
    }
  }

  function normalizeBordersForComparison(b?: Record<string, { style?: string; size?: number; color?: string }>) {
    if (!b) return undefined;
    const res: Record<string, any> = {};
    for (const k of Object.keys(b)) {
      const side = b[k];
      if (side) {
        let color = (side.color || "").toLowerCase();
        if (color === "auto") color = "000000";
        res[k] = {
          style: side.style,
          size: side.size,
          color,
        };
      }
    }
    return res;
  }

  // 3b. So khớp lề và đường viền của bảng (margins, borders)
  const areMarginsEqual = (m1?: any, m2?: any) => {
    if (!m1 && !m2) return true;
    if (!m1 || !m2) return false;
    const sides = ["top", "bottom", "left", "right"];
    return sides.every(s => (m1[s] ?? 0) === (m2[s] ?? 0));
  };
  if (!areMarginsEqual(source.margins, output.margins)) {
    diffs.push({
      type: "property_mismatch",
      tableId,
      messageVi: `Lề bảng (table margins) bị thay đổi: nguồn ${JSON.stringify(source.margins || {})}, đầu ra ${JSON.stringify(output.margins || {})}.`,
      sourceVal: source.margins,
      outputVal: output.margins,
    });
  }

  const isDefaultSingleBorders = (b?: any) => {
    if (!b) return false;
    const sides = ["top", "bottom", "left", "right", "insideH", "insideV"];
    return sides.every(s => {
      const side = b[s];
      return side && (side.style === "single" || side.style === "default") && (side.size === 4 || !side.size) && (side.color === "auto" || side.color === "000000" || !side.color);
    });
  };

  const sNormBorders = normalizeBordersForComparison(source.borders);
  const oNormBorders = normalizeBordersForComparison(output.borders);
  const isBothDefault = (!sNormBorders || Object.keys(sNormBorders).length === 0) &&
                        source.hasBorders &&
                        isDefaultSingleBorders(oNormBorders);

  if (!isBothDefault && JSON.stringify(sNormBorders || {}) !== JSON.stringify(oNormBorders || {})) {
    diffs.push({
      type: "property_mismatch",
      tableId,
      messageVi: `Đường viền bảng (table borders) bị thay đổi: nguồn ${JSON.stringify(source.borders || {})}, đầu ra ${JSON.stringify(output.borders || {})}.`,
      sourceVal: source.borders,
      outputVal: output.borders,
    });
  }

  // 4. So khớp từng hàng và từng ô
  for (let rIdx = 0; rIdx < source.rows.length; rIdx++) {
    const sRow = source.rows[rIdx];
    const oRow = output.rows[rIdx];

    // Thuộc tính lặp header
    if (sRow.isHeader !== oRow.isHeader) {
      diffs.push({
        type: "property_mismatch",
        tableId,
        location: { row: rIdx },
        messageVi: `Thuộc tính lặp tiêu đề (tblHeader) ở hàng ${rIdx + 1} bị thay đổi.`,
        sourceVal: sRow.isHeader,
        outputVal: oRow.isHeader,
      });
    }

    // Thuộc tính chống ngắt trang cantSplit
    if (sRow.cantSplit !== oRow.cantSplit) {
      diffs.push({
        type: "property_mismatch",
        tableId,
        location: { row: rIdx },
        messageVi: `Thuộc tính chống ngắt trang (cantSplit) ở hàng ${rIdx + 1} bị thay đổi.`,
        sourceVal: sRow.cantSplit,
        outputVal: oRow.cantSplit,
      });
    }

    if (sRow.cells.length !== oRow.cells.length) {
      diffs.push({
        type: "columns_mismatch",
        tableId,
        location: { row: rIdx },
        messageVi: `Số lượng ô logic ở hàng ${rIdx + 1} không khớp: nguồn ${sRow.cells.length}, đầu ra ${oRow.cells.length}.`,
        sourceVal: sRow.cells.length,
        outputVal: oRow.cells.length,
      });
      continue;
    }

    for (let cIdx = 0; cIdx < sRow.cells.length; cIdx++) {
      const sCell = sRow.cells[cIdx];
      const oCell = oRow.cells[cIdx];

      // Gộp ngang gridSpan
      if (sCell.gridSpan !== oCell.gridSpan) {
        diffs.push({
          type: "merge_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Ô gộp ngang (gridSpan) tại hàng ${rIdx + 1}, cột ${cIdx + 1} không khớp: nguồn ${sCell.gridSpan}, đầu ra ${oCell.gridSpan}.`,
          sourceVal: sCell.gridSpan,
          outputVal: oCell.gridSpan,
        });
      }

      // Gộp dọc vMerge
      if (sCell.vMerge !== oCell.vMerge) {
        diffs.push({
          type: "merge_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Ô gộp dọc (vMerge) tại hàng ${rIdx + 1}, cột ${cIdx + 1} không khớp: nguồn "${sCell.vMerge || 'none'}", đầu ra "${oCell.vMerge || 'none'}".`,
          sourceVal: sCell.vMerge,
          outputVal: oCell.vMerge,
        });
      }

      // Nội dung chữ
      const sText = normalizeCellText(sCell.text);
      const oText = normalizeCellText(oCell.text);
      if (sText !== oText) {
        diffs.push({
          type: "content_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Nội dung chữ tại hàng ${rIdx + 1}, cột ${cIdx + 1} bị thay đổi: "${sText}" !== "${oText}".`,
          sourceVal: sText,
          outputVal: oText,
        });
      }

      // Căn đoạn / text alignment
      const sAlign = sCell.alignment || sCell.paragraphs?.[0]?.alignment;
      const oAlign = oCell.alignment || oCell.paragraphs?.[0]?.alignment;
      if (sAlign && oAlign && sAlign !== oAlign) {
        diffs.push({
          type: "format_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Căn đoạn (alignment) tại ô [hàng ${rIdx + 1}, cột ${cIdx + 1}] bị thay đổi: nguồn "${sAlign}", đầu ra "${oAlign}".`,
          sourceVal: sAlign,
          outputVal: oAlign,
        });
      }

      // Màu nền ô (shading)
      const sShading = (sCell.shadingColor || "").toUpperCase();
      const oShading = (oCell.shadingColor || "").toUpperCase();
      if (sShading !== oShading) {
        diffs.push({
          type: "format_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Màu nền ô [hàng ${rIdx + 1}, cột ${cIdx + 1}] bị thay đổi: nguồn "${sCell.shadingColor || 'none'}", đầu ra "${oCell.shadingColor || 'none'}".`,
          sourceVal: sCell.shadingColor,
          outputVal: oCell.shadingColor,
        });
      }

      // Lề và viền ô
      if (JSON.stringify(sCell.margins || {}) !== JSON.stringify(oCell.margins || {})) {
        diffs.push({
          type: "format_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Lề ô [hàng ${rIdx + 1}, cột ${cIdx + 1}] bị thay đổi.`,
          sourceVal: sCell.margins,
          outputVal: oCell.margins,
        });
      }

      if (JSON.stringify(normalizeBordersForComparison(sCell.borders) || {}) !== JSON.stringify(normalizeBordersForComparison(oCell.borders) || {})) {
        diffs.push({
          type: "format_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Viền ô [hàng ${rIdx + 1}, cột ${cIdx + 1}] bị thay đổi.`,
          sourceVal: sCell.borders,
          outputVal: oCell.borders,
        });
      }

      // So khớp tất cả các run trong tất cả các đoạn văn của ô
      const sParas = sCell.paragraphs || [];
      const oParas = oCell.paragraphs || [];
      if (sParas.length !== oParas.length) {
        diffs.push({
          type: "format_mismatch",
          tableId,
          location: { row: rIdx, col: cIdx },
          messageVi: `Số lượng đoạn văn trong ô [hàng ${rIdx + 1}, cột ${cIdx + 1}] không khớp: nguồn ${sParas.length}, đầu ra ${oParas.length}.`,
          sourceVal: sParas.length,
          outputVal: oParas.length,
        });
      }

      const maxParas = Math.max(sParas.length, oParas.length);
      for (let pIdx = 0; pIdx < maxParas; pIdx++) {
        const sP = sParas[pIdx];
        const oP = oParas[pIdx];
        if (!sP || !oP) continue;

        const sRawRuns = sP.runs || [];
        const oRawRuns = oP.runs || [];
        const sRuns = mergeAdjacentIdenticalRunsForFidelity(sRawRuns);
        const oRuns = mergeAdjacentIdenticalRunsForFidelity(oRawRuns);
        const isPlainSingleRun = sRuns.length === 0 && oRuns.length === 1 && normalizeCellText(oRuns[0]?.text) === normalizeCellText(sP.text);
        if (sRuns.length !== oRuns.length && !isPlainSingleRun) {
          diffs.push({
            type: "format_mismatch",
            tableId,
            location: { row: rIdx, col: cIdx },
            messageVi: `Số lượng run trong ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}] không khớp: nguồn ${sRuns.length}, đầu ra ${oRuns.length}.`,
            sourceVal: sRuns.length,
            outputVal: oRuns.length,
          });
        }

        if (!isPlainSingleRun) {
          const maxRuns = Math.max(sRuns.length, oRuns.length);
          for (let rRunIdx = 0; rRunIdx < maxRuns; rRunIdx++) {
            const sR = sRuns[rRunIdx];
            const oR = oRuns[rRunIdx];
            if (!sR || !oR) continue;

          if (sR.font && oR.font && sR.font !== oR.font) {
            diffs.push({
              type: "format_mismatch",
              tableId,
              location: { row: rIdx, col: cIdx },
              messageVi: `Phông chữ ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}, run ${rRunIdx + 1}] bị thay đổi: nguồn "${sR.font}", đầu ra "${oR.font}".`,
              sourceVal: sR.font,
              outputVal: oR.font,
            });
          }
          if (typeof sR.sizeHalfPt === "number" && typeof oR.sizeHalfPt === "number" && sR.sizeHalfPt !== oR.sizeHalfPt) {
            diffs.push({
              type: "format_mismatch",
              tableId,
              location: { row: rIdx, col: cIdx },
              messageVi: `Cỡ chữ ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}, run ${rRunIdx + 1}] bị thay đổi: nguồn ${sR.sizeHalfPt / 2}pt, đầu ra ${oR.sizeHalfPt / 2}pt.`,
              sourceVal: sR.sizeHalfPt,
              outputVal: oR.sizeHalfPt,
            });
          }
          if (Boolean(sR.bold) !== Boolean(oR.bold)) {
            diffs.push({
              type: "format_mismatch",
              tableId,
              location: { row: rIdx, col: cIdx },
              messageVi: `Định dạng in đậm ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}, run ${rRunIdx + 1}] bị thay đổi: nguồn ${sR.bold}, đầu ra ${oR.bold}.`,
              sourceVal: sR.bold,
              outputVal: oR.bold,
            });
          }
          if (Boolean(sR.italic) !== Boolean(oR.italic)) {
            diffs.push({
              type: "format_mismatch",
              tableId,
              location: { row: rIdx, col: cIdx },
              messageVi: `Định dạng in nghiêng ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}, run ${rRunIdx + 1}] bị thay đổi: nguồn ${sR.italic}, đầu ra ${oR.italic}.`,
              sourceVal: sR.italic,
              outputVal: oR.italic,
            });
          }
          if (Boolean(sR.underline) !== Boolean(oR.underline)) {
            diffs.push({
              type: "format_mismatch",
              tableId,
              location: { row: rIdx, col: cIdx },
              messageVi: `Định dạng gạch chân ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}, run ${rRunIdx + 1}] bị thay đổi: nguồn ${sR.underline}, đầu ra ${oR.underline}.`,
              sourceVal: sR.underline,
              outputVal: oR.underline,
            });
          }
          const sColor = (sR.color || "").toUpperCase();
          const oColor = (oR.color || "").toUpperCase();
          if (sColor !== oColor) {
            diffs.push({
              type: "format_mismatch",
              tableId,
              location: { row: rIdx, col: cIdx },
              messageVi: `Màu chữ ô [hàng ${rIdx + 1}, cột ${cIdx + 1}, đoạn ${pIdx + 1}, run ${rRunIdx + 1}] bị thay đổi: nguồn "${sR.color || ''}", đầu ra "${oR.color || ''}".`,
              sourceVal: sR.color,
              outputVal: oR.color,
            });
          }
        }
        }
      }
    }
  }

  return diffs;
}

export interface TableDecision {
  tableId: string;
  region: string;
  decision: "PASS" | "FAIL" | "NEEDS_REVIEW";
  reason: string;
}

export interface CandidateExportVerificationResult {
  safe: boolean;
  diffs: TableDiff[];
  canDownloadOriginal: boolean;
  violations: ExportSafetyViolation[];
  summaryVi: string;
  candidateXml?: string;
  newTablesCount?: number;
  tableDecisions?: TableDecision[];
}

/**
 * Kiểm tra tính toàn vẹn cú pháp XML (well-formed XML) và cấu trúc WordprocessingML cơ bản.
 * Đảm bảo:
 * 1. Mọi thẻ mở đều có thẻ đóng khớp tương ứng theo thứ tự LIFO (stack), không bị cụt hay lồng sai.
 * 2. Bỏ qua hợp lệ các thẻ tự đóng (<w:br/>), comments (<!-- -->), CDATA, XML declaration.
 * 3. Thẻ gốc bắt buộc phải là w:document (hoặc kết thúc bằng :document).
 * 4. Chứa phần tử w:body (hoặc kết thúc bằng :body) và w:body được đóng hợp lệ trước w:document.
 */
export function validateOoxmlWellFormed(xml: string): { valid: boolean; error?: string } {
  if (!xml || typeof xml !== "string" || xml.trim().length === 0) {
    return { valid: false, error: "XML rỗng hoặc không hợp lệ." };
  }

  // Loại bỏ comments, CDATA, XML declarations và DOCTYPE
  const cleanXml = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[^?]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");

  const tagRegex = /<(\/)?([a-zA-Z0-9_:\-]+)([^>]*?)(\/?)>/g;
  const stack: string[] = [];
  let rootTag: string | null = null;
  let hasBody = false;
  let bodyClosed = false;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleanXml)) !== null) {
    const isClose = match[1] === "/";
    const tagName = match[2];
    const rawAttrs = match[3] || "";
    const isSelfClosing = match[4] === "/" || rawAttrs.trim().endsWith("/");

    if (isSelfClosing) {
      if (!rootTag) rootTag = tagName;
      continue;
    }

    if (!isClose) {
      // Thẻ mở
      if (!rootTag) rootTag = tagName;
      if (tagName === "w:body" || tagName.endsWith(":body") || tagName === "body") {
        hasBody = true;
      }
      stack.push(tagName);
    } else {
      // Thẻ đóng
      if (stack.length === 0) {
        return { valid: false, error: `Thẻ đóng </${tagName}> không có thẻ mở tương ứng.` };
      }
      const expected = stack.pop();
      if (expected !== tagName) {
        return { valid: false, error: `Mismatched tag: kỳ vọng </${expected}> nhưng gặp </${tagName}>.` };
      }
      if (tagName === "w:body" || tagName.endsWith(":body") || tagName === "body") {
        bodyClosed = true;
      }
    }
  }

  if (stack.length > 0) {
    return { valid: false, error: `Tài liệu XML bị cụt: còn ${stack.length} thẻ chưa được đóng (${stack.join(", ")}).` };
  }

  const isDocumentRoot = rootTag === "w:document" || (rootTag !== null && rootTag.endsWith(":document")) || rootTag === "document";
  if (!isDocumentRoot) {
    return { valid: false, error: `Thẻ gốc không phải là <w:document> mà là <${rootTag}>.` };
  }

  if (!hasBody || !bodyClosed) {
    return { valid: false, error: "Tài liệu OOXML thiếu phần tử <w:body> hoặc <w:body> chưa được đóng đầy đủ." };
  }

  return { valid: true };
}

/**
 * Kiểm định độ an toàn và roundtrip trực tiếp trên bộ đệm byte DOCX ứng viên trước khi tải về.
 * Sinh DOCX ứng viên -> giải nén OOXML -> đối chiếu hai chiều từng bảng nguồn với bảng xuất.
 */
export async function verifyCandidateExportFidelity(
  candidateDocxBytes: Uint8Array | ArrayBuffer,
  importedTables?: Record<string, TableModel>,
  manifest?: any,
  options?: { approvedNewTableIds?: string[] }
): Promise<CandidateExportVerificationResult> {
  const diffs: TableDiff[] = [];
  const violations: ExportSafetyViolation[] = [];
  const tableDecisions: TableDecision[] = [];

  // Kiểm tra tính nhất quán với manifest nguồn
  if ((!importedTables || Object.keys(importedTables).length === 0) && manifest?.tableIds && manifest.tableIds.length > 0) {
    return {
      safe: false,
      diffs: [{
        type: "property_mismatch",
        tableId: manifest.tableIds[0],
        messageVi: `Manifest nguồn chứa ${manifest.tableIds.length} bảng nhưng danh sách bảng kiểm chứng rỗng.`,
      }],
      canDownloadOriginal: true,
      violations: [{
        code: "manifest_tables_unaccounted",
        messageVi: `Tệp nguồn chứa ${manifest.tableIds.length} bảng nội dung nhưng không có bảng nào được đưa vào đối chiếu.`,
        canDownloadOriginal: true,
      }],
      summaryVi: "Bảng nhập từ nguồn bị mất hoặc không được giải thích trong phiên xuất bản.",
      tableDecisions: manifest.tableIds.map((id: string) => ({
        tableId: id,
        region: "body",
        decision: "FAIL" as const,
        reason: "Bảng có trong manifest nguồn nhưng không được đưa vào kiểm chứng.",
      })),
    };
  }

  let candidateXml = "";
  try {
    const zip = await JSZip.loadAsync(candidateDocxBytes);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) {
      throw new Error("Không tìm thấy word/document.xml trong tệp Word ứng viên");
    }
    candidateXml = await xmlFile.async("string");
    const xmlValidation = validateOoxmlWellFormed(candidateXml);
    if (!xmlValidation.valid) {
      throw new Error("Tệp word/document.xml không phải là tài liệu OOXML WordprocessingML hợp lệ: " + xmlValidation.error);
    }
  } catch (err: any) {
    return {
      safe: false,
      diffs: [],
      canDownloadOriginal: true,
      violations: [{
        code: "candidate_unpack_failed",
        messageVi: "Không thể giải nén DOCX ứng viên để đối chiếu OOXML: " + err.message,
        canDownloadOriginal: true,
      }],
      summaryVi: "Lỗi kiểm tra tính toàn vẹn tệp DOCX ứng viên.",
      tableDecisions: [],
    };
  }

  // Trích xuất các bảng trong candidate OOXML
  const candidateTblElements = extractDirectChildren(candidateXml, "w:body", new Set(["w:tbl"]));
  const candidateModels: TableModel[] = [];

  for (let idx = 0; idx < candidateTblElements.length; idx++) {
    const tblXml = candidateTblElements[idx].xml;
    const model = extractTableModelFromXml(tblXml, `candidate_table_${idx}`);
    candidateModels.push(model);
  }

  // Phân loại bảng layout hệ thống (header/signature) để không nhầm thành bảng nội dung phát sinh ngoài ý muốn
  const isLayoutTable = (cm: TableModel): { isLayout: boolean; region?: "header" | "signature" } => {
    if (cm.tableId === "system_header_layout_table") return { isLayout: true, region: "header" };
    if (cm.tableId === "system_signature_layout_table") return { isLayout: true, region: "signature" };

    // Bảng có ID nghiệp vụ rõ ràng khác system_ không bao giờ là bảng layout hệ thống
    const hasExplicitContentId = Boolean(cm.tableId && !cm.tableId.startsWith("candidate_table_") && !cm.tableId.startsWith("system_"));
    if (hasExplicitContentId) {
      return { isLayout: false };
    }

    if ((cm.rowsCount === 1 || cm.rowsCount === 2) && cm.columnsCount === 2) {
      const cell0Text = cm.rows[0]?.cells?.[0]?.text || "";
      const cell1Text = cm.rows[0]?.cells?.[1]?.text || "";

      // Header thể thức NĐ 30 / HD 05: Cột phải (cell 1) là Quốc hiệu / Tiêu ngữ (Cộng hòa / Độc lập / Đảng cộng sản)
      const hasNationalHeaderOnRight =
        cell1Text.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") ||
        cell1Text.includes("ĐẢNG CỘNG SẢN VIỆT NAM") ||
        cell1Text.includes("Độc lập - Tự do - Hạnh phúc");

      if (hasNationalHeaderOnRight) {
        return { isLayout: true, region: "header" };
      }

      // Bảng chữ ký ND30 không có viền và có nhãn Nơi nhận / Ký đóng dấu
      const allText = `${cell0Text} ${cell1Text}`;
      if (!cm.hasBorders && (allText.includes("Nơi nhận:") || allText.includes("Ký, đóng dấu") || allText.includes("Ký, ghi rõ họ tên"))) {
        return { isLayout: true, region: "signature" };
      }
    }
    return { isLayout: false };
  };

  const layoutCandidateIndices = new Set<number>();
  for (let idx = 0; idx < candidateModels.length; idx++) {
    const cm = candidateModels[idx];
    const layout = isLayoutTable(cm);
    if (layout.isLayout && layout.region) {
      layoutCandidateIndices.add(idx);
      tableDecisions.push({
        tableId: cm.tableId && !cm.tableId.startsWith("candidate_table_") ? cm.tableId : `system_${layout.region}_table`,
        region: layout.region,
        decision: "PASS",
        reason: `Bảng layout thể thức ${layout.region === "header" ? "phần đầu" : "khối chữ ký"}.`,
      });
    }
  }

  // 1. Kiểm tra ID trùng lặp giữa các bảng trong candidate OOXML (không tính bảng layout hệ thống)
  const seenCandidateIds = new Map<string, number>();
  for (let idx = 0; idx < candidateModels.length; idx++) {
    if (layoutCandidateIndices.has(idx)) continue;
    const cm = candidateModels[idx];
    if (cm.tableId && !cm.tableId.startsWith("candidate_table_")) {
      if (seenCandidateIds.has(cm.tableId)) {
        diffs.push({
          type: "property_mismatch",
          tableId: cm.tableId,
          messageVi: `Phát hiện ID bảng bị trùng lặp trong bản xuất Word: "${cm.tableId}" xuất hiện ít nhất 2 lần.`,
        });
        violations.push({
          code: "duplicate_table_id",
          messageVi: `Phát hiện ID bảng "${cm.tableId}" bị lặp lại trong tệp Word ứng viên.`,
          canDownloadOriginal: true,
        });
      } else {
        seenCandidateIds.set(cm.tableId, idx);
      }
    }
  }

  // Deduplicate source models in case both block.id and tableModel.tableId were indexed
  const uniqueSourceModels = new Map<string, TableModel>();
  for (const [key, model] of Object.entries(importedTables || {})) {
    const id = model.tableId || key;
    if (!uniqueSourceModels.has(id)) {
      uniqueSourceModels.set(id, model);
    }
  }

  // Kiểm tra tính toàn vẹn của manifest nguồn: Mọi ID trong manifest nguồn phải có mặt trong candidate và uniqueSourceModels
  if (manifest?.tableIds && Array.isArray(manifest.tableIds) && manifest.tableIds.length > 0) {
    const candidateTableIds = new Set(candidateModels.map(cm => cm.tableId));
    const missingManifestIds = manifest.tableIds.filter((id: string) => 
      !candidateTableIds.has(id) || (!uniqueSourceModels.has(id) && !(options?.approvedNewTableIds || []).includes(id))
    );
    if (missingManifestIds.length > 0) {
      diffs.push({
        type: "property_mismatch",
        tableId: missingManifestIds[0],
        messageVi: `Bảng nguồn "${missingManifestIds.join(', ')}" có trong manifest nguồn nhưng không được bảo toàn đầy đủ trong bản xuất DOCX.`,
      });
      violations.push({
        code: "manifest_tables_unaccounted",
        messageVi: `Manifest nguồn chứa ${manifest.tableIds.length} bảng nhưng thiếu ${missingManifestIds.length} bảng trong tệp Word ứng viên: ${missingManifestIds.join(', ')}.`,
        canDownloadOriginal: true,
      });
      missingManifestIds.forEach((id: string) => {
        tableDecisions.push({
          tableId: id,
          region: "body",
          decision: "FAIL",
          reason: "Bảng có trong manifest nguồn nhưng không được bảo toàn trong DOCX ứng viên.",
        });
      });
    }
  }

  // Khớp hai chiều (Two-way matching):
  // 1. Ưu tiên khớp chính xác theo tableId (đã được embed trong w:tblCaption)
  const matchedCandidateIndices = new Set<number>();
  const sourceToCandidateMap = new Map<string, TableModel>();
  const matchedCandidateOrder: number[] = [];

  for (const [tableId, sourceModel] of uniqueSourceModels.entries()) {
    const matchingIndices = candidateModels
      .map((cm, idx) => ({ cm, idx }))
      .filter(({ cm, idx }) => !matchedCandidateIndices.has(idx) && cm.tableId === tableId);

    if (matchingIndices.length === 1) {
      const foundIdx = matchingIndices[0].idx;
      matchedCandidateIndices.add(foundIdx);
      sourceToCandidateMap.set(tableId, candidateModels[foundIdx]);
      matchedCandidateOrder.push(foundIdx);
    } else if (matchingIndices.length > 1) {
      diffs.push({
        type: "property_mismatch",
        tableId,
        messageVi: `Có ${matchingIndices.length} bảng ứng viên mang cùng tableId "${tableId}".`,
      });
    }
  }

  // 2. Dự phòng an toàn (Fail-closed fallback):
  // Chỉ cho phép ghép theo vị trí nếu và chỉ nếu CẢ tài liệu nguồn và bản xuất CHỈ CÓ ĐÚNG 1 BẢNG,
  // và bảng đó không có caption (không có explicit tableId) nhưng cấu trúc số hàng/cột tương thích.
  // Tuyệt đối không âm thầm ghép theo vị trí khi candidate có explicit tableId khác với nguồn hoặc tài liệu có nhiều bảng.
  if (uniqueSourceModels.size === 1 && candidateModels.length === 1 && matchedCandidateIndices.size === 0) {
    const [soleSourceId, soleSourceModel] = Array.from(uniqueSourceModels.entries())[0];
    const soleCandidate = candidateModels[0];
    const candidateHasExplicitId = Boolean(soleCandidate.tableId && !soleCandidate.tableId.startsWith("candidate_table_"));
    if (!candidateHasExplicitId && soleCandidate.rowsCount === soleSourceModel.rowsCount && soleCandidate.columnsCount === soleSourceModel.columnsCount) {
      matchedCandidateIndices.add(0);
      sourceToCandidateMap.set(soleSourceId, soleCandidate);
      matchedCandidateOrder.push(0);
    }
  }

  // 3. Kiểm tra thứ tự xuất hiện của các bảng nguồn trong bản xuất theo manifest được duyệt
  let isOrderValid = true;
  const expectedOrderedTableIds = (manifest?.tableIds && Array.isArray(manifest.tableIds) && manifest.tableIds.length > 1)
    ? manifest.tableIds
    : Array.from(uniqueSourceModels.keys());

  const orderedCandidateIndices: Array<{ tableId: string; candIdx: number }> = [];
  for (const tid of expectedOrderedTableIds) {
    const cand = sourceToCandidateMap.get(tid);
    if (cand) {
      const candIdx = candidateModels.findIndex((cm, idx) => (cm === cand || cm.tableId === tid) && matchedCandidateIndices.has(idx));
      if (candIdx !== -1) {
        orderedCandidateIndices.push({ tableId: tid, candIdx });
      }
    }
  }

  for (let i = 1; i < orderedCandidateIndices.length; i++) {
    if (orderedCandidateIndices[i].candIdx < orderedCandidateIndices[i - 1].candIdx) {
      isOrderValid = false;
      const prevTable = orderedCandidateIndices[i - 1].tableId;
      const currTable = orderedCandidateIndices[i].tableId;
      diffs.push({
        type: "property_mismatch",
        tableId: currTable,
        messageVi: `Thứ tự bảng bị đảo lộn: bảng "${currTable}" xuất hiện trước bảng "${prevTable}" trong DOCX ứng viên.`,
      });
      violations.push({
        code: "table_order_mismatch",
        messageVi: `Thứ tự bảng bị hoán đổi trong tệp Word ứng viên.`,
        canDownloadOriginal: true,
      });
      break;
    }
  }

  // 4. Đối chiếu chi tiết từng bảng nguồn
  for (const [tableId, sourceModel] of uniqueSourceModels.entries()) {
    const candidateModel = sourceToCandidateMap.get(tableId);

    if (!candidateModel) {
      diffs.push({
        type: "property_mismatch",
        tableId,
        messageVi: `Bảng nguồn "${tableId}" bị thiếu hoàn toàn trong tệp Word xuất ra.`,
      });
      violations.push({
        code: "missing_source_table",
        messageVi: `Bảng nguồn "${tableId}" bị thiếu trong bản xuất DOCX.`,
        canDownloadOriginal: true,
      });
      tableDecisions.push({
        tableId,
        region: "body",
        decision: "FAIL",
        reason: "Bảng nguồn bị thiếu trong DOCX ứng viên.",
      });
      continue;
    }

    const tableDiffs = compareTableFidelity(sourceModel, candidateModel);
    diffs.push(...tableDiffs);

    if (tableDiffs.length === 0) {
      tableDecisions.push({
        tableId,
        region: "body",
        decision: "PASS",
        reason: "Bảo toàn 100% cấu trúc hàng, cột, ô gộp, căn lề và định dạng runs.",
      });
    } else {
      tableDecisions.push({
        tableId,
        region: "body",
        decision: "FAIL",
        reason: `Có ${tableDiffs.length} điểm sai lệch cấu trúc/định dạng so với nguồn.`,
      });
    }
  }

  // 5. Chính sách kiểm soát bảng mới (New Tables Policy):
  // Bảng mới do người dùng chủ ý thêm phải có trong danh sách approvedNewTableIds.
  // Mọi bảng phát sinh ngoài dự kiến (unexplained new table) đều khiến gate trả safe: false.
  const isDocxImport = Boolean(manifest && (manifest.sourceKind === "uploaded_docx" || (manifest.tableIds && manifest.tableIds.length >= 0)));
  const approvedSet = new Set(options?.approvedNewTableIds || manifest?.approvedNewTableIds || []);
  const unexplainedNewTables: TableModel[] = [];

  for (let idx = 0; idx < candidateModels.length; idx++) {
    if (layoutCandidateIndices.has(idx)) continue;
    if (!matchedCandidateIndices.has(idx)) {
      const newTable = candidateModels[idx];
      const newId = newTable.tableId || `candidate_table_${idx}`;
      if (options?.approvedNewTableIds || isDocxImport) {
        if (!approvedSet.has(newId)) {
          unexplainedNewTables.push(newTable);
          tableDecisions.push({
            tableId: newId,
            region: "body",
            decision: "NEEDS_REVIEW",
            reason: "Bảng mới phát sinh không có nguồn gốc được duyệt (unprovenanced table).",
          });
        } else {
          tableDecisions.push({
            tableId: newId,
            region: "body",
            decision: "PASS",
            reason: "Bảng mới do người dùng tạo có nguồn gốc được duyệt.",
          });
        }
      } else {
        tableDecisions.push({
          tableId: newId,
          region: "body",
          decision: "PASS",
          reason: "Bảng nội dung tài liệu mẫu hoặc tài liệu soạn mới.",
        });
      }
    }
  }

  const newTablesCount = candidateModels.filter((_, idx) => !matchedCandidateIndices.has(idx) && !layoutCandidateIndices.has(idx)).length;
  if (unexplainedNewTables.length > 0) {
    diffs.push({
      type: "property_mismatch",
      tableId: unexplainedNewTables[0].tableId || "unexplained_new_table",
      messageVi: `Phát hiện ${unexplainedNewTables.length} bảng mới ngoài dự kiến xuất hiện trong tệp Word xuất ra mà không có nguồn gốc được duyệt.`,
    });
    violations.push({
      code: "unexplained_new_table",
      messageVi: `Tệp Word xuất ra chứa ${unexplainedNewTables.length} bảng mới không rõ nguồn gốc.`,
      canDownloadOriginal: true,
    });
  }

  const safe = diffs.length === 0 && violations.length === 0;
  let summaryVi = safe
    ? (uniqueSourceModels.size > 0
        ? "Đã đối chiếu roundtrip thành công: Toàn bộ bảng nhập được bảo toàn cấu trúc và nội dung."
        : "Văn bản không chứa bảng nhập từ DOCX nguồn, cho phép xuất bản.")
    : `Phát hiện ${diffs.length} điểm sai lệch cấu trúc bảng giữa nguồn và bản xuất. Bản xuất biến đổi bị từ chối để bảo vệ toàn vẹn dữ liệu.`;

  return {
    safe,
    diffs,
    canDownloadOriginal: uniqueSourceModels.size > 0 || !safe,
    violations,
    summaryVi,
    candidateXml,
    newTablesCount,
    tableDecisions,
  };
}
