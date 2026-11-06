# Bản Đồ Mã Nguồn DocForm-30 (Codebase Map)

> Bản đồ này mô tả cả các phép thử nghiệm thu nội bộ. Một số tệp kiểm thử và tài liệu nghiệp vụ được giữ ngoài repository công khai.

Tài liệu này cung cấp bản đồ kiến trúc chi tiết của dự án **DocForm-30** theo cấu trúc:  
**Nhiệm vụ → File cần đọc → Luồng dữ liệu → Mức độ hoàn thiện thực tế → Bộ kiểm thử liên quan**.

Mọi đường dẫn trong tài liệu này đều là đường dẫn tương đối hợp lệ tính từ thư mục `docs/`.

> **Cách dùng trạng thái:** Bản đồ chỉ đường đến mã và bài kiểm thử; tên test hoặc kết quả trong tài liệu cũ không chứng minh test đã chạy đạt ở checkout hiện tại. Hãy chạy lệnh liên quan trên commit đang làm và ghi nhận đầu ra thực tế. Audit/plan trong ZIP là bằng chứng lịch sử theo snapshot, không phải xác nhận phát hành hay chỉ thị thực thi.

> **Cách đọc cho agent:** Đây là tài liệu tham chiếu chi tiết, không cần nạp toàn bộ trong mọi tác vụ. Tìm heading phù hợp, đọc mục đó và lần xuống đúng file/test; hướng dẫn `AGENTS.md` gần thư mục mã nguồn chứa các ràng buộc chỉ áp dụng trong phạm vi ấy.

## Tra Cứu Nhanh Theo Tác Vụ

| Tác vụ | Hướng dẫn theo thư mục | Mục trong bản đồ |
|---|---|---|
| Server, API, parse/import, rà soát AI | [`../src/server/AGENTS.md`](../src/server/AGENTS.md) | 1, 2, 6, 11 |
| Rule engine, bằng chứng, regime/profile | [`../src/canonical/AGENTS.md`](../src/canonical/AGENTS.md) | 4, 5 |
| Schema/protocol dùng chung | [`../src/shared/AGENTS.md`](../src/shared/AGENTS.md) | 3–6 |
| TableModel, source/profile, storage, transaction, DOCX candidate | [`../src/utils/AGENTS.md`](../src/utils/AGENTS.md) | 2, 3, 8, 9, 11 |
| Wizard, editor, consent, preview/in | [`../src/components/AGENTS.md`](../src/components/AGENTS.md) | 6, 7, 9 |
| Test và fixture | [`../test/AGENTS.md`](../test/AGENTS.md) | 10 và mục feature liên quan |
| Tài liệu/báo cáo trong `docs/` | [`AGENTS.md`](AGENTS.md) | Mục liên quan |

---

## Bảng Phân Định Mức Độ Hoàn Thiện Trong Toàn Bộ Dự Án

Để tránh ngộ nhận về năng lực của hệ thống, mỗi phân vùng chức năng được gắn một trong ba nhãn sau:
- 🟢 **Đã triển khai, có test liên quan:** Đã có mã nguồn và bài kiểm thử tự động (unit test/integration test) trong repository; nhãn này không khẳng định test vừa chạy đạt ở checkout hiện tại.
- 🟡 **Đã triển khai nhưng chưa kiểm chứng đầu cuối:** Mã nguồn đã viết và chạy được trên môi trường dev, nhưng chưa có test tự động end-to-end bao trùm toàn bộ ca biên hoặc cần kiểm tra trực quan bằng ứng dụng Microsoft Word bên ngoài.
- ⚪ **Mới là đề xuất:** Ý tưởng hoặc giao diện giả lập, chưa có engine xử lý thực tế phía sau.

---

## 1. Khởi Động Ứng Dụng, API & Cấu Hình Môi Trường

### File cần đọc:
- [`../server.ts`](../server.ts) — Khởi tạo máy chủ Express, cấu hình middleware (CORS, Rate Limiting, Multer, Vite dev middleware), tải biến môi trường dotenv và đăng ký các endpoint AI/local.
- [`../package.json`](../package.json) — Danh mục dependencies và các npm scripts.
- [`../vite.config.ts`](../vite.config.ts) (nếu có) hoặc cấu hình nhúng trong `server.ts`.
- [`../src/server/fullDocumentCapability.ts`](../src/server/fullDocumentCapability.ts) — Ma trận capability theo provider; không phải bằng chứng provider đã đọc toàn tệp.
- [`AI_PROVIDER_SETUP.md`](AI_PROVIDER_SETUP.md) và [`../src/server/openAiApiProvider.ts`](../src/server/openAiApiProvider.ts) — Cấu hình Gemini/OpenAI local, câu thử tổng hợp, Responses adapter và giới hạn dữ liệu.
- [`../src/server/fullTextSemanticService.ts`](../src/server/fullTextSemanticService.ts), [`../src/utils/fullTextManifest.ts`](../src/utils/fullTextManifest.ts) — Manifest văn bản, chia chunk, kiểm tra phản hồi và coverage cho rà soát toàn văn.
- [`../src/server/sourceVisualRenderer.ts`](../src/server/sourceVisualRenderer.ts) — Dựng ảnh/PDF nguồn cục bộ để người dùng đối chiếu bố cục.
- [`SIWC_LOCAL.md`](SIWC_LOCAL.md) — Cấu hình và giới hạn provider ChatGPT local.

### Luồng dữ liệu:
1. `npm run dev` thực thi `tsx server.ts`.
2. `server.ts` đọc cấu hình mạng:
   - Cổng từ CLI argument (`--port 5050` / `-p`) hoặc `process.env.PORT` (mặc định 5050).
   - Địa chỉ bind: mặc định luôn là loopback `127.0.0.1` cục bộ để bảo vệ an toàn mạng LAN. Chỉ bind rộng hơn (`0.0.0.0`) khi có cờ CLI (`--host` / `-h`) hoặc biến môi trường rõ ràng (`DOCFORM_BIND_HOST`, `HOST`) hoặc môi trường container Cloud Run (`K_SERVICE`, `K_REVISION`).
