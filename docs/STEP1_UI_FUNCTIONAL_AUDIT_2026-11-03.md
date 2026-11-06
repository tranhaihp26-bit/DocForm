# Audit giao diện và chức năng Bước 1 DocForm — 03/11/2026

## Kết luận

Bước 1 đã có luồng nhập hoặc tạo tài liệu, nhận diện, chọn hệ thể thức và duyệt phân vùng trước khi vào Studio. Các cổng bảo vệ quan trọng hoạt động trong những kịch bản đã thử: hệ chưa đủ chứng cứ yêu cầu người dùng xác nhận; sửa phân vùng thủ công hủy yêu cầu AI đang chờ; nguồn TXT giữ nguyên dòng trống và thụt đầu dòng; AI mặc định tắt và không gửi nguồn khi chưa có đồng ý.

**Đánh giá UX: NEEDS_REVIEW.** Trải nghiệm desktop hiện có thể tiếp tục dùng thử, nhưng còn thuật ngữ kỹ thuật lộ ra, cách trình bày số 0 và trạng thái thiếu/cần xác nhận dễ gây bối rối cho cán bộ văn phòng. Đây là đánh giá trên fixture tổng hợp, chưa phải nghiệm thu với người dùng cuối hay nhiều tài liệu thực tế.

Theo hướng dẫn dự án được bổ sung trong [AGENTS.md](../AGENTS.md), desktop/PC là mục tiêu hoàn thiện và nghiệm thu trước. Các quan sát ở màn hình hẹp bên dưới chỉ là thông tin để làm sau khi luồng desktop đạt yêu cầu.

## 1. Phạm vi và cách kiểm chứng

- Repository: D:/DocForm, nhánh main, HEAD fe854c6. Checkout có thay đổi local từ trước; audit giữ nguyên các thay đổi đó.
- Bản đang chạy: http://127.0.0.1:5050/; listener là 127.0.0.1:5050, PID 13984, phản hồi HTTP 200 tại thời điểm kiểm tra.
- Giao diện được thao tác trong trình duyệt tích hợp, dùng hồ sơ và tài liệu tổng hợp docform-step1-alternate-synthetic.docx. Không dùng tài liệu thật, không bật consent, không gửi nội dung tới Gemini/ChatGPT, không sửa nội dung tài liệu.
- Đã đi qua chọn nguồn hiện có, màn hình nhận diện, thông tin hệ thể thức, hộp thoại đối chiếu/phân vùng, xem trước gói gửi AI mà không gửi, và nhánh tạo văn bản đến màn hình chọn mẫu. Không bấm tạo/lưu văn bản mới.
- Đã khảo sát bố cục ở các chiều rộng CSS 900, 720 và 600 px. Đây không phải phép đo thu phóng Chrome 125%/150%; thu phóng thực tế NOT_EVALUATED.

### Test trình duyệt chạy lại độc lập trong lượt audit

| Lệnh | Kết quả | Giới hạn |
|---|---|---|
| npx tsx test/import-source-warning-browser.test.ts | PASS, 1/1 | Cảnh báo wrapper nguồn lạ và thao tác xem nhanh bằng bàn phím trên fixture. |
| npx tsx test/import-partition-abort-browser.test.ts | PASS, 1/1 | Sửa phân vùng thủ công hủy yêu cầu AI đang chờ. |
| npx tsx test/txt-import-browser.test.ts | PASS, 1/1 | Giữ nội dung, dòng trống và thụt đầu dòng TXT. |
| npx tsx test/uiux-accessibility-browser.test.ts | PASS, 1/1 | Một kịch bản Chromium về hộp thoại, bàn phím, tương phản và focus; không chứng minh toàn bộ quy trình dễ dùng. |
| npx tsx test/stage2-regime-confirmation-browser.test.ts | PASS, 1/1 | Hồ sơ Chromium sạch: nguồn mâu thuẫn/thiếu chứng cứ phải xác nhận; xác nhận hệ Đảng được giữ đúng HD05. |

> Năm test trên xác nhận đúng các hành vi trong kịch bản tổng hợp của chúng. Sau đó, toàn bộ test:regression, lint và build đã được chạy lại độc lập trong lượt audit này và đều exit 0. Build có cảnh báo bundle JavaScript lớn hơn 500 kB và node:crypto được externalize cho browser; đây không phải lỗi build nhưng cần được theo dõi.

## 2. Theo dõi luồng desktop Bước 1

### A. Chọn cách bắt đầu

