import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CdpClient,startTestServer} from './support/browserHarness.ts';

async function visiblePointer(c:CdpClient,selector:string){
 for(let i=0;i<12;i++){
  const expr='(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return{visible:false,x:0,y:0,top:0,bottom:0,hit:false};const r=e.getBoundingClientRect(),visible=r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight,x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return{visible,x,y,top:r.top,bottom:r.bottom,hit:h===e||e.contains(h)}})()';
  const v=await c.evaluate<{visible:boolean;x:number;y:number;top:number;bottom:number;hit:boolean}>(expr);
  if(v.visible&&v.hit){await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:v.x,y:v.y,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:v.x,y:v.y,button:'left',clickCount:1});return;}
  const box=await c.evaluate<any>('(()=>{const e=document.querySelector(".df-workspace-main")||document.documentElement,r=e.getBoundingClientRect();return{x:r.left+Math.max(10,r.width/2),y:r.top+Math.max(10,Math.min(r.height-10,innerHeight/2))}})()');
  const delta=v.top<0?-620:620;
  await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.x,y:box.y,deltaX:0,deltaY:delta});
  await c.send('Input.synthesizeScrollGesture',{x:box.x,y:box.y,xDistance:0,yDistance:-delta,speed:850,gestureSourceType:'mouse'});
 }
 assert.fail('could not make pointer hit '+selector);
}
async function waitRaw(c:CdpClient,predicate:(r:any)=>boolean,timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){const r=await c.readRawDraft();if(r&&predicate(r))return r;await new Promise(resolve=>setTimeout(resolve,100));}return null;}

