import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Document,Packer,Paragraph,PageBreak,PageOrientation} from 'docx';
import {CdpClient,startTestServer} from './support/browserHarness.ts';

test('Candidate preview measures landscape pages and fits their full width',async()=>{
 const page=new Document({sections:[{properties:{page:{size:{width:11906,height:16838,orientation:PageOrientation.LANDSCAPE},margin:{top:1134,bottom:1134,left:1701,right:850}}},children:[new Paragraph('Landscape synthetic page one'),new Paragraph({children:[new PageBreak()]}),new Paragraph('Landscape synthetic page two')]}]});
 const bytes=new Uint8Array(await Packer.toBuffer(page));
 const sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const server=await startTestServer(5119),c=new CdpClient('docform-g4-landscape');
 try{
  await c.launch(9619);await c.navigate('http://127.0.0.1:5119/');
  const base64=Buffer.from(bytes).toString('base64');
  assert.equal(await c.evaluate(`(async()=>{const {mountLandscapePreview}=await import('/test/support/landscapePreviewMount.tsx');mountLandscapePreview(${JSON.stringify(base64)},${JSON.stringify(sha)});return true})()`),true);
  assert.equal(await c.waitForFunction(`Boolean(document.querySelector('[data-landscape-preview-probe] [data-preview-bytes-sha]'))`,15000),true);
  const dimensions=await c.evaluate<any>(`(()=>{const host=document.querySelector('[data-landscape-preview-probe]'),pages=[...host.querySelectorAll('[data-preview-page]')];return{sha:host.querySelector('[data-candidate-preview]')?.dataset.previewBytesSha,pages:pages.map(page=>({width:page.getBoundingClientRect().width,height:page.getBoundingClientRect().height})),mode:host.querySelector('[data-preview-fit]')?.getAttribute('aria-pressed')}})()`);
  assert.equal(dimensions.sha,sha);assert.ok(dimensions.pages.length>=2,JSON.stringify(dimensions));assert.ok(dimensions.pages.every((page:any)=>page.width>page.height),JSON.stringify(dimensions));assert.equal(dimensions.mode,'true');
  await c.setViewport(390,844);
  const fit=await c.evaluate<any>(`(()=>{const host=document.querySelector('[data-landscape-preview-probe]'),scroll=host.querySelector('.df-candidate-preview-scroll'),paper=host.querySelector('[data-preview-page]');return{paperWidth:paper.getBoundingClientRect().width,scrollWidth:scroll.clientWidth,outerWidth:document.documentElement.scrollWidth}})()`);
  assert.ok(fit.paperWidth<=fit.scrollWidth-16,JSON.stringify(fit));assert.ok(fit.outerWidth<=392,JSON.stringify(fit));
  const shot=await c.send('Page.captureScreenshot',{format:'png'});
  const evidenceDir='docs/superpowers/audits/2026-10-20-uiux-m1-evidence';fs.mkdirSync(evidenceDir,{recursive:true});fs.writeFileSync(path.join(evidenceDir,'g4-landscape-fit.png'),Buffer.from(shot.result?.data??shot.data,'base64'));
  fs.writeFileSync(path.join(evidenceDir,'g4-landscape-metrics.json'),JSON.stringify({sha256:sha,dimensions,fit},null,2));
  await c.evaluate(`document.querySelector('[data-landscape-preview-probe] [data-preview-actual]').click()`);
  assert.equal(await c.waitForFunction(`document.querySelector('[data-landscape-preview-probe] [data-preview-actual]')?.getAttribute('aria-pressed')==='true'`),true);
  const actual=await c.evaluate<any>(`(()=>{const scroll=document.querySelector('[data-landscape-preview-probe] .df-candidate-preview-scroll');return{scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth,outerWidth:document.documentElement.scrollWidth}})()`);
  assert.ok(actual.scrollWidth>actual.clientWidth);assert.ok(actual.outerWidth<=392);
 }finally{c.close();server.kill();}
});
