import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { auditCanonicalND30, auditGeneratedDocx } from '../src/canonical/nd30/canonicalAudit.ts';
import {
  COMPANY_HEADER_GEOMETRY_MM, COMPANY_HEADER_PARENT, COMPANY_HEADER_ISSUER,
  COMPANY_HEADER_PROFILE_ID, applyCompanyProfile,
} from '../src/canonical/nd30/companyHeader.ts';
import { generateND30DocxDocument } from '../src/utils/docxExport.ts';
import { getRulesForRegime } from '../src/canonical/ruleEngine.ts';

const audit = auditCanonicalND30();
assert.equal(audit.total,435,'Canonical release catalogue must include exactly 435 verified rule IDs');
assert.notEqual(audit.commit,'NOT_SYNCED','Rule sync must run before tests');
assert.equal(audit.findings.length,435);
assert.equal(new Set(audit.findings.map(x=>x.ruleId)).size,435);
assert.equal(audit.counts.PASS,0,'No OOXML evidence -> no PASS');

const annexComponentRules = getRulesForRegime('administrative').filter(rule =>
  /\.PL1\.I\.II\.([1-9])(?:[A-Z]|\.)/.test(rule.id)
);
const annexComponentGroups = new Set<number>();
for (const rule of annexComponentRules) {
  const section = rule.id.match(/\.PL1\.I\.II\.([1-9])(?:[A-Z]|\.)/);
  assert.ok(section, `Expected Appendix I Part I component section in ${rule.id}`);
  const expectedGroup = Number(section[1]);
  annexComponentGroups.add(expectedGroup);
  assert.equal(rule.componentGroup, expectedGroup, `${rule.id} should be routed to component group ${expectedGroup}`);
}
assert.deepEqual([...annexComponentGroups].sort(), [1,2,3,4,5,6,7,9], 'All source-present Appendix I components must be routed to their corresponding groups');
const attachmentSealRule = getRulesForRegime('administrative').find(rule =>
  rule.id === 'ND30.ART33.P1C.ATTACHMENT_SEAL_OVERLAPS_ISSUER_OR_APPENDIX_TITLE'
);
assert.equal(attachmentSealRule?.componentGroup, 8, 'A seal_application rule must remain in group 8 even when its ID mentions issuer/appendix');

