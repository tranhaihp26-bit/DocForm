# Hướng dẫn cho `src/canonical`

Áp dụng cùng hướng dẫn gốc [`../../AGENTS.md`](../../AGENTS.md). Bản đồ: [`../../docs/CODEBASE_MAP.md`](../../docs/CODEBASE_MAP.md), mục 4 và 5.

## Quy tắc và bằng chứng

- Giữ `administrative` (Nghị định 30) và `party` (Hướng dẫn 05) độc lập; không dùng rule/header/format của hệ này để hoàn thiện hệ kia.
- Mỗi hệ có đúng 9 nhóm thể thức chính. Phụ lục, bảo mật/khẩn, phát hành, bản sao, khổ trang/phân trang là thành phần bổ sung có điều kiện, không thành nhóm thứ 10.
- Phân biệt năm loại: `mandatory_legal`, `official_guidance`, `company_profile`, `aesthetic_preset`, `style_spelling`. Chỉ quy định pháp lý có căn cứ điều/khoản/trang nguồn mới được phân loại là bắt buộc; preset/thẩm mỹ/chính tả không phải lỗi pháp lý.
- Rule phải dựa trên bằng chứng cụ thể. Không đặt `PASS` mặc định, không tính `NOT_EVALUATED` vào PASS, không suy diễn kết quả từ số nhóm đã nhận diện.
- Giữ trạng thái riêng: `PASS`, `FAIL`, `NOT_EVALUATED`, `NEEDS_REVIEW`, `NOT_APPLICABLE`. Khi thiếu OOXML/văn bản/nguồn pháp lý đủ để kết luận, dùng trạng thái chưa đánh giá hoặc cần rà soát.
- **Chính sách V2.2:** khi chọn và xác nhận profile Công ty, thông số hiệu lực được phân giải **theo từng thuộc tính**: có profile → chỉ áp/kiểm đúng giá trị profile, **không hậu kiểm hoặc báo xung đột với ND30/HD05**; thiếu trong mọi cấp profile → fallback ND30/HD05 đúng regime; thiếu cả hai → UNSPECIFIED. Giữ `0`, `false`, `""` có chủ ý; `null` theo schema. Không bỏ các gate bảo vệ dữ liệu độc lập.
- Rule PASS phải dựa trên bằng chứng OOXML với **giá trị hiệu lực**, không đo theo default pháp quy khi profile đã có trị số. Khi triển khai phải rà cả `ruleEngine.ts`, composer/export và output QA; chỉnh hướng dẫn không đủ chứng minh runtime đã đúng. Không sửa geometry header Hoa Tiêu đã duyệt khi thiếu mẫu thay thế. Xem [V2.2](../../docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md).
- Khi sửa rule, kiểm tra cả hệ còn lại, applicability, ca thiếu bằng chứng và lý do trạng thái; cập nhật căn cứ và test tương ứng.

## Đọc và kiểm chứng

- Bắt đầu ở `ruleEngine.ts`, schema tài liệu và module regime tương ứng (`nd30/` hoặc `hd05/`); dùng đúng test của rule/header/profile trong Codebase Map.
- Test cấu trúc xác nhận logic được kiểm tra; không tự nó chứng minh hiệu lực pháp lý, tư cách ban hành hay phê duyệt chuyên môn.
