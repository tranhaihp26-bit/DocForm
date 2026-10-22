/**
 * Hồi quy S3-F02 — bản nháp mẫu hệ thống lưu trước Chặng 3 (không có `sourceOrigin`,
 * không có `currentStep`) phải được nhận đúng là nguồn mẫu sau khi tải lại, không bị
 * nhận nhầm thành tệp nhập rồi khóa bước Xuất.
 *
 * Cổng 5077/9677 (≠ 5050), profile Chromium riêng, không dữ liệu thật.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

const SERVER_PORT = 5077;
const CDP_PORT = 9677;

test("S3-F02: bản nháp mẫu kiểu cũ vẫn xuất được sau khi tải lại", async () => {
  const serverProc: ChildProcess = await startTestServer(SERVER_PORT);
  const client = new CdpClient("docform-stage3-f02");

  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000),
      "Bước 1 phải được render",
    );

    // -----------------------------------------------------------------------
    // 1) Tạo bản nháp mẫu thật (như Chặng 3 đang lưu).
    // -----------------------------------------------------------------------
    assert.ok(await client.clickByText("button", "Dùng mẫu"), "Phải có lối bắt đầu từ mẫu");
    await new Promise((r) => setTimeout(r, 350));
    await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').trim() === 'Đổi mẫu');
      if (btn) btn.click();
    })()`);

    const templatePersisted = await client.waitForPersisted(
      (rec) => rec.sourceOrigin === "system_template",
      4000,
    );
    assert.notEqual(templatePersisted, null, "Mẫu phải được commit vào IndexedDB");

    const raw = await client.readRawDraft();
    assert.ok(raw, "Phải đọc được bản ghi nháp");
    // Xác nhận đúng hình dạng bẫy của bản nháp cũ: tên mẫu nằm ở `uploadedFileName`
    // nhưng không có khối nhập nào (reviewBlocks rỗng, structuredImport null).
    assert.equal(raw.originalSnapshot?.sourceType, "system_template");
    assert.equal(raw.uploadedFileName, "Kế hoạch công tác");
    assert.equal((raw.reviewBlocks || []).length, 0);
    assert.equal(raw.structuredImport || null, null);
    assert.ok(raw.doc?.bodyHtml && raw.doc.bodyHtml.length > 100, "Nội dung mẫu phải còn trong bản nháp");

    // -----------------------------------------------------------------------
    // 2) Mô phỏng bản nháp do phiên bản TRƯỚC Chặng 3 tạo ra.
    // -----------------------------------------------------------------------
    const legacy = JSON.parse(JSON.stringify(raw));
    delete legacy.sourceOrigin;
    delete legacy.currentStep;
    delete legacy.docTypeOverride;
    await client.writeRawDraft(legacy);
    assert.equal((await client.readRawDraft()).sourceOrigin, undefined, "Bản nháp cũ không có sourceOrigin");

    // -----------------------------------------------------------------------
    // 3) Tải lại thật → phải nhận đúng nguồn mẫu, không khóa bước Xuất.
    // -----------------------------------------------------------------------
    await client.reload();
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000),
      "Sau khi tải lại phải về Bước 1 với bản nháp đã khôi phục",
    );

    // Ổn định ca kiểm: bản nháp được khôi phục **bất đồng bộ** sau khi ứng
    // dụng mount, nên phải chờ tín hiệu "đã khôi phục" (`data-save-status` chuyển
    // sang "Đã lưu" khi `hasPersistedDraft` được đặt) trước khi đọc trạng thái.
    // Trước đây ca này đọc ngay sau khi render nên đôi lúc đo trạng thái trước
    // khi khôi phục → đỏ xen kẽ. Không nới assert, chỉ chờ đúng thời điểm.
    assert.ok(
      await client.waitForFunction(
        `document.querySelector('[data-save-status]')?.getAttribute('data-save-status') === 'Đã lưu'`,
        15000,
      ),
      "Bản nháp phải được khôi phục xong trước khi đánh giá trạng thái",
    );

    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')`),
      "true",
      "Bản nháp mẫu cũ phải được nhận là nguồn đã chọn",
    );
    assert.equal(
      await client.evaluate<boolean>(`document.querySelector('[data-gate-notice="source-required"]') !== null`),
      false,
      "Không được báo thiếu nguồn khi nội dung mẫu vẫn còn",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "true",
      "Bản nháp mẫu cũ phải còn xuất được sau khi tải lại (S3-F02)",
    );
    const previewText = await client.evaluate<string>(
      `document.querySelector('[data-testid="wizard-source-preview"]')?.textContent || ""`,
    );
    assert.ok(previewText.length > 40, "Nội dung mẫu phải được khôi phục nguyên vẹn");

    // Nguồn phải được ghi lại đúng loại (migration) chứ không chỉ đúng trong RAM.
    const migrated = await client.waitForPersisted(
      (rec) => rec.sourceOrigin === "system_template",
      4000,
    );
    assert.notEqual(migrated, null, "Nguồn mẫu phải được ghi lại vào IndexedDB sau migration");
    const migratedRecord = await client.readPersistedDraft();
    console.log(
      "[s3-f02] IndexedDB after migration:",
      JSON.stringify({
        sourceOrigin: migratedRecord.sourceOrigin,
        fileName: migratedRecord.fileName,
        snapshotSourceType: migratedRecord.snapshotSourceType,
        documentType: migratedRecord.documentType,
        bodyHtmlLength: migratedRecord.bodyHtmlLength,
        versionCount: migratedRecord.versionCount,
        waitMs: migrated,
      }),
    );

    // -----------------------------------------------------------------------
    // 4) Vào thẳng bước Xuất và kiểm tra nội dung mẫu còn nguyên.
    // -----------------------------------------------------------------------
    await client.clickStep(3);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "3",
      "Bước Xuất phải mở được từ bản nháp mẫu cũ",
    );
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="3"]') !== null`, 3000),
      "Bước Xuất phải được render",
    );
    assert.ok(
      await client.evaluate<boolean>(`document.body.textContent.includes('Hội nghị Tổng kết')`),
      "Nội dung mẫu phải còn ở bước Xuất",
    );

    // -----------------------------------------------------------------------
    // 5) Khôi phục phiên bản mẫu (đường `restoreVersion`) cũng phải giữ nguồn mẫu.
    // -----------------------------------------------------------------------
    await client.clickStep(1);
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(await client.clickByText("button", "Công cụ"), "Phải mở được ngăn công cụ");
    assert.ok(
      await client.waitForFunction(`document.body.textContent.includes('Lịch Sử Phiên Bản')`, 5000),
      "Ngăn công cụ phải có Lịch sử phiên bản",
    );
    assert.ok(
      await client.evaluate<boolean>(`(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => (b.textContent || '').trim() === 'Khôi phục');
        if (!btn) return false;
        btn.click();
        return true;
      })()`),
      "Phải có nút Khôi phục phiên bản mẫu",
    );
    await new Promise((r) => setTimeout(r, 600));
    // Workspace opens an approved restored version at Step 2. Inspect its
    // source in Step 1, where the source marker is rendered.
    await client.clickStep(1);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')`),
      "true",
      "Khôi phục phiên bản mẫu phải giữ nguồn mẫu",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "true",
      "Khôi phục phiên bản mẫu không được khóa bước Xuất",
    );

    console.log("[s3-f02] legacy template restore + migration + version restore OK");
  } finally {
    await client.close();
    serverProc.kill();
  }
});
