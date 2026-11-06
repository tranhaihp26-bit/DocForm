# Báo cáo Nghiệm thu Hoàn thiện Bước 1 (Nhập và Duyệt Nguồn) — DocForm

**Ngày lập:** 04/11/2026\
**Môi trường thực hiện:** `D:\DocForm`, nhánh `main` (commit `4c3751f` + các thay đổi local được bảo toàn nguyên vẹn).\
**Mục tiêu:** Báo cáo kết quả triển khai và nghiệm thu Bước 1 (B1 — Nhập và duyệt nguồn) trên Desktop/PC theo kế hoạch [2026-11-04-docform-step1-completion.md](superpowers/plans/2026-11-04-docform-step1-completion.md) và đối chiếu với [DOCFORM_STEP1_REMAINING_AUDIT_2026-11-04.md](DOCFORM_STEP1_REMAINING_AUDIT_2026-11-04.md).

---

## 1. Tóm tắt kết quả nghiệm thu

| Nhóm chức năng Bước 1 | Trạng thái | Bằng chứng thực tế |
|---|:---:|---|
| **Chặn mất chữ và paragraph bị cắt cụt (B1-01)** | `PASS` | Kiểm tra exact normalized match thay cho substring hai chiều. Bị cắt chữ bị phát hiện ngay và từ chối duyệt (`step1_rejects_truncated_body_before_approval`). |
| **Chặn đảo thứ tự paragraph trái phép (B1-02)** | `PASS` | Kiểm tra trình tự tuyến tính theo vùng nguồn. Đảo thứ tự không có giao dịch di chuyển bị chặn ngay với mã `unapproved_body_reorder` (`step1_rejects_unapproved_paragraph_reorder`). |
| **Ánh xạ chi tiết Đầu - Cuối - Separator (B1-03, B1-04)** | `PASS` | Header table kiểm tra từng ô/cột (quốc hiệu, cơ quan, số, ngày); Footer table kiểm tra ô chữ ký và ô nơi nhận độc lập; Separator thân bài thứ hai bắt buộc có trong `bodyHtml`; TransformationRecord có đầy đủ `targetId` và `subTarget`. |
| **Bảo vệ dữ liệu nguồn thiếu (B1-05)** | `PASS` | Nguồn nhập thiếu Quốc hiệu / Tiêu ngữ giữ nguyên giá trị rỗng `""` để Rule Engine đề xuất minh bạch; nhánh Tạo mới giữ nguyên template hợp lệ; không áp chéo NĐ30 và HĐ05. |
| **Vòng đời tệp và Duyệt phân vùng (B1-06)** | `PASS` | Tải tệp DOCX/TXT cục bộ giới hạn 25 MiB không qua API; xử lý thay tệp, hủy tệp; approval gắn chặt theo snapshot và hash; không cho duyệt khi có lỗi phân vùng hoặc thiếu ánh xạ. |
| **Sidebar điều hướng 4 bước con Desktop** | `PASS` | Đặt 4 bước nhỏ trong sidebar dưới Bước 1; hỗ trợ quay lại các bước trước; khóa các bước chưa đủ điều kiện; hoạt động hoàn hảo trên 1366×768 và 1920×1080 (`test/step1-sidebar-navigation-browser.test.ts`). |
| **Kiểm thử tệp Pilot thật trên Desktop** | `PASS` | CDP 1366×768 trên tệp DOCX thật: 12 khối (8 Body, 1 Chữ ký, 3 Đầu trang/thể thức, 0 Chưa rõ). Dữ liệu được bảo toàn đầy đủ sang Bước 2. |
| **Các hạng mục B2/B3 & Exporter (AFTER-01 → AFTER-05)** | `BACKLOG` | Giữ nguyên các gate kiểm soát an toàn hiện hành; không nới lỏng gate tải/in để làm B1 xanh; ghi nhận đầy đủ trong backlog kỹ thuật. |

---

## 2. Chi tiết kết quả thực hiện theo từng Task

