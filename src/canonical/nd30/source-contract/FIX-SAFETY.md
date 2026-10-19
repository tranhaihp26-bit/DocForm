# Fix Safety

## Mục tiêu

Auto-fix chỉ được thực hiện khi thay đổi an toàn, cục bộ, có thể truy vết và không làm thay đổi ý nghĩa pháp lý/nội dung ngoài phạm vi rule.

## Mức xử lý

- `SAFE`: sửa cơ học, deterministic, phạm vi hẹp.
- `GUARDED`: chỉ sửa khi classification/evidence đủ chắc chắn.
- `SUGGEST_ONLY`: chỉ đề xuất cho người dùng.
- `PROHIBITED`: không được tự sửa.

Ví dụ:

| Loại thay đổi | Policy |
|---|---|
| Font/lề/italic/spacing | SAFE |
| Vị trí thành phần, heading, numbering | GUARDED |
| Gợi ý câu chữ | SUGGEST_ONLY |
| Căn cứ pháp lý, thẩm quyền, người ký, nội dung quyết định | PROHIBITED |

## Preflight

Trước patch phải kiểm tra tối thiểu:

- package integrity;
- digital signature;
- protection/read-only;
- track changes;
- macro-enabled document;
- unsupported/embedded objects;
- parser capability.

Tài liệu đã ký số: mặc định **audit-only**, không sửa.

## Surgical patch

Không normalize toàn file. Chỉ sửa đúng object/property vi phạm.

Mỗi patch phải có:

```yaml
patch_id:
rule_id:
target_id:
operation:
property:
before:
after:
safety:
  policy:
  preconditions:
  postconditions:
```

## Reversibility

Patch phải tạo được audit trail đủ để so sánh before/after. Sau patch phải kiểm tra:

1. file còn mở được;
2. rule mục tiêu đã pass;
3. thuộc tính không liên quan không bị thay đổi ngoài dự kiến;
4. không xuất hiện anomaly cấu trúc/visual lớn.

## Visual QA

Visual regression chỉ là tín hiệu anomaly; không thay thế structural/legal validation. Rendering bằng ứng dụng không phải Microsoft Word không được coi là bằng chứng tuyệt đối về fidelity trong Word.
