/**
 * INDEPENDENT PROBE — Stage 2 keyword isolation (audit only, OUTSIDE the repo).
 * Contract: "CHI BỘ"/"ĐẢNG BỘ" standing alone AT THE HEAD is party evidence;
 * the same words in the BODY / NƠI NHẬN / PHỤ LỤC must NOT be.
 */
import { detectRegimeFromRawBlocks } from "../src/utils/regimeDetection.ts";

const p = (index: number, text: string) => ({
  id: `block-${index}`, index, kind: "paragraph" as const, role: "unclassified" as const,
  text, html: `<p>${text}</p>`,
});

const HEAD = [p(0, "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
              p(1, "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc"),
              p(2, "Hải Phòng, ngày 10 tháng 10 năm 2026")];

const CASES: Array<{ name: string; blocks: any[]; expectPartyEvidence: boolean }> = [
  { name: "A. CHI BỘ standalone at the head (index 3)", blocks: [...HEAD, p(3, "CHI BỘ CƠ QUAN A"), p(4, "NGHỊ QUYẾT")], expectPartyEvidence: true },
  { name: "B. CHI BỘ in NƠI NHẬN (uppercase, index 5)", blocks: [...HEAD, p(3, "BÁO CÁO"), p(4, "Nơi nhận:"), p(5, "CHI BỘ CƠ QUAN A")], expectPartyEvidence: false },
  { name: "C. ĐẢNG ỦY in NƠI NHẬN (uppercase, index 5)", blocks: [...HEAD, p(3, "BÁO CÁO"), p(4, "Nơi nhận:"), p(5, "ĐẢNG ỦY CÔNG TY HOA TIÊU")], expectPartyEvidence: false },
  { name: "D. CHI BỘ in PHỤ LỤC (uppercase, index 4)", blocks: [...HEAD, p(3, "PHỤ LỤC"), p(4, "CHI BỘ CƠ QUAN A")], expectPartyEvidence: false },
  { name: "E. 'chi bộ' lowercase in body (index 4)", blocks: [...HEAD, p(3, "BÁO CÁO"), p(4, "- chi bộ Cơ quan A")], expectPartyEvidence: false },
  { name: "F. 'chi bộ' lowercase in NƠI NHẬN (index 5)", blocks: [...HEAD, p(3, "BÁO CÁO"), p(4, "Nơi nhận:"), p(5, "- chi bộ Cơ quan A")], expectPartyEvidence: false },
  { name: "G. CHI BỘ uppercase in body (index 4)", blocks: [...HEAD, p(3, "BÁO CÁO"), p(4, "CHI BỘ CƠ QUAN A")], expectPartyEvidence: false },
];

let failures = 0;
for (const c of CASES) {
  const r = detectRegimeFromRawBlocks(c.blocks as any);
  const partyEv = r.evidence.filter((e: any) => e.kind === "party_org_header");
  const has = partyEv.length > 0;
  const ok = has === c.expectPartyEvidence;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.name}`);
  console.log(`     suggested=${r.suggestedRegime} conflict=${r.conflict} confidence=${r.confidence} partyOrgEvidence=${JSON.stringify(partyEv.map((e: any) => ({ i: e.blockIndex, q: e.exactQuote })))}`);
}
console.log(`\nSUMMARY keyword-isolation failures=${failures}`);
if (failures) process.exitCode = 1;
