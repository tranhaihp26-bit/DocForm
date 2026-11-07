# DocForm — Product Support Matrix / Phạm vi hỗ trợ có bằng chứng

**Phiên bản:** PA-01-Baseline-v0 — 07/11/2026  
**Trạng thái:** DRAFT BASELINE / chưa nghiệm thu M1 hay M2; đây là **khung quản lý năng lực**, không phải giấy chứng nhận tính năng.  
**Chủ sở hữu mục tiêu:** [Product End State](DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md).  
**Chủ sở hữu tiến độ:** [Master Roadmap V2.0](../roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md), PA-01 gắn DF-A01/B05/C04/C06/F03.

## 1. Đọc trạng thái đúng nghĩa

- **SUPPORTED_END_TO_END:** đã có evidence Import/New → Edit → Export, DOCX mở/sửa trong ứng dụng văn phòng đã cam kết, không sai profile và không mất nguồn.
- **SUPPORTED_WITH_REVIEW:** luồng có điều kiện, người dùng phải đối chiếu/duyệt vùng chưa chứng minh.
- **READ_ONLY_SOURCE:** chỉ giữ/đối chiếu nguồn, không quảng bá chỉnh sửa.
- **UNSUPPORTED:** không có năng lực xử lý an toàn; phải cung cấp đường giữ nguồn và thông tin rõ.
- **BLOCKED_BY_MASTER:** phụ thuộc thông số/mẫu đã phê duyệt chưa chốt; không được lấy fallback ND30/HD05 “giải quyết hộ”.
- **NOT_VERIFIED:** có thể có code/test kỹ thuật, nhưng **chưa có bằng chứng nghiệm thu người dùng/Office tương ứng**. **Không phải FAIL và không phải PASS.**

**Quy tắc:** Code, GitHub Actions, báo cáo audit, mẫu header hoặc corpus LibreOffice synthetic **không tự nâng** dòng lên SUPPORTED_END_TO_END. Chỉ thay đổi dòng khi có evidence thực cho chính phạm vi ghi trong dòng.

## 2. Bốn tuyến đầu tiên, ghi nhận trung thực tại 07/11/2026

| ID | Regime | Loại & hành động (phạm vi dự kiến pilot) | Trạng thái hồ sơ | Điều kiện mở khóa end-to-end |
|---|---|---|---|---|
| S-01 | ND30 | Tạo mới + nhập/sửa/xuất văn bản có tên loại (thông báo/báo cáo phù hợp master) | **BLOCKED_BY_MASTER** ở trường header mâu thuẫn; các thao tác khác NOT_VERIFIED_UAT | Chốt right/center và 15/16 theo golden có SHA; test DOCX + WPS/Word + UAT |
| S-02 | ND30 | Tạo mới + nhập/sửa/xuất công văn V/v, Kính gửi nhiều nơi | **BLOCKED_BY_MASTER** ở header liên quan; các thao tác khác NOT_VERIFIED_UAT | Master đúng loại; long V/v, nhiều Kính gửi, phân trang, DOCX editable + UAT |
| S-03 | HD05 | Tạo mới + nhập/sửa/xuất văn bản Đảng có tên loại, dấu *, ----- | **BLOCKED_BY_MASTER** với chủ thể/tên cơ quan nếu phụ thuộc mẫu chưa chốt; các thao tác khác NOT_VERIFIED_UAT | Chốt issuer có nguồn; test đúng role/section, Word/WPS và người dùng |
| S-04 | HD05 | Tạo mới + nhập/sửa/xuất công văn Đảng V/v và nơi nhận | **BLOCKED_BY_MASTER** ở chủ thể và footer chưa duyệt khi áp dụng; các thao tác khác NOT_VERIFIED_UAT | Chốt issuer/footer đúng role, test sửa-xuất, Word/WPS và người dùng |

**Lưu ý:** Các trạng thái BLOCKED_BY_MASTER nêu **điểm khóa để tuyên bố hỗ trợ hoàn chỉnh** cho ca đó, không có nghĩa mọi tính năng import/editor liên quan đều không hoạt động. Thử nghiệm các phần độc lập tiếp tục, kết quả ghi riêng.

## 3. Ma trận năng lực theo đối tượng (không cộng gộp sai)

