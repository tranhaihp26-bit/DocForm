import test from "node:test";
import assert from "node:assert/strict";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";

async function click(client: CdpClient, selector: string) {
  assert.equal(await client.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`), true, selector);
}

async function seedApprovedDraft(client: CdpClient) {
  return client.evaluate(`(async()=>{
    const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
    const {approveWorkspacePartition}=await import('/src/utils/workspaceTransactions.ts');
    const {saveDraft}=await import('/src/utils/draftStore.ts');
    const blocks=[{id:'synthetic-body',index:0,kind:'paragraph',role:'body',text:'Synthetic body sentence.',html:'<p>Synthetic body sentence.</p>'}];
    const doc={headerProfile:'generic',orgHeader1:'',orgHeader2:'CƠ QUAN MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Tổng hợp',bodyHtml:'<p>Synthetic body sentence.</p>',signTitle:'',signName:'',recipients:'',appendices:[],unclassified:[]};
    const structuredImport={source:{filename:'Synthetic.txt',type:'txt',blockCount:1},fields:{},body:{html:doc.bodyHtml,sourceBlockIds:['synthetic-body']},appendices:[],unclassified:[],blocks,order:['synthetic-body']};
    let snapshot=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:blocks,structuredImport},{blobHash:'synthetic-ai-provider',generation:1,blocks});
    const approved=approveWorkspacePartition(snapshot);if(!approved.ok)throw Error(JSON.stringify(approved));snapshot=approved.snapshot;
    await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...snapshot,versions:[],currentStep:1,sourceOrigin:'uploaded_file',importReviewApprovedSourceHash:'synthetic-ai-provider',uploadedBlocks:blocks,uploadedFileName:'Synthetic.txt',uploadedFileType:'txt',originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic.txt',fileType:'txt',uploadedAt:new Date().toISOString(),sourceHash:'synthetic-ai-provider',bodyHtml:doc.bodyHtml}});
    return true;
  })()`);
}

test("provider settings check only sends a synthetic provider id and refinement discloses/consents to the selected provider", async () => {
  const port = 5138;
  const server = await startTestServer(port);
  const client = new CdpClient("docform-openai-provider-ui");
  try {
    await client.launch(9638);
    await client.navigate(`http://127.0.0.1:${port}/`);
    await click(client, 'button[aria-label="Cài đặt chung"]');
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="ai-provider-test-openai_api"]'))`), true);
    assert.equal(await client.evaluate(`document.querySelector('[data-testid="app-settings-dialog"] input[type="password"]')===null`), true, "API credentials are never entered in browser settings");

    await client.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__providerProbeBodies=[];
      window.fetch=async(input,init)=>{
        if(String(input).includes('/api/ai/test-connection')){
          const body=JSON.parse(init?.body||'null');window.__providerProbeBodies.push(body);
          return new Response(JSON.stringify({ok:true,provider:body.provider,model:'synthetic-model',latencyMs:2}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(input,init);
      };
      const select=document.querySelector('[data-testid="ai-default-provider"]');select.value='openai_api';select.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    assert.equal(await client.waitForFunction(`JSON.parse(localStorage.getItem('docform.ai-settings.v1')||'null')?.defaultProvider==='openai_api'`), true);
    await click(client, '[data-testid="ai-provider-test-openai_api"]');
    assert.equal(await client.waitForFunction(`document.querySelector('[data-testid="ai-connection-status-openai_api"]')?.textContent.includes('synthetic-model')`), true);
    assert.deepEqual(await client.evaluate(`window.__providerProbeBodies[0]`), { provider: "openai_api" }, "The connection probe sends only the selected provider, never document content");
    await client.evaluate(`(()=>{const select=document.querySelector('[data-testid="ai-default-provider"]');select.value='gemini';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await click(client, '[data-testid="ai-provider-test-gemini"]');
    assert.equal(await client.waitForFunction(`document.querySelector('[data-testid="ai-connection-status-gemini"]')?.textContent.includes('synthetic-model')`), true);
    assert.deepEqual(await client.evaluate(`window.__providerProbeBodies[1]`), { provider: "gemini" }, "The Gemini connection probe also sends only its provider id");
    await client.evaluate(`(()=>{const select=document.querySelector('[data-testid="ai-default-provider"]');select.value='openai_api';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);

    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    assert.equal(await seedApprovedDraft(client), true);
    await client.reload();
    await click(client, '[data-step="2"]');
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-testid="ai-refine-disclosure"]'))`), true);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('button[data-ai-target-node]'))`), true);
    await client.evaluate(`document.querySelector('.df-step-context-toggle')?.click()`);
    assert.equal(await client.waitForFunction(`Boolean(document.querySelector('[data-workspace-node-capability="editable"] [contenteditable="true"]'))`), true);
    const editorPoint = await client.evaluate<{ x: number; y: number } | null>(`(()=>{const r=document.querySelector('[data-workspace-node-capability="editable"] [contenteditable="true"]')?.getBoundingClientRect();return r?{x:r.left+Math.min(24,r.width/2),y:r.top+Math.min(16,r.height/2)}:null})()`);
    assert.ok(editorPoint, "The synthetic body paragraph is editable and can be selected for a scoped refinement");
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: editorPoint.x, y: editorPoint.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: editorPoint.x, y: editorPoint.y, button: "left", clickCount: 1 });
    assert.equal(await client.waitForFunction(`document.querySelector('button[data-ai-action="proofread"]')?.disabled===false`), true);
    const disclosure = await client.evaluate<string>(`document.querySelector('[data-testid="ai-refine-disclosure"]')?.textContent||''`);
    assert.match(disclosure, /OpenAI API/);
    assert.match(disclosure, /chỉ áp dụng sau khi bạn duyệt/i);

    await client.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__refineRequestBody=null;
      window.fetch=async(input,init)=>{
        if(String(input).includes('/api/ai/refine-text')){
          window.__refineRequestBody=JSON.parse(init?.body||'null');
          return new Response(JSON.stringify({success:true,source:'openai_api_ai',refined:'Synthetic refined sentence.',isFallback:false}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return original(input,init);
      };
    })()`);
    await click(client, '[data-ai-action="proofread"]');
    assert.equal(await client.waitForFunction(`window.__refineRequestBody?.provider==='openai_api'`), true);
    const refineRequest = await client.evaluate<any>(`window.__refineRequestBody`);
    assert.equal(refineRequest.consent, true, "Clicking the disclosed action is operation-specific consent");
    assert.equal(refineRequest.text, "<p>Synthetic body sentence.</p>");
  } finally {
    client.close();
    server.kill();
  }
});
