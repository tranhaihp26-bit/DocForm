import React,{useMemo,useState} from 'react';
import DOMPurify from 'dompurify';
import type {ExportCandidate} from '../utils/exportCandidate.ts';
import {CandidateDocumentPreview} from './A4DocumentPreview.tsx';
import {describeExportBlocker} from '../utils/workspaceExportMessages.ts';
import './WorkspaceExport.css';

type WorkspaceExportProps={
 candidate:ExportCandidate|null;
 pending:boolean;
 error:string;
 onPrepare:()=>void;
 onDownload:()=>void;
 onDownloadOriginal:()=>void;
 onPrintCandidate:()=>void;
 originalAvailable:boolean;
 onPrev:()=>void;
 onReviewSource:()=>void;
 onEditTarget:(targetId?:string)=>void;
 originalHtml:string;
};

export function WorkspaceExport({candidate,pending,error,onPrepare,onDownload,onDownloadOriginal,onPrintCandidate,originalAvailable,onPrev,onReviewSource,onEditTarget,originalHtml}:WorkspaceExportProps){
 const [mode,setMode]=useState<'candidate'|'original'|'body-reference'>('candidate');
 const [contextOpen,setContextOpen]=useState(()=>typeof window==='undefined'||window.innerWidth>1535);
 // ExportCandidate.bytes is a defensive-copy getter. Read it once per immutable
 // candidate so UI state changes do not create a new preview input each render.
 const previewBytes=useMemo(()=>candidate?candidate.bytes:null,[candidate]);
 const blockerDescriptions=candidate?.blockers.map(code=>describeExportBlocker(code))??[];
 const actions=[...new Map(blockerDescriptions.filter(d=>d.action&&(d.action!=='download_original'||originalAvailable)).map(d=>[d.action+'|'+(d.targetId??''),d])).values()];
 const blockerReasons=candidate&&!candidate.safe?[...new Set([...blockerDescriptions.map(d=>d.messageVi),...candidate.contentFidelity.violations.map(v=>v.messageVi),...candidate.tableFidelity.diffs.map(d=>d.messageVi),candidate.exportSafety.decision!=='allow'?candidate.exportSafety.userNotice:''].filter(Boolean))]:[];
 const tableCount=Object.keys(candidate?.formatData.importedTables??{}).length;
 const appendixCount=candidate?.formatData.appendices?.length??0;
 const regimeLabel=candidate?.formatData.regime==='party'?'Văn bản Đảng · Hướng dẫn 05':'Hành chính · Nghị định 30';

 return <main data-wizard-step="3" className="df-workspace-export" data-candidate-state={!candidate?'missing':candidate.safe?'safe':'blocked'} data-candidate-safe={candidate?String(candidate.safe):undefined} data-candidate-instance={candidate?.instanceId} data-candidate-revision={candidate?.revision} data-candidate-sha={candidate?.sha256}>
  <header className="df-step3-heading">
   <div>
    <p className="df-step3-eyebrow">BƯỚC 3 · HOÀN TẤT VĂN BẢN</p>
    <h1>Xem &amp; xuất</h1>
    <p className="df-step3-subtitle">Duyệt bản DOCX ứng viên theo trang A4, sau đó tải xuống hoặc in.</p>
   </div>
   <button type="button" className="df-step3-context-toggle" aria-expanded={contextOpen} aria-controls="df-step3-context-panel" onClick={()=>setContextOpen(open=>!open)}>
    {contextOpen?'Ẩn thông tin xuất':'Thông tin xuất'}
   </button>
  </header>

  <div className="df-step-layout" data-context-open={String(contextOpen)}>
   <div className="df-step-content">
    <section id="df-step3-preview" className="df-step3-preview-section" aria-labelledby="df-step3-preview-title">
     <div className="df-step3-section-heading">
      <div>
       <h2 id="df-step3-preview-title">Bản ứng viên hiện tại</h2>
       <p>{candidate?`${regimeLabel} · revision ${candidate.revision}`:'Tạo và kiểm ứng viên từ nội dung đã duyệt để xem trước.'}</p>
      </div>
      {candidate&&<span className={`df-step3-status-pill ${candidate.safe?'is-safe':'is-blocked'}`} role="status">{candidate.safe?'Ứng viên đã qua cổng xuất':'Đang chặn xuất'}</span>}
     </div>

     {!candidate&&<div className="df-step3-empty-state">
      <h3>Chưa có DOCX ứng viên hiện hành</h3>
      <p>{pending?'Đang tạo và kiểm ứng viên…':'Tạo ứng viên để dựng bản xem từ đúng DOCX sẽ tải xuống.'}</p>
      <button type="button" onClick={onPrepare} disabled={pending}>{pending?'Đang kiểm…':'Tạo và kiểm DOCX ứng viên'}</button>
     </div>}
     {candidate&&!candidate.safe&&<div className="df-step3-blocked-state" role="alert">
      <h3>Chưa thể xem hoặc xuất ứng viên này</h3>
      <p>Hãy xử lý các mục được nêu dưới đây rồi tạo lại ứng viên. Tệp nguồn và nội dung đang soạn vẫn được giữ nguyên.</p>
      <ul>{blockerReasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul>
      {actions.length>0&&<nav className="df-step3-blocker-actions" aria-label="Xử lý lý do chặn xuất">{actions.map(({action,targetId},i)=><button type="button" key={i} onClick={()=>action==='review_source'?onReviewSource():action==='edit_target'?onEditTarget(targetId):onDownloadOriginal()}>{action==='review_source'?'Đối chiếu nguồn':action==='edit_target'?'Mở vị trí cần sửa':'Tải tệp gốc'}</button>)}</nav>}
     </div>}
     {candidate?.safe&&candidate.profileHeaderLines>0&&<p className="df-step3-reference-notice">Phần đầu đã dùng mẫu Hoa Tiêu chuẩn. Đường kẻ trong tệp gốc được thay bằng Shape của mẫu; hãy đối chiếu bản xem trước khi phát hành.</p>}
     {candidate?.safe&&mode==='candidate'&&previewBytes&&<CandidateDocumentPreview bytes={previewBytes} sha256={candidate.sha256} instanceId={candidate.instanceId}/>}
    </section>

    <section id="df-step3-reference" className="df-step3-reference-section" aria-labelledby="df-step3-reference-title">
     <div className="df-step3-section-heading">
      <div>
       <h2 id="df-step3-reference-title">Đối chiếu Body</h2>
       <p>Chỉ hiển thị phần thân bài làm tài liệu tham khảo.</p>
      </div>
     </div>
     <nav className="df-step3-mode-tabs" aria-label="Chế độ xem">
      <button type="button" aria-pressed={mode==='candidate'} onClick={()=>setMode('candidate')}>DOCX ứng viên</button>
      <button type="button" aria-pressed={mode==='original'} onClick={()=>setMode('original')}>Body nguồn · tham khảo</button>
      <button type="button" aria-pressed={mode==='body-reference'} onClick={()=>setMode('body-reference')}>Body nguồn ↔ ứng viên</button>
     </nav>
     {mode!=='candidate'&&<div className="df-step3-body-reference">
      <p className="df-step3-reference-notice">Đây là đối chiếu tham khảo riêng phần Body. Phần này không thể hiện bố cục toàn văn, phân trang hoặc thay đổi theo từng vị trí.</p>
      {mode==='original'&&<article><h3>Body nguồn</h3><div className="df-ws-source-html" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(originalHtml)}}/></article>}
      {mode==='body-reference'&&<div className="df-step3-body-columns">
       <article><h3>Body nguồn</h3><div className="df-ws-source-html" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(originalHtml)}}/></article>
       <article><h3>Body ứng viên</h3>{candidate?<div className="df-ws-source-html" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(candidate.formatData.bodyHtml??'')}}/>:<p>Chưa có ứng viên hiện hành để đối chiếu.</p>}</article>
      </div>}
     </div>}
    </section>

    {candidate&&<details className="df-step3-evidence" data-candidate-evidence data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId}>
     <summary>Bằng chứng kiểm tra ứng viên</summary>
     <p className="df-ws-hash">SHA-256: {candidate.sha256}</p>
     <p>Instance: {candidate.instanceId} · revision: {candidate.revision}</p>
     <pre>{JSON.stringify({blockers:candidate.blockers,table:candidate.tableFidelity.safe,content:candidate.contentFidelity.safe,safety:candidate.exportSafety.decision,profileHeaderLines:candidate.profileHeaderLines,evidence:candidate.evidence},null,2)}</pre>
    </details>}
    {error&&<p className="df-step3-error" role="alert">{error}</p>}
   </div>

   <aside id="df-step3-context-panel" className="df-step-context" aria-label="Trạng thái và thao tác xuất">
    <section className="df-step3-context-card df-step3-candidate-status">
     <h2>Trạng thái ứng viên</h2>
     {!candidate?<><p className="df-step3-context-state">{pending?'Đang kiểm tra ứng viên':'Chưa có ứng viên hiện hành'}</p><p>{pending?'Các cổng kiểm tra đang chạy trên bản DOCX được tạo.':'Tạo ứng viên để xem kết quả kiểm tra và bản xem theo trang.'}</p></>:<>
      <p className={`df-step3-context-state ${candidate.safe?'is-safe':'is-blocked'}`}>{candidate.safe?'Có thể xem và xuất ứng viên hiện hành':'Ứng viên hiện hành đang bị chặn'}</p>
      <ul className="df-step3-gate-list">
       <li><span>Cổng bảng</span><strong data-gate-state={candidate.tableFidelity.safe?'safe':'blocked'}>{candidate.tableFidelity.safe?'Đã qua':'Cần xử lý'}</strong></li>
       <li><span>Cổng nội dung</span><strong data-gate-state={candidate.contentFidelity.safe?'safe':'blocked'}>{candidate.contentFidelity.safe?'Đã qua':'Cần xử lý'}</strong></li>
       <li><span>Điều kiện an toàn</span><strong data-gate-state={candidate.exportSafety.decision==='allow'?'safe':'blocked'}>{candidate.exportSafety.decision==='allow'?'Cho phép':'Đang chặn'}</strong></li>
      </ul>
      <p className="df-step3-candidate-inventory">{tableCount} bảng · {appendixCount} phụ lục · {regimeLabel}</p>
      <details className="df-step3-candidate-identity"><summary>SHA-256 và phiên bản</summary><code>{candidate.sha256}</code><span>revision {candidate.revision} · {candidate.instanceId}</span></details>
     </>}
    </section>

    <section id="df-step3-export" className="df-step3-context-card df-step3-export-card" aria-labelledby="df-step3-export-title">
     <h2 id="df-step3-export-title">Tải xuống và in</h2>
     <button type="button" className="df-step3-prepare-button" onClick={onPrepare} disabled={pending}>{pending?'Đang kiểm…':candidate?'Kiểm tra lại ứng viên':'Tạo và kiểm DOCX ứng viên'}</button>
     {candidate?.safe?<>
      <button type="button" className="df-step3-download-button" data-candidate-download data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId} onClick={onDownload}>Tải xuống DOCX</button>
      <button type="button" className="df-step3-print-button" data-candidate-print data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId} onClick={onPrintCandidate}>In / Lưu PDF bằng trình duyệt</button>
      <p className="df-step3-export-note">Bản in dùng đúng DOCX ứng viên hiện hành. Hãy kiểm tra phân trang trong Word trước khi phát hành.</p>
     </>:<p className="df-step3-export-note">Tải và in chỉ mở khi ứng viên hiện hành qua các cổng kiểm tra.</p>}
     {originalAvailable&&<button type="button" className="df-step3-original-button" data-original-download onClick={onDownloadOriginal}>Tải tệp gốc nguyên vẹn</button>}
     <button type="button" className="df-step3-back-button" onClick={onPrev}>Quay lại Bước 2</button>
    </section>
    <button type="button" className="df-step3-review-source" onClick={onReviewSource}>Mở đối chiếu nguồn</button>
   </aside>
  </div>
 </main>;
}
