/**
 * S3-F01 regression: an imported source/type mismatch blocks Step 3 until the
 * user resolves it explicitly, and the decision is bound to the source/type.
 * Uses the current upload → source review → metadata flow and a synthetic DOCX.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

const SERVER_PORT = 5076;
const CDP_PORT = 9676;
const SOURCE_PHRASE = "Mục tiêu kế hoạch thử nghiệm";

const clickDocType = (name: string) => `(() => {
  const section = document.querySelector('#wizard-doctype-heading')?.closest('section');
  if (!section) return false;
  const button = Array.from(section.querySelectorAll('button')).find(item => (item.textContent || '').includes(${JSON.stringify(name)}));
  if (!button) return false;
  button.click();
  return true;
})()`;

test("S3-F01: imported document-type mismatch blocks export until a source-bound decision", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-s3-f01-current-"));
  const sourcePath = path.join(tempDir, "Synthetic_Plan.docx");
  fs.writeFileSync(sourcePath, await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "BỘ THỬ NGHIỆM",
    orgHeader2: "ĐƠN VỊ KIỂM CHỨNG",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hà Nội, ngày 20 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 01/KH-TN",
    subject: "Kế hoạch thử nghiệm cổng loại văn bản",
    bodyHtml: `<p>${SOURCE_PHRASE}: triển khai trong phạm vi kiểm thử.</p>`,
    signTitle: "THỦ TRƯỞNG",
    signName: "Người Thử Nghiệm",
    recipients: "Lưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  } as any));

  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient("docform-stage3-f01-current");
  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000));

    assert.ok(await client.clickByText("button", "Tải tài liệu có sẵn"), "Start the current upload flow");
    await client.uploadFile('input[type="file"]', sourcePath);
    assert.ok(await client.waitForFunction(
      `Array.from(document.querySelectorAll("button")).some(button => button.textContent && button.textContent.trim() === "Rà soát phân vùng nội dung")`,
      15000,
    ), "Recognized source must offer explicit partition review");
    await client.clickByText("button", "Rà soát phân vùng nội dung");
    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="side-by-side-modal"]') !== null`, 10000));
    await client.clickByText("button", "Tiếp tục đưa vào Studio soạn thảo");
    assert.ok(await client.waitForFunction(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step') === '2'`, 8000),
      "Approved source must enter Step 2 before testing the type mismatch gate");

    assert.ok(await client.clickStep(1), "Return to Step 1 to review the detected type");
    assert.ok(await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000));
    if (await client.evaluate<boolean>(`document.querySelector('[data-flow-phase]')?.getAttribute('data-flow-phase') === 'choice'`)) {
      assert.ok(await client.clickByText("button", "Tiếp tục tài liệu hiện tại"), "Resume the imported document flow");
    }
    assert.ok(await client.evaluate<boolean>(`(() => { const button = document.querySelector('.df-import-back'); button?.click(); return Boolean(button); })()`), "Open metadata confirmation from the ready phase");
    assert.ok(await client.waitForFunction(`document.querySelector('#df-step1-document-type') !== null`, 5000));

    assert.equal(await client.evaluate<string>(`document.querySelector('#df-step1-document-type')?.textContent?.includes('Nguồn nhận diện: KẾ HOẠCH') ? 'true' : 'false'`), "true",
      "The source type must come from the imported document");
    assert.ok(await client.evaluate<boolean>(clickDocType("THÔNG BÁO")), "Choose a different type explicitly");
    assert.ok(await client.waitForFunction(`document.querySelector('[data-source-warning="doc-type"]') !== null`, 3000));
    assert.equal(await client.evaluate<string>(`document.querySelector('[data-source-warning="doc-type"]')?.getAttribute('data-doctype-override')`), "false");
    assert.equal(await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="2"]')?.getAttribute('data-step-allowed')`), "true");
    assert.equal(await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`), "false",
      "A conflicting imported document type must block Step 3 until user decision");

    assert.ok(await client.clickStep(3));
    assert.equal(await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`), "1",
      "Attempt to open Step 3 must remain at Step 1 while the mismatch is unresolved");
    const blockedText = await client.evaluate<string>(`document.body.textContent || ''`);
    assert.ok(blockedText.includes("KẾ HOẠCH") && blockedText.includes("THÔNG BÁO"),
      "The blocking message must name both the source and chosen type");

    assert.ok(await client.evaluate<boolean>(`(() => {
      const button = document.querySelector('[data-action="override-doctype-mismatch"]');
      button?.scrollIntoView({block:'center'});
      button?.click();
      return Boolean(button);
    })()`), "Provide the explicit keep-the-selected-type decision");
    assert.ok(await client.waitForFunction(`document.querySelector('[data-source-warning="doc-type"]')?.getAttribute('data-doctype-override') === 'true'`, 3000));
    assert.equal(await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`), "true",
      "A source-bound explicit decision should resolve this export gate");

    const decisionSaved = await client.waitForPersisted(
      record => record.docTypeOverride?.sourceDocType === "KẾ HOẠCH" && record.docTypeOverride?.chosenDocType === "THÔNG BÁO",
      5000,
    );
    assert.notEqual(decisionSaved, null, "The mismatch decision must persist with both source and chosen types");
    const persisted = await client.readPersistedDraft();
    assert.equal(persisted.docTypeOverride.regime, "state");
    assert.ok(!Number.isNaN(new Date(persisted.docTypeOverride.decidedAt).getTime()));

    assert.ok(await client.clickStep(3));
    assert.equal(await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`), "3");
    assert.ok(await client.evaluate<boolean>(`document.body.textContent.includes(${JSON.stringify(SOURCE_PHRASE)})`),
      "The original source content must remain present after resolving the mismatch");
  } finally {
    client.close();
    serverProc.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
