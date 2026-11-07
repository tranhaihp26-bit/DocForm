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

## Tiến độ đã có bằng chứng trước phiên DF-B01

| Gói | Trạng thái kiểm chứng | Bằng chứng |
|---|---|---|
| DF-C01 | DONE_CODE + VERIFIED_OOXML_FOCUSED | PR #2, merge `b8d825bf`, GitHub Actions 42332869724 |
| DF-C03 | DONE_CODE + VERIFIED_OOXML_FOCUSED | PR #2, merge `b8d825bf`, GitHub Actions 42332869724 |
| DF-A01 | PARTIAL_SOURCE_MAPPED | [Ma trận nguồn](profile/PROFILE_SOURCE_MATRIX.md); còn role chưa xác thực |
| DF-A02/A03 | BLOCKED_BY_MASTER | Xung đột ND30 date alignment/issuer line; tên tổ chức Đảng theo mẫu khác phiên bản |
| DF-B01/DF-A04 | IN_PROGRESS (nhánh hiện tại; chưa nghiệm thu CI) | Gói thiết lập resolver và test theo từng thuộc tính |
| DF-B02/B03 | OPEN | Nối các thuộc tính còn lại vào exporter/QA sau khi B01 ổn định |
| DF-E03/F02 | NOT_VERIFIED_RENDER | Chưa có bằng chứng Word/WPS thực |

## Phiên làm việc gần nhất

- **Phiên:** 07/11/2026 — DF-A04/DF-B01 + thiết lập bộ nhớ dự án, nhánh `codex/df-b01-effective-attribute-project-memory-20261107`.
- **Trạng thái tại thời điểm tạo chỉ mục:** IN_PROGRESS, chưa báo test PASS/merge.
- **Nhật ký cuối:** sẽ liên kết tại `docs/sessions/2026-11-07_DF-A04-B01_profile-resolution-and-memory.md` khi hoàn tất CI/merge; nhật ký ghi bằng chứng cuối từ GitHub.
- **Hành động tiếp theo sau phiên hiện tại:** nếu test B01 đạt, nối thêm thuộc tính đã duyệt vào đúng consumer (DF-B02); nếu chưa đạt, sửa chính xác lỗi CI; không sửa master A02/A03 bằng suy đoán.

**Lưu ý:** Khi bắt đầu phiên mới, đọc HEAD/PR live trên GitHub. Không dùng SHA nêu trong nhật ký cũ làm HEAD hiện hành mà không kiểm tra lại.
