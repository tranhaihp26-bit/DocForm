import React, { useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { projectWorkspace } from '../utils/workspaceProjection.ts';
import { assessTableCellCapabilities, workspaceNodeTableId, type EditorSafety } from '../utils/workspaceCapabilities.ts';
import { canEnterWorkspaceStep, type EditableNode, type WorkspaceSnapshot } from '../utils/workspaceState.ts';
import type { WorkspaceAction } from '../utils/workspaceTransactions.ts';
import type { TableModel } from '../shared/tableModel.ts';
import { WorkspaceCanvasEditor } from './ND30Editor.tsx';
import { useAccessibleDialog } from '../utils/useAccessibleDialog.ts';
import './WorkspaceEditor.css';

const labels: Record<string, string> = {
  nationalHeader1: 'Quốc hiệu / Tiêu đề', nationalHeader2: 'Tiêu ngữ',
  orgHeader1: 'Cơ quan cấp trên', orgHeader2: 'Cơ quan ban hành',
  referenceNumber: 'Số, ký hiệu', locationAndDate: 'Địa danh và ngày tháng',
  documentType: 'Tên loại', subject: 'Trích yếu', signTitle: 'Chức vụ người ký',
  signName: 'Họ tên người ký', recipients: 'Nơi nhận',
};

type ProjectedNode = EditableNode & { safety: EditorSafety; editable: boolean };
type Canvas = { id: string; title: string; nodes: ProjectedNode[] };

function capabilityMessage(reason: string): string {
  if (reason === 'table_source_evidence_unavailable') return 'Thiếu bằng chứng nguồn đủ để mở sửa ô này.';
  if (reason === 'merged_cell_readonly') return 'Ô gộp; cấu trúc ô vẫn được giữ nguyên.';
  if (reason === 'multi_paragraph_cell_readonly') return 'Ô có nhiều đoạn; thao tác sửa ô chưa chứng minh bảo toàn cấu trúc.';
  if (reason === 'rich_cell_runs_readonly') return 'Ô có định dạng hoặc nhiều lượt chữ; chỉ đọc để giữ nguyên.';
  if (reason === 'template_table_not_registered') return 'Bảng mẫu chưa được đăng ký trong mô hình làm việc.';
  return 'Ô chỉ đọc để bảo toàn định dạng và dữ liệu nguồn.';
}

function groupStatus(group: ReturnType<typeof projectWorkspace>['groups'][number], seal: ReturnType<typeof projectWorkspace>['seal']) {
  if (group.id === 8) {
    if (seal?.status === 'present') return { label: 'Nguồn ghi nhận có', tone: 'evidence' };
    if (seal?.status === 'missing') return { label: 'Nguồn ghi nhận chưa có', tone: 'quiet' };
    if (seal?.status === 'unverified') return { label: 'Chưa xác minh', tone: 'review' };
    return { label: 'Chưa có bằng chứng', tone: 'quiet' };
  }
  const hasContent = group.fields.some(field => field.value.trim().length > 0) || group.sourceBlockIds.length > 0;
  return hasContent
    ? { label: 'Có dữ liệu', tone: 'evidence' }
    : { label: 'Chưa có dữ liệu', tone: 'quiet' };
}

function ComponentCard({
  group, seal, onAction,
}: {
  group: ReturnType<typeof projectWorkspace>['groups'][number];
  seal: ReturnType<typeof projectWorkspace>['seal'];
  onAction: (action: WorkspaceAction) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const status = groupStatus(group, seal);
  const hasEditableFields = group.fields.some(field => field.editable);

  return <article id={`df-step2-group-${group.id}`} className={`df-ws-component-card${editing ? ' is-editing' : ''}`} data-workspace-group={group.id}>
    <header className="df-ws-component-heading">
      <h3><span>{String(group.id).padStart(2, '0')}.</span> {group.name.replace(/^\d+\.\s*/, '')}</h3>
      <span className={`df-ws-status df-ws-status-${status.tone}`}>{status.label}</span>
    </header>
    {group.id === 8
      ? <p className="df-ws-component-value">{seal?.status === 'present' ? 'Có dấu hoặc chữ ký số trong nguồn.' : seal?.status === 'missing' ? 'Nguồn ghi nhận chưa có dấu hoặc chữ ký số.' : seal?.status === 'unverified' ? 'Dấu hoặc chữ ký số cần được đối chiếu.' : 'Chưa có dữ liệu bằng chứng cho dấu hoặc chữ ký số.'}</p>
      : <div className="df-ws-component-values">
        {group.fields.map(field => <p className="df-ws-component-value" key={field.key}>
          {group.id === 5 && <span className="df-ws-field-caption">{labels[field.key] ?? field.key}</span>}
          <span>{field.value.trim() || 'Chưa có dữ liệu trong bản soạn.'}</span>
        </p>)}
        {group.fields.length === 0 && <p className="df-ws-component-value">Chưa có dữ liệu trong bản soạn.</p>}
      </div>}
    {group.cellReferences.length > 0 && <p className="df-ws-component-note">{group.cellReferences.length} ô bảng nguồn được tham chiếu.</p>}
    {hasEditableFields && <>
      <button type="button" className="df-ws-edit-toggle" aria-expanded={editing} onClick={() => setEditing(value => !value)}>
        {editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa'}
      </button>
      {editing && <div className="df-ws-field-editor">
        {group.fields.map(field => <label key={field.key}>
          <span>{labels[field.key] ?? field.key}</span>
          <textarea
            aria-label={labels[field.key] ?? field.key}
            data-workspace-field={field.key}
            value={field.value}
            readOnly={!field.editable}
            rows={field.key === 'subject' ? 3 : 2}
            onChange={event => onAction({ type: 'editField', field: field.key, value: event.target.value })}
          />
        </label>)}
      </div>}
    </>}
  </article>;
}

export function WorkspaceEditor({
  snapshot, active, initialCanvasId, onCanvasSelected, onAction, onPartition, onRefine,
  refining, canContinue, onContinue,
}: {
  snapshot: WorkspaceSnapshot;
  active: boolean;
  initialCanvasId: string;
  onCanvasSelected: (id: string) => void;
  onAction: (a: WorkspaceAction) => boolean;
  onPartition: () => void;
  onRefine: (a: 'proofread' | 'formalize', nodeId?: string) => void;
  refining: boolean;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const projection = projectWorkspace(snapshot);
  const unlocked = canEnterWorkspaceStep(snapshot, 2);
  const [activeCanvas, setActiveCanvas] = useState(initialCanvasId);
  const [activeEditorId, setActiveEditorId] = useState(() => projection.body.nodes.find(node => node.editable)?.editableNodeId ?? '');
  const [contextOpen, setContextOpen] = useState(false);
  const setActive = (id: string) => {
    setActiveCanvas(id);
    onCanvasSelected(id);
    const nodes = id === 'body' ? projection.body.nodes : projection.appendices.find(appendix => appendix.id === id)?.nodes ?? [];
    setActiveEditorId(nodes.find(node => node.editable)?.editableNodeId ?? '');
  };
  const editors = useRef(new Map<string, any>());
  const [removeId, setRemoveId] = useState<string | null>(null);
  const dialog = useAccessibleDialog(Boolean(removeId), () => setRemoveId(null));
  const selected = activeCanvas === 'body' || projection.appendices.some(appendix => appendix.id === activeCanvas) ? activeCanvas : 'body';
  const canvases: Canvas[] = [
    { id: 'body', title: 'Nội dung văn bản', nodes: projection.body.nodes as ProjectedNode[] },
    ...projection.appendices.map(appendix => ({ id: appendix.id, title: appendix.title || 'Phụ lục', nodes: appendix.nodes as ProjectedNode[] })),
  ];
  const selectedCanvas = canvases.find(canvas => canvas.id === selected)!;
  const activeBodyNode = selected === 'body'
    ? selectedCanvas.nodes.find(node => node.editableNodeId === activeEditorId && node.editable)
    : undefined;
  const beforeGroups = projection.groups.filter(group => group.id >= 1 && group.id <= 5);
  const afterGroups = projection.groups.filter(group => group.id >= 7 && group.id <= 9);
  const sourceName = snapshot.structuredImport?.source.filename || 'Tài liệu hiện tại';

  const command = (name: 'undo' | 'redo' | 'toggleBold' | 'toggleItalic' | 'toggleUnderline') => {
    const editor = editors.current.get(activeEditorId);
    if (editor?.isEditable) editor.chain().focus()[name]().run();
  };
  const tableModel = (id: string): TableModel | undefined => snapshot.doc.importedTables?.[id]
    ?? snapshot.workspace.source?.blocks.find(block => (block.tableModel?.tableId ?? block.id) === id)?.tableModel
    ?? snapshot.reviewBlocks.find(block => (block.tableModel?.tableId ?? block.id) === id)?.tableModel;
  const renderNode = (node: ProjectedNode) => {
    const tableId = workspaceNodeTableId(node.html);
    if (tableId) {
      const model = tableModel(tableId), cells = assessTableCellCapabilities(snapshot, tableId);
      return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability="readonly" data-workspace-atom="table" data-readonly-reason="table_atom_structure_locked" className="df-ws-atom" onPointerDown={() => setActiveEditorId('')} onFocusCapture={() => setActiveEditorId('')}>
        <div className="df-ws-atom-source" aria-label={`Bảng nguồn ${tableId}`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(node.html, { ADD_ATTR: ['data-cell-id', 'data-source-table-id', 'style', 'colspan', 'rowspan'] }) }} />
        <p className="df-ws-atom-reason">Bảng giữ nguyên cấu trúc và định dạng. Chỉ ô đủ điều kiện mới có trường sửa bên dưới.</p>
        {model && <div className="df-ws-cell-editors" aria-label={`Các ô sửa được của bảng ${tableId}`}>
          {model.rows.flatMap(row => row.cells).map(cell => {
            const capability = cells.find(item => item.cellId === cell.cellId), editable = Boolean(unlocked && capability?.editable);
            return <label key={cell.cellId} className="df-ws-cell-edit">
              <span>Ô {cell.cellId}</span>
              {editable
                ? <input type="text" data-workspace-cell={cell.cellId} aria-label={`Sửa ô ${cell.cellId}`} value={cell.text} onChange={event => onAction({ type: 'editCell', tableId, cellId: cell.cellId, text: event.target.value })} />
                : <span className="df-ws-cell-locked" data-workspace-cell-readonly={cell.cellId}>{cell.text || '(ô trống)'} · {capabilityMessage(capability?.reason ?? 'approval_required')}</span>}
            </label>;
          })}
        </div>}
      </article>;
    }
    if (/<(?:img|svg|iframe|object|canvas)\b/i.test(node.html)) return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability="readonly" data-workspace-atom="image" data-readonly-reason="media_atom_readonly" className="df-ws-atom" onPointerDown={() => setActiveEditorId('')} onFocusCapture={() => setActiveEditorId('')}>
      <div className="df-ws-atom-source" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(node.html, { ADD_ATTR: ['src', 'alt', 'width', 'height'] }) }} />
      <p className="df-ws-atom-reason">Ảnh và phương tiện nguồn chỉ đọc; thứ tự và nội dung được giữ nguyên.</p>
    </article>;
    return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability={node.editable ? 'editable' : 'readonly'} data-node-container={node.container} className="df-ws-node">
      <WorkspaceCanvasEditor
        id={node.editableNodeId}
        content={node.html}
        safety={node.safety}
        onChange={html => onAction({ type: 'editNode', id: node.editableNodeId, html })}
        onEditorReady={editor => { editors.current.set(node.editableNodeId, editor); }}
        onActive={() => {
          setActive(node.container === 'body' ? 'body' : node.appendixId ?? 'body');
          setActiveEditorId(node.editableNodeId);
        }}
      />
    </article>;
  };

  return <div className="df-step-layout df-step-layout-workspace" data-context-open={contextOpen}>
    <main data-wizard-step={active ? '2' : undefined} className="df-workspace-editor df-step-content">
      <header className="df-ws-step-heading">
        <div>
          <p className="df-ws-eyebrow">Bước 2</p>
          <h1>Soạn &amp; kiểm tra</h1>
          <p className="df-ws-muted">Chỉnh sửa riêng từng thành phần. Chỉ Body nằm trong Canvas biên tập chính.</p>
        </div>
        <button type="button" data-action="workspace-next" aria-disabled={!canContinue} disabled={!canContinue} onClick={onContinue} className="df-ws-next">
          Tiếp tục xem &amp; xuất <span aria-hidden="true">→</span>
        </button>
      </header>
      <p className="df-ws-revision">{sourceName} <span>·</span> Bản soạn r{snapshot.workspace.workingRevision}</p>
      <button
        type="button"
        className="df-step-context-toggle"
        aria-expanded={contextOpen}
        aria-controls="df-step2-context"
        onClick={() => setContextOpen(value => !value)}
      >{contextOpen ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}</button>

      <section id="df-step2-groups-before" className="df-ws-region" aria-labelledby="df-step2-groups-before-title">
        <header className="df-ws-region-heading">
          <div><p className="df-ws-eyebrow">Phần đầu văn bản</p><h2 id="df-step2-groups-before-title">Các ô độc lập</h2></div>
          <span>Nhóm 01–05</span>
        </header>
        <div className="df-ws-groups df-ws-group-cards">
          {beforeGroups.map(group => <ComponentCard key={group.id} group={group} seal={projection.seal} onAction={onAction} />)}
        </div>
      </section>

      <section id="df-step2-body" className="df-ws-region df-ws-body-region" aria-labelledby="df-step2-body-title">
        <header className="df-ws-body-heading">
          <div><p className="df-ws-eyebrow">Nhóm 06</p><h2 id="df-step2-body-title">Nội dung văn bản (Body) — Canvas chính</h2></div>
          {selected === 'body' && activeBodyNode && <span className="df-ws-status df-ws-status-active">Đang chỉnh sửa</span>}
        </header>
        <div role="tablist" aria-label="Canvas nội dung" className="df-ws-canvas-tabs">
          {canvases.map((canvas, index) => <button
            role="tab"
            id={`canvas-tab-${canvas.id}`}
            aria-controls={`canvas-${canvas.id}`}
            aria-selected={selected === canvas.id}
            tabIndex={selected === canvas.id ? 0 : -1}
            data-canvas-tab={canvas.id}
            key={canvas.id}
            onClick={() => setActive(canvas.id)}
            onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? canvases.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + canvases.length) % canvases.length;
                setActive(canvases[next].id);
                document.getElementById(`canvas-tab-${canvases[next].id}`)?.focus();
              }
            }}
          >{canvas.id === 'body' ? 'Body' : canvas.title || 'Phụ lục'}</button>)}
          <button type="button" className="df-ws-add-appendix" onClick={() => {
            const id = crypto.randomUUID();
            if (onAction({ type: 'addAppendix', appendix: { id, title: 'PHỤ LỤC', html: '<p></p>', sourceBlockIds: [], blocks: [], extractionStatus: 'confirmed' } })) setActive(id);
          }}>Thêm phụ lục</button>
        </div>
        <div role="toolbar" aria-label="Công cụ Canvas đang chọn" className="df-ws-toolbar df-ws-editor-toolbar">
          {([['undo', 'Hoàn tác'], ['redo', 'Làm lại'], ['toggleBold', 'Đậm'], ['toggleItalic', 'Nghiêng'], ['toggleUnderline', 'Gạch chân']] as const).map(([name, label]) => <button key={name} data-workspace-command={name} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={() => command(name)}>{label}</button>)}
        </div>
        {canvases.map(canvas => <section key={canvas.id} id={`canvas-${canvas.id}`} role="tabpanel" aria-labelledby={`canvas-tab-${canvas.id}`} hidden={selected !== canvas.id} data-canvas-id={canvas.id} className="df-ws-sheet">
          <h3>{canvas.id === 'body' ? 'Nội dung Body' : canvas.title || 'Phụ lục'}</h3>
          {canvas.id !== 'body' && <div className="df-ws-appendix-actions">
            <label>Tiêu đề phụ lục<input aria-label={`Tiêu đề ${canvas.id}`} value={snapshot.doc.appendices?.find(appendix => appendix.id === canvas.id)?.title ?? ''} onChange={event => onAction({ type: 'renameAppendix', id: canvas.id, title: event.target.value })} /></label>
            <button type="button" onClick={() => onAction({ type: 'moveAppendix', id: canvas.id, index: 0 })}>Đưa lên đầu</button>
            <button type="button" onClick={() => setRemoveId(canvas.id)}>Xóa phụ lục</button>
          </div>}
          <div className="df-ws-mixed-surface">{canvas.nodes.map(renderNode)}</div>
        </section>)}
      </section>

      <section id="df-step2-groups-after" className="df-ws-region" aria-labelledby="df-step2-groups-after-title">
        <header className="df-ws-region-heading">
          <div><p className="df-ws-eyebrow">Phần cuối văn bản</p><h2 id="df-step2-groups-after-title">Các ô độc lập</h2></div>
          <span>Nhóm 07–09</span>
        </header>
        <div className="df-ws-groups df-ws-group-cards df-ws-group-cards-after">
          {afterGroups.map(group => <ComponentCard key={group.id} group={group} seal={projection.seal} onAction={onAction} />)}
        </div>
      </section>

      <section id="df-step2-appendices" className="df-ws-region df-ws-appendices-region" aria-labelledby="df-step2-appendices-title">
        <header className="df-ws-region-heading">
          <div><p className="df-ws-eyebrow">Canvas riêng</p><h2 id="df-step2-appendices-title">Phụ lục và thành phần phụ</h2></div>
          <span>{projection.appendices.length} phụ lục</span>
        </header>
        {projection.appendices.length > 0
          ? <ul className="df-ws-appendix-list">
            {projection.appendices.map((appendix, index) => <li key={appendix.id}>
              <span className="df-ws-appendix-index" aria-hidden="true">▦</span>
              <div className="df-ws-appendix-summary">
                <strong>Phụ lục {String(index + 1).padStart(2, '0')} — {appendix.title || 'Chưa đặt tên'}</strong>
                <span>{appendix.nodes.length} khối nội dung · độc lập với Body</span>
              </div>
              <button type="button" onClick={() => {
                setActive(appendix.id);
                document.getElementById('df-step2-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById(`canvas-tab-${appendix.id}`)?.focus({ preventScroll: true });
              }}>Mở Canvas phụ lục <span aria-hidden="true">↗</span></button>
            </li>)}
          </ul>
          : <p className="df-ws-empty-appendix">Chưa có phụ lục trong bản soạn.</p>}
      </section>

      {projection.unclassified.blocks.length > 0 && <aside className="df-ws-unclassified">
        <h2>Khối chưa phân loại · chỉ đọc</h2>
        {projection.unclassified.blocks.map(block => <div key={block.id} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html || block.text) }} />)}
        <button type="button" onClick={onPartition}>Về Bước 1 để phân vùng</button>
      </aside>}
      <footer className="df-ws-step-actions"><p>{canContinue ? 'Bản soạn đã qua cổng để xem ứng viên.' : 'Cần duyệt nguồn hoặc xử lý thông tin thể thức trước khi xuất.'}</p></footer>
      {removeId && <div className="df-ws-modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="delete-appendix-title" className="df-ws-modal">
        <h2 id="delete-appendix-title">Xóa phụ lục khỏi bản soạn?</h2>
        <p>Nguồn gốc vẫn được giữ. Thao tác được ghi trong lịch sử, bao gồm bảng trong phụ lục.</p>
        <button type="button" onClick={() => setRemoveId(null)}>Hủy</button>
        <button type="button" onClick={() => { if (onAction({ type: 'deleteAppendix', id: removeId, confirmed: true })) { setRemoveId(null); setActive('body'); } }}>Xác nhận xóa</button>
      </div></div>}
    </main>

    <aside id="df-step2-context" className="df-step-context df-ws-refine" aria-label="Trợ lý AI rà soát nội dung">
      <header className="df-ws-ai-heading"><span aria-hidden="true">✦</span><div><p className="df-ws-eyebrow">Trợ lý AI DocForm</p><h2>Hỗ trợ phần Body</h2></div></header>
      <div className="df-ws-ai-document">
        <strong>{sourceName}</strong>
        <p>Bản soạn r{snapshot.workspace.workingRevision} · đề xuất chỉ được áp dụng sau khi bạn duyệt.</p>
      </div>
      <p className="df-ws-ai-intro">Rà đoạn Body đang chọn. Nội dung sẽ không thay đổi trước khi bạn xác nhận đề xuất.</p>
      {activeBodyNode
        ? <p className="df-ws-ai-target">Đoạn đang chọn: <code>{activeBodyNode.editableNodeId}</code></p>
        : <p className="df-ws-ai-target">{selected === 'body' ? 'Chọn một đoạn có thể sửa trong Body để bắt đầu.' : 'AI chỉ hỗ trợ đoạn trong Body; phụ lục và ô bảng chưa được gửi.'}</p>}
      <div className="df-ws-ai-actions">
        <button type="button" data-ai-action="proofread" data-ai-target-node={activeBodyNode?.editableNodeId ?? ''} disabled={selected !== 'body' || refining || !activeBodyNode} onClick={() => activeBodyNode && onRefine('proofread', activeBodyNode.editableNodeId)}>
          <span className="df-ws-ai-icon" aria-hidden="true">⌕</span><span><strong>Rà chính tả, câu từ</strong><small>Đề xuất trên đoạn Body đang chọn</small></span><span aria-hidden="true">→</span>
        </button>
        <button type="button" data-ai-action="formalize" data-ai-target-node={activeBodyNode?.editableNodeId ?? ''} disabled={selected !== 'body' || refining || !activeBodyNode} onClick={() => activeBodyNode && onRefine('formalize', activeBodyNode.editableNodeId)}>
          <span className="df-ws-ai-icon" aria-hidden="true">✎</span><span><strong>Nâng văn phong</strong><small>Đề xuất trên đoạn Body đang chọn</small></span><span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="df-ws-ai-approval"><strong>Đề xuất chưa được áp dụng</strong><span>Hãy xem khác biệt rồi chọn áp dụng hoặc bỏ qua.</span></p>
    </aside>
  </div>;
}
