# Hướng dẫn cho `test`

Áp dụng cùng hướng dẫn gốc [`../AGENTS.md`](../AGENTS.md). Bản đồ test: [`../docs/CODEBASE_MAP.md`](../docs/CODEBASE_MAP.md), mục 10.

- Dùng fixture tổng hợp hoặc đã khử nhận dạng; không thêm nội dung văn bản thật, API key, credential hay dữ liệu cá nhân vào test, snapshot hoặc log.
- Test phải nêu hành vi/contract cụ thể, có ca lỗi hoặc ca âm cho gate/routing quan trọng, và dùng đúng luồng hiện hành. Không dựa riêng vào test legacy để xác nhận wizard 3 bước.
- Một test xanh chứng minh đúng ca được thực thi trên checkout hiện tại; không chứng minh tuân thủ pháp lý, mọi DOCX, chất lượng nhà cung cấp AI, hiển thị Word hoặc production readiness.
- Khi test contract/API, kiểm tra điều kiện từ chối, source/revision binding, idempotency hoặc byte đầu ra nếu thuộc phạm vi; mock không thay cho kiểm chứng provider thật.
- Chạy đúng test liên quan theo Codebase Map và kiểm tra các script đang có trong `package.json`; không giả định test hoặc fixture được liệt kê trong báo cáo cũ vẫn còn.
