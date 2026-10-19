# Rule Model

## Nguyên tắc

Rule là đơn vị chuẩn hoá **nguyên tử**: một yêu cầu độc lập, có source locator, phạm vi áp dụng, thời gian hiệu lực, constraint và chính sách validation/autofix.

Không dùng một rule chứa nhiều yêu cầu hỗn hợp như lề + font + spacing + căn chỉnh.

## Ví dụ

```yaml
id: ND30.PL1.I.I.MARGIN_LEFT
schema_version: "1.0"
regime: administrative
domain: document_format
source:
  source_id: VN-STATE-ND30-2020
  locator:
    appendix: I
    part: I
    section: I
normativity: mandatory
temporality:
  effective_from: "2020-03-05"
  effective_to: null
target:
  object_type: section
  property: margin_left_mm
applicability:
  section_roles:
    - normal_body
constraint:
  type: numeric_range
  min: 30
  max: 35
validation:
  severity: LEGAL_ERROR
autofix:
  policy: SAFE
```

## Constraint type v1

- `equals`
- `one_of`
- `numeric_range`
- `regex`
- `required`
- `forbidden`
- `ordered`
- `conditional`
- `reference`
- `semantic_review`

`semantic_review` không được tự động sửa.

## Applicability

Không dùng expression string cần `eval()`. Applicability nên dùng điều kiện cấu trúc với các operator giới hạn: `equals`, `not_equals`, `in`, `not_in`, `exists`, `not_exists`.

## Normativity

Các lớp chính:

- `mandatory`: yêu cầu bắt buộc từ nguồn có thẩm quyền.
- `guidance`: hướng dẫn áp dụng chính thức.
- `organizational`: profile/chính sách nội bộ.
- `recommendation`: khuyến nghị chất lượng.

Rule nội bộ không được mở rộng hoặc vô hiệu constraint pháp lý bắt buộc.

## Maturity

```text
draft → extracted → reviewed → verified
```

Chỉ rule `verified` mới được đưa vào production rule pack.

## Invariants

- Mandatory rule phải có source locator hợp lệ.
- Verified rule phải tham chiếu nguồn đã được kiểm chứng.
- Rule hết hiệu lực không được áp sau `effective_to`.
- Rule pack không được sao chép constraint.
- Generated docs phải tham chiếu canonical rule ID.
