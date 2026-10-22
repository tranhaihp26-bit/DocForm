import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {CdpClient,startTestServer} from './support/browserHarness.ts';
import {generateND30DocxBuffer} from '../src/utils/docxExport.ts';

const evidenceDir='docs/superpowers/audits/2026-10-20-uiux-m1-evidence';

async function seedCurrentCandidate(c:CdpClient, sourceBytes:Uint8Array, bodyTexts:string[]){
 const hash=crypto.createHash('sha256').update(sourceBytes).digest('hex');
 const base64=Buffer.from(sourceBytes).toString('base64');
 const saved=await c.evaluate(`(async()=>{
  const {createWorkspaceSnapshot}=await import('/src/utils/workspaceState.ts');
  const {approveWorkspacePartition,transactWorkspace}=await import('/src/utils/workspaceTransactions.ts');
  const {saveDraft,saveSourceBlob}=await import('/src/utils/draftStore.ts');
  const hash=${JSON.stringify(hash)},binary=atob(${JSON.stringify(base64)}),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const uploadedAt=new Date().toISOString();
  await saveSourceBlob({hash,fileName:'Synthetic-source.docx',fileType:'docx',fileSize:bytes.byteLength,uploadedAt,bytes:bytes.buffer});
  const texts=${JSON.stringify(bodyTexts)},blocks=texts.map((text,index)=>({id:'body-'+index,index,kind:'paragraph',role:'body',text,html:'<p>'+text+'</p>'})),bodyHtml=blocks.map(block=>block.html).join('');
  const doc={headerProfile:'generic',orgHeader1:'',orgHeader2:'CƠ QUAN MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Tổng hợp',bodyHtml,signTitle:'',signName:'',recipients:''};
  let snapshot=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:blocks,structuredImport:null},{blobHash:hash,generation:1,blocks});
  const approved=approveWorkspacePartition(snapshot);if(!approved.ok)throw Error(JSON.stringify(approved));snapshot=approved.snapshot;
  const appended=transactWorkspace(snapshot,0,{type:'addAppendix',appendix:{id:'preview-appendix',title:'PHỤ LỤC THỬ NGHIỆM',html:'<p>Appendix page from candidate bytes</p>',sourceBlockIds:[],blocks:[],extractionStatus:'confirmed'}});if(!appended.ok)throw Error(JSON.stringify(appended));snapshot=appended.snapshot;
  await saveDraft({id:'current_active_draft',updatedAt:new Date().toISOString(),...snapshot,versions:[],currentStep:1,sourceOrigin:'uploaded_file',importReviewApprovedSourceHash:hash,uploadedBlocks:blocks,uploadedFileName:'Synthetic-source.docx',uploadedFileType:'docx',originalSnapshot:{sourceType:'uploaded_file',fileName:'Synthetic-source.docx',fileType:'docx',uploadedAt,sourceHash:hash,bodyHtml:doc.bodyHtml}});
  return hash;
 })()`);
 return saved as string;
}

