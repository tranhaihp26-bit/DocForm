import type {DocumentState, SourceBlock, TableModel} from '../../src/shared/schemas/document.schema.ts';
import {tableModelToHtmlView} from '../../src/shared/tableModel.ts';
import {createWorkspaceSnapshot,type WorkspaceSnapshot} from '../../src/utils/workspaceState.ts';
import {approveWorkspacePartition} from '../../src/utils/workspaceTransactions.ts';

export function simpleTable(tableId='synthetic-grid'):TableModel{
 return {tableId,rowsCount:1,columnsCount:1,gridColumnsTwips:[9360],tableWidthTwips:9360,widthType:'dxa',alignment:'center',hasBorders:true,rows:[{rowIndex:0,isHeader:false,cantSplit:true,cells:[{cellId:`${tableId}-cell`,rowIndex:0,colIndex:0,gridColumn:0,gridSpan:1,text:'TABLE ORIGINAL',paragraphs:[{text:'TABLE ORIGINAL',runs:[{text:'TABLE ORIGINAL'}]}],borders:{top:{style:'single',size:4,color:'000000'}}}]}]};
}

export function baseDoc(bodyHtml:string):DocumentState{
 return {headerProfile:'generic',orgHeader1:'CƠ QUAN MẪU',orgHeader2:'ĐƠN VỊ MẪU',nationalHeader1:'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',nationalHeader2:'Độc lập - Tự do - Hạnh phúc',referenceNumber:'Số: 01/KH',locationAndDate:'Hà Nội, ngày 20 tháng 10 năm 2026',documentType:'KẾ HOẠCH',subject:'Tài liệu thử nghiệm',bodyHtml,signTitle:'',signName:'',recipients:''};
}

export function mixedBlocks(withImage=false):{blocks:SourceBlock[];bodyHtml:string;table:TableModel}{
 const table=simpleTable(),tableHtml=tableModelToHtmlView(table);
 const blocks:SourceBlock[]=[
  {id:'paragraph-before',index:0,kind:'paragraph',role:'body',text:'Đoạn đầu',html:'<p>Đoạn đầu</p>'},
  {id:table.tableId,index:1,kind:'table',role:'body',text:'TABLE ORIGINAL',html:tableHtml,rawXml:'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>TABLE ORIGINAL</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',unsupportedFeatures:[],tableModel:table,tableData:[['TABLE ORIGINAL']]},
  {id:'paragraph-after',index:2,kind:'paragraph',role:'body',text:'Đoạn cuối',html:'<p>Đoạn cuối</p>'},
 ];
 if(withImage)blocks.splice(2,0,{id:'image-atom',index:2,kind:'paragraph',role:'body',text:'Ảnh nguồn',html:'<p><img src="data:image/png;base64,AA==" alt="Ảnh nguồn"></p>'});
 return {blocks,bodyHtml:blocks.map(b=>b.html).join(''),table};
}

export function approvedMixedWorkspace(withImage=false):WorkspaceSnapshot{
 const fixture=mixedBlocks(withImage),snapshot=createWorkspaceSnapshot({doc:baseDoc(fixture.bodyHtml),standardType:'state',reviewBlocks:fixture.blocks,structuredImport:null},{blobHash:'synthetic-docx-sha',generation:1,blocks:fixture.blocks});
 const approved=approveWorkspacePartition(snapshot);if(!approved.ok)throw new Error(`fixture approval failed: ${approved.details.join(',')}`);return approved.snapshot;
}
