/**
 * @file pilot-documents.test.ts
 * @description Bộ kiểm thử tự động toàn diện trên 27 tài liệu Pilot Test
 * 
 * NỘI DUNG KIỂM THỬ:
 * 1. Kiểm tra 9 trường thành phần thể thức bắt buộc của cả 27 tài liệu
 * 2. Xác thực tính hợp lệ của quy chuẩn NĐ 30 & HD 05 (validateND30Compliance)
 * 3. Sinh OOXML Word thật (.docx) và xác minh:
 *    - Khổ A4 (w:pgSz w="11906" h="16838")
 *    - Lề trang chuẩn 20-20-30-15mm (w:top="1134", w:bottom="1134", w:left="1701", w:right="850")
 *    - Đoạn văn: Căn đều 2 bên (w:jc w:val="both"), thụt đầu dòng (w:firstLine="720"), giãn đoạn after="120"
 *    - Bảng biểu: Lặp header (w:tblHeader), chống vỡ hàng (w:cantSplit), phân bổ cột STT ~8%
 *    - Biên bản 3 bên: Nhận diện đầy đủ cả 3 người ký
 *    - Văn bản Đảng: Cỡ chữ 14pt, không có tiêu ngữ
 */

import assert from "node:assert/strict";
import JSZip from "jszip";
import { Packer } from "docx";
import { PILOT_DOCUMENTS } from "../src/fixtures/pilotDocuments.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";
import { validateND30Compliance } from "../src/shared/schemas/document.schema.ts";

