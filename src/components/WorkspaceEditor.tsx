import React,{useRef,useState} from 'react';
import DOMPurify from 'dompurify';
import {projectWorkspace} from '../utils/workspaceProjection.ts';
import {assessTableCellCapabilities,workspaceNodeTableId,type EditorSafety} from '../utils/workspaceCapabilities.ts';
import {canEnterWorkspaceStep,type EditableNode,type WorkspaceSnapshot} from '../utils/workspaceState.ts';
import type {WorkspaceAction} from '../utils/workspaceTransactions.ts';
import type {TableModel} from '../shared/tableModel.ts';
import {WorkspaceCanvasEditor} from './ND30Editor.tsx';
import {useAccessibleDialog} from '../utils/useAccessibleDialog.ts';

const labels:Record<string,string>={nationalHeader1:'Quốc hiệu / Tiêu đề',nationalHeader2:'Tiêu ngữ',orgHeader1:'Cơ quan cấp trên',orgHeader2:'Cơ quan ban hành',referenceNumber:'Số, ký hiệu',locationAndDate:'Địa danh và ngày tháng',documentType:'Tên loại',subject:'Trích yếu',signTitle:'Chức vụ người ký',signName:'Họ tên người ký',recipients:'Nơi nhận'};
type ProjectedNode=EditableNode&{safety:EditorSafety;editable:boolean};
type Canvas={id:string;title:string;nodes:ProjectedNode[]};

function capabilityMessage(reason:string):string{
 if(reason==='table_source_evidence_unavailable')return 'Thiếu bằng chứng nguồn đủ để mở sửa ô này.';
 if(reason==='merged_cell_readonly')return 'Ô gộp; cấu trúc ô vẫn được giữ nguyên.';
 if(reason==='multi_paragraph_cell_readonly')return 'Ô có nhiều đoạn; thao tác sửa ô chưa chứng minh bảo toàn cấu trúc.';
 if(reason==='rich_cell_runs_readonly')return 'Ô có định dạng hoặc nhiều lượt chữ; chỉ đọc để giữ nguyên.';
 if(reason==='template_table_not_registered')return 'Bảng mẫu chưa được đăng ký trong mô hình làm việc.';
 return 'Ô chỉ đọc để bảo toàn định dạng và dữ liệu nguồn.';
}

