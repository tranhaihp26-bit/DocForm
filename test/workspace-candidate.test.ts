import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { DocumentState, AppendixDocument, SourceBlock } from "../src/shared/schemas/document.schema.ts";
import { tableModelToHtmlView, type TableModel } from "../src/shared/tableModel.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../src/canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../src/canonical/hd05/companyHeaderHD05.ts";
import { composeDocumentFormatData } from "../src/utils/documentComposer.ts";
import { createExportCandidateManager, exportCandidateKey, prepareExportCandidate, type ExportCandidateSnapshot } from "../src/utils/exportCandidate.ts";
import { generateND30DocxUint8Array, candidateSectionName } from "../src/utils/docxExport.ts";
import { verifyCandidateContentFidelity } from "../src/utils/candidateContentFidelity.ts";
import { createWorkspaceSnapshot, sourceManifestFingerprint } from "../src/utils/workspaceState.ts";
import { approveWorkspacePartition, transactWorkspace } from "../src/utils/workspaceTransactions.ts";

const doc = (): DocumentState => ({ headerProfile: "generic", orgHeader1: "CƠ QUAN CẤP TRÊN", orgHeader2: "CƠ QUAN THỬ NGHIỆM", nationalHeader1: "", nationalHeader2: "",
  referenceNumber: "Số: 01/KH-TN", locationAndDate: "Hà Nội, ngày 20 tháng 10 năm 2026", documentType: "KẾ HOẠCH", subject: "Thử nghiệm nội dung",
  bodyHtml: "<p>Đoạn đầu giữ khoảng trắng giữa các từ.</p><p>Đoạn thứ hai.</p>", signTitle: "GIÁM ĐỐC", signName: "Người ký tổng hợp", recipients: "Như trên;\nLưu: VT.", appendices: [] });
const appendix = (id: string, text: string): AppendixDocument => ({ id, title: `Phụ lục ${id}`, html: `<p>${text}</p>`, blocks: [], sourceBlockIds: [], extractionStatus: "confirmed" });
const snapshot = (): ExportCandidateSnapshot => ({ doc: doc(), standardType: "state", reviewBlocks: [], structuredImport: null });
const noneBorders = Object.fromEntries(["top", "bottom", "left", "right", "insideH", "insideV"].map(side => [side, { style: "none", size: 0, color: "auto" }]));
const cellBorders = Object.fromEntries(["top", "bottom", "left", "right"].map(side => [side, { style: "none", size: 0, color: "auto" }]));
const model: TableModel = { tableId: "block-table", rowsCount: 1, columnsCount: 1, gridColumnsTwips: [4000], tableWidthTwips: 4000, widthType: "dxa", alignment: "left", hasBorders: false, borders: noneBorders,
  rows: [{ rowIndex: 0, isHeader: false, cantSplit: true, cells: [{ cellId: "cell-0", rowIndex: 0, colIndex: 0, gridColumn: 0, gridSpan: 1, borders: cellBorders, text: "0007 A B", paragraphs: [{ text: "0007 A B", runs: [{ text: "0007 A B" }] }] }] }] };
const tableBlock = (role: SourceBlock["role"]): SourceBlock => ({ id: "block-table", index: 0, kind: "table", text: "0007 A B", role, tableModel: model, html: tableModelToHtmlView(model), rawXml: "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>0007 A B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>", unsupportedFeatures: [] });
function approvedTable(role: SourceBlock["role"] = "body") {
  const block = tableBlock(role), d = doc(); d.bodyHtml = role === "body" ? block.html! : "<p>Nội dung.</p>";
  const blocks: SourceBlock[] = role === "body" ? [block] : [block, { id: "body-source", index: 1, kind: "paragraph", text: "Nội dung.", html: d.bodyHtml, role: "body" }];
  const pending = createWorkspaceSnapshot({ doc: d, standardType: "state", reviewBlocks: blocks, structuredImport: null }, { blobHash: "synthetic-sha", generation: 1 });
  const result = approveWorkspacePartition(pending); assert.ok(result.ok); return result.snapshot;
}

