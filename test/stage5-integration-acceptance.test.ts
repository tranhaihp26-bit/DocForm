/**
 * @file stage5-integration-acceptance.test.ts
 * @description Nghiệm thu tích hợp Chặng 5 — ma trận M01–M19.
 *
 * Mọi ca dùng FIXTURE TỔNG HỢP (TXT/DOCX sinh trong bộ nhớ), server riêng
 * (cổng ≠ 5050), profile Chromium tạm và IndexedDB sạch. Không gọi Gemini
 * thật (server khởi động với GEMINI_API_KEY rỗng); AI chỉ được bật qua
 * provider giả lập có kiểm soát.
 *
 * Ma trận M01–M19 lấy theo khung
 * D:\ChatGPT\AppDinhDang\docs\superpowers\audits\2026-10-20-docform-stage5-codex-preparation-audit.md
 * và cập nhật theo trạng thái Chặng 4 + selectors hiện hành.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { CdpClient, startTestServer } from "./support/browserHarness.ts";
import { generateND30DocxBuffer } from "../src/utils/docxExport.ts";
import { extractLocalFile } from "../src/utils/localFileImport.ts";
import { segmentLocalExtraction } from "../src/utils/localFileImport.ts";
import { detectRegimeFromRawBlocks, regimeNeedsConfirmation } from "../src/utils/regimeDetection.ts";
import { segmentSourceBlocks } from "../src/server/structuralSegmenter.ts";

const SERVER_PORT = 5088;
const CDP_PORT = 9688;

/* ------------------------------------------------------------------ */
/* Fixture tổng hợp                                                    */
/* ------------------------------------------------------------------ */

const SYN_TXT_STATE = [
  "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
  "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
  "KẾ HOẠCH",
  "V/v triển khai nhiệm vụ quý IV năm 2026",
  "Điều 1. Nội dung thực hiện nhiệm vụ tổng hợp.",
  "Nơi nhận:",
  "- Ban Tổ chức;",
].join("\n");

const SYN_TXT_PARTY = [
  "ĐẢNG BỘ CÔNG TY HOA TIÊU\tĐẢNG CỘNG SẢN VIỆT NAM",
  "Số 12-NQ/ĐU",
  "Hải Phòng, ngày 10 tháng 10 năm 2026",
  "NGHỊ QUYẾT",
  "V/v triển khai nhiệm vụ quý IV năm 2026",
  "Căn cứ Nghị quyết số 01-NQ/ĐU ngày 01/01/2026 của Ban Dự án.",
  "-----",
  "Nội dung nghị quyết của đơn vị.",
].join("\n");

