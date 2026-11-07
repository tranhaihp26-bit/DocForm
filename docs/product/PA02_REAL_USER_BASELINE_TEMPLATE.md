# PA-02 — Mẫu baseline tác vụ người dùng thật

**Trạng thái:** `TEMPLATE_ONLY / NOT_TESTED`; chưa có người tham gia hoặc kết quả đo trong phiên này.
Mục tiêu là ghi baseline trước khi đặt ngưỡng usability. Dùng lại [UX-01–UX-13](../DAC_TA_NOI_DUNG_UX_3_BUOC_DOCFORM_2026-11-04.md) và các ca U-01–U-12 trong [Product End State §9.1](DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md); không tạo một bộ UX trùng lặp.

## Điều kiện tổ chức

1. Mời người làm văn thư/văn phòng thuộc nhóm người dùng mục tiêu; không dùng developer đóng vai người dùng. Xin phép ghi nhận thao tác trước khi bắt đầu.
2. Chỉ dùng tài liệu tổng hợp hoặc mẫu đã được phép, khử nhận dạng. Không lưu tên người/tổ chức, nội dung hồ sơ, ảnh màn hình hoặc tệp nguồn vào repo công khai.
3. Ghi phiên bản app/commit, OS, trình duyệt, kích thước màn hình và Office/WPS/version nếu thực sự đo được. Nếu không có Office, đánh dấu `NOT_VERIFIED_RENDER`; không thay bằng browser preview.
4. Đọc nguyên văn yêu cầu tác vụ, không chỉ người dùng nút bấm. Ghi thời điểm bắt đầu/kết thúc, số lần cần trợ giúp, thao tác sai/tải nhầm và phần người dùng tự hiểu; chỉ ghi thời gian/thao tác nếu quan sát và đo thực tế.
5. Nếu gặp master chưa duyệt, dữ liệu không hỗ trợ hoặc cổng an toàn, dừng đúng nơi và ghi `BLOCKED_BY_MASTER`, `REVIEW_ONLY` hoặc `NOT_EVALUATED`; không khuyến khích tiếp tục bằng cách đoán.

## Bộ tác vụ khởi đầu

Các mã là tham chiếu đến kịch bản hiện có. `U-01`/`U-03` chỉ chạy đầy đủ khi mẫu/profile đúng regime đã có quyết định cần thiết; nếu không, ghi blocker thay vì tạo đầu ra được coi là đạt.

| Case | Tác vụ người dùng được giao | Điều cần quan sát |
|---|---|---|
| U-01 | Tạo NĐ30 có tên loại | Chọn đúng hệ/loại/profile; thiếu trường không tự sinh số/ngày/người ký; tải đúng DOCX nếu đủ cổng. |
| U-03 | Tạo HD05 có tên loại | Không lẫn NĐ30; xem rõ giá trị còn chờ duyệt; không tự chọn issuer/profile. |
| U-05 | Nhập DOCX tổng hợp, sửa một đoạn rồi xuất | Xác nhận đúng nguồn, thay đổi hiện lại trong draft và DOCX, không mất nội dung ngoài quyết định. |
| U-06 | Sửa bảng đơn giản; so với bảng có header lặp thật | Ô đúng scope mới sửa; hàng/cột/header không bị đổi lặng lẽ. |
| U-02 / U-04 | Công văn NĐ30/HD05 với V/v và người nhận | Role đúng regime, nhiều người nhận/subject dài; nếu master chưa đủ, dừng ở blocker. |
| U-07 | Tài liệu tổng hợp có bảng phức tạp/ảnh/đối tượng lạ | Người dùng hiểu vùng nào chỉ xem/đối chiếu; nguồn còn tải được; không có nút sửa giả. |
| U-08 | Sửa bản soạn sau khi mở/tải candidate | Candidate cũ thành stale, tải/in bị khóa cho đến khi tạo bản mới; byte mới trùng preview/tải. |
| U-09 / U-10 | Reload/tiếp tục; thao tác không AI khi PDF/WPS không sẵn sàng | Chỉ báo đã lưu sau ghi thành công; người dùng biết cách tiếp tục/tải nguồn; lỗi PDF không bị hiểu là lỗi DOCX đủ cổng. |
| U-11 / U-12 | Từ chối AI hoặc dùng máy sạch | Không gửi trước consent; kiểm khả năng mở ứng dụng theo mô hình phân phối đã chọn, không yêu cầu người dùng chạy npm nếu không thuộc quy trình công bố. |

## Phiếu phiên — để trống cho người thử thật

| Trường | Ghi nhận |
|---|---|
| Mã phiên ẩn danh |  |
| Ngày / người ghi nhận |  |
| App commit / phiên bản |  |
| OS / trình duyệt / viewport |  |
| Office/WPS + version (nếu có) |  |
| Mã mẫu tổng hợp / quyền sử dụng |  |
| Consent ghi nhận thao tác |  |
| Trạng thái master/profile cần cho case |  |

### Kết quả từng tác vụ

| Case ID | Start / end (nếu đo) | Hoàn thành độc lập? | Đúng cảnh báo/đúng nút? | Số lần trợ giúp | Thao tác sai / tải nhầm | Draft revision / candidate SHA (nếu có) | Mở/sửa được trong Office? | Status + vấn đề |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  | `NOT_TESTED` |

### Tiêu chí ghi kết quả

- `PASS` chỉ khi quan sát đủ các bước yêu cầu cho case; hành trình được quảng bá end-to-end còn cần DOCX đúng revision mở/sửa được trong Office/version đã chốt và người dùng hoàn tất không cần developer.
- `FAIL` khi có hành vi trái expected (ví dụ mất nội dung, tải candidate stale, nhãn làm người dùng chọn nhầm); ghi repro và impact.
- `BLOCKED_BY_MASTER` khi thiếu mẫu/profile/giá trị được duyệt; `REVIEW_ONLY` khi người dùng phải đối chiếu vùng; `NOT_EVALUATED` khi chưa có phép đo.
- Không tổng hợp phần trăm hoàn thành, tiết kiệm thời gian hoặc ngưỡng đạt trước khi có baseline và quyết định tiêu chí cho vòng UAT sau. Đề xuất ban đầu khoảng 5 người và 8–12 tệp trong Product End State chỉ là phương án để cân nhắc, không phải dữ liệu đã thu hoặc yêu cầu thống kê.
- Biên bản công khai chỉ giữ mã ẩn danh, case ID, metadata được phép, hash và kết luận. Lưu tệp/screenshot riêng tư ở nơi được duyệt; không commit lên repo công khai.
