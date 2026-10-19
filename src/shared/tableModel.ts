/**
 * @file tableModel.ts
 * @description Mô hình cấu trúc lưới bảng Word OOXML độc lập với HTML.
 * Bảo toàn tọa độ lưới, gộp ngang (gridSpan), gộp dọc (vMerge), cantSplit,
 * tblHeader và chiều rộng twips từng cột.
 */

export interface TableCellRun {
  text: string;
  font?: string;
  sizeHalfPt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface TableCellParagraph {
  text: string;
  alignment?: "left" | "center" | "right" | "justify";
  runs?: TableCellRun[];
}

export interface TableCellModel {
  cellId: string;
  rowIndex: number;
  colIndex: number;
  gridColumn: number;
  gridSpan: number;
  vMerge?: "restart" | "continue";
  rowSpan?: number; // HTML rowspan tương ứng (tính toán từ chuỗi restart -> continue)
  text: string;
  paragraphs: TableCellParagraph[];
  shadingColor?: string;
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
  borders?: Record<string, { style?: string; size?: number; color?: string }>;
  alignment?: "left" | "center" | "right" | "justify";
  sourcePath?: string;
}

export interface TableRowModel {
  rowIndex: number;
  isHeader: boolean;
  cantSplit: boolean;
  heightTwips?: number;
  cells: TableCellModel[];
}

export interface TableModel {
  tableId: string;
  rowsCount: number;
  columnsCount: number;
  gridColumnsTwips: number[];
  tableWidthTwips: number;
  widthType: "dxa" | "pct" | "auto";
  alignment: "left" | "center" | "right";
  hasBorders: boolean;
  margins?: { top?: number; bottom?: number; left?: number; right?: number };
  borders?: Record<string, { style?: string; size?: number; color?: string }>;
  rows: TableRowModel[];
  sourcePath?: string;
}

/**
 * Tính toán HTML view từ TableModel.
 * Quy tắc:
 * 1. Ô có vMerge === 'continue' KHÔNG được sinh thẻ <td> trong HTML view để tránh lệch cột trên Web/TipTap.
 * 2. Ô có vMerge === 'restart' được gắn thuộc tính rowspan="N" chuẩn HTML.
 * 3. Gắn data-source-table-id để duy trì provenance.
 */
export function tableModelToHtmlView(model: TableModel): string {
  const colgroupHtml = model.gridColumnsTwips.length > 0
    ? `<colgroup>${model.gridColumnsTwips.map(w => `<col style="width: ${(w / 20).toFixed(1)}pt;" />`).join("")}</colgroup>`
    : "";

  const rowsHtml: string[] = [];

  for (let rIdx = 0; rIdx < model.rows.length; rIdx++) {
    const row = model.rows[rIdx];
    const cellsHtml: string[] = [];

    for (let cIdx = 0; cIdx < row.cells.length; cIdx++) {
      const cell = row.cells[cIdx];

      // Nếu ô là vMerge continue, trong HTML nó bị che bởi ô restart ở trên -> không sinh thẻ <td>
      if (cell.vMerge === "continue") {
        continue;
      }

      const attrs: string[] = [];
      if (cell.gridSpan > 1) {
        attrs.push(`colspan="${cell.gridSpan}"`);
      }
      if (cell.rowSpan && cell.rowSpan > 1) {
        attrs.push(`rowspan="${cell.rowSpan}"`);
      }
      if (cell.cellId) {
        attrs.push(`data-cell-id="${cell.cellId}"`);
      }
      if (cell.vMerge) {
        attrs.push(`data-vmerge="${cell.vMerge}"`);
      }

      const styleParts: string[] = [
        model.hasBorders ? "border: 1px solid #000;" : "border: none;",
        "padding: 5px 8px;",
        "vertical-align: top;",
      ];
      if (cell.shadingColor) {
        styleParts.push(`background-color: ${cell.shadingColor};`);
      }
      attrs.push(`style="${styleParts.join(" ")}"`);

      const tag = (row.isHeader || (rIdx === 0 && row.isHeader)) ? "th" : "td";
      const cellContent = cell.paragraphs.length > 0
        ? cell.paragraphs.map(p => {
            if (p.runs && p.runs.length > 0) {
              const mergedRuns: TableCellRun[] = [];
              for (const r of p.runs) {
                const normText = (r.text || "").normalize("NFC");
                if (!normText) continue;
                const last = mergedRuns[mergedRuns.length - 1];
                if (
                  last &&
                  last.bold === r.bold &&
                  last.italic === r.italic &&
                  last.underline === r.underline &&
                  last.font === r.font &&
                  last.sizeHalfPt === r.sizeHalfPt &&
                  last.color === r.color
                ) {
                  last.text = (last.text + normText).normalize("NFC");
                } else {
                  mergedRuns.push({ ...r, text: normText });
                }
              }

              const runsHtml = mergedRuns.map(r => {
                let txt = escapeHtml(r.text)
                  .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
                  .replace(/\n/g, "<br/>");
                const styleParts: string[] = [];
                if (r.font && r.font !== "Times New Roman") {
                  styleParts.push(`font-family: ${r.font};`);
                }
                if (r.sizeHalfPt && r.sizeHalfPt !== 24) {
                  styleParts.push(`font-size: ${(r.sizeHalfPt / 2).toFixed(1)}pt;`);
                }
                if (r.bold) txt = `<strong>${txt}</strong>`;
                if (r.italic) txt = `<em>${txt}</em>`;
                if (r.underline) txt = `<u>${txt}</u>`;
                if (styleParts.length > 0) {
                  txt = `<span style="${styleParts.join(" ")}">${txt}</span>`;
                }
                return txt;
              }).join("");
              return `<p${p.alignment ? ` style="text-align: ${p.alignment};"` : ""}>${runsHtml}</p>`;
            }
            return `<p${p.alignment ? ` style="text-align: ${p.alignment};"` : ""}>${escapeHtml((p.text || "").normalize("NFC")).replace(/\n/g, "<br/>")}</p>`;
          }).join("")
        : `<p>${escapeHtml((cell.text || "").normalize("NFC")).replace(/\n/g, "<br/>")}</p>`;

      cellsHtml.push(`<${tag} ${attrs.join(" ")}>${cellContent}</${tag}>`);
    }

    rowsHtml.push(`<tr>${cellsHtml.join("")}</tr>`);
  }

  const borderStyle = model.hasBorders
    ? "border-collapse: collapse; border: 1px solid #000;"
    : "border-collapse: collapse; border: none;";

  const widthStyle = model.tableWidthTwips > 0
    ? `width: ${(model.tableWidthTwips / 20).toFixed(1)}pt; max-width: 100%;`
    : `width: 100%;`;

  return `<table data-source-table-id="${model.tableId}" style="${widthStyle} ${borderStyle} margin: 8px 0;">${colgroupHtml}<tbody>${rowsHtml.join("")}</tbody></table>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
