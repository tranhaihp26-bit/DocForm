/**
 * INDEPENDENT PROBE — Stage 1 / S01 (audit only, lives OUTSIDE the repo).
 *
 * Contract under test:
 *   "A proposal captured for source A must NOT be applicable / recorded into
 *    version history / export after the user switches to source B."
 *
 * The shipped test suite (s01-proposal-regime-safety) covers the
 * review-proposal channel (handleAiCheckPartitions / fetchAiReviewProposals).
 * This probe covers the SEPARATE "AI tinh chỉnh" channel
 * (handleAiRefine -> acceptRefineProposal, App.tsx:2237-2275), which is NOT
 * bound to the document session gate.
 *
 * Scenario:
 *   1. commit source A (synthetic DOCX)
 *   2. start "Sửa chính tả" (AI refine) on A, with a DELAYED, MOCKED response
 *   3. switch to source B (synthetic DOCX) -> B commits
 *   4. release the stale refine response for A
 *   5. click "Áp dụng" in the refine modal
 *
 * Expected (contract): the stale proposal must be discarded / blocked.
 * Observed (defect): A's refined body overwrites B's body and is pushed into
 * the version history.
 *
 * The AI endpoint is fully MOCKED in the browser (window.fetch override) -
 * no document text ever leaves the machine, no Gemini call is made.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

const SERVER_PORT = 5085;
const CDP_PORT = 9685;

function getBrowserExecutablePath(): string {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error("No supported Chromium browser found (checked Chrome and Edge)");
}

class CdpClient {
  private proc: any = null;
  private ws: any = null;
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  public userDataDir: string;

  constructor() {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-audit-d1-"));
  }

  async launch(port = CDP_PORT): Promise<void> {
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
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          listData = await res.json();
          if (Array.isArray(listData) && listData.length > 0) break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    const page = listData?.find((p: any) => p.type === "page" && p.webSocketDebuggerUrl) || listData?.[0];
    if (!page?.webSocketDebuggerUrl) throw new Error("Failed to connect to Chromium CDP page endpoint");
    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(page.webSocketDebuggerUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e: any) => reject(e);
      this.ws.onmessage = (evt: any) => {
        try {
          const msg = JSON.parse(evt.data.toString());
          if (msg.id && this.pendingCallbacks.has(msg.id)) {
            const cb = this.pendingCallbacks.get(msg.id)!;
            this.pendingCallbacks.delete(msg.id);
            cb(msg);
          }
        } catch {}
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
    if (res?.result?.exceptionDetails) {
      console.error("Evaluate error:", JSON.stringify(res.result.exceptionDetails).slice(0, 400));
    }
    const val = res?.result?.result?.value;
    return val as T;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 60; i++) {
      const href = await this.evaluate<string>("window.location.href");
      const title = await this.evaluate<string>("document.title");
      if (href && href.startsWith("http") && title && title.length > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const mounted = await this.waitForFunction(
      `document.getElementById("docform-initial-loader") === null && Boolean(document.querySelector("[data-current-step]"))`,
      15000
    );
    if (!mounted) throw new Error("Timeout waiting for React app to mount");
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
    const clicked = await this.evaluate<boolean>(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tagName)}));
      const found = els.find(e => e.textContent && e.textContent.includes(${JSON.stringify(textSubstring)}));
      if (found) { found.scrollIntoView({ block: 'center' }); found.click(); return true; }
      return false;
    })()`);
    return Boolean(clicked);
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

  close(): void {
    try { this.ws?.close(); } catch {}
    try { this.proc?.kill(); } catch {}
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
  }
}

async function startTestServer(port: number) {
  const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const p = spawn(process.execPath, [tsxCli, "server.ts", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, PORT: String(port) },
  });
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return p;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  p.kill();
  throw new Error(`Timed out waiting for server on port ${port}`);
}

const REFINE_MARKER = "REFINED_FROM_ALPHA";

test("AUDIT PROBE: stale AI-refine proposal for source A must not be applied to source B", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-audit-d1-fix-"));

  const mk = (name: string, subject: string, bodyHtml: string) =>
    generateND30DocxBuffer({
      regime: "administrative",
      headerProfile: "generic",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
      orgHeader2: "ĐƠN VỊ THỬ NGHIỆM " + name,
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
      documentType: "THÔNG BÁO",
      referenceNumber: `Số: 10${name}/TB-HD`,
      subject,
      bodyHtml,
      signTitle: "GIÁM ĐỐC",
      signName: "Người Ký " + name,
      recipients: "Như trên;\nLưu: VT.",
      fontFamily: "Times New Roman",
      fontSize: 13,
    });

  const fileAPath = path.join(tempDir, "Audit_Alpha.docx");
  const fileBPath = path.join(tempDir, "Audit_Beta.docx");
  fs.writeFileSync(
    fileAPath,
    await mk("ALPHA", "V/v tài liệu tổng hợp Alpha", "<p>Nội dung gốc của nguồn Alpha.</p>")
  );
  fs.writeFileSync(
    fileBPath,
    await mk("BETA", "V/v tài liệu tổng hợp Beta", "<p>Nội dung gốc của nguồn Beta.</p>")
  );

  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient();
  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    // ---- install the MOCK (no real AI call is ever made) ------------------
    await client.evaluate(`(() => {
      const origFetch = window.fetch.bind(window);
      window.__refineCalls = [];
      window.__aiCalls = [];
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/ai/refine-text")) {
          let bodyText = "";
          try { bodyText = init && init.body ? JSON.parse(init.body).text : ""; } catch {}
          return new Promise((resolve) => {
            window.__refineCalls.push({
              bodyText,
              resolveJson: (payload) => resolve(new Response(JSON.stringify(payload), {
                status: 200, headers: { "Content-Type": "application/json" }
              }))
            });
          });
        }
        if (url.includes("/api/ai/")) {
          window.__aiCalls.push(url);
          return Promise.resolve(new Response(JSON.stringify({ success: true, proposals: [], totalBlocks: 0 }), {
            status: 200, headers: { "Content-Type": "application/json" }
          }));
        }
        return origFetch(input, init);
      };
    })()`);

    // ---- 1. commit source A ---------------------------------------------
    await client.uploadFile('input[type="file"]', fileAPath);
    await client.waitForFunction(
      `document.body.textContent.includes("Audit_Alpha.docx")`, 15000
    );
    await new Promise((r) => setTimeout(r, 1500));

    const aCommitted = await client.evaluate<boolean>(
      `document.body.textContent.includes("Nội dung gốc của nguồn Alpha.") || document.body.textContent.includes("Alpha")`
    );
    console.log("[probe] A visible after upload:", aCommitted);

    // Workspace requires an explicit source approval before Body AI can run.
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await client.waitForFunction(`document.querySelector('[data-current-step="2"]') !== null`, 8000);

    // ---- 2. start AI refine on A (delayed mock) --------------------------
    // The Workspace editor owns the Body refine action.
    const stepNow = await client.evaluate<string>(
      `document.querySelector('[data-current-step]')?.getAttribute('data-current-step') || document.querySelector('[data-wizard-step]')?.getAttribute('data-wizard-step') || "?"`
    );
    console.log("[probe] current step:", stepNow);

    const refineClicked = await client.clickByText("button", "Rà chính tả Body");
    console.log("[probe] 'Sửa chính tả' clicked:", refineClicked);
    if (!refineClicked) {
      const btnTexts = await client.evaluate<string[]>(
        `Array.from(document.querySelectorAll("button")).map(b => (b.textContent||"").trim()).filter(Boolean).slice(0, 60)`
      );
      console.log("[probe] visible buttons:", JSON.stringify(btnTexts));
    }
    const refineRequested = await client.waitForFunction(`window.__refineCalls.length === 1`, 8000);
    assert.ok(refineRequested, "AI refine request for source A must have been issued");

    const refineReqBody = await client.evaluate<string>(
      `window.__refineCalls[0].bodyText`
    );
    console.log("[probe] refine request carried A body:", String(refineReqBody).includes("Alpha"));

    // ---- 3. switch to source B -------------------------------------------
    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 8000);
    await client.uploadFile('input[type="file"]', fileBPath);
    await client.waitForFunction(
      `document.body.textContent.includes("Audit_Beta.docx")`, 15000
    );
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await client.waitForFunction(`document.querySelector('[data-current-step="2"]') !== null`, 8000);
    await new Promise((r) => setTimeout(r, 2500));

    // ---- 4. release the STALE refine response for A ----------------------
    await client.evaluate(`(() => {
      window.__refineCalls[0].resolveJson({
        success: true,
        source: "mock_audit",
        refined: "<p>${REFINE_MARKER}</p>"
      });
    })()`);
    await new Promise((r) => setTimeout(r, 1200));

    const staleModalShown = await client.evaluate<boolean>(
      `document.body.textContent.includes("${REFINE_MARKER}")`
    );
    console.log("[probe] stale refine modal surfaced after B committed:", staleModalShown);

    // ---- 5. click "Áp dụng" in the stale refine modal --------------------
    const applied = await client.evaluate<boolean>(`(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const hit = btns.find(b => b.textContent && b.textContent.includes("Phê duyệt & Áp dụng nội dung này"));
      if (hit) { hit.click(); return true; }
      return false;
    })()`);
    console.log("[probe] 'Áp dụng' clicked on stale proposal:", applied);
    await new Promise((r) => setTimeout(r, 2000));

    // ---- read the persisted draft to see what the active source contains --
    const draft = await client.evaluate<any>(`(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open("DocForm30_DB");
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const rec = await new Promise((res, rej) => {
        const tx = db.transaction("drafts", "readonly");
        const g = tx.objectStore("drafts").get("current_active_draft");
        g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error);
      });
      if (!rec) return null;
      return {
        fileName: rec.originalSnapshot?.fileName ?? null,
        sourceType: rec.originalSnapshot?.sourceType ?? null,
        bodyHtml: rec.doc?.bodyHtml ?? null,
        versionTitles: (rec.versions || []).map(v => v.title),
      };
    })()`);

    console.log("[probe] persisted draft:", JSON.stringify({
      fileName: draft?.fileName,
      sourceType: draft?.sourceType,
      bodyHasRefineMarker: String(draft?.bodyHtml || "").includes(REFINE_MARKER),
      bodyHasBeta: String(draft?.bodyHtml || "").includes("Beta"),
      versionTitles: draft?.versionTitles,
    }));

    // ---- VERDICT ---------------------------------------------------------
    assert.ok(
      !String(draft?.bodyHtml || "").includes(REFINE_MARKER),
      `CONTRACT VIOLATION: body of the ACTIVE source (${draft?.fileName}) was overwritten by the stale AI-refine proposal captured for source A. bodyHtml=${String(draft?.bodyHtml).slice(0, 300)}`
    );
  } finally {
    client.close();
    serverProc.kill();
  }
});
