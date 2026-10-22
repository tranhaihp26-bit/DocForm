import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceSnapshot,workspaceInvariantErrors,canEnterWorkspaceStep} from '../src/utils/workspaceState.ts';
import {transactWorkspace} from '../src/utils/workspaceTransactions.ts';
import type {DocumentState} from '../src/shared/schemas/document.schema.ts';

test('constructor preserves whitespace from real template HTML without an editor write',()=>{
 const html='\n  <p>First</p>\n   <p>Second</p>\n';
 const doc:DocumentState={headerProfile:'generic',orgHeader1:'',orgHeader2:'CQ',nationalHeader1:'',nationalHeader2:'',referenceNumber:'',locationAndDate:'',documentType:'KẾ HOẠCH',subject:'',bodyHtml:html,signTitle:'',signName:'',recipients:'',appendices:[{id:'a',title:'A',html:'\n<p>Appendix</p>\n',sourceBlockIds:[],blocks:[],extractionStatus:'confirmed'}]};
 const snapshot=createWorkspaceSnapshot({doc,standardType:'state',reviewBlocks:[],structuredImport:null});
 assert.deepEqual(workspaceInvariantErrors(snapshot),[]);assert.equal(canEnterWorkspaceStep(snapshot,2),true);
 assert.equal(snapshot.doc.bodyHtml,html);assert.equal(snapshot.workspace.nodes.filter(n=>n.container==='body').map(n=>n.html).join(''),html);
 const result=transactWorkspace(snapshot,0,{type:'editField',field:'documentType',value:'THÔNG BÁO'});
 assert.equal(result.ok,true);if(result.ok){assert.equal(result.snapshot.doc.bodyHtml,html);assert.equal(result.snapshot.doc.appendices?.[0].html,doc.appendices![0].html);}
});


test('legacy template version has template origin even with its display filename',async()=>{
 const {restoreWorkspaceVersion}=await import('../src/utils/workspacePersistence.ts');
 const doc={headerProfile:'generic',orgHeader1:'',orgHeader2:'CQ',nationalHeader1:'',nationalHeader2:'',referenceNumber:'',locationAndDate:'',documentType:'KẾ HOẠCH',subject:'',bodyHtml:'<p>Template</p>',signTitle:'',signName:'',recipients:''} as DocumentState;
 const snapshot=restoreWorkspaceVersion({id:'template-history',title:'Mẫu tổng hợp',timestamp:new Date().toISOString(),data:doc,standardType:'state',uploadedFileName:'Mẫu tổng hợp',originalSnapshot:{sourceType:'system_template',uploadedAt:new Date().toISOString(),bodyHtml:doc.bodyHtml}});
 assert.equal(snapshot.workspace.source,null);assert.equal(canEnterWorkspaceStep(snapshot,2),true);
});
