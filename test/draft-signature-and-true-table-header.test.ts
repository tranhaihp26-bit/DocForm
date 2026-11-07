import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Document, Packer } from "docx";
import type { TableModel } from "../src/shared/tableModel.ts";
import type { DocumentFormatType } from "../src/shared/schemas/document.schema.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../src/canonical/nd30/companyHeader.ts";
import { buildDocxTableFromModel, generateND30DocxBuffer } from "../src/utils/docxExport.ts";
import { verifyCandidateExportFidelity } from "../src/utils/tableRoundtrip.ts";

const draft: DocumentFormatType = {
  regime: "administrative",
  headerProfile: "generic",
  fontFamily: "Times New Roman",
  fontSize: 13,
  orgHeader1: "CƠ QUAN CẤP TRÊN",
  orgHeader2: "CƠ QUAN BAN HÀNH",
  nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
  locationAndDate: "",
  referenceNumber: "",
  documentType: "THÔNG BÁO",
  subject: "Về nội dung cần hoàn thiện",
  bodyHtml: "<p>Đây là bản nháp để rà soát.</p>",
  signTitle: "GIÁM ĐỐC",
  signName: "",
  recipients: "",
};

async function documentXml(bytes: Uint8Array | Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  assert.ok(xml, "DOCX must contain document XML");
  return xml;
}

function sampleTable(firstIsHeader: boolean): TableModel {
  return {
    tableId: "content_tbl_01",
    rowsCount: 2,
    columnsCount: 2,
    gridColumnsTwips: [3000, 3000],
    tableWidthTwips: 6000,
    widthType: "dxa",
    alignment: "left",
    hasBorders: true,
    rows: [0, 1].map(rowIndex => ({
      rowIndex,
      isHeader: rowIndex === 0 && firstIsHeader,
      cantSplit: true,
      cells: [0, 1].map(colIndex => {
        const text = "Ô " + rowIndex + "-" + colIndex;
        return {
          cellId: "cell-" + rowIndex + "-" + colIndex,
          rowIndex, colIndex, gridColumn: colIndex, gridSpan: 1,
          text, alignment: "left" as const,
          paragraphs: [{ text, alignment: "left" as const, runs: [{
            text, font: "Times New Roman", sizeHalfPt: 26, bold: false,
          }] }],
        };
      }),
    })),
  };
}

async function tableBytes(model: TableModel): Promise<Buffer> {
  const doc = new Document({ sections: [{
    children: [buildDocxTableFromModel(model, COMPANY_HEADER_PROFILE_ID)],
  }] });
  return Packer.toBuffer(doc);
}

test("DF-C01: signTitle alone does not generate a fake signing/stamping note", async () => {
  const xml = await documentXml(await generateND30DocxBuffer(draft));
  assert.match(xml, /GIÁM ĐỐC/u);
  assert.doesNotMatch(xml, /\(Ký, đóng dấu\)/u);
});

test("DF-C01: a note explicitly written into signTitle survives, exactly once", async () => {
  const xml = await documentXml(await generateND30DocxBuffer({
    ...draft, signTitle: "GIÁM ĐỐC\n(Ký, đóng dấu)",
  }));
  const notes = [...xml.matchAll(/\(Ký, đóng dấu\)/gu)];
  assert.equal(notes.length, 1, "do not duplicate a source note or add an automatic one");
  assert.doesNotMatch(xml, /\(KÝ, ĐÓNG DẤU\)/u, "retain the source case of an explicit note");
});

test("DF-C03: imported row 0 is not promoted to repeat header by the company profile", async () => {
  const model = sampleTable(false);
  const bytes = await tableBytes(model);
  const xml = await documentXml(bytes);
  assert.doesNotMatch(xml, /<w:tblHeader\b/u);
  const firstRow = xml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/u)?.[0] ?? "";
  assert.match(firstRow, /Ô 0-0/u);
  assert.doesNotMatch(firstRow, /<w:jc w:val="center"/u, "first row is data and stays left aligned");
  const result = await verifyCandidateExportFidelity(bytes, { [model.tableId]: model }, undefined, {
    companyNd30TableFormat: true,
  });
  assert.ok(!result.diffs.some(diff => /tblHeader/u.test(diff.messageVi)),
    "the comparator must not invent a repeat-header diff for a correct unheaded table");
});

test("DF-C03: explicit row 0 header receives the repeat-header property", async () => {
  const model = sampleTable(true);
  const xml = await documentXml(await tableBytes(model));
  const firstRow = xml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/u)?.[0] ?? "";
  assert.match(firstRow, /<w:tblHeader\b/u);
});

test("DF-C03: roundtrip rejects a fabricated repeat-header in first data row", async () => {
  const model = sampleTable(false);
  const zip = await JSZip.loadAsync(await tableBytes(model));
  const xml = await zip.file("word/document.xml")?.async("string") ?? "";
  assert.match(xml, /<w:trPr>/u);
  zip.file("word/document.xml", xml.replace("<w:trPr>", "<w:trPr><w:tblHeader/>"));
  const tampered = await zip.generateAsync({ type: "uint8array" });
  const result = await verifyCandidateExportFidelity(tampered, { [model.tableId]: model }, undefined, {
    companyNd30TableFormat: true,
  });
  assert.ok(result.diffs.some(diff => /tblHeader/u.test(diff.messageVi)),
    "false repeat-header must not pass because the profile has a default header row index");
});
