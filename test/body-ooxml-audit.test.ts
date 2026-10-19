import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { 
  extractDirectBodyParagraphs, 
  extractBodyOoxmlEvidence 
} from "../src/canonical/bodyOoxmlEvidence.ts";

describe("Task 7: Element-based Body OOXML Evidence & Audit", () => {
  const sampleDocumentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:ind w:firstLine="720"/>
        <w:spacing w:line="276" w:lineRule="auto" w:before="40" w:after="120"/>
        <w:jc w:val="both"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="26"/></w:rPr>
        <w:t>Đoạn văn thân bài thứ nhất.</w:t>
      </w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p>
            <w:pPr>
              <w:ind w:firstLine="0" w:left="100"/>
              <w:jc w:val="center"/>
            </w:pPr>
            <w:r>
              <w:rPr><w:sz w:val="20"/></w:rPr>
              <w:t>Ô bảng 1 - Tiêu đề nhỏ 10pt</w:t>
            </w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:p>
            <w:r>
              <w:rPr><w:sz w:val="20"/></w:rPr>
              <w:t>Ô bảng 2 - Nội dung nhỏ 10pt</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:pPr>
        <w:ind w:firstLine="720"/>
        <w:spacing w:line="276" w:lineRule="auto" w:before="40" w:after="120"/>
        <w:jc w:val="both"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="26"/></w:rPr>
        <w:t>Đoạn văn thân bài thứ hai.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:ind w:firstLine="567"/>
        <w:spacing w:line="276" w:lineRule="auto" w:before="40" w:after="120"/>
        <w:jc w:val="both"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="28"/></w:rPr>
        <w:t>Đoạn văn thân bài thứ ba (14pt).</w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:bottom="1134" w:left="1701" w:right="850"/>
    </w:sectPr>
  </w:body>
</w:document>
  `;

  it("chỉ đọc đúng 3 đoạn văn trực tiếp của body, KHÔNG nuốt các đoạn văn trong ô bảng", () => {
    const directParas = extractDirectBodyParagraphs(sampleDocumentXml);
    assert.equal(directParas.length, 3, "Phải có đúng 3 đoạn văn trực tiếp của body");
    assert.equal(directParas[0].text, "Đoạn văn thân bài thứ nhất.");
    assert.equal(directParas[1].text, "Đoạn văn thân bài thứ hai.");
    assert.equal(directParas[2].text, "Đoạn văn thân bài thứ ba (14pt).");

    // Đoạn trong ô bảng không xuất hiện trong directParagraphs
    assert.ok(!directParas.some(p => p.text.includes("Ô bảng 1")));
    assert.ok(!directParas.some(p => p.text.includes("Ô bảng 2")));
  });

  it("đo đạc chính xác firstLineIndent, fontSize và lineSpacing từ OOXML", () => {
    const ev = extractBodyOoxmlEvidence(sampleDocumentXml);
    assert.equal(ev.directParagraphsCount, 3);
    assert.ok(ev.hasDirectBodyParagraphs);

    // Cỡ chữ trong body chỉ từ 13pt (26) đến 14pt (28), không bị ô bảng (10pt - 20) kéo tụt xuống
    assert.equal(ev.fontSizeRangePt?.min, 13);
    assert.equal(ev.fontSizeRangePt?.max, 14);

    // Thụt đầu dòng từ 567 dxa (1.0cm) đến 720 dxa (1.27cm), không bị ô bảng (0 dxa) kéo tụt xuống
    assert.equal(ev.firstLineIndentRangeDxa?.min, 567);
    assert.equal(ev.firstLineIndentRangeDxa?.max, 720);

    // Dãn dòng chuẩn 276 (1.15 line)
    assert.equal(ev.lineSpacingRangeDxa?.min, 276);
    assert.equal(ev.lineSpacingRangeDxa?.max, 276);
  });

  it("trả về hasDirectBodyParagraphs = false khi documentXml không có đoạn trực tiếp nào", () => {
    const xmlEmpty = `<w:document><w:body><w:tbl><w:tr><w:tc><w:p><w:t>Only in table</w:t></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const ev = extractBodyOoxmlEvidence(xmlEmpty);
    assert.equal(ev.directParagraphsCount, 0);
    assert.equal(ev.hasDirectBodyParagraphs, false);
    assert.equal(ev.fontSizeRangePt, undefined);
    assert.equal(ev.firstLineIndentRangeDxa, undefined);
  });
});
