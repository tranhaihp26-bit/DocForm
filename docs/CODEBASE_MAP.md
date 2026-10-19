# Bản Đồ Mã Nguồn DocForm-30 (Codebase Map)

> Bản đồ này mô tả cả các phép thử nghiệm thu nội bộ. Một số tệp kiểm thử và tài liệu nghiệp vụ được giữ ngoài repository công khai.

Tài liệu này cung cấp bản đồ kiến trúc chi tiết của dự án **DocForm-30** theo cấu trúc:  
**Nhiệm vụ → File cần đọc → Luồng dữ liệu → Mức độ hoàn thiện thực tế → Bộ kiểm thử liên quan**.

Mọi đường dẫn trong tài liệu này đều là đường dẫn tương đối hợp lệ tính từ thư mục `docs/`.

---

## Bảng Phân Định Mức Độ Hoàn Thiện Trong Toàn Bộ Dự Án

Để tránh ngộ nhận về năng lực của hệ thống, mỗi phân vùng chức năng được gắn một trong ba nhãn sau:
- 🟢 **Đã triển khai và kiểm chứng:** Đã có mã nguồn hoạt động và có bài kiểm thử tự động (unit test/integration test) xác minh đầu ra cụ thể.
- 🟡 **Đã triển khai nhưng chưa kiểm chứng đầu cuối:** Mã nguồn đã viết và chạy được trên môi trường dev, nhưng chưa có test tự động end-to-end bao trùm toàn bộ ca biên hoặc cần kiểm tra trực quan bằng ứng dụng Microsoft Word bên ngoài.
- ⚪ **Mới là đề xuất:** Ý tưởng hoặc giao diện giả lập, chưa có engine xử lý thực tế phía sau.

---

## 1. Khởi Động Ứng Dụng, API & Cấu Hình Môi Trường

### File cần đọc:
- [`../server.ts`](../server.ts) — Khởi tạo máy chủ Express, cấu hình middleware (CORS, Rate Limiting, Multer, Vite dev middleware), tải biến môi trường dotenv và tích hợp Gemini SDK.
- [`../package.json`](../package.json) — Danh mục dependencies và các npm scripts.
- [`../vite.config.ts`](../vite.config.ts) (nếu có) hoặc cấu hình nhúng trong `server.ts`.

### Luồng dữ liệu:
1. `npm run dev` thực thi `tsx server.ts`.
2. `server.ts` đọc cổng từ CLI argument (`--port 5050`) hoặc biến môi trường `process.env.PORT` (mặc định 3000).
3. Express đăng ký 2 cấp độ Rate Limiter:
   - `/api/`: Giới hạn 300 yêu cầu / 15 phút.
   - `/api/ai/`: Giới hạn 60 yêu cầu / 15 phút.
4. Ở môi trường dev (`NODE_ENV !== "production"`), Vite chạy ở chế độ middleware mode phục vụ SPA client trực tiếp mà không cần chạy tiến trình riêng. Ở production, Express phục vụ thư mục tĩnh `dist/`.

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- Máy chủ khởi động bình thường trên cổng 5050 và phản hồi mã HTTP 200 tại `/`.
- Cơ chế Fallback AI (`generateContentWithModelFallback`) thử tuần tự các model `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite` trước khi chuyển sang chế độ Rule Fallback ngoại tuyến.

### Kiểm thử liên quan:
- `test/gemini-live-smoke.test.ts` (kiểm tra kết nối Gemini nếu có API key).
- Kiểm tra cổng cục bộ: `fetch('http://localhost:5050/')`.

---

## 2. Tải & Parse DOCX (Bảng Biểu, Ô Gộp, Ngắt Trang, Chữ Ký)

### File cần đọc:
- [`../src/server/blockExtractor.ts`](../src/server/blockExtractor.ts) — Trích xuất khối tuần tự (`SourceBlock`) từ file OOXML Word qua thư viện `jszip`.
- [`../src/utils/localFileImport.ts`](../src/utils/localFileImport.ts) — Bộ đọc tệp cục bộ trên trình duyệt (client-side), cho phép bóc tách không cần gửi tệp lên backend.
- [`../src/server/parser.ts`](../src/server/parser.ts) — Nhận diện loại văn bản gốc (`detectDocumentType`) và phân tách dữ liệu thô.

### Luồng dữ liệu:
```
Tệp .docx (Buffer/ArrayBuffer)
    ├── JSZip giải nén word/document.xml & word/styles.xml
    ├── Duyệt tuyến tính các thẻ <w:p> (đoạn văn) và <w:tbl> (bảng biểu)
    ├── Trích xuất thuộc tính bảng: w:tblPr, w:cantSplit, w:tblHeader, w:gridSpan (colspan), w:vMerge (rowspan)
    └── Sinh mảng SourceBlock[] (giữ nguyên thứ tự dòng, gán ID duy nhất)
```

