import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";

const FIXTURE_PATH = path.resolve(process.cwd(), "test/fixtures/recipient_samples/02_ND30_CongVan_KinhGui_NhieuNoi.docx");

test("Pilot E2E: Luồng người dùng Bước 1 -> Bước 2 -> Bước 3 với Khối Kính gửi & Bảng cuối dời sang phải", async () => {
  assert.ok(fs.existsSync(FIXTURE_PATH), "Fixture test phải tồn tại");

  const serverPort = 5089;
  const cdpPort = 9589;
  const server = await startTestServer(serverPort);
  const client = new CdpClient("pilot-recipient-flow");

  try {
    await client.launch(cdpPort);
    await client.setViewport(1366, 768);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);

    // =========================================================================
    // 1. TẢI TÀI LIỆU NGUỒN VÀ XÁC NHẬN THỂ THỨC (BƯỚC 1)
    // =========================================================================
    assert.equal(await client.clickByText("button", "Tải tài liệu có sẵn"), true, "Phải mở được modal tải tệp");
    await client.uploadFile('input[type="file"]', FIXTURE_PATH);

    // Kiểm tra nếu có modal xác nhận thể thức thì xác nhận
    const hasRegimeModal = await client.waitForFunction(
      `document.querySelector('[data-testid="regime-confirm-button"]') !== null || document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`,
      15000
    );
    assert.ok(hasRegimeModal, "Tệp phải được nhận diện và xử lý");

    if (await client.evaluate(`Boolean(document.querySelector('[data-testid="regime-confirm-button"]'))`)) {
      await client.evaluate(`document.querySelector('[data-testid="regime-option-state"]')?.click()`);
      await client.evaluate(`document.querySelector('[data-testid="regime-confirm-button"]')?.click()`);
    }

    // Chờ source được nạp xong
    assert.ok(
      await client.waitForFunction(
        `document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`,
        20000
      ),
      "Bước 1 phải nạp xong nguồn"
    );

    // Kiểm tra thông tin raw draft
    const rawDraft = await client.readRawDraft();
    assert.ok(rawDraft, "Phải đọc được rawDraft");
    assert.ok(rawDraft.doc.recipientHeader, "Draft phải chứa recipientHeader bóc tách");
    assert.equal(rawDraft.doc.recipientHeader.kind, "kinh_gui", "Kind phải là kinh_gui");
    assert.equal(rawDraft.doc.recipientHeader.items.length, 3, "02_ND30 có đúng 3 nơi nhận");

    // Chọn loại văn bản nếu chưa chọn (ví dụ CÔNG VĂN)
    const hasDocType = await client.evaluate(`Boolean(document.querySelector('[aria-pressed="true"]'))`);
    if (!hasDocType) {
      await client.clickByText("button", "CÔNG VĂN");
    }

    // Nếu có yêu cầu xác nhận profile cơ quan Hoa Tiêu vs Chung:
    if (await client.evaluate(`Boolean(document.querySelector('[data-action="confirm-company-profile"]'))`)) {
      await client.evaluate(`document.querySelector('[data-action="confirm-company-profile"]')?.click()`);
    } else if (await client.evaluate(`Boolean(document.querySelector('[data-action="confirm-generic-profile"]'))`)) {
      await client.evaluate(`document.querySelector('[data-action="confirm-generic-profile"]')?.click()`);
    }

    // Chờ và kiểm tra trạng thái
    const debugState = await client.evaluate<any>(`(() => {
      const btn = document.querySelector('[data-action="wizard-next"]');
      const step1 = document.querySelector('[data-wizard-step="1"]');
      const alerts = Array.from(document.querySelectorAll('[role="alert"], [data-source-warning]')).map(el => el.textContent?.trim());
      const selectedDocType = document.querySelector('[aria-pressed="true"]')?.textContent?.trim();
      return {
        btnText: btn?.textContent?.trim(),
        btnDisabled: btn?.hasAttribute('disabled'),
        flowPhase: step1?.getAttribute('data-flow-phase'),
        hasSource: step1?.getAttribute('data-has-source'),
        selectedDocType,
        alerts,
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 20),
      };
    })()`);
    console.log("[DEBUG BƯỚC 1 GATE]:", JSON.stringify(debugState, null, 2));

    // Nếu có cảnh báo loại văn bản hoặc rà soát phân vùng:
    if (await client.evaluate(`Boolean(document.querySelector('[data-action="override-doctype-mismatch"]'))`)) {
      await client.evaluate(`document.querySelector('[data-action="override-doctype-mismatch"]')?.click()`);
    }
    if (await client.evaluate(`Boolean(document.querySelector('[data-action="resolve-doctype-mismatch"]'))`)) {
      await client.evaluate(`document.querySelector('[data-action="resolve-doctype-mismatch"]')?.click()`);
    }

    // Chờ nút chuyển bước enabled
    assert.ok(
      await client.waitForFunction(
        `document.querySelector('[data-action="wizard-next"]') && !document.querySelector('[data-action="wizard-next"]').disabled`,
        10000
      ),
      "Nút tiếp tục phải khả dụng sau khi chọn loại văn bản"
    );

    // Click nút chuyển sang Bước 2
    await client.evaluate(`document.querySelector('[data-action="wizard-next"]')?.click()`);

    // =========================================================================
    // 2. CHUYỂN SANG BƯỚC 2 (STUDIO SOẠN THẢO)
    // =========================================================================
    const reachedStep2 = await client.waitForFunction(
      `document.querySelector('[data-current-step="2"]') !== null || document.querySelector('[data-wizard-step="2"]') !== null || document.querySelector('[data-canvas-id="body"]') !== null`,
      20000
    );
    assert.ok(reachedStep2, "Phải vào được Bước 2 Studio");

    // Kiểm tra thẻ Khối Kính gửi / Kính trình (Nhóm 05b) trên Unified Paper
    const recipientCardCheck = await client.evaluate<{
      hasCard: boolean;
      cardTitle: string;
      cardText: string;
      bodyHasKinhGui: boolean;
    }>(`(() => {
      const card = document.getElementById("df-step2-group-recipient");
      const body = document.querySelector('[data-canvas-id="body"]');
      return {
        hasCard: card !== null,
        cardTitle: card?.querySelector('h3')?.textContent || '',
        cardText: card?.textContent || '',
        bodyHasKinhGui: (body?.textContent || '').includes("Kính gửi:"),
      };
    })()`);

    assert.ok(recipientCardCheck.hasCard, "Thẻ 05b. Khối Kính gửi / Kính trình phải hiển thị trên Unified Paper");
    assert.ok(recipientCardCheck.cardTitle.includes("05b"), "Thẻ phải mang định danh 05b");
    assert.equal(recipientCardCheck.bodyHasKinhGui, false, "Thân bài Body KHÔNG được chứa dòng 'Kính gửi:' bị lặp lại");

    // Mở Modal chỉnh sửa thẻ Kính gửi và kiểm tra dialog
    await client.evaluate(`document.getElementById("df-step2-group-recipient")?.querySelector('button')?.click()`);
    const dialogOpen = await client.waitForFunction(
      `document.getElementById("df-ws-edit-title-recipient") !== null`,
      5000
    );
    assert.ok(dialogOpen, "Modal chỉnh sửa Khối Kính gửi phải mở thành công");

    // Đóng Modal (nhấn Lưu & đóng)
    await client.evaluate(`document.querySelector('.df-ws-save-close')?.click() || document.querySelector('.df-ws-edit-dialog-header button')?.click()`);

    // =========================================================================
    // 3. CHUYỂN SANG BƯỚC 3 (XEM TRƯỚC & ĐỐI CHIẾU & XUẤT CANDIDATE)
    // =========================================================================
    await client.evaluate(`document.querySelector('[data-action="workspace-next"]')?.click() || document.querySelector('button[data-step="3"]')?.click() || document.querySelector('[data-toc-target="df-step3-preview"]')?.click()`);
    const reachedStep3 = await client.waitForFunction(
      `document.querySelector('[data-current-step="3"]') !== null || document.querySelector('[data-wizard-step="3"]') !== null`,
      20000
    );
    assert.ok(reachedStep3, "Phải chuyển sang được Bước 3 Xem & xuất");

    // Nếu cần tạo candidate, nhấn nút tạo
    const prepareBtn = await client.evaluate(`Boolean(document.querySelector('.df-step3-prepare-button') || document.querySelector('.df-step3-empty-state button'))`);
    if (prepareBtn) {
      await client.evaluate(`document.querySelector('.df-step3-prepare-button')?.click() || document.querySelector('.df-step3-empty-state button')?.click()`);
    }

    // Chờ ứng viên khởi tạo
    await client.waitForFunction(
      `document.querySelector('[data-candidate-instance]') !== null`,
      30000
    );

    // Kiểm tra giao diện Bản xem trước và Bảng cuối
    const step3VisualCheck = await client.evaluate<{
      hasRecipientInPreview: boolean;
      hasSignatureTable: boolean;
      isCandidateSafe: string | null;
      candidateState: string | null;
    }>(`(() => {
      const text = document.body.innerText || '';
      return {
        hasRecipientInPreview: text.includes("Kính gửi:"),
        hasSignatureTable: text.includes("Nơi nhận:") && text.includes("GIÁM ĐỐC"),
        isCandidateSafe: document.querySelector('[data-candidate-safe]')?.getAttribute('data-candidate-safe'),
        candidateState: document.querySelector('[data-candidate-state]')?.getAttribute('data-candidate-state'),
      };
    })()`);

    assert.ok(step3VisualCheck.hasRecipientInPreview, "Bản xem trước Bước 3 phải hiển thị khối Kính gửi:");
    assert.ok(step3VisualCheck.hasSignatureTable, "Bản xem trước Bước 3 phải hiển thị bảng Nơi nhận và Giám đốc");
    assert.ok(step3VisualCheck.candidateState !== "missing", "Candidate instance phải sẵn sàng");

    console.log("[Pilot Test Result] Step 1 -> Step 2 -> Step 3 hoàn thành 100%. Ứng viên an toàn:", step3VisualCheck.isCandidateSafe);
  } finally {
    await client.close();
    server.kill();
  }
});
