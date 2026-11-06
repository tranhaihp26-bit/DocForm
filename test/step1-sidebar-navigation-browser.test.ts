import test from "node:test";
import assert from "node:assert/strict";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

test("Step 1 places its substeps in the sidebar and allows returning to earlier substeps", async () => {
  const port = 5094;
  const cdpPort = 9594;
  const server = await startTestServer(port);
  const browser = new CdpClient("docform-step1-sidebar-navigation");

  try {
    await browser.launch(cdpPort);
    // 1. Kiểm tra ở màn hình 1366x768 (Desktop chuẩn)
    await browser.setViewport(1366, 768);
    await browser.navigate(`http://127.0.0.1:${port}`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`), true);
    assert.equal(await browser.evaluate(`document.querySelectorAll('.df-import-flow-progress').length`), 0);
    const sidebarSubsteps = ".df-workspace-sidebar [data-step1-phase]";
    assert.equal(await browser.evaluate(`document.querySelectorAll(${JSON.stringify(sidebarSubsteps)}).length`), 0);

    // Click "Tải tài liệu có sẵn" -> Upload flow
    await browser.evaluate(`document.querySelector('.df-import-entry-options button')?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelectorAll(${JSON.stringify(sidebarSubsteps)}).length === 4`), true);
    assert.equal(await browser.evaluate(`document.querySelector('.df-import-flow-progress')`), null);

    const uploadLabels = await browser.evaluate<string[]>(`Array.from(document.querySelectorAll(${JSON.stringify(sidebarSubsteps)})).map(button => button.textContent?.trim() || '')`);
    assert.deepEqual(uploadLabels, ["1Tải tệp", "2Xem nhận diện", "3Xác nhận thông tin", "4Sẵn sàng soạn"]);
    assert.deepEqual(await browser.evaluate<Array<{ phase: string; current: string | null; disabled: boolean }>>(`
      Array.from(document.querySelectorAll(${JSON.stringify(sidebarSubsteps)})).map(button => ({
        phase: button.getAttribute('data-step1-phase'),
        current: button.getAttribute('aria-current'),
        disabled: button.disabled,
      }))
    `), [
      { phase: "upload", current: "step", disabled: false },
      { phase: "recognition", current: null, disabled: true },
      { phase: "metadata", current: null, disabled: true },
      { phase: "ready", current: null, disabled: true },
    ]);

    // Thử click bước chưa đủ điều kiện (disabled) -> phase không đổi
    await browser.evaluate(`document.querySelector('[data-step1-phase="ready"]')?.click()`);
    assert.equal(await browser.evaluate(`document.querySelector('[data-step1-phase="upload"]')?.getAttribute('aria-current')`), "step");

    // Click "Đổi cách bắt đầu" -> Choice phase
    await browser.evaluate(`document.querySelector('[data-step1-change-flow]')?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-flow-phase="choice"]') !== null`), true);

    // Click "Tạo văn bản mới" -> Create flow
    await browser.evaluate(`document.querySelector('.df-import-entry-options button:nth-child(2)')?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-step1-phase="regime"][aria-current="step"]') !== null`), true);
    assert.deepEqual(await browser.evaluate<string[]>(`Array.from(document.querySelectorAll(${JSON.stringify(sidebarSubsteps)})).map(button => button.textContent?.trim() || '')`), ["1Hệ thể thức", "2Loại văn bản", "3Chọn mẫu", "4Sẵn sàng soạn"]);

    // Bước 1: Hệ thể thức -> Chọn loại văn bản
    await browser.evaluate(`Array.from(document.querySelectorAll('.df-import-forward')).find(button => button.textContent?.includes('Chọn loại văn bản'))?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-flow-phase="doctype"]') !== null`), true);
    assert.equal(await browser.evaluate(`document.querySelector('[data-step1-phase="doctype"]')?.disabled`), false);

    // Quay lại bước Hệ thể thức từ sidebar
    await browser.evaluate(`document.querySelector('[data-step1-phase="regime"]')?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-flow-phase="regime"]') !== null`), true);
    assert.equal(await browser.evaluate(`document.querySelector('[data-step1-phase="regime"]')?.getAttribute('aria-current')`), "step");
    assert.equal(await browser.evaluate(`document.querySelector('[data-step1-phase="doctype"]')?.disabled`), true);

    // Tiếp tục lại sang doctype
    await browser.evaluate(`Array.from(document.querySelectorAll('.df-import-forward')).find(button => button.textContent?.includes('Chọn loại văn bản'))?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-flow-phase="doctype"]') !== null`), true);

    // Kiểm tra nút Chọn mẫu disabled khi chưa chọn loại văn bản
    assert.equal(await browser.evaluate(`Boolean(Array.from(document.querySelectorAll('.df-import-forward')).find(b => b.textContent?.includes('Chọn mẫu'))?.disabled)`), true);

    // Chọn loại văn bản "THÔNG BÁO"
    await browser.evaluate(`Array.from(document.querySelectorAll('#df-step1-document-type button')).find(b => b.textContent?.includes('THÔNG BÁO'))?.click()`);
    assert.equal(await browser.evaluate(`Boolean(Array.from(document.querySelectorAll('.df-import-forward')).find(b => b.textContent?.includes('Chọn mẫu'))?.disabled)`), false);

    // Sang bước Chọn mẫu
    await browser.evaluate(`Array.from(document.querySelectorAll('.df-import-forward')).find(button => button.textContent?.includes('Chọn mẫu'))?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-flow-phase="template"]') !== null`), true);
    assert.equal(await browser.evaluate(`document.querySelector('[data-step1-phase="template"]')?.getAttribute('aria-current')`), "step");

    // Chọn tạo "Văn bản trắng"
    await browser.evaluate(`document.querySelector('.df-import-blank-template')?.click()`);
    assert.equal(await browser.waitForFunction(`document.querySelector('[data-step1-phase="ready"][aria-current="step"]') !== null`), true);

    // 2. Kiểm tra ở màn hình 1920x1080 (Full HD Desktop)
    await browser.setViewport(1920, 1080);
    const readyState = await browser.evaluate<{ currentPhase: string | null; canEnterStep2: boolean }>(`({
      currentPhase: document.querySelector('[data-step1-phase="ready"]')?.getAttribute('aria-current'),
      canEnterStep2: document.querySelector('.df-import-forward') !== null,
    })`);
    assert.equal(readyState.currentPhase, "step");
    assert.equal(readyState.canEnterStep2, true);
  } finally {
    browser.close();
    server.kill();
  }
});