### Trạng thái thực tế: 🟢 Đã kiểm chứng qua Candidate Verification Gate & Hợp Đồng Sửa Ô Bảng (Kèm giới hạn kỹ thuật)
- **Đã kiểm chứng thực tế:** 
  1. Hợp đồng chỉnh sửa ô bảng (P0/F01): `syncTableModelFromHtml` và `syncImportedTablesFromHtml` trong `src/utils/tableFormatUtils.ts`. Cho phép người dùng sửa chữ trong ô bảng (`NGUON` -> `DA SUA`), xóa text, hoặc nhập số có số 0 đầu (`0123`). DOCX xuất ra chứa nội dung mới và bảo toàn 100% hình học lưới và định dạng nguồn; candidate verification phát hiện và chặn nếu candidate DOCX không phản ánh sửa đổi người dùng.
  2. Định danh bảng và kiểm chứng hai chiều (P1/F02): Embed `w:tblCaption` mang đúng `tableId` trong `buildDocxTableFromModel`. `verifyCandidateExportFidelity` đối chiếu hai chiều: phát hiện bảng bị thiếu, hoán đổi, hoặc bảng mới do người dùng tạo; loại bỏ hoàn toàn bypass `roundtripVerified = true` khi manifest có bảng.
  3. Đồng bộ một nguồn chân lý duy nhất (P1/F03): `reviewBlocks` đã duyệt là nguồn duy nhất cho preview, xuất Word, `importedTables`, manifest và candidate gate. Đề xuất AI chạm ô bảng cập nhật đồng thời cả `tableData`, `tableModel` và `reviewBlocks`.
  4. Đối chiếu sâu định dạng bảng (P1/F04): `compareTableFidelity` so khớp chi tiết mọi đoạn văn/run trong ô (phông, cỡ chữ nửa điểm, in đậm, in nghiêng), căn đoạn trong ô (`w:jc`), màu nền ô (`w:shd`), thuộc tính lặp tiêu đề (`w:tblHeader`) và chống ngắt trang (`w:cantSplit`).
  5. Đánh giá rule bằng chứng thật & phân loại vùng (P1/F05 & F06): Xóa bỏ `PASS` cố định của `BODY.TABLE.PRESERVATION` và `BODY.TABLE.HEADER_ROW`; đánh giá dãn dòng văn bản Đảng `HD05-BODY-LINE-SPACING` trên toàn bộ đoạn thân bài hợp lệ; hàm `detectParagraphRole` trong `bodyOoxmlEvidence.ts` tự động loại trừ tên loại văn bản, trích yếu, tiêu đề mục, nơi nhận và chữ ký khỏi chỉ số đo đạc thân bài.
  6. Báo trạng thái lưu nguồn bền vững (P2/F07): `saveSourceBlob` trả kết quả `{ persisted: boolean, storage: "indexeddb" | "memory" }` để người dùng biết tệp nguồn được lưu vĩnh viễn hay chỉ trong phiên.
  7. Chuẩn hóa đơn vị bảng preview (P2/F08): `tableModelToHtmlView` sử dụng đơn vị CSS `pt` hợp lệ thay thế cho `twip`, tránh lỗi hiển thị và không tự ý ép `width: 100%`.
  8. Bộ kiểm thử tích hợp dùng manifest thật (P2/F09): `test/followup-audit-fixes.test.ts` (10/10) và `test/real-documents-roundtrip.test.ts` (3/3 với đầy đủ manifest, DOCX tái nhập và PDF LibreOffice).
  9. Đồng bộ một nguồn trạng thái đã duyệt & Đề xuất AI chuẩn xác vị trí (Gap 1 & Audit Critical 1): Module `src/utils/proposalState.ts` (`applySingleProposal`, `applyAllProposalsSequentially`, `changeBlockRole`). Cập nhật bất biến không mutate React state; kiểm tra chặt chẽ `original` text; tái dựng HTML bảng trực tiếp từ `tableModelToHtmlView` theo `data-cell-id` và tái tạo `doc.bodyHtml`, `structuredImport.body.html` trực tiếp từ danh sách `reviewBlocks` đã duyệt, loại bỏ triệt để lỗi string replace thay thế nhầm vị trí đầu tiên khi nhiều đoạn hoặc nhiều ô có text giống nhau (`SAME`).
  10. Cổng kiểm chứng bảng hai chiều & Chính sách bảng mới (Gap 2 & Audit Critical 3): `verifyCandidateExportFidelity` trong `src/utils/tableRoundtrip.ts` phân loại bảng layout hệ thống (`header`/`signature`) và bảng nội dung, ghi nhận `tableDecisions` cho mọi bảng; phát hiện ID trùng lặp (`duplicate_table_id`), đảo thứ tự bảng (`table_order_mismatch`), và bảng mới phát sinh không rõ nguồn gốc (`unexplained_new_table`) với nguyên tắc fail-closed. Kiểm tra toàn diện ngay cả khi `importedTables` rỗng: phát hiện DOCX ứng viên hỏng (`candidate_unpack_failed`) hoặc chứa bảng nội dung chưa duyệt.
  11. Bảo toàn nhiều run định dạng trong ô khi sửa chữ & CSS Inline Parsing (Gap 3 & Audit Critical 2): `tableFormatUtils.ts` bổ sung `parseRunsFromHtmlString`, `parseRunsFromDomElement` và `reconcileRunsWithNewText`. Trích xuất đầy đủ thuộc tính `style="..."` trên thẻ `<span>` (font, size pt/px, bold, italic, underline và tắt style normal/none); giải thuật quy hoạch động LCS (Longest Common Subsequence) / Multi-site Alignment bảo toàn 100% in đậm, nghiêng, gạch chân cho từng run khi sửa nhiều vị trí cách nhau (`Abc MIDDLE xyZ`).
  12. Nhận diện chuẩn xác đoạn thân bài và rule header row (Gap 4): `detectParagraphRole` trong `bodyOoxmlEvidence.ts` phân biệt câu thân bài dài căn đều hai bên (`both`) với `subject`; nhận diện đề mục La Mã (`I-`) và số Ả Rập (`1.`); `BODY.TABLE.HEADER_ROW` và `BODY.TABLE.PRESERVATION` trả `NOT_APPLICABLE` khi không có bảng hoặc không có bảng nào yêu cầu hàng tiêu đề.
  13. Báo cáo trung thực trạng thái lưu trữ tệp nguồn (Gap 5): `saveSourceBlob` và `parseLocalFile` lưu giữ và báo cáo trung thực trạng thái lưu trữ (`indexeddb` hoặc `memory`), hiển thị badge minh bạch trên UI Studio.
