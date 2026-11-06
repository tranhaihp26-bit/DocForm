# DocForm-30 — Soạn thảo và chuẩn hóa theo profile Công ty, ND30/HD05 fallback

> Bản mã nguồn công khai không gồm khóa truy cập, văn bản nghiệp vụ, tệp xuất và các phép thử dùng tài liệu nội bộ. Những kiểm thử có dữ liệu mẫu tổng hợp được giữ trong `test/`.

**DocForm-30** là ứng dụng hỗ trợ cán bộ, nhân viên văn phòng soạn thảo, bóc tách và rà soát thể thức văn bản theo 2 hệ quy chuẩn độc lập của Việt Nam:
1. **Văn bản Hành chính Nhà nước:** Nghị định số **30/2020/NĐ-CP** ngày 05/3/2020 của Chính phủ.
2. **Văn bản Đảng:** Hướng dẫn số **05-HD/VPTW** ngày 27/5/2026 của Văn phòng Trung ương Đảng.

---

## Mục tiêu người dùng và chính sách profile V2.2

DocForm phải giúp người dùng **tạo, nhập, chỉnh sửa và chuẩn hóa văn bản**, xuất DOCX có thể tiếp tục chỉnh sửa. Khi người dùng chọn profile riêng của Công ty Hoa tiêu Hàng hải Miền Bắc, **mọi thuộc tính có cấu hình profile được áp đúng profile, không so/hậu kiểm hoặc cảnh báo xung đột với ND30/HD05**. Chỉ thuộc tính profile chưa có mới dùng ND30 hoặc HD05 cùng hệ làm fallback. `0`, `false`, `""` có chủ ý là đã thiết lập; không có cả hai nguồn thì `UNSPECIFIED`.

Đây là **chính sách yêu cầu đã chốt, không mặc nhiên là tính năng runtime đã triển khai**. Xem [đặc tả V2.2 và kế hoạch nghiệm thu](docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md); hướng dẫn agent tại [AGENTS.md](AGENTS.md). Việc giữ nguyên byte nguồn để truy vết không đồng nghĩa phải giữ nguyên định dạng sai trong văn bản sau chuẩn hóa.

---

## 1. Tính Năng Chính

- 🏛️ **Hai chế độ thể thức độc lập:** Cách ly hoàn toàn bộ quy tắc giữa Nhà nước (`administrative`) và Đảng (`party`). Mỗi chế độ quản lý đúng **9 nhóm thành phần chính** và các nhóm bổ sung có điều kiện (phụ lục, mật, khẩn, chỉ dẫn phát hành, bản sao, khổ trang).
- 🛡️ **Bảo toàn cấu trúc nội dung và bảng biểu:** Bóc tách tệp Word `.docx` và `.txt` giữ nguyên nội dung đoạn văn, số lượng bảng biểu, ô gộp (`gridSpan`/`vMerge`), thuộc tính chống tách hàng (`cantSplit`), hàng tiêu đề lặp lại (`tblHeader`) và phụ lục.
- ✍️ **Không suy diễn chữ ký giả:** Văn bản không có chữ ký trong tệp nguồn (như các bản kế hoạch công tác hoặc dự thảo) được bảo lưu nguyên trạng, không tự động biến bảng phân công thành chữ ký hay người ký giả mạo.
- 📐 **Bảo tồn mẫu phần đầu Hoa Tiêu Hàng Hải Miền Bắc:** Cấu hình khung bảng twips và nét vẽ DrawingML/VML đã được khóa theo mẫu duyệt của Công ty Hoa tiêu hàng hải miền Bắc ở cả hai chế độ NĐ 30 và HD 05.
- 📊 **Ba chỉ số tuân thủ minh bạch dựa trên bằng chứng OOXML:** Hệ thống hiển thị 3 chỉ số độc lập:
  - Số nhóm thành phần đã nhận diện: `x/9 nhóm thành phần`.
  - Số việc người dùng cần xử lý: `y việc cần xử lý`.
  - Số quy tắc kiểm định bằng chứng thực tế từ OOXML: `PASS: a | FAIL: f | Chưa kiểm định: b | Cần rà soát: r | Không áp dụng: c`.
