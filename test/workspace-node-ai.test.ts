import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedMixedWorkspace} from './support/workspaceFixtures.ts';
import {createWorkspaceAiTarget,receiveWorkspaceAiResult,applyWorkspaceAiResult,validateWorkspaceAiTarget} from '../src/utils/workspaceAiTarget.ts';
import {transactWorkspace} from '../src/utils/workspaceTransactions.ts';

test('AI target is one eligible paragraph; apply edits only that node and preserves neighboring atoms',()=>{
 const snapshot=approvedMixedWorkspace(true),node=snapshot.workspace.nodes.find(n=>n.html.includes('Đoạn đầu'))!;
 const target=createWorkspaceAiTarget(snapshot,{kind:'node',nodeId:node.editableNodeId});
 assert.ok(target);assert.equal(target.kind,'node');assert.equal(target.originalText,'<p>Đoạn đầu</p>');assert.deepEqual(target.sourceRefs,node.lineage);
 assert.equal(validateWorkspaceAiTarget(snapshot,target).status,'supported');
 const received=receiveWorkspaceAiResult(snapshot,target,'<p>Đoạn đầu đã sửa</p>');assert.equal(received.check.status,'supported');
 const applied=applyWorkspaceAiResult(snapshot,received.proposal!);assert.equal(applied.ok,true);
 if(!applied.ok)return;
 assert.equal(applied.snapshot.doc.bodyHtml,'<p>Đoạn đầu đã sửa</p>'+snapshot.workspace.nodes[1].html+snapshot.workspace.nodes[2].html+snapshot.workspace.nodes[3].html);
 assert.equal(applied.snapshot.workspace.nodes[1].html,snapshot.workspace.nodes[1].html);
 assert.deepEqual(applied.snapshot.workspace.source,snapshot.workspace.source);
 assert.equal(applied.snapshot.workspace.workingRevision,snapshot.workspace.workingRevision+1);
 assert.equal(applied.snapshot.workspace.ledger.at(-1)?.targetId,node.editableNodeId);
});

test('AI node rejects added structure, unsafe markup, unsupported atoms, and stale contexts without mutation',()=>{
 const snapshot=approvedMixedWorkspace(true),node=snapshot.workspace.nodes.find(n=>n.html.includes('Đoạn đầu'))!;
 const target=createWorkspaceAiTarget(snapshot,{kind:'node',nodeId:node.editableNodeId})!;
 for(const answer of ['<p>Đoạn đầu<img src="x"></p>','<p>Đoạn đầu</p><table><tr><td>x</td></tr></table>','<h2>Đoạn đầu</h2>','<p onclick="alert(1)">Đoạn đầu</p>'])
  assert.equal(receiveWorkspaceAiResult(snapshot,target,answer).proposal,undefined,answer);
 const changed=transactWorkspace(snapshot,0,{type:'editNode',id:snapshot.workspace.nodes[3].editableNodeId,html:'<p>Khác</p>'});assert.equal(changed.ok,true);
 if(changed.ok){assert.equal(validateWorkspaceAiTarget(changed.snapshot,target).status,'stale');const before=JSON.stringify(changed.snapshot);assert.equal(applyWorkspaceAiResult(changed.snapshot,{target,suggestedText:'<p>AI</p>'}).ok,false);assert.equal(JSON.stringify(changed.snapshot),before);}
 assert.equal(createWorkspaceAiTarget(snapshot,{kind:'node',nodeId:'deleted-node'}),undefined);
});