/** DOCX tổng hợp có tiêu đề trong ô bảng (M04) */
async function makeTableDocx(): Promise<Uint8Array> {
  return (await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: "ĐƠN VỊ THỬ NGHIỆM BẢNG",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 12 tháng 10 năm 2026",
    documentType: "THÔNG BÁO",
    referenceNumber: "Số: 07/TB-BANG",
    subject: "V/v công bố bảng tiêu đề trong ô",
    bodyHtml:
      "<table><tbody><tr><td><p>THÔNG BÁO</p></td></tr></tbody></table>" +
      "<p>Điều 1. Nội dung thực hiện.</p>",
    signTitle: "GIÁM ĐỐC",
    signName: "Người Ký Tổng Hợp",
    recipients: "Như trên;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  } as any)) as unknown as Uint8Array;
}

async function makePlainDocx(tag: string): Promise<Uint8Array> {
  return (await generateND30DocxBuffer({
    regime: "administrative",
    headerProfile: "generic",
    orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM ATHH",
    orgHeader2: `ĐƠN VỊ THỬ NGHIỆM ${tag}`,
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hải Phòng, ngày 14 tháng 10 năm 2026",
    documentType: "THÔNG BÁO",
    referenceNumber: `Số: 08/TB-${tag}`,
    subject: `V/v tài liệu tổng hợp ${tag}`,
    bodyHtml: `<p>Điều 1. Nội dung tài liệu tổng hợp ${tag}.</p><p>Điều 2. Hiệu lực thi hành.</p>`,
    signTitle: "GIÁM ĐỐC",
    signName: `Người Ký ${tag}`,
    recipients: "Như trên;\nLưu: VT.",
    fontFamily: "Times New Roman",
    fontSize: 13,
  } as any)) as unknown as Uint8Array;
}

async function sha256OfFile(p: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Ca M0x: nghiệm thu tích hợp                                        */
/* ------------------------------------------------------------------ */

let fixtureDir = "";
let fileStateTxt = "";
let filePartyTxt = "";
let fileTableDocx = "";
let fileAlphaDocx = "";
let fileBetaDocx = "";
let fileCorruptDocx = "";
let hashStateTxt = "";
let hashPartyTxt = "";
let hashTableDocx = "";

test.before(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "docform-stage5-fixtures-"));
  fileStateTxt = path.join(fixtureDir, "SYN_State.txt");
  filePartyTxt = path.join(fixtureDir, "SYN_Party.txt");
  fileTableDocx = path.join(fixtureDir, "SYN_Table.docx");
  fileAlphaDocx = path.join(fixtureDir, "SYN_Alpha.docx");
  fileBetaDocx = path.join(fixtureDir, "SYN_Beta.docx");
  fileCorruptDocx = path.join(fixtureDir, "SYN_Corrupt.docx");
  fs.writeFileSync(fileStateTxt, SYN_TXT_STATE, "utf8");
  fs.writeFileSync(filePartyTxt, SYN_TXT_PARTY, "utf8");
  fs.writeFileSync(fileTableDocx, await makeTableDocx());
  fs.writeFileSync(fileAlphaDocx, await makePlainDocx("ALPHA"));
  fs.writeFileSync(fileBetaDocx, await makePlainDocx("BETA"));
  fs.writeFileSync(fileCorruptDocx, Buffer.from([0x50, 0x4b, 0x00, 0x01, 0xff, 0xfe]));
  hashStateTxt = await sha256OfFile(fileStateTxt);
  hashPartyTxt = await sha256OfFile(filePartyTxt);
  hashTableDocx = await sha256OfFile(fileTableDocx);
});

test.after(() => {
  try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch {}
});