- **Giới hạn kỹ thuật còn lại (Fail-Closed Boundaries):**
  - Bảng lồng nhau, ô bảng chứa drawing/canvas phức tạp, active form fields hoặc hyperlinks trong ô chưa hỗ trợ tái tạo hoàn chỉnh -> Cổng an toàn chủ động từ chối xuất bản biến đổi và chỉ định người dùng tải tệp gốc nguyên vẹn.
  - Ngắt trang trang in (pagination) giữa các trang liên tục phụ thuộc vào bộ dựng hình font của Microsoft Word/LibreOffice, cần chuyên viên văn phòng đối chiếu trực quan bản in/PDF trước khi phát hành.

### Kiểm thử liên quan:
- `test/audit-three-critical-bugs.test.ts` (12 bài test kiểm chứng 3 nhóm lỗi chí mạng: mục tiêu đề xuất AI và cell precision, LCS multi-site run & CSS span inline parsing, table gate khi importedTables rỗng)
- `test/remaining-fidelity-gaps.test.ts` (12 bài test toàn diện kiểm chứng Gap 1 đến Gap 5: single source of truth, fold tuần tự, new tables policy, multi-run runs preservation, paragraph roles, honest storage)
- `test/followup-audit-fixes.test.ts` (10 bài test kiểm chứng F01–F09: sửa ô bảng, hai chiều, rule engine, body evidence, storage, css units)
- `test/audit-fixes.test.ts` (13 bài test kiểm tra các vấn đề bảo toàn bảng và roundtrip)
- `test/real-documents-roundtrip.test.ts` (kiểm chứng sửa 1 chữ ngoài bảng, xuất, nhập lại và xuất PDF LibreOffice với manifest thật)
- `test/browser-live-e2e.test.ts` (toàn trình Chromium headless trên cổng 5050 & MS Word COM 16.0)
- `test/import-fidelity-gate.test.ts`
- `test/source-retention.test.ts`
- `test/imported-table-grid.test.ts`
- `test/imported-table-roundtrip.test.ts`
- `test/table-role-classification.test.ts`
- `test/body-rule-applicability.test.ts`
- `test/body-ooxml-audit.test.ts`
- `test/preview-table-fidelity.test.ts`
- `npm run test:fidelity`
- `test/table-and-body-format.test.ts`

---

## 3. Mô Hình Dữ Liệu Tài Liệu & Phân Đoạn Nội Dung

### File cần đọc:
- [`../src/shared/schemas/document.schema.ts`](../src/shared/schemas/document.schema.ts) — Định nghĩa kiểu dữ liệu trung tâm (`DocumentState`, `SourceBlock`, `StructuredImport`, `AppendixDocument`, `TableProperties`).
- [`../src/server/structuralSegmenter.ts`](../src/server/structuralSegmenter.ts) — Phân loại các khối vào 7 vùng: `header`, `metadata`, `body`, `signature`, `recipients`, `appendix`, `unclassified`.
- [`../src/utils/importReview.ts`](../src/utils/importReview.ts) — Ghép nối các khối sau phân đoạn để hiển thị và chỉnh sửa.

### Luồng dữ liệu:
```
SourceBlock[]
    ↓ structuralSegmenter.segmentSourceBlocks()
StructuredImport
    ├── fields: { documentType, referenceNumber, locationAndDate, orgHeader1, orgHeader2, nationalHeader1, nationalHeader2, subject }
    ├── body: { html, sourceBlockIds, paragraphsCount, tablesCount }
    ├── signatures: Array<{ title, name, isMultiSigner }> (hoặc rỗng nếu không có)
    ├── recipients: { items, filingNote, rawText }
    ├── appendices: AppendixDocument[]
    └── unclassified: SourceBlock[] (Bảo toàn dữ liệu dư thừa)
```

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- **Đã kiểm chứng:** Quy tắc "One Block - One Owner" bảo đảm không nhân bản khối. Đặc biệt, nếu tài liệu nguồn không chứa khối chữ ký thì mảng `signatures` để trống, không tự động lấy các hàng trong bảng phân công để điền chữ ký giả.
- **Giới hạn:** Với các văn bản phi chuẩn có tiêu đề nằm lẫn trong bảng không viền (borderless table), phân đoạn có thể gom toàn bộ bảng vào `header` hoặc `body` và cần người dùng điều chỉnh tại Bước 3.

### Kiểm thử liên quan:
- `test/import-segments.test.ts`
- `test/repro-plan-signature-bug.test.ts`
- `test/office-worker-redesign.test.ts` (Test 4)

---

