/**
 * @file export_complex_malformed_fixtures.ts
 * @description Script tạo các file vật lý (.json, .docx và .txt) cho 10 tài liệu pilot test phức tạp, lỗi thể thức và sai dữ liệu
 * vào thư mục fixtures/complex_malformed/
 */

import fs from "fs";
import path from "path";
import { Packer } from "docx";
import { COMPLEX_MALFORMED_DOCUMENTS } from "../src/fixtures/complexMalformedDocuments.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";

async function exportAll() {
  const targetDir = path.resolve(process.cwd(), "fixtures", "complex_malformed");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`Bắt đầu xuất 10 tài liệu pilot phức tạp & lỗi thể thức sang ${targetDir}...`);

  for (const item of COMPLEX_MALFORMED_DOCUMENTS) {
    const baseName = `${item.id}_${item.type}_${item.code.replace(/[\/\\:*?"<>|]/g, "_")}`;
    
    // 1. Xuất file JSON
    const jsonPath = path.join(targetDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(item, null, 2), "utf8");

    // 2. Xuất file DOCX chuẩn OOXML
    try {
      const docxDoc = generateND30DocxDocument(item.doc);
      const buffer = await Packer.toBuffer(docxDoc);
      const docxPath = path.join(targetDir, `${baseName}.docx`);
      fs.writeFileSync(docxPath, buffer);
    } catch (docxErr: any) {
      console.warn(`[WARN] Lỗi khi tạo DOCX cho ${item.id}: ${docxErr.message}`);
    }

    // 3. Xuất file TXT nếu có rawText
    if (item.rawText) {
      const txtPath = path.join(targetDir, `${baseName}.txt`);
      fs.writeFileSync(txtPath, item.rawText, "utf8");
    }

    console.log(`[OK] Đã xuất: ${baseName}`);
  }

  console.log(`\nHoàn thành xuất thành công 10 bộ tài liệu pilot test phức tạp & lỗi thể thức!`);
}

exportAll().catch(err => {
  console.error("Lỗi khi xuất complex/malformed documents:", err);
  process.exit(1);
});