3. Express đăng ký 2 cấp độ Rate Limiter:
   - `/api/`: Giới hạn 300 yêu cầu / 15 phút.
   - `/api/ai/`: Giới hạn 60 yêu cầu / 15 phút.
4. Bảo vệ mạng và kiểm soát nguồn gốc ở tầng transport:
   - Các thao tác AI dùng credential chỉ nhận yêu cầu loopback với Host local và Origin cùng nguồn khi có Origin. Bind LAN, allowlist CORS hoặc môi trường Cloud Run không cấp quyền gọi AI; truy cập provider từ xa cần cơ chế xác thực riêng chưa được triển khai.
   - Các route AI (`/api/ai/test-connection`, `/api/ai/review-document`, `/api/ai/review-proposals`, `/api/ai/review-full-text`, `/api/ai/full-text-review`, `/api/ai/check-partitions`, `/api/ai/format-document`, `/api/ai/refine-text`) bắt buộc kiểm tra Host và Origin trước khi xử lý hoặc gọi nhà cung cấp bên ngoài.
   - Các yêu cầu mang Origin lạ hoặc Host bị giả mạo bị từ chối dứt khoát với HTTP 403 trước khi chạm tới API key hay credential nhà cung cấp.
5. Ở môi trường dev (`NODE_ENV !== "production"`), Vite chạy ở chế độ middleware mode phục vụ SPA client trực tiếp mà không cần chạy tiến trình riêng. Ở production, Express phục vụ thư mục tĩnh `dist/`.

### Trạng thái thực tế: 🟢 Đã triển khai, có test liên quan trong repository
- `server.ts` mặc định bind `127.0.0.1`, siết CORS và bảo vệ các endpoint AI bằng kiểm tra loopback/origin/host.
- `/api/ai/render-source-docx` chỉ nhận yêu cầu local loopback, kiểm tra SHA nguồn và tạo rendition cục bộ. Dữ liệu dựng hình được giữ tạm thời; đây không phải luồng gửi file/ảnh đến provider.
- `/api/ai/review-full-text` (và alias `/api/ai/full-text-review`) là luồng riêng có consent, gửi manifest text theo chunk tới Gemini, OpenAI API hoặc ChatGPT plan rồi trả NDJSON/coverage. Endpoint không chấp nhận byte DOCX, PDF hay ảnh trang; không tự chuyển provider khi có lỗi.
- `/api/ai/test-connection` chỉ nhận `{provider}` cho Gemini hoặc OpenAI API từ DocForm local; dùng câu thử cố định, rate limit và không nhận payload tài liệu. OpenAI Responses và Gemini chỉ được gọi theo provider đã chọn; OpenAI dùng `store:false` và không có fallback sang provider khác.
- OpenAI API dùng `OPENAI_API_KEY`/`OPENAI_MODEL`; adapter ở [`../src/server/openAiApiProvider.ts`](../src/server/openAiApiProvider.ts). UI chỉ lưu provider mặc định, không lưu khóa. Chi tiết cấu hình và phạm vi dữ liệu tại [`AI_PROVIDER_SETUP.md`](AI_PROVIDER_SETUP.md).
- `/api/ai/full-document-capability` mô tả giới hạn adapter/transport. `SUPPORTED_BY_ADAPTER` không đồng nghĩa toàn văn đã được gửi/đọc hoặc bố cục đã được xem.

### Kiểm thử liên quan:
- `test/server-network-security.test.ts` — Khẳng định mặc định bind loopback 127.0.0.1 và từ chối 403 các yêu cầu có Origin/Host không hợp lệ tới các route AI.
- `test/server-startup-safety.test.ts` — Kiểm tra bind explicit/Cloud Run không mở quyền gọi AI từ Host ngoài local; cổng bị chiếm trả rejection cho caller thay vì lỗi tiến trình không được xử lý. Khi listen lỗi, server dọn Vite trước khi reject.
- `test/gemini-live-smoke.test.ts` (kiểm tra kết nối Gemini nếu có API key).
- [`../test/openai-api-provider.test.ts`](../test/openai-api-provider.test.ts), [`../test/openai-api-routes.test.ts`](../test/openai-api-routes.test.ts) — Adapter Responses, câu thử cố định, định tuyến từng thao tác, lỗi cấu hình và không tự chuyển provider.
- [`../test/ai-provider-settings-browser.test.ts`](../test/ai-provider-settings-browser.test.ts) — Giao diện desktop: chọn OpenAI, câu thử chỉ gửi provider ID, công khai provider trước consent tinh chỉnh và không có ô nhập khóa.
- Kiểm tra cổng cục bộ: `fetch('http://localhost:5050/')`.

### Sign in with ChatGPT cho ứng dụng local
- [`../src/server/windowsDpapi.ts`](../src/server/windowsDpapi.ts), [`../src/shared/chatgptPlanProtocol.ts`](../src/shared/chatgptPlanProtocol.ts) và SDK vendored dưới `../vendor/openai/sign-in-with-chatgpt-devkit/` chứa ranh giới lưu credential an toàn và trạng thái không có token.
- Bật bằng `DOCFORM_SIWC_ENABLED=true` trên Windows/Node.js 22+; khi bật ở local, máy chủ chỉ bind `127.0.0.1`, không bật trên Cloud Run. UI có thao tác kết nối/ngắt kết nối, chọn provider và đồng ý gửi theo tệp/thao tác.
- ChatGPT plan chỉ nhận văn bản qua adapter SIWC hiện tại. Rà soát toàn văn là manifest text theo chunk; luồng này không gửi DOCX/PDF/ảnh trang, không đọc OOXML và không xác nhận đã xem layout. Kết quả AI vẫn là observation/đề xuất để người dùng rà soát.
- OAuth/refresh và nghiệm thu provider bằng tài khoản thật chưa được xác minh trong hồ sơ hiện tại. ONLYOFFICE plugin chưa tích hợp. Chi tiết cấu hình/giới hạn ở [`SIWC_LOCAL.md`](SIWC_LOCAL.md).

