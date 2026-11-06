import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";

test("TXT import keeps source text, blank lines and leading indentation in Step 1", async () => {
  const serverPort = 5083;
  const cdpPort = 9583;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-txt-import-"));
  const sourcePath = path.join(tempDir, "Synthetic_Whitespace.txt");
  const sourceText = "  Dòng thứ nhất\n\n\tDòng thứ hai\nDòng cuối";
  fs.writeFileSync(sourcePath, sourceText, "utf8");

  const server = await startTestServer(serverPort);
  const client = new CdpClient("docform-txt-import");
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
    assert.equal(rawDraft?.rawText, sourceText,
      "The imported TXT source text should remain unchanged, including blank lines and leading whitespace");
    assert.equal(rawDraft?.uploadedFileType, "txt");
    const blocks = rawDraft?.uploadedBlocks ?? [];
    assert.ok(blocks.some((block: any) => block.text === ""),
      "Blank source lines should remain represented as source blocks");
    assert.ok(blocks.some((block: any) => block.text.startsWith("  Dòng thứ nhất")),
      "Leading spaces should remain in the source block text");

    assert.equal(await client.clickByText("button", "Hủy bỏ"), true);
    assert.equal(await client.clickByText("button", "Quay lại"), true,
      "Return from recognition to the uploaded TXT source details");
    assert.ok(await client.waitForFunction(`document.querySelector('.df-import-source-details') !== null`, 5000),
      `TXT upload screen did not return after navigating back: ${(await client.evaluate<string>("document.body.innerText")).slice(0, 1700)}`);
    assert.equal(await client.clickByText("summary", "Xem nhanh nội dung tệp đã đọc"), true);
    const preview = await client.evaluate(`(() => {
      const root = document.querySelector('[data-testid="wizard-source-preview"]');
      return { html: root?.innerHTML ?? '', text: root?.textContent ?? '',
        blankParagraphs: root?.querySelectorAll('p')?.length ?? 0 };
    })()`);
    assert.ok(preview.html.includes("&nbsp;") && preview.blankParagraphs >= 4,
      `The source preview should visibly retain indentation and blank-line paragraphs: ${JSON.stringify(preview)}`);
    assert.ok((await client.evaluate<string>("document.body.innerText")).includes("giữ dòng trống và thụt đầu dòng"),
      "The TXT preview should explain that it preserves source line spacing and indentation");
    assert.ok(preview.text.includes("Dòng thứ nhất") && preview.text.includes("Dòng thứ hai"),
      `TXT preview should show the imported source lines: ${JSON.stringify(preview)}`);
  } finally {
    await client.close();
    server.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
