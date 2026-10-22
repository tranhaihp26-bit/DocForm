import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";

const manifestApi = await import("../src/utils/fullTextManifest.ts").catch(() => undefined) as any;

const documentXml = (risky = false) => `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
 <w:body>
  <w:p><w:r><w:t>Main &amp; first</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell source</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Repeated quote</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  <w:p><w:r><w:t>Repeated quote</w:t></w:r></w:p>
  <w:p><w:r><w:t>APPENDIX_1_TITLE</w:t></w:r></w:p>
  <w:p><w:r><w:t>SHARED_APPENDIX_TEXT</w:t></w:r></w:p>
  <w:p><w:r><w:t>APPENDIX_2_TITLE</w:t></w:r></w:p>
  <w:p><w:r><w:t>SHARED_APPENDIX_TEXT</w:t></w:r></w:p>
  ${risky ? `
  <w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>HIDDEN_SENTINEL</w:t></w:r></w:p>
  <w:p><w:del><w:r><w:delText>DELETED_SENTINEL</w:delText></w:r></w:del></w:p>
  <w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText><w:fldChar w:fldCharType="end"/><w:t>1</w:t></w:r></w:p>
  <w:p><w:r><w:t>Before box</w:t><w:drawing><w:txbxContent><w:p><w:r><w:t>Textbox source</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Outer cell</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>NESTED_SENTINEL</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:tc></w:tr></w:tbl>` : ""}
  <w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/></w:sectPr>
 </w:body>
</w:document>`;

async function fixture(risky = false) {
  const zip = new JSZip();
  zip.file("word/document.xml", documentXml(risky));
  zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
    <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  </Relationships>`);
  zip.file("word/header1.xml", `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header source</w:t></w:r></w:p></w:hdr>`);
  zip.file("word/footer1.xml", `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Footer source</w:t></w:r></w:p></w:ftr>`);
  zip.file("word/footnotes.xml", `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="-1"><w:p><w:r><w:t>Separator</w:t></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:t>Footnote source</w:t></w:r></w:p></w:footnote></w:footnotes>`);
  zip.file("word/endnotes.xml", `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="1"><w:p><w:r><w:t>Endnote source</w:t></w:r></w:p></w:endnote></w:endnotes>`);
  if (risky) {
    zip.file("word/comments.xml", `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1"><w:p><w:r><w:t>COMMENT_SENTINEL</w:t></w:r></w:p></w:comment></w:comments>`);
    zip.file("word/charts/chart1.xml", `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:title><c:tx><c:rich><a:p><a:r><a:t>CHART_SENTINEL</a:t></a:r></a:p></c:rich></c:tx></c:title></c:chart>`);
    zip.file("word/media/image1.png", new Uint8Array([1, 2, 3]));
  }
  return zip.generateAsync({ type: "uint8array" });
}

async function emptyDocx() {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("builds source-linked text segments for body, table cells, referenced stories and notes", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const bytes = await fixture();
  const sourceSha256 = sha256(bytes);
  const manifest = await manifestApi.buildFullTextManifest(bytes, sourceSha256, 4);

  assert.equal(manifest.sourceSha256, sourceSha256);
  assert.equal(manifest.sourceGeneration, 4);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), [
    "Main & first", "Cell source", "Repeated quote", "Repeated quote",
    "APPENDIX_1_TITLE", "SHARED_APPENDIX_TEXT", "APPENDIX_2_TITLE", "SHARED_APPENDIX_TEXT",
    "Header source", "Footer source", "Footnote source", "Endnote source",
  ]);
  const repeated = manifest.segments.filter((segment: any) => segment.text === "Repeated quote");
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0].id, repeated[1].id);
  assert.notEqual(repeated[0].sourceAnchor, repeated[1].sourceAnchor);
  assert.equal(repeated[0].sourceBlockId, "block-1");
  assert.equal(repeated[0].tableId, "block-1");
  assert.equal(repeated[0].cellId, "block-1:r0:c1");
  assert.equal(repeated[0].rowIndex, 0);
  assert.equal(repeated[0].cellIndex, 1);
  assert.equal(repeated[1].sourceBlockId, "block-2");
  const repeatedAppendixText = manifest.segments.filter((segment: any) => segment.text === "SHARED_APPENDIX_TEXT");
  assert.equal(repeatedAppendixText.length, 2);
  assert.notEqual(repeatedAppendixText[0].sourceBlockId, repeatedAppendixText[1].sourceBlockId);
  assert.equal(manifest.segments.every((segment: any) => !("role" in segment)), true);
  assert.equal(manifest.segments.every((segment: any) => segment.sourceSha256 === sourceSha256), true);
  assert.equal(manifest.segments.every((segment: any) => /^[a-f0-9]{64}$/.test(segment.textSha256)), true);
  assert.equal(manifest.parts.find((part: any) => part.partUri === "/word/header1.xml").status, "included");
});

