import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocalSemantics } from "../src/utils/localSemanticObservations.ts";
import { appendix, paragraph, SOURCE_SHA, tableBlock } from "./support/semantic-fixtures.ts";

test("classifies Body and separate appendices without changing source identity or order", () => {
  const body = paragraph("block-0", 0, "I. Thành phần tham dự\nNgười tham dự: synthetic person");
  const app1Block = paragraph("block-1", 1, "Phụ lục tổng hợp");
  const app2Block = paragraph("block-2", 2, "Phụ lục tổng hợp");
  const blocks = [body, app1Block, app2Block];
  const before = structuredClone(blocks);
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, partitionFingerprint: "p1",
    workingRevision: 2, blocks, bodySourceBlockIds: [body.id], appendices: [appendix("appendix-one", app1Block), appendix("appendix-two", app2Block)],
    regime: "state", documentType: "BIÊN BẢN" });
  assert.deepEqual(blocks, before);
  assert.deepEqual(result.map(item => item.unit.anchor.blockId), ["block-0", "block-0", "block-1", "block-2"]);
  assert.equal(result[0].unit.label, "section_heading");
  assert.equal(result[1].unit.label, "participants");
  assert.equal(result[2].unit.appendixId, "appendix-one");
  assert.equal(result[3].unit.appendixId, "appendix-two");
  assert.notEqual(result[2].unit.id, result[3].unit.id);
});

test("anchors every table cell by table ID, cell ID, and coordinates; merged cells require review", () => {
  const table = tableBlock("block-table", 5);
  table.tableModel!.rows[1].cells[0].vMerge = "restart";
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "p",
    workingRevision: 0, blocks: [table], regime: "state", documentType: "BIÊN BẢN" });
  assert.equal(result.length, 5);
  const cell = result.find(item => item.unit.anchor.cellId === "block-table-c2")!;
  assert.equal(cell.unit.anchor.tableId, "table-block-table");
  assert.equal(cell.unit.anchor.rowIndex, 1);
  assert.equal(cell.unit.anchor.colIndex, 0);
  assert.equal(cell.unit.needsReview, true);
  assert.equal(cell.unit.parentUnitId, result[0].unit.id);
});

test("unknown physical regions are omitted rather than assigned to Body", () => {
  const source = paragraph("block-meta", 0, "synthetic header", "metadata");
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "p",
    workingRevision: 0, blocks: [source], regime: "party", documentType: "BIÊN BẢN" });
  assert.deepEqual(result, []);
});

test("classifies a synthetic HD05 body and appendix independently", () => {
  const body = paragraph("party-body", 0, "Điều 1. Nhiệm vụ của chi bộ");
  const app = paragraph("party-app", 1, "Bảng tổng hợp kết quả");
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 6, partitionFingerprint: "hd05-p",
    workingRevision: 0, blocks: [body, app], bodySourceBlockIds: [body.id], appendices: [appendix("party-appendix", app, "Bảng tổng hợp kết quả")],
    regime: "party", documentType: "BIÊN BẢN" });
  assert.equal(result[0].unit.label, "article");
  assert.equal(result[0].unit.scope, "body");
  assert.equal(result[1].unit.label, "appendix_title");
  assert.equal(result[1].unit.appendixId, "party-appendix");
  assert.equal(result.every(item => item.sourceSha256 === SOURCE_SHA), true);
});

test("labels only the first source block as the appendix title and classifies appendix child units independently", () => {
  const title = paragraph("appendix-title", 2, "PHỤ LỤC A");
  const reference = paragraph("appendix-reference", 3, "Kèm theo Biên bản số 01/BB");
  const heading = paragraph("appendix-heading", 4, "I. Danh mục tổng hợp");
  const list = paragraph("appendix-list", 5, "1. Hạng mục thứ nhất");
  const body = paragraph("appendix-body", 6, "Nội dung giải thích cho hạng mục thứ nhất.");
  const blocks = [title, reference, heading, list, body];
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 3, partitionFingerprint: "appendix-p",
    workingRevision: 2, blocks, appendices: [{ id: "appendix-a", title: "PHỤ LỤC A", html: blocks.map(block => block.html).join(""),
      blocks, sourceBlockIds: blocks.map(block => block.id), extractionStatus: "needs_review" }], regime: "state", documentType: "BIÊN BẢN" });
  assert.deepEqual(result.map(item => item.unit.label), ["appendix_title", "appendix_reference", "appendix_heading", "list_item", "explanation"]);
  assert.ok(result.every(item => item.unit.scope === "appendix" && item.unit.appendixId === "appendix-a" && item.unit.needsReview));
  assert.deepEqual(result.map(item => item.unit.anchor.blockId), blocks.map(block => block.id));
});

