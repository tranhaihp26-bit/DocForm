# Báo cáo hoàn tất kiểm chứng UX 3 bước desktop, tính nhất quán đầu ra và phân tích tệp Pilot thực

**Ngày thực hiện:** `2026-11-04`\
**Phạm vi:** Tiếp nối trạng thái làm việc của Codex trên `D:\DocForm`, bảo toàn toàn bộ thay đổi hiện có, truy nguyên trạng thái `review-only` của tệp DOCX pilot thực, rà soát trực quan 8 trạng thái giao diện desktop tại `1366×768` và `1920×1080`, kiểm chứng tính nhất quán đầu ra, đối chiếu qua LibreOffice và chạy lại các bộ kiểm thử liên quan.

---

## 1. Phân tích nguyên nhân trạng thái “Chỉ đối chiếu” (`review-only`) của tệp DOCX Pilot thực

Tệp kiểm thử cục bộ (`PILOT_FILE_PATH`, 12 khối nguồn: `block-0` bảng phần đầu 2×2, `block-1` tên loại, `block-2` trích yếu, `block-3..block-10` các đoạn thân bài, `block-11` bảng cuối 1×2 nơi nhận + chữ ký) đã được truy vết qua toàn bộ chuỗi `extractLocalFile` → `segmentLocalExtraction` → `approveWorkspacePartition` → `prepareExportCandidate`.

### 1.1. Kết quả các cổng bảo toàn trên tệp Pilot
- **`tableFidelity` (`verifyCandidateExportFidelity`):** `safe: true`, `diffs: []` (`PASS` — bảng phần đầu `block-0` và bảng chữ ký cuối `block-11` được đối chiếu hợp lệ).
- **`contentFidelity` (`verifyCandidateContentFidelity`):** `safe: true`, `violations: []` (`PASS` — 100% văn bản thuộc các khối được chấp nhận đều hiện diện đúng thứ tự trong `word/document.xml`).
- **`canRenderDiagnostic` (`isPackageSafeForDiagnosticRender`):** `true` (`PASS` — gói DOCX ứng viên hợp lệ về cấu trúc OOXML, không có liên kết ngoài hay thành phần thực thi không an toàn).

### 1.2. Phân biệt lỗi thực sự trong nhập/xuất với giới hạn chưa thể chứng minh

1. **Lỗi thực sự đã sửa an toàn ở lớp nhỏ nhất (`src/utils/exportCandidate.ts`):**
   - **Hiện tượng:** Khi tài liệu thuộc mẫu cơ quan Hoa Tiêu (`headerProfile === COMPANY_HEADER_PROFILE_ID` hoặc `COMPANY_HEADER_HD05_PROFILE_ID`) có bảng phần đầu (`block-0`) chứa các đường kẻ trang trí Word Shape Line (`hasReplaceableHeaderShapeLines(block) === true`), hàm `prepareExportCandidate` đã kiểm chứng số lượng khối phần đầu được thay thế (`replacedHeaderShapeBlocks.length === 1`) và xác nhận gói DOCX xuất ra đã đóng dấu đủ đường kẻ chuẩn của profile (`profileShapesPresent === true`), từ đó không đưa `unsupported_source_ooxml:block-0` vào `blockers`. Tuy nhiên, `prepareExportCandidate` lại truyền nguyên `manifest` gốc (vốn vẫn giữ mục `unsupportedFeatures` có `code: "drawing_or_image"` cho `block-0` do `blockExtractor.ts` ghi nhận lúc đọc XML thô) vào `assessExportSafety(manifest, ...)`, khiến `exportSafety.decision` luôn trả về `"reject"` ngay cả khi Shape phần đầu đã được thay thế và chứng minh hợp lệ.
   - **Cách sửa:** Trong [`src/utils/exportCandidate.ts`](../src/utils/exportCandidate.ts), chỉ khi `replacedHeaderShapeBlocks.length === 1 && profileShapesPresent` đúng, tạo bản sao `safetyManifest` lọc riêng mục `drawing_or_image` của đúng `replacedHeaderBlockId` trước khi gọi `assessExportSafety`. Mọi khối khác và mọi mã `UnsupportedFeatureCode` khác giữ nguyên tuyệt đối.
   - **Kiểm thử bắt lỗi:** Đã thêm ca kiểm thử đơn vị trong [`test/data-pipeline-improvement.test.ts`](../test/data-pipeline-improvement.test.ts) xác minh: (a) Hoa Tiêu thay thế hợp lệ Shape ở `block-0` đạt `safe: true, downloadable: true`; (b) profile `generic` có Shape ở `block-0` bị giữ ở `safe: false, downloadable: false, reviewDownloadable: true`; (c) tài liệu có Shape ở khối trích yếu `block-2` bị giữ ở `safe: false, downloadable: false, reviewDownloadable: true`.

