/**
 * @file blockExtractor.ts
 * @description Extracts structured SourceBlocks from DOCX (via JSZip and OOXML) and TXT buffers.
 * Preserves linear document order, table geometry, cell contents, paragraph formatting, and styles.
 */

import JSZip from "jszip";
import type { SourceBlock, SourceBlockKind, TableProperties } from "../shared/schemas/document.schema.ts";

/**
 * Strips XML tags or extracts text cleanly.
 */
function decodeXmlEntities(str: string): string {
  const decodeEntities = (value: string) => value
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
      const normalized = token.toLowerCase();
      if (normalized.startsWith("#x")) return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      if (normalized.startsWith("#")) return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as const)[normalized as "amp" | "lt" | "gt" | "quot" | "apos"];
    });
  let decoded = "";
  let cursor = 0;
  while (cursor < str.length) {
    const start = str.indexOf("<![CDATA[", cursor);
    if (start < 0) return decoded + decodeEntities(str.slice(cursor));
    decoded += decodeEntities(str.slice(cursor, start));
    const end = str.indexOf("]]>", start + 9);
    if (end < 0) return decoded + str.slice(start);
    decoded += str.slice(start + 9, end);
    cursor = end + 3;
  }
  return decoded;
}

function escapeXmlCdataSectionsForParsing(xml: string): string {
  let result = "";
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) return result + xml.slice(cursor);
    result += xml.slice(cursor, start);
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) return result;
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2);
      if (end < 0) return result;
      cursor = end + 2;
      continue;
    }
    if (!xml.startsWith("<![CDATA[", start)) {
      result += "<";
      cursor = start + 1;
      continue;
    }
    const contentStart = start + 9;
    const end = xml.indexOf("]]>", contentStart);
    const contentEnd = end < 0 ? xml.length : end;
    result += xml.slice(contentStart, contentEnd)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (end < 0) return result;
    cursor = end + 3;
  }
  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Extracts plain text from a paragraph XML node (<w:p>...</w:p>).
 */
function extractParagraphText(pXml: string): string {
  pXml = escapeXmlCdataSectionsForParsing(pXml);
  const parts: string[] = [];
  const runRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/?>|<w:br(?:\s[^>]*)?\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = runRegex.exec(pXml)) !== null) {
    if (match[0].startsWith("<w:tab")) {
      parts.push("\t");
    } else if (match[0].startsWith("<w:br")) {
      parts.push("\n");
    } else if (match[1] !== undefined) {
      parts.push(decodeXmlEntities(match[1]));
    }
  }
  return parts.join("").normalize("NFC");
}

/**
 * Converts a paragraph XML node to clean semantic HTML.
 * Merges contiguous adjacent runs with identical styling and normalizes Unicode (NFC)
 * to prevent diacritic splitting across inline element boundaries.
 */
