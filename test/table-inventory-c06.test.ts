import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractTableModelFromXml } from "../src/server/blockExtractor.ts";
import { compareTableFidelity, verifyCandidateExportFidelity } from "../src/utils/tableRoundtrip.ts";

const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tableXml(
  tableId: string | undefined,
  rows: string[][],
  options: { borderless?: boolean } = {},
): string {
  const columns = Math.max(1, ...rows.map(row => row.length));
  const caption = tableId ? `<w:tblCaption w:val="${tableId}"/>` : "";
  const borders = options.borderless
    ? `<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>`
    : `<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>`;
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="3000"/>`).join("");
  const rowsXml = rows.map(row => `<w:tr>${row.map(text =>
    `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc>`
  ).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr>${caption}${borders}<w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowsXml}</w:tbl>`;
}

function sectionBreakXml(): string {
  return `<w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:pPr></w:p>`;
}

function documentXml(children: string): string {
  return `<w:document xmlns:w="${ns}"><w:body>${children}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;
}

async function candidateBytes(xml: string): Promise<Uint8Array> {
  return new JSZip().file("word/document.xml", xml).generateAsync({ type: "uint8array" });
}

describe("DF-C06 table inventory and locked-region contract", () => {
  it("keeps system header/signature roles locked while matching edited content by source ID across sections", async () => {
    const header = tableXml("system_header_layout_table", [["CƠ QUAN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"]]);
    const originalContent = tableXml("content-plan-01", [["STT", "Nội dung"], ["1", "Cũ"]]);
    const currentContent = tableXml("content-plan-01", [["STT", "Nội dung"], ["1", "Đã sửa nội dung"]]);
    const signature = tableXml("system_signature_layout_table", [["Nơi nhận:", "GIÁM ĐỐC"], ["- Lưu: VT", "Nguyễn An"]], { borderless: true });
    const before = documentXml(`${header}${originalContent}${sectionBreakXml()}${signature}`);
    const after = documentXml(`${header}${currentContent}${sectionBreakXml()}${signature}`);
    const beforeTables = Array.from(before.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/gu), match => match[0]);
    const afterTables = Array.from(after.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/gu), match => match[0]);

    assert.equal(beforeTables[0], afterTables[0], "header layout must remain unchanged in the fixture");
    assert.notEqual(beforeTables[1], afterTables[1], "the content table is the only changed table");
    assert.equal(beforeTables[2], afterTables[2], "signature distribution must remain unchanged in the fixture");

    const editedModel = extractTableModelFromXml(currentContent, "content-plan-01");
    const result = await verifyCandidateExportFidelity(await candidateBytes(after), {
      "content-block-01": editedModel,
    }, {
      sourceKind: "system_template",
      sourceBlockIds: ["header", "content-block-01", "signature"],
      tableIds: ["content-block-01"],
      unsupportedFeatures: [],
    });

    assert.equal(result.safe, true, result.summaryVi);
    assert.deepEqual(result.tableDecisions?.map(decision => [decision.role, decision.lineage]), [
      ["header_layout", "system_table_id"],
      ["signature_distribution", "system_table_id"],
      ["content_table", "source_table_id"],
    ]);
  });

  it("does not let header/signature text or table position hide unprovenanced DOCX tables", async () => {
    const idlessHeader = tableXml(undefined, [["ĐƠN VỊ", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"]]);
    const idlessSignature = tableXml(undefined, [["Nơi nhận:", "GIÁM ĐỐC"], ["- Lưu: VT", "Nguyễn An"]], { borderless: true });
    const result = await verifyCandidateExportFidelity(await candidateBytes(documentXml(`${idlessHeader}${idlessSignature}`)), {}, {
      sourceKind: "uploaded_docx",
      sourceBlockIds: ["header", "signature"],
      tableIds: [],
      unsupportedFeatures: [],
    });

    assert.equal(result.safe, false, "an unknown table must require source review in an imported DOCX");
    assert.deepEqual(result.tableDecisions?.map(decision => [decision.role, decision.decision]), [
      ["unknown", "NEEDS_REVIEW"],
      ["unknown", "NEEDS_REVIEW"],
    ]);
    assert.ok(result.violations.some(violation => violation.code === "unexplained_new_table"));
  });

  it("marks nested source tables as unknown and blocks transformed export", async () => {
    const nested = `<w:tbl><w:tblPr><w:tblCaption w:val="nested-content"/><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Outer</w:t></w:r></w:p>${tableXml(undefined, [["Nested"]])}</w:tc></w:tr></w:tbl>`;
    const sourceModel = extractTableModelFromXml(nested, "nested-content");
    const result = await verifyCandidateExportFidelity(await candidateBytes(documentXml(nested)), {
      [sourceModel.tableId]: sourceModel,
    }, {
      sourceKind: "uploaded_docx",
      sourceBlockIds: ["nested-content"],
      tableIds: ["nested-content"],
      unsupportedFeatures: [{
        code: "nested_table",
        tableId: "nested-content",
        blockId: "nested-content",
        description: "Nested table requires source comparison",
      }],
    });

    assert.equal(result.safe, false);
    assert.equal(result.tableDecisions?.[0]?.role, "unknown");
    assert.equal(result.tableDecisions?.[0]?.decision, "NEEDS_REVIEW");
    assert.ok(result.violations.some(violation => violation.code === "source_table_requires_review"));
  });

  it("lets source table lineage override reserved IDs and header-like cell text", async () => {
    const imported = tableXml("system_header_layout_table", [["CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", "Số liệu của bảng nghiệp vụ"]]);
    const sourceModel = extractTableModelFromXml(imported, "system_header_layout_table");
    const result = await verifyCandidateExportFidelity(await candidateBytes(documentXml(imported)), {
      [sourceModel.tableId]: sourceModel,
    }, {
      sourceKind: "uploaded_docx",
      sourceBlockIds: ["system_header_layout_table"],
      tableIds: ["system_header_layout_table"],
      unsupportedFeatures: [],
    });

    assert.equal(result.safe, true, result.summaryVi);
    assert.deepEqual(result.tableDecisions?.map(decision => [decision.role, decision.lineage]), [["content_table", "source_table_id"]]);
  });

  it("does not trust a reserved layout caption when an uploaded source has no matching lineage", async () => {
    const header = tableXml("system_header_layout_table", [["CƠ QUAN", "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"]]);
    const result = await verifyCandidateExportFidelity(await candidateBytes(documentXml(header)), {}, {
      sourceKind: "uploaded_docx",
      sourceBlockIds: [],
      tableIds: [],
      unsupportedFeatures: [],
    });

    assert.equal(result.safe, false, "a candidate caption cannot prove that the uploaded source table was inventoried");
    assert.deepEqual(result.tableDecisions?.map(decision => [decision.role, decision.lineage, decision.decision]), [
      ["unknown", "unprovenanced_candidate", "NEEDS_REVIEW"],
    ]);
    assert.ok(result.violations.some(violation => violation.code === "unexplained_new_table"));
  });

  it("rejects duplicate reserved system IDs instead of passing every layout table", async () => {
    const firstHeader = tableXml("system_header_layout_table", [["CƠ QUAN", "DÒNG 1"]]);
    const secondHeader = tableXml("system_header_layout_table", [["CƠ QUAN", "DÒNG 2"]]);
    const result = await verifyCandidateExportFidelity(await candidateBytes(documentXml(`${firstHeader}${secondHeader}`)), {}, {
      sourceKind: "system_template",
      sourceBlockIds: [],
      tableIds: [],
      unsupportedFeatures: [],
    });

    assert.equal(result.safe, false);
    assert.equal(result.violations.filter(violation => violation.code === "duplicate_table_id").length, 1);
    assert.deepEqual(result.tableDecisions?.map(decision => [decision.role, decision.lineage, decision.decision]), [
      ["unknown", "system_table_id", "NEEDS_REVIEW"],
      ["unknown", "system_table_id", "NEEDS_REVIEW"],
    ]);
  });

  it("keeps an explicitly approved new table in the content-table inventory", async () => {
    const newTable = tableXml("new-content-01", [["Hạng mục", "Đơn vị"], ["Kế hoạch", "Phòng A"]]);
    const result = await verifyCandidateExportFidelity(await candidateBytes(documentXml(newTable)), {}, {
      sourceKind: "uploaded_docx",
      sourceBlockIds: [],
      tableIds: [],
      unsupportedFeatures: [],
    }, { approvedNewTableIds: ["new-content-01"] });

    assert.equal(result.safe, true, result.summaryVi);
    assert.deepEqual(result.tableDecisions?.map(decision => [decision.role, decision.lineage, decision.decision]), [
      ["content_table", "approved_new_table_id", "PASS"],
    ]);
  });

  it("compares cell grid positions as part of cell relationship fidelity", () => {
    const xml = tableXml("grid-table", [["A", "B"]]);
    const source = extractTableModelFromXml(xml, "grid-table");
    const output = structuredClone(source);
    output.rows[0].cells[1].gridColumn = 0;
    const diffs = compareTableFidelity(source, output);

    assert.ok(diffs.some(diff => diff.type === "merge_mismatch" && /gridColumn/u.test(diff.messageVi)));
  });
});
