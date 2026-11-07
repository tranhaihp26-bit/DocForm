import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { auditDocxFontSizes, type FontSizeAuditScope } from "../src/canonical/ooxmlFontSizeAudit.ts";

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const packageRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentRelationships = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="BodyBase"><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="BodyDerived"><w:basedOn w:val="BodyBase"/></w:style>
  <w:style w:type="paragraph" w:styleId="BrokenInheritance"><w:basedOn w:val="MissingBase"/></w:style>
  <w:style w:type="paragraph" w:styleId="Footer13"><w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="Table13"><w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="BodyDerived"/><w:pBdr><w:bottom w:val="single" w:sz="15"/></w:pBdr></w:pPr><w:r><w:t>body</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="31"/><w:szCs w:val="30"/></w:rPr><w:t>odd half point</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="BrokenInheritance"/></w:pPr><w:r><w:t>unknown style</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblStyle w:val="Table13"/><w:tblBorders><w:bottom w:val="single" w:sz="15"/></w:tblBorders></w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>table</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>document default</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="29"/><w:szCs w:val="28"/></w:rPr><w:t>second odd half point</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>one channel missing</w:t></w:r></w:p>
    <w:p><w:r><w:t>untouched source A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>untouched source B</w:t></w:r></w:p>
    <w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/></w:sectPr>
  </w:body>
</w:document>`;

const headerXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>header parent</w:t></w:r></w:p>
</w:hdr>`;

const footerXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:pStyle w:val="Footer13"/></w:pPr><w:r><w:t>footer label</w:t></w:r></w:p>
</w:ftr>`;

async function syntheticDocx(styles = stylesXml): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", packageRelationships);
  zip.file("word/_rels/document.xml.rels", documentRelationships);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", styles);
  zip.file("word/header1.xml", headerXml);
  zip.file("word/footer1.xml", footerXml);
  return zip.generateAsync({ type: "uint8array" });
}

function managedScope(role: string, partPath: string, paragraphIndex: number, expectedPt: number): FontSizeAuditScope {
  return { role, partPath, paragraphIndex, expectedPt, origin: "engine_managed" };
}

test("audits direct and inherited OOXML font sizes only for caller-designated engine roles", async () => {
  const scopes: FontSizeAuditScope[] = [
    managedScope("body.normal", "word/document.xml", 0, 14),
    managedScope("hd05.title", "word/document.xml", 1, 15),
    managedScope("body.unknown", "word/document.xml", 2, 14),
    managedScope("body.table", "word/document.xml", 3, 13),
    managedScope("body.doc-default", "word/document.xml", 4, 14),
    managedScope("body.odd", "word/document.xml", 5, 14),
    managedScope("header.parent", "word/header1.xml", 0, 14),
    managedScope("footer.label", "word/footer1.xml", 0, 13),
    { role: "source.untouched", partPath: "word/document.xml", paragraphIndex: 7, origin: "untouched_source" },
    managedScope("body.missing-paragraph", "word/document.xml", 99, 14),
    managedScope("body.non-integer-expectation", "word/document.xml", 0, 14.5),
  ];
  const report = await auditDocxFontSizes(await syntheticDocx(), scopes);
  const byRole = new Map(report.results.map((result) => [result.role, result]));

  assert.equal(byRole.get("body.normal")?.status, "PASS", "paragraph style -> basedOn style inheritance resolves 14pt");
  assert.equal(byRole.get("body.normal")?.actual?.sz.source, "paragraphStyle.basedOn:BodyBase/sz");
  assert.equal(byRole.get("body.normal")?.actual?.szCs.fontSizePt, 14);
  assert.equal(byRole.get("hd05.title")?.status, "FAIL", "15.5pt is reported as a mismatch, never rounded to 15pt");
  assert.equal(byRole.get("hd05.title")?.actual?.sz.fontSizePt, 15.5);
  assert.equal(byRole.get("body.unknown")?.status, "NOT_EVALUATED", "unresolved basedOn inheritance is not counted as PASS");
  assert.equal(byRole.get("body.table")?.status, "PASS", "table text inherits the table style's 13pt values");
  assert.equal(byRole.get("body.table")?.actual?.sz.source, "tableStyle:Table13/sz");
  assert.equal(byRole.get("body.doc-default")?.status, "PASS", "a run without direct size resolves through docDefaults");
  assert.equal(byRole.get("body.doc-default")?.actual?.sz.source, "docDefaults.rPrDefault/sz");
  assert.equal(byRole.get("body.odd")?.status, "FAIL", "odd half-point values fail even when the other channel matches");
  assert.equal(byRole.get("header.parent")?.status, "PASS", "header parts can be audited by the same locator contract");
  assert.equal(byRole.get("footer.label")?.status, "PASS", "footer parts inherit shared styles.xml values");
  assert.equal(byRole.get("source.untouched")?.status, "NOT_APPLICABLE", "untouched source is not a managed-font failure");
  assert.equal(byRole.get("source.untouched")?.origin, "untouched_source");
  const untouchedRuns = report.results.filter((result) => result.role === "source.untouched");
  assert.equal(untouchedRuns.length, 2, "an unindexed source paragraph yields one result per text-bearing run");
  assert.deepEqual(untouchedRuns.map((result) => result.runIndex), [0, 2], "non-text runs are excluded while evidence keeps original run indexes");
  assert.deepEqual(untouchedRuns.map((result) => result.evidence), [
    "word/document.xml#p[7]/r[0]",
    "word/document.xml#p[7]/r[2]",
  ]);
  assert.equal(byRole.get("body.missing-paragraph")?.status, "NOT_EVALUATED");
  assert.equal(byRole.get("body.non-integer-expectation")?.status, "FAIL", "a 14.5pt expectation is rejected without rounding");
  assert.equal(report.failedManagedRuns, 3);
  assert.equal(report.notEvaluatedManagedRuns, 2);
  assert.equal(report.untouchedSourceRuns, 2);

  const withoutInheritedCs = await auditDocxFontSizes(
    await syntheticDocx(stylesXml.replaceAll('<w:szCs w:val="28"/>', "")),
    [managedScope("body.missing-cs", "word/document.xml", 6, 14)],
  );
  assert.equal(withoutInheritedCs.results[0].status, "NOT_EVALUATED", "missing w:szCs is reported instead of guessed");
});

test("does not treat paragraph or table line widths as font sizes", async () => {
  const report = await auditDocxFontSizes(await syntheticDocx(), [
    managedScope("body.normal", "word/document.xml", 0, 14),
    managedScope("body.table", "word/document.xml", 3, 13),
  ]);
  assert.deepEqual(report.results.map((result) => result.status), ["PASS", "PASS"]);
});