function paragraphXmlToHtml(pXml: string): string {
  pXml = escapeXmlCdataSectionsForParsing(pXml);
  const jcMatch = pXml.match(/<w:jc\s+w:val="([^"]+)"/);
  const align = jcMatch ? jcMatch[1].toLowerCase() : "";
  let alignStyle = "";
  if (align === "center") alignStyle = ' style="text-align: center;"';
  else if (align === "right") alignStyle = ' style="text-align: right;"';

  // Extract runs
  const runBlockRegex = /<w:r\b[\s\S]*?<\/w:r>/g;
  let rMatch: RegExpExecArray | null;

  interface ExtractedRunItem {
    text: string;
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
  }
  const rawRuns: ExtractedRunItem[] = [];

  while ((rMatch = runBlockRegex.exec(pXml)) !== null) {
    const rXml = rMatch[0];
    const isBold = /<w:b(?:\s|>|\/>)/.test(rXml) && !/<w:b\s+w:val="(?:0|false)"/.test(rXml);
    const isItalic = /<w:i(?:\s|>|\/>)/.test(rXml) && !/<w:i\s+w:val="(?:0|false)"/.test(rXml);
    const isUnderline = /<w:u(?:\s|>|\/>)/.test(rXml) && !/<w:u\s+w:val="(?:none|0|false)"/.test(rXml);

    const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s[^>]*)?\/?>|<w:br(?:\s[^>]*)?\/?>/g;
    let tMatch: RegExpExecArray | null;
    let rText = "";
    while ((tMatch = tRegex.exec(rXml)) !== null) {
      if (tMatch[0].startsWith("<w:tab")) {
        rText += "\t";
      } else if (tMatch[0].startsWith("<w:br")) {
        rText += "\n";
      } else if (tMatch[1] !== undefined) {
        rText += decodeXmlEntities(tMatch[1]);
      }
    }

    rText = rText.normalize("NFC");
    if (!rText) continue;

    // Merge with previous run if identical formatting
    const last = rawRuns[rawRuns.length - 1];
    if (
      last &&
      last.isBold === isBold &&
      last.isItalic === isItalic &&
      last.isUnderline === isUnderline
    ) {
      last.text = (last.text + rText).normalize("NFC");
    } else {
      rawRuns.push({
        text: rText,
        isBold,
        isItalic,
        isUnderline,
      });
    }
  }

  let innerHtml = "";
  for (const r of rawRuns) {
    let runHtml = escapeHtml(r.text)
      .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
      .replace(/\n/g, "<br/>");
    if (r.isBold) runHtml = `<strong>${runHtml}</strong>`;
    if (r.isItalic) runHtml = `<em>${runHtml}</em>`;
    if (r.isUnderline) runHtml = `<u>${runHtml}</u>`;
    innerHtml += runHtml;
  }

  if (!innerHtml) {
    const fallbackText = extractParagraphText(pXml);
    if (!fallbackText.trim()) return "<p></p>";
    innerHtml = escapeHtml(fallbackText).replace(/\n/g, "<br/>");
  }

  return `<p${alignStyle}>${innerHtml}</p>`;
}

import { 
  type TableModel, 
  type TableRowModel, 
  type TableCellModel, 
  type TableCellParagraph, 
  type TableCellRun,
  tableModelToHtmlView 
} from "../shared/tableModel.ts";
import { scanRawTableXmlFeatures } from "../shared/importFidelity.ts";

const XML_NAME_PART = String.raw`[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}.\-\u00B7\u0300-\u036F\u203F-\u2040]*`;
const XML_TAG_NAME_PATTERN = new RegExp(`^\\s*(\\/?)\\s*(${XML_NAME_PART}(?::${XML_NAME_PART})?)`, "u");

/**
 * Scans direct children tags of a parent XML node without getting confused by deeper nested elements.
 */
export function extractDirectChildren(
  xml: string, 
  parentTagName: string, 
  supportedTags?: Set<string>
): Array<{ tag: string; xml: string }> {
  const openRegex = new RegExp(`<${parentTagName}(?=[\\s>])`);
  const parentMatch = openRegex.exec(xml);
  if (!parentMatch) return [];
  const results: Array<{ tag: string; xml: string }> = [];
  const stack: string[] = [];
  let childStart = -1;
  let childTag = "";
  let pos = xml.indexOf(">", parentMatch.index) + 1;

  while (pos < xml.length) {
    const start = xml.indexOf("<", pos);
    if (start < 0) break;
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) break;
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const end = xml.indexOf("]]>", start + 9);
      if (end < 0) break;
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2);
      if (end < 0) break;
      pos = end + 2;
      continue;
    }

    let end = start + 1;
    let quote: string | null = null;
    for (; end < xml.length; end++) {
      const char = xml[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
    }
    if (end >= xml.length) break;
    const rawTag = xml.slice(start + 1, end);
    const match = XML_TAG_NAME_PATTERN.exec(rawTag);
    pos = end + 1;
    if (!match) continue;
    const [, closing, name] = match;
    const selfClosing = !closing && /\/\s*$/.test(rawTag);

    if (closing) {
      if (stack.length === 0) {
        if (name === parentTagName) break;
        continue;
      }
      stack.pop();
      if (stack.length === 0 && (!supportedTags || supportedTags.has(childTag))) {
        results.push({ tag: childTag, xml: xml.slice(childStart, pos) });
      }
    } else if (stack.length === 0) {
      if (selfClosing) {
        if (!supportedTags || supportedTags.has(name)) {
          results.push({ tag: name, xml: xml.slice(start, pos) });
        }
      } else {
        childStart = start;
        childTag = name;
      }
    }
    if (!closing && !selfClosing) stack.push(name);
  }
  return results;
}

