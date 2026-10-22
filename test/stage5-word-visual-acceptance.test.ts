/**
 * @file stage5-word-visual-acceptance.test.ts
 * @description Chặng 5 — kiểm tra **Word thật** (Word COM) trên candidate tổng hợp.
 *
 * Bằng chứng S05 trước đây mới dừng ở mức OOXML. Ca này mở candidate bằng
 * chính Microsoft Word, đo hình học bảng phần đầu mà Word thực sự dàn trang, và
 * xuất PDF bằng engine của Word để kiểm bằng mắt.
 *
 * - Fixture: **tổng hợp** (sinh trong bộ nhớ), không dùng tài liệu người dùng.
 * - Không đụng cổng 5050, không chạy AI thật.
 * - Nếu máy không có Microsoft Word: báo `NOT_VERIFIED` rõ ràng (không giả vờ PASS).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildWordCandidates } from "./support/wordCandidates.ts";

const WORD_EXE = "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE";
const HAS_WORD = fs.existsSync(WORD_EXE);
const PS_SCRIPT = path.resolve("test/support/inspect-word.ps1");

function inspect(docx: string, pdf: string, json: string): any {
  const out = execFileSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", PS_SCRIPT, "-Docx", docx, "-Pdf", pdf, "-Out", json],
    { encoding: "utf8", timeout: 180000 }
  );
  const text = String(out || "");
  if (!text.includes("WORD_OK")) {
    throw new Error(`Word COM không mở được tài liệu: ${text.trim().slice(0, 400)}`);
  }
  return JSON.parse(fs.readFileSync(json, "utf8").replace(/^\uFEFF/, ""));
}

test("Chặng 5 — Word thật: candidate NĐ30 và HD05 mở được, hình học phần đầu đúng và dấu phân cách không lặp", async (t) => {
  if (!HAS_WORD) {
    t.skip("NOT_VERIFIED: máy này không có Microsoft Word (" + WORD_EXE + ")");
    return;
  }
  assert.ok(fs.existsSync(PS_SCRIPT), "Phải có script kiểm tra Word trong test/support");

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage5-word-"));
  const evidenceDir = process.env.DOCFORM_STAGE5_EVIDENCE_DIR || workDir;
  fs.mkdirSync(evidenceDir, { recursive: true });

  try {
    const candidates = await buildWordCandidates(workDir);
    const hd05 = candidates.find(c => c.id === "hd05")!;
    const nd30 = candidates.find(c => c.id === "nd30")!;

    // ---------------- HD05 (hồ sơ Đảng ủy — profile S05) ----------------
    const hd05Pdf = path.join(evidenceDir, "stage5-word-hd05.pdf");
    const hd05Json = path.join(evidenceDir, "stage5-word-hd05.json");
    const h = inspect(hd05.file, hd05Pdf, hd05Json);
    console.log("[stage5-word] HD05:", JSON.stringify({
      word: `${h.wordVersion} build ${h.wordBuild}`,
      pages: h.pages,
      cellWidthsTwip: h.headerCellWidthsTwip,
      indentTwip: h.headerTableIndentTwip,
      separatorCount: h.separatorCount,
      date: h.dateParagraphText,
      dateFont: `${h.dateParagraphFont} ${h.dateParagraphSize}`,
      signature: h.signatureText,
    }));

    assert.equal(h.opened, true, "Word phải mở được candidate HD05");
    assert.ok(h.pages >= 1, "Candidate HD05 phải có ít nhất 1 trang");
    assert.deepEqual(
      h.headerCellWidthsTwip,
      [5580, 4590],
      "Hình học bảng phần đầu HD05 phải khớp mẫu header-reference.docx (5580/4590 twips)"
    );
    assert.equal(
      h.headerTableIndentTwip,
      -540,
      "Bảng phần đầu HD05 phải giữ thụt lề -540 twips như mẫu"
    );
    assert.equal(
      h.separatorCount,
      1,
      `Văn bản Đảng phải có đúng một dấu phân cách "-----" (thực tế: ${h.separatorCount})`
    );
    assert.ok(
      String(h.dateParagraphText || "").includes("Hải Phòng, ngày"),
      "Phần đầu phải có địa danh và ngày tháng"
    );
    assert.equal(h.dateParagraphSize, 14, "Ngày tháng hệ Đảng phải 14pt");
    assert.ok(
      String(h.signatureText || "").includes("BÍ THƯ"),
      "Khối chữ ký phải có chức vụ người ký"
    );
    assert.ok(fs.existsSync(hd05Pdf), "Word phải xuất được PDF");

    // ---------------- NĐ30 (hồ sơ Công ty) ----------------
    const nd30Pdf = path.join(evidenceDir, "stage5-word-nd30.pdf");
    const nd30Json = path.join(evidenceDir, "stage5-word-nd30.json");
    const n = inspect(nd30.file, nd30Pdf, nd30Json);
    console.log("[stage5-word] NĐ30:", JSON.stringify({
      word: `${n.wordVersion} build ${n.wordBuild}`,
      pages: n.pages,
      cellWidthsTwip: n.headerCellWidthsTwip,
      separatorCount: n.separatorCount,
      date: n.dateParagraphText,
      dateFont: `${n.dateParagraphFont} ${n.dateParagraphSize}`,
      signature: n.signatureText,
    }));

    assert.equal(n.opened, true, "Word phải mở được candidate NĐ30");
    assert.ok(n.pages >= 1, "Candidate NĐ30 phải có ít nhất 1 trang");
    assert.deepEqual(
      n.headerCellWidthsTwip,
      [4116, 5239],
      "Hình học bảng phần đầu NĐ30 phải là 4116/5239 twips"
    );
    assert.equal(
      n.separatorCount,
      0,
      "Văn bản hành chính không được có dấu phân cách '-----'"
    );
    assert.ok(
      String(n.dateParagraphText || "").includes("Hải Phòng, ngày"),
      "Phần đầu phải có địa danh và ngày tháng"
    );
    assert.equal(n.dateParagraphSize, 13, "Ngày tháng hệ hành chính phải 13pt");
    assert.ok(
      String(n.signatureText || "").includes("GIÁM ĐỐC"),
      "Khối chữ ký phải có chức vụ người ký"
    );
    assert.ok(fs.existsSync(nd30Pdf), "Word phải xuất được PDF");

    // ---------------- BIÊN BẢN (ba chữ ký + nơi nhận) ----------------
    const multi = candidates.find(c => c.id === "multi-signer")!;
    const multiPdf = path.join(evidenceDir, "stage5-word-multi-signer.pdf");
    const multiJson = path.join(evidenceDir, "stage5-word-multi-signer.json");
    const m = inspect(multi.file, multiPdf, multiJson);
    const signatureText = String(m.signatureText || "");
    console.log("[stage5-word] multi-signer:", JSON.stringify({ pages: m.pages, signature: signatureText }));
    assert.equal(m.opened, true, "Word phải mở được candidate ba chữ ký");
    assert.ok(m.pages >= 1, "Candidate ba chữ ký phải có ít nhất 1 trang");
    const orderedMarkers = ["CHỦ TRÌ", "Nguyễn An", "THƯ KÝ", "Trần Bình", "ĐẠI DIỆN ĐƠN VỊ", "Lê Chi", "Nơi nhận:", "- Như trên;", "- Lưu: VT."].map(x => signatureText.indexOf(x));
    assert.ok(orderedMarkers.every(x => x >= 0), "Word phải đọc đủ ba chữ ký và nơi nhận: " + signatureText);
    assert.ok(orderedMarkers.every((x, i) => i === 0 || orderedMarkers[i - 1] < x), "Nơi nhận phải theo sau đủ ba chữ ký: " + signatureText);
    assert.ok(fs.existsSync(multiPdf), "Word phải xuất được PDF cho candidate ba chữ ký");

    // Ghi lại bằng chứng để người kiểm độc lập xem lại
    fs.writeFileSync(
      path.join(evidenceDir, "stage5-word-summary.json"),
      JSON.stringify({ hd05: h, nd30: n, multiSigner: m }, null, 2),
      "utf8"
    );

    // Ảnh trang 1 (rasterise chính PDF do Word xuất) để kiểm bằng mắt
    try {
      const { rasterizePdfToPng } = await import("./support/rasterize-pdf.ts");
      const hd05Png = path.join(evidenceDir, "stage5-word-hd05-page1.png");
      const nd30Png = path.join(evidenceDir, "stage5-word-nd30-page1.png");
      const a = await rasterizePdfToPng(hd05Pdf, hd05Png, 9693);
      const b = await rasterizePdfToPng(nd30Pdf, nd30Png, 9694);
      console.log("[stage5-word] ảnh trang 1:", a ? "HD05 ok" : "HD05 fail", "/", b ? "NĐ30 ok" : "NĐ30 fail");
    } catch (e: any) {
      console.log("[stage5-word] không rasterise được PDF (không chặn cổng):", String(e.message).slice(0, 200));
    }

    console.log("[stage5-word] evidence:", evidenceDir);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
});