test("fails closed and lists excluded hidden, revision, field, nested, comment, chart and image content", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const bytes = await fixture(true);
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 1);
  const submittedText = manifest.segments.map((segment: any) => segment.text).join("\n");

  assert.equal(submittedText.split("Textbox source").length - 1, 1);
  assert.equal(submittedText.includes("Before box"), true);
  assert.match(manifest.segments.find((segment: any) => segment.text === "Textbox source").sourceAnchor, /textbox\[0\]\/p\[0\]/);
  for (const sentinel of ["HIDDEN_SENTINEL", "DELETED_SENTINEL", "PAGE", "COMMENT_SENTINEL", "CHART_SENTINEL", "NESTED_SENTINEL"]) {
    assert.equal(submittedText.includes(sentinel), false, `${sentinel} must not be submitted`);
  }
  assert.equal(manifest.coverage.status, "partial");
  assert.equal(manifest.coverage.complete, false);
  const issueCodes = manifest.excluded.map((item: any) => item.code);
  for (const code of ["hidden_text", "tracked_changes", "field_instruction", "nested_table", "unsupported_text_part", "media_unreadable"]) {
    assert.ok(issueCodes.includes(code), `missing exclusion code: ${code}`);
  }
});

test("rejects a mismatched source hash and does not modify the source bytes", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const bytes = await fixture();
  const before = sha256(bytes);
  await assert.rejects(
    manifestApi.buildFullTextManifest(bytes, "0".repeat(64), 0),
    (error: Error) => error.message.includes("source hash mismatch"),
  );
  assert.equal(sha256(bytes), before);
});

test("represents an empty but valid document without inventing text segments", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const bytes = await emptyDocx();
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 2);
  assert.equal(manifest.segments.length, 0);
  assert.equal(manifest.coverage.complete, true);
});

test("extracts Word text when a valid namespace alias replaces the literal w prefix", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:body><w:p><w:r><x:t>Namespace alias text</x:t></w:r></w:p><w:sectPr/></w:body>
</w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 3);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["Namespace alias text"]);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});

test("extracts body blocks when structural WordprocessingML tags use a valid namespace alias", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:body><x:p><x:r><x:t>Structural alias text</x:t></x:r></x:p><x:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2400"/></w:tblGrid><x:tr><w:trPr/><x:tc><w:tcPr/><x:p><x:r><x:t>Alias table cell</x:t></x:r></x:p></x:tc></x:tr></x:tbl><w:sectPr/></w:body>
</w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 5);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["Structural alias text", "Alias table cell"]);
  assert.equal(manifest.segments[1].cellId, "block-1:r0:c0");
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});

test("marks WordprocessingML structural prefixes with conflicting bindings as partial", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:body><x:p xmlns:x="urn:other"><x:r><x:t>Ambiguous alias text</x:t></x:r></x:p><w:sectPr/></w:body>
</w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 6);

  assert.equal(manifest.segments.some((segment: any) => segment.text.includes("Ambiguous alias text")), false);
  assert.equal(manifest.coverage.status, "partial");
  assert.equal(manifest.coverage.complete, false);
  assert.ok(manifest.excluded.some((item: any) => item.code === "unsupported_text_part"));
});

test("marks a rebound namespace prefix on a structural Word element as partial", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:body><x:p xmlns:x="urn:other"><x:r><x:t>Rebound structural text</x:t></x:r></x:p><w:sectPr/></w:body>
</w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 7);

  assert.equal(manifest.coverage.status, "partial");
  assert.equal(manifest.coverage.complete, false);
  assert.ok(manifest.excluded.some((item: any) => item.code === "unsupported_text_part"));
});

test("marks ambiguous default-namespace structural content as partial", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
 <w:body><p xmlns="urn:other"><r><t>Ambiguous default namespace text</t></r></p><w:sectPr/></w:body>
</w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 8);

  assert.equal(manifest.coverage.status, "partial");
  assert.equal(manifest.coverage.complete, false);
  assert.ok(manifest.excluded.some((item: any) => item.code === "unsupported_text_part"));
});


