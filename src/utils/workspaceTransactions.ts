import type { AppendixDocument, DocumentState, SourceBlock, SourceRegion, TableModel } from '../shared/schemas/document.schema.ts';
import { reconstructFromReviewedBlocks, validateReviewedBlocks } from './importReview.ts';
import { escapeHtml, splitTopLevelHtml } from './proposalState.ts';
import { tableModelToHtmlView } from '../shared/tableModel.ts';
import {assessTableCellCapabilities,assessWorkspaceNodeCapability} from './workspaceCapabilities.ts';
import { syncTableModelFromHtml, reconcileRunsWithNewText, replaceSimpleTableCellText } from './tableFormatUtils.ts';
import { COMPANY_HEADER_PROFILE_ID, LOCKED_COMPANY_FIELDS, applyCompanyProfile } from '../canonical/nd30/companyHeader.ts';
import { COMPANY_HEADER_HD05_PROFILE_ID, LOCKED_COMPANY_HD05_FIELDS, applyCompanyHD05Profile } from '../canonical/hd05/companyHeaderHD05.ts';
import { canonicalWorkspaceValue, freezeWorkspaceValue, hasWorkspaceApproval, makePartition, workspaceInvariantErrors, workingDocumentFingerprint, type CellRoleMapping, type EditEvent, type EditableNode, type WorkspaceSnapshot } from './workspaceState.ts';
import { embeddedRecipientsSignatureTable } from '../shared/embeddedSignatureTable.ts';
import { applySemanticRuleFormatting, resolveSemanticRuleFormatting, type SemanticRuleId } from './semanticRuleFormatting.ts';
import type { SemanticDecision } from '../shared/semanticDocument.ts';

export type WorkspaceError = 'stale_revision' | 'pending_partition' | 'approval_required' | 'invalid_transaction' | 'readonly_content' | 'confirmation_required' | 'rebase_conflict' | 'not_found';
export type WorkspaceResult = { ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: WorkspaceError; details: string[] };
export type WorkspaceAction =
  | { type: 'editField'; field: keyof DocumentState; value: string }
  | { type: 'editFields'; fields: Partial<Record<keyof DocumentState, string>> }
  | { type: 'setProfile'; profile: NonNullable<DocumentState['headerProfile']> }
  | { type: 'setNationalHeaderOmitted'; omitted: boolean }
  | { type: 'applyIssuerProfile'; orgHeader1: string; orgHeader2: string; profile?: NonNullable<DocumentState['headerProfile']> }
  | { type: 'editBody'; html: string }
  | { type: 'editAppendix'; id: string; html: string }
  | { type: 'editNode'; id:string; html:string }
  | { type: 'applySemanticParagraphRules'; sourceBlockId:string; expectedText:string; paragraphIndex:number; ruleIds:SemanticRuleId[]; regime:'state'|'party'; profile:string; decision?:SemanticDecision }
  | { type: 'registerTemplateTables'; templateId:string; models:TableModel[] }
  | { type: 'renameAppendix'; id: string; title: string }
  | { type: 'addAppendix'; appendix: AppendixDocument; index?: number }
  | { type: 'deleteAppendix'; id: string; confirmed: boolean }
  | { type: 'moveAppendix'; id: string; index: number }
  | { type: 'splitNode'; id: string; parts: string[] }
  | { type: 'mergeNodes'; ids: string[]; html: string }
  | { type: 'pasteNode'; html: string; afterId?: string; appendixId?: string }
  | { type: 'editCell'; tableId: string; cellId: string; text: string }
  | { type: 'addTable'; model: TableModel; afterId?: string; appendixId?: string }
  | { type: 'removeTable'; tableId: string; confirmed: boolean }
  | { type: 'moveTable'; tableId: string; afterId?: string; appendixId?: string };

