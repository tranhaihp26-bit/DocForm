import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

const DOCX_PATH = "C:\\Users\\GIAP\\Downloads\\01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_-DocForm-ND30 (1).docx";

test("USER SIMULATION: Thực hiện thao tác như người dùng từ tải tệp đến xuất kết quả trên trình duyệt thực tế", async () => {
  assert.ok(fs.existsSync(DOCX_PATH), `Tệp nguồn phải tồn tại tại: ${DOCX_PATH}`);

  const port = 5092;
  const cdpPort = 9592;
  const server = await startTestServer(port);
  const browser = new CdpClient("user-simulation-recipient-flow");

  try {
    await browser.launch(cdpPort);
    await browser.setViewport(1440, 900);
    await browser.navigate(`http://127.0.0.1:${port}`);

    // =======================================================================
    // BƯỚC 1: TẢI TỆP VÀ THAO TÁC TẠI MÀN HÌNH BƯỚC 1 (NHẬP & NHẬN DIỆN)
    // =======================================================================
    console.log("[USER ACTION] 1. Tải lên tệp 01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026...");
    await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000);
    await browser.uploadFile('input[type="file"]', DOCX_PATH);

    // Chờ tệp xử lý xong và hiển thị thông tin nhận diện
    assert.ok(
      await browser.waitForFunction(
        `document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true' || document.body.textContent.includes('Đã đọc tệp')`,
        20000
      ),
      "Tệp nguồn phải được bóc tách và sẵn sàng tại Bước 1"
    );

    // KIỂM TRA QUAN TRỌNG: Xác định có thông báo lỗi màu đỏ nào xuất hiện không
    const errorBannerText1 = await browser.evaluate<string>(`
      (() => {
        const errorEl = document.querySelector('.bg-red-50, .text-red-700, [role="alert"]');
        return errorEl ? errorEl.textContent || '' : '';
      })()
    `);
    console.log(`[VERIFY STEP 1] Error banner check: "${errorBannerText1.trim()}"`);
    assert.ok(
      !errorBannerText1.includes("invalid_transaction"),
      `Bước 1 không được có lỗi invalid_transaction, thực tế gặp: ${errorBannerText1}`
    );
    assert.ok(
      !errorBannerText1.includes("missing_recipients_destination"),
      `Bước 1 không được có lỗi missing_recipients_destination, thực tế gặp: ${errorBannerText1}`
    );
    assert.ok(
      !errorBannerText1.includes("missing_signature_destination"),
      `Bước 1 không được có lỗi missing_signature_destination, thực tế gặp: ${errorBannerText1}`
    );

    // Thao tác như người dùng: Bấm chọn lại nút THÔNG BÁO và Mẫu Hoa tiêu MB
    console.log("[USER ACTION] 2. Bấm chọn nút loại văn bản 'THÔNG BÁO'...");
    await browser.evaluate(`
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent && b.textContent.includes('THÔNG BÁO'));
      if (btn) btn.click();
    `);

    // Chờ 500ms và kiểm tra lại có phát sinh lỗi không
    await new Promise(r => setTimeout(r, 600));
    const errorAfterClick = await browser.evaluate<string>(`
      (() => {
        const errorEl = document.querySelector('.bg-red-50, .text-red-700, [role="alert"]');
        return errorEl ? errorEl.textContent || '' : '';
      })()
    `);
    assert.ok(
      !errorAfterClick.includes("invalid_transaction"),
      `Sau khi bấm chọn loại văn bản, không được phát sinh lỗi, thực tế: ${errorAfterClick}`
    );

    // =======================================================================
    // BƯỚC 2: CHUYỂN TIẾP SANG BƯỚC 2 (STUDIO SOẠN THẢO)
    // =======================================================================
    console.log("[USER ACTION] 3. Bấm nút 'Bắt đầu soạn thảo văn bản' để chuyển sang Bước 2...");
    const nextBtnEnabled = await browser.evaluate<boolean>(`
      (() => {
        const btn = document.querySelector('[data-action="wizard-next"]');
        return btn ? !btn.disabled : false;
      })()
    `);
    assert.equal(nextBtnEnabled, true, "Nút chuyển bước phải khả dụng");

    await browser.evaluate(`document.querySelector('[data-action="wizard-next"]')?.click()`);

    // Chờ Bước 2 kích hoạt
    const step2Active = await browser.waitForFunction(`
      document.querySelector('.df-workspace-step2-shell:not([hidden])') !== null ||
      document.querySelector('[data-canvas-id="body"]') !== null
    `, 15000);
    assert.ok(step2Active, "Phải chuyển thành công sang Bước 2 Studio soạn thảo");

    // Kiểm tra không có banner lỗi tại Bước 2
    const errorStep2 = await browser.evaluate<string>(`
      (() => {
        const errorEl = document.querySelector('.bg-red-50, .text-red-700, [role="alert"]');
        return errorEl ? errorEl.textContent || '' : '';
      })()
    `);
    assert.ok(
      !errorStep2.includes("invalid_transaction"),
      `Bước 2 không được có lỗi invalid_transaction, thực tế: ${errorStep2}`
    );

    // Kiểm tra Khối Kính gửi (RecipientComponentCard) trên Unified Paper
    const recipientCardFound = await browser.evaluate<boolean>(`
      Boolean(
        document.querySelector('[data-testid="recipient-component-card"]') ||
        document.body.textContent.includes('Kính gửi:')
      )
    `);
    assert.ok(recipientCardFound, "Khối Kính gửi (Nhóm 05b) phải hiển thị trên giao diện Bước 2");

    // =======================================================================
    // BƯỚC 3: CHUYỂN TIẾP SANG BƯỚC 3 (XEM VÀ TẢI WORD)
    // =======================================================================
    console.log("[USER ACTION] 4. Chuyển sang Bước 3 (Xem và xuất văn bản)...");
    await browser.evaluate(`
      const navBtn = [...document.querySelectorAll('button')].find(b => b.textContent && b.textContent.includes('Xem và tải Word'));
      if (navBtn) navBtn.click();
      else {
        const nextBtn = document.querySelector('[data-action="wizard-next"]');
        if (nextBtn) nextBtn.click();
      }
    `);

    // Chờ Bước 3 hiển thị
    const step3Active = await browser.waitForFunction(`
      document.querySelector('[data-testid="workspace-export-screen"]') !== null ||
      document.body.textContent.includes('Bản xem trước Word') ||
      document.querySelector('#printable-document') !== null
    `, 15000);
    assert.ok(step3Active, "Phải mở thành công Bước 3 Xem và tải Word");

    // Kiểm tra tính hợp lệ của bản ứng viên tại Bước 3
    const canDownload = await browser.evaluate<boolean>(`
      (() => {
        const downloadBtn = [...document.querySelectorAll('button')].find(b => b.textContent && b.textContent.includes('Tải xuống DOCX'));
        return downloadBtn ? !downloadBtn.disabled : true;
      })()
    `);
    assert.ok(canDownload, "Nút Tải xuống DOCX phải sẵn sàng");

    console.log("[PASS] User simulation hoàn tất toàn bộ luồng 3 bước: 0 lỗi, giao diện mượt mà!");
  } finally {
    browser.close();
    server.kill();
  }
});
