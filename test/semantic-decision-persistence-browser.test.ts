import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

test("restores semantic approval and applied Body formatting after IndexedDB reload", async () => {
  const port = 5121;
  const server = await startTestServer(port);
  const client = new CdpClient("docform-semantic-persistence");
  try {
    await client.launch(9621);
    await client.navigate(`http://127.0.0.1:${port}/`);
    const sourceBytes = Buffer.from("synthetic source bytes for semantic decision persistence");
    const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
    const base64 = sourceBytes.toString("base64");
    const result = await client.evaluate<string>(`(async()=>{
      const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
      const {approveWorkspacePartition}=await import('/src/utils/workspaceTransactions.ts');
      const {saveDraft,saveSourceBlob}=await import('/src/utils/draftStore.ts');
      const {semanticApprovalContextKey}=await import('/src/utils/semanticState.ts');
      const hash=${JSON.stringify(sourceHash)},binary=atob(${JSON.stringify(base64)}),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const uploadedAt=new Date().toISOString(),text='Nội dung thử nghiệm';
      const block={id:'semantic-persist-block',index:0,kind:'paragraph',role:'body',text,html:'<p>'+text+'</p>',confidence:'high',isConfirmed:true};
      const doc={headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Thử nghiệm lưu duyệt',bodyHtml:'<p>'+text+'</p>',signTitle:'',signName:'',recipients:''};
      await saveSourceBlob({hash,fileName:'Synthetic-source.docx',fileType:'docx',fileSize:bytes.byteLength,uploadedAt,bytes:bytes.buffer});
      let snapshot=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:[block],structuredImport:null},{blobHash:hash,generation:1,blocks:[block]});
      const approved=approveWorkspacePartition(snapshot);if(!approved.ok)throw Error(JSON.stringify(approved));snapshot=approved.snapshot;
      const contextKey=semanticApprovalContextKey({sourceSha256:hash,sourceGeneration:1,partitionFingerprint:snapshot.workspace.partition.fingerprint,regime:'state',documentType:doc.documentType});
      await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...snapshot,versions:[],currentStep:1,sourceOrigin:'uploaded_file',importReviewApprovedSourceHash:hash,uploadedBlocks:[block],uploadedFileName:'Synthetic-source.docx',uploadedFileType:'docx',rawText:text,semanticDecisions:{'semantic.v1.body.body.semantic-persist-block.p0':{contextKey,status:'user_confirmed'}},originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic-source.docx',fileType:'docx',uploadedAt,sourceHash:hash,bodyHtml:doc.bodyHtml}});
      return contextKey;
    })()`);
    assert.ok(result, "Synthetic approved draft should be seeded in the isolated browser profile");

    await client.reload();
    assert.equal(await client.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Tiếp tục tài liệu hiện tại')&&!button.disabled)`), true,
      "Draft restore action should be available after IndexedDB hydration");
    assert.equal(await client.clickByText("button", "Tiếp tục tài liệu hiện tại"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="ready"]')!==null`), true);
    assert.equal(await client.clickByText("button", "Quay lại"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="metadata"]')!==null`), true);
    const unitSelector = '[data-semantic-unit-id="semantic.v1.body.body.semantic-persist-block.p0"]';
    assert.equal(await client.waitForFunction(`document.querySelector(${JSON.stringify(unitSelector)})?.textContent?.includes('Đã xác nhận')`), true, "User semantic approval should be restored from IndexedDB");
    assert.equal(await client.clickByText("button", "Áp dụng quy tắc vào đoạn soạn"), true, "Confirmed body rule should be executable in the local workspace");
    assert.equal(await client.waitForFunction(`document.querySelector(${JSON.stringify(unitSelector)})?.textContent?.includes('Đã áp dụng quy tắc vào đúng đoạn Body')`), true, "Applied rule should be shown against the confirmed unit");
    assert.equal(await client.waitForAsyncFunction(`(async()=>{
      const {loadDraft}=await import('/src/utils/draftStore.ts');
      const draft=await loadDraft();
      return Boolean(draft?.semanticDecisions?.['semantic.v1.body.body.semantic-persist-block.p0']?.status==='user_confirmed'&&
        draft?.doc?.bodyHtml?.includes('data-df-line-spacing="1.15"')&&draft?.doc?.bodyHtml?.includes('data-df-first-line-indent="1.27cm"'));
    })()`), true, "Applied paragraph and decision should both persist in IndexedDB before reload");

    await client.reload();
    assert.equal(await client.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Tiếp tục tài liệu hiện tại')&&!button.disabled)`), true,
      "Draft restore action should be available after second IndexedDB hydration");
    assert.equal(await client.clickByText("button", "Tiếp tục tài liệu hiện tại"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="ready"]')!==null`), true);
    assert.equal(await client.clickByText("button", "Quay lại"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="metadata"]')!==null`), true);
    assert.equal(await client.waitForFunction(`document.querySelector(${JSON.stringify(unitSelector)})?.textContent?.includes('Đã xác nhận')&&document.querySelector(${JSON.stringify(unitSelector)})?.textContent?.includes('Đã áp dụng quy tắc vào đúng đoạn Body')`), true, "Approval and formatting should both survive another IndexedDB reload");
    assert.equal(await client.clickByText("button", "Xem tóm tắt"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="ready"]')!==null`), true);
    assert.equal(await client.clickByText("button", "Sang Bước 2: Soạn"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-current-step="2"]')!==null`), true);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('.df-workspace-prose p[data-df-line-spacing="1.15"][data-df-first-line-indent="1.27cm"]'))`), true, "Workspace editor schema should preserve the exact rule attributes");
    assert.equal(await client.evaluate(`document.querySelector('[data-editor-readonly]')===null`), true, "The formatted simple paragraph should remain editable");
  } finally {
    client.close();
    server.kill();
  }
});
