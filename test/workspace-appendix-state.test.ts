import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DocumentState, SourceBlock } from '../src/shared/schemas/document.schema.ts';
import { createWorkspaceSnapshot, hasWorkspaceApproval, canEnterWorkspaceStep, type WorkspaceSnapshot } from '../src/utils/workspaceState.ts';
import { approveWorkspacePartition, transactWorkspace, stageWorkspacePartition, cancelWorkspacePartition } from '../src/utils/workspaceTransactions.ts';
import { createWorkspaceVersion, restoreWorkspaceVersion, isWorkspaceStateValid } from '../src/utils/workspacePersistence.ts';
import { projectWorkspace, workspaceEditorSafety } from '../src/utils/workspaceProjection.ts';
import { DEFAULT_DRAFT_ID, getMemoryFallbackDrafts, getMemoryFallbackSourceBlobs, loadDraft, saveDraft,
  saveSourceBlob, loadSourceBlob, computeSourceHash, SourceBlobIntegrityError, type DraftRecord } from '../src/utils/draftStore.ts';
import { migrateLegacyDraft } from '../src/utils/documentSessionMigration.ts';
import { loadSession, saveSession, resetMemoryFallbackStores } from '../src/utils/documentSessionStore.ts';
import { LEGACY_SESSION_ID, isSessionVersionValid, isDocumentSessionRecordValid } from '../src/utils/documentSessionTypes.ts';

const timestamp = '2026-10-20T01:00:00.000Z';
function fixture(): WorkspaceSnapshot {
  const blocks: SourceBlock[] = ['body', 'appendix', 'appendix'].map((role, index) => ({
    id: `block-${index}`, index, kind: 'paragraph', text: index ? 'SAME' : 'BODY',
    html: `<p>${index ? 'SAME' : 'BODY'}</p>`, role: role as SourceBlock['role'],
  }));
  const doc: DocumentState = { orgHeader1: '', orgHeader2: 'CQ', nationalHeader1: '', nationalHeader2: '',
    locationAndDate: '', documentType: 'KẾ HOẠCH', referenceNumber: '', subject: 'Synthetic', bodyHtml: '<p>BODY</p>',
    signTitle: '', signName: '', recipients: '', headerProfile: 'generic',
    appendices: [1, 2].map(i => ({ id: `appendix-${i}`, title: `Phụ lục ${i}`, html: '<p>SAME</p>',
      blocks: [blocks[i]], sourceBlockIds: [blocks[i].id], extractionStatus: 'confirmed' })),
  };
  const pending = createWorkspaceSnapshot({ doc, standardType: 'state', reviewBlocks: blocks, structuredImport: null },
    { blobHash: 'synthetic-hash', generation: 1 }, { docTypeOverride: { chosenDocType: 'KẾ HOẠCH' } });
  const approved = approveWorkspacePartition(pending);
  assert.equal(approved.ok, true);
  if (!approved.ok) throw new Error('fixture_approval_failed');
  return structuredClone(approved.snapshot);
}
function stagedFixture(): WorkspaceSnapshot {
  const edited = transactWorkspace(fixture(), 0, { type: 'editAppendix', id: 'appendix-2', html: '<p>USER EDIT</p>' });
  assert.equal(edited.ok, true);
  if (!edited.ok) throw new Error('fixture_edit_failed');
  const proposedBlocks = structuredClone(edited.snapshot.reviewBlocks);
  proposedBlocks[0].role = 'unclassified';
  const staged = stageWorkspacePartition(edited.snapshot, proposedBlocks);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('fixture_stage_failed');
  return structuredClone(staged.snapshot);
}
function draft(snapshot: WorkspaceSnapshot): DraftRecord {
  return { schemaVersion: 2, id: DEFAULT_DRAFT_ID, updatedAt: timestamp, doc: snapshot.doc, standardType: snapshot.standardType,
    reviewBlocks: snapshot.reviewBlocks, structuredImport: snapshot.structuredImport, workspace: snapshot.workspace,
    originalSnapshot: { sourceType: 'uploaded_file', fileName: 'synthetic.docx', sourceHash: 'synthetic-hash',
      uploadedAt: timestamp, bodyHtml: '<p>BODY</p>' }, sourceOrigin: 'uploaded_file', currentStep: 1,
    docTypeOverride: { sourceDocType: 'BÁO CÁO', chosenDocType: 'KẾ HOẠCH', regime: 'state', decidedAt: timestamp },
    versions: [createWorkspaceVersion(snapshot, { id: 'v1', title: 'Saved workspace', timestamp })] };
}