---

## 2. Tải & Parse DOCX (Bảng Biểu, Ô Gộp, Ngắt Trang, Chữ Ký)

### File cần đọc:
- [`../src/server/blockExtractor.ts`](../src/server/blockExtractor.ts) — Trích xuất khối tuần tự (`SourceBlock`) từ file OOXML Word qua thư viện `jszip`.
- [`../src/utils/localFileImport.ts`](../src/utils/localFileImport.ts) — Bộ đọc tệp cục bộ trên trình duyệt (client-side), cho phép bóc tách không cần gửi tệp lên backend.
- [`../src/utils/draftStore.ts`](../src/utils/draftStore.ts) — Kho bản gốc `source_blobs` theo SHA-256 và trạng thái lưu bền vững/tạm thời.
- [`../src/server/parser.ts`](../src/server/parser.ts) — Nhận diện loại văn bản gốc (`detectDocumentType`) và phân tách dữ liệu thô.
- [`../src/server/sourceVisualRenderer.ts`](../src/server/sourceVisualRenderer.ts) — Rendition cục bộ cho đối chiếu trực quan nguồn; xem thêm endpoint ở mục 1.

### Luồng dữ liệu:
```
Tệp .docx (Buffer/ArrayBuffer)
    ├── JSZip giải nén word/document.xml & word/styles.xml
    ├── Duyệt tuyến tính các thẻ <w:p> (đoạn văn) và <w:tbl> (bảng biểu)
    ├── Trích xuất thuộc tính bảng: w:tblPr, w:cantSplit, w:tblHeader, w:gridSpan (colspan), w:vMerge (rowspan)
    └── Sinh mảng SourceBlock[] (giữ nguyên thứ tự dòng, gán ID duy nhất)
```

### Trạng thái thực tế: 🟢 Có Candidate Verification Gate, hợp đồng sửa ô và test liên quan (kèm giới hạn kỹ thuật)
- **Các bảo đảm có test tương ứng trong repository (hãy chạy lại trước khi kết luận ở commit hiện tại):**
  1. Hợp đồng chỉnh sửa ô bảng (P0/F01): `syncTableModelFromHtml` và `syncImportedTablesFromHtml` trong `src/utils/tableFormatUtils.ts`. Các ca kiểm thử sửa chữ trong ô bảng (`NGUON` -> `DA SUA`), xóa text, và số có số 0 đầu (`0123`) kiểm tra nội dung cùng hình học lưới/định dạng được bao phủ; candidate verification phát hiện và chặn nếu candidate DOCX không phản ánh sửa đổi. Đây không phải bảo đảm phổ quát cho mọi OOXML.
  2. Định danh bảng và kiểm chứng hai chiều (P1/F02): Embed `w:tblCaption` mang đúng `tableId` trong `buildDocxTableFromModel`. `verifyCandidateExportFidelity` đối chiếu hai chiều: phát hiện bảng bị thiếu, hoán đổi, hoặc bảng mới do người dùng tạo; loại bỏ hoàn toàn bypass `roundtripVerified = true` khi manifest có bảng.
  3. Đồng bộ một nguồn chân lý duy nhất (P1/F03): `reviewBlocks` đã duyệt là nguồn duy nhất cho preview, xuất Word, `importedTables`, manifest và candidate gate. Đề xuất AI chạm ô bảng cập nhật đồng thời cả `tableData`, `tableModel` và `reviewBlocks`.
  4. Đối chiếu sâu định dạng bảng (P1/F04): `compareTableFidelity` so khớp chi tiết mọi đoạn văn/run trong ô (phông, cỡ chữ nửa điểm, in đậm, in nghiêng), căn đoạn trong ô (`w:jc`), màu nền ô (`w:shd`), thuộc tính lặp tiêu đề (`w:tblHeader`) và chống ngắt trang (`w:cantSplit`).
  5. Đánh giá rule bằng chứng thật & phân loại vùng (P1/F05 & F06): Xóa bỏ `PASS` cố định của `BODY.TABLE.PRESERVATION` và `BODY.TABLE.HEADER_ROW`; đánh giá dãn dòng văn bản Đảng `HD05-BODY-LINE-SPACING` trên toàn bộ đoạn thân bài hợp lệ; hàm `detectParagraphRole` trong `bodyOoxmlEvidence.ts` tự động loại trừ tên loại văn bản, trích yếu, tiêu đề mục, nơi nhận và chữ ký khỏi chỉ số đo đạc thân bài.
  6. Báo trạng thái lưu nguồn bền vững (P2/F07): `saveSourceBlob` trả kết quả `{ persisted: boolean, storage: "indexeddb" | "memory" }` để người dùng biết tệp nguồn được lưu vĩnh viễn hay chỉ trong phiên.
  7. Chuẩn hóa đơn vị bảng preview (P2/F08): `tableModelToHtmlView` sử dụng đơn vị CSS `pt` hợp lệ thay thế cho `twip`, tránh lỗi hiển thị và không tự ý ép `width: 100%`.
  8. Test roundtrip đang có: `test/followup-audit-fixes.test.ts` và `test/imported-table-roundtrip.test.ts` kiểm tra các hợp đồng được bao phủ; test tài liệu thật cùng PDF LibreOffice không có trong checkout hiện tại.
  9. Đồng bộ một nguồn trạng thái đã duyệt & Đề xuất AI chuẩn xác vị trí (Gap 1 & Audit Critical 1): Module `src/utils/proposalState.ts` (`applySingleProposal`, `applyAllProposalsSequentially`, `changeBlockRole`). Cập nhật bất biến không mutate React state; kiểm tra chặt chẽ `original` text; tái dựng HTML bảng trực tiếp từ `tableModelToHtmlView` theo `data-cell-id` và tái tạo `doc.bodyHtml`, `structuredImport.body.html` trực tiếp từ danh sách `reviewBlocks` đã duyệt, loại bỏ triệt để lỗi string replace thay thế nhầm vị trí đầu tiên khi nhiều đoạn hoặc nhiều ô có text giống nhau (`SAME`).
  10. Cổng kiểm chứng bảng hai chiều & Chính sách bảng mới (Gap 2 & Audit Critical 3): `verifyCandidateExportFidelity` trong `src/utils/tableRoundtrip.ts` phân loại bảng layout hệ thống (`header`/`signature`) và bảng nội dung, ghi nhận `tableDecisions` cho mọi bảng; phát hiện ID trùng lặp (`duplicate_table_id`), đảo thứ tự bảng (`table_order_mismatch`), và bảng mới phát sinh không rõ nguồn gốc (`unexplained_new_table`) với nguyên tắc fail-closed. Kiểm tra toàn diện ngay cả khi `importedTables` rỗng: phát hiện DOCX ứng viên hỏng (`candidate_unpack_failed`) hoặc chứa bảng nội dung chưa duyệt.
  11. Bảo toàn nhiều run định dạng trong ô khi sửa chữ & CSS Inline Parsing (Gap 3 & Audit Critical 2): `tableFormatUtils.ts` bổ sung `parseRunsFromHtmlString`, `parseRunsFromDomElement` và `reconcileRunsWithNewText`. Các ca kiểm thử bao phủ thuộc tính `style="..."` trên `<span>` (font, size pt/px, bold, italic, underline và tắt style normal/none); kiểm tra LCS (Longest Common Subsequence) / Multi-site Alignment bảo toàn định dạng cho các vị trí sửa mẫu như `Abc MIDDLE xyZ`. Không suy rộng kết quả này thành bảo đảm phổ quát cho mọi cấu trúc HTML/OOXML.
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
- `test/imported-table-roundtrip.test.ts`, `test/final-section-roundtrip.test.ts` (roundtrip cấu trúc bảng, phụ lục, ngắt trang và chữ ký cuối bằng fixture tổng hợp; không phải bộ tài liệu thật/LibreOffice)
- `test/page-break-roundtrip-browser.test.ts` (Chromium cô lập: nhập fixture DOCX, giữ dấu ngắt trang trong editor và tải candidate có `w:br type="page"`)
- `test/final-footer-browser.test.ts` (Chromium: bảng cuối trộn nơi nhận/chữ ký, giữ đúng vùng Body và tách chức danh/tên người ký)
- `test/import-source-warning-browser.test.ts` (Chromium: `<w:sdt>` được giữ; bảng lồng, hyperlink, wrapper lạ, numbering tùy chỉnh và table style chưa hỗ trợ hiện cảnh báo; chi tiết chỉ mở khi cần)
- `test/txt-import-browser.test.ts` (Chromium: giữ rawText, dòng trống và thụt đầu dòng trong bản xem TXT Bước 1)
- `test/uiux-accessibility-browser.test.ts` (Chromium: hộp thoại duyệt nguồn, điều hướng bàn phím, độ tương phản và focus của điều khiển xem/xuất)
- `test/candidate-preview-print-browser.test.ts`, `test/stage5-integration-acceptance.test.ts` (kiểm thử trình duyệt Chromium cho preview/in ứng viên và nghiệm thu tích hợp; không mở Microsoft Word COM)
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

