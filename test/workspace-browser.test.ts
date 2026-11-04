import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CdpClient,startTestServer} from './support/browserHarness.ts';

// Uses the production store/constructor to seed synthetic drafts, then only UI actions.
async function seed(c:CdpClient, approved=true, rich:boolean|"style"|"table"=false){
  return c.evaluate(`(async()=>{
    const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
    const {approveWorkspacePartition}=await import('/src/utils/workspaceTransactions.ts');
    const {saveDraft}=await import('/src/utils/draftStore.ts');
    const blocks=[{id:'b',index:0,kind:'paragraph',role:'body',text:'Body original',html:'<p>Body original</p>'},{id:'u',index:1,kind:'paragraph',role:'unclassified',text:'Unclassified',html:'<p>Unclassified</p>'}];
    if(${rich==='table'}){
      const {tableModelToHtmlView}=await import('/src/shared/tableModel.ts');
      const model={tableId:'synthetic-table',rowsCount:1,columnsCount:1,gridColumnsTwips:[5000],tableWidthTwips:5000,widthType:'dxa',hasBorders:false,rows:[{rowIndex:0,isHeader:false,cantSplit:true,cells:[{cellId:'synthetic-cell',rowIndex:0,colIndex:0,gridColumn:0,gridSpan:1,text:'TABLE ORIGINAL',paragraphs:[{text:'TABLE ORIGINAL',runs:[{text:'TABLE ORIGINAL'}]}]}]}]};
      blocks[0]={id:'b',index:0,kind:'table',role:'body',text:'TABLE ORIGINAL',html:tableModelToHtmlView(model),tableModel:model,tableData:[['TABLE ORIGINAL']]};
    }
    const doc={headerProfile:'generic',orgHeader1:'',orgHeader2:'CƠ QUAN MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Tổng hợp',bodyHtml:${rich==='table'?"blocks[0].html":rich==='style'?JSON.stringify('<p style="text-align:center">KEEP READONLY</p>'):rich?"`<p><span style=\"color:red\">Rich</span><img src=\"data:image/png;base64,AA==\"></p>`":"blocks[0].html"},signTitle:'',signName:'',recipients:'',appendices:[{id:'app-a',title:'PHỤ LỤC A',html:'<p><u>SAME</u></p>',blocks:[],sourceBlockIds:[],extractionStatus:'confirmed'},{id:'app-b',title:'PHỤ LỤC B',html:'<p>SAME</p>',blocks:[],sourceBlockIds:[],extractionStatus:'confirmed'}],unclassified:[blocks[1]]};
    const structuredImport={source:{filename:'Synthetic.txt',type:'txt',blockCount:2},fields:{},body:{html:doc.bodyHtml,sourceBlockIds:['b']},appendices:doc.appendices,unclassified:doc.unclassified,blocks,order:['b','u']};
    let s=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:blocks,structuredImport},{blobHash:'synthetic',generation:1,blocks});
    if(${approved}){const result=approveWorkspacePartition(s);if(!result.ok)throw Error(JSON.stringify(result));s=result.snapshot;}
    await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...s,versions:[],currentStep:1,sourceOrigin:'uploaded_file',importReviewApprovedSourceHash:${approved ? "'synthetic'" : "null"},uploadedBlocks:blocks,uploadedFileName:'Synthetic.txt',uploadedFileType:'txt',originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic.txt',fileType:'txt',uploadedAt:new Date().toISOString(),sourceHash:'synthetic',bodyHtml:doc.bodyHtml}});
    return true;
  })()`);
}
async function waitRaw(c:CdpClient,predicate:(record:any)=>boolean,timeout=5000){const start=Date.now();while(Date.now()-start<timeout){const record=await c.readRawDraft();if(record&&predicate(record))return true;await new Promise(r=>setTimeout(r,100));}return false;}
async function click(c:CdpClient,selector:string){assert.equal(await c.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`),true,selector);}
async function resumeWorkspace(c:CdpClient){
 await c.clickByText('button','Tiếp tục tài liệu hiện tại');
 assert.equal(await c.waitForFunction(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-flow-phase')!=='choice'`),true,'current-document choice resolves before workspace navigation');
 assert.equal(await c.waitForFunction(`document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed')==='true'`),true,'approved fixture unlocks the workspace step');
 await click(c,'[data-step="2"]');
}
async function type(c:CdpClient,selector:string,text:string){
 await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
 await c.send('Input.insertText',{text});
}
test('Workspace: sidebar, approval, transactions, editors, candidate and storage',async()=>{
 const server=await startTestServer(5091);const c=new CdpClient('docform-workspace-b');
 fs.mkdirSync('group-b-evidence',{recursive:true});
 try{
  await c.launch(9591);await c.navigate('http://127.0.0.1:5091');
  assert.equal(await seed(c,false),true);await c.reload();
  for(const width of [390,768,1440]){
   await c.setViewport(width,900);
   assert.equal(await c.evaluate(`document.querySelectorAll('.df-workspace-sidebar button[data-step]').length`),3);
   assert.equal(await c.evaluate(`document.querySelector('header .df-stepper')===null`),true);
   assert.equal(await c.evaluate(`document.documentElement.scrollWidth<=innerWidth+2`),true);
   const shot=await c.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(`group-b-evidence/workspace-${width}.png`,Buffer.from(shot.result?.data??shot.data,'base64'));
  }
  assert.equal(await c.evaluate(`document.querySelector('[data-step="2"]').getAttribute('data-step-allowed')`),'false');
  assert.equal(await c.evaluate(`document.querySelector('[data-wizard-step="1"] [contenteditable="true"]')===null`),true);
  await c.clickByText('button','Tiếp tục tài liệu hiện tại');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-flow-phase')!=='choice'`),true);
  await c.clickByText('button','Mở rà soát phân vùng');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-testid="side-by-side-modal"]')!==null`),true);
  assert.equal(await c.evaluate(`(()=>{const d=document.querySelector('[role="dialog"]');return Boolean(d.getAttribute('aria-label')||document.getElementById(d.getAttribute('aria-labelledby'))?.textContent)})()`),true);
  await c.evaluate(`(()=>{const d=document.querySelector('[data-testid="side-by-side-modal"]');const items=[...d.querySelectorAll('button:not([disabled]),select')].filter(e=>e.offsetWidth);items.at(-1).focus()})()`);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  assert.equal(await c.evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`),true);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  assert.equal(await c.waitForFunction(`document.querySelector('[data-testid="side-by-side-modal"]')===null`),true);
  // The staged source review modal traps focus and closes on Escape.
  // Approved fixture isolates editor tests from parser heuristics (import acceptance is separately exercised).
  await seed(c);await c.reload();await click(c,'[data-step="2"]');
  assert.equal(await c.waitForFunction(`document.querySelectorAll('[data-workspace-group]').length===8&&document.querySelector('[data-canvas-id="body"]')!==null`),true);
  assert.deepEqual(await c.evaluate<string[]>(`Array.from(document.querySelectorAll('[data-workspace-group]')).map(group=>group.getAttribute('data-workspace-group'))`),['2','1','3','4','5','7','8','9']);
  await click(c,'[data-canvas-tab="app-a"]');
  const initial=await c.readRawDraft();
  await type(c,'[data-canvas-id="app-a"] .ProseMirror',' A_EDIT');
  await click(c,'[data-canvas-tab="app-b"]');await type(c,'[data-canvas-id="app-b"] .ProseMirror',' B_EDIT');
  await click(c,'[data-canvas-tab="app-a"]');
  await c.evaluate(`document.querySelector('[data-canvas-id="app-a"] .ProseMirror').focus()`);
  await click(c,'[data-workspace-command="undo"]');
  assert.equal(await c.evaluate(`document.querySelector('[data-canvas-id="app-a"] .ProseMirror').textContent.includes('A_EDIT')`),false);
  await click(c,'[data-workspace-command="redo"]');
  assert.equal(await c.evaluate(`document.querySelector('[data-canvas-id="app-a"] .ProseMirror').textContent.includes('A_EDIT')`),true);
  await click(c,'[data-canvas-tab="body"]');await type(c,'[data-canvas-id="body"] .ProseMirror',' LOCAL');
  assert.ok(await waitRaw(c,r=>r.doc.bodyHtml.includes('LOCAL'),5000));
  const edited=await c.readRawDraft();assert.ok(edited.workspace.ledger.length>=4);
  for(const width of [390,768,1440]){await c.setViewport(width,900);assert.equal(await c.evaluate(`document.documentElement.scrollWidth<=innerWidth+2`),true);const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`group-b-evidence/workspace-editor-${width}.png`,Buffer.from(shot.result?.data??shot.data,'base64'));}
  assert.equal(edited.doc.appendices[0].id,initial.doc.appendices[0].id);
  // Current import repartition and approval behavior is covered by import-session-browser.test.ts.
  // Keep this integration focused on workspace editing and candidate fidelity.
  await click(c,'[data-step="2"]');
  // Late AI response safety is covered by the dedicated Stage 5 browser tests.
  // Delay the actual byte digest; leave, edit and prepare a new revision while the old promise runs.
  await c.evaluate(`(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);let first=true;crypto.subtle.digest=(...args)=>{if(!first)return digest(...args);first=false;return new Promise(resolve=>setTimeout(()=>resolve(digest(...args)),1100));}})()`);
  await click(c,'[data-step="3"]');await click(c,'[data-step="2"]');await type(c,'[data-canvas-id="body"] .ProseMirror',' LATEST');await click(c,'[data-step="3"]');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-candidate-safe="true"]')!==null`,15000),true);
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[data-preview-bytes-sha]'))`,15000),true);
  for(const width of [390,768,1440]){await c.setViewport(width,900);assert.equal(await c.evaluate(`document.documentElement.scrollWidth<=innerWidth+2`),true);const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`group-b-evidence/workspace-export-${width}.png`,Buffer.from(shot.result?.data??shot.data,'base64'));}
  const identity=await c.evaluate(`(()=>{const root=document.querySelector('[data-candidate-safe]');return {sha:root.dataset.candidateSha,id:root.dataset.candidateInstance,preview:document.querySelector('[data-candidate-preview]')?.dataset.previewBytesSha,evidence:document.querySelector('[data-candidate-evidence]')?.dataset.candidateSha,download:document.querySelector('[data-candidate-download]')?.dataset.candidateSha}})()`);
  assert.match(identity.sha,/^[a-f0-9]{64}$/);assert.equal(identity.preview,identity.sha);assert.equal(identity.evidence,identity.sha);assert.equal(identity.download,identity.sha);
  await c.evaluate(`(()=>{const original=URL.createObjectURL;window.__candidateDownload=null;URL.createObjectURL=(blob)=>{blob.arrayBuffer().then(async bytes=>{const hash=await crypto.subtle.digest('SHA-256',bytes);window.__candidateDownload=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')});return original(blob)}})()`);
  await click(c,'[data-candidate-download]');assert.equal(await c.waitForFunction(`window.__candidateDownload!==null`),true);
  const downloaded=await c.evaluate('window.__candidateDownload');assert.equal(downloaded,identity.sha);
  await new Promise(r=>setTimeout(r,1300));assert.equal(await c.evaluate(`document.querySelector('[data-candidate-safe]')?.dataset.candidateSha`),identity.sha);
  fs.writeFileSync('group-b-evidence/candidate-identity.json',JSON.stringify({...identity,downloadedSha:downloaded},null,2));
  await click(c,'[data-step="2"]');await type(c,'[data-canvas-id="body"] .ProseMirror',' NEW');
  assert.equal(await c.evaluate(`document.querySelector('[data-candidate-download]')===null`),true);
  // Missing signature data stays absent; this synthetic source has no signer block.
  // Body and appendix persistence are already covered above.
  // Template-version restore and invalid-history rejection are covered by the dedicated
  // import-session and legacy-template browser tests.
  await seed(c,true,'style');await c.reload();await resumeWorkspace(c);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-canvas-id="body"] [data-editor-readonly]')!==null`),true);
  await new Promise(r=>setTimeout(r,1200));assert.equal((await c.readRawDraft()).doc.bodyHtml,'<p style="text-align:center">KEEP READONLY</p>');
  await seed(c,true,'table');await c.reload();await resumeWorkspace(c);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-canvas-id="body"] [data-workspace-atom="table"][data-readonly-reason="table_atom_structure_locked"]')!==null`),true);
  await new Promise(r=>setTimeout(r,1200));const tableDraft=await c.readRawDraft();assert.ok(tableDraft.doc.bodyHtml.includes('TABLE ORIGINAL'));assert.ok(tableDraft.doc.bodyHtml.includes('synthetic-cell'));assert.equal(tableDraft.workspace.workingRevision,0);
  await seed(c,true,true);await c.reload();await resumeWorkspace(c);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-canvas-id="body"] [data-workspace-atom="image"][data-readonly-reason="media_atom_readonly"]')!==null`),true);
  await click(c,'[data-step="3"]');assert.equal(await c.waitForFunction(`document.querySelector('[data-candidate-safe="false"]')!==null`,15000),true);
  assert.equal(await c.evaluate(`document.querySelector('[data-candidate-download]')===null`),true);
  await c.evaluate(`Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){throw Error('Injected quota failure')}}})`);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',modifiers:2});
  assert.equal(await c.waitForFunction(`document.body.textContent.includes('Lỗi lưu')`),true);
 }finally{c.close();server.kill();}
});
