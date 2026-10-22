/**
 * Chặng 2 — nhận diện thể thức và loại văn bản trước phân vùng.
 *
 * These tests lock the behaviour contract from
 * docs/superpowers/plans/2026-10-19-docform-stage2-implementation-plan.md.
 * All fixtures are synthetic (no user documents).
 *
 * Matrix (from the OpenCode audit): A,B,C,D,E,F,G,H,I,J,O,P,Q,R,S1,S2.
 * Acceptance fixes: S2-F01 (both systems => conflict), S2-F02 (medium => ask),
 * S2-F03 (Unicode boundary for party org prefixes).
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractBlocksFromDocx, extractBlocksFromTxt } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { reconstructFromReviewedBlocks } from "../src/utils/importReview.ts";
import {
  detectRegimeFromRawBlocks,
  regimeNeedsConfirmation,
  type Regime,
} from "../src/utils/regimeDetection.ts";
import { parseLocalFile } from "../src/utils/localFileImport.ts";
import { prepareImportedFileBundle } from "../src/utils/importSessionLifecycle.ts";
import type { SourceBlock } from "../src/shared/schemas/document.schema.ts";

function txtBlocks(lines: string[]): SourceBlock[] {
  return extractBlocksFromTxt(lines.join("\n")).blocks;
}

async function docxBlocks(bodyXml: string): Promise<SourceBlock[]> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return (await extractBlocksFromDocx(bytes)).blocks;
}

function p(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function twoColHeaderTable(leftXml: string, rightXml: string): string {
  return `<w:tbl><w:tr><w:tc>${leftXml}</w:tc><w:tc>${rightXml}</w:tc></w:tr></w:tbl>`;
}

const ADMIN_HEADER = [
  "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
];

const PARTY_HEADER = [
  "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
  "Số 12-NQ/ĐU",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
];

// ---------------------------------------------------------------------------
// A — S02: "chi bộ" only inside a body sentence must not flip to party
// ---------------------------------------------------------------------------
test("A/S02: body sentence mentioning 'chi bộ' is not regime evidence", () => {
  const blocks = txtBlocks([
    ...ADMIN_HEADER,
    "KẾ HOẠCH",
    "Cơ quan phối hợp với chi bộ triển khai lịch công tác.",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  assert.equal(detection.confidence, "high");
  assert.equal(detection.conflict, false);
  assert.equal(detection.insufficient, false);
  assert.equal(
    detection.evidence.some((e) => e.regime === "party"),
    false,
    "no party evidence may come from the body sentence",
  );
  assert.equal(regimeNeedsConfirmation(detection, "state"), false, "matching state evidence proceeds");
  assert.equal(regimeNeedsConfirmation(detection, "party"), true, "contradicting choice requires confirmation");
});

// ---------------------------------------------------------------------------
// B — party header while the user chose administrative
// ---------------------------------------------------------------------------
test("B: party header is detected two-way and keeps party 'Số ' form", () => {
  const blocks = txtBlocks([
    ...PARTY_HEADER,
    "NGHỊ QUYẾT",
    "Về việc triển khai nhiệm vụ quý IV.",
    "Nội dung nghị quyết.",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "party");
  assert.equal(detection.confidence, "high");
  assert.equal(regimeNeedsConfirmation(detection, "state"), true);

  const structured = segmentSourceBlocks(blocks, {
    filename: "nghi-quyet.txt",
    fileType: "txt",
    standardType: "party",
  });
  assert.equal(structured.fields.documentType.value, "NGHỊ QUYẾT");
  assert.equal(structured.fields.referenceNumber.value, "Số 12-NQ/ĐU");
});

// ---------------------------------------------------------------------------
// C — party head while the user chose administrative (inverse direction)
// ---------------------------------------------------------------------------
test("C: chosen state but party head suggests party (no silent commit)", () => {
  const blocks = txtBlocks([...PARTY_HEADER, "NGHỊ QUYẾT", "Nội dung."]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "party");
  assert.equal(regimeNeedsConfirmation(detection, "state"), true);
});

// ---------------------------------------------------------------------------
// D — chosen party but administrative head
// ---------------------------------------------------------------------------
test("D: chosen party but administrative head suggests state and requires confirmation", () => {
  const blocks = txtBlocks([...ADMIN_HEADER, "THÔNG BÁO", "Nội dung thông báo."]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  assert.equal(detection.confidence, "high");
  assert.equal(regimeNeedsConfirmation(detection, "party"), true);
  assert.equal(regimeNeedsConfirmation(detection, "state"), false);
});

// ---------------------------------------------------------------------------
// E — both systems present at the head => conflict
// ---------------------------------------------------------------------------
test("E: conflicting head (party org + state national header/motto) is a conflict", () => {
  const blocks = txtBlocks([
    "ĐẢNG ỦY CÔNG TY HOA TIÊU\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "Số 03-KH/ĐU\tĐộc lập - Tự do - Hạnh phúc",
    "Hải Phòng, ngày 10 tháng 10 năm 2026",
    "KẾ HOẠCH",
    "Nội dung.",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.conflict, true);
  assert.equal(detection.suggestedRegime, null);
  assert.equal(regimeNeedsConfirmation(detection, "state"), true);
  assert.equal(regimeNeedsConfirmation(detection, "party"), true);
});

// ---------------------------------------------------------------------------
// F — no header at all => insufficient, and no body sentence becomes org header
// ---------------------------------------------------------------------------
test("F: no trustworthy anchor is insufficient and does not turn the first body sentence into an org header", () => {
  const lines = [
    "Cơ quan phối hợp với chi bộ triển khai lịch công tác.",
    "Nội dung thứ hai của tài liệu không có phần đầu.",
  ];
  const blocks = txtBlocks(lines);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.insufficient, true);
  assert.equal(detection.suggestedRegime, null);
  assert.equal(regimeNeedsConfirmation(detection, "state"), true);

  const structured = segmentSourceBlocks(blocks, {
    filename: "khong-dau.txt",
    fileType: "txt",
    standardType: "administrative",
  });
  assert.equal(structured.fields.orgHeader1.value ?? null, null, "no fabricated orgHeader1");
  assert.equal(structured.fields.orgHeader2.value ?? null, null, "no fabricated orgHeader2");
  const firstRole = (structured.blocks || []).find((b) => b.id === "block-0")?.role;
  assert.notEqual(firstRole, "header", "first body sentence must not be marked header");
  assert.match(structured.body.html, /Cơ quan phối hợp với chi bộ/);
});

// ---------------------------------------------------------------------------
// G — the word "báo cáo" in body prose is not a document type
// ---------------------------------------------------------------------------
test("G: 'báo cáo' inside a body sentence is not accepted as documentType", () => {
  const blocks = txtBlocks([
    ...ADMIN_HEADER,
    "Nội dung báo cáo của tài liệu được trình bày dưới đây.",
    "Kết luận nội dung báo cáo.",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.documentTypeEvidence, null);
  const structured = segmentSourceBlocks(blocks, {
    filename: "khong-loai.txt",
    fileType: "txt",
    standardType: "administrative",
  });
  assert.equal(structured.fields.documentType.value, null);
});

// ---------------------------------------------------------------------------
// H — "Đảng ủy" only in Nơi nhận must not decide the regime
// ---------------------------------------------------------------------------
test("H: 'Đảng ủy' only in the recipient list does not decide the regime", () => {
  const blocks = txtBlocks([
    ...ADMIN_HEADER,
    "BÁO CÁO",
    "Về việc tổng kết công tác.",
    "Nội dung báo cáo.",
    "Nơi nhận:",
    "- Đảng ủy Công ty (để báo cáo);",
    "- Lưu: VT.",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  assert.equal(detection.evidence.some((e) => e.regime === "party"), false);
});

// ---------------------------------------------------------------------------
// I — "chi bộ" only in an appendix must not decide the regime
// ---------------------------------------------------------------------------
test("I: 'chi bộ' only inside an appendix does not decide the regime", () => {
  const blocks = txtBlocks([
    ...ADMIN_HEADER,
    "BÁO CÁO",
    "Về việc tổng kết công tác.",
    "Nội dung báo cáo.",
    "PHỤ LỤC",
    "Danh sách chi bộ trực thuộc tham gia.",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  assert.equal(detection.evidence.some((e) => e.regime === "party"), false);
});

// ---------------------------------------------------------------------------
// J — filename only carries the document type; it is never evidence
// ---------------------------------------------------------------------------
test("J: document type present only in the filename is not used", () => {
  const blocks = txtBlocks(["Nội dung tài liệu không có phần đầu."]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.insufficient, true);
  assert.equal(detection.documentTypeEvidence, null);
});

// ---------------------------------------------------------------------------
// O — DOCX 2-column header table: evidence with cell coordinates
// ---------------------------------------------------------------------------
test("O: DOCX header table yields state evidence with cell coordinates", async () => {
  const blocks = await docxBlocks(
    twoColHeaderTable(
      p("CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC") + p("Số: 01/KH-HT"),
      p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") + p("Độc lập - Tự do - Hạnh phúc") + p("Hải Phòng, ngày 10 tháng 10 năm 2026"),
    ) + p("KẾ HOẠCH") + p("Nội dung kế hoạch."),
  );
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  const national = detection.evidence.find((e) => e.kind === "national_header_state");
  assert.ok(national, "national header evidence must exist");
  assert.ok(national.cell, "table evidence must carry cell coordinates");
  assert.equal(national.cell.colIndex, 1);
  assert.ok(national.sourceBlockId, "evidence must reference a source block id");

  const structured = segmentSourceBlocks(blocks, {
    filename: "ke-hoach.docx",
    fileType: "docx",
    standardType: "administrative",
  });
  assert.equal(structured.fields.documentType.value, "KẾ HOẠCH");
  assert.ok(structured.fields.documentType.sourceBlockIds.length > 0);
});

// ---------------------------------------------------------------------------
// P — DOCX title inside a 1-column table: provenance survives reconstruction
// ---------------------------------------------------------------------------
test("P: document type inside a table keeps cell provenance through reconstruction", async () => {
  const titleTable = `<w:tbl><w:tr><w:tc>${p("QUYẾT ĐỊNH")}</w:tc></w:tr></w:tbl>`;
  const blocks = await docxBlocks(
    twoColHeaderTable(
      p("CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC") + p("Số: 07/QĐ-HT"),
      p("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM") + p("Độc lập - Tự do - Hạnh phúc") + p("Hải Phòng, ngày 10 tháng 10 năm 2026"),
    ) + titleTable + p("Nội dung quyết định."),
  );
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  assert.ok(detection.documentTypeEvidence, "table title must be detected");
  assert.ok(detection.documentTypeEvidence.cell, "title evidence must carry cell coordinates");

  const structured = segmentSourceBlocks(blocks, {
    filename: "quyet-dinh.docx",
    fileType: "docx",
    standardType: "administrative",
  });
  assert.equal(structured.fields.documentType.value, "QUYẾT ĐỊNH");
  assert.ok(structured.fields.documentType.sourceBlockIds.length > 0, "documentType must have a source block");
  assert.ok(structured.fields.documentType.sourceCell, "documentType must keep table cell provenance");

  const reconstructed = reconstructFromReviewedBlocks(structured.blocks || [], "state", structured);
  assert.equal(reconstructed.fields.documentType, "QUYẾT ĐỊNH", "table title must survive reconstruction");
});

// ---------------------------------------------------------------------------
// Q — DOCX party header table
// ---------------------------------------------------------------------------
test("Q: DOCX party header table is detected as party and keeps 'Số '", async () => {
  const blocks = await docxBlocks(
    twoColHeaderTable(
      p("ĐẢNG BỘ CÔNG TY HOA TIÊU") + p("Số 12-NQ/ĐU"),
      p("ĐẢNG CỘNG SẢN VIỆT NAM") + p("Hải Phòng, ngày 10 tháng 10 năm 2026"),
    ) + p("NGHỊ QUYẾT") + p("Nội dung nghị quyết."),
  );
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "party");

  const structured = segmentSourceBlocks(blocks, {
    filename: "nghi-quyet.docx",
    fileType: "docx",
    standardType: "party",
  });
  assert.equal(structured.fields.documentType.value, "NGHỊ QUYẾT");
  assert.equal(structured.fields.referenceNumber.value, "Số 12-NQ/ĐU");
});

// ---------------------------------------------------------------------------
// R — the explicit confirmed regime is honoured (no whole-text scan)
// ---------------------------------------------------------------------------
test("R: prepareImportedFileBundle honours the confirmed regime and never rescans the whole text", async () => {
  const partyFile = new File(
    [PARTY_HEADER.concat(["NGHỊ QUYẾT", "Nội dung."]).join("\n")],
    "party-source.txt",
    { type: "text/plain" },
  );
  const parsedAsState = await parseLocalFile(partyFile, "administrative");
  const bundleAsState = prepareImportedFileBundle(parsedAsState, "state");
  assert.equal(bundleAsState.effectiveRegime, "state", "explicit state must not be silently flipped to party");

  const adminFile = new File(
    [ADMIN_HEADER.concat(["KẾ HOẠCH", "Nội dung."]).join("\n")],
    "admin-source.txt",
    { type: "text/plain" },
  );
  const parsedAsAdmin = await parseLocalFile(adminFile, "administrative");
  const bundleAsParty = prepareImportedFileBundle(parsedAsAdmin, "party");
  assert.equal(bundleAsParty.effectiveRegime, "party", "explicit party must not be silently flipped to state");
});

// ---------------------------------------------------------------------------
// S1/S2 — separator role follows the confirmed regime
// ---------------------------------------------------------------------------
test("S1/S2: party separator '-----' is removed from body under party and kept under state", () => {
  const lines = [
    ...PARTY_HEADER,
    "NGHỊ QUYẾT",
    "Về việc triển khai nhiệm vụ.",
    "-----",
    "Nội dung nghị quyết.",
  ];
  const blocks = txtBlocks(lines);
  assert.equal(detectRegimeFromRawBlocks(blocks).suggestedRegime, "party");

  const asParty = segmentSourceBlocks(blocks, {
    filename: "nq.txt",
    fileType: "txt",
    standardType: "party",
  });
  const sepAsParty = (asParty.blocks || []).find((b) => b.text.trim() === "-----");
  assert.equal(sepAsParty?.role, "separator");
  assert.equal(asParty.body.html.includes("-----"), false);

  const asState = segmentSourceBlocks(blocks, {
    filename: "nq.txt",
    fileType: "txt",
    standardType: "administrative",
  });
  const sepAsState = (asState.blocks || []).find((b) => b.text.trim() === "-----");
  assert.equal(sepAsState?.role, "body");
});

// ---------------------------------------------------------------------------
// Reference number normalisation per confirmed regime
// ---------------------------------------------------------------------------
test("Reference number keeps party 'Số ' and uses administrative 'Số: '", () => {
  const stateBlocks = txtBlocks([
    "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    "Số 99/QĐ-HT\tĐộc lập - Tự do - Hạnh phúc",
    "Hải Phòng, ngày 10 tháng 10 năm 2026",
    "QUYẾT ĐỊNH",
    "Nội dung.",
  ]);
  const structuredState = segmentSourceBlocks(stateBlocks, {
    filename: "qd.txt",
    fileType: "txt",
    standardType: "administrative",
  });
  assert.equal(structuredState.fields.referenceNumber.value, "Số: 99/QĐ-HT");

  // Party source written without a colon must NOT be forced to "Số:".
  const partyBlocks = txtBlocks([
    "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
    "Số 99-NQ/ĐU",
    "Hải Phòng, ngày 10 tháng 10 năm 2026",
    "NGHỊ QUYẾT",
    "Nội dung.",
  ]);
  const structuredParty = segmentSourceBlocks(partyBlocks, {
    filename: "nq.txt",
    fileType: "txt",
    standardType: "party",
  });
  assert.equal(structuredParty.fields.referenceNumber.value, "Số 99-NQ/ĐU");

  // An explicit colon already present in the source is preserved as-is (data
  // preservation, mirrors the STT17 supervisory document).
  const partyWithColon = txtBlocks([
    "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
    "Số: ...-BC/ĐGS",
    "Hải Phòng, ngày 10 tháng 10 năm 2026",
    "BÁO CÁO",
    "Nội dung.",
  ]);
  const structuredPartyColon = segmentSourceBlocks(partyWithColon, {
    filename: "bc.txt",
    fileType: "txt",
    standardType: "party",
  });
  assert.equal(structuredPartyColon.fields.referenceNumber.value, "Số: ...-BC/ĐGS");
});

// ---------------------------------------------------------------------------
// Detection must be deterministic and must not mutate raw blocks
// ---------------------------------------------------------------------------
test("Detection is deterministic and does not mutate raw blocks or infer from role", () => {
  const blocks = txtBlocks([...ADMIN_HEADER, "KẾ HOẠCH", "Nội dung."]);
  const snapshot = JSON.stringify(blocks);
  const first = detectRegimeFromRawBlocks(blocks);
  const second = detectRegimeFromRawBlocks(blocks);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(blocks), snapshot, "raw blocks must not be mutated");

  // Simulate segmenter-assigned roles; detection must ignore them.
  const withRoles = blocks.map((b, i) => ({ ...b, role: i === 0 ? ("body" as const) : ("header" as const) }));
  const detectionWithRoles = detectRegimeFromRawBlocks(withRoles);
  assert.equal(detectionWithRoles.suggestedRegime, first.suggestedRegime);
  assert.deepEqual(detectionWithRoles.evidence, first.evidence);
});

// ---------------------------------------------------------------------------
// S2-F01 — evidence of BOTH systems in the front zone is always a conflict,
// even when the weights differ. Never silently side with the stronger anchor.
// ---------------------------------------------------------------------------
test("S2-F01a: state national header + party reference number is a conflict and requires confirmation", () => {
  const blocks = txtBlocks(["CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", "Số 12-NQ/ĐU"]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.insufficient, false);
  assert.equal(detection.conflict, true, "state header + party reference must be a conflict");
  assert.equal(detection.suggestedRegime, null, "no silent automatic pick");
  assert.ok(detection.evidence.some((e) => e.kind === "national_header_state"));
  assert.ok(detection.evidence.some((e) => e.kind === "reference_number_party"));
  assert.equal(regimeNeedsConfirmation(detection, "state"), true, "must ask even when the user chose state");
  assert.equal(regimeNeedsConfirmation(detection, "party"), true);
  for (const item of detection.evidence) {
    assert.ok(item.sourceBlockId, "every evidence item must carry a sourceBlockId");
    assert.ok(item.exactQuote.length > 0, "every evidence item must carry an exact source quote");
  }
});

test("S2-F01b: party national header + state reference number is a conflict in the inverse direction", () => {
  const blocks = txtBlocks(["ĐẢNG CỘNG SẢN VIỆT NAM", "Số: 12/QĐ-UBND"]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.conflict, true);
  assert.equal(detection.suggestedRegime, null);
  assert.ok(detection.evidence.some((e) => e.kind === "national_header_party"));
  assert.ok(detection.evidence.some((e) => e.kind === "reference_number_state"));
  assert.equal(regimeNeedsConfirmation(detection, "party"), true);
  assert.equal(regimeNeedsConfirmation(detection, "state"), true);
});

// ---------------------------------------------------------------------------
// S2-F02 — a lone reference number is medium-strength and must always ask,
// even when it points at the regime the user already chose.
// ---------------------------------------------------------------------------
test("S2-F02a: a lone party reference number is medium and always requires confirmation", () => {
  const blocks = txtBlocks(["Số 12-NQ/ĐU", "NGHỊ QUYẾT"]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "party");
  assert.equal(detection.confidence, "medium");
  assert.equal(detection.conflict, false);
  assert.equal(detection.insufficient, false);
  assert.equal(regimeNeedsConfirmation(detection, "party"), true, "medium evidence must never auto-commit");
});

test("S2-F02b: a lone state reference number is medium and always requires confirmation", () => {
  const blocks = txtBlocks(["Số: 12/QĐ-UBND", "QUYẾT ĐỊNH"]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.suggestedRegime, "state");
  assert.equal(detection.confidence, "medium");
  assert.equal(regimeNeedsConfirmation(detection, "state"), true, "medium evidence must never auto-commit");
});

// ---------------------------------------------------------------------------
// S2-F03 — Unicode word boundary: standalone uppercase "CHI BỘ" must be found.
// ---------------------------------------------------------------------------
test("S2-F03a: a standalone uppercase CHI BỘ line is a party organisation header", () => {
  const blocks = txtBlocks(["CHI BỘ CƠ QUAN A", "NGHỊ QUYẾT"]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(detection.insufficient, false);
  assert.equal(detection.suggestedRegime, "party");
  const org = detection.evidence.find((e) => e.kind === "party_org_header");
  assert.ok(org, "CHI BỘ must produce party_org_header evidence");
  assert.equal(org.sourceBlockId, "block-0");
  assert.equal(org.exactQuote, "CHI BỘ CƠ QUAN A");
  assert.equal(org.strength, "high");
});

test("S2-F03b: all Vietnamese-diacritic party prefixes are recognized", () => {
  const lines = [
    "ĐẢNG BỘ CÔNG TY A",
    "ĐẢNG ỦY CƠ QUAN B",
    "ĐẢNG ĐOÀN CƠ QUAN C",
    "BAN CHẤP HÀNH ĐẢNG BỘ D",
    "BAN THƯỜNG VỤ TỈNH ỦY E",
  ];
  for (const line of lines) {
    const detection = detectRegimeFromRawBlocks(txtBlocks([line, "NGHỊ QUYẾT"]));
    const org = detection.evidence.find((e) => e.kind === "party_org_header");
    assert.ok(org, `party prefix line must be recognized: ${line}`);
    assert.equal(org.exactQuote, line, "the evidence quote must be the exact source line");
  }
});

test("S2-F03c: body sentences and recipient lines never become a party organisation header", () => {
  const body = detectRegimeFromRawBlocks(
    txtBlocks(["Chi bộ phối hợp triển khai lịch công tác.", "Nội dung."]),
  );
  assert.equal(body.evidence.some((e) => e.kind === "party_org_header"), false);

  const recipient = detectRegimeFromRawBlocks(
    txtBlocks([...ADMIN_HEADER, "BÁO CÁO", "Nội dung.", "Nơi nhận:", "- Đảng ủy Công ty (để báo cáo);"]),
  );
  assert.equal(recipient.evidence.some((e) => e.kind === "party_org_header"), false);
  assert.equal(recipient.conflict, false, "recipient mentions must not create a false conflict");
});

test("S2-F03d: a body paragraph starting with 'Căn cứ' ends the front region (Unicode boundary)", () => {
  const blocks = txtBlocks([
    ...ADMIN_HEADER,
    "KẾ HOẠCH",
    "Căn cứ Quyết định số 45/QĐ-UBND ngày 10/10/2026 của Ủy ban nhân dân thành phố về việc ban hành kế hoạch công tác năm 2026.",
    "CHI BỘ CƠ QUAN A",
  ]);
  const detection = detectRegimeFromRawBlocks(blocks);
  assert.equal(
    detection.evidence.some((e) => e.kind === "party_org_header"),
    false,
    "a party-shaped line after the body starts must not be scanned",
  );
  assert.equal(detection.conflict, false);
});
