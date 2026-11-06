# Rà soát các thay đổi local và Graphify — 2026-11-02

## Kết luận

- Sáu thay đổi local ban đầu nhìn chung đi đúng hướng: cập nhật hướng dẫn agent theo luồng sản phẩm hiện hành, làm rõ giới hạn rà soát AI, và sửa parser để giữ dấu hoa thị đầu trang văn bản Đảng. Test SEP-21 tái hiện đúng ca được sửa.
- Graphify phù hợp làm công cụ điều hướng mã nguồn cục bộ, tùy chọn. Không dùng đồ thị thay cho đọc code, chạy test, kiểm tra OOXML hoặc duyệt Word.
- Có hai điểm cần giữ trong giới hạn: nhận diện dấu `*` còn rộng; Graphify không phân tích hoàn chỉnh `src/App.tsx` và bỏ sót symbol ở một số file.
- Đã sửa các tuyên bố “100%” quá rộng trong bản đồ mã nguồn và thay các đường dẫn test không tồn tại bằng test hiện có. Hai thay đổi đó chỉ hiệu chỉnh độ chính xác tài liệu.

## Phạm vi và trạng thái

- Checkout: nhánh `main`, `HEAD=fe854c6`; trước khi rà soát, `main` trùng `origin/main`.
- Sáu file local được yêu cầu đánh giá: `AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md`, `docs/SIWC_LOCAL.md`, `src/server/structuralSegmenter.ts`, `test/import-segments.test.ts`.
- Hai script shortcut chưa được track: `scripts/start-docform-server.ps1`, `scripts/stop-docform-server.ps1`.
- Bổ sung Graphify: `.agents/rules/graphify.md`, `.agents/workflows/graphify.md`, `.graphifyignore`, `docs/GRAPHIFY.md`, cùng phần hướng dẫn trong `AGENTS.md`.
- Không commit hoặc push. Server test vẫn đang chạy ở `http://localhost:5050/`.

## Kết quả chi tiết

| Mức | Vị trí | Đánh giá |
|---|---|---|
| P2 — cần theo dõi | `src/server/structuralSegmenter.ts:563` | Nhánh mới xem mọi đoạn chỉ có `*` trong 8 đoạn đầu của tài liệu `party` là header, chưa yêu cầu dấu này nằm dưới cơ quan ban hành hoặc cạnh một dòng header kế tiếp. Test hiện có xác nhận header hợp lệ và cách ly regime, nhưng chưa kiểm tra dấu `*` đơn lẻ trong nội dung không phải header. Có thể phân loại nhầm tài liệu đầu vào bất thường; chưa thấy lỗi làm mất khối nguồn. |
| P2 — giới hạn Graphify | `src/App.tsx:5056` | Graphify code-only báo lỗi cú pháp ở vị trí này và chỉ trích được 9 symbol từ `App.tsx`; build TypeScript vẫn đạt. Graphify cũng báo 46 file không có symbol trong lần extract ban đầu. Đồ thị vì vậy chưa đầy đủ cho luồng UI và chỉ nên dùng để tìm đường đọc tiếp. |
| P3 — giới hạn shortcut | `scripts/start-docform-server.ps1:3`, `scripts/stop-docform-server.ps1:3` | Hai script gắn với checkout `D:\DocForm`. Điều này đúng với shortcut cục bộ hiện tại; nếu chuyển thư mục dự án cần cập nhật đường dẫn. |

### Các điểm đã hiệu chỉnh khi rà soát

- `docs/CODEBASE_MAP.md:80,90`: giới hạn tuyên bố bảo toàn định dạng vào những ca test được bao phủ, không khẳng định mọi cấu trúc OOXML.
- `AGENTS.md:158-160`, `docs/CODEBASE_MAP.md:87,102-103`: checkout không có `test/real-documents-roundtrip.test.ts` và `test/browser-live-e2e.test.ts`; thay bằng các test đang có và nêu rõ fixture tổng hợp/không mở Word COM. Markdown links và đường dẫn test còn lại đều tồn tại.
- Hướng dẫn SIWC ở `docs/SIWC_LOCAL.md` phân biệt adapter/capability với việc đã xác minh lời gọi provider thật; không thấy tuyên bố AI đọc byte DOCX hoặc xem bố cục trang.

## Đánh giá các file

### Sáu thay đổi local ban đầu

