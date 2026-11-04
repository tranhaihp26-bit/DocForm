import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractBlocksFromDocx, extractBlocksFromTxt, extractTableModelFromXml, UnsupportedDocxContentError } from "../src/server/blockExtractor.ts";
import { segmentLocalExtraction } from "../src/utils/localFileImport.ts";
import { assessExportSafety } from "../src/shared/importFidelity.ts";

const paragraph = (text: string) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc><w:tcPr/>${paragraph(text)}</w:tc>`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph("Đoạn trước bảng")}
    <w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>${cell("Cơ quan")}${cell("Quốc hiệu")}</w:tr>
      <w:tr>${cell("Số 01")}${cell("Ngày 15")}</w:tr>
    </w:tbl>
    ${paragraph("Đoạn sau bảng")}
    <w:sectPr/>
  </w:body>
</w:document>`;

const zip = new JSZip();
zip.file("word/document.xml", xml);
const result = await extractBlocksFromDocx(await zip.generateAsync({ type: "nodebuffer" }));

assert.deepEqual(result.blocks.map((block) => block.kind), ["paragraph", "table", "paragraph"],
  "Terminal sectPr stores page settings and must not become visible document content");
assert.equal(result.blocks[0].text, "Đoạn trước bảng");
assert.deepEqual(result.blocks[1].tableShape, { rows: 2, columns: 2 });
assert.deepEqual(result.blocks[1].tableData, [["Cơ quan", "Quốc hiệu"], ["Số 01", "Ngày 15"]]);
assert.equal(result.blocks[2].text, "Đoạn sau bảng");
console.log("[PASS] DOCX OOXML: paragraphs and table preserved; terminal section properties omitted from content");

