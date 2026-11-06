import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { extractBlocksFromDocx } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";
import type { DocumentFormatType } from "../src/shared/schemas/document.schema.ts";

const FIXTURES_DIR = path.resolve(process.cwd(), "test/fixtures/recipient_samples");

test("01_ND30_CongVan_KinhGui_1Noi: Import bóc tách đúng 1 nơi nhận, xuất DOCX đúng chuẩn NĐ 30", async () => {
  const filePath = path.join(FIXTURES_DIR, "01_ND30_CongVan_KinhGui_1Noi.docx");
  assert.ok(fs.existsSync(filePath), "Fixture 01 phải tồn tại");

  const buffer = fs.readFileSync(filePath);
  const { blocks } = await extractBlocksFromDocx(buffer);
  const structured = segmentSourceBlocks(blocks, { standardType: "state" });

  // Kiểm tra bóc tách
  assert.ok(structured.recipientHeader, "Phải bóc tách được recipientHeader");
  assert.equal(structured.recipientHeader.kind, "kinh_gui");
  assert.equal(structured.recipientHeader.items.length, 1);
  assert.match(structured.recipientHeader.items[0].text, /Tổng công ty Bảo đảm an toàn hàng hải/i);

  // Không để khối Kính gửi bị lọt vào body
  const bodyText = structured.body.html;
  assert.ok(!bodyText.includes("Kính gửi: Tổng công ty"), "Body HTML không được chứa dòng Kính gửi đã bóc tách");

  // Kiểm tra xuất DOCX
  const docxData = {
    regime: "administrative",
    documentType: structured.fields.documentType?.value || "CÔNG VĂN",
    subject: structured.fields.subject?.value || "V/v phối hợp công tác",
    bodyHtml: structured.body.html,
    recipientHeader: structured.recipientHeader,
    recipients: "Như trên;\nLưu: VT, TCCB.",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
  } as unknown as DocumentFormatType;

  const exportedBuffer = await generateND30DocxBuffer(docxData);
  const zip = await JSZip.loadAsync(exportedBuffer);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // 1 nơi nhận: nằm cùng dòng "Kính gửi: "
  assert.ok(docXml.includes("Kính gửi: "), "DOCX xuất ra phải có Kính gửi: ");
  assert.ok(docXml.includes("Tổng công ty Bảo đảm an toàn hàng hải"), "DOCX xuất ra phải có tên nơi nhận");
});

test("02_ND30_CongVan_KinhGui_NhieuNoi: Bóc tách nhiều nơi nhận, tab stop 2041, hanging 340, dấu chấm phẩy và kết thúc dấu chấm", async () => {
  const filePath = path.join(FIXTURES_DIR, "02_ND30_CongVan_KinhGui_NhieuNoi.docx");
  assert.ok(fs.existsSync(filePath), "Fixture 02 phải tồn tại");

  const buffer = fs.readFileSync(filePath);
  const { blocks } = await extractBlocksFromDocx(buffer);
  const structured = segmentSourceBlocks(blocks, { standardType: "state" });

  assert.ok(structured.recipientHeader, "Phải bóc tách được recipientHeader");
  assert.equal(structured.recipientHeader.kind, "kinh_gui");
  assert.equal(structured.recipientHeader.items.length, 3);
  assert.match(structured.recipientHeader.items[0].text, /Tổng công ty Bảo đảm an toàn hàng hải/i);
  assert.match(structured.recipientHeader.items[1].text, /Cảng vụ Hàng hải/i);

  // Kiểm tra xuất DOCX
  const docxData = {
    regime: "administrative",
    documentType: "THÔNG BÁO",
    subject: "Nghỉ lễ Ngày Văn hóa Việt Nam năm 2026",
    bodyHtml: structured.body.html,
    recipientHeader: structured.recipientHeader,
    recipients: "Lưu: VT.", // Chưa có "Như trên;" -> hệ thống phải tự bổ sung
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Đức Thành",
  } as unknown as DocumentFormatType;

  const exportedBuffer = await generateND30DocxBuffer(docxData);
  const zip = await JSZip.loadAsync(exportedBuffer);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Tab stop 2041 dxa và hanging 340 dxa
  assert.ok(docXml.includes('w:left="2041"'), "Phải có w:left=2041 cho các mục nhiều nơi nhận");
  assert.ok(docXml.includes('w:hanging="340"'), "Phải có w:hanging=340 cho các mục nhiều nơi nhận");
  assert.ok(docXml.includes('w:pos="2041"'), "Phải có tab stop w:pos=2041");

  // Dấu kết thúc: mục 1 dấu ;, mục cuối dấu .
  assert.ok(docXml.includes(";"), "Các mục đầu phải kết thúc bằng dấu ;");
  assert.ok(docXml.includes("."), "Mục cuối phải kết thúc bằng dấu .");

  // Tự động bổ sung "- Như trên;" vào bảng nơi nhận cuối
  assert.ok(docXml.includes("- Như trên;"), "Bảng nơi nhận cuối phải tự động có dòng - Như trên;");
});

