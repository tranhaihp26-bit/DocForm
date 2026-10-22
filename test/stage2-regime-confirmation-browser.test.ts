/**
 * Chặng 2 browser gate — pre-partition regime confirmation in the real UI.
 *
 * Runs on its own port (never 5050) with a fresh Chromium profile. Uses only
 * synthetic .txt sources (no user documents).
 *
 * Scenarios:
 *  - Party source while "state" is chosen => evidence modal, cancel keeps A.
 *  - A new upload while the modal is open invalidates the old pending.
 *  - "chi bộ" only in a body sentence does not change the regime (auto-proceed).
 *  - Source with no trustworthy header => insufficient => explicit confirm.
 *  - Confirm party => document commits under HD 05 and keeps "Số ".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "./support/browserHarness.ts";

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
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage2-profile-"));
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
          if (Array.isArray(listData) && listData.some((p: any) => p.type === "page" && p.webSocketDebuggerUrl)) {
            break;
          }
        }
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    const targetPage = listData?.find((p: any) => p.type === "page" && p.webSocketDebuggerUrl);
    if (!targetPage?.webSocketDebuggerUrl) {
      throw new Error("Failed to connect to Chromium CDP page endpoint");
    }

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
        } catch {
          // ignore
        }
      };
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
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
    return (res?.result?.result?.value !== undefined
      ? res.result.result.value
      : res?.result?.value) as T;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    const mounted = await this.waitForFunction(
      `document.getElementById("docform-initial-loader") === null && Boolean(document.querySelector("[data-current-step]"))`,
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
    return Boolean(
      await this.evaluate<boolean>(`(() => {
        const els = Array.from(document.querySelectorAll(${JSON.stringify(tagName)}));
        const found = els.find(e => e.textContent && e.textContent.includes(${JSON.stringify(textSubstring)}));
        if (found) { found.scrollIntoView({ block: 'center' }); found.click(); return true; }
        return false;
      })()`),
    );
  }

  async uploadFile(selector: string, filePath: string): Promise<void> {
    const docRes = await this.send("DOM.getDocument");
    const rootNodeId = docRes?.result?.root?.nodeId;
    const nodeRes = await this.send("DOM.querySelector", { nodeId: rootNodeId, selector });
    const targetNodeId = nodeRes?.result?.nodeId;
    if (!targetNodeId) throw new Error(`Element ${selector} not found for file upload`);
    await this.send("DOM.setFileInputFiles", { files: [filePath], nodeId: targetNodeId });
    await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  close(): void {
    try { this.ws?.close(); } catch {}
    try { this.proc?.kill(); } catch {}
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
  }
}

const MODAL_SELECTOR = '[data-testid="regime-confirm-modal"]';
const SIDE_BY_SIDE_TEXT = "Đối Chiếu & Phân Vùng Tài Liệu Tải Lên";

test("Chặng 2 browser: regime evidence modal, cancel keeps A, stale pending invalidated, body 'chi bộ' ignored, insufficient confirm, party commit keeps 'Số '", async () => {
  const serverPort = 5062;
  const cdpPort = 9562;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage2-synth-"));

  const partyPath = path.join(tempDir, "nguon_dang.txt");
  const adminBodyPath = path.join(tempDir, "nguon_hanh_chinh.txt");
  const noHeaderPath = path.join(tempDir, "nguon_khong_dau.txt");
  const mixedPath = path.join(tempDir, "nguon_hon_hop.txt");

  fs.writeFileSync(
    partyPath,
    [
      "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
      "Số 12-NQ/ĐU",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "NGHỊ QUYẾT",
      "Về việc triển khai nhiệm vụ quý IV.",
      "Nội dung nghị quyết của đơn vị.",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    adminBodyPath,
    [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "KẾ HOẠCH",
      "Cơ quan phối hợp với chi bộ triển khai lịch công tác.",
      "Nội dung kế hoạch chi tiết.",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    noHeaderPath,
    [
      "Cơ quan phối hợp với chi bộ triển khai lịch công tác.",
      "Nội dung thứ hai của tài liệu không có phần đầu.",
    ].join("\n"),
    "utf8",
  );
  // S2-F01 browser case: state national header + party reference number.
  fs.writeFileSync(
    mixedPath,
    [
      "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số 12-NQ/ĐU",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "NGHỊ QUYẾT",
      "Về việc phối hợp kiểm tra nội bộ.",
      "Nội dung hỗn hợp cần người dùng chọn hệ.",
    ].join("\n"),
    "utf8",
  );

  const serverProc = await startTestServer(serverPort);
  const client = new CdpClient();

  try {
    await client.launch(cdpPort);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);

    const closeSideBySide = async () => {
      await client.evaluate(`(() => {
        const modalTitle = Array.from(document.querySelectorAll("h2")).find(h => h.textContent && h.textContent.includes("Đối Chiếu & Phân Vùng"));
        if (modalTitle) {
          const header = modalTitle.closest("div.bg-slate-50");
          const btns = header ? Array.from(header.querySelectorAll("button")) : [];
          const closeX = btns[btns.length - 1];
          if (closeX) closeX.click();
        }
      })()`);
      await new Promise((r) => setTimeout(r, 250));
    };

    const clickInModal = async (text: string): Promise<boolean> => {
      return Boolean(await client.evaluate<boolean>(`(() => {
        const modal = document.querySelector('${MODAL_SELECTOR}');
        if (!modal) return false;
        const btn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes(${JSON.stringify(text)}));
        if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); return true; }
        return false;
      })()`));
    };

    // Chặng 3: nguồn được tải ngay tại Bước 1 "Tải & nhận diện".
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 8000),
      "Step 1 (Tải & nhận diện) mounted",
    );

    // --- 1) Party source while "state" is chosen => evidence modal appears ---
    await client.uploadFile('input[type="file"]', partyPath);
    assert.ok(await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') !== null`, 10000), "Regime confirmation modal must open for a contradicting source");

    const modalInfo = await client.evaluate<{ text: string; itemCount: number; hasPartyEvidence: boolean; hasNghidungChibo: boolean }>(`(() => {
      const modal = document.querySelector('${MODAL_SELECTOR}');
      const text = modal ? modal.textContent : "";
      return {
        text,
        itemCount: modal ? modal.querySelectorAll('[data-testid="regime-evidence-item"]').length : 0,
        hasPartyEvidence: text.includes("ĐẢNG CỘNG SẢN VIỆT NAM"),
        hasNghidungChibo: text.includes("chi bộ"),
      };
    })()`);
    assert.ok(modalInfo.itemCount > 0, "Modal must list concrete evidence with provenance");
    assert.equal(modalInfo.hasPartyEvidence, true, "Modal must quote the party title as evidence");
    assert.equal(modalInfo.hasNghidungChibo, false, "Body keyword must not be presented as evidence");

    // A must remain untouched: no side-by-side commit yet, and no source blob link.
    assert.equal(
      await client.evaluate<boolean>(`document.body.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)})`),
      false,
      "Side-by-side import modal must NOT open before confirmation",
    );

    // --- 2) Cancel keeps A ---
    await client.clickByText("button", "Hủy Bỏ");
    assert.ok(await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') === null`, 5000), "Cancel must close the modal");

    // Chặng 3: chưa có nguồn thật thì không được mở bước Xuất (kể cả bấm trực tiếp).
    await client.clickByText("button", "Xuất");
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "1",
      "Export step must stay blocked when no real source has been chosen",
    );
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-gate-notice="source-required"]') !== null`, 3000),
      "Blocked export must explain that a source is required",
    );
    assert.equal(
      await client.evaluate<boolean>(`Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Tải tệp gốc"))`),
      false,
      "After cancel, document A (a template) must still have no uploaded source",
    );

    // --- 3) Body "chi bộ" with a matching administrative header => no modal ---
    await client.uploadFile('input[type="file"]', adminBodyPath);
    assert.ok(
      await client.waitForFunction(`document.body.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)})`, 10000),
      "Administrative source matching the chosen regime must auto-proceed",
    );
    assert.equal(
      await client.evaluate<boolean>(`document.querySelector('${MODAL_SELECTOR}') !== null`),
      false,
      "No confirmation modal when strong evidence matches the chosen regime",
    );
    const adminCommitted = await client.evaluate<{ hasChibo: boolean; hasKeHoach: boolean }>(`(() => {
      const modal = Array.from(document.querySelectorAll("div")).find(d => d.textContent && d.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)}));
      const text = modal ? modal.textContent : document.body.textContent;
      return { hasChibo: text.includes("chi bộ"), hasKeHoach: text.includes("KẾ HOẠCH") };
    })()`);
    assert.equal(adminCommitted.hasKeHoach, true, "Administrative document must be committed");
    assert.equal(adminCommitted.hasChibo, true, "Body sentence with 'chi bộ' must be preserved in the body");

    // Close the side-by-side modal.
    await closeSideBySide();

    // --- 4) Source with no header => insufficient => explicit confirm ---
    await client.uploadFile('input[type="file"]', noHeaderPath);
    assert.ok(await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') !== null`, 10000), "Insufficient source must require confirmation");
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-testid="regime-insufficient-notice"]') !== null`, 4000),
      "Insufficient source must show the insufficient notice",
    );

    // --- 5) New upload while modal is open invalidates the old pending ---
    await client.uploadFile('input[type="file"]', partyPath);
    assert.ok(await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') !== null`, 10000), "New pending modal for the party source");
    const newPendingIsParty = await client.evaluate<boolean>(
      `document.querySelector('${MODAL_SELECTOR}').textContent.includes("ĐẢNG CỘNG SẢN VIỆT NAM")`,
    );
    assert.equal(newPendingIsParty, true, "Pending must now reference the newest uploaded source");

    // Confirm party => commit under HD 05 and keep "Số ".
    await client.clickByText("button", "Hướng dẫn 05-HD/VPTW");
    await client.clickByText("button", "Xác Nhận và Nhập");
    assert.ok(
      await client.waitForFunction(`document.body.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)})`, 12000),
      "Confirming must commit and open the review studio",
    );
    const partyCommitted = await client.evaluate<{ hasSo: boolean; hasForcedColon: boolean }>(`(() => {
      const modal = Array.from(document.querySelectorAll("div")).find(d => d.textContent && d.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)}));
      const text = modal ? modal.textContent : document.body.textContent;
      return { hasSo: text.includes("Số 12-NQ/ĐU"), hasForcedColon: text.includes("Số: 12-NQ/ĐU") };
    })()`);
    assert.equal(partyCommitted.hasSo, true, "Party reference number must keep 'Số 12-NQ/ĐU'");
    assert.equal(partyCommitted.hasForcedColon, false, "Party reference number must not be forced to 'Số: '");

    // -----------------------------------------------------------------------
    // S2-F01 browser gate: state national header + party reference number must
    // show BOTH quotes, must not commit before an explicit confirmation, cancel
    // must keep A, and confirming must segment once under the chosen regime.
    // -----------------------------------------------------------------------
    await closeSideBySide();
    await client.uploadFile('input[type="file"]', mixedPath);
    assert.ok(
      await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') !== null`, 10000),
      "Mixed-evidence source must open the confirmation modal",
    );
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-testid="regime-conflict-notice"]') !== null`, 4000),
      "Mixed-evidence source must be presented as a conflict",
    );
    const mixedModal = await client.evaluate<{ hasStateQuote: boolean; hasPartyQuote: boolean; hasConflict: boolean }>(`(() => {
      const modal = document.querySelector('${MODAL_SELECTOR}');
      const text = modal ? modal.textContent : "";
      return {
        hasStateQuote: text.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
        hasPartyQuote: text.includes("Số 12-NQ/ĐU"),
        hasConflict: Boolean(modal && modal.querySelector('[data-testid="regime-conflict-notice"]')),
      };
    })()`);
    assert.equal(mixedModal.hasStateQuote, true, "Modal must quote the state national header");
    assert.equal(mixedModal.hasPartyQuote, true, "Modal must quote the party reference number");
    assert.equal(mixedModal.hasConflict, true, "Both systems must be shown as a conflict");
    assert.equal(
      await client.evaluate<boolean>(`document.body.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)})`),
      false,
      "No commit may happen before the mixed-evidence confirmation",
    );

    // Cancel keeps A (still the previously committed party source).
    assert.ok(await clickInModal("Hủy Bỏ"), "Cancel button must be clickable inside the modal");
    assert.ok(
      await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') === null`, 5000),
      "Cancel must close the mixed-evidence modal",
    );
    const afterCancel = await client.evaluate<{ keepsA: boolean; leakedB: boolean }>(`(() => {
      const text = document.body.textContent;
      return { keepsA: text.includes("nguon_dang.txt"), leakedB: text.includes("nguon_hon_hop.txt") };
    })()`);
    assert.equal(afterCancel.keepsA, true, "Cancel must keep document A");
    assert.equal(afterCancel.leakedB, false, "Cancel must not commit the pending source B");

    // Confirm with the user-chosen state regime: segmented once, state formatting.
    await client.uploadFile('input[type="file"]', mixedPath);
    assert.ok(
      await client.waitForFunction(`document.querySelector('${MODAL_SELECTOR}') !== null`, 10000),
      "Re-uploaded mixed source must ask again",
    );
    assert.ok(await clickInModal("Nghị định 30/2020/NĐ-CP"), "State regime option must be selectable in the modal");
    assert.ok(await clickInModal("Xác Nhận và Nhập"), "Confirm button must be clickable in the modal");
    assert.ok(
      await client.waitForFunction(`document.body.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)})`, 12000),
      "Confirming the mixed source must commit",
    );
    const mixedCommitted = await client.evaluate<{ hasStateRef: boolean; hasBody: boolean }>(`(() => {
      const modal = Array.from(document.querySelectorAll("div")).find(d => d.textContent && d.textContent.includes(${JSON.stringify(SIDE_BY_SIDE_TEXT)}));
      const text = modal ? modal.textContent : document.body.textContent;
      return {
        hasStateRef: text.includes("Số: 12-NQ/ĐU"),
        hasBody: text.includes("Nội dung hỗn hợp cần người dùng chọn hệ."),
      };
    })()`);
    assert.equal(mixedCommitted.hasStateRef, true, "Chosen state regime must normalize the reference to 'Số: '");
    assert.equal(mixedCommitted.hasBody, true, "Body must be segmented from the confirmed source");
  } finally {
    client.close();
    serverProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
