import test from 'node:test';
import assert from 'node:assert/strict';
import {baseDoc} from './support/workspaceFixtures.ts';
import {createWorkspaceSnapshot,workspaceInvariantErrors} from '../src/utils/workspaceState.ts';
import {transactWorkspace} from '../src/utils/workspaceTransactions.ts';
import {prepareTemplateTables} from '../src/utils/templateWorkspace.ts';
import {assessTableCellCapabilities} from '../src/utils/workspaceCapabilities.ts';

const templateHtml='<p>Trước bảng</p><table style="width:100%;border-collapse:collapse"><colgroup><col style="width:40%"><col style="width:60%"></colgroup><thead><tr><th style="text-align:center">Mã</th><th style="text-align:center">Nội dung</th></tr></thead><tbody><tr><td style="text-align:center">01</td><td>Giữ đúng dữ liệu</td></tr></tbody></table><p>Sau bảng</p>';

test('curated template bootstrap creates one typed table model with unique physical IDs and a ledger add event',()=>{
 const prepared=prepareTemplateTables('kh',baseDoc(templateHtml));
 assert.equal(prepared.models.length,1);
 const [model]=prepared.models;
 assert.equal(model.rows.length,2);assert.equal(model.rows[0].cells[0].text,'Mã');assert.equal(model.rows[1].cells[1].text,'Giữ đúng dữ liệu');
 assert.equal(prepared.doc.importedTables,undefined);
 assert.ok(prepared.doc.bodyHtml.indexOf('<p>Trước bảng</p>')<prepared.doc.bodyHtml.indexOf(`data-source-table-id="${model.tableId}"`));
 assert.ok(prepared.doc.bodyHtml.indexOf(`data-source-table-id="${model.tableId}"`)<prepared.doc.bodyHtml.indexOf('<p>Sau bảng</p>'));
 const second=prepareTemplateTables('kh',baseDoc(templateHtml));assert.notEqual(second.models[0].tableId,model.tableId);assert.notEqual(second.models[0].rows[0].cells[0].cellId,model.rows[0].cells[0].cellId);
 const s=createWorkspaceSnapshot({doc:prepared.doc,standardType:'state',reviewBlocks:[],structuredImport:null});
 const result=transactWorkspace(s,0,{type:'registerTemplateTables',templateId:'kh',models:prepared.models});
 assert.equal(result.ok,true);if(!result.ok)return;
 assert.equal(result.snapshot.workspace.source,null);assert.equal(Object.keys(result.snapshot.doc.importedTables??{}).length,1);
 assert.deepEqual(result.snapshot.workspace.ledger.map(e=>({action:e.action,kind:e.kind,addedTableIds:e.addedTableIds})),[{action:'add',kind:'table',addedTableIds:[model.tableId]}]);
 assert.equal(assessTableCellCapabilities(result.snapshot,model.tableId).find(c=>c.cellId===model.rows[1].cells[1].cellId)?.editable,true);
 assert.deepEqual(workspaceInvariantErrors(result.snapshot),[]);
});

test('template cell edits update working model and HTML exactly once; rehydration does not bootstrap a duplicate table',()=>{
 const prepared=prepareTemplateTables('kh',baseDoc(templateHtml)),s=createWorkspaceSnapshot({doc:prepared.doc,standardType:'state',reviewBlocks:[],structuredImport:null});
 const bootstrapped=transactWorkspace(s,0,{type:'registerTemplateTables',templateId:'kh',models:prepared.models});assert.equal(bootstrapped.ok,true);if(!bootstrapped.ok)return;
 const model=prepared.models[0],cell=model.rows[1].cells[1];
 const edit=transactWorkspace(bootstrapped.snapshot,1,{type:'editCell',tableId:model.tableId,cellId:cell.cellId,text:'Đã cập nhật'});
 assert.equal(edit.ok,true);if(!edit.ok)return;
 assert.equal(edit.snapshot.doc.bodyHtml.match(new RegExp(`data-source-table-id="${model.tableId}"`,'g'))?.length,1);
 assert.match(edit.snapshot.doc.bodyHtml,/Đã cập nhật/);assert.equal(edit.snapshot.doc.importedTables?.[model.tableId].rows[1].cells[1].text,'Đã cập nhật');
 const restored=createWorkspaceSnapshot({doc:structuredClone(edit.snapshot.doc),standardType:'state',reviewBlocks:[],structuredImport:null});
 assert.equal(restored.doc.bodyHtml.match(/data-source-table-id=/g)?.length,1);
 assert.equal(Object.keys(restored.doc.importedTables??{}).length,1);
 const duplicate=transactWorkspace(restored,0,{type:'registerTemplateTables',templateId:'kh',models:prepared.models});assert.equal(duplicate.ok,false);
});
