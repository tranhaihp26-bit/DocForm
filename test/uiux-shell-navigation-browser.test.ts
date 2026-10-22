import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CdpClient,startTestServer} from './support/browserHarness.ts';

async function pointerClick(c:CdpClient,selector:string){
 const point=await c.evaluate<{x:number;y:number;hit:boolean}>(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return{x:0,y:0,hit:false};const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y)===e||e.contains(document.elementFromPoint(x,y));return{x,y,hit}})()`);
 assert.equal(point.hit,true,`pointer can hit ${selector}`);
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
 await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
}

async function seedLongTemplate(c:CdpClient){
 return c.evaluate(`(async()=>{
  const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
  const {saveDraft}=await import('/src/utils/draftStore.ts');
  const bodyHtml=Array.from({length:48},(_,i)=>'<p>Đoạn thử nghiệm '+(i+1)+' · '+('Nội dung văn bản cuộn an toàn. '.repeat(8))+'</p>').join('');
  const doc={headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ THỬ NGHIỆM',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội',documentType:'KẾ HOẠCH',subject:'Tài liệu kiểm tra cuộn',bodyHtml,signTitle:'',signName:'',recipients:''};
  const s=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:[],structuredImport:null});
  await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...s,versions:[],currentStep:2,sourceOrigin:'system_template',uploadedBlocks:[],uploadedFileName:'',uploadedFileType:null,originalSnapshot:{sourceType:'system_template',fileName:'Mẫu tổng hợp thử nghiệm',fileType:'template',sourceId:'synthetic-long',uploadedAt:new Date().toISOString(),bodyHtml,rawText:'synthetic'}});
  return true;
 })()`);
}

test('M1 shell keeps all steps reachable and switches to natural page scrolling at tablet/mobile widths',async()=>{
 const port=5097,cdpPort=9597,server=await startTestServer(port),c=new CdpClient('docform-m1-shell');
 const evidence='docs/superpowers/audits/2026-10-20-uiux-m1-evidence';fs.mkdirSync(evidence,{recursive:true});
 try{
  await c.launch(cdpPort);await c.navigate(`http://127.0.0.1:${port}`);
  assert.equal(await c.evaluate(`document.querySelectorAll('.df-workspace-sidebar button[data-step]').length`),3);
  assert.match(await c.evaluate(`document.querySelector('header [aria-label^="Tài liệu:"]')?.textContent||''`),/Văn bản mới · chưa chọn nguồn/);
  assert.match(await c.evaluate(`document.querySelector('.df-workspace-sidebar button[data-step="3"]')?.textContent||''`),/Xem & xuất/);
  await pointerClick(c,'.df-workspace-sidebar button[data-step="2"]');
  assert.match(await c.evaluate(`document.body.innerText`),/Cần một nguồn tài liệu/);
  assert.equal(await c.evaluate(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')`),'1');
  assert.equal(await seedLongTemplate(c),true);await c.reload();
  assert.equal(await c.waitForFunction(`document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed')==='true'`),true);
  assert.equal(await c.clickStep(2),true);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-wizard-step="2"]')!==null`),true);
  for(const [width,height] of [[1366,768],[768,900],[390,844]] as const){
   await c.setViewport(width,height);
   assert.equal(await c.evaluate(`document.documentElement.scrollWidth<=innerWidth+2`),true,`no horizontal overflow at ${width}`);
   const before=await c.evaluate<any>(`(()=>{const main=document.querySelector('.df-workspace-main'),r=main.getBoundingClientRect();return{y:document.scrollingElement?.scrollTop||0,main:main?.scrollTop,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight,mainOverflow:getComputedStyle(main).overflowY,shellOverflow:getComputedStyle(document.querySelector('.df-app-shell')).overflow,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.className}})()`);
   const shot=await c.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(`${evidence}/g1-${width}-before.png`,Buffer.from(shot.result?.data??shot.data,'base64'));
   const box=await c.evaluate<any>(`(()=>{const r=document.querySelector('.df-workspace-main').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`),x=box.x,y=box.y;
   await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:620});
   await new Promise(r=>setTimeout(r,180));
   await c.send('Input.synthesizeScrollGesture',{x,y,xDistance:0,yDistance:-620,speed:900,gestureSourceType:'mouse'});
   await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'PageDown',code:'PageDown'});
   await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown',code:'PageDown'});
   const after=await c.evaluate<any>(`(()=>{const main=document.querySelector('.df-workspace-main');return{y:document.scrollingElement?.scrollTop||0,main:main?.scrollTop,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight,mainOverflow:getComputedStyle(main).overflowY,shellOverflow:getComputedStyle(document.querySelector('.df-app-shell')).overflow}})()`);
   assert.ok(after.y>before.y||after.main>before.main,`wheel and PageDown move visible content at ${width}: ${JSON.stringify({before,after})}`);
   if(width>1000)assert.equal(after.mainOverflow,'auto',`desktop main is its own scroller at ${width}`);
   else assert.notEqual(after.shellOverflow,'hidden',`tablet/mobile shell does not trap document scroll at ${width}`);
   const afterShot=await c.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync(`${evidence}/g1-${width}-after.png`,Buffer.from(afterShot.result?.data??afterShot.data,'base64'));
  }
  await c.setViewport(1366,768);
  const links=await c.evaluate<any>(`(()=>{const e=document.querySelector('.df-ws-group-links'),r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await c.send('Input.synthesizeScrollGesture',{x:links.x,y:links.y,xDistance:0,yDistance:-720,speed:850,gestureSourceType:'mouse'});
  assert.equal(await c.waitForFunction(`(()=>{const e=document.querySelector('[data-workspace-group-link="9"]'),r=e?.getBoundingClientRect();return Boolean(r&&r.top>=0&&r.bottom<=innerHeight)})()`),true,'group 9 can be brought into the sidebar viewport');
  await pointerClick(c,'[data-workspace-group-link="9"]');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-workspace-group="9"]')?.open===true`),true);
  assert.equal(await c.waitForFunction(`document.querySelector('.df-workspace-main').scrollTop>100`),true,'group link scrolls the main pane to group 9');
  const group9=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${evidence}/g1-1366-group9.png`,Buffer.from(group9.result?.data??group9.data,'base64'));
  await c.setViewport(390,844);
  for(let i=0;i<8;i++){
   await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:195,y:700,deltaX:0,deltaY:1200});
   await c.send('Input.synthesizeScrollGesture',{x:195,y:700,xDistance:0,yDistance:-1500,speed:900,gestureSourceType:'mouse'});
  }
  assert.equal(await c.waitForFunction(`document.querySelector('[data-action="workspace-next"]')?.disabled===false`),true,'step 2 continue action is enabled for approved template');
  assert.equal(await c.waitForFunction(`(()=>{const e=document.querySelector('[data-action="workspace-next"]'),r=e?.getBoundingClientRect();return Boolean(r&&r.top>=0&&r.bottom<=innerHeight)})()`),true,`mobile continue action is brought into view: ${JSON.stringify(await c.evaluate<any>(`(()=>{const e=document.querySelector('[data-action="workspace-next"]'),r=e?.getBoundingClientRect();return{scroll:document.scrollingElement?.scrollTop,scrollHeight:document.scrollingElement?.scrollHeight,rect:r&&{top:r.top,bottom:r.bottom},height:innerHeight}})()`))}`);
  const mobileCta=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${evidence}/g1-390-cta.png`,Buffer.from(mobileCta.result?.data??mobileCta.data,'base64'));
  await pointerClick(c,'[data-action="workspace-next"]');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-current-step]')?.getAttribute('data-current-step')==='3'`),true,'step 2 CTA uses the export gate');
 }finally{c.close();server.kill();}
});