const fail = (error: WorkspaceError, ...details: string[]): WorkspaceResult => ({ ok: false, error, details });
const htmlOf = (b: SourceBlock) => b.tableModel ? tableModelToHtmlView(b.tableModel) : b.html ?? `<p>${escapeHtml(b.text)}</p>`;
const tableIds = (html: string): string[] => [...html.matchAll(/data-source-table-id\s*=\s*["']([^"']+)["']/g)].map(m => m[1]);
function readonlyReasons(snapshot: WorkspaceSnapshot, html: string): string[] {
  const errors: string[] = [];
  if((html.match(/<table\b/gi)??[]).length!==tableIds(html).length)errors.push('unregistered_table_requires_add_transaction');
  if (/<(?:img|svg|iframe|object)\b/i.test(html)) errors.push('image_or_drawing_readonly');
  for (const id of tableIds(html)) {
    const block = snapshot.workspace.source?.blocks.find(b => (b.tableModel?.tableId ?? b.id) === id);
    if (block?.unsupportedFeatures?.length || /<(?:w:drawing|w:pict)\b/.test(block?.rawXml ?? '')) errors.push(`unsupported_table:${id}`);
    if(block?.tableModel?.rows.some(r=>r.cells.some(c=>c.gridSpan>1||!!c.vMerge||(c.rowSpan??1)>1))) errors.push(`merged_table_readonly:${id}`);
  }
  return errors;
}
function syncDocumentNodes(snapshot: WorkspaceSnapshot): void {
  snapshot.doc.bodyHtml = snapshot.workspace.nodes.filter(n => n.container === 'body').map(n => n.html).join('');
  for (const a of snapshot.doc.appendices ?? []) a.html = snapshot.workspace.nodes.filter(n => n.container === 'appendix' && n.appendixId === a.id).map(n => n.html).join('');
}
function replaceContainer(snapshot: WorkspaceSnapshot, html: string, appendixId?: string): void {
  const isTarget = (n: EditableNode) => appendixId ? n.container === 'appendix' && n.appendixId === appendixId : n.container === 'body';
  const old = snapshot.workspace.nodes.filter(isTarget), refs = [...new Set(old.flatMap(n => n.lineage))];
  const parts = splitTopLevelHtml(html);
  const replacement = parts.map((part, i): EditableNode => ({ editableNodeId: old[i]?.editableNodeId ?? crypto.randomUUID(),
    container: appendixId ? 'appendix' : 'body', ...(appendixId ? { appendixId } : {}), html: part,
    lineage: old[i]?.html === part ? old[i].lineage : refs }));
  snapshot.workspace.nodes = snapshot.workspace.nodes.filter(n => !isTarget(n));
  snapshot.workspace.nodes.push(...replacement);
  syncDocumentNodes(snapshot);
}
type PendingEvent = Omit<EditEvent, 'id' | 'actor' | 'beforeRevision' | 'afterRevision' | 'beforeFingerprint' | 'afterFingerprint'>;
function commit(snapshot: WorkspaceSnapshot, event: PendingEvent): WorkspaceResult {
  const w = snapshot.workspace;
  const beforeFingerprint=w.workingFingerprint,afterFingerprint=workingDocumentFingerprint(snapshot);
  w.ledger.push({ ...event, id: crypto.randomUUID(), actor: 'user', beforeRevision: w.workingRevision, afterRevision: w.workingRevision + 1,beforeFingerprint,afterFingerprint });
  w.workingFingerprint=afterFingerprint;
  w.workingRevision++;
  const errors = workspaceInvariantErrors(snapshot);
  return errors.length ? fail('invalid_transaction', ...errors) : { ok: true, snapshot: freezeWorkspaceValue(snapshot) };
}
/** Atomic: input is never mutated, including failure paths. All edits invalidate candidate via workingRevision. */
export function transactWorkspace(input: WorkspaceSnapshot, expectedRevision: number, action: WorkspaceAction): WorkspaceResult {
  if (input.workspace.workingRevision !== expectedRevision) return fail('stale_revision');
  if (input.workspace.staged) return fail('pending_partition');
  if (!hasWorkspaceApproval(input)) return fail('approval_required');
  const errors = workspaceInvariantErrors(input); if (errors.length) return fail('invalid_transaction', ...errors);
  const s = structuredClone(input), w = s.workspace;
  const embeddedSignatureFieldsLocked = s.reviewBlocks.some(block => block.role === 'body' && !!embeddedRecipientsSignatureTable(block));
  let event: PendingEvent;
  const app = 'id' in action ? s.doc.appendices?.find(a => a.id === action.id) : undefined;
  switch (action.type) {
    case 'setNationalHeaderOmitted': {
      s.doc.omitNationalHeader = action.omitted;
      event={action:'edit',kind:'field',targetId:'omitNationalHeader',sourceRefs:[]};break;
    }
    case 'applyIssuerProfile': {
      if (action.profile && action.profile !== 'generic' && action.profile !== (s.standardType === 'party' ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID)) return fail('invalid_transaction','profile_regime_mismatch');
      s.doc.headerProfile=action.profile ?? 'generic';
      s.doc.orgHeader1=action.orgHeader1;
      s.doc.orgHeader2=action.orgHeader2;
      event={action:'edit',kind:'field',targetId:'orgHeader1,orgHeader2',sourceRefs:[]};break;
    }
    case 'setProfile': {
      if(action.profile!=='generic'&&action.profile!==(s.standardType==='party'?COMPANY_HEADER_HD05_PROFILE_ID:COMPANY_HEADER_PROFILE_ID))return fail('invalid_transaction','profile_regime_mismatch');
      s.doc.headerProfile=action.profile;
      if(action.profile===COMPANY_HEADER_PROFILE_ID)s.doc=applyCompanyProfile(s.doc);
      if(action.profile===COMPANY_HEADER_HD05_PROFILE_ID)s.doc=applyCompanyHD05Profile(s.doc);
      event={action:'edit',kind:'field',targetId:'headerProfile',sourceRefs:[]};break;
    }
    case 'editField': {
      const allowed = ['orgHeader1','orgHeader2','nationalHeader1','nationalHeader2','locationAndDate','documentType','referenceNumber','subject','signTitle','signName','recipients','draftNote'];
      if (!allowed.includes(action.field)) return fail('invalid_transaction', 'field_requires_typed_action');
      if (action.field === 'nationalHeader1' || action.field === 'nationalHeader2') return fail('readonly_content', 'fixed_regime_heading');
      if (embeddedSignatureFieldsLocked && ['signTitle', 'signName', 'recipients'].includes(action.field)) return fail('readonly_content', 'embedded_signature_table_field');
      if(s.doc.headerProfile===COMPANY_HEADER_PROFILE_ID&&LOCKED_COMPANY_FIELDS.has(action.field)||s.doc.headerProfile===COMPANY_HEADER_HD05_PROFILE_ID&&LOCKED_COMPANY_HD05_FIELDS.has(action.field))return fail('readonly_content','profile_locked_field');
      (s.doc as any)[action.field] = action.value;
      event = { action: 'edit', kind: 'field', targetId: action.field, sourceRefs: s.structuredImport?.fields[action.field]?.sourceBlockIds ?? [] }; break;
    }
    case 'editFields': {
      const entries = Object.entries(action.fields) as Array<[keyof DocumentState, string]>;
      const allowed = new Set(['orgHeader1','orgHeader2','locationAndDate','documentType','referenceNumber','subject','signTitle','signName','recipients','draftNote']);
      if (!entries.length || entries.some(([field]) => !allowed.has(field))) return fail('invalid_transaction', 'field_requires_typed_action');
      if (embeddedSignatureFieldsLocked && entries.some(([field]) => ['signTitle', 'signName', 'recipients'].includes(field))) return fail('readonly_content', 'embedded_signature_table_field');
      if (entries.some(([field]) => s.doc.headerProfile === COMPANY_HEADER_PROFILE_ID && LOCKED_COMPANY_FIELDS.has(field)
        || s.doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID && LOCKED_COMPANY_HD05_FIELDS.has(field))) {
        return fail('readonly_content', 'profile_locked_field');
      }
      for (const [field, value] of entries) (s.doc as any)[field] = value;
      event = {
        action: 'edit',
        kind: 'field',
        targetId: entries.map(([field]) => String(field)).join(','),
        sourceRefs: [...new Set(entries.flatMap(([field]) => s.structuredImport?.fields[field]?.sourceBlockIds ?? []))],
      };
      break;
    }
    case 'editBody': case 'editAppendix': {
      if (action.type === 'editAppendix' && !app) return fail('not_found');
      const oldHtml = app?.html ?? s.doc.bodyHtml, reasons = readonlyReasons(s, oldHtml);
      if (reasons.length) return fail('readonly_content', ...reasons);
      if (canonicalWorkspaceValue(tableIds(oldHtml).sort()) !== canonicalWorkspaceValue(tableIds(action.html).sort())) return fail('invalid_transaction', 'use_explicit_table_transaction');
      const nextReasons = readonlyReasons(s, action.html); if (nextReasons.length) return fail('readonly_content', ...nextReasons);
      const beforeOrder = tableIds(oldHtml);
      replaceContainer(s, action.html, app?.id);
      event = { action: 'edit', kind: app ? 'appendix' : 'body', targetId: app?.id ?? 'body', sourceRefs: app?.sourceBlockIds ?? w.nodes.filter(n => n.container === 'body').flatMap(n => n.lineage), beforeOrder, afterOrder: tableIds(action.html) }; break;
    }
    case 'editNode': {
      const node=w.nodes.find(n=>n.editableNodeId===action.id);if(!node)return fail('not_found');
      const before=assessWorkspaceNodeCapability(s,node);if(!before.editable)return fail('readonly_content',...before.reasons);
      const after=assessWorkspaceNodeCapability(s,{...node,html:action.html});if(!after.editable)return fail('readonly_content',...after.reasons);
      if(tableIds(node.html).length||tableIds(action.html).length||readonlyReasons(s,action.html).length)return fail('readonly_content','node_must_not_contain_table_or_media');
      node.html=action.html;syncDocumentNodes(s);
      event={action:'edit',kind:node.container==='body'?'node':'appendix',targetId:node.editableNodeId,sourceRefs:[...node.lineage]};break;
    }
    case 'applySemanticParagraphRules': {
      if (action.regime !== s.standardType || action.profile !== (s.doc.headerProfile ?? 'generic')) return fail('invalid_transaction', 'semantic_rule_context_mismatch');
      if (!s.doc.documentType.trim() || action.paragraphIndex !== 0 || /[\r\n]/.test(action.expectedText)) return fail('invalid_transaction', 'semantic_paragraph_anchor_unsupported');
      const source = w.source?.blocks.find(block => block.id === action.sourceBlockId);
      const role = w.partition.roles.find(item => item.sourceBlockId === action.sourceBlockId)?.role;
      if (!source || source.kind !== 'paragraph' || role !== 'body') return fail('invalid_transaction', 'semantic_source_block_not_body_paragraph');
      const decision = action.decision;
      const expectedUnitId = `semantic.v1.body.body.${action.sourceBlockId}.p${action.paragraphIndex}`;
      const isApproved = (decision?.status === 'user_confirmed' && decision.decidedBy === 'user') ||
        (decision?.status === 'auto_confirmed' && decision.decidedBy === 'policy');
      if (!w.source || !decision || decision.unitId !== expectedUnitId || !isApproved ||
          decision.sourceSha256 !== w.source.blobHash || decision.sourceGeneration !== w.source.generation ||
          decision.partitionFingerprint !== w.partition.fingerprint || decision.workingRevision !== w.workingRevision || !decision.evidenceFingerprint) {
        return fail('approval_required', 'semantic_decision_not_currently_approved');
      }
      if (source.text.split(/\r?\n/u).length !== 1 || source.text.trim().replace(/[\t ]+/g, ' ') !== action.expectedText.trim().replace(/[\t ]+/g, ' ')) return fail('invalid_transaction', 'semantic_source_quote_mismatch');
      const matchingNodes = w.nodes.filter(node => node.container === 'body' && node.lineage.includes(action.sourceBlockId));
      if (matchingNodes.length !== 1 || matchingNodes[0].lineage.length !== 1) return fail('invalid_transaction', 'semantic_node_anchor_ambiguous');
      const node = matchingNodes[0];
      const capability = assessWorkspaceNodeCapability(s, node);
      if (!capability.editable || tableIds(node.html).length || readonlyReasons(s, node.html).length) return fail('readonly_content', ...capability.reasons, 'semantic_node_not_safely_editable');
      if (/<p\b[^>]*style\s*=\s*(["'])[^"']*text-align\s*:\s*(?:center|right)/i.test(node.html) || /^\s*[-—–_.\s]{3,}$/u.test(action.expectedText) || /^(?:điều\s+\d+|chương\s+|mục\s+|khoản\s+|điểm\s+[a-zđ])/iu.test(action.expectedText.trim())) return fail('invalid_transaction', 'semantic_paragraph_not_eligible_body');
      let formatting;
      try { formatting = resolveSemanticRuleFormatting(action.regime, action.profile, action.ruleIds); }
      catch (error) { return fail('invalid_transaction', error instanceof Error ? error.message : 'semantic_rule_set_invalid'); }
      const applied = applySemanticRuleFormatting(node.html, action.expectedText, formatting);
      if (!applied.ok) return fail('invalid_transaction', applied.reason);
      if (applied.html === node.html) return fail('invalid_transaction', 'semantic_rule_already_applied');
      node.html = applied.html;
      syncDocumentNodes(s);
      event = { action: 'edit', kind: 'node', targetId: node.editableNodeId, sourceRefs: [action.sourceBlockId] };
      break;
    }
    case 'registerTemplateTables': {
      if(w.source||!action.templateId||!action.models.length||s.doc.importedTables)return fail('invalid_transaction','template_table_bootstrap_context_invalid');
      const ids=action.models.map(m=>m.tableId);
      if(new Set(ids).size!==ids.length||action.models.some(m=>!m.sourcePath?.startsWith(`template:${action.templateId}:`)||!m.rows.length||m.rows.some(r=>r.cells.some(c=>c.gridSpan>1||c.vMerge||(c.rowSpan??1)>1))))return fail('invalid_transaction','template_table_model_not_canonical');
      for(const id of ids)if(w.nodes.filter(n=>tableIds(n.html).includes(id)).length!==1)return fail('invalid_transaction','template_table_html_model_mismatch');
      const beforeOrder=w.nodes.map(n=>n.editableNodeId);s.doc.importedTables=Object.fromEntries(action.models.map(m=>[m.tableId,structuredClone(m)]));
      event={action:'add',kind:'table',targetId:`template-bootstrap:${action.templateId}`,sourceRefs:[],beforeOrder,afterOrder:beforeOrder,addedTableIds:ids};break;
    }
    case 'addAppendix': {
      if (!action.appendix.id || s.doc.appendices?.some(a => a.id === action.appendix.id) || w.ledger.some(e=>e.kind==='appendix'&&e.targetId===action.appendix.id) || action.appendix.sourceBlockIds.length) return fail('invalid_transaction', 'new_appendix_requires_unique_id_and_no_fabricated_source');
      if (tableIds(action.appendix.html).length || readonlyReasons(s, action.appendix.html).length) return fail('readonly_content');
      const list = s.doc.appendices ?? (s.doc.appendices = []), beforeOrder = list.map(a => a.id);
      list.splice(Math.max(0, Math.min(action.index ?? list.length, list.length)), 0, structuredClone(action.appendix));
      replaceContainer(s, action.appendix.html, action.appendix.id);
      event = { action: 'add', kind: 'appendix', targetId: action.appendix.id, sourceRefs: [], beforeOrder, afterOrder: list.map(a => a.id) }; break;
    }
    case 'deleteAppendix': {
      if (!app) return fail('not_found'); if (!action.confirmed) return fail('confirmation_required');
      const beforeOrder = s.doc.appendices!.map(a => a.id);
      s.doc.appendices = s.doc.appendices!.filter(a => a.id !== app.id); w.nodes = w.nodes.filter(n => n.appendixId !== app.id);
      event = { action: 'remove', kind: 'appendix', targetId: app.id, sourceRefs: app.sourceBlockIds, confirmed: true,
        removedTableIds: tableIds(app.html), beforeOrder, afterOrder: s.doc.appendices.map(a => a.id) }; break;
    }
    case 'renameAppendix': {
      if (!app) return fail('not_found'); app.title = action.title;
      event = { action: 'edit', kind: 'appendix', targetId: app.id, sourceRefs: app.sourceBlockIds }; break;
    }
    case 'moveAppendix': {
      if (!app) return fail('not_found'); const beforeOrder = s.doc.appendices!.map(a => a.id);
      s.doc.appendices = s.doc.appendices!.filter(a => a.id !== app.id); s.doc.appendices.splice(Math.max(0, Math.min(action.index, s.doc.appendices.length)), 0, app);
      event = { action: 'move', kind: 'appendix', targetId: app.id, sourceRefs: app.sourceBlockIds, beforeOrder, afterOrder: s.doc.appendices.map(a => a.id) }; break;
    }
    case 'splitNode': {
      const index = w.nodes.findIndex(n => n.editableNodeId === action.id), n = w.nodes[index]; if (!n) return fail('not_found');
      if (tableIds(n.html).length || readonlyReasons(s, n.html).length || action.parts.some(p=>tableIds(p).length||readonlyReasons(s,p).length) || action.parts.length < 2 || action.parts.join('').replace(/<[^>]*>/g,'') !== n.html.replace(/<[^>]*>/g,'')) return fail('invalid_transaction', 'split_must_preserve_text');
      w.nodes.splice(index, 1, ...action.parts.map(html => ({ ...n, editableNodeId: crypto.randomUUID(), html })));
      syncDocumentNodes(s); event = { action: 'split', kind: 'node', targetId: n.editableNodeId, sourceRefs: n.lineage }; break;
    }
    case 'mergeNodes': {
      const indices = action.ids.map(id => w.nodes.findIndex(n => n.editableNodeId === id));
      if (indices.length < 2 || indices.some((v,i) => v < 0 || (i > 0 && v !== indices[i-1] + 1))) return fail('invalid_transaction', 'merge_requires_adjacent_nodes');
      const nodes = indices.map(i => w.nodes[i]), n = nodes[0];
      if (tableIds(action.html).length || readonlyReasons(s,action.html).length || nodes.some(x => x.container !== n.container || x.appendixId !== n.appendixId || tableIds(x.html).length || readonlyReasons(s,x.html).length) || nodes.map(x => x.html.replace(/<[^>]*>/g,'')).join('') !== action.html.replace(/<[^>]*>/g,'')) return fail('invalid_transaction', 'merge_must_preserve_content');
      const id = crypto.randomUUID(), lineage = [...new Set(nodes.flatMap(n => n.lineage))];
      w.nodes.splice(indices[0], indices.length, { ...n, editableNodeId: id, html: action.html, lineage }); syncDocumentNodes(s);
      event = { action: 'merge', kind: 'node', targetId: id, sourceRefs: lineage }; break;
    }
    case 'pasteNode': {
      if (action.appendixId && !s.doc.appendices?.some(a => a.id === action.appendixId)) return fail('not_found');
      if (tableIds(action.html).length || readonlyReasons(s, action.html).length) return fail('readonly_content');
      const n: EditableNode = { editableNodeId: crypto.randomUUID(), html: action.html, container: action.appendixId ? 'appendix' : 'body', ...(action.appendixId ? { appendixId: action.appendixId } : {}), lineage: [] };
      const idx = action.afterId ? w.nodes.findIndex(n => n.editableNodeId === action.afterId) : w.nodes.length - 1;
      if (action.afterId && idx < 0) return fail('not_found');
      if (action.afterId && (w.nodes[idx].container !== n.container || w.nodes[idx].appendixId !== n.appendixId)) return fail('invalid_transaction', 'container_mismatch');
      w.nodes.splice(idx + 1, 0, n); syncDocumentNodes(s); event = { action: 'add', kind: 'node', targetId: n.editableNodeId, sourceRefs: [] }; break;
    }
    case 'addTable': {
      const model=structuredClone(action.model),id=model.tableId;
      if(!id||w.source?.blocks.some(b=>(b.tableModel?.tableId??b.id)===id)||s.doc.importedTables?.[id]||w.ledger.some(e=>e.kind==='table'&&e.targetId===id)||w.nodes.some(n=>tableIds(n.html).includes(id)))return fail('invalid_transaction','duplicate_table_id');
      if(action.appendixId&&!s.doc.appendices?.some(a=>a.id===action.appendixId))return fail('not_found');
      if(!model.rows.length||model.rows.some(r=>r.cells.some(c=>c.gridSpan>1||c.vMerge||(c.rowSpan??1)>1)))return fail('readonly_content','new_table_geometry_not_proven');
      const cells=model.rows.flatMap(r=>r.cells);if(new Set(cells.map(c=>c.cellId)).size!==cells.length)return fail('invalid_transaction','duplicate_cell_id');
      const node:EditableNode={editableNodeId:crypto.randomUUID(),container:action.appendixId?'appendix':'body',...(action.appendixId?{appendixId:action.appendixId}:{}),html:tableModelToHtmlView(model),lineage:[]};
      const index=action.afterId?w.nodes.findIndex(n=>n.editableNodeId===action.afterId):w.nodes.length-1;
      if(action.afterId&&(index<0||w.nodes[index].container!==node.container||w.nodes[index].appendixId!==node.appendixId))return fail('invalid_transaction','container_mismatch');
      const beforeOrder=w.nodes.map(n=>n.editableNodeId);w.nodes.splice(index+1,0,node);(s.doc.importedTables??(s.doc.importedTables={}))[id]=model;syncDocumentNodes(s);
      event={action:'add',kind:'table',targetId:id,sourceRefs:[],beforeOrder,afterOrder:w.nodes.map(n=>n.editableNodeId)};break;
    }
    case 'editCell': {
      const block = s.reviewBlocks.find(b => (b.tableModel?.tableId ?? b.id) === action.tableId), node = w.nodes.find(n => tableIds(n.html).includes(action.tableId));
      const baseModel=s.doc.importedTables?.[action.tableId]??block?.tableModel;if (!baseModel || !node) return fail('not_found');
      if (readonlyReasons(s, node.html).length || w.partition.cells.some(c => c.sourceBlockId === block?.id && c.role !== block?.role)) return fail('readonly_content');
      const capability=assessTableCellCapabilities(s,action.tableId).find(c=>c.cellId===action.cellId);if(!capability?.editable)return fail('readonly_content',capability?.reason??'table_cell_not_editable');
      const model = syncTableModelFromHtml(node.html, baseModel).effectiveModel;
      const cell = model.rows.flatMap(r => r.cells).find(c => c.cellId === action.cellId); if (!cell) return fail('not_found');
      if (cell.vMerge || cell.gridSpan > 1 || (cell.rowSpan ?? 1) > 1) return fail('readonly_content', 'merged_cell_edit_not_proven');
      const paragraphs=action.text.split('\n');
      if(paragraphs.length!==cell.paragraphs.length||paragraphs.length!==1) return fail('readonly_content','paragraph_structure_change_not_proven');
      const nextHtml=replaceSimpleTableCellText(node.html,action.cellId,action.text);if(nextHtml===undefined)return fail('readonly_content','cell_html_patch_not_proven');
      cell.text = action.text; cell.paragraphs = cell.paragraphs.map((p,i)=>({...p,text:paragraphs[i],runs:reconcileRunsWithNewText(p.runs??[{text:p.text}],paragraphs[i],p.runs?.[0])}));
      (s.doc.importedTables??(s.doc.importedTables={}))[action.tableId]=model;
      if(block){block.tableModel = model; block.tableData = model.rows.map(r => r.cells.map(c => c.text));}
      node.html = nextHtml; syncDocumentNodes(s);
      event = { action: 'edit', kind: 'table', targetId: action.tableId, sourceRefs: block?[block.id]:[] }; break;
    }
    case 'removeTable': case 'moveTable': {
      const index = w.nodes.findIndex(n => tableIds(n.html).includes(action.tableId)), n = w.nodes[index]; if (!n) return fail('not_found');
      if (!/^\s*<table\b[\s\S]*<\/table>\s*$/.test(n.html) || tableIds(n.html).length !== 1) return fail('readonly_content');
      const beforeOrder = w.nodes.map(n => n.editableNodeId);
      if (action.type === 'removeTable') { if (!action.confirmed) return fail('confirmation_required'); w.nodes.splice(index,1);if(s.doc.importedTables)delete s.doc.importedTables[action.tableId];
        event = { action: 'remove', kind: 'table', targetId: action.tableId, sourceRefs: n.lineage, confirmed: true, removedTableIds: [action.tableId], beforeOrder, afterOrder: w.nodes.map(n=>n.editableNodeId) }; }
      else { if (action.appendixId && !s.doc.appendices?.some(a=>a.id===action.appendixId)) return fail('not_found');
        w.nodes.splice(index,1); const dest = action.afterId ? w.nodes.findIndex(n=>n.editableNodeId===action.afterId) : w.nodes.length-1;
        if (action.afterId && dest < 0) return fail('not_found');
        if(action.afterId&&(w.nodes[dest].container!==(action.appendixId?'appendix':'body')||w.nodes[dest].appendixId!==action.appendixId))return fail('invalid_transaction','container_mismatch');
        n.container = action.appendixId ? 'appendix' : 'body'; n.appendixId = action.appendixId;
        w.nodes.splice(dest+1,0,n); event = { action: 'move', kind: 'table', targetId: action.tableId, sourceRefs: n.lineage, beforeOrder, afterOrder: w.nodes.map(n=>n.editableNodeId) }; }
      syncDocumentNodes(s); break;
    }
  }
  return commit(s, event);
}
export function approveWorkspacePartition(input: WorkspaceSnapshot): WorkspaceResult {
  if (input.workspace.staged) return fail('pending_partition');
  const errors = workspaceInvariantErrors(input); if (input.workspace.source) errors.push(...validateReviewedBlocks(input.reviewBlocks, input.workspace.source.blocks));
  if (errors.length) return fail('invalid_transaction', ...errors);
  const s = structuredClone(input), p = s.workspace.partition;
  p.approval = { token: crypto.randomUUID(), sourceIdentity: s.workspace.source?.identity ?? 'template', regime: s.standardType, revision: p.revision, fingerprint: p.fingerprint };
  s.workspace.legacyNeedsApproval = false; return { ok: true, snapshot: freezeWorkspaceValue(s) };
}
/** Changing regime retains the working draft but requires a fresh source approval. */
export function changeWorkspaceRegime(input:WorkspaceSnapshot,expectedRevision:number,regime:'state'|'party'):WorkspaceResult {
  if(input.workspace.workingRevision!==expectedRevision)return fail('stale_revision');
  if(input.workspace.staged)return fail('pending_partition');
  const errors=workspaceInvariantErrors(input);if(errors.length)return fail('invalid_transaction',...errors);
  if(regime===input.standardType)return{ok:true,snapshot:input};
  const s=structuredClone(input);s.standardType=regime;s.doc.omitNationalHeader=false;
  if(s.doc.headerProfile!=='generic'&&s.doc.headerProfile!==(regime==='party'?COMPANY_HEADER_HD05_PROFILE_ID:COMPANY_HEADER_PROFILE_ID))s.doc.headerProfile='generic';
  for(const [key,value]of Object.entries(s.workspace.overrides))if(value&&typeof value==='object'&&'regime'in value&&(value as any).regime!==regime)delete s.workspace.overrides[key];
  s.workspace.partition=makePartition(s.workspace.source,regime,s.reviewBlocks,s.workspace.partition.revision+1,s.workspace.partition.cells);
  s.workspace.legacyNeedsApproval=!!s.workspace.source;
  return commit(s,{action:'repartition',kind:'partition',targetId:String(s.workspace.partition.revision),sourceRefs:s.reviewBlocks.map(b=>b.id)});
}
export function stageWorkspacePartition(input: WorkspaceSnapshot, blocks: SourceBlock[], cells: CellRoleMapping[] = []): WorkspaceResult {
  const invariantErrors=workspaceInvariantErrors(input);if(invariantErrors.length)return fail('invalid_transaction',...invariantErrors);
  if (input.workspace.staged) return fail('pending_partition');
  if (!hasWorkspaceApproval(input)) return fail('approval_required');
  const errors = validateReviewedBlocks(blocks, input.workspace.source?.blocks ?? input.reviewBlocks); if (errors.length) return fail('invalid_transaction', ...errors);
  // Only role/cell mapping may change; reject content/identity edits masquerading as partition changes.
  for (const b of blocks) {
    const previous = input.reviewBlocks.find(x=>x.id===b.id)!;
    if (canonicalWorkspaceValue({...b, role: undefined, isConfirmed: undefined}) !== canonicalWorkspaceValue({...previous, role: undefined, isConfirmed: undefined})) return fail('invalid_transaction','partition_cannot_edit_source_content');
  }
  const s = structuredClone(input), w = s.workspace;
  w.staged = { partition: makePartition(w.source, s.standardType, blocks, w.partition.revision+1,cells), reviewBlocks: structuredClone(blocks), frozen: {
    doc: structuredClone(s.doc), reviewBlocks: structuredClone(s.reviewBlocks), structuredImport: structuredClone(s.structuredImport), partition: structuredClone(w.partition),
    workingRevision: w.workingRevision, ledger: structuredClone(w.ledger), nodes: structuredClone(w.nodes), overrides: structuredClone(w.overrides), workingFingerprint:w.workingFingerprint } };
  return { ok: true, snapshot: freezeWorkspaceValue(s) };
}
export function cancelWorkspacePartition(input: WorkspaceSnapshot): WorkspaceResult {
  const errors=workspaceInvariantErrors(input);if(errors.length)return fail('invalid_transaction',...errors);
  const stage = input.workspace.staged; if (!stage) return fail('not_found');
  const s = structuredClone(input), f = structuredClone(stage.frozen);
  s.doc=f.doc; s.reviewBlocks=f.reviewBlocks; s.structuredImport=f.structuredImport;
  Object.assign(s.workspace,{partition:f.partition,workingRevision:f.workingRevision,ledger:f.ledger,nodes:f.nodes,overrides:f.overrides,workingFingerprint:f.workingFingerprint}); delete s.workspace.staged;
  return { ok:true,snapshot:freezeWorkspaceValue(s) };
}
/** Conservative rebase: never replace a changed editor container from SourceBlock.html. */
export function confirmWorkspacePartition(input: WorkspaceSnapshot): WorkspaceResult {
  const errors=workspaceInvariantErrors(input);if(errors.length)return fail('invalid_transaction',...errors);
  const stage=input.workspace.staged; if (!stage) return fail('not_found');
  const s=structuredClone(input), w=s.workspace, f=stage.frozen;
  const changed=stage.reviewBlocks.filter(b=>b.role!==f.reviewBlocks.find(x=>x.id===b.id)?.role);
  const conflicts:string[]=[];
  if (canonicalWorkspaceValue(stage.partition.cells)!==canonicalWorkspaceValue(f.partition.cells)) conflicts.push('cell_mapping_rebase_not_supported');
  for(const b of changed){
    const before=f.reviewBlocks.find(x=>x.id===b.id)!;
    const related=w.nodes.filter(n=>n.lineage.includes(b.id));
    const edited=w.ledger.some(e=>e.action!=='repartition'&&(e.sourceRefs.includes(b.id)||e.kind==='body'&&before.role==='body'||e.kind==='appendix'&&f.doc.appendices?.some(a=>a.id===e.targetId&&a.sourceBlockIds.includes(b.id))));
    if(edited||related.some(n=>n.lineage.length!==1)||related.length>1) conflicts.push(`edited_or_ambiguous_source:${b.id}`);
    if (!['body','appendix','unclassified'].includes(before.role??'unclassified') || !['body','appendix','unclassified'].includes(b.role??'unclassified')) conflicts.push(`field_role_rebase_requires_resolution:${b.id}`);
    if(related.some(n=>readonlyReasons(s,n.html).length)) conflicts.push(`readonly_source:${b.id}`);
  }
  if(conflicts.length) return fail('rebase_conflict',...conflicts);
  for(const b of changed){
    const related=w.nodes.filter(n=>n.lineage.includes(b.id)); const html=related[0]?.html??htmlOf(b);
    w.nodes=w.nodes.filter(n=>!n.lineage.includes(b.id));
    for(const app of s.doc.appendices??[]){app.sourceBlockIds=app.sourceBlockIds.filter(id=>id!==b.id);app.blocks=app.blocks.filter(x=>x.id!==b.id);}
    if(b.role==='body'){
      const n:EditableNode={editableNodeId:related[0]?.editableNodeId??crypto.randomUUID(),container:'body',html,lineage:[b.id]};
      // Place before first node whose source follows this block; pasted nodes keep their order.
      const index=w.nodes.findIndex(n=>n.container==='body'&&n.lineage.some(id=>(w.source?.blocks.find(x=>x.id===id)?.index??-1)>b.index));
      w.nodes.splice(index<0?w.nodes.length:index,0,n);
    }else if(b.role==='appendix'){
      const id=crypto.randomUUID(); const app:AppendixDocument={id,title:'',html,blocks:[structuredClone(b)],sourceBlockIds:[b.id],extractionStatus:'confirmed'};
      (s.doc.appendices??(s.doc.appendices=[])).push(app);w.nodes.push({editableNodeId:related[0]?.editableNodeId??crypto.randomUUID(),container:'appendix',appendixId:id,html,lineage:[b.id]});
    }
  }
  s.reviewBlocks=structuredClone(stage.reviewBlocks);w.partition=structuredClone(stage.partition);delete w.staged;
  w.partition.approval={token:crypto.randomUUID(),sourceIdentity:w.source?.identity??'template',regime:s.standardType,revision:w.partition.revision,fingerprint:w.partition.fingerprint};w.legacyNeedsApproval=false;
  s.doc.unclassified=s.reviewBlocks.filter(b=>b.role==='unclassified');
  if(s.structuredImport){s.structuredImport.blocks=structuredClone(s.reviewBlocks);s.structuredImport.unclassified=structuredClone(s.doc.unclassified);s.structuredImport.body.sourceBlockIds=s.reviewBlocks.filter(b=>b.role==='body').map(b=>b.id);}
  syncDocumentNodes(s);
  if(s.structuredImport){s.structuredImport.body.html=s.doc.bodyHtml;s.structuredImport.appendices=structuredClone(s.doc.appendices??[]);}
  return commit(s,{action:'repartition',kind:'partition',targetId:String(w.partition.revision),sourceRefs:changed.map(b=>b.id)});
}
