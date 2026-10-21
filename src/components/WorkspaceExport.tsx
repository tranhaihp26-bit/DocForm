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
 const warningReasons=candidate&&!candidate.safe?[...new Set([...blockerDescriptions.map(d=>d.messageVi),...candidate.contentFidelity.violations.map(v=>v.messageVi),...candidate.tableFidelity.diffs.map(d=>d.messageVi),candidate.exportSafety.decision!=='allow'?'Bộ đối chiếu chưa xác nhận bản xuất bảo toàn đầy đủ dữ liệu nguồn. Hãy kiểm tra các khác biệt nêu trên.':''].filter(Boolean))]:[];
 const tableCount=Object.keys(candidate?.formatData.importedTables??{}).length;
 const appendixCount=candidate?.formatData.appendices?.length??0;
 const regimeLabel=candidate?.formatData.regime==='party'?'Văn bản Đảng · Hướng dẫn 05':'Hành chính · Nghị định 30';

 return <main data-wizard-step="3" className="df-workspace-export" data-candidate-state={!candidate?'missing':candidate.safe?'safe':candidate.downloadable?'warning':'blocked'} data-candidate-safe={candidate?String(candidate.safe):undefined} data-candidate-instance={candidate?.instanceId} data-candidate-revision={candidate?.revision} data-candidate-sha={candidate?.sha256}>
  <header className="df-step3-heading">
   <div>
    <p className="df-step3-eyebrow">BƯỚC 3 · HOÀN TẤT VĂN BẢN</p>
    <h1>Xem &amp; xuất</h1>
    <p className="df-step3-subtitle">Xem bản dựng DOCX trong trình duyệt, sau đó tải xuống và kiểm tra phân trang trong Word.</p>
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
     </div>

     {!candidate&&<div className="df-step3-empty-state">
      <h3>Chưa có DOCX ứng viên hiện hành</h3>
      <p>{pending?'Đang tạo và kiểm ứng viên…':'Tạo ứng viên để dựng bản xem từ đúng DOCX sẽ tải xuống.'}</p>
      <button type="button" onClick={onPrepare} disabled={pending}>{pending?'Đang kiểm…':'Tạo và kiểm DOCX ứng viên'}</button>
     </div>}
     {candidate?.downloadable&&mode==='candidate'&&previewBytes&&<CandidateDocumentPreview bytes={previewBytes} sha256={candidate.sha256} instanceId={candidate.instanceId}/>}
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

   </div>

   <aside id="df-step3-context-panel" className="df-step-context" aria-label="Trạng thái và thao tác xuất">
    <section className="df-step3-context-card df-step3-candidate-status">
     <h2>Trạng thái ứng viên</h2>
     {!candidate?<><p className="df-step3-context-state">{pending?'Đang kiểm tra ứng viên':'Chưa có ứng viên hiện hành'}</p><p>{pending?'Các cổng kiểm tra đang chạy trên bản DOCX được tạo.':'Tạo ứng viên để xem kết quả kiểm tra và bản xem theo trang.'}</p></>:<>
      <p className={`df-step3-context-state ${candidate.safe?'is-safe':'is-blocked'}`}>{candidate.safe?'Có thể xem và xuất ứng viên hiện hành':candidate.downloadable?'Có thể xuất, cần đối chiếu cảnh báo':'Không tạo được DOCX ứng viên'}</p>
      <ul className="df-step3-gate-list">
       <li><span>Đối chiếu bảng</span><strong data-gate-state={candidate.tableFidelity.safe?'safe':'blocked'}>{candidate.tableFidelity.safe?'Đã qua':'Cảnh báo'}</strong></li>
       <li><span>Đối chiếu nội dung</span><strong data-gate-state={candidate.contentFidelity.safe?'safe':'blocked'}>{candidate.contentFidelity.safe?'Đã qua':'Cảnh báo'}</strong></li>
       <li><span>Đối chiếu an toàn</span><strong data-gate-state={candidate.exportSafety.decision==='allow'?'safe':'blocked'}>{candidate.exportSafety.decision==='allow'?'Đã qua':'Cảnh báo'}</strong></li>
      </ul>
      {candidate&&!candidate.safe&&<section className="df-step3-warning-panel" role="alert" aria-labelledby="df-step3-warning-title">
       <h3 id="df-step3-warning-title">{candidate.downloadable?'Cảnh báo đối chiếu':'Không tạo được DOCX ứng viên'}</h3>
       <p>{candidate.downloadable?'Bạn vẫn có thể xem, tải hoặc in. Hãy đối chiếu bản xuất với tệp gốc trước khi phát hành.':'Không có DOCX hợp lệ để tải. Hãy tạo lại ứng viên.'}</p>
       {warningReasons.length>0&&<details className="df-step3-warning-details"><summary>{warningReasons.length} nội dung cần kiểm tra</summary><ul>{warningReasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul></details>}
       {actions.length>0&&<nav className="df-step3-blocker-actions" aria-label="Đối chiếu cảnh báo">{actions.map(({action,targetId},i)=><button type="button" key={i} onClick={()=>action==='review_source'?onReviewSource():action==='edit_target'?onEditTarget(targetId):onDownloadOriginal()}>{action==='review_source'?'Đối chiếu nguồn':action==='edit_target'?'Mở vị trí cần sửa':'Tải tệp gốc'}</button>)}</nav>}
      </section>}
      <p className="df-step3-reference-notice">Bản xem trình duyệt chỉ chia vùng theo ngắt trang, có thể không hiện đường kẻ Shape và không xác nhận số trang trong Word. Hãy kiểm tra DOCX trong Word trước khi phát hành.</p>
      {candidate.profileHeaderLines>0&&<p className="df-step3-reference-notice">Phần đầu dùng Shape của mẫu Hoa Tiêu. Hãy kiểm tra các đường kẻ trong Word.</p>}
      <p className="df-step3-candidate-inventory">{tableCount} bảng · {appendixCount} phụ lục · {regimeLabel}</p>
      <details className="df-step3-candidate-identity"><summary>SHA-256 và phiên bản</summary><code>{candidate.sha256}</code><span>revision {candidate.revision} · {candidate.instanceId}</span></details>
      <details className="df-step3-evidence" data-candidate-evidence data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId}>
       <summary>Bằng chứng kiểm tra ứng viên</summary>
       <pre>{JSON.stringify({warnings:candidate.blockers,downloadable:candidate.downloadable,table:candidate.tableFidelity.safe,content:candidate.contentFidelity.safe,safety:candidate.exportSafety.decision,profileHeaderLines:candidate.profileHeaderLines,evidence:candidate.evidence},null,2)}</pre>
      </details>
     </>}
     {error&&<p className="df-step3-error" role="alert">{error}</p>}
    </section>

    <section id="df-step3-export" className="df-step3-context-card df-step3-export-card" aria-labelledby="df-step3-export-title">
     <h2 id="df-step3-export-title">Tải xuống và in</h2>
     <button type="button" className="df-step3-prepare-button" onClick={onPrepare} disabled={pending}>{pending?'Đang kiểm…':candidate?'Kiểm tra lại ứng viên':'Tạo và kiểm DOCX ứng viên'}</button>
     {candidate?.downloadable?<>
      <button type="button" className="df-step3-download-button" data-candidate-download data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId} onClick={onDownload}>Tải xuống DOCX</button>
      <button type="button" className="df-step3-print-button" data-candidate-print data-candidate-sha={candidate.sha256} data-candidate-instance={candidate.instanceId} onClick={onPrintCandidate}>In bản xem / Lưu PDF tham khảo</button>
      <p className="df-step3-export-note">{candidate.safe?'Bản in trình duyệt chỉ mang tính tham khảo. Hãy kiểm tra phân trang trong Word trước khi phát hành.':'Tệp có cảnh báo đối chiếu; bản in trình duyệt chỉ mang tính tham khảo. Hãy kiểm tra trong Word trước khi phát hành.'}</p>
     </>:<p className="df-step3-export-note">Tạo DOCX ứng viên hợp lệ để tải hoặc in.</p>}
     {originalAvailable&&<button type="button" className="df-step3-original-button" data-original-download onClick={onDownloadOriginal}>Tải tệp gốc nguyên vẹn</button>}
     <button type="button" className="df-step3-back-button" onClick={onPrev}>Quay lại Bước 2</button>
    </section>
    <button type="button" className="df-step3-review-source" onClick={onReviewSource}>Mở đối chiếu nguồn</button>
   </aside>
  </div>
 </main>;
}
