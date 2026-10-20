import type {DocumentState,TableModel,TableCellModel,TableRowModel} from '../shared/schemas/document.schema.ts';
import {decodeHtmlEntities,extractHtmlTextWithBreaks,parseRunsFromHtmlString} from './tableFormatUtils.ts';

export interface PreparedTemplateTables {doc:DocumentState;models:TableModel[]}

function styleMap(attrs:string):Map<string,string>{
 const raw=attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]??attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2]??'';
 return new Map(raw.split(';').map(part=>part.split(':').map(v=>v.trim())).filter(parts=>parts.length>=2).map(([k,...v])=>[k.toLowerCase(),v.join(':').toLowerCase()]));
}
function normalizeDocxColor(value:string|undefined):string{
 const color=(value??'000000').replace('#','').toUpperCase();
 if(/^[0-9A-F]{3}$/.test(color))return color.replace(/./g,'$&$&');
 return /^[0-9A-F]{6}$/.test(color)?color:'000000';
}
function attrNumber(attrs:string,name:string):number|undefined{
 const value=attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']?([\\d.]+)`,'i'))?.[1];return value===undefined?undefined:Number(value);
}
function widthTwipsFromCol(attrs:string,total:number):number|undefined{
 const width=styleMap(attrs).get('width');if(!width)return undefined;
 const value=Number(width.match(/[\d.]+/)?.[0]);if(!Number.isFinite(value))return undefined;
 if(width.includes('%'))return Math.round(total*value/100);
 if(width.endsWith('pt'))return Math.round(value*20);
 if(width.endsWith('px'))return Math.round(value*15);
 return undefined;
}
function escapeAttr(value:string):string{return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function patchTableIdentity(tableHtml:string,tableId:string,cells:TableCellModel[]):string{
 let cellIndex=0;
 let withCells=tableHtml.replace(/<(td|th)\b([^>]*)>/gi,(whole,tag:string,attrs:string)=>{
  const cell=cells[cellIndex++];if(!cell)return whole;
  return /\bdata-cell-id\s*=/.test(attrs)?whole:`<${tag}${attrs} data-cell-id="${escapeAttr(cell.cellId)}">`;
 });
 if(cellIndex!==cells.length)throw new Error('template_table_cell_identity_mismatch');
 withCells=withCells.replace(/<table\b([^>]*)>/i,(whole,attrs:string)=>/\bdata-source-table-id\s*=/.test(attrs)?whole:`<table${attrs} data-source-table-id="${escapeAttr(tableId)}">`);
 return withCells;
}

function parseTemplateTable(tableHtml:string,templateId:string,index:number):{model:TableModel;html:string}{
 if((tableHtml.match(/<table\b/gi)??[]).length!==1||/\b(?:colspan|rowspan)\s*=|<img\b|<a\b|<(?:iframe|object|svg)\b/i.test(tableHtml))throw new Error(`template_table_structure_not_supported:${templateId}:${index}`);
 const id=`${templateId}-${crypto.randomUUID()}`,tableAttrs=tableHtml.match(/<table\b([^>]*)>/i)?.[1]??'',tableStyle=styleMap(tableAttrs);
 const totalWidth=9360,widthValue=tableStyle.get('width')??'';
 const tableWidthTwips=widthValue.endsWith('%')?totalWidth:widthValue.endsWith('pt')?Math.round(Number(widthValue.match(/[\d.]+/)?.[0])*20):totalWidth;
 const rawCols=[...(tableHtml.match(/<col\b[^>]*>/gi)??[])];
 const rowHtml=[...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
 if(!rowHtml.length)throw new Error(`template_table_missing_rows:${templateId}:${index}`);
 const rows:TableRowModel[]=rowHtml.map((row,rowIndex)=>{
  const matches=[...row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
  if(!matches.length)throw new Error(`template_table_empty_row:${templateId}:${index}:${rowIndex}`);
  const cells:TableCellModel[]=matches.map((match,colIndex)=>{
   const tag=match[1].toLowerCase(),attrs=match[2],inner=match[3],styles=styleMap(attrs),paras=[...inner.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)];
   const fragments=paras.length?paras.map(p=>({html:`<p${p[1]}>${p[2]}</p>`,attrs:p[1],inner:p[2]})):[{html:`<p>${inner}</p>`,attrs:'',inner}];
   const paragraphs=fragments.map(fragment=>{
    const text=extractHtmlTextWithBreaks(fragment.html),runs=parseRunsFromHtmlString(fragment.html);
    const alignment=styleMap(fragment.attrs).get('text-align')??styles.get('text-align');
    const supportedAlignment=['left','center','right','justify'].includes(alignment??'')?alignment as TableCellModel['alignment']:undefined;
    const effectiveRuns=runs.length?runs:tag==='th'&&text?[{text,bold:true}]:[];
    return{text,alignment:supportedAlignment,runs:effectiveRuns};
   });
   const text=paragraphs.map(p=>p.text).join('\n');
   const border=styles.get('border');
   const borderColor=border?.match(/#[0-9a-f]{3,8}|\bblack\b/i)?.[0]??'000000';
   const cell:TableCellModel={cellId:`${id}:r${rowIndex}:c${colIndex}`,rowIndex,colIndex,gridColumn:colIndex,gridSpan:1,text,paragraphs};
   if(border&&border!=='none'){const color=normalizeDocxColor(borderColor);cell.borders={top:{style:'single',size:4,color},bottom:{style:'single',size:4,color},left:{style:'single',size:4,color},right:{style:'single',size:4,color}};}
   const shading=styles.get('background-color');if(shading)cell.shadingColor=normalizeDocxColor(shading);
   const align=styles.get('text-align');if(['left','center','right','justify'].includes(align??''))cell.alignment=align as TableCellModel['alignment'];
   return cell;
  });
  return{rowIndex,isHeader:matches.every(m=>m[1].toLowerCase()==='th'),cantSplit:true,cells};
 });
 const columnCount=Math.max(...rows.map(r=>r.cells.length));
 const parsedWidths=rawCols.map(col=>widthTwipsFromCol(col,totalWidth));
 const gridColumnsTwips=Array.from({length:columnCount},(_,i)=>parsedWidths[i]??Math.floor(totalWidth/columnCount));
 const remainder=totalWidth-gridColumnsTwips.reduce((a,b)=>a+b,0);if(remainder)gridColumnsTwips[gridColumnsTwips.length-1]+=remainder;
 const border=tableStyle.get('border')??[...tableHtml.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/gi)].map(m=>styleMap(m[0]).get('border')).find(Boolean);
 const model:TableModel={tableId:id,rowsCount:rows.length,columnsCount:columnCount,gridColumnsTwips,tableWidthTwips,widthType:'dxa',alignment:'center',hasBorders:Boolean(border&&border!=='none'),rows,sourcePath:`template:${templateId}:${index}`};
 const allCells=rows.flatMap(r=>r.cells);
 return{model,html:patchTableIdentity(tableHtml,id,allCells)};
}

/** Canonicalizes only curated, static template tables; it never infers a user upload model. */
export function prepareTemplateTables(templateId:string,doc:DocumentState):PreparedTemplateTables{
 const prepared=structuredClone(doc);delete prepared.importedTables;
 const models:TableModel[]=[];let cursor=0;
 prepared.bodyHtml=prepared.bodyHtml.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi,table=>{
  const result=parseTemplateTable(table,templateId,cursor++);models.push(result.model);return result.html;
 });
 return{doc:prepared,models};
}

/** Exported for fixtures to check that template text extraction stayed lossless. */
export function decodeTemplateCellText(value:string):string{return decodeHtmlEntities(value);}
