# DocForm-30 — Chuẩn Thể Thức Nghị Định 30 & Hướng Dẫn 05

> Bản mã nguồn công khai không gồm khóa truy cập, văn bản nghiệp vụ, tệp xuất và các phép thử dùng tài liệu nội bộ. Những kiểm thử có dữ liệu mẫu tổng hợp được giữ trong `test/`.

**DocForm-30** là ứng dụng hỗ trợ cán bộ, nhân viên văn phòng soạn thảo, bóc tách và rà soát thể thức văn bản theo 2 hệ quy chuẩn độc lập của Việt Nam:
1. **Văn bản Hành chính Nhà nước:** Nghị định số **30/2020/NĐ-CP** ngày 05/3/2020 của Chính phủ.
2. **Văn bản Đảng:** Hướng dẫn số **05-HD/VPTW** ngày 27/5/2026 của Văn phòng Trung ương Đảng.

---

## 1. Tính Năng & Mức Độ Hoàn Thiện Đã Xác Minh

- 🏛️ **Hai chế độ thể thức độc lập:** Cách ly hoàn toàn bộ quy tắc giữa Nhà nước (`administrative`) và Đảng (`party`). Mỗi chế độ quản lý đúng **9 nhóm thành phần chính** và các nhóm bổ sung có điều kiện (phụ lục, mật, khẩn, chỉ dẫn phát hành, bản sao, khổ trang).
- 🛡️ **Bảo toàn cấu trúc nội dung và bảng biểu:** Bóc tách tệp Word `.docx` và `.txt` giữ nguyên nội dung đoạn văn, số lượng bảng biểu, ô gộp (`gridSpan`/`vMerge`), thuộc tính chống tách hàng (`cantSplit`), hàng tiêu đề lặp lại (`tblHeader`) và phụ lục.
- ✍️ **Không suy diễn chữ ký giả:** Văn bản không có chữ ký trong tệp nguồn (như các bản kế hoạch công tác hoặc dự thảo) được bảo lưu nguyên trạng, không tự động biến bảng phân công thành chữ ký hay người ký giả mạo.
- 📐 **Bảo tồn mẫu phần đầu Hoa Tiêu Hàng Hải Miền Bắc:** Cấu hình khung bảng twips và nét vẽ DrawingML/VML đã được khóa theo mẫu duyệt của Công ty Hoa tiêu hàng hải miền Bắc ở cả hai chế độ NĐ 30 và HD 05.
- 📊 **Ba chỉ số tuân thủ minh bạch dựa trên bằng chứng OOXML:** Hệ thống hiển thị 3 chỉ số độc lập:
  - Số nhóm thành phần đã nhận diện: `x/9 nhóm thành phần`.
  - Số việc người dùng cần xử lý: `y việc cần xử lý`.
  - Số quy tắc kiểm định bằng chứng thực tế từ OOXML: `PASS: a | FAIL: f | Chưa kiểm định: b | Cần rà soát: r | Không áp dụng: c`.
- 🔄 **Lưu trữ nháp và chuyển hệ an toàn:** Tự động lưu bản nháp vào IndexedDB (báo lỗi trung thực nếu IndexedDB không khả dụng) và hỗ trợ chuyển đổi khứ hồi giữa hai hệ thể thức (`SafeRegimeModal`) kèm lịch sử phiên bản.
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
   *(Lưu ý: Nếu chạy `npm run dev` mà không truyền `--port` và không đặt `PORT` trong `.env`, `server.ts` sẽ dùng cổng dự phòng `3000`. Cổng vận hành chuẩn của dự án là **5050**).*  
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

---

## 5. Tài Liệu Hướng Dẫn Kỹ Thuật

Dành cho lập trình viên và coding agent khi tiếp cận dự án:
- 📖 [**AGENTS.md**](AGENTS.md) — Nguyên tắc cốt lõi, thứ tự đọc file theo nhiệm vụ, quy tắc bảo toàn dữ liệu và checklist hoàn tất thay đổi.
- 🗺️ [**docs/CODEBASE_MAP.md**](docs/CODEBASE_MAP.md) — Bản đồ chi tiết toàn bộ mã nguồn: Nhiệm vụ → File cần đọc → Luồng dữ liệu → Bài test kiểm chứng và hướng dẫn tra cứu nhanh *"Nếu cần sửa X, bắt đầu ở đâu"*.