const cdataZip = new JSZip();
cdataZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t><![CDATA[CDATA text with <w:p>literal markup</w:p> and </w:t> literal close, plus &amp; &lt;]]></w:t></w:r></w:p><w:p><!-- comment text <w:t>COMMENT DECOY</w:t> with <![CDATA[ marker --><w:r><w:t>VISIBLE TEXT &amp;lt; &#233;</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
const cdataResult = await extractBlocksFromDocx(await cdataZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(cdataResult.blocks.map((block) => block.text), ["CDATA text with <w:p>literal markup</w:p> and </w:t> literal close, plus &amp; &lt;", "VISIBLE TEXT &lt; é"],
  "CDATA content must stay literal text rather than leak XML delimiters or become nested source blocks");

const cdataTableZip = new JSZip();
cdataTableZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t><![CDATA[Table cell with </w:t> literal close and <w:tbl><w:tr><w:tc>fake nested table</w:tc></w:tr></w:tbl><w:jc w:val="right"/>]]></w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`);
const cdataTableResult = await extractBlocksFromDocx(await cdataTableZip.generateAsync({ type: "nodebuffer" }));
const cdataTableBlock = cdataTableResult.blocks[0];
assert.ok(cdataTableBlock.tableModel, "DOCX table extraction should expose its structured table model");
assert.ok(cdataTableBlock.unsupportedFeatures, "DOCX table extraction should expose unsupported-feature findings");
assert.deepEqual(cdataTableBlock.tableData, [["Table cell with </w:t> literal close and <w:tbl><w:tr><w:tc>fake nested table</w:tc></w:tr></w:tbl><w:jc w:val=\"right\"/>" ]]);
assert.equal(cdataTableBlock.tableModel.rows[0].cells[0].paragraphs[0].runs?.[0]?.text,
  "Table cell with </w:t> literal close and <w:tbl><w:tr><w:tc>fake nested table</w:tc></w:tr></w:tbl><w:jc w:val=\"right\"/>");
assert.equal(cdataTableBlock.tableModel.rows[0].cells[0].paragraphs[0].alignment, undefined,
  "markup-like CDATA text must not override actual table-cell paragraph alignment");
assert.equal(cdataTableBlock.unsupportedFeatures.some((feature) => feature.code === "nested_table"), false,
  "markup-like CDATA text must not be reported as an unsupported nested table");

const alternateZip = new JSZip();
alternateZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>${paragraph("Trước")}<mc:AlternateContent><mc:Choice Requires="future">${paragraph("Bản mới")}</mc:Choice><mc:Fallback>${paragraph("Bản tương thích")}</mc:Fallback></mc:AlternateContent>${paragraph("Sau")}</w:body></w:document>`);
const alternateResult = await extractBlocksFromDocx(await alternateZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(alternateResult.blocks.map(block => block.text), ["Trước", "Bản tương thích", "Sau"],
  "AlternateContent must choose one branch without duplicating source text");
assert.equal(alternateResult.blocks[1].unsupportedFeatures?.[0]?.code, "alternate_content",
  "Selected fallback must be flagged for source comparison");
const alternateManifest = segmentLocalExtraction({
  filename: "synthetic.docx", fileType: "docx", bytes: new ArrayBuffer(0), fileSize: 0,
  rawBlocks: alternateResult.blocks, rawText: alternateResult.rawText,
  rawHtml: alternateResult.rawHtml, sourceHash: "synthetic", blockCount: alternateResult.blocks.length,
}, "administrative").importFidelityManifest;
assert.ok(alternateManifest?.unsupportedFeatures.some(feature => feature.code === "alternate_content"),
  "Paragraph warnings must reach the import fidelity manifest");
assert.equal(assessExportSafety(alternateManifest, { roundtripVerified: true }).decision, "reject",
  "Unsupported source content must block transformed DOCX export");

const unknownZip = new JSZip();
unknownZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:customThing><w:r><w:t>Văn bản lạ</w:t></w:r></w:customThing>${paragraph("Mã lỗi &#x110000;")}</w:body></w:document>`);
const unknownResult = await extractBlocksFromDocx(await unknownZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(unknownResult.blocks.map(block => block.unsupportedFeatures?.[0]?.code),
  ["unsupported_body_element", "invalid_xml_entity"],
  "Unsupported wrappers and invalid character references must be visible to the review gate");

const unknownWrapperZip = new JSZip();
unknownWrapperZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:customThing><w:p><w:r><w:t>Đoạn nằm trong phần tử lạ</w:t></w:r></w:p></w:customThing><w:customThing><w:tbl><w:tr>${cell("Bảng nằm trong phần tử lạ")}</w:tr></w:tbl></w:customThing></w:body></w:document>`);
const unknownWrapperResult = await extractBlocksFromDocx(await unknownWrapperZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(unknownWrapperResult.blocks.map(block => block.text), ["Đoạn nằm trong phần tử lạ", "Bảng nằm trong phần tử lạ"],
  "Unknown wrappers must retain paragraph and table payloads in source order");
assert.ok(unknownWrapperResult.blocks.every(block => block.unsupportedFeatures?.some(feature => feature.code === "unsupported_body_element")),
  "Flattened unknown wrappers around readable paragraphs or tables must still require source review");

const sdtZip = new JSZip();
sdtZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph("Trước") }<w:sdt><w:sdtPr/><w:sdtContent>${paragraph("Trong vùng nội dung")}</w:sdtContent></w:sdt>${paragraph("Sau")}</w:body></w:document>`);
const sdtResult = await extractBlocksFromDocx(await sdtZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(sdtResult.blocks.map(block => block.text), ["Trước", "Trong vùng nội dung", "Sau"],
  "Structured document tag content must remain in source order");
assert.equal(sdtResult.blocks[1].unsupportedFeatures?.length ?? 0, 0,
  "Readable w:sdtContent must not be treated as an unknown wrapper");

const paragraphSemanticsZip = new JSZip();
paragraphSemanticsZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>Đoạn căn đều</w:t><w:br w:type="page"/><w:t>Trang kế</w:t></w:r></w:p></w:body></w:document>`);
const paragraphSemanticsResult = await extractBlocksFromDocx(await paragraphSemanticsZip.generateAsync({ type: "nodebuffer" }));
assert.equal(paragraphSemanticsResult.blocks[0].text, "Đoạn căn đều\fTrang kế",
  "Page breaks must remain explicit in extracted paragraph text");
assert.match(paragraphSemanticsResult.blocks[0].html ?? "", /text-align: justify/,
  "w:jc both must render as justified text");
assert.match(paragraphSemanticsResult.blocks[0].html ?? "", /data-page-break="true"/,
  "Explicit page breaks must remain visible in the import preview");

const tableWidthFirst = extractTableModelFromXml(`<w:tbl><w:tblPr><w:tblW w:w="4800" w:type="dxa"/></w:tblPr><w:tr>${cell("A")}</w:tr></w:tbl>`);
const tableWidthReordered = extractTableModelFromXml(`<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="4800"/></w:tblPr><w:tr>${cell("A")}</w:tr></w:tbl>`);
assert.equal(tableWidthReordered.tableWidthTwips, tableWidthFirst.tableWidthTwips,
  "Table width extraction must not depend on attribute order");
assert.equal(tableWidthReordered.tableWidthTwips, 4800);

const styledTableZip = new JSZip();
styledTableZip.file("word/styles.xml", `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="table" w:styleId="BaseCenter"><w:tblPr><w:jc w:val="center"/></w:tblPr></w:style><w:style w:styleId="ChildCenter" w:type="table"><w:basedOn w:val="BaseCenter"/><w:tblPr/></w:style></w:styles>`);
styledTableZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblStyle w:val="ChildCenter"/></w:tblPr><w:tr>${cell("Kế thừa căn giữa")}</w:tr></w:tbl><w:tbl><w:tblPr><w:tblStyle w:val="ChildCenter"/><w:jc w:val="right"/></w:tblPr><w:tr>${cell("Căn trực tiếp ghi đè style")}</w:tr></w:tbl></w:body></w:document>`);
const styledTableResult = await extractBlocksFromDocx(await styledTableZip.generateAsync({ type: "nodebuffer" }));
assert.equal(styledTableResult.blocks[0].tableModel?.alignment, "center",
  "A table without direct w:jc must inherit alignment through its table style basedOn chain");
assert.equal(styledTableResult.blocks[1].tableModel?.alignment, "right",
  "Direct table alignment must override inherited table style alignment");

const styledBorderTableZip = new JSZip();
styledBorderTableZip.file("word/styles.xml", `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="table" w:styleId="GridStyle"><w:tblPr><w:jc w:val="center"/><w:tblBorders><w:top w:val="single" w:sz="8"/></w:tblBorders></w:tblPr></w:style></w:styles>`);
styledBorderTableZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblStyle w:val="GridStyle"/></w:tblPr><w:tr>${cell("Bảng có viền kế thừa")}</w:tr></w:tbl></w:body></w:document>`);
const styledBorderTableResult = await extractBlocksFromDocx(await styledBorderTableZip.generateAsync({ type: "nodebuffer" }));
assert.equal(styledBorderTableResult.blocks[0].tableModel?.alignment, "center",
  "The supported table alignment should still be resolved when other style properties are present");
