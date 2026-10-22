import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import type {DocumentState} from '../src/shared/schemas/document.schema.ts';
import {prepareExportCandidate,type ExportCandidateSnapshot} from '../src/utils/exportCandidate.ts';
import {prepareTemplateTables} from '../src/utils/templateWorkspace.ts';
import {createWorkspaceSnapshot} from '../src/utils/workspaceState.ts';
import {transactWorkspace} from '../src/utils/workspaceTransactions.ts';

function snapshot(overrides:Partial<DocumentState>={},regime:'state'|'party'='state'):ExportCandidateSnapshot{
 const doc:DocumentState={headerProfile:'generic',orgHeader1:'',orgHeader2:'',nationalHeader1:'',nationalHeader2:'',referenceNumber:'',locationAndDate:'',documentType:'',subject:'',bodyHtml:'<p>Nội dung thân bài.</p>',signTitle:'',signName:'',recipients:'',...overrides};
 return{doc,standardType:regime,reviewBlocks:[],structuredImport:null};
}
async function xmlOf(s:ExportCandidateSnapshot){const c=await prepareExportCandidate(s);const z=await JSZip.loadAsync(c.bytes);return{candidate:c,xml:await z.file('word/document.xml')!.async('string')};}

test('candidate preserves title and subject when the organization/reference header is empty',async()=>{
 const {candidate,xml}=await xmlOf(snapshot({documentType:'BÁO CÁO',subject:'Tổng hợp kết quả'}));
 assert.equal(candidate.safe,true,JSON.stringify(candidate.contentFidelity));
 assert.equal((xml.match(/BÁO CÁO/g)||[]).length,1);assert.equal((xml.match(/Tổng hợp kết quả/g)||[]).length,1);
});

test('party letter without organization header still keeps its subject and does not add a centered document type',async()=>{
 const {candidate,xml}=await xmlOf(snapshot({documentType:'CÔNG VĂN',subject:'V/v hướng dẫn tổng hợp',bodyHtml:'<p>Kính gửi: Đơn vị mẫu.</p>'},'party'));
 assert.equal(candidate.safe,true,JSON.stringify(candidate.contentFidelity));
 assert.equal((xml.match(/V\/v hướng dẫn tổng hợp/g)||[]).length,1);assert.doesNotMatch(xml,/<w:t[^>]*>CÔNG VĂN<\/w:t>/);
});

test('multi-signer recipient block follows all three signatures in candidate text order',async()=>{
 const {candidate,xml}=await xmlOf(snapshot({documentType:'BIÊN BẢN',subject:'Ghi nhận cuộc họp',signTitle:'CHỦ TRÌ | THƯ KÝ | ĐẠI DIỆN ĐƠN VỊ',signName:'Nguyễn An | Trần Bình | Lê Chi',recipients:'Như trên;\nLưu: VT.'}));
 assert.equal(candidate.safe,true,JSON.stringify(candidate.contentFidelity));
 const flat=xml.replace(/<[^>]+>/g,' ');const i1=flat.indexOf('Nguyễn An'),i2=flat.indexOf('Trần Bình'),i3=flat.indexOf('Lê Chi'),ir=flat.indexOf('Nơi nhận:'),ir1=flat.indexOf('- Như trên;'),ir2=flat.indexOf('- Lưu: VT.');
 assert.ok(i1<i2&&i2<i3&&i3<ir&&ir<ir1&&ir1<ir2,JSON.stringify({i1,i2,i3,ir,ir1,ir2}));
});

test('curated template tables require explicit canonical bootstrap and then pass the normal inventory gate',async()=>{
 const initial=snapshot({bodyHtml:'<table style="border:1px solid #000"><tbody><tr><td><p>PHẦN A</p></td><td><p>PHẦN B</p></td></tr></tbody></table>'});
 const prepared=prepareTemplateTables('kh',initial.doc),base=createWorkspaceSnapshot({doc:prepared.doc,standardType:'state',reviewBlocks:[],structuredImport:null});
 const unregistered=await prepareExportCandidate(base);assert.equal(unregistered.safe,false);assert.equal(unregistered.tableFidelity.safe,false);
 const registered=transactWorkspace(base,0,{type:'registerTemplateTables',templateId:'kh',models:prepared.models});assert.equal(registered.ok,true);
 if(!registered.ok)return;
 assert.equal(registered.snapshot.workspace.source,null);assert.equal(registered.snapshot.workspace.ledger.at(-1)?.action,'add');
 assert.deepEqual(registered.snapshot.workspace.ledger.at(-1)?.addedTableIds,prepared.models.map(m=>m.tableId));
 const candidate=await prepareExportCandidate(registered.snapshot);assert.equal(candidate.safe,true,JSON.stringify({blockers:candidate.blockers,table:candidate.tableFidelity.diffs,content:candidate.contentFidelity}));
});

test('synthetic unsupported media returns a real unsafe candidate rather than a pre-gate simulation',async()=>{
 const {candidate}=await xmlOf(snapshot({bodyHtml:'<p>Nội dung.</p><p><img src="data:image/png;base64,AA==" alt="ảnh thử"></p>'}));
 assert.equal(candidate.safe,false);assert.equal(candidate.contentFidelity.safe,true);assert.equal(candidate.tableFidelity.safe,true);
 assert.ok(candidate.blockers.includes('unsupported_working_media'));assert.ok(candidate.instanceId);assert.equal(candidate.sha256.length,64);
});
