/**
 * @file export_pilot_fixtures.ts
 * @description Script tạo các file vật lý (.json và .docx) cho 27 tài liệu pilot test trong thư mục fixtures/pilot_documents/
 */

import fs from "fs";
import path from "path";
import { Packer } from "docx";
import { PILOT_DOCUMENTS } from "../src/fixtures/pilotDocuments.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";

async function exportAll() {
  const targetDir = path.resolve(process.cwd(), "fixtures", "pilot_documents");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`Bắt đầu xuất 27 tài liệu pilot sang ${targetDir}...`);

  for (const item of PILOT_DOCUMENTS) {
    const baseName = `${item.id}_${item.category}_${item.code.replace(/[\/\\:*?"<>|]/g, "_")}`;
    
    // 1. Xuất file JSON
    const jsonPath = path.join(targetDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(item, null, 2), "utf8");

    // 2. Xuất file DOCX chuẩn OOXML
    const docxDoc = generateND30DocxDocument(item.doc);
    const buffer = await Packer.toBuffer(docxDoc);
    const docxPath = path.join(targetDir, `${baseName}.docx`);
    fs.writeFileSync(docxPath, buffer);

    console.log(`[OK] Đã xuất: ${baseName}.docx & .json`);
  }

  console.log(`\nHoàn thành xuất thành công 27 bộ tài liệu pilot test!`);
}

exportAll().catch(err => {
  console.error("Lỗi khi xuất pilot documents:", err);
  process.exit(1);
});
