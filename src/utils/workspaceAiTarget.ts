import type { DocumentState } from '../shared/schemas/document.schema.ts';
import { canonicalWorkspaceValue, hasWorkspaceApproval, workspaceInvariantErrors, type WorkspaceSnapshot } from './workspaceState.ts';
import { transactWorkspace, type WorkspaceResult } from './workspaceTransactions.ts';
import {assessWorkspaceNodeCapability} from './workspaceCapabilities.ts';

interface TargetContext {
  id: string;
  sourceRefs?: string[];
  revision: number;
  originalText: string;
  sourceIdentity: string;
  sourceGeneration: number;
  partitionRevision: number;
  partitionFingerprint: string;
  regime: 'state' | 'party';
}
export type WorkspaceAiTarget = TargetContext & (
  | { kind: 'field'; field: keyof DocumentState }
  | { kind: 'body' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'appendix' }
  | { kind: 'cell'; tableId: string; cellId: string }
);
export type AiTargetSelector = {kind:'field';field:keyof DocumentState} | {kind:'body'} | {kind:'node';nodeId:string} | {kind:'appendix';id:string} | {kind:'cell';tableId:string;cellId:string};
export type AiTargetCheck = {status:'supported'} | {status:'unsupported'|'stale'|'not_found'|'approval_required';reason:string};

