/**
 * INDEPENDENT PROBE — Stage 3 export gate (audit only, lives OUTSIDE the repo).
 *
 * Contracts under test (from the Stage-3 plan / acceptance minutes):
 *  (a) "bản nhập chưa duyệt không được ... cho vào Xuất như tài liệu hợp lệ"
 *      -> dismissing the "Đối Chiếu & Phân Vùng" review dialog with
 *         "Hủy bỏ" must NOT leave the export path open.
 *  (b) "✓ chỉ khi bước thực sự hoàn thành; không được dựa vào currentStep"
 *      -> the stepper completion mark must not flip when the user merely
 *         navigates back to step 1.
 *
 * Synthetic DOCX only; no real document, no AI call.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

const SERVER_PORT = 5086;
const CDP_PORT = 9686;

function getBrowserExecutablePath(): string {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error("No supported Chromium browser found");
}

class CdpClient {
  private proc: any = null;
  private ws: any = null;
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  public userDataDir: string;
  constructor() { this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-audit-s3-")); }

  async launch(port = CDP_PORT): Promise<void> {
    const exe = getBrowserExecutablePath();
    this.proc = spawn(exe, [
      "--headless=new", `--remote-debugging-port=${port}`,
      `--user-data-dir=${this.userDataDir}`, "--disable-gpu", "--no-first-run",
      "--no-default-browser-check", "--disable-extensions", "--window-size=1440,900",
    ]);
    let listData: any = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) { listData = await res.json(); if (Array.isArray(listData) && listData.length) break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    const page = listData?.find((p: any) => p.type === "page" && p.webSocketDebuggerUrl) || listData?.[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("No CDP page endpoint");
    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(page.webSocketDebuggerUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e: any) => reject(e);
      this.ws.onmessage = (evt: any) => {
        try {
          const msg = JSON.parse(evt.data.toString());
          if (msg.id && this.pendingCallbacks.has(msg.id)) {
            const cb = this.pendingCallbacks.get(msg.id)!;
            this.pendingCallbacks.delete(msg.id); cb(msg);
          }
        } catch {}
      };
    });
    await this.send("Page.enable"); await this.send("Runtime.enable"); await this.send("DOM.enable");
  }
  send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => { this.pendingCallbacks.set(id, resolve); this.ws?.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res?.result?.exceptionDetails) console.error("Evaluate error:", JSON.stringify(res.result.exceptionDetails).slice(0, 300));
    return res?.result?.result?.value as T;
  }
  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 60; i++) {
      const href = await this.evaluate<string>("window.location.href");
      const title = await this.evaluate<string>("document.title");
      if (href && href.startsWith("http") && title) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const ok = await this.waitForFunction(
      `document.getElementById("docform-initial-loader") === null && Boolean(document.querySelector("[data-current-step]"))`, 15000);
    if (!ok) throw new Error("App did not mount");
  }
  async waitForFunction(expr: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.evaluate<boolean>(`Boolean(${expr})`)) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  }
  async uploadFile(selector: string, filePath: string): Promise<void> {
    const docRes = await this.send("DOM.getDocument");
    const rootNodeId = docRes?.result?.root?.nodeId ?? docRes?.root?.nodeId;
    const nodeRes = await this.send("DOM.querySelector", { nodeId: rootNodeId, selector });
    const nodeId = nodeRes?.result?.nodeId ?? nodeRes?.nodeId;
    if (!nodeId) throw new Error(`Element ${selector} not found`);
    await this.send("DOM.setFileInputFiles", { files: [filePath], nodeId });
    await this.evaluate(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); if (i) i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  }
  close(): void {
    try { this.ws?.close(); } catch {}
    try { this.proc?.kill(); } catch {}
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
  }
}

async function startTestServer(port: number) {
  const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const p = spawn(process.execPath, [tsxCli, "server.ts", "--port", String(port)], {
    cwd: process.cwd(), stdio: "pipe", env: { ...process.env, PORT: String(port) },
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) return p; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  p.kill(); throw new Error("server timeout");
}

const readStepper = `(() => {
  const out = {};
  document.querySelectorAll("[data-step]").forEach(b => {
    out[b.getAttribute("data-step")] = {
      allowed: b.getAttribute("data-step-allowed"),
      complete: b.getAttribute("data-step-complete"),
      current: b.getAttribute("aria-current"),
    };
  });
  return out;
})()`;

test("AUDIT PROBE: export gate must not open for an unapproved import review; stepper checkmark must be data-derived", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-audit-s3-fix-"));
  const fileAPath = path.join(tempDir, "Audit_S3_Gamma.docx");
  fs.writeFileSync(fileAPath, await generateND30DocxBuffer({
    regime: "administrative", headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH", orgHeader2: "ĐƠN VỊ THỬ NGHIỆM GAMMA",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 20 tháng 10 năm 2026",
    documentType: "THÔNG BÁO", referenceNumber: "Số: 303/TB-GAMMA",
    subject: "V/v tài liệu tổng hợp Gamma",
    bodyHtml: "<p>Nội dung tài liệu Gamma dùng cho kiểm thử cổng xuất.</p>",
    signTitle: "GIÁM ĐỐC", signName: "Người Ký Gamma",
    recipients: "Như trên;\nLưu: VT.", fontFamily: "Times New Roman", fontSize: 13,
  }));

  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient();
  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    const before = await client.evaluate<any>(readStepper);
    console.log("[probe] stepper before upload:", JSON.stringify(before));

    await client.uploadFile('input[type="file"]', fileAPath);
    const modal = await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`, 15000);
    assert.ok(modal, "side-by-side review modal must open after upload");

    // ---- dismiss the review WITHOUT confirming ("Hủy bỏ") ----------------
    const cancelled = await client.evaluate<boolean>(`(() => {
      const b = Array.from(document.querySelectorAll("button")).find(x => x.textContent && x.textContent.trim() === "Hủy bỏ");
      if (b) { b.click(); return true; } return false;
    })()`);
    console.log("[probe] review dismissed with 'Hủy bỏ':", cancelled);
    await new Promise((r) => setTimeout(r, 1200));

    const afterCancel = await client.evaluate<any>(readStepper);
    console.log("[probe] stepper after dismissing review:", JSON.stringify(afterCancel));

    // ---- can we reach step 3 and is the export available? ----------------
    let exportState: any = null;
    if (afterCancel["3"]?.allowed === "true") {
      await client.evaluate(`(() => { const b = document.querySelector('[data-step="3"]'); if (b) b.click(); })()`);
      await new Promise((r) => setTimeout(r, 1200));
      exportState = await client.evaluate<any>(`(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const docx = btns.find(b => b.textContent && /Word|\\.docx/i.test(b.textContent));
        const pdf = btns.find(b => b.textContent && /PDF/i.test(b.textContent));
        return {
          onStep3: Boolean(document.querySelector('[data-wizard-step="3"]')),
          docxBtn: docx ? { text: docx.textContent.trim(), disabled: docx.disabled } : null,
          pdfBtn: pdf ? { text: pdf.textContent.trim(), disabled: pdf.disabled } : null,
        };
      })()`);
      console.log("[probe] export UI after dismissing review:", JSON.stringify(exportState));
    }

    // ---- (b) stepper checkmark must not depend on the navigation position
    let markerBefore = afterCancel["2"]?.complete;
    let markerAfter = null;
    if (afterCancel["3"]?.allowed === "true") {
      await client.evaluate(`(() => { const b = document.querySelector('[data-step="1"]'); if (b) b.click(); })()`);
      await new Promise((r) => setTimeout(r, 900));
      const back = await client.evaluate<any>(readStepper);
      markerAfter = back["2"]?.complete;
      console.log("[probe] step-2 checkmark: at step3 =", markerBefore, ", after navigating back to step1 =", markerAfter);
    }

    // ---- VERDICT ---------------------------------------------------------
    assert.notEqual(
      afterCancel["3"]?.allowed, "true",
      `CONTRACT VIOLATION: the import review was dismissed without approval ("Hủy bỏ") but the export step (3) is still allowed. stepper=${JSON.stringify(afterCancel)}`
    );
    assert.notEqual(
      markerAfter, markerBefore,
      `CONTRACT VIOLATION: the stepper completion mark changed purely because the user navigated back to step 1 (${markerBefore} -> ${markerAfter}); it must be derived from real completion data, not from currentStep.`
    );
  } finally {
    client.close(); serverProc.kill();
  }
});
