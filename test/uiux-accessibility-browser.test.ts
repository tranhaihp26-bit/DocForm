import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CdpClient,startTestServer} from './support/browserHarness.ts';

async function seed(c:CdpClient){
 return c.evaluate(`(async()=>{const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts'),{approveWorkspacePartition}=await import('/src/utils/workspaceTransactions.ts'),{saveDraft}=await import('/src/utils/draftStore.ts');const blocks=[{id:'a11y-body',index:0,kind:'paragraph',role:'body',text:'Body original',html:'<p>Body original</p>'}];const doc={headerProfile:'generic',orgHeader1:'',orgHeader2:'CƠ QUAN MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội',documentType:'KẾ HOẠCH',subject:'Tổng hợp',bodyHtml:blocks[0].html,signTitle:'',signName:'',recipients:''};let s=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:blocks,structuredImport:null},{blobHash:'a11y-synthetic-source',generation:1,blocks});const approved=approveWorkspacePartition(s);if(!approved.ok)throw Error(JSON.stringify(approved));s=approved.snapshot;await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...s,versions:[],currentStep:1,sourceOrigin:'uploaded_file',importReviewApprovedSourceHash:'a11y-synthetic-source',uploadedBlocks:blocks,uploadedFileName:'Synthetic-a11y.txt',uploadedFileType:'txt',originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic-a11y.txt',fileType:'txt',uploadedAt:new Date().toISOString(),sourceHash:'a11y-synthetic-source',bodyHtml:doc.bodyHtml}});return true})()`);
}

test('Workspace dialogs and export controls support keyboard use and readable contrast',async()=>{
 const port=5118,server=await startTestServer(port),c=new CdpClient('docform-g4-a11y');
 try{
  await c.launch(9618);await c.navigate(`http://127.0.0.1:${port}/`);await seed(c);await c.reload();
  assert.equal(await c.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Đối chiếu nguồn'))`,15000),true);
  assert.equal(await c.clickByText('button','Đối chiếu nguồn'),true);
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`),true);
  assert.equal(await c.waitForFunction(`document.querySelector('[role="dialog"]')?.contains(document.activeElement)`,5000),true,'Opening the dialog moves focus inside');
  await c.evaluate(`(()=>{const d=document.querySelector('[role="dialog"]'),items=[...d.querySelectorAll('button:not([disabled]),select')].filter(e=>e.offsetWidth);items.at(-1).focus()})()`);
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  assert.equal(await c.evaluate(`document.querySelector('[role="dialog"]').contains(document.activeElement)`),true,'Tab stays inside the dialog');
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  assert.equal(await c.waitForFunction(`document.querySelector('[role="dialog"]')===null`),true,'Escape closes the dialog');
  assert.equal(await c.evaluate(`document.activeElement?.textContent?.includes('Đối chiếu nguồn')`),true,'Closing returns focus to the opener');
  await c.clickStep(3);assert.equal(await c.waitForFunction(`document.querySelector('[data-candidate-safe="true"]')!==null`,15000),true);
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[data-preview-bytes-sha]'))`,15000),true);
  await c.evaluate(`(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));document.querySelector('[data-candidate-print]')?.focus()})()`);
  const audit=await c.evaluate<any>(`(()=>{const luminance=rgb=>{const [r,g,b]=rgb.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b};const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};const selectors=['[data-candidate-download]','[data-candidate-print]','[data-preview-fit]','[data-preview-actual]'];const controls=selectors.map(selector=>{const el=document.querySelector(selector);if(!el)return{selector,missing:true};const style=getComputedStyle(el);const bg=style.backgroundColor==='rgba(0, 0, 0, 0)'?'rgb(255, 255, 255)':style.backgroundColor;return{selector,name:el.getAttribute('aria-label')||el.textContent.trim(),contrast:ratio(style.color,bg),color:style.color,background:bg}});const focused=document.querySelector('[data-candidate-print]'),focusStyle=focused?getComputedStyle(focused):null;return{controls,focus:{matches:focused?.matches(':focus-visible'),width:focusStyle?.outlineWidth,style:focusStyle?.outlineStyle,color:focusStyle?.outlineColor,contrast:focusStyle?ratio(focusStyle.outlineColor,'rgb(255,255,255)'):0},documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth}})()`);
  assert.ok(audit.controls.every((c:any)=>!c.missing&&c.name&&c.contrast>=4.5),JSON.stringify(audit.controls));
  assert.equal(audit.focus.matches,true);assert.equal(audit.focus.style,'solid');assert.ok(parseFloat(audit.focus.width)>=3);assert.ok(audit.focus.contrast>=3);
  assert.ok(audit.documentWidth<=audit.viewportWidth+2);
  fs.mkdirSync('docs/superpowers/audits/2026-10-20-uiux-m1-evidence',{recursive:true});
  fs.writeFileSync('docs/superpowers/audits/2026-10-20-uiux-m1-evidence/g4-contrast.json',JSON.stringify({controls:audit.controls,focus:{...audit.focus,measuredAgainst:'rgb(255, 255, 255)'},thresholds:{normalText:4.5,nonTextAndFocus:3},viewport:{width:audit.viewportWidth,documentWidth:audit.documentWidth}},null,2));
  const shot=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('docs/superpowers/audits/2026-10-20-uiux-m1-evidence/g4-accessibility-controls.png',Buffer.from(shot.result?.data??shot.data,'base64'));
 }finally{c.close();server.kill();}
});