2. **Giới hạn chưa thể chứng minh trên tệp Pilot thực (giữ nguyên cổng nghiêm ngặt `review-only`):**
   - **Blocker cụ thể:** `unsupported_source_ooxml:block-2` (và khi dùng profile `generic`: thêm `unsupported_source_ooxml:block-0` + `exportSafety.decision = "reject"`).
   - **Nguyên nhân kỹ thuật:** Trong tệp DOCX pilot thực, khối `block-2` (đoạn trích yếu ngay dưới tên loại văn bản, `role: "metadata"`) chứa một đối tượng `<mc:AlternateContent>` (Word Shape Line neo tọa độ `wp:anchor` / `v:line`, `name="ND30 - Duong ke duoi Tieu ngu"`, dài `1667241 EMU` ≈ `131.3pt`) dùng làm đường kẻ ngang dưới trích yếu. Khi xuất DOCX ứng viên qua `docxExport.ts`, trường `data.subject` được kết xuất thành đoạn văn bản chuẩn mà chưa tái tạo đối tượng `<w:drawing>/<w:pict>` neo dưới đoạn trích yếu đó.
   - **Quyết định theo bất biến sản phẩm:** Không nới cổng `sourceBlockHasUnsupportedOoxml`, không biến `safe: false` thành `downloadable: true`, không xóa khối nguồn. Tệp pilot thực giữ đúng trạng thái **`review-only`** (`Chỉ tải bản đối chiếu`, `safe: false`, `downloadable: false`, `reviewDownloadable: true`).
   - **Hiển thị rõ lý do, vị trí và đường xử lý cho người dùng:**
     - Cập nhật [`src/utils/workspaceExportMessages.ts`](../src/utils/workspaceExportMessages.ts) (`describeExportBlocker`) để dịch mã `block-N` thành số thứ tự khối dễ hiểu với người dùng văn phòng: `Khối nguồn #1 (block-0)`, `Khối nguồn #3 (block-2)`.
     - Cập nhật [`src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx) để đặt khung cảnh báo **“Nội dung cần xử lý”** ngay đầu thẻ trạng thái bên phải (trên cả phần rà soát thể thức), hiển thị trực tiếp dòng **“Vị trí cần đối chiếu: Khối nguồn #1 (block-0)... Khối nguồn #3 (block-2)...”**, khử trùng lặp nút hành động và cung cấp nút **“Đối chiếu nguồn”** (mở hộp thoại đối chiếu nguồn ở Bước 1) cùng **“Tải bản đối chiếu DOCX”** (`-DOI_CHIEU_CHUA_XAC_NHAN-`) và **“Tải tệp gốc nguyên vẹn”**.

---

## 2. Rà soát trực quan giao diện Desktop (`1366×768` và `1920×1080`)

Đã kiểm tra trực quan và đo đạc tự động qua CDP trên cả hai độ phân giải desktop chuẩn `1366×768` và `1920×1080` cho toàn bộ 8 trạng thái bắt buộc (sử dụng dữ liệu tổng hợp để không lộ nội dung tài liệu nội bộ):

| Mã trạng thái | Mô tả trạng thái | Ảnh chụp `1366×768` | Ảnh chụp `1920×1080` | Tràn ngang (`horizontalOverflow`) | Kết quả |
|---|---|---|---|---|---|
| `01-no-source` | Bước 1: Chưa có nguồn | [`01-no-source-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/01-no-source-1366x768.png) | [`01-no-source-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/01-no-source-1920x1080.png) | `false` | `PASS` |
| `02-recognizing` | Bước 1: Đang nhận diện / Xác nhận thể thức | [`02-recognizing-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/02-recognizing-1366x768.png) | [`02-recognizing-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/02-recognizing-1920x1080.png) | `false` | `PASS` |
| `03a-source-needs-review-modal` | Bước 1: Hộp thoại đối chiếu nguồn cần duyệt | [`03a-source-needs-review-modal-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/03a-source-needs-review-modal-1366x768.png) | [`03a-source-needs-review-modal-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/03a-source-needs-review-modal-1920x1080.png) | `false` | `PASS` |
| `03b-source-needs-review-step1` | Bước 1: Nguồn đã tải nhưng chờ duyệt phân vùng | [`03b-source-needs-review-step1-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/03b-source-needs-review-step1-1366x768.png) | [`03b-source-needs-review-step1-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/03b-source-needs-review-step1-1920x1080.png) | `false` | `PASS` |
| `04-step2-editor-warnings` | Bước 2: Bản soạn có cảnh báo thể thức (`Cần xử lý (2)`) | [`04-step2-editor-warnings-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/04-step2-editor-warnings-1366x768.png) | [`04-step2-editor-warnings-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/04-step2-editor-warnings-1920x1080.png) | `false` | `PASS` |
| `05-step3-downloadable` | Bước 3: Bản Word đủ điều kiện tải (`downloadable`) | [`05-step3-downloadable-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/05-step3-downloadable-1366x768.png) | [`05-step3-downloadable-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/05-step3-downloadable-1920x1080.png) | `false` | `PASS` |
| `06-step3-review-only` | Bước 3: Chỉ có bản đối chiếu (`review-only`) | [`06-step3-review-only-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/06-step3-review-only-1366x768.png) | [`06-step3-review-only-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/06-step3-review-only-1920x1080.png) | `false` | `PASS` |
| `07-step3-word-error` | Bước 3: Lỗi tạo Word (`error`) | [`07-step3-word-error-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/07-step3-word-error-1366x768.png) | [`07-step3-word-error-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/07-step3-word-error-1920x1080.png) | `false` | `PASS` |
| `08-step3-stale-after-edit` | Bước 3: Bản soạn thay đổi sau khi tạo ứng viên (`isStale`) | [`08-step3-stale-after-edit-1366x768.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/08-step3-stale-after-edit-1366x768.png) | [`08-step3-stale-after-edit-1920x1080.png`](superpowers/audits/2026-11-04-desktop-ux-evidence/08-step3-stale-after-edit-1920x1080.png) | `false` | `PASS` |

