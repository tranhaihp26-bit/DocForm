# Đặc tả đề xuất: Đơn giản hóa Bước 1 của DocForm

**Trạng thái:** Bản yêu cầu để lập kế hoạch; chờ người dùng duyệt kế hoạch trước khi triển khai.

## Mục tiêu

Giúp người dùng không rành kỹ thuật hoàn tất Bước 1 bằng cách chỉ tập trung vào những lựa chọn cần xác nhận, đồng thời giữ nguyên nguồn gốc tài liệu, quyền kiểm soát của người dùng và các cổng an toàn hiện có.

## Phạm vi

Ưu tiên luồng nhập DOCX/TXT tại Bước 1, nhất là phần xác nhận thông tin sau nhận diện. Không thay đổi luồng tạo tài liệu mới ngoài việc kiểm tra không hồi quy; không thay đổi bước 2, bước 3, plugin ONLYOFFICE, parser, xuất DOCX hay giao thức nhà cung cấp AI.

## Yêu cầu trải nghiệm

1. Trình bày hệ thể thức, cơ quan ban hành và loại văn bản dưới dạng lựa chọn hoặc thông tin tóm tắt dễ hiểu.
2. Khi có bằng chứng nhận diện đáng tin cậy, đưa đề xuất và trích dẫn ngắn từ nguồn lên gần lựa chọn tương ứng. Người dùng phải bấm xác nhận; hệ thống không tự chốt loại văn bản từ đề xuất.
3. Chỉ nhận diện mẫu Công ty Hoa tiêu miền Bắc khi tên cơ quan khớp cặp tên chuẩn của mẫu. Cụm từ “Hoa tiêu” xuất hiện trong tên một tổ chức khác không đủ chứng minh đây là Công ty Hoa tiêu miền Bắc. Nếu nguồn không khớp mà mẫu công ty đang được chọn, Bước 1 phải yêu cầu người dùng chuyển sang Cơ quan chung hoặc xác nhận rõ vẫn giữ mẫu công ty trước khi tiếp tục.
4. Tóm tắt số mục ngữ nghĩa cần xem; chỉ mở nội dung chi tiết khi người dùng yêu cầu. Giữ nút xác nhận/từ chối và hành vi chỉ áp dụng quy tắc sau khi mục liên quan đã được xác nhận.
5. Ẩn mặc định thông tin kỹ thuật như SHA, phiên bản bộ dựng, URI gói DOCX, ước lượng token và mã rule; vẫn cho người dùng kỹ thuật mở xem khi cần.
6. Giữ lựa chọn đồng ý gửi dữ liệu cho AI ở trạng thái chủ động, nêu rõ phạm vi nội dung sẽ gửi và giữ nguyên consent riêng cho từng thao tác. Không tự gửi dữ liệu.
7. Giữ khả năng xem lại tài liệu gốc và trạng thái sẵn sàng/không sẵn sàng ở ngôn ngữ phổ thông.
8. Làm nút hành động chính dễ tìm khi cuộn; giữ các lựa chọn cốt lõi gọn, để khu vực AI/ngữ nghĩa dài chiếm toàn bề ngang và thu gọn mặc định; không dành cột cho ngữ cảnh đang ẩn; hỗ trợ desktop và màn hình hẹp.

## Ràng buộc

- Không sửa/xóa nội dung nguồn hoặc quyết định đã lưu của người dùng.
- Không tự áp dụng hệ thể thức, cơ quan, loại văn bản hoặc quy tắc chỉ dựa trên AI.
- Không thay đổi phạm vi dữ liệu, consent, endpoint hoặc hành vi gửi tới ChatGPT/Gemini.
- Các mục chưa duyệt giữ nguyên trạng thái và bằng chứng; cổng duyệt workspace hiện có không đổi. Bổ sung cổng riêng cho xung đột mẫu cơ quan; cổng này phải kiểm tra cả sidebar và nút tiếp tục.
- Dùng dữ liệu tổng hợp trong kiểm thử; không đưa nội dung tài liệu thật vào fixture/log.
- Lỗi kiểm thử xuất candidate profile_header_not_stamped đã phát hiện là hạng mục điều tra riêng, không thuộc kế hoạch UI Bước 1 này.

## Tiêu chí chấp nhận

- Tên tổ chức có từ “Hoa tiêu” nhưng không khớp cặp tên chuẩn không được nhận nhầm là mẫu công ty; xung đột phải được giải quyết rõ trước khi rời Bước 1.
- Đề xuất “Biên bản” có trích dẫn nguồn hiển thị ngay tại vùng chọn loại; chưa được chọn cho đến khi người dùng xác nhận.
- Chi tiết kỹ thuật và danh sách ngữ nghĩa dài không chiếm giao diện mặc định.
- Consent AI vẫn dễ hiểu, tách theo thao tác và không bị bật/gửi tự động.
- Người dùng có thể tìm và kích hoạt nút chính bằng chuột, cuộn và bàn phím trên desktop và màn hình hẹp.