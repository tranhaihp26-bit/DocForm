# BIÊN BẢN HOÀN THIỆN VÀ KIỂM CHỨNG DỰ ÁN DOCFORM (03/11/2026)

- **Thời điểm thực hiện:** 03/11/2026
- **Repository:** `D:\DocForm`
- **Nhánh Git & HEAD:** `main` @ `fe854c66f044195f473cc980a71ee3dd8dff777e`
- **Nguyên tắc bảo vệ checkout:** Toàn bộ thay đổi local hiện có trên checkout được bảo toàn nguyên vẹn; không thực hiện `git reset`, `stash`, `clean`, `commit`, `push`, `merge`, hoặc `deploy`. Không đưa dữ liệu nhạy cảm, trích đoạn văn bản nội bộ hoặc API key thật vào mã nguồn, log và báo cáo.

---

## 1. Tóm Tắt Các Lỗi Đã Tái Hiện & Phương Án Giải Quyết

### A. Cảnh báo đối tượng đồ họa (drawing/image) bị lọc khỏi Import Fidelity Manifest
- **Hiện tượng đã tái hiện:** Trên tệp DOCX thực tế chứa 2 vị trí drawing/image (1 đối tượng trong bảng đầu trang tại block 0, 1 đối tượng trong đoạn văn tại block 2), cơ chế trích xuất trước đây chỉ thu thập cảnh báo từ các khối đoạn văn độc lập; cảnh báo từ khối bảng (header table) bị rơi khỏi manifest dẫn đến đếm thiếu và rủi ro bỏ lọt vi phạm toàn vẹn khi xuất.
- **Giải quyết:** Tại `src/utils/localFileImport.ts`, duyệt qua toàn bộ các khối (kể cả bảng header, signature và body), thu thập và khử trùng lặp cảnh báo unsupported theo `blockId` và `code`. Cả hai vị trí đều được phản ánh chính xác vào `importFidelityManifest.unsupportedFeatures`.
- **Kiểm chứng:** Đã audit cục bộ trên tệp kiểm thử `01_Thong_bao_Ngay_Van_hoa_Viet_Nam_2026_DOI_CHIEU_BOI_MAU.docx`: Manifest ghi nhận đủ 2 mục `[{"blockId":"block-0","code":"drawing_or_image"},{"blockId":"block-2","code":"drawing_or_image"}]` với 0 trùng lặp. Cổng xuất candidate trả về quyết định `"reject"`, khóa tải và in DOCX ứng viên có giải thích rõ ràng, đồng thời giữ nguyên quyền tải tệp gốc (`canDownloadOriginal: true`). Bài kiểm thử `test/block-extractor.test.ts` đã được cập nhật kiểm tra kiểu chặt chẽ và đạt PASS.

### B. Mặc định mạng hở LAN, bảo vệ transport route AI và xử lý lỗi khởi động (F1 & F4)
- **Hiện tượng đã tái hiện:**
  1. `server.ts` trước đây chỉ ép bind `127.0.0.1` khi `localOnlyMode` (khi bật SIWC). Khi chạy bình thường không bật SIWC, server rơi về `0.0.0.0`, mở cổng ra toàn mạng LAN/Wi-Fi mà không có xác thực. Đồng thời, cấu hình CORS mặc định cho phép mọi Origin khi chưa đặt `ALLOWED_ORIGINS`, và các route AI (`/api/ai/review-document`, `/api/ai/check-partitions`, `/api/ai/format-document`, `/api/ai/refine-text`) không kiểm tra Origin/Host trước khi xử lý, có thể bị kích hoạt trái phép từ website độc hại trên trình duyệt người dùng.
  2. Khi cổng bị chiếm dụng (EADDRINUSE) hoặc xảy ra lỗi lắng nghe, server ném unhandled error khiến caller không bắt được Promise rejection và Vite dev server không được dọn dẹp sạch sẽ.
