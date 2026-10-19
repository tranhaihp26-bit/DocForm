/**
 * @file complex-malformed-pipeline.test.ts
 * @description Bộ kiểm thử toàn diện pipeline 4 khâu (Parse, Preview, In ấn, Xuất file)
 * cho 10 tài liệu Pilot Test phức tạp, không đúng thể thức và sai dữ liệu.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

import { COMPLEX_MALFORMED_DOCUMENTS } from "../src/fixtures/complexMalformedDocuments.ts";
import { validateND30Compliance, isPlaceholderValue } from "../src/shared/schemas/document.schema.ts";
import { detectDocumentType, fallbackRuleBasedParser } from "../src/server/parser.ts";
import { extractBlocksFromDocx, extractBlocksFromTxt } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { preparePreviewDocument } from "../src/utils/previewDocument.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";
import { sanitizeBodyHtml } from "../src/server/middleware/compliance.middleware.ts";
import { Packer } from "docx";

describe("BỘ KIỂM THỬ PILOT TEST CHO TÀI LIỆU PHỨC TẠP, SAI THỂ THỨC & DỮ LIỆU HỎNG", () => {

  // =========================================================================
  // GIAI ĐOẠN 1: KIỂM THỬ KHÂU PARSE & BÓC TÁCH DỮ LIỆU
  // =========================================================================
  describe("Giai đoạn 1: Khâu Parse & Bóc tách Dữ liệu (Parser & Segmenter)", () => {
    
    it("PARSER-01: Nhận diện chính xác tên loại văn bản ngay cả khi văn bản thô không cấu trúc", () => {
      const ocrItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "malformed-03")!;
      assert.ok(ocrItem.rawText, "Cần có rawText");
      
      const detected = detectDocumentType(ocrItem.rawText);
      assert.ok(
        ["CÔNG VĂN", "THÔNG BÁO"].includes(detected),
        `Loại văn bản nhận diện được: ${detected}`
      );
    });

    it("PARSER-02: Bóc tách SourceBlocks từ tệp TXT thô không bị crash", () => {
      const ocrItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "malformed-03")!;
      const extracted = extractBlocksFromTxt(ocrItem.rawText!);
      
      assert.ok(extracted.blocks.length > 0, "Phải trích xuất được khối");
      assert.ok(extracted.rawText.length > 50, "Raw text phải được bảo toàn");

      const segmented = segmentSourceBlocks(extracted.blocks, {
        filename: "malformed-03.txt",
        fileType: "txt",
      });
      assert.ok(segmented, "Phân đoạn cấu trúc thành công");
      assert.ok(segmented.body.html.length > 0, "Phần body không được rỗng");
    });

    it("PARSER-03: Bóc tách SourceBlocks từ tệp DOCX thực tế đã xuất trong fixtures/complex_malformed/", async () => {
      const docxPath = path.resolve(process.cwd(), "fixtures", "complex_malformed", "complex-01_complex_48_BC-HTMB.docx");
      assert.ok(fs.existsSync(docxPath), "File DOCX phải tồn tại");

      const fileBuffer = fs.readFileSync(docxPath);
      const extracted = await extractBlocksFromDocx(fileBuffer);

      assert.ok(extracted.blocks.length >= 3, "Phải trích xuất được tối thiểu 3 khối");
      
      // Kiểm tra có trích xuất được bảng (table block)
      const tableBlock = extracted.blocks.find(b => b.kind === "table");
      assert.ok(tableBlock, "Phải nhận diện được khối Table trong DOCX");
      assert.ok(tableBlock.html && tableBlock.html.includes("<table"), "Table HTML phải hợp lệ");
    });

    it("PARSER-04: Phát hiện 100% các vi phạm thể thức trên các tài liệu không đúng thể thức", () => {
      const nonCompliantItems = COMPLEX_MALFORMED_DOCUMENTS.filter(d => d.type === "non_compliant");
      assert.equal(nonCompliantItems.length, 4, "Phải có đúng 4 tài liệu không đúng thể thức");

      for (const item of nonCompliantItems) {
        const report = validateND30Compliance(item.doc);
        assert.ok(report.issues.length > 0, `Tài liệu ${item.id} phải có ít nhất 1 lỗi thể thức`);
        
        // Kiểm tra chi tiết từng trường hợp
        if (item.id === "noncompliant-01") {
          // Sai Quốc hiệu, Tiêu ngữ, số ký hiệu
          const issueFields = report.issues.map(i => i.field);
          assert.ok(issueFields.includes("nationalHeader1"), "Phải bắt lỗi Quốc hiệu sai");
          assert.ok(issueFields.includes("nationalHeader2"), "Phải bắt lỗi Tiêu ngữ sai");
          assert.ok(issueFields.includes("referenceNumber"), "Phải bắt lỗi Số ký hiệu sai");
        }

        if (item.id === "noncompliant-02") {
          // Placeholder cơ quan, số hiệu, ngày tháng, nơi nhận
          const issueFields = report.issues.map(i => i.field);
          assert.ok(issueFields.includes("orgHeader2"), "Phải bắt lỗi Placeholder cơ quan");
          assert.ok(issueFields.includes("locationAndDate"), "Phải bắt lỗi Placeholder ngày tháng");
          assert.ok(issueFields.includes("recipients"), "Phải bắt lỗi Nơi nhận rỗng");
        }

        if (item.id === "noncompliant-03") {
          // Đảng dùng nhầm Quốc hiệu Nhà nước & có Tiêu ngữ
          const issueFields = report.issues.map(i => i.field);
          assert.ok(issueFields.includes("nationalHeader1"), "Phải bắt lỗi Đảng dùng nhầm Quốc hiệu");
          assert.ok(issueFields.includes("nationalHeader2"), "Phải bắt lỗi Văn bản Đảng thừa Tiêu ngữ");
        }

        if (item.id === "noncompliant-04") {
          // Cơ quan ban hành viết thường & ngày thiếu số 0
          const issueFields = report.issues.map(i => i.field);
          assert.ok(issueFields.includes("orgHeader2"), "Phải bắt lỗi Cơ quan viết chữ thường");
          assert.ok(issueFields.includes("locationAndDate"), "Phải bắt lỗi Ngày tháng thiếu số 0");
        }
      }
    });

    it("PARSER-05: Nhận diện chính xác placeholder qua hàm isPlaceholderValue", () => {
      assert.equal(isPlaceholderValue("[TÊN CƠ QUAN BAN HÀNH]"), true);
      assert.equal(isPlaceholderValue("Số: .../KH-..."), true);
      assert.equal(isPlaceholderValue("[Địa danh], ngày ... tháng ... năm 2026"), true);
      assert.equal(isPlaceholderValue("[Họ và tên người ký]"), true);
      assert.equal(isPlaceholderValue("CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC"), false);
      assert.equal(isPlaceholderValue("Số: 125/KH-HTMB"), false);
    });
  });

  // =========================================================================
  // GIAI ĐOẠN 2: KIỂM THỬ KHÂU HIỂN THỊ XEM TRƯỚC (PREVIEW & SANITIZATION)
  // =========================================================================
  describe("Giai đoạn 2: Khâu Hiển thị xem trước (A4 Preview & Sanitization)", () => {

    it("PREVIEW-01: Triệt tiêu 100% mã độc XSS, script, iframe trong văn bản malformed-02", () => {
      const xssItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "malformed-02")!;
      const cleanHtml = sanitizeBodyHtml(xssItem.doc.bodyHtml);

      assert.ok(!cleanHtml.includes("<script"), "Không được chứa thẻ script");
      assert.ok(!cleanHtml.includes("<iframe"), "Không được chứa thẻ iframe");
      assert.ok(!cleanHtml.includes("onerror"), "Không được chứa thuộc tính onerror");
      assert.ok(!cleanHtml.includes("alert("), "Không được chứa hàm alert độc hại");
      assert.ok(cleanHtml.includes("Kính gửi"), "Phải bảo toàn nội dung văn bản hợp lệ");
    });

    it("PREVIEW-02: Chuẩn hóa dữ liệu qua preparePreviewDocument không gây lỗi runtime", () => {
      for (const item of COMPLEX_MALFORMED_DOCUMENTS) {
        const regime = item.doc.regime === "party" ? "party" : "administrative";
        const normalized = preparePreviewDocument(item.doc, regime);

        assert.ok(normalized, `Normalized doc ${item.id} phải tồn tại`);
        assert.ok(typeof normalized.bodyHtml === "string", "bodyHtml phải là chuỗi string");
        assert.ok(normalized.documentType.length > 0, "documentType không được rỗng");
      }
    });

    it("PREVIEW-03: Xử lý an toàn bảng HTML vỡ cấu trúc (thẻ không đóng, width 2500px)", () => {
      const brokenTableItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "malformed-01")!;
      const cleanHtml = sanitizeBodyHtml(brokenTableItem.doc.bodyHtml);

      assert.ok(cleanHtml.includes("Động cơ chính Caterpillar"), "Dữ liệu nội dung bảng phải còn nguyên");
    });
  });

  // =========================================================================
  // GIAI ĐOẠN 3: KIỂM THỬ KHÂU IN ẤN (PRINT & PDF LAYOUT)
  // =========================================================================
  describe("Giai đoạn 3: Khâu In ấn (Print CSS & PDF Layout Constraints)", () => {

    it("PRINT-01: Văn bản phức tạp 7 cột không gây lỗi tràn lề", () => {
      const complexItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "complex-01")!;
      // Tỷ lệ các cột trong colgroup phải bằng đúng 100%
      const colMatches = complexItem.doc.bodyHtml.match(/<col[^>]*width:\s*(\d+)%/g) || [];
      const totalPercent = colMatches
        .map(m => parseInt(m.match(/width:\s*(\d+)%/)![1], 10))
        .reduce((sum, val) => sum + val, 0);

      assert.equal(totalPercent, 100, `Tổng tỷ lệ các cột phải là 100% (thực tế: ${totalPercent}%)`);
    });

    it("PRINT-02: Biên bản ký 4 bên được phân chia chữ ký cân xứng", () => {
      const fourPartiesItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "complex-02")!;
      const titles = fourPartiesItem.doc.signTitle.split("|");
      const names = fourPartiesItem.doc.signName.split("|");

      assert.equal(titles.length, 4, "Phải có đúng 4 chức danh ký");
      assert.equal(names.length, 4, "Phải có đúng 4 họ tên người ký");
    });
  });

  // =========================================================================
  // GIAI ĐOẠN 4: KIỂM THỬ KHÂU XUẤT FILE DOCX (OOXML GENERATION & ZIP DECODE)
  // =========================================================================
  describe("Giai đoạn 4: Khâu Xuất file (DOCX OOXML Generation & ZIP Decoding)", () => {

    it("EXPORT-01: Sinh DOCX thành công cho toàn bộ 10 tài liệu phức tạp & lỗi thể thức", async () => {
      for (const item of COMPLEX_MALFORMED_DOCUMENTS) {
        let docxDoc;
        assert.doesNotThrow(() => {
          docxDoc = generateND30DocxDocument(item.doc);
        }, `Sinh đối tượng DOCX cho ${item.id} không được ném lỗi`);

        const buffer = await Packer.toBuffer(docxDoc!);
        assert.ok(buffer.length > 3000, `Buffer DOCX của ${item.id} phải lớn hơn 3KB (thực tế: ${buffer.length} bytes)`);

        // Giải mã gói ZIP OOXML để đảm bảo tệp Word không bị corrupt
        const zip = await JSZip.loadAsync(buffer);
        assert.ok(zip.file("[Content_Types].xml"), "Phải có [Content_Types].xml");
        assert.ok(zip.file("word/document.xml"), "Phải có word/document.xml");

        const documentXml = await zip.file("word/document.xml")!.async("string");
        assert.ok(documentXml.includes("w:document"), "XML phải chứa thẻ w:document");
        assert.ok(documentXml.includes("w:body"), "XML phải chứa thẻ w:body");
        
        // Kiểm tra font Times New Roman chuẩn NĐ 30
        assert.ok(documentXml.includes("Times New Roman"), "XML phải sử dụng phông Times New Roman");
      }
    });

    it("EXPORT-02: Kiểm tra cấu trúc OOXML bảng 7 cột trong tệp DOCX của complex-01", async () => {
      const complexItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "complex-01")!;
      const docxDoc = generateND30DocxDocument(complexItem.doc);
      const buffer = await Packer.toBuffer(docxDoc);
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file("word/document.xml")!.async("string");

      // Phải có w:tbl, w:tblHeader, w:cantSplit
      assert.ok(documentXml.includes("<w:tbl>"), "XML phải có bảng w:tbl");
      assert.ok(documentXml.includes("<w:tblHeader/>"), "XML bảng phải có w:tblHeader lặp lại tiêu đề");
      assert.ok(documentXml.includes("<w:cantSplit/>"), "XML bảng phải có w:cantSplit chống ngắt đôi hàng");
      assert.ok(documentXml.includes("MSC EMANUELA"), "Nội dung bảng phải được giữ nguyên");
    });

    it("EXPORT-03: Kiểm tra cấu trúc OOXML khối chữ ký 4 bên trong tệp DOCX của complex-02", async () => {
      const fourPartiesItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "complex-02")!;
      const docxDoc = generateND30DocxDocument(fourPartiesItem.doc);
      const buffer = await Packer.toBuffer(docxDoc);
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file("word/document.xml")!.async("string");

      assert.ok(documentXml.includes("ĐẠI DIỆN CẢNG VỤ HÀNG HẢI"), "XML phải chứa chức danh Cảng vụ");
      assert.ok(documentXml.includes("Capt. Johnathan Miller"), "XML phải chứa tên Thuyền trưởng");
      assert.ok(documentXml.includes("ĐĂNG KIỂM VIÊN CHI CỤC 10"), "XML phải chứa Đăng kiểm viên");
    });

    it("EXPORT-04: Triệt tiêu 100% payload XSS trong tệp DOCX OOXML của malformed-02", async () => {
      const xssItem = COMPLEX_MALFORMED_DOCUMENTS.find(d => d.id === "malformed-02")!;
      const docxDoc = generateND30DocxDocument(xssItem.doc);
      const buffer = await Packer.toBuffer(docxDoc);
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file("word/document.xml")!.async("string");

      assert.equal(documentXml.includes("MALICIOUS_FLAG"), false, "Word XML không được chứa mã độc script MALICIOUS_FLAG");
      assert.equal(documentXml.includes("XSS ATTACK FAILED"), false, "Word XML không được hiển thị thông báo alert XSS");
      assert.equal(documentXml.includes("attacker.example.com"), false, "Word XML không được chứa URL độc hại của iframe");
      assert.equal(documentXml.includes("MALICIOUS_IMG"), false, "Word XML không được chứa mã onerror của ảnh");
      assert.ok(documentXml.includes("Ban Giám đốc Công ty Hoa tiêu Hàng hải miền Bắc"), "Nội dung văn bản chính thống phải được bảo toàn");
    });
  });

});