## 4. Danh Mục Quy Tắc NĐ 30, HD 05, Profile & Ánh Xạ 9 Nhóm

### File cần đọc:
- [`../src/canonical/nd30/rules.generated.json`](../src/canonical/nd30/rules.generated.json) — **435 quy tắc gốc** trích xuất từ Nghị định 30/2020/NĐ-CP.
- [`../src/canonical/hd05/rules.2026.json`](../src/canonical/hd05/rules.2026.json) — **231 quy tắc gốc** trích xuất từ Hướng dẫn 05-HD/VPTW ngày 27/5/2026.
- [`../src/canonical/ruleEngine.ts`](../src/canonical/ruleEngine.ts) — Runtime Rule Engine nạp catalog gốc và bổ sung các rule profile / body, quản lý tổng cộng:
  - **443 quy tắc Hành chính (NĐ 30):** Gồm 435 rule gốc + 2 rule profile Hoa Tiêu MB + 6 sub-rules về căn cứ, điều khoản, bảng biểu, khoảng cách dòng.
  - **235 quy tắc Đảng (HD 05):** Gồm 231 rule gốc + 2 rule profile Đảng bộ Hoa Tiêu MB + 2 sub-rules về 5 gạch nối `-----` và trích yếu đứng đậm.
- [`../src/canonical/nd30/companyHeader.ts`](../src/canonical/nd30/companyHeader.ts) — Khung bảng (5187/5245 twips) và nét Shape Line cố định của Công ty Hoa tiêu hàng hải miền Bắc (NĐ 30).
- [`../src/canonical/hd05/companyHeaderHD05.ts`](../src/canonical/hd05/companyHeaderHD05.ts) — Khung bảng (5580/4590 twips) và nét Shape Line cố định của Đảng ủy Công ty Hoa tiêu hàng hải miền Bắc (HD 05).

### Cách ánh xạ về 9 nhóm thành phần chính:
1. `Tiêu đề hệ thể thức` (Quốc hiệu & Tiêu ngữ NĐ 30 vs Tiêu đề Đảng HD 05)
2. `Cơ quan ban hành` (Tên cơ quan, cơ quan chủ quản, đường kẻ 1/3–1/2 hoặc dấu `*`)
3. `Số, ký hiệu` (`Số: ...` có hai chấm vs `Số ...` không hai chấm)
4. `Địa danh và ngày tháng` (In nghiêng, số 0 đứng trước ngày < 10 và tháng 1, 2)
5. `Tên loại và trích yếu` (Tên loại in hoa giữa trang; riêng công văn Đảng đặt ở cột trái dưới số hiệu)
6. `Nội dung văn bản` (Căn cứ, điều khoản, đoạn văn, bảng biểu, danh sách)
7. `Quyền hạn, chức vụ, chữ ký` (Chức vụ in hoa đậm, họ tên in thường đậm)
8. `Dấu, chữ ký số` (Con dấu cơ quan hoặc chữ ký số tổ chức)
9. `Nơi nhận văn bản` (Liệt kê đơn vị nhận, văn thư lưu trữ)
*Các nhóm bổ sung:* Phụ lục (`supp_appendix`), Độ mật/khẩn (`supp_security_urgency`), Chỉ dẫn phát hành (`supp_distribution`), Bản sao (`supp_copy`), Khổ trang & phân trang (`supp_page_setup`).

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- Phân biệt rõ số liệu: **Catalog gốc có 435 (NĐ30) / 231 (HD05)** quy tắc; **Registry runtime có 443 (NĐ30) / 235 (HD05)** quy tắc.
- Cách ly hoàn toàn 2 chế độ, không áp chéo rule.

### Kiểm thử liên quan:
- `test/header-dual-regime.test.ts`
- `test/office-worker-redesign.test.ts` (Test 1 & Test 6)

---

## 5. Đánh Giá Rule & Ý Nghĩa 5 Trạng Thái Kiểm Định

### File cần đọc:
- [`../src/canonical/ruleEngine.ts`](../src/canonical/ruleEngine.ts) — Hàm `evaluateDocumentRules(doc, regime, ooxmlEvidence)` và `extractOoxmlEvidenceFromXml(xml, regime)`.
- [`../src/canonical/nd30/canonicalAudit.ts`](../src/canonical/nd30/canonicalAudit.ts) — Bóc tách bằng chứng OOXML NĐ 30 từ `word/document.xml` để đối chiếu quy tắc hình học.
- [`../src/canonical/hd05/canonicalAuditHD05.ts`](../src/canonical/hd05/canonicalAuditHD05.ts) — Bóc tách bằng chứng OOXML HD 05 từ `word/document.xml`.

### Ý nghĩa 5 trạng thái kiểm định:
- `PASS`: Chỉ đánh dấu `PASS` khi đã có bằng chứng đo lường thực tế từ OOXML/văn bản **và** giá trị thực tế thỏa mãn ràng buộc (`expected`) của quy tắc (không bao giờ đánh `PASS` chỉ vì khóa thuộc tính tồn tại).
- `FAIL`: Có bằng chứng đo lường nhưng giá trị thực tế không thỏa mãn ràng buộc quy chuẩn (ví dụ: khổ giấy sai, lề trang sai, đường kẻ cơ quan ngoài khoảng $1/3$–$1/2$, số hiệu văn bản Đảng có dấu hai chấm...).
- `NOT_EVALUATED`: Chưa có bằng chứng OOXML hoặc quy tắc chưa có bộ đo tự động trong runtime hiện tại. **Tuyệt đối không được tính vào điểm PASS**.
- `NEEDS_REVIEW`: Quy tắc thuộc loại `semantic_review` hoặc `manual_visual`, cần chuyên viên văn phòng đối chiếu trực quan hoặc thẩm quyền.
- `NOT_APPLICABLE`: Quy tắc không áp dụng cho loại văn bản hoặc profile hiện tại (ví dụ: các rule `PROFILE.ND30.*` / `PROFILE.HD05.*` khi tài liệu dùng mẫu chung; công văn không có cụm tên loại/trích yếu giữa trang).

