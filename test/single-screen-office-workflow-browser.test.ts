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
        <w:p><w:r><w:t>Số: 25/QĐ-UBND</w:t></w:r></w:p>
        <w:p><w:r><w:t>Hà Nội, ngày 15 tháng 03 năm 2026</w:t></w:r></w:p>
        <w:p><w:r><w:t>${title}</w:t></w:r></w:p>
        <w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p>
        <w:p><w:r><w:t>CHỦ TỊCH</w:t></w:r></w:p>
        <w:p><w:r><w:t>Trần Văn B</w:t></w:r></w:p>
        <w:sectPr/>
      </w:body>
    </w:document>`);
  fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

test("Single-Screen Office Workflow: Upload -> Instant Unified Step 1 -> Click Next -> Studio Step 2", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-single-step1-"));
  const docxPath = path.join(tempDir, "Quyet_Dinh_25.docx");
  await createSyntheticDocx(docxPath, "QUYẾT ĐỊNH BAN HÀNH QUY CHẾ", "Điều 1. Ban hành kèm theo Quyết định này Quy chế hoạt động.");

  const port = 5098;
  const cdpPort = 9598;
  const server = await startTestServer(port);
  const browser = new CdpClient("single-screen-office-workflow");

  try {
    await browser.launch(cdpPort);
    await browser.setViewport(1366, 768);
    await browser.navigate(`http://127.0.0.1:${port}`);

    // Wait for step 1 to load
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`), true);

    // 1. Upload file
    await browser.uploadFile('input[type="file"]', docxPath);

    // If regime confirm button is shown, click it
    const regimeConfirmBtn = await browser.waitForFunction(
      `document.querySelector('[data-testid="regime-confirm-button"]') !== null || document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`,
      15000
    );
    assert.ok(regimeConfirmBtn, "File must start extraction");
    if (await browser.evaluate(`Boolean(document.querySelector('[data-testid="regime-confirm-button"]'))`)) {
      await browser.evaluate(`document.querySelector('[data-testid="regime-confirm-button"]')?.click()`);
    }

    // Wait until source is loaded
    assert.ok(await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`, 15000));

    // 2. VERIFY: SideBySideModal is NOT popped up
    const modalVisible = await browser.evaluate(`Boolean(document.querySelector('[data-testid="side-by-side-modal"]'))`);
    assert.equal(modalVisible, false, "Technical SideBySideModal must NOT pop up automatically");

    // 3. VERIFY: Unified Step 1 screen elements are present on ONE screen
    const fileBannerVisible = await browser.evaluate(`document.body.textContent.includes('Quyet_Dinh_25.docx')`);
    assert.equal(fileBannerVisible, true, "File banner must display the file name");

    const regimeVisible = await browser.evaluate(`Boolean(document.querySelector('#df-step1-regime'))`);
    assert.equal(regimeVisible, true, "Hệ thể thức and Mẫu cơ quan must be visible on the same screen");

    const doctypeVisible = await browser.evaluate(`Boolean(document.querySelector('#df-step1-document-type'))`);
    assert.equal(doctypeVisible, true, "Loại văn bản must be visible on the same screen");

    const summaryCardVisible = await browser.evaluate(`Boolean(document.querySelector('.df-office-summary-card'))`);
    assert.equal(summaryCardVisible, true, "Office summary card must be visible");

    // 4. VERIFY: Action button [data-action="wizard-next"] is enabled and offers the Studio editor
    const nextBtnText = await browser.evaluate<string>(`document.querySelector('[data-action="wizard-next"]')?.textContent?.trim() || ''`);
    assert.ok(nextBtnText.includes("Tiếp tục đưa vào Studio soạn thảo"), `Button should offer the Studio editor, got: '${nextBtnText}'`);

    const isNextDisabled = await browser.evaluate<boolean>(`Boolean(document.querySelector('[data-action="wizard-next"]')?.disabled)`);
    assert.equal(isNextDisabled, false, "Next button must be enabled");

    // 5. CLICK: [data-action="wizard-next"] -> MUST transition to Step 2 (Editor)!
    await browser.evaluate(`document.querySelector('[data-action="wizard-next"]')?.click()`);

    // Verify Step 2 is active
    const step2Active = await browser.waitForFunction(
      `document.querySelector('.df-workspace-step2-shell:not([hidden])') !== null || document.querySelector('[data-canvas-id="body"]') !== null`,
      10000
    );
    assert.ok(step2Active, "Must transition directly into Step 2 (Studio Editor)");

    console.log("[PASS] Single-Screen Office Workflow: 1-click from upload to Step 2 Studio verified!");
  } finally {
    browser.close();
    server.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
