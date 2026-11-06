# Hướng dẫn cho `test`

Áp dụng cùng hướng dẫn gốc [`../AGENTS.md`](../AGENTS.md). Bản đồ test: [`../docs/CODEBASE_MAP.md`](../docs/CODEBASE_MAP.md), mục 10.

- Dùng fixture tổng hợp hoặc đã khử nhận dạng; không thêm nội dung văn bản thật, API key, credential hay dữ liệu cá nhân vào test, snapshot hoặc log.
- Test phải nêu hành vi/contract cụ thể, có ca lỗi hoặc ca âm cho gate/routing quan trọng, và dùng đúng luồng hiện hành. Không dựa riêng vào test legacy để xác nhận wizard 3 bước.
- Một test xanh chứng minh đúng ca được thực thi trên checkout hiện tại; không chứng minh tuân thủ pháp lý, mọi DOCX, chất lượng nhà cung cấp AI, hiển thị Word hoặc production readiness.
- Khi test contract/API, kiểm tra điều kiện từ chối, source/revision binding, idempotency hoặc byte đầu ra nếu thuộc phạm vi; mock không thay cho kiểm chứng provider thật.
- Chạy đúng test liên quan theo Codebase Map và kiểm tra các script đang có trong `package.json`; không giả định test hoặc fixture được liệt kê trong báo cáo cũ vẫn còn.
- Thiếu fixture phải skip có lý do hoặc ghi BLOCKED cho phần kiểm chứng phụ thuộc; không `return` khiến test runner báo PASS như đã thực thi. Assert điều kiện tiên quyết trước khi kết luận: candidate tồn tại, trạng thái xác định, selector đúng và phần tử cần kiểm tra thực sự được tìm thấy.
- Kiểm gate bằng ca dương/âm và hành vi được phép/bị chặn. Selector không tìm thấy không tự chứng minh nút disabled hoặc không có đường vòng. Khi UI chủ động ẩn nút, kiểm đúng trạng thái ẩn theo contract và xác nhận action tương ứng vẫn bị chặn.
- Không giảm assertion, thay dữ liệu hoặc dùng `any` để che lỗi. Khi contract sản phẩm đổi hợp lệ, cập nhật test kèm lý do và bằng chứng; giữ các assertion bảo toàn dữ liệu và trạng thái an toàn liên quan.