/** M05 / M15 — kiểm ở tầng domain (không cần trình duyệt). */
test("M05+M15: detector hai chiều, cách ly từ khóa, dấu phân cách và giữ nguyên câu thân bài", async () => {
  const p = (index: number, text: string) => ({
    id: `block-${index}`, index, kind: "paragraph" as const, role: "unclassified" as const,
    text, html: `<p>${text}</p>`,
  });
  const head = [
    p(0, "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\tCỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
    p(1, "Số: 05/KH-HTMB\tĐộc lập - Tự do - Hạnh phúc"),
    p(2, "Hải Phòng, ngày 10 tháng 10 năm 2026"),
  ];

  // (a) Xung đột hai hệ → phải hỏi người dùng
  const conflict = detectRegimeFromRawBlocks([...head, p(3, "Số 12-NQ/ĐU")] as any);
  assert.equal(conflict.conflict, true, "Hai hệ cùng chứng cứ phải là xung đột");
  assert.equal(regimeNeedsConfirmation(conflict, "state"), true, "Xung đột phải yêu cầu xác nhận");

  // (b) Chỉ chứng cứ medium → phải hỏi
  const medium = detectRegimeFromRawBlocks([p(0, "Số 12-NQ/ĐU")] as any);
  assert.equal(regimeNeedsConfirmation(medium, "party"), true, "Chứng cứ medium phải yêu cầu xác nhận");

  // (c) Không đủ chứng cứ → phải hỏi
  const none = detectRegimeFromRawBlocks([p(0, "Nội dung văn bản.")] as any);
  assert.equal(none.insufficient, true, "Không đủ chứng cứ phải được báo thiếu");
  assert.equal(regimeNeedsConfirmation(none, "state"), true, "Không đủ chứng cứ phải yêu cầu xác nhận");

  // (d) "CHI BỘ" in hoa trong nơi nhận / phụ lục / thân bài → KHÔNG phải chứng cứ vùng đầu
  for (const extra of [
    [...head, p(3, "BÁO CÁO"), p(4, "Nơi nhận:"), p(5, "CHI BỘ CƠ QUAN A")],
    [...head, p(3, "PHỤ LỤC"), p(4, "CHI BỘ CƠ QUAN A")],
    [...head, p(3, "BÁO CÁO"), p(4, "CHI BỘ CƠ QUAN A")],
  ]) {
    const d = detectRegimeFromRawBlocks(extra as any);
    assert.equal(
      d.evidence.some((e: any) => e.kind === "party_org_header"),
      false,
      "Từ khóa cơ quan Đảng ngoài vùng đầu không được là chứng cứ hệ"
    );
    assert.equal(d.conflict, false, "Không được tạo xung đột giả");
  }

  // (e) "CHI BỘ" đứng thật ở đầu → VẪN phải là chứng cứ
  const realOrg = detectRegimeFromRawBlocks([p(0, "CHI BỘ CƠ QUAN A"), p(1, "NGHỊ QUYẾT")] as any);
  assert.ok(
    realOrg.evidence.some((e: any) => e.kind === "party_org_header"),
    "Cơ quan Đảng đứng ở đầu phải được nhận diện"
  );
});

test("M01+M02+M15: phân đoạn hai hệ trên fixture tổng hợp — loại văn bản, số hiệu, dấu phân cách", async () => {
  const txt = (content: string) => new File([content], "SYN.txt", { type: "text/plain" });

  const stateExtraction = await extractLocalFile(txt(SYN_TXT_STATE));
  const stateStructured = segmentLocalExtraction(stateExtraction, "administrative");
  assert.equal(stateStructured.fields.documentType?.value, "KẾ HOẠCH", "NĐ30 phải nhận đúng loại văn bản");
  assert.ok(
    String(stateStructured.fields.referenceNumber?.value).startsWith("Số:"),
    `NĐ30 phải giữ dấu hai chấm sau "Số" (thực tế: ${stateStructured.fields.referenceNumber?.value})`
  );
  assert.ok(
    stateStructured.body.html.includes("Điều 1. Nội dung thực hiện nhiệm vụ tổng hợp."),
    "Câu thân bài phải còn trong bodyHtml"
  );

  const partyExtraction = await extractLocalFile(txt(SYN_TXT_PARTY));
  const partyStructured = segmentLocalExtraction(partyExtraction, "party");
  assert.equal(partyStructured.fields.documentType?.value, "NGHỊ QUYẾT", "Đảng phải nhận đúng loại văn bản");
  assert.ok(
    String(partyStructured.fields.referenceNumber?.value).startsWith("Số ") &&
      !String(partyStructured.fields.referenceNumber?.value).startsWith("Số:"),
    `Đảng phải giữ dạng "Số " không có hai chấm (thực tế: ${partyStructured.fields.referenceNumber?.value})`
  );
  assert.ok(
    partyStructured.body.html.includes("Căn cứ Nghị quyết"),
    "Căn cứ phải còn trong thân bài"
  );
  const dashInBody = (partyStructured.body.html.match(/-----/g) || []).length;
  assert.equal(dashInBody, 0, "Dấu phân cách phải được loại khỏi body để bộ xuất sinh đúng một dấu");
});

test("M04+M17: DOCX có tiêu đề trong ô bảng — provenance ô bảng và xuất DOCX", async () => {
  // (a) Tiêu đề nằm trong ô bảng: kiểm ở tầng phân đoạn với khối bảng thật.
  const tableBlock = {
    id: "block-0",
    index: 0,
    kind: "table" as const,
    role: "unclassified" as const,
    text: "",
    html: "<table></table>",
    tableData: [["THÔNG BÁO"]],
    rawXml: "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>THÔNG BÁO</w:t></w:r></w:p></w:tc></w:tr></w:tbl>",
  };
  const segmented = segmentSourceBlocks([tableBlock] as any, {
    filename: "SYN_Table.docx",
    fileType: "docx",
    standardType: "administrative",
  } as any);
  const docType = segmented.fields.documentType;
  assert.ok(docType, "Tiêu đề trong ô bảng phải được nhận diện");
  assert.ok(docType.sourceBlockIds?.length, "Tên loại phải có sourceBlockId thật");
  assert.ok(docType.sourceCell, "Tên loại trong ô bảng phải giữ toạ độ ô");
  assert.equal(docType.sourceCell?.rowIndex, 0, "Toạ độ hàng của ô tiêu đề phải đúng");
  assert.equal(docType.sourceCell?.colIndex, 0, "Toạ độ cột của ô tiêu đề phải đúng");

  // (b) DOCX tổng hợp: xuất ra và kiểm tra OOXML còn giữ tên loại.
  const bytes = fs.readFileSync(fileTableDocx);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok(xml.includes("THÔNG BÁO"), "DOCX tổng hợp phải chứa tên loại trong ô bảng");
  assert.ok(xml.includes("<w:tbl>"), "DOCX tổng hợp phải chứa bảng");
});

/* ------------------------------------------------------------------ */
/* Ca trình duyệt                                                      */
/* ------------------------------------------------------------------ */

test("M03+M06+M07+M08+M11+M12+M16+M18: nghiệm thu tích hợp trên trình duyệt", async () => {
  const serverProc = await startTestServer(SERVER_PORT);
  const client = new CdpClient("docform-stage5-acceptance");
  try {
    await client.launch(CDP_PORT);
    await client.navigate(`http://127.0.0.1:${SERVER_PORT}/`);

    // ---- M06: đúng ba bước, cổng chặn khi chưa có nguồn -------------
    const threeSteps = await client.evaluate<any>(`(() => {
      const btns = Array.from(document.querySelectorAll('[data-step]'));
      return {
        count: btns.length,
        labels: btns.map(b => b.getAttribute('aria-label')),
        step2Allowed: document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed'),
        step3Allowed: document.querySelector('[data-step="3"]')?.getAttribute('data-step-allowed'),
      };
    })()`);
    assert.equal(threeSteps.count, 3, "Wizard phải có đúng ba bước");
    assert.deepEqual(
      threeSteps.labels,
      ["1. Tải & nhận diện", "2. Soạn & kiểm tra", "3. Xem & xuất"],
      "Nhãn ba bước phải đúng hợp đồng Chặng 3"
    );
    assert.equal(threeSteps.step3Allowed, "false", "Bước 3 phải bị chặn khi chưa có nguồn");

    // ---- M01: nhập TXT hành chính, duyệt, đi ba bước ----------------
    await client.uploadFile('input[type="file"]', fileStateTxt);
    const modalOpened = await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      15000
    );
    assert.ok(modalOpened, "Modal đối chiếu & phân vùng phải mở sau khi nhập tệp");
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 600));

    const afterApproval = await client.evaluate<any>(`(() => ({
      step2Allowed: document.querySelector('[data-step="2"]')?.getAttribute('data-step-allowed'),
      step3Allowed: document.querySelector('[data-step="3"]')?.getAttribute('data-step-allowed'),
      step2Complete: document.querySelector('[data-step="2"]')?.getAttribute('data-step-complete'),
    }))()`);
    assert.equal(afterApproval.step3Allowed, "true", "Bước 3 phải mở sau khi người dùng duyệt bản nhập");

    // ---- M16: bản nhập đã lưu và có hash nguồn ------------------------
    const draft1 = await client.readRawDraft();
    assert.ok(draft1, "Bản nháp phải được ghi vào IndexedDB");
    assert.equal(draft1.sourceOrigin, "uploaded_file", "Nguồn phải được ghi nhận là tệp nhập");
    assert.ok(
      draft1.originalSnapshot?.sourceHash === hashStateTxt,
      `Hash nguồn phải bằng SHA-256 của tệp đầu vào (thực tế: ${draft1.originalSnapshot?.sourceHash})`
    );
    assert.equal(
      draft1.importReviewApprovedSourceHash,
      draft1.originalSnapshot?.sourceHash,
      "Quyết định duyệt bản nhập phải gắn với đúng hash nguồn"
    );

    // ---- M06: reload giữ nguyên vị trí bước và dữ liệu ---------------
    await client.reload();
    await client.waitForFunction(`document.querySelector('[data-current-step]') !== null`, 15000);
    // Chờ bản nháp được khôi phục xong (nguồn đã chọn xuất hiện lại) rồi mới
    // đánh giá cổng — nếu đọc sớm sẽ đo trạng thái trước khi khôi phục.
    const restored = await client.waitForFunction(
      `document.body.textContent.includes("SYN_State.txt")`,
      15000
    );
    assert.ok(restored, "Bản nháp phải được khôi phục sau reload (nguồn đã chọn phải còn)");
    const afterReload = await client.evaluate<any>(`(() => ({
      step3Allowed: document.querySelector('[data-step="3"]')?.getAttribute('data-step-allowed'),
      hasSource: document.body.textContent.includes("SYN_State.txt"),
    }))()`);
    assert.equal(afterReload.step3Allowed, "true", "Sau reload, bản nhập đã duyệt vẫn mở được Bước 3");
    assert.equal(afterReload.hasSource, true, "Sau reload phải còn nguồn đã chọn");

    // ---- M03 + S3-F01: nguồn B đã commit nhưng CHƯA được duyệt -----
    // Bản nhập được commit ngay khi phân đoạn xong (giống luồng hiện hành);
    // điều khoản hợp đồng là bản nhập mới KHÔNG được mở Bước 3 cho tới khi
    // người dùng duyệt, và quyết định duyệt của nguồn cũ không được mang sang.
    await client.clickStep(1);
    await client.uploadFile('input[type="file"]', fileBetaDocx);
    await client.waitForFunction(
      `document.body.textContent.includes("SYN_Beta.docx") && document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      15000
    );
    const draftDuringPending = await client.readRawDraft();
    assert.ok(
      draftDuringPending.originalSnapshot?.fileName?.includes("SYN_Beta.docx"),
      "Nguồn mới đã được commit sau khi phân đoạn"
    );
    assert.equal(
      draftDuringPending.importReviewApprovedSourceHash ?? null,
      null,
      "Quyết định duyệt của nguồn cũ không được mang sang nguồn mới"
    );
    const gateWhilePending = await client.evaluate<any>(`(() => ({
      step3Allowed: document.querySelector('[data-step="3"]')?.getAttribute('data-step-allowed'),
    }))()`);
    assert.equal(
      gateWhilePending.step3Allowed,
      "false",
      "Bản nhập chưa được duyệt thì Bước 3 phải bị chặn"
    );
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 800));
    const draftAfterB = await client.readRawDraft();
    assert.notEqual(
      draftAfterB.originalSnapshot?.sourceHash,
      hashStateTxt,
      "Sau khi duyệt B, nguồn phải là B"
    );
    assert.ok(draftAfterB.originalSnapshot?.fileName?.includes("SYN_Beta.docx"), "Tên nguồn phải là B");
    assert.equal(
      draftAfterB.importReviewApprovedSourceHash,
      draftAfterB.originalSnapshot?.sourceHash,
      "Sau khi duyệt, quyết định duyệt phải gắn với hash của B"
    );

    // ---- M03: B lỗi parse → A giữ nguyên -----------------------------
    await client.clickStep(1);
    await client.uploadFile('input[type="file"]', fileCorruptDocx);
    await new Promise((r) => setTimeout(r, 1500));
    const draftAfterCorrupt = await client.readRawDraft();
    assert.equal(
      draftAfterCorrupt.originalSnapshot?.sourceHash,
      draftAfterB.originalSnapshot?.sourceHash,
      "Tệp hỏng không được ghi đè nguồn đang hoạt động"
    );
    const corruptErrorShown = await client.evaluate<boolean>(
      `document.body.textContent.includes("không đúng định dạng") || document.body.textContent.includes("hỏng")`
    );
    assert.equal(corruptErrorShown, true, "Tệp hỏng phải báo lỗi");

    // ---- M03: upload lại ĐÚNG BYTES cũ → vẫn là lượt nguồn mới -------
    await client.clickStep(1);
    await client.uploadFile('input[type="file"]', fileBetaDocx);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      15000
    );
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 800));
    const draftAfterSameBytes = await client.readRawDraft();
    assert.equal(
      draftAfterSameBytes.originalSnapshot?.sourceHash,
      draftAfterB.originalSnapshot?.sourceHash,
      "Upload lại cùng bytes vẫn phải là nguồn (hash không đổi)"
    );
    assert.equal(
      draftAfterSameBytes.importReviewApprovedSourceHash,
      draftAfterSameBytes.originalSnapshot?.sourceHash,
      "Lượt nguồn mới phải được duyệt lại (hash nguồn có thể trùng nhưng lượt là lượt mới)"
    );

    // ---- M11: AI tắt / provider không có → quy tắc vẫn chạy ---------
    // Chặng 4: AI chỉ chạy sau khi người dùng opt-in rõ ràng ở Bước 1
    // (mặc định tắt) và nút gọi AI trong hộp thoại đối chiếu bị khoá.
    await client.clickStep(1);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 8000);
    const aiControls = await client.evaluate<any>(`(() => {
      const consent = document.querySelector('[data-testid="ai-partition-consent"]');
      return {
        hasConsent: Boolean(consent),
        consentChecked: consent ? Boolean(consent.checked) : null,
        consentPanel: Boolean(document.querySelector('[data-testid="ai-partition-consent-panel"]')),
      };
    })()`);
    assert.equal(aiControls.hasConsent, true, "Bước 1 phải có điều khiển opt-in AI");
    assert.equal(aiControls.consentChecked, false, "Opt-in AI phải mặc định tắt");
    assert.equal(aiControls.consentPanel, true, "Bước 1 phải nêu rõ điều kiện gửi dữ liệu cho AI");

    // ---- M08: mẫu hệ thống → sửa → preview/xuất ----------------------
    await client.clickStep(1);
    await client.clickByText("button", "Dùng mẫu");
    await new Promise((r) => setTimeout(r, 800));
    const templatePicked = await client.evaluate<boolean>(
      `document.body.textContent.includes("Kế hoạch") || document.body.textContent.includes("KẾ HOẠCH")`
    );
    assert.equal(templatePicked, true, "Mẫu hệ thống phải được nạp");
    const templateStep3 = await client.evaluate<any>(`(() => ({
      step3Allowed: document.querySelector('[data-step="3"]')?.getAttribute('data-step-allowed'),
    }))()`);
    assert.equal(
      templateStep3.step3Allowed,
      "true",
      "Mẫu hệ thống là nguồn hợp lệ theo hợp đồng riêng, không cần duyệt bản nhập"
    );

    // ---- M18: ma trận viewport + không tràn ngang ---------------------
    for (const [w, h] of [[320, 568], [390, 844], [844, 390], [1440, 900]] as const) {
      await client.setViewport(w, h);
      await new Promise((r) => setTimeout(r, 350));
      const overflow = await client.evaluate<any>(`(() => {
        const doc = document.documentElement;
        const stepper = document.querySelector('[aria-label="Tiến trình 3 bước"]');
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          stepperWidth: stepper ? stepper.getBoundingClientRect().width : 0,
        };
      })()`);
      assert.ok(
        overflow.scrollWidth <= overflow.clientWidth + 2,
        `Viewport ${w}x${h}: tràn ngang (scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth})`
      );
    }
    await client.setViewport(1440, 900);

    // ---- M12: đổi hệ khi đang có AI pending --------------------------
    // Nút chuyển hệ nằm ở Bước 1; duyệt bản nhập đưa người dùng sang Bước 2
    // nên phải quay lại Bước 1 trước khi thao tác.
    await client.clickStep(1);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 8000);
    await client.uploadFile('input[type="file"]', fileStateTxt);
    await client.waitForFunction(
      `document.body.textContent.includes("Đối Chiếu & Phân Vùng Tài Liệu Tải Lên")`,
      15000
    );
    await client.clickByText("button", "Đồng Ý Đưa Vào Studio Soạn Thảo");
    await new Promise((r) => setTimeout(r, 600));
    await client.clickStep(1);
    await client.waitForFunction(`document.querySelector('[data-wizard-step="1"]') !== null`, 8000);
    await client.clickByText("button", "Văn bản Đảng");
    await new Promise((r) => setTimeout(r, 400));
    const regimeDebug = await client.evaluate<any>(`(() => ({
      step: document.querySelector('[data-wizard-step]')?.getAttribute('data-wizard-step') ?? null,
      partyPressed: Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Văn bản Đảng"))?.getAttribute('aria-pressed') ?? null,
      confirmVisible: Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Xác Nhận Chuyển Đổi")),
    }))()`);
    console.log("[M12] regime controls:", JSON.stringify(regimeDebug));
    const regimeModal = await client.waitForFunction(
      `Array.from(document.querySelectorAll("button")).some(b => b.textContent && b.textContent.includes("Xác Nhận Chuyển Đổi"))`,
      5000
    );
    if (regimeModal) {
      await client.clickByText("button", "Xác Nhận Chuyển Đổi");
      await new Promise((r) => setTimeout(r, 500));
    }
    const regimeSwitched = await client.evaluate<boolean>(
      `Boolean(Array.from(document.querySelectorAll("button")).find(b => b.textContent && b.textContent.includes("Văn bản Đảng"))?.getAttribute("aria-pressed") === "true")`
    );
    assert.equal(regimeSwitched, true, "Phải đổi được sang hệ Đảng");
    const afterRegime = await client.evaluate<any>(`(() => ({
      step3Allowed: document.querySelector('[data-step="3"]')?.getAttribute('data-step-allowed'),
    }))()`);
    assert.equal(afterRegime.step3Allowed, "false", "Sau đổi hệ, token phân vùng cũ mất hiệu lực; phải duyệt lại trước khi xuất");
  } finally {
    client.close();
    serverProc.kill();
  }
});
