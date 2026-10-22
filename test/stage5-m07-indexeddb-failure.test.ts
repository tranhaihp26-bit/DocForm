/**
 * @file stage5-m07-indexeddb-failure.test.ts
 * @description Ma trận M07 — lỗi giao dịch IndexedDB phải được báo **trung thực**:
 * giao diện không được hiện "Đã lưu" khi giao dịch thực sự thất bại, và
 * tài liệu đang làm việc không được mất.
 *
 * Cách mô phỏng: chặn `IDBDatabase.prototype.transaction` trong chính trình duyệt
 * để mọi giao dịch ghi vào IndexedDB ném lỗi — tương đương hệ thống tệp
 * IndexedDB bị lỗi/quota. Không đụng tới hồ sơ người dùng: profile Chromium
 * tạm, IndexedDB riêng, cổng riêng.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

const SERVER_PORT = 5084;
const CDP_PORT = 9684;

test("M07: lỗi giao dịch IndexedDB phải được báo trung thực, không được hiện 'Đã lưu'", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage5-m07-"));
  const filePath = path.join(tempDir, "Audit_M07.docx");
  fs.writeFileSync(
    filePath,
    await generateND30DocxBuffer({
      regime: "administrative",
      headerProfile: "generic",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
      orgHeader2: "ĐƠN VỊ THỬ NGHIỆM M07",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
      documentType: "THÔNG BÁO",
      referenceNumber: "Số: 12/TB-M07",
      subject: "V/v kiểm tra báo lỗi lưu trữ cục bộ",
      bodyHtml: "<p>Điều 1. Nội dung tổng hợp để kiểm tra lỗi lưu trữ.</p>",
      signTitle: "GIÁM ĐỐC",
      signName: "Người Ký",
      recipients: "Như trên;",
      fontFamily: "Times New Roman",
      fontSize: 13,
    } as any)
  );

  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient("docform-stage5-m07");
  try {
    await client.launch(CDP_PORT);

    // Chặn giao dịch ghi IndexedDB TRƯỚC khi ứng dụng khởi động.
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const originalTransaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          const storeNames = args[0];
          const mode = args[1] || "readonly";
          const isWrite = mode !== "readonly";
          if (isWrite) {
            throw new DOMException("Synthetic IndexedDB write failure (audit simulation)", "QuotaExceededError");
          }
          return originalTransaction.apply(this, args);
        };
      })()`,
    });

    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);
    await client.waitForFunction(`document.querySelector('[data-current-step]') !== null`, 15000);

    // Gây ra một thay đổi để kích hoạt lưu tự động
    await client.uploadFile('input[type="file"]', filePath);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`, 15000
    );
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 2500));

    const saveState = await client.evaluate<any>(`(() => {
      const el = document.querySelector("[data-save-status]");
      return {
        label: el ? el.getAttribute("data-save-status") : null,
        text: document.body.textContent.includes("Lỗi lưu"),
        claimsSaved: document.body.textContent.includes("Đã lưu"),
        hasSource: document.body.textContent.includes("Audit_M07.docx"),
      };
    })()`);

    assert.ok(saveState.label, "Phải có nhãn trạng thái lưu [data-save-status]");
    assert.notEqual(
      saveState.label,
      "Đã lưu",
      `Khi giao dịch IndexedDB lỗi, nhãn lưu không được là "Đã lưu" (thực tế: ${saveState.label})`
    );
    assert.equal(
      saveState.text,
      true,
      `Khi giao dịch IndexedDB lỗi, giao diện phải báo "Lỗi lưu" (nhãn thực tế: ${saveState.label})`
    );
    assert.equal(
      saveState.hasSource,
      true,
      "Tài liệu đang làm việc không được mất khi lưu thất bại"
    );

    // Không được mất nội dung đang soạn
    const bodyStillThere = await client.evaluate<boolean>(
      `document.body.textContent.includes("Nội dung tổng hợp") || document.body.textContent.includes("Audit_M07.docx")`
    );
    assert.equal(bodyStillThere, true, "Nội dung tài liệu phải còn trên màn hình");
  } finally {
    client.close();
    serverProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