### Các lỗi hiển thị phát hiện qua ảnh chụp `1366×768` và đã khắc phục
1. **Tràn chữ chỉ báo lưu trên thanh Header (`src/index.css`):** `.df-header-save-status` trước đó đặt cứng `width: 108px` với `white-space: nowrap`, khiến chuỗi `"Đã lưu trên trình duyệt này"` tràn ra ngoài khung tròn và đè lên nút `"Tiếp tục xem & xuất →"` cùng `"⚙ Cài đặt"`. Đã đổi sang `min-width: 108px; width: auto;` trong [`src/index.css`](../src/index.css).
2. **Che khuất khung cảnh báo `"Nội dung cần xử lý"` ở cột phải Bước 3 tại `1366×768` (`src/components/WorkspaceExport.tsx`, `src/components/WorkspaceExport.css`):** Trên màn hình cao `768px`, thẻ `.df-step3-candidate-status` đặt `overflow: hidden` và xếp phần `"Rà soát thể thức"` lên trước `"Nội dung cần xử lý"`, làm phần vị trí lỗi và nút `"Đối chiếu nguồn"` bị cắt khuất. Đã đưa `.df-step3-warning-panel` lên ngay dưới mô tả trạng thái và đổi `.df-step3-candidate-status` sang `overflow-y: auto`.
3. **Thông báo lỗi giao dịch kỹ thuật khi xóa trắng trường gắn khối nguồn (`src/App.tsx`):** Đã bổ sung diễn giải tiếng Việt rõ ràng trong `applyWorkspaceResult` khi gặp `unmapped_*` (`"Không thể xóa trống trường gắn với khối nguồn; hãy giữ nội dung hoặc sửa trực tiếp tại khối tương ứng (...)"`).

---

## 3. Kiểm chứng tính nhất quán của đầu ra (Bước 3)

- **Cùng byte / cùng revision giữa Preview, Tải DOCX và In:** Đã xác minh trong `test/candidate-preview-print-browser.test.ts` (`PASS`): SHA-256 của byte dựng `CandidateDocumentPreview` (`data-preview-bytes-sha`), SHA-256 của tệp tải xuống và SHA-256 của khung in độc lập (`data-candidate-print-frame`) trùng khớp 100% với `candidate.sha256` và `candidate.instanceId`.
- **Sửa bản soạn hoặc đổi nguồn vô hiệu ứng viên cũ ngay lập tức:**
  - Sửa lỗi trong [`src/App.tsx`](../src/App.tsx): Khi chỉnh sửa bản soạn ở Bước 2 (`installWorkspace`), `invalidateCandidate(true)` vô hiệu hóa ngay token trong `candidateManager` (làm `visibleCandidate = null`, khóa ngay tải/in/preview cũ) đồng thời giữ tham chiếu để Bước 3 hiển thị rõ trạng thái `isStale` (`"Bản soạn đã đổi — Bản Word cũ không còn khớp với bản soạn"`). Khi đổi nguồn hoặc chuyển hệ thể thức, `invalidateCandidate(false)` xóa hoàn toàn ứng viên cũ.
  - Sửa bản soạn trong lúc đang chờ font để in (`MUTATED_DURING_PRINT` trong `test/candidate-preview-print-browser.test.ts`) hủy ngay khung in cũ, không gọi `window.print()`.