### Ba chỉ số độc lập hiển thị cho người dùng:
1. `Nhóm thành phần đã nhận diện`: `x/9 nhóm thành phần`
2. `Việc người dùng cần xử lý`: `y việc cần xử lý`
3. `Số quy tắc kiểm định bằng chứng thực tế`: `PASS: a | FAIL: f | Chưa kiểm định: b | Cần rà soát: r | Không áp dụng: c`

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- Trong [`../src/App.tsx`](../src/App.tsx), `ooxmlEvidence` được trích xuất trực tiếp từ bộ đệm DOCX sinh ra (`generateND30DocxBuffer` + `extractOoxmlEvidenceFromXml`) và truyền vào `evaluateDocumentRules()`.

### Kiểm thử liên quan:
- [`../test/nd30-compliance.test.ts`](../test/nd30-compliance.test.ts)
- [`../test/office-worker-redesign.test.ts`](../test/office-worker-redesign.test.ts) (Test 2 & Test 7)

---

## 6. Đề Xuất AI, Chính Tả, Văn Phong & Điểm Cần Duyệt

### File cần đọc:
- [`../src/server/reviewProposals.ts`](../src/server/reviewProposals.ts) — Bộ sinh đề xuất quy tắc ngoại tuyến (`generateRuleBasedProposals`) và chuẩn hóa regex tiếng Việt (`createVietnameseWordRegex`).
- [`../server.ts`](../server.ts) — Endpoint `/api/ai/review-document` và `/api/ai/format-document`.

### Luồng dữ liệu & Cơ chế bảo vệ:
1. Khi người dùng bấm "Rà soát đề xuất", hệ thống gửi cấu trúc tệp kèm `rawText` và `blocks`.
2. Nếu không có kết nối internet hoặc không có `GEMINI_API_KEY`, hệ thống chuyển sang chế độ **Rule Fallback ngoại tuyến**:
   - Sử dụng từ điển lỗi chính tả tiếng Việt hành chính với regex Unicode lookaround (`(?<=^|[^\p{L}\d])phrase(?=[^\p{L}\d]|$)`).
   - Kiểm tra định dạng ngày tháng, số hiệu, trích yếu theo loại văn bản.
3. Mọi đề xuất phát sinh đều mang `targetBlockId` và chuỗi gốc `original`.
4. Giao diện hiển thị danh sách việc cần làm. Người dùng phải bấm **Áp dụng** thì nội dung mới được thay thế; nếu bấm **Bỏ qua**, tài liệu giữ nguyên vẹn.

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- Đã khắc phục lỗi regex stateful carry-over (`lastIndex`) bằng cờ mặc định `"iu"`.
- Đã khắc phục lỗi đề xuất sai trích yếu cho văn bản Kế hoạch (không ép thêm tiền tố "V/v").

### Kiểm thử liên quan:
- [`../test/office-worker-redesign.test.ts`](../test/office-worker-redesign.test.ts) (Test 5)

---

## 7. Giao Diện 4 Bước, Soạn Thảo A4, So Sánh Diff

### File cần đọc:
- [`../src/App.tsx`](../src/App.tsx) — Điều phối toàn bộ trạng thái ứng dụng, stepper 4 bước, auto-save, phím tắt (Ctrl+S, Ctrl+E).
- [`../src/components/OfficeWorkerViews.tsx`](../src/components/OfficeWorkerViews.tsx) — Chứa các màn hình con:
  - `Step1View`: Chọn hệ quy chuẩn và loại văn bản.
  - `Step2View`: Tải file Word/TXT, chọn mẫu, xem bảng tóm tắt cấu trúc.
  - `Step4View`: Xem văn bản đề xuất, văn bản gốc, hoặc so sánh Diff (`visualDiff.inlineHtml`); xuất Word/PDF.
  - `SafeRegimeModal`: Hộp thoại xác nhận chuyển đổi hệ thể thức an toàn.
  - `AdvancedDrawer`: Ngăn kéo chứa Pilot test fixtures, OOXML inspector, rule catalogs.
- [`../src/components/ND30Editor.tsx`](../src/components/ND30Editor.tsx) — Trình soạn thảo văn bản TipTap tích hợp bảng biểu và thanh công cụ chuẩn thể thức.
- [`../src/utils/diffUtils.ts`](../src/utils/diffUtils.ts) — Thuật toán so sánh từng từ (`computeVisualDiff`) trả về `inlineHtml` và `stats` (`addedCount`, `deletedCount`, `unchangedCount`).

