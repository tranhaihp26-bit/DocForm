import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { startTestServer, CdpClient } from "./support/browserHarness.ts";

const PILOT_FILE_PATH = "C:\\Users\\GIAP\\Downloads\\01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx";

test("Desktop Pilot: Luồng người dùng từ Tải nguồn -> Duyệt B1 -> Soạn B2 -> Đối chiếu B3 trên tệp thật", async (t) => {
  if (!fs.existsSync(PILOT_FILE_PATH)) {
    t.skip("PILOT_FILE_PATH không tồn tại, đánh dấu BLOCKED cho pilot file thật.");
    return;
  }

  const serverPort = 5078;
  const cdpPort = 9578;
  const server = await startTestServer(serverPort);
  // Harness sử dụng Chrome DevTools Protocol (CDP) client trực tiếp trên trình duyệt Chromium
  const client = new CdpClient("docform-pilot");

  try {
    await client.launch(cdpPort);
    // Viewport chuẩn desktop PC 1366 x 768
    await client.setViewport(1366, 768);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);

    // 1. Nhấn nút "Tải tài liệu có sẵn" và upload file pilot
    assert.equal(await client.clickByText("button", "Tải tài liệu có sẵn"), true, "Phải mở được modal/giao diện tải tệp");
    await client.uploadFile('input[type="file"]', PILOT_FILE_PATH);

    // 2. Chờ modal xác nhận thể thức (nếu có yêu cầu xác nhận)
    const hasRegimeModal = await client.waitForFunction(
      `document.querySelector('[data-testid="regime-confirm-button"]') !== null || document.querySelector('.df-regime-modal') !== null`,
      3000
    );
    if (hasRegimeModal) {
      await client.evaluate(`document.querySelector('[data-testid="regime-option-state"]')?.click() || document.querySelector('.df-regime-modal input[value="state"]')?.click()`);
      await client.evaluate(`document.querySelector('[data-testid="regime-confirm-button"]')?.click() || document.querySelector('.df-regime-modal button:last-child')?.click()`);
    }

    // 3. Bước 1: Duyệt nhận diện & phân vùng
    const reachedStep1Review = await client.waitForFunction(
      `document.querySelectorAll('select[data-block-id]').length > 0 || document.body.innerText.includes("Kiểm tra nội dung tài liệu") || document.body.innerText.includes("Chọn nguồn và thiết lập")`,
      30000
    );
    assert.ok(reachedStep1Review, "Phải mở giao diện duyệt Bước 1");

    // Lấy thông tin phân vùng (không log nội dung text riêng tư)
    const step1Summary = await client.evaluate<{
      totalBlocks: number;
      bodyBlocks: number;
      signatureBlocks: number;
      headerBlocks: number;
      unclassifiedBlocks: number;
    }>(`({
      totalBlocks: document.querySelectorAll("select[data-block-id]").length,
      bodyBlocks: Array.from(document.querySelectorAll("select[data-block-id] option:checked")).filter(o => o.textContent?.trim() === "Nội dung chính").length,
      signatureBlocks: Array.from(document.querySelectorAll("select[data-block-id] option:checked")).filter(o => o.textContent?.includes("chữ ký") || o.textContent?.includes("Chữ ký")).length,
      headerBlocks: Array.from(document.querySelectorAll("select[data-block-id] option:checked")).filter(o => o.textContent?.includes("Đầu trang") || o.textContent?.includes("Thông tin thể thức")).length,
      unclassifiedBlocks: Array.from(document.querySelectorAll("select[data-block-id] option:checked")).filter(o => o.textContent?.includes("Chưa rõ")).length,
    })`);

    console.log(`[Pilot Bước 1 (CDP 1366x768)] Tổng số khối: ${step1Summary.totalBlocks}, Body: ${step1Summary.bodyBlocks}, Chữ ký: ${step1Summary.signatureBlocks}, Đầu trang/thể thức: ${step1Summary.headerBlocks}, Chưa rõ: ${step1Summary.unclassifiedBlocks}`);
    assert.ok(step1Summary.totalBlocks >= 10, "Tệp pilot phải trích xuất được đủ số khối");
    assert.ok(step1Summary.signatureBlocks >= 1, "Bảng nơi nhận/chữ ký phải được nhận diện vào vùng ký");
    assert.equal(step1Summary.unclassifiedBlocks, 0, "Pilot Bước 1 phải xác nhận không còn khối nguồn chưa phân loại");

    // Chuyển sang Bước 2: "Tiếp tục đưa vào Studio soạn thảo" hoặc click Step 2 trên sidebar
    const step2ButtonFound = await client.clickByText("button", "Tiếp tục đưa vào Studio soạn thảo");
    if (!step2ButtonFound) {
      await client.evaluate(`document.querySelector('[data-toc-target="df-step2-groups-before"]')?.click() || document.querySelector('button[data-step="2"]')?.click()`);
    }

    // A source/profile mismatch is an explicit B1 decision gate. Resolve it in
    // the pilot using the button indicated by the visible source evidence.
    const reachedPostImportGate = await client.waitForFunction(
      `document.querySelector('[data-wizard-step="2"]') !== null || document.querySelector('[data-testid="source-profile-conflict"]') !== null`,
      20000
    );
    assert.ok(reachedPostImportGate, "Sau khi duyệt nguồn phải vào B2 hoặc hiện rõ yêu cầu xác nhận mẫu cơ quan");
    const profileChoice = await client.evaluate<"company" | "generic" | null>(`(() => {
      const warning = document.querySelector('[data-testid="source-profile-conflict"]');
      if (!warning) return null;
      return warning.textContent?.includes('khớp mẫu Hoa tiêu miền Bắc') ? 'company' : 'generic';
    })()`);
    if (profileChoice) {
      const choiceButton = profileChoice === "company"
        ? '[data-action="confirm-company-profile"]'
        : '[data-action="confirm-generic-profile"]';
      assert.equal(await client.evaluate(`Boolean(document.querySelector(${JSON.stringify(choiceButton)}))`), true,
        "Khi có mâu thuẫn mẫu, B1 phải cung cấp lựa chọn xác nhận tường minh");
      await client.evaluate(`document.querySelector(${JSON.stringify(choiceButton)})?.click()`);
    }

    const reachedStep2 = await client.waitForFunction(
      `document.querySelector('[data-wizard-step="2"]') !== null || document.querySelector('[data-canvas-id="body"]') !== null`,
      20000
    );
    assert.ok(reachedStep2, "Phải vào được Bước 2 Studio soạn thảo");

    // 4. Bước 2: Kiểm tra canvas Body tách biệt khỏi Nơi nhận / Chữ ký
    const step2CanvasCheck = await client.evaluate<{
      bodyCanvasExists: boolean;
      bodyCanvasHasRecipients: boolean;
      finalSectionExists: boolean;
      finalSignerFieldCount: number;
      finalRecipientFieldCount: number;
      bodyContainsSignerField: boolean;
    }>(`({
      ...(() => {
        const body = document.querySelector('[data-canvas-id="body"]');
        const finalSection = document.getElementById("df-step2-groups-after");
        const signerCard = finalSection?.querySelector('[data-workspace-group="7"]');
        const recipientsCard = finalSection?.querySelector('[data-workspace-group="9"]');
        const fieldValues = (card) => Array.from(card?.querySelectorAll('.df-ws-component-values > .df-ws-component-value') || [])
          .map(element => element.textContent?.trim() || '')
          .filter(value => value && value !== 'Chưa có dữ liệu trong bản soạn.');
        const signerValues = fieldValues(signerCard);
        const recipientValues = fieldValues(recipientsCard);
        const bodyText = body?.textContent || '';
        return {
          bodyCanvasExists: body !== null,
          bodyCanvasHasRecipients: Boolean(bodyText.includes("Nơi nhận:")),
          finalSectionExists: finalSection !== null,
          finalSignerFieldCount: signerValues.length,
          finalRecipientFieldCount: recipientValues.length,
          bodyContainsSignerField: signerValues.some(value => bodyText.includes(value)),
        };
      })(),
    })`);

    assert.ok(step2CanvasCheck.bodyCanvasExists, "Canvas Body phải tồn tại ở Bước 2");
    assert.equal(step2CanvasCheck.bodyCanvasHasRecipients, false, "Canvas Body KHÔNG được chứa trường Nơi nhận");
    assert.ok(step2CanvasCheck.finalSectionExists, "Phần cuối (#df-step2-groups-after) phải hiển thị riêng ngoài Body");
    assert.ok(step2CanvasCheck.finalSignerFieldCount >= 2, "Phần cuối phải hiển thị riêng cả chức vụ và họ tên người ký");
    assert.ok(step2CanvasCheck.finalRecipientFieldCount >= 1, "Phần cuối phải hiển thị giá trị nơi nhận riêng ngoài Body");
    assert.equal(step2CanvasCheck.bodyContainsSignerField, false, "Canvas Body không được chứa các giá trị chức vụ hoặc người ký của phần cuối");

    // 5. Chuyển sang Bước 3: Xem trước & Xuất
    await client.evaluate(`document.querySelector('button[data-step="3"]')?.click() || document.querySelector('[data-toc-target="df-step3-preview"]')?.click()`);
    const reachedStep3 = await client.waitForFunction(
      `document.querySelector('[data-wizard-step="3"]') !== null`,
      20000
    );
    assert.ok(reachedStep3, "Phải vào được Bước 3 Xem & xuất");

    // Nếu chưa tạo ứng viên, nhấn nút "Tạo và kiểm DOCX ứng viên"
    const prepareBtn = await client.evaluate(`Boolean(document.querySelector('.df-step3-prepare-button') || document.querySelector('.df-step3-empty-state button'))`);
    if (prepareBtn) {
      await client.evaluate(`document.querySelector('.df-step3-prepare-button')?.click() || document.querySelector('.df-step3-empty-state button')?.click()`);
    }

    // Chờ kết quả ứng viên
    await client.waitForFunction(
      `document.querySelector('[data-candidate-instance]') !== null`,
      30000
    );

    const step3Inspection = await client.evaluate<{
      candidateState: string;
      isSafe: string | null;
      hasDiagnosticPreview: boolean;
      hasDiagnosticBanner: boolean;
      hasDocxPreviewWrapper: boolean;
      hasWhiteScreen: boolean;
      detailsDefaultClosed: boolean;
      downloadButtonExists: boolean;
      downloadButtonDisabled: boolean;
      printButtonExists: boolean;
      printButtonDisabled: boolean;
      hasLockNote: boolean;
    }>(`({
      candidateState: document.querySelector('[data-candidate-state]')?.getAttribute('data-candidate-state') || 'none',
      isSafe: document.querySelector('[data-candidate-safe]')?.getAttribute('data-candidate-safe'),
      hasDiagnosticPreview: document.querySelector('[data-diagnostic-preview="true"]') !== null,
      hasDiagnosticBanner: document.querySelector('.df-step3-diagnostic-banner') !== null,
      hasDocxPreviewWrapper: document.querySelector('.docx-wrapper') !== null,
      hasWhiteScreen: document.body.innerText.trim().length === 0,
      detailsDefaultClosed: Array.from(document.querySelectorAll('details.df-step3-warning-details, details.df-step3-advisory, details.df-step3-evidence')).every(d => !d.open),
      downloadButtonExists: document.querySelector('.df-step3-download-button') !== null,
      downloadButtonDisabled: Boolean(document.querySelector('.df-step3-download-button')?.getAttribute('disabled') !== null || document.querySelector('.df-step3-download-button.is-locked')),
      printButtonExists: document.querySelector('.df-step3-print-button') !== null,
      printButtonDisabled: Boolean(document.querySelector('.df-step3-print-button')?.getAttribute('disabled') !== null || document.querySelector('.df-step3-print-button.is-locked')),
      hasLockNote: document.querySelector('.df-step3-export-note')?.textContent?.includes('bị khóa') ?? false,
    })`);

    console.log(`[Pilot Bước 3] Candidate state: ${step3Inspection.candidateState}, isSafe: ${step3Inspection.isSafe}, hasDiagnosticBanner: ${step3Inspection.hasDiagnosticBanner}, downloadDisabled: ${step3Inspection.downloadButtonDisabled}, printDisabled: ${step3Inspection.printButtonDisabled}`);

    assert.equal(step3Inspection.hasWhiteScreen, false, "Không được xuất hiện màn trắng ở Bước 3");
    assert.ok(step3Inspection.detailsDefaultClosed, "Các chi tiết kỹ thuật/bằng chứng phải mặc định đóng");
    assert.ok(step3Inspection.candidateState !== "missing" && step3Inspection.candidateState !== "none", "Ứng viên phải được khởi tạo thành công");
    assert.ok(step3Inspection.isSafe === "true" || step3Inspection.isSafe === "false", "Trạng thái isSafe phải xác định rõ ('true' hoặc 'false')");

    if (step3Inspection.isSafe === "false") {
      // Ứng viên fidelity bị chặn: kiểm tra preview chẩn đoán và khóa tải/in
      assert.ok(step3Inspection.hasDiagnosticBanner || step3Inspection.hasDiagnosticPreview,
        "Ứng viên bị chặn fidelity phải có nhãn 'Bản đối chiếu — chưa đủ điều kiện xuất'");
      assert.ok(step3Inspection.downloadButtonDisabled, "Nút Tải xuống DOCX phải bị khóa/disabled khi ứng viên chưa đạt an toàn");
      assert.ok(step3Inspection.printButtonDisabled, "Nút In phải bị khóa/disabled khi ứng viên chưa đạt an toàn");
      assert.ok(step3Inspection.hasLockNote, "Giao diện phải có thông báo nêu rõ tải và in đã bị khóa");
    } else {
      console.log("[Pilot Bước 3] Ứng viên đã đạt an toàn và đủ điều kiện xuất DOCX!");
      assert.equal(step3Inspection.downloadButtonDisabled, false, "Nút tải phải khả dụng khi an toàn");
    }
  } finally {
    await client.close();
    server.kill();
  }
});
