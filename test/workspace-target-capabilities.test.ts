import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedMixedWorkspace,simpleTable,baseDoc} from './support/workspaceFixtures.ts';
import {tableModelToHtmlView} from '../src/shared/tableModel.ts';
import {createWorkspaceSnapshot,workingDocumentFingerprint,sourceManifestFingerprint} from '../src/utils/workspaceState.ts';
import {assessWorkspaceNodeCapability,assessTableCellCapabilities} from '../src/utils/workspaceCapabilities.ts';

test('node capability is scoped: plain paragraphs and template alignment are editable, style/media stay read-only',()=>{
 const s=approvedMixedWorkspace(true);
 const before=s.workspace.nodes.find(n=>n.html.includes('Đoạn đầu'))!;
 const image=s.workspace.nodes.find(n=>n.html.includes('<img'))!;
 assert.equal(assessWorkspaceNodeCapability(s,before).editable,true);
 assert.equal(assessWorkspaceNodeCapability(s,{...before,html:'<p style="text-align: center;">Giữa</p>'}).editable,true);
 assert.equal(assessWorkspaceNodeCapability(s,{...before,html:'<p style="color:red">Có kiểu chưa hỗ trợ</p>'}).editable,false);
 assert.equal(assessWorkspaceNodeCapability(s,image).editable,false);
});

test('cell capability fails closed for missing raw evidence, merged geometry, rich runs, and fields',()=>{
 const plain=approvedMixedWorkspace();
 const model=plain.workspace.source!.blocks.find(b=>b.kind==='table')!.tableModel!;
 const supported=assessTableCellCapabilities(plain,model.tableId);
 assert.equal(supported[0].editable,true);
 const missingEvidence=structuredClone(plain);missingEvidence.workspace.source!.blocks[1].rawXml='';missingEvidence.workspace.source!.fingerprint=sourceManifestFingerprint(missingEvidence.workspace.source!);missingEvidence.workspace.workingFingerprint=workingDocumentFingerprint(missingEvidence);
 assert.equal(assessTableCellCapabilities(missingEvidence,model.tableId)[0].editable,false);
 const rich=structuredClone(plain);rich.doc.importedTables={[model.tableId]:{...model,rows:[{...model.rows[0],cells:[{...model.rows[0].cells[0],paragraphs:[{text:'R',runs:[{text:'R',bold:true},{text:'ich'}]}]}]}]}};
 const richHtml=tableModelToHtmlView(rich.doc.importedTables[model.tableId]);rich.doc.bodyHtml=rich.doc.bodyHtml.replace(/<table\b[\s\S]*?<\/table>/,richHtml);rich.workspace.nodes=rich.workspace.nodes.map(n=>n.html.includes('data-source-table-id')?{...n,html:richHtml}:n);rich.workspace.workingFingerprint=workingDocumentFingerprint(rich);
 assert.equal(assessTableCellCapabilities(rich,model.tableId)[0].editable,false);
 const mergedModel={...model,rows:[{...model.rows[0],cells:[{...model.rows[0].cells[0],gridSpan:2}]}]};
 const merged=structuredClone(approvedMixedWorkspace());merged.doc.importedTables={[model.tableId]:mergedModel};
 const tableHtml=tableModelToHtmlView(mergedModel);merged.doc.bodyHtml=merged.doc.bodyHtml.replace(/<table\b[\s\S]*?<\/table>/,tableHtml);merged.workspace.nodes=merged.workspace.nodes.map(n=>n.html.includes('data-source-table-id')?{...n,html:tableHtml}:n);merged.workspace.workingFingerprint=workingDocumentFingerprint(merged);
 assert.equal(assessTableCellCapabilities(merged,model.tableId)[0].editable,false);
 const noRaw=structuredClone(approvedMixedWorkspace());noRaw.workspace.source!.blocks[1].rawXml='<w:tbl><w:tr><w:tc><w:p><w:fldSimple instr="PAGE"/></w:p></w:tc></w:tr></w:tbl>';
 noRaw.workspace.source!.fingerprint=sourceManifestFingerprint(noRaw.workspace.source!);
 noRaw.workspace.workingFingerprint=workingDocumentFingerprint(noRaw);
 assert.equal(assessTableCellCapabilities(noRaw,model.tableId)[0].editable,false);
});

test('unregistered template table content is not silently eligible as an uploaded-source cell',()=>{
 const model=simpleTable('unregistered'),s=createWorkspaceSnapshot({doc:baseDoc(tableModelToHtmlView(model)),standardType:'state',reviewBlocks:[],structuredImport:null});
 assert.equal(assessTableCellCapabilities(s,model.tableId).some(cell=>cell.editable),false);
});
