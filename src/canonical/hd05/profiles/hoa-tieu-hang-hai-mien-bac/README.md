# Mẫu đầu trang văn bản Đảng của Công ty Hoa tiêu Hàng hải miền Bắc

`header-reference.docx` là bản người dùng đã tinh chỉnh trực tiếp trong Word và chọn làm mẫu tham chiếu. `profile.json` ghi lại nội dung, hình học và kiểu chữ đo được từ chính bản đó. SHA-256 trong profile dùng để phát hiện thay đổi ngoài ý muốn của tệp gốc.

Profile này chỉ áp dụng cho **văn bản Đảng theo Hướng dẫn 05-HD/VPTW**, phần đầu trang thứ nhất. Hai dòng tên đảng bộ cấp trên và hai dòng tên đảng ủy được giữ nguyên như tệp mẫu. Các chỗ trống về số, ký hiệu, ngày, tháng và tên loại văn bản cần được điền theo từng tài liệu.

Các kích thước bảng và tọa độ Shape là lựa chọn trình bày của đơn vị, **không phải rule pháp lý dùng để kiểm tra mọi văn bản**. Khi thay đổi lề, nội dung hoặc cỡ chữ của tiêu đề, phải đo lại đường kẻ bên dưới. Với văn bản Đảng đã chọn **profile riêng của Công ty**, các thuộc tính đã được profile thiết lập **chỉ áp/kiểm theo profile**, không so/hậu kiểm, cảnh báo xung đột hoặc ghi đè bằng thông số HD05. Chỉ trường còn thiếu tại mọi cấp profile mới fallback HD05 đúng regime; không lấy ND30. Đây là quy tắc cấu hình sản phẩm, không phải kết luận pháp lý độc lập. Không áp profile này cho văn bản hành chính. Xem [đặc tả V2.2](../../../../../docs/DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md).

File JSON tại thư mục này mô tả phần đầu; body/table của Công ty còn định nghĩa ở `../../../nd30/companyBodyProfile.ts`, phải được kiểm kê khi xác định thuộc tính hiệu lực.
