/**
 * @file stage5-s01-stale-refine-body-edit.test.ts
 * @description Chặng 5 — rủi ro do người kiểm độc lập chỉ ra ngày 20/10/2026:
 * đề xuất "AI tinh chỉnh" được ràng buộc theo nguồn/thể thức/revision nhưng
 * **chưa** ràng buộc theo nội dung thân bài tại thời điểm tạo đề xuất.
 *
 * Ca này kiểm: người dùng sửa thân bài **trong cùng nguồn** (không đổi nguồn,
 * không đổi hệ) trong lúc AI đang chờ, hoặc trước khi bấm "Áp dụng".
 * Đề xuất cũ phải **không** được áp vào (không được ghi đè phần vừa sửa),
 * và không được đẩy vào lịch sử phiên bản.
 *
 * AI được mock ngay trong trình duyệt — không gọi Gemini thật.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";

const SERVER_PORT = 5087;
const CDP_PORT = 9687;
const MARKER = "REFINED_OLD_BODY";

test("Chặng 5: đề xuất AI tinh chỉnh cũ không được áp khi thân bài cùng nguồn đã bị sửa", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage5-refine-body-"));
  const filePath = path.join(tempDir, "Audit_Body.docx");
  fs.writeFileSync(
    filePath,
    await generateND30DocxBuffer({
      regime: "administrative",
      headerProfile: "generic",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
      orgHeader2: "ĐƠN VỊ THỬ NGHIỆM",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
      documentType: "THÔNG BÁO",
      referenceNumber: "Số: 11/TB-BODY",
      subject: "V/v kiểm tra đề xuất cũ sau khi sửa thân bài",
      bodyHtml: "<p>Điều 1. Nội dung gốc của tài liệu tổng hợp.</p>",
      signTitle: "GIÁM ĐỐC",
      signName: "Người Ký",
      recipients: "Như trên;",
      fontFamily: "Times New Roman",
      fontSize: 13,
    } as any)
  );

  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient("docform-stage5-refine-body");
  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    // Mock AI: giữ request cho tới khi được giải phóng thủ công.
    await client.evaluate(`(() => {
      const origFetch = window.fetch.bind(window);
      window.__refineCalls = [];
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
              })),
            });
          });
        }
        if (url.includes("/api/ai/")) {
          return Promise.resolve(new Response(JSON.stringify({ success: true, proposals: [], totalBlocks: 0 }), {
            status: 200, headers: { "Content-Type": "application/json" }
          }));
        }
        return origFetch(input, init);
      };
    })()`);

    // Nhập nguồn và duyệt bản nhập
    await client.uploadFile('input[type="file"]', filePath);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`, 15000
    );
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 700));

    // Sang Bước 2 và mở tab "Gợi ý AI"
    await client.clickStep(2);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="2"]') !== null`, 8000);
    await client.evaluate(`(() => { const t = document.getElementById("df-tab-ai"); if (t) t.click(); })()`);
    await new Promise((r) => setTimeout(r, 400));

    // Bắt đầu "Sửa chính tả" (response bị giữ)
    const clicked = await client.clickByText("button", "chính tả");
    assert.ok(clicked, "Nút 'Sửa chính tả' phải tồn tại ở Bước 2");
    assert.ok(
      await client.waitForFunction(`window.__refineCalls.length === 1`, 8000),
      "Phải gửi một yêu cầu AI tinh chỉnh"
    );

    // ---- CA 1: người dùng sửa thân bài TRONG LÚC AI chờ ----
    await client.evaluate(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      if (el) {
        el.focus();
        el.innerHTML = "<p>Điều 1. Nội dung NGƯỜI DÙNG ĐÃ SỬA trong lúc chờ AI.</p>";
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    // Giải phóng response cũ
    await client.evaluate(`(() => {
      const original = window.__refineCalls[0].bodyText; const template = document.createElement("template"); template.innerHTML = original; const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { if (node.textContent?.trim()) { node.textContent = "${MARKER}"; break; } } const refined = template.innerHTML; window.__refineCalls[0].resolveJson({ success: true, source: "mock_audit", refined });
    })()`);
    await new Promise((r) => setTimeout(r, 1200));

    const afterLateResponse = await client.evaluate<any>(`({
      markerShown: document.body.textContent.includes("${MARKER}"),
      errorShown: /thân bài đã thay đổi|Nội dung thân bài/i.test(document.body.textContent),
    })`);
    assert.equal(
      afterLateResponse.markerShown,
      false,
      "Đề xuất tính trên thân bài cũ không được hiện sau khi người dùng đã sửa thân bài"
    );
    assert.equal(
      afterLateResponse.errorShown,
      true,
      "Phải báo rõ rằng nội dung thân bài đã thay đổi nên đề xuất không còn hợp lệ"
    );

    // ---- CA 2: đề xuất đã hiện, người dùng sửa thân bài rồi mới bấm Áp dụng ----
    await client.evaluate(`(() => {
      window.__refineCalls = [];
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
              })),
            });
          });
        }
        return Promise.resolve(new Response(JSON.stringify({ success: true, proposals: [] }), {
          status: 200, headers: { "Content-Type": "application/json" }
        }));
      };
    })()`);

    await client.clickByText("button", "chính tả");
    assert.ok(
      await client.waitForFunction(`window.__refineCalls.length === 1`, 8000),
      "Phải gửi yêu cầu AI tinh chỉnh lần hai"
    );
    await client.evaluate(`(() => {
      const original = window.__refineCalls[0].bodyText; const template = document.createElement("template"); template.innerHTML = original; const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode())) { if (node.textContent?.trim()) { node.textContent = "${MARKER}"; break; } } const refined = template.innerHTML; window.__refineCalls[0].resolveJson({ success: true, source: "mock_audit", refined });
    })()`);
    await new Promise((r) => setTimeout(r, 1200));

    const proposalVisible = await client.evaluate<boolean>(
      `document.body.textContent.includes("${MARKER}")`
    );
    if (!proposalVisible) {
      const alert = await client.evaluate('document.querySelector("[role=alert]")?.textContent');
      const bodyTail = await client.evaluate('document.body.textContent.slice(-500)');
      assert.fail(`Đề xuất phải hiện khi thân bài chưa đổi. Alert=${String(alert)} body=${String(bodyTail)}`);
    }

    // Người dùng sửa thân bài rồi mới bấm "Áp dụng"
    await client.evaluate(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      if (el) {
        el.focus();
        el.innerHTML = "<p>Điều 1. Nội dung NGƯỜI DÙNG ĐÃ SỬA sau khi đề xuất hiện.</p>";
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
    })()`);
    await new Promise((r) => setTimeout(r, 600));

    await client.evaluate(`(() => {
      const b = Array.from(document.querySelectorAll("button")).find(x => x.textContent && x.textContent.includes("Phê duyệt & Áp dụng"));
      if (b) b.click();
    })()`);
    await new Promise((r) => setTimeout(r, 1200));

    const draft = await client.readRawDraft();
    const bodyHtml = String(draft?.doc?.bodyHtml || "");
    assert.ok(
      !bodyHtml.includes(MARKER),
      `Đề xuất cũ không được ghi đè thân bài đã sửa (bodyHtml=${bodyHtml.slice(0, 160)})`
    );
    assert.ok(
      bodyHtml.includes("NGƯỜI DÙNG ĐÃ SỬA"),
      "Nội dung người dùng vừa sửa phải được giữ nguyên"
    );
    const aiVersions = (draft?.versions || []).filter((v: any) => String(v.title || "").startsWith("AI:"));
    assert.equal(
      aiVersions.length,
      0,
      "Đề xuất bị từ chối không được đẩy vào lịch sử phiên bản"
    );
  } finally {
    client.close();
    serverProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
