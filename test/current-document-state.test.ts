import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transformSync } from "esbuild";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";

import type { SourceBlock, ReviewProposal, DocumentState } from "../src/shared/schemas/document.schema.ts";
import { applySingleProposal, type CanonicalWorkflowState } from "../src/utils/proposalState.ts";
import { reconstructFromReviewedBlocks } from "../src/utils/importReview.ts";

const createBlock = (id: string, text = "SAME", html = `<p>${text}</p>`): SourceBlock => ({
  id,
  index: 0,
  kind: "paragraph",
  role: "body",
  text,
  html,
});

const createState = (blocks: SourceBlock[], html: string): CanonicalWorkflowState => ({
  reviewBlocks: blocks,
  structuredImport: null,
  doc: {
    orgHeader1: "",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 17 tháng 10 năm 2026",
    documentType: "THÔNG BÁO",
    referenceNumber: "Số: 10/TB-HTMB",
    subject: "Thử nghiệm tính toàn vẹn trạng thái",
    bodyHtml: html,
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
    recipients: "Như trên;",
  },
  acceptedProposalIds: new Set(),
});

describe("Task 2: Document State Identity & Canonical Alignment", () => {
  it("B01: Reject a stale proposal after the target paragraph was manually replaced in HTML", () => {
    const proposal: ReviewProposal = {
      id: "p1",
      type: "spelling",
      target: "body",
      targetBlockId: "b",
      original: "SAME",
      suggested: "EDIT",
      reason: "Synthetic verification",
      confidence: "high",
    };
    const s = createState([createBlock("b")], "<p>MANUAL_USER_EDIT</p>");
    const r = applySingleProposal(proposal, s);

    assert.equal(r.success, false, "Proposal must be rejected when target block was edited");
    assert.equal(r.nextState?.doc.bodyHtml || s.doc.bodyHtml, "<p>MANUAL_USER_EDIT</p>");
  });

  it("B02: Inserting a paragraph must not redirect a proposal to the first duplicate", () => {
    const proposal: ReviewProposal = {
      id: "p2",
      type: "spelling",
      target: "body",
      targetBlockId: "b",
      original: "SAME",
      suggested: "EDIT",
      reason: "Synthetic verification",
      confidence: "high",
    };
    const s = createState([createBlock("b0"), createBlock("b")], "<p>ADDED</p><p>SAME</p><p>SAME</p>");
    const r = applySingleProposal(proposal, s);

    assert.equal(r.success, true);
    assert.equal(r.nextState?.doc.bodyHtml, "<p>ADDED</p><p>SAME</p><p>EDIT</p>");
  });

  it("B03: Replace displayed text without editing an HTML attribute with the same value", () => {
    const proposal: ReviewProposal = {
      id: "p3",
      type: "spelling",
      target: "body",
      targetBlockId: "b",
      original: "SAME",
      suggested: "EDIT",
      reason: "Synthetic verification",
      confidence: "high",
    };
    const html = '<p title="SAME">SAME</p>';
    const s = createState([createBlock("b", "SAME", html)], html);
    const r = applySingleProposal(proposal, s);

    assert.equal(r.success, true);
    assert.equal(r.nextState?.doc.bodyHtml, '<p title="SAME">EDIT</p>');
  });

  it("C07: Text proposal preserves literal angle-bracket text without creating HTML markup", () => {
    const block = createBlock("b", "SAME", "<p>SAME</p>");
    const proposal: ReviewProposal = {
      id: "p4",
      type: "spelling",
      target: "body",
      targetBlockId: "b",
      original: "SAME",
      suggested: "<x>EDIT</x>",
      reason: "Synthetic literal angle brackets",
      confidence: "high",
    };
    const s = createState([block], block.html || "");
    const r = applySingleProposal(proposal, s);

    assert.equal(r.success, true);
    assert.equal(r.nextState?.doc.bodyHtml, "<p>&lt;x&gt;EDIT&lt;/x&gt;</p>");
  });

  it("C09: Editor schema preserves paragraph block IDs and header-cell IDs", () => {
    const source = fs.readFileSync("src/components/ND30Editor.tsx", "utf8");
    const from = source.indexOf("const PreserveTable =");
    const to = source.indexOf("export const ND30Editor:", from);
    assert.ok(from >= 0 && to > from, "PreserveTable section must exist in ND30Editor.tsx");

    const code = transformSync(source.slice(from, to), { loader: "ts", format: "esm" }).code;
    const factory = new Function("Table", "TableCell", code + "; return {PreserveTable,PreserveTableCell};");
    const { PreserveTable, PreserveTableCell } = factory(Table, TableCell);

    const schema = getSchema([
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "justify",
      }),
      PreserveTable.configure({ resizable: true }),
      TableRow,
      TableHeader,
      PreserveTableCell,
    ]);

    assert.equal("data-block-id" in (schema.nodes.paragraph.spec.attrs || {}), true);
    assert.equal("data-cell-id" in (schema.nodes.tableHeader.spec.attrs || {}), true);
  });

  it("C10: Restoring a version also restores its working blocks or invalidates stale blocks", () => {
    const source = fs.readFileSync("src/App.tsx", "utf8");
    const from = source.indexOf("  const restoreVersion =");
    const to = source.indexOf("  const applyQuickFix = ", from);
    assert.ok(from >= 0 && to > from, "restoreVersion section must exist in App.tsx");

    const code = transformSync(source.slice(from, to), { loader: "ts", format: "esm" }).code;
    const s: { doc: any; blocks: any[] } = {
      doc: { bodyHtml: "<p>NEW</p>" },
      blocks: [{ id: "b", html: "<p>NEW</p>" }],
    };
    const deps = {
      setDoc: (d: any) => { s.doc = d; },
      setStandardType: () => {},
      setSuccessMsg: () => {},
      setReviewBlocks: (b: any[]) => { s.blocks = b; },
    };
    const fn = new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;\n${code}\nreturn restoreVersion;`)(deps);

    fn({
      data: { bodyHtml: "<p>OLD</p>" },
      standardType: "state",
      title: "Synthetic Version",
      timestamp: "2026-10-17",
    });

    assert.ok(
      s.blocks.length === 0 || s.blocks.map(b => b.html).join("") === s.doc.bodyHtml,
      "Restoring version must invalidate or synchronize review blocks"
    );
  });

  it("D01: Proposal and reconstruction retain manual text in the same block", () => {
    const b = createBlock("b", "SAME");
    const r = applySingleProposal({
      id: "p",
      type: "spelling",
      target: "body",
      targetBlockId: "b",
      original: "SAME",
      suggested: "EDIT",
      reason: "Synthetic",
      confidence: "high",
    }, {
      reviewBlocks: [b],
      structuredImport: null,
      doc: { ...createState([], "").doc, bodyHtml: "<p>USER SAME</p>" },
      acceptedProposalIds: new Set(),
    });
    assert.equal(r.success, true);
    assert.ok(r.nextState);
    const rebuilt = reconstructFromReviewedBlocks(r.nextState!.reviewBlocks, "state");
    assert.deepStrictEqual(
      { current: r.nextState!.doc.bodyHtml, rebuilt: rebuilt.bodyHtml },
      { current: "<p>USER EDIT</p>", rebuilt: "<p>USER EDIT</p>" }
    );
  });

  it("D02: A moved block cannot redirect an old proposal to a different block", () => {
    const blocks = [createBlock("first", "FIRST SAME"), createBlock("second", "SECOND SAME")];
    const before = "<p>SECOND SAME</p><p>FIRST SAME</p>";
    const r = applySingleProposal({
      id: "p",
      type: "spelling",
      target: "body",
      targetBlockId: "second",
      original: "SAME",
      suggested: "EDIT",
      reason: "Synthetic",
      confidence: "high",
    }, {
      reviewBlocks: blocks,
      structuredImport: null,
      doc: { ...createState([], "").doc, bodyHtml: before },
      acceptedProposalIds: new Set(),
    });
    const actual = r.success ? r.nextState?.doc.bodyHtml : "REJECTED";
    assert.equal(actual, "<p>SECOND EDIT</p><p>FIRST SAME</p>");
  });

  it("D03: Restoring a doc cannot expose blocks from the newer version through App fallback", () => {
    const source = fs.readFileSync("src/App.tsx", "utf8");
    const from = source.indexOf("  const restoreVersion =");
    const to = source.indexOf("  const applyQuickFix = ", from);
    assert.ok(from >= 0 && to > from);
    const code = transformSync(source.slice(from, to), { loader: "ts", format: "esm" }).code;
    const state: { doc: any; blocks: SourceBlock[] } = { doc: { bodyHtml: "<p>NEW</p>" }, blocks: [createBlock("new", "NEW")] };
    const imported = { blocks: [createBlock("new", "NEW")] };
    const deps = {
      setDoc: (d: any) => { state.doc = d; },
      setStandardType: () => {},
      setSuccessMsg: () => {},
      setReviewBlocks: (b: SourceBlock[]) => { state.blocks = b; },
    };
    new Function("deps", `const {${Object.keys(deps).join(",")}} = deps;\n${code}\nreturn restoreVersion;`)(deps)({
      data: { bodyHtml: "<p>OLD</p>" },
      standardType: "state",
      title: "Synthetic",
      timestamp: "2026-10-17",
    });
    assert.ok(source.includes("const blocksToUse = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);"));
    const effective = state.blocks.length > 0 ? state.blocks : (imported?.blocks || []);
    assert.deepStrictEqual(
      { restored: state.doc.bodyHtml, reconstructed: reconstructFromReviewedBlocks(effective, "state").bodyHtml },
      { restored: "<p>OLD</p>", reconstructed: "<p>OLD</p>" }
    );
  });
});
