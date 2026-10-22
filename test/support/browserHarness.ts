/**
 * @file browserHarness.ts
 * @description Harness Chromium/CDP dùng chung cho các ca hồi quy Chặng 3.
 *
 * Chỉ dùng cho fixture tổng hợp: mỗi bộ test tự spawn server ở cổng riêng (≠ 5050),
 * profile Chromium tách biệt, không gọi Gemini thật và không cài hook test toàn cục.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function getBrowserExecutablePath(): string {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error("No supported Chromium browser found (checked Chrome and Edge)");
}

export function buildTestServerEnv(
  parentEnv: NodeJS.ProcessEnv,
  port: number,
  options: { partitionAiMock?: boolean; fullTextAiMock?: boolean } = {},
): NodeJS.ProcessEnv {
  return {
    ...parentEnv,
    PORT: String(port),
    DOCFORM_TEST_NO_VITE_CONFIG: "true",
    DOCFORM_TEST_NO_DOTENV: "true",
    ...(options.partitionAiMock ? { DOCFORM_TEST_AI_PARTITION_MOCK: "true" } : {}),
    // Empty, present values also prevent dotenv's default no-override mode from
    // reloading credentials from a repository-local .env file.
    GEMINI_API_KEY: options.fullTextAiMock ? "synthetic-full-text-test-key" : "",
    GOOGLE_API_KEY: "",
    GOOGLE_APPLICATION_CREDENTIALS: "",
  };
}

export async function startTestServer(
  port: number,
  options: { partitionAiMock?: boolean; fullTextAiMock?: boolean } = {},
): Promise<ChildProcess> {
  const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const testEnv = buildTestServerEnv(process.env, port, options);
  const entrypoint = options.partitionAiMock ? "test/support/aiPartitionBrowserServer.ts"
    : options.fullTextAiMock ? "test/support/fullTextAiBrowserServer.ts" : "server.ts";
  const serverProc = spawn(process.execPath, [tsxCli, entrypoint, "--port", String(port)], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: testEnv,
  });
  let startupOutput = "";
  let lastProbe = "No HTTP response yet.";
  serverProc.stdout?.on("data", chunk => { startupOutput += String(chunk); });
  serverProc.stderr?.on("data", chunk => { startupOutput += String(chunk); });

  let httpReady = false;
  for (let i = 0; i < 80; i++) {
    if (serverProc.exitCode !== null) break;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) {
        httpReady = true;
        break;
      }
      lastProbe = `HTTP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 500)}`;
    } catch (error) {
      lastProbe = `HTTP probe failed: ${String(error)}`;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (httpReady && testEnv.DOCFORM_TEST_NO_VITE_CONFIG === "true") {
    const cacheRoot = path.resolve(`.vite-test-cache-${port}`);
    const metadataPath = path.join(cacheRoot, "deps", "_metadata.json");
    let stableReadCount = 0;
    let lastMetadataMtime = -1;
    for (let i = 0; i < 160; i++) {
      if (serverProc.exitCode !== null) break;
      try {
        const metadataStat = fs.statSync(metadataPath);
        const tempDirs = fs.readdirSync(cacheRoot).filter(name => name.startsWith("deps_temp_"));
        if (metadataStat.mtimeMs === lastMetadataMtime && tempDirs.length === 0) stableReadCount++;
        else stableReadCount = 0;
        lastMetadataMtime = metadataStat.mtimeMs;
        if (stableReadCount >= 2) return serverProc;
      } catch {
        stableReadCount = 0;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    lastProbe = "Vite dependency optimizer did not settle in the isolated cache.";
  } else if (httpReady) {
    return serverProc;
  }
  serverProc.kill();
  throw new Error(`Timed out waiting for server on port ${port}. ${lastProbe} Startup output: ${startupOutput.slice(-2500)}`);
}

export class CdpClient {
  private proc: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  private userDataDir: string;
  private browserDiagnostics: string[] = [];

  constructor(profilePrefix = "docform-stage3-regression") {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `${profilePrefix}-`));
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
          } else if (
            msg.method === "Runtime.exceptionThrown" ||
            msg.method === "Runtime.consoleAPICalled" ||
            msg.method === "Log.entryAdded" ||
            msg.method === "Network.loadingFailed"
          ) {
            this.browserDiagnostics.push(JSON.stringify({ method: msg.method, params: msg.params }).slice(0, 1200));
            if (this.browserDiagnostics.length > 30) this.browserDiagnostics.shift();
          }
        } catch (e) {
          console.error("CDP parse error:", e);
        }
      };
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.send("Log.enable");
    await this.send("Network.enable");
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
    if (!mounted) {
      const state = await this.evaluate<any>(`({
        href: location.href,
        title: document.title,
        bodyText: (document.body?.innerText || '').slice(0, 1200),
        bodyHtml: (document.body?.innerHTML || '').slice(0, 1600),
      })`);
      throw new Error(`Timeout waiting for React app to mount at ${url}. Browser state: ${JSON.stringify(state)}. Diagnostics: ${this.browserDiagnostics.slice(-12).join(" | ")}`);
    }
  }

  /** Tải lại thật (Page.reload) rồi chờ ứng dụng mount lại — không dựa vào `pagehide`. */
  async reload(): Promise<void> {
    await this.send("Page.reload", { ignoreCache: false });
    const mounted = await this.waitForFunction(
      `document.getElementById("docform-initial-loader") === null && Boolean(document.querySelector("header"))`,
      20000,
    );
    if (!mounted) throw new Error("Timeout waiting for React app to remount after reload");
    // Chờ hydrate bản nháp từ IndexedDB xong (App đặt data-current-step sau khi đọc).
    await new Promise((r) => setTimeout(r, 400));
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

  async waitForAsyncFunction(fnExpression: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await this.evaluate<boolean>(fnExpression);
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
        documentType: rec.doc ? rec.doc.documentType : null,
        bodyHtmlLength: rec.doc && rec.doc.bodyHtml ? rec.doc.bodyHtml.length : 0,
        docTypeOverride: rec.docTypeOverride || null,
        hasSnapshot: Boolean(rec.originalSnapshot),
        snapshotSourceType: rec.originalSnapshot ? rec.originalSnapshot.sourceType : null,
        versionCount: Array.isArray(rec.versions) ? rec.versions.length : 0,
      };
    })()`);
  }

  /** Đọc nguyên bản ghi nháp (giữ toàn bộ trường) để mô phỏng bản nháp cũ. */
  async readRawDraft(): Promise<any> {
    return this.evaluate<any>(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("DocForm30_DB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(["drafts"], "readonly");
        const req = tx.objectStore("drafts").get("current_active_draft");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    })()`);
  }

  /** Ghi đè nguyên bản ghi nháp (dùng để mô phỏng dữ liệu do phiên bản cũ tạo ra). */
  async writeRawDraft(record: any): Promise<boolean> {
    const json = JSON.stringify(record);
    return this.evaluate<boolean>(`(async () => {
      const rec = ${json};
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("DocForm30_DB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["drafts"], "readwrite");
        tx.objectStore("drafts").put(rec);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
      return true;
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

  async close(): Promise<void> {
    try { this.ws?.close(); } catch {}
    try { this.proc?.kill(); } catch {}
    try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
  }
}
