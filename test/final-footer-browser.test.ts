import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";

test("Browser import recognizes a mixed footer table with separate and blank Word paragraphs", async () => {
  const serverPort = 5074;
  const cdpPort = 9574;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-final-footer-"));
  const sourcePath = path.join(tempDir, "Synthetic_Paragraph_Footer.docx");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>THÔNG BÁO</w:t></w:r></w:p>
        <w:p><w:r><w:t>Về việc phối hợp</w:t></w:r></w:p>
        <w:p><w:r><w:t>Các đơn vị thực hiện nhiệm vụ theo thông báo.</w:t></w:r></w:p>
        <w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
          <w:tr>
            <w:tc><w:tcPr/>
              <w:p><w:r><w:t>Nơi nhận:</w:t></w:r></w:p>
              <w:p><w:r><w:t>- Chủ tịch cơ quan (để báo cáo);</w:t></w:r></w:p>
              <w:p><w:r><w:t>- Các đơn vị trực thuộc;</w:t></w:r></w:p>
              <w:p><w:r><w:t>- Lưu: VT.</w:t></w:r></w:p>
            </w:tc>
            <w:tc><w:tcPr/>
            <w:p><w:r><w:t>GIÁM ĐỐC Người Mẫu</w:t></w:r></w:p>
            <w:p/>
            </w:tc>
          </w:tr>
        </w:tbl>
        <w:sectPr/>
      </w:body>
    </w:document>`);
  fs.writeFileSync(sourcePath, await zip.generateAsync({ type: "nodebuffer" }));

  const server = await startTestServer(serverPort);
  const client = new CdpClient("docform-final-footer");
  try {
    await client.launch(cdpPort);
    await client.setViewport(1366, 768);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    assert.equal(await client.clickByText("button", "Tải tài liệu có sẵn"), true);
    await client.uploadFile('input[type="file"]', sourcePath);

    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="regime-confirm-button"]') !== null`, 10000),
      "The synthetic source should reach the regime confirmation gate");
    await client.evaluate(`document.querySelector('[data-testid="regime-option-state"]')?.click()`);
    await client.evaluate(`document.querySelector('[data-testid="regime-confirm-button"]')?.click()`);
    assert.ok(await client.waitForFunction(
      `document.body.innerText.includes("Kiểm tra nội dung tài liệu")`,
      20000,
    ), `Import review did not open. Browser text: ${(await client.evaluate<string>("document.body.innerText")).slice(0, 1800)}`);
    const rawDraft = await client.readRawDraft();
    const signerVisible = await client.waitForFunction(`document.body.innerText.includes("Người Mẫu")`, 3000);
    assert.ok(signerVisible,
      `Import review should show the signer name parsed from the same source cell. UI: ${(await client.evaluate<string>("document.body.innerText")).slice(0, 2400)}. Parsed draft fields: ${JSON.stringify({ doc: rawDraft?.doc && { signTitle: rawDraft.doc.signTitle, signName: rawDraft.doc.signName, recipients: rawDraft.doc.recipients }, fields: rawDraft?.structuredImport?.fields })}`);
    const importedFields = rawDraft?.structuredImport?.fields ?? {};
    assert.ok(importedFields.recipients?.value?.includes('Chủ tịch cơ quan'),
      `The recipient cell should populate the parsed recipients field, not remain only as visible source text: ${JSON.stringify(importedFields)}`);
    assert.equal(importedFields.signTitle?.value, 'GIÁM ĐỐC',
      `The signer title should be parsed from the right-hand cell: ${JSON.stringify(importedFields.signTitle)}`);
    assert.equal(importedFields.signName?.value, 'Người Mẫu',
      `The signer name should be parsed from the right-hand cell: ${JSON.stringify(importedFields.signName)}`);
    assert.deepEqual(importedFields.recipients?.sourceCell, { rowIndex: 0, colIndex: 0 });
    assert.deepEqual(importedFields.signTitle?.sourceCell, { rowIndex: 0, colIndex: 1 });
    assert.deepEqual(importedFields.signName?.sourceCell, { rowIndex: 0, colIndex: 1 });
    const visibleEvidence = await client.evaluate(`({
      hasRecipient: document.body.innerText.includes("Chủ tịch cơ quan"),
      hasTitle: document.body.innerText.includes("GIÁM ĐỐC"),
      hasSigner: document.body.innerText.includes("Người Mẫu"),
      hasSourceTable: document.body.innerText.includes("Bảng (1 hàng × 2 cột)") || document.body.innerText.includes("Bảng (1 hàng x 2 cột)"),
      roleOptions: Array.from(document.querySelectorAll("select[data-block-id] option:checked")).map(option => option.textContent?.trim()),
    })`);
    assert.ok(visibleEvidence.hasRecipient && visibleEvidence.hasTitle && visibleEvidence.hasSigner,
      `The review UI should display recipient, title, and signer values: ${JSON.stringify(visibleEvidence)}`);
    assert.ok(visibleEvidence.hasSourceTable, `The physical source table should remain visible as one table block: ${JSON.stringify(visibleEvidence)}`);
    assert.ok(visibleEvidence.roleOptions.includes("Bảng kết hợp · Nơi nhận và chữ ký"),
      `The mixed physical table should be clearly identified as a combined recipients/signature block, not presented as ordinary body text: ${JSON.stringify(visibleEvidence)}`);
  } finally {
    await client.close();
    server.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