test("does not claim complete coverage when body contains an unsupported alternate-content wrapper", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
 <w:body><mc:AlternateContent><mc:Choice Requires="w"><w:p><w:r><w:t>Choice branch text</w:t></w:r></w:p></mc:Choice><mc:Fallback><w:p><w:r><w:t>Fallback branch text</w:t></w:r></w:p></mc:Fallback></mc:AlternateContent><w:sectPr/></w:body>
</w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 9);

  assert.equal(manifest.coverage.status, "partial");
  assert.equal(manifest.coverage.complete, false);
  assert.ok(manifest.excluded.some((item: any) => item.code === "unsupported_wrapper"));
  assert.equal(manifest.segments.some((segment: any) => /branch text/.test(segment.text)), false);
});

test("extracts supported WordprocessingML tags with a valid Unicode namespace prefix", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<文:document xmlns:文="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><文:body><文:p><文:r><文:t>Unicode prefix text</文:t></文:r></文:p><文:sectPr/></文:body></文:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 10);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["Unicode prefix text"]);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});

test("detects text-bearing unknown XML parts with a Unicode namespace prefix", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Known body</w:t></w:r></w:p></w:body></w:document>`);
  zip.file("word/custom.xml", `<文:custom xmlns:文="urn:unknown"><文:t>Unclassified Unicode text</文:t></文:custom>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 11);

  assert.equal(manifest.coverage.status, "partial");
  assert.equal(manifest.coverage.complete, false);
  assert.ok(manifest.excluded.some((item: any) => item.packagePartUri === "/word/custom.xml" && item.code === "unsupported_text_part"));
});

test("does not extract a Word paragraph nested in a foreign Unicode wrapper", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><文:wrapper xmlns:文="urn:foreign"><w:p><w:r><w:t>Nested foreign-wrapper text</w:t></w:r></w:p></文:wrapper><w:sectPr/></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 12);

  assert.equal(manifest.segments.some((segment: any) => segment.text.includes("Nested foreign-wrapper text")), false);
  assert.equal(manifest.coverage.status, "partial");
  assert.ok(manifest.excluded.some((item: any) => item.code === "unsupported_wrapper"));
});

test("normalizes aliased WordprocessingML note ID attributes", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sectPr/></w:body></w:document>`);
  zip.file("word/footnotes.xml", `<x:footnotes xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:footnote x:id="1"><x:p><x:r><x:t>Aliased footnote text</x:t></x:r></x:p></x:footnote></x:footnotes>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 13);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["Aliased footnote text"]);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});

test("ignores the valid table row property exception without lowering coverage", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr/><w:tblGrid/><w:tr><w:tblPrEx/><w:tc><w:p><w:r><w:t>Table row exception content</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 14);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["Table row exception content"]);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});

test("normalizes unprefixed Word elements only while the Word default namespace is in scope", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><r><t>Scoped Word text</t></r></w:p><p><r><t>No-namespace text</t></r></p><w:sectPr/></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 15);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["Scoped Word text"]);
  assert.equal(manifest.coverage.status, "partial");
  assert.ok(manifest.excluded.some((item: any) => item.code === "unsupported_wrapper"));
});

test("does not treat namespace-like text as an XML namespace declaration", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><x:p><x:r><x:t>Literal xmlns:x="urn:foreign" stays ordinary text</x:t></x:r></x:p><w:sectPr/></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 16);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ['Literal xmlns:x="urn:foreign" stays ordinary text']);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});

test("reads CDATA as literal Word text without parsing tag-shaped CDATA content", async () => {
  assert.ok(manifestApi?.buildFullTextManifest, "full-text manifest builder must exist");
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t><![CDATA[CDATA text with <w:p>literal markup</w:p> and </w:t> literal close, plus &amp; &lt;]]></w:t></w:r></w:p><w:p><!-- comment text <w:t>COMMENT DECOY</w:t> with <![CDATA[ marker --><w:r><w:t>VISIBLE TEXT &amp;lt; &#233;</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const manifest = await manifestApi.buildFullTextManifest(bytes, sha256(bytes), 17);

  assert.deepEqual(manifest.segments.map((segment: any) => segment.text), ["CDATA text with <w:p>literal markup</w:p> and </w:t> literal close, plus &amp; &lt;", "VISIBLE TEXT &lt; é"]);
  assert.equal(manifest.coverage.status, "complete");
  assert.deepEqual(manifest.excluded, []);
});