- 🧭 **Wizard 3 bước:** Bước 1 nhập nguồn và xác nhận hệ/loại/profile, Bước 2 soạn thảo, Bước 3 tạo ứng viên DOCX, xem đối chiếu, tải xuống hoặc in bản tham khảo.
- 🤖 **Rà soát văn bản có người duyệt:** Có rà soát khối/đoạn và rà soát toàn văn đã trích xuất. Khi chọn Gemini hoặc ChatGPT plan, ứng dụng gửi văn bản đã trích xuất theo thao tác có đồng ý; kết quả được căn về vị trí nguồn và vẫn chờ người dùng xem/áp dụng.
- 🔒 **Giới hạn dữ liệu AI rõ ràng:** Luồng rà soát toàn văn gửi manifest text theo chunk, không gửi byte DOCX/PDF hay ảnh trang đến AI và không khẳng định AI đã xem bố cục. Dựng hình nguồn là xử lý cục bộ riêng. Sự đồng ý gửi dữ liệu gắn với tệp/ngữ cảnh và provider đã chọn.
- 💾 **Lưu trữ nháp và chuyển hệ an toàn:** Tự động lưu bản nháp hiện hành vào IndexedDB, lưu byte nguồn độc lập và báo lỗi trung thực nếu lưu bền vững không khả dụng. Hỗ trợ chuyển đổi giữa hai hệ thể thức (`SafeRegimeModal`) cùng lịch sử phiên bản.
- 📝 **So sánh trực quan (Visual Diff):** Cho phép đối chiếu bản đề xuất, bản gốc ban đầu và chế độ xem Diff từng từ (`inlineHtml`) trước khi xuất file Word.

---

## 2. Giải Thích Về Số Lượng Quy Tắc (Catalog Gốc vs Runtime Registry)

Khi theo dõi các thông số kiểm định, cần phân biệt rõ hai loại số liệu:
- **Catalog gốc trích xuất từ văn bản chính quy:**
  - Danh mục NĐ 30: **435 quy tắc** trích xuất từ Nghị định 30/2020/NĐ-CP ([`src/canonical/nd30/rules.generated.json`](src/canonical/nd30/rules.generated.json)).
  - Danh mục HD 05: **231 quy tắc** trích xuất từ Hướng dẫn 05-HD/VPTW ([`src/canonical/hd05/rules.2026.json`](src/canonical/hd05/rules.2026.json)).
- **Registry đang nạp thực tế trong mã nguồn ([`src/canonical/ruleEngine.ts`](src/canonical/ruleEngine.ts)):**
  - Hệ Hành chính (NĐ 30): **443 quy tắc** (gồm 435 rule gốc + 2 rule profile Hoa Tiêu MB + 6 sub-rules về căn cứ, điều khoản, bảng biểu, khoảng cách dòng).
  - Hệ Đảng (HD 05): **235 quy tắc** (gồm 231 rule gốc + 2 rule profile Đảng bộ Hoa Tiêu MB + 2 sub-rules về 5 dấu gạch nối `-----` và trích yếu đứng đậm).

---

## 3. Hướng Dẫn Cài Đặt & Chạy Cục Bộ

### Yêu cầu môi trường:
- **Node.js:** Phiên bản `>= 20.x` (khuyến nghị Node 22.x hoặc Node 26.x).
- **Trình duyệt hiện đại:** Chrome, Edge, Firefox hỗ trợ CSS Grid và IndexedDB.

### Các bước cài đặt:
1. **Cài đặt các gói phụ thuộc:**
   ```bash
   npm install
   ```

