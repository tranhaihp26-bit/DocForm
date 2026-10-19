import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decodeHtmlEntities,
  parseRunsFromHtmlString,
  syncTableModelFromHtml,
} from "../src/utils/tableFormatUtils.ts";
import type { TableModel } from "../src/shared/tableModel.ts";

describe("Task 5: Rich Text & Unicode Parity (B07, B08, C06)", () => {
  it("B08: Decode nested HTML entities exactly once", () => {
    const runs = parseRunsFromHtmlString("<p><strong>&amp;lt;X&amp;gt;</strong></p>");
    const actualText = runs.map(r => r.text).join("");
    assert.equal(actualText, "&lt;X&gt;", "Must decode exactly once without double-decoding to <X>");
  });

  it("C06: Decode a numeric entity outside the Basic Multilingual Plane correctly", () => {
    const decoded = decodeHtmlEntities("&#x1F600;");
    const expected = String.fromCodePoint(0x1f600);
    assert.equal(decoded, expected, "Must decode surrogate pairs / characters above 0xFFFF correctly");
  });

  it("B07: Partial markup inherits font and size from the corresponding source run", () => {
    const baseModel: TableModel = {
      tableId: "tbl",
      rowsCount: 1,
      columnsCount: 1,
      gridColumnsTwips: [2000],
      tableWidthTwips: 2000,
      widthType: "dxa",
      alignment: "left",
      hasBorders: true,
      rows: [
        {
          rowIndex: 0,
          isHeader: false,
          cantSplit: true,
          cells: [
            {
              cellId: "c",
              rowIndex: 0,
              colIndex: 0,
              gridColumn: 0,
              gridSpan: 1,
              text: "AB",
              paragraphs: [
                {
                  text: "AB",
                  runs: [
                    {
                      text: "A",
                      font: "Arial",
                      sizeHalfPt: 30,
                      bold: false,
                      italic: false,
                      underline: false,
                    },
                    {
                      text: "B",
                      font: "Courier New",
                      sizeHalfPt: 20,
                      bold: false,
                      italic: false,
                      underline: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const html = '<table data-source-table-id="tbl"><tr><td data-cell-id="c"><p><strong>A</strong><em>B</em></p></td></tr></table>';
    const result = syncTableModelFromHtml(html, baseModel);
    const cell = result.effectiveModel.rows[0]?.cells[0];
    const para = cell?.paragraphs?.[0];
    const runB = para?.runs?.find(r => r.text === "B");
    assert.ok(runB, "Run for 'B' must exist");
    assert.equal(runB!.font, "Courier New", "Run 'B' must inherit Courier New from corresponding source run");
    assert.equal(runB!.sizeHalfPt, 20, "Run 'B' must inherit sizeHalfPt 20 from corresponding source run");
  });
});
