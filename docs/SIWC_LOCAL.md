# ChatGPT plan trong DocForm local

## Phạm vi

Tích hợp Sign in with ChatGPT (SIWC) cho ba thao tác AI trong DocForm Local trên Windows: **rà soát phân vùng nguồn**, **rà soát tài liệu** và **rà chính tả/nâng văn phong đoạn đang chọn**. Mặc định provider được chọn trong **Cài đặt chung**; lựa chọn Gemini hoặc ChatGPT plan được lưu ở trình duyệt theo origin/profile. ONLYOFFICE plugin chưa được tích hợp.

## Bật tính năng

1. Dùng Node.js 22 trở lên trên Windows và cài dependencies theo `bun.lock` bằng `bun install`.
2. Trong `.env` local, đặt `DOCFORM_SIWC_ENABLED="true"`, rồi khởi động lại DocForm.
3. Trong **Cài đặt chung**, chọn **ChatGPT plan · local**, nhấn **Kết nối ChatGPT** và hoàn tất cấp quyền trong trình duyệt.
4. Với rà soát phân vùng, bật checkbox cho phép gửi nguồn với từng tệp. Với rà soát tài liệu hoặc tinh chỉnh đoạn, nhấn nút hành động tương ứng sau khi xem thông báo nơi nhận. DocForm chỉ gửi khi đã kết nối và tài khoản cho phép chia sẻ token.

Khi cờ không được bật, chạy ngoài Windows hoặc chạy trên Cloud Run, SIWC bị tắt. Khi cờ được bật trong môi trường local, máy chủ chỉ bind `127.0.0.1`; endpoint xác thực và gửi nội dung kiểm tra Origin/Host local.

## Dữ liệu và thông tin đăng nhập

- Lời gọi ChatGPT chạy trong tiến trình Node local bằng SDK của OpenAI. Access token và refresh token không đi vào React, localStorage, API response, log hay telemetry.
- Phiên được lưu dưới `%LOCALAPPDATA%\DocForm30\SIWC` và mã hóa bằng Windows DPAPI theo tài khoản Windows hiện tại. Nút ngắt kết nối xóa credential local và yêu cầu SDK thu hồi phiên từ xa.
- Rà soát phân vùng gửi văn bản đã chuẩn hóa của các khối và chữ trong ô bảng cùng ID/tọa độ nguồn; không gửi tệp DOCX, tên tệp, HTML/XML hoặc role phân vùng do parser gán.
- Rà soát tài liệu gửi tối đa 15.000 ký tự văn bản cùng danh mục khối (ID, loại, role, style, cấu trúc bảng và tối đa 300 ký tự/khối; danh mục trong prompt giới hạn 20.000 ký tự). Tinh chỉnh gửi tối đa 15.000 ký tự HTML của đoạn đang chọn. Hai thao tác này không gửi byte tệp hoặc tên tệp tới OpenAI.
- Yêu cầu Responses đặt `store: false`. Kết quả chỉ trở thành đề xuất có nguồn `chatgpt_ai`; người dùng vẫn phải rà soát và duyệt. ChatGPT lỗi không tự chuyển sang Gemini; quy tắc nội bộ vẫn hoạt động.
- Đồng ý chia sẻ được tắt lại khi chọn tệp nguồn mới và khi đổi provider. Người dùng cần bật lại cho mỗi tệp.

## Giấy phép

SDK được vendored từ [OpenAI Sign in with ChatGPT DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit) tại commit `0a36fefeb913055c8c7a1a29b63d82b96b2e841a`; giấy phép đi kèm là **Noncommercial License v1.0**. Phạm vi tích hợp hiện tại chỉ dành cho sử dụng cá nhân/local phi thương mại. Giấy phép loại trừ việc phát triển, vận hành hoặc phân phối cho doanh nghiệp, người sử dụng lao động hay khách hàng vì lợi ích thương mại; trường hợp đó cần quyền bằng văn bản riêng.

Tích hợp này không cấu hình API key OpenAI và không phải Platform API billing. Điều kiện tài khoản, quyền chia sẻ và giới hạn sử dụng vẫn do ChatGPT quyết định.

## Giới hạn nghiệm thu

Chưa thực hiện đăng nhập tài khoản thật hoặc kiểm tra luồng OAuth/refresh với OpenAI trong phiên này. Một [issue đang mở trên DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit/issues/5) ghi nhận `invalid_grant` khi refresh token, nên có khả năng phải kết nối lại sau khi access token hết hạn; chưa xác minh ảnh hưởng trên máy/tài khoản này. Để nghiệm thu, cần bật cờ local, đăng nhập bằng trình duyệt, rà soát một tệp thử không nhạy cảm ở cả ba thao tác, xác nhận đề xuất chưa tự áp dụng, rồi ngắt kết nối và xác nhận không còn phiên local. Kiểm tra native ONLYOFFICE là cổng riêng và chưa thuộc phần này.

## Ma trận năng lực hiện tại theo provider

`/api/ai/full-document-capability` trả trạng thái riêng cho Gemini API và ChatGPT plan. Trạng thái `SUPPORTED_BY_ADAPTER` chỉ nói rằng adapter có thể nhận nội dung văn bản; không có nghĩa manifest đầy đủ đã được gửi hoặc mọi đoạn đã được AI phản hồi. `configured` chỉ phản ánh khóa Gemini có mặt trong cấu hình máy chủ hoặc ChatGPT đang kết nối/chia sẻ; đây không phải kiểm tra API thành công.