assert.ok(styledBorderTableResult.blocks[0].unsupportedFeatures?.some(feature => feature.code === "unsupported_table_style"),
  "Inherited style properties beyond the supported alignment must be surfaced for source review");
const styledBorderManifest = segmentLocalExtraction({
  filename: "synthetic-styled-border-table.docx", fileType: "docx", bytes: new ArrayBuffer(0), fileSize: 0,
  rawBlocks: styledBorderTableResult.blocks, rawText: styledBorderTableResult.rawText,
  rawHtml: styledBorderTableResult.rawHtml, sourceHash: "synthetic-styled-border-table", blockCount: styledBorderTableResult.blocks.length,
}, "administrative").importFidelityManifest;
assert.ok(styledBorderManifest?.unsupportedFeatures.some(feature => feature.code === "unsupported_table_style"),
  "Unsupported inherited table styles must reach the Step 1 fidelity manifest");
assert.equal(assessExportSafety(styledBorderManifest, { roundtripVerified: true }).decision, "reject",
  "Transformed export must fail closed when inherited table style formatting is not preserved");

const unresolvedStyleZip = new JSZip();
unresolvedStyleZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblStyle w:val="MissingStyle"/></w:tblPr><w:tr>${cell("Bảng thiếu style")}</w:tr></w:tbl></w:body></w:document>`);
const unresolvedStyleResult = await extractBlocksFromDocx(await unresolvedStyleZip.generateAsync({ type: "nodebuffer" }));
assert.ok(unresolvedStyleResult.blocks[0].unsupportedFeatures?.some(feature => feature.code === "unresolved_table_style"),
  "A table style reference missing from the source package must be surfaced for review");
const unresolvedStyleManifest = segmentLocalExtraction({
  filename: "synthetic-missing-style.docx", fileType: "docx", bytes: new ArrayBuffer(0), fileSize: 0,
  rawBlocks: unresolvedStyleResult.blocks, rawText: unresolvedStyleResult.rawText,
  rawHtml: unresolvedStyleResult.rawHtml, sourceHash: "synthetic-style", blockCount: unresolvedStyleResult.blocks.length,
}, "administrative").importFidelityManifest;
assert.ok(unresolvedStyleManifest?.unsupportedFeatures.some(feature => feature.code === "unresolved_table_style"),
  "An unresolved table style warning must reach the import fidelity manifest");
assert.equal(assessExportSafety(unresolvedStyleManifest, { roundtripVerified: true }).decision, "reject",
  "The fidelity gate must block transformed export while a referenced table style is unresolved");

const numberingZip = new JSZip();
numberingZip.file("word/numbering.xml", `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1.%2)"/></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1.%2.%3."/></w:lvl></w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride></w:num></w:numbering>`);
const numberedParagraph = (level: number, content: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="5"/></w:numPr></w:pPr><w:r><w:t>${content}</w:t></w:r></w:p>`;
numberingZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${numberedParagraph(0, "Mục cha")}${numberedParagraph(1, "Mục con A")}${numberedParagraph(1, "Mục con B")}${numberedParagraph(2, "Mục con cháu")}${numberedParagraph(0, "Mục cha tiếp")}${numberedParagraph(1, "Mục con khởi động lại")}</w:body></w:document>`);
const numberingResult = await extractBlocksFromDocx(await numberingZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(numberingResult.blocks.map(block => block.text), [
  "7. Mục cha", "7.a) Mục con A", "7.b) Mục con B", "7.b.I. Mục con cháu", "8. Mục cha tiếp", "8.a) Mục con khởi động lại",
], "Numbering should honor list-instance start overrides, level formats, hierarchy tokens, and child restarts");

const customRestartZip = new JSZip();
customRestartZip.file("word/numbering.xml", `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:lvlRestart w:val="0"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1.%2)"/></w:lvl></w:abstractNum><w:num w:numId="9"><w:abstractNumId w:val="3"/></w:num></w:numbering>`);
const customRestartParagraph = (level: number, content: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="9"/></w:numPr></w:pPr><w:r><w:t>${content}</w:t></w:r></w:p>`;
customRestartZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${customRestartParagraph(0, "Cha một")}${customRestartParagraph(1, "Con một")}${customRestartParagraph(0, "Cha hai")}${customRestartParagraph(1, "Con hai")}</w:body></w:document>`);
const customRestartResult = await extractBlocksFromDocx(await customRestartZip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(customRestartResult.blocks.map(block => block.text), ["1. Cha một", "Con một", "2. Cha hai", "Con hai"],
  "Custom child restart rules outside the supported default must not be replaced with guessed numbering");
assert.ok(customRestartResult.blocks[1].unsupportedFeatures?.some(feature => feature.code === "unsupported_numbering")
  && customRestartResult.blocks[3].unsupportedFeatures?.some(feature => feature.code === "unsupported_numbering"),
  "Every paragraph using a custom restart rule must be flagged for source review");
const customRestartManifest = segmentLocalExtraction({
  filename: "synthetic-custom-restart.docx", fileType: "docx", bytes: new ArrayBuffer(0), fileSize: 0,
  rawBlocks: customRestartResult.blocks, rawText: customRestartResult.rawText,
  rawHtml: customRestartResult.rawHtml, sourceHash: "synthetic-custom-restart", blockCount: customRestartResult.blocks.length,
}, "administrative").importFidelityManifest;
assert.ok(customRestartManifest?.unsupportedFeatures.some(feature => feature.code === "unsupported_numbering"),
  "A custom restart warning must reach the Step 1 import fidelity manifest");
assert.equal(assessExportSafety(customRestartManifest, { roundtripVerified: true }).decision, "reject",
  "Transformed export must fail closed while numbering restart semantics are unresolved");

const unsupportedNumberingZip = new JSZip();
unsupportedNumberingZip.file("word/numbering.xml", `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="chicago"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="8"><w:abstractNumId w:val="2"/></w:num></w:numbering>`);
unsupportedNumberingZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="8"/></w:numPr></w:pPr><w:r><w:t>Nội dung có kiểu số chưa hỗ trợ</w:t></w:r></w:p></w:body></w:document>`);
const unsupportedNumberingResult = await extractBlocksFromDocx(await unsupportedNumberingZip.generateAsync({ type: "nodebuffer" }));
assert.equal(unsupportedNumberingResult.blocks[0].text, "Nội dung có kiểu số chưa hỗ trợ",
  "Unknown numbering formats must not be rendered with a guessed prefix");
assert.ok(unsupportedNumberingResult.blocks[0].unsupportedFeatures?.some(feature => feature.code === "unsupported_numbering"),
  "Unknown numbering formats must reach the import review warning");
const unsupportedNumberingManifest = segmentLocalExtraction({
  filename: "synthetic-numbering.docx", fileType: "docx", bytes: new ArrayBuffer(0), fileSize: 0,
  rawBlocks: unsupportedNumberingResult.blocks, rawText: unsupportedNumberingResult.rawText,
  rawHtml: unsupportedNumberingResult.rawHtml, sourceHash: "synthetic-numbering", blockCount: unsupportedNumberingResult.blocks.length,
}, "administrative").importFidelityManifest;
assert.ok(unsupportedNumberingManifest?.unsupportedFeatures.some(feature => feature.code === "unsupported_numbering"),
  "Unsupported numbering must reach the import fidelity gate");
assert.equal(assessExportSafety(unsupportedNumberingManifest, { roundtripVerified: true }).decision, "reject",
  "Transformed export must fail closed while automatic numbering is unresolved");

const mixedHyperlinkZip = new JSZip();
mixedHyperlinkZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:tbl><w:tblPr/><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">Trước </w:t></w:r><w:hyperlink r:id="rId1"><w:r><w:t>liên kết</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> sau</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`);
const mixedHyperlinkBlock = (await extractBlocksFromDocx(await mixedHyperlinkZip.generateAsync({ type: "nodebuffer" }))).blocks[0];
const mixedHyperlinkParagraph = mixedHyperlinkBlock.tableModel?.rows[0]?.cells[0]?.paragraphs[0];
assert.equal(mixedHyperlinkBlock.tableData?.[0]?.[0], "Trước liên kết sau",
  "Table cell text must include normal runs before and after a hyperlink");