2. **Cấu hình biến môi trường (Tùy chọn):**
   DocForm hoạt động đầy đủ ở chế độ ngoại tuyến (Offline Mode) với bộ quy tắc xác định và từ điển chính tả nội bộ.  
   Nếu muốn kích hoạt thêm trợ lý Gemini AI, tạo file `.env` tại thư mục gốc dự án (lưu ý: `server.ts` gọi `dotenv.config()` nên mặc định đọc file `.env`, không tự động đọc `.env.local`):
   ```env
   # Không chia sẻ hoặc commit file chứa API key thực
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=5050
   ```

3. **Khởi động ứng dụng trên cổng vận hành 5050:**
   ```bash
   npx tsx server.ts --port 5050
   # Hoặc nếu đã cấu hình PORT=5050 trong file .env:
   npm run dev
   ```
   *(Lưu ý: Nếu chạy `npm run dev` mà không truyền `--port` và không đặt `PORT` trong `.env`, `server.ts` sẽ dùng cổng mặc định `5050`. Cổng vận hành chuẩn của dự án là **5050**).*  
   Ứng dụng khả dụng tại: `http://localhost:5050/`.

---

## 4. Các Lệnh Kiểm Thử Thực Tế

| Lệnh thực thi | Mục đích kiểm tra |
|---|---|
| `npm run lint` | Kiểm tra toàn bộ kiểu dữ liệu TypeScript (`tsc --noEmit`) |
| `npm run build` | Đóng gói mã nguồn production và kiểm tra kiểu (`vite build && tsc --noEmit`) |
| `npm test` | Kiểm định 32 tiêu chí thể thức cốt lõi theo NĐ 30 ([`test/nd30-compliance.test.ts`](test/nd30-compliance.test.ts)) |
| `npx tsx test/header-dual-regime.test.ts` | Kiểm định hình học phần đầu NĐ 30 và HD 05 (Generic & Hoa Tiêu MB) |
| `npm run test:body:tables` | Kiểm định định dạng và bảo toàn cấu trúc bảng biểu ([`test/table-and-body-format.test.ts`](test/table-and-body-format.test.ts)) |
| `npm run test:import:segments` | Kiểm định độ chính xác của phân đoạn cấu trúc tài liệu ([`test/import-segments.test.ts`](test/import-segments.test.ts)) |
| `npx tsx test/full-text-review-endpoint.test.ts` | Kiểm định hợp đồng endpoint rà soát toàn văn đã trích xuất |
| `npx tsx test/semantic-ai-alignment.test.ts` | Kiểm định căn quan sát AI về đúng anchor nguồn |
| `npx tsx test/profile-decision-gate.test.ts` | Kiểm định chặn quyết định profile khi chưa khớp nguồn/ngữ cảnh |
| `npx tsx test/export-candidate-contract.test.ts` | Kiểm định hợp đồng ứng viên xuất hiện hành |

Các lệnh trên là điểm bắt đầu trong repository. Danh sách test không đồng nghĩa chúng đã chạy đạt ở checkout hiện tại; hãy chạy lại test phù hợp khi xác nhận một thay đổi.

---

## 5. Tài Liệu Hướng Dẫn Kỹ Thuật

Dành cho lập trình viên và coding agent khi tiếp cận dự án:
- 📖 [**AGENTS.md**](AGENTS.md) — Quy tắc toàn dự án, quy trình làm việc và định tuyến đến hướng dẫn chỉ áp dụng cho thư mục đang sửa.
- 🗺️ [**docs/CODEBASE_MAP.md**](docs/CODEBASE_MAP.md) — Mục lục tác vụ → file → test; chỉ đọc phần cần dùng, không cần tải toàn bộ bản đồ cho mỗi nhiệm vụ.
- 🔐 [**docs/SIWC_LOCAL.md**](docs/SIWC_LOCAL.md) — Thiết lập ChatGPT plan local, consent, xử lý credential và giới hạn provider/file/visual.
