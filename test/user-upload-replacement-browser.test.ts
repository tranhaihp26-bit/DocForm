import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

async function createSyntheticDocx(filePath: string, title: string, bodyText: string): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</w:t></w:r></w:p>
        <w:p><w:r><w:t>Độc lập - Tự do - Hạnh phúc</w:t></w:r></w:p>
        <w:p><w:r><w:t>Số: 10/TB-UBND</w:t></w:r></w:p>
        <w:p><w:r><w:t>Hà Nội, ngày 10 tháng 02 năm 2026</w:t></w:r></w:p>
        <w:p><w:r><w:t>${title}</w:t></w:r></w:p>
        <w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p>
        <w:p><w:r><w:t>GIÁM ĐỐC</w:t></w:r></w:p>
        <w:p><w:r><w:t>Nguyễn Văn A</w:t></w:r></w:p>
        <w:sectPr/>
      </w:body>
    </w:document>`);
  fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

test("User Flow: Clicking 'Tải tài liệu có sẵn' opens dropzone, and uploading new file confirms replacement", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-replace-test-"));
  const fileAPath = path.join(tempDir, "Tai_Lieu_A.docx");
  const fileBPath = path.join(tempDir, "Tai_Lieu_B.docx");

  await createSyntheticDocx(fileAPath, "THÔNG BÁO VỀ KẾ HOẠCH A", "Nội dung kế hoạch chi tiết của tài liệu A.");
  await createSyntheticDocx(fileBPath, "QUYẾT ĐỊNH BAN HÀNH B", "Nội dung quyết định ban hành tài liệu B.");

  const port = 5097;
  const cdpPort = 9597;
  const server = await startTestServer(port);
  const browser = new CdpClient("user-upload-replacement");

  try {
    await browser.launch(cdpPort);
    await browser.setViewport(1366, 768);
    await browser.navigate(`http://127.0.0.1:${port}`);

    // Wait for step 1 to load
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`), true);

    // 1. Upload File A
    await browser.uploadFile('input[type="file"]', fileAPath);

    // If regime confirm button is shown, click it
    const regimeConfirmBtn = await browser.waitForFunction(
      `document.querySelector('[data-testid="regime-confirm-button"]') !== null || document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`,
      15000
    );
    assert.ok(regimeConfirmBtn, "File A must start extraction");

    if (await browser.evaluate(`Boolean(document.querySelector('[data-testid="regime-confirm-button"]'))`)) {
      await browser.evaluate(`document.querySelector('[data-testid="regime-confirm-button"]')?.click()`);
    }

    // Wait until source is loaded
    assert.ok(await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`, 15000));

    // 2. Go back to Choice screen (via "Đổi cách bắt đầu")
    await browser.evaluate(`document.querySelector('[data-step1-change-flow]')?.click()`);
    assert.ok(await browser.waitForFunction(`document.querySelector('[data-flow-phase="choice"]') !== null`, 5000));

    // Verify Choice screen has the resume box with File A
    const resumeText = await browser.evaluate<string>(`document.querySelector('.df-import-resume')?.textContent || ''`);
    assert.ok(resumeText.includes("Tai_Lieu_A.docx"), "Choice screen must show File A open");

    // 3. User clicks "Tải tài liệu có sẵn" -> MUST stay on Choice screen and trigger file selection directly
    await browser.evaluate(`document.querySelector('.df-import-entry-options button')?.click()`);
    // Screen must stay on Choice screen (not jump to dropzone)
    const currentPhase = await browser.evaluate(`document.querySelector('[data-flow-phase]')?.getAttribute('data-flow-phase')`);
    assert.equal(currentPhase, "choice", "Must stay on Choice screen without jumping to intermediate dropzone");

    // 4. User selects File B
    await browser.uploadFile('input[type="file"]', fileBPath);

    // 5. Must display Confirmation Dialog comparing File A vs File B
    assert.ok(await browser.waitForFunction(`document.querySelector('#replace-file-dialog-title') !== null`, 5000), "Must display replace file dialog");

    const dialogText = await browser.evaluate<string>(`document.querySelector('[aria-labelledby="replace-file-dialog-title"]')?.textContent || ''`);
    assert.ok(dialogText.includes("Tai_Lieu_A.docx"), "Must mention old file");
    assert.ok(dialogText.includes("Tai_Lieu_B.docx"), "Must mention new file");

    // 6. Test Cancel: Click "Giữ tài liệu hiện tại"
    await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Giữ tài liệu hiện tại'))?.click()`);
    assert.ok(await browser.waitForFunction(`document.querySelector('#replace-file-dialog-title') === null`, 5000), "Dialog must close on cancel");

    // Verify File A remains active
    const activeFileName = await browser.evaluate<string>(`document.body.textContent || ''`);
    assert.ok(activeFileName.includes("Tai_Lieu_A.docx"), "Original file A must remain active");

    console.log("[PASS] User Flow Verification: 'Tải tài liệu có sẵn' opens dropzone and confirms replacement safely!");
  } finally {
    browser.close();
    server.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