assert.equal(mixedHyperlinkParagraph?.text, mixedHyperlinkBlock.tableData?.[0]?.[0],
  "Table paragraph text must match the extracted cell text");
assert.equal(mixedHyperlinkParagraph?.runs?.map(run => run.text).join(""), mixedHyperlinkParagraph?.text,
  "Table paragraph runs must not omit hyperlink text or the surrounding normal runs");
assert.ok(mixedHyperlinkBlock.unsupportedFeatures?.some(feature => feature.code === "hyperlink_in_table"),
  "Hyperlinks in tables must remain flagged for source comparison");

const txtSource = "  Mục 1  \r\n\r\n\tMục 2\r\n";
const txtResult = extractBlocksFromTxt(txtSource);
assert.equal(txtResult.rawText, txtSource, "TXT rawText must retain source line endings, blank lines, and trailing newline");
assert.deepEqual(txtResult.blocks.map(block => block.text), ["  Mục 1", "", "\tMục 2", ""],
  "TXT blocks must retain leading indentation and blank-line positions");
assert.match(txtResult.blocks[0].html ?? "", /^<p>&nbsp;&nbsp;Mục 1<\/p>$/,
  "TXT preview must visibly preserve leading spaces");

const drawingZip = new JSZip();
drawingZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:drawing/></w:r></w:p></w:body></w:document>`);
const drawingResult = await extractBlocksFromDocx(await drawingZip.generateAsync({ type: "nodebuffer" }));
assert.equal(drawingResult.blocks[0].unsupportedFeatures?.[0]?.code, "drawing_or_image",
  "Drawing-only paragraphs must be flagged rather than silently considered empty and safe");

const altChunkZip = new JSZip();
altChunkZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:altChunk r:id="html-part"/></w:body></w:document>`);
await assert.rejects(
  extractBlocksFromDocx(await altChunkZip.generateAsync({ type: "nodebuffer" })),
  UnsupportedDocxContentError,
  "Body-level embedded content without readable paragraphs must fail closed",
);

