import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {CdpClient,startTestServer} from './support/browserHarness.ts';
import {composeDocumentFormatData} from '../src/utils/documentComposer.ts';
import {generateND30DocxUint8Array} from '../src/utils/docxExport.ts';
import {prepareExportCandidate,type ExportCandidateSnapshot} from '../src/utils/exportCandidate.ts';

test('Workspace export UI distinguishes review-only and blocked candidate states',async()=>{
 const port=5127,server=await startTestServer(port),c=new CdpClient('docform-g10-export-state');
 const input:ExportCandidateSnapshot={doc:{headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 07 tháng 11 năm 2026',documentType:'KẾ HOẠCH',subject:'Kiểm tra trạng thái xuất',bodyHtml:'<p>Nội dung mẫu dùng cho bản đối chiếu.</p>',signTitle:'',signName:'',recipients:'',appendices:[]},standardType:'state',reviewBlocks:[],structuredImport:null};
 try{
  const format=composeDocumentFormatData(input),goodBytes=await generateND30DocxUint8Array(format);
  const zip=await JSZip.loadAsync(goodBytes),xml=await zip.file('word/document.xml')!.async('string');
  assert.ok(xml.includes('Nội dung mẫu dùng cho bản đối chiếu.'));
  zip.file('word/document.xml',xml.replace('Nội dung mẫu dùng cho bản đối chiếu.',''));
  const reviewOnly=await prepareExportCandidate(input,async()=>zip.generateAsync({type:'uint8array'}));
  const blocked=await prepareExportCandidate(input,async()=>new JSZip().file('wrong.txt','synthetic invalid candidate').generateAsync({type:'uint8array'}));
  assert.equal(reviewOnly.safe,false);assert.equal(reviewOnly.downloadable,false);assert.equal(reviewOnly.reviewDownloadable,true);assert.equal(reviewOnly.canRenderDiagnostic,true);
  assert.equal(blocked.safe,false);assert.equal(blocked.downloadable,false);assert.equal(blocked.reviewDownloadable,false);assert.equal(blocked.canRenderDiagnostic,false);
  const fixtures=[reviewOnly,blocked].map((candidate,index)=>({id:index===0?'review-only':'blocked',candidate:{...candidate,bytesBase64:Buffer.from(candidate.bytes).toString('base64')}}));
  await c.launch(9627);await c.navigate(`http://127.0.0.1:${port}/`);
  assert.equal(await c.evaluate(`(async()=>{const {mountWorkspaceExportStateFixtures}=await import('/test/support/workspaceExportStateMount.tsx');mountWorkspaceExportStateFixtures(${JSON.stringify(fixtures)});return true})()`),true);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-workspace-export-state-fixture="review-only"] [data-candidate-state="review-only"]')&&document.querySelector('[data-workspace-export-state-fixture="blocked"] [data-candidate-state="blocked"]')`),true,'Both candidate states should render in the real React UI');
  const reviewState=await c.evaluate<any>(`(()=>{const host=document.querySelector('[data-workspace-export-state-fixture="review-only"]'),root=host?.querySelector('[data-candidate-state]'),button=host?.querySelector('[data-candidate-review-download]'),print=host?.querySelector('[data-candidate-print]');return{state:root?.getAttribute('data-candidate-state'),safe:root?.getAttribute('data-candidate-safe'),reviewable:root?.getAttribute('data-candidate-review-downloadable'),sha:root?.getAttribute('data-candidate-sha'),buttonSha:button?.getAttribute('data-candidate-sha'),buttonDisabled:button?.disabled,printDisabled:print?.disabled,validatedDownload:host?.querySelector('[data-candidate-download]'),title:host?.querySelector('#df-step3-export-title')?.textContent,previewSha:host?.querySelector('[data-preview-bytes-sha]')?.getAttribute('data-preview-bytes-sha')}})()`);
  assert.equal(reviewState.state,'review-only');assert.equal(reviewState.safe,'false');assert.equal(reviewState.reviewable,'true');
  assert.equal(reviewState.sha,reviewOnly.sha256);assert.equal(reviewState.buttonSha,reviewOnly.sha256);assert.equal(reviewState.buttonDisabled,false);assert.equal(reviewState.printDisabled,true);assert.equal(reviewState.validatedDownload,null);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-workspace-export-state-fixture="review-only"] [data-preview-bytes-sha]')?.getAttribute('data-preview-bytes-sha')===${JSON.stringify(reviewOnly.sha256)}`),true,'Review preview must render the exact diagnostic candidate bytes');
  assert.match(reviewState.title,/đối chiếu/i);assert.doesNotMatch(reviewState.title,/ban hành/i);
  assert.equal(await c.evaluate(`(()=>{document.querySelector('[data-workspace-export-state-fixture="review-only"] [data-candidate-review-download]').click();return window.__workspaceExportStateCalls?.['review-only:review']??0})()`),1,'Review action should route only to the explicitly labeled review-download callback');
  const blockedState=await c.evaluate<any>(`(()=>{const host=document.querySelector('[data-workspace-export-state-fixture="blocked"]'),root=host?.querySelector('[data-candidate-state]'),download=host?.querySelector('[data-candidate-download]'),print=host?.querySelector('[data-candidate-print]');return{state:root?.getAttribute('data-candidate-state'),safe:root?.getAttribute('data-candidate-safe'),reviewable:root?.getAttribute('data-candidate-review-downloadable'),sha:root?.getAttribute('data-candidate-sha'),downloadDisabled:download?.disabled,printDisabled:print?.disabled,reviewDownload:host?.querySelector('[data-candidate-review-download]'),preview:host?.querySelector('[data-preview-bytes-sha]'),notice:host?.querySelector('.df-step3-unavailable-state')?.textContent}})()`);
  assert.equal(blockedState.state,'blocked');assert.equal(blockedState.safe,'false');assert.equal(blockedState.reviewable,'false');assert.equal(blockedState.sha,blocked.sha256);
  assert.equal(blockedState.downloadDisabled,true);assert.equal(blockedState.printDisabled,true);assert.equal(blockedState.reviewDownload,null);assert.equal(blockedState.preview,null);
  assert.match(blockedState.notice,/không thể dựng bản xem an toàn/i);
 }finally{c.close();server.kill();}
});