/**
 * Trích xuất cấu trúc TableModel hoàn chỉnh từ XML <w:tbl>, bảo toàn lưới, gộp ngang, gộp dọc và thuộc tính hàng/ô.
 */
export function extractTableModelFromXml(tblXml: string, tableId: string = "table_extracted"): TableModel {
  tblXml = escapeXmlCdataSectionsForParsing(tblXml);
  const tblPrMatch = tblXml.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/);
  const tblPr = tblPrMatch ? tblPrMatch[0] : "";
  const captionMatch = tblPr.match(/<w:tblCaption\b[^>]*w:val=["']([^"']+)["']/i) || tblPr.match(/<w:tblDescription\b[^>]*w:val=["']([^"']+)["']/i);
  const effectiveTableId = captionMatch ? captionMatch[1] : tableId;

  // 1. Viền bảng
  let hasBorders = true;
  let tableBorders: Record<string, { style?: string; size?: number; color?: string }> | undefined;
  if (tblPr.includes("<w:tblBorders>")) {
    const bordersSection = tblPr.match(/<w:tblBorders\b[\s\S]*?<\/w:tblBorders>/)?.[0] || "";
    const hasNone = /<w:(top|bottom|left|right|insideH|insideV)\b[^>]*w:val="none"/i.test(bordersSection);
    const hasVisible = /<w:(top|bottom|left|right|insideH|insideV)\b[^>]*w:val="(?!none)\w+"/i.test(bordersSection);
    if (hasNone && !hasVisible) {
      hasBorders = false;
    }
    tableBorders = {};
    for (const side of ["top", "bottom", "left", "right", "insideH", "insideV"]) {
      const bM = bordersSection.match(new RegExp(`<w:${side}\\b([^>]*)`, "i"));
      if (bM) {
        const valM = bM[1].match(/w:val=["']([^"']+)["']/i);
        const szM = bM[1].match(/w:sz=["'](\d+)["']/i);
        const colorM = bM[1].match(/w:color=["']([^"']+)["']/i);
        tableBorders[side] = {
          style: valM ? valM[1] : undefined,
          size: szM ? parseInt(szM[1], 10) : undefined,
          color: colorM ? colorM[1] : undefined,
        };
      }
    }
  }

  // 2. Padding/Margins của bảng
  let tableMargins: { top?: number; bottom?: number; left?: number; right?: number } | undefined;
  const tblCellMarMatch = tblPr.match(/<w:tblCellMar\b[\s\S]*?<\/w:tblCellMar>/);
  if (tblCellMarMatch) {
    const marXml = tblCellMarMatch[0];
    const topM = marXml.match(/<w:top\b[^>]*w:w=["'](\d+)["']/i);
    const bottomM = marXml.match(/<w:bottom\b[^>]*w:w=["'](\d+)["']/i);
    const leftM = marXml.match(/<w:left\b[^>]*w:w=["'](\d+)["']/i);
    const rightM = marXml.match(/<w:right\b[^>]*w:w=["'](\d+)["']/i);
    tableMargins = {
      top: topM ? parseInt(topM[1], 10) : undefined,
      bottom: bottomM ? parseInt(bottomM[1], 10) : undefined,
      left: leftM ? parseInt(leftM[1], 10) : undefined,
      right: rightM ? parseInt(rightM[1], 10) : undefined,
    };
  }

  // 3. Kích thước và căn chỉnh
  let tableWidthTwips = 9355;
  let widthType: "dxa" | "pct" | "auto" = "dxa";
  const tblWMatch = tblPr.match(/<w:tblW\b[^>]*w:w="(\d+)"[^>]*w:type="([^"]+)"/i);
  if (tblWMatch) {
    tableWidthTwips = Number(tblWMatch[1]) || 9355;
    const wType = tblWMatch[2].toLowerCase();
    if (wType === "pct") widthType = "pct";
    else if (wType === "auto") widthType = "auto";
  }

  const gridCols = Array.from(tblXml.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g));
  const gridColumnsTwips: number[] = gridCols.length > 0 ? gridCols.map(m => Number(m[1])) : [];

  const jcMatch = tblPr.match(/<w:jc\b[^>]*w:val="([^"]+)"/i);
  const alignment: "left" | "center" | "right" = (jcMatch ? jcMatch[1].toLowerCase() : "center") as any;

  // 4. Duyệt các hàng <w:tr> trực tiếp
  const trElements = extractDirectChildren(tblXml, "w:tbl", new Set(["w:tr"]));
  const rows: TableRowModel[] = [];
  let maxGridCols = 0;

  const parseOoxmlBoolean = (xmlSnippet: string, tag: string): boolean => {
    const match = xmlSnippet.match(new RegExp(`<${tag}\\b([^>]*)`, "i"));
    if (!match) return false;
    const attrs = match[1];
    const valMatch = attrs.match(/w:val=["']([^"']+)["']/i);
    if (!valMatch) return true;
    const v = valMatch[1].toLowerCase();
    return v === "1" || v === "true" || v === "on";
  };

  for (let rIdx = 0; rIdx < trElements.length; rIdx++) {
    const trXml = trElements[rIdx].xml;
    const isHeader = parseOoxmlBoolean(trXml, "w:tblHeader");
    const isCantSplit = parseOoxmlBoolean(trXml, "w:cantSplit");
    const heightMatch = trXml.match(/<w:trHeight\b[^>]*w:val="(\d+)"/i);
    const heightTwips = heightMatch ? parseInt(heightMatch[1], 10) : undefined;

    // Duyệt các ô <w:tc> trực tiếp của hàng này
    const tcElements = extractDirectChildren(trXml, "w:tr", new Set(["w:tc"]));
    const cells: TableCellModel[] = [];
    let currentGridCol = 0;

    for (let cIdx = 0; cIdx < tcElements.length; cIdx++) {
      const tcXml = tcElements[cIdx].xml;

      // Colspan (gridSpan)
      const gridSpanMatch = tcXml.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/i);
      const gridSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : 1;

      // Rowspan / vMerge
      const vMergeMatch = tcXml.match(/<w:vMerge\b([^>]*)\/?>/i);
      const isVMergeRestart = Boolean(vMergeMatch && /w:val="restart"/i.test(vMergeMatch[1]));
      const isVMergeContinue = Boolean(vMergeMatch && !isVMergeRestart);
      const vMerge = isVMergeRestart ? "restart" : (isVMergeContinue ? "continue" : undefined);

      // Màu nền shading
      const shdMatch = tcXml.match(/<w:shd\b[^>]*w:fill="([A-Fa-f0-9]{6})"/i);
      const shadingColor = shdMatch && shdMatch[1] !== "auto" && shdMatch[1] !== "FFFFFF" ? `#${shdMatch[1]}` : undefined;

      // Padding ô (tcMar)
      let cellMargins: { top?: number; bottom?: number; left?: number; right?: number } | undefined;
      const tcMarMatch = tcXml.match(/<w:tcMar\b[\s\S]*?<\/w:tcMar>/);
      if (tcMarMatch) {
        const cMarXml = tcMarMatch[0];
        const topM = cMarXml.match(/<w:top\b[^>]*w:w=["'](\d+)["']/i);
        const bottomM = cMarXml.match(/<w:bottom\b[^>]*w:w=["'](\d+)["']/i);
        const leftM = cMarXml.match(/<w:left\b[^>]*w:w=["'](\d+)["']/i);
        const rightM = cMarXml.match(/<w:right\b[^>]*w:w=["'](\d+)["']/i);
        cellMargins = {
          top: topM ? parseInt(topM[1], 10) : undefined,
          bottom: bottomM ? parseInt(bottomM[1], 10) : undefined,
          left: leftM ? parseInt(leftM[1], 10) : undefined,
          right: rightM ? parseInt(rightM[1], 10) : undefined,
        };
      }

      // Viền ô (tcBorders)
      let cellBorders: Record<string, { style?: string; size?: number; color?: string }> | undefined;
      const tcBordersMatch = tcXml.match(/<w:tcBorders\b[\s\S]*?<\/w:tcBorders>/);
      if (tcBordersMatch) {
        cellBorders = {};
        for (const side of ["top", "bottom", "left", "right"]) {
          const bM = tcBordersMatch[0].match(new RegExp(`<w:${side}\\b([^>]*)`, "i"));
          if (bM) {
            const valM = bM[1].match(/w:val=["']([^"']+)["']/i);
            const szM = bM[1].match(/w:sz=["'](\d+)["']/i);
            const colorM = bM[1].match(/w:color=["']([^"']+)["']/i);
            cellBorders[side] = {
              style: valM ? valM[1] : undefined,
              size: szM ? parseInt(szM[1], 10) : undefined,
              color: colorM ? colorM[1] : undefined,
            };
          }
        }
      }

      // Đoạn văn bên trong ô
      const pElements = extractDirectChildren(tcXml, "w:tc", new Set(["w:p"]));
      const paragraphs: TableCellParagraph[] = [];
      const cellTexts: string[] = [];

      for (const pXml of pElements.map(e => e.xml)) {
        const pText = extractParagraphText(pXml).trim();
        if (pText) cellTexts.push(pText);
        const jcM = pXml.match(/<w:jc\b[^>]*w:val="([^"]+)"/i);

        // Trích xuất chi tiết từng run trong paragraph
        const rElements = extractDirectChildren(pXml, "w:p", new Set(["w:r"]));
        const runs: TableCellRun[] = [];

        for (const rElem of rElements) {
          const rXml = rElem.xml;
          const rTagRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br(?:\s[^>]*)?\/?>|<w:tab(?:\s[^>]*)?\/?>/g;
          let rMatch: RegExpExecArray | null;
          let rText = "";
          while ((rMatch = rTagRegex.exec(rXml)) !== null) {
            if (rMatch[0].startsWith("<w:br")) {
              rText += "\n";
            } else if (rMatch[0].startsWith("<w:tab")) {
              rText += "\t";
            } else if (rMatch[1] !== undefined) {
              rText += decodeXmlEntities(rMatch[1]);
            }
          }
          rText = rText.normalize("NFC");
          if (!rText) continue;

          const fontMatch = rXml.match(/<w:rFonts\b[^>]*w:(?:ascii|hAnsi)="([^"]+)"/i);
          const font = fontMatch ? fontMatch[1] : undefined;
          const szMatch = rXml.match(/<w:sz\b[^>]*w:val="(\d+)"/i);
          const sizeHalfPt = szMatch ? parseInt(szMatch[1], 10) : undefined;
          const bold = /<w:b(?:\s|>|\/>)/i.test(rXml) && !/<w:b\s+w:val="(?:0|false)"/i.test(rXml);
          const italic = /<w:i(?:\s|>|\/>)/i.test(rXml) && !/<w:i\s+w:val="(?:0|false)"/i.test(rXml);
          const underline = /<w:u(?:\s|>|\/>)/i.test(rXml) && !/<w:u\s+w:val="(?:none|0|false)"/i.test(rXml);
          const colorMatch = rXml.match(/<w:color\b[^>]*w:val="([A-Fa-f0-9]{6})"/i);
          const color = colorMatch ? colorMatch[1] : undefined;

          // Merge with previous run if identical styling to prevent word splitting and broken diacritics
          const lastRun = runs[runs.length - 1];
          if (
            lastRun &&
            lastRun.bold === bold &&
            lastRun.italic === italic &&
            lastRun.underline === underline &&
            lastRun.font === font &&
            lastRun.sizeHalfPt === sizeHalfPt &&
            lastRun.color === color
          ) {
            lastRun.text = (lastRun.text + rText).normalize("NFC");
          } else {
            runs.push({
              text: rText,
              font,
              sizeHalfPt,
              bold,
              italic,
              underline,
              color,
            });
          }
        }

        if (runs.length === 0 && pText) {
          runs.push({ text: pText });
        }

        paragraphs.push({
          text: pText,
          alignment: (jcM ? jcM[1].toLowerCase() : undefined) as any,
          runs,
        });
      }

      const cellText = cellTexts.join("\n");

      cells.push({
        cellId: `${effectiveTableId}-r${rIdx}-c${cIdx}`,
        rowIndex: rIdx,
        colIndex: cIdx,
        gridColumn: currentGridCol,
        gridSpan,
        vMerge,
        text: cellText,
        paragraphs,
        shadingColor,
        margins: cellMargins,
        borders: cellBorders,
        sourcePath: `word/document.xml#table[${effectiveTableId}]/r[${rIdx}]/c[${cIdx}]`,
      });

      currentGridCol += gridSpan;
    }

    maxGridCols = Math.max(maxGridCols, currentGridCol);
    rows.push({
      rowIndex: rIdx,
      isHeader,
      cantSplit: isCantSplit,
      heightTwips,
      cells,
    });
  }

  // 5. Tính toán rowSpan tương ứng cho các ô có vMerge = restart
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    for (const cell of rows[rIdx].cells) {
      if (cell.vMerge === "restart") {
        let span = 1;
        // Kiểm tra các hàng bên dưới ở cùng gridColumn
        for (let nextR = rIdx + 1; nextR < rows.length; nextR++) {
          const matchingCell = rows[nextR].cells.find(c => c.gridColumn === cell.gridColumn);
          if (matchingCell && matchingCell.vMerge === "continue") {
            span++;
          } else {
            break;
          }
        }
        cell.rowSpan = span;
      }
    }
  }

  const finalColumnsCount = gridColumnsTwips.length > 0 ? gridColumnsTwips.length : maxGridCols;

  return {
    tableId: effectiveTableId,
    rowsCount: rows.length,
    columnsCount: finalColumnsCount,
    gridColumnsTwips,
    tableWidthTwips,
    widthType,
    alignment,
    hasBorders,
    margins: tableMargins,
    borders: tableBorders,
    rows,
    sourcePath: `word/document.xml#table[${effectiveTableId}]`,
  };
}

/**
 * Extracts a table structure and 2D cell data from a <w:tbl>...</w:tbl> XML string.
 * Preserves borders, widths, cell shading, headers, and split-protection accurately.
 */
export function extractTableDetails(tblXml: string, tableId: string = "table_extracted"): {
  rows: number;
  columns: number;
  tableData: string[][];
  html: string;
  text: string;
  tableProperties: TableProperties;
  tableModel: TableModel;
} {
  const model = extractTableModelFromXml(tblXml, tableId);
  const tableData: string[][] = model.rows.map(r => r.cells.map(c => c.text));
  const textLines: string[] = model.rows.map(r => r.cells.map(c => c.text).join(" | "));
  const tableHtml = tableModelToHtmlView(model);

  const hasHeaderRow = model.rows.some(r => r.isHeader);
  const hasCantSplit = model.rows.some(r => r.cantSplit);
  const hasGridSpan = model.rows.some(r => r.cells.some(c => c.gridSpan > 1));
  const hasVMerge = model.rows.some(r => r.cells.some(c => Boolean(c.vMerge)));

  const mergedCells: Array<{ row: number; col: number; colSpan?: number; rowSpan?: number; vMerge?: "restart" | "continue" }> = [];
  for (const row of model.rows) {
    for (const cell of row.cells) {
      if (cell.gridSpan > 1 || cell.vMerge) {
        mergedCells.push({
          row: cell.rowIndex,
          col: cell.colIndex,
          colSpan: cell.gridSpan > 1 ? cell.gridSpan : undefined,
          rowSpan: cell.rowSpan,
          vMerge: cell.vMerge,
        });
      }
    }
  }

  const notes: string[] = [];
  if (model.hasBorders) notes.push("Bảng có đường viền ô");
  else notes.push("Bảng ẩn viền (layout table)");
  if (hasHeaderRow) notes.push("Có lặp hàng tiêu đề khi ngắt trang");
  if (hasCantSplit) notes.push("Có thuộc tính chống ngắt trang giữa hàng (cantSplit)");
  if (hasGridSpan) notes.push("Có ô gộp ngang (colspan)");
  if (hasVMerge) notes.push("Có ô gộp dọc (rowspan/vMerge)");

  return {
    rows: model.rowsCount,
    columns: model.columnsCount,
    tableData,
    html: tableHtml,
    text: textLines.join("\n"),
    tableModel: model,
    tableProperties: {
      rows: model.rowsCount,
      columns: model.columnsCount,
      hasHeaderRow,
      hasBorders: model.hasBorders,
      alignment: model.alignment,
      colWidthsTwips: model.gridColumnsTwips.length > 0 ? model.gridColumnsTwips : undefined,
      isGridSpan: hasGridSpan,
      isVMerge: hasVMerge,
      cantSplitRows: hasCantSplit,
      partiallyPreserved: Boolean(model.gridColumnsTwips.length > 0 || hasVMerge),
      notes,
      mergedCells: mergedCells.length > 0 ? mergedCells : undefined,
    },
  };
}

/**
 * Scans top-level children of <w:body> inside word/document.xml.
 */
function extractBodyXmlChildren(xml: string): Array<{ tag: "w:p" | "w:tbl" | "w:sectPr"; xml: string }> {
  const bodyMatch = /<w:body(?=[\s>])/.exec(xml);
  if (!bodyMatch) return [];
  const results: Array<{ tag: "w:p" | "w:tbl" | "w:sectPr"; xml: string }> = [];
  const supported = new Set(["w:p", "w:tbl", "w:sectPr"]);
  const stack: string[] = [];
  let childStart = -1;
  let childTag = "";
  let pos = xml.indexOf(">", bodyMatch.index) + 1;

  while (pos < xml.length) {
    const start = xml.indexOf("<", pos);
    if (start < 0) break;
    if (xml.startsWith("<!--", start)) {
      const end = xml.indexOf("-->", start + 4);
      if (end < 0) break;
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const end = xml.indexOf("]]>", start + 9);
      if (end < 0) break;
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("<?", start)) {
      const end = xml.indexOf("?>", start + 2);
      if (end < 0) break;
      pos = end + 2;
      continue;
    }

    let end = start + 1;
    let quote: string | null = null;
    for (; end < xml.length; end++) {
      const char = xml[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
    }
    if (end >= xml.length) break;
    const rawTag = xml.slice(start + 1, end);
    const match = /^\s*(\/?)\s*([\w:.-]+)/.exec(rawTag);
    pos = end + 1;
    if (!match) continue;
    const [, closing, name] = match;
    const selfClosing = !closing && /\/\s*$/.test(rawTag);

    if (closing) {
      if (stack.length === 0) {
        if (name === "w:body") break;
        continue;
      }
      if (stack.pop() !== name) throw new Error(`Invalid OOXML nesting near ${name}`);
      if (stack.length === 0 && supported.has(childTag)) {
        results.push({ tag: childTag as "w:p" | "w:tbl" | "w:sectPr", xml: xml.slice(childStart, pos) });
      }
    } else if (stack.length === 0) {
      if (selfClosing) {
        if (supported.has(name)) {
          results.push({ tag: name as "w:p" | "w:tbl" | "w:sectPr", xml: xml.slice(start, pos) });
        }
      } else {
        childStart = start;
        childTag = name;
      }
    }
    if (!closing && !selfClosing) stack.push(name);
  }
  return results;
}

export interface ExtractedBlocksResult {
  blocks: SourceBlock[];
  rawText: string;
  rawHtml: string;
  fileType: "docx" | "txt";
}

/**
 * Extracts SourceBlocks from DOCX buffer.
 */
export async function extractBlocksFromDocx(buffer: Uint8Array | ArrayBuffer): Promise<ExtractedBlocksResult> {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("Invalid DOCX archive: missing word/document.xml");
  }

  const docXml = await docXmlFile.async("string");
  const rawChildren = extractBodyXmlChildren(docXml);

  const blocks: SourceBlock[] = [];
  let blockIndex = 0;

  for (const child of rawChildren) {
    if (child.tag === "w:sectPr") {
      // The body-level sectPr is page/section metadata, not a visible break.
      // A real section break belongs to its paragraph's pPr, if present.
      continue;
    }

    if (child.tag === "w:p") {
      const text = extractParagraphText(child.xml);
      const html = paragraphXmlToHtml(child.xml);
      blocks.push({
        id: `block-${blockIndex}`,
        index: blockIndex,
        kind: "paragraph",
        text,
        html,
        role: "unclassified",
      });
      blockIndex++;
      continue;
    }

    if (child.tag === "w:tbl") {
      const blockId = `block-${blockIndex}`;
      const details = extractTableDetails(child.xml, blockId);
      const unsupported = scanRawTableXmlFeatures(escapeXmlCdataSectionsForParsing(child.xml), blockId, blockId);
      blocks.push({
        id: blockId,
        index: blockIndex,
        kind: "table",
        text: details.text,
        html: details.html,
        rawXml: child.xml,
        unsupportedFeatures: unsupported,
        tableShape: {
          rows: details.rows,
          columns: details.columns,
        },
        tableData: details.tableData,
        tableProperties: details.tableProperties,
        tableModel: details.tableModel,
        role: "unclassified",
      });
      blockIndex++;
      continue;
    }
  }

  return {
    blocks,
    rawText: blocks.map((b) => b.text).join("\n"),
    rawHtml: blocks.map((b) => b.html || "").join(""),
    fileType: "docx",
  };
}

/**
 * Extracts SourceBlocks from plain text (.txt) buffer.
 */
export function extractBlocksFromTxt(textContent: string): ExtractedBlocksResult {
  const normalizedText = textContent.replace(/^\uFEFF/, "");
  const lines = normalizedText.split(/\r?\n/);
  const blocks: SourceBlock[] = [];
  let idx = 0;

  lines.forEach((lineText) => {
    const cleanText = lineText.trim();
    if (!cleanText) return;
    const html = `<p>${escapeHtml(cleanText)}</p>`;
    blocks.push({
      id: `block-${idx}`,
      index: idx,
      kind: "paragraph",
      text: cleanText,
      html,
      role: "unclassified",
    });
    idx++;
  });

  return {
    blocks,
    rawText: normalizedText,
    rawHtml: blocks.map((b) => b.html || "").join(""),
    fileType: "txt",
  };
}
