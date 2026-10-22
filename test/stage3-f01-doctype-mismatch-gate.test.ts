/**
 * Hồi quy S3-F01 — mâu thuẫn nguồn ↔ loại văn bản phải chặn xuất cho tới khi có
 * quyết định rõ (chọn lại loại hoặc xác nhận giữ loại, có provenance).
 *
 * Tái hiện đúng finding nghiệm thu: chọn mẫu Kế hoạch → đổi loại THÔNG BÁO vẫn vào
 * được bước Xuất, và câu "Mẫu trình bày phù hợp với loại văn bản đã chọn." vẫn hiện.
 *
 * Cổng 5076/9676 (≠ 5050), profile Chromium riêng, không dữ liệu thật.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

const SERVER_PORT = 5076;
const CDP_PORT = 9676;
const STABLE_TEMPLATE_PHRASE = "Hội nghị Tổng kết";

/** Bấm đúng nút loại văn bản trong khối #wizard-doctype-heading. */
const clickDocType = (name: string) => `(() => {
  const section = document.querySelector('#wizard-doctype-heading')?.closest('section');
  if (!section) return false;
  const btn = Array.from(section.querySelectorAll('button'))
    .find(b => (b.textContent || '').includes(${JSON.stringify(name)}));
  if (!btn) return false;
  btn.click();
  return true;
})()`;

