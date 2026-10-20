import type { DocumentState, SourceBlock, SourceRegion, StructuredImport, ImportFidelityManifest } from '../shared/schemas/document.schema.ts';
import { splitTopLevelHtml } from './proposalState.ts';

export type WorkspaceRegime = 'state' | 'party';
export interface SourceManifest {
  identity: string;
  generation: number;
  blobHash: string;
  blocks: SourceBlock[];
  fidelityManifest?: ImportFidelityManifest;
  fingerprint: string;
}
export interface CellRoleMapping { sourceBlockId: string; cellId: string; role: SourceRegion }
export interface PartitionRevision {
  revision: number;
  fingerprint: string;
  roles: Array<{ sourceBlockId: string; role: SourceRegion }>;
  cells: CellRoleMapping[];
  approval?: { token: string; sourceIdentity: string; regime: WorkspaceRegime; revision: number; fingerprint: string };
}
export interface EditableNode {
  editableNodeId: string;
  container: 'body' | 'appendix';
  appendixId?: string;
  html: string;
  lineage: string[];
}
export interface EditEvent {
  id: string;
  actor: 'user';
  action: 'add' | 'edit' | 'remove' | 'move' | 'split' | 'merge' | 'repartition';
  kind: 'field' | 'body' | 'appendix' | 'table' | 'node' | 'partition';
  targetId: string;
  sourceRefs: string[];
  beforeRevision: number;
  afterRevision: number;
  beforeFingerprint: string;
  afterFingerprint: string;
  beforeOrder?: string[];
  afterOrder?: string[];
  confirmed?: boolean;
  removedTableIds?: string[];
  addedTableIds?: string[];
}
export interface FrozenDraft {
  doc: DocumentState; reviewBlocks: SourceBlock[]; structuredImport: StructuredImport | null;
  partition: PartitionRevision; workingRevision: number; ledger: EditEvent[]; nodes: EditableNode[];
  overrides: Record<string, unknown>;
  workingFingerprint: string;
}
export interface WorkspaceState {
  schemaVersion: 1;
  source: SourceManifest | null;
  partition: PartitionRevision;
  workingRevision: number;
  ledger: EditEvent[];
  nodes: EditableNode[];
  overrides: Record<string, unknown>;
  legacyNeedsApproval: boolean;
  initialWorkingFingerprint: string;
  workingFingerprint: string;
  staged?: { partition: PartitionRevision; reviewBlocks: SourceBlock[]; frozen: FrozenDraft };
}
export interface WorkspaceSnapshot {
  doc: DocumentState;
  standardType: WorkspaceRegime;
  reviewBlocks: SourceBlock[];
  structuredImport: StructuredImport | null;
  workspace: WorkspaceState;
}
/** Canonical value serialization; used as a collision-free fingerprint, not a cryptographic hash. */
export function canonicalWorkspaceValue(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalWorkspaceValue).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(k => (value as any)[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonicalWorkspaceValue((value as any)[k])).join(',') + '}';
}
export function freezeWorkspaceValue<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeWorkspaceValue); Object.freeze(value);
  }
  return value;
}
export function sourceManifestFingerprint(source: Omit<SourceManifest, 'fingerprint'> | SourceManifest): string {
  const { fingerprint: _, ...rest } = source as SourceManifest; return canonicalWorkspaceValue(rest);
}
export function partitionFingerprint(source: SourceManifest | null, regime: WorkspaceRegime, roles: PartitionRevision['roles'], cells: CellRoleMapping[]): string {
  return canonicalWorkspaceValue({ sourceIdentity: source?.identity ?? 'template', generation: source?.generation ?? 0, regime, roles, cells });
}
export function makePartition(source: SourceManifest | null, regime: WorkspaceRegime, blocks: SourceBlock[], revision = 1, cells: CellRoleMapping[] = []): PartitionRevision {
  const roles = blocks.map(b => ({ sourceBlockId: b.id, role: b.role ?? 'unclassified' }));
  return { revision, roles, cells: structuredClone(cells), fingerprint: partitionFingerprint(source, regime, roles, cells) };
}
export function makeEditableNodes(doc: DocumentState, blocks: SourceBlock[]): EditableNode[] {
  const nodes: EditableNode[] = [];
  const append = (html: string, container: 'body' | 'appendix', refs: string[], appendixId?: string) => {
    const source = blocks.filter(b => refs.includes(b.id));
    const firstNode = nodes.length;
    let cursor = 0;
    for (const part of splitTopLevelHtml(html)) {
      const matched = source.filter(b => b.html === part || part.includes(`data-block-id="${b.id}"`) || part.includes(`data-source-table-id="${b.tableModel?.tableId ?? b.id}"`));
      // Recognition's splitter omits whitespace between top-level elements. Working
      // nodes must reproduce the exact stored HTML, including those untouched gaps.
      const start = html.indexOf(part, cursor);
      const end = start < 0 ? cursor + part.length : start + part.length;
      nodes.push({ editableNodeId: crypto.randomUUID(), container, ...(appendixId ? { appendixId } : {}), html: html.slice(cursor, end),
        lineage: matched.length ? matched.map(b => b.id) : [...refs] });
      cursor = end;
    }
    if (cursor < html.length) {
      if (nodes.length > firstNode) nodes[nodes.length - 1].html += html.slice(cursor);
      else nodes.push({ editableNodeId: crypto.randomUUID(), container, ...(appendixId ? { appendixId } : {}), html, lineage: [...refs] });
    }
  };
  append(doc.bodyHtml, 'body', blocks.filter(b => b.role === 'body').map(b => b.id));
  for (const app of doc.appendices ?? []) append(app.html, 'appendix', app.sourceBlockIds, app.id);
  return nodes;
}
export function workingDocumentFingerprint(snapshot: Omit<WorkspaceSnapshot, 'workspace'> & {workspace: Pick<WorkspaceState,'nodes'|'overrides'>}): string {
  return canonicalWorkspaceValue({doc:snapshot.doc,standardType:snapshot.standardType,reviewBlocks:snapshot.reviewBlocks,structuredImport:snapshot.structuredImport,nodes:snapshot.workspace.nodes,overrides:snapshot.workspace.overrides});
}
/** Never grants approval; the caller must explicitly approve the returned pending partition. */
export function createWorkspaceSnapshot(input: Omit<WorkspaceSnapshot, 'workspace'>, source?: { blobHash: string; generation: number; blocks?: SourceBlock[]; identity?: string }, overrides: Record<string, unknown> = {}): WorkspaceSnapshot {
  let manifest: SourceManifest | null = null;
  if (source) {
    if (!source.blobHash || !Number.isSafeInteger(source.generation) || source.generation < 1) throw new Error('invalid_source_identity');
    const base = { identity: source.identity ?? `${source.blobHash}:${source.generation}`, generation: source.generation, blobHash: source.blobHash,
      blocks: structuredClone(source.blocks ?? input.reviewBlocks), ...(input.structuredImport?.importFidelityManifest ? { fidelityManifest: structuredClone(input.structuredImport.importFidelityManifest) } : {}) };
    manifest = freezeWorkspaceValue({ ...base, fingerprint: sourceManifestFingerprint(base) });
  }
  const result: WorkspaceSnapshot = { ...structuredClone(input), workspace: { schemaVersion: 1, source: manifest,
    partition: makePartition(manifest, input.standardType, input.reviewBlocks), workingRevision: 0, ledger: [],
    nodes: makeEditableNodes(input.doc, input.reviewBlocks), overrides: structuredClone(overrides), legacyNeedsApproval: !!manifest,
    initialWorkingFingerprint: '', workingFingerprint: '' } };
  result.workspace.workingFingerprint = workingDocumentFingerprint(result);
  result.workspace.initialWorkingFingerprint = result.workspace.workingFingerprint;
  return freezeWorkspaceValue(result);
}
export function hasWorkspaceApproval(snapshot: WorkspaceSnapshot): boolean {
  const w = snapshot.workspace, p = w.partition, a = p.approval;
  if (w.staged || w.legacyNeedsApproval) return false;
  if (p.fingerprint !== partitionFingerprint(w.source, snapshot.standardType, p.roles, p.cells)) return false;
  if (!w.source) return true;
  return !!a && !!a.token && a.sourceIdentity === w.source.identity && a.regime === snapshot.standardType && a.revision === p.revision && a.fingerprint === p.fingerprint;
}
export function workspaceInvariantErrors(snapshot: WorkspaceSnapshot): string[] {
  const w = snapshot.workspace, errors: string[] = [];
  if(w.workingFingerprint !== workingDocumentFingerprint(snapshot)) errors.push('working_state_modified_outside_transaction');
  if (w.source && w.source.fingerprint !== sourceManifestFingerprint(w.source)) errors.push('source_manifest_modified');
  const sourceIds = new Set(w.source?.blocks.map(b => b.id) ?? []);
  if (w.source && (sourceIds.size !== w.source.blocks.length || snapshot.reviewBlocks.length !== sourceIds.size || new Set(snapshot.reviewBlocks.map(b => b.id)).size !== sourceIds.size || snapshot.reviewBlocks.some(b => !sourceIds.has(b.id)))) errors.push('source_ids_changed');
  if (w.partition.fingerprint !== partitionFingerprint(w.source, snapshot.standardType, w.partition.roles, w.partition.cells)) errors.push('partition_fingerprint_mismatch');
  if (canonicalWorkspaceValue(w.partition.roles) !== canonicalWorkspaceValue(snapshot.reviewBlocks.map(b => ({ sourceBlockId: b.id, role: b.role ?? 'unclassified' })))) errors.push('partition_roles_mismatch');
  for (const c of w.partition.cells) {
    const table = w.source?.blocks.find(b => b.id === c.sourceBlockId)?.tableModel;
    if (!table?.rows.some(r => r.cells.some(cell => cell.cellId === c.cellId))) errors.push('invalid_cell_mapping');
  }
  if (new Set(w.nodes.map(n => n.editableNodeId)).size !== w.nodes.length) errors.push('duplicate_editable_id');
  if(w.nodes.some(n=>sourceIds.has(n.editableNodeId))) errors.push('editable_id_is_source_id');
  if(new Set(w.partition.cells.map(c=>`${c.sourceBlockId}:${c.cellId}`)).size!==w.partition.cells.length)errors.push('duplicate_cell_mapping');
  if (w.nodes.some(n => n.lineage.some(id => !sourceIds.has(id)))) errors.push('invalid_lineage');
  const apps = snapshot.doc.appendices ?? [];
  if (new Set(apps.map(a => a.id)).size !== apps.length) errors.push('duplicate_appendix_id');
  if (w.nodes.filter(n => n.container === 'body').map(n => n.html).join('') !== snapshot.doc.bodyHtml) errors.push('body_node_mismatch');
  for (const app of apps) if (w.nodes.filter(n => n.container === 'appendix' && n.appendixId === app.id).map(n => n.html).join('') !== app.html) errors.push('appendix_node_mismatch');
  if (w.nodes.some(n => n.container === 'appendix' && !apps.some(a => a.id === n.appendixId))) errors.push('orphan_appendix_node');
  let revision = 0;
  let fingerprint = w.initialWorkingFingerprint;
  for (const event of w.ledger) {
    if (event.actor !== 'user' || event.beforeRevision !== revision || event.afterRevision !== revision + 1) errors.push('invalid_ledger_revision');
    if (event.action === 'remove' && !event.confirmed) errors.push('unconfirmed_removal');
    if (event.beforeFingerprint !== fingerprint || !event.afterFingerprint) errors.push('invalid_ledger_fingerprint');
    fingerprint = event.afterFingerprint;
    revision = event.afterRevision;
  }
  if (revision !== w.workingRevision) errors.push('ledger_revision_mismatch');
  if (fingerprint !== w.workingFingerprint) errors.push('ledger_content_mismatch');
  if(w.staged){
    const stage=w.staged,f=stage.frozen;
    const frozenSnapshot:WorkspaceSnapshot={doc:f.doc,standardType:snapshot.standardType,reviewBlocks:f.reviewBlocks,structuredImport:f.structuredImport,
      workspace:{...w,staged:undefined,partition:f.partition,workingRevision:f.workingRevision,ledger:f.ledger,nodes:f.nodes,overrides:f.overrides,workingFingerprint:f.workingFingerprint}};
    if(workspaceInvariantErrors(frozenSnapshot).length)errors.push('invalid_frozen_draft');
    if(canonicalWorkspaceValue({doc:snapshot.doc,reviewBlocks:snapshot.reviewBlocks,structuredImport:snapshot.structuredImport,partition:w.partition,workingRevision:w.workingRevision,ledger:w.ledger,nodes:w.nodes,overrides:w.overrides,workingFingerprint:w.workingFingerprint})!==canonicalWorkspaceValue(f))errors.push('frozen_draft_diverged');
    if(stage.partition.approval||stage.partition.revision!==w.partition.revision+1||stage.partition.fingerprint!==partitionFingerprint(w.source,snapshot.standardType,stage.partition.roles,stage.partition.cells))errors.push('invalid_staged_partition');
    if(canonicalWorkspaceValue(stage.partition.roles)!==canonicalWorkspaceValue(stage.reviewBlocks.map(b=>({sourceBlockId:b.id,role:b.role??'unclassified'}))))errors.push('invalid_staged_roles');
    if(w.source&&(stage.reviewBlocks.length!==sourceIds.size||new Set(stage.reviewBlocks.map(b=>b.id)).size!==sourceIds.size||stage.reviewBlocks.some(b=>!sourceIds.has(b.id))))errors.push('invalid_staged_source_ids');
    for(const c of stage.partition.cells)if(!w.source?.blocks.find(b=>b.id===c.sourceBlockId)?.tableModel?.rows.some(r=>r.cells.some(cell=>cell.cellId===c.cellId)))errors.push('invalid_staged_cell_mapping');
  }
  return [...new Set(errors)];
}
/** Source table inventory is immutable. Only confirmed remove events affect expected output. */
export function confirmedRemovedTableIds(snapshot: WorkspaceSnapshot): string[] {
  if (workspaceInvariantErrors(snapshot).length) return [];
  return [...new Set(snapshot.workspace.ledger.filter(e => e.action === 'remove' && e.confirmed).flatMap(e => e.removedTableIds ?? []))];
}
export function canEnterWorkspaceStep(snapshot: WorkspaceSnapshot, step: 1 | 2 | 3): boolean {
  return step === 1 || (hasWorkspaceApproval(snapshot) && workspaceInvariantErrors(snapshot).length === 0);
}
