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
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: any) => void>();
  public downloadDir: string;
  private userDataDir: string;

  constructor() {
    this.downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-s01-dl-"));
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-s01-profile-"));
  }

  async launch(port = 9566): Promise<void> {
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
        } catch {}
      };
    });

    await this.send("Page.enable");
    await this.send("DOM.enable");
    await this.send("Runtime.enable");
  }

  async send(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pendingCallbacks.set(id, resolve);
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await this.waitForFunction(`document.readyState === "complete"`, 15000);
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.result?.exceptionDetails) {
      const desc = res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text;
      throw new Error(`CDP evaluate error: ${desc}`);
    }
    return res?.result?.result?.value as T;
  }

  async waitForFunction(expression: string, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.evaluate(`Boolean(${expression})`);
        if (val) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`waitForFunction timed out after ${timeoutMs}ms for: ${expression}`);
  }

  async clickByText(selector: string, text: string): Promise<boolean> {
    return this.evaluate<boolean>(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const match = els.find(el => el.textContent && el.textContent.includes(${JSON.stringify(text)}));
      if (match) {
        match.scrollIntoView();
        match.click();
        return true;
      }
      return false;
    })()`);
  }

  async uploadFile(selector: string, filePath: string): Promise<void> {
    const docRes = await this.send("DOM.getDocument");
    const rootNodeId = docRes.result.root.nodeId;
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
      this.proc?.kill();
    } catch {}
    try {
      fs.rmSync(this.userDataDir, { recursive: true, force: true });
      fs.rmSync(this.downloadDir, { recursive: true, force: true });
    } catch {}
  }
}

test("Chặng 1 S01: AI review proposals completed under NĐ 30 (state) must NOT be visible or applicable after switching to HD 05 (party)", async () => {
  const serverPort = 5066;
  const cdpPort = 9566;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-s01-docx-"));

  const docxBufAlpha = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM S01",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 101/KH-S01",
    subject: "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
    bodyHtml: "<p>Điều 1. Nội dung văn bản kiểm định S01.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký S01",
    recipients: "Như Điều 1;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  });

  const fileAlphaPath = path.join(tempDir, "Synthetic_Alpha_S01.docx");
  fs.writeFileSync(fileAlphaPath, docxBufAlpha);

  const serverProc = await startTestServer(serverPort);
  const client = new CdpClient();

  try {
    await client.launch(cdpPort);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000);

    // Install mock fetch for AI review proposal
    await client.evaluate(`(() => {
      const origFetch = window.fetch.bind(window);
      window.__aiReviewCalledCount = 0;
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/ai/review-document")) {
          window.__aiReviewCalledCount++;
          return Promise.resolve(new Response(JSON.stringify({
            success: true,
            proposals: [
              {
                id: "s01-proposal-subject-state",
                type: "format",
                target: "subject",
                label: "S01_ND30_SUBJECT_PROPOSAL",
                original: "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
                suggested: "V/v đề xuất sửa subject theo chuẩn NĐ 30",
                reason: "S01_ND30_SUBJECT_PROPOSAL",
                confidence: "high",
                source: "gemini_ai"
              }
            ]
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }));
        }
        return origFetch(input, init);
      };
    })()`);

    // Chặng 3: nguồn được tải ngay tại Bước 1 "Tải & nhận diện".
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);

    // Upload Synthetic_Alpha_S01.docx
    await client.uploadFile('input[type="file"]', fileAlphaPath);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên") && document.body.textContent.includes("Synthetic_Alpha_S01.docx")`,
      10000
    );

    // Click "Rà soát AI (Gemini)" to fetch proposals under "state" (NĐ 30)
    await client.clickByText("button", "Rà soát AI (Gemini)");
    await client.waitForFunction(
      `document.body.textContent.includes("S01_ND30_SUBJECT_PROPOSAL")`,
      10000
    );

    // Close the Side-by-Side review dialog (click "Hủy bỏ")
    await client.clickByText("button", "Hủy bỏ");
    await new Promise((r) => setTimeout(r, 300));

    // Chặng 3: vẫn đang ở Bước 1 "Tải & nhận diện"
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);

    // Switch regime from "state" (NĐ 30) to "party" (HD 05)
    await client.clickByText("button", "Văn bản Đảng");
    await new Promise((r) => setTimeout(r, 200));
    await client.clickByText("button", "Xác Nhận Chuyển Đổi");
    await new Promise((r) => setTimeout(r, 300));

    // Verify current regime is now "party"
    const isPartyActive = await client.evaluate<boolean>(
      `Boolean(Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Văn bản Đảng"))?.getAttribute("aria-pressed") === "true")`
    );
    assert.equal(isPartyActive, true, "Regime must be switched to 'party'");

    // Reopen "Đối chiếu nguồn" (vẫn ở Bước 1 sau khi chuyển hệ)
    await client.clickByText("button", "Đối chiếu nguồn");
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      5000
    );

    // Check whether the old NĐ 30 proposal is visible
    const oldProposalVisible = await client.evaluate<boolean>(
      `document.body.textContent.includes("S01_ND30_SUBJECT_PROPOSAL")`
    );

    // Attempt individual "Áp dụng" if button is found
    const appliedSingle = await client.evaluate<boolean>(`(() => {
      const card = Array.from(document.querySelectorAll("div.p-2.rounded-lg")).find(el => el.textContent && el.textContent.includes("S01_ND30_SUBJECT_PROPOSAL"));
      if (card) {
        const applyBtn = Array.from(card.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Áp dụng"));
        if (applyBtn) {
          applyBtn.click();
          return true;
        }
      }
      return false;
    })()`);

    // Attempt "Áp dụng tất cả" if present
    const appliedAll = await client.evaluate<boolean>(`(() => {
      const allBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Áp dụng tất cả"));
      if (allBtn) {
        allBtn.click();
        return true;
      }
      return false;
    })()`);

    await new Promise((r) => setTimeout(r, 300));

    const hasSuccessApplyToast = await client.evaluate<boolean>(
      `document.body.textContent.includes("Đã áp dụng thành công đề xuất")`
    );
    const hasModifiedSubjectInBody = await client.evaluate<boolean>(
      `document.body.textContent.includes("V/v đề xuất sửa subject theo chuẩn NĐ 30")`
    );

    // S01 Invariant 1: Old proposal from NĐ 30 MUST NOT be visible in Step 2 under HD 05
    assert.equal(
      oldProposalVisible,
      false,
      "Old NĐ 30 review proposal MUST NOT be visible after regime switched to HD 05 (party)"
    );

    // S01 Invariant 2: Apply single and Apply All buttons for stale proposals MUST NOT be present
    assert.equal(appliedSingle, false, "Individual Apply button must not be present for stale proposal");
    assert.equal(appliedAll, false, "Apply All button must not be present when proposals are invalid");
    assert.equal(hasSuccessApplyToast, false, "Success toast must not be triggered for stale proposals");
    assert.equal(hasModifiedSubjectInBody, false, "Subject must not be modified by stale NĐ 30 proposal under HD 05");

    // Cancel leaves the file pending in Workspace. Step 2 must stay locked, and
    // the old regime's proposal must not reappear or change the source fields.
    await client.clickByText("button", "Hủy bỏ");
    const pendingAfterCancel = await client.evaluate<any>(`(() => ({
      step: document.querySelector('[data-current-step]')?.getAttribute('data-current-step'),
      step2Allowed: document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed'),
      staleVisible: document.body.textContent?.includes('S01_ND30_SUBJECT_PROPOSAL') ?? false,
    }))()`);
    assert.equal(pendingAfterCancel.step, "1");
    assert.equal(pendingAfterCancel.step2Allowed, "false", "Unapproved import must lock editing");
    assert.equal(pendingAfterCancel.staleVisible, false, "Old proposal must remain hidden");

    // Wait 1200ms for auto-save debounce to commit to IndexedDB and assert IDB state
    await new Promise((r) => setTimeout(r, 1200));
    const idbState = await client.evaluate<any>(`new Promise((resolve) => {
      const r = indexedDB.open("DocForm30_DB", 3);
      r.onsuccess = () => {
        const db = r.result;
        try {
          const tx = db.transaction("drafts", "readonly");
          const store = tx.objectStore("drafts");
          const getReq = store.get("current_active_draft");
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      r.onerror = () => resolve(null);
    })`);
    assert.equal(idbState?.standardType, "party", "IDB standardType must be party");
    assert.equal(
      idbState?.doc?.subject,
      "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
      "IDB subject must remain untouched"
    );
    assert.equal(
      (idbState?.versions || []).some((v: any) => v.title && v.title.includes("Áp dụng đề xuất")),
      false,
      "Version history in IndexedDB must NOT record proposal application"
    );

    // S01 Invariant 4: Corrupted file B upload must NOT overwrite document A
    const invalidBPath = path.join(tempDir, "Corrupted_B.docx");
    fs.writeFileSync(invalidBPath, Buffer.from([0x50, 0x4b, 0x00, 0x01, 0xff, 0xfe]));

    await client.clickByText("button", "Tải");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);

    await client.uploadFile('input[type="file"]', invalidBPath);
    await new Promise((r) => setTimeout(r, 400));

    const stateAfterCorruptedB = await client.evaluate<{
      hasError: boolean;
      stillShowsAlpha: boolean;
    }>(`(() => {
      return {
        hasError: document.body.textContent.includes("Không thể đọc tệp") || document.body.textContent.includes("không đúng định dạng"),
        stillShowsAlpha: document.body.textContent.includes("Synthetic_Alpha_S01.docx"),
      };
    })()`);

    assert.equal(stateAfterCorruptedB.hasError, true, "Invalid file upload must display error");
    assert.equal(stateAfterCorruptedB.stillShowsAlpha, true, "Document A file reference must remain intact after corrupted upload B");

    // S3-F01 (tái audit 20/10/2026): bản nhập chưa được duyệt (hộp thoại đối
    // chiếu đã bị "Hủy bỏ") thì Bước 3 phải bị chặn.
    const exportBlockedBeforeApproval = await client.evaluate<{ step3Allowed: string | null }>(`(() => {
      const btn = document.querySelector('[data-step="3"]');
      return { step3Allowed: btn ? btn.getAttribute('data-step-allowed') : null };
    })()`);
    assert.equal(
      exportBlockedBeforeApproval.step3Allowed,
      "false",
      "Bước 3 phải bị chặn khi bản nhập chưa được người dùng duyệt"
    );

    // Duyệt lại bản nhập A rồi mới kiểm nút "Tải tệp gốc" vẫn trỏ về Alpha
    await client.clickByText("button", "Đối chiếu nguồn");
    const reviewReopened = await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      5000
    );
    assert.ok(reviewReopened, "Hộp thoại đối chiếu nguồn phải mở lại được");
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 500));

    // The original download belongs to Step 1 in Workspace.
    await client.clickByText('[data-step="1"]', "Tải");
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);
    const sourceAfterInvalidB = await client.evaluate<{ hasAlphaSource: boolean; hasDownloadBtn: boolean }>(`({
      hasAlphaSource: document.body.textContent.includes("Synthetic_Alpha_S01.docx"),
      hasDownloadBtn: Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Tải tệp gốc"))
    })`);
    assert.equal(sourceAfterInvalidB.hasAlphaSource, true, "Step 1 must still display Alpha as source file");
    assert.equal(sourceAfterInvalidB.hasDownloadBtn, true, "Download original button for Alpha must remain available");
  } finally {
    client.close();
    serverProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test("Chặng 1 S01: Partition role roundtrip A -> B -> A must permanently invalidate proposals and prevent application", async () => {
  const serverPort = 5067;
  const cdpPort = 9567;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-s01-roundtrip-"));

  const docxBufAlpha = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM S01",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 101/KH-S01",
    subject: "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
    bodyHtml: "<p>Điều 1. Nội dung văn bản kiểm định S01.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký S01",
    recipients: "Như Điều 1;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  });

  const fileAlphaPath = path.join(tempDir, "Synthetic_Alpha_S01.docx");
  fs.writeFileSync(fileAlphaPath, docxBufAlpha);

  const serverProc = await startTestServer(serverPort);
  const client = new CdpClient();

  try {
    await client.launch(cdpPort);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000);

    // Install mock fetch for AI review proposal
    await client.evaluate(`(() => {
      const origFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/ai/review-document")) {
          return Promise.resolve(new Response(JSON.stringify({
            success: true,
            proposals: [
              {
                id: "s01-proposal-roundtrip",
                type: "format",
                target: "subject",
                label: "S01_PROPOSAL_ROUNDTRIP",
                original: "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
                suggested: "V/v đề xuất sửa subject theo chuẩn NĐ 30",
                reason: "S01_PROPOSAL_ROUNDTRIP",
                confidence: "high",
                source: "gemini_ai"
              }
            ]
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }));
        }
        return origFetch(input, init);
      };
    })()`);

    // Navigate to Step 2
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);

    // Upload file
    await client.uploadFile('input[type="file"]', fileAlphaPath);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên") && document.body.textContent.includes("Synthetic_Alpha_S01.docx")`,
      10000
    );

    // Fetch AI proposals
    await client.clickByText("button", "Rà soát AI (Gemini)");
    await client.waitForFunction(
      `document.body.textContent.includes("S01_PROPOSAL_ROUNDTRIP")`,
      10000
    );

    // Verify proposal is initially visible
    const initialVisible = await client.evaluate<boolean>(
      `document.body.textContent.includes("S01_PROPOSAL_ROUNDTRIP")`
    );
    assert.equal(initialVisible, true, "Proposal should initially be visible");

    // Perform Partition Roundtrip:
    // Step A -> B: change block-0 role from 'header' to 'body'
    await client.evaluate(`(() => {
      const select = document.querySelector('select[data-block-id="block-0"]');
      if (select) {
        select.value = "body";
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Verify proposal is immediately hidden
    const hiddenAtB = await client.evaluate<boolean>(
      `document.body.textContent.includes("S01_PROPOSAL_ROUNDTRIP")`
    );
    assert.equal(hiddenAtB, false, "Proposal must be hidden when block role changed to body");

    // Step B -> A: change block-0 role back from 'body' to 'header'
    await client.evaluate(`(() => {
      const select = document.querySelector('select[data-block-id="block-0"]');
      if (select) {
        select.value = "header";
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    // Step B -> A completed: fingerprint is identical to initial, BUT partitionRevision is 3!
    const visibleAfterRoundtrip = await client.evaluate<boolean>(
      `document.body.textContent.includes("S01_PROPOSAL_ROUNDTRIP")`
    );
    assert.equal(
      visibleAfterRoundtrip,
      false,
      "Proposal must NOT resurrect after partition role roundtrip A -> B -> A"
    );

    // Check individual Apply button
    const hasApplyBtn = await client.evaluate<boolean>(`(() => {
      const card = Array.from(document.querySelectorAll("div.p-2.rounded-lg")).find(el => el.textContent && el.textContent.includes("S01_PROPOSAL_ROUNDTRIP"));
      if (card) {
        return Array.from(card.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Áp dụng"));
      }
      return false;
    })()`);
    assert.equal(hasApplyBtn, false, "Apply button must NOT be present for stale proposal");

    // Check Apply All button
    const hasApplyAllBtn = await client.evaluate<boolean>(`(() => {
      return Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Áp dụng tất cả"));
    })()`);
    assert.equal(hasApplyAllBtn, false, "Apply all button must NOT be present");

    // Check DOM state: partition revision & visible proposals count
    const domState = await client.evaluate<any>(`(() => {
      const modal = document.querySelector('[data-partition-revision]');
      const proposalCards = document.querySelectorAll('[data-proposal-id]');
      return {
        partitionRevision: modal ? Number(modal.getAttribute('data-partition-revision')) : 0,
        visibleProposalsCount: proposalCards.length,
      };
    })()`);
    assert.equal(domState.partitionRevision, 4, "partitionRevision in DOM must be 4 after roundtrip (1 -> 2 -> 3 -> 4)");
    assert.equal(domState.visibleProposalsCount, 0, "No proposals must be rendered in DOM");

    // A role roundtrip does not approve the imported source. Cancelling the
    // review must leave Step 2 locked and the original subject unchanged.
    await client.clickByText("button", "Hủy bỏ");
    const pendingAfterCancel = await client.evaluate<any>(`(() => ({
      step: document.querySelector('[data-current-step]')?.getAttribute('data-current-step'),
      step2Allowed: document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed'),
      staleVisible: document.body.textContent?.includes('S01_PROPOSAL_ROUNDTRIP') ?? false,
    }))()`);
    assert.equal(pendingAfterCancel.step, "1");
    assert.equal(pendingAfterCancel.step2Allowed, "false", "Unapproved import must lock editing");
    assert.equal(pendingAfterCancel.staleVisible, false, "Roundtrip must not resurrect a proposal");

    // Wait 1200ms and verify IDB state
    await new Promise((r) => setTimeout(r, 1200));
    const idbState = await client.evaluate<any>(`new Promise((resolve) => {
      const r = indexedDB.open("DocForm30_DB", 3);
      r.onsuccess = () => {
        const db = r.result;
        try {
          const tx = db.transaction("drafts", "readonly");
          const store = tx.objectStore("drafts");
          const getReq = store.get("current_active_draft");
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      r.onerror = () => resolve(null);
    })`);
    assert.equal(
      idbState?.doc?.subject,
      "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
      "IDB subject must remain untouched"
    );
    assert.equal(
      (idbState?.versions || []).some((v: any) => v.title && v.title.includes("Áp dụng đề xuất")),
      false,
      "No version in IndexedDB must be recorded for stale proposal"
    );
  } finally {
    client.close();
    serverProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test("Chặng 1 S01: Refreshing AI review failure preserves existing accepted proposals", async () => {
  const serverPort = 5068;
  const cdpPort = 9568;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-s01-refresh-"));

  const docxBufAlpha = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM S01",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 101/KH-S01",
    subject: "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
    bodyHtml: "<p>Điều 1. Nội dung văn bản kiểm định S01.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký S01",
    recipients: "Như Điều 1;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  });

  const fileAlphaPath = path.join(tempDir, "Synthetic_Alpha_S01.docx");
  fs.writeFileSync(fileAlphaPath, docxBufAlpha);

  const serverProc = await startTestServer(serverPort);
  const client = new CdpClient();

  try {
    await client.launch(cdpPort);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000);

    // Install mock fetch with stateful failure on second call
    await client.evaluate(`(() => {
      const origFetch = window.fetch.bind(window);
      window.__aiCallCount = 0;
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (url.includes("/api/ai/review-document")) {
          window.__aiCallCount++;
          if (window.__aiCallCount === 1) {
            return Promise.resolve(new Response(JSON.stringify({
              success: true,
              proposals: [
                {
                  id: "s01-prop-refresh-1",
                  type: "format",
                  target: "subject",
                  label: "S01_PROPOSAL_REFRESH_TEST",
                  original: "V/v Kiểm định an toàn đề xuất AI sau đổi thể thức S01",
                  suggested: "V/v đề xuất sửa subject theo chuẩn NĐ 30",
                  reason: "S01_PROPOSAL_REFRESH_TEST",
                  confidence: "high",
                  source: "gemini_ai"
                }
              ]
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }));
          } else {
            // Second call fails with network/server error
            return Promise.resolve(new Response(JSON.stringify({
              success: false,
              error: "AI server simulated 500 failure"
            }), {
              status: 500,
              headers: { "Content-Type": "application/json" }
            }));
          }
        }
        return origFetch(input, init);
      };
    })()`);

    // Navigate to Step 1 & Upload
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 5000);
    await client.uploadFile('input[type="file"]', fileAlphaPath);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên") && document.body.textContent.includes("Synthetic_Alpha_S01.docx")`,
      10000
    );

    // Initial AI Review
    await client.clickByText("button", "Rà soát AI (Gemini)");
    await client.waitForFunction(`document.body.textContent.includes("S01_PROPOSAL_REFRESH_TEST")`, 10000);

    // Applying a proposal while the source is pending updates the pending
    // draft. A new partition revision invalidates the old proposal card.
    await client.evaluate(`document.querySelector('[data-proposal-id="s01-prop-refresh-1"] button[title="Chấp nhận đề xuất này"]')?.click()`);
    await client.waitForFunction(
      'document.body.textContent.includes("Đã áp dụng thành công đề xuất")', 5000,
    );
    const readDraftSubject = () => client.evaluate<string>(`new Promise(resolve => {
      const request = indexedDB.open("DocForm30_DB", 3);
      request.onsuccess = () => {
        const get = request.result.transaction("drafts", "readonly").objectStore("drafts").get("current_active_draft");
        get.onsuccess = () => resolve(get.result?.doc?.subject ?? "");
        get.onerror = () => resolve("");
      };
      request.onerror = () => resolve("");
    })`);
    await client.waitForFunction('document.querySelector("[data-save-status]")?.getAttribute("data-save-status") === "Đã lưu"', 5000);
    const subjectBeforeRefresh = await readDraftSubject();
    assert.equal(subjectBeforeRefresh, "V/v đề xuất sửa subject theo chuẩn NĐ 30");

    // Click "Rà soát AI (Gemini)" again - this second call will fail with 500
    await client.clickByText("button", "Rà soát AI (Gemini)");
    await client.waitForFunction(
      `document.body.textContent.includes("Lỗi kết nối AI") || document.body.textContent.includes("500")`,
      5000
    );

    // A failed refresh must not undo an already applied pending-source edit.
    await client.waitForFunction('document.querySelector("[data-save-status]")?.getAttribute("data-save-status") === "Đã lưu"', 5000);
    assert.equal(await readDraftSubject(), subjectBeforeRefresh);
    assert.equal(await client.evaluate(`document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed')`), 'false');
  } finally {
    client.close();
    serverProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});
