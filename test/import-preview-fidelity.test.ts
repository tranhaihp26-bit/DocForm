import assert from "node:assert/strict";
import { Packer } from "docx";
import mammoth from "mammoth";
import { preparePreviewDocument } from "../src/utils/previewDocument.ts";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";

async function main() {
  const imported = {
    headerProfile: "generic" as const,
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    referenceNumber: "Số: ……..…../……………..",
    locationAndDate: "",
    documentType: "",
    subject: "",
    bodyHtml: "<p></p>",
    signTitle: "",
    signName: "",
    recipients: "",
    appendices: [],
    unclassified: [],
    importMetadata: { sourceType: "docx" as const, status: "needs_review" as const },
  };

  const preview = preparePreviewDocument(imported, "administrative");
  const buffer = await Packer.toBuffer(generateND30DocxDocument(preview));
  const renderedText = (await mammoth.extractRawText({ buffer })).value;

  assert.match(renderedText, /CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC/);
  assert.doesNotMatch(renderedText, /CÔNG VĂN|V\/v công văn theo quy định/);
  assert.doesNotMatch(renderedText, /\[Địa danh\]|\[Họ và tên người ký\]/);
  assert.equal(preview.documentType, "");
  assert.equal(preview.subject, "");
  console.log("[PASS] Imported DOCX preview preserves missing source fields");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
