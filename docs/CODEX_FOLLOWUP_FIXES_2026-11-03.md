# Sửa tiếp sau kiểm tra báo cáo Antigravity — 03/11/2026

Checkout: `D:\DocForm`, nhánh `main`, HEAD nền `fe854c6`, nhiều thay đổi local chưa commit. Không commit/push/merge/deploy hoặc thay đổi bản nháp người dùng trong lượt này.

## Đã sửa

### F1 — Giữ ranh giới local cho các thao tác AI dùng credential

Trong `server.ts`, thay helper cho phép theo bind/Cloud Run bằng `isTrustedLocalAiRequest`: yêu cầu phải đi qua loopback, Host local, và Origin cùng nguồn khi có Origin. Bind rộng hoặc CORS allowlist không tự cấp quyền gọi provider. Tất cả route AI đang dùng helper này, kể cả hai alias của review-document và full-text, giữ cổng xác nhận consent riêng hiện có.

Hệ quả cấu hình: web server vẫn có thể bind explicit/cloud, nhưng các thao tác AI được guard này bảo vệ sẽ từ chối trong Cloud Run hoặc từ remote client. Chưa triển khai xác thực AI từ xa; muốn hỗ trợ LAN/cloud phải thiết kế và kiểm chứng riêng, không bỏ guard để khôi phục truy cập.

### F4 — Trả lỗi khởi động cho caller và dọn Vite

Trong `server.ts`, tạo HTTP server, gắn listener lỗi trước khi listen; reject Promise khi lỗi bất đồng bộ hoặc listen ném lỗi đồng bộ; dọn Vite trước khi reject. Khi server đóng bình thường cũng dọn Vite, dùng chung Promise cleanup để tránh gọi trùng.

Thêm `test/server-startup-safety.test.ts`: kiểm tra Host ngoài local khi bind explicit, môi trường cloud không tự cho phép full-text, và cổng bị chiếm tạo rejection có mã EADDRINUSE. Ca lỗi listen chạy trong child process để phân biệt rejection bắt được với lỗi tiến trình không xử lý. Kiểm tra cả production và development; child phải thoát tự nhiên sau khi Vite được dọn.

## Bằng chứng kiểm chứng

- Trước sửa: test cloud trả HTTP 400 thay vì 403; ca occupied-port kết thúc bằng lỗi process thay vì rejection mà caller bắt được. Lượt test ban đầu cũng dùng fetch cho Host; đã sửa test sang http.request vì fetch có thể thay Host trên wire. Không dùng lượt sai cách gửi Host làm bằng chứng khẳng định header đã tới server.
- Nhóm tuần tự `candidate-preview-print-browser`, `full-text-review-endpoint`, `review-document-consent`, `server-network-security`, `server-startup-safety`: PASS 7/7, exit 0. Startup test lúc đó kiểm tra production.
- Sau mở rộng startup test sang cả production/development: chạy riêng `server-startup-safety.test.ts` PASS 3/3, exit 0. Không cộng các test chạy lại vào tổng ca độc lập.
- `npm.cmd run lint`: PASS sau các sửa cuối, exit 0.
- `npm.cmd run build`: PASS; còn hai cảnh báo node:crypto externalized và bundle chính khoảng 2,57 MB. Sau build chỉ đổi tên helper local và mở rộng test; lint sau cùng PASS.
- `git diff --check`: exit 0; còn thông báo LF/CRLF của tệp test hiện hữu.
- Test dùng dữ liệu tổng hợp, dotenv tắt và key rỗng; không gọi provider thật. SDK có nhắc thiếu API key.

## File thay đổi trong lượt này

- `../server.ts`: F1 và F4.
- `../test/server-startup-safety.test.ts`: hồi quy ranh giới AI và startup failure.
- `CODEBASE_MAP.md`: mô tả giới hạn local và route tới test mới.
- File báo cáo này.

Không sửa các thay đổi Antigravity khác hoặc bản báo cáo nghiệm thu cũ.

Các test khởi động server riêng trên cổng động. Server người dùng ở 5050 chưa được dừng/khởi động lại trong lượt này; cần nạp lại tiến trình đó có kiểm soát trước khi coi phiên 5050 đang chạy mã server mới.

## Còn bàn giao cho Antigravity

1. **F2 — safe/downloadable:** chưa thay điều kiện của candidate. Cần bảng trạng thái và quyết định phù hợp AGENTS.md; giữ chặn candidate không an toàn. Việc chỉ sửa JSDoc và xóa nhánh warning chưa hoàn tất yêu cầu.
2. **F3 — phạm vi báo cáo:** sửa các kết luận PASS rộng hơn bằng chứng. Nhóm browser candidate từng thất bại nay đã có lần chạy độc lập PASS ở trên; không dùng nó để suy ra toàn bộ UX đã đạt.
3. Số 54/54 trong báo cáo cũ không thể kiểm chứng bằng phép cộng task/case hiện được liệt kê. Báo từng runner/lệnh và đơn vị đếm, không cộng các task fidelity thành test case.
4. C2/C3 còn cần nghiệm thu UX và quy trình gate kiểm thử; lint/build/regression chạy đạt không tự hoàn tất các deliverable này.
5. Word/gold corpus/pháp lý/provider thật vẫn chưa nghiệm thu. Chưa chạy full regression sau hai sửa server trong lượt này; nếu Anti thay đổi thêm thì chọn test theo phạm vi tác động và ghi rõ kết quả.

Không coi bản sửa server là triển khai xác thực cho LAN/cloud hoặc bằng chứng hết lỗi toàn dự án.