| Role / chức năng | Khả năng từ code/hướng dẫn hiện có | Phân loại chờ nghiệm thu | Bằng chứng cần |
|---|---|---|---|
| Đoạn thường, in đậm/nghiêng, sửa chữ | Editor Tiptap/Workspace có code | NOT_VERIFIED_UAT | UI sửa → lưu → DOCX chứa sửa |
| Title, subject, V/v, Kính gửi | Có các trường/nhánh theo regime | NOT_VERIFIED_UAT | Điều kiện có tên loại/công văn, đúng vị trí, không tự sinh nội dung |
| Số/ngày/người ký/nơi nhận | Có schema và bộ xuất | NOT_VERIFIED_UAT | Không tự điền, nhập có giữ nguyên, draft không tự thêm ghi chú ký |
| Bảng nhập row0 không header | DF-C03 code/OOXML test đã đạt | VERIFIED_OOXML_FOCUSED; **chưa SUPPORTED_END_TO_END** | UI sửa, không tạo repeat giả, Word/WPS mở/đo |
| Bảng với header thật, nhiều trang | TableModel/export có code | NOT_VERIFIED_RENDER | Header lặp thật, không mất cell, page break phù hợp |
| Bảng gộp/phức tạp/nested/đa section | Fidelity gate có giới hạn | REVIEW_OR_UNSUPPORTED_UNTIL_TESTED | Source hash, coverage, lỗi có hành động rõ |
| Ảnh, drawing, textbox, field, chú thích | Năng lực giới hạn tùy object/import | READ_ONLY_OR_NOT_VERIFIED | Object inventory + source/candidate diff + Office review |
| Header Wide/Shape | JSON/profile và stamp XML có code | BLOCKED_BY_MASTER / NOT_VERIFIED_RENDER | Golden hash, OOXML hậu stamp, Word/WPS |
| Phần cuối và người ký | Có bảng trong document.xml, DF-C01 đã bỏ ghi chú tự sinh | PARTIAL / NOT_VERIFIED_UAT | Role HD05 riêng, nơi nhận dài, các trường source được giữ |
| Candidate DOCX/PDF | Có revision & gate; WPS PDF tùy Windows | PARTIAL / NOT_VERIFIED_RENDER | Cùng byte/revision, tải/in bản mới, Office verification |
| Lưu/khôi phục draft và offline | IndexedDB và local webapp có code | NOT_VERIFIED_USER_OPERATION | Restart/restore/storage full/no network/no AI |
| Cài mở cho nhân viên văn phòng | README hướng dẫn Node/npm | NOT_READY_FOR_NONTECHNICAL_RELEASE | Chọn mô hình phân phối, máy sạch và shortcut/launcher hoặc webapp nội bộ |

## 4. Hồ sơ tối thiểu cho mỗi dòng sau pilot

Một dòng SUPPORTED_END_TO_END chỉ được duyệt khi có đủ:

1. **Phạm vi:** type, regime, profile ID/version, source DOCX/TXT/tạo mới, role cụ thể và đúng Office/version.
2. **Người dùng:** kịch bản, thao tác, lỗi/phần phải tự sửa lại, ai đã thực hiện (mã ẩn danh).
3. **Dữ liệu:** source/candidate SHA-256, content fidelity/ảnh/field/table coverage, edition/revision.
4. **Định dạng:** expected/actual OOXML hậu stamp cho từng property profile SET, fallback đúng hệ.
5. **Tương thích:** tệp DOCX được mở và chỉnh trong Office cam kết, kết quả render + ngày/version/thiết bị.
6. **Quyết định:** PASS/FAIL/NOT_VERIFIED, người duyệt, ngày, loại hạn chế và hướng xử lý khi FAIL.

Không commit nội dung tài liệu nghiệp vụ private hoặc thông tin nhận dạng lên GitHub public. Liên kết bằng mã mẫu/metadata được phép công bố.

## 5. Các câu hỏi còn mở, không được tự chốt

- Chốt golden ND30 date alignment (right/center), issuer line 15/16 (DF-A02).
- Chốt đúng chủ thể Đảng/phiên bản profile HD05 và footer áp dụng (DF-A03/C02).
- Chọn Office/version và hình thức phân phối M1/M2 (DEC-P02/03).
- Chọn danh mục bảng khó **bắt buộc chỉnh sửa** hay chỉ REVIEW; kiểm bằng mẫu thật (PA-03/06).
- Đo baseline usability trước khi khóa ngưỡng UAT; không tự tuyên bố tỷ lệ hoàn thành từ 4 pilot hoặc ZIP giả lập.

**Bước kế tiếp:** dùng cùng ma trận này trong PA-02/03 và DF-B02, cập nhật từng dòng theo test thực, không tạo thêm hệ thống catalog thứ hai.
