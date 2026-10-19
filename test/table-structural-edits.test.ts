import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Document, Packer } from "docx";

import { extractTableModelFromXml } from "../src/server/blockExtractor.ts";
import { convertHtmlToDocxElements } from "../src/utils/docxExport.ts";
import { verifyCandidateExportFidelity } from "../src/utils/tableRoundtrip.ts";
import { syncTableModelFromHtml } from "../src/utils/tableFormatUtils.ts";
import type { TableModel } from "../src/shared/tableModel.ts";

const tbl = (id: string) =>
  `<w:tbl><w:tblPr><w:tblCaption w:val="${id}"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>${id}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

describe("Task 3: Table Structural Edits & Row Preservation", () => {
  it("C08: Removing an imported row is either reflected or explicitly blocked during export", async () => {
    const original = tbl("t").replace("</w:tbl>", "<w:tr><w:tc><w:p><w:r><w:t>ROW_TO_DELETE</w:t></w:r></w:p></w:tc></w:tr></w:tbl>");
    const m = extractTableModelFromXml(original, "t");
    assert.equal(m.rows.length, 2, "Original model must have 2 rows");

    const html = `<table data-source-table-id="t"><tr><td data-cell-id="${m.rows[0].cells[0].cellId}">t</td></tr></table>`;
    const elements = convertHtmlToDocxElements(html, "administrative", 0, { t: m });
    const payload = await Packer.toBuffer(new Document({ sections: [{ children: elements }] }));
    const z = await JSZip.loadAsync(payload);
    const xml = await z.file("word/document.xml")?.async("string");

    assert.ok(xml, "DOCX must contain word/document.xml");
    const r = await verifyCandidateExportFidelity(payload, { t: m }, { tableIds: ["t"] });

    const acceptedStaleRows = r.safe && xml.includes("ROW_TO_DELETE");
    assert.equal(acceptedStaleRows, false, "DOCX must not retain stale rows that were deleted by user");
  });

  it("syncTableModelFromHtml reflects user-deleted row and updates rowsCount", () => {
    const baseModel: TableModel = {
      tableId: "t_test",
      rowsCount: 2,
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
              cellId: "cell_r0",
              rowIndex: 0,
              colIndex: 0,
              gridColumn: 0,
              gridSpan: 1,
              text: "ROW_0",
              paragraphs: [{ text: "ROW_0", runs: [{ text: "ROW_0", font: "Times New Roman", sizeHalfPt: 24 }] }],
            },
          ],
        },
        {
          rowIndex: 1,
          isHeader: false,
          cantSplit: true,
          cells: [
            {
              cellId: "cell_r1",
              rowIndex: 1,
              colIndex: 0,
              gridColumn: 0,
              gridSpan: 1,
              text: "ROW_1",
              paragraphs: [{ text: "ROW_1", runs: [{ text: "ROW_1", font: "Times New Roman", sizeHalfPt: 24 }] }],
            },
          ],
        },
      ],
    };

    const html = '<table data-source-table-id="t_test"><tr><td data-cell-id="cell_r0"><p>ROW_0_EDITED</p></td></tr></table>';
    const result = syncTableModelFromHtml(html, baseModel);

    assert.equal(result.hasEdits, true, "Must flag edits when row was deleted and text changed");
    assert.equal(result.effectiveModel.rows.length, 1, "Must reduce effectiveModel.rows to 1 row");
    assert.equal(result.effectiveModel.rowsCount, 1);
    assert.equal(result.effectiveModel.rows[0].cells[0].text, "ROW_0_EDITED");
  });

  it("D04: Adding a row retains its text in DOCX or explicitly blocks export", async () => {
    const m = extractTableModelFromXml(tbl("t"), "t");
    const known = `<td data-cell-id="${m.rows[0].cells[0].cellId}">BASE</td>`;
    const marker = "NEW_ROW";
    const html = `<table data-source-table-id="t"><tr>${known}</tr><tr><td>${marker}</td></tr></table>`;
    const elements = convertHtmlToDocxElements(html, "administrative", 0, { t: m });
    const payload = await Packer.toBuffer(new Document({ sections: [{ children: elements }] }));
    const xml = await (await JSZip.loadAsync(payload)).file("word/document.xml")!.async("string");

    assert.ok(xml.includes(marker), "DOCX must contain the newly added row text");
    const gate = await verifyCandidateExportFidelity(payload, { t: m }, { tableIds: ["t"] });
    const acceptedDataLoss = gate.safe && !xml.includes(marker);
    assert.equal(acceptedDataLoss, false, "Must not accept data loss when adding row");
  });

  it("D05: Adding a column retains its text in DOCX or explicitly blocks export", async () => {
    const m = extractTableModelFromXml(tbl("t"), "t");
    const known = `<td data-cell-id="${m.rows[0].cells[0].cellId}">BASE</td>`;
    const marker = "NEW_COLUMN";
    const html = `<table data-source-table-id="t"><tr>${known}<td>${marker}</td></tr></table>`;
    const elements = convertHtmlToDocxElements(html, "administrative", 0, { t: m });
    const payload = await Packer.toBuffer(new Document({ sections: [{ children: elements }] }));
    const xml = await (await JSZip.loadAsync(payload)).file("word/document.xml")!.async("string");

    assert.ok(xml.includes(marker), "DOCX must contain the newly added column text");
    const gate = await verifyCandidateExportFidelity(payload, { t: m }, { tableIds: ["t"] });
    const acceptedDataLoss = gate.safe && !xml.includes(marker);
    assert.equal(acceptedDataLoss, false, "Must not accept data loss when adding column");
  });
});