const headerDrawingZip = new JSZip();
headerDrawingZip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body><w:tbl><w:tblPr/><w:tr><w:tc>${paragraph("CÔNG TY MẪU")}<w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p></w:tc><w:tc>${paragraph("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM")}</w:tc></w:tr></w:tbl>${paragraph("Nội dung văn bản")}</w:body></w:document>`);
const headerDrawingResult = await extractBlocksFromDocx(await headerDrawingZip.generateAsync({ type: "nodebuffer" }));
const headerDrawingBlock = headerDrawingResult.blocks[0];
assert.ok(headerDrawingBlock.unsupportedFeatures?.some(feature => feature.code === "drawing_or_image"),
  "The header table source must contain an unsupported drawing finding");
const headerDrawingImport = segmentLocalExtraction({
  filename: "synthetic-header-image.docx", fileType: "docx", bytes: new ArrayBuffer(0), fileSize: 0,
  rawBlocks: headerDrawingResult.blocks, rawText: headerDrawingResult.rawText,
  rawHtml: headerDrawingResult.rawHtml, sourceHash: "synthetic-header-image", blockCount: headerDrawingResult.blocks.length,
}, "administrative");
assert.equal(headerDrawingImport.blocks![0].role, "header", "The fixture must exercise a classified header table");
assert.ok(headerDrawingImport.importFidelityManifest?.unsupportedFeatures.some(feature =>
  feature.code === "drawing_or_image" && feature.blockId === headerDrawingBlock.id),
  "Drawing warnings in classified header tables must reach the import fidelity manifest");
assert.equal(assessExportSafety(headerDrawingImport.importFidelityManifest, { roundtripVerified: true }).decision, "reject",
  "A transformed export must remain blocked when a header image is not preserved");
