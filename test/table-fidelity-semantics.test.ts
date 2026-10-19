import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import { compareTableFidelity, verifyCandidateExportFidelity } from "../src/utils/tableRoundtrip.ts";
import { extractTableModelFromXml } from "../src/server/blockExtractor.ts";
import type { TableModel } from "../src/shared/tableModel.ts";

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const makeModel = (): TableModel => ({
  tableId: "t",
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
                  text: "AB",
                  font: "Arial",
                  sizeHalfPt: 26,
                  bold: false,
                  italic: false,
                  underline: false,
                  color: "000000",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

const tbl = (id: string) =>
  `<w:tbl><w:tblPr><w:tblCaption w:val="${id}"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>${id}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

async function makeZipBytes(xml: string): Promise<Uint8Array> {
  return new JSZip().file("word/document.xml", xml).generateAsync({ type: "uint8array" });
}

const wrapDocument = (body: string) =>
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

describe("Task 4: Table Fidelity Semantics (C02, C03, C04, C05)", () => {
  it("C02: Comparison detects complete disappearance of a known table grid", () => {
    const a = makeModel();
    const o = copy(a);
    o.gridColumnsTwips = [];

    const diffs = compareTableFidelity(a, o);
    assert.equal(diffs.some(d => d.type === "width_mismatch"), true, "Must flag width_mismatch when grid disappears");
  });

  it("C03: Equivalent run splitting does not reject a semantically identical table", () => {
    const a = makeModel();
    const cell = a.rows[0]?.cells[0];
    const para = cell?.paragraphs?.[0];
    const run = para?.runs?.[0];
    assert.ok(run && para && para.runs);
    para.runs = [
      { ...run, text: "A" },
      { ...run, text: "B" },
    ];
    const o = makeModel();

    const diffs = compareTableFidelity(a, o);
    assert.equal(diffs.length, 0, "Semantically identical runs must yield 0 diffs");
  });

  it("C04: Margin property insertion order does not affect fidelity", () => {
    const a = makeModel();
    const o = makeModel();
    a.margins = { top: 100, left: 200 };
    o.margins = { left: 200, top: 100 };

    const diffs = compareTableFidelity(a, o);
    assert.equal(diffs.length, 0, "Different key order in margins must not report property_mismatch");
  });

  it("C05: Table order follows the approved manifest rather than object insertion order", async () => {
    const a = extractTableModelFromXml(tbl("A"), "A");
    const b = extractTableModelFromXml(tbl("B"), "B");

    // Candidate has table B first, then table A
    const candidateXml = wrapDocument(tbl("B") + tbl("A"));
    const payload = await makeZipBytes(candidateXml);

    // Manifest expects table A first, then table B
    const r = await verifyCandidateExportFidelity(payload, { B: b, A: a }, { tableIds: ["A", "B"] });
    assert.equal(r.safe, false, "Must detect inverted table order specified by manifest");
  });
});