### Trạng thái thực tế: 🟢 Đã triển khai, có test liên quan trong repository
- **Invariant cần giữ:** Quy tắc "One Block - One Owner" không nhân bản khối. Nếu tài liệu nguồn không chứa khối chữ ký thì mảng `signatures` để trống, không tự động lấy các hàng trong bảng phân công để điền chữ ký giả.
- **Đầu trang Đảng dạng đoạn văn:** Khi hệ `party` đã được xác nhận, dấu `*` đứng riêng dưới cơ quan được giữ trong vùng `header` và không chặn phân đoạn số hiệu, tiêu đề Đảng, ngày tháng phía sau. Số hiệu nguồn được giữ nguyên (kể cả dấu `:`); dấu hiệu mâu thuẫn giữa hai hệ vẫn phải do người dùng xác nhận, không tự đổi hệ.
- **Giới hạn:** Với các văn bản phi chuẩn có tiêu đề nằm lẫn trong bảng không viền (borderless table), phân đoạn có thể gom toàn bộ bảng vào `header` hoặc `body` và cần người dùng điều chỉnh khi đối chiếu phân vùng ở Bước 1.

### Đối chiếu ngữ nghĩa Body/phụ lục và quyết định loại/profile

- [`../src/utils/localSemanticObservations.ts`](../src/utils/localSemanticObservations.ts) tạo quan sát ngữ nghĩa cục bộ; [`../src/utils/fullTextManifest.ts`](../src/utils/fullTextManifest.ts) tạo manifest text gắn với SHA nguồn, generation, package-part inventory và các đoạn bị loại.
- [`../src/utils/semanticAlignment.ts`](../src/utils/semanticAlignment.ts) căn kết quả AI với anchor nguồn; [`../src/utils/semanticReconciliation.ts`](../src/utils/semanticReconciliation.ts) và [`../src/utils/semanticState.ts`](../src/utils/semanticState.ts) hợp nhất bằng chứng/coverage và quyết định của người dùng.
- [`../src/canonical/semanticRuleSelector.ts`](../src/canonical/semanticRuleSelector.ts) chọn rule theo hệ, loại văn bản, profile và quyết định ngữ nghĩa. Quyết định bị vô hiệu khi nguồn, partition, hệ hoặc fingerprint liên quan thay đổi.
- [`../src/utils/sourceMismatch.ts`](../src/utils/sourceMismatch.ts) và [`../src/utils/profileDecision.ts`](../src/utils/profileDecision.ts) chặn chọn sai loại/profile âm thầm; quyết định phải bao phủ đúng ngữ cảnh nguồn hiện hành.
- Quan sát/nhận diện cấu trúc không tự chứng minh tuân thủ. Các mục cần người dùng xác nhận/duyệt vẫn phải giữ trạng thái riêng; không tự áp định dạng chỉ vì AI hoặc bộ phân loại đưa ra gợi ý.

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