- **Giải quyết:**
  1. **Siết chặt ranh giới AI local-only (F1):** Triển khai cơ chế bảo vệ tầng transport `isTrustedLocalAiRequest` trong `server.ts`: yêu cầu kết nối phải đi qua loopback (`127.0.0.1`, `::1`), Host header phải là local (`localhost`, `127.0.0.1`, `[::1]`), và Origin (nếu có) phải cùng nguồn với máy chủ. Mọi truy vấn từ Host lạ, Origin lạ hoặc địa chỉ IP ngoài loopback đều bị từ chối dứt khoát bằng HTTP 403 trước khi chạm tới API key hoặc gọi provider. Bind rộng hoặc CORS allowlist không tự cấp quyền gọi provider AI.
  2. **Bắt lỗi khởi động & dọn dẹp Vite (F4):** Gắn listener lỗi trước khi gọi `.listen()`; trả Promise rejection cho caller kèm mã lỗi (ví dụ `EADDRINUSE`); đồng thời dọn dẹp Vite qua `vite.close()` trước khi reject để giải phóng tiến trình con.
  3. **Đăng ký alias chuẩn hóa:** `/api/ai/review-proposals` (alias của `/api/ai/review-document`) và `/api/ai/full-text-review` (alias của `/api/ai/review-full-text`), giữ nguyên cổng kiểm tra consent.
  4. **Quản lý tiến trình server cổng 5050:** Phát hiện tiến trình máy chủ cũ (PID 15752) đang lắng nghe trên `0.0.0.0:5050` với mã chưa cập nhật; đã dùng script `scripts/stop-docform-server.ps1` để dừng sạch tiến trình này, sau đó khởi chạy máy chủ mới (PID 13984) bind độc quyền tại `127.0.0.1:5050` qua tiến trình daemon có kiểm soát. Đã kiểm tra qua `netstat` và `curl` phản hồi HTTP 200 OK.
- **Kiểm chứng:**
  - `test/server-startup-safety.test.ts`: **3/3 PASS** (exit 0) — kiểm tra Host ngoài local bị chặn 403, Cloud Run không tự cấp quyền AI, và lỗi chiếm cổng trả Promise rejection kèm dọn dẹp Vite trên cả production và development.
  - `test/server-network-security.test.ts`: **1/1 PASS** (exit 0) — xác nhận bind loopback và từ chối 403 với Origin/Host lạ trên các route AI.

### C. Hoàn thiện hợp đồng F2: `safe` vs `downloadable` và trạng thái Bước 3
- **Hiện tượng đã tái hiện:** `safe` và `downloadable` từng bị dùng lẫn lộn hoặc có JSDoc/nhãn UI không khớp với mã thực thi. Quy tắc sản phẩm cốt lõi trong `AGENTS.md` xác định:
  > *"Bước 3 phải dùng cùng byte ứng viên hiện hành cho preview, download và print. Tôn trọng revision và fidelity gate; `safe` không đồng nghĩa `downloadable`."*
- **Phân định ranh giới bản chất:**
  - `safe` là thuộc tính đo lường **tính toàn vẹn và trung thực với tài liệu nguồn** (`fidelity gate`):
    $$\text{safe} \iff \text{blockers.length} = 0 \land \text{tableFidelity.safe} \land \text{contentFidelity.safe} \land \text{exportSafety.decision} = \text{"allow"}$$
  - `downloadable` là thuộc tính đo lường **tính sẵn sàng xuất tệp hợp lệ** (`deliverability gate`):
    $$\text{downloadable} \iff \text{bytes.length} > 0 \land \text{hasValidXml} \land \text{safe} \land \text{isCurrent}$$
  - **Vì sao `safe` không đồng nghĩa `downloadable`?**
    1. Một candidate có thể có `safe: true` tại thời điểm tạo (ở revision cũ), nhưng khi người dùng quay lại Bước 2 sửa văn bản (`currentRevision` tăng lên), candidate đó trở thành **stale (cũ)**: nó vẫn an toàn với bản nháp cũ, nhưng **không được phép tải xuống (`downloadable = false`)** vì sẽ làm xuất sai dữ liệu hiện hành.
    2. Một candidate bị hỏng byte hoặc rỗng OOXML không thể tải được, dù kiểm tra nội dung chưa kịp phát hiện lỗi.
    3. Ngược lại, một candidate có `safe: false` (vi phạm toàn vẹn nguồn, thiếu bảng, mất nội dung) **TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP `downloadable: true`** nhằm bảo vệ nguyên tắc Zero Data Loss.
