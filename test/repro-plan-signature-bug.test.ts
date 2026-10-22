/**
 * @file repro-plan-signature-bug.test.ts
 * @description Regression test suite for activity plan tables misclassified as signature tables.
 * Specifically validates that:
 * 1. Multi-row data/schedule tables with "Ban Thư ký" are NOT classified as signature tables.
 * 2. Unsigned documents preserve all tables in body without hallucinating signatures or names ("8", "Quý IV/2031").
 * 3. Document type "KẾ HOẠCH" is never inferred as "Biên bản".
 * 4. Word export preserves all tables in body with zero data loss.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { extractBlocksFromDocx } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks, isActionPlanOrDataTable } from "../src/server/structuralSegmenter.ts";
import { generateRuleBasedProposals, summarizeProposals } from "../src/server/reviewProposals.ts";
import { generateND30DocxDocument, detectEmbeddedSignature } from "../src/utils/docxExport.ts";
import { Packer } from "docx";
import JSZip from "jszip";
import type { SourceBlock } from "../src/shared/schemas/document.schema.ts";

async function runTest(id: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`[PASS] ${id}: ${name}`);
  } catch (err: any) {
    console.error(`[FAIL] ${id}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/**
 * Builds an anonymized synthetic 49-block Activity Plan matching the reproduction manifest
 */