### Trạng thái khởi tạo và điều hướng 4 bước:
- Trong [`../src/App.tsx`](../src/App.tsx), `const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1)` khởi tạo mặc định tại **Bước 1 (Chọn chế độ & loại văn bản)** cho phiên làm việc mới.
- Sau khi chọn chế độ/loại ở Bước 1 → chuyển sang Bước 2 (Tải file / chọn mẫu); khi xác nhận nạp file hoặc áp dụng mẫu chuẩn ở Bước 2 → chuyển sang **Bước 3 (Studio Soạn thảo & Rà soát)**; tiếp tục sang **Bước 4 (So sánh Diff & Xuất bản)**. Thanh Stepper trên cùng cho phép chuyển trực tiếp tới bất kỳ bước nào.

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- Giao diện 4 bước hoạt động xuyên suốt. Cột trái ở Bước 3 hiển thị 9 nhóm thành phần chính kèm trạng thái nhận diện và cuộn đến vị trí tương ứng trên mặt giấy A4 khi nhấp chuột; cột phải hỗ trợ lọc lỗi theo nhóm thành phần đang chọn.

---

## 8. Lưu Nháp, Lịch Sử Phiên Bản & Chuyển Hệ An Toàn

### File cần đọc:
- [`../src/utils/draftStore.ts`](../src/utils/draftStore.ts) — Tầng lưu trữ IndexedDB (`DocForm30_DB`, store `drafts`).
- [`../src/App.tsx`](../src/App.tsx) — Các hàm `saveDraft`, `loadDraft`, `pushVersion`, `restoreVersion`, `executeRegimeSwitch`.

### Cơ chế hoạt động:
1. **Tự động lưu (Debounced Auto-save):** Sau mỗi thao tác chỉnh sửa 1.000ms, toàn bộ `doc`, `standardType` và danh sách `versions` được ghi vào IndexedDB. Nếu IndexedDB không khả dụng hoặc lỗi ghi, `saveDraft()` ném lỗi (reject) để giao diện hiển thị trạng thái `saveError` trung thực thay vì báo "Đã lưu tự động" giả.
2. **Khôi phục khi tải lại:** Khi mở ứng dụng, `loadDraft()` nạp bản nháp gần nhất và làm sạch chữ ký mẫu cũ nếu phát hiện bản nháp từ phiên bản trước.
3. **Chuyển hệ an toàn (`SafeRegimeModal`):**
   - Tạo bản sao lưu phiên bản hiện tại vào `versions` trước khi chuyển đổi.
   - Bảo toàn nội dung `bodyHtml`, số lượng bảng biểu, cấu trúc ô gộp (`colspan`/`rowspan`), phụ lục (`appendices`) và thông tin người ký thật.
   - Cập nhật Quốc hiệu/Tiêu đề (`ĐẢNG CỘNG SẢN VIỆT NAM` $\leftrightarrow$ `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM`) và định dạng số hiệu (`Số ...` $\leftrightarrow$ `Số: ...`) tương thích với hệ mới.

### Trạng thái thực tế: 🟢 Đã triển khai và kiểm chứng
- Đã kiểm thử tự động chuyển đổi khứ hồi NĐ 30 $\leftrightarrow$ HD 05 và xử lý lỗi IndexedDB trong `test/office-worker-redesign.test.ts` (Test 8 & Test 9).

### Kiểm thử liên quan:
- [`../test/office-worker-redesign.test.ts`](../test/office-worker-redesign.test.ts) (Test 1, Test 8, Test 9, Test 10)

---

## 9. Xuất DOCX/PDF & Các Giới Hạn Của Preview So Với Word

### File cần đọc:
- [`../src/utils/docxExport.ts`](../src/utils/docxExport.ts) — Sinh file Word `.docx` hoàn chỉnh qua thư viện `docx` và `jszip`.
- [`../src/utils/tableFormatUtils.ts`](../src/utils/tableFormatUtils.ts) — Tính toán độ rộng cột twips, căn chỉnh ô theo ngữ nghĩa (cột STT/ngày tháng căn giữa, cột số tiền/định mức căn phải, cột văn bản căn đều hai bên).
- [`../src/components/A4DocumentPreview.tsx`](../src/components/A4DocumentPreview.tsx) — Xem trước file Word thật bằng `docx-preview`.

### Bảng đối chiếu các chế độ hiển thị & giới hạn:

| Môi trường xem | Cơ chế hiển thị | Giới hạn đã biết so với Microsoft Word thật |
|---|---|---|
| **Canvas soạn thảo A4 (Bước 3)** | CSS Flexbox/Grid HTML (Times New Roman, 794px width) | Chỉ mô phỏng gần đúng bố cục trang A4. Các bảng dài sẽ chảy liên tục trên màn hình chứ chưa ngắt trang vật lý từng tờ 297mm như Word. |
| **Xem trước Word thật (`docx-preview`)** | Render file `.docx` sang HTML canvas/SVG trên trình duyệt | `docx-preview` chưa hỗ trợ đầy đủ độ thụt lề âm (negative table indent) của OOXML; mã nguồn phải bù trừ thụt lề bằng CSS margin. Các nét vẽ DrawingML phức tạp có thể bị giản lược. |
| **Tệp Microsoft Word xuất ra (`.docx`)** | OOXML nén chuẩn Microsoft Office | Ghi đầy đủ thuộc tính `w:cantSplit`, `w:tblHeader`, `w:gridSpan` và DrawingML/VML shape lines vào `word/document.xml`. Bố cục ngắt trang thực tế khi in vẫn phụ thuộc vào engine dàn trang của Microsoft Word nên cần kiểm tra trực quan đối với tài liệu nhiều trang. |