- **Bảng ma trận trạng thái ứng viên (Candidate State Matrix):**

| Trường hợp | Tình trạng Candidate | Byte OOXML & XML | `safe` (Fidelity Gate) | `isCurrent` (Đúng Revision) | `downloadable` | Xem trước (Preview) | Tải xuống (Download) | In bản xem (Print / PDF) | Tải tệp gốc (Original) | Ghi chú & Căn cứ kỹ thuật / pháp lý |
|---|---|---|---|---|---|---|---|---|---|---|
| **1. Chưa tạo (Missing / Idle)** | `null` | N/A | N/A | N/A | `false` | Khóa (Hiện empty state) | Khóa | Khóa | Cho phép (nếu có tệp nguồn) | Chưa có byte ứng viên; người dùng cần bấm "Tạo và kiểm DOCX ứng viên". |
| **2. Byte hỏng (Corrupted OOXML)** | Có instance | `false` (rỗng hoặc hỏng ZIP/XML) | `false` | Bất kỳ | `false` | Khóa (Hiện unavailable state) | Khóa | Khóa | Cho phép | Parser không đọc được cấu trúc; fail closed hoàn toàn để tránh crash trình duyệt và xuất tệp hỏng. |
| **3. Vi phạm toàn vẹn (Unsafe Candidate)** | Có instance | `true` | `false` (mất bảng, sai khác nội dung, lỗi drawing) | `true` | `false` | **Khóa** (Hiện unavailable + bảng lý do vi phạm) | **Khóa tuyệt đối** | **Khóa tuyệt đối** | Cho phép | **Zero Data Loss**: Tệp DOCX làm mất bảng hoặc biến đổi dữ liệu nguồn vi phạm nguyên tắc bảo toàn; khóa tải/in. |
| **4. Bản ứng viên cũ (Stale Revision)** | Có instance | `true` | `true` (từng đạt ở revision trước) | `false` (đã bị sửa ở Bước 2) | `false` (tại runtime) | Khóa / Cảnh báo cần tạo lại | Khóa | Khóa (Frame in bị hủy bỏ) | Cho phép | **Quy tắc đồng bộ byte**: Tải và in phải phản ánh đúng revision mới nhất; candidate cũ bị vô hiệu hóa khi tài liệu bị sửa. |
| **5. Hợp lệ hoàn toàn (Safe & Fresh)** | Có instance | `true` | `true` | `true` | `true` | **Cho phép** (`CandidateDocumentPreview`) | **Cho phép** (Nút Tải DOCX) | **Cho phép** (In qua iframe cô lập) | Cho phép | Đạt chuẩn toàn vẹn: Byte hợp lệ, không mất dữ liệu, khớp phiên bản hiện hành. |

