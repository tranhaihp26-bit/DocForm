import type { DraftRecord } from './draftStore.ts';
import {
  createWorkspaceSnapshot, freezeWorkspaceValue, hasWorkspaceApproval, workspaceInvariantErrors,
  type WorkspaceSnapshot, type WorkspaceState,
} from './workspaceState.ts';

export type WorkspaceVersion = DraftRecord['versions'][number] & { sourceGeneration?: number };
type SnapshotContent = Omit<WorkspaceSnapshot, 'workspace'>;
const object = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: any): boolean => Array.isArray(v) && v.every(x => typeof x === 'string');
const revision = (v: any): boolean => Number.isSafeInteger(v) && v >= 0;
const regions = new Set(['header', 'metadata', 'body', 'signature', 'recipients', 'appendix', 'separator', 'unclassified']);

function partitionValid(p: any): boolean {
  return object(p) && revision(p.revision) && p.revision > 0 && typeof p.fingerprint === 'string'
    && Array.isArray(p.roles) && p.roles.every((r: any) => object(r) && typeof r.sourceBlockId === 'string' && regions.has(r.role))
    && Array.isArray(p.cells) && p.cells.every((c: any) => object(c) && typeof c.sourceBlockId === 'string' && typeof c.cellId === 'string' && regions.has(c.role))
    && (p.approval === undefined || (object(p.approval) && typeof p.approval.token === 'string' && !!p.approval.token
      && typeof p.approval.sourceIdentity === 'string' && ['state', 'party'].includes(p.approval.regime)
      && revision(p.approval.revision) && typeof p.approval.fingerprint === 'string'));
}

/** Storage guard. With document context, validates lineage, ledger, node HTML and frozen state too. */
export function isWorkspaceStateValid(value: unknown, content?: SnapshotContent): value is WorkspaceState {
  const w = value as any;
  try {
    if (!object(w) || w.schemaVersion !== 1 || !revision(w.workingRevision) || typeof w.legacyNeedsApproval !== 'boolean'
      || !object(w.overrides) || !partitionValid(w.partition)
      || typeof w.initialWorkingFingerprint !== 'string' || typeof w.workingFingerprint !== 'string') return false;
    if (w.source !== null && (!object(w.source) || typeof w.source.identity !== 'string' || !w.source.identity
      || !revision(w.source.generation) || w.source.generation < 1 || typeof w.source.blobHash !== 'string' || !w.source.blobHash
      || typeof w.source.fingerprint !== 'string' || !Array.isArray(w.source.blocks)
      || !w.source.blocks.every((b: any) => object(b) && typeof b.id === 'string' && typeof b.text === 'string'))) return false;
    if (!Array.isArray(w.nodes) || !w.nodes.every((n: any) => object(n) && typeof n.editableNodeId === 'string' && !!n.editableNodeId
      && ['body', 'appendix'].includes(n.container) && typeof n.html === 'string' && strings(n.lineage)
      && (n.container !== 'appendix' || (typeof n.appendixId === 'string' && !!n.appendixId)))) return false;
    if (!Array.isArray(w.ledger) || !w.ledger.every((e: any) => object(e) && typeof e.id === 'string' && !!e.id && e.actor === 'user'
      && ['add', 'edit', 'remove', 'move', 'split', 'merge', 'repartition'].includes(e.action)
      && ['field', 'body', 'appendix', 'table', 'node', 'partition'].includes(e.kind) && typeof e.targetId === 'string'
      && strings(e.sourceRefs) && revision(e.beforeRevision) && revision(e.afterRevision)
      && typeof e.beforeFingerprint === 'string' && typeof e.afterFingerprint === 'string'
      && (e.removedTableIds === undefined || strings(e.removedTableIds)))) return false;
    if (w.staged !== undefined) {
      const s = w.staged, f = s?.frozen;
      if (!object(s) || !partitionValid(s.partition) || s.partition.approval !== undefined || !Array.isArray(s.reviewBlocks) || !object(f)) return false;
      const frozenState = { ...w, partition: f.partition, workingRevision: f.workingRevision, ledger: f.ledger,
        nodes: f.nodes, overrides: f.overrides, workingFingerprint: f.workingFingerprint, staged: undefined };
      if (!isWorkspaceStateValid(frozenState, content ? { doc: f.doc, standardType: content.standardType,
        reviewBlocks: f.reviewBlocks, structuredImport: f.structuredImport } : undefined)) return false;
      if (content && workspaceInvariantErrors({ ...content, reviewBlocks: s.reviewBlocks,
        workspace: { ...w, partition: s.partition, staged: undefined } }).some(e => !['working_state_modified_outside_transaction', 'body_node_mismatch', 'appendix_node_mismatch'].includes(e))) return false;
    }
    if (content) {
      const snapshot = { ...content, workspace: w } as WorkspaceSnapshot;
      if (workspaceInvariantErrors(snapshot).length) return false;
      // A token that is present must match its full context. Pending states are valid storage.
      if (w.partition.approval && !hasWorkspaceApproval({ ...snapshot,
        workspace: { ...w, staged: undefined, legacyNeedsApproval: false } })) return false;
    }
    return true;
  } catch { return false; }
}

export function createWorkspaceVersion(snapshot: WorkspaceSnapshot, metadata: {
  id: string; title: string; timestamp: string;
}, sourceMetadata: Partial<Omit<WorkspaceVersion, 'id' | 'title' | 'timestamp' | 'data' | 'standardType' | 'reviewBlocks' | 'structuredImport' | 'workspace'>> = {}): WorkspaceVersion {
  if (!isWorkspaceStateValid(snapshot.workspace, snapshot)) throw new Error('invalid_workspace_version');
  return freezeWorkspaceValue(structuredClone({ ...sourceMetadata, ...metadata, data: snapshot.doc,
    standardType: snapshot.standardType, reviewBlocks: snapshot.reviewBlocks, structuredImport: snapshot.structuredImport,
    workspace: snapshot.workspace }));
}

/** Restores only the version's own source context. Never borrows a current draft's approval. */
export function restoreWorkspaceVersion(version: WorkspaceVersion): WorkspaceSnapshot {
  const content: SnapshotContent = structuredClone({ doc: version.data, standardType: version.standardType,
    reviewBlocks: version.reviewBlocks ?? [], structuredImport: version.structuredImport ?? null });
  if (version.workspace !== undefined) {
    if (!isWorkspaceStateValid(version.workspace, content)) throw new Error('invalid_workspace_version');
    const snapshot = { ...content, workspace: structuredClone(version.workspace) };
    if (snapshot.workspace.source && !snapshot.workspace.partition.approval) snapshot.workspace.legacyNeedsApproval = true;
    return freezeWorkspaceValue(snapshot);
  }
  const source = version.originalSnapshot;
  const imported = source?.sourceType !== 'system_template' && (source?.sourceType === 'uploaded_file' || !!version.uploadedFileName || !!version.structuredImport
    || ['docx', 'txt', 'paste'].includes(content.doc.importMetadata?.sourceType ?? '')
    || content.reviewBlocks.length > 0);
  // The explicit unverified identity preserves the lock when an old record has no source hash.
  const snapshot = createWorkspaceSnapshot(content, imported ? {
    blobHash: source?.sourceHash || `legacy-unverified:${version.id}`, generation: version.sourceGeneration ?? 1,
    blocks: version.uploadedBlocks ?? content.reviewBlocks,
    identity: source?.sourceId || `legacy:${version.id}`,
  } : undefined, version.docTypeOverride ? { docTypeOverride: structuredClone(version.docTypeOverride) } : {});
  return snapshot;
}
