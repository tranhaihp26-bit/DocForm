import assert from "node:assert/strict";
import JSZip from "jszip";
import { Packer } from "docx";
import { generateND30DocxDocument } from "../src/utils/docxExport.ts";

const document = generateND30DocxDocument({
  regime: "administrative",
  headerProfile: "generic",
  nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
  fontFamily: "Times New Roman",
  fontSize: 13,
  orgHeader1: "Cơ quan",
  orgHeader2: "Đơn vị",
  locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
  documentType: "KẾ HOẠCH",
  referenceNumber: "Số: 1/KH",
  subject: "Công việc",
  bodyHtml: "<p>Nội dung chính</p>",
  signTitle: "Giám đốc",
  signName: "Nguyễn Văn A",
  recipients: "Lưu VT",
  appendices: [],
  unclassified: [{
    id: "unclassified-table", index: 9, kind: "table", text: "Dữ liệu chưa phân vùng",
    html: "<table><tr><td>Dữ liệu chưa phân vùng</td></tr></table>", role: "unclassified",
  }],
});

const zip = await JSZip.loadAsync(await Packer.toBuffer(document));
const xml = await zip.file("word/document.xml")!.async("string");
assert.match(xml, /KHỐI CHƯA PHÂN LOẠI/);
assert.match(xml, /Dữ liệu chưa phân vùng/);
console.log("[PASS] Unclassified source block is preserved in exported DOCX");
