/**
 * S05 evidence probe: compare the HD05 company-profile header table produced by
 * the exporter against the approved sample `header-reference.docx`.
 */
import JSZip from "jszip";
import fs from "node:fs";
import { generateND30DocxUint8Array, estimateTimesNewRomanWidthTwips } from "../src/utils/docxExport.ts";
import { applyCompanyHD05Profile, COMPANY_HEADER_HD05_TABLE_TWIPS } from "../src/canonical/hd05/companyHeaderHD05.ts";

const REF = "src/canonical/hd05/profiles/hoa-tieu-hang-hai-mien-bac/header-reference.docx";

const zipRef = await JSZip.loadAsync(fs.readFileSync(REF));
const refXml = await zipRef.file("word/document.xml")!.async("string");
const refTbl = refXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)![0];
const refSect = refXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";

const docData = applyCompanyHD05Profile({
  regime: "party" as const,
  documentType: "BIÊN BẢN HỌP",
  orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
  orgHeader2: "ĐẢNG ỦY CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nĐOÀN GIÁM SÁT SỐ 05-QĐ/ĐU",
  referenceNumber: "Số 05-QĐ/ĐU",
  locationAndDate: "Hải Phòng, ngày 19 tháng 10 năm 2026",
  subject: "Biên bản họp đoàn giám sát",
  bodyHtml: "<p>Nội dung cuộc họp đoàn giám sát ngày 19/10/2026.</p>",
  signTitle: "TRƯỞNG ĐOÀN GIÁM SÁT",
  signName: "Nguyễn Văn C",
  recipients: "",
  fontFamily: "Times New Roman",
  fontSize: 14,
});
const buf = await generateND30DocxUint8Array(docData as any);
const zipCand = await JSZip.loadAsync(buf);
const candXml = await zipCand.file("word/document.xml")!.async("string");
const candTbl = candXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)![0];

function summarize(label: string, tbl: string) {
  const w = tbl.match(/<w:tblW[^>]*\/>/)?.[0];
  const ind = tbl.match(/<w:tblInd[^>]*\/>/)?.[0];
  const grid = Array.from(tbl.matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)).map((m) => Number(m[1]));
  const tcw = Array.from(tbl.matchAll(/<w:tcW[^>]*w:w="(\d+)"/g)).map((m) => Number(m[1]));
  console.log(`--- ${label}`);
  console.log(`    tblW     : ${w}`);
  console.log(`    tblInd   : ${ind}`);
  console.log(`    gridCols : ${JSON.stringify(grid)} (sum=${grid.reduce((a, b) => a + b, 0)})`);
  console.log(`    tcW      : ${JSON.stringify(tcw)}`);
  return { grid, tcw, ind: ind ?? "", w: w ?? "" };
}

console.log("=== S05: HD05 company header table — sample vs candidate ===");
const ref = summarize("REFERENCE header-reference.docx", refTbl);
const cand = summarize("CANDIDATE (exporter)", candTbl);

console.log("\nprofile constant:", JSON.stringify(COMPANY_HEADER_HD05_TABLE_TWIPS));
console.log("reference sectPr:", refSect.replace(/></g, ">\n  <"));

const dateText = "Hải Phòng, ngày 19 tháng 10 năm 2026";
const textWidth = estimateTimesNewRomanWidthTwips(dateText, 14, false);
console.log(`\ndate text width @14pt = ${textWidth} twips`);
console.log(`reference right column = ${ref.grid[1]} twips -> slack = ${ref.grid[1] - textWidth} twips`);
console.log(`candidate right column = ${cand.grid[1]} twips -> slack = ${cand.grid[1] - textWidth} twips`);

function geometryKey(s: { grid: number[]; tcw: number[]; ind: string; w: string }): string {
  const ind = s.ind.match(/w:w="(-?\d+)"/)?.[1] ?? "";
  const w = s.w.match(/w:w="(-?\d+)"/)?.[1] ?? "";
  return JSON.stringify({ w, ind, grid: s.grid, tcw: s.tcw });
}

const match = geometryKey(ref) === geometryKey(cand);
console.log(`\nGEOMETRY MATCHES SAMPLE: ${match}`);
console.log(`  sample   : ${geometryKey(ref)}`);
console.log(`  candidate: ${geometryKey(cand)}`);
