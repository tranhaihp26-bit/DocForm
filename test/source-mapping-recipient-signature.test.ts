import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { extractBlocksFromDocx } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { prepareImportedFileBundle } from "../src/utils/importSessionLifecycle.ts";
import { createWorkspaceSnapshot, workspaceInvariantErrors } from "../src/utils/workspaceState.ts";
import { approveWorkspacePartition, transactWorkspace } from "../src/utils/workspaceTransactions.ts";
import { buildSourceToWorkspaceCoverage } from "../src/shared/sourceMapping.ts";
import { preparePreviewDocument } from "../src/utils/previewDocument.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";
import { validateND30Compliance } from "../src/shared/schemas/document.schema.ts";

const TARGET_DOCX = "C:\\Users\\GIAP\\Downloads\\01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_-DocForm-ND30 (1).docx";

test("PIPELINE TEST: Khắc phục lỗi missing_recipients_destination và missing_signature_destination, kiểm tra từ đầu đến khi xuất kết quả", async (t) => {
  assert.ok(fs.existsSync(TARGET_DOCX), `Tệp kiểm thử phải tồn tại tại ${TARGET_DOCX}`);
  const buffer = fs.readFileSync(TARGET_DOCX);

  // =========================================================================
  // GIAI ĐOẠN 1: BƯỚC 1 - NHẬP VÀ PHÂN ĐOẠN NGUỒN (IMPORT & SEGMENTATION)
  // =========================================================================
  let snapshot: any;
  let structured: any;

  await t.test("Bước 1: Trích xuất và phân đoạn chính xác cấu trúc văn bản Thông báo", async () => {
    const { blocks } = await extractBlocksFromDocx(buffer);
    assert.ok(blocks.length >= 15, `Số lượng block phải đạt chuẩn văn bản (thực tế: ${blocks.length})`);

    structured = segmentSourceBlocks(blocks, { standardType: "state" });

    // Kiểm tra bóc tách khối Kính gửi (recipientHeader)
    assert.ok(structured.recipientHeader, "Phải bóc tách thành công recipientHeader");
    assert.equal(structured.recipientHeader.kind, "kinh_gui");
    assert.equal(structured.recipientHeader.items.length, 2, "Khối Kính gửi có 2 nơi nhận");
    assert.equal(structured.recipientHeader.items[0].text, "Các phòng chuyên môn nghiệp vụ Công ty");
    assert.equal(structured.recipientHeader.items[1].text, "Các Chi nhánh Hoa tiêu III, IV, VI");

    // Kiểm tra bảng chữ ký cuối (block-15)
    assert.ok(structured.fields.recipients?.value?.includes("Chủ tịch Công ty"), "Nơi nhận cuối phải bóc tách đúng");
    assert.ok(structured.fields.signTitle?.value?.includes("GIÁM ĐỐC"), "Chức vụ người ký phải là GIÁM ĐỐC");
    assert.ok(structured.fields.signName?.value?.includes("Nguyễn Đức Thành"), "Họ tên người ký phải là Nguyễn Đức Thành");

    // Chuẩn bị bundle và tạo snapshot
    const bundle = prepareImportedFileBundle(
      {
        filename: "01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_-DocForm-ND30 (1).docx",
        fileType: "docx",
        blocks,
        structured,
        blockCount: blocks.length,
        html: "",
        text: "",
        storageStatus: { ok: true, sourceHash: "pilot-test-hash" } as any,
      },
      "state"
    );

    snapshot = createWorkspaceSnapshot(
      {
        doc: bundle.doc,
        standardType: "state",
        reviewBlocks: bundle.reviewBlocks,
        structuredImport: structured,
      },
      {
        blobHash: "pilot-test-hash",
        generation: 1,
        blocks: bundle.reviewBlocks,
      }
    );
    assert.ok(snapshot, "Tạo WorkspaceSnapshot thành công");
  });

  // =========================================================================
  // GIAI ĐOẠN 2: KIỂM ĐỊNH SOURCE COVERAGE & APPROVAL GATE
  // =========================================================================
  await t.test("Coverage Gate: Xóa bỏ triệt để vi phạm missing_recipients_destination và missing_signature_destination", async () => {
    // 1. Kiểm tra Source Coverage trực tiếp
    const coverage = buildSourceToWorkspaceCoverage(snapshot);
    const violations = coverage.violations;

    assert.equal(
      violations.filter(v => v.includes("missing_recipients_destination")).length,
      0,
      `Không được còn bất kỳ lỗi missing_recipients_destination nào (thực tế: ${violations.join(", ")})`
    );
    assert.equal(
      violations.filter(v => v.includes("missing_signature_destination")).length,
      0,
      `Không được còn bất kỳ lỗi missing_signature_destination nào (thực tế: ${violations.join(", ")})`
    );

    // 2. Kiểm tra Invariant Errors của Workspace
    const invErrors = workspaceInvariantErrors(snapshot);
    assert.deepEqual(invErrors, [], `Workspace Invariant Errors phải hoàn toàn rỗng (thực tế: ${invErrors.join(", ")})`);

    // 3. Kiểm tra duyệt phân vùng (Approve Workspace Partition)
    const approved = approveWorkspacePartition(snapshot);
    assert.equal(approved.ok, true, "Phê duyệt phân vùng Step 1 phải thành công");
    if (approved.ok) {
      snapshot = approved.snapshot;
    }
  });

  // =========================================================================
  // GIAI ĐOẠN 3: BƯỚC 2 - SOẠN THẢO VÀ GIAO DỊCH WORKSPACE (TRANSACTIONS)
  // =========================================================================
  await t.test("Bước 2: Các giao dịch chỉnh sửa (editField, setRecipientHeader) thực hiện trơn tru không lỗi", async () => {
    // Giao dịch 1: Cập nhật trường Trích yếu
    const resEditSubject = transactWorkspace(snapshot, snapshot.workspace.workingRevision, {
      type: "editField",
      field: "subject",
      value: "Nghỉ lễ Ngày Văn hóa Việt Nam năm 2026 (Đã cập nhật)",
    });
    assert.equal(resEditSubject.ok, true, "Giao dịch editField phải thành công");
    if (resEditSubject.ok) snapshot = resEditSubject.snapshot;

    // Giao dịch 2: Cập nhật Khối Kính gửi (thêm nơi nhận thứ 3)
    const currentRecHeader = snapshot.doc.recipientHeader;
    assert.ok(currentRecHeader, "Snapshot phải có recipientHeader");

    const resUpdateRec = transactWorkspace(snapshot, snapshot.workspace.workingRevision, {
      type: "setRecipientHeader",
      recipientHeader: {
        ...currentRecHeader,
        items: [
          ...currentRecHeader.items,
          { id: "recipient-3", text: "Văn phòng và các Đội trực thuộc" },
        ],
      },
    });
    assert.equal(resUpdateRec.ok, true, "Giao dịch setRecipientHeader phải thành công");
    if (resUpdateRec.ok) {
      snapshot = resUpdateRec.snapshot;
      assert.equal(snapshot.doc.recipientHeader?.items.length, 3);
    }
  });

  // =========================================================================
  // GIAI ĐOẠN 4: BƯỚC 3 - XEM TRƯỚC VÀ XUẤT CANDIDATE DOCX
  // =========================================================================
  await t.test("Bước 3: Chuẩn bị xem trước và xuất kết quả DOCX đạt 100% quy chuẩn NĐ 30", async () => {
    // 1. Chuẩn bị bản xem trước
    const previewDoc = preparePreviewDocument(snapshot.doc, "administrative");
    assert.ok(previewDoc.recipientHeader, "Bản xem trước phải có recipientHeader");
    assert.equal(previewDoc.recipientHeader.items.length, 3);

    // 2. Xuất DOCX OOXML Candidate thật
    const candidateDocxBuffer = await generateND30DocxBuffer(previewDoc);
    assert.ok(candidateDocxBuffer && candidateDocxBuffer.length > 5000, "DOCX buffer phải được tạo thành công");

    // 3. Phân tích nội dung OOXML trong word/document.xml
    const zip = await JSZip.loadAsync(candidateDocxBuffer);
    const xml = await zip.file("word/document.xml")!.async("string");

    // Shape Lines: đủ 3 đường kẻ
    assert.ok(xml.includes("ND30 Plain Line 1"), "Phải có Line 1 dưới tên cơ quan");
    assert.ok(xml.includes("ND30 Plain Line 2"), "Phải có Line 2 dưới Tiêu ngữ");
    assert.ok(xml.includes("ND30 Plain Line 3"), "Phải có Line 3 dưới Trích yếu");

    // Khối Kính gửi:
    assert.ok(xml.includes('<w:ind w:left="720"/>'), "Nhãn Kính gửi thụt lề 720 dxa");
    assert.ok(xml.includes("Các phòng chuyên môn nghiệp vụ Công ty;"), "Nơi nhận 1 ngắt dấu ;");
    assert.ok(xml.includes("Các Chi nhánh Hoa tiêu III, IV, VI;"), "Nơi nhận 2 ngắt dấu ;");
    assert.ok(xml.includes("Văn phòng và các Đội trực thuộc."), "Nơi nhận 3 ngắt dấu .");

    // Bảng chữ ký cuối:
    assert.match(xml, /<w:tcW[^>]*w:w="2607"[^>]*\/>/, "Cột Nơi nhận 52.14% (2607 pct)");
    assert.match(xml, /<w:tcW[^>]*w:w="2393"[^>]*\/>/, "Cột Chữ ký 47.86% (2393 pct)");
    assert.match(xml, /<w:left[^>]*w:w="108"[^>]*\/>/, "Cell padding 108 dxa");
    assert.ok(xml.includes("- Như trên;"), "Bảng nơi nhận cuối tự động có '- Như trên;'");
    assert.ok(xml.includes("GIÁM ĐỐC"), "Phải có chức vụ GIÁM ĐỐC");
    assert.ok(xml.includes("Nguyễn Đức Thành"), "Phải có họ tên Nguyễn Đức Thành");

    // 4. Kiểm định Compliance Engine
    const report = validateND30Compliance(previewDoc, "administrative");
    const errors = report.issues.filter(i => i.severity === "error");
    assert.equal(errors.length, 0, "Văn bản đạt 100% tuân thủ Nghị định 30, 0 lỗi");
  });
});
