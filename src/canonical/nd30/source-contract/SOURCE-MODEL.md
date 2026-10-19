# Source Model

## Mục tiêu

`Source` biểu diễn một nguồn pháp lý, hướng dẫn chính thức, chính sách nội bộ hoặc tài liệu tham khảo có provenance rõ ràng. Source Registry không đồng nghĩa với việc nguồn đó đã được triển khai thành rule.

## ID

ID ổn định, không đổi khi metadata thay đổi. Quy ước khuyến nghị:

```text
VN-STATE-ND30-2020
VN-STATE-LAW20-2023
VN-PARTY-QD399-2026
VN-PARTY-HD05-2026
```

## Các trường lõi

- `identity`: số, tên, cơ quan ban hành, loại văn bản, ngày ban hành.
- `source_role`: vai trò của nguồn.
- `legal_status`: thời điểm hiệu lực và trạng thái hiện hành.
- `scope`: regime, domain, phạm vi áp dụng.
- `official_sources`: URL/nguồn chính thức.
- `relations`: sửa đổi, thay thế, bãi bỏ, hướng dẫn áp dụng, hợp nhất.
- `implementation`: mức độ đã đưa vào rules.
- `verification`: tình trạng kiểm chứng provenance/status.

## Source role

Các giá trị v1:

- `normative_original`
- `normative_amendment`
- `official_consolidated_text`
- `implementing_instrument`
- `official_application_guidance`
- `official_example`
- `party_normative`
- `party_guidance`
- `organizational_policy`
- `commentary`

Không được dùng hướng dẫn áp dụng hoặc mẫu minh hoạ để override một quy tắc bắt buộc từ nguồn quy phạm.

## Quan hệ nguồn

```yaml
relations:
  amends: []
  amended_by: []
  replaces: []
  replaced_by: []
  repeals: []
  repealed_by: []
  details: []
  detailed_by: []
  guides_application_of: []
  consolidated_from: []
```

Mỗi quan hệ phải tham chiếu bằng `source_id`, không dùng mô tả tự do thay cho quan hệ máy đọc được.

## Temporality

`active` không đồng nghĩa mọi điều khoản còn nguyên bản. Nguồn bị sửa một phần phải có quan hệ sửa đổi và, khi cần, trạng thái theo provision. Việc đánh giá hồ sơ lịch sử phải resolve theo ngày ban hành/thời điểm cần xét, không mặc định áp snapshot pháp luật hiện hành.

## Bản hợp nhất

Văn bản hợp nhất chính thức có thể được dùng làm nguồn đọc/extract operational, nhưng lịch sử văn bản gốc và văn bản sửa đổi vẫn phải được giữ để resolve temporality.

## Authenticity / provenance

Nguồn nên ghi loại xuất xứ như cơ sở dữ liệu pháp luật chính thức, công báo, cổng cơ quan ban hành, verified copy hoặc secondary. Artifact có thể lưu URL + SHA-256; không bắt buộc đưa mọi PDF/DOCX vào Git.

## Registry và Manifest

`sources/registry.yaml` là index. Khi dự án mở rộng, mỗi nguồn nên có manifest riêng. `source.schema.json` áp dụng cho manifest nguồn, không bắt buộc áp trực tiếp cho file index.