### Trạng thái thực tế: 🟡 Đã triển khai và kiểm chứng cấu trúc OOXML, cần kiểm tra trực quan khi in ấn thực tế
- Cấu trúc OOXML xuất ra đã được kiểm thử tự động về kích thước trang A4, lề trang, bảng biểu, ô gộp, phụ lục và Shape Lines.
- Việc hiển thị ngắt trang vật lý trên từng phiên bản Microsoft Word / LibreOffice cụ thể vẫn cần người dùng mở tệp `.docx` xuất ra để kiểm tra trực quan lần cuối.

### Kiểm thử liên quan:
- [`../test/nd30-compliance.test.ts`](../test/nd30-compliance.test.ts) (Test 18, 21, 22, 24)
- [`../test/table-and-body-format.test.ts`](../test/table-and-body-format.test.ts)

---

## 10. Thư Viện Fixture & Bộ Kiểm Thử Liên Quan

### Thư mục fixture:
- [`../fixtures/pilot_documents/`](../fixtures/pilot_documents/) — Chứa **27 tài liệu mẫu chuẩn** (Kế hoạch, Quyết định, Công văn, Biên bản, Báo cáo, Tờ trình, Văn bản Đảng).
- [`../fixtures/complex_malformed/`](../fixtures/complex_malformed/) — Chứa **10 tài liệu thử thách** (bảng phức tạp, sai thể thức, mã độc XSS thử nghiệm độ bền của parser).

### Danh mục bài kiểm thử chính:

| File kiểm thử | Đối tượng kiểm tra | Lệnh chạy |
|---|---|---|
| `test/office-worker-redesign.test.ts` | Luồng 4 bước, cách ly 2 hệ, bảng biểu, regex, văn bản không chữ ký | `npx tsx test/office-worker-redesign.test.ts` |
| `test/header-dual-regime.test.ts` | Kiểm định hình học phần đầu NĐ 30 và HD 05 (Generic & Hoa Tiêu MB) | `npx tsx test/header-dual-regime.test.ts` |
| `test/nd30-compliance.test.ts` | 32 chỉ tiêu tuân thủ thể thức hành chính bắt buộc | `npm test` |
| `test/import-segments.test.ts` | Độ chính xác của phân đoạn cấu trúc tài liệu | `npm run test:import:segments` |
| `test/table-and-body-format.test.ts` | Định dạng và bảo toàn cấu trúc bảng biểu | `npm run test:body:tables` |
| `test/pilot-documents.test.ts` | Chạy kiểm tra hàng loạt trên 27 tài liệu pilot | `npm run test:pilot` |
| `test/complex-malformed-pipeline.test.ts` | Xử lý dữ liệu hỏng, bảo vệ XSS | `npm run test:edgecases` |
| `test/repro-plan-signature-bug.test.ts` | Tái hiện và ngăn chặn lỗi chữ ký giả trên văn bản kế hoạch | `npm run test:repro` |

---

## 11. Hướng Dẫn "Nếu Cần Sửa X, Bắt Đầu Ở Đâu"

Khi gặp các sự cố cụ thể, agent hãy tra cứu nhanh điểm bắt đầu tại bảng sau:

### 1. Bảng biểu bị parse sai hoặc mất ô gộp:
- **Nơi bắt đầu:** [`src/server/blockExtractor.ts`](../src/server/blockExtractor.ts) tại hàm `extractTableDetails`.
- **Điểm kiểm tra:** Kiểm tra cách trích xuất thẻ `<w:gridSpan>` (gộp cột) và `<w:vMerge>` (gộp hàng). Đảm bảo thẻ `<w:tc>` trong XML được ánh xạ đầy đủ `colspan`/`rowspan` vào HTML và đối tượng `tableProperties`.
- **Bài test kiểm chứng:** `npm run test:body:tables` hoặc `npx tsx test/table-and-body-format.test.ts`.

### 2. Phát sinh chữ ký giả hoặc người ký giả mạo:
- **Nơi bắt đầu:** [`src/server/structuralSegmenter.ts`](../src/server/structuralSegmenter.ts) tại hàm `segmentSourceBlocks` (khu vực nhận diện vùng `signature`).
- **Điểm kiểm tra:** Đảm bảo bảng nội dung trong body (như bảng tiến độ, phân công thực hiện) không bị nhầm lẫn thành bảng ký tên 2 bên hay 3 bên. Nếu tài liệu không có từ khóa chức vụ ký kết ở cuối trang, mảng `signatures` phải để trống.
- **Bài test kiểm chứng:** `npm run test:repro` hoặc `npx tsx test/office-worker-redesign.test.ts`.

### 3. Quy tắc áp nhầm hệ (NĐ 30 áp sang HD 05 hoặc ngược lại):
- **Nơi bắt đầu:** [`src/canonical/ruleEngine.ts`](../src/canonical/ruleEngine.ts) tại hàm `evaluateDocumentRules`.
- **Điểm kiểm tra:** Kiểm tra điều kiện `rule.regime === activeRegime`. Quy tắc có tiền tố `VN-STATE-ND30` tuyệt đối không được nạp khi `regime === "party"`, và ngược lại.
- **Bài test kiểm chứng:** `npx tsx test/header-dual-regime.test.ts`.

