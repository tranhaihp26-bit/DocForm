# Applicability, Routing và Temporality

## Router

Không chọn rule chỉ từ tên file hoặc tên loại văn bản. Context tối thiểu:

```yaml
issue_date:
issuer:
  legal_person_type:
  issuing_body:
    type:
    name:
document:
  type:
  legal_character:
regime:
  value:
  status:
medium:
lifecycle:
  stage:
security:
  classification:
```

## Regime status

- `CONFIRMED`: áp đầy đủ rule phù hợp.
- `INFERRED_HIGH`: cho phép validation; structural auto-fix phải có guard.
- `INFERRED_LOW`: không structural auto-fix.
- `UNKNOWN`: trả `NEEDS_CLASSIFICATION`.

## Nguyên tắc routing

Cùng một pháp nhân có thể có nhiều issuing body. Ví dụ doanh nghiệp nhà nước có thể phát hành văn bản hành chính qua Giám đốc/Chủ tịch, đồng thời Đảng uỷ của doanh nghiệp phát hành văn bản theo Party regime. Vì vậy `issuing_body` quan trọng hơn việc chỉ nhìn `organization_type`.

## Trình tự resolver

```text
1. Xác định regime/domain
2. Lọc phạm vi áp dụng
3. Lọc hiệu lực theo issue_date/as_of
4. Resolve sửa đổi, thay thế, bãi bỏ, chuyển tiếp
5. Resolve conflict theo hiệu lực pháp lý và quan hệ nguồn
6. Chọn minimal rule pack
7. Áp organization profile trong biên pháp lý
```

## Historical audit

Hồ sơ lịch sử phải dùng state pháp luật tại thời điểm cần xét. Không tự động lấy luật hiện hành để thay thế rule cũ nếu không có căn cứ hồi tố/chuyển tiếp.

## Conflict invariant

- Hướng dẫn áp dụng/mẫu minh hoạ không override normative rule.
- Organizational profile không override mandatory legal rule.
- Nếu nguồn bị sửa đổi một phần, resolver phải dùng quan hệ source/provision phù hợp thay vì chỉ đọc `overall_status`.