- **Phân tích Phương án & Câu hỏi chặn sản phẩm về Preview khi `safe: false`:**
  - **Phương án A (Hiện hành — Fail Closed):** Khi `safe === false`, khóa hoàn toàn Xem trước, Tải xuống và In ấn. Giao diện hiển thị trạng thái `Ứng viên chưa sẵn sàng để xem`, liệt kê chi tiết các vi phạm trong panel bên phải, cung cấp nút "Đối chiếu nguồn", "Mở vị trí cần sửa" và "Tải tệp gốc".
    - *Ưu điểm:* Tuyệt đối an toàn. Ngăn chặn triệt để nguy cơ người dùng văn phòng nhìn thấy bản xem (dù thiếu dữ liệu) rồi chụp ảnh màn hình, in qua phím tắt trình duyệt (`Ctrl+P`) hoặc hiểu nhầm tài liệu đã sẵn sàng để phát hành.
    - *Nhược điểm:* Người dùng không nhìn thấy trực quan lỗi hiển thị trên trang A4.
  - **Phương án B (Diagnostic Preview with Watermark):** Vẫn cho dựng hình bản xem A4 nhưng phủ một lớp Watermark/Banner đỏ `CẢNH BÁO: TỆP VI PHẠM TÍNH TOÀN VẸN NGUỒN`, đồng thời duy trì khóa tuyệt đối nút Tải DOCX và nút In.
    - *Ưu điểm:* Giúp người dùng quan sát trực quan vị trí bị thiếu/lỗi trên trang.
    - *Nhược điểm:* Tăng nguy cơ rò rỉ bản in không chuẩn qua phím tắt trình duyệt `Ctrl+P`; phức tạp hóa DOM preview.
  - **Câu hỏi chặn cho Product Owner:**
    > *Dự án nên duy trì Phương án A (fail closed: khóa cả bản xem khi vi phạm toàn vẹn nguồn để bảo đảm an toàn tuyệt đối) hay chuyển sang Phương án B (cho phép xem trước kèm cảnh báo/watermark vi phạm để hỗ trợ chẩn đoán lỗi trực quan)?*
    > *(Khuyến nghị: Duy trì Phương án A theo đúng triết lý bảo toàn nguồn của DocForm).*

### D. Ràng buộc ngữ cảnh dấu sao trong đầu trang Hướng dẫn 05 (Đảng)
- **Hiện tượng đã tái hiện:** Trong `src/server/structuralSegmenter.ts`, nhánh xử lý `text === "*"` trong 8 đoạn đầu của chế độ `party` tự động gán `role = "header"` ngay cả khi dấu sao nằm cô lập ở đầu văn bản (không có cơ quan ban hành phía trước) hoặc xuất hiện như ký hiệu phân cách/chú thích trước phần thân.
- **Giải quyết:** Bổ sung ràng buộc ngữ cảnh: dấu sao `*` hoặc `***` chỉ được nhận diện là thành phần đầu trang Đảng khi thỏa mãn đồng thời:
  1. Đứng sau ít nhất một khối cơ quan ban hành (`pIdx > 0` và `headerBlockIds.length > 0`).
  2. Có ngữ cảnh đầu trang Đảng tiếp nối (số hiệu văn bản, tiêu ngữ Đảng, ngày tháng hoặc từ khóa tên loại văn bản).
  Nếu thiếu các chứng cứ này, dấu sao không bị ép vào header mà giữ nguyên trạng thái chưa phân loại để người dùng rà soát.
- **Kiểm chứng:** Bổ sung bài test `SEP-23` trong `test/import-segments.test.ts` kiểm tra 3 ca âm (dấu sao ở đầu, dấu sao trong chế độ hành chính, dấu sao trong phần thân). Toàn bộ 18 bài test phân đoạn `test:import:segments` đều PASS.

---

## 2. Bảng Phân Loại Hạng Mục & Bằng Chứng Nghiệm Thu (F3)

