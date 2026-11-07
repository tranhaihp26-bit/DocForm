# DocForm — Quy trình giữ mục tiêu và bộ nhớ dự án qua các phiên

**Có hiệu lực:** 07/11/2026. **Đối tượng:** mọi coding agent và mọi thay đổi mã nguồn, tài liệu, cấu hình, test, CI.  
**Bắt buộc theo [AGENTS.md](../AGENTS.md).** Đây là hợp đồng vận hành, không phải engine runtime hay biên bản nghiệm thu.

## 1. Cổng trước khi sửa — không triển khai khi chưa xác định mục tiêu

Trước **mỗi phiên/task/PR**, đọc theo thứ tự tối thiểu (đúng phần liên quan, không nạp cả repository):

1. [Project Memory](PROJECT_MEMORY.md) — phiên/commit đã làm, blocker, kết quả test và nhiệm vụ còn mở.
2. [Master Roadmap](roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md) — ID gói và *kết quả người dùng cần đạt*, điều kiện phụ thuộc/dừng; đọc bổ sung tiến độ sau audit.
3. [Chính sách V2.2](DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md) và [Profile Source Matrix](profile/PROFILE_SOURCE_MATRIX.md) nếu sửa profile, rule, DOCX hoặc bảng.
4. [Codebase Map](CODEBASE_MAP.md) và `AGENTS.md` của vùng thay đổi; đọc HEAD, diff chưa merge, PR/test liên quan (không mặc định báo cáo cũ là hiện trạng).

Viết **intent ngắn** trong mô tả PR/ghi chú phiên trước khi làm: `Task ID → người dùng cần gì → đã có bằng chứng gì → sửa tối thiểu chỗ nào → test nào cần chạy → điều kiện dừng → ngoài phạm vi`.

**Cổng định hướng:** nếu việc định làm không giải quyết trực tiếp một tiêu chí đầu ra của Master Roadmap hoặc nhu cầu mới rõ ràng, **không mở rộng**. Trường hợp repo chưa có gói tương ứng, ghi quyết định bổ sung và giải thích kết quả người dùng; không tự xây lại kiến trúc, nghiên cứu lại tiêu chuẩn đã chốt, hoặc tái kiểm thử toàn bộ vì một diff nhỏ.

**Bảo vệ profile:** profile đã cấu hình quyết định giá trị thuộc tính; ND30/HD05 chỉ fallback cho thuộc tính thiếu. Các thuộc tính `PROFILE_CONFLICT` hoặc master chưa duyệt không được tự đoán/sửa. Không thêm tài liệu Drive riêng tư hoặc dữ liệu thật vào repo công khai.

## 2. Trong phiên — chỉ thực hiện thay đổi phục vụ kết quả

- Chọn một gói/PR nhỏ, ưu tiên sửa ở lớp chứa lỗi. Gắn mã `DF-Xnn` trong PR, test, commit và ghi chú phiên.
- Giữ nguyên thay đổi không thuộc phạm vi. Không sửa mẫu/profile, geometry, luật, font, dữ liệu người ký theo suy diễn.
- Kiểm tra tương xứng: diff tài liệu → liên kết/diff; đổi logic → typecheck + focused tests; chạm DOCX/bảng → OOXML và fidelity phù hợp; Word/WPS không có → `NOT_VERIFIED_RENDER`. Không lặp test còn hiệu lực nếu không chạm phạm vi.
- Nếu blocker vì thiếu quyết định/Golden/renderer: đặt `BLOCKED_BY_MASTER`/`BLOCKED_EVIDENCE`, làm gói độc lập tiếp theo theo roadmap, không giả PASS.

## 3. Cổng sau mỗi phiên — bắt buộc lưu lại trên GitHub

**Sau khi code/docs được thay đổi và kiểm tra kết thúc, trước khi tuyên bố hoàn tất**, cần:

1. Tạo **một nhật ký append-only** tại `docs/sessions/YYYY-MM-DD_DF-IDs_short-topic.md` (hoặc bổ sung phiên vào file đó nếu cùng một đợt chưa kết thúc). Ghi sự kiện thật theo template bên dưới. Không viết lại lịch sử cũ.
2. Cập nhật [Project Memory](PROJECT_MEMORY.md): đường dẫn phiên gần nhất, trạng thái từng gói ảnh hưởng, commit/PR/CI và **bước tiếp theo duy nhất hoặc ưu tiên cao nhất**. Giữ ngắn để agent mới đọc nhanh.
3. Chỉ cập nhật bảng tiến độ của [Master Roadmap](roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md) cho gói bị tác động; không viết lại 11 phần audit gốc, không sao chép nguyên nhật ký vào roadmap.
4. Commit/push nhật ký và index lên đúng repository/branch; nếu PR mới chưa merge thì nhật ký ghi `IN_PROGRESS`/`CI_PENDING`, sau merge phải cập nhật commit merge và CI từ GitHub. Khi không thể lưu được, ghi rõ **NOT_PERSISTED** trong bàn giao, không gọi phiên là đã lưu.
5. Kiểm tra lại chính tệp trên GitHub bằng SHA/đường dẫn và trạng thái kiểm thử cuối, không chỉ dựa vào thông báo tool.

**Bắt buộc cho cả các thay đổi nhỏ.** Nhật ký có thể ngắn, nhưng không được bỏ hoàn toàn. Tài liệu thuần không cần chạy full test; log phải ghi rõ “docs-only / link validation”, không nói test runtime PASS.

### Template nhật ký phiên (không đưa dữ liệu riêng tư)

```md
# Session YYYY-MM-DD — DF-Xnn — <outcome>
- Mục tiêu người dùng / Master Roadmap: ...
- Base HEAD, branch/PR, final merge SHA: ...
- Trạng thái trước phiên: DONE / OPEN / PARTIAL / BLOCKED; bằng chứng đã dùng lại: ...
- Thay đổi: file → kết quả thực tế (chỉ điểm chính)
- Kiểm thử: lệnh/workflow URL, status completed, pass/fail/skip, bằng chứng và phạm vi
- Trạng thái sau phiên: DONE_CODE / VERIFIED_OOXML / VERIFIED_RENDER / PARTIAL / BLOCKED
- Chưa thực hiện / chưa xác minh / rủi ro: ...
- Tiếp theo theo Master Roadmap: DF-... / blocker / điều kiện dừng
```

## 4. Khi mở phiên kế tiếp

Mở `docs/PROJECT_MEMORY.md` trước, theo liên kết tới nhật ký gần nhất; đọc HEAD thực tế và PR chưa merge; chỉ làm **khoảng trống còn lại** so với Master Roadmap. Kết quả trước có bằng chứng còn giá trị thì kế thừa; nếu HEAD thay đổi tại cùng module, xác minh **phần bị ảnh hưởng**, không chạy lại toàn bộ audit. Không hỏi lại các quyết định đã chốt.

## 5. Nguyên tắc nguồn và công khai

- Ghi công khai: ID gói, commit, PR, status, số test được kiểm chứng, tên file, nguồn profile/phiên bản và giới hạn.
- Không đăng: file Drive riêng tư, ID/URL riêng, tên cá nhân trong hồ sơ, dữ liệu khách hàng, font thương mại, token/API key, ảnh nội bộ, transcript hoặc cả nội dung nguồn chưa được phép.
- Trong Project Memory, “DONE_CODE” khác “VERIFIED_OOXML” khác “VERIFIED_RENDER” khác “ACCEPTED”. Khi thiếu bằng chứng, ghi rõ `NOT_VERIFIED`.
