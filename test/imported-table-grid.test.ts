import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractTableDetails, extractTableModelFromXml } from "../src/server/blockExtractor.ts";
import { tableModelToHtmlView } from "../src/shared/tableModel.ts";

describe("Task 3: Imported Table Grid Extraction (OOXML TableModel)", () => {
  const sampleTblXml = `
<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tblPr>
    <w:tblW w:w="9355" w:type="dxa"/>
    <w:jc w:val="center"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="1500"/>
    <w:gridCol w:w="4500"/>
    <w:gridCol w:w="3355"/>
  </w:tblGrid>
  <w:tr>
    <w:trPr>
      <w:tblHeader/>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr><w:tcW w:w="1500" w:type="dxa"/></w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>STT</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="7855" w:type="dxa"/>
        <w:gridSpan w:val="2"/>
      </w:tcPr>
      <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Nội dung chi tiết</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="1500" w:type="dxa"/>
        <w:vMerge w:val="restart"/>
      </w:tcPr>
      <w:p><w:r><w:t>1</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>Dự án A</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="3355" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>100 triệu</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
  <w:tr>
    <w:trPr>
      <w:cantSplit/>
    </w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="1500" w:type="dxa"/>
        <w:vMerge/>
      </w:tcPr>
      <w:p><w:r><w:t></w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>Giai đoạn 2</w:t></w:r></w:p>
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="3355" w:type="dxa"/></w:tcPr>
      <w:p><w:r><w:t>50 triệu</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>`;

  it("trích xuất chính xác TableModel với lưới gridColumnsTwips và thuộc tính hàng/ô", () => {
    const model = extractTableModelFromXml(sampleTblXml, "tbl_test_1");
    assert.equal(model.tableId, "tbl_test_1");
    assert.deepEqual(model.gridColumnsTwips, [1500, 4500, 3355]);
    assert.equal(model.rows.length, 3);
    assert.equal(model.columnsCount, 3);

    // Hàng 0: Header, cantSplit, 2 ô logic (ô 2 span 2)
    const r0 = model.rows[0];
    assert.equal(r0.isHeader, true);
    assert.equal(r0.cantSplit, true);
    assert.equal(r0.cells.length, 2);
    assert.equal(r0.cells[0].text, "STT");
    assert.equal(r0.cells[1].gridSpan, 2);
    assert.equal(r0.cells[1].text, "Nội dung chi tiết");

    // Hàng 1: cantSplit, ô 0 có vMerge restart
    const r1 = model.rows[1];
    assert.equal(r1.isHeader, false);
    assert.equal(r1.cantSplit, true);
    assert.equal(r1.cells[0].vMerge, "restart");
    assert.equal(r1.cells[0].rowSpan, 2); // Tính toán rowspan 2
    assert.equal(r1.cells[0].text, "1");

    // Hàng 2: ô 0 có vMerge continue
    const r2 = model.rows[2];
    assert.equal(r2.cells[0].vMerge, "continue");
    assert.equal(r2.cells[1].text, "Giai đoạn 2");
    assert.equal(r2.cells[2].text, "50 triệu");
  });

  it("HTML view sinh ra từ TableModel bỏ qua ô vMerge continue để tránh lệch lưới", () => {
    const model = extractTableModelFromXml(sampleTblXml, "tbl_test_1");
    const html = tableModelToHtmlView(model);

    // Hàng 0 có 2 thẻ th (vì ô 2 colspan 2)
    assert.ok(html.includes('<th data-cell-id="tbl_test_1-r0-c0"'));
    assert.ok(html.includes('STT</p></th>'));
    assert.ok(html.includes('colspan="2"'));

    // Hàng 1 có rowspan="2" trên ô "1"
    assert.ok(html.includes('rowspan="2"'));

    // Hàng 2 chỉ chứa 2 thẻ <td> (cho "Giai đoạn 2" và "50 triệu"), KHÔNG chứa <td> cho ô continue
    const trMatches = Array.from(html.matchAll(/<tr>([\s\S]*?)<\/tr>/g));
    assert.equal(trMatches.length, 3);
    const row2Cells = Array.from(trMatches[2][1].matchAll(/<td[\s\S]*?<\/td>/g));
    assert.equal(row2Cells.length, 2, "Hàng 2 không được có thẻ <td> thừa cho ô vMerge continue");
  });
});
