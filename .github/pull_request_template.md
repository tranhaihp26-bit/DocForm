## Mục tiêu & căn cứ
- [ ] Đã đọc [Project Memory](../docs/PROJECT_MEMORY.md), [Product End State](../docs/product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md), [Master Roadmap V2.0](../docs/roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md) và chính sách V2.2 theo phạm vi
- DF-ID kỹ thuật + PA-ID nghiệm thu (nếu có):
- Người dùng cuối sẽ làm tốt hơn việc gì; nằm trong phạm vi M1/M2 nào:
- [ ] Nếu hứa hỗ trợ type/role mới, đã cập nhật [Support Matrix](../docs/product/PRODUCT_SUPPORT_MATRIX.md) với evidence đúng và trạng thái hợp lệ
- Gói DF-ID / kết quả người dùng:
- Đã kế thừa bằng chứng, không làm lại:
- Phạm vi sửa / việc **không** sửa / điều kiện dừng:

## Thay đổi & kiểm chứng
- File/behavior thay đổi:
- [ ] Tôn trọng profile-first; không ghi đè profile bằng ND30/HD05
- [ ] Không mất nội dung hoặc tự thêm dữ liệu chưa cho phép
- Test/CI: lệnh, URL, pass/fail/skip và trạng thái đã kết thúc:
- Các Gate S/T/U/R/O/C bị ảnh hưởng, bằng chứng đạt/chưa đạt:
- Chưa kiểm: Word/WPS, UAT, installer/recovery, fixture, hoặc vấn đề khác:

## Bắt buộc lưu bộ nhớ dự án trước khi đóng PR
- [ ] Cập nhật `docs/sessions/YYYY-MM-DD_DF-IDs_topic.md` với base SHA, diff, CI, kết quả và việc chưa hoàn tất
- [ ] Cập nhật `docs/PROJECT_MEMORY.md` và tiến độ gói trong Master Roadmap (chỉ thay phần liên quan)
- [ ] Ghi trạng thái đúng: DONE_CODE / VERIFIED_OOXML / VERIFIED_RENDER / PARTIAL / BLOCKED
- [ ] Sau merge: bổ sung merge SHA và xác nhận kết quả GitHub; không coi việc tạo PR là đã hoàn tất
