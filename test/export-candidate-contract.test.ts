import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";
import { transformSync } from "esbuild";
import { createExportCandidateManager, type ExportCandidateSnapshot } from "../src/utils/exportCandidate.ts";

import { verifyCandidateExportFidelity } from "../src/utils/tableRoundtrip.ts";
import { assessExportSafety } from "../src/shared/importFidelity.ts";

async function makeZipBytes(path: string, content: string): Promise<Uint8Array> {
  return new JSZip().file(path, content).generateAsync({ type: "uint8array" });
}

describe("Task 4: Export Candidate Gate Contract (C01, B05, B06)", () => {
  it("C01: Gate rejects an archive whose document.xml is not an OOXML document", async () => {
    const payload = await makeZipBytes("word/document.xml", "THIS IS NOT XML");
    const r = await verifyCandidateExportFidelity(payload, {}, { tableIds: [] });
    assert.equal(r.safe, false, "Gate must return safe: false for invalid XML");
  });

  it("B05: Production export must reject a malformed candidate even without a source manifest", async () => {
    const s = fs.readFileSync("src/App.tsx", "utf8");
    const start = s.indexOf("  const exportToDocx = async () => {");
    const end = s.indexOf("  const handleDownloadOriginalFile = async () => {", start);
    assert.ok(start >= 0 && end > start, "exportToDocx must exist in App.tsx");

    const code = transformSync(s.slice(start, end), { loader: "ts", target: "es2022", format: "esm" }).code;
    const payload = await makeZipBytes("wrong.txt", "SYNTHETIC INVALID DOCX");

    const observed = { downloads: 0, error: "" };
    const noop = () => {};
    const input: ExportCandidateSnapshot = { doc: {
      orgHeader1: "", orgHeader2: "", nationalHeader1: "", nationalHeader2: "",
      locationAndDate: "", documentType: "SYNTHETIC", referenceNumber: "",
      subject: "", bodyHtml: "", signTitle: "", signName: "", recipients: "",
    }, standardType: "state", reviewBlocks: [], structuredImport: null };
    const manager = createExportCandidateManager(async () => payload);
    const malformed = await manager.prepare(input);
    assert.ok(malformed);
    assert.equal(malformed.safe, false, "Malformed OOXML must be rejected by the candidate gate");
    const deps = {
      candidateManager: { current: manager },
      workspaceSnapshotRef: { current: input },
      uploadedBlocks: [],
      docTypeOverride: null,
      canEnterStep: () => true,
      standardType: "state",
      downloadDocxUint8Array: () => { observed.downloads++; },
      setErrorMsg: (message: string) => { observed.error = message; },
    };

    const fn = new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;\n${code}\nreturn exportToDocx;`)(deps);
    await fn();

    assert.equal(observed.downloads, 0, "Must not trigger download when candidate is malformed");
    assert.match(observed.error, /không tạo được tệp/, "Production download must explain why malformed bytes cannot be downloaded");
  });

  it("B06: An unapproved business table containing the national title is still a business table", async () => {
    const title = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblCaption w:val="user_unapproved"/><w:tblBorders><w:top w:val="single" w:sz="8"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>${title}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>UNAPPROVED BUSINESS DATA</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const payload = await makeZipBytes("word/document.xml", xml);
    const r = await verifyCandidateExportFidelity(payload, {}, { tableIds: [] });

    assert.equal(r.safe, false, "Must not approve unapproved business table");
    assert.equal(r.tableDecisions?.[0]?.region, "body", "Bordered table must be classified as body, not header");
  });

  it("D06: Candidate gate rejects truncated XML even when document/body opening tags exist", async () => {
    const bytes = await makeZipBytes("word/document.xml", "<w:document><w:body>");
    const r = await verifyCandidateExportFidelity(bytes, {}, { tableIds: [] });
    assert.equal(r.safe, false, "Gate must reject unclosed/truncated OOXML");
  });
  it("Task 2: candidate with valid XML but missing content has downloadable: false and blocks download", async () => {
    const validXmlMissingContent = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Only part of content</w:t></w:r></w:p></w:body></w:document>';
    const payload = await makeZipBytes("word/document.xml", validXmlMissingContent);

    const input: ExportCandidateSnapshot = {
      doc: {
        orgHeader1: "", orgHeader2: "", nationalHeader1: "", nationalHeader2: "",
        locationAndDate: "", documentType: "KẾ HOẠCH", referenceNumber: "",
        subject: "Tiêu đề", bodyHtml: "<p>Đoạn văn quan trọng bị mất hoàn toàn trong candidate</p>", signTitle: "", signName: "", recipients: "",
      },
      standardType: "state",
      reviewBlocks: [],
      structuredImport: null,
    };

    const manager = createExportCandidateManager(async () => payload);
    const candidate = await manager.prepare(input);
    assert.ok(candidate);
    assert.equal(candidate.safe, false, "Candidate missing content must be marked safe: false");
    assert.equal(candidate.downloadable, false, "Candidate with safe: false must have downloadable: false");

    const s = fs.readFileSync("src/App.tsx", "utf8");
    const startExport = s.indexOf("  const exportToDocx = async () => {");
    const endExport = s.indexOf("  const handleDownloadOriginalFile = async () => {", startExport);
    const exportCode = transformSync(s.slice(startExport, endExport), { loader: "ts", target: "es2022", format: "esm" }).code;

    const observed = { downloads: 0, error: "" };
    const deps = {
      candidateManager: { current: manager },
      workspaceSnapshotRef: { current: input },
      uploadedBlocks: [],
      docTypeOverride: null,
      canEnterStep: () => true,
      standardType: "state",
      downloadDocxUint8Array: () => { observed.downloads++; },
      setErrorMsg: (msg: string) => { observed.error = msg; },
    };

    const fnExport = new Function("deps", "const {" + Object.keys(deps).join(",") + "} = deps;\n" + exportCode + "\nreturn exportToDocx;")(deps);
    await fnExport();
    assert.equal(observed.downloads, 0, "Blocked candidate must not trigger download");
    assert.match(observed.error, /không tạo được tệp|không vượt qua kiểm tra toàn vẹn/, "Must report integrity reject");
  });

  it("Task 3: Out-of-order async candidate generation, invalidation on edit/source switch, and review-only filename contract", async () => {
    let resolveFirst!: (bytes: Uint8Array) => void;
    let resolveSecond!: (bytes: Uint8Array) => void;
    let callCount = 0;

    const manager = createExportCandidateManager(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise<Uint8Array>((resolve) => { resolveFirst = resolve; });
      }
      return new Promise<Uint8Array>((resolve) => { resolveSecond = resolve; });
    });

    const makeInput = (bodyHtml: string): ExportCandidateSnapshot => ({
      doc: {
        orgHeader1: "", orgHeader2: "CƠ QUAN KIỂM THỬ", nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
        locationAndDate: "Hà Nội, ngày 20 tháng 10 năm 2026", documentType: "THÔNG BÁO", referenceNumber: "Số: 01/TB",
        subject: "Trích yếu", bodyHtml, signTitle: "GIÁM ĐỐC", signName: "Nguyễn Văn A", recipients: "Lưu: VT.",
      },
      standardType: "state",
      reviewBlocks: [],
      structuredImport: null,
    });

    const inputA = makeInput("<p>Phiên bản A (cũ)</p>");
    const inputB = makeInput("<p>Phiên bản B (mới)</p>");

    const promiseA = manager.prepare(inputA);
    const promiseB = manager.prepare(inputB);

    const xmlB = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Phiên bản B (mới)</w:t></w:r></w:p></w:body></w:document>';
    const xmlA = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Phiên bản A (cũ)</w:t></w:r></w:p></w:body></w:document>';

    // B resolves BEFORE A (out-of-order async completion)
    resolveSecond(await makeZipBytes("word/document.xml", xmlB));
    const resultB = await promiseB;
    assert.ok(resultB, "Newer candidate B must resolve");
    assert.equal(manager.current, resultB, "Manager must hold candidate B");
    assert.equal(manager.isCurrent(resultB, inputB), true, "Candidate B must be current for inputB");
    assert.equal(manager.isCurrent(resultB, inputA), false, "Candidate B must not match stale inputA");

    // Now stale request A resolves late
    resolveFirst(await makeZipBytes("word/document.xml", xmlA));
    const resultA = await promiseA;
    assert.equal(resultA, null, "Late out-of-order candidate A must resolve to null");
    assert.equal(manager.current, resultB, "Late candidate A must never overwrite newer candidate B");

    // Review-only filename check ("-DOI_CHIEU_CHUA_XAC_NHAN-")
    const s = fs.readFileSync("src/App.tsx", "utf8");
    const startFn = s.indexOf("function formatDocxDownloadFilename(");
    const endFn = s.indexOf("  const handleDownloadOriginalFile = async () => {", startFn);
    const reviewCode = transformSync(s.slice(startFn, endFn), { loader: "ts", target: "es2022", format: "esm" }).code;
    const downloadedFiles: Array<{ bytes: Uint8Array; filename: string }> = [];
    const deps = {
      candidateManager: { current: manager },
      workspaceSnapshotRef: { current: inputB },
      uploadedFileName: "Thong_bao_thu_nghiem.docx",
      doc: inputB.doc,
      isCandidateEligibleForReviewDownload: (c: any) => Boolean(c?.reviewDownloadable && c?.canRenderDiagnostic),
      buildCandidateInput: (snap: any) => snap,
      canEnterStep: () => true,
      standardType: "state",
      downloadDocxUint8Array: (bytes: Uint8Array, filename: string) => { downloadedFiles.push({ bytes, filename }); },
      setErrorMsg: () => {},
      setSuccessMsg: () => {},
    };
    const fnReview = new Function("deps", "const {" + Object.keys(deps).join(",") + "} = deps;\n" + reviewCode + "\nreturn downloadCandidateForReview;")(deps);
    await fnReview();
    assert.equal(downloadedFiles.length, 1, "Review download must trigger for review-eligible candidate");
    assert.match(downloadedFiles[0].filename, /-DOI_CHIEU_CHUA_XAC_NHAN-ND30\.docx$/, "Review filename must clearly mark unverified status");
    assert.deepEqual(downloadedFiles[0].bytes, resultB.bytes, "Review download must use exact candidate bytes");

    // Invalidate on edit / source change
    manager.invalidate();
    assert.equal(manager.current, null, "invalidate() must immediately clear current candidate");
    assert.equal(manager.isCurrent(resultB, inputB), false, "Invalidated candidate is no longer current");
  });
});
