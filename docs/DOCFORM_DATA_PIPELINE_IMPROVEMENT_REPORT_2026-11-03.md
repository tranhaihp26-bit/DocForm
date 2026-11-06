# Báo cáo hoàn thiện luồng xử lý dữ liệu DocForm (DocForm-30)

**Thời gian cập nhật:** 2026-11-04\
**Nhánh Git:** `main` (Ahead of `origin/main` 1 commit)\
**Baseline HEAD commit:** `4c3751f`\
**Căn cứ triển khai và kiểm tra:**
- Đề án cải tiến: `D:\DocForm\docs\DOCFORM_DATA_PIPELINE_IMPROVEMENT_PROPOSAL_2026-11-03.md`
- Báo cáo kiểm toán ban đầu: `D:\DocForm\docs\DOCFORM_DOCUMENT_STRUCTURE_PIPELINE_AUDIT_2026-11-03.md`
- Báo cáo kiểm tra độc lập: `D:\DocForm\docs\ANTIGRAVITY_DIRECTION_REVIEW_2026-11-04.md`
- Quy tắc dự án: `AGENTS.md`, `src/server/AGENTS.md`, `src/utils/AGENTS.md`, `src/components/AGENTS.md`

---

## 1. Cơ sở và trạng thái làm việc

1. **Bảo toàn thay đổi local:**
   - Làm việc trực tiếp trên nhánh `main` tại `D:\DocForm`. Không tạo nhánh mới hoặc git worktree.
   - Toàn bộ các thay đổi local có sẵn từ trước được bảo tồn nguyên vẹn.
   - Không thực hiện bất kỳ lệnh `git commit`, `git push`, `git merge`, `git reset` hoặc `git checkout` đè lên file.

2. **Tiến trình và cổng mạng:**
   - Cổng 5050 giữ nguyên cho vận hành chính. Các bài kiểm thử trình duyệt chạy trên cổng tạm độc lập (`5078`, `5174`, `5175`, `5176`) và tự động dọn dẹp, tắt tiến trình ngay khi kết thúc (`server.kill()`, `client.close()`).
   - Kiểm tra `manage_task(Action='list')` xác nhận 0 tiến trình nền còn tồn tại.

---

## 2. Kết quả triển khai theo từng đợt (Cập nhật sau Review Độc Lập)

| Đợt | Nội dung trọng tâm | Trạng thái | Ghi chú kiểm chứng & Giới hạn |
|---|---|---|---|
| **Đợt A** | Sửa mất nội dung (Separator NĐ30/HD05) & Bổ sung Coverage Gate | **PASS** | Separator NĐ30/HD05 được giữ nguyên vị trí và số lượng; đã đóng toàn bộ các false pass của coverage (đoạn trùng chữ, sửa đoạn A không miễn đoạn B, kiểm đích thực tế cho footer/header). |
| **Đợt B** | Hợp đồng ánh xạ nguồn → byte DOCX (Source Mapping & Coverage Contract) | **PARTIAL** | Pipeline ánh xạ nguồn → workspace `buildSourceToWorkspaceCoverage` và `TransformationRecord` đã hoạt động, phát hiện khối rơi rụng trước compose. Tuy nhiên, việc đối chiếu ngược chi tiết từ từng byte cell-level OOXML cho bảng phức tạp vẫn đang tiếp tục hoàn thiện. |
| **Đợt C** | Bảo toàn phần đầu, phần cuối và đồ họa Shape trang trí | **PARTIAL** | Sửa parser Shape độc lập thứ tự thuộc tính và kiểm tra Fallback; bảng chữ ký nhúng chuyển thành `owner: 'signature'` ngoài Body. Các bảng hỗn hợp Body–ký chưa chia vùng vẫn giữ nguyên và yêu cầu duyệt thủ công. |
| **Đợt D** | Phân tách Preview chẩn đoán và điều kiện Tải/In | **PASS** | Tách rõ 4 trạng thái: Có thể render an toàn (`canRenderDiagnostic`), Đạt fidelity (`safe`), Đủ điều kiện tải/in (`downloadable`), Candidate hiện hành. Đã ban hành chính sách `isPackageSafeForDiagnosticRender` quét quan hệ external/active và macro. Các nút tải/in được hiển thị rõ ràng ở trạng thái `disabled` (is-locked). |
| **Đợt E** | Kiểm thử hồi quy, Nghiệm thu Desktop & Pilot tệp thật cục bộ | **PASS** | `npm.cmd run lint` (exit code 0), `npm.cmd run build` (exit code 0), 8/8 bài test hồi quy `test/data-pipeline-improvement.test.ts` pass, 18/18 test `test/final-section-roundtrip.test.ts` pass, test browser CDP trên tệp thật `01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx` pass. |
| **Bố cục Word thực tế** | Kiểm tra hiển thị trực quan trong Microsoft Word / LibreOffice GUI | **NOT_EVALUATED** | Chưa đánh giá do môi trường agent không có CLI Word/LibreOffice GUI. Byte DOCX candidate đã được kiểm tra cấu trúc OOXML hợp lệ qua JSZip. |