### Trạng thái thực tế: 🟢 Đã triển khai, có test liên quan trong repository
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

### Trạng thái thực tế: 🟢 Đã triển khai, có test liên quan trong repository
- Trong [`../src/App.tsx`](../src/App.tsx), `ooxmlEvidence` được trích xuất trực tiếp từ bộ đệm DOCX sinh ra (`generateND30DocxBuffer` + `extractOoxmlEvidenceFromXml`) và truyền vào `evaluateDocumentRules()`.

### Kiểm thử liên quan:
- [`../test/nd30-compliance.test.ts`](../test/nd30-compliance.test.ts)
- [`../test/office-worker-redesign.test.ts`](../test/office-worker-redesign.test.ts) (Test 2 & Test 7)

---

## 6. Đề Xuất AI, Chính Tả, Văn Phong & Điểm Cần Duyệt

### File cần đọc:
- [`../src/server/reviewProposals.ts`](../src/server/reviewProposals.ts) — Bộ sinh đề xuất quy tắc ngoại tuyến (`generateRuleBasedProposals`) và chuẩn hóa regex tiếng Việt (`createVietnameseWordRegex`).
- [`../server.ts`](../server.ts) — Endpoint rà soát khối/đoạn và `/api/ai/review-full-text`; [`../src/server/chatgptPlanProvider.ts`](../src/server/chatgptPlanProvider.ts) kiểm tra phiên/quyền chia sẻ.
- [`../src/utils/fullTextReviewClient.ts`](../src/utils/fullTextReviewClient.ts), [`../src/server/fullTextSemanticService.ts`](../src/server/fullTextSemanticService.ts), [`../src/server/fullTextSemanticPrompt.ts`](../src/server/fullTextSemanticPrompt.ts) — Hợp đồng client/server, chia chunk, kiểm tra coverage và prompt rà soát toàn văn.
- [`../src/utils/semanticAlignment.ts`](../src/utils/semanticAlignment.ts), [`../src/utils/semanticReconciliation.ts`](../src/utils/semanticReconciliation.ts), [`../src/utils/semanticState.ts`](../src/utils/semanticState.ts) — Căn quan sát về đúng anchor nguồn và gắn quyết định người dùng vào trạng thái.
- [`../src/components/FullTextReviewPanel.tsx`](../src/components/FullTextReviewPanel.tsx) — Giao diện xem manifest, consent, tiến độ, coverage và lỗi từng chunk.
- [`../src/server/openAiApiProvider.ts`](../src/server/openAiApiProvider.ts), [`../src/utils/aiProviderLabels.ts`](../src/utils/aiProviderLabels.ts), [`../src/components/AppSettingsDrawer.tsx`](../src/components/AppSettingsDrawer.tsx) — OpenAI Responses adapter, nhãn provider và kiểm tra kết nối tổng hợp.

### Luồng dữ liệu & Cơ chế bảo vệ:
1. **Rà soát khối/tinh chỉnh đoạn:** endpoint hiện hành nhận văn bản/khối cần thiết cho thao tác người dùng chọn. Gemini có thể dùng Rule Fallback ngoại tuyến khi không có khóa; OpenAI API không tự chuyển provider và trả lỗi cấu hình/lỗi provider; ChatGPT cần phiên local. Tinh chỉnh phải có consent riêng cho thao tác.
2. **Rà soát toàn văn đã trích xuất:** `/api/ai/review-full-text` nhận manifest text đã dựng ở client, SHA nguồn/generation, inventory phần và consent ràng buộc provider/manifest. Endpoint kiểm tra fingerprint/coverage, gửi chunk tuần tự hoặc có concurrency giới hạn, trả NDJSON. Provider là Gemini, OpenAI API hoặc ChatGPT plan theo lựa chọn; không nhận DOCX/PDF/ảnh trang và không chứng minh đã xem layout.
3. Mỗi kết quả AI chỉ là observation/đề xuất. Text có thể được căn về anchor nguồn với coverage. Thiếu/sai phản hồi tạo partial/error, không được xem là toàn văn đã rà đủ.
4. Gợi ý nội dung có vị trí phải chờ người dùng **Áp dụng/Bỏ qua**. Quyết định ngữ nghĩa và rule áp dụng được gắn với fingerprint nguồn và hệ thể thức; khi ngữ cảnh đổi phải đánh giá lại.
5. Capability của provider không phải lời xác nhận mọi đoạn đã được gửi/đọc. Rendition qua `/api/ai/render-source-docx` là xử lý local.

### Trạng thái thực tế: 🟢 Đã triển khai, có test liên quan trong repository
- Đã khắc phục lỗi regex stateful carry-over (`lastIndex`) bằng cờ mặc định `"iu"`.
- Đã khắc phục lỗi đề xuất sai trích yếu cho văn bản Kế hoạch (không ép thêm tiền tố "V/v").
- Bộ test cho endpoint, client, manifest, semantic alignment/state và giao diện đã có trong `test/`; chúng không thay cho việc chạy lại đúng các lệnh trên commit hiện tại hoặc thử provider tài khoản thật.