| Hạng mục | Trạng thái | Bằng chứng kiểm chứng cụ thể | Giới hạn & Phạm vi áp dụng |
|---|---|---|---|
| **A1. Cảnh báo đồ họa bảng header trong manifest** | `PASS` | `test/block-extractor.test.ts`, audit tệp `01_Thong_bao...`, manifest giữ cả 2 block không trùng lặp | Áp dụng cho cấu trúc bảng và đoạn văn; không tự sửa nội dung hình ảnh. |
| **A2. Bảo vệ checkout & không mất thay đổi local** | `PASS` | `git status --short --branch`, toàn bộ uncommitted changes được bảo toàn 100% | Giữ nguyên mọi diff local; không push/commit. |
| **B1. Bảo vệ transport route AI & listen error (F1 & F4)** | `PASS` | `test/server-startup-safety.test.ts` (3/3 PASS), `test/server-network-security.test.ts` (1/1 PASS) | AI route chỉ chấp nhận loopback; LAN/Cloud Run bị từ chối 403 khi chưa có auth riêng. |
| **B2. Quản lý tiến trình server cổng 5050** | `PASS` | Đã dừng PID 15752 (`0.0.0.0`), khởi chạy PID 13984 (`127.0.0.1:5050`), curl trả HTTP 200 | Lắng nghe cục bộ trên 127.0.0.1; đồng bộ tệp PID. |
| **B3. Hợp đồng safe/downloadable & chuẩn hóa Bước 3 (F2)** | `PASS` | `test/workspace-candidate.test.ts` (14/14 PASS), `test/export-candidate-contract.test.ts` (5/5 PASS) | Khóa tải/in khi unsafe hoặc stale; cung cấp tải tệp gốc nguyên vẹn. |
| **B4. Ràng buộc ngữ cảnh dấu sao đầu trang HD05** | `PASS` | `test/import-segments.test.ts` (`SEP-21` & `SEP-23` PASS) | Áp dụng cho 8 đoạn đầu văn bản Đảng; không áp chéo sang hành chính. |
| **C1. Bảo toàn cấu trúc DOCX & cổng kiểm tra an toàn** | `PASS` | `test:fidelity` (8 tasks / 30 tests PASS), `test:edgecases` (14 tests PASS) | Kiểm tra cấu trúc OOXML, lưới twip, w:vMerge; không mất bảng. |
| **C2. Trải nghiệm rà soát Bước 1 cho cán bộ văn phòng** | `NEEDS_REVIEW` | `test/import-source-warning-browser.test.ts` (1 PASS), `test/import-partition-abort-browser.test.ts` (1 PASS) | **Chỉ mới xác nhận 2 ca kỹ thuật bằng fixture tổng hợp** (hủy request khi sửa phân vùng, cảnh báo wrapper lạ và truy cập bàn phím). Chưa nghiệm thu toàn diện UX thực địa với cán bộ văn phòng, độ dễ hiểu của thuật ngữ, và hiển thị trên màn hình hẹp/zoom lớn. |
| **C3. Tổng hợp cổng kiểm thử & build** | `PASS` | `npm run lint` (exit 0), `npm run build` (exit 0), `npm run test:regression` (5 script / 73 tests PASS) | Xác nhận mã nguồn chuẩn kiểu TypeScript và build production sạch. |
| **C4. Đồng bộ in và tải bản ứng viên (Step 3 Browser)** | `PASS` | `test/candidate-preview-print-browser.test.ts` (1 test PASS, exit 0) | Đã chạy độc lập tuần tự đạt 100%. *(Ghi chú lịch sử: bài test này từng bị timeout khi chạy đồng thời với tiến trình khác gây tranh chấp cổng Vite; khi chạy tuần tự trên cổng riêng đã hoàn tất ổn định)*. |
| **C5. Nghiệm thu Microsoft Word & Gold Corpus thực tế** | `NEEDS_REVIEW` | Cần kiểm tra trực quan trên ứng dụng Microsoft Word để xác nhận ngắt trang vật lý, lề trang, hiển thị nét vẽ Shape | Kiểm thử tự động chỉ xác nhận tính hợp lệ của cấu trúc OOXML; không thay thế được việc hiển thị thực tế trên Word desktop. |
| **C6. Kết nối Provider AI thực tế (Gemini/ChatGPT)** | `NOT_APPLICABLE` | Toàn bộ kiểm thử tự động sử dụng synthetic mock provider | Không gọi API thật trong test; yêu cầu cấu hình `GEMINI_API_KEY` hoặc SIWC trên môi trường vận hành thực tế. |
| **D1. Tái cấu trúc phân tách App.tsx** | `NOT_EVALUATED` | Giữ nguyên cấu trúc hiện hành | Ưu tiên tính ổn định hành vi trước khi thực hiện tái cấu trúc lớn. |

---

## 3. Nhật Ký Lệnh & Kết Quả Runner Chi Tiết

