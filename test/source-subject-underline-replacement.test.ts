import assert from "node:assert/strict";
import { hasReplaceableSubjectUnderlineShape } from "../src/utils/sourceHeaderShapes.ts";

const subject = "Về việc tổ chức hoạt động tổng kết";
const line = (fallbackTo = "40pt,0pt", extra = "") => `<mc:AlternateContent>
  <mc:Choice Requires="wps"><w:drawing><wp:inline><wp:extent cx="508000" cy="0"/><a:graphic><a:graphicData><wps:wsp><wps:spPr><a:xfrm><a:ext cx="508000" cy="0"/></a:xfrm><a:prstGeom prst="line"/></wps:spPr></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>
  <mc:Fallback><w:pict><v:line from="0pt,0pt" to="${fallbackTo}"/></w:pict></mc:Fallback>
</mc:AlternateContent>${extra}`;
const paragraph = (shape = line()) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${subject}</w:t></w:r>${shape}</w:p>`;

assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(), subject, subject), true,
  "An exact subject paragraph with one horizontal DrawingML/VML line is replaceable");
const drawingArrow = line().replace(
  "</wps:spPr>",
  '<a:ln><a:tailEnd type="triangle"/></a:ln></wps:spPr>',
);
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(drawingArrow), subject, subject), false,
  "A DrawingML line with an arrowhead must not be replaced as a plain subject underline");
const vmlArrow = line().replace(
  /(<v:line\b[^>]*)(\/>)/,
  '$1><v:stroke o:endarrow="triangle"/></v:line>',
);
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(vmlArrow), subject, subject), false,
  "A VML line with an arrowhead must not be replaced as a plain subject underline");
const pageAnchoredLine = paragraph(line().replace(
  "<wp:inline>",
  '<wp:anchor><wp:positionV relativeFrom="page"><wp:posOffset>987654321</wp:posOffset></wp:positionV>',
).replace("</wp:inline>", "</wp:anchor>"));
assert.equal(hasReplaceableSubjectUnderlineShape(pageAnchoredLine, subject, subject), false,
  "A page-anchored line far from the subject must not be replaced as its underline");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(), "Different subject", subject), false,
  "Text that does not match the selected subject must keep its source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line().replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/, "")), subject, subject), false,
  "A missing VML fallback must keep the source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line("40pt,1pt")), subject, subject), false,
  "A slanted source fallback must not be treated as a horizontal divider");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line("41pt,0pt")), subject, subject), false,
  "A mismatched VML fallback must keep the source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line("40pt,0pt", "<w:fldSimple w:instr=\"PAGE\"/>")), subject, subject), false,
  "A field in the source paragraph must keep the source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line("40pt,0pt", "<w:txbxContent/>")), subject, subject), false,
  "A textbox in the source paragraph must keep the source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line("40pt,0pt", "<a:blip/>")), subject, subject), false,
  "An image reference must keep the source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(line("40pt,0pt", '<v:imagedata r:id="rId1"/>')), subject, subject), false,
  "A relationship-backed VML image must keep the source warning");

// An anchored line with empty v:imagedata has no reliable relation to the subject paragraph.
const observedSubjectLine = `<mc:AlternateContent>
  <mc:Choice Requires="wps">
    <w:drawing>
      <wp:anchor relativeHeight="251658240">
        <wp:positionV relativeFrom="page"><wp:posOffset>987654321</wp:posOffset></wp:positionV>
        <wp:extent cx="1788160" cy="10160"/>
        <wp:docPr id="3" name="Straight Connector 3"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
            <wps:wsp>
              <wps:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="1788160" cy="10160"/></a:xfrm>
                <a:prstGeom prst="line"/>
              </wps:spPr>
            </wps:wsp>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>
  </mc:Choice>
  <mc:Fallback>
    <w:pict>
      <v:line id="Straight Connector 3" style="position:absolute;width:140.8pt;height:0.8pt" o:gfxdata="...">
        <v:imagedata/>
      </v:line>
    </w:pict>
  </mc:Fallback>
</mc:AlternateContent>`;

assert.equal(hasReplaceableSubjectUnderlineShape(paragraph(observedSubjectLine), subject, subject), false,
  "An absolute/page-anchored line with empty v:imagedata must keep its source warning");

// Positive header table case with empty v:imagedata and o:gfxdata
const observedHeaderTable = `<w:tbl>
  <w:tr>
    <w:tc>
      <w:p><w:r><w:t>CƠ QUAN CHỦ QUẢN</w:t></w:r></w:p>
      <w:p><w:r><w:t>TÊN ĐƠN VỊ</w:t></w:r></w:p>
      <w:p>${observedSubjectLine}</w:p>
    </w:tc>
  </w:tr>
</w:tbl>`;
import { hasReplaceableHeaderShapeLines } from "../src/utils/sourceHeaderShapes.ts";
assert.equal(hasReplaceableHeaderShapeLines(observedHeaderTable), true,
  "A header table with empty v:imagedata line shapes is replaceable");

// Header table with actual relationship image must NOT be replaceable
const imageHeaderTable = observedHeaderTable.replace("<v:imagedata/>", '<v:imagedata r:id="rId2"/>');
assert.equal(hasReplaceableHeaderShapeLines(imageHeaderTable), false,
  "A header table containing a relationship-backed image must not be replaced as lines");

// Dedicated line paragraph representation (as observed in block-4 of real re-imported candidate)
const dedicatedLineP = (shape = line()) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${shape}</w:r></w:p>`;
assert.equal(hasReplaceableSubjectUnderlineShape(dedicatedLineP(), subject, subject), true,
  "A dedicated centered line paragraph with no text matching the selected subject via sourceText is replaceable");
assert.equal(hasReplaceableSubjectUnderlineShape(dedicatedLineP(), "Khác", subject), false,
  "A dedicated line paragraph with non-matching sourceText must not be replaced");
assert.equal(hasReplaceableSubjectUnderlineShape(dedicatedLineP(line().replace("<mc:Fallback>", "<mc:Fallback><v:textbox/>")), subject, subject), false,
  "A dedicated line paragraph with a textbox must keep its source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(dedicatedLineP(line("40pt,5pt")), subject, subject), false,
  "A dedicated line paragraph with slanted VML fallback must keep its source warning");
assert.equal(hasReplaceableSubjectUnderlineShape(`<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r>${line()}</w:r></w:p>`, subject, subject), false,
  "A non-centered dedicated line paragraph must not be recognized as a subject line");
assert.equal(hasReplaceableSubjectUnderlineShape(`<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Bảng</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`, subject, subject), false,
  "Table borders must not be mistaken for a paragraph subject underline");
assert.equal(hasReplaceableSubjectUnderlineShape(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>${subject}</w:t></w:r></w:p>`, subject, subject), false,
  "Text underline (w:u) without drawing shapes must not be mistaken for a Shape Line");

console.log("[SOURCE SUBJECT SHAPE] Exact horizontal line replacement is narrow and fail-closed.");
