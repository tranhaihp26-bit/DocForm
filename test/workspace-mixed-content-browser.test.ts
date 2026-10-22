import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CdpClient,startTestServer} from './support/browserHarness.ts';

async function pointerClick(c:CdpClient,selector:string){
 const p=await c.evaluate<{x:number;y:number;hit:boolean}>(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return{x:0,y:0,hit:false};const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return{x,y,hit:h===e||e.contains(h)}})()`);
 assert.equal(p.hit,true,`real pointer hit ${selector}`);await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
}
async function waitRaw(c:CdpClient,predicate:(record:any)=>boolean,timeout=5000){const started=Date.now();while(Date.now()-started<timeout){const record=await c.readRawDraft();if(record&&predicate(record))return record;await new Promise(r=>setTimeout(r,100));}return null;}

test('mixed Body keeps paragraph editors separate from table/image atoms and edits a proven simple cell',async()=>{
 const port=5108,cdpPort=9608,server=await startTestServer(port),c=new CdpClient('docform-m1-mixed');
 const evidence='docs/superpowers/audits/2026-10-20-uiux-m1-evidence';fs.mkdirSync(evidence,{recursive:true});
 try{
  await c.launch(cdpPort);await c.navigate(`http://127.0.0.1:${port}`);
  assert.equal(await c.evaluate(`(async()=>{
   const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
   const {approveWorkspacePartition}=await import('/src/utils/workspaceTransactions.ts');
   const {tableModelToHtmlView}=await import('/src/shared/tableModel.ts');
   const {saveDraft}=await import('/src/utils/draftStore.ts');
   const model={tableId:'mixed-table',rowsCount:1,columnsCount:1,gridColumnsTwips:[9360],tableWidthTwips:9360,widthType:'dxa',alignment:'center',hasBorders:true,rows:[{rowIndex:0,isHeader:false,cantSplit:true,cells:[{cellId:'mixed-cell',rowIndex:0,colIndex:0,gridColumn:0,gridSpan:1,text:'TABLE ORIGINAL',paragraphs:[{text:'TABLE ORIGINAL',runs:[{text:'TABLE ORIGINAL'}]}]}]}]};
   const tableHtml=tableModelToHtmlView(model),blocks=[{id:'p-before',index:0,kind:'paragraph',role:'body',text:'Đoạn đầu',html:'<p>Đoạn đầu</p>'},{id:model.tableId,index:1,kind:'table',role:'body',text:'TABLE ORIGINAL',html:tableHtml,rawXml:'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>TABLE ORIGINAL</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',unsupportedFeatures:[],tableModel:model,tableData:[['TABLE ORIGINAL']]},{id:'media-1',index:2,kind:'image',role:'body',text:'Ảnh nguồn',html:'<p><img src="data:image/png;base64,AA==" alt="Ảnh nguồn"></p>'},{id:'p-after',index:3,kind:'paragraph',role:'body',text:'Đoạn cuối',html:'<p>Đoạn cuối</p>'}];
   const bodyHtml=blocks.map(b=>b.html).join(''),doc={headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội',documentType:'KẾ HOẠCH',subject:'Thử nghiệm mixed content',bodyHtml,signTitle:'',signName:'',recipients:''};
   let s=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:blocks,structuredImport:null},{blobHash:'m1-synthetic-source',generation:1,blocks});s=approveWorkspacePartition(s).snapshot;
   await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...s,versions:[],currentStep:2,sourceOrigin:'uploaded_file',uploadedBlocks:blocks,uploadedFileName:'Synthetic-mixed.txt',uploadedFileType:'txt',originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic-mixed.txt',fileType:'txt',uploadedAt:new Date().toISOString(),sourceHash:'m1-synthetic-source',bodyHtml}});return true;
  })()`),true);
  await c.reload();assert.equal(await c.waitForFunction(`document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed')==='true'`),true);
  await pointerClick(c,'.df-workspace-sidebar button[data-step="2"]');
  assert.equal(await c.waitForFunction(`document.querySelectorAll('[data-workspace-node]').length===4`),true);
  assert.equal(await c.evaluate(`document.querySelectorAll('[data-workspace-node-capability="editable"] [contenteditable="true"]').length`),2);
  assert.equal(await c.evaluate(`document.querySelector('[data-workspace-atom="table"]')?.getAttribute('data-readonly-reason')!==null`),true);
  assert.equal(await c.evaluate(`document.querySelector('[data-workspace-atom="image"]')!==null`),true);
  assert.equal(await c.evaluate(`document.querySelector('[data-workspace-cell="mixed-cell"]')?.value`),'TABLE ORIGINAL');
  const firstEditor=await c.evaluate<any>(`(()=>{const e=document.querySelector('[data-workspace-node-capability="editable"] [contenteditable="true"]'),p=e.querySelector('p')||e,r=p.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:firstEditor.x,y:firstEditor.y,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:firstEditor.x,y:firstEditor.y,button:'left',clickCount:1});await c.send('Input.insertText',{text:' SỬA'});
  assert.equal(await c.waitForFunction(`document.querySelector('[data-workspace-node-capability="editable"] [contenteditable="true"]')?.textContent.includes('SỬA')`),true);
  assert.notEqual(await waitRaw(c,(r:any)=>r.doc.bodyHtml.includes('SỬA'),5000),null,'node transaction persists to IndexedDB');
  const afterParagraph=await c.readRawDraft();assert.ok(afterParagraph.doc.bodyHtml.includes('SỬA'));
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2});
  assert.equal(await c.waitForFunction(`!document.querySelector('[data-workspace-node-capability="editable"] [contenteditable="true"]')?.textContent.includes('SỬA')`),true,'undo reverses the actual paragraph edit');
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'y',code:'KeyY',modifiers:2});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'y',code:'KeyY',modifiers:2});
  assert.equal(await c.waitForFunction(`document.querySelector('[data-workspace-node-capability="editable"] [contenteditable="true"]')?.textContent.includes('SỬA')`),true,'redo restores the actual paragraph edit');
  const tableBefore=afterParagraph.workspace.nodes.find((n:any)=>n.html.includes('data-source-table-id="mixed-table"'));
  assert.ok(tableBefore?.html.includes('TABLE ORIGINAL'));
  for(let i=0;i<4;i++){
   const visible=await c.evaluate(`(()=>{const e=document.querySelector('[data-workspace-cell="mixed-cell"]'),r=e?.getBoundingClientRect();return Boolean(r&&r.top>=0&&r.bottom<=innerHeight)})()`);if(visible)break;
   const box=await c.evaluate<any>(`(()=>{const r=document.querySelector('.df-workspace-main').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
   await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.x,y:box.y,deltaX:0,deltaY:620});await c.send('Input.synthesizeScrollGesture',{x:box.x,y:box.y,xDistance:0,yDistance:-620,speed:850,gestureSourceType:'mouse'});
  }
  await pointerClick(c,'[data-workspace-cell="mixed-cell"]');
  await c.send('Input.insertText',{text:' UPDATED'});
  const cellUpdated=await c.waitForFunction(`document.querySelector('[data-workspace-cell="mixed-cell"]')?.value==='TABLE ORIGINAL UPDATED'`,4000);
  assert.equal(cellUpdated,true,JSON.stringify(await c.evaluate<any>(`(()=>({value:document.querySelector('[data-workspace-cell="mixed-cell"]')?.value,active:document.activeElement?.outerHTML?.slice(0,240),alerts:[...document.querySelectorAll('[role="alert"]')].map(e=>e.textContent).slice(-3),revision:document.querySelector('.df-workspace-editor')?.textContent?.match(/Bản soạn r(\\d+)/)?.[1]}))()`)));
  const afterCell=await waitRaw(c,(r:any)=>r.doc.bodyHtml.includes('TABLE ORIGINAL UPDATED'),5000);assert.ok(afterCell,'cell transaction persists to IndexedDB');
  assert.equal(afterCell.workspace.source.blocks.find((b:any)=>b.id==='mixed-table').tableModel.rows[0].cells[0].text,'TABLE ORIGINAL');
  assert.ok(afterCell.workspace.workingRevision>=2);
  await c.reload();assert.equal(await c.waitForFunction(`document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed')==='true'`),true);await c.clickStep(2);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-workspace-cell="mixed-cell"]')?.value==='TABLE ORIGINAL UPDATED'`),true,'cell edit and paragraph redo survive reload');
  const restored=await c.readRawDraft();assert.ok(restored.doc.bodyHtml.includes('SỬA'));assert.ok(restored.doc.bodyHtml.includes('TABLE ORIGINAL UPDATED'));assert.ok(restored.workspace.workingRevision>afterCell.workspace.workingRevision-1);
  const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${evidence}/g2-mixed-content-1366.png`,Buffer.from(shot.result?.data??shot.data,'base64'));
 }finally{c.close();server.kill();}
});
