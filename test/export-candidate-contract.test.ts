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
});
