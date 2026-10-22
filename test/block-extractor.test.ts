import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractBlocksFromDocx } from "../src/server/blockExtractor.ts";

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
