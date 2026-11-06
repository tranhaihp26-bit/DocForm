import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";
import { workspaceEditorSafety } from "../src/utils/workspaceCapabilities.ts";

test("Browser import keeps a source page break in the Step 2 editor", async () => {
  const serverPort = 5081;
  const cdpPort = 9581;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-page-break-"));
  const sourcePath = path.join(tempDir, "Synthetic_Page_Break.docx");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>THÔNG BÁO</w:t></w:r></w:p>
        <w:p><w:r><w:t>Về việc kiểm tra ngắt trang nguồn</w:t></w:r></w:p>
        <w:p><w:r><w:t>Nội dung trước ngắt trang</w:t><w:br w:type="page"/><w:t xml:space="preserve"> nội dung sau ngắt trang</w:t></w:r></w:p>
        <w:sectPr/>
      </w:body>
    </w:document>`);
  fs.writeFileSync(sourcePath, await zip.generateAsync({ type: "nodebuffer" }));

  const server = await startTestServer(serverPort);
  const client = new CdpClient("docform-page-break");
  try {
    await client.launch(cdpPort);
    await client.setViewport(1366, 768);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    assert.equal(await client.clickByText("button", "Tải tài liệu có sẵn"), true);
    await client.uploadFile('input[type="file"]', sourcePath);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="regime-confirm-button"]') !== null`, 10000));
    await client.evaluate(`document.querySelector('[data-testid="regime-option-state"]')?.click()`);
    await client.evaluate(`document.querySelector('[data-testid="regime-confirm-button"]')?.click()`);
    assert.ok(await client.waitForFunction(`document.body.innerText.includes("Kiểm tra nội dung tài liệu")`, 20000));

    const rawDraft = await client.readRawDraft();
    assert.match(String(rawDraft?.doc?.bodyHtml ?? ""), /data-page-break="true"/,
      "Step 1 reconstruction should retain the source page-break marker");
    const sourceBodyHtml = String(rawDraft?.doc?.bodyHtml ?? "");
    assert.equal(await client.clickByText("button", "Tiếp tục đưa vào Studio soạn thảo"), true,
      "The approved synthetic source should advance to Step 2");
    assert.ok(await client.waitForFunction(`document.querySelector('.ProseMirror [data-page-break="true"]') !== null`, 12000),
      `The editor should render and retain the inline page-break node. Safety: ${JSON.stringify(workspaceEditorSafety(sourceBodyHtml))}. HTML: ${sourceBodyHtml}. UI: ${(await client.evaluate<string>("document.body.innerText")).slice(0, 1800)}`);

    const editorEvidence = await client.evaluate(`(() => {
      const editor = document.querySelector('.ProseMirror');
      const marker = editor?.querySelector('[data-page-break="true"]');
      return { editorMounted: Boolean(editor), marker: marker?.outerHTML ?? null,
        text: editor?.innerText ?? '' };
    })()`);
    assert.ok(editorEvidence.editorMounted && editorEvidence.marker,
      `Editor must preserve the source page break as an explicit node: ${JSON.stringify(editorEvidence)}`);
    assert.ok(editorEvidence.text.includes("Nội dung trước ngắt trang") && editorEvidence.text.includes("nội dung sau ngắt trang"),
      `Text on both sides of the break must remain visible: ${JSON.stringify(editorEvidence)}`);

    await client.evaluate(`(() => {
      window.__pageBreakCandidateBytes = null;
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        if (blob instanceof Blob && blob.type.includes('officedocument.wordprocessingml')) {
          blob.arrayBuffer().then(buffer => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            window.__pageBreakCandidateBytes = btoa(binary);
          });
        }
        return original(blob);
      };
    })()`);
    assert.equal(await client.clickByText("button", "Tiếp tục xem & xuất"), true,
      "The approved page-break document should open Step 3");
    assert.ok(await client.waitForFunction(`document.body.innerText.includes("Tải xuống DOCX")`, 12000),
      `The approved document should reach candidate export. UI: ${(await client.evaluate<string>("document.body.innerText")).slice(0, 2200)}`);
    assert.equal(await client.clickByText("button", "Tải xuống DOCX"), true,
      "The candidate should be downloadable after the fidelity gate");
    assert.ok(await client.waitForFunction(`window.__pageBreakCandidateBytes !== null`, 12000),
      "Capture the candidate DOCX bytes used for download");
    const candidateBytes = Buffer.from(await client.evaluate<string>("window.__pageBreakCandidateBytes"), "base64");
    const candidateZip = await JSZip.loadAsync(candidateBytes);
    const candidateXml = await candidateZip.file("word/document.xml")?.async("string");
    assert.ok(candidateXml);
    assert.match(candidateXml, /<w:br\b[^>]*w:type="page"/,
      "The browser candidate download must retain the source page break as a Word page break");
    assert.match(candidateXml, /Nội dung trước ngắt trang[\s\S]*nội dung sau ngắt trang/,
      "The browser candidate must retain the text on both sides of the break");
  } finally {
    await client.close();
    server.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
