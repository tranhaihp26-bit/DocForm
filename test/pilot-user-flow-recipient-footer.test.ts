import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { extractBlocksFromDocx } from "../src/server/blockExtractor.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";
import { reconstructFromReviewedBlocks } from "../src/utils/importReview.ts";
import { transactWorkspace } from "../src/utils/workspaceTransactions.ts";
import { createWorkspaceSnapshot, type WorkspaceSnapshot } from "../src/utils/workspaceState.ts";
import { preparePreviewDocument } from "../src/utils/previewDocument.ts";
import { generateND30DocxBuffer, parseRecipientLines } from "../src/utils/docxExport.ts";
import { validateND30Compliance, type DocumentFormatType, type DocumentState } from "../src/shared/schemas/document.schema.ts";

const FIXTURES_DIR = path.resolve(process.cwd(), "test/fixtures/recipient_samples");
const DOWNLOADS_PILOT = "C:\\Users\\GIAP\\Downloads\\01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx";

test("PILOT EVALUATION: Đánh giá độc lập toàn diện luồng người dùng 3 bước", async (t) => {
  // =========================================================================
  // GIAI ĐOẠN 1: BƯỚC 1 - NHẬP VÀ DUYỆT NGUỒN (IMPORT & SEGMENTATION)
  // =========================================================================
  await t.test("Bước 1: Bóc tách RecipientBlock độc lập, bảo toàn Thân bài trên tệp thật", async () => {
    const targetFile = fs.existsSync(DOWNLOADS_PILOT)
      ? DOWNLOADS_PILOT
      : path.join(FIXTURES_DIR, "02_ND30_CongVan_KinhGui_NhieuNoi.docx");

    const buffer = fs.readFileSync(targetFile);
    const { blocks } = await extractBlocksFromDocx(buffer);
    assert.ok(blocks.length > 5, "Tệp nguồn phải trích xuất được danh sách SourceBlock đầy đủ");

    const structured = segmentSourceBlocks(blocks, { standardType: "state" });

    // 1. Khối Kính gửi được bóc tách riêng
    assert.ok(structured.recipientHeader, "Bắt buộc phải bóc tách được recipientHeader");
    assert.equal(structured.recipientHeader.kind, "kinh_gui", "Thể thức hành chính phải là kinh_gui");
    assert.ok(structured.recipientHeader.items.length >= 1, "Phải có ít nhất 1 nơi nhận trong khối");

    // 2. Không bị nuốt hoặc nhân đôi vào Thân bài
    const bodyHtml = structured.body.html;
    assert.ok(!bodyHtml.includes("Kính gửi: Các phòng"), "Thân bài không được chứa dòng Kính gửi đã bóc tách");

    // 3. Tái tạo trạng thái qua reconstructFromReviewedBlocks (sử dụng reviewBlocks đã phân đoạn)
    const reconstructed = reconstructFromReviewedBlocks(structured.blocks || [], "state", structured);
    assert.ok(reconstructed.recipientHeader, "Reconstructed state phải lưu giữ recipientHeader");
    assert.equal(reconstructed.recipientHeader.items.length, structured.recipientHeader.items.length);
  });

  // =========================================================================
  // GIAI ĐOẠN 2: BƯỚC 2 - SOẠN THẢO STUDIO & QUẢN TRỊ KHỐI KÍNH GỬI (WORKSPACE TRANSACTIONS)
  // =========================================================================
  await t.test("Bước 2: Quản lý RecipientBlock qua Transaction, khôi phục vào Thân bài và chuyển đổi thể thức", async () => {
    const initialDoc: DocumentState = {
      headerProfile: "hoa-tieu-mien-bac-administrative-v1",
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      referenceNumber: "Số: 123/TB-CTHTHHMB",
      locationAndDate: "Hải Phòng, ngày 10 tháng 11 năm 2026",
      documentType: "THÔNG BÁO",
      subject: "Nghỉ lễ Ngày Văn hóa Việt Nam năm 2026",
      bodyHtml: "<p>Nội dung thông báo nghỉ lễ chi tiết...</p>",
      recipientHeader: {
        id: "rec-block-1",
        kind: "kinh_gui",
        presence: "confirmed",
        items: [
          { id: "i-1", text: "Các phòng chuyên môn nghiệp vụ Công ty" },
          { id: "i-2", text: "Các Chi nhánh Hoa tiêu III, IV, VI" },
        ],
      },
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Đức Thành",
      recipients: "- Chủ tịch Công ty (để báo cáo);\n- Ban Kiểm soát Công ty;\n- Lưu: HC, TCCB-LĐ.",
    };

    const snapshot = createWorkspaceSnapshot({
      doc: initialDoc,
      standardType: 'state',
      reviewBlocks: [],
      structuredImport: null,
    });
    assert.equal(snapshot.doc.recipientHeader?.items.length, 2);

    // Test Transaction 1: Cập nhật sửa đổi Khối Kính gửi
    const resUpdate = transactWorkspace(snapshot, snapshot.workspace.workingRevision, {
      type: "setRecipientHeader",
      recipientHeader: {
        id: "rec-block-1",
        kind: "kinh_gui",
        presence: "confirmed",
        items: [
          { id: "i-1", text: "Các phòng ban Công ty" },
          { id: "i-2", text: "Các Chi nhánh Hoa tiêu" },
          { id: "i-3", text: "Đơn vị trực thuộc" },
        ],
      },
    });

    assert.ok(resUpdate.ok, "Transaction cập nhật recipientHeader phải thành công");
    if (resUpdate.ok) {
      assert.equal(resUpdate.snapshot.doc.recipientHeader?.items.length, 3);
      assert.equal(resUpdate.snapshot.workspace.workingRevision, snapshot.workspace.workingRevision + 1);
    }

    // Test Transaction 2: Chuyển khối Kính gửi trở lại Thân bài (khôi phục nguồn)
    const currentSnap = resUpdate.ok ? resUpdate.snapshot : snapshot;
    const restoredBodyHtml = "<p><strong>Kính gửi:</strong><br/>- Các phòng ban Công ty<br/>- Các Chi nhánh</p>" + currentSnap.doc.bodyHtml;

    const resRestoreRec = transactWorkspace(currentSnap, currentSnap.workspace.workingRevision, {
      type: "setRecipientHeader",
      recipientHeader: undefined,
    });
    assert.ok(resRestoreRec.ok);

    const resRestoreBody = transactWorkspace(resRestoreRec.ok ? resRestoreRec.snapshot : currentSnap, (resRestoreRec.ok ? resRestoreRec.snapshot : currentSnap).workspace.workingRevision, {
      type: "editBody",
      html: restoredBodyHtml,
    });
    assert.ok(resRestoreBody.ok, "Khôi phục vào Thân bài phải thành công và cập nhật revision");
  });

  // =========================================================================
  // GIAI ĐOẠN 3: BƯỚC 3 - XEM TRƯỚC, ĐỐI CHIẾU & XUẤT CANDIDATE DOCX
  // =========================================================================
  await t.test("Bước 3: Xuất DOCX OOXML đạt tỷ lệ 52.14%/47.86%, padding 108 dxa, Shape Line 3 và chuẩn ngắt câu", async () => {
    const docData: DocumentFormatType = {
      regime: "administrative",
      headerProfile: "hoa-tieu-mien-bac-administrative-v1",
      fontFamily: "Times New Roman",
      fontSize: 13,
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      referenceNumber: "Số: 100/TB-CTHTHHMB",
      locationAndDate: "Hải Phòng, ngày 10 tháng 11 năm 2026",
      documentType: "THÔNG BÁO",
      subject: "Nghỉ lễ Ngày Văn hóa Việt Nam năm 2026",
      bodyHtml: "<p>Nội dung văn bản thông báo theo đúng quy chuẩn Nghị định số 30/2020/NĐ-CP.</p>",
      recipientHeader: {
        id: "rec-header-final",
        kind: "kinh_gui",
        presence: "confirmed",
        items: [
          { id: "1", text: "Các phòng chuyên môn nghiệp vụ Công ty" },
          { id: "2", text: "Các Chi nhánh Hoa tiêu III, IV, VI" },
        ],
      },
      signTitle: "GIÁM ĐỐC",
      signName: "Nguyễn Đức Thành",
      // Danh sách nơi nhận chưa có "- Như trên;" -> kiểm tra tự động bổ sung
      recipients: "- Chủ tịch Công ty (để báo cáo);\n- Ban Kiểm soát Công ty;\n- Lưu: HC, TCCB-LĐ.",
    };

    // 1. Kiểm tra Preview Model
    const previewData = preparePreviewDocument(docData, "administrative");
    assert.ok(previewData.recipientHeader, "Preview document phải nhận recipientHeader");

    // 2. Xuất buffer DOCX thật
    const docxBuffer = await generateND30DocxBuffer(docData);
    assert.ok(docxBuffer && docxBuffer.length > 5000, "DOCX Buffer phải được sinh thành công");

    // 3. Giải nén và mổ xẻ word/document.xml
    const zip = await JSZip.loadAsync(docxBuffer);
    const xml = await zip.file("word/document.xml")!.async("string");

    // -------------------------------------------------------------
    // KIỂM TRA PHẦN ĐẦU & SHAPE LINES (Đúng kế hoạch header_footer_nd30)
    // -------------------------------------------------------------
    // A. Chiều cao hàng 1 Header table: trHeight="1129" atLeast
    assert.ok(xml.includes('w:val="1129"'), "Header Table Hàng 1 phải có trHeight=1129");
    assert.ok(xml.includes('w:hRule="atLeast"'), "Header Table Hàng 1 phải có hRule=atLeast");

    // B. Ngày tháng căn giữa jc="center"
    assert.ok(xml.includes('<w:jc w:val="center"/>'), "Ngày tháng phần đầu phải căn giữa jc=center");

    // C. 3 Shape Lines:
    assert.ok(xml.includes("ND30 Plain Line 1"), "Phải có DrawingML Line 1 (Cơ quan)");
    assert.ok(xml.includes("ND30 Plain Line 2"), "Phải có DrawingML Line 2 (Tiêu ngữ)");
    assert.ok(xml.includes("ND30 Plain Line 3"), "Phải có DrawingML Line 3 (Dưới Trích yếu)");

    // -------------------------------------------------------------
    // KIỂM TRA KHỐI KÍNH GỬI (Đúng kế hoạch plan_kinh_gui_kinh_trinh)
    // -------------------------------------------------------------
    // A. Nhãn Kính gửi: thụt lề 720 dxa (1.27cm)
    assert.ok(xml.includes('<w:ind w:left="720"/>'), "Nhãn Kính gửi phải có thụt lề left=720");

    // B. Các dòng nơi nhận: thụt lề 2041 dxa, hanging 340 dxa, tab stop 2041 dxa
    assert.ok(xml.includes('w:left="2041"'), "Dòng nơi nhận phải có left=2041");
    assert.ok(xml.includes('w:hanging="340"'), "Dòng nơi nhận phải có hanging=340");
    assert.ok(xml.includes('w:pos="2041"'), "Dòng nơi nhận phải có tab stop pos=2041");

    // C. Ngắt câu thể thức: dòng 1 ngắt dấu ;, dòng cuối kết thúc bằng dấu .
    assert.ok(xml.includes("Các phòng chuyên môn nghiệp vụ Công ty;"), "Dòng 1 nơi nhận phải kết thúc dấu ;");
    assert.ok(xml.includes("Các Chi nhánh Hoa tiêu III, IV, VI."), "Dòng cuối nơi nhận phải kết thúc dấu .");

    // -------------------------------------------------------------
    // KIỂM TRA BẢNG CHỮ KÝ PHẦN CUỐI (Khớp 100% Ảnh 1)
    // -------------------------------------------------------------
    // A. Tỷ lệ cột: Nơi nhận 52.14% (2607 pct), Ký tên 47.86% (2393 pct)
    assert.match(xml, /<w:tcW[^>]*w:w="2607"[^>]*\/>/, "Cột Nơi nhận phải là 2607 pct (52.14%)");
    assert.match(xml, /<w:tcW[^>]*w:w="2393"[^>]*\/>/, "Cột Ký tên phải là 2393 pct (47.86%)");

    // B. Lưới cột tblGrid: 4878 dxa và 4476 dxa
    assert.ok(xml.includes('<w:gridCol w:w="4878"/>'), "Lưới cột 1 phải là 4878 dxa");
    assert.ok(xml.includes('<w:gridCol w:w="4476"/>'), "Lưới cột 2 phải là 4476 dxa");

    // C. Đệm ô tcMar: left và right = 108 dxa (~1.9mm)
    assert.match(xml, /<w:left[^>]*w:w="108"[^>]*\/>/, "Đệm lề trái ô phải là 108 dxa");
    assert.match(xml, /<w:right[^>]*w:w="108"[^>]*\/>/, "Đệm lề phải ô phải là 108 dxa");

    // D. Tự động bổ sung "- Như trên;" vào đầu bảng Nơi nhận cuối
    assert.ok(xml.includes("- Như trên;"), "Bảng nơi nhận cuối phải tự động có dòng '- Như trên;'");

    // E. Họ tên người ký và chức vụ căn giữa ô phải
    assert.ok(xml.includes("GIÁM ĐỐC"), "Phải có chức vụ GIÁM ĐỐC");
    assert.ok(xml.includes("Nguyễn Đức Thành"), "Phải có họ tên Nguyễn Đức Thành");

    // 4. Kiểm định Compliance Engine
    const report = validateND30Compliance(docData, "administrative");
    const errors = report.issues.filter(i => i.severity === "error");
    assert.equal(errors.length, 0, "Văn bản đạt 100% quy chuẩn NĐ 30, không có lỗi thể thức nào");
  });
});