test("03_ND30_ToTrinh & 04_ND30_ToTrinh: Tờ trình hành chính NĐ 30 bắt buộc dùng Kính gửi, không dùng Kính trình", async () => {
  const filePath03 = path.join(FIXTURES_DIR, "03_ND30_ToTrinh_KinhGui_1Noi.docx");
  const buffer03 = fs.readFileSync(filePath03);
  const { blocks: blocks03 } = await extractBlocksFromDocx(buffer03);
  const structured03 = segmentSourceBlocks(blocks03, { standardType: "state" });

  assert.ok(structured03.recipientHeader);
  assert.equal(structured03.recipientHeader.kind, "kinh_gui");

  // Giả lập một Tờ trình NĐ 30 có kind bị set là 'kinh_trinh'
  const docxData = {
    regime: "administrative",
    documentType: "TỜ TRÌNH",
    subject: "V/v phê duyệt kế hoạch",
    bodyHtml: "<p>Kính trình cấp có thẩm quyền...</p>",
    recipientHeader: {
      id: "rec-1",
      kind: "kinh_trinh", // Cố tình đặt kinh_trinh
      presence: "confirmed",
      items: [{ id: "i1", text: "Hội đồng thành viên" }],
    },
    recipients: "Như trên;\nLưu: VT.",
  } as unknown as DocumentFormatType;

  const exportedBuffer = await generateND30DocxBuffer(docxData);
  const zip = await JSZip.loadAsync(exportedBuffer);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Bắt buộc chuyển thành "Kính gửi:", không được xuất "Kính trình:"
  assert.ok(docXml.includes("Kính gửi: ") && docXml.includes("Hội đồng thành viên"), "Tờ trình NĐ 30 bắt buộc xuất Kính gửi");
  assert.ok(!docXml.includes("Kính trình:"), "Tờ trình NĐ 30 tuyệt đối không được xuất Kính trình");
});

test("06_HD05_CongVan & 08_HD05_ToTrinh: Thể thức Đảng Hướng dẫn 05 nhãn căn giữa in nghiêng, ngắt dấu chấm phẩy", async () => {
  const filePath06 = path.join(FIXTURES_DIR, "06_HD05_CongVan_KinhGui_1Noi.docx");
  const buffer06 = fs.readFileSync(filePath06);
  const { blocks: blocks06 } = await extractBlocksFromDocx(buffer06);
  const structured06 = segmentSourceBlocks(blocks06, { standardType: "party" });

  assert.ok(structured06.recipientHeader);
  assert.equal(structured06.recipientHeader.kind, "kinh_gui");

  const docxPartyData = {
    regime: "party",
    documentType: "CÔNG VĂN",
    subject: "V/v triển khai nghị quyết chi bộ",
    bodyHtml: "<p>Nội dung công văn đảng...</p>",
    recipientHeader: structured06.recipientHeader,
    recipients: "Như trên;\nLưu: VP.",
  } as unknown as DocumentFormatType;

  const exportedBuffer = await generateND30DocxBuffer(docxPartyData);
  const zip = await JSZip.loadAsync(exportedBuffer);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Nhãn căn giữa và in nghiêng
  assert.ok(docXml.includes('w:jc w:val="center"'), "HD05 nhãn Kính gửi phải căn giữa");
  assert.ok(docXml.includes("<w:i/>"), "HD05 nhãn Kính gửi phải in nghiêng");

  // Nơi nhận kết thúc bằng dấu ;
  assert.ok(docXml.includes(";"), "HD05 nơi nhận kết thúc bằng ;");
});

test("Bảng chữ ký cuối trang: Đạt đúng tỷ lệ 52.14% / 47.86% và margins 108 dxa", async () => {
  const docxData = {
    regime: "administrative",
    documentType: "THÔNG BÁO",
    subject: "Thông báo kiểm tra",
    bodyHtml: "<p>Nội dung...</p>",
    recipients: "Chủ tịch Công ty;\nBan Kiểm soát Công ty;\nLưu: HC.",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Đức Thành",
  } as unknown as DocumentFormatType;

  const exportedBuffer = await generateND30DocxBuffer(docxData);
  const zip = await JSZip.loadAsync(exportedBuffer);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra tỷ lệ ô pct: 2607 pct (52.14%) và 2393 pct (47.86%)
  assert.match(docXml, /<w:tcW[^>]*w:w="2607"[^>]*\/>/, "Cột Nơi nhận phải có w:w=2607 pct");
  assert.match(docXml, /<w:tcW[^>]*w:w="2393"[^>]*\/>/, "Cột Ký tên phải có w:w=2393 pct");

  // Kiểm tra margin padding ô: 108 dxa (~1.9mm)
  assert.match(docXml, /<w:left[^>]*w:w="108"[^>]*\/>/, "Padding left ô phải là 108 dxa");
  assert.match(docXml, /<w:right[^>]*w:w="108"[^>]*\/>/, "Padding right ô phải là 108 dxa");

  // Kiểm tra lưới cột tblGrid: 4878 và 4476 dxa
  assert.ok(docXml.includes('w:gridCol w:w="4878"'), "Grid col 1 phải là 4878 dxa");
  assert.ok(docXml.includes('w:gridCol w:w="4476"'), "Grid col 2 phải là 4476 dxa");
});