| Lệnh thực thi | Mã thoát (Exit Code) | Số bộ (Suites) & Số ca (Tests) từ Runner | Kết quả chi tiết |
|---|---|---|---|
| `git status --short --branch` | `0` | N/A | Ghi nhận branch `main`, bảo toàn 100% thay đổi local |
| `npm run lint` (`tsc --noEmit`) | `0` | Toàn bộ codebase | **0 lỗi kiểu TypeScript** |
| `npm run build` (`vite build && tsc`) | `0` | 1.902 modules | **Build thành công trong 1.60s** (bundle 2.57 MB) |
| `npm run test:import:segments` | `0` | 1 suite / **18 tests** | **18/18 PASS**: Phân đoạn cấu trúc, SEP-01 đến SEP-23 |
| `npm run test:body:tables` | `0` | 1 suite / **5 tests** | **5/5 PASS**: TBL-01 đến TBL-05 (phân bổ twip, styling body) |
| `npm run test:fidelity` | `0` | **8 tasks / 8 suites / 30 tests** | **30/30 PASS**: Task 1 (5), Task 2 (3), Task 3 (2), Task 4 (3), Task 5 (6), Task 6 (5), Task 7 (3), Task 8 (3) |
| `npm run test:edgecases` | `0` | 5 suites / **14 tests** | **14/14 PASS**: Parser (5), Preview (3), Print (2), Export (4) |
| `npm run test:repro` | `0` | 1 suite / **6 tests** | **6/6 PASS**: REPRO-01 đến REPRO-08 (bảo toàn bảng và chữ ký) |
| **Tổng cộng `test:regression` (5 script)** | **`0`** | **16 suites / 73 tests** | **73/73 PASS** (18 + 5 + 30 + 14 + 6 = 73 tests độc lập) |
| `npx tsx test/server-startup-safety.test.ts` | `0` | 0 suites / **3 tests** | **3/3 PASS**: Host ngoại lai chặn 403, Cloud chặn AI, cổng bận reject & dọn Vite |
| `npx tsx test/server-network-security.test.ts` | `0` | 0 suites / **1 test** | **1/1 PASS**: Bind loopback và chặn 403 Origin/Host lạ |
| `npx tsx test/workspace-candidate.test.ts` | `0` | 1 suite / **14 tests** | **14/14 PASS**: Bất biến candidate, composer, order, cache key, gates |
| `npx tsx test/export-candidate-contract.test.ts` | `0` | 1 suite / **5 tests** | **5/5 PASS**: Hợp đồng candidate gate, chặn XML rác, chặn unsafe candidate |
| `npx tsx test/candidate-preview-print-browser.test.ts` | `0` | 0 suites / **1 test** | **1/1 PASS**: Xem trước, in iframe cô lập, tải ứng viên và tải gốc khớp SHA |
| `npx tsx test/import-source-warning-browser.test.ts` | `0` | 0 suites / **1 test** | **1/1 PASS**: Cảnh báo wrapper lạ trong Bước 1 và mở rộng xem nhanh bằng phím |
| `npx tsx test/import-partition-abort-browser.test.ts` | `0` | 0 suites / **1 test** | **1/1 PASS**: Tín hiệu abort AI khi người dùng can thiệp sửa phân vùng thủ công |

> **Lưu ý chuẩn xác về số lượng kiểm thử:** Tuyệt đối không cộng gộp số thứ tự task (`1-8` của `test:fidelity`) thành 8 test case để đưa ra con số ước lượng (như `54/54` trước đây). Trên thực tế:
> - `test:fidelity` chạy 8 file kiểm thử độc lập chứa tổng cộng **30 test cases** cụ thể.
> - Tổng số test case thực thi trong `npm run test:regression` là **73 test cases**, tất cả đều đạt kết quả `PASS` với mã thoát `0`.

---

## 4. Bằng Chứng Trình Duyệt Với Fixture Kỹ Thuật Tổng Hợp

1. **Kiểm tra hủy yêu cầu AI khi chỉnh sửa phân vùng thủ công:**
   - *Tệp test:* `test/import-partition-abort-browser.test.ts`.
   - *Fixture:* `Synthetic_Partition_Abort.docx` (tạo tự động bằng `generateND30DocxBuffer`).
   - *Kết quả:* Khi người dùng can thiệp sửa vai trò của khối nguồn trong hộp thoại rà soát, yêu cầu AI đang chờ bị gửi tín hiệu `abort` ngay lập tức, trạng thái tải bị hủy bỏ, bảo vệ người dùng không bị ghi đè dữ liệu.