### Task 1: Chặn mất chữ, thiếu đoạn, nhân đôi và đảo thứ tự trước duyệt nguồn
- **Mã lỗi xử lý:** `B1-01`, `B1-02`.
- **Thay đổi mã nguồn:** [`src/shared/sourceMapping.ts`](file:///d:/DocForm/src/shared/sourceMapping.ts).
  - Loại bỏ hoàn toàn thuật toán substring hai chiều `p.includes(norm) || norm.includes(p)`. Bắt buộc so khớp chuỗi chuẩn hóa chính xác `entry.text === norm` hoặc theo khối dòng liên tiếp `blockLines`.
  - Thêm cơ chế theo dõi chỉ số thứ tự tuyến tính `lastBodyOrderIndex`. Khi phát hiện paragraph xuất hiện lùi thứ tự (`entry.originalIndex < lastBodyOrderIndex`) mà không có giao dịch di chuyển (`move`, `split`, `edit`) trong ledger, hệ thống ghi nhận `unapproved_body_reorder:${block.id}` và đánh dấu trạng thái khối là `unresolved`.
- **Kiểm chứng:**
  - `npx.cmd tsx test/data-pipeline-improvement.test.ts`:
    - `Task 1: step1_rejects_truncated_body_before_approval: nguồn bị cắt một phần chữ không được duyệt`: **PASS** (3.88ms).
    - `Task 1: step1_rejects_unapproved_paragraph_reorder: đảo thứ tự paragraph nguồn trong Body mà không có giao dịch di chuyển phải bị từ chối duyệt`: **PASS** (4.72ms).
    - `Task 1: Đoạn trùng chữ, linebreak, multiple runs và bảng xen kẽ paragraph`: **PASS** (4.36ms).

---

### Task 2: Ánh xạ phần đầu, Body, phần cuối, separator và locator chi tiết
- **Mã lỗi xử lý:** `B1-03`, `B1-04`.
- **Thay đổi mã nguồn:** [`src/shared/sourceMapping.ts`](file:///d:/DocForm/src/shared/sourceMapping.ts).
  - **Bảng đầu trang (Header table):** Loại bỏ việc dùng trích yếu (`subject`) để thay thế cho ô quốc hiệu/cơ quan. Kiểm tra phân rã từng ô/cột: nếu nguồn có thông tin cơ quan hoặc quốc hiệu thì working doc hoặc cell mapping bắt buộc phải có nội dung tương ứng.
  - **Bảng cuối trang (Footer table):** Phân tích độc lập ô Nơi nhận và ô Chữ ký. Trường hợp bảng cuối có ô nơi nhận nhưng `doc.recipients` rỗng, hệ thống trả về lỗi `missing_recipients_destination` và chặn cấp quyền duyệt.
  - **Đoạn siêu dữ liệu (Metadata paragraphs):** Không dùng dữ liệu từ `structuredImport.fields` cũ để công nhận nếu trường dữ liệu làm việc hiện hành trong snapshot đang rỗng.
  - **Dấu phân cách (Separators):** Phân biệt separator đầu tiên dưới trích yếu (`replace_by_profile`) với separator thứ hai trở đi trong thân bài. Separator trong thân bài bắt buộc phải có mặt trong `bodyHtml`.
  - **TransformationRecord:** Bổ sung `targetId` và `subTarget` (node ID, field name, cell coordinate) thay vì chỉ gán `zone` chung chung.
- **Kiểm chứng:**
  - `npx.cmd tsx test/data-pipeline-improvement.test.ts`:
    - `Task 2: Header table mất field dù còn subject không được công nhận`: **PASS** (5.51ms).
    - `Task 2: Footer 1x2 table có chữ ký nhưng mất nơi nhận phải bị từ chối duyệt`: **PASS** (4.16ms).
    - `Task 2: StructuredImport cũ còn nhưng working field rỗng không được công nhận`: **PASS** (3.13ms).
    - `Task 2: Separator thứ hai trong Body vắng mặt không được tự công nhận vì có subject`: **PASS** (3.38ms).
  - `npx.cmd tsx test/workspace-candidate.test.ts`: **PASS 14/14** (1310ms).
  - `npx.cmd tsx test/final-section-roundtrip.test.ts`: **PASS 18/18** (333ms).

---

### Task 3: Bảo đảm vòng đời upload, thay tệp, hủy, lưu nguồn và approval
- **Mã lỗi xử lý:** `B1-06`.
- **Thay đổi mã nguồn:** [`src/utils/importSessionLifecycle.ts`](file:///d:/DocForm/src/utils/importSessionLifecycle.ts), [`src/components/ImportStepView.tsx`](file:///d:/DocForm/src/components/ImportStepView.tsx).
  - Duy trì parser cục bộ không qua mạng, giới hạn kích thước tệp 25 MiB.
  - Tách bạch trạng thái phiên `ImportSession`: lưu trữ `rawFileContent`, `originalBlocks`, `reviewedBlocks`, `activeProfile`, `reviewDecisions`.
  - Hỗ trợ đổi tệp và hủy phân vùng an toàn, dọn dẹp các artifact trung gian và đưa giao diện về trạng thái sẵn sàng tiếp nhận.
  - Hàm `approveWorkspacePartition` yêu cầu `isFullyCovered === true` và `unresolvedBlocks.length === 0`; không cho phép duyệt mù khi có bất kỳ khối nguồn nào chưa được tiếp nhận.
- **Kiểm chứng:**
  - `npx.cmd tsx test/local-file-import.test.ts`: **PASS**.
  - `npx.cmd tsx test/import-review.test.ts`: **PASS**.

---

### Task 4: Chọn hệ/loại/profile và nhánh tạo mới
- **Mã lỗi xử lý:** `B1-05`.
- **Thay đổi mã nguồn:** [`src/utils/importReview.ts`](file:///d:/DocForm/src/utils/importReview.ts), [`src/App.tsx`](file:///d:/DocForm/src/App.tsx).
  - Đã loại bỏ việc tự động điền `"CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"` khi nguồn nhập bị thiếu. `reconstructFromReviewedBlocks` và `handleConfirmSideBySideImport` giữ nguyên giá trị rỗng `""` để Rule Engine hiển thị cảnh báo pháp lý trực quan cho người dùng quyết định áp dụng hoặc bỏ qua.
  - Bảo toàn giá trị mặc định chuẩn mực của mẫu cho nhánh "Tạo mới" (`createNewDocument` qua `template.defaultData`).
  - Đảm bảo độc lập tuyệt đối giữa hai hệ thể thức: Hành chính (Nghị định 30) và Đảng (Hướng dẫn 05), không áp chéo quy tắc và ký hiệu số hiệu.
- **Kiểm chứng:**
  - `npx.cmd tsx test/stage2-regime-detection.test.ts`: **PASS 25/25** (103ms).
  - `npx.cmd tsx test/local-file-import.test.ts`: **PASS** (xác minh quốc hiệu rỗng khi thiếu).

---

### Task 5: Hoàn thiện 4 bước con, điều hướng và giao diện B1 Desktop
- **Mã lỗi xử lý:** Cải thiện UI/UX B1 desktop.
- **Thay đổi mã nguồn:** [`src/App.tsx`](file:///d:/DocForm/src/App.tsx), [`src/components/ImportStepView.tsx`](file:///d:/DocForm/src/components/ImportStepView.tsx), [`src/components/ImportStepView.css`](file:///d:/DocForm/src/components/ImportStepView.css).
  - Bổ sung cấu trúc 4 bước nhỏ trong Sidebar dưới Bước 1:
    - **Nhánh Tải tệp:** 1. Tải tệp → 2. Xem nhận diện → 3. Xác nhận thông tin → 4. Sẵn sàng soạn.
    - **Nhánh Tạo mới:** 1. Hệ thể thức → 2. Loại văn bản → 3. Chọn mẫu → 4. Sẵn sàng soạn.
  - Các bước đã hoàn thành hỗ trợ click để quay lại; các bước chưa đủ điều kiện bị `disabled` và chặn kích hoạt.
  - Nút "Đổi cách bắt đầu" cho phép chuyển đổi linh hoạt giữa Tải tệp và Tạo mới.
  - Tối ưu giao diện cho Desktop/PC trên cả hai độ phân giải tiêu chuẩn: 1366×768 và 1920×1080.
- **Kiểm chứng:**
  - `npx.cmd tsx test/step1-sidebar-navigation-browser.test.ts`: **PASS 1/1** (Exit code 0, thời gian chạy 52s qua CDP Chrome).

---

### Task 6: Kiểm thử toàn diện và Pilot tệp thật
- **Kiểm thử tệp Pilot thật:**
  - Tệp: `01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx` (được đọc trực tiếp từ máy cục bộ, không ghi nội dung văn bản vào repo/log/test).
  - Chạy qua harness CDP trên độ phân giải Desktop 1366×768: `npx.cmd tsx test/pilot-local-document-browser.test.ts`.
  - Kết quả phân vùng Bước 1:
    - Tổng số khối vật lý: **12 khối**.
    - Body: **8 khối**.
    - Chữ ký: **1 khối**.
    - Đầu trang/thể thức: **3 khối**.
    - Chưa rõ / Chưa giải quyết: **0 khối**.
  - Dữ liệu được chuyển sang Bước 2 nguyên vẹn, đảm bảo không thất thoát khối nguồn và không đưa phần nơi nhận/chữ ký vào canvas Body.
  - Khi sang Bước 3, candidate bị chặn bởi gate an toàn hiện hành (`isSafe: false`, `downloadDisabled: true`, `printDisabled: true`) do các hạn chế về hình học Shape và gói tài liệu (thuộc phạm vi AFTER).

---

## 3. Tổng hợp kết quả các lệnh kiểm thử

Tất cả các lệnh kiểm thử đều đã được thực thi độc lập và trả về exit code 0:

| Lệnh kiểm thử | Exit Code | Thời gian | Kết quả kiểm tra |
|---|:---:|:---:|---|
| `npm.cmd run lint` | `0` | ~25s | **PASS**: 0 lỗi TypeScript, tuân thủ nghiêm ngặt schema và types. |
| `npx.cmd tsx test/data-pipeline-improvement.test.ts` | `0` | ~1.2s | **PASS 15/15**: Kiểm soát mất chữ, đảo thứ tự, trùng lặp, ô bảng đầu-cuối. |
| `npx.cmd tsx test/workspace-candidate.test.ts` | `0` | ~1.3s | **PASS 14/14**: Toàn vẹn candidate, snapshot cache, table/appendix gate. |
| `npx.cmd tsx test/final-section-roundtrip.test.ts` | `0` | ~0.3s | **PASS 18/18**: Roundtrip phần cuối, nơi nhận, chữ ký, phụ lục. |
| `npx.cmd tsx test/stage2-regime-detection.test.ts` | `0` | ~0.1s | **PASS 25/25**: Nhận diện hệ NĐ30/HD05, giải quyết xung đột header. |
| `npx.cmd tsx test/local-file-import.test.ts` | `0` | ~3s | **PASS**: Import tệp cục bộ và bảo toàn quốc hiệu rỗng khi thiếu. |
| `npx.cmd tsx test/import-review.test.ts` | `0` | ~3s | **PASS**: Luồng duyệt phân vùng với các khối nguồn thiếu/chưa phân loại. |
| `npx.cmd tsx test/step1-sidebar-navigation-browser.test.ts` | `0` | ~52s | **PASS 1/1**: Điều hướng 4 bước sidebar desktop 1366×768 & 1920×1080. |
| `npx.cmd tsx test/pilot-local-document-browser.test.ts` | `0` | ~21s | **PASS 1/1**: Pilot tệp thật từ B1 đến B3 qua CDP Chrome headless. |

---

## 4. Quản lý trạng thái hệ thống và dọn dẹp

1. **Tiến trình vận hành cổng 5050:** Không bị can thiệp hay gián đoạn.
2. **Cổng kiểm thử (5078, 5094, 9578, 9594):** Đã được đóng hoàn toàn sau mỗi test thông qua khối `finally { browser.close(); server.kill(); }`.
3. **Task background:** Kiểm tra `manage_task` xác nhận không còn tiến trình ngầm nào chạy dở.
4. **Git Tree:** Tất cả thay đổi có sẵn của người dùng được bảo toàn nguyên vẹn; không commit, không push, không stash.

---

## 5. Kế hoạch tiếp theo (Backlog kỹ thuật sau Bước 1)

Các vấn đề đã được kiểm chứng độc lập thuộc giai đoạn Bước 2 và Bước 3 (AFTER) được giữ nguyên trong backlog để triển khai ở các đợt tiếp theo:

1. **AFTER-01 & AFTER-02 (Package Safety Gate & XML Validator):** Nối hàm `isPackageSafeForDiagnosticRender` trực tiếp vào `prepareExportCandidate` để chặn các thành phần nhị phân lạ (ví dụ `word/vbaProject.bin`) và hoàn thiện validator quan hệ XML.
2. **AFTER-03 (Shape Geometry & Header Line Roundtrip):** Bổ sung bộ chuyển đổi hình học (geometry adapter) chuẩn hóa tọa độ pt/mm/in cho các đường kẻ trang trí DrawingML/VML, tránh phụ thuộc vào thứ tự thuộc tính XML.
3. **AFTER-04 (Editor Node Transactions & Coverage Sync):** Hoàn thiện đồng bộ giữa giao dịch soạn thảo Bước 2 (`editNode`, `mergeNodes`, `splitNode`) và coverage mapper để phân biệt rõ thao tác chỉnh sửa chủ động với mất nội dung ngoài ý muốn.
4. **AFTER-05 (B3 Preview & Word Print Fidelity):** Tăng cường assertion trong các browser test của Bước 3 để đảm bảo bản in và preview đối chiếu khớp 100% byte ứng viên đã tạo.
