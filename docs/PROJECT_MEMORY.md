# DocForm — Project Memory (bộ nhớ dự án xuyên phiên)

**Bắt buộc đọc trước khi sửa, cập nhật sau khi hoàn thành mỗi đợt.** Quy trình: [PROJECT_SESSION_PROTOCOL.md](PROJECT_SESSION_PROTOCOL.md). Tài liệu này là **chỉ mục ngắn**, không thay thế log phiên, Master Roadmap hay Git history.

## Mục tiêu sản phẩm không được thay đổi

Người dùng **tạo mới, nhập, chỉnh sửa, chuẩn hóa và xuất DOCX có thể tiếp tục chỉnh sửa**, ưu tiên **mọi thuộc tính có cấu hình trong profile Công ty đã xác nhận**. ND30/HD05 chỉ bổ sung từng thuộc tính profile thiếu, không dùng để đối chiếu lại giá trị đã có. Giữ nguyên nội dung không được duyệt sửa và nguồn, không tự điền số/ngày/người ký/chữ ký/dấu; preview/PDF và trạng thái kiểm tra phải trung thực. Giữ workflow Import → Editor → Export, không mặc định viết lại kiến trúc.

## Nguồn điều hành

- [Master Roadmap & trạng thái các gói DF-A–F](roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md)
- [Chính sách V2.2](DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md)
- [Profile Source Matrix DF-A01](profile/PROFILE_SOURCE_MATRIX.md) — `PARTIAL_SOURCE_MAPPED`, không tự sửa A02/A03 đang conflict
- [Codebase Map](CODEBASE_MAP.md)
- [Quy trình nhớ phiên, chống làm trùng/lạc mục tiêu](PROJECT_SESSION_PROTOCOL.md)

## Tiến độ hiện tại (theo phiên đã lưu)

| Gói | Trạng thái kiểm chứng | Bằng chứng |
|---|---|---|
| DF-C01 | DONE_CODE + VERIFIED_OOXML_FOCUSED | PR #2, merge `b8d825bf`, GitHub Actions 42332869724 |
| DF-C03 | DONE_CODE + VERIFIED_OOXML_FOCUSED | PR #2, merge `b8d825bf`, GitHub Actions 42332869724 |
| DF-A01 | PARTIAL_SOURCE_MAPPED | [Ma trận nguồn](profile/PROFILE_SOURCE_MATRIX.md); còn role chưa xác thực |
| DF-A02/A03 | BLOCKED_BY_MASTER | Xung đột ND30 date alignment/issuer line; tên tổ chức Đảng theo mẫu khác phiên bản |
| DF-A04 | DONE_CODE + CI_VERIFIED_FOCUSED | [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3), merge `cf5fb619`; CI 26/26 & 31/31 ở HEAD cuối |
| DF-B01 | PARTIAL_IMPLEMENTED + CI_VERIFIED_FOCUSED — mới nối body.fontSizePt | [Nhật ký phiên](sessions/2026-11-07_DF-A04-B01_effective-profile-and-memory.md); còn DF-B02 cho các consumer khác |
| DF-B02/B03 | OPEN | Nối các thuộc tính còn lại vào exporter/QA sau khi B01 ổn định |
| DF-E03/F02 | NOT_VERIFIED_RENDER | Chưa có bằng chứng Word/WPS thực |

## Phiên làm việc gần nhất

- **Phiên:** 07/11/2026 — DF-A04/DF-B01 + thiết lập bộ nhớ dự án, nhánh `codex/df-b01-effective-attribute-project-memory-20261107`.
- **Trạng thái cuối:** [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3) đã merge tại [`cf5fb619`](https://github.com/tranhaihp26-bit/DocForm/commit/cf5fb6190a1bd06db9da846039ad6eebd75e027c); CI tại head `457f0930` PASS [26/26](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367558) và [31/31](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367566). Chưa nghiệm thu Word/WPS.
- **Nhật ký phiên đã lưu:** [07/11/2026 — DF-A04/B01 resolver & bộ nhớ dự án](sessions/2026-11-07_DF-A04-B01_effective-profile-and-memory.md), có commit, tệp thay đổi, CI, giới hạn và bước sau.
- **Hành động ưu tiên tiếp theo:** DF-B02 nối các thuộc tính đã duyệt còn thiếu vào consumer/exporter/OOXML QA bằng test phạm vi nhỏ; không sửa master A02/A03 bằng suy đoán. Các phần Word/WPS vẫn NOT_VERIFIED_RENDER.

**Lưu ý:** Khi bắt đầu phiên mới, đọc HEAD/PR live trên GitHub. Không dùng SHA nêu trong nhật ký cũ làm HEAD hiện hành mà không kiểm tra lại.
