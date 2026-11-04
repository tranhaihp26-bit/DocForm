# Cấu hình Gemini API và OpenAI API cho DocForm

## Phạm vi

DocForm hỗ trợ ba lựa chọn riêng: Gemini API, OpenAI API và ChatGPT plan local. Hai API dùng khóa riêng trên máy chủ DocForm; ChatGPT plan dùng quy trình đăng nhập SIWC hiện có. Chọn nhà cung cấp chỉ lưu lựa chọn mặc định trong trình duyệt, không gửi văn bản.

Gemini và OpenAI API hiện nhận **văn bản** theo thao tác đã chọn. DocForm không gửi byte DOCX, PDF hoặc ảnh trang qua các adapter này, không khẳng định provider đã đọc OOXML hay xem bố cục. Rà soát toàn văn chỉ gửi manifest văn bản được trích xuất ở máy local, có consent gắn với provider, nguồn, thế hệ và manifest; coverage vẫn phải được xem trên kết quả. Gợi ý luôn cần người dùng duyệt và áp dụng.

## Cấu hình local

1. Sao chép `.env.example` thành `.env` ở thư mục gốc của DocForm.
2. Điền khóa vào `GEMINI_API_KEY` và/hoặc `OPENAI_API_KEY`; có thể chỉ cấu hình một provider.
3. Có thể thay `GEMINI_MODEL` hoặc `OPENAI_MODEL`. Mặc định OpenAI là `gpt-6-luna`; kiểm tra model ID, khả dụng và giá hiện tại trong tài khoản trước khi dùng. Xem [tài liệu model GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
4. Khởi động lại máy chủ DocForm. Không nhập khóa vào giao diện và không đưa khóa vào Git, test, fixture, log hoặc trao đổi chat.
5. Mở **Cài đặt chung**, chọn Gemini API hoặc OpenAI API rồi bấm **Kiểm tra kết nối**. Nút này chỉ gửi một câu thử tổng hợp cố định tới provider đã chọn; request không nhận nội dung tài liệu và UI chỉ hiện trạng thái, model cùng thời gian phản hồi.

Máy chủ chỉ nhận các yêu cầu AI từ ứng dụng DocForm local cùng nguồn. Không mở endpoint này ra mạng LAN/Internet để dùng chung khóa.

## Dữ liệu được gửi theo từng thao tác

| Thao tác | Nội dung gửi khi người dùng cho phép |
|---|---|
| Rà soát phân vùng ở Bước 1 | Văn bản khối và chữ trong ô bảng cùng tọa độ nguồn cần thiết; không gửi tệp, tên tệp, HTML/XML hoặc role parser. Consent riêng theo nguồn, mặc định tắt. |
| Rà soát đề xuất tài liệu | Văn bản trích xuất, tên tệp và cấu trúc nhận diện trong giới hạn hiện hành. Consent theo nguồn và thao tác. |
| Rà soát toàn văn trích xuất | Các đoạn văn được liệt kê trong manifest, kèm anchor/hash và context cần thiết để căn kết quả. Các mục không trích xuất được được báo riêng; đây không phải kiểm tra tệp hoặc bố cục. |
| Tinh chỉnh trong Studio | Nội dung một đoạn Body đủ điều kiện, theo đúng thao tác chính tả hoặc văn phong vừa bấm. Thao tác được báo rõ provider trước khi gửi. |

Lỗi hoặc thiếu cấu hình của OpenAI API không tự chuyển yêu cầu sang Gemini, ChatGPT plan hoặc quy tắc nội bộ như một kết quả AI thành công. Kiểm tra kết nối chỉ chứng minh câu thử đã nhận phản hồi tại thời điểm kiểm tra; nó không chứng minh một tài liệu cụ thể đã được gửi hoặc đọc đủ.

## Khóa, lưu trữ và chi phí

- Khóa chỉ được đọc từ biến môi trường phía máy chủ; trình duyệt không nhận hoặc lưu khóa.
- Yêu cầu OpenAI Responses API đặt `store: false`. Cài đặt này không thay cho việc quản trị dữ liệu, quyền truy cập, lưu giữ, billing hoặc điều khoản của tài khoản/tổ chức. Hãy xem [Data controls của OpenAI API](https://developers.openai.com/api/docs/guides/your-data) và cấu hình dự án trước khi gửi tài liệu nội bộ.
- Chính sách dữ liệu Gemini khác nhau theo tier. Google hiện phân biệt Free và Paid Tier; hãy xem [giá và điều khoản dữ liệu Gemini API](https://ai.google.dev/gemini-api/docs/pricing) rồi xác minh đúng dự án gắn với khóa.
- Lượt gọi API có thể phát sinh phí hoặc chạm hạn mức tài khoản. DocForm không xác minh được billing hoặc data tier chỉ từ việc khóa tồn tại.

## Tình trạng kiểm chứng

Test của DocForm dùng client tổng hợp để xác minh hợp đồng, định tuyến, xử lý lỗi và kiểm soát consent. Chúng không gọi tài khoản thật. Cho đến khi người vận hành cấu hình khóa và dùng nút kiểm tra kết nối trên máy local, khả năng kết nối thực tế được ghi là **NOT_EVALUATED**. Việc thử provider thật không cần gửi tài liệu; không dùng nguồn nội bộ cho bước kiểm tra kết nối.