### Kiểm thử liên quan:
- [`../test/office-worker-redesign.test.ts`](../test/office-worker-redesign.test.ts) (Test 5)
- [`../test/full-text-extraction-manifest.test.ts`](../test/full-text-extraction-manifest.test.ts)
- [`../test/full-text-review-endpoint.test.ts`](../test/full-text-review-endpoint.test.ts), [`../test/full-text-review-client.test.ts`](../test/full-text-review-client.test.ts)
- [`../test/semantic-ai-alignment.test.ts`](../test/semantic-ai-alignment.test.ts), [`../test/semantic-state.test.ts`](../test/semantic-state.test.ts)
- [`../test/full-text-review-ui.test.ts`](../test/full-text-review-ui.test.ts)

---

## 7. Giao Diện 3 Bước Hiện Hành

### File cần đọc:
- [`../src/App.tsx`](../src/App.tsx) — Điều phối `currentStep: 1 | 2 | 3`, nguồn/workspace, semantic decisions, bản nháp và ứng viên xuất.
- [`../src/components/ImportStepView.tsx`](../src/components/ImportStepView.tsx), [`../src/components/FullTextReviewPanel.tsx`](../src/components/FullTextReviewPanel.tsx) — Bước 1: chọn nguồn, consent text theo provider và xem coverage/kết quả theo đúng phạm vi.
- [`../src/components/WorkspaceEditor.tsx`](../src/components/WorkspaceEditor.tsx) — Bước 2: sửa các nhóm thể thức, thân bài và phụ lục; dùng [`../src/components/ND30Editor.tsx`](../src/components/ND30Editor.tsx) cho canvas soạn thảo.
- [`../src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx) — Bước 3: xem ứng viên DOCX hiện hành, trạng thái đối chiếu, tải xuống và in bản tham khảo.
- [`../src/components/CandidatePrintView.tsx`](../src/components/CandidatePrintView.tsx) — Dựng vùng in từ byte ứng viên DOCX hiện hành; phân trang trình duyệt chỉ để tham khảo.
- [`../src/components/OfficeWorkerViews.tsx`](../src/components/OfficeWorkerViews.tsx) — Còn chứa `SafeRegimeModal`, `AdvancedDrawer` đang dùng và `ExportStepView` cũ không được render trong wizard hiện hành.

### Trạng thái khởi tạo và điều hướng:
- `currentStep` khởi tạo ở **Bước 1** và chỉ nhận `1 | 2 | 3`. Điều hướng được chặn theo nguồn đã chọn, phân vùng đã duyệt và khả năng tạo ứng viên.
- Luồng hiện hành: **Bước 1 Tải, nhận diện & đối chiếu → Bước 2 Soạn & kiểm tra → Bước 3 Xem & xuất**. Bước 1 xử lý quyết định hệ/loại/profile và rà soát ngữ nghĩa; Bước 3 sử dụng `WorkspaceExport`, không sử dụng `ExportStepView` cũ.

### Trạng thái thực tế:
- Mã đã triển khai wizard 3 bước. Bước 2 hiển thị các nhóm thể thức và canvas soạn thảo; Bước 3 xem ứng viên từ byte DOCX, tải xuống hoặc in tham khảo. Cần kiểm chứng riêng khả năng thao tác chuột, bàn phím, cuộn và hiển thị ở các viewport mục tiêu.

---

## 8. Lưu Nháp, Lịch Sử Phiên Bản & Chuyển Hệ An Toàn

### File cần đọc:
- [`../src/utils/draftStore.ts`](../src/utils/draftStore.ts) — Tầng lưu trữ IndexedDB (`DocForm30_DB`, store `drafts`).
- [`../src/App.tsx`](../src/App.tsx) — Các hàm `saveDraft`, `loadDraft`, `pushVersion`, `restoreVersion`, `executeRegimeSwitch`.
- [`../src/utils/documentSessionStore.ts`](../src/utils/documentSessionStore.ts), [`../src/utils/documentSessionMigration.ts`](../src/utils/documentSessionMigration.ts) — Hạ tầng session v3/migration; hiện chưa được nối vào luồng giao diện đang chạy.

### Cơ chế hoạt động:
1. **Tự động lưu (Debounced Auto-save):** Sau mỗi thao tác chỉnh sửa 1.000ms, toàn bộ `doc`, `standardType` và danh sách `versions` được ghi vào IndexedDB. Nếu IndexedDB không khả dụng hoặc lỗi ghi, `saveDraft()` ném lỗi (reject) để giao diện hiển thị trạng thái `saveError` trung thực thay vì báo "Đã lưu tự động" giả.
   Bản nháp được lưu dưới dạng `DocumentState`, không qua `DocumentFormatSchema.parse`; thiếu người ký không buộc phải điền tên hoặc chức vụ giả để lưu. Schema chuẩn hóa ở middleware AI là hợp đồng dữ liệu khác với điều kiện lưu nháp.
2. **Phạm vi hiện hành:** UI đang lưu một bản nháp hoạt động với ID `current_active_draft`; phiên bản được giữ trong bản nháp đó. Không mô tả `documentSessionStore` là tính năng nhiều hồ sơ/sessions đã có trên giao diện.
3. **Khôi phục khi tải lại:** Khi mở ứng dụng, `loadDraft()` nạp bản nháp gần nhất và làm sạch chữ ký mẫu cũ nếu phát hiện bản nháp từ phiên bản trước.
4. **Chuyển hệ an toàn (`SafeRegimeModal`):**
   - Tạo bản sao lưu phiên bản hiện tại vào `versions` trước khi chuyển đổi.
   - Bảo toàn nội dung `bodyHtml`, số lượng bảng biểu, cấu trúc ô gộp (`colspan`/`rowspan`), phụ lục (`appendices`) và thông tin người ký thật.
   - Cập nhật Quốc hiệu/Tiêu đề (`ĐẢNG CỘNG SẢN VIỆT NAM` $\leftrightarrow$ `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM`) và định dạng số hiệu (`Số ...` $\leftrightarrow$ `Số: ...`) tương thích với hệ mới.

### Trạng thái thực tế: 🟢 Đã triển khai; test lịch sử có trong repository
- `draftStore` đang được `App.tsx` sử dụng. `documentSessionStore` có tests/migration nhưng chưa có import từ UI; không suy ra ứng dụng đã hỗ trợ chọn nhiều hồ sơ tài liệu.
- Các test lịch sử chuyển hệ và IndexedDB có ở `test/office-worker-redesign.test.ts` (Test 8 & Test 9); chạy lại trên commit hiện tại trước khi báo pass.

### Kiểm thử liên quan:
- [`../test/office-worker-redesign.test.ts`](../test/office-worker-redesign.test.ts) (Test 1, Test 8, Test 9, Test 10)

---

## 9. Xuất DOCX, in PDF tham khảo & Các Giới Hạn Của Preview So Với Word

### File cần đọc:
- [`../src/utils/workspaceTransactions.ts`](../src/utils/workspaceTransactions.ts) — Giao dịch workspace có revision, xác nhận và cổng partition.
- [`../src/utils/exportCandidate.ts`](../src/utils/exportCandidate.ts) — Định danh/cache ứng viên, tạo byte và kiểm tra độ mới.
- [`../src/utils/docxExport.ts`](../src/utils/docxExport.ts) — Sinh file Word `.docx` hoàn chỉnh qua thư viện `docx` và `jszip`.
- [`../src/utils/tableRoundtrip.ts`](../src/utils/tableRoundtrip.ts) — Candidate fidelity đối với bảng/ID/thứ tự/chính sách bảng mới.
- [`../src/utils/tableFormatUtils.ts`](../src/utils/tableFormatUtils.ts) — Tính toán độ rộng cột twips, căn chỉnh ô theo ngữ nghĩa (cột STT/ngày tháng căn giữa, cột số tiền/định mức căn phải, cột văn bản căn đều hai bên).
- [`../src/components/A4DocumentPreview.tsx`](../src/components/A4DocumentPreview.tsx) — Xem trước file Word thật bằng `docx-preview`.

### Bảng đối chiếu các chế độ hiển thị & giới hạn:

| Môi trường xem | Cơ chế hiển thị | Giới hạn đã biết so với Microsoft Word thật |
|---|---|---|
| **Canvas soạn thảo (Bước 2)** | HTML/CSS và trình soạn thảo | Là vùng sửa nội dung, không xác nhận phân trang vật lý trong Word. |
| **Bản xem ứng viên (Bước 3)** | `docx-preview` dựng từ byte DOCX ứng viên hiện hành | Ngắt trang và Shape có thể khác Microsoft Word; cần đối chiếu tệp DOCX trong Word trước khi phát hành. |
| **Xem trước Word thật (`docx-preview`)** | Render file `.docx` sang HTML canvas/SVG trên trình duyệt | `docx-preview` chưa hỗ trợ đầy đủ độ thụt lề âm (negative table indent) của OOXML; mã nguồn phải bù trừ thụt lề bằng CSS margin. Các nét vẽ DrawingML phức tạp có thể bị giản lược. |
| **Tệp Microsoft Word xuất ra (`.docx`)** | OOXML nén chuẩn Microsoft Office | Ghi đầy đủ thuộc tính `w:cantSplit`, `w:tblHeader`, `w:gridSpan` và DrawingML/VML shape lines vào `word/document.xml`. Bố cục ngắt trang thực tế khi in vẫn phụ thuộc vào engine dàn trang của Microsoft Word nên cần kiểm tra trực quan đối với tài liệu nhiều trang. |

Ứng viên được dựng từ snapshot workspace có revision/fingerprint; `WorkspaceExport` dùng cùng byte ứng viên cho preview, tải xuống và in tham khảo. Chức năng tải xuống và in ấn phụ thuộc trực tiếp vào cổng an toàn (`safe: true`); khi candidate vi phạm toàn vẹn (`safe: false`), chức năng tải và in bị khóa có thông báo lý do rõ ràng và kích hoạt nút tải tệp gốc nguyên vẹn (`originalAvailable`). Trạng thái xuất ở Bước 3 là tất định (`missing`, `safe` hoặc `blocked`). Khi nội dung soạn thảo thay đổi, ứng viên cũ bị hủy bỏ (invalidation) để tránh xuất bản nháp không đồng bộ.

### Trạng thái thực tế: 🟡 Có kiểm tra cấu trúc OOXML trong repository; cần kiểm tra trực quan khi in ấn thực tế
- Repository có test cấu trúc OOXML về kích thước trang A4, lề trang, bảng biểu, ô gộp, phụ lục và Shape Lines; tên test không phải kết quả chạy của checkout hiện tại.
- Việc hiển thị ngắt trang vật lý trên từng phiên bản Microsoft Word / LibreOffice cụ thể vẫn cần người dùng mở tệp `.docx` xuất ra để kiểm tra trực quan lần cuối.

### Kiểm thử liên quan:
- [`../test/nd30-compliance.test.ts`](../test/nd30-compliance.test.ts) (Test 18, 21, 22, 24)
- [`../test/table-and-body-format.test.ts`](../test/table-and-body-format.test.ts)

---

## 10. Thư Viện Fixture & Bộ Kiểm Thử Liên Quan

### Thư mục fixture:
- `../fixtures/pilot_documents/` — Bộ 27 tài liệu pilot do `npm run fixtures:export` sinh tại máy; thư mục không có sẵn trong checkout hiện tại.
- `../fixtures/complex_malformed/` — Bộ 10 tài liệu thử thách do `npm run fixtures:export:edgecases` sinh tại máy; thư mục không có sẵn trong checkout hiện tại.

### Danh mục bài kiểm thử chính:

| File kiểm thử | Đối tượng kiểm tra | Lệnh chạy |
|---|---|---|
| `test/office-worker-redesign.test.ts` | Bộ hồi quy lịch sử của luồng 4 bước; không thay thế xác nhận wizard 3 bước hiện tại | `npx tsx test/office-worker-redesign.test.ts` |
| `test/header-dual-regime.test.ts` | Kiểm định hình học phần đầu NĐ 30 và HD 05 (Generic & Hoa Tiêu MB) | `npx tsx test/header-dual-regime.test.ts` |
| `test/nd30-compliance.test.ts` | 32 chỉ tiêu tuân thủ thể thức hành chính bắt buộc | `npm test` |
| `test/import-segments.test.ts` | Độ chính xác của phân đoạn cấu trúc tài liệu | `npm run test:import:segments` |
| `test/table-and-body-format.test.ts` | Định dạng và bảo toàn cấu trúc bảng biểu | `npm run test:body:tables` |
| `test/pilot-documents.test.ts` | Chạy kiểm tra hàng loạt trên 27 tài liệu pilot | `npm run test:pilot` |
| `test/complex-malformed-pipeline.test.ts` | Xử lý dữ liệu hỏng, bảo vệ XSS | `npm run test:edgecases` |
| `test/repro-plan-signature-bug.test.ts` | Tái hiện và ngăn chặn lỗi chữ ký giả trên văn bản kế hoạch | `npm run test:repro` |
| `test/full-text-extraction-manifest.test.ts`, `test/full-text-review-endpoint.test.ts`, `test/full-text-review-client.test.ts` | Manifest, consent/validation, chunking và giao thức endpoint rà soát toàn văn | `npx tsx <file>` cho từng tệp |
| `test/semantic-ai-alignment.test.ts`, `test/semantic-state.test.ts`, `test/semantic-rule-selector.test.ts` | Căn quan sát về anchor, fingerprint quyết định và chọn rule | `npx tsx <file>` cho từng tệp |
| `test/profile-decision-gate.test.ts`, `test/source-mismatch-profile.test.ts` | Chặn profile/loại văn bản mâu thuẫn với nguồn cho đến khi có quyết định đúng ngữ cảnh | `npx tsx <file>` cho từng tệp |
| `test/server-network-security.test.ts` | Bảo vệ mạng: mặc định bind 127.0.0.1, từ chối 403 các yêu cầu có Origin/Host lạ tới route AI trước khi gọi provider | `npx tsx test/server-network-security.test.ts` |
| `test/openai-api-provider.test.ts`, `test/openai-api-routes.test.ts`, `test/ai-provider-settings-browser.test.ts` | OpenAI Responses, định tuyến/consent, câu thử không có dữ liệu tài liệu và giao diện provider | `npx tsx <file>` cho từng tệp |
| `test/export-candidate-contract.test.ts`, `test/candidate-preview-print-browser.test.ts` | Tính hiện hành, hợp đồng ứng viên và byte preview/in | `npx tsx <file>` cho từng tệp |
| `test/document-session-store.test.ts`, `test/document-session-migration.test.ts`, `test/document-session-gate.test.ts` | Hạ tầng session/migration (không chứng minh đã có UI nhiều hồ sơ) | `npx tsx <file>` cho từng tệp |

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

### 9. Tính hiện hành của ứng viên tại Bước 3:
- **Nơi bắt đầu:** [`src/App.tsx`](../src/App.tsx) tại `prepareCandidate`, `exportToDocx`, `handlePrintCandidate`; [`src/utils/exportCandidate.ts`](../src/utils/exportCandidate.ts) tại `exportCandidateKey` và `isCurrent`; [`src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx) tại bảng trạng thái ứng viên.
- **Điểm kiểm tra:** Bản xem, tệp tải và bản in đều dùng ứng viên DOCX hiện hành có cùng byte, SHA-256 và phiên bản. `candidate.safe` và `candidate.downloadable` có ý nghĩa khác nhau; khi có cảnh báo, giao diện phải nêu rõ việc người dùng cần đối chiếu trong Word. Không dùng nhãn của `ExportStepView` cũ làm bằng chứng cho Bước 3 đang chạy.
- **Giới hạn:** Các bài test giao diện 4 bước cũ chỉ là hồi quy lịch sử; cần xác nhận riêng luồng Bước 3 hiện hành và bố cục trong Microsoft Word.

