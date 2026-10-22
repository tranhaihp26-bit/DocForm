/**
 * Chặng 3 — Kiểm thử trình duyệt cho wizard ba bước "Tải & nhận diện → Soạn & kiểm tra → Xuất văn bản".
 *
 * Chỉ dùng fixture tổng hợp (không dùng dữ liệu thật), cổng riêng ≠ 5050,
 * profile Chrome tách biệt, không gọi Gemini thật.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "./support/browserHarness.ts";

const SERVER_PORT = 5075;
const CDP_PORT = 9675;

function getBrowserExecutablePath(): string {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error("No supported Chromium browser found (checked Chrome and Edge)");
}

class CdpClient {
  private proc: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  private userDataDir: string;

  constructor() {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage3-profile-"));
  }

  async launch(port: number): Promise<void> {
    const exe = getBrowserExecutablePath();
    this.proc = spawn(exe, [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${this.userDataDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--window-size=1440,900",
    ]);

    let listData: any = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          listData = await res.json();
          if (Array.isArray(listData) && listData.length > 0) break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    const targetPage = listData?.find((p: any) => p.type === "page" && p.webSocketDebuggerUrl) || listData?.[0];
    if (!targetPage?.webSocketDebuggerUrl) throw new Error("Failed to connect to Chromium CDP page endpoint");

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(targetPage.webSocketDebuggerUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data.toString());
          if (msg.id && this.pendingCallbacks.has(msg.id)) {
            const cb = this.pendingCallbacks.get(msg.id)!;
            this.pendingCallbacks.delete(msg.id);
            cb(msg);
          }
        } catch (e) {
          console.error("CDP parse error:", e);
        }
      };
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.setViewport(1440, 900);
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await new Promise((r) => setTimeout(r, 150));
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pendingCallbacks.set(id, resolve);
      this.ws?.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.result?.exceptionDetails) {
      console.error("Evaluate script error:", res.result.exceptionDetails);
    }
    const val = res?.result?.result?.value !== undefined
      ? res.result.result.value
      : (res?.result?.value !== undefined ? res.result.value : res?.value);
    return val as T;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    const mounted = await this.waitForFunction(
      `document.getElementById("docform-initial-loader") === null && Boolean(document.querySelector("header"))`,
      20000,
    );
    if (!mounted) throw new Error("Timeout waiting for React app to mount at " + url);
  }

  async waitForFunction(fnExpression: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await this.evaluate<boolean>(`Boolean(${fnExpression})`);
      if (res) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  }

  async clickByText(tagName: string, textSubstring: string): Promise<boolean> {
    return Boolean(await this.evaluate<boolean>(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tagName)}));
      const found = els.find(e => e.textContent && e.textContent.includes(${JSON.stringify(textSubstring)}));
      if (found) {
        found.scrollIntoView({ block: 'center' });
        found.click();
        return true;
      }
      return false;
    })()`));
  }

  async clickStep(step: 1 | 2 | 3): Promise<boolean> {
    return Boolean(await this.evaluate<boolean>(`(() => {
      const btn = document.querySelector('.df-workspace-sidebar button[data-step="${step}"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`));
  }

  async uploadFile(selector: string, filePath: string): Promise<void> {
    const docRes = await this.send("DOM.getDocument");
    const rootNodeId = docRes?.result?.root?.nodeId ?? docRes?.root?.nodeId;
    const nodeRes = await this.send("DOM.querySelector", { nodeId: rootNodeId, selector });
    const targetNodeId = nodeRes?.result?.nodeId ?? nodeRes?.nodeId;
    if (!targetNodeId) throw new Error(`Element ${selector} not found`);
    await this.send("DOM.setFileInputFiles", { files: [filePath], nodeId: targetNodeId });
    await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  /** Đọc trực tiếp bản nháp trong IndexedDB để chứng minh dữ liệu đã commit thật. */
  async readPersistedDraft(): Promise<any> {
    return this.evaluate<any>(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("DocForm30_DB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction(["drafts"], "readonly");
        const req = tx.objectStore("drafts").get("current_active_draft");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (!rec) return null;
      return {
        sourceOrigin: rec.sourceOrigin,
        currentStep: rec.currentStep,
        fileName: rec.uploadedFileName,
        headerProfile: rec.doc ? rec.doc.headerProfile : null,
      };
    })()`);
  }

  /** Poll IndexedDB tới khi bản nháp thỏa điều kiện; trả về số ms đã chờ. */
  async waitForPersisted(predicate: (rec: any) => boolean, timeoutMs = 2500): Promise<number | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const rec = await this.readPersistedDraft();
      if (rec && predicate(rec)) return Date.now() - start;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  async pressKey(key: "Tab" | "Escape", shift = false): Promise<void> {    const code = key === "Tab" ? "Tab" : "Escape";
    const vk = key === "Tab" ? 9 : 27;
    const modifiers = shift ? 8 : 0;
    await this.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
    await new Promise((r) => setTimeout(r, 120));
  }

  async close(): Promise<void> {
    try { this.ws?.close(); } catch {}
    try { this.proc?.kill(); } catch {}
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
  }
}

const ADMIN_TXT = [
  "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  "Độc lập - Tự do - Hạnh phúc",
  "Số: 12/QĐ-UBND",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
  "QUYẾT ĐỊNH",
  "Về việc ban hành quy chế kiểm thử nội bộ",
  "Nội dung do người dùng soạn cho tài liệu hành chính Alpha.",
  "",
  "Nơi nhận:",
  "- Như trên;",
  "- Lưu: VT.",
].join("\n");

const PARTY_TXT = [
  "ĐẢNG CỘNG SẢN VIỆT NAM",
  "Số 05-NQ/ĐU",
  "Hải Phòng, ngày 12 tháng 10 năm 2026",
  "NGHỊ QUYẾT",
  "Về việc kiểm thử nội bộ của chi bộ",
  "Nội dung do người dùng soạn cho tài liệu Đảng Beta.",
].join("\n");

test("Chặng 3: wizard ba bước, cổng dữ liệu, bảo toàn nguồn, lưu trữ và truy cập bàn phím", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage3-fixtures-"));
  const adminPath = path.join(tempDir, "Synthetic_Admin_Alpha.txt");
  const partyPath = path.join(tempDir, "Synthetic_Party_Beta.txt");
  fs.writeFileSync(adminPath, ADMIN_TXT, "utf8");
  fs.writeFileSync(partyPath, PARTY_TXT, "utf8");

  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient();

  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    // =========================================================================
    // 1) Hợp đồng ba bước + cổng dữ liệu mặc định
    // =========================================================================
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000),
      "Bước 1 (Tải & nhận diện) phải được render",
    );

    const stepper = await client.evaluate<string>(
      `document.querySelector('.df-workspace-sidebar')?.getAttribute('aria-label') || ""`,
    );
    assert.equal(stepper, "Tiến trình 3 bước", "Stepper phải công bố đúng 3 bước");

    const stepCount = await client.evaluate<number>(`document.querySelectorAll('.df-workspace-sidebar button[data-step]').length`);
    assert.equal(stepCount, 3, "Stepper phải có đúng 3 nút");

    const stepLabels = await client.evaluate<string[]>(
      `Array.from(document.querySelectorAll('.df-workspace-sidebar button[data-step]')).map(b => b.getAttribute('aria-label') || "")`,
    );
    assert.deepEqual(stepLabels, ["1. Tải & nhận diện", "2. Soạn & kiểm tra", "3. Xem & xuất"]);

    const wizardStepNodes = await client.evaluate<number>(`document.querySelectorAll('[data-wizard-step]').length`);
    assert.equal(wizardStepNodes, 1, "Chỉ bước hiện hành được render (không còn khối 4 bước song song)");

    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')`),
      "false",
      "Dữ liệu minh họa mặc định không được tính là nguồn người dùng đã chọn",
    );

    // Bấm "Soạn" khi chưa có nguồn => bị chặn, có giải thích.
    await client.clickStep(2);
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "1",
      "Bấm bước Soạn khi chưa có nguồn phải bị chặn",
    );
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-gate-notice="source-required"]') !== null`, 3000),
      "Cổng chặn phải hiển thị lý do thiếu nguồn",
    );

    // Ca đỏ của Chặng 3: chọn THÔNG BÁO trên nội dung minh họa Kế hoạch rồi nhảy tới Xuất.
    await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-wizard-step="1"] button'))
        .find(b => (b.textContent || '').includes('THÔNG BÁO'));
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    await client.clickStep(3);
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "1",
      "Chọn lại loại văn bản trên nội dung minh họa KHÔNG được mở bước Xuất",
    );
    const demoNotice = await client.evaluate<string>(
      `document.querySelector('[data-gate-notice="source-required"]')?.textContent || ""`,
    );
    assert.ok(
      demoNotice.includes("minh họa") && demoNotice.includes("THÔNG BÁO"),
      "Thông báo phải nói rõ nội dung chỉ là bản minh họa và đổi loại không tạo nguồn mới",
    );

    // =========================================================================
    // 2) Đường khởi đầu bằng mẫu hệ thống + mâu thuẫn loại văn bản
    // =========================================================================
    assert.ok(
      await client.waitForFunction(
        `Array.from(document.querySelectorAll('button')).some(b => (b.textContent || '').includes('Dùng mẫu'))`,
        5000,
      ),
      "Bước 1 phải có lối bắt đầu từ mẫu",
    );
    await client.clickByText("button", "Dùng mẫu");
    await new Promise((r) => setTimeout(r, 300));
    // Nếu bản đang soạn đã thay đổi, hệ thống hỏi lại trước khi thay mẫu.
    await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').trim() === 'Đổi mẫu');
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 450));

    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')`),
      "true",
      "Áp mẫu là một nguồn do người dùng chủ động chọn",
    );
    assert.ok(
      await client.evaluate<boolean>(
        `Boolean(document.querySelector('#regime-chosen') && document.querySelector('#regime-suggested') && document.querySelector('#regime-confirmed'))`,
      ),
      "Bước 1 phải hiển thị hệ đã chọn, hệ nguồn gợi ý và hệ đã xác nhận",
    );

    // Đổi loại văn bản khác với mẫu => phải giải thích mâu thuẫn và vẫn cho người dùng quyết định.
    await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-wizard-step="1"] button'))
        .find(b => (b.textContent || '').includes('THÔNG BÁO'));
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    const mismatchShown=await client.waitForFunction(`document.querySelector('[data-source-warning="doc-type"]') !== null`, 3000);
    if(!mismatchShown){
      const raw=await client.evaluate<any>(`(async()=>{const {loadDraft}=await import('/src/utils/draftStore.ts');return await loadDraft()})()`);
      const ui=await client.evaluate(`({selected:[...document.querySelectorAll('[data-wizard-step="1"] button[aria-pressed="true"]')].map(button=>button.textContent?.trim().slice(0,80)),warnings:[...document.querySelectorAll('[data-source-warning]')].map(node=>node.textContent),alerts:[...document.querySelectorAll('[role="alert"]')].map(node=>node.textContent),source:document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')})`);
      assert.fail(`Loại văn bản mâu thuẫn với mẫu phải hiển thị lý do: ${JSON.stringify({docType:raw?.doc.documentType,sourceId:raw?.originalSnapshot?.sourceId,revision:raw?.workspace?.workingRevision,ui})}`);
    }

    // Chọn lại KẾ HOẠCH để mâu thuẫn biến mất (người dùng quyết định).
    await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('[data-wizard-step="1"] button'))
        .find(b => (b.textContent || '').trim().startsWith('KẾ HOẠCH'));
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      await client.evaluate<boolean>(`document.querySelector('[data-source-warning="doc-type"]') !== null`),
      false,
      "Hết mâu thuẫn thì cảnh báo phải biến mất",
    );

    // Sang bước 2 rồi quay lại: nguồn và nội dung phải được bảo toàn.
    assert.ok(await client.clickByText("button", "Tiếp tục: Soạn & kiểm tra"));
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="2"]') !== null`, 5000),
      "Nguồn đã chọn phải mở được bước Soạn & kiểm tra",
    );
    await client.clickStep(1);
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')`),
      "true",
      "Quay lại Bước 1 vẫn phải giữ nguồn đã chọn",
    );
    const previewText = await client.evaluate<string>(
      `document.querySelector('[data-testid="wizard-source-preview"]')?.textContent || ""`,
    );
    assert.ok(previewText.length > 40, "Nội dung nguồn phải còn sau khi đi/lùi bước");

    // =========================================================================
    // 3) Đường nhập tệp: nhận diện, chứng cứ, A→B hủy giữ A
    // =========================================================================
    await client.uploadFile('input[type="file"]', adminPath);
    assert.ok(
      await client.waitForFunction(
        `document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true' && document.body.textContent.includes('Synthetic_Admin_Alpha.txt')`,
        20000,
      ),
      "Tệp hành chính phải được nhập và ghi nhận là nguồn thật",
    );
    // Đóng hộp thoại đối chiếu nếu mở.
    await client.evaluate(`(() => {
      const modal = document.querySelector('[data-testid="side-by-side-modal"]');
      if (modal) {
        const closeBtn = modal.querySelector('button[aria-label="Đóng hộp thoại đối chiếu nguồn"]');
        if (closeBtn) closeBtn.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 300));

    const detection = await client.evaluate<{ suggested: string; confirmed: string; evidence: number }>(`(() => ({
      suggested: document.querySelector('#regime-suggested')?.textContent || "",
      confirmed: document.querySelector('#regime-confirmed')?.textContent || "",
      evidence: document.querySelectorAll('[data-regime-evidence]').length,
    }))()`);
    assert.ok(detection.suggested.includes("Hành chính"), "Hệ nguồn gợi ý phải là Hành chính");
    assert.ok(detection.confirmed.length > 0, "Hệ đã xác nhận phải được hiển thị");
    assert.ok(detection.evidence > 0, "Chứng cứ nhận diện phải được trích dẫn từ nguồn");

    // Tải B (Đảng) khi đang chọn Hành chính => phải hỏi, hủy thì giữ nguyên A.
    await client.uploadFile('input[type="file"]', partyPath);
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-testid="regime-confirm-modal"]') !== null`, 10000),
      "Tệp khác hệ phải mở hộp thoại xác nhận thể thức",
    );
    await client.clickByText("button", "Hủy Bỏ");
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-testid="regime-confirm-modal"]') === null`, 5000),
      "Hủy phải đóng hộp thoại xác nhận",
    );
    const afterCancel = await client.evaluate<{ stillAlpha: boolean; hasBeta: boolean }>(`(() => ({
      stillAlpha: document.body.textContent.includes('Synthetic_Admin_Alpha.txt'),
      hasBeta: document.body.textContent.includes('Synthetic_Party_Beta.txt') || document.body.textContent.includes('chi bộ Beta'),
    }))()`);
    assert.equal(afterCancel.stillAlpha, true, "Hủy B phải giữ nguyên tài liệu A");
    assert.equal(afterCancel.hasBeta, false, "Hủy B không được để lọt dữ liệu B vào tài liệu");

    // =========================================================================
    // 4) Lưu trữ: chọn mẫu cơ quan rồi tải lại sau ~120ms
    // =========================================================================
    const versionMarker = "Trước khi áp dụng profile công ty";
    const countVersionMarkers = async () =>
      client.evaluate<number>(`(() => {
        const text = document.body.textContent || "";
        return text.split(${JSON.stringify(versionMarker)}).length - 1;
      })()`);

    const profileBefore = await client.evaluate<boolean>(
      `Boolean(Array.from(document.querySelectorAll('[data-wizard-step="1"] button')).find(b => (b.textContent || '').includes('Hoa tiêu miền Bắc'))?.getAttribute('aria-pressed') === 'true')`,
    );
    assert.equal(profileBefore, false, "Ban đầu mẫu cơ quan phải là Cơ quan chung");

    assert.ok(
      await client.clickByText("button", "Hoa tiêu miền Bắc"),
      "Phải chọn được mẫu cơ quan Hoa tiêu miền Bắc",
    );
    // Không chờ debounce 1000ms: bản nháp phải commit ngay sau thay đổi lựa chọn.
    const commitElapsed = await client.waitForPersisted(
      (rec) => rec.headerProfile === "hoa-tieu-hang-hai-mien-bac" || rec.headerProfile !== "generic",
      2500,
    );
    assert.notEqual(commitElapsed, null, "Lựa chọn mẫu cơ quan phải được ghi vào IndexedDB");
    assert.ok(
      (commitElapsed as number) < 800,
      `Lựa chọn phải commit ngay (không phụ thuộc debounce 1000ms), thực tế ${commitElapsed}ms`,
    );

    const persisted = await client.readPersistedDraft();
    console.log(`[stage3] IndexedDB commit ${commitElapsed}ms ->`, JSON.stringify(persisted));
    // Tải lại thật ngay sau khi commit (không dựa vào pagehide).
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);
    assert.ok(
      await client.waitForFunction(
        `document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`,
        15000,
      ),
      "Lựa chọn nguồn phải được khôi phục sau khi tải lại (không mất nội dung)",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "1",
      "Tải lại không được tự mở bước Xuất",
    );
    assert.equal(
      await client.evaluate<boolean>(
        `Boolean(Array.from(document.querySelectorAll('[data-wizard-step="1"] button')).find(b => (b.textContent || '').includes('Hoa tiêu miền Bắc'))?.getAttribute('aria-pressed') === 'true')`,
      ),
      true,
      "Mẫu cơ quan vừa chọn phải sống sót qua tải lại",
    );

    // Chỉ báo lưu phải là chữ thật sau khi IndexedDB commit thành công.
    assert.ok(
      await client.waitForFunction(
        `document.querySelector('[data-save-status]')?.textContent === 'Đã lưu'`,
        5000,
      ),
      "Chỉ báo phải là 'Đã lưu' sau khi IndexedDB commit thành công",
    );

    // =========================================================================
    // 5) Bấm lại mẫu cơ quan đang chọn là no-op (không sinh phiên bản mới)
    // =========================================================================
    const closeDrawer = async () => {
      await client.evaluate(`(() => {
        const closeBtn = document.querySelector('button[aria-label="Đóng ngăn công cụ"]');
        if (closeBtn) closeBtn.click();
      })()`);
      await new Promise((r) => setTimeout(r, 300));
    };

    await client.clickByText("button", "Công cụ");
    await client.waitForFunction(`document.body.textContent.includes('Lịch sử phiên bản')`, 5000);
    const versionsBefore = await countVersionMarkers();
    await closeDrawer();

    await client.clickByText("button", "Hoa tiêu miền Bắc");
    await new Promise((r) => setTimeout(r, 300));
    await client.clickByText("button", "Công cụ");
    await client.waitForFunction(`document.body.textContent.includes('Lịch sử phiên bản')`, 5000);
    const versionsAfter = await countVersionMarkers();
    await closeDrawer();
    assert.equal(versionsAfter, versionsBefore, "Bấm lại mẫu cơ quan đang chọn không được tạo phiên bản mới");

    // =========================================================================
    // 6) Bố cục 320×568, 390×844, 844×390 + hộp thoại có thể truy cập
    // =========================================================================
    for (const vp of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 844, h: 390 }]) {
      await client.setViewport(vp.w, vp.h);
      await new Promise((r) => setTimeout(r, 250));
      if ((await client.evaluate<boolean>(`Boolean(document.querySelector('[data-wizard-step="1"]'))`)) === false) {
        await client.clickStep(1);
        await new Promise((r) => setTimeout(r, 300));
      }

      const overflow = await client.evaluate<boolean>(
        `document.documentElement.scrollWidth <= window.innerWidth + 1`,
      );
      assert.equal(overflow, true, `Không được tràn ngang tại ${vp.w}x${vp.h}`);

      const diffButtonInView = await client.evaluate<boolean>(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Xem khác biệt thể thức'));
        if (!btn) return false;
        btn.scrollIntoView({ block: 'center' });
        const rect = btn.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      })()`);
      assert.equal(diffButtonInView, true, `Nút 'Xem khác biệt thể thức' không được tràn ngang tại ${vp.w}px`);

      const allReachable = await client.evaluate<boolean>(`(() => {
        const root = document.querySelector('[data-wizard-step="1"]');
        if (!root) return false;
        const targets = Array.from(root.querySelectorAll('button')).slice(0, 24);
        for (const btn of targets) {
          btn.scrollIntoView({ block: 'center' });
          const rect = btn.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          if (rect.left < -1 || rect.right > window.innerWidth + 1) return false;
        }
        return true;
      })()`);
      assert.equal(allReachable, true, `Mọi lựa chọn Bước 1 phải cuộn tới được tại ${vp.w}x${vp.h}`);

      const saveStatusVisible = await client.evaluate<boolean>(`(() => {
        const el = document.querySelector('[data-save-status]');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })()`);
      assert.equal(saveStatusVisible, true, `Chỉ báo lưu phải hiện bằng chữ tại ${vp.w}x${vp.h}`);
    }

    await client.setViewport(390, 844);
    await new Promise((r) => setTimeout(r, 250));

    const diffDialogExpr = `Array.from(document.querySelectorAll('[role="dialog"][aria-labelledby]'))
      .find(d => (d.textContent || '').includes('Khác biệt cốt lõi') && d.getBoundingClientRect().width > 0)`;

    // Hộp thoại khác biệt thể thức: tên truy cập, focus, Tab, Escape trả focus.
    const opened = await client.evaluate<boolean>(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes('Xem khác biệt thể thức'));
      if (!btn) return false;
      btn.setAttribute('data-diff-trigger', 'true');
      btn.focus();
      btn.click();
      return true;
    })()`);
    assert.equal(opened, true, "Phải mở được hộp thoại khác biệt thể thức");
    assert.ok(
      await client.waitForFunction(`${diffDialogExpr} !== undefined`, 3000),
      "Hộp thoại phải có tên truy cập qua aria-labelledby",
    );

    const dialogA11y = await client.evaluate<{ name: string; focusInside: boolean }>(`(() => {
      const dlg = ${diffDialogExpr};
      if (!dlg) return { name: '', focusInside: false };
      const id = dlg.getAttribute('aria-labelledby');
      const label = id ? document.getElementById(id) : null;
      return {
        name: label ? (label.textContent || '').trim() : '',
        focusInside: dlg.contains(document.activeElement),
      };
    })()`);
    assert.ok(dialogA11y.name.includes("Khác biệt cốt lõi"), "Hộp thoại phải có tên truy cập đọc được");
    assert.equal(dialogA11y.focusInside, true, "Mở hộp thoại phải đưa focus vào trong");

    for (let i = 0; i < 6; i += 1) {
      await client.pressKey("Tab");
      const inside = await client.evaluate<boolean>(`(() => {
        const dlg = ${diffDialogExpr};
        return Boolean(dlg && dlg.contains(document.activeElement));
      })()`);
      assert.equal(inside, true, `Tab lần ${i + 1} không được thoát khỏi hộp thoại`);
    }
    await client.pressKey("Tab", true);
    const insideAfterShiftTab = await client.evaluate<boolean>(`(() => {
      const dlg = ${diffDialogExpr};
      return Boolean(dlg && dlg.contains(document.activeElement));
    })()`);
    assert.equal(insideAfterShiftTab, true, "Shift+Tab không được thoát khỏi hộp thoại");

    await client.pressKey("Escape");
    assert.ok(
      await client.waitForFunction(
        `Array.from(document.querySelectorAll('[role="dialog"]')).every(d => !(d.textContent || '').includes('Khác biệt cốt lõi'))`,
        3000,
      ),
      "Escape phải đóng hộp thoại",
    );
    const focusReturned = await client.evaluate<boolean>(
      `document.activeElement?.getAttribute('data-diff-trigger') === 'true'`,
    );
    assert.equal(focusReturned, true, "Đóng hộp thoại phải trả focus về nút đã mở");

    console.log("\n✅ Chặng 3 browser suite hoàn tất.");
  } finally {
    await client.close();
    serverProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
