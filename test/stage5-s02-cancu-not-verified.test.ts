/**
 * INDEPENDENT PROBE — S2-D4 exact minimal repro (audit only, OUTSIDE the repo).
 * A "Căn cứ ..." legal-basis paragraph with NO subject line above it must not be
 * promoted to the trích yếu (subject) nor removed from the body.
 */
import { extractLocalFile } from "../src/utils/localFileImport.ts";
import { segmentLocalExtraction } from "../src/utils/localFileImport.ts";

const CASES: Array<{ name: string; txt: string; regime: "administrative" | "party" }> = [
  {
    name: "party: Căn cứ paragraph, no subject above",
    regime: "party",
    txt: [
      "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
      "Số 12-NQ/ĐU",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "Căn cứ Quyết định số 45/QĐ-UBND ngày 10/10/2026 của Ủy ban nhân dân thành phố.",
      "Nội dung tiếp theo của văn bản.",
    ].join("\n"),
  },
  {
    name: "administrative: Căn cứ paragraph, no subject above",
    regime: "administrative",
    txt: [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "Căn cứ Quyết định số 45/QĐ-UBND ngày 10/10/2026 của Ủy ban nhân dân thành phố.",
      "Nội dung tiếp theo của văn bản.",
    ].join("\n"),
  },
  {
    name: "administrative: 'Theo đề nghị ...' paragraph, no subject above",
    regime: "administrative",
    txt: [
      "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
      "Hải Phòng, ngày 10 tháng 10 năm 2026",
      "Theo đề nghị của Phòng Kế hoạch Tài chính, phòng ban được phân công xử lý.",
      "Nội dung tiếp theo của văn bản.",
    ].join("\n"),
  },
];

let failures = 0;
for (const c of CASES) {
  const f = new File([c.txt], "Audit_D4.txt", { type: "text/plain" });
  const extraction = await extractLocalFile(f);
  const structured = segmentLocalExtraction(extraction, c.regime);
  const subject = (structured.fields as any)?.subject?.value ?? null;
  const bodyHtml = structured.body?.html || "";
  const kept = bodyHtml.includes("Căn cứ") || bodyHtml.includes("Theo đề nghị");
  const promoted = subject != null &&
    (String(subject).startsWith("Căn cứ") || String(subject).startsWith("Theo đề nghị"));
  console.log(`[S2-D4] ${c.name}`);
  console.log(`        fields.subject.value = ${JSON.stringify(subject)}`);
  console.log(`        paragraph kept in body = ${kept}`);
  if (promoted || !kept) {
    failures++;
    console.log(`        -> CONTRACT VIOLATION (promoted=${promoted}, keptInBody=${kept})`);
  } else {
    console.log(`        -> OK`);
  }
}
console.log(`\nSUMMARY S2-D4 failures=${failures}`);
if (failures) process.exitCode = 1;
