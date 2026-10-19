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