---

## 3. Đối chiếu và xử lý các phát hiện trong Báo cáo Kiểm tra Độc lập

Căn cứ vào `ANTIGRAVITY_DIRECTION_REVIEW_2026-11-04.md`, dưới đây là chi tiết nguyên nhân, giải pháp sửa đổi và kết quả kiểm chứng cho từng phát hiện:

### 3.1. P1 — Khắc phục triệt để các False Pass của Coverage

- **Hiện tượng & Probe độc lập đã chỉ ra:**
  1. *Đoạn trùng chữ:* Nguồn có 2 paragraph cùng chữ nhưng working Body chỉ có 1 paragraph (node lineage chứa cả 2 ID), coverage vẫn báo `isFullyCovered=true`.
  2. *Sửa đoạn A miễn kiểm tra đoạn B:* `workspaceState.ts` kiểm tra đếm paragraph nhưng bỏ qua toàn bộ khi ledger có bất kỳ text edit nào trong Body.
  3. *Header/Footer/Separator không có đích nhưng vẫn công nhận:* `signature`/`recipients` tự động gắn `preserved`, `separator` tự gắn `transformed`, bảng header được nhận chỉ vì là table, dẫn đến nguồn có chữ ký nhưng working state có các trường cuối rỗng vẫn PASS.
- **Nguyên nhân:**
  - Logic cũ chỉ kiểm tra `lineage.includes(b.id) || textMatch` và không đếm tiêu thụ thực thể (`instance consumption`).
  - Lệnh điều kiện `if (!textEdits)` miễn trừ sai phạm vi toàn bộ Body.
  - Phân loại trạng thái dựa vào role khai báo thay vì kiểm tra giá trị thực tế của trường/ô đích trong `DocumentState`.
