import React,{useState} from 'react';
import DOMPurify from 'dompurify';
import type {ExportCandidate} from '../utils/exportCandidate.ts';
import {CandidateDocumentPreview} from './A4DocumentPreview.tsx';
import {describeExportBlocker} from '../utils/workspaceExportMessages.ts';

export function WorkspaceExport({candidate,pending,error,onPrepare,onDownload,onDownloadOriginal,onPrintCandidate,originalAvailable,onPrev,onReviewSource,onEditTarget,originalHtml}:{candidate:ExportCandidate|null;pending:boolean;error:string;onPrepare:()=>void;onDownload:()=>void;onDownloadOriginal:()=>void;onPrintCandidate:()=>void;originalAvailable:boolean;onPrev:()=>void;onReviewSource:()=>void;onEditTarget:(targetId?:string)=>void;originalHtml:string}){
 const [mode,setMode]=useState<'candidate'|'original'|'diff'>('candidate');
 const blockerDescriptions=candidate?.blockers.map(code=>describeExportBlocker(code))??[];
 const actions=[...new Map(blockerDescriptions.filter(d=>d.action).map(d=>[d.action+'|'+(d.targetId??''),d])).values()];
 return <main data-wizard-step="3" className="df-workspace-export">
  <h1>Xuất văn bản</h1><p>Chỉ tải DOCX ứng viên hiện hành sau khi cả cổng bảng, toàn văn và an toàn đều đạt.</p>
  <div className="df-ws-toolbar"><button onClick={onPrev}>Về Bước 2</button><button onClick={onPrepare} disabled={pending}>{pending?'Đang kiểm…':'Tạo / kiểm DOCX ứng viên'}</button></div>
  {error&&<p role="alert">{error}</p>}
  {!candidate&&<p role="status">{pending?'Đang tạo và kiểm ứng viên…':'Chưa có ứng viên hiện hành. Bằng chứng OOXML trước đó đã hết hiệu lực.'}</p>}
  <nav aria-label="Tải và in văn bản" className="df-ws-toolbar df-ws-export-actions">
   {originalAvailable&&<button type="button" data-original-download onClick={onDownloadOriginal}>Tải tệp gốc nguyên vẹn</button>}
   {candidate?.safe&&<>
    <button type="button" data-candidate-download data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId} onClick={onDownload}>Tải Word (.docx)</button>
    <button type="button" data-candidate-print data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId} onClick={onPrintCandidate}>In bản xem · phân trang tham khảo</button>
   </>}
  </nav>
  {candidate&&<div data-candidate-safe={String(candidate.safe)} data-candidate-instance={candidate.instanceId} data-candidate-revision={candidate.revision} data-candidate-sha={candidate.sha256}>
   <p role="status">{candidate.safe?'Đã kiểm OOXML trên DOCX ứng viên hiện hành':'Chặn xuất để bảo toàn dữ liệu'} · r{candidate.revision}</p>
   {!candidate.safe&&<><ul role="alert">{[...blockerDescriptions.map(d=>d.messageVi),...candidate.contentFidelity.violations.map(v=>v.messageVi),...candidate.tableFidelity.diffs.map(d=>d.messageVi),candidate.exportSafety.decision!=='allow'?candidate.exportSafety.userNotice:''].filter(Boolean).map((reason,i)=><li key={i}>{reason}</li>)}</ul>
    {actions.length>0&&<nav aria-label="Xử lý lý do chặn xuất" className="df-ws-toolbar">{actions.map(({action,targetId},i)=><button key={i} onClick={()=>action==='review_source'?onReviewSource():action==='edit_target'?onEditTarget(targetId):onDownloadOriginal()}>{action==='review_source'?'Xem lại nguồn':action==='edit_target'?'Mở bản soạn':'Tải tệp gốc'}</button>)}</nav>}
   </>}
   <nav aria-label="Chế độ đối chiếu" className="df-ws-toolbar">{(['candidate','original','diff'] as const).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='candidate'?'DOCX ứng viên':m==='original'?'Thân bài nguồn (đối chiếu)':'Khác biệt (tham khảo)'}</button>)}</nav>
   {mode==='candidate'&&candidate.safe&&<CandidateDocumentPreview bytes={candidate.bytes} sha256={candidate.sha256} instanceId={candidate.instanceId}/>}
   {mode!=='candidate'&&<div className="df-ws-source-html"><p>Chế độ đối chiếu tham khảo, không phải bản xuất. Nguồn bất biến và bản soạn giữ riêng.</p><h2>Thân bài nguồn</h2><div dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(originalHtml)}}/>{mode==='diff'&&<><h2>Nội dung Body ứng viên</h2><div dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(candidate.formatData.bodyHtml??'')}}/></>}</div>}
   <details data-candidate-evidence data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId}><summary>Bằng chứng OOXML, SHA-256 và kiểm nội dung</summary><p className="df-ws-hash">SHA-256: {candidate.sha256}</p><p>Instance: {candidate.instanceId} · revision: {candidate.revision}</p><pre>{JSON.stringify({blockers:candidate.blockers,table:candidate.tableFidelity.safe,content:candidate.contentFidelity.safe,safety:candidate.exportSafety.decision,evidence:candidate.evidence},null,2)}</pre></details>
  </div>}
 </main>;
}