test("S3-F01: mẫu Kế hoạch + chọn THÔNG BÁO không được mở bước Xuất khi chưa có quyết định", async () => {
  const serverProc: ChildProcess = await startTestServer(SERVER_PORT);
  const client = new CdpClient("docform-stage3-f01");

  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 15000),
      "Bước 1 phải được render",
    );

    // -----------------------------------------------------------------------
    // 1) Bắt đầu bằng mẫu hệ thống (Kế hoạch) — nguồn hợp lệ.
    // -----------------------------------------------------------------------
    assert.ok(await client.clickByText("button", "Dùng mẫu"), "Phải có lối bắt đầu từ mẫu");
    await new Promise((r) => setTimeout(r, 350));
    await client.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').trim() === 'Đổi mẫu');
      if (btn) btn.click();
    })()`);
    await new Promise((r) => setTimeout(r, 450));

    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-has-source')`),
      "true",
      "Áp mẫu là nguồn do người dùng chủ động chọn",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "true",
      "Mẫu Kế hoạch chưa mâu thuẫn nên bước Xuất phải mở",
    );
    assert.ok(
      (await client.evaluate<string>(`document.body.textContent || ""`)).includes("Mẫu trình bày phù hợp với loại văn bản đã chọn."),
      "Khi chưa mâu thuẫn, câu khẳng định mẫu phù hợp được phép hiển thị",
    );

    // -----------------------------------------------------------------------
    // 2) Đổi loại sang THÔNG BÁO trên nguồn Kế hoạch — đúng ca nghiệm thu.
    // -----------------------------------------------------------------------
    assert.ok(await client.evaluate<boolean>(clickDocType("THÔNG BÁO")), "Phải bấm được nút THÔNG BÁO");
    await new Promise((r) => setTimeout(r, 300));

    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-source-warning="doc-type"]') !== null`, 3000),
      "Mâu thuẫn loại văn bản phải hiển thị",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-source-warning="doc-type"]')?.getAttribute('data-doctype-override')`),
      "false",
      "Chưa có quyết định override thì cảnh báo ở trạng thái chưa giải quyết",
    );
    assert.equal(
      await client.evaluate<boolean>(`document.body.textContent.includes('Mẫu trình bày phù hợp với loại văn bản đã chọn.')`),
      false,
      "Khi mâu thuẫn, KHÔNG được hiển thị câu 'Mẫu trình bày phù hợp với loại văn bản đã chọn.'",
    );
    assert.ok(
      await client.evaluate<boolean>(`(() => {
        const section = document.querySelector('#wizard-doctype-heading')?.closest('section');
        return Boolean(section && section.textContent.includes('Mẫu đang dùng được thiết kế cho KẾ HOẠCH'));
      })()`),
      "Phải nói rõ mẫu đang dùng được thiết kế cho loại nào",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "false",
      "Bước Xuất phải bị khóa khi nguồn và loại đang mâu thuẫn",
    );

    // -----------------------------------------------------------------------
    // 3) Bấm stepper "3. Xuất văn bản" khi đang mâu thuẫn → vẫn ở Bước 1.
    // -----------------------------------------------------------------------
    assert.ok(await client.clickStep(3));
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "1",
      "Mâu thuẫn chưa giải quyết thì bấm Xuất phải bị chặn, còn ở Bước 1",
    );
    const blockedNotice = await client.evaluate<string>(`document.body.textContent || ""`);
    assert.ok(
      blockedNotice.includes("KẾ HOẠCH") && blockedNotice.includes("THÔNG BÁO"),
      "Thông báo chặn phải nêu cả loại của nguồn và loại đang chọn",
    );
    assert.equal(
      await client.evaluate<boolean>(`document.querySelector('[data-wizard-step="3"]') !== null`),
      false,
      "Không được render bước Xuất",
    );

    // -----------------------------------------------------------------------
    // 4) Từ Bước 2 cũng không được nhảy sang Bước 3.
    // -----------------------------------------------------------------------
    await client.clickStep(2);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "2",
      "Nguồn đã chọn vẫn cho phép soạn thảo",
    );
    await client.clickStep(3);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "2",
      "Từ Bước 2, mâu thuẫn chưa giải quyết vẫn phải chặn bước Xuất",
    );

    // -----------------------------------------------------------------------
    // 5) Quay lại Bước 1 → xác nhận giữ THÔNG BÁO (override có provenance).
    // -----------------------------------------------------------------------
    await client.clickStep(1);
    await new Promise((r) => setTimeout(r, 350));
    assert.ok(
      await client.evaluate<boolean>(`(() => {
        const btn = document.querySelector('[data-action="override-doctype-mismatch"]');
        if (!btn) return false;
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return true;
      })()`),
      "Phải có lối xác nhận giữ loại đang chọn",
    );
    await new Promise((r) => setTimeout(r, 400));

    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-source-warning="doc-type"]')?.getAttribute('data-doctype-override')`),
      "true",
      "Sau khi xác nhận, cảnh báo phải chuyển thành trạng thái đã có quyết định",
    );
    const provenanceText = await client.evaluate<string>(
      `document.querySelector('[data-source-warning="doc-type"]')?.textContent || ""`,
    );
    assert.ok(
      provenanceText.includes("giữ loại") && provenanceText.includes("THÔNG BÁO") && provenanceText.includes("KẾ HOẠCH"),
      "Phải hiển thị bằng chứng: giữ loại nào trên nguồn nào",
    );
    assert.match(
      provenanceText,
      /\d{1,2}:\d{2}/,
      "Phải hiển thị mốc thời gian của quyết định",
    );
    assert.equal(
      await client.evaluate<boolean>(`document.body.textContent.includes('Mẫu trình bày phù hợp với loại văn bản đã chọn.')`),
      false,
      "Câu 'mẫu phù hợp' vẫn phải ẩn vì mẫu không phù hợp với loại đang chọn",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "true",
      "Có quyết định rõ thì bước Xuất được mở",
    );

    // Quyết định phải được commit vào IndexedDB (không chỉ ở bộ nhớ).
    const persistedForDecision = await client.waitForPersisted(
      (rec) => rec.docTypeOverride && rec.docTypeOverride.chosenDocType === "THÔNG BÁO",
      3000,
    );
    assert.notEqual(persistedForDecision, null, "Quyết định override phải được lưu vào IndexedDB");
    const decisionRecord = await client.readPersistedDraft();
    assert.equal(decisionRecord.docTypeOverride.sourceDocType, "KẾ HOẠCH");
    assert.equal(decisionRecord.docTypeOverride.chosenDocType, "THÔNG BÁO");
    assert.equal(decisionRecord.docTypeOverride.regime, "state");
    assert.ok(
      !Number.isNaN(new Date(decisionRecord.docTypeOverride.decidedAt).getTime()),
      "decidedAt phải là mốc thời gian hợp lệ",
    );
    assert.equal(decisionRecord.snapshotSourceType, "system_template", "Nguồn mẫu phải được giữ nguyên");
    console.log(
      "[s3-f01] IndexedDB decision:",
      JSON.stringify({
        sourceOrigin: decisionRecord.sourceOrigin,
        documentType: decisionRecord.documentType,
        snapshotSourceType: decisionRecord.snapshotSourceType,
        docTypeOverride: decisionRecord.docTypeOverride,
      }),
    );

    // -----------------------------------------------------------------------
    // 6) Có quyết định → vào được bước Xuất và nội dung mẫu còn nguyên.
    // -----------------------------------------------------------------------
    await client.clickStep(3);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "3",
      "Có quyết định override hợp lệ thì bước Xuất phải mở",
    );
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-wizard-step="3"]') !== null`, 3000),
      "Bước Xuất phải được render",
    );
    assert.ok(
      await client.evaluate<boolean>(`document.body.textContent.includes(${JSON.stringify(STABLE_TEMPLATE_PHRASE)})`),
      "Nội dung mẫu phải còn nguyên ở bước Xuất",
    );

    // -----------------------------------------------------------------------
    // 7) Tải lại thật: quyết định + bước 3 phải sống sót.
    // -----------------------------------------------------------------------
    await client.reload();
    assert.ok(
      await client.waitForFunction(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step') === '3' &&
        document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed') === 'true'`, 15000),
      "Quyết định đã commit vào IndexedDB phải được hydrate trước khi kiểm tra gate sau reload",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "true",
      "Sau khi tải lại, quyết định đã lưu vẫn phải mở bước Xuất",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "3",
      "Bước 3 hợp lệ phải được khôi phục sau khi tải lại",
    );

    // -----------------------------------------------------------------------
    // 8) Đường giải quyết thứ hai: chọn lại đúng loại của nguồn.
    // -----------------------------------------------------------------------
    await client.clickStep(1);
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(
      await client.evaluate<boolean>(`(() => {
        const btn = document.querySelector('[data-action="resolve-doctype-mismatch"]');
        if (!btn) return false;
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return true;
      })()`),
      "Phải có lối đổi loại về đúng loại của nguồn",
    );
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      await client.evaluate<boolean>(`document.querySelector('[data-source-warning="doc-type"]') !== null`),
      false,
      "Chọn lại đúng loại thì mâu thuẫn phải biến mất",
    );
    assert.ok(
      (await client.evaluate<string>(`document.body.textContent || ""`)).includes("Mẫu trình bày phù hợp với loại văn bản đã chọn."),
      "Hết mâu thuẫn thì câu khẳng định phù hợp được hiển thị lại",
    );
    assert.equal(
      await client.evaluate<string>(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.getAttribute('data-step-allowed')`),
      "true",
      "Hết mâu thuẫn thì bước Xuất vẫn mở",
    );
    await client.clickStep(3);
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(
      await client.evaluate<string>(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),
      "3",
      "Hết mâu thuẫn thì vào được bước Xuất",
    );

    console.log("[s3-f01] override gate + provenance + restore OK");
  } finally {
    await client.close();
    serverProc.kill();
  }
});