describe("Workspace A: real composer and immutable candidate", () => {
  it("both regimes and generic/company profiles use the real product composer", async () => {
    for (const standardType of ["state", "party"] as const) for (const company of [false, true]) {
      const s = snapshot(); s.standardType = standardType;
      if (company) s.doc.headerProfile = standardType === "party" ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID;
      if (standardType === "party") s.doc.referenceNumber = "Số 01-KH/TN";
      const composed = composeDocumentFormatData(s), candidate = await prepareExportCandidate(s);
      assert.deepEqual(candidate.formatData, composed);
      assert.equal(candidate.safe, true, JSON.stringify({ blockers: candidate.blockers, content: candidate.contentFidelity, table: candidate.tableFidelity, safety: candidate.exportSafety }));
    }
  });
  it("one generation binds bytes, SHA, evidence and gates; returned bytes cannot corrupt it", async () => {
    let calls = 0; const c = await prepareExportCandidate(snapshot(), async data => { calls++; return generateND30DocxUint8Array(data); });
    assert.equal(calls, 1); assert.equal(c.sha256, createHash("sha256").update(c.bytes).digest("hex"));
    const changed = c.bytes; changed[0] ^= 0xff;
    assert.equal(c.sha256, createHash("sha256").update(c.bytes).digest("hex"));
    assert.equal(c.tableFidelity.candidateXml, c.documentXml); assert.equal(c.contentFidelity.safe, true);
    assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.formatData));
  });
  it("checks ordered body and appendix identity/title/content directly in candidate OOXML", async () => {
    const s = snapshot(); s.doc.appendices = [appendix("a", "Nội dung giống nhau"), appendix("b", "Nội dung giống nhau")];
    const c = await prepareExportCandidate(s); assert.equal(c.safe, true, JSON.stringify(c.contentFidelity));
    const f = c.formatData, xml = c.documentXml;
    const first = "Đoạn đầu giữ khoảng trắng giữa các từ.", second = "Đoạn thứ hai.";
    for (const broken of [xml.replace(first, ""), xml.replace(first, first + first), xml.replace(first, "TOKEN_SWAP").replace(second, first).replace("TOKEN_SWAP", second), xml.replace("khoảng trắng", "khoảngtrắng"), xml.replace("PHỤ LỤC A", "PHỤ LỤC B")]) {
      assert.equal(verifyCandidateContentFidelity(broken, f).safe, false);
    }
    const appendixSlice = (id: string) => {
      const a = xml.indexOf(`w:name="${candidateSectionName(`appendix:${id}:start`)}"`), b = xml.indexOf(`w:name="${candidateSectionName(`appendix:${id}:end`)}"`);
      const begin = xml.lastIndexOf("<w:p>", a), end = xml.indexOf("</w:p>", b) + 6;
      assert.ok(a >= 0 && b > a && begin >= 0); return xml.slice(begin, end);
    };
    const appA = appendixSlice("a"), appB = appendixSlice("b");
    const missingActual = xml.replace(appA, ""), duplicateActual = xml.replace(appA, appA + appA);
    const reorderedActual = xml.replace(appA, "APP_SWAP_SENTINEL").replace(appB, appA).replace("APP_SWAP_SENTINEL", appB);
    for (const alteredXml of [missingActual, duplicateActual, reorderedActual]) assert.equal(verifyCandidateContentFidelity(alteredXml, f).safe, false);
    const reordered = structuredClone(f); reordered.appendices!.reverse();
    assert.equal(verifyCandidateContentFidelity(xml, reordered).safe, false);
    const missing = structuredClone(f); missing.appendices!.pop();
    assert.equal(verifyCandidateContentFidelity(xml, missing).safe, false);
    assert.equal(verifyCandidateContentFidelity(xml.replace("Người ký tổng hợp", "Người ký khác"), f).safe, false);
    assert.equal(verifyCandidateContentFidelity(xml.replace("Thử nghiệm nội dung", ""), f).safe, false);
  });
  it("a broken candidate is unsafe even when generated from valid working state", async () => {
    const s = snapshot(); const original = await generateND30DocxUint8Array(composeDocumentFormatData(s));
    const zip = await JSZip.loadAsync(original); zip.file("word/document.xml", (await zip.file("word/document.xml")!.async("string")).replace("Đoạn thứ hai.", ""));
    const candidate = await prepareExportCandidate(s, async () => zip.generateAsync({ type: "uint8array" }));
    assert.equal(candidate.tableFidelity.safe, true); assert.equal(candidate.contentFidelity.safe, false); assert.equal(candidate.safe, false);
  });
  it("unsupported source models and media fail closed; bookmark IDs stay within Word limits", async () => {
    const source = snapshot(); source.reviewBlocks = [{ id: "no-model", index: 0, kind: "table", role: "body", text: "Bảng chưa có model" }];
    assert.ok((await prepareExportCandidate(source)).blockers.includes("unsupported_source_table_model:no-model"));
    const image = snapshot(); image.doc.bodyHtml += '<p><img src="data:image/png;base64,SYNTHETIC" /></p>';
    assert.ok((await prepareExportCandidate(image)).blockers.includes("unsupported_working_media"));
    const drawing = snapshot(); drawing.reviewBlocks = [{ id: "drawing", index: 0, kind: "paragraph", role: "body", text: "Hình vẽ", rawXml: "<w:p><w:drawing/></w:p>" }];
    assert.ok((await prepareExportCandidate(drawing)).blockers.includes("unsupported_source_ooxml:drawing"));
    for (const id of ["body:start", "appendix:18f2c22d-0000-4444-aaaa-eeeeeeeeeeee:start", "phụ lục rất dài".repeat(40)]) {
      assert.ok(candidateSectionName(id).length <= 40); assert.match(candidateSectionName(id), /^[A-Za-z][A-Za-z0-9_]*$/);
    }
  });
  it("legacy imported metadata cannot bypass workspace approval", async () => {
    for (const sourceType of ["docx", "txt", "paste"] as const) {
      const s = snapshot(); s.doc.importMetadata = { sourceType };
      assert.ok((await prepareExportCandidate(s)).blockers.includes("workspace_approval_required"));
    }
    const s = snapshot(); s.uploadedBlocks = [{ id: "source", kind: "paragraph", index: 0, text: "Nguồn", role: "body" }];
    assert.ok((await prepareExportCandidate(s)).blockers.includes("workspace_approval_required"));
  });
  it("approved physical table moves determine expected order while injected swaps fail", async () => {
    const first = tableBlock("body"), second = structuredClone(first); second.id = "block-second"; second.index = 1;
    second.tableModel!.tableId = "table-second"; second.tableModel!.rows[0].cells[0].cellId = "cell-second";
    second.tableModel!.rows[0].cells[0].text = "0008 C D"; second.tableModel!.rows[0].cells[0].paragraphs = [{ text: "0008 C D", runs: [{ text: "0008 C D" }] }];
    second.text = "0008 C D"; second.html = tableModelToHtmlView(second.tableModel!);
    const d = doc(); d.bodyHtml = first.html! + second.html!;
    const pending = createWorkspaceSnapshot({ doc: d, standardType: "state", reviewBlocks: [first, second], structuredImport: null }, { blobHash: "two-tables-sha", generation: 1 });
    const approved = approveWorkspacePartition(pending); assert.ok(approved.ok);
    const originalSource = JSON.stringify(approved.snapshot.workspace.source);
    const moved = transactWorkspace(approved.snapshot, 0, { type: "moveTable", tableId: first.tableModel!.tableId }); assert.ok(moved.ok);
    assert.equal(JSON.stringify(moved.snapshot.workspace.source), originalSource);
    const candidate = await prepareExportCandidate(moved.snapshot);
    assert.equal(candidate.safe, true, JSON.stringify({ blockers: candidate.blockers, content: candidate.contentFidelity, table: candidate.tableFidelity.diffs }));
    const actualContentIds = candidate.tableFidelity.tableDecisions!.filter(t => t.region === "body").map(t => t.tableId);
    assert.equal(actualContentIds.filter(id => id === "table-second").length, 1, "block ID alias must not duplicate the physical inventory");
    const broken = await prepareExportCandidate(moved.snapshot, async data => {
      const z = await JSZip.loadAsync(await generateND30DocxUint8Array(data)); let xml = await z.file("word/document.xml")!.async("string");
      const allTables = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)!;
      const a = allTables.find(t => t.includes('w:val="block-table"'))!, b = allTables.find(t => t.includes('w:val="table-second"'))!;
      assert.ok(a && b); xml = xml.replace(a, "TABLE_SWAP_SENTINEL").replace(b, a).replace("TABLE_SWAP_SENTINEL", b);
      z.file("word/document.xml", xml); return z.generateAsync({ type: "uint8array" });
    });
    assert.equal(broken.safe, false); assert.ok(broken.tableFidelity.violations.some(v => v.code === "table_order_mismatch"));
    const edited = transactWorkspace(moved.snapshot, 1, { type: "editCell", tableId: "table-second", cellId: "cell-second", text: "0008 E F" }); assert.ok(edited.ok);
    const editedCandidate = await prepareExportCandidate(edited.snapshot); assert.equal(editedCandidate.safe, true, JSON.stringify({ blockers: editedCandidate.blockers, table: editedCandidate.tableFidelity.diffs }));
    assert.deepEqual(editedCandidate.formatData.importedTables!["block-second"], editedCandidate.formatData.importedTables!["table-second"]);
  });
  it("appendix moves with source tables preserve source order and export approved working order", async () => {
    const a = tableBlock("appendix"), b = structuredClone(a); b.id = "appendix-source-b"; b.index = 1; b.tableModel!.tableId = "table-b";
    b.tableModel!.rows[0].cells[0].cellId = "cell-b"; b.tableModel!.rows[0].cells[0].text = "Dữ liệu B";
    b.tableModel!.rows[0].cells[0].paragraphs = [{ text: "Dữ liệu B", runs: [{ text: "Dữ liệu B" }] }]; b.html = tableModelToHtmlView(b.tableModel!);
    const appA = appendix("app-a", ""), appB = appendix("app-b", "");
    for (const [app, block] of [[appA, a], [appB, b]] as const) { app.html = block.html!; app.blocks = [block]; app.sourceBlockIds = [block.id]; }
    const d = doc(); d.appendices = [appA, appB];
    const initial = createWorkspaceSnapshot({ doc: d, standardType: "state", reviewBlocks: [a, b], structuredImport: null }, { blobHash: "appendix-move-sha", generation: 1 });
    const approved = approveWorkspacePartition(initial); assert.ok(approved.ok);
    const sourceBefore = JSON.stringify(approved.snapshot.workspace.source);
    const moved = transactWorkspace(approved.snapshot, 0, { type: "moveAppendix", id: "app-b", index: 0 }); assert.ok(moved.ok);
    assert.equal(JSON.stringify(moved.snapshot.workspace.source), sourceBefore);
    const candidate = await prepareExportCandidate(moved.snapshot);
    assert.equal(candidate.safe, true, JSON.stringify({ blockers: candidate.blockers, table: candidate.tableFidelity.diffs, content: candidate.contentFidelity }));
  });
  it("a new explicit table transaction composes its model and passes all candidate gates", async () => {
    const pending = createWorkspaceSnapshot({ doc: doc(), standardType: "state", reviewBlocks: [], structuredImport: null });
    const added = transactWorkspace(pending, 0, { type: "addTable", model: structuredClone(model) }); assert.ok(added.ok);
    const c = await prepareExportCandidate(added.snapshot);
    assert.equal(c.safe, true, JSON.stringify({ blockers: c.blockers, table: c.tableFidelity.diffs, content: c.contentFidelity, safety: c.exportSafety }));
    assert.ok(c.formatData.importedTables![model.tableId]); assert.equal(added.snapshot.workspace.source, null);
  });
  it("cache key covers every snapshot input and approval; edits are not reconstructed", () => {
    const s = approvedTable(); const key = exportCandidateKey(s);
    const changes: Array<(value: typeof s) => void> = [x => { x.doc.subject += "!"; }, x => { x.reviewBlocks[0].role = "signature"; }, x => { x.workspace.partition.approval!.token += "!"; }, x => { x.workspace.overrides.choice = true; }, x => { x.workspace.source!.blocks[0].tableModel!.rows[0].cells[0].text += "!"; }, x => { x.workspace.workingRevision++; }];
    for (const change of changes) { const altered = structuredClone(s); change(altered); assert.notEqual(exportCandidateKey(altered), key); }
    const edited = structuredClone(s); edited.doc.bodyHtml = "<p>Đã sửa từ bản soạn.</p>";
    assert.equal(composeDocumentFormatData(edited).bodyHtml, edited.doc.bodyHtml);
  });
  it("late results and invalidation cannot replace the newest candidate", async () => {
    const releases: Array<() => void> = []; let calls = 0;
    const manager = createExportCandidateManager(async data => { calls++; await new Promise<void>(resolve => releases.push(resolve)); return generateND30DocxUint8Array(data); });
    const a = snapshot(), b = snapshot(); b.doc.subject = "Bản mới";
    const old = manager.prepare(a), fresh = manager.prepare(b); const same = manager.prepare(b);
    assert.equal(same, fresh); assert.equal(calls, 2);
    releases[1](); const winner = await fresh; assert.ok(winner); releases[0](); assert.equal(await old, null);
    assert.equal(manager.current, winner); assert.equal(manager.isCurrent(winner!, b), true);
    manager.invalidate(); assert.equal(manager.current, null); assert.equal(manager.isCurrent(winner!, b), false);
  });
  it("unrepresented metadata, recipients, mixed roles and manifest obligations fail closed", async () => {
    for (const role of ["header", "signature"] as const) {
      const s = approvedTable(role);
      const c = await prepareExportCandidate(s); assert.equal(c.safe, false);
      assert.ok(c.blockers.some(b => b.startsWith("unsupported_source_table_role:")));
    }
    const recipients = await prepareExportCandidate(approvedTable("recipients"));
    assert.equal(recipients.safe, false); assert.ok(recipients.blockers.some(b => b.startsWith("unsupported_source_table_role:")));
    const obligated = structuredClone(approvedTable("header"));
    obligated.workspace.source!.fidelityManifest = { sourceKind: "uploaded_docx", sourceBlockIds: ["block-table", "body-source"], tableIds: ["block-table"], unsupportedFeatures: [] };
    obligated.workspace.source!.fingerprint = sourceManifestFingerprint(obligated.workspace.source!);
    const obligatedCandidate = await prepareExportCandidate(obligated);
    assert.equal(obligatedCandidate.safe, false);
    assert.ok(obligatedCandidate.blockers.some(b => b.startsWith("unsupported_source_table_role:")));
    const s = approvedTable(); const mixed = structuredClone(s); mixed.workspace.partition.cells = [{ sourceBlockId: "block-table", cellId: "cell-0", role: "recipients" }];
    const c = await prepareExportCandidate(mixed); assert.equal(c.safe, false); assert.ok(c.blockers.some(b => b.startsWith("unsupported_source_table_role:")));
  });
  it("confirmed table and appendix deletion changes expected output without mutating source inventory", async () => {
    const s = approvedTable(); const removed = transactWorkspace(s, s.workspace.workingRevision, { type: "removeTable", tableId: "block-table", confirmed: true });
    assert.ok(removed.ok);
    assert.equal(removed.snapshot.workspace.source!.blocks.length, 1);
    const c = await prepareExportCandidate(removed.snapshot); assert.equal(c.safe, true, JSON.stringify({ blockers: c.blockers, content: c.contentFidelity, table: c.tableFidelity }));
    const block = tableBlock("appendix"), d = doc(); const app = appendix("source-app", ""); app.html = block.html!; app.blocks = [block]; app.sourceBlockIds = [block.id]; d.appendices = [app];
    const pending = createWorkspaceSnapshot({ doc: d, standardType: "state", reviewBlocks: [block], structuredImport: null }, { blobHash: "source-app-sha", generation: 1 });
    const approved = approveWorkspacePartition(pending); assert.ok(approved.ok);
    const deleted = transactWorkspace(approved.snapshot, 0, { type: "deleteAppendix", id: app.id, confirmed: true });
    assert.ok(deleted.ok);
    const result = await prepareExportCandidate(deleted.snapshot); assert.equal(result.safe, true, JSON.stringify({ blockers: result.blockers, content: result.contentFidelity, table: result.tableFidelity }));
    assert.equal(deleted.snapshot.workspace.source!.blocks.length, 1);
  });
  it("legitimate source table is checked by cell text; accidental table loss fails", async () => {
    const s = approvedTable(); const c = await prepareExportCandidate(s); assert.equal(c.safe, true, JSON.stringify({ blockers: c.blockers, table: c.tableFidelity.diffs, content: c.contentFidelity }));
    const broken = await prepareExportCandidate(s, async data => {
      const z = await JSZip.loadAsync(await generateND30DocxUint8Array(data));
      z.file("word/document.xml", (await z.file("word/document.xml")!.async("string")).replace("0007 A B", "0007 AB"));
      return z.generateAsync({ type: "uint8array" });
    });
    assert.equal(broken.safe, false); assert.equal(broken.contentFidelity.safe, false);
    const missing = structuredClone(s); missing.doc.bodyHtml = "<p>Bảng mất ngoài ledger.</p>";
    assert.equal((await prepareExportCandidate(missing)).safe, false);
  });
});