export function WorkspaceEditor({snapshot,active,initialCanvasId,onCanvasSelected,onAction,onPartition,onRefine,refining,canContinue,onContinue}:{snapshot:WorkspaceSnapshot;active:boolean;initialCanvasId:string;onCanvasSelected:(id:string)=>void;onAction:(a:WorkspaceAction)=>boolean;onPartition:()=>void;onRefine:(a:'proofread'|'formalize',nodeId?:string)=>void;refining:boolean;canContinue:boolean;onContinue:()=>void}){
 const projection=projectWorkspace(snapshot),unlocked=canEnterWorkspaceStep(snapshot,2);
 const [activeCanvas,setActiveCanvas]=useState(initialCanvasId);
 const [activeEditorId,setActiveEditorId]=useState(()=>projection.body.nodes.find(n=>n.editable)?.editableNodeId??'');
 const setActive=(id:string)=>{setActiveCanvas(id);onCanvasSelected(id);const nodes=id==='body'?projection.body.nodes:projection.appendices.find(a=>a.id===id)?.nodes??[];setActiveEditorId(nodes.find(node=>node.editable)?.editableNodeId??'');};
 const editors=useRef(new Map<string,any>());
 const [removeId,setRemoveId]=useState<string|null>(null);
 const dialog=useAccessibleDialog(Boolean(removeId),()=>setRemoveId(null));
 const selected=activeCanvas==='body'||projection.appendices.some(a=>a.id===activeCanvas)?activeCanvas:'body';
 const canvases:Canvas[]=[{id:'body',title:'Nội dung văn bản',nodes:projection.body.nodes as ProjectedNode[]},...projection.appendices.map(a=>({id:a.id,title:a.title||'Phụ lục',nodes:a.nodes as ProjectedNode[]}))];
 const selectedCanvas=canvases.find(c=>c.id===selected)!;
 const activeBodyNode=selected==='body'?selectedCanvas.nodes.find(n=>n.editableNodeId===activeEditorId&&n.editable):undefined;
 const command=(name:'undo'|'redo'|'toggleBold'|'toggleItalic'|'toggleUnderline')=>{const e=editors.current.get(activeEditorId);if(e?.isEditable)e.chain().focus()[name]().run();};
 const tableModel=(id:string):TableModel|undefined=>snapshot.doc.importedTables?.[id]??snapshot.workspace.source?.blocks.find(b=>(b.tableModel?.tableId??b.id)===id)?.tableModel??snapshot.reviewBlocks.find(b=>(b.tableModel?.tableId??b.id)===id)?.tableModel;
 const renderNode=(node:ProjectedNode)=>{
  const tableId=workspaceNodeTableId(node.html);
  if(tableId){
   const model=tableModel(tableId),cells=assessTableCellCapabilities(snapshot,tableId);
   return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability="readonly" data-workspace-atom="table" data-readonly-reason="table_atom_structure_locked" className="df-ws-atom" onPointerDown={()=>setActiveEditorId('')} onFocusCapture={()=>setActiveEditorId('')}>
    <div className="df-ws-atom-source" aria-label={`Bảng nguồn ${tableId}`} dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(node.html,{ADD_ATTR:['data-cell-id','data-source-table-id','style','colspan','rowspan']})}}/>
    <p className="df-ws-atom-reason">Bảng giữ nguyên cấu trúc và định dạng. Chỉ ô đủ điều kiện mới có trường sửa bên dưới.</p>
    {model&&<div className="df-ws-cell-editors" aria-label={`Các ô sửa được của bảng ${tableId}`}>
     {model.rows.flatMap(row=>row.cells).map(cell=>{const capability=cells.find(c=>c.cellId===cell.cellId),editable=Boolean(unlocked&&capability?.editable);return <label key={cell.cellId} className="df-ws-cell-edit">
      <span>Ô {cell.cellId}</span>
      {editable?<input type="text" data-workspace-cell={cell.cellId} aria-label={`Sửa ô ${cell.cellId}`} value={cell.text} onChange={e=>onAction({type:'editCell',tableId,cellId:cell.cellId,text:e.target.value})}/>:<span className="df-ws-cell-locked" data-workspace-cell-readonly={cell.cellId}>{cell.text||'(ô trống)'} · {capabilityMessage(capability?.reason??'approval_required')}</span>}
     </label>;})}
    </div>}
   </article>;
  }
  if(/<(?:img|svg|iframe|object|canvas)\b/i.test(node.html))return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability="readonly" data-workspace-atom="image" data-readonly-reason="media_atom_readonly" className="df-ws-atom" onPointerDown={()=>setActiveEditorId('')} onFocusCapture={()=>setActiveEditorId('')}><div className="df-ws-atom-source" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(node.html,{ADD_ATTR:['src','alt','width','height']})}}/><p className="df-ws-atom-reason">Ảnh và phương tiện nguồn chỉ đọc; thứ tự và nội dung được giữ nguyên.</p></article>;
  return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability={node.editable?'editable':'readonly'} data-node-container={node.container} className="df-ws-node">
   <WorkspaceCanvasEditor id={node.editableNodeId} content={node.html} safety={node.safety} onChange={html=>onAction({type:'editNode',id:node.editableNodeId,html})} onEditorReady={e=>{editors.current.set(node.editableNodeId,e);}} onActive={()=>{setActive(node.container==='body'?'body':node.appendixId??'body');setActiveEditorId(node.editableNodeId);}}/>
  </article>;
 };
 return <main data-wizard-step={active?'2':undefined} className="df-workspace-editor">
  <h1>Soạn &amp; kiểm tra</h1><p className="df-ws-muted">9 nhóm thể thức · Bản soạn r{snapshot.workspace.workingRevision}. Nội dung và nguồn được lưu riêng.</p>
  <aside className="df-ws-refine" aria-label="Trợ lý AI rà soát nội dung">
   <strong>Trợ lý AI: chính tả, câu từ và văn phong</strong>
   <p>Rà đoạn Body đang chọn. Bạn sẽ xem và duyệt đề xuất trước khi áp dụng.</p>
   <div className="df-ws-toolbar">
    <button type="button" data-ai-action="proofread" data-ai-target-node={activeBodyNode?.editableNodeId??''} disabled={selected!=='body'||refining||!activeBodyNode} onClick={()=>activeBodyNode&&onRefine('proofread',activeBodyNode.editableNodeId)}>Sửa chính tả &amp; câu từ bằng AI</button>
    <button type="button" data-ai-action="formalize" data-ai-target-node={activeBodyNode?.editableNodeId??''} disabled={selected!=='body'||refining||!activeBodyNode} onClick={()=>activeBodyNode&&onRefine('formalize',activeBodyNode.editableNodeId)}>Nâng văn phong bằng AI</button>
   </div>
   {selected!=='body'&&<p>AI chỉ hỗ trợ đoạn trong Body; phụ lục và ô bảng chưa được gửi.</p>}
  </aside>
  <div className="df-ws-groups">{projection.groups.map(group=><details key={group.id} data-workspace-group={group.id} open={group.id===5}>
   <summary>{group.name}</summary>
   {group.fields.filter(f=>f.key!=='bodyHtml').map(f=><label key={f.key}>{labels[f.key]??f.key}<textarea aria-label={labels[f.key]??f.key} data-workspace-field={f.key} value={f.value} readOnly={!f.editable} onChange={e=>onAction({type:'editField',field:f.key,value:e.target.value})}/></label>)}
   {group.id===6&&<button onClick={()=>setActive('body')}>Mở Body Canvas</button>}
   {group.id===8&&<p>Dấu, chữ ký số: chỉ đối chiếu chứng cứ nguồn; chưa hỗ trợ biên tập.</p>}
   {group.cellReferences.length>0&&<p>Tham chiếu {group.cellReferences.length} ô nguồn; không tạo bản sao bảng.</p>}
  </details>)}</div>
  <div role="tablist" aria-label="Canvas nội dung" className="df-ws-canvas-tabs">{canvases.map((a,i)=><button role="tab" id={`canvas-tab-${a.id}`} aria-controls={`canvas-${a.id}`} aria-selected={selected===a.id} tabIndex={selected===a.id?0:-1} data-canvas-tab={a.id} key={a.id} onClick={()=>setActive(a.id)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?canvases.length-1:(i+(e.key==='ArrowRight'?1:-1)+canvases.length)%canvases.length;setActive(canvases[n].id);document.getElementById(`canvas-tab-${canvases[n].id}`)?.focus();}}}>{a.id==='body'?'Body':a.title}</button>)}
   <button onClick={()=>{const id=crypto.randomUUID();if(onAction({type:'addAppendix',appendix:{id,title:'PHỤ LỤC',html:'<p></p>',sourceBlockIds:[],blocks:[],extractionStatus:'confirmed'}}))setActive(id);}}>Thêm phụ lục</button>
  </div>
  <div role="toolbar" aria-label="Công cụ Canvas đang chọn" className="df-ws-toolbar">{([['undo','Hoàn tác'],['redo','Làm lại'],['toggleBold','Đậm'],['toggleItalic','Nghiêng'],['toggleUnderline','Gạch chân']] as const).map(([name,label])=><button key={name} data-workspace-command={name} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>command(name)}>{label}</button>)}
  </div>
  {canvases.map(a=><section key={a.id} id={`canvas-${a.id}`} role="tabpanel" aria-labelledby={`canvas-tab-${a.id}`} hidden={selected!==a.id} data-canvas-id={a.id} className="df-ws-sheet">
   <h2>{a.title}</h2>
   {a.id!=='body'&&<div className="df-ws-appendix-actions"><label>Tiêu đề phụ lục<input aria-label={`Tiêu đề ${a.id}`} value={snapshot.doc.appendices?.find(p=>p.id===a.id)?.title??''} onChange={e=>onAction({type:'renameAppendix',id:a.id,title:e.target.value})}/></label><button onClick={()=>onAction({type:'moveAppendix',id:a.id,index:0})}>Đưa lên đầu</button><button onClick={()=>setRemoveId(a.id)}>Xóa phụ lục</button></div>}
   <div className="df-ws-mixed-surface">{a.nodes.map(renderNode)}</div>
  </section>)}
  {projection.unclassified.blocks.length>0&&<aside className="df-ws-unclassified"><h2>Khối chưa phân loại · chỉ đọc</h2>{projection.unclassified.blocks.map(b=><div key={b.id} dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(b.html||b.text)}}/>)}<button onClick={onPartition}>Về Bước 1 để phân vùng</button></aside>}
  <div className="df-ws-step-actions"><p>{canContinue?'Bản soạn đã qua cổng để xem ứng viên.':'Cần duyệt nguồn hoặc xử lý thông tin thể thức trước khi xuất.'}</p><button type="button" data-action="workspace-next" aria-disabled={!canContinue} disabled={!canContinue} onClick={onContinue}>Tiếp tục: Xem &amp; xuất <span aria-hidden="true">→</span></button></div>
  {removeId&&<div className="df-ws-modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="delete-appendix-title" className="df-ws-modal"><h2 id="delete-appendix-title">Xóa phụ lục khỏi bản soạn?</h2><p>Nguồn gốc vẫn được giữ. Thao tác được ghi trong lịch sử, bao gồm bảng trong phụ lục.</p><button onClick={()=>setRemoveId(null)}>Hủy</button><button onClick={()=>{if(onAction({type:'deleteAppendix',id:removeId,confirmed:true})){setRemoveId(null);setActive('body');}}}>Xác nhận xóa</button></div></div>}
 </main>;
}
