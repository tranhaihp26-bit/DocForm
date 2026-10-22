import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

const SERVER_PORT = 5090;
const CDP_PORT = 9690;

function syntheticText(marker: "A" | "B"): string {
  const longEvidence = `Bằng chứng nguồn ${marker}_FULL_SOURCE_MARKER ${"văn bản tổng hợp đầy đủ ".repeat(35)}${marker}_END_SOURCE`;
  return [
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "Độc lập - Tự do - Hạnh phúc",
    "Số: 01/QĐ-CQ",
    "KẾ HOẠCH",
    "Về việc kiểm tra nguồn tổng hợp",
    longEvidence,
    ...Array.from({ length: 22 }, (_, index) => `Nội dung tổng hợp ${marker}-${index + 1}: tiếp tục kiểm tra công việc.`),
    "Nơi nhận:",
    "- Lưu: VT.",
  ].join("\n");
}

test("AI partition browser flow: opt-in route, role-free full source, partial coverage, stale A→B and same-bytes responses, apply and fallback", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage4-ai-browser-"));
  const fileA = path.join(tempDir, "synthetic-a.txt");
  const fileB = path.join(tempDir, "synthetic-b.txt");
  fs.writeFileSync(fileA, syntheticText("A"), "utf8");
  fs.writeFileSync(fileB, syntheticText("B"), "utf8");

  let serverProc: ChildProcess | null = null;
  const client = new CdpClient("docform-stage4-ai-browser");
  try {
    serverProc = await startTestServer(SERVER_PORT, { partitionAiMock: true });
    const routeRequest = {
      schemaVersion: 1,
      consent: false,
      requestId: "route-no-consent",
      regime: "administrative",
      sourceGeneration: 1,
      partitionRevision: 1,
      blocks: [{ id: "route-block", index: 0, kind: "paragraph", text: "Synthetic route source" }],
    };
    const consentDenied = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/ai/check-partitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(routeRequest),
    });
    assert.equal(consentDenied.status, 403, "Server must reject a request when consent is off");
    const roleRejected = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/ai/check-partitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...routeRequest,
        consent: true,
        requestId: "route-role-rejected",
        blocks: [{ ...routeRequest.blocks[0], role: "body" }],
      }),
    });
    assert.equal(roleRejected.status, 400, "Server must reject parser role before it reaches AI handling");
    const noKeyFallback = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/ai/check-partitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...routeRequest, consent: true, requestId: "route-no-key" }),
    });
    assert.equal(noKeyFallback.status, 503, "Missing AI configuration must return to the local rules path");

    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    assert.equal(
      await client.evaluate<boolean>(`document.querySelector('[data-testid="ai-partition-consent"]')?.checked`),
      false,
      "AI consent must default to off",
    );

    await client.evaluate(`(() => {
      window.__aiCalls = [];
      window.__aiPending = [];
      window.__aiMode = 'partial';
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        if (String(input).includes('/api/ai/check-partitions')) {
          const body = JSON.parse(String(init.body || '{}'));
          window.__aiCalls.push(body);
          if (window.__aiMode === 'defer') {
            return await new Promise(resolve => window.__aiPending.push({ input, init, resolve, mode: 'success' }));
          }
          const headers = new Headers(init.headers || {});
          headers.set('x-docform-test-ai-mode', window.__aiMode);
          return realFetch(input, { ...init, headers });
        }
        return realFetch(input, init);
      };
      window.__resolvePendingAi = async (index) => {
        const pending = window.__aiPending[index];
        if (!pending) return false;
        const headers = new Headers(pending.init.headers || {});
        headers.set('x-docform-test-ai-mode', pending.mode);
        // Let this synthetic late response arrive after the client has aborted its old request.
        const response = await realFetch(pending.input, { ...pending.init, headers, signal: undefined });
        pending.resolve(response);
        return true;
      };
    })()`);

    await client.uploadFile('input[aria-label="Chọn tệp Word hoặc văn bản"]', fileA);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source') === 'true'`, 20000));
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await client.evaluate<number>(`window.__aiCalls.length`), 0, "No AI request may run while consent is off");

    await client.evaluate(`(() => document.querySelector('[data-testid="ai-partition-consent"]').click())()`);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="ai-partition-progress"]')?.textContent.includes('1/2')`, 5000),
      "The client must display chunk progress before the final AI response arrives");
    assert.ok(await client.waitForFunction(`window.__aiCalls.length === 1 && document.querySelector('[data-testid="ai-partition-status"]')?.textContent.includes('AI đã kiểm tra')`, 15000));
    assert.equal(await client.evaluate<boolean>(`Boolean(document.querySelector('[data-testid="ai-partition-progress"]'))`), false,
      "Live progress should clear after the validated final response");

    const capturedRequest = await client.evaluate<any>(`window.__aiCalls[0]`);
    assert.equal(capturedRequest.consent, true);
    assert.equal(capturedRequest.regime, "administrative");
    assert.ok(capturedRequest.blocks.some((block: any) => block.text.includes("A_FULL_SOURCE_MARKER") && block.text.includes("A_END_SOURCE")));
    assert.ok(capturedRequest.blocks.find((block: any) => block.text.includes("A_FULL_SOURCE_MARKER")).text.length > 350);
    const forbiddenFields = await client.evaluate<string[]>(`(() => {
      const found = [];
      const walk = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (['role', 'currentRole', 'filename', 'html', 'rawXml', 'tableModel', 'tableShape', 'tableProperties'].includes(key)) found.push(key);
          walk(child);
        }
      };
      walk(window.__aiCalls[0]);
      return found;
    })()`);
    assert.deepEqual(forbiddenFields, [], "Payload must not contain parser roles, file names, markup or heavy table metadata");

    await client.clickByText("button", "Đối chiếu nguồn");
    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="ai-partition-coverage"]')?.textContent.includes('AI 25/')`, 4000));
    const requestedBlockCount = await client.evaluate<number>(`window.__aiCalls[0].blocks.length`);
    const coverageText = await client.evaluate<string>(`document.querySelector('[data-testid="ai-partition-coverage"]')?.textContent || ''`);
    assert.ok(requestedBlockCount > 25, "Synthetic source must exercise more than one server chunk");
    assert.ok(coverageText.includes(`AI 25/${requestedBlockCount} khối`), "Coverage must report the exact number of validated AI-reviewed blocks");
    assert.ok(coverageText.includes(`chưa AI ${requestedBlockCount - 25}`), "The failed chunk must remain outside AI-reviewed coverage");
    assert.ok(await client.evaluate<boolean>(`Boolean(document.querySelector('[data-testid="partition-proposal-block-5"][data-proposal-source="gemini_ai"]'))`),
      "The validated mock proposal should be labeled as Gemini AI");
    await client.clickByText("button", "AI Kiểm Tra Phân Vùng");
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(await client.evaluate<number>(`window.__aiCalls.length`), 1, "Repeated clicks on the same source generation must be deduplicated");

    const applyTarget = await client.evaluate<string>(`(() => {
      const card = Array.from(document.querySelectorAll('[data-proposal-source="gemini_ai"]'))
        .find(node => (node.textContent || '').includes('A_FULL_SOURCE_MARKER'));
      const button = card && Array.from(card.querySelectorAll('button')).find(node => node.textContent?.trim() === 'Áp dụng');
      button?.click();
      return card?.getAttribute('data-testid') || '';
    })()`);
    assert.equal(applyTarget, "partition-proposal-block-5", "The validated AI suggestion must be applicable by one explicit user action");

    await client.evaluate(`(() => document.querySelector('button[aria-label="Đóng hộp thoại đối chiếu nguồn"]')?.click())()`);
    await client.evaluate(`(() => {
      const consent = document.querySelector('[data-testid="ai-partition-consent"]');
      consent.click();
      window.__aiMode = 'defer';
      consent.click();
    })()`);
    assert.ok(await client.waitForFunction(`window.__aiCalls.length === 2 && window.__aiPending.length === 1`, 5000));

    await client.evaluate(`window.__aiMode = 'defer'`);
    await client.uploadFile('input[aria-label="Chọn tệp Word hoặc văn bản"]', fileB);
    assert.ok(await client.waitForFunction(`document.body.textContent.includes('B_FULL_SOURCE_MARKER') && window.__aiCalls.length === 3 && window.__aiPending.length === 2`, 20000));
    assert.ok(await client.evaluate<boolean>(`window.__aiCalls[2].blocks.some(block => block.text.includes('B_FULL_SOURCE_MARKER'))`));
    const bProgressBeforeStale = await client.evaluate<string>(`document.querySelector('[data-testid="ai-partition-progress"]')?.textContent || ''`);
    assert.ok(bProgressBeforeStale.includes("0/2"), "New source B should own the live progress while its AI response is pending");

    assert.equal(await client.evaluate<boolean>(`window.__resolvePendingAi(0)`), true);
    await new Promise(resolve => setTimeout(resolve, 900));
    const progressAfterStaleChunk = await client.evaluate<string>(`document.querySelector('[data-testid="ai-partition-progress"]')?.textContent || ''`);
    assert.equal(progressAfterStaleChunk, bProgressBeforeStale,
      "Late chunks from source A must not overwrite source B's live progress");
    assert.equal(await client.evaluate<boolean>(`document.body.textContent.includes('A_FULL_SOURCE_MARKER')`), false,
      "Late response from source A must not add a proposal to source B");
    assert.equal(await client.evaluate<boolean>(`document.body.textContent.includes('B_FULL_SOURCE_MARKER')`), true);

    assert.equal(await client.evaluate<boolean>(`window.__resolvePendingAi(1)`), true);
    assert.ok(await client.waitForFunction(`document.querySelector('[data-testid="ai-partition-status"]')?.textContent.includes('AI đã kiểm tra')`, 15000));

    await client.clickByText("button", "Đối chiếu nguồn");
    await client.evaluate(`(() => {
      const select = document.querySelector('select[data-block-id="block-5"]');
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setValue.call(select, 'metadata');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.ok(await client.waitForFunction(`document.querySelector('select[data-block-id="block-5"]')?.value === 'metadata'`, 3000),
      "The source B block should accept the user's first manual role change");
    await client.evaluate(`(() => {
      const select = document.querySelector('select[data-block-id="block-5"]');
      const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setValue.call(select, 'body');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.ok(await client.waitForFunction(`document.querySelector('select[data-block-id="block-5"]')?.value === 'body'`, 3000),
      "The source B block should accept the user's second manual role change");
    const staleProposalDisplay = await client.evaluate<{ applyButton: boolean; text: string }>(`(() => {
      const card = document.querySelector('[data-testid="partition-proposal-block-5"]');
      return { applyButton: Boolean(card?.querySelector('button')), text: card?.textContent || '' };
    })()`);
    assert.equal(staleProposalDisplay.applyButton, false, "A stale manual-edit proposal must no longer render an apply action");
    assert.ok(staleProposalDisplay.text.includes("Hết hiệu lực sau chỉnh sửa"), "The UI should explain why the stale proposal expired");
    await client.evaluate(`document.querySelector('[data-testid="partition-proposal-block-5"] button')?.click()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const roleAfterStaleApply = await client.evaluate<string>(`document.querySelector('select[data-block-id="block-5"]')?.value || ''`);
    assert.equal(roleAfterStaleApply, "body",
      "A pending AI proposal must not override a block the user has manually changed, even after restoring its original role");

    await client.evaluate(`(() => {
      const consent = document.querySelector('[data-testid="ai-partition-consent"]');
      consent.click();
      window.__aiMode = 'defer';
      consent.click();
    })()`);
    const repeatedCheckStarted = await client.waitForFunction(`window.__aiCalls.length === 4 && window.__aiPending.length === 3`, 5000);
    assert.ok(repeatedCheckStarted, JSON.stringify(await client.evaluate(`({ calls: window.__aiCalls.length, pending: window.__aiPending.length, consent: document.querySelector('[data-testid="ai-partition-consent"]')?.checked, status: document.querySelector('[data-testid="ai-partition-status"]')?.textContent, source: document.body.textContent.includes('B_FULL_SOURCE_MARKER') })`)));
    const pendingGeneration = await client.evaluate<number>(`window.__aiCalls[3].sourceGeneration`);

    await client.evaluate(`window.__aiMode = 'error'`);
    await client.uploadFile('input[aria-label="Chọn tệp Word hoặc văn bản"]', fileB);
    assert.ok(await client.waitForFunction(`window.__aiCalls.length === 5 && document.querySelector('[data-testid="ai-partition-status"]')?.textContent.includes('Chỉ quy tắc nội bộ')`, 20000));
    assert.equal(await client.evaluate<number>(`window.__aiCalls[4].sourceGeneration === ${pendingGeneration} ? 1 : 0`), 0,
      "Re-uploading identical bytes must create a new source generation");
    assert.equal(await client.evaluate<number>(`document.querySelectorAll('[data-proposal-source="gemini_ai"]').length`), 0,
      "The newly committed source must not retain AI proposals from its prior generation");

    assert.equal(await client.evaluate<boolean>(`window.__resolvePendingAi(2)`), true);
    await new Promise(resolve => setTimeout(resolve, 900));
    assert.equal(await client.evaluate<number>(`document.querySelectorAll('[data-proposal-source="gemini_ai"]').length`), 0,
      "Late AI response from the previous generation must remain ignored after a same-byte re-upload");
    assert.ok(await client.evaluate<boolean>(`document.querySelector('[data-wizard-step="1"]') !== null`),
      "AI failure must leave the drafting/import flow available");
  } finally {
    await client.close();
    if (serverProc && !serverProc.killed) serverProc.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