### 4. Lỗi đường kẻ / Shape Line phần đầu văn bản:
- **Nơi bắt đầu:**
  - Nếu là NĐ 30 Generic: kiểm tra [`src/utils/docxExport.ts`](../src/utils/docxExport.ts) tại hàm tạo đường kẻ tiêu ngữ / cơ quan ban hành.
  - Nếu là Profile Hoa Tiêu MB: kiểm tra [`src/canonical/nd30/companyHeader.ts`](../src/canonical/nd30/companyHeader.ts) hoặc [`src/canonical/hd05/companyHeaderHD05.ts`](../src/canonical/hd05/companyHeaderHD05.ts).
- **Điểm kiểm tra:** Tọa độ DrawingML `from/to` hoặc chu vi v:line VML. Lưu ý: Mẫu của Công ty Hoa tiêu hàng hải miền Bắc đã chốt, không tự ý đổi tọa độ nếu không có file mẫu mới.
- **Bài test kiểm chứng:** `npx tsx test/header-dual-regime.test.ts` (Case 2 & Case 4).

### 5. Lỗi gợi ý chính tả hoặc AI áp sai vị trí:
- **Nơi bắt đầu:** [`src/server/reviewProposals.ts`](../src/server/reviewProposals.ts) tại hàm `generateRuleBasedProposals` hoặc danh mục `COMMON_SPELLING_PAIRS`.
- **Điểm kiểm tra:** Đảm bảo regex tạo qua `createVietnameseWordRegex` sử dụng lookaround `(?<=^|[^\p{L}\d])` thay vì `\b`, và cờ regex là `"iu"` (không dùng `"giu"` để tránh lỗi `lastIndex`).
- **Bài test kiểm chứng:** `npx tsx test/office-worker-redesign.test.ts` (Test 5).

### 6. Lỗi bố cục mặt giấy A4 trên giao diện:
- **Nơi bắt đầu:** [`src/App.tsx`](../src/App.tsx) quanh thẻ `<main id="studio-main-canvas">` và thẻ chứa ref `a4CanvasInnerRef`.
- **Điểm kiểm tra:** Kích thước cố định `w-[794px]`, padding `p-[75px_56px_75px_113px]` (tương đương 20-15-20-30mm), phông chữ Times New Roman.
- **Bài test kiểm chứng:** Mở trình duyệt tại [http://localhost:5050/](http://localhost:5050/) kiểm tra trực quan.

### 7. Lỗi xuất file Word (.docx):
- **Nơi bắt đầu:** [`src/utils/docxExport.ts`](../src/utils/docxExport.ts) tại hàm `exportToDocx` và `generateND30DocxBlob`.
- **Điểm kiểm tra:** Kiểm tra thuộc tính lề `margins` (top: 1134, bottom: 1134, left: 1701, right: 850 dxa), cỡ chữ nửa điểm (`size: 26` cho 13pt, `size: 28` cho 14pt).
- **Bài test kiểm chứng:** `npm test` (Test 18, 21, 22).

### 8. Lỗi so sánh Diff hoặc tràn ngăn xếp (RangeError) trên tài liệu dài:
- **Nơi bắt đầu:** [`src/utils/diffUtils.ts`](../src/utils/diffUtils.ts) tại hàm `computeLcsDiff` và `computeBlockLcs`.
- **Điểm kiểm tra:** Kiểm tra giới hạn độ sâu đệ quy (`currentDepth >= 2`), điều kiện bài toán con bắt buộc phải thu nhỏ (`isIdenticalProblem` / `cA.length * cB.length >= midM * midN`), tối ưu cắt tỉa tiền tố/hậu tố chung ở cả cấp khối và cấp token. Khi chạm giới hạn tài nguyên, xuất toàn bộ phần thay đổi dưới dạng xóa/thêm kèm cờ `isPartial=true` và giải thích lý do `limitReason`, tuyệt đối không gán nhãn "unchanged" (0 thay đổi) sai lệch.
- **Bài test kiểm chứng:** `npx tsx test/office-worker-redesign.test.ts` (Test 17) hoặc `npx tsx test/repro-diff-stack.test.ts`.

### 9. Lỗi truyền snapshot gốc & tính trung thực của nhãn kiểm định tại Bước 4:
- **Nơi bắt đầu:** [`src/App.tsx`](../src/App.tsx) tại khu vực dựng `<Step4View>` và [`src/components/OfficeWorkerViews.tsx`](../src/components/OfficeWorkerViews.tsx) tại `Step4ViewProps` và hàm `Step4View`.
- **Điểm kiểm tra:** Prop `originalSnapshot` là bắt buộc với kiểu `OriginalDocumentSnapshot | null` (không để tùy chọn `?`). Trạng thái `isStrictlyCompliant` chỉ được bật khi toàn bộ rule kiểm định thực sự thỏa mãn (`FAIL === 0 && actionableCount === 0 && NOT_EVALUATED === 0 && NEEDS_REVIEW === 0 && PASS > 0`) và đã đo lường bằng chứng OOXML từ chính bản thảo hiện tại. Nhãn nút xuất Word phản ánh đúng mức độ bằng chứng ("Bản Thảo (Đã kiểm tra một phần)" thay vì ngộ nhận "Đạt Chuẩn").
- **Bài test kiểm chứng:** `npx tsx test/office-worker-redesign.test.ts` (Test 14, 18, 19).

