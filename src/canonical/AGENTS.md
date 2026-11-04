# Hướng dẫn cho `src/canonical`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 4 và 5.

## Quy tắc và bằng chứng

- Giữ `administrative` (Nghị định 30) và `party` (Hướng dẫn 05) độc lập; không dùng rule/header/format của hệ này để hoàn thiện hệ kia.
- Mỗi hệ có đúng 9 nhóm thể thức chính. Phụ lục, bảo mật/khẩn, phát hành, bản sao, khổ trang/phân trang là thành phần bổ sung có điều kiện, không thành nhóm thứ 10.
- Phân biệt năm loại: `mandatory_legal`, `official_guidance`, `company_profile`, `aesthetic_preset`, `style_spelling`. Chỉ quy định pháp lý có căn cứ điều/khoản/trang nguồn mới được phân loại là bắt buộc; preset/thẩm mỹ/chính tả không phải lỗi pháp lý.
- Rule phải dựa trên bằng chứng cụ thể. Không đặt `PASS` mặc định, không tính `NOT_EVALUATED` vào PASS, không suy diễn kết quả từ số nhóm đã nhận diện.
- Giữ trạng thái riêng: `PASS`, `FAIL`, `NOT_EVALUATED`, `NEEDS_REVIEW`, `NOT_APPLICABLE`. Khi thiếu OOXML/văn bản/nguồn pháp lý đủ để kết luận, dùng trạng thái chưa đánh giá hoặc cần rà soát.
- Profile đơn vị chỉ được PASS khi tài liệu chọn profile và bằng chứng OOXML khớp. Không sửa hình học/header profile Hoa Tiêu đã chốt nếu không có yêu cầu rõ ràng kèm file Word mẫu mới.
- Khi sửa rule, kiểm tra cả hệ còn lại, applicability, ca thiếu bằng chứng và lý do trạng thái; cập nhật căn cứ và test tương ứng.

## Đọc và kiểm chứng

- Bắt đầu ở `ruleEngine.ts`, schema tài liệu và module regime tương ứng (`nd30/` hoặc `hd05/`); dùng đúng test của rule/header/profile trong Codebase Map.
- Test cấu trúc xác nhận logic được kiểm tra; không tự nó chứng minh hiệu lực pháp lý, tư cách ban hành hay phê duyệt chuyên môn.