- **Gemini API:** DocForm có tích hợp `@google/genai` phía máy chủ cho sinh văn bản, dùng `GEMINI_API_KEY`. Tình trạng khóa chỉ được báo có/không; khóa không được trả về giao diện. Endpoint cùng UI rà soát manifest toàn văn đã được nối; chưa có provider request thật trong lượt triển khai này. DOCX transfer, provider read, code read và visual review vẫn `NOT_VERIFIED`. Tier dữ liệu luôn `unknown` đến khi người dùng xác minh dự án Google gắn với khóa.
- **ChatGPT plan:** SIWC `streamResponse` nhận văn bản. Endpoint toàn văn có thể gửi manifest text theo chunk qua adapter này, nhưng file transfer, provider file read, code/OOXML và visual input vẫn `BLOCKED_BY_PROVIDER`.
- **Đồng ý:** lựa chọn provider trong Cài đặt chung không tự gửi dữ liệu. Đồng ý hiện hữu vẫn riêng theo từng tệp và thao tác; nó không được lưu cùng provider preference.

Google mô tả khả năng xem PDF bằng nội dung chữ và hình ảnh; tệp không phải PDF được xử lý như văn bản nên mất ngữ cảnh trình bày. DocForm hiện chưa nối luồng PDF đó. Gemini File Search là truy xuất theo đoạn, không chứng minh đã rà đủ toàn văn; Code Execution là Python hosted và không thay thế parser OOXML local.

## Đọc nguyên DOCX và trang PDF bằng ChatGPT plan

**Trạng thái hiện tại: `BLOCKED_BY_PROVIDER`** trên đường SIWC/DevKit được chọn. `@siwc/local` hiện cung cấp `streamResponse` cho thông điệp văn bản; kiểu đầu vào dùng `string` và mỗi `content` là chuỗi. SDK vendored kiểm tra điều đó trước khi gửi yêu cầu. Không có giao diện đã được tài liệu hóa trong adapter hiện hành để gửi DOCX/PDF/trang ảnh hoặc gọi công cụ đọc cấu trúc.

Các khả năng `original_file_transfer`, `provider_file_read`, `code_read` và `all_page_visual_review` đều bị chặn bởi transport hiện tại. Tài khoản OAuth cụ thể chưa được probe trong phiên này (`NOT_VERIFIED`); không có tệp nào được gửi. Kết quả này dựa trên [mã transport SIWC chính thức](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/local/src/responses.ts) và [hướng dẫn SIWC chính thức](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt), trong đó mẫu dùng `streamResponse` với văn bản để viết lại nội dung. Tài liệu chung của Responses API không được dùng để suy ra quyền file input của kết nối plan/OAuth.

DocForm không gửi byte DOCX, PDF hay ảnh trang theo đường này, và không hiển thị “AI đã đọc nguyên tệp”. Rà soát phân vùng văn bản hiện tại vẫn là thao tác riêng. Việc dựng PDF/ảnh local từ đúng SHA nguồn, nếu renderer khả dụng, chỉ chứng minh rendition local; nó không chứng minh nhà cung cấp AI đã nhận hoặc xem các trang.
## Rà soát toàn văn đã trích xuất

Luồng rà soát toàn văn đã trích xuất dùng endpoint riêng POST /api/ai/review-full-text. Endpoint chỉ nhận manifest text đã trích xuất cùng anchors, package-part inventory, danh sách phần bị loại và SHA nguồn; nó từ chối các trường ngoài schema như DOCX bytes. Đây là đường text-only: không gửi DOCX/PDF/ảnh trang và không xác nhận đã xem bố cục trực quan.

Trong Bước 1, người dùng lập danh mục văn bản trên máy, xem chính xác package part được gồm/bị loại, chọn provider trong Cài đặt chung, bật consent riêng theo tệp và nhấn gửi. Consent trong bộ nhớ phiên được buộc vào provider, source SHA, source generation và manifest SHA; mặc định consent tắt lại sau khi tải trang. Server kiểm tra lại consent, SHA từng đoạn, manifest fingerprint và việc mọi segment xuất hiện đúng một lần trong package-part inventory. Phản hồi NDJSON báo từng chunk, tổng hợp liên đoạn riêng và kết quả cuối; mỗi đoạn phải có trạng thái reviewed, no_finding hoặc unsupported. Thiếu hoặc sai phản hồi làm coverage partial. Tổng hợp chỉ dùng observations đã kiểm tra và không lấp được segment bị thiếu.

Mỗi chunk dùng ngân sách 6000 estimated tokens, dành 1200 cho prompt. Ước lượng bảo thủ dùng hai byte UTF-8 cho mỗi token; đây không phải phép đếm token của model. Khi provider báo context overflow, chunk được chia đôi và gửi lại cùng provider, không cắt ngắn nội dung. Segment đơn quá lớn bị báo preflight failure. Payload toàn request bị giới hạn 9 MiB. Endpoint không sửa endpoint rà soát phân vùng hoặc cap 15.000 ký tự của luồng rà soát cũ.

Gemini dùng tích hợp server-side hiện có; ChatGPT plan dùng SIWC streamResponse hiện có. Từng run khóa vào provider được chọn, không tự chuyển provider. Giao diện hiển thị provider đã dùng, phạm vi trích xuất, phần gửi/có phản hồi, coverage theo chunk, hủy và thử lại riêng các đoạn lỗi. DocForm chỉ lưu vào draft các quan sát ngữ nghĩa đã căn chỉnh cùng coverage và dấu vết nguồn; không lưu manifest thô hoặc consent. Endpoint không lưu manifest hay văn bản vào store; quy định lưu giữ phía provider phụ thuộc provider và chưa được xác minh trong tác vụ này. Chưa gửi tài liệu thật hoặc gọi provider thật.
