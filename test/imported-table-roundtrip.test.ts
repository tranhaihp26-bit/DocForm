import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Document, Packer } from "docx";
import { extractTableModelFromXml } from "../src/server/blockExtractor.ts";
import { buildDocxTableFromModel } from "../src/utils/docxExport.ts";
import { compareTableFidelity } from "../src/utils/tableRoundtrip.ts";

describe("Task 4: Imported Table Roundtrip Fidelity", () => {
  const sourceTableXml = `
<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tblPr>
    <w:tblW w:w="9355" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="1200"/>
    <w:gridCol w:w="5155"/>
    <w:gridCol w:w="3000"/>
  </w:tblGrid>
  <w:tr>
    <w:trPr>
      <w:tblHeader/>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>STT</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="8155" w:type="dxa"/>
        <w:gridSpan w:val="2"/>
      </w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Tên hạng mục và đơn vị</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="1200" w:type="dxa"/>
        <w:vMerge w:val="restart"/>
      </w:tcPr>
      <w:p><w:r><w:t>1</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="5155" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>Hạng mục 1.1</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>Phòng Kế hoạch</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="1200" w:type="dxa"/>
        <w:vMerge/>
      </w:tcPr>
      <w:p><w:r><w:t></w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="5155" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>Hạng mục 1.2</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>Phòng Kỹ thuật</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`;

  it("nhập -> xuất -> nhập lại giữ nguyên 100% ô gộp dọc (w:vMerge) và lưới", async () => {
    // 1. Nhập nguồn
    const sourceModel = extractTableModelFromXml(sourceTableXml, "tbl_roundtrip_1");
    assert.equal(sourceModel.rows.length, 3);
    assert.equal(sourceModel.rows[1].cells[0].vMerge, "restart");
    assert.equal(sourceModel.rows[2].cells[0].vMerge, "continue");

    // 2. Xuất bảng bằng buildDocxTableFromModel
    const docxTable = buildDocxTableFromModel(sourceModel);
    const doc = new Document({
      sections: [{ children: [docxTable] }],
    });
    const bytes = await Packer.toBuffer(doc);

    // 3. Đọc lại DOCX vừa xuất
    const zip = await JSZip.loadAsync(bytes);
    const generatedXml = await zip.file("word/document.xml")!.async("string");

    // Khẳng định OOXML chứa đúng thẻ w:vMerge restart và continue
    assert.ok(generatedXml.includes('<w:vMerge w:val="restart"/>') || generatedXml.includes('<w:vMerge w:val="restart"'));
    assert.ok(generatedXml.includes('<w:vMerge w:val="continue"/>') || generatedXml.includes('<w:vMerge/>'));

    // 4. Nhập lại từ XML vừa xuất
    const outputModel = extractTableModelFromXml(generatedXml, "tbl_roundtrip_1");

    // 5. So sánh cấu trúc bằng compareTableFidelity
    const diffs = compareTableFidelity(sourceModel, outputModel);
    assert.equal(diffs.length, 0, `Roundtrip phát sinh lỗi: ${diffs.map(d => d.messageVi).join("; ")}`);
  });

  it("phát hiện chính xác vi phạm khi bảng xuất bị sửa hoặc thiếu ô gộp", () => {
    const sourceModel = extractTableModelFromXml(sourceTableXml, "tbl_mismatch");
    // Tạo bản sao bị lỗi: đổi text và bỏ vMerge
    const corruptModel = JSON.parse(JSON.stringify(sourceModel));
    corruptModel.rows[1].cells[0].vMerge = undefined;
    corruptModel.rows[1].cells[1].text = "Hạng mục đã bị đổi";

    const diffs = compareTableFidelity(sourceModel, corruptModel);
    assert.ok(diffs.length >= 2);
    assert.ok(diffs.some(d => d.type === "merge_mismatch"));
    assert.ok(diffs.some(d => d.type === "content_mismatch"));
  });

  it("convertHtmlToDocxElements với data-source-table-id và importedTables bảo toàn 100% cấu trúc bảng qua pipeline", async () => {
    const { convertHtmlToDocxElements } = await import("../src/utils/docxExport.ts");
    const sourceModel = extractTableModelFromXml(sourceTableXml, "tbl_pipeline_1");

    const html = `<p>Đoạn văn trước bảng</p><table data-source-table-id="tbl_pipeline_1"><tr><td>Bản xem trước HTML</td></tr></table><p>Đoạn văn sau bảng</p>`;
    const elements = convertHtmlToDocxElements(html, "administrative", 0, { tbl_pipeline_1: sourceModel });

    assert.equal(elements.length, 3);
    const doc = new Document({
      sections: [{ children: elements }],
    });
    const bytes = await Packer.toBuffer(doc);

    const zip = await JSZip.loadAsync(bytes);
    const generatedXml = await zip.file("word/document.xml")!.async("string");

    const outputModel = extractTableModelFromXml(generatedXml, "tbl_pipeline_1");
    const diffs = compareTableFidelity(sourceModel, outputModel);
    assert.equal(diffs.length, 0, `Pipeline HTML roundtrip phát sinh lỗi: ${diffs.map(d => d.messageVi).join("; ")}`);
  });
});