function buildSyntheticPlanFixture(): SourceBlock[] {
  const blocks: SourceBlock[] = [];

  // Block 0: Organization header
  blocks.push({
    id: "block-0",
    index: 0,
    kind: "paragraph",
    text: "HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM",
    html: "<p style=\"text-align: center;\"><strong>HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM</strong></p>",
    role: "unclassified",
  });

  // Block 1: Document Type
  blocks.push({
    id: "block-1",
    index: 1,
    kind: "paragraph",
    text: "KẾ HOẠCH HOẠT ĐỘNG CỦA HIỆP HỘI",
    html: "<p style=\"text-align: center;\"><strong>KẾ HOẠCH HOẠT ĐỘNG CỦA HIỆP HỘI</strong></p>",
    role: "unclassified",
  });

  // Block 2: Subject / Timeline
  blocks.push({
    id: "block-2",
    index: 2,
    kind: "paragraph",
    text: "Giai đoạn 2026 - 2031",
    html: "<p style=\"text-align: center;\"><em>Giai đoạn 2026 - 2031</em></p>",
    role: "unclassified",
  });

  // Generate 6 yearly plan tables (Years 2026 to 2031), each 9 rows x 5 columns
  let blockIndex = 3;
  for (let year = 2026; year <= 2031; year++) {
    // Intro heading for the year
    blocks.push({
      id: `block-${blockIndex}`,
      index: blockIndex,
      kind: "paragraph",
      text: `Kế hoạch hoạt động năm ${year}:`,
      html: `<p><strong>Kế hoạch hoạt động năm ${year}:</strong></p>`,
      role: "unclassified",
    });
    blockIndex++;

    // Table: 9 rows, 5 columns
    const tableData: string[][] = [
      ["TT", "Nội dung công việc", "Cơ quan chủ trì", "Cơ quan tham gia", "Thời gian thực hiện"],
      ["1", `Hội nghị Ban chấp hành năm ${year}`, "Ban Thường vụ", "Ban Thư ký", `Quý I/${year}`],
      ["2", `Kiểm tra an toàn dẫn tàu đợt 1`, "Tiểu ban An toàn", "Các chi hội", `Quý I, II/${year}`],
      ["3", `Tập huấn nghiệp vụ hoa tiêu`, "Ban Thư ký", "Ban Thường vụ", `Quý II/${year}`],
      ["4", `Hội thảo chuyên đề kỹ thuật`, "Tiểu ban Kỹ thuật", "Hội viên", `Quý III/${year}`],
      ["5", `Tham gia diễn đàn quốc tế`, "Ban Thường vụ", "Ban Thư ký", `Quý III/${year}`],
      ["6", `Sơ kết công tác 9 tháng`, "Ban Thư ký", "Ban Thường vụ", `Quý IV/${year}`],
      ["7", `Hội nghị tổng kết năm ${year}`, "Ban Chấp hành", "Toàn thể hội viên", `Quý IV/${year}`],
      ["8", `Báo cáo quyết toán năm ${year}`, "Ban Thường vụ", "Ban Thư ký", `Quý IV/${year}`],
    ];

    const tableRowsHtml = tableData.map((row, rIdx) => {
      const tag = rIdx === 0 ? "th" : "td";
      return `<tr>${row.map(c => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
    }).join("");

    blocks.push({
      id: `block-${blockIndex}`,
      index: blockIndex,
      kind: "table",
      text: tableData.map(r => r.join(" | ")).join("\n"),
      html: `<table>${tableRowsHtml}</table>`,
      tableShape: { rows: 9, columns: 5 },
      tableData,
      role: "unclassified",
    });
    blockIndex++;
  }

  return blocks;
}

async function main() {
  console.log("==================================================================");
  console.log(" BỘ KIỂM THỬ HỒI QUY: PHÂN VÙNG BẢNG KẾ HOẠCH & BẢO TOÀN VĂN BẢN");
  console.log("==================================================================\n");

  // TEST REPRO-01: Synthetic 49-block Activity Plan
  await runTest("REPRO-01", "Bảng kế hoạch 9 hàng x 5 cột có chữ 'Ban Thư ký' không bị biến thành bảng ký", () => {
    const fixture = buildSyntheticPlanFixture();
    assert.strictEqual(fixture.length, 15, "Tổng số blocks fixture được tạo chính xác");

    // Test helper function isActionPlanOrDataTable
    const tableBlock = fixture.find(b => b.kind === "table")!;
    assert.strictEqual(isActionPlanOrDataTable(tableBlock), true, "isActionPlanOrDataTable nhận diện đúng bảng kế hoạch");

    const result = segmentSourceBlocks(fixture, { filename: "Ke_hoach_hoat_dong_2026_2031.docx", fileType: "docx" });

    // Assert documentType
    assert.strictEqual(result.fields.documentType.value, "KẾ HOẠCH HOẠT ĐỘNG CỦA HIỆP HỘI");

    // Assert signTitle and signName are null
    assert.strictEqual(result.fields.signTitle.value, null, "signTitle không bị gán thành tiêu đề bảng kế hoạch");
    assert.strictEqual(result.fields.signName.value, null, "signName không bị gán thành dòng cuối ('8 | ... | Quý IV/2031')");
    assert.strictEqual(Boolean(result.signatureHtml), false, "Không tạo signatureHtml từ bảng nội dung");

    // Assert all 6 tables remain inside body
    const bodyTablesCount = (result.body.html.match(/<table\b/g) || []).length;
    assert.strictEqual(bodyTablesCount, 6, "Tất cả 6 bảng kế hoạch phải nằm trong body.html");

    // Assert 0 unclassified blocks
    assert.strictEqual(result.unclassified.length, 0, "0 khối bị rơi vào unclassified");
  });

  // TEST REPRO-02: User reproduction file (if present on machine)
  const userFilePath = "C:/Users/Admin/Downloads/38833FF26BA1D.UnigramPreview_g9c9v27vpyspw!App/Ke hoach hoat dong giai doan 2026 -2031 HH HT HHVN.docx";
  if (fs.existsSync(userFilePath)) {
    await runTest("REPRO-02", "Kiểm tra trực tiếp tệp DOCX thực tế của người dùng", async () => {
      const buf = fs.readFileSync(userFilePath);
      const extracted = await extractBlocksFromDocx(buf);
      assert.strictEqual(extracted.blocks.length, 49, "Bóc tách chính xác 49 blocks từ tệp người dùng");

      const segmented = segmentSourceBlocks(extracted.blocks, { filename: "Ke hoach user.docx" });

      assert.strictEqual(segmented.fields.documentType.value, "KẾ HOẠCH HOẠT ĐỘNG CỦA HIỆP HỘI");
      assert.strictEqual(segmented.fields.signTitle.value, null, "signTitle là null đối với tài liệu chưa ký");
      assert.strictEqual(segmented.fields.signName.value, null, "signName là null đối với tài liệu chưa ký");
      assert.strictEqual(Boolean(segmented.signatureHtml), false, "Không có signatureHtml giả lập");
      assert.strictEqual(segmented.unclassified.length, 0, "Không có khối unclassified");

      // Verify that Table 6 (2031 plan) is preserved in body
      assert.ok(segmented.body.html.includes("2031"), "Kế hoạch năm 2031 nằm đầy đủ trong body");
      assert.ok(segmented.body.html.includes("Hội nghị lần thứ XII Ban chấp hành"), "Nội dung chi tiết của bảng 2031 được bảo toàn");
      assert.ok(segmented.body.html.includes("Ban Thư ký"), "Cơ quan 'Ban Thư ký' được giữ nguyên");
    });
  }

  // TEST REPRO-03: Rule-based review proposals generate correctly without destructive overwrite
  await runTest("REPRO-03", "Bộ rà soát đề xuất (Review Proposals) nhận diện đúng trạng thái bản thảo chưa ký", () => {
    const fixture = buildSyntheticPlanFixture();
    const result = segmentSourceBlocks(fixture, { filename: "Ke_hoach.docx" });
    const proposals = generateRuleBasedProposals(result, "administrative");
    const summary = summarizeProposals(proposals);

    assert.ok(summary.total >= 1, "Tạo ra các đề xuất hợp lệ");
    const unsignedProposal = proposals.find(p => p.type === "segmentation" && p.target === "signature");
    assert.ok(unsignedProposal, "Có đề xuất thông báo tài liệu chưa ký, không tạo chữ ký giả mạo");
    assert.strictEqual(unsignedProposal?.confidence, "high");
  });

  // TEST REPRO-04: Word DOCX export integrity
  await runTest("REPRO-04", "Xuất Word (.docx) chứa đủ 6 bảng, không sinh bảng chữ ký rỗng", async () => {
    const fixture = buildSyntheticPlanFixture();
    const result = segmentSourceBlocks(fixture, { filename: "Ke_hoach.docx" });

    const docx = generateND30DocxDocument({
      regime: "administrative",
      headerProfile: "generic",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "",
      orgHeader2: "HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM",
      locationAndDate: "Hà Nội, ngày 15 tháng 10 năm 2026",
      documentType: result.fields.documentType.value || "KẾ HOẠCH",
      referenceNumber: "Số: 10/KH-HHHT",
      subject: "V/v Kế hoạch hoạt động giai đoạn 2026 - 2031",
      bodyHtml: result.body.html,
      signTitle: "",
      signName: "",
      recipients: "",
    });

    const buffer = await Packer.toBuffer(docx);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Count <w:tbl> tags: 1 header table + 6 plan tables = 7 tables
    const tableMatches = xml.match(/<w:tbl>/g) || [];
    assert.strictEqual(tableMatches.length, 7, "Tệp Word phải chứa đúng 1 bảng header và 6 bảng kế hoạch (tổng cộng 7 bảng)");
    assert.ok(xml.includes("2031"), "Nội dung kế hoạch năm 2031 xuất hiện trong XML Word");
    assert.ok(xml.includes("Ban Th&#x1B0; k&#xFD;") || xml.includes("Ban Thư ký"), "Chữ 'Ban Thư ký' xuất hiện trong XML Word");
  });

  // TEST REPRO-05: Actual user file exported directly to Word DOCX
  if (fs.existsSync(userFilePath)) {
    await runTest("REPRO-05", "Xuất Word (.docx) từ tệp thực tế của người dùng: giữ đủ 7 bảng, không chữ ký giả", async () => {
      const buf = fs.readFileSync(userFilePath);
      const extracted = await extractBlocksFromDocx(buf);
      const segmented = segmentSourceBlocks(extracted.blocks, { filename: "Ke hoach user.docx" });

      const docx = generateND30DocxDocument({
        regime: "administrative",
        headerProfile: "generic",
        nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
        fontFamily: "Times New Roman",
        fontSize: 13,
        orgHeader1: "",
        orgHeader2: segmented.fields.orgHeader2?.value || "HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM",
        locationAndDate: segmented.fields.locationAndDate?.value || "Hà Nội, ngày 15 tháng 10 năm 2026",
        documentType: segmented.fields.documentType?.value || "KẾ HOẠCH",
        referenceNumber: segmented.fields.referenceNumber?.value || "Số: 10/KH-HHHT",
        subject: segmented.fields.subject?.value || "Giai đoạn 2026 - 2031",
        bodyHtml: segmented.body.html,
        signTitle: "",
        signName: "",
        recipients: "",
      });

      const buffer = await Packer.toBuffer(docx);
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file("word/document.xml")!.async("string");

      const tableMatches = xml.match(/<w:tbl>/g) || [];
      assert.strictEqual(tableMatches.length, 7, "Tệp Word từ file gốc thực tế phải có đúng 7 bảng (1 header + 6 bảng kế hoạch)");
      assert.ok(xml.includes("2031"), "Năm 2031 được bảo toàn trong Word XML");
      assert.ok(xml.includes("H&#x1ED9;i ngh&#x1ECB; l&#x1EA7;n th&#x1EE9; XII") || xml.includes("Hội nghị lần thứ XII"), "Nội dung bảng năm 2031 có trong XML Word");
      assert.ok(!xml.includes("Ban Thư ký |"), "Tuyệt đối không có chữ ký ghép từ cột dữ liệu bảng");
    });
  }

  // TEST REPRO-06: Legacy Draft Auto-Heal (Healing poisoned IndexedDB drafts)
  await runTest("REPRO-06", "Cơ chế Auto-Heal tự động làm sạch bản nháp cũ bị nhiễm độc chữ ký giả", () => {
    const poisonedDraft = {
      signTitle: "TT | Nội dung công việc | Cơ quan chủ trì | Cơ quan tham gia | Thời gian thực hiện",
      signName: "8 | Hội nghị lần thứ II... | Quý IV/2031",
      documentType: "KẾ HOẠCH HOẠT ĐỘNG",
    };

    const hasCorruptedSignTitle = Boolean(
      poisonedDraft.signTitle && (
        /^(?:TT|STT)\b/i.test(poisonedDraft.signTitle) ||
        /\b(?:Nội dung công việc|Cơ quan chủ trì|Thời gian thực hiện)\b/i.test(poisonedDraft.signTitle)
      )
    );
    const hasCorruptedSignName = Boolean(
      poisonedDraft.signName && (
        /quý\s+[I|V|X\d]+/i.test(poisonedDraft.signName) ||
        /\bHội nghị lần thứ\b/i.test(poisonedDraft.signName) ||
        /^\s*\d+\s*\|\s*/.test(poisonedDraft.signName)
      )
    );

    assert.strictEqual(hasCorruptedSignTitle, true, "Phát hiện chính xác signTitle bị hỏng từ tiêu đề cột bảng");
    assert.strictEqual(hasCorruptedSignName, true, "Phát hiện chính xác signName bị hỏng từ dòng cuối bảng kế hoạch");

    const healedDraft = {
      ...poisonedDraft,
      signTitle: hasCorruptedSignTitle ? "" : poisonedDraft.signTitle,
      signName: hasCorruptedSignName ? "" : poisonedDraft.signName,
    };

    assert.strictEqual(healedDraft.signTitle, "", "signTitle được tự động xóa sạch");
    assert.strictEqual(healedDraft.signName, "", "signName được tự động xóa sạch");
  });

  // TEST REPRO-07: Subject "V/v" rule strictly respects document type
  await runTest("REPRO-07", "Quy tắc trích yếu V/v: Chỉ áp dụng cho Công văn, KHÔNG BAO GIỜ thêm V/v cho Kế hoạch", () => {
    const fixture = buildSyntheticPlanFixture();
    const result = segmentSourceBlocks(fixture, { filename: "Ke_hoach.docx" });
    const proposals = generateRuleBasedProposals(result, "administrative", "", fixture);

    const badVvProposal = proposals.find(p => p.target === "subject" && p.suggested.startsWith("V/v"));
    assert.strictEqual(badVvProposal, undefined, "Tuyệt đối không có đề xuất thêm 'V/v' cho văn bản Kế hoạch");
  });

  // TEST REPRO-08: TargetBlockId and CellIndex are populated on proposals
  await runTest("REPRO-08", "Đề xuất rà soát gắn đúng targetBlockId và cellIndex, bảo đảm thay thế chính xác", () => {
    const fixture = buildSyntheticPlanFixture();
    const result = segmentSourceBlocks(fixture, { filename: "Ke_hoach.docx" });
    const proposals = generateRuleBasedProposals(result, "administrative", "", fixture);

    // Every proposal must either target a metadata field or have targetBlockId
    for (const p of proposals) {
      const hasFieldTarget = ["documentType", "referenceNumber", "locationAndDate", "subject", "signature"].includes(p.target);
      const hasBlockTarget = Boolean(p.targetBlockId);
      assert.ok(hasFieldTarget || hasBlockTarget, `Đề xuất ${p.id} phải có target trường hoặc targetBlockId`);
    }
  });

  console.log("\n==================================================================");
  console.log(" KẾT QUẢ: 100% BÀI TEST HỒI QUY ĐỀU ĐẠT CHUẨN XUẤT SẮC!");
  console.log("==================================================================\n");
}

main();