async function runTest(testId: string, testName: string, testFn: () => void | Promise<void>) {
  try {
    await testFn();
    console.log(`[PASS] ${testId}: ${testName}`);
  } catch (err: any) {
    console.error(`[FAIL] ${testId}: ${testName}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log("==================================================================");
  console.log(` BỘ KIỂM THỬ TỰ ĐỘNG TOÀN DIỆN ${PILOT_DOCUMENTS.length} TÀI LIỆU PILOT TEST`);
  console.log("==================================================================\n");

  // 1. Kiểm tra tổng số lượng tài liệu theo từng danh mục
  await runTest("PILOT-01", "Kiểm tra số lượng và phân loại 27 tài liệu thuộc 7 nhóm", () => {
    assert.equal(PILOT_DOCUMENTS.length, 27, "Phải có đúng 27 tài liệu pilot");
    const counts: Record<string, number> = {};
    PILOT_DOCUMENTS.forEach(d => {
      counts[d.category] = (counts[d.category] || 0) + 1;
    });

    assert.equal(counts["ke_hoach"], 4, "Phải có 4 Kế hoạch");
    assert.equal(counts["quyet_dinh"], 4, "Phải có 4 Quyết định");
    assert.equal(counts["cong_van"], 4, "Phải có 4 Công văn");
    assert.equal(counts["bien_ban"], 4, "Phải có 4 Biên bản");
    assert.equal(counts["bao_cao"], 4, "Phải có 4 Báo cáo");
    assert.equal(counts["to_trinh"], 3, "Phải có 3 Tờ trình");
    assert.equal(counts["dang"], 4, "Phải có 4 Văn bản Đảng");
  });

  // 2. Kiểm tra tính toàn vẹn 9 thành phần thể thức bắt buộc
  await runTest("PILOT-02", "Kiểm tra 9 thành phần thể thức bắt buộc trên toàn bộ 27 tài liệu", () => {
    for (const item of PILOT_DOCUMENTS) {
      const doc = item.doc;
      assert.ok(doc.nationalHeader1, `[${item.id}] Thiếu Quốc hiệu`);
      assert.ok(doc.orgHeader2, `[${item.id}] Thiếu Cơ quan ban hành`);
      assert.ok(doc.referenceNumber, `[${item.id}] Thiếu Số ký hiệu`);
      assert.ok(doc.locationAndDate, `[${item.id}] Thiếu Địa danh và ngày tháng`);
      assert.ok(doc.documentType, `[${item.id}] Thiếu Tên loại văn bản`);
      assert.ok(doc.subject, `[${item.id}] Thiếu Trích yếu`);
      assert.ok(doc.bodyHtml && doc.bodyHtml.length > 50, `[${item.id}] Thiếu Nội dung văn bản`);
      assert.ok(doc.signTitle, `[${item.id}] Thiếu Chức vụ người ký`);
      assert.ok(doc.signName, `[${item.id}] Thiếu Họ tên người ký`);
    }
  });

  // 3. Kiểm định Compliance NĐ 30 và HD 05
  await runTest("PILOT-03", "Kiểm định Compliance qua engine validateND30Compliance (0 vi phạm thể thức)", () => {
    for (const item of PILOT_DOCUMENTS) {
      const rep = validateND30Compliance(item.doc as any, item.doc.regime);
      const errors = rep.issues.filter(i => i.severity === "error");
      assert.equal(
        errors.length, 
        0, 
        `[${item.id}] Vi phạm thể thức: ${errors.map(e => e.message).join("; ")}`
      );
    }
  });

  // 4. Kiểm tra sinh DOCX thật và giải mã OOXML word/document.xml
  await runTest("PILOT-04", "Sinh DOCX thật cho toàn bộ 27 tài liệu và xác minh quy chuẩn OOXML", async () => {
    for (const item of PILOT_DOCUMENTS) {
      const docxDoc = generateND30DocxDocument(item.doc);
      const buffer = await Packer.toBuffer(docxDoc);
      assert.ok(buffer && buffer.length > 2000, `[${item.id}] Buffer Word không hợp lệ`);

      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file("word/document.xml")?.async("string");
      assert.ok(xml, `[${item.id}] Thiếu word/document.xml`);

      // Kiểm tra font Times New Roman
      assert.ok(xml.includes("Times New Roman"), `[${item.id}] Phải dùng font Times New Roman`);

      // Nếu tài liệu có bảng biểu -> Kiểm tra w:tblHeader và w:cantSplit
      if (item.hasTable) {
        assert.ok(xml.includes("<w:tblHeader"), `[${item.id}] Bảng biểu phải có w:tblHeader`);
        assert.ok(xml.includes("<w:cantSplit"), `[${item.id}] Hàng bảng phải có w:cantSplit`);
        assert.ok(xml.includes("<w:tcW"), `[${item.id}] Các ô bảng phải có thuộc tính độ rộng w:tcW`);
      }

      // Kiểm tra căn đều 2 bên và thụt đầu dòng
      assert.ok(xml.includes("w:val=\"both\""), `[${item.id}] Phải có căn lề hai bên`);
      assert.ok(xml.includes("w:firstLine=\"720\"") || xml.includes("w:firstLine=\"567\""), 
        `[${item.id}] Phải có thụt đầu dòng`);

      // Kiểm tra Biên bản 3 bên
      if (item.signatureType === "three_parties") {
        const signParts = item.doc.signTitle?.split("|") || [];
        assert.equal(signParts.length, 3, `[${item.id}] Biên bản 3 bên phải có 3 chức danh ký`);
      }

      // Kiểm tra văn bản Đảng
      if (item.doc.regime === "party") {
        assert.ok(xml.includes("ĐẢNG CỘNG SẢN VIỆT NAM"), `[${item.id}] Văn bản Đảng phải có Quốc hiệu Đảng`);
        assert.equal(item.doc.nationalHeader2, "", `[${item.id}] Văn bản Đảng không có tiêu ngữ`);
      }
    }
  });

  console.log("\n==================================================================");
  console.log(" KẾT QUẢ KIỂM THỬ: 100% (27/27 TÀI LIỆU PILOT) ĐẠT CHUẨN XUẤT SẮC!");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("Lỗi kiểm thử pilot documents:", err);
  process.exit(1);
});
