/**
 * Sinh candidate DOCX tổng hợp (NĐ30 + HD05) để mở bằng Word thật.
 * Dùng fixture tổng hợp, không dùng tài liệu người dùng.
 */
import fs from "node:fs";
import path from "node:path";
import { generateND30DocxBuffer } from "../../src/utils/docxExport.ts";

export async function buildWordCandidates(outDir: string): Promise<Array<{ id: string; file: string; label: string }>> {
  fs.mkdirSync(outDir, { recursive: true });
  const results: Array<{ id: string; file: string; label: string }> = [];

  // --- HD05: hồ sơ Đảng ủy Công ty Hoa tiêu (profile chuẩn S05) ---
  const hd05 = await generateND30DocxBuffer({
    regime: "party",
    headerProfile: "HOA-TIEU-MIEN-BAC-PARTY-HD05-HEADER-2026",
    orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY\nBẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
    orgHeader2: "ĐẢNG ỦY CÔNG TY\nHOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
    nationalHeader2: "",
    locationAndDate: "Hải Phòng, ngày 20 tháng 10 năm 2026",
    documentType: "NGHỊ QUYẾT",
    referenceNumber: "Số 05-NQ/ĐU",
    subject: "V/v công tác xây dựng Đảng năm 2026",
    bodyHtml:
      "<p>Điều 1. Ban Chấp hành Đảng bộ Công ty quyết nghị các nhiệm vụ trọng tâm quý IV năm 2026.</p>" +
      "<p>Điều 2. Giao Ban Thường vụ chuẩn bị phương án và tổ chức triển khai.</p>",
    signTitle: "T/M ĐẢNG ỦY\nBÍ THƯ",
    signName: "Nguyễn Văn Bình",
    recipients: "Đảng ủy TCT;\nLưu: VPDU.",
    fontFamily: "Times New Roman",
    fontSize: 14,
  } as any);
  const hd05File = path.join(outDir, "candidate_HD05_hoa_tieu.docx");
  fs.writeFileSync(hd05File, Buffer.from(hd05));
  results.push({ id: "hd05", file: hd05File, label: "HD05 — hồ sơ Đảng ủy Công ty Hoa tiêu (profile S05)" });

  // --- NĐ30: hồ sơ Công ty Hoa tiêu ---
  const nd30 = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "HOA-TIEU-MIEN-BAC-ADMIN-HEADER-2026",
    orgHeader1: "TỔNG CÔNG TY\nBẢO ĐẢM AN TOÀN HÀNG HẢI VIỆT NAM",
    orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 20 tháng 10 năm 2026",
    documentType: "QUYẾT ĐỊNH",
    referenceNumber: "Số: 120/QĐ-HTMB",
    subject: "V/v ban hành quy chế tài chính năm 2026",
    bodyHtml:
      "<p>Điều 1. Giám đốc Công ty ban hành Quy chế tài chính năm 2026 kèm theo Quyết định này.</p>" +
      "<p>Điều 2. Quyết định này có hiệu lực thi hành từ ngày ký.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Nguyễn Văn A",
    recipients: "Như Điều 2;\nLưu: VP.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  } as any);
  const nd30File = path.join(outDir, "candidate_ND30_hoa_tieu.docx");
  fs.writeFileSync(nd30File, Buffer.from(nd30));
  results.push({ id: "nd30", file: nd30File, label: "NĐ30 — Công ty Hoa tiêu (profile chuẩn)" });

  // --- BIÊN BẢN: ba chữ ký, nơi nhận ở hàng riêng sau bảng ký ---
  const multiSigner = await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "CƠ QUAN THỬ NGHIỆM",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hà Nội, ngày 20 tháng 10 năm 2026",
    documentType: "BIÊN BẢN",
    referenceNumber: "Số: 01/BB-TN",
    subject: "Biên bản kiểm thử ba bên",
    bodyHtml: "<p>Các bên xác nhận nội dung kiểm thử tổng hợp.</p>",
    signTitle: "CHỦ TRÌ | THƯ KÝ | ĐẠI DIỆN ĐƠN VỊ",
    signName: "Nguyễn An | Trần Bình | Lê Chi",
    recipients: "Như trên;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  } as any);
  const multiSignerFile = path.join(outDir, "candidate_multi_signer_recipients.docx");
  fs.writeFileSync(multiSignerFile, Buffer.from(multiSigner));
  results.push({ id: "multi-signer", file: multiSignerFile, label: "Biên bản tổng hợp — ba chữ ký và nơi nhận" });

  return results;
}