test("preserves a mixed table's cell-level Body/Appendix regions and fails closed on unsupported media", () => {
  const mixed = tableBlock("mixed-table", 4, "metadata");
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "mixed-p",
    workingRevision: 2, blocks: [mixed], regime: "state", documentType: "BIÊN BẢN",
    cellRoles: [{ sourceBlockId: mixed.id, cellId: "mixed-table-c0", role: "body" },
      { sourceBlockId: mixed.id, cellId: "mixed-table-c1", role: "appendix" }] });
  assert.equal(result.find(item => item.unit.anchor.cellId === "mixed-table-c0")?.unit.scope, "body");
  const appendixCell = result.find(item => item.unit.anchor.cellId === "mixed-table-c1")!;
  assert.equal(appendixCell.unit.scope, "appendix");
  assert.equal(appendixCell.unit.needsReview, true);
  assert.equal(appendixCell.unit.appendixId, undefined);

  mixed.unsupportedFeatures = [{ code: "drawing_or_image", description: "synthetic image in table cell" }];
  const unsupported = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "mixed-p",
    workingRevision: 2, blocks: [mixed], regime: "state", documentType: "BIÊN BẢN",
    cellRoles: [{ sourceBlockId: mixed.id, cellId: "mixed-table-c0", role: "body" }] });
  assert.ok(unsupported.filter(item => item.unit.anchor.cellId).every(item => item.evidence === "unsupported_structure" && item.unit.needsReview));
});

test("subdivides Body into source roles and only applies meeting roles to an identified minutes document", () => {
  const texts = [
    "I. Nội dung chính",
    "Căn cứ Nghị định số 30/2020/NĐ-CP",
    "Thực hiện nhiệm vụ được giao",
    "Điều 1. Phạm vi áp dụng",
    "Khoản 1. Đối tượng áp dụng",
    "Điểm a) Cơ quan thực hiện",
    "- Nội dung trong danh sách",
    "Ghi chú: dữ liệu tổng hợp",
    "Đoạn văn diễn giải thông thường.",
    "Thành phần tham dự: đại biểu",
  ];
  const blocks = texts.map((text, index) => paragraph("taxonomy-" + index, index, text));
  const plain = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "taxonomy",
    workingRevision: 0, blocks, regime: "state", documentType: "QUYẾT ĐỊNH" });
  assert.deepEqual(plain.map(item => item.unit.label), [
    "section_heading", "legal_basis", "lead", "article", "clause", "point", "list_item", "note", "narrative", "narrative",
  ]);
  const minutes = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "taxonomy",
    workingRevision: 0, blocks: blocks.slice(9), regime: "state", documentType: "BIÊN BẢN" });
  assert.equal(minutes[0].unit.label, "participants");
});

test("classifies meeting minutes roles and sublabels appendix content under the correct appendix", () => {
  const meetingTexts = [
    "Thời gian, địa điểm: ngày 01/01/2026 tại phòng họp",
    "Chủ trì: người chủ trì; thư ký: người ghi biên bản",
    "Chương trình làm việc: nội dung",
    "Ý kiến thảo luận: nội dung",
    "Biểu quyết: 5/5 đồng ý",
    "Kết luận: thông qua",
    "Giao bộ phận tổng hợp thực hiện",
    "Cuộc họp kết thúc lúc 17 giờ",
  ];
  const meeting = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "meeting",
    workingRevision: 0, blocks: meetingTexts.map((text, index) => paragraph("meeting-" + index, index, text)),
    regime: "state", documentType: "BIÊN BẢN" });
  assert.deepEqual(meeting.map(item => item.unit.label), [
    "meeting_time_place", "chair_secretary", "agenda", "discussion", "vote", "conclusion", "assignment", "closing",
  ]);

  const intro = paragraph("app-intro", 0, "Phần thuyết minh của phụ lục.");
  const title = paragraph("app-title", 1, "PHỤ LỤC II");
  const heading = paragraph("app-heading", 2, "I. Danh sách tổng hợp");
  const reference = paragraph("app-reference", 3, "Kèm theo Biên bản số 01/BB");
  const list = paragraph("app-list", 4, "1. Hạng mục thứ nhất");
  const note = paragraph("app-note", 5, "Nguồn: số liệu tổng hợp");
  const appendixBlocks = [intro, title, heading, reference, list, note];
  const appendixResult = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 2, partitionFingerprint: "appendix-taxonomy",
    workingRevision: 1, blocks: appendixBlocks, appendices: [{
      id: "appendix-two", title: "PHỤ LỤC II", html: "", blocks: appendixBlocks,
      sourceBlockIds: appendixBlocks.map(block => block.id), extractionStatus: "needs_review",
    }], regime: "state", documentType: "BIÊN BẢN" });
  assert.deepEqual(appendixResult.map(item => item.unit.label), [
    "explanation", "appendix_title", "appendix_heading", "appendix_reference", "list_item", "source_note",
  ]);
  assert.ok(appendixResult.every(item => item.unit.appendixId === "appendix-two"));
});

test("uses distinct semantic labels for table header and data cells", () => {
  const table = tableBlock("semantic-table", 0);
  const result = classifyLocalSemantics({ sourceSha256: SOURCE_SHA, sourceGeneration: 1, partitionFingerprint: "table-taxonomy",
    workingRevision: 0, blocks: [table], regime: "state", documentType: "CÔNG VĂN" });
  assert.deepEqual(result.filter(item => item.unit.anchor.cellId).map(item => item.unit.label),
    ["table_header", "table_header", "table_data", "table_data"]);
});
