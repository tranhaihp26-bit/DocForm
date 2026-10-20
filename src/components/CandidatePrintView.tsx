import {renderAsync} from 'docx-preview';

export type CandidatePrintResult='opened'|'stale'|'render_error';

async function sha256(bytes:Uint8Array):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Print an isolated render made from a verified copy of the current candidate bytes. */
export async function printCandidate(
 bytes:Uint8Array,
 expectedSha:string,
 instanceId:string,
 isCurrent:()=>boolean,
):Promise<CandidatePrintResult>{
 let frame:HTMLIFrameElement|undefined;
 try{
  const copy=new Uint8Array(bytes);
  if(await sha256(copy)!==expectedSha||!isCurrent())return 'stale';
  frame=document.createElement('iframe');
  frame.title='Bản xem DOCX để in';
  frame.setAttribute('aria-hidden','true');
  frame.dataset.candidatePrintFrame='true';
  frame.dataset.candidateSha=expectedSha;
  frame.dataset.candidateInstance=instanceId;
  Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'210mm',height:'297mm',border:'0',opacity:'0',pointerEvents:'none',zIndex:'-1'});
  document.body.append(frame);
  const target=frame.contentDocument;
  if(!target||!frame.contentWindow)throw new Error('Không tạo được vùng in cùng nguồn.');
  target.open();
  target.write('<!doctype html><html><head><meta charset="utf-8"><title>Bản xem DOCX</title></head><body></body></html>');
  target.close();
  const printStyle=target.createElement('style');
  printStyle.textContent='@page{margin:0}html,body{margin:0!important;padding:0!important;background:#fff!important}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.docx-wrapper{padding:0!important;background:#fff!important;box-shadow:none!important}.docx-wrapper>section.docx{margin:0 auto!important;box-shadow:none!important;break-after:page;page-break-after:always}.docx-wrapper>section.docx:last-child{break-after:auto;page-break-after:auto}@media print{html,body{overflow:visible!important;height:auto!important}.docx-wrapper{display:block!important;overflow:visible!important}.docx-wrapper>section.docx{transform:none!important;max-height:none!important}}';
  target.head.append(printStyle);
  const root=target.body;
  const copyForRender=new Uint8Array(copy);
  await renderAsync(copyForRender.buffer,root,undefined,{inWrapper:true,breakPages:true,ignoreFonts:false,experimental:true});
  await target.fonts?.ready;
  const images=[...root.querySelectorAll('img')];
  await Promise.all(images.map(image=>image.decode?.().catch(()=>undefined)));
  if(!isCurrent()){frame.remove();return 'stale';}
  const printWindow=frame.contentWindow;
  if(!printWindow)throw new Error('Cửa sổ in đã đóng trước khi dựng xong.');
  const cleanup=()=>{frame?.remove();};
  printWindow.addEventListener('afterprint',cleanup,{once:true});
  printWindow.print();
  frame.dataset.printStatus='opened';
  window.setTimeout(cleanup,120000);
  return 'opened';
 }catch{
  frame?.remove();
  return 'render_error';
 }
}
