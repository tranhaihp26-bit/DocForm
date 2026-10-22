/**
 * INDEPENDENT PROBE — Stage 2 segmenter/exporter defects (audit only, OUTSIDE the repo).
 *
 * S2-D1: a BODY sentence that merely starts with a document-type keyword
 *        ("Báo cáo tình hình ...") must not be promoted to `fields.documentType`
 *        and must not be removed from the body.
 * S2-D2: under the party regime the "-----" separator must not be duplicated
 *        in the exported DOCX.
 * S2-D4: a "Căn cứ ..." legal-basis paragraph must stay in the body and must
 *        not become the trích yếu.
 *
 * Synthetic TXT only.
 */
import assert from "node:assert/strict";
import { extractLocalFile } from "../src/utils/localFileImport.ts";
import { detectRegimeFromRawBlocks } from "../src/utils/regimeDetection.ts";

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

const ADMIN_TXT = [
  "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
  "Báo cáo tình hình thực hiện nhiệm vụ quý IV năm 2026",
  "Nội dung tiếp theo của văn bản.",
].join("\n");

const PARTY_TXT = [
  "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
  "Số 12-NQ/ĐU",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
  "NGHỊ QUYẾT",
  "Về việc triển khai nhiệm vụ quý IV.",
  "Căn cứ Nghị quyết số 01-NQ/ĐU ngày 01/01/2026 của Ban Dự án.",
  "-----",
  "Nội dung nghị quyết của đơn vị.",
].join("\n");

let failures = 0;
function check(name: string, fn: () => void) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (e: any) { failures++; process.stdout.write(`FAIL ${name}: ${e.message}\n`); }
}

const { segmentLocalExtraction } = await import("../src/utils/localFileImport.ts");

// ---------------------------------------------------------------- S2-D1 ---
{
  const extraction = await extractLocalFile(makeFile("Audit_D1.txt", ADMIN_TXT));
  const detection = detectRegimeFromRawBlocks(extraction.rawBlocks);
  const structured = segmentLocalExtraction(extraction, "administrative");
  const dt = (structured.fields as any)?.documentType;
  const bodyHtml = structured.body?.html || "";

  console.log("[S2-D1] detection.suggestedRegime:", detection.suggestedRegime);
  console.log("[S2-D1] fields.documentType.value:", JSON.stringify(dt?.value ?? null));
  console.log("[S2-D1] fields.documentType.sourceBlockIds:", JSON.stringify(dt?.sourceBlockIds ?? null));
  console.log("[S2-D1] body contains the body sentence:", bodyHtml.includes("Báo cáo tình hình"));

  check("S2-D1: the detector does not treat a body sentence as the document type", () => {
    assert.equal(detection.documentTypeEvidence ?? null, null,
      "detector advertised a document type for a body sentence");
  });
  check("S2-D1: the segmenter does not promote a body sentence to fields.documentType", () => {
    assert.ok(
      !String(dt?.value ?? "").toUpperCase().startsWith("BÁO CÁO TÌNH HÌNH"),
      `segmenter promoted a body sentence to the document type: ${JSON.stringify(dt?.value)}`
    );
  });
  check("S2-D1: the body sentence stays in the body", () => {
    assert.ok(bodyHtml.includes("Báo cáo tình hình"),
      "the body sentence was removed from the body by the segmenter");
  });
}

// ---------------------------------------------------------------- S2-D4 ---
{
  const extraction = await extractLocalFile(makeFile("Audit_D4.txt", PARTY_TXT));
  const structured = segmentLocalExtraction(extraction, "party");
  const subject = (structured.fields as any)?.subject;
  const bodyHtml = structured.body?.html || "";
  console.log("[S2-D4] fields.subject.value:", JSON.stringify(subject?.value ?? null));
  console.log("[S2-D4] body contains 'Căn cứ':", bodyHtml.includes("Căn cứ"));
  check("S2-D4: a 'Căn cứ ...' legal basis stays in the body and is not the trích yếu", () => {
    assert.ok(bodyHtml.includes("Căn cứ"), "the 'Căn cứ' paragraph was removed from the body");
    assert.ok(!String(subject?.value ?? "").startsWith("Căn cứ"),
      `the legal basis was promoted to the trích yếu: ${JSON.stringify(subject?.value)}`);
  });
}

// ---------------------------------------------------------------- S2-D2 ---
{
  const extraction = await extractLocalFile(makeFile("Audit_D2.txt", PARTY_TXT));
  const structured = segmentLocalExtraction(extraction, "party");
  const bodyHtml = structured.body?.html || "";
  const dashesInBody = (bodyHtml.match(/-----/g) || []).length;
  console.log("[S2-D2] dashes in segmented body:", dashesInBody);

  // Export the segmented document through the real exporter and count the
  // separators that end up in word/document.xml.
  const { generateND30DocxBuffer } = await import("../src/utils/docxExport.ts");
  const doc: any = {
    orgHeader1: "ĐẢNG BỘ CÔNG TY HOA TIÊU",
    orgHeader2: "",
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    locationAndDate: "Hải Phòng, ngày 10 tháng 10 năm 2026",
    documentType: structured.fields?.documentType?.value ?? "NGHỊ QUYẾT",
    referenceNumber: structured.fields?.referenceNumber?.value ?? "Số 12-NQ/ĐU",
    subject: structured.fields?.subject?.value ?? "Về việc triển khai nhiệm vụ quý IV.",
    bodyHtml,
    signTitle: "",
    signName: "",
    recipients: "",
  };
  const buf = await generateND30DocxBuffer({
    regime: "party",
    headerProfile: "generic",
    orgHeader1: doc.orgHeader1,
    orgHeader2: doc.orgHeader2,
    nationalHeader1: doc.nationalHeader1,
    nationalHeader2: doc.nationalHeader2,
    locationAndDate: doc.locationAndDate,
    documentType: doc.documentType,
    referenceNumber: doc.referenceNumber,
    subject: doc.subject,
    bodyHtml: doc.bodyHtml,
    signTitle: doc.signTitle,
    signName: doc.signName,
    recipients: doc.recipients,
    fontFamily: "Times New Roman",
    fontSize: 14,
  } as any);

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml: string = await zip.file("word/document.xml")!.async("string");
  const dashes = (xml.match(/-----/g) || []).length;
  console.log("[S2-D2] '-----' occurrences in exported word/document.xml:", dashes);
  check("S2-D2: the party separator is not duplicated in the exported DOCX", () => {
    assert.ok(dashes <= 1,
      `the exported party DOCX contains ${dashes} separator lines (expected exactly 1)`);
  });
}

process.stdout.write(`\nSUMMARY failures=${failures}\n`);
if (failures) process.exitCode = 1;