### 10. AI báo đã rà toàn văn nhưng không đủ phạm vi/không có bằng chứng:
- **Nơi bắt đầu:** [`src/utils/fullTextManifest.ts`](../src/utils/fullTextManifest.ts), [`src/server/fullTextSemanticService.ts`](../src/server/fullTextSemanticService.ts), `server.ts` endpoint `/api/ai/review-full-text`, `src/utils/semanticAlignment.ts` và `src/components/FullTextReviewPanel.tsx`.
- **Điểm kiểm tra:** Manifest/consent phải khớp SHA nguồn, generation, provider và fingerprint; mọi segment phải có trạng thái/phản hồi hợp lệ. Thiếu đoạn phải hiển thị coverage partial. Không diễn giải capability hoặc local source rendering thành bằng chứng provider đã đọc file/ảnh trang.
- **Bài test kiểm chứng:** `test/full-text-extraction-manifest.test.ts`, `test/full-text-review-endpoint.test.ts`, `test/full-text-review-client.test.ts`, `test/semantic-ai-alignment.test.ts`.

### 11. Chọn profile sai nguồn hoặc mô tả nhầm session store thành tính năng sản phẩm:
- **Nơi bắt đầu:** [`src/utils/sourceMismatch.ts`](../src/utils/sourceMismatch.ts), [`src/utils/profileDecision.ts`](../src/utils/profileDecision.ts), `src/App.tsx` và `src/utils/draftStore.ts`.
- **Điểm kiểm tra:** Quyết định profile/loại phải gắn với đúng nguồn và regime. Giao diện hiện lưu `current_active_draft`; `documentSessionStore` mới được dùng bởi migration/tests.
- **Bài test kiểm chứng:** `test/profile-decision-gate.test.ts`, `test/source-mismatch-profile.test.ts`, `test/document-session-migration.test.ts`.

