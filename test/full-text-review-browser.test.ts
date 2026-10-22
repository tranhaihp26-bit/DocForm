import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import JSZip from "jszip";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

async function syntheticDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>FULL_TEXT_BROWSER_SYNTHETIC_MARKER</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function pointerClick(client: CdpClient, selector: string): Promise<boolean> {
  const point = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getBoundingClientRect().width>0);if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (!point) return false;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

async function pointerClickText(client: CdpClient, selector: string, text: string): Promise<boolean> {
  const point = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent?.includes(${JSON.stringify(text)})&&node.getBoundingClientRect().width>0);if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  if (!point) return false;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

test("full-text browser flow requires consent, reports partial, retries only failures and persists no manifest or consent", async () => {
  const serverPort = 5141;
  const server = await startTestServer(serverPort, { fullTextAiMock: true });
  const client = new CdpClient("docform-full-text-review");
  try {
    await client.launch(9641);
    await client.navigate(`http://127.0.0.1:${serverPort}/`);
    const sourceBytes = await syntheticDocx();
    const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
    const base64 = sourceBytes.toString("base64");
    await client.evaluate(`(async()=>{
      const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
      const {approveWorkspacePartition}=await import('/src/utils/workspaceTransactions.ts');
      const {saveDraft,saveSourceBlob}=await import('/src/utils/draftStore.ts');
      const hash=${JSON.stringify(sourceHash)},binary=atob(${JSON.stringify(base64)}),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const uploadedAt=new Date().toISOString(),text='FULL_TEXT_BROWSER_SYNTHETIC_MARKER';
      const block={id:'fulltext-browser-block',index:0,kind:'paragraph',role:'body',text,html:'<p>'+text+'</p>',confidence:'high',isConfirmed:true};
      const doc={headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Thử nghiệm toàn văn',bodyHtml:'<p>'+text+'</p>',signTitle:'',signName:'',recipients:''};
      await saveSourceBlob({hash,fileName:'Synthetic-full-text.docx',fileType:'docx',fileSize:bytes.byteLength,uploadedAt,bytes:bytes.buffer});
      let snapshot=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:[block],structuredImport:null},{blobHash:hash,generation:1,blocks:[block]});
      const approved=approveWorkspacePartition(snapshot);if(!approved.ok)throw Error(JSON.stringify(approved));snapshot=approved.snapshot;
      await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...snapshot,versions:[],currentStep:1,sourceOrigin:'uploaded_file',importReviewApprovedSourceHash:hash,uploadedBlocks:[block],uploadedFileName:'Synthetic-full-text.docx',uploadedFileType:'docx',rawText:text,semanticDecisions:{},originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic-full-text.docx',fileType:'docx',uploadedAt,sourceHash:hash,bodyHtml:doc.bodyHtml}});
      return true;
    })()`);
    await client.reload();
    assert.equal(await client.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Tiếp tục tài liệu hiện tại')&&!button.disabled)`), true);
    assert.equal(await client.clickByText("button", "Tiếp tục tài liệu hiện tại"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="ready"]')!==null`), true);
    assert.equal(await client.clickByText("button", "Quay lại"), true);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="full-text-review-panel"]'))`), true);
    await client.setViewport(390, 844);

    await client.evaluate(`(()=>{
      window.__fullTextCalls=[];window.__fullTextMode='partial';
      const realFetch=window.fetch.bind(window);
      window.fetch=async(input,init={})=>{
        if(String(input).includes('/api/ai/review-full-text')){
          window.__fullTextCalls.push(JSON.parse(String(init.body||'{}')));
          const headers=new Headers(init.headers||{});headers.set('x-docform-test-full-text-mode',window.__fullTextMode);
          return realFetch(input,{...init,headers});
        }
        return realFetch(input,init);
      };
    })()`);
    assert.equal(await client.evaluate<boolean>(`document.querySelector('[data-testid="full-text-provider-consent"]')?.checked===false`), true,
      "Consent starts unchecked for this source");
    assert.equal(await client.evaluate<number>(`window.__fullTextCalls.length`), 0, "Opening the panel sends no request");
    assert.equal(await pointerClickText(client, 'button', "Kiểm kê văn bản trích xuất trên máy"), true);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="full-text-manifest-inventory"]')?.textContent.includes('word/document.xml')&&document.querySelector('[data-testid="full-text-manifest-inventory"]')?.textContent.includes('1 đoạn'))`), true,
      "The local inventory exposes the included package part and extracted segment count before transmission");
    assert.equal(await client.evaluate<number>(`window.__fullTextCalls.length`), 0, "Local inventory construction sends no request");
    assert.equal(await pointerClick(client, '[data-testid="full-text-provider-consent"]'), true);
    assert.equal(await client.evaluate<boolean>(`document.querySelector('[data-testid="full-text-provider-consent"]')?.checked`), true);
    assert.equal(await client.evaluate<number>(`window.__fullTextCalls.length`), 0, "Consent alone does not send the text");
    assert.equal(await pointerClickText(client, 'button', "Gửi toàn bộ văn bản trích xuất để rà soát"), true);
    assert.equal(await client.waitForFunction(`window.__fullTextCalls.length===1&&document.querySelector('[data-testid="full-text-review-progress"]')?.textContent.includes('Coverage một phần')`, 15000), true,
      "The first synthetic provider failure is shown as partial coverage");
    const firstRequest = await client.evaluate<any>(`window.__fullTextCalls[0]`);
    assert.equal(firstRequest.provider, "gemini");
    assert.equal(firstRequest.textScope, "all_extracted_text");
    assert.equal(firstRequest.segments.length, 1);
    assert.ok(firstRequest.segments[0].text.includes("FULL_TEXT_BROWSER_SYNTHETIC_MARKER"));
    assert.equal("docxBytes" in firstRequest, false);
    assert.equal("fileName" in firstRequest, false);

    await client.evaluate(`window.__fullTextMode='success'`);
    assert.equal(await client.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Thử lại các đoạn chưa có phản hồi')&&!button.disabled)`), true);
    assert.equal(await pointerClickText(client, 'button', "Thử lại các đoạn chưa có phản hồi"), true);
    assert.equal(await client.waitForFunction(`window.__fullTextCalls.length===2&&document.querySelector('[data-testid="full-text-review-progress"]')?.textContent.includes('Đã nhận phản hồi cho toàn bộ')`, 15000), true,
      "Retry completes after the provider recovers");
    const retryRequest = await client.evaluate<any>(`window.__fullTextCalls[1]`);
    assert.deepEqual(retryRequest.retry.segmentIds, firstRequest.segments.map((segment: any) => segment.id));
    assert.deepEqual(retryRequest.retry.priorResults, []);

    assert.equal(await client.waitForAsyncFunction(`(async()=>{
      const {loadDraft}=await import('/src/utils/draftStore.ts');const draft=await loadDraft();
      const saved=draft?.fullTextSemanticReview;
      return Boolean(saved?.coverage?.status==='complete'&&saved?.manifestSha256&&!('segments' in saved)&&!('parts' in saved)&&!('excluded' in saved)&&!('consent' in saved));
    })()`), true, "IndexedDB keeps source-bound semantic coverage only, not the manifest or consent");
    assert.equal(await client.waitForAsyncFunction(`(async()=>{const {loadDraft}=await import('/src/utils/draftStore.ts');const draft=await loadDraft();return JSON.stringify(draft?.fullTextSemanticReview).includes('FULL_TEXT_BROWSER_SYNTHETIC_MARKER')})()`), false,
      "No raw source segment was duplicated in the persisted AI review evidence");

    await client.reload();
    assert.equal(await client.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Tiếp tục tài liệu hiện tại')&&!button.disabled)`), true);
    assert.equal(await client.clickByText("button", "Tiếp tục tài liệu hiện tại"), true);
    assert.equal(await client.waitForFunction(`document.querySelector('[data-flow-phase="ready"]')!==null`), true);
    assert.equal(await client.clickByText("button", "Quay lại"), true);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="full-text-review-panel"]'))`), true);
    assert.equal(await client.evaluate<boolean>(`document.querySelector('[data-testid="full-text-provider-consent"]')?.checked===false`), true,
      "A reload does not restore consent");
    assert.equal(await client.evaluate<boolean>(`document.querySelector('[data-testid="full-text-manifest-inventory"]')===null`), true,
      "A reload does not restore the in-memory manifest");
  } finally {
    client.close();
    server.kill();
  }
});