2. **Cảnh báo phần tử nguồn chưa hỗ trợ & khả năng truy cập bàn phím:**
   - *Tệp test:* `test/import-source-warning-browser.test.ts`.
   - *Fixture:* `Synthetic_Unknown_Wrapper.docx` (chứa `w:sdt`, custom wrapper, nested table, hyperlink in table).
   - *Kết quả:* Bước 1 hiển thị banner cảnh báo `Cần đối chiếu 5 phần của tài liệu với tệp gốc`. Phần xem nhanh thân bài mặc định thu gọn; khi dùng phím `Space` hoặc `Tab`, focus di chuyển chuẩn xác và mở rộng nội dung kèm giải thích phạm vi chỉ bao gồm phần thân.
3. **Đồng bộ ứng viên giữa Xem trước, Tải xuống và In ấn (Bước 3):**
   - *Tệp test:* `test/candidate-preview-print-browser.test.ts`.
   - *Kết quả:* SHA-256 của byte ứng viên xem trước khớp 100% với tệp DOCX tải xuống và tài liệu in trong iframe cô lập (`body original`). Tệp gốc tải xuống khớp SHA với nguồn. Khi người dùng sửa nội dung ở Bước 2 trong khi đang mở hộp thoại in, tác vụ in bị hủy bỏ và frame in cũ bị loại bỏ để ngăn xuất bản in lỗi thời.

---

## 5. Ranh Giới Đánh Giá & Các Hạng Mục Cần Nghiệm Thu Tiếp

1. **Nghiệm thu trải nghiệm người dùng Bước 1 (C2):**
   - Các bài kiểm thử tự động trên trình duyệt đã chứng minh cơ chế kỹ thuật (abort request, phím bấm, hiển thị banner) hoạt động chính xác theo kịch bản lập trình.
   - **Chưa thể kết luận toàn bộ Bước 1 đã đạt UX hoàn hảo:** Cần người dùng là cán bộ văn phòng trực tiếp thao tác để đánh giá tính trực quan của ngôn ngữ, các điểm có thể gây bỡ ngỡ hoặc nhầm lẫn, và kiểm tra hiển thị trên các màn hình có độ phân giải và tỷ lệ thu phóng (125%, 150%) thực tế.
2. **Đối chiếu hiển thị trên Microsoft Word Desktop (C5):**
   - Hệ thống đã kiểm chứng cấu trúc OOXML hợp lệ (`w:cantSplit`, `w:tblHeader`, `w:gridSpan`, DrawingML).
   - Tuy nhiên, việc ngắt trang vật lý, lề trang in và độ dày nét vẽ Shape có thể có sự khác biệt giữa các phiên bản Word (2016, 2019, 2021, Office 365). Cán bộ văn thư cần mở tệp xuất ra trên ứng dụng Word thực tế trước khi phát hành chính thức.
3. **Thẩm định tính pháp lý:**
   - Bộ quy tắc rà soát được lập dựa trên Nghị định 30/2020/NĐ-CP và Hướng dẫn 05-HD/VPTW.
   - Kết quả rà soát tự động không thay thế thẩm quyền và trách nhiệm phê duyệt của lãnh đạo cơ quan ban hành văn bản.
4. **Kết nối Provider AI thực tế:**
   - Các kiểm thử tự động sử dụng synthetic mock provider để bảo vệ bảo mật và chi phí.
   - Để sử dụng tính năng rà soát AI thật, cần cung cấp `GEMINI_API_KEY` hoặc bật `DOCFORM_SIWC_ENABLED=true` trên máy trạm Windows nội bộ theo đúng hướng dẫn.

---

*Biên bản được cập nhật và kiểm chứng độc lập bởi Antigravity QA/UX Auditor trên checkout cục bộ `D:\DocForm`.*