Màn hình có ba lựa chọn dễ nhận biết: tiếp tục hồ sơ hiện tại, tải tài liệu có sẵn, hoặc tạo văn bản mới. Thanh quy trình bên trái cho thấy Bước 1/3 và các bước sau; tiến độ con của Bước 1 có bốn chặng. Cách chia hai cấp tiến độ phù hợp với luồng dài, nhưng cần giữ nhãn “tiến trình trong Bước 1” dễ thấy để người dùng không hiểu nhầm đây là bảy bước nối tiếp.

### B. Tải và đọc DOCX/TXT

Màn hình tải giải thích rằng DocForm đọc nội dung và cho duyệt trước khi soạn; chỉ nhận .docx và .txt. Tệp đã đọc có tên, trạng thái, nút tải bản gốc và thay tệp. Thống kê số bảng/phụ lục/khối giúp người dùng biết hệ thống đã đọc gì. Xem nhanh nguồn và tùy chọn AI mặc định thu gọn — đây là lựa chọn tốt cho người ít kinh nghiệm.

Với fixture DOCX đang mở, giao diện cảnh báo có một phần cần đối chiếu với tệp gốc và chỉ rõ alternate_content ở chi tiết. Cảnh báo tổng thể hữu ích, nhưng mã alternate_content là tên nội bộ; nên thay bằng cách giải thích tiếng Việt về nội dung có thể không hiển thị hoặc không xuất nguyên vẹn, giữ mã trong phần kỹ thuật dành cho hỗ trợ.

Xem nhanh nguồn nêu rõ phạm vi chỉ là phần thân, không gồm tiêu đề, nơi nhận hay chữ ký. Cách giới hạn phạm vi này giúp tránh tạo cảm giác đây là bản xem toàn bộ trang Word.

### C. Kết quả nhận diện

Màn hình liệt kê 9 nhóm thành phần và phân biệt “Đã nhận diện”, “Chưa tìm thấy”, “Chưa xác minh”, “Cần xác nhận”. Trên tài liệu tổng hợp, hai nhóm có dữ liệu, bảy nhóm chưa tìm thấy; số nhóm cần xác nhận là 0. Thiếu dữ liệu không bị tự điền thành thông tin giả — đây là hành vi đúng.

