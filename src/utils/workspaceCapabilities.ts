import type {SourceBlock,TableModel} from '../shared/schemas/document.schema.ts';
import type {EditableNode,WorkspaceSnapshot} from './workspaceState.ts';
import {isSemanticFirstLineIndent,isSemanticLineSpacing} from './semanticRuleFormatting.ts';

export interface EditorSafety {editable:boolean;reasons:string[]}
export interface TableCellCapability {tableId:string;cellId:string;text:string;editable:boolean;reason:string}

const ALLOWED_TAGS=new Set(['p','br','strong','b','em','i','u','s','strike','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr']);
const ALIGNABLE_TAGS=new Set(['p','h1','h2','h3','h4','h5','h6']);

/** Conservative HTML eligibility; text-align is the only source style serialized by the workspace editor. */
export function workspaceEditorSafety(html:string):EditorSafety{
 const reasons=new Set<string>();
 for(const match of html.matchAll(/<\s*([a-z][\w:-]*)\b([^>]*)>/gi)){
  const tag=match[1].toLowerCase();let attrs=match[2];
  if(!ALLOWED_TAGS.has(tag))reasons.add(['table','td','th','tr','tbody','thead','colgroup','col'].includes(tag)?'table_editor_roundtrip_not_verified':`unsupported_editor_element:${tag}`);
  const styleMatch=attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if(styleMatch){
   const style=(styleMatch[1]??styleMatch[2]??styleMatch[3]??'').trim().toLowerCase();
   if(!ALIGNABLE_TAGS.has(tag)||!/^text-align\s*:\s*(left|center|right|justify)\s*;?$/.test(style))reasons.add('inline_style_roundtrip_not_verified');
   attrs=attrs.replace(styleMatch[0],'');
  }
  const lineMatch=attrs.match(/\bdata-df-line-spacing\s*=\s*(["'])(.*?)\1/i);
  if(lineMatch){if(tag!=='p'||!isSemanticLineSpacing(lineMatch[2]))reasons.add('semantic_rule_attribute_invalid');attrs=attrs.replace(lineMatch[0],'');}
  const indentMatch=attrs.match(/\bdata-df-first-line-indent\s*=\s*(["'])(.*?)\1/i);
  if(indentMatch){if(tag!=='p'||!isSemanticFirstLineIndent(indentMatch[2]))reasons.add('semantic_rule_attribute_invalid');attrs=attrs.replace(indentMatch[0],'');}
  attrs=attrs.replace(/\bdata-block-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/\bstart\s*=\s*(?:"\d+"|'\d+'|\d+)/gi,'').trim().replace(/\/$/,'').trim();
  if(attrs)reasons.add('editor_attributes_roundtrip_not_verified');
 }
 return{editable:reasons.size===0,reasons:[...reasons]};
}

const sourceBlocks=(snapshot:WorkspaceSnapshot):SourceBlock[]=>[
 ...(snapshot.workspace.source?.blocks??[]),...snapshot.reviewBlocks,
];
const tableIdFromHtml=(html:string)=>html.match(/<table\b[^>]*\bdata-source-table-id\s*=\s*["']([^"']+)["']/i)?.[1];

/** A node is independently editable only when its own HTML and linked source evidence are supported. */
export function assessWorkspaceNodeCapability(snapshot:WorkspaceSnapshot,node:EditableNode):EditorSafety{
 const safety=workspaceEditorSafety(node.html),reasons=new Set(safety.reasons);
 if(tableIdFromHtml(node.html)||/<table\b/i.test(node.html))reasons.add('table_atom_structure_locked');
 if(/<(?:img|svg|iframe|object|canvas)\b/i.test(node.html))reasons.add('media_atom_readonly');
 const linked=sourceBlocks(snapshot).filter(b=>node.lineage.includes(b.id));
 for(const block of linked){
  if(block.unsupportedFeatures?.length)reasons.add('source_block_has_unsupported_features');
  if(block.rawXml&&/<w:(?:fldChar|instrText|fldSimple|hyperlink|drawing|pict|object|sdt|altChunk|ins|del|moveFrom|moveTo)\b/i.test(block.rawXml))reasons.add('source_paragraph_has_complex_ooxml');
 }
 return{editable:reasons.size===0,reasons:[...reasons]};
}

function tableEvidence(snapshot:WorkspaceSnapshot,tableId:string):{model?:TableModel;block?:SourceBlock;template:boolean}{
 const block=sourceBlocks(snapshot).find(b=>(b.tableModel?.tableId??b.id)===tableId);
 const model=snapshot.doc.importedTables?.[tableId]??block?.tableModel;
 return{model,block,template:Boolean(model?.sourcePath?.startsWith('template:'))};
}

function unsupportedTableEvidence(rawXml:string):boolean{
 const nestedTables=(rawXml.match(/<w:tbl\b/gi)??[]).length>1;
 return nestedTables||/<w:(?:fldChar|instrText|fldSimple|hyperlink|drawing|pict|object|sdt|altChunk|ins|del|moveFrom|moveTo)\b/i.test(rawXml);
}

function simpleCell(cell:TableModel['rows'][number]['cells'][number]):boolean{
 if(cell.gridSpan>1||Boolean(cell.vMerge)||(cell.rowSpan??1)>1||cell.paragraphs.length!==1)return false;
 const paragraph=cell.paragraphs[0];
 if(/\n|\r/.test(paragraph.text))return false;
 const runs=paragraph.runs??[];
 if(runs.length===0)return true;
 if(runs.length!==1)return false;
 const [run]=runs;
 return run.text===paragraph.text&&(run.font===undefined||run.font==='Times New Roman')&&(run.sizeHalfPt===undefined||run.sizeHalfPt===24)
  &&run.bold!==true&&run.italic!==true&&run.underline!==true&&!run.color;
}

/** Cell text edits require an editable working model and enough source evidence to rule out fields/rich content. */
export function assessTableCellCapabilities(snapshot:WorkspaceSnapshot,tableId:string):TableCellCapability[]{
 const {model,block,template}=tableEvidence(snapshot,tableId);if(!model)return[];
 const addedWorkingTable=snapshot.workspace.ledger.some(e=>e.action==='add'&&e.kind==='table'&&(e.targetId===tableId||e.addedTableIds?.includes(tableId)===true));
 const sourceSupported=template||addedWorkingTable||Boolean(block?.rawXml)&&!(block?.unsupportedFeatures?.length)&&!unsupportedTableEvidence(block?.rawXml??'');
 const unregisteredTemplate=!snapshot.workspace.source&&!template&&!snapshot.doc.importedTables?.[tableId];
 return model.rows.flatMap(row=>row.cells.map(cell=>{
  const reasons:string[]=[];
  if(!sourceSupported)reasons.push('table_source_evidence_unavailable');
  if(unregisteredTemplate)reasons.push('template_table_not_registered');
  if(cell.gridSpan>1||Boolean(cell.vMerge)||(cell.rowSpan??1)>1)reasons.push('merged_cell_readonly');
  else if(cell.paragraphs.length!==1)reasons.push('multi_paragraph_cell_readonly');
  else if(!simpleCell(cell))reasons.push('rich_cell_runs_readonly');
  if(!snapshot.workspace.source&&!template&&!snapshot.doc.importedTables?.[tableId])reasons.push('template_table_not_registered');
  return{tableId,cellId:cell.cellId,text:cell.text,editable:reasons.length===0,reason:reasons[0]??''};
 }));
}

export function workspaceNodeTableId(html:string):string|undefined{return tableIdFromHtml(html);}
