import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Packer, Paragraph } from "docx";
import { createRunsAndTabsFromText, generateND30DocxDocument } from "../src/utils/docxExport.ts";
import type { DocumentFormatType } from "../src/shared/schemas/document.schema.ts";

describe("DOCX Inline Controls: Tabs, Breaks, and Run Generation", () => {
  it("createRunsAndTabsFromText returns TextRun[] without bare Tab objects", () => {
    const runs = createRunsAndTabsFromText("A\tB\nC", 28, { bold: true });
    assert.ok(Array.isArray(runs), "Kết quả phải là mảng");
    assert.equal(runs.length, 5, "A, tab, break, B, C");
    // Verify each item is compatible as a Paragraph child
    const p = new Paragraph({ children: runs });
    assert.ok(p, "Paragraph phải nhận toàn bộ children mà không lỗi kiểu");
  });

  it("export DOCX produces w:tab and w:br in document.xml with text in exact order for A\\tB\\nC", async () => {
    const doc: DocumentFormatType = {
      regime: "administrative",
      fontFamily: "Times New Roman",
      fontSize: 14,
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      orgHeader1: "",
      orgHeader2: "CÔNG TY HOA TIÊU",
      locationAndDate: "Hải Phòng, ngày 01 tháng 11 năm 2026",
      documentType: "THÔNG BÁO",
      referenceNumber: "Số: 01/TB-CT",
      subject: "Về việc kiểm tra điều khiển tab và ngắt dòng",
      bodyHtml: "<p>A\tB\nC</p>",
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Văn A",
      recipients: "Như điều 3\nLưu: VT.",
    };

    const docxFile = generateND30DocxDocument(doc);
    const buffer = await Packer.toBuffer(docxFile);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml, "word/document.xml phải tồn tại");

    assert.ok(xml.includes("<w:tab/>") || xml.includes("<w:tab />"), "XML phải chứa w:tab");
    assert.ok(xml.includes("<w:br/>") || xml.includes("<w:br />"), "XML phải chứa w:br");

    // Order check: "A", then tab, then "B", then br, then "C"
    const matchA = xml.match(/<w:t[^>]*>A<\/w:t>/);
    const indexA = matchA ? xml.indexOf(matchA[0]) : -1;
    const indexTab = xml.indexOf("<w:tab", indexA);
    const matchB = xml.match(/<w:t[^>]*>B<\/w:t>/);
    const indexB = matchB ? xml.indexOf(matchB[0], indexTab) : -1;
    const indexBr = xml.indexOf("<w:br", indexB);
    const matchC = xml.match(/<w:t[^>]*>C<\/w:t>/);
    const indexC = matchC ? xml.indexOf(matchC[0], indexBr) : -1;

    assert.ok(indexA !== -1, `Phải có text A trong w:t`);
    assert.ok(indexTab > indexA, "w:tab phải nằm sau A");
    assert.ok(indexB > indexTab, "B phải nằm sau w:tab");
    assert.ok(indexBr > indexB, "w:br phải nằm sau B");
    assert.ok(indexC > indexBr, "C phải nằm sau w:br");
  });

  it("xử lý leading tab, trailing tab và tiếng Việt có dấu", async () => {
    const raw = "\tCộng hòa Xã hội Chủ nghĩa Việt Nam\t\nĐộc lập - Tự do - Hạnh phúc\t";
    const runs = createRunsAndTabsFromText(raw, 28);
    assert.ok(runs.length >= 4, "Phải sinh đủ các run");

    const p = new Paragraph({ children: runs });
    assert.ok(p);

    const docxFile = generateND30DocxDocument({
      regime: "administrative",
      fontFamily: "Times New Roman",
      fontSize: 14,
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      orgHeader1: "",
      orgHeader2: "CƠ QUAN CHỦ QUẢN",
      locationAndDate: "Hà Nội, ngày 01 tháng 11 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 99/CV-CQ",
      subject: "Kiểm tra tab đầu cuối",
      bodyHtml: `<p>${raw}</p>`,
      signTitle: "THỦ TRƯỞNG",
      signName: "Trần Văn B",
      recipients: "Như trên",
    },);

    const buffer = await Packer.toBuffer(docxFile);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    assert.ok(xml);
    assert.ok(xml.includes("Cộng hòa Xã hội Chủ nghĩa Việt Nam"));
    assert.ok(xml.includes("Độc lập - Tự do - Hạnh phúc"));
    assert.ok(xml.includes("<w:tab") && xml.includes("<w:br"));
  });
});