Ba ô đếm không có dữ liệu hiển thị 00 thay vì 0 tại phần phụ lục, nhóm cần xác nhận và bảng. Mã giao diện dùng padStart(2, "0") ở [ImportStepView.tsx](../src/components/ImportStepView.tsx#L1126). Cách viết này giống mã hoặc số thứ tự, không giống số lượng thông thường.

Chỉ số “nhóm cần xác nhận: 0” cùng lúc với bảy nhóm “chưa tìm thấy” là hợp lý theo hai trạng thái khác nhau, nhưng dễ bị đọc thành “không còn gì phải xử lý”. Nên hiển thị riêng ba nhóm số: đã nhận diện, chưa tìm thấy/chưa xác minh, và đang chờ người dùng xác nhận; đồng thời giải thích “thiếu dữ liệu” không đồng nghĩa lỗi parser hay đã hoàn tất văn bản.

### D. Hệ thể thức và loại văn bản

Thông tin chứng cứ được đặt trong phần thu gọn; gồm hệ người dùng chọn, hệ nguồn gợi ý, hệ đã xác nhận và căn cứ trích từ nguồn. Đây là cách giữ phần chính gọn và vẫn cho phép kiểm tra.

Trong phiên tổng hợp đã lưu, giao diện đồng thời cho thấy hệ người dùng chọn là Văn bản Đảng, nguồn chưa đủ chứng cứ, còn hệ đã xác nhận là Hành chính do người dùng xác nhận. Đây là trạng thái phiên cụ thể, không phải lỗi đã tái hiện trên hồ sơ mới. Test hồ sơ Chromium sạch stage2-regime-confirmation đạt: khi nguồn thiếu/mâu thuẫn, ứng dụng yêu cầu xác nhận và khi xác nhận Đảng thì giữ đúng HD05. Tuy vậy, khi ba dòng trạng thái không trùng nhau, cần có câu cảnh báo ngắn, dễ hiểu nêu rõ “hệ đã xác nhận khác lựa chọn hiện tại” và yêu cầu giải quyết trước khi tiếp tục; trạng thái dữ liệu cũ cần được kiểm tra thêm để loại trừ hiển thị gây hiểu nhầm.

### E. Đối chiếu và phân vùng nguồn

Hộp thoại chia hai cột: khối nguồn và vùng đích ở bên trái, kết quả phân bố thành phần thể thức bên phải. Có bộ lọc tất cả/thân bài/khối ký/chưa phân loại, từng khối có danh sách vùng đích, và có thể xem lại nội dung gốc. Thanh cuối cố định cho phép hủy hoặc xác nhận chuyển vào Studio.

Giao diện nêu “AI đang tắt; nguồn không được gửi.” Checkbox consent ban đầu bỏ chọn. Phần xem trước gửi AI cho biết loại và lượng nội dung sẽ gửi; người dùng có thể xem trước mà không gửi. Nút rà soát AI bị khóa đến khi có consent. Không có yêu cầu AI nào được gửi trong audit.

Phần kết quả cũng giải thích rằng “0 khối chưa phân loại” chỉ xác nhận mỗi khối đã có vùng lưu giữ, không xác nhận vai trò đúng hay bản xuất đạt chuẩn. Đây là cảnh báo quan trọng và được diễn đạt đúng ranh giới.

### F. Rà soát ngữ nghĩa và cảnh báo kỹ thuật

Khi mở phần rà soát sâu, tiêu đề một số mục hiện nguyên mã tiếng Anh như media_unsupported và section_heading, kèm “Body”. Mã này được render trực tiếp từ row.label trong [ImportStepView.tsx](../src/components/ImportStepView.tsx#L829). Với cán bộ không rành kỹ thuật, nhãn không cho biết họ cần làm gì hay ảnh hưởng đến bản xuất ra sao. Nên dùng nhãn tiếng Việt như “Nội dung hình ảnh/bảng chưa được hỗ trợ” hoặc “Tiêu đề mục”, kèm một câu giải thích và thao tác tiếp theo; chỉ để enum trong chi tiết kỹ thuật.

Trạng thái “Chưa hỗ trợ” và câu hướng dẫn người dùng xem trích đoạn rồi xác nhận/từ chối là thận trọng. Không nên tự áp dụng phân loại hay quy tắc khi người dùng chưa quyết định.

### G. Đối chiếu bố cục trang nguồn

Nút “Xem bố cục trang gốc” được thử với fixture DOCX. Trạng thái sau thao tác là “Chưa dựng đủ trang để đối chiếu.” Ở trạng thái này giao diện chưa đưa ra ngay lý do cụ thể hoặc hành động dễ hiểu kế tiếp. Mã có chỗ hiển thị reason và thông tin renderer trong phần chi tiết, nhưng lý do không xuất hiện trên trạng thái tổng quát ở [ImportStepView.tsx](../src/components/ImportStepView.tsx#L412). Đây mới là kết quả của một fixture; chưa kết luận bộ dựng hình bị lỗi trên mọi DOCX. Cần đưa lý do và cách xử lý gần thông báo trạng thái, ví dụ tải lại bản gốc hoặc tiếp tục bằng cách đối chiếu thủ công.

### H. Nhánh tạo văn bản mới

Nhánh tạo mới tách bạch Hành chính và Văn bản Đảng, sau đó chọn loại văn bản, cơ quan/profile và mẫu hoặc văn bản trắng. Mô tả văn bản trắng nói rõ hệ thống chỉ đặt thể thức/loại văn bản, để trống nội dung và thông tin người ký/số hiệu cho người dùng — phù hợp nguyên tắc không tự bịa dữ kiện. Audit dừng tại màn hình chọn mẫu; thao tác chọn mẫu và tạo/lưu cuối cùng NOT_EVALUATED để tránh tạo thêm hồ sơ thử không cần thiết.

## 3. Phát hiện và mức ưu tiên

| ID | Mức / trạng thái | Bằng chứng và tác động | Đề xuất |
|---|---|---|---|
| S1-01 | P2 · CONFIRMED | Số lượng 0 hiển thị 00 ở ba ô nhận diện. Có thể khiến cán bộ tưởng đây là mã/trạng thái. | Hiển thị 0; chỉ dùng số 0 đệm cho mã thứ tự nếu cần. |
| S1-02 | P2 · CONFIRMED | “0 nhóm cần xác nhận” xuất hiện cùng bảy nhóm chưa tìm thấy. Hai nghĩa khác nhau nhưng phần tóm tắt dễ làm người dùng nghĩ đã hoàn tất. | Tách nhãn “chưa tìm thấy/chưa xác minh” và “đang chờ xác nhận”; đưa thiếu dữ liệu lên tóm tắt chính. |
| S1-03 | P2 · CONFIRMED | alternate_content, media_unsupported, section_heading hiện cho người dùng ở phần chi tiết. | Việt hóa nhãn; mô tả hệ quả và hành động; giữ enum ở phần dành cho hỗ trợ. |
| S1-04 | P2 · NEEDS_REVIEW | Phiên tổng hợp đã lưu có hệ chọn, hệ gợi ý và hệ xác nhận khác nhau. Hồ sơ sạch qua test xác nhận gate đúng, nên chưa xem đây là lỗi logic tổng quát. | Thêm cảnh báo không kỹ thuật khi các hệ không trùng; tái hiện với hồ sơ sạch và hồ sơ cũ trước khi kết luận lỗi. |
| S1-05 | P2 · NEEDS_REVIEW | Fixture cho trạng thái “Chưa dựng đủ trang để đối chiếu”; lý do/hành động chưa nổi bật ở thông báo chính. | Cho biết lý do ngay cạnh trạng thái; nêu bước tiếp theo, không buộc người dùng tìm phần kỹ thuật. Kiểm tra trên nhiều mẫu DOCX. |
| S1-06 | P3 · FOLLOW_UP_AFTER_DESKTOP | Ở viewport 900/720/600 px, thanh điều hướng quy trình chuyển lên trên nội dung; ở 600 px làm phần làm việc chính phải cuộn qua nhiều khối. Không thấy tràn ngang; tab một cột và footer cố định của hộp thoại vẫn thao tác được. | Chỉ tối ưu tablet/mobile sau khi nghiệm thu desktop theo quy tắc mới trong AGENTS.md. Khi tới giai đoạn đó, cân nhắc thu gọn điều hướng và ưu tiên nội dung/chính CTA trên màn hình đầu. |

## 4. Đối chiếu riêng kết quả Anti

- **Đã xác nhận độc lập:** server ở 127.0.0.1:5050 trả HTTP 200; test:regression đạt 73 ca; lint đạt; build thành công; test bảo mật server đạt 4/4; test candidate đạt 19/19; test trình duyệt preview/in/tải bản gốc đạt 1/1; năm test Bước 1 nêu trên đều đạt. Báo cáo Anti đặt UX Bước 1 là NEEDS_REVIEW — mức đánh giá này vẫn phù hợp sau audit.
- **Chưa xác nhận độc lập:** A1 trên DOCX mẫu thực tế được Anti nêu trong báo cáo, hiển thị của DOCX xuất trong Microsoft Word, provider AI thật và nghiệm thu UX với cán bộ văn phòng. Kết quả test/fixture không thay thế các kiểm tra đó.
- **Điểm cần chỉnh trong mô tả F2 của báo cáo:** công thức trong báo cáo viết downloadable bao gồm isCurrent; getter [exportCandidate.ts](../src/utils/exportCandidate.ts#L146) chỉ kiểm tra byte/XML và safe. Tính hiện hành được kiểm tra ở lớp khác: candidate cũ bị loại khỏi visibleCandidate, và handler tải/in gọi isCurrent trước khi xuất [App.tsx](../src/App.tsx#L1820). Vì vậy, gate thao tác hiện được mã bảo vệ, nhưng công thức nên gọi đó là **điều kiện đủ để thao tác xuất** (downloadable + isCurrent), không phải định nghĩa riêng của thuộc tính downloadable.

## 5. Việc cần làm tiếp theo

1. Ưu tiên desktop/PC: sửa 00, làm rõ các số liệu nhận diện, Việt hóa nhãn kỹ thuật và xử lý lời nhắc khi hệ thể thức chưa thống nhất.
2. Nâng thông báo đối chiếu bố cục nguồn thành hướng dẫn có lý do và bước tiếp theo; xác nhận trên nhiều DOCX tổng hợp gồm bảng, ảnh, nhiều section và phụ lục.
3. Kiểm thử các tình huống tải tệp sai loại, thay tệp, hủy thay tệp, lỗi parser và bảo toàn nguồn cũ; hoàn tất nhánh tạo mới.
4. Mời cán bộ văn phòng hành chính thao tác trên desktop, ghi nhận nơi họ dừng/hỏi lại và cập nhật câu chữ trước khi đóng NEEDS_REVIEW.
5. Sau khi desktop được nghiệm thu, mới tối ưu các viewport khác và kiểm tra thu phóng Chrome 125%/150%.

**Không kết luận:** Bước 1 đã hoàn thiện UX; mọi DOCX đều được đọc nguyên vẹn; nguồn/luồng AI thật đã được kiểm thử; hoặc sản phẩm sẵn sàng phát hành. Audit này là đánh giá giao diện và chức năng trên một fixture tổng hợp cùng các test tự động có phạm vi nêu trên.