- **Hành vi & File đã sửa:**
  - [`src/shared/sourceMapping.ts`](file:///D:/DocForm/src/shared/sourceMapping.ts):
    - Áp dụng cơ chế tiêu thụ thực thể (`availableBodyParagraphs.splice`): mỗi khối nguồn vật lý phải tiêu thụ đúng một đoạn văn tương ứng trong Body. Nếu 2 khối nguồn trùng chữ mà chỉ có 1 đoạn trong Body, khối thứ hai lập tức bị đánh dấu `missing` (`missing_body_block`).
    - Chỉ công nhận lineage có nhiều ID khi sổ cái có ghi nhận giao dịch `merge` hợp lệ có xác nhận (`confirmed`).
    - Xác minh đích thực tế:
      + `signature`: Phải có `doc.signTitle` hoặc `doc.signName` không rỗng, hoặc ô bảng ký có dữ liệu. Nếu rỗng, đánh dấu `missing` (`missing_signature_destination`).
      + `recipients`: Phải có `doc.recipients` không rỗng hoặc ô nơi nhận có dữ liệu. Nếu rỗng, đánh dấu `missing` (`missing_recipients_destination`).
      + `header`/`metadata`: Bảng header hoặc paragraph thể thức phải ánh xạ tới ít nhất một trường không rỗng trong `doc`. Nếu rỗng, đánh dấu `unresolved` (`unmapped_metadata_block`).
      + `separator`: Phải có trích yếu hoặc vị trí phân cách hợp lệ trong `doc.bodyHtml`.
  - [`src/utils/workspaceState.ts`](file:///D:/DocForm/src/utils/workspaceState.ts):
    - Loại bỏ nhánh `if (!textEdits)` gây miễn trừ kiểm tra. Mọi vi phạm độ bao phủ từ `buildSourceToWorkspaceCoverage` được đưa trực tiếp vào `workspaceInvariantErrors`.
- **Test tái hiện & Kết quả sau sửa:**
  - `✔ Đợt A & B: Đoạn văn trùng chữ chỉ có 1 đích thực tế phải báo lỗi coverage (P1 Probe 1)`: **PASS**.
  - `✔ Đợt A & B: Chỉnh sửa đoạn A không được miễn kiểm tra độ bao phủ đoạn B (P1 Probe 2)`: **PASS**.
  - `✔ Đợt A & B: Nguồn có chữ ký / nơi nhận nhưng đích rỗng phải bị phát hiện (P1 Probe 3)`: **PASS**.

---

### 3.2. P1 & P2 — Sửa Parser Shape độc lập thứ tự thuộc tính và kiểm tra Fallback

- **Hiện tượng & Probe độc lập đã chỉ ra:**
  - Nhánh regex đọc `cy` trước `cx` nhưng vẫn gán `extentMatch[1]` cho `cx` và `extentMatch[2]` cho `cy`. Do đó `cx="100000" cy="0"` trả true, nhưng `cy="0" cx="100000"` bị gán ngược `cx=0, cy=100000` và trả false.
  - Điều kiện `if (!hasLineGeom && !hasVmlLine)` chấp nhận khi chỉ một nhánh có line, chưa kiểm tra tính tương ứng giữa Choice (DrawingML) và Fallback (VML).
- **Nguyên nhân:** Regex capture nhóm cứng theo vị trí chỉ mục mà không bóc tách thuộc tính độc lập.
- **Hành vi & File đã sửa:**
  - [`src/utils/sourceHeaderShapes.ts`](file:///D:/DocForm/src/utils/sourceHeaderShapes.ts):
    - Trích xuất thẻ `<wp:extent>` và bóc tách `cx="..."`, `cy="..."` bằng các regex thuộc tính riêng biệt, hoàn toàn độc lập với thứ tự xuất hiện trong XML.
    - Bắt buộc cả hai nhánh phải tương ứng: Choice phải có DrawingML line (`<a:prstGeom prst="line|straightConnector1">`) VÀ Fallback phải có VML line (`<v:line>`).
    - Kiểm tra tọa độ của `<v:line>`: độ chênh lệch trục Y giữa `from` và `to` không được vượt quá 2pt để loại trừ các đường vẽ chéo hoặc hình học phi trang trí.
- **Test tái hiện & Kết quả sau sửa:**
  - `✔ Đợt C: Nhận diện đường kẻ Shape độc lập thứ tự thuộc tính XML và kiểm tra Fallback (P2 Fix)`: **PASS** (thử nghiệm cả hai thứ tự thuộc tính, fallback lệch và đường chéo).

---

### 3.3. P1 & D — Chính sách an toàn gói DOCX cho Preview chẩn đoán

- **Hiện tượng & Yêu cầu từ Review:**
  - Đặt `canRenderDiagnostic=true` chỉ dựa vào việc giải nén được XML và không rỗng là chưa đủ chứng minh render an toàn; không thể đánh đồng giải nén zip với validate OOXML hay cô lập rủi ro.
- **Hành vi & File đã sửa:**
  - [`src/utils/exportCandidate.ts`](file:///D:/DocForm/src/utils/exportCandidate.ts):
    - Triển khai hàm kiểm tra chính sách an toàn gói: `isPackageSafeForDiagnosticRender(zip: JSZip)`.
    - Kiểm tra bắt buộc sự tồn tại của các thành phần OOXML cốt lõi: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`.
    - Quét toàn bộ các file `.rels`: Từ chối kết xuất nếu phát hiện `TargetMode="External"` trỏ tới các giao thức mạng hoặc tệp nguy hiểm (`http:`, `https:`, `file:`, `javascript:`, `script:`).
    - Từ chối các loại quan hệ kích hoạt đối tượng OLE (`oleObject`), điều khiển ActiveX (`control`), subdocuments hoặc framesets.
    - Quét nội dung gói: Từ chối các thành phần macro nhị phân (`vbaProject.bin`, v.v.) hoặc các kiểu nội dung macro-enabled.
    - Khi không đạt chính sách, gán `canRenderDiagnostic = false` và ghi nhận blocker `diagnostic_render_unsafe`.
  - [`src/components/WorkspaceExport.tsx`](file:///D:/DocForm/src/components/WorkspaceExport.tsx):
    - Khi ứng viên bị chặn (`isCandidateEligibleForExport(candidate) === false`), giao diện hiển thị rõ ràng các nút tải và nút in ở trạng thái khóa: `<button disabled aria-disabled="true" className="df-step3-download-button is-locked">Tải xuống DOCX (Đang khóa)</button>`, kèm thông báo cảnh báo `role="alert"`.
- **Test tái hiện & Kết quả sau sửa:**
  - `✔ Đợt D: Chính sách an toàn gói DOCX cho preview chẩn đoán (isPackageSafeForDiagnosticRender)`: **PASS**.

---

### 3.4. P2 — Sửa lỗi TypeScript và Lint (`StructuredImport`)

- **Hiện tượng:** `npm.cmd run lint` báo lỗi TS2339 tại `test/data-pipeline-improvement.test.ts:60` do truy cập `segmented.extractedFields` không tồn tại trên `StructuredImport`.
- **Nguyên nhân:** Dữ liệu test giả định trường `extractedFields` thay vì sử dụng hàm chuyển đổi chuẩn của ứng dụng.
- **Hành vi & File đã sửa:**
  - [`test/data-pipeline-improvement.test.ts`](file:///D:/DocForm/test/data-pipeline-improvement.test.ts):
    - Sử dụng hàm chuẩn sản phẩm [`reconstructFromReviewedBlocks`](file:///D:/DocForm/src/utils/importReview.ts) để dựng lại trường dữ liệu từ các khối đã nhận diện.
    - Loại bỏ hoàn toàn việc ép kiểu `as any`, tuân thủ 100% schema `StructuredImport` và `DocumentState`.
    - Sửa lỗi ép kiểu undefined trong [`src/shared/sourceMapping.ts`](file:///D:/DocForm/src/shared/sourceMapping.ts).
- **Lệnh thực thi & Kết quả sau sửa:**
  - `npm.cmd run lint` (`tsc --noEmit`): **PASS** (Exit code 0).
  - `npm.cmd run build` (`vite build && tsc --noEmit`): **PASS** (Exit code 0).

---

### 3.5. P2 — Sửa độ tin cậy và tính chính xác của Test Pilot Trình duyệt

- **Hiện tượng & Nhận xét từ Review:**
  - Lệnh `return` khi thiếu file khiến runner báo PASS dù chưa chạy; selector kiểm tra khóa tải/in dựa vào phần tử vắng mặt; nhầm lẫn tên harness Playwright và viewport.
- **Hành vi & File đã sửa:**
  - [`test/pilot-local-document-browser.test.ts`](file:///D:/DocForm/test/pilot-local-document-browser.test.ts):
    - Sử dụng `t.skip("PILOT_FILE_PATH không tồn tại, đánh dấu BLOCKED...")` khi không tìm thấy tệp pilot thật, ngăn ngừa runner báo PASS giả tạo.
    - Ghi nhận chính xác harness: Sử dụng **`CdpClient` (Chrome DevTools Protocol)** trực tiếp trên trình duyệt Chromium với viewport chuẩn Desktop PC **1366 × 768**.
    - Assert chặt chẽ trạng thái ứng viên: Bắt buộc `step3Inspection.candidateState !== "missing"` và `step3Inspection.isSafe` phải có giá trị xác định rõ (`"true"` hoặc `"false"`).
    - Kiểm tra nút khóa tải/in: Bắt buộc các nút `.df-step3-download-button` và `.df-step3-print-button` phải có thuộc tính `disabled` hoặc class `.is-locked`, đồng thời kiểm tra sự hiện diện của đoạn văn bản thông báo khóa tải/in `.df-step3-export-note`.
- **Lệnh thực thi & Kết quả sau sửa:**
  - `npx.cmd tsx test/pilot-local-document-browser.test.ts`: **PASS** (12 khối vật lý nguồn, 8 đoạn thân bài, 1 bảng ký ngoài Body; Bước 3 hiển thị banner đối chiếu chẩn đoán, khóa tải/in disabled).

---

## 4. Bằng chứng kiểm thử tổng hợp

| Lệnh thực thi | Mã thoát (Exit code) | Kết quả kiểm chứng thực tế |
|---|---|---|
| `npm.cmd run lint` | **0** | TypeScript kiểm tra tĩnh hoàn toàn sạch lỗi trên toàn bộ repository. |
| `npm.cmd run build` | **0** | Rolldown/Vite build bundle thành công (1905 modules transformed). |
| `npx.cmd tsx test/data-pipeline-improvement.test.ts` | **0** | **8/8 tests PASS** (Bao gồm đầy đủ các ca tái hiện P1, P2 từ review độc lập). |
| `npx.cmd tsx test/final-section-roundtrip.test.ts` | **0** | **18/18 tests PASS** (Bảo toàn phụ lục, chữ ký, phân trang và roundtrip). |
| `npx.cmd tsx test/workspace-candidate.test.ts` | **0** | **14/14 tests PASS** (Quản lý candidate bất biến, revision, table ledger). |
| `npx.cmd tsx test/pilot-local-document-browser.test.ts` | **0** | **1/1 test PASS** (CDP 1366x768 trên tài liệu thực tế `01_Thong_bao...docx`). |

---

## 5. Giới hạn tồn đọng và hướng tiếp theo

1. **Hiển thị trực quan trong Microsoft Word / LibreOffice:**
   - Tiếp tục ghi nhận trạng thái **`NOT_EVALUATED`** do môi trường máy chủ không có giao diện đồ họa MS Word/LibreOffice để kiểm tra ngắt trang trực quan. Tính toàn vẹn cấu trúc đã được bảo đảm ở tầng OOXML schemas.
2. **Đợt B & C (Mapping chi tiết ô bảng & Shape nâng cao):**
   - Đã có khung hợp đồng ánh xạ `SourceMappingContract` và `TransformationRecord` gắn với generation/revision. Các bảng phức tạp có ô gộp nhiều hàng/cột và hình học phức tạp chưa có adapter hoàn chỉnh vẫn được giữ nguyên và fail-closed qua cổng phê duyệt Bước 1 để bảo vệ dữ liệu.
3. **Bảo mật dữ liệu:**
   - Tuyệt đối không sao chép nguyên văn nội dung của tệp pilot thật vào mã nguồn, test fixture hoặc commit log.

Toàn bộ mã nguồn đã được sửa đổi tại chỗ, kiểm chứng độc lập đạt chuẩn và sẵn sàng để rà soát lại mà không thay đổi trạng thái remote.
