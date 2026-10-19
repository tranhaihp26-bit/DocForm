/** Sources exclusively from the user's canonical repository; no independent public legal browsing. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/quanggiaphthh/chuan-hoa-van-ban-nghi-dinh-30.git';
const EXPECTED_SHA = '078dae21f9e23975676179fa189f5c01b605f49a';
const root = process.cwd();
const out = path.join(root,'src/canonical/nd30');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'nd30-verified-'));
let source = process.env.ND30_RULE_SOURCE_DIR;
try {
  if (!source) {
    source = path.join(temp,'canonical');
    execFileSync('git',['clone','--depth','1','--branch','main',REPO,source],{stdio:'inherit'});
  }
  const sha=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if (sha !== EXPECTED_SHA) {
    throw new Error(`Nguồn canonical thay đổi: expected ${EXPECTED_SHA}, got ${sha}. Chưa phê duyệt nâng phiên bản; dừng!`);
  }
  const release=JSON.parse(fs.readFileSync(path.join(source,'v22-runtime/release/admin-nd30-verified-rc-v20.yaml'),'utf8'));
  const ruleDir=path.join(source,'v22-runtime/rules/generated-v24');
  const byId = new Map();
  for(const filename of fs.readdirSync(ruleDir).filter(n=>n.endsWith('.yaml'))) {
    const rule=JSON.parse(fs.readFileSync(path.join(ruleDir,filename),'utf8'));
    if(byId.has(rule.id))throw new Error(`Duplicate rule ID: ${rule.id}`);
    byId.set(rule.id,rule);
  }
  if (release.rules.length !== 435 || new Set(release.rules).size !== 435) throw new Error(`Release không có đúng 435 unique IDs: ${release.rules.length}`);
  const rules=release.rules.map(id=>{
    const rule=byId.get(id);
    if(!rule || rule.maturity!=='verified' || rule.regime!=='administrative' || rule.source.source_id!=='VN-STATE-ND30-2020')
      throw new Error(`Missing/unverified/non-ND30 release rule: ${id}`);
    return rule;
  });
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'rules.generated.json'),JSON.stringify({repository:REPO,commit:sha,releasePack:release.id,verifiedOnly:true,rules},null,2)+'\n');
  const docsDir=path.join(out,'source-contract');
  fs.mkdirSync(docsDir,{recursive:true});
  const docFiles=['README.md','RULE-MODEL.md','APPLICABILITY.md','FIX-SAFETY.md','SOURCE-MODEL.md','sources/registry.yaml','profiles/default-administrative.yaml','rule-packs/admin-nd30-document-format.yaml'];
  for(const f of docFiles){fs.mkdirSync(path.join(docsDir,path.dirname(f)),{recursive:true});fs.copyFileSync(path.join(source,f),path.join(docsDir,f))}
  console.log(`[CANONICAL] ${rules.length} verified ND30 rules; source=${sha}; release=${release.id}`);
  const domains={};for(const r of rules)domains[r.domain]=(domains[r.domain]||0)+1;
  console.log('[CANONICAL] domains:',JSON.stringify(domains));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
