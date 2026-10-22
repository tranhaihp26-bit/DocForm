import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Document, Packer } from "docx";
import { evaluateDocumentRules } from "../src/canonical/ruleEngine.ts";
import { classifyTableMarkup } from "../src/server/tableRoleClassifier.ts";
import { convertHtmlToDocxElements } from "../src/utils/docxExport.ts";
import { optimizeTableHtml } from "../src/utils/tableFormatUtils.ts";

const contentTable = `<table><thead><tr><th>STT</th><th>Nội dung công việc</th><th>Đơn vị chủ trì</th></tr></thead><tbody><tr><td>1</td><td>Rà soát hồ sơ</td><td>Phòng Tổng hợp</td></tr><tr><td>2</td><td>Lập báo cáo</td><td>Văn phòng</td></tr></tbody></table>`;

describe("Content table formatting scope", () => {
  it("recognizes Body and appendix content tables", () => {
    const body = classifyTableMarkup(contentTable, "body");
    const appendix = classifyTableMarkup(contentTable, "appendix");
    assert.equal(body.canAutoFormat, true);
    assert.equal(body.owner, "body");
    assert.equal(appendix.canAutoFormat, true);
    assert.equal(appendix.owner, "appendix");
  });

  it("keeps sequence columns narrow for unheaded data tables", () => {
    const markup = `<table><tr><td>01</td><td>Kiểm tra hồ sơ</td><td>Phòng A</td></tr><tr><td>02</td><td>Hoàn thiện báo cáo</td><td>Phòng B</td></tr><tr><td>03</td><td>Gửi kết quả</td><td>Phòng C</td></tr></table>`;
    const result = classifyTableMarkup(markup, "body");
    const widths = Array.from(optimizeTableHtml(markup).matchAll(/<col style="width:\s*(\d+)%/g), match => Number(match[1]));
    assert.equal(result.canAutoFormat, true);
    assert.equal(result.hasHeaderRow, false);
    assert.ok(widths[0] <= 12);
    assert.equal(widths.reduce((sum, width) => sum + width, 0), 100);
  });

  it("preserves usable time and note widths in a seven-column table", () => {
    const markup = `<table><thead><tr><th>STT</th><th>Nội dung công việc</th><th>Đơn vị chủ trì</th><th>Đơn vị phối hợp</th><th>Thời gian</th><th>Kết quả</th><th>Ghi chú</th></tr></thead><tbody><tr><td>1</td><td>Rà soát hồ sơ</td><td>Phòng Tổ chức</td><td>Các phòng</td><td>Tháng 10/2026</td><td>Danh sách hoàn chỉnh</td><td>Báo cáo lãnh đạo</td></tr></tbody></table>`;
    const widths = Array.from(optimizeTableHtml(markup).matchAll(/<col style="width:\s*(\d+)%/g), match => Number(match[1]));
    assert.equal(widths.reduce((sum, width) => sum + width, 0), 100);
    assert.ok(widths[4] >= 13, `Cột thời gian phải đủ rộng, nhận ${widths[4]}%`);
    assert.ok(widths[6] >= 11, `Cột ghi chú phải đủ rộng, nhận ${widths[6]}%`);
  });

  it("does not turn signature or layout tables into content tables", () => {
    const signature = `<table><tr><td>ĐẠI DIỆN</td><td>CHỦ TỊCH</td></tr><tr><td></td><td>(Ký, ghi rõ họ tên)</td></tr></table>`;
    const layout = `<table><tr><td>Đơn vị</td><td>Thông tin</td></tr><tr><td>Phòng A</td><td>Địa chỉ</td></tr></table>`;
    assert.equal(classifyTableMarkup(signature, "body").canAutoFormat, false);
    assert.equal(classifyTableMarkup(layout, "body").canAutoFormat, false);
    assert.equal(optimizeTableHtml(signature), signature);
    assert.equal(optimizeTableHtml(layout), layout);
  });

  it("keeps merged and imported source tables unchanged", () => {
    const merged = `<table><thead><tr><th colspan="2">STT và Nội dung</th></tr></thead><tbody><tr><td>1</td><td>Việc cần làm</td></tr><tr><td>2</td><td>Việc đã làm</td></tr></tbody></table>`;
    const imported = contentTable.replace("<table>", '<table data-source-table-id="source-1">');
    assert.equal(classifyTableMarkup(merged, "appendix").canAutoFormat, false);
    assert.equal(optimizeTableHtml(merged, { scope: "appendix" }), merged);
    assert.equal(optimizeTableHtml(imported), imported);
  });

  it("marks and formats an eligible appendix table with a repeated semantic header", () => {
    const formatted = optimizeTableHtml(contentTable, { scope: "appendix" });
    assert.match(formatted, /data-docform-content-table="true"/);
    assert.match(formatted, /data-docform-table-scope="appendix"/);
    assert.match(formatted, /font-size:\s*13pt/i);
    assert.match(formatted, /font-weight:\s*bold/i);
    assert.match(formatted, /text-align:\s*center/i);
  });

  it("exports Body and appendix tables with 13pt cells and a repeated semantic header", async () => {
    const body = convertHtmlToDocxElements(contentTable, "administrative", 0, undefined, undefined, "body");
    const appendix = convertHtmlToDocxElements(contentTable, "administrative", 0, undefined, undefined, "appendix");
    const doc = new Document({ sections: [{ children: [...body, ...appendix] }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    assert.ok(documentXml);
    const tables = Array.from(documentXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g), match => match[0]);
    assert.equal(tables.length, 2);
    assert.ok(tables.every(table => /<w:tblHeader\b/.test(table)));
    assert.ok((documentXml.match(/<w:sz\b[^>]*w:val="26"/g) || []).length >= 6);
  });

  it("does not add preset borders or repeated headers to a signature layout table", async () => {
    const signature = `<table><tr><td>Nơi nhận:<br>- Lưu: VT.</td><td>GIÁM ĐỐC<br><br><br>Nguyễn An</td></tr></table>`;
    const elements = convertHtmlToDocxElements(signature, "administrative", 0, undefined, undefined, "body");
    const doc = new Document({ sections: [{ children: elements }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml);
    assert.doesNotMatch(xml, /<w:(?:top|bottom|left|right|insideH|insideV)\b[^>]*w:val="single"/);
    assert.doesNotMatch(xml, /<w:tblHeader\b[^>]*w:val="1"/);
  });

  it("keeps grid lines on merged content tables while leaving them manual-review only", async () => {
    const merged = `<table><thead><tr><th colspan="2">BẢNG TỔNG HỢP</th></tr></thead><tbody><tr><td>1</td><td>Nội dung A</td></tr><tr><td>2</td><td>Nội dung B</td></tr></tbody></table>`;
    const elements = convertHtmlToDocxElements(merged, "administrative", 0, undefined, undefined, "appendix");
    const doc = new Document({ sections: [{ children: elements }] });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml);
    assert.match(xml, /<w:(?:top|bottom|left|right)\b[^>]*w:val="single"/);
    assert.doesNotMatch(xml, /<w:tblHeader\b[^>]*w:val="1"/);
  });

  it("counts appendix content tables in review rules but excludes layout tables", () => {
    const evidence = { body_evidence: { hasDirectBodyParagraphs: false, directParagraphs: [] } };
    const appendixSummary = evaluateDocumentRules("administrative", {
      bodyHtml: "<p>Thân bài không có bảng.</p>",
      appendices: [{ id: "app-1", html: contentTable }],
    }, evidence);
    assert.equal(appendixSummary.results.find(rule => rule.ruleId === "BODY.TABLE.PRESERVATION")?.status, "NOT_EVALUATED");
    assert.equal(appendixSummary.results.find(rule => rule.ruleId === "BODY.TABLE.HEADER_ROW")?.status, "NOT_EVALUATED");

    const signature = `<table><tr><td>ĐẠI DIỆN</td><td>CHỦ TỊCH</td></tr><tr><td></td><td>(Ký, ghi rõ họ tên)</td></tr></table>`;
    const layoutSummary = evaluateDocumentRules("administrative", { bodyHtml: signature }, evidence);
    assert.equal(layoutSummary.results.find(rule => rule.ruleId === "BODY.TABLE.PRESERVATION")?.status, "NOT_APPLICABLE");
  });
});
