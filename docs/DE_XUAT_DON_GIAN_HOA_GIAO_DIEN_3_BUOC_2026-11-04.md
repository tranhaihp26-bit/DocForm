# Đề xuất đơn giản hóa giao diện 3 bước DocForm

Ngày khảo sát: 04/11/2026. Checkout: `bd2aac5`; `git status --short` rỗng trước khảo sát. Phạm vi: giao diện desktop của luồng nhập DOCX/TXT, dựa trên ảnh người dùng cung cấp, ứng dụng đang chạy tại `localhost:5050` và mã hiện hành. Đây là đề xuất UX, chưa phải thay đổi sản phẩm hoặc nghiệm thu thể thức.

## Mục tiêu

Người dùng chỉ muốn nhận một tệp Word đã được trình bày đúng thể thức. Màn hình chính nên trả lời lần lượt ba câu hỏi: **Tệp nào? Còn việc gì cần xác nhận/sửa? Có thể tải bản cuối chưa?** Giữ wizard 3 bước và mọi cổng bảo vệ nguồn, nhưng giảm lựa chọn và thông tin kỹ thuật xuất hiện mặc định.

## Quan sát hiện trạng

| Bước | Người dùng hiện thấy | Khó khăn với nhu cầu lấy tệp cuối |
| --- | --- | --- |
| 1. Tải & nhận diện | Bốn bước con, tùy chọn AI, thống kê bảng/khối, cảnh báo đối chiếu, xem nhanh, cửa sổ rà soát nguồn, quyết định hệ/loại/mẫu. | Sau khi tải tệp vẫn phải đi qua nhiều màn hình. Các số liệu parser và tên thao tác “phân vùng” không cho biết cần làm gì để có tệp đúng. |
| 2. Soạn & kiểm tra | Chín nhóm thể thức, Body/Canvas, thanh định dạng, phụ lục, thanh bên AI/kiểm tra. | Vùng sửa và công cụ chiếm ưu tiên hơn các trường còn thiếu; thanh bên mặc định mở AI dù mục tiêu là chuẩn hóa thể thức. |
| 3. Xem & xuất | Bản xem, ba cổng kiểm tra, báo cáo thể thức, cảnh báo xuất, SHA/revision, các nút tải/in và bản gốc. | Nhiều lớp trạng thái lặp lại. Người dùng có thể thấy “2 bước đã hoàn thành” nhưng bản cuối vẫn chưa tải được. |

Trong phiên đang mở, Bước 1 báo 2 phần cần đối chiếu; Bước 2 cho thấy số ký hiệu và ngày ban hành còn thiếu; Bước 3 chỉ cho tải bản đối chiếu chưa xác nhận. Đây là ví dụ về sự khác nhau giữa **đã đi qua bước** và **đã có tệp cuối đủ điều kiện**. Bản xem Bước 3 ghi 0 bảng trong khi Bước 1 ghi 2 bảng nguồn; cần kiểm tra ý nghĩa của hai chỉ số trước khi dùng chúng trong tóm tắt cho người dùng, không kết luận mất bảng chỉ từ giao diện.

## Luồng đề xuất

### 1. Tải tài liệu

- Vùng chính: một ô kéo thả/chọn DOCX hoặc TXT; sau tải chỉ hiện tên tệp và trạng thái “Đã đọc”.
- Khi không có vấn đề: một thẻ tóm tắt **“Đã nhận diện: [hệ thể thức] · [loại văn bản] · [mẫu cơ quan]”** và nút **“Tiếp tục”**. Bỏ màn hình “Xem nhận diện” và “Sẵn sàng soạn” riêng khỏi đường đi mặc định.
- Khi thiếu/mâu thuẫn: mở đúng các câu hỏi phải trả lời, dùng ngôn ngữ của văn bản: **“Văn bản này thuộc hệ nào?”**, **“Dùng phần đầu của cơ quan nào?”**, **“Loại văn bản là gì?”**; hiển thị bằng chứng nguồn cạnh lựa chọn. Không tự chọn khi bằng chứng mâu thuẫn.
- Cảnh báo về phần không hỗ trợ phải ở gần nút tiếp tục: **“Có 2 phần cần so với tệp gốc trước khi xuất”** + **“Xem 2 phần”**. Trong màn hình đối chiếu, chỉ hiện các phần cần quyết định trước; cho mở toàn bộ nguồn khi cần. Việc duyệt nguồn vẫn là thao tác chủ động, gắn với đúng tệp/fingerprint.
- Đưa thống kê số khối, chi tiết parser, nguồn AI và tùy chọn AI vào **“Tùy chọn và chi tiết”**. Nếu bật AI, vẫn phải hiển thị rõ văn bản trích xuất nào được gửi, tới provider nào, cho đúng thao tác và yêu cầu đồng ý riêng theo tệp.

### 2. Hoàn thiện văn bản

