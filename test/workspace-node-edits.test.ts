import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedMixedWorkspace,mixedBlocks} from './support/workspaceFixtures.ts';
import {transactWorkspace} from '../src/utils/workspaceTransactions.ts';
import {workspaceInvariantErrors} from '../src/utils/workspaceState.ts';

test('editNode changes one eligible paragraph and leaves neighboring table/paragraph identity and bytes intact',()=>{
 const s=approvedMixedWorkspace(),table=s.workspace.nodes.find(n=>n.html.includes('data-source-table-id'))!,tail=s.workspace.nodes.find(n=>n.html.includes('Đoạn cuối'))!;
 const tableHtml=table.html,tableId=table.editableNodeId,tailHtml=tail.html,tailId=tail.editableNodeId;
 const first=s.workspace.nodes.find(n=>n.html.includes('Đoạn đầu'))!;
 const result=transactWorkspace(s,0,{type:'editNode',id:first.editableNodeId,html:'<p>Đoạn đã sửa</p>'});
 assert.equal(result.ok,true);if(!result.ok)return;
 assert.equal(result.snapshot.doc.bodyHtml,'<p>Đoạn đã sửa</p>'+tableHtml+tailHtml);
 assert.equal(result.snapshot.workspace.nodes.find(n=>n.editableNodeId===tableId)?.html,tableHtml);
 assert.equal(result.snapshot.workspace.nodes.find(n=>n.editableNodeId===tailId)?.html,tailHtml);
 assert.equal(result.snapshot.workspace.workingRevision,1);
 assert.equal(result.snapshot.workspace.ledger.at(-1)?.kind,'node');
 assert.equal(result.snapshot.workspace.ledger.at(-1)?.targetId,first.editableNodeId);
 assert.deepEqual(workspaceInvariantErrors(result.snapshot),[]);
 assert.equal(s.doc.bodyHtml,mixedBlocks().bodyHtml,'failed or successful transaction never mutates its input');
});

test('editNode rejects a table/media atom atomically and stale node ids do not fall through to whole Body',()=>{
 const s=approvedMixedWorkspace(true),table=s.workspace.nodes.find(n=>n.html.includes('data-source-table-id'))!,image=s.workspace.nodes.find(n=>n.html.includes('<img'))!;
 for(const [node,html] of [[table,'<p>replacement</p>'],[image,'<p>image replacement</p>']] as const){
  const before=structuredClone(s),result=transactWorkspace(s,0,{type:'editNode',id:node.editableNodeId,html});
  assert.equal(result.ok,false);assert.deepEqual(s,before);
 }
 const missing=transactWorkspace(s,0,{type:'editNode',id:'deleted-node',html:'<p>no-op</p>'});
 assert.equal(missing.ok,false);if(!missing.ok)assert.equal(missing.error,'not_found');
});