test('Candidate preview, isolated print wiring and exact original download',async()=>{
 const port=5117,server=await startTestServer(port),c=new CdpClient('docform-g4-print');
  const bodyTexts=Array.from({length:6},(_,index)=>index===0?'Body original · đoạn thử nghiệm 1':`Body original · đoạn thử nghiệm ${index+1} — nội dung tổng hợp dùng cho kiểm tra phân trang`);
  const bodyHtml=bodyTexts.map(text=>`<p>${text}</p>`).join('');
  const sourceBytes=await generateND30DocxBuffer({regime:'administrative',headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Bản tổng hợp thử nghiệm',bodyHtml,signTitle:'GIÁM ĐỐC',signName:'Nguyễn Văn A',recipients:'Như trên;\nLưu: VT.',fontFamily:'Times New Roman',fontSize:13});
 try{
  fs.mkdirSync(evidenceDir,{recursive:true});
  await c.launch(9617);await c.navigate(`http://127.0.0.1:${port}/`);
  const sourceHash=await seedCurrentCandidate(c,sourceBytes,bodyTexts);
  await c.reload();
  assert.equal(await c.waitForFunction(`Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Tiếp tục tài liệu hiện tại')&&!button.disabled)`),true,'Wait for IndexedDB draft restoration before using its action');
  assert.equal(await c.clickByText('button','Tiếp tục tài liệu hiện tại'),true,'Restored source should resume the Step 1 wizard before advancing');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-wizard-step="1"]')?.getAttribute('data-flow-phase')==='ready'`),true,'Restored approved source should reach the ready phase');
  const stepOneGate=await c.evaluate<any>(`(()=>{const button=document.querySelector('[data-action="wizard-next"]');return{text:button?.textContent?.trim(),disabled:button?.disabled}})()`);
  assert.equal(stepOneGate.disabled,false,`Step 1 transition should be enabled for the restored approved source: ${JSON.stringify(stepOneGate)}`);
  assert.equal(await c.clickByText('button','Sang Bước 2: Soạn'),true,'Advance through the actual Step 1 primary action');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-current-step="2"]')!==null`),true,'Application should open Step 2 through the wizard');
  const stepTwoGate=await c.evaluate<any>(`(()=>{const button=document.querySelector('[data-action="workspace-next"]');return{text:button?.textContent?.trim(),disabled:button?.disabled}})()`);
  assert.equal(stepTwoGate.disabled,false,`Step 2 transition should be enabled for the approved workspace: ${JSON.stringify(stepTwoGate)}`);
  assert.equal(await c.clickByText('button','Tiếp tục xem & xuất'),true,'Advance through the actual Step 2 primary action');
  assert.equal(await c.waitForFunction(`document.querySelector('[data-current-step="3"]')!==null`),true,'Application should open Step 3 through the workspace header action');
  const safeReady=await c.waitForFunction(`document.querySelector('[data-candidate-safe="true"]')!==null`,30000);
  if(!safeReady){const state=await c.evaluate(`({step:document.querySelector('[data-current-step]')?.getAttribute('data-current-step'),candidate:document.querySelector('[data-candidate-safe]')?.getAttribute('data-candidate-safe'),alerts:[...document.querySelectorAll('[role="alert"]')].map(element=>element.textContent),exportText:document.querySelector('[data-wizard-step="3"]')?.textContent?.slice(0,2000)})`);assert.fail(`Current candidate was not safe: ${JSON.stringify(state)}`);}
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[data-preview-bytes-sha]'))`,15000),true);
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[data-original-download]'))`,5000),true,'Uploaded original blob should have an independent download action');
  assert.equal(await c.evaluate(`(()=>Boolean(document.querySelector('[data-candidate-preview]')&&document.querySelector('[data-candidate-print]')&&document.querySelector('[data-original-download]')))()`),true,'The candidate preview, print and original-download controls are all present');
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[data-preview-page-count]')?.getAttribute('data-preview-page-count'))`,5000),true);
  const initial=await c.evaluate<any>(`(()=>{const root=document.querySelector('[data-candidate-safe]'),preview=document.querySelector('[data-candidate-preview]'),pages=[...document.querySelectorAll('[data-preview-page]')];return{sha:root?.dataset.candidateSha,previewSha:preview?.dataset.previewBytesSha,count:pages.length,dimensions:pages.map(p=>({width:Math.round(p.getBoundingClientRect().width),height:Math.round(p.getBoundingClientRect().height)})),fit:document.querySelector('[data-preview-fit]')?.getAttribute('aria-pressed'),scrollWidth:document.querySelector('.df-candidate-preview-scroll')?.scrollWidth}})()`);
  assert.equal(initial.previewSha,initial.sha);assert.ok(initial.count>=2,'Synthetic appendix should render on another page');assert.ok(initial.dimensions.every((d:any)=>d.width>0&&d.height>0));
  await c.clickByText('button','100%');
  const actual=await c.evaluate<any>(`(()=>({pressed:document.querySelector('[data-preview-actual]')?.getAttribute('aria-pressed'),innerWidth:document.querySelector('.df-candidate-preview-scroll')?.clientWidth,scrollWidth:document.querySelector('.df-candidate-preview-scroll')?.scrollWidth,docWidth:document.documentElement.scrollWidth}))()`);
  assert.equal(actual.pressed,'true');assert.ok(actual.scrollWidth>=actual.innerWidth);assert.ok(actual.docWidth<=await c.evaluate('innerWidth+2'),'100% pan stays inside preview region');
  await c.clickByText('button','Vừa chiều rộng');
  assert.equal(await c.evaluate(`document.querySelector('[data-preview-fit]')?.getAttribute('aria-pressed')`),'true');
  await c.setViewport(390,844);await c.clickByText('button','100%');
  const mobileActual=await c.evaluate<any>(`(()=>({innerWidth:document.querySelector('.df-candidate-preview-scroll')?.clientWidth,scrollWidth:document.querySelector('.df-candidate-preview-scroll')?.scrollWidth,docWidth:document.documentElement.scrollWidth}))()`);
  assert.ok(mobileActual.scrollWidth>mobileActual.innerWidth,'100% mode exposes pan within the preview on a narrow viewport');assert.ok(mobileActual.docWidth<=392,'100% mode does not widen the document');
  await c.clickByText('button','Vừa chiều rộng');
  assert.ok(await c.evaluate(`document.querySelector('.df-candidate-preview-scroll').scrollWidth<=document.querySelector('.df-candidate-preview-scroll').clientWidth+2`),'Fit mode contains the full paper width');
  await c.setViewport(1440,900);

  await c.evaluate(`(()=>{window.__downloadBytes=null;window.__candidatePrinted=null;window.__holdPrintFonts=false;const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);window.__downloadBytes=btoa(binary)});return original(blob)};const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node instanceof HTMLIFrameElement&&node.hasAttribute('data-candidate-print-frame')){const frame=node;if(window.__holdPrintFonts)Object.defineProperty(frame.contentDocument.fonts,'ready',{configurable:true,get(){return new Promise(resolve=>window.__releasePrintFonts=resolve)}});frame.contentWindow.print=()=>{window.__candidatePrinted={sha:frame.dataset.candidateSha,instance:frame.dataset.candidateInstance,bodyText:frame.contentDocument.body.innerText,appText:document.body.innerText}}}}});observer.observe(document.documentElement,{childList:true,subtree:true})})()`);
  assert.equal(await c.clickByText('button','Tải xuống DOCX'),true,'The transformed candidate has a separate download action');
  assert.equal(await c.waitForFunction(`window.__downloadBytes!==null`,5000),true);
  const candidateDownloaded=Buffer.from(await c.evaluate<string>('window.__downloadBytes'),'base64');
  const candidateDownloadSha=crypto.createHash('sha256').update(candidateDownloaded).digest('hex');
  assert.equal(candidateDownloadSha,initial.sha,'Candidate download must match the bytes used by the candidate preview');
  await c.evaluate('window.__downloadBytes=null');
  assert.equal(await c.clickByText('button','Tải tệp gốc nguyên vẹn'),true);
  assert.equal(await c.waitForFunction(`window.__downloadBytes!==null`,5000),true);
  const downloaded=Buffer.from(await c.evaluate<string>('window.__downloadBytes'),'base64');
  assert.equal(crypto.createHash('sha256').update(downloaded).digest('hex'),sourceHash,'Original download must match the immutable stored source bytes');
  await c.clickByText('button','In bản xem');
  assert.equal(await c.waitForFunction(`window.__candidatePrinted!==null`,10000),true);
  const printed=await c.evaluate<any>('window.__candidatePrinted');
  assert.equal(printed.sha,initial.sha);assert.equal(printed.instance,await c.evaluate(`document.querySelector('[data-candidate-safe]')?.dataset.candidateInstance`));
  assert.ok(printed.bodyText.includes('Body original'));assert.ok(!printed.bodyText.includes('Xem & xuất'));
  assert.ok(!printed.bodyText.includes('Bằng chứng kiểm tra ứng viên'));assert.ok(printed.appText.includes('Bản ứng viên hiện tại'));
  const shot=await c.send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(evidenceDir,'g4-candidate-preview-fit.png'),Buffer.from(shot.result?.data??shot.data,'base64'));
  await c.evaluate('window.__candidatePrinted=null;window.__holdPrintFonts=true;window.__releasePrintFonts=null');
  await c.clickByText('button','In bản xem');
  assert.equal(await c.waitForFunction(`typeof window.__releasePrintFonts==='function'`,10000),true,'Print waits for fonts before opening');
  await c.clickStep(2);assert.equal(await c.waitForFunction(`Boolean(document.querySelector('.ProseMirror'))`),true);
  await c.evaluate(`document.querySelector('.ProseMirror').focus()`);await c.send('Input.insertText',{text:' MUTATED_DURING_PRINT'});
  assert.equal(await c.waitForFunction(`document.querySelector('.ProseMirror')?.textContent.includes('MUTATED_DURING_PRINT')`),true);
  await c.evaluate('window.__releasePrintFonts()');await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal(await c.evaluate('window.__candidatePrinted===null'),true,'A stale candidate never reaches print()');
  assert.equal(await c.evaluate(`document.querySelectorAll('[data-candidate-print-frame]').length`),1,'The stale print frame is discarded; only the completed prior frame remains');
  fs.writeFileSync(path.join(evidenceDir,'g4-preview-metrics.json'),JSON.stringify({candidateSha:initial.sha,candidateDownloadSha,previewSha:initial.previewSha,renderedPageCount:initial.count,pageDimensionsCssPx:initial.dimensions,fit:initial.fit,actual100PercentPan:actual,mobile100PercentPan:mobileActual,originalSha:sourceHash,originalDownloadSha:crypto.createHash('sha256').update(downloaded).digest('hex'),isolatedPrint:{sha:printed.sha,instance:printed.instance,containsCandidateBody:printed.bodyText.includes('Body original'),containsAppTitle:printed.bodyText.includes('Xuất văn bản')},staleCandidateStopped:true},null,2));
 }finally{c.close();server.kill();}
});