- `AGENTS.md`: thứ tự đọc theo phạm vi và ranh giới kiến trúc giúp agent tránh sửa nhầm luồng cũ. Bổ sung ranh giới prompt nhúng trong tài liệu như dữ liệu là phù hợp. Danh sách test được sửa cho khớp checkout.
- `README.md`: bỏ tiêu đề hàm ý toàn bộ tính năng đã được xác minh; tách rõ wizard, rà soát text có đồng ý và giới hạn file/ảnh. Các test mới được nêu như điểm bắt đầu chứ không phải kết quả đã chạy.
- `docs/CODEBASE_MAP.md`: hữu ích hơn cho luồng wizard, nguồn, profile và export candidate. Các nhãn đã được đổi từ “đã kiểm chứng” sang “có test liên quan”; các khẳng định bảo toàn định dạng được giới hạn theo fixture/test.
- `docs/SIWC_LOCAL.md`: phân biệt consent, manifest/chunk, adapter và trạng thái xác minh provider; diễn đạt thận trọng, phù hợp.
- `src/server/structuralSegmenter.ts`: giữ đoạn `*` làm header cho HD05 để không rơi vào unclassified và tiếp tục quét số hiệu/tiêu đề/ngày. Rủi ro còn lại là điều kiện nhận diện rộng như ghi ở P2.
- `test/import-segments.test.ts`: SEP-21 kiểm tra header dạng đoạn văn, không áp header Đảng sang hành chính, giữ nguyên chuỗi số hiệu nguồn có dấu hai chấm và không làm rơi block.

### Shortcut server

- `scripts/start-docform-server.ps1` xác thực PID được quản lý, từ chối đụng cổng 5050 của tiến trình khác, chạy Node/tsx ẩn, đợi HTTP 200 rồi mở trình duyệt; log nằm trong `%LOCALAPPDATA%\DocForm\server-shortcuts\logs`.
- `scripts/stop-docform-server.ps1` so khớp PID với command line và đường dẫn server trước khi dừng cây tiến trình; nếu PID đã bị dùng lại cho tiến trình khác thì không dừng tiến trình đó.
- Cả hai script parse thành công. Trong lượt trước đã kiểm tra chu kỳ khởi chạy/dừng; ở lượt rà soát này ứng dụng tiếp tục trả HTTP 200 trên 5050. Server được để chạy cho người dùng test.

### Bổ sung Graphify

- Đã cài CLI `graphify 0.9.100` riêng khỏi dependencies của DocForm ([bản phát hành chính thức](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.100), [repository](https://github.com/Graphify-Labs/graphify)). Graph được extract với `--code-only`, `GRAPHIFY_BACKEND=none`, và query logging bị tắt.
- Kết quả graph local: 1.748 nodes, 5.366 edges, 89 communities; lượt cập nhật ghi nhận 242 file code không đổi và loại 2 file bị ignore. Không chạy LLM extraction trên tài liệu.
- `.graphifyignore` loại `docs/`, fixtures, bằng chứng, tệp văn bản/tài liệu/media và `graphify-out/`; `.agents/rules/graphify.md`, `.agents/workflows/graphify.md`, `AGENTS.md` yêu cầu xác nhận quan hệ từ graph bằng source/test.
- CLI chưa nằm trong `PATH` của máy này; `AGENTS.md` nêu đường dẫn đầy đủ cho PowerShell. Trên máy khác, `docs/GRAPHIFY.md` mô tả cài bản pin qua `uv`.
- Graphify phù hợp cho truy vấn điều hướng rộng hoặc gợi ý các file liên quan. Một số kết quả query dài, và truy vấn đường đi không phải lúc nào cũng tìm ra quan hệ; với việc đã biết file/test cần đọc, dùng `AGENTS.md`, `docs/CODEBASE_MAP.md` và `rg` trực tiếp sẽ hiệu quả hơn.

## Kiểm chứng thực hiện

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd run lint` | PASS — `tsc --noEmit`, exit code 0 |
| `npm.cmd run test:import:segments` | PASS — 16 ca, gồm SEP-21 |
| Graphify extract/update code-only | PASS — graph local được tạo/cập nhật; không gọi LLM backend |
| Parse hai file PowerShell | PASS |
| Markdown local links và test file references | PASS sau khi sửa hai đường dẫn không tồn tại |
| `git diff --check` | PASS |
| `GET http://127.0.0.1:5050/` | HTTP 200; port 5050 đang LISTEN |

Chưa chạy toàn bộ bộ test, chưa chạy `npm run build`, chưa kiểm tra DOCX bằng Microsoft Word/LibreOffice trong lượt này. Test trình duyệt được liệt kê trong tài liệu tồn tại nhưng chưa chạy ở lượt này; test cấu trúc không thay cho kiểm tra dàn trang trực quan.

## Danh sách file thay đổi

- Sáu file local ban đầu: `AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md`, `docs/SIWC_LOCAL.md`, `src/server/structuralSegmenter.ts`, `test/import-segments.test.ts`.
- Tài liệu/cấu hình Graphify: `.agents/rules/graphify.md`, `.agents/workflows/graphify.md`, `.graphifyignore`, `docs/GRAPHIFY.md`.
- Shortcut: `scripts/start-docform-server.ps1`, `scripts/stop-docform-server.ps1`.
- Báo cáo rà soát: `docs/LOCAL_CHANGES_AND_GRAPHIFY_REVIEW_2026-11-02.md`.
