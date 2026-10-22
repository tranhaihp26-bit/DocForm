import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startTestServer } from "./support/browserHarness.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

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
  private browserWs: WebSocket | null = null;
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  public downloadDir: string;
  private userDataDir: string;

  constructor() {
    this.downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-sess-dl-"));
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-sess-profile-"));
  }

  async launch(port = 9558): Promise<void> {
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
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          listData = await res.json();
          if (Array.isArray(listData) && listData.length > 0) {
            const page = listData.find((p: any) => p.type === "page" && p.webSocketDebuggerUrl);
            if (page) break;
          }
        }
      } catch {
        // wait
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    try {
      const verRes = await fetch(`http://127.0.0.1:${port}/json/version`);
      const verJson = await verRes.json();
      if (verJson.webSocketDebuggerUrl) {
        this.browserWs = new WebSocket(verJson.webSocketDebuggerUrl);
        await new Promise((resolve) => {
          this.browserWs!.onopen = resolve as any;
        });
        this.browserWs.send(
          JSON.stringify({
            id: 999999,
            method: "Browser.setDownloadBehavior",
            params: {
              behavior: "allow",
              downloadPath: this.downloadDir,
              eventsEnabled: true,
            },
          })
        );
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch {
      // ignore
    }

    const targetPage =
      listData?.find((p: any) => p.type === "page" && p.webSocketDebuggerUrl) || listData?.[0];
    if (!targetPage?.webSocketDebuggerUrl) {
      throw new Error("Failed to connect to Chromium CDP page endpoint");
    }

    const wsUrl = targetPage.webSocketDebuggerUrl;
    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
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
    try {
      await this.send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
    } catch {}
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
    const val =
      res?.result?.result?.value !== undefined
        ? res.result.result.value
        : res?.result?.value !== undefined
          ? res.result.value
          : res?.value;
    return val as T;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    for (let i = 0; i < 60; i++) {
      const href = await this.evaluate<string>("window.location.href");
      const title = await this.evaluate<string>("document.title");
      if (href && href.startsWith("http") && title && title.length > 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    const mounted = await this.waitForFunction(
      `document.getElementById("docform-initial-loader") === null && Boolean(document.querySelector("[data-current-step]"))`,
      15000
    );
    if (!mounted) {
      throw new Error("Timeout waiting for React app to mount at " + url);
    }
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
      if (found) {
        found.scrollIntoView({ block: 'center' });
        found.click();
        return true;
      }
      return false;
    })()`);
    return Boolean(clicked);
  }

  async uploadFile(selector: string, filePath: string): Promise<void> {
    const docRes = await this.send("DOM.getDocument");
    const rootNodeId = docRes?.result?.root?.nodeId ?? docRes?.root?.nodeId;
    if (!rootNodeId) {
      throw new Error("Could not retrieve root nodeId from DOM.getDocument");
    }
    const nodeRes = await this.send("DOM.querySelector", {
      nodeId: rootNodeId,
      selector,
    });
    const targetNodeId = nodeRes?.result?.nodeId ?? nodeRes?.nodeId;
    if (!targetNodeId) {
      throw new Error(`Element ${selector} not found for file upload`);
    }
    await this.send("DOM.setFileInputFiles", {
      files: [filePath],
      nodeId: targetNodeId,
    });
    await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (input) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {}
    try {
      this.browserWs?.close();
    } catch {}
    try {
      this.proc?.kill();
    } catch {}
    try {
      fs.rmSync(this.userDataDir, { recursive: true, force: true });
      fs.rmSync(this.downloadDir, { recursive: true, force: true });
    } catch {}
  }
}

test("Task 3: Browser E2E - Session safety for delayed AI responses, A->B switch, invalid B, role edit, regime switch, and template replacement", async () => {
  const serverPort = 5058;
  const cdpPort = 9558;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-synth-docx-"));

  // Generate synthetic DOCX A and DOCX B (no real business documents used)
  const docxBufA = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM ALPHA",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 101/KH-ALPHA",
    subject: "V/v Kiểm định an toàn phiên tài liệu Alpha",
    bodyHtml: "<p>Điều 1. Nội dung đoạn văn thứ nhất của tài liệu tổng hợp Alpha.</p><p>Điều 2. Tổ chức thực hiện nhiệm vụ Alpha.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký Alpha",
    recipients: "Như Điều 2;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  });

  const docxBufB = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM BETA",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 18 tháng 10 năm 2026",
    documentType: "QUYẾT ĐỊNH",
    referenceNumber: "Số: 202/QĐ-BETA",
    subject: "V/v Ban hành quy trình kiểm định phiên Beta",
    bodyHtml: "<p>Điều 1. Nội dung quyết định của tài liệu tổng hợp Beta.</p><p>Điều 2. Hiệu lực thi hành của tài liệu Beta.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký Beta",
    recipients: "Như Điều 2;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  });

  const docxBufGamma = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM GAMMA",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 20 tháng 10 năm 2026",
    documentType: "THÔNG BÁO",
    referenceNumber: "Số: 303/TB-GAMMA",
    subject: "V/v Tài liệu Gamma dùng kiểm thử hủy upload khi đổi phiên",
    bodyHtml: "<p>Nội dung tài liệu Gamma không được phép ghi đè sau khi phiên nhập đã bị hủy.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký Gamma",
    recipients: "Như trên;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  });

  const fileAPath = path.join(tempDir, "Synthetic_Alpha.docx");
  const fileBPath = path.join(tempDir, "Synthetic_Beta.docx");
  const fileGammaPath = path.join(tempDir, "Synthetic_Gamma.docx");
  const invalidBPath = path.join(tempDir, "Corrupted_Beta.docx");

  fs.writeFileSync(fileAPath, docxBufA);
  fs.writeFileSync(fileBPath, docxBufB);
  fs.writeFileSync(fileGammaPath, docxBufGamma);
  fs.writeFileSync(invalidBPath, Buffer.from([0x50, 0x4b, 0x00, 0x01, 0xff, 0xfe]));

  const serverProc = await startTestServer(serverPort);
  const client = new CdpClient();

  try {
    await client.launch(cdpPort);

    // Register new-document script to intercept delayed initial loadDraft() when __delay_draft_load === "1"
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const origGet = IDBObjectStore.prototype.get;
        window.__pendingDraftGetCallbacks = [];
        IDBObjectStore.prototype.get = function(key) {
          const req = origGet.apply(this, arguments);
          if (key === "current_active_draft" && window.localStorage.getItem("__delay_draft_load") === "1") {
            window.localStorage.removeItem("__delay_draft_load");
            let heldOnSuccess = null;
            let realEvent = null;
            let released = false;
            Object.defineProperty(req, "onsuccess", {
              configurable: true,
              get() { return heldOnSuccess; },
              set(fn) {
                heldOnSuccess = fn;
                if (released && realEvent && heldOnSuccess) {
                  heldOnSuccess.call(req, realEvent);
                }
              }
            });
            req.addEventListener("success", (ev) => {
              ev.stopImmediatePropagation();
              realEvent = ev;
              window.__pendingDraftGetCallbacks.push(() => {
                released = true;
                if (heldOnSuccess) {
                  heldOnSuccess.call(req, realEvent);
                }
              });
            }, true);
          }
          return req;
        };
      })()`,
    });

    await client.navigate(`http://127.0.0.1:${serverPort}/`);

    // 0. Seed IndexedDB with a stale Party draft, set __delay_draft_load = "1", and reload to test late loadDraft() race
    await client.evaluate(`(async () => {
      await new Promise((resolve, reject) => {
        const openReq = window.indexedDB.open("DocForm30_DB", 3);
        openReq.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
          if (!db.objectStoreNames.contains("source_blobs")) db.createObjectStore("source_blobs", { keyPath: "hash" });
          if (!db.objectStoreNames.contains("session_index")) db.createObjectStore("session_index", { keyPath: "id" });
          if (!db.objectStoreNames.contains("app_meta")) db.createObjectStore("app_meta", { keyPath: "key" });
        };
        openReq.onerror = () => reject(openReq.error || new Error("Failed to open IndexedDB"));
        openReq.onsuccess = () => {
          const db = openReq.result;
          const tx = db.transaction(["drafts"], "readwrite");
          tx.objectStore("drafts").put({
            schemaVersion: 2,
            id: "current_active_draft",
            updatedAt: new Date().toISOString(),
            standardType: "party",
            doc: {
              headerProfile: "generic",
              orgHeader1: "ĐẢNG BỘ CẤP TRÊN CŨ",
              orgHeader2: "ĐẢNG ỦY NHÁP CŨ",
              nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
              nationalHeader2: "",
              locationAndDate: "Hải Phòng, ngày 01 tháng 01 năm 2026",
              documentType: "NGHỊ QUYẾT",
              referenceNumber: "Số 99-NQ/ĐU",
              subject: "TRÍCH_YẾU_NHÁP_CŨ_TRỄ_TỪ_INDEXEDDB",
              bodyHtml: "<p>Nội dung bản nháp cũ trễ không được phép ghi đè tài liệu mới.</p>",
              signTitle: "BÍ THƯ",
              signName: "Người Ký Nháp Cũ",
              recipients: "Lưu VPĐU."
            },
            versions: [],
            originalSnapshot: {
              sourceType: "uploaded_file",
              fileName: "Stale_Draft_From_IDB.docx",
              fileType: "docx",
              sourceHash: "stale_hash_from_idb",
              uploadedAt: new Date().toISOString(),
              bodyHtml: "<p>Nội dung bản nháp cũ trễ</p>",
              rawText: "Nội dung bản nháp cũ trễ"
            },
            uploadedFileName: "Stale_Draft_From_IDB.docx",
            uploadedFileType: "docx",
            rawText: "Nội dung bản nháp cũ trễ"
          });
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => reject(tx.error);
        };
      });
      window.localStorage.setItem("__delay_draft_load", "1");
    })()`);

    // Reload page so initial loadDraft() is intercepted and paused
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    const draftLoadPaused = await client.waitForFunction(
      `Array.isArray(window.__pendingDraftGetCallbacks) && window.__pendingDraftGetCallbacks.length === 1`,
      5000
    );
    assert.ok(draftLoadPaused, "Initial loadDraft() from IndexedDB must be intercepted and paused on mount");

    // Install controlled fetch interceptor for AI endpoints AND controlled Blob.prototype.arrayBuffer delay for file uploads
    await client.evaluate(`(() => {
      const origFetch = window.fetch.bind(window);
      window.__pendingAiMocks = [];
      window.__abortedAiCount = 0;
      const makePartitionResponse = (body, data) => {
        const sourceBlocks = Array.isArray(body.blocks) ? body.blocks : [];
        const inputProposal = Array.isArray(data.proposals) && data.proposals.length
          ? data.proposals[0]
          : (data.notice ? { reason: data.notice, suggestedRole: "appendix" } : null);
        let proposal = null;
        if (inputProposal && sourceBlocks.length) {
          const target = sourceBlocks.find(block => block.kind !== "table" && block.text.trim()) || sourceBlocks[0];
          let exactQuote = target.text.trim();
          let cellLocation;
          if (target.kind === "table") {
            const cell = (target.cells || []).find(candidate => candidate.text.trim());
            if (cell) {
              exactQuote = cell.text.trim();
              cellLocation = { rowIndex: cell.rowIndex, colIndex: cell.colIndex, cellId: cell.cellId };
            }
          }
          if (exactQuote) {
            proposal = {
              sourceBlockId: target.id,
              suggestedRole: inputProposal.suggestedRole || "appendix",
              exactQuote,
              reason: inputProposal.reason || "Synthetic delayed AI response.",
              confidence: inputProposal.confidence || "high",
              ...(cellLocation ? { cellLocation } : {}),
            };
          }
        }
        const chunks = [];
        for (let index = 0; index < sourceBlocks.length; index += 25) {
          const blockIds = sourceBlocks.slice(index, index + 25).map(block => block.id);
          chunks.push({
            chunkIndex: chunks.length,
            status: "completed",
            blockIds,
            proposals: index === 0 && proposal ? [proposal] : [],
          });
        }
        const ids = sourceBlocks.map(block => block.id);
        return {
          schemaVersion: 1,
          requestId: body.requestId,
          requestFingerprint: "0123456789abcdef",
          regime: body.regime,
          sourceGeneration: body.sourceGeneration,
          partitionRevision: body.partitionRevision,
          totalBlocks: ids.length,
          aiReviewedBlockIds: ids,
          failedBlockIds: [],
          chunks,
          model: "synthetic-browser-mock",
        };
      };

      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/ai/check-partitions") || url.includes("/api/ai/review-document")) {
          const signal = init && init.signal;
          return new Promise((resolve, reject) => {
            const entry = {
              url,
              body: init && init.body ? JSON.parse(init.body) : {},
              aborted: false,
              resolveJson: (data) => {
                const responseData = url.includes("/api/ai/check-partitions")
                  ? makePartitionResponse(entry.body, data)
                  : data;
                resolve(new Response(JSON.stringify(responseData), {
                  status: 200,
                  headers: { "Content-Type": "application/json" }
                }));
              },
              rejectErr: (msg) => {
                reject(new Error(msg || "Mock network failure"));
              }
            };
            if (signal) {
              if (signal.aborted) {
                entry.aborted = true;
                window.__abortedAiCount++;
              } else {
                signal.addEventListener("abort", () => {
                  entry.aborted = true;
                  window.__abortedAiCount++;
                });
              }
            }
            window.__pendingAiMocks.push(entry);
          });
        }
        return origFetch(input, init);
      };

      const origArrayBuffer = Blob.prototype.arrayBuffer;
      window.__delayFileParse = false;
      window.__pendingParseResolvers = [];
      Blob.prototype.arrayBuffer = function(...args) {
        const p = origArrayBuffer.apply(this, args);
        if (window.__delayFileParse) {
          return new Promise((resolve, reject) => {
            p.then((buf) => {
              window.__pendingParseResolvers.push(() => resolve(buf));
            }, reject);
          });
        }
        return p;
      };
    })()`);

    // Chặng 3: nguồn được tải ngay tại Bước 1 "Tải & nhận diện"; loadDraft() vẫn đang chờ.
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000),
      "Step 1 (Tải & nhận diện) mounted while loadDraft() is pending",
    );

    // 1. Upload Synthetic_Alpha.docx BEFORE loadDraft() resolves
    await client.uploadFile('input[type="file"]', fileAPath);
    const modalOpenedA = await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên") && document.body.textContent.includes("Synthetic_Alpha.docx")`,
      10000
    );
    assert.ok(modalOpenedA, "Side-by-side modal should open for Synthetic_Alpha.docx");

    // Now release the delayed initial loadDraft() response ("Stale_Draft_From_IDB.docx", regime="party")
    await client.evaluate(`(() => {
      if (window.__pendingDraftGetCallbacks && window.__pendingDraftGetCallbacks[0]) {
        window.__pendingDraftGetCallbacks[0]();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 300));

    const afterLateDraftLoad = await client.evaluate<{
      hasStaleDraftFile: boolean;
      hasStaleSubject: boolean;
      stillAlpha: boolean;
    }>(`({
      hasStaleDraftFile: document.body.textContent.includes("Stale_Draft_From_IDB.docx"),
      hasStaleSubject: document.body.textContent.includes("TRÍCH_YẾU_NHÁP_CŨ_TRỄ_TỪ_INDEXEDDB"),
      stillAlpha: document.body.textContent.includes("Synthetic_Alpha.docx")
    })`);
    assert.equal(afterLateDraftLoad.hasStaleDraftFile, false, "Late loadDraft() must NOT overwrite uploaded filename with Stale_Draft_From_IDB.docx");
    assert.equal(afterLateDraftLoad.hasStaleSubject, false, "Late loadDraft() must NOT overwrite document content");
    assert.equal(afterLateDraftLoad.stillAlpha, true, "Active document must remain Synthetic_Alpha.docx after late loadDraft()");

    // 2. Explicitly opt in (required by Stage 4); that starts partition check #1.
    // Edit a block role while it waits, then start check #2 for the new revision.
    await client.evaluate(`(() => {
      const consent = document.querySelector('[data-testid="ai-partition-consent"]');
      if (consent && !consent.checked) consent.click();
    })()`);
    await client.waitForFunction(`window.__pendingAiMocks.length === 1`, 5000);

    // Edit the first block manually while AI request #1 is pending.
    await client.evaluate(`(() => {
      const sel = document.querySelector("select");
      if (sel) {
        sel.value = "metadata";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`);

    // Verify request #1 was aborted and spinner was turned off by role edit
    const req1Aborted = await client.waitForFunction(
      `window.__pendingAiMocks[0].aborted === true && !document.body.textContent.includes("AI Đang Rà Soát...")`,
      5000
    );
    assert.ok(req1Aborted, "Manual role edit must abort in-flight AI partition request #1");

    // Now start AI partition request #2 on A
    await client.clickByText("button", "AI Kiểm Tra Phân Vùng");
    await client.waitForFunction(`window.__pendingAiMocks.length === 2`, 5000);
    const isSpinnerActiveForReq2 = await client.evaluate<boolean>(
      `document.body.textContent.includes("AI Đang Rà Soát...")`
    );
    assert.equal(isSpinnerActiveForReq2, true, "Request #2 must own the loading spinner");

    // Now resolve stale request #1 LATE with a fake proposal AND ensure it neither displays its proposal nor turns off request #2's spinner
    await client.evaluate(`(() => {
      window.__pendingAiMocks[0].resolveJson({
        success: true,
        source: "gemini_ai",
        totalBlocks: 5,
        reviewedBlocksCount: 5,
        unreviewedBlocksCount: 0,
        notice: "STALE_NOTICE_FROM_REQ_1",
        proposals: [{
          id: "stale-prop-req-1",
          sourceBlockId: "block-0",
          currentRole: "header",
          suggestedRole: "appendix",
          exactQuote: "ALPHA",
          reason: "Lý do cũ từ request 1",
          confidence: "high",
          status: "pending",
          regime: "administrative"
        }]
      });
    })()`);
    await new Promise((r) => setTimeout(r, 250));

    const afterStaleReq1 = await client.evaluate<{ spinnerStillOn: boolean; hasStaleText: boolean }>(`({
      spinnerStillOn: document.body.textContent.includes("AI Đang Rà Soát..."),
      hasStaleText: document.body.textContent.includes("STALE_NOTICE_FROM_REQ_1") || document.body.textContent.includes("Lý do cũ từ request 1")
    })`);
    assert.equal(afterStaleReq1.spinnerStillOn, true, "Stale request #1 finally block must NOT turn off request #2's spinner");
    assert.equal(afterStaleReq1.hasStaleText, false, "Stale request #1 response must NOT render");

    // Also start a delayed AI document review request on A ("Rà soát AI (Gemini)")
    await client.clickByText("button", "Rà soát AI (Gemini)");
    await client.waitForFunction(`window.__pendingAiMocks.length === 3`, 5000);

    // 3. Close modal and attempt to upload Corrupted_Beta.docx (invalid B)
    await client.evaluate(`(() => {
      const modalTitle = Array.from(document.querySelectorAll("h2")).find(h => h.textContent && h.textContent.includes("Đối Chiếu & Phân Vùng"));
      if (modalTitle) {
        const header = modalTitle.closest("div.bg-slate-50");
        const btns = header ? Array.from(header.querySelectorAll("button")) : [];
        const closeX = btns[btns.length - 1];
        if (closeX) closeX.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Upload Corrupted_Beta.docx
    await client.uploadFile('input[type="file"]', invalidBPath);
    await new Promise((r) => setTimeout(r, 400));

    // Verify error message is shown AND Synthetic_Alpha.docx remains the active document
    const stateAfterInvalidB = await client.evaluate<{
      hasError: boolean;
      stillShowsAlpha: boolean;
    }>(`({
      hasError: document.body.textContent.includes("không đúng định dạng") || document.body.textContent.includes("hỏng"),
      stillShowsAlpha: document.body.textContent.includes("Synthetic_Alpha.docx")
    })`);
    assert.equal(stateAfterInvalidB.hasError, true, "Invalid B must show parse error");
    assert.equal(stateAfterInvalidB.stillShowsAlpha, true, "Active document must still be Synthetic_Alpha.docx after invalid B fails");

    // Check Step 4 "Tải tệp gốc" link still points to Alpha.
    // S3-F01 (tái audit 20/10/2026): bản nhập CHƯA ĐƯỢC DUYỆT (hộp thoại
    // đối chiếu đã bị đóng bằng nút X) thì Bước 3 và nút xuất phải bị chặn.
    const exportBlockedBeforeApproval = await client.evaluate<{ step3Allowed: string | null }>(`(() => {
      const btn = document.querySelector('[data-step="3"]');
      return { step3Allowed: btn ? btn.getAttribute('data-step-allowed') : null };
    })()`);
    assert.equal(
      exportBlockedBeforeApproval.step3Allowed,
      "false",
      "Bước 3 phải bị chặn khi bản nhập chưa được người dùng duyệt"
    );

    // Duyệt lại bản nhập A (mở lại hộp thoại đối chiếu → Đồng ý đưa vào Studio)
    await client.clickByText("button", "Đối chiếu nguồn");
    const reviewReopened = await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      5000
    );
    assert.ok(reviewReopened, "Hộp thoại đối chiếu nguồn phải mở lại được");
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 500));

    await client.clickByText("button", "Xuất");
    await client.waitForFunction(`document.body.textContent.includes("Xuất tài liệu")`, 5000);
    // Original download belongs to source review; export compare tabs have no separate download.
    await client.clickByText("button", "1. Tải & nhận diện");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`,5000);
    const step4AfterInvalidB = await client.evaluate<{ hasAlphaSource: boolean; hasDownloadBtn: boolean }>(`({
      hasAlphaSource: document.body.textContent.includes("Synthetic_Alpha.docx"),
      hasDownloadBtn: Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Tải tệp gốc"))
    })`);
    assert.equal(step4AfterInvalidB.hasDownloadBtn, true, "Download original button for Alpha must remain available after invalid B");

    // 4. Return to Step 1 and upload valid Synthetic_Beta.docx (A -> B transition while A's AI requests #2 and #3 were pending)
    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);
    await client.uploadFile('input[type="file"]', fileBPath);

    const modalOpenedB = await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên") && document.body.textContent.includes("Synthetic_Beta.docx")`,
      10000
    );
    assert.ok(modalOpenedB, "Side-by-side modal must open for Synthetic_Beta.docx");

    // Start BOTH AI partition check (#4) and AI review (#5) on B BEFORE resolving A's pending requests (#2 and #3)
    await client.clickByText("button", "AI Kiểm Tra Phân Vùng");
    await client.waitForFunction(`window.__pendingAiMocks.length === 4`, 5000);
    await client.clickByText("button", "Rà soát AI (Gemini)");
    await client.waitForFunction(`window.__pendingAiMocks.length === 5`, 5000);

    const spinnersBeforeLateA = await client.evaluate<{ partSpinner: boolean; revSpinner: boolean }>(`({
      partSpinner: document.body.textContent.includes("AI Đang Rà Soát..."),
      revSpinner: document.body.textContent.includes("Đang phân tích...") || document.body.textContent.includes("Đang đối chiếu quy tắc NĐ 30")
    })`);
    assert.equal(spinnersBeforeLateA.partSpinner, true, "B's partition AI spinner must be active");
    assert.equal(spinnersBeforeLateA.revSpinner, true, "B's review AI spinner must be active");

    // Now resolve A's pending partition check (#2, index 1) and document review (#3, index 2) WHILE B's AI requests are actively running
    await client.evaluate(`(() => {
      window.__pendingAiMocks[1].resolveJson({
        success: true,
        source: "gemini_ai",
        totalBlocks: 5,
        reviewedBlocksCount: 5,
        unreviewedBlocksCount: 0,
        notice: "LATE_PARTITION_FROM_ALPHA",
        proposals: [{
          id: "late-alpha-part",
          sourceBlockId: "block-0",
          currentRole: "header",
          suggestedRole: "signature",
          exactQuote: "ALPHA",
          reason: "Đề xuất muộn của Alpha",
          confidence: "high",
          status: "pending",
          regime: "administrative"
        }]
      });
      window.__pendingAiMocks[2].resolveJson({
        success: true,
        proposals: [{
          id: "late-alpha-review",
          type: "spelling",
          target: "bodyHtml",
          label: "Đề xuất rà soát muộn của Alpha",
          original: "Alpha",
          suggested: "Alpha-Edited",
          reason: "LATE_REVIEW_REASON_FROM_ALPHA",
          confidence: "high",
          source: "gemini_ai"
        }]
      });
    })()`);
    await new Promise((r) => setTimeout(r, 300));

    const leakedFromAIntoB = await client.evaluate<{
      hasAlphaPart: boolean;
      hasAlphaRev: boolean;
      hasUndoHistoryFromA: boolean;
      partSpinnerStillOn: boolean;
      revSpinnerStillOn: boolean;
    }>(`({
      hasAlphaPart: document.body.textContent.includes("LATE_PARTITION_FROM_ALPHA") || document.body.textContent.includes("Đề xuất muộn của Alpha"),
      hasAlphaRev: document.body.textContent.includes("LATE_REVIEW_REASON_FROM_ALPHA") || document.body.textContent.includes("Đề xuất rà soát muộn của Alpha"),
      hasUndoHistoryFromA: document.body.textContent.includes("Hoàn tác ("),
      partSpinnerStillOn: document.body.textContent.includes("AI Đang Rà Soát..."),
      revSpinnerStillOn: document.body.textContent.includes("Đang phân tích...") || document.body.textContent.includes("Đang đối chiếu quy tắc NĐ 30")
    })`);
    assert.equal(leakedFromAIntoB.hasAlphaPart, false, "Late partition response from A must not appear in B");
    assert.equal(leakedFromAIntoB.hasAlphaRev, false, "Late review response from A must not overwrite B's proposals");
    assert.equal(leakedFromAIntoB.hasUndoHistoryFromA, false, "Partition history from A must not carry over to B");
    assert.equal(leakedFromAIntoB.partSpinnerStillOn, true, "Late A partition finally must NOT turn off B's active partition spinner");
    assert.equal(leakedFromAIntoB.revSpinnerStillOn, true, "Late A review finally must NOT turn off B's active review spinner");

    // Resolve B's review request (#5, index 4) and verify B's review proposal renders and its spinner turns off
    await client.evaluate(`(() => {
      window.__pendingAiMocks[4].resolveJson({
        success: true,
        proposals: [{
          id: "valid-beta-review",
          type: "format",
          target: "referenceNumber",
          label: "Đề xuất hợp lệ của Beta",
          original: "Số: 202/QĐ-BETA",
          suggested: "Số: 202/QĐ-BETA",
          reason: "VALID_REVIEW_REASON_FOR_BETA",
          confidence: "high",
          source: "gemini_ai"
        }]
      });
    })()`);
    await new Promise((r) => setTimeout(r, 250));
    const betaReviewRendered = await client.evaluate<{ hasBetaRev: boolean; revSpinnerOff: boolean }>(`({
      hasBetaRev: document.body.textContent.includes("VALID_REVIEW_REASON_FOR_BETA"),
      revSpinnerOff: !document.body.textContent.includes("Đang phân tích...")
    })`);
    assert.equal(betaReviewRendered.hasBetaRev, true, "B's valid review proposal must render");
    assert.equal(betaReviewRendered.revSpinnerOff, true, "B's review spinner must turn off when B's review finishes");

    // 5. While B's partition check (#4, index 3) is still waiting, close modal, go to Step 1 and switch regime to Party (HD 05)
    await client.evaluate(`(() => {
      const modalTitle = Array.from(document.querySelectorAll("h2")).find(h => h.textContent && h.textContent.includes("Đối Chiếu & Phân Vùng"));
      if (modalTitle) {
        const header = modalTitle.closest("div.bg-slate-50");
        const btns = header ? Array.from(header.querySelectorAll("button")) : [];
        const closeX = btns[btns.length - 1];
        if (closeX) closeX.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 150));

    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.body.textContent.includes("Hệ thể thức")`, 5000);
    await client.clickByText("button", "Văn bản Đảng");
    await new Promise((r) => setTimeout(r, 200));
    await client.clickByText("button", "Xác Nhận Chuyển Đổi");
    await new Promise((r) => setTimeout(r, 200));

    // Resolve B's pre-regime-switch AI request (#4, index 3) late
    await client.evaluate(`(() => {
      window.__pendingAiMocks[3].resolveJson({
        success: true,
        source: "gemini_ai",
        totalBlocks: 5,
        reviewedBlocksCount: 5,
        unreviewedBlocksCount: 0,
        notice: "STALE_PRE_REGIME_SWITCH_NOTICE",
        proposals: []
      });
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const hasPreRegimeNotice = await client.evaluate<boolean>(
      `document.body.textContent.includes("STALE_PRE_REGIME_SWITCH_NOTICE")`
    );
    assert.equal(hasPreRegimeNotice, false, "AI response from before regime switch must be ignored");

    // 6. Test delayed parseLocalFile + regime switch while upload is pending (Issue 1)
    // First switch back to State ("Văn bản hành chính") so we start Gamma upload under "state" regime
    await client.clickByText("button", "Văn bản hành chính");
    await new Promise((r) => setTimeout(r, 200));
    await client.clickByText("button", "Xác Nhận Chuyển Đổi");
    await new Promise((r) => setTimeout(r, 200));

    // Already on Step 1 (Tải & nhận diện): enable __delayFileParse, start uploading Synthetic_Gamma.docx under "state" regime
    await client.evaluate(`(() => { window.__delayFileParse = true; })()`);
    await client.uploadFile('input[type="file"]', fileGammaPath);

    const gammaParsePaused = await client.waitForFunction(
      `window.__pendingParseResolvers.length === 1`,
      5000
    );
    assert.ok(gammaParsePaused, "Synthetic_Gamma.docx parse must be paused in flight");

    const replaceBtnDisabledDuringUpload = await client.evaluate<boolean>(
      `Boolean(Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Thay tệp"))?.disabled)`
    );
    assert.equal(replaceBtnDisabledDuringUpload, true, "isUploading must be true while Gamma is parsing");

    // While Gamma is parsing under "state" regime, stay on Step 1 ("Tải") and switch regime to "party" ("Văn bản Đảng")
    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.body.textContent.includes("Hệ thể thức")`, 5000);
    await client.clickByText("button", "Văn bản Đảng");
    await new Promise((r) => setTimeout(r, 200));
    await client.clickByText("button", "Xác Nhận Chuyển Đổi");
    await new Promise((r) => setTimeout(r, 200));

    // Verify isUploading spinner was immediately cleared by regime switch (still on Step 1)
    const replaceBtnEnabledAfterRegimeSwitch = await client.evaluate<boolean>(
      `Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Thay tệp"))?.disabled === false`
    );
    assert.equal(
      replaceBtnEnabledAfterRegimeSwitch,
      true,
      "Switching regime while upload is pending must immediately clear isUploading spinner"
    );

    // Now release Gamma's delayed parse (which was started under "state") and verify it does NOT commit or overwrite the new "party" regime or Beta document
    await client.evaluate(`(() => {
      window.__delayFileParse = false;
      const fn = window.__pendingParseResolvers.shift();
      if (fn) fn();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    // Check Step 1 regime button state in DOM to confirm "Văn bản Đảng" is STILL active (not overwritten back to "state" by Gamma)
    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.body.textContent.includes("Hệ thể thức")`, 5000);
    const partyPressedAfterGamma = await client.evaluate<boolean>(
      `Boolean(Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Văn bản Đảng"))?.getAttribute("aria-pressed") === "true")`
    );
    assert.equal(partyPressedAfterGamma, true, "Active regime must remain 'party' after late Gamma upload (started in 'state') finishes");

    // Check Step 2 (Soạn & kiểm tra) to confirm Beta is still the active document and source file
    await client.clickByText("button", "Soạn");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="2"]') !== null`, 5000);
    const afterDelayedGammaRegimeSwitch = await client.evaluate<{
      hasGamma: boolean;
      stillBeta: boolean;
      isStillUploading: boolean;
    }>(`(() => {
      const hasGamma = document.body.textContent.includes("Synthetic_Gamma.docx") || document.body.textContent.includes("303/TB-GAMMA");
      const stillBeta = document.body.textContent.includes("Synthetic_Beta.docx");
      const isStillUploading = Boolean(Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Thay tệp"))?.disabled);
      return { hasGamma, stillBeta, isStillUploading };
    })()`);
    assert.equal(afterDelayedGammaRegimeSwitch.hasGamma, false, "Cancelled upload Gamma must NOT commit after regime switch");
    assert.equal(afterDelayedGammaRegimeSwitch.stillBeta, true, "Active document must remain Synthetic_Beta.docx");
    assert.equal(afterDelayedGammaRegimeSwitch.isStillUploading, false, "isUploading must remain false after cancelled upload finishes");

    // 7. Test delayed parseLocalFile + version restore while upload is pending (Issue 2: spinner cleanup)
    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);
    await client.evaluate(`(() => { window.__delayFileParse = true; })()`);
    await client.uploadFile('input[type="file"]', fileGammaPath);
    await client.waitForFunction(`window.__pendingParseResolvers.length === 1`, 5000);

    // Open AdvancedDrawer ("Công cụ") while upload is pending and restore a saved version
    await client.clickByText("button", "Công cụ");
    await client.waitForFunction(`document.body.textContent.includes("Lịch sử phiên bản")`, 5000);
    await client.clickByText("button", "Khôi phục");
    await new Promise((r) => setTimeout(r, 250));

    // Close AdvancedDrawer if still open
    await client.evaluate(`(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        const closeBtn = dlg.querySelector('button[aria-label="Đóng bảng công cụ"]');
        if (closeBtn) closeBtn.click();
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Verify isUploading is immediately false on Step 2 (not stuck in "Đang đọc tài liệu…")
    const isStuckUploadingAfterRestore = await client.evaluate<boolean>(
      `document.body.textContent.includes("Đang đọc tài liệu") || Boolean(Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Thay tệp"))?.disabled)`
    );
    assert.equal(
      isStuckUploadingAfterRestore,
      false,
      "Restoring a version while upload is pending must immediately clear isUploading (never stuck)"
    );

    // Release Gamma's second delayed parse and verify it does NOT commit over the restored version
    await client.evaluate(`(() => {
      window.__delayFileParse = false;
      const fn = window.__pendingParseResolvers.shift();
      if (fn) fn();
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const hasGammaAfterRestore = await client.evaluate<boolean>(
      `document.body.textContent.includes("Synthetic_Gamma.docx") || document.body.textContent.includes("303/TB-GAMMA")`
    );
    assert.equal(hasGammaAfterRestore, false, "Delayed upload must NOT overwrite restored version");

    // 8. Select a Template on Step 1 -> verify no old uploaded blocks or "Tải tệp gốc" link remain
    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);
    await client.clickByText("button", "Dùng mẫu");
    await new Promise((r) => setTimeout(r, 200));
    await client.clickByText("button", "Đổi mẫu");
    await new Promise((r) => setTimeout(r, 300));

    // Navigate to the export step and verify "Tải tệp gốc" button is NOT present for a template
    await client.clickByText("button", "Xuất");
    await client.waitForFunction(`document.body.textContent.includes("Xuất tài liệu")`, 5000);
    const hasDownloadOriginalOnTemplate = await client.evaluate<boolean>(
      `Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Tải tệp gốc"))`
    );
    assert.equal(
      hasDownloadOriginalOnTemplate,
      false,
      "After switching to a template, 'Tải tệp gốc' from uploaded file B must NOT remain visible"
    );
  } finally {
    client.close();
    serverProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
