import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import type {DocumentState, SourceBlock, TableModel} from '../src/shared/schemas/document.schema.ts';
import {tableModelToHtmlView} from '../src/shared/tableModel.ts';
import {createWorkspaceSnapshot,hasWorkspaceApproval,workspaceInvariantErrors,confirmedRemovedTableIds,type WorkspaceSnapshot} from '../src/utils/workspaceState.ts';
import {approveWorkspacePartition,transactWorkspace,stageWorkspacePartition,cancelWorkspacePartition,confirmWorkspacePartition,changeWorkspaceRegime,type WorkspaceResult} from '../src/utils/workspaceTransactions.ts';
import {createWorkspaceAiTarget,validateWorkspaceAiTarget,receiveWorkspaceAiResult,applyWorkspaceAiResult} from '../src/utils/workspaceAiTarget.ts';
import {changeBlockRole} from '../src/utils/proposalState.ts';
import {validateReviewedBlocks} from '../src/utils/importReview.ts';

function good(r:WorkspaceResult):WorkspaceSnapshot {if(!r.ok)assert.fail(JSON.stringify(r));return r.snapshot;}
function fixture():WorkspaceSnapshot{
 const model:TableModel={tableId:'t1',rowsCount:1,columnsCount:1,gridColumnsTwips:[5000],tableWidthTwips:5000,widthType:'dxa',alignment:'left',hasBorders:false,
 rows:[{rowIndex:0,isHeader:false,cantSplit:true,cells:[{cellId:'c1',rowIndex:0,colIndex:0,gridColumn:0,gridSpan:1,text:'SOURCE',paragraphs:[{text:'SOURCE',runs:[{text:'SOURCE',font:'Times New Roman',sizeHalfPt:24}]}]}]}]};
 const blocks:SourceBlock[]=[{id:'b1',index:0,kind:'paragraph',role:'body',text:'Alpha Beta',html:'<p>Alpha Beta</p>'},{id:'u1',index:1,kind:'paragraph',role:'unclassified',text:'Unclassified',html:'<p>Unclassified</p>'},
 {id:'a1',index:2,kind:'paragraph',role:'appendix',text:'SAME',html:'<p>SAME</p>'},{id:'a2',index:3,kind:'paragraph',role:'appendix',text:'SAME',html:'<p>SAME</p>'},
 {id:'t1',index:4,kind:'table',role:'appendix',text:'SOURCE',html:tableModelToHtmlView(model),rawXml:'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>SOURCE</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',unsupportedFeatures:[],tableModel:model,tableData:[['SOURCE']]}];
 const doc:DocumentState={orgHeader1:'',orgHeader2:'CQ',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',locationAndDate:'',documentType:'KẾ HOẠCH',referenceNumber:'',subject:'Test',bodyHtml:blocks[0].html!,signTitle:'',signName:'',recipients:'',headerProfile:'generic',
 appendices:[{id:'app1',title:'A',html:'<p>SAME</p>'+blocks[4].html!,blocks:[blocks[2],blocks[4]],sourceBlockIds:['a1','t1'],extractionStatus:'confirmed'}, {id:'app2',title:'B',html:'<p>SAME</p>',blocks:[blocks[3]],sourceBlockIds:['a2'],extractionStatus:'confirmed'}],unclassified:[blocks[1]]};
 return good(approveWorkspacePartition(createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:blocks,structuredImport:{source:{filename:'synthetic.docx',type:'docx',blockCount:5},fields:{},body:{html:doc.bodyHtml,sourceBlockIds:['b1']},appendices:doc.appendices!,unclassified:[blocks[1]],blocks,order:blocks.map(b=>b.id),importFidelityManifest:{sourceKind:'uploaded_docx',sourceHash:'synthetic',sourceBlockIds:blocks.map(b=>b.id),tableIds:['t1'],unsupportedFeatures:[]}}},{blobHash:'synthetic',generation:1}, {profile:'preserve'})));
}
describe('Workspace atomic state, IDs, partition and AI contracts',()=>{
 it('keeps immutable source and refuses pending/stale/partial writes',()=>{
  const s=fixture(),before=JSON.stringify(s);assert.equal(Object.isFrozen(s.workspace.source!.blocks[0]),true);
  assert.equal(transactWorkspace(s,1,{type:'editBody',html:'<p>Wrong</p>'}).ok,false);
  assert.equal(transactWorkspace(s,0,{type:'editField',field:'appendices',value:'wrong'}).ok,false);
  assert.equal(JSON.stringify(s),before);
  assert.equal(transactWorkspace(s,0,{type:'pasteNode',html:'<table><tr><td>Unregistered</td></tr></table>'}).ok,false);
  const next=good(transactWorkspace(s,0,{type:'editBody',html:'<p>USER TEXT</p>'}));
  assert.equal(s.doc.bodyHtml,'<p>Alpha Beta</p>');assert.equal(next.workspace.workingRevision,1);assert.equal(next.workspace.ledger.length,1);
  assert.deepEqual(next.workspace.source,s.workspace.source);assert.equal(hasWorkspaceApproval(next),true);assert.deepEqual(workspaceInvariantErrors(next),[]);
  const tampered=structuredClone(next);tampered.doc.bodyHtml='<p>Silent loss</p>';tampered.workspace.nodes.filter(n=>n.container==='body')[0].html=tampered.doc.bodyHtml;
  assert.ok(workspaceInvariantErrors(tampered).includes('working_state_modified_outside_transaction'));
 });
 it('edit → stage → cancel/reload restores exact edited draft; confirm rebases only unaffected source',()=>{
  const initial=fixture();let edited=good(transactWorkspace(initial,0,{type:'editBody',html:'<p>LOCAL BODY</p>'}));
  edited=good(transactWorkspace(edited,1,{type:'editAppendix',id:'app2',html:'<p>LOCAL APPENDIX</p>'}));
  const blocks=structuredClone(edited.reviewBlocks);blocks.find(b=>b.id==='u1')!.role='body';
  const staged=good(stageWorkspacePartition(edited,blocks));assert.equal(hasWorkspaceApproval(staged),false);
  const premature=approveWorkspacePartition(staged);assert.equal(premature.ok,false);if(!premature.ok)assert.equal(premature.error,'pending_partition');
  assert.equal(transactWorkspace(staged,2,{type:'editBody',html:'bad'}).ok,false);
  const reloaded=JSON.parse(JSON.stringify(staged));assert.deepEqual(good(cancelWorkspacePartition(reloaded)),edited);
  const confirmed=good(confirmWorkspacePartition(reloaded));assert.equal(confirmed.doc.bodyHtml,'<p>LOCAL BODY</p><p>Unclassified</p>');
  assert.equal(confirmed.doc.appendices![1].html,'<p>LOCAL APPENDIX</p>');assert.equal(confirmed.doc.headerProfile,edited.doc.headerProfile);
  assert.deepEqual(confirmed.workspace.overrides,edited.workspace.overrides);assert.notEqual(confirmed.workspace.partition.approval!.token,edited.workspace.partition.approval!.token);
  assert.equal(hasWorkspaceApproval(confirmed),true);assert.deepEqual(workspaceInvariantErrors(confirmed),[]);
  const corrupted=structuredClone(staged);corrupted.workspace.staged!.frozen.doc.bodyHtml='<p>Silent lost frozen content</p>';
  assert.equal(cancelWorkspacePartition(corrupted).ok,false);assert.equal(confirmWorkspacePartition(corrupted).ok,false);
 });
 it('repartition edited source reports conflict, never reconstructs whole body from source',()=>{
  const s=good(transactWorkspace(fixture(),0,{type:'editBody',html:'<p>LOCAL</p>'})),blocks=structuredClone(s.reviewBlocks);blocks[0].role='appendix';
  const stage=good(stageWorkspacePartition(s,blocks)),before=JSON.stringify(stage),result=confirmWorkspacePartition(stage);
  assert.equal(result.ok,false);if(!result.ok)assert.equal(result.error,'rebase_conflict');assert.equal(JSON.stringify(stage),before);
  assert.equal(good(cancelWorkspacePartition(stage)).doc.bodyHtml,'<p>LOCAL</p>');
 });
 it('split/merge/paste use fresh editable IDs with lineage without changing source validator IDs',()=>{
  let s=fixture(),id=s.workspace.nodes.find(n=>n.container==='body')!.editableNodeId;
  s=good(transactWorkspace(s,0,{type:'splitNode',id,parts:['<p>Alpha </p>','<p>Beta</p>']}));
  const split=s.workspace.nodes.filter(n=>n.container==='body');assert.equal(new Set(split.map(n=>n.editableNodeId)).size,2);assert.ok(split.every(n=>n.editableNodeId!==id));
  assert.deepEqual(split.map(n=>n.lineage),[['b1'],['b1']]);
  s=good(transactWorkspace(s,1,{type:'mergeNodes',ids:split.map(n=>n.editableNodeId),html:'<p>Alpha Beta</p>'}));
  const merged=s.workspace.nodes.find(n=>n.container==='body')!;
  s=good(transactWorkspace(s,2,{type:'pasteNode',afterId:merged.editableNodeId,html:'<p>Pasted</p>'}));
  assert.deepEqual(s.workspace.nodes.filter(n=>n.container==='body')[1].lineage,[]);
  assert.deepEqual(validateReviewedBlocks(s.reviewBlocks,s.workspace.source!.blocks),[]);assert.deepEqual(workspaceInvariantErrors(s),[]);
  assert.equal(transactWorkspace(s,3,{type:'splitNode',id:merged.editableNodeId,parts:['<p>Alpha </p>','<p>Beta<img src="x"></p>']}).ok,false);
 });
 it('confirmed appendix/table removals carry ledger and retain source inventory; silent table loss is blocked',()=>{
  const s=fixture();assert.equal(transactWorkspace(s,0,{type:'deleteAppendix',id:'app1',confirmed:false}).ok,false);
  assert.equal(transactWorkspace(s,0,{type:'editAppendix',id:'app1',html:'<p>SAME</p>'}).ok,false);
  const deleted=good(transactWorkspace(s,0,{type:'deleteAppendix',id:'app1',confirmed:true}));
  assert.deepEqual(confirmedRemovedTableIds(deleted),['t1']);assert.ok(deleted.workspace.source!.blocks.some(b=>b.id==='t1'));
  assert.deepEqual(deleted.workspace.source!.fidelityManifest!.tableIds,['t1']);assert.equal(deleted.doc.appendices?.length,1);
  const tableDeleted=good(transactWorkspace(s,0,{type:'removeTable',tableId:'t1',confirmed:true}));
  assert.deepEqual(confirmedRemovedTableIds(tableDeleted),['t1']);
 });
 it('table cell edits preserve formatting and explicit table moves describe order',()=>{
  let s=good(transactWorkspace(fixture(),0,{type:'editCell',tableId:'t1',cellId:'c1',text:'EDITED'}));
  const cell=s.reviewBlocks.find(b=>b.id==='t1')!.tableModel!.rows[0].cells[0];
  assert.equal(cell.text,'EDITED');assert.equal(cell.paragraphs[0].runs![0].font,'Times New Roman');assert.equal(cell.paragraphs[0].runs![0].sizeHalfPt,24);
  const after=s.workspace.nodes.find(n=>n.container==='body')!.editableNodeId;
  s=good(transactWorkspace(s,1,{type:'moveTable',tableId:'t1',afterId:after}));
  assert.ok(s.doc.bodyHtml.includes('data-source-table-id="t1"'));assert.equal(s.workspace.ledger[1].action,'move');assert.ok(s.workspace.ledger[1].beforeOrder);
  const model=structuredClone(s.reviewBlocks.find(b=>b.id==='t1')!.tableModel!);model.tableId='new-t';model.rows[0].cells[0].cellId='new-c';
  s=good(transactWorkspace(s,2,{type:'addTable',model,afterId:after}));assert.equal(s.workspace.ledger[2].action,'add');assert.equal(s.workspace.ledger[2].kind,'table');assert.ok(s.doc.importedTables?.['new-t']);
  s=good(transactWorkspace(s,3,{type:'editCell',tableId:'new-t',cellId:'new-c',text:'NEW EDIT'}));assert.equal(s.doc.importedTables!['new-t'].rows[0].cells[0].text,'NEW EDIT');
  const bodyTables=s.doc.bodyHtml.match(/<table\b[\s\S]*?<\/table>/g)!;assert.equal(bodyTables.length,2);
  const reordered=good(transactWorkspace(s,4,{type:'editBody',html:'<p>Alpha Beta</p>'+bodyTables.reverse().join('')}));
  assert.deepEqual(reordered.workspace.ledger[4].beforeOrder,['new-t','t1']);
  assert.deepEqual(reordered.workspace.ledger[4].afterOrder,['t1','new-t']);
 });
 it('AI rejects stale same-source Body at response and apply and keeps equal-text appendices distinct',()=>{
  const s=fixture(),target=createWorkspaceAiTarget(s,{kind:'body'})!;
  const received=receiveWorkspaceAiResult(s,target,'<p>AI</p>');assert.equal(received.check.status,'supported');
  const changed=good(transactWorkspace(s,0,{type:'editBody',html:'<p>USER</p>'}));
  assert.equal(validateWorkspaceAiTarget(changed,target).status,'stale');assert.equal(receiveWorkspaceAiResult(changed,target,'<p>AI</p>').proposal,undefined);
  assert.equal(applyWorkspaceAiResult(changed,received.proposal!).ok,false);
  const a=createWorkspaceAiTarget(s,{kind:'appendix',id:'app1'})!,b=createWorkspaceAiTarget(s,{kind:'appendix',id:'app2'})!;
  assert.notEqual(a.id,b.id);assert.equal(validateWorkspaceAiTarget(s,a).status,'unsupported');assert.equal(validateWorkspaceAiTarget(s,b).status,'unsupported');
  assert.equal(applyWorkspaceAiResult(s,{target:b,suggestedText:'BODY WRONG'}).ok,false);assert.equal(s.doc.bodyHtml,'<p>Alpha Beta</p>');
 });
 it('role changes cannot mutate source manifest to make fidelity green',()=>{
  const s=fixture(),changed=changeBlockRole(s.reviewBlocks,'t1','signature',s.structuredImport);
  assert.deepEqual(changed.nextImport!.importFidelityManifest,s.structuredImport!.importFidelityManifest);
  assert.ok(changed.nextImport!.importFidelityManifest!.tableIds.includes('t1'));
 });
 it('regime change retains working content, invalidates approval and old AI target',()=>{
  const initial=fixture(),target=createWorkspaceAiTarget(initial,{kind:'body'})!;
  const changed=good(changeWorkspaceRegime(initial,0,'party'));
  assert.equal(changed.doc.bodyHtml,initial.doc.bodyHtml);assert.deepEqual(changed.doc.appendices,initial.doc.appendices);
  assert.equal(hasWorkspaceApproval(changed),false);assert.equal(changed.workspace.partition.approval,undefined);
  assert.equal(validateWorkspaceAiTarget(changed,target).status,'approval_required');
  const approved=good(approveWorkspacePartition(changed));assert.equal(hasWorkspaceApproval(approved),true);assert.equal(validateWorkspaceAiTarget(approved,target).status,'stale');
 });
});