function readTarget(snapshot:WorkspaceSnapshot, selector:AiTargetSelector|WorkspaceAiTarget): {id:string;text:string;refs:string[]}|undefined {
  switch(selector.kind){
    case 'body': return {id:'body',text:snapshot.doc.bodyHtml,refs:[...new Set(snapshot.workspace.nodes.filter(n=>n.container==='body').flatMap(n=>n.lineage))]};
    case 'node': {const node=snapshot.workspace.nodes.find(n=>n.editableNodeId===selector.nodeId&&n.container==='body');return node?{id:node.editableNodeId,text:node.html,refs:[...node.lineage]}:undefined;}
    case 'field': {const value=snapshot.doc[selector.field];return typeof value==='string'?{id:String(selector.field),text:value,refs:snapshot.structuredImport?.fields[selector.field]?.sourceBlockIds??[]}:undefined;}
    case 'appendix': {const a=snapshot.doc.appendices?.find(a=>a.id===selector.id);return a?{id:a.id,text:a.html,refs:a.sourceBlockIds}:undefined;}
    case 'cell': {const block=snapshot.reviewBlocks.find(b=>(b.tableModel?.tableId??b.id)===selector.tableId);
      const c=block?.tableModel?.rows.flatMap(r=>r.cells).find(c=>c.cellId===selector.cellId);
      return c?{id:c.cellId,text:c.text,refs:[block!.id]}:undefined;}
  }
}
/** Context only: never sends source bytes or broadens consent/payload to the AI backend. */
export function createWorkspaceAiTarget(snapshot:WorkspaceSnapshot,selector:AiTargetSelector): WorkspaceAiTarget|undefined {
  const value=readTarget(snapshot,selector);if(!value)return undefined;
  return {...selector,id:value.id,sourceRefs:[...value.refs],revision:snapshot.workspace.workingRevision,originalText:value.text,
    sourceIdentity:snapshot.workspace.source?.identity??'template',sourceGeneration:snapshot.workspace.source?.generation??0,
    partitionRevision:snapshot.workspace.partition.revision,partitionFingerprint:snapshot.workspace.partition.fingerprint,regime:snapshot.standardType};
}
/** Run at BOTH response reception and apply. Unsupported appendix/cell never routes to body refine. */
export function validateWorkspaceAiTarget(snapshot:WorkspaceSnapshot,target:WorkspaceAiTarget):AiTargetCheck {
  if(!hasWorkspaceApproval(snapshot))return{status:'approval_required',reason:'partition_not_approved'};
  if(workspaceInvariantErrors(snapshot).length)return{status:'stale',reason:'invalid_working_state'};
  const current=readTarget(snapshot,target);if(!current)return{status:'not_found',reason:'target_deleted'};
  if(target.id!==current.id||target.revision!==snapshot.workspace.workingRevision||target.sourceIdentity!==(snapshot.workspace.source?.identity??'template')||target.sourceGeneration!==(snapshot.workspace.source?.generation??0)
    ||target.partitionRevision!==snapshot.workspace.partition.revision||target.partitionFingerprint!==snapshot.workspace.partition.fingerprint||target.regime!==snapshot.standardType
    ||target.originalText!==current.text||canonicalWorkspaceValue(target.sourceRefs??[])!==canonicalWorkspaceValue(current.refs))return{status:'stale',reason:'target_context_changed'};
  if(target.kind==='appendix'||target.kind==='cell')return{status:'unsupported',reason:`backend_${target.kind}_target_not_supported`};
  if(target.kind==='node'){
    const node=snapshot.workspace.nodes.find(n=>n.editableNodeId===target.nodeId&&n.container==='body');
    if(!node)return{status:'not_found',reason:'node_deleted'};
    const capability=assessWorkspaceNodeCapability(snapshot,node);
    if(!capability.editable)return{status:'unsupported',reason:`node_not_editable:${capability.reasons.join(',')}`};
  }
  if(target.kind==='body'){
    const nodes=snapshot.workspace.nodes.filter(n=>n.container==='body');
    if(!nodes.length||nodes.some(n=>!assessWorkspaceNodeCapability(snapshot,n).editable))return{status:'unsupported',reason:'whole_body_not_fully_editable'};
  }
  const editable=['orgHeader1','orgHeader2','nationalHeader1','nationalHeader2','locationAndDate','documentType','referenceNumber','subject','signTitle','signName','recipients','draftNote'];
  if(target.kind==='field'&&!editable.includes(target.field))return{status:'unsupported',reason:'field_not_editable'};
  return{status:'supported'};
}
export function receiveWorkspaceAiResult(snapshot:WorkspaceSnapshot,target:WorkspaceAiTarget,suggestedText:string):{check:AiTargetCheck;proposal?:{target:WorkspaceAiTarget;suggestedText:string}} {
  const check=validateWorkspaceAiTarget(snapshot,target);
  if(check.status==='supported'&&target.kind==='node'){
    const current=snapshot.workspace.nodes.find(n=>n.editableNodeId===target.nodeId)!;
    if(!safeNodeSuggestion(snapshot,current,suggestedText))return{check:{status:'unsupported',reason:'ai_node_structure_or_capability_changed'}};
  }
  return check.status==='supported'?{check,proposal:{target:structuredClone(target),suggestedText}}:{check};
}
function safeNodeSuggestion(snapshot:WorkspaceSnapshot,node:WorkspaceSnapshot['workspace']['nodes'][number],suggested:string):boolean{
  const signature=(html:string)=>[...html.matchAll(/<\/?[a-z][^>]*>/gi)].map(m=>m[0].replace(/\s+/g,' ').trim());
  if(JSON.stringify(signature(node.html))!==JSON.stringify(signature(suggested)))return false;
  return assessWorkspaceNodeCapability(snapshot,{...node,html:suggested}).editable;
}
export function applyWorkspaceAiResult(snapshot:WorkspaceSnapshot,proposal:{target:WorkspaceAiTarget;suggestedText:string}):WorkspaceResult|{ok:false;error:'unsupported'|'stale';details:string[]} {
  const check=validateWorkspaceAiTarget(snapshot,proposal.target);
  if(check.status!=='supported')return{ok:false,error:check.status==='unsupported'?'unsupported':'stale',details:[check.reason]};
  const t=proposal.target;
  if(t.kind==='node'){
    const node=snapshot.workspace.nodes.find(n=>n.editableNodeId===t.nodeId)!;
    if(!safeNodeSuggestion(snapshot,node,proposal.suggestedText))return{ok:false,error:'unsupported',details:['ai_node_structure_or_capability_changed']};
    return transactWorkspace(snapshot,t.revision,{type:'editNode',id:t.nodeId,html:proposal.suggestedText});
  }
  if(t.kind==='body')return transactWorkspace(snapshot,t.revision,{type:'editBody',html:proposal.suggestedText});
  if(t.kind==='field')return transactWorkspace(snapshot,t.revision,{type:'editField',field:t.field,value:proposal.suggestedText});
  return{ok:false,error:'unsupported',details:['backend_target_not_supported']};
}