- **Kết quả tạo ứng viên bất đồng bộ trả về sai thứ tự:** Đã bổ sung kiểm thử trong [`test/export-candidate-contract.test.ts`](../test/export-candidate-contract.test.ts) xác minh khi yêu cầu tạo ứng viên A (chậm) kết thúc sau yêu cầu B (nhanh, revision mới hơn), kết quả A trả về `null` và không bao giờ ghi đè ứng viên B (`manager.current()` giữ nguyên `instanceId` của B).
- **Nhãn và tên tệp bản đối chiếu:** Bản đối chiếu hiển thị rõ băng rôn `"Bản đối chiếu — chưa xác nhận"`, khóa nút `"In bản xem / Lưu PDF (Đang khóa)"`, và xuất tệp với hậu tố `-DOI_CHIEU_CHUA_XAC_NHAN-ND30.docx` / `-DOI_CHIEU_CHUA_XAC_NHAN-HD05.docx`.
- **Báo cáo rà soát thể thức:** Chỉ hiển thị khi `complianceRevision === candidate.revision` (`data-formalities-revision`), kèm ghi chú rõ ràng rằng đây là kiểm tra kỹ thuật độc lập, không phải xác nhận pháp lý hay sẵn sàng phát hành.

---

## 4. Kiểm tra bản Word thực tế qua LibreOffice và trạng thái Microsoft Word

Số liệu chi tiết lưu tại [`docs/superpowers/audits/2026-11-04-desktop-ux-evidence/desktop-ux-and-libreoffice-metrics.json`](superpowers/audits/2026-11-04-desktop-ux-evidence/desktop-ux-and-libreoffice-metrics.json) (đã loại bỏ hoàn toàn văn bản nội dung của tệp pilot):

1. **LibreOffice (`C:\Program Files\LibreOffice\program\soffice.exe --headless --convert-to pdf`) — `PASS (EVALUATED_LIBREOFFICE)`:**
   - **Ứng viên tổng hợp đủ điều kiện tải (`Synthetic_Desktop_Check.docx`):** Chuyển đổi PDF thành công (`exitCode: 0`, `135,145 bytes`, `1 trang A4`).
   - **Tệp Pilot nguồn so với Ứng viên đối chiếu Pilot:**
     - Cả tệp nguồn (`157,699 bytes` PDF) và ứng viên DOCX (`199,931 bytes` PDF) đều kết xuất thành công (`exitCode: 0`) trên đúng **1 trang A4 đứng** (`210mm × 297mm`, lề `trên 20mm / dưới 20mm / trái 30mm / phải 15mm`).
     - Bảng phần đầu (`10,432 twips`, cột trái `5,187 twips`, cột phải `5,245 twips`), 2 đường kẻ Shape phần đầu (`has_nd30_shape_lines: true`), 17 đoạn trong thân văn bản (cỡ chữ `14pt`, lề dòng đầu `720 dxa`) và bảng chữ ký cuối trang đều bảo toàn đầy đủ nội dung chữ.
     - Điểm khác biệt hình thức duy nhất giữa nguồn và ứng viên là đường kẻ ngang Word Shape Line neo dưới đoạn trích yếu (`block-2`) có trong tệp nguồn nhưng không được vẽ lại bằng đối tượng Shape trong ứng viên — khớp chính xác với blocker `unsupported_source_ooxml:block-2` mà cổng xuất đã bắt được.
2. **Microsoft Word (`WINWORD.EXE` / COM `Word.Application`) — `NOT_EVALUATED`:**
   - **Lý do & điều kiện còn thiếu:** Máy chạy kiểm thử hiện không cài đặt Microsoft Word (`WINWORD.EXE` không tồn tại, `New-Object -ComObject Word.Application` trả về `COM=False`). Để nghiệm thu hình thức cuối cùng trước khi phát hành, người dùng cần mở tệp đối chiếu trên máy có cài Microsoft Word Desktop.

---

## 5. Danh sách tệp đã sửa và kết quả chạy lệnh kiểm chứng