const doc = applyCompanyProfile({
  regime: 'administrative' as const, fontFamily: 'Times New Roman' as const,
  fontSize: 13 as const,
  nationalHeader1: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' as const,
  nationalHeader2: 'Độc lập - Tự do - Hạnh phúc' as const,
  orgHeader1:'[UNVERIFIED]',orgHeader2:'[UNVERIFIED]',
  referenceNumber:'Số: …/BB-HTMB', locationAndDate:'Hải Phòng, ngày … tháng … năm …',
  documentType:'BIÊN BẢN',subject:'Làm việc về công tác tổ chức',
  bodyHtml:'<p>Nội dung tổng hợp phục vụ phép thử.</p>',
  signTitle:'GIÁM ĐỐC',signName:'[Họ tên]',recipients:'Lưu: VT.',
});
const buffer=await Packer.toBuffer(generateND30DocxDocument(doc));
const zip=await JSZip.loadAsync(buffer);
const xml=await zip.file('word/document.xml')?.async('string');
assert.ok(xml,'Word document.xml must exist');
const sx = xml!;
assert.ok(sx.includes(COMPANY_HEADER_PARENT.split(' ')[0]));
assert.ok(sx.includes('TỔNG CÔNG TY BẢO ĐẢM'));
assert.ok(sx.includes('AN TOÀN HÀNG HẢI VIỆT NAM'));
assert.ok(sx.includes('CÔNG TY HOA TIÊU'));
assert.ok(sx.includes('HÀNG HẢI MIỀN BẮC'));
assert.ok(sx.includes(COMPANY_HEADER_ISSUER.split(' ').slice(-2).join(' ')));
assert.ok(sx.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'));
const firstCellStart = sx.indexOf('<w:tc>');
const firstCellEnd = sx.indexOf('</w:tc>', firstCellStart);
assert.ok(firstCellStart >= 0 && firstCellEnd > firstCellStart, 'Company header needs a left table cell');
const leftCellXml = sx.slice(firstCellStart, firstCellEnd);
assert.equal((leftCellXml.match(/<w:br\b/g) || []).length, 1,
  'The Word reference breaks the parent name once but keeps the company name on one line');
assert.ok(leftCellXml.includes(`>${COMPANY_HEADER_ISSUER}</w:t>`),
  'The full company name must be one uninterrupted Word run, as in Tieu ngu chuan.docx');
assert.ok(/<w:tblInd\b[^>]*w:w="-874"/.test(sx),
  'The original Word reference places the table 874 twips left of the text margin');
assert.ok(/<w:gridCol\b[^>]*w:w="5187"/.test(sx) && /<w:gridCol\b[^>]*w:w="5245"/.test(sx),
  'The original Word reference uses 5187/5245 twip columns so both bold headings fit on one line');
const headerTableXml = sx.slice(sx.indexOf('<w:tbl>'), sx.indexOf('</w:tbl>') + '</w:tbl>'.length);
const dateCellXml = headerTableXml.slice(headerTableXml.lastIndexOf('<w:tc>'));
assert.ok(/<w:jc\b[^>]*w:val="right"/.test(dateCellXml),
  'The location and date must align with the right edge of the national heading in the Word reference');
assert.ok(sx.includes('<w:tblW') && sx.includes(String(Math.round(COMPANY_HEADER_GEOMETRY_MM.headerWidth*1440/25.4)).slice(0,3)), 'Company header should be a fixed-width table');
assert.ok(sx.includes('<w:bottom') || sx.includes('<w:pBdr'), 'Real paragraph underlines required, not hyphen text');
const assessed=await auditGeneratedDocx(new Blob([new Uint8Array(buffer)]));
assert.equal(assessed.total,435);
assert.ok(assessed.counts.PASS+assessed.counts.FAIL+assessed.counts.NOT_EVALUATED+assessed.counts.NOT_APPLICABLE+assessed.counts.NEEDS_REVIEW===435);

const companyMotto = assessed.findings.find(f => f.ruleId === 'ND30.PL1.I.II.1B.MOTTO_UNDERLINE_LENGTH');
const companyIssuer = assessed.findings.find(f => f.ruleId === 'ND30.PL1.I.II.2B.ISSUER_UNDERLINE_RANGE');
assert.equal(companyMotto?.status, 'PASS', 'Company header motto underline must PASS');
assert.equal(companyIssuer?.status, 'PASS', 'Company header issuer underline must PASS');

// Also test generic profile export
const genericDoc = {
  regime: 'administrative' as const,
  fontFamily: 'Times New Roman' as const,
  fontSize: 13 as const,
  headerProfile: 'generic' as const,
  orgHeader1: 'BỘ TƯ PHÁP',
  orgHeader2: 'CỤC TRỢ GIÚP PHÁP LÝ',
  nationalHeader1: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' as const,
  nationalHeader2: 'Độc lập - Tự do - Hạnh phúc' as const,
  referenceNumber: 'Số: 45/CV-TGPL',
  locationAndDate: 'Hà Nội, ngày 16 tháng 10 năm 2026',
  documentType: 'CÔNG VĂN',
  subject: 'V/v hướng dẫn công tác trợ giúp pháp lý',
  bodyHtml: '<p>Nội dung thử nghiệm</p>',
  signTitle: 'CỤC TRƯỞNG',
  signName: 'Nguyễn Văn B',
  recipients: 'Như trên'
};
const genBuffer = await Packer.toBuffer(generateND30DocxDocument(genericDoc));
const genAssessed = await auditGeneratedDocx(new Blob([new Uint8Array(genBuffer)]));
const genMotto = genAssessed.findings.find(f => f.ruleId === 'ND30.PL1.I.II.1B.MOTTO_UNDERLINE_LENGTH');
const genIssuer = genAssessed.findings.find(f => f.ruleId === 'ND30.PL1.I.II.2B.ISSUER_UNDERLINE_RANGE');
assert.equal(genMotto?.status, 'PASS', 'Generic profile motto underline must PASS');
assert.equal(genIssuer?.status, 'PASS', 'Generic profile issuer underline must PASS');

const imported = {regime:'administrative',orgHeader1:'OTHER',orgHeader2:'OTHER',headerProfile:'generic'};
assert.equal(imported.headerProfile,'generic','Imported documents must not inherit fixed company header');
assert.equal(doc.headerProfile,COMPANY_HEADER_PROFILE_ID);

console.log(`[CANONICAL] 435 verified rules loaded; PASS=${assessed.counts.PASS}, NOT_EVALUATED=${assessed.counts.NOT_EVALUATED}.`);
console.log('[COMPANY & GENERIC HEADER] Word-reference table, geometric line evidence, true paragraph borders, imported-doc protection: OK');