describe('Workspace appendix state, migration and restoration', () => {
  beforeEach(() => { resetMemoryFallbackStores(); getMemoryFallbackSourceBlobs().clear(); });

  it('keeps equal-text appendices distinct by ID and restores a detached complete version', () => {
    const snapshot = fixture();
    const version = createWorkspaceVersion(snapshot, { id: 'v1', title: 'Version', timestamp });
    snapshot.doc.appendices![0].title = 'Changed after save';
    const restored = restoreWorkspaceVersion(version);
    assert.deepEqual(restored.doc.appendices?.map(a => a.id), ['appendix-1', 'appendix-2']);
    assert.equal(restored.doc.appendices?.[0].title, 'Phụ lục 1');
    assert.equal(restored.doc.appendices?.[1].html, '<p>SAME</p>');
    assert.equal(restored.doc.headerProfile, 'generic');
    assert.deepEqual(restored.workspace.overrides, version.workspace?.overrides);
    assert.equal(hasWorkspaceApproval(restored), true);
    assert.equal(Object.isFrozen(restored.doc.appendices![0]), true);
  });

  it('persists pending repartition, frozen approved document and override across migration and reload', async () => {
    const snapshot = stagedFixture();
    const legacy = draft(snapshot);
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, structuredClone(legacy));
    assert.equal((await migrateLegacyDraft()).status, 'migrated');
    const loaded = (await loadSession(LEGACY_SESSION_ID))!;
    assert.deepEqual(loaded.workspace, snapshot.workspace);
    assert.deepEqual(loaded.docTypeOverride, legacy.docTypeOverride);
    assert.equal(loaded.sourceOrigin, 'uploaded_file');
    assert.deepEqual(loaded.versions[0].workspace, snapshot.workspace);
    const restored = restoreWorkspaceVersion(loaded.versions[0]);
    assert.equal(canEnterWorkspaceStep(restored, 2), false);
    assert.equal(canEnterWorkspaceStep(restored, 3), false);
    assert.equal(restored.workspace.staged!.frozen.doc.bodyHtml, '<p>BODY</p>');
    assert.equal(restored.workspace.staged!.reviewBlocks[0].role, 'unclassified');
    const cancelled = cancelWorkspacePartition(restored);
    assert.equal(cancelled.ok, true);
    if (cancelled.ok) assert.equal(cancelled.snapshot.doc.appendices![1].html, '<p>USER EDIT</p>');
    loaded.workspace!.staged!.frozen.doc.appendices![0].title = 'Unsaved mutation';
    assert.equal((await loadSession(LEGACY_SESSION_ID))!.workspace!.staged!.frozen.doc.appendices![0].title, 'Phụ lục 1');
    const saved = await saveSession((await loadSession(LEGACY_SESSION_ID))!, 1);
    assert.deepEqual(saved.workspace, snapshot.workspace);
    assert.equal((await migrateLegacyDraft()).status, 'already_migrated');
    assert.deepEqual(getMemoryFallbackDrafts().get(DEFAULT_DRAFT_ID), legacy);
  });

  it('legacy file version stays locked even when the source hash matches an approved document', () => {
    const snapshot = fixture();
    const version = createWorkspaceVersion(snapshot, { id: 'legacy', title: 'Legacy', timestamp }, {
      originalSnapshot: draft(snapshot).originalSnapshot,
    });
    const legacy = structuredClone(version); delete legacy.workspace;
    const restored = restoreWorkspaceVersion(legacy);
    assert.equal(restored.workspace.source?.blobHash, snapshot.workspace.source?.blobHash);
    assert.equal(restored.workspace.legacyNeedsApproval, true);
    assert.equal(restored.workspace.partition.approval, undefined);
    assert.equal(canEnterWorkspaceStep(restored, 3), false);
  });

  it('legacy template restores without a file approval requirement', () => {
    const snapshot = fixture();
    const restored = restoreWorkspaceVersion({ id: 'template', title: 'Template', timestamp, data: { ...snapshot.doc, appendices: [] },
      standardType: 'party', originalSnapshot: { sourceType: 'system_template', uploadedAt: timestamp, bodyHtml: snapshot.doc.bodyHtml } });
    assert.equal(restored.workspace.source, null);
    assert.equal(hasWorkspaceApproval(restored), true);
  });

  it('rejects malformed workspace, duplicate appendix IDs, damaged approval and frozen draft', async () => {
    const snapshot = fixture();
    const version = createWorkspaceVersion(snapshot, { id: 'v1', title: 'Version', timestamp });
    const duplicate = structuredClone(version); duplicate.data.appendices![1].id = 'appendix-1';
    assert.throws(() => restoreWorkspaceVersion(duplicate), /invalid_workspace_version/);
    const stale = structuredClone(version); stale.workspace!.partition.approval!.regime = 'party';
    assert.equal(isSessionVersionValid({ ...stale, sourceGeneration: 1 }), false);
    const staged = draft(stagedFixture()); staged.workspace!.staged!.frozen.doc.bodyHtml = '<p>Lost frozen data</p>';
    assert.equal(isWorkspaceStateValid(staged.workspace, { doc: staged.doc, standardType: staged.standardType,
      reviewBlocks: staged.reviewBlocks!, structuredImport: null }), false);
    const bad = { ...draft(snapshot), schemaVersion: 3, sourceGeneration: 1, revision: 1, workspace: {} };
    assert.equal(isDocumentSessionRecordValid(bad), false);
    assert.equal(isWorkspaceStateValid({ schemaVersion: 1 }), false);
  });

  it('draft reload detaches staged state, while failed IndexedDB writes reject honestly', async () => {
    const legacy = draft(stagedFixture());
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, legacy);
    const loaded = (await loadDraft())!;
    loaded.workspace!.overrides.changed = true;
    assert.equal((await loadDraft())!.workspace!.overrides.changed, undefined);
    await assert.rejects(saveDraft({ ...legacy, id: 'cannot-save' }), /IndexedDB/);
    assert.equal(getMemoryFallbackDrafts().has('cannot-save'), false);
  });

  it('projects exactly nine main groups, appendix identities and a read-only unclassified tray', () => {
    const snapshot = fixture();
    const projected = projectWorkspace(snapshot);
    assert.deepEqual(projected.groups.map(g => g.id), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(projected.appendices.map(a => a.id), ['appendix-1', 'appendix-2']);
    assert.equal(projected.groups[7].readonly, true);
    assert.equal(projected.unclassified.readonly, true);
    assert.equal(projected.unclassified.partitionStep, 1);
    assert.equal(projected.body.editable, true);
    assert.equal(projectWorkspace(stagedFixture()).body.editable, false);
    assert.equal(workspaceEditorSafety('<p><u>Kept underline</u></p>').editable, true);
    assert.equal(workspaceEditorSafety('<p><img src="synthetic.png"></p>').editable, false);
    assert.equal(workspaceEditorSafety('<p style="font-size:15pt">Kept style</p>').editable, false);
    assert.equal(workspaceEditorSafety('<table><tr><td rowspan="2">Merged</td></tr></table>').editable, false);
  });

  it('source blob saves and loads are detached and a retained hash cannot be overwritten', async () => {
    const bytes = new TextEncoder().encode('IMMUTABLE SOURCE').buffer;
    const hash = await computeSourceHash(bytes);
    const source = { hash, bytes, fileName: 'synthetic.docx', fileType: 'docx' as const,
      fileSize: bytes.byteLength, uploadedAt: timestamp };
    const saved = await saveSourceBlob(source);
    assert.equal(saved.storage, 'memory');
    assert.equal(saved.persisted, false);
    new Uint8Array(source.bytes)[0] = 0;
    const loaded = (await loadSourceBlob(hash))!;
    assert.equal(new TextDecoder().decode(loaded.bytes), 'IMMUTABLE SOURCE');
    new Uint8Array(loaded.bytes)[1] = 0;
    assert.equal(new TextDecoder().decode((await loadSourceBlob(hash))!.bytes), 'IMMUTABLE SOURCE');
    await assert.rejects(saveSourceBlob(source), SourceBlobIntegrityError);
    const duplicate = (await loadSourceBlob(hash))!;
    await saveSourceBlob({ ...duplicate, fileName: 'later-name.docx' });
    assert.equal((await loadSourceBlob(hash))!.fileName, 'synthetic.docx');
    getMemoryFallbackSourceBlobs().get(hash)!.bytes = new TextEncoder().encode('CORRUPTED SOURCE').buffer;
    await assert.rejects(loadSourceBlob(hash), SourceBlobIntegrityError);
    await assert.rejects(saveSourceBlob(duplicate), SourceBlobIntegrityError);
  });
});