test('Workspace AI sends one selected paragraph and candidate gate explains unsupported media',async()=>{
 const port=5114,cdp=9614,server=await startTestServer(port),c=new CdpClient('docform-m1-ai-export');
 const evidence='docs/superpowers/audits/2026-10-20-uiux-m1-evidence';fs.mkdirSync(evidence,{recursive:true});
 try{
  await c.launch(cdp);await c.navigate('http://127.0.0.1:'+port);
  const seed='(async()=>{const {createWorkspaceSnapshot}=await import("/src/utils/workspaceState.ts"),{approveWorkspacePartition}=await import("/src/utils/workspaceTransactions.ts"),{tableModelToHtmlView}=await import("/src/shared/tableModel.ts"),{saveDraft}=await import("/src/utils/draftStore.ts");const model={tableId:"ai-table",rowsCount:1,columnsCount:1,gridColumnsTwips:[9360],tableWidthTwips:9360,widthType:"dxa",alignment:"center",hasBorders:true,rows:[{rowIndex:0,isHeader:false,cantSplit:true,cells:[{cellId:"ai-cell",rowIndex:0,colIndex:0,gridColumn:0,gridSpan:1,text:"BẢNG NGUỒN",paragraphs:[{text:"BẢNG NGUỒN",runs:[{text:"BẢNG NGUỒN"}]}]}]}]};const tableHtml=tableModelToHtmlView(model),blocks=[{id:"ai-p1",index:0,kind:"paragraph",role:"body",text:"Đoạn đầu",html:"<p>Đoạn đầu</p>"},{id:"ai-table",index:1,kind:"table",role:"body",text:"BẢNG NGUỒN",html:tableHtml,rawXml:"<w:tbl><w:tr><w:tc><w:p><w:r><w:t>BẢNG NGUỒN</w:t></w:r></w:p></w:tc></w:tr></w:tbl>",unsupportedFeatures:[],tableModel:model,tableData:[["BẢNG NGUỒN"]]},{id:"ai-image",index:2,kind:"paragraph",role:"body",text:"Ảnh thử",html:"<p><img src=\\"data:image/png;base64,AA==\\" alt=\\"Ảnh thử\\"></p>"},{id:"ai-p2",index:3,kind:"paragraph",role:"body",text:"Đoạn cuối",html:"<p>Đoạn cuối</p>"}];const bodyHtml=blocks.map(b=>b.html).join(""),doc={headerProfile:"generic",orgHeader1:"CƠ QUAN MẪU",orgHeader2:"ĐƠN VỊ MẪU",nationalHeader1:"CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",nationalHeader2:"Độc lập - Tự do - Hạnh phúc",referenceNumber:"Số: 01/KH",locationAndDate:"Hà Nội",documentType:"KẾ HOẠCH",subject:"Thử nghiệm",bodyHtml,signTitle:"",signName:"",recipients:""};let s=createWorkspaceSnapshot({doc,standardType:"state",reviewBlocks:blocks,structuredImport:null},{blobHash:"synthetic-ai-source",generation:1,blocks});s=approveWorkspacePartition(s).snapshot;await saveDraft({id:"current_active_draft",updatedAt:new Date().toISOString(),...s,versions:[],currentStep:1,sourceOrigin:"uploaded_file",uploadedBlocks:blocks,uploadedFileName:"Synthetic-ai.txt",uploadedFileType:"txt",originalSnapshot:{sourceType:"uploaded_file",fileName:"Synthetic-ai.txt",fileType:"txt",uploadedAt:new Date().toISOString(),sourceHash:"synthetic-ai-source",bodyHtml}});return true;})()';
  assert.equal(await c.evaluate(seed),true);await c.reload();
  assert.equal(await c.waitForFunction('document.querySelector("[data-step=\\"2\\"]")?.getAttribute("data-step-allowed")==="true"'),true);
  await c.evaluate('(()=>{const original=window.fetch.bind(window);window.__refineCalls=[];window.fetch=(input,init)=>{const url=typeof input==="string"?input:(input&&input.url)||"";if(url.includes("/api/ai/refine-text")){const body=JSON.parse(init.body);return new Promise(resolve=>window.__refineCalls.push({body,resolve:payload=>resolve(new Response(JSON.stringify(payload),{status:200,headers:{"Content-Type":"application/json"}}))}));}return original(input,init);};})()');
  await visiblePointer(c,'.df-workspace-sidebar button[data-step="2"]');
  assert.equal(await c.waitForFunction('document.querySelector("[data-ai-target-node]")!==null'),true);
  await visiblePointer(c,'button[data-ai-target-node]');
  assert.equal(await c.waitForFunction('window.__refineCalls.length===1'),true);
  const payload=await c.evaluate<any>('window.__refineCalls[0].body');assert.equal(payload.text,'<p>Đoạn đầu</p>');assert.doesNotMatch(payload.text,/BẢNG NGUỒN|Đoạn cuối|<img/);
  await c.evaluate('window.__refineCalls[0].resolve({success:true,source:"mock_fixture",refined:"<p>Đoạn đầu đã sửa</p>"})');
  assert.equal(await c.waitForFunction('document.querySelector("[data-ai-target-kind=\\"node\\"]")!==null'),true);
  const proposal=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(evidence+'/g3-ai-node-proposal.png',Buffer.from(proposal.result?.data??proposal.data,'base64'));
  await visiblePointer(c,'[data-ai-target-kind="node"] [data-ai-cancel]');
  assert.equal(await c.waitForFunction('document.querySelector("[data-ai-target-kind=\\"node\\"]")===null'),true);
  const canceled=await c.readRawDraft();assert.equal(canceled.doc.bodyHtml.includes('Đoạn đầu đã sửa'),false,'cancel closes the proposal without editing the draft');
  await visiblePointer(c,'button[data-ai-target-node]');
  assert.equal(await c.waitForFunction('window.__refineCalls.length===2'),true);
  const secondPayload=await c.evaluate<any>('window.__refineCalls[1].body');assert.equal(secondPayload.text,'<p>Đoạn đầu</p>');
  await c.evaluate('window.__refineCalls[1].resolve({success:true,source:"mock_fixture",refined:"<p>Đoạn đầu đã sửa</p>"})');
  assert.equal(await c.waitForFunction('document.querySelector("[data-ai-target-kind=\\"node\\"]")!==null'),true);
  await visiblePointer(c,'[data-ai-target-kind="node"] [data-ai-accept]');
  const persisted=await waitRaw(c,(r:any)=>r.doc.bodyHtml.includes('Đoạn đầu đã sửa'));assert.ok(persisted,'node proposal applies through the workspace transaction');
  assert.ok(persisted.doc.bodyHtml.includes('BẢNG NGUỒN'));assert.ok(persisted.doc.bodyHtml.includes('<img'));

  await visiblePointer(c,'button[data-ai-target-node]');
  assert.equal(await c.waitForFunction('window.__refineCalls.length===3'),true);
  const secondNodeId=await c.evaluate<string>('document.querySelectorAll("[data-workspace-node-capability=\\"editable\\"]")[1]?.getAttribute("data-workspace-node")||""');
  assert.ok(secondNodeId);
  const secondEditor='[data-workspace-node='+JSON.stringify(secondNodeId)+'] [contenteditable="true"]';
  await visiblePointer(c,secondEditor);
  await c.send('Input.insertText',{text:' ĐÃ SỬA'});
  assert.ok(await waitRaw(c,(r:any)=>r.doc.bodyHtml.includes('ĐÃ SỬA')),'concurrent paragraph edit creates a new working revision');
  await c.evaluate('window.__refineCalls[2].resolve({success:true,source:"mock_fixture",refined:"<p>AI CŨ</p>"})');
  assert.equal(await c.waitForFunction('document.querySelector("[data-ai-target-kind=\\"node\\"]")===null'),true);
  assert.equal(await c.waitForFunction('/cũ|hết hiệu lực|đã thay đổi/i.test(document.querySelector("[role=alert]")?.textContent||"")'),true);
  await visiblePointer(c,'button[data-ai-target-node]');
  assert.equal(await c.waitForFunction('window.__refineCalls.length===4'),true);
  await c.evaluate('window.__refineCalls[3].resolve({success:false,error:"Lỗi AI giả lập"})');
  assert.equal(await c.waitForFunction('document.querySelector("[data-ai-target-kind=\\"node\\"]")===null&&/Lỗi AI giả lập/.test(document.querySelector("[role=alert]")?.textContent||"")'),true);

  await visiblePointer(c,'button[data-action="workspace-next"]');
  assert.equal(await c.waitForFunction('document.querySelector("[data-candidate-safe=\\"false\\"]")!==null',15000),true);
  const unsafe=await c.evaluate<any>('(()=>{const e=document.querySelector("[data-candidate-safe=\\"false\\"]");return{text:e?.textContent,alert:e?.querySelector("[role=alert]")?.textContent,hasDownload:!!document.querySelector("[data-candidate-download]"),hasPreview:!!document.querySelector(".df-candidate-preview-scroll")}})()');
  assert.equal(unsafe.hasDownload,false);assert.equal(unsafe.hasPreview,false);assert.match(unsafe.alert,/ảnh|phương tiện|nguồn/i);assert.doesNotMatch(unsafe.alert,/unsupported_working_media/);
  const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(evidence+'/g3-unsafe-candidate.png',Buffer.from(shot.result?.data??shot.data,'base64'));
 }finally{c.close();server.kill();}
});
