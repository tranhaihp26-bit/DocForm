import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

test("Manual partition edit aborts the pending AI request", async () => {
  const serverPort = 5071;
  const cdpPort = 9571;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-partition-abort-"));
  const sourcePath = path.join(tempDir, "Synthetic_Partition_Abort.docx");
  fs.writeFileSync(sourcePath, await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "ĐƠN VỊ THỬ NGHIỆM",
    orgHeader2: "TỔ KIỂM THỬ",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 02 tháng 11 năm 2026",
    documentType: "QUYẾT ĐỊNH",
    referenceNumber: "Số: 1/QĐ-TEST",
    subject: "Kiểm thử hủy rà soát AI",
    bodyHtml: "<p>Điều 1. Nội dung tổng hợp để kiểm tra hủy yêu cầu đang chạy.</p>",
    signTitle: "",
    signName: "",
    recipients: "",
    fontFamily: "Times New Roman",
    fontSize: 13,
  }));

  const server = await startTestServer(serverPort);
  const client = new CdpClient("docform-partition-abort");
  try {
    await client.launch(cdpPort);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    await client.evaluate(`(() => {
      const originalFetch = window.fetch.bind(window);
      window.__partitionRequests = [];
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/ai/check-partitions")) {
          return new Promise(() => {
            const request = { aborted: false };
            const signal = init && init.signal;
            if (signal) signal.addEventListener("abort", () => { request.aborted = true; });
            window.__partitionRequests.push(request);
          });
        }
        return originalFetch(input, init);
      };
    })()`);

    assert.equal(await client.clickByText("button", "Tải tài liệu có sẵn"), true);
    await client.uploadFile('input[type="file"]', sourcePath);
    assert.ok(await client.waitForFunction(
      `document.body.innerText.includes("Kiểm tra nội dung tài liệu") && document.body.innerText.includes("Synthetic_Partition_Abort.docx")`,
      20000,
    ));

    assert.equal(await client.clickByText("button", "Hủy bỏ"), true);
    assert.equal(await client.clickByText("button", "Quay lại"), true);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="ai-partition-consent"]') !== null`, 5000));
    await client.evaluate(`(() => {
      const consent = document.querySelector('[data-testid="ai-partition-consent"]');
      if (consent && !consent.checked) consent.click();
    })()`);
    const requestStarted = await client.waitForFunction(`window.__partitionRequests.length === 1`, 10000);
    const consentEvidence = await client.evaluate(`({requests:window.__partitionRequests?.length,consent:document.querySelector('[data-testid="ai-partition-consent"]')?.checked,disabled:document.querySelector('[data-testid="ai-partition-consent"]')?.disabled,detailsOpen:document.querySelector('[data-testid="ai-partition-consent-panel"]')?.open,body:document.body.innerText.slice(0,1800)})`);
    assert.ok(requestStarted, `AI partition request should start after consent: ${JSON.stringify(consentEvidence)}`);

    await client.clickByText("button", "Rà soát phân vùng nội dung");
    const reopened = await client.waitForFunction(`document.body.innerText.includes("Kiểm tra nội dung tài liệu")`, 5000);
    if (!reopened) assert.fail(`Could not reopen review: ${await client.evaluate(`document.body.innerText.slice(-1800)`)}`);

    await client.evaluate(`(() => {
      const select = document.querySelector('select[data-block-id]');
      if (!select) throw new Error("Source block role selector was not found");
      const nextRole = select.value === "metadata" ? "body" : "metadata";
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, nextRole);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);

    assert.ok(await client.waitForFunction(
      `window.__partitionRequests[0].aborted === true && !document.body.innerText.includes("AI Đang Rà Soát...")`,
      5000,
    ), "Manual role edit must abort the pending request and clear its loading state");
  } finally {
    await client.close();
    server.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
