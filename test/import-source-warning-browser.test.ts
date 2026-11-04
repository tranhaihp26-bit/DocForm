import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";

test("Step 1 shows an actionable warning for unknown source wrappers and keeps preview keyboard-accessible", async () => {
  const serverPort = 5082;
  const cdpPort = 9582;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-source-warning-"));
  const sourcePath = path.join(tempDir, "Synthetic_Unknown_Wrapper.docx");
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:cx="urn:synthetic:unknown-wrapper">
      <w:body>
        <w:p><w:r><w:t>THÔNG BÁO</w:t></w:r></w:p>
        <w:p><w:r><w:t>Về việc kiểm tra cảnh báo nguồn</w:t></w:r></w:p>
        <w:p><w:r><w:t>Nội dung trước vùng nội dung có cấu trúc</w:t></w:r></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Mục có quy tắc đánh số cần đối chiếu</w:t></w:r></w:p>
        <w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Nội dung trong vùng sdt được hỗ trợ</w:t></w:r></w:p></w:sdtContent></w:sdt>
        <w:tbl><w:tblPr><w:tblStyle w:val="Bordered"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>
          <w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Bảng ngoài</w:t></w:r></w:p>
            <w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>
              <w:tr><w:tc><w:tcPr/><w:p><w:hyperlink r:id="rId1"><w:r><w:t>Liên kết trong bảng lồng</w:t></w:r></w:hyperlink></w:p></w:tc></w:tr>
            </w:tbl>
          </w:tc><w:tc><w:tcPr/><w:p><w:r><w:t>Ô bên cạnh</w:t></w:r></w:p></w:tc></w:tr>
        </w:tbl>
        <cx:customXml><w:p><w:r><w:t>Nội dung nằm trong wrapper cần đối chiếu</w:t></w:r></w:p></cx:customXml>
        <w:p><w:r><w:t>Nội dung sau vùng cấu trúc</w:t></w:r></w:p>
        <w:sectPr/>
      </w:body>
    </w:document>`);
  zip.file("word/styles.xml", `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="table" w:styleId="Bordered"><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8"/></w:tblBorders></w:tblPr></w:style></w:styles>`);
  zip.file("word/numbering.xml", `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:lvlRestart w:val="0"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1.%2)"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`);
  fs.writeFileSync(sourcePath, await zip.generateAsync({ type: "nodebuffer" }));

  const server = await startTestServer(serverPort);
  const client = new CdpClient("docform-source-warning");
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
    assert.equal(await client.clickByText("button", "Hủy bỏ"), true,
      "Close the source review dialog to inspect the underlying Step 1 warning panel");
    assert.equal(await client.clickByText("button", "Xác nhận thông tin"), true,
      "Continue from the recognition summary to the information confirmation screen");
    assert.equal(await client.clickByText("button", "Xem tóm tắt"), true,
      "Open the ready-to-compose summary where Step 1 source warnings and preview are shown");
    for (let i = 0; i < 3; i++) {
      assert.equal(await client.clickByText("button", "Quay lại"), true,
        "Return to the uploaded source details to inspect warnings and preview");
    }
    assert.ok(await client.waitForFunction(`document.querySelector('.df-import-source-details') !== null`, 5000),
      `Step 1 import screen did not return after closing source review: ${(await client.evaluate<string>("document.body.innerText")).slice(0, 1200)}`);

    const warning = await client.evaluate(`(() => {
      const text = document.body.innerText;
      const banner = Array.from(document.querySelectorAll('div')).find(el => el.innerText?.includes('Cần đối chiếu 5 phần của tài liệu với tệp gốc'));
      const preview = document.querySelector('.df-import-source-details');
      return { warningVisible: Boolean(banner && banner.getClientRects().length),
        warningText: banner?.innerText ?? '', previewCollapsed: preview?.open === false,
        previewSummary: preview?.querySelector('summary')?.innerText ?? '',
        hiddenPreviewByDefault: !text.includes('Nội dung nằm trong wrapper cần đối chiếu') };
    })()`);
    const rawDraft = await client.readRawDraft();
    const importedTexts = [
      ...(rawDraft?.uploadedBlocks ?? []).map((block: any) => block.text),
      ...(rawDraft?.structuredImport?.blocks ?? []).map((block: any) => block.text),
    ].join("\n");
    assert.ok(warning.warningVisible && importedTexts.includes("Nội dung nằm trong wrapper cần đối chiếu") && importedTexts.includes("Mục có quy tắc đánh số cần đối chiếu"),
      `The unsupported source content must remain in source blocks and trigger a warning: ${JSON.stringify({ warning, importedTexts })}`);
    assert.ok(importedTexts.includes("Nội dung trong vùng sdt được hỗ trợ") && importedTexts.includes("Nội dung sau vùng cấu trúc"),
      `Supported sdt content and following blocks must retain document order: ${importedTexts}`);
    assert.equal(warning.previewCollapsed, true,
      `The optional body preview should start closed: ${JSON.stringify(warning)}`);
    assert.equal(warning.hiddenPreviewByDefault, true,
      "The optional source body content should stay collapsed until requested");
    assert.match(warning.previewSummary, /Xem nhanh phần thân bài đã tách/);

    assert.equal(await client.clickByText("summary", "Xem chi tiết"), true,
      "Users should be able to expand the source warning details when needed");
    const warningDetails = await client.evaluate<string>("document.body.innerText");
    assert.ok(warningDetails.includes("unsupported_body_element") && warningDetails.includes("nested_table") && warningDetails.includes("hyperlink_in_table") && warningDetails.includes("unsupported_numbering") && warningDetails.includes("unsupported_table_style"),
      `Expanded warning details should identify unsupported wrappers and complex table content: ${warningDetails}`);

    await client.evaluate(`document.querySelector('.df-import-source-details summary')?.focus()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
    assert.ok(await client.waitForFunction(`document.querySelector('.df-import-source-details')?.open === true`, 2000),
      "Space should open the optional source preview from its keyboard-focused summary");
    assert.ok(await client.waitForFunction(`document.body.innerText.includes('không bao gồm tiêu đề, nơi nhận và khối chữ ký')`, 2000),
      "The preview should clearly state that it shows only the extracted body");
    await client.evaluate(`document.querySelector('.df-import-source-details summary')?.focus()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const nextFocus = await client.evaluate(`document.activeElement?.textContent?.trim() ?? ''`);
    assert.ok(String(nextFocus).length > 0, "Keyboard focus should move to the next available control");
  } finally {
    await client.close();
    server.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
