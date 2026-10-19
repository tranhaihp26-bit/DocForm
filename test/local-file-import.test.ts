import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseLocalFile } from "../src/utils/localFileImport.ts";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</w:t></w:r></w:p>
<w:p><w:r><w:t>Độc lập - Tự do - Hạnh phúc</w:t></w:r></w:p>
<w:p><w:r><w:t>KẾ HOẠCH</w:t></w:r></w:p>
<w:p><w:r><w:t>Nội dung công tác</w:t></w:r></w:p>
</w:body></w:document>`;
const zip = new JSZip();
zip.file("word/document.xml", xml);
const bytes = await zip.generateAsync({ type: "uint8array" });

const imported = await parseLocalFile(new File([Uint8Array.from(bytes)], "ke-hoach.docx"));
assert.equal(imported.fileType, "docx");
assert.match(imported.text, /Nội dung công tác/);
assert.ok(imported.structured);
assert.equal(imported.structured.source.filename, "ke-hoach.docx");
assert.equal(imported.structured.source.blockCount, 4);
assert.equal(imported.structured.fields.documentType.value, "KẾ HOẠCH");

const headerOnly = new JSZip();
headerOnly.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body>
<w:p><w:r><w:t>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</w:t></w:r></w:p>
<w:p><w:r><w:t>Độc lập - Tự do - Hạnh phúc</w:t></w:r></w:p>
</w:body></w:document>`);
const headerBytes = await headerOnly.generateAsync({ type: "uint8array" });
const headerImport = await parseLocalFile(new File([Uint8Array.from(headerBytes)], "tieu-ngu.docx"));
assert.ok(headerImport.structured);
assert.equal(headerImport.structured.fields.documentType.value, null);

const txt = await parseLocalFile(new File(["\uFEFFKẾ HOẠCH\nNội dung công tác"], "ke-hoach.txt"));
assert.equal(txt.fileType, "txt");
assert.equal(txt.text.charCodeAt(0), "K".charCodeAt(0));
assert.ok(txt.structured);
assert.equal(txt.structured.source.blockCount, 2);

await assert.rejects(() => parseLocalFile(new File(["not a docx"], "bad.docx")), /DOCX|Word/i);
await assert.rejects(() => parseLocalFile(new File(["data"], "bad.pdf")), /định dạng/i);
console.log("[PASS] Local DOCX/TXT import works without an API route");
