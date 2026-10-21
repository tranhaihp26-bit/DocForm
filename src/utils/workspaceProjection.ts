import type { DocumentState, SourceRegion } from '../shared/schemas/document.schema.ts';
import { COMPONENT_GROUPS } from '../canonical/ruleEngine.ts';
import { COMPANY_HEADER_PROFILE_ID, LOCKED_COMPANY_FIELDS } from '../canonical/nd30/companyHeader.ts';
import { COMPANY_HEADER_HD05_PROFILE_ID, LOCKED_COMPANY_HD05_FIELDS } from '../canonical/hd05/companyHeaderHD05.ts';
import { canEnterWorkspaceStep, freezeWorkspaceValue, type WorkspaceSnapshot } from './workspaceState.ts';
import {assessWorkspaceNodeCapability,workspaceEditorSafety} from './workspaceCapabilities.ts';
export {workspaceEditorSafety} from './workspaceCapabilities.ts';

export type {EditorSafety} from './workspaceCapabilities.ts';

export interface WorkspaceFieldProjection {
  key: keyof DocumentState; value: string; editable: boolean; sourceBlockIds: string[];
}
export interface WorkspaceGroupProjection {
  id: number; name: string; fields: WorkspaceFieldProjection[];
  sourceBlockIds: string[];
  cellReferences: Array<{ sourceBlockId: string; cellId: string; role: SourceRegion }>;
  readonly: boolean;
}

const groupFields: Array<Array<keyof DocumentState>> = [
  ['nationalHeader1', 'nationalHeader2'], ['orgHeader1', 'orgHeader2'], ['referenceNumber'], ['locationAndDate'],
  ['documentType', 'subject'], ['bodyHtml'], ['signTitle', 'signName'], [], ['recipients'],
];
const groupRoles: Array<SourceRegion[]> = [['header'], ['header'], ['metadata'], ['metadata'], ['metadata'], ['body'], ['signature'], ['signature'], ['recipients']];

/** A read-only view over the existing DocumentState, with no duplicate editable document model. */
export function projectWorkspace(snapshot: WorkspaceSnapshot) {
  const unlocked = canEnterWorkspaceStep(snapshot, 2);
  const lockedFields: ReadonlySet<string> = snapshot.doc.headerProfile === COMPANY_HEADER_PROFILE_ID ? LOCKED_COMPANY_FIELDS
    : snapshot.doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID ? LOCKED_COMPANY_HD05_FIELDS : new Set();
  const groups: WorkspaceGroupProjection[] = COMPONENT_GROUPS.filter(g => typeof g.id === 'number').map(meta => {
    const id = meta.id as number, roles = groupRoles[id - 1];
    const fields = groupFields[id - 1].filter(key => !(snapshot.standardType === 'party' && key === 'nationalHeader2')).map(key => ({
      key, value: key === 'nationalHeader1'
        ? snapshot.doc.omitNationalHeader ? '' : snapshot.standardType === 'party' ? 'ĐẢNG CỘNG SẢN VIỆT NAM' : 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'
        : key === 'nationalHeader2'
          ? snapshot.doc.omitNationalHeader || snapshot.standardType === 'party' ? '' : 'Độc lập - Tự do - Hạnh phúc'
          : String(snapshot.doc[key] ?? ''), editable: unlocked
        && key !== 'nationalHeader1' && key !== 'nationalHeader2'
        && !lockedFields.has(key)
        && (key !== 'bodyHtml' || workspaceEditorSafety(snapshot.doc.bodyHtml).editable),
      sourceBlockIds: snapshot.structuredImport?.fields[key]?.sourceBlockIds ?? [],
    }));
    const cellReferences = snapshot.workspace.partition.cells.filter(c => roles.includes(c.role));
    const explicitRefs = fields.flatMap(f => f.sourceBlockIds);
    const sourceBlockIds = [...new Set([...explicitRefs, ...snapshot.reviewBlocks.filter(b => roles.includes(b.role ?? 'unclassified')).map(b => b.id),
      ...cellReferences.map(c => c.sourceBlockId)])];
    return { id, name: meta.name, fields, sourceBlockIds, cellReferences, readonly: !fields.some(f => f.editable) };
  });
  const bodySafety = workspaceEditorSafety(snapshot.doc.bodyHtml);
  const bodyNodes=snapshot.workspace.nodes.filter(n=>n.container==='body').map(n=>({...n,safety:assessWorkspaceNodeCapability(snapshot,n)}));
  return freezeWorkspaceValue(structuredClone({ groups,
    body: { id: 'body', html: snapshot.doc.bodyHtml, nodes: bodyNodes.map(n=>({...n,editable:unlocked&&n.safety.editable})),
      safety: bodySafety, editable: unlocked && bodyNodes.some(n=>n.safety.editable) },
    appendices: (snapshot.doc.appendices ?? []).map(a => { const nodes=snapshot.workspace.nodes.filter(n=>n.container==='appendix'&&n.appendixId===a.id).map(n=>({...n,safety:assessWorkspaceNodeCapability(snapshot,n)}));const safety = workspaceEditorSafety(a.html); return {
      id: a.id, title: a.title, referenceText: a.referenceText, html: a.html, sourceBlockIds: a.sourceBlockIds,
      nodes: nodes.map(n=>({...n,editable:unlocked&&n.safety.editable})),
      safety, editable: unlocked && nodes.some(n=>n.safety.editable),
    }; }),
    seal: snapshot.structuredImport?.seal ?? null,
    unclassified: { readonly: true as const, partitionStep: 1 as const,
      blocks: snapshot.reviewBlocks.filter(b => (b.role ?? 'unclassified') === 'unclassified') },
    workingRevision: snapshot.workspace.workingRevision, partitionRevision: snapshot.workspace.partition.revision,
  }));
}