### 5.1. Các tệp đã sửa trong phiên này (bảo toàn mọi thay đổi trước đó của Codex)
- [`src/utils/exportCandidate.ts`](../src/utils/exportCandidate.ts): Lọc mục `drawing_or_image` của khối bảng phần đầu đã được thay thế hợp lệ bằng Shape chuẩn Hoa Tiêu khi đánh giá `assessExportSafety`, giữ nguyên cổng chặn cho mọi khối/trường hợp khác.
- [`src/utils/workspaceExportMessages.ts`](../src/utils/workspaceExportMessages.ts): Định dạng mã khối `block-N` thành `Khối nguồn #(N+1) (block-N)` rõ ràng cho người dùng.
- [`src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx): Đưa `.df-step3-warning-panel` (`Nội dung cần xử lý`) lên đầu thẻ trạng thái khi `!candidate.safe`, hiển thị vị trí khối cần đối chiếu, khử trùng lặp nút hành động, đồng bộ phụ đề phiên bản ứng viên và thông báo trạng thái `isStale`/`error`.
- [`src/components/WorkspaceExport.css`](../src/components/WorkspaceExport.css): Cho phép cuộn dọc (`overflow-y: auto`) trên `.df-step3-candidate-status` ở màn hình desktop để không cắt nội dung khi mở rộng chi tiết.
- [`src/index.css`](../src/index.css): Đổi `.df-header-save-status` từ `width: 108px` sang `min-width: 108px; width: auto` để không tràn chữ đè lên nút bên cạnh ở `1366×768`.
- [`src/App.tsx`](../src/App.tsx): Giữ trạng thái màn hình chọn có nút `"Tiếp tục tài liệu hiện tại"` khi khôi phục nháp ở Bước 1; hoàn thiện vòng đời `isStale` khi sửa bản soạn sau khi đã tạo ứng viên; xóa ứng viên cũ khi tạo lại bị lỗi; làm rõ thông báo khi không thể xóa trống trường gắn với khối nguồn.
- [`test/data-pipeline-improvement.test.ts`](../test/data-pipeline-improvement.test.ts): Thêm kiểm thử cổng ứng viên cho trường hợp Shape phần đầu Hoa Tiêu, profile `generic` và Shape tại khối trích yếu `block-2`.
- [`test/export-candidate-contract.test.ts`](../test/export-candidate-contract.test.ts): Thêm kiểm thử bất đồng bộ trả về sai thứ tự, vô hiệu hóa tức thì và quy ước tên tệp `-DOI_CHIEU_CHUA_XAC_NHAN-`.

### 5.2. Kết quả lệnh kiểm chứng thực tế trên bản mã cuối

| Lệnh thực thi | Exit code | Kết quả | Ghi chú phạm vi |
|---|---|---|---|
| `npm.cmd run lint` | `0` | `PASS` | `tsc --noEmit` không có lỗi kiểu trên toàn bộ mã nguồn và test. |
| `npm.cmd run build` | `0` | `PASS` | `vite build && tsc --noEmit` hoàn tất sạch (`dist/`). |
| `npx.cmd tsx test/data-pipeline-improvement.test.ts` | `0` | `PASS` | `24/24` ca đạt (gồm kiểm thử cổng Shape Hoa Tiêu & `block-2`). |
| `npx.cmd tsx test/export-candidate-contract.test.ts` | `0` | `PASS` | `6/6` ca đạt (gồm kiểm thử out-of-order async, invalidation và tên tệp đối chiếu). |
| `npx.cmd tsx test/stage3-f01-doctype-mismatch-gate.test.ts` | `0` | `PASS` | `1/1` ca đạt (chặn xuất khi mâu thuẫn loại văn bản chưa xác nhận). |
| `npx.cmd tsx test/stage3-three-step-wizard.test.ts` | `0` | `PASS` | `1/1` ca đạt (wizard 3 bước, lưu trữ IndexedDB, bàn phím). |
| `npx.cmd tsx test/candidate-preview-print-browser.test.ts` | `0` | `PASS` | `1/1` ca đạt (preview, tải DOCX, tải tệp gốc, in cô lập và chặn bản in cũ khi sửa nháp). |
| `npx.cmd tsx test/pilot-local-document-browser.test.ts` | `0` | `PASS` | `1/1` ca đạt trên tệp DOCX pilot thực (`1366×768`). |
| So sánh DOCX trên Microsoft Word Desktop | — | `NOT_EVALUATED` | Máy không cài đặt Microsoft Word (`WINWORD.EXE` / COM `Word.Application` vắng mặt); đã đánh giá kỹ thuật và phân trang qua LibreOffice (`PASS`). |