- Đặt bản soạn ở giữa. Trên đầu là thanh **“Còn N việc cần kiểm tra”**; mỗi mục mở đúng trường hoặc đoạn nguồn liên quan. Mục được nhóm theo **cần bổ sung**, **cần đối chiếu**, **gợi ý**. Không trộn cảnh báo thể thức với cổng toàn vẹn DOCX.
- Mặc định thu gọn các nhóm đã có dữ liệu. Giữ các nhóm cần sửa mở hoặc đánh dấu trực tiếp trên bản soạn. Chỉ hiển thị phụ lục khi có phụ lục hoặc khi người dùng chọn “Thêm phụ lục”.
- Đổi các nhãn hiển thị như “Body”, “Canvas”, “revision”, “Nhóm 01–05” thành **“Nội dung”**, **“Bản soạn”**, **“Phiên bản”**, hoặc ẩn trong chi tiết. Tên nhóm pháp lý vẫn có trong báo cáo chuyên sâu.
- Thanh bên mặc định là **“Việc cần xử lý”**. Chuyển AI và công cụ định dạng nâng cao vào thao tác mở theo nhu cầu; không tự chạy AI, không áp dụng gợi ý khi chưa duyệt.
- Nút nổi bật: **“Xem bản Word”**. Nếu còn việc có ảnh hưởng đến tệp cuối, cho xem bản nháp nhưng nêu rõ trạng thái; không gọi bước 2 “Đã hoàn thành” chỉ vì có thể chuyển tiếp.

### 3. Xem và tải Word

- Bản xem dùng cùng byte DOCX hiện hành với tải/in. Bên phải là một thẻ trạng thái và một hành động chính.
- **Đủ điều kiện xuất:** **“Có thể tải bản Word”** + nút **“Tải Word (.docx)”**. Nút in/PDF tham khảo là tác vụ phụ; vẫn nhắc kiểm tra phân trang trong Word trước khi phát hành.
- **Cần xử lý:** **“Chưa thể tải bản Word hoàn chỉnh”** + danh sách vấn đề có nút **“Sửa mục này”** hoặc **“Đối chiếu nguồn”**. Nếu cổng chỉ cho tải bản chẩn đoán, đặt trong **“Tải bản để kiểm tra trong Word”**, kèm nhãn **“Chưa xác nhận, không dùng phát hành”**; không đặt ngang hàng với nút tải bản cuối.
- **Không dựng được bản an toàn:** chỉ cho xem lý do và đường quay lại sửa/đối chiếu; giữ quyền tải tệp gốc nguyên vẹn khi có nguồn.
- Gộp ba cổng kiểm tra thành một dòng trạng thái dễ hiểu; bảng chi tiết, SHA-256 và revision ở **“Chi tiết kiểm tra”**. Chỉ số “7/9 mục đạt” không được diễn đạt thành khẳng định văn bản đã chuẩn khi còn mục chưa đánh giá hoặc cần xem lại.

## Thứ tự ưu tiên triển khai

1. **P0 — Trạng thái và hành động:** thống nhất một danh sách việc cần xử lý từ Bước 1 đến Bước 3; liên kết từng việc đến đúng vị trí; phân biệt rõ bản cuối với bản đối chiếu. Đây là thay đổi có tác động lớn nhất cho người dùng hiện tại.
2. **P1 — Giảm thao tác:** gộp các màn hình con của Bước 1 khi nhận diện rõ; chỉ yêu cầu xác nhận phần thiếu/mâu thuẫn và duyệt nguồn. Không bỏ quyết định hệ/loại/mẫu hoặc cổng phân vùng.
3. **P1 — Giảm tải thị giác:** ở Bước 2 thu gọn nhóm đã ổn, ưu tiên mục cần sửa; ở Bước 3 chỉ hiện một trạng thái và một nút chính. Thông tin kỹ thuật để trong phần mở rộng.
4. **P2 — Tinh chỉnh câu chữ và bố cục:** thống nhất các nhãn “tài liệu”, “bản soạn”, “bản Word”, “bản đối chiếu”; kiểm tra bàn phím, focus, cuộn và màn desktop trước các viewport khác.

## Điều kiện nghiệm thu UX

- Với một tệp không có vấn đề: người dùng có thể đi từ tải tệp đến bản xem và tải DOCX bằng một hành động chính rõ ràng trên mỗi bước; không phải mở mục kỹ thuật.
- Với nguồn mâu thuẫn/không hỗ trợ: giao diện nêu chính xác phần cần xem và không cho quyết định im lặng; sau khi xử lý, trạng thái cập nhật trên cả 3 bước.
- Với thiếu số ký hiệu/ngày hoặc mục thể thức khác: nêu rõ **thiếu gì**, **ở đâu**, **có chặn bản cuối hay không** theo cổng thực tế; không tự điền ngày, người ký hay chữ ký.
- Với ứng viên không an toàn: nút tải chính thức và in vẫn khóa; bản đối chiếu có nhãn khác biệt rõ; thay đổi bản soạn làm vô hiệu ứng viên cũ.
- Kiểm tra desktop bằng thao tác chuột, bàn phím và cuộn; đối chiếu DOCX trong LibreOffice và Microsoft Word bằng cùng mẫu trước khi khẳng định tương thích bố cục. Báo cáo thể thức không tự thay cho duyệt pháp lý/phát hành.

## Điểm bắt đầu trong mã hiện hành

Điều hướng và trạng thái: [`../src/App.tsx`](../src/App.tsx). Bước 1: [`../src/components/ImportStepView.tsx`](../src/components/ImportStepView.tsx). Bước 2: [`../src/components/WorkspaceEditor.tsx`](../src/components/WorkspaceEditor.tsx). Bước 3: [`../src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx). Các bất biến và test liên quan: [`CODEBASE_MAP.md`](CODEBASE_MAP.md), mục 7 và 9. Chưa sửa mã hoặc chạy kiểm thử; đề xuất cần được kiểm chứng qua prototype desktop và ca tài liệu thật trước khi triển khai.
