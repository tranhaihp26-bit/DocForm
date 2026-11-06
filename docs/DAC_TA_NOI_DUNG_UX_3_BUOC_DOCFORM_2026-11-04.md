# > **Điều khoản bổ sung có hiệu lực cho DocForm V2.2 (06/11/2026):** Chính sách [Product First — Profile override theo từng thuộc tính](DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md) được ưu tiên khi áp/QA định dạng. Profile Công ty đã thiết lập thông số thì chỉ dùng/kiểm giá trị profile; ND30/HD05 chỉ fallback cho trường chưa được thiết lập. Văn bản UX ngày 04/11 giữ nguyên lịch sử mô tả tương tác; không dùng ngôn ngữ cũ về "đủ chuẩn/ban hành" để thay thế chính sách V2.2.

Đặc tả nội dung giao diện DocForm — luồng 3 bước để nhận bản Word

**Ngày soạn:** 04/11/2026\
**Checkout tham chiếu:** `bd2aac5`\
**Trạng thái:** ĐẶC TẢ ĐỀ XUẤT để duyệt thiết kế; các hành vi mới chưa được coi là đã triển khai hoặc nghiệm thu\
**Phạm vi:** giao diện desktop cho hai cách bắt đầu: nhập DOCX/TXT và tạo văn bản mới. Tối ưu trước cho người dùng văn phòng chỉ muốn nhận DOCX đã được trình bày đúng thể thức trong phạm vi các kiểm tra thực hiện được.

Tài liệu này là hợp đồng nội dung và tương tác để thiết kế, triển khai và thử nghiệm. Căn cứ khảo sát: [phương án UX ưu tiên](PHUONG_AN_TOI_UU_UX_DOCFORM_2026-11-04.md), [đánh giá đề xuất Anti](DANH_GIA_DE_XUAT_ANTI_UX_2026-11-04.md), [thẩm định hai bản đánh giá](THAM_DINH_HAI_BAN_DANH_GIA_UX_2026-11-04.md), [Codebase Map](CODEBASE_MAP.md) mục 5, 7–9. Các câu ví dụ bên dưới dùng dữ liệu tổng hợp, không phải thông tin cần điền vào văn bản thật. Chữ **PHẢI** là điều kiện nghiệm thu thiết kế/triển khai; **NÊN** là ưu tiên UX cần kiểm tra qua thử nghiệm; **HIỆN CÓ** chỉ mô tả mã tại checkout tham chiếu, chưa xác nhận bằng test ở lượt soạn này.

### Quyết định sản phẩm làm nền cho đặc tả

| Câu hỏi | Quyết định đề xuất | Lý do |
| --- | --- | --- |
| Người dùng muốn gì? | Nhận một DOCX có thể tải, biết rõ còn vấn đề nào phải tự xem. | Tác vụ đầu ra, không phải học quy trình xử lý tài liệu. |
| Giảm thao tác thế nào? | Giữ ba chặng nhận thức; gom màn con trong Bước 1; chỉ buộc quyết định khi có dữ liệu cần xác nhận. | Ít màn hình hơn nhưng không bỏ duyệt nguồn, consent hoặc cổng xuất. |
| Đặt AI ở đâu? | Trong mục tùy chọn đúng ngữ cảnh, mặc định đóng. | Luồng dùng thủ công vẫn hoàn chỉnh. |
| Khi chưa bảo toàn được tài liệu? | Dẫn đến đối chiếu hoặc tệp gốc, không dùng nhãn “bản hoàn chỉnh”. | Tránh xuất nhầm một tệp trông có vẻ đúng nhưng đã mất cấu trúc. |
| Khi còn cảnh báo thể thức nhưng DOCX đủ cổng kỹ thuật? | Vẫn hiển thị quyền tải theo cổng hiện hành và cảnh báo rõ; thử nghiệm thứ bậc nút với người dùng. | Trạng thái thiếu thông tin không đồng nghĩa tệp DOCX bị lỗi kỹ thuật. |

## 1. Kết quả người dùng cần đạt

Người dùng hiểu được: **tệp nào đang được xử lý; còn điều gì cần họ quyết định; bản Word hiện tại có thể tải để sử dụng hay chỉ để đối chiếu**. Đường đi thuận lợi có một hành động chính trên mỗi bước. Tình huống ngoại lệ dẫn đúng tới nội dung cần sửa hoặc nguồn cần đối chiếu. Không dùng lời hứa “đạt chuẩn 100%”, “sẵn sàng phát hành” chỉ từ kết quả tự động.

### Ranh giới không được giản lược

- Tách riêng văn bản **hành chính/Nghị định 30** và **Đảng/Hướng dẫn 05**; không áp quy tắc hoặc mẫu phần đầu của hệ này sang hệ kia. Mỗi hệ có 9 nhóm chính; các thành phần bổ sung chỉ hiện khi áp dụng.
- Giữ nguyên byte tệp gốc riêng để tải lại khi nguồn còn khả dụng. Bản DOCX xuất là tệp mới: bảo toàn nội dung/cấu trúc trong phạm vi đã chứng minh, trừ thay đổi được người dùng chấp thuận; không gọi byte bản xuất là byte nguồn. Không tự thêm số hiệu, ngày, người ký, chữ ký, dấu; không bỏ bảng hay khối chưa phân loại. Chỗ thiếu phải hiện là thiếu hoặc chưa được đánh giá.
- Nguồn nhập phải được người dùng duyệt theo đúng tệp và phân vùng trước khi tiếp tục. Khi bằng chứng về hệ, loại hoặc mẫu mâu thuẫn, hiện quyết định có lý do; không biến dự đoán thành xác nhận.
- AI là tùy chọn, có đồng ý riêng theo tệp/thao tác và thông tin cụ thể về văn bản trích xuất được gửi. Gợi ý chỉ áp dụng sau quyết định của người dùng.
- Bước xuất dùng cùng byte ứng viên hiện hành cho xem trước, tải và in. Bản đối chiếu chưa xác nhận phải khác rõ bản đủ điều kiện tải; không nới cổng toàn vẹn hoặc dùng ứng viên từ phiên bản cũ.

## 2. Mô hình điều hướng desktop

### Khung chung

| Vùng | Nội dung mặc định | Mở khi cần |
| --- | --- | --- |
| Thanh đầu | DocForm; tên tài liệu; trạng thái lưu đơn giản: “Đang lưu”, “Đã lưu trên trình duyệt này” hoặc “Không lưu được”; “Trợ giúp”; “Công cụ”. Chỉ báo đã lưu sau khi ghi thành công. | Chi tiết lưu trữ, lịch sử phiên bản, cấu hình AI trong Công cụ. |
| Thanh tiến trình | **1. Bắt đầu** → **2. Hoàn thiện** → **3. Xem và tải Word**. Chỉ đánh dấu hoàn thành khi điều kiện của bước đã đạt, không dựa vào việc đã mở màn hình. | Bước con/nhóm kỹ thuật không hiện ở tiến trình chính. |
| Vùng chính | Một mục tiêu, một lời giải thích ngắn, một hành động chính. | Vị trí nguồn, bằng chứng, báo cáo kiểm tra và tùy chọn nâng cao. |
| Vùng việc cần làm | Chỉ xuất hiện khi có mục cần quyết định/xem/sửa. Mỗi dòng: điều gì, mức ảnh hưởng, nút mở đúng chỗ. | Lý do kỹ thuật hoặc căn cứ kiểm tra của từng mục. |

Trên desktop, giữ thanh tiến trình gọn ở cạnh trên hoặc bên trái, nhưng không lặp cả “bước”, “bước con” và “trạng thái nguồn” thành ba danh sách song song. Ở Bước 2 và 3, ưu tiên chiều rộng cho nội dung văn bản. Cột bên phải hiển thị việc cần làm và hành động tải; nội dung kỹ thuật đóng mặc định. Không tạo nhiều vùng cuộn lồng nhau khi có thể dùng một cuộn nội dung chính.

### Từ vựng thống nhất

| Thuật ngữ trong giao diện | Cách hiển thị đề xuất | Lưu ý |
| --- | --- | --- |
| Body / Canvas | Nội dung văn bản / Bản soạn | Giữ ID nội bộ trong mã, không buộc người dùng hiểu. |
| Phân vùng | Kiểm tra nội dung đã đọc | Trong chi tiết có thể giải thích khối nào thuộc phần đầu/thân bài/phụ lục. |
| Candidate / ứng viên | Bản Word đang kiểm tra | Phân biệt với tệp gốc và bản đối chiếu. |
| Fidelity / integrity gate | Kiểm tra bảo toàn nội dung và cấu trúc | Tên kỹ thuật nằm trong “Chi tiết kiểm tra”. |
| Revision / SHA-256 / instance ID | Phiên bản bản soạn / Mã đối chiếu | Chỉ hiện trong Công cụ hoặc báo cáo chi tiết. |
| “Đã đạt chuẩn” | “Không còn mục đang cảnh báo theo các kiểm tra đã thực hiện” | Chỉ dùng khi đúng và kèm phạm vi; không thay duyệt pháp lý/Word. |

## 3. Quy tắc trạng thái hiển thị xuyên suốt

Ba trạng thái độc lập được tính từ nguồn dữ liệu hiện hành, không lưu một cờ “hoàn tất” chung:

1. **Nguồn:** chưa có → đang đọc → cần đối chiếu/quyết định → đã được người dùng duyệt cho đúng tệp.
2. **Nội dung/thể thức:** có mục cần sửa → có mục cần xem lại → chưa có mục đang cảnh báo theo bộ kiểm tra đã thực hiện. `NOT_EVALUATED` phải hiện là “Chưa đánh giá”; `NOT_APPLICABLE` không tính thành đạt.
3. **Bản Word:** chưa tạo → đang tạo/kiểm → đủ điều kiện tải theo cổng kỹ thuật, hoặc chỉ tải bản đối chiếu, hoặc không thể dựng bản an toàn.

Một mục có thể là **chặn tiếp tục**, **chặn tải bản Word đủ điều kiện xuất kỹ thuật**, **cần xem lại nhưng không chặn tải theo cổng hiện hành**, hoặc **gợi ý tùy chọn**. Dòng của mục phải nói rõ mức ảnh hưởng. Không biến mọi cảnh báo thành lỗi đỏ; cũng không biến lỗi toàn vẹn thành “lưu ý nhỏ”. “Đủ điều kiện xuất kỹ thuật” không đồng nghĩa “được phê duyệt phát hành”.

## 4. Bước 1 — Bắt đầu: tải tài liệu hoặc tạo mới

### 4.1. Trạng thái chưa có tài liệu

**Tiêu đề:** “Bạn muốn bắt đầu từ đâu?”\
**Giải thích:** “Tải tệp Word/TXT để DocForm đọc và đề xuất thể thức, hoặc tạo văn bản mới từ mẫu.”\
**Lựa chọn chính:** “Tải tài liệu có sẵn”\
**Lựa chọn phụ:** “Tạo văn bản mới”

Sau khi chọn tải, vùng chính là ô chọn/kéo thả tệp với nhãn **“Chọn tệp Word (.docx) hoặc TXT”**. Nêu định dạng được hỗ trợ và giới hạn dung lượng thực tế nếu ứng dụng có giới hạn; không ghi một con số chưa kiểm chứng. Nút “Chọn tệp” luôn dùng được bằng bàn phím, kéo thả chỉ là cách bổ sung. Không hỏi hệ/loại/mẫu trước khi đọc tệp.

### 4.2. Đang đọc hoặc đọc lỗi

Trong lúc đọc: **“Đang đọc tài liệu…”**, sau đó là trạng thái cụ thể **“Đang nhận diện nội dung”** nếu việc đọc đã xong. Nút thay tệp chưa làm mất nguồn cũ cho đến khi tệp mới được nhận và người dùng chọn thay.

Thông báo lỗi dùng đúng nguyên nhân đã biết: **“Không đọc được tệp này. Hãy chọn DOCX hoặc TXT khác.”**, **“Tệp trống.”**, **“Tệp vượt quá giới hạn [giới hạn thật].”**. Không báo “đã đọc tài liệu” khi chỉ nhận tên tệp. Giữ nội dung người dùng đã có trước lỗi.

### 4.3. Đã đọc: thẻ tóm tắt quyết định

**Tiêu đề:** “Đã đọc tài liệu”\
**Dòng tệp:** tên tệp, nút “Thay tệp”, liên kết phụ “Tải tệp gốc” khi byte nguồn còn có thể tải.\
**Ba dòng tóm tắt:** “Hệ thể thức: Hành chính / Văn bản Đảng / Cần xác nhận”; “Loại văn bản: … / Cần chọn”; “Mẫu phần đầu: … / Cần chọn”. Mỗi dòng có “Thay đổi” và mở lựa chọn kèm bằng chứng nguồn; không tự ghi đè dữ liệu.

Không đưa số khối, ID, coverage hay số bảng vào dòng thành công chính. Nếu có bảng/khối không hỗ trợ, hiện cảnh báo riêng vì có thể ảnh hưởng tệp cuối. Chỉ báo “Có N bảng” khi phạm vi đếm rõ; số bảng nguồn và số bảng trong ứng viên phải được phân biệt.

### 4.4. Cần đối chiếu hoặc xác nhận

Khối việc cần làm đặt ngay dưới thẻ tệp, trước nút tiếp tục. Ví dụ tổng hợp:

| Tình huống | Câu trên màn hình | Hành động |
| --- | --- | --- |
| Hệ thể thức chưa rõ | “Chưa xác định văn bản thuộc hệ hành chính hay hệ Đảng. Hãy đối chiếu phần đầu tệp gốc.” | “Xem phần đầu và chọn hệ” |
| Loại văn bản mâu thuẫn | “Tên loại trong tệp và loại đang chọn khác nhau. Hãy xác nhận loại sẽ dùng để định dạng.” | “So sánh và xác nhận” |
| Mẫu cơ quan mâu thuẫn | “Phần đầu tệp gốc khác mẫu cơ quan đang chọn. Hãy quyết định dùng mẫu nào.” | “Xem hai phần đầu” |
| Khối/bảng khó bảo toàn | “Có N phần cần so với tệp gốc trước khi xuất Word.” | “Xem N phần” |
| Phân vùng chưa duyệt | “Hãy kiểm tra cách DocForm chia nội dung trước khi soạn.” | “Kiểm tra nội dung đã đọc” |

Màn hình đối chiếu ưu tiên **chỉ các phần cần người dùng quyết định**, có nút mở toàn bộ tệp khi cần. Với từng phần, hiện vị trí nguồn, nội dung trích xuất và cách ứng dụng dự định dùng phần đó. Người dùng có thể xác nhận hoặc sửa nhãn được hỗ trợ; thao tác **“Duyệt nội dung đã đọc”** chỉ xuất hiện khi các quyết định bắt buộc đã xử lý. Đóng/hủy đối chiếu không được ghi nhận đã duyệt.

### 4.5. Nút chính và đường đi nhanh

- Chưa có tệp: **“Chọn tệp”**.
- Đang đọc: nút ở trạng thái đang xử lý, không cho gửi lặp.
- Cần duyệt nguồn: **“Kiểm tra nội dung đã đọc”**.
- Có quyết định hệ/loại/mẫu chưa xong: **“Xác nhận thông tin”**, mở mục đầu tiên cần xử lý.
- Nguồn đã duyệt và đủ điều kiện sang Bước 2: **“Tiếp tục hoàn thiện”**.

Các màn `upload`, `recognition`, `metadata`, `ready` hiện tại có thể gộp thành một luồng hiển thị theo điều kiện. “Ít màn hình hơn” không có nghĩa bỏ hành động duyệt nguồn. Không cam kết một số lần bấm cố định vì tài liệu có thể có ngoại lệ.

### 4.6. Tạo văn bản mới

Giữ lựa chọn này như nhánh phụ rõ ràng. Hỏi lần lượt **hệ thể thức → loại văn bản → mẫu phần đầu/nội dung** vì chưa có tệp để suy luận. Chỉ hiện lựa chọn phù hợp với hệ đã chọn. Trước khi tạo, có thẻ tóm tắt để sửa từng lựa chọn. Với trang trắng, nói rõ: **“DocForm tạo khung thể thức; nội dung, số hiệu, ngày và người ký vẫn để trống để bạn điền.”** Không tự lấy tên cơ quan trong ví dụ hoặc profile khác hệ. Nút chính: **“Tạo bản soạn”**.

### 4.7. AI ở Bước 1

Mặc định đóng/tắt. Nhãn: **“Kiểm tra thêm bằng AI (tùy chọn)”**. Trước nút chạy, hiển thị ngắn gọn: **“DocForm sẽ gửi văn bản trích xuất và vị trí các phần của tệp này tới [tên provider] để gợi ý phân loại. Không gửi byte DOCX, PDF hay ảnh trang qua thao tác này. Gợi ý chỉ áp dụng khi bạn duyệt.”** Nếu thao tác khác có phạm vi gửi khác, dùng lời giải thích tương ứng; không tái sử dụng một consent chung. Cho mở “Chi tiết dữ liệu gửi đi” để xem manifest/coverage; không che nội dung gửi thực tế.

## 5. Bước 2 — Hoàn thiện bản soạn

### 5.1. Bố cục và thông tin ưu tiên

**Tiêu đề:** “Hoàn thiện văn bản”\
**Dòng phụ:** “[Loại văn bản] · [Hệ thể thức] · Đã lưu/Đang lưu”.\
**Ở giữa:** bản soạn dễ đọc theo thứ tự phần đầu → nội dung → phần cuối, ưu tiên trang A4 như lớp quan sát.\
**Bên phải:** “Cần xử lý” và số mục, không mở AI mặc định.\
**Nút chính:** “Xem bản Word”.

Bản soạn có thể dùng các trường/cụm sửa hiện có để bảo vệ nguồn và giao dịch workspace. Mục nào cần sửa được làm nổi ngay trong bản soạn; các nhóm đã đủ thông tin thu gọn. Chỉ hiển thị phụ lục khi có phụ lục hoặc người dùng chọn “Thêm phụ lục”. Thanh công cụ văn bản cơ bản xuất hiện khi chọn đoạn sửa được. Bảng/ảnh/khối chỉ đọc phải được mô tả là chỉ đọc và có đường quay lại đối chiếu nếu cần; không tạo ô nhập giả khiến người dùng tưởng đã sửa được nguồn.

Trang soạn HTML hoặc bản xem trình duyệt **không được ghi “hiển thị y hệt Word”**. Bước 3 là bản xem từ DOCX ứng viên; ngắt trang và shape vẫn cần xem trong Word/LibreOffice với cùng mẫu trước khi phát hành.

### 5.2. Danh sách “Cần xử lý”

Thứ tự: (1) việc chặn tiến trình/xuất, (2) mục thể thức cần người dùng xem, (3) gợi ý tùy chọn. Mỗi mục có một câu hành động, một nhãn ảnh hưởng và một nút đến đúng vị trí. Ví dụ:

| Mục | Nhãn ảnh hưởng | Nút |
| --- | --- | --- |
| “Chưa xác nhận số, ký hiệu văn bản” | “Cần xem trước khi gọi bản Word hoàn chỉnh” hoặc mức chặn thực tế | “Mở số, ký hiệu” |
| “Chưa có ngày ban hành trong nguồn” | “Cần bổ sung hoặc giữ là chưa có” | “Mở ngày ban hành” |
| “Một bảng nguồn chưa chứng minh bảo toàn cấu trúc” | “Chặn tải bản Word đủ điều kiện xuất kỹ thuật” khi cổng thật chặn | “Đối chiếu bảng” |
| “Gợi ý diễn đạt cho một đoạn” | “Tùy chọn” | “Xem gợi ý” |

Không tự biến báo cáo thể thức `NEEDS_REVIEW` thành blocker của tải DOCX nếu cổng hiện hành không chặn. Đồng thời không gọi tệp “đã chuẩn” khi còn mục này. Các trạng thái `FAIL`, `NOT_EVALUATED`, `NEEDS_REVIEW`, `NOT_APPLICABLE` phải có cách diễn đạt đúng, không quy về một dấu tích.

Khi người dùng bấm mục, ứng dụng chuyển đến đúng bước/nhóm/đoạn, mở nhóm đang đóng, cuộn vào tầm nhìn và đặt focus vào trường sửa hoặc tiêu đề của vùng chỉ đọc. Quay lại danh sách vẫn giữ vị trí và nội dung đã nhập. Khi một thay đổi ảnh hưởng nguồn, hệ, profile hay nội dung, danh sách phải tính lại theo revision/fingerprint hiện hành.

### 5.3. Chỉnh sửa và gợi ý AI

Nút sửa là thao tác của người dùng trên trường/đoạn được hỗ trợ. Với nội dung không hỗ trợ sửa, ghi **“Phần này đang được giữ nguyên từ tệp gốc; hãy đối chiếu trong Word hoặc quay lại kiểm tra nguồn.”** Không bỏ phần đó khỏi bản soạn và không diễn đạt là đã được chuẩn hóa.

AI nằm trong **“Công cụ hỗ trợ viết (tùy chọn)”**. Khi chọn một đoạn, giao diện ghi rõ đoạn/vị trí, provider, dữ liệu gửi đi và mục đích. Kết quả hiện theo thẻ **“Đề xuất”**, có **“Áp dụng”** và **“Bỏ qua”**; trước khi áp dụng phải còn đúng nguồn, vị trí và revision. Không có nút “Tự động sửa toàn bộ” mặc định. Rà chính tả/văn phong khác với kiểm tra thể thức, không thay bằng chứng quy tắc.

### 5.4. Khi chuyển sang Bước 3

Nếu thiếu quyết định bắt buộc, thay vì nút mờ không giải thích, hiện **“Còn N việc cần xử lý trước khi xem bản Word”** và liên kết tới từng mục. Nếu chỉ còn khuyến nghị không chặn, cho chuyển bước nhưng ghi rõ “Còn N mục thể thức cần xem lại” ở Bước 3. Bước 2 chỉ đánh dấu hoàn thành theo điều kiện nguồn/workspace cho phép tạo ứng viên, không theo việc người dùng đã cuộn hết trang.

## 6. Bước 3 — Xem và tải Word

### 6.1. Bố cục

**Tiêu đề:** “Xem và tải Word”\
**Trái:** bản xem dựng từ byte DOCX ứng viên hiện hành, với công cụ trang/thu phóng gọn.\
**Phải:** một thẻ trạng thái, các việc cần xử lý và **một nút chính**.\
**Phụ:** “Tải tệp gốc” khi còn byte nguồn; “In/Lưu PDF tham khảo” chỉ khi cổng cho phép; “Chi tiết kiểm tra”.

Không để hai thẻ cảnh báo có cùng nội dung ở trên bản xem và trong cột phải. Trạng thái phải hiển thị trước nút tải. Tên file của bản đối chiếu phải thể hiện “chưa xác nhận”.

### 6.2. Ma trận trạng thái và câu chữ chính

| Trạng thái ứng viên hiện hành | Tiêu đề và lời giải thích | Nút chính | Nút phụ |
| --- | --- | --- | --- |
| Chưa có ứng viên | “Đang chuẩn bị bản Word” chỉ khi đang chạy; “Chưa có bản Word từ bản soạn hiện tại” khi chưa chạy; lỗi dùng câu riêng ở mục 16. | “Tạo và kiểm tra bản Word” khi cần; không lặp nút nếu đang chạy. | “Quay lại bản soạn”. |
| DOCX đủ điều kiện tải; không có mục thể thức đang cảnh báo trong phạm vi đã đánh giá | “Có thể tải bản Word. Không phát hiện vấn đề trong các kiểm tra đã thực hiện; còn N mục chưa đánh giá nếu có.” Không nói “đạt chuẩn” khi N > 0. | “Tải Word (.docx)” | “In/Lưu PDF tham khảo”, “Chi tiết kiểm tra”. |
| DOCX đủ điều kiện tải; còn mục thể thức cần xem | “Có thể tải bản Word, còn N mục thể thức cần xem lại.” Không ghi “đã chuẩn” hoặc “sẵn sàng phát hành”. | “Xem N mục cần kiểm tra” là hành động được nhấn mạnh cho người muốn bản cuối; giữ “Tải Word (.docx)” theo cổng hiện hành với trạng thái rõ. | “Chi tiết kiểm tra”. |
| Chỉ đủ điều kiện tải bản đối chiếu | “Chưa thể tải bản Word hoàn chỉnh. Bản hiện tại chỉ dùng để đối chiếu trong Word.” | “Xử lý N vấn đề” hoặc “Đối chiếu nguồn”, theo blocker thực tế. | “Tải bản đối chiếu chưa xác nhận”; không hiện nút in khả dụng. |
| Không đủ điều kiện dựng/tải an toàn | “Chưa thể tạo bản Word an toàn. [Lý do ngắn, không có mã lỗi].” | “Mở vị trí cần xử lý” hoặc “Kiểm tra nguồn”. | “Tải tệp gốc nguyên vẹn” khi có. |
| Bản soạn đã thay đổi sau lần tạo ứng viên | “Bản Word cũ không còn khớp với bản soạn.” Chỉ thêm “Đang tạo bản mới…” khi tác vụ tạo thật sự đang chạy. | Không cho tải/in cũ. | “Tạo và kiểm tra bản mới” khi chưa tự chạy; “Quay lại bản soạn” nếu cần. |

Trường hợp DOCX đủ điều kiện tải nhưng báo cáo thể thức còn cảnh báo cần thử nghiệm câu chữ/nút chính với người dùng. Ranh giới cố định: không được chuyển một cảnh báo thể thức thành lời xác nhận chuẩn; không được tự thay đổi cổng xuất chỉ bằng chỉnh UI.

### 6.3. Danh sách vấn đề ở Bước 3

Tối đa vài dòng ưu tiên trên màn hình; nếu dài, có “Xem tất cả N mục”. Mỗi dòng hiển thị **tác động → việc phải làm → vị trí**: ví dụ “Bảng nguồn chưa bảo toàn cấu trúc — cần đối chiếu trước khi tải bản Word — Mở bảng trong nguồn”. Khi nguyên nhân thuộc parser hoặc không sửa được trong UI, nói rõ **“DocForm chưa xử lý được phần này. Bạn có thể tải tệp gốc và kiểm tra trong Word.”** Không hứa người dùng sửa một trường là cổng sẽ đạt nếu blocker nằm ở cấu trúc OOXML.

**Chi tiết kiểm tra** chứa kết quả đối chiếu bảng/nội dung/an toàn, SHA-256, revision, bằng chứng và mã lỗi. Phần này phục vụ hỗ trợ/kỹ thuật; không bị xóa khỏi sản phẩm. Trạng thái lưu, nguồn và phiên bản phải được ghi rõ để hỗ trợ truy vết.

### 6.4. Giới hạn bản xem và in

Gần nút in hoặc trong lời giải thích ngắn: **“Bản in từ trình duyệt chỉ để tham khảo. Hãy mở DOCX trong Word để kiểm tra phân trang trước khi phát hành.”** Nếu có thành phần mà browser render chưa thể hiện đúng, nêu đúng thành phần; không dùng bản xem như bằng chứng Word fidelity. PDF tham khảo không được gọi là bản đã duyệt để phát hành.

## 7. Thư viện thông điệp dùng lại

| Mã nội dung đề xuất | Thông điệp cho người dùng | Khi dùng |
| --- | --- | --- |
| `SOURCE_READ` | “Đã đọc tài liệu. Hãy kiểm tra thông tin nhận diện và những phần cần đối chiếu.” | Parse thành công nhưng nguồn chưa duyệt. |
| `SOURCE_APPROVED` | “Đã duyệt nội dung đọc từ tệp này.” | Chỉ khi quyết định duyệt hợp lệ theo tệp/fingerprint. |
| `SOURCE_REVIEW` | “Có N phần cần đối chiếu với tệp gốc.” | Có nguồn hoặc tính năng không hỗ trợ. |
| `DECISION_REQUIRED` | “Cần xác nhận [hệ/loại/mẫu] trước khi tiếp tục.” | Thiếu hoặc mâu thuẫn quyết định. |
| `FORMAT_REVIEW` | “Còn N mục thể thức cần xem lại.” | Rule/report có mục cần xem; không biến thành thông báo lỗi toàn vẹn. |
| `EXPORT_READY` | “Có thể tải bản Word từ bản soạn hiện tại.” | Ứng viên hiện hành đủ điều kiện tải. |
| `EXPORT_REVIEW_ONLY` | “Bản Word này chưa được xác nhận. Chỉ dùng để đối chiếu trong Word, không dùng phát hành.” | Chỉ đủ điều kiện tải chẩn đoán. |
| `EXPORT_BLOCKED` | “Chưa thể tạo bản Word an toàn. Hãy xem vấn đề bên dưới hoặc tải tệp gốc.” | Không đủ điều kiện chẩn đoán. |
| `CANDIDATE_STALE` | “Bản soạn đã đổi. Cần kiểm tra lại bản Word trước khi tải.” | Candidate cũ bị vô hiệu; chỉ nói “Đang kiểm tra” khi tiến trình mới thật sự chạy. |
| `SAVE_ERROR` | “Không lưu được thay đổi. Hãy giữ trang này mở và thử lại.” | Lưu nháp lỗi; không hiện “Đã lưu”. |

Các mã trên chỉ là mục lục nội dung cho thiết kế, **không phải** đề xuất thêm enum hoặc API khi chưa cần. Số N và tên trường lấy từ dữ liệu thật, không ghi cứng. Thông báo lỗi phải có chữ mô tả, không chỉ màu/biểu tượng.

## 8. Trường hợp mẫu để kiểm tra luồng

| Ca | Đường đi mong đợi | Điều không được xảy ra |
| --- | --- | --- |
| Tệp DOCX nhận diện rõ, nguồn được duyệt, ứng viên đủ cổng | Tải → tóm tắt → duyệt nguồn → hoàn thiện nếu cần → xem bản hiện hành → tải Word. | Tự tuyên bố đạt pháp lý hoặc bỏ duyệt nguồn. |
| Tệp có hệ/loại/mẫu mâu thuẫn | Hiện bằng chứng và lựa chọn; ghi nhận quyết định; đánh giá lại trước khi đi tiếp. | Dự đoán âm thầm đổi regime/profile. |
| Tệp có bảng/khối không hỗ trợ | Hiện N phần cần đối chiếu; nếu cổng không đạt chỉ cho bản đối chiếu hoặc tệp gốc. | Cho tải bản cuối như thể đã bảo toàn. |
| Thiếu ngày, số hiệu hoặc người ký | Hiện thiếu ở bản soạn và danh sách; người dùng có thể bổ sung bằng thông tin thật hoặc để trạng thái chưa có theo cổng hiện hành. | Tự tạo ngày, tên, chữ ký, số hiệu. |
| AI không sẵn sàng hoặc người dùng không đồng ý | Luồng quy tắc/nội bộ và chỉnh thủ công vẫn dùng được trong phạm vi hỗ trợ. | Gửi văn bản cho provider hoặc nói AI đã đọc toàn văn. |
| Bản soạn thay đổi sau khi tạo DOCX | Vô hiệu bản cũ, dựng/kiểm lại, mọi nút tải/in theo byte mới. | Cho tải bản cũ từ cache hoặc hiển thị preview khác byte tải. |
| Chỉ có bản đối chiếu | Câu chữ và tên tệp ghi “chưa xác nhận”; in/PDF bị khóa theo cổng; có đường xử lý blocker. | Gọi đó là bản cuối hay “sẵn sàng phát hành”. |

## 9. Điều kiện nghiệm thu nội dung và trải nghiệm

1. Người dùng phổ thông hiểu ở mỗi bước **việc kế tiếp** trong một lần nhìn, không cần đọc thuật ngữ parser, JSON, rule ID, SHA hay revision.
2. Mỗi blocker có mô tả nguyên nhân và hành động dẫn tới đúng chỗ; nếu không sửa được trong UI thì nói thẳng và cung cấp tệp gốc khi có.
3. Bản đủ điều kiện tải, bản đối chiếu và bản không an toàn khác nhau bằng **câu chữ, nhãn và hành động**, không chỉ màu.
4. Không có “đã hoàn thành” ở thanh tiến trình khi nguồn chưa duyệt hoặc ứng viên chưa đủ điều kiện tương ứng. Một mục `NOT_EVALUATED` không bị đếm là đạt.
5. Chuyển bước, mở mục lỗi và đóng đối chiếu giữ focus hợp lý; dùng bàn phím được; thông báo trạng thái đọc được bằng công nghệ hỗ trợ. Thử trên desktop trước.
6. Kiểm tra bằng tác vụ thực tế với người dùng mục tiêu: tìm tệp cuối, phân biệt bản đối chiếu, xử lý mục thiếu, xác định vì sao chưa tải được. Ghi số thao tác, thời gian, hoàn thành đúng và tải nhầm bản so với baseline; chưa gán tỷ lệ cải thiện khi chưa đo.
7. Đánh giá tệp DOCX cùng mẫu trong LibreOffice rồi Microsoft Word về nội dung, bảng và phân trang. Kết quả tự động, cấu trúc OOXML, bản xem browser và đánh giá pháp lý/phát hành được báo riêng.

## 10. Thứ tự bàn giao để triển khai

1. **Nội dung trạng thái Bước 3:** một trạng thái và một hành động chính theo cổng hiện hành, nhãn bản đối chiếu rõ. Đây là phần giảm rủi ro hiểu nhầm lớn nhất.
2. **Danh sách việc cần xử lý xuyên suốt:** nối từng blocker/decision/issue với vị trí thật, ưu tiên đúng mức ảnh hưởng. Rà các số liệu hiển thị nguồn/ứng viên trước khi đưa vào tóm tắt; ví dụ phiên khảo sát có “2 bảng nguồn” và “0 bảng ứng viên” cần giải thích phạm vi đếm.
3. **Bố cục Bước 2:** ưu tiên bản soạn, thu gọn nhóm đã ổn, AI theo yêu cầu; prototype trang A4 neo vùng sửa và thử thao tác desktop.
4. **Rút gọn Bước 1:** gộp màn hình con khi luồng không có ngoại lệ, giữ duyệt nguồn/consent/decision thực chất.
5. **Thử với người dùng và tài liệu được phép:** chỉnh câu chữ/ưu tiên theo kết quả, sau đó mới triển khai rộng. Các test hiện hành về wizard, nguồn và candidate phải được cập nhật để kiểm tra hành vi nhìn thấy; không giữ DOM ẩn chỉ để test cũ qua.

**Điểm bắt đầu trong mã:** [`../src/App.tsx`](../src/App.tsx), [`../src/components/ImportStepView.tsx`](../src/components/ImportStepView.tsx), [`../src/components/WorkspaceEditor.tsx`](../src/components/WorkspaceEditor.tsx), [`../src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx), [`../src/utils/exportCandidate.ts`](../src/utils/exportCandidate.ts). Cách kiểm tra phù hợp được liệt kê trong [Codebase Map](CODEBASE_MAP.md); tài liệu này chưa thay đổi code hoặc xác nhận test pass.

## 11. Hợp đồng bảo toàn và quyền sửa

Bản gốc, bản soạn và DOCX xuất là ba đối tượng khác nhau. Byte nguồn tải lại chỉ được gọi là nguyên vẹn khi kho nguồn trả lại đúng dữ liệu đã lưu và xác minh được danh tính/hash; nếu chỉ còn bản nháp mà mất byte nguồn, giao diện phải báo mất khả năng tải gốc, không tái tạo tệp rồi gọi là gốc. TXT không có cấu trúc OOXML để bảo toàn như DOCX; đánh giá TXT theo nội dung văn bản và cấu trúc được tạo mới, không gán nhãn “giữ nguyên bố cục Word gốc”.

Đối với từng thành phần đầu vào, UX cần nhận một trong các khả năng do lớp xử lý hiện hành cung cấp: **sửa được và kiểm chứng được**, **chỉ giữ/đối chiếu**, **chưa kiểm chứng**, **không hỗ trợ**. Đây là nhãn khả năng cho giao diện, không phải khẳng định mọi đối tượng Word đã có cùng mức hỗ trợ. Bảng, ảnh, shape, textbox, header/footer, section break, footnote, trường động, comment và tracked changes phải được đánh giá theo khả năng cụ thể trước khi hứa “bảo toàn”. Với thành phần chưa kiểm chứng hoặc không hỗ trợ, hiện vị trí, cách đối chiếu và trạng thái xuất thật; không mặc định PASS.

Mặc định tác vụ là **định dạng và rà soát thể thức**. Nếu người dùng sửa chữ, thêm/xóa đoạn, ô bảng hoặc phụ lục trong phần ứng dụng hỗ trợ, thao tác đó được ghi nhận như thay đổi nội dung có chủ ý và làm ứng viên xuất cũ hết hiệu lực. Cần cho xem phần thay đổi so với nguồn trong phạm vi đã chứng minh, không hứa diff hoàn chỉnh cho mọi cấu trúc DOCX.

## 12. Quay lui, lưu nháp và ứng viên

| Sự kiện | Điều người dùng thấy | Dữ liệu và hành động phải được bảo vệ |
| --- | --- | --- |
| Quay lại Bước 1 hoặc Bước 2 chỉ để xem | Giữ nội dung, vị trí đang mở và trạng thái lưu. | Không tự đặt lại quyết định hoặc bản soạn. |
| Đổi hệ thể thức khi bản soạn có nội dung | Hộp thoại giải thích phần đầu/quy tắc nào sẽ đổi, phần nội dung nào dự kiến giữ; cho hủy. | Dùng luồng chuyển hệ có lưu phiên bản và kiểm tra lại; quyết định/gợi ý phụ thuộc hệ cũ hết hiệu lực. Không hứa mọi thay đổi đều giữ nếu chưa chứng minh. |
| Chọn mẫu khác hoặc thay tệp | Trước khi xác nhận, nêu bản soạn hiện tại sẽ được giữ, thay thế hay lưu vào lịch sử theo hành vi thật; nút “Hủy” giữ nguyên trạng thái. | Nguồn mới có fingerprint/consent/duyệt riêng; không tái dùng ứng viên hoặc xác nhận nguồn cũ. Kiểm tra hành vi hiện hành trước khi dùng câu “đã lưu bản cũ”. |
| Chỉnh nội dung hoặc profile có ảnh hưởng DOCX | “Bản Word cũ không còn khớp. Đang kiểm tra bản hiện hành” nếu tác vụ đã bắt đầu. | Vô hiệu ứng viên cũ ngay; bản xem/tải/in chỉ từ ứng viên có key và revision khớp. Kết quả bất đồng bộ đến muộn không ghi đè ứng viên mới. |
| Lưu nháp đang chạy | “Đang lưu trên trình duyệt này…” | Không hiển thị “Đã lưu” trước khi IndexedDB ghi xong. |
| Lưu nháp lỗi | “Không lưu được thay đổi trên trình duyệt này. Hãy giữ trang mở và thử lại.” | Bản đang soạn vẫn nằm trong phiên hiện tại, nhưng không hứa phục hồi sau tải lại. Nếu tải DOCX được, nói rõ đó là bản từ nội dung đang mở, không phải bằng chứng nháp đã lưu. |
| Mở lại ứng dụng | “Đã khôi phục bản nháp lưu lúc [giờ]” khi có bản nháp hợp lệ. | Chỉ mở tới bước được phép bởi nguồn và quyết định hiện hành; nếu khôi phục lỗi, không ghi đè nháp lưu. |
| Tạo DOCX lỗi hoặc không hoàn tất | “Không tạo/kiểm tra được bản Word. Bản soạn và tệp gốc vẫn được giữ.” | Cho thử lại và xem nguyên nhân; không đưa nút tải cho ứng viên không tồn tại hoặc cũ. Phân biệt lỗi tạo cục bộ với lỗi AI/mạng. |

Mã hiện hành đã có lưu nháp IndexedDB, tự lưu sau khi chỉnh sửa, luồng chuyển hệ an toàn và `candidateManager` gắn ứng viên với snapshot. Bảng trên quy định **cách trình bày và ca cần kiểm chứng** khi thiết kế lại, không giả định các hành vi mới đã được triển khai đầy đủ. Không trì hoãn revision hoặc vô hiệu ứng viên chỉ để tránh danh sách “Cần xử lý” thay đổi khi đang gõ; có thể ổn định bố cục danh sách, giữ focus và cập nhật thông báo không ngắt quãng, trong khi dữ liệu/cổng vẫn đánh giá trên bản hiện hành.

## 13. Duyệt nguồn, để trống và phạm vi kiểm tra

Trước hành động duyệt nguồn, tóm tắt **đang xác nhận điều gì**: (1) hệ/loại/mẫu đã chọn và bằng chứng nguồn khi có mâu thuẫn; (2) các phần được đọc, phân loại và phần còn chưa rõ; (3) giới hạn bảo toàn đã biết. Nút duyệt phải gắn đúng tệp và phân vùng hiện hành. Đồng ý tiếp tục khi có giới hạn hỗ trợ, nếu chính sách cho phép, **không** biến giới hạn đó thành bằng chứng đã bảo toàn hoặc mở cổng xuất kỹ thuật. Với tài liệu nhiều mục, nhóm theo vị trí/loại vấn đề và cho mở từng mục; không thêm một nút “chấp nhận tất cả” cho các quyết định chưa xem.

Thông tin thiếu, để trống có chủ đích, chưa xác nhận và không áp dụng là bốn trạng thái khác nhau. Đề xuất “Giữ trống để điền khi phát hành” từ bản đánh giá là **một thay đổi nghiệp vụ mới**, chưa được xem là đã có trong DocForm. Chỉ đưa vào triển khai sau khi xác định trường nào được phép, người dùng xác nhận ra sao, provenance/revision lưu thế nào và rule/cổng xuất diễn đạt trạng thái đó ra sao. Không được đổi `FAIL` hoặc `NOT_EVALUATED` thành PASS chỉ bằng nút xác nhận.

Tóm tắt kiểm tra thể thức phải phân biệt số mục **đã đánh giá và đạt**, **không đạt/cần xem lại**, **chưa đánh giá**, **không áp dụng**; không cộng `NOT_EVALUATED` vào đạt. Việc được tải DOCX theo cổng kỹ thuật là độc lập với duyệt pháp lý, chất lượng dàn trang trong Word và quyết định phát hành. Tránh từ “bản chính thức”; dùng **“bản Word đủ điều kiện xuất kỹ thuật”** trong chi tiết, còn nút phổ thông là **“Tải Word (.docx)”** khi cổng thật cho phép.

## 14. Điều kiện xuất và tên tệp

Nguồn trạng thái cho nút tải là ứng viên hiện hành: byte DOCX có thể dựng, XML hợp lệ, không có blocker, kiểm tra bảng/nội dung/an toàn đạt, và key/revision vẫn khớp bản soạn. Bản đối chiếu có cổng riêng, chỉ để xem trong Word và không mở quyền in. Nếu một kiểm tra **bắt buộc cho bảo toàn** chưa thực hiện, không coi là PASS; nếu kiểm tra thể thức chưa thực hiện, báo phạm vi thiếu mà không tự suy ra chặn/tự cho phép tải ngoài chính sách cổng. Preview, tải và in cùng một ứng viên; điều này **không** chứng minh browser dàn trang giống Word.

Tên tệp hiện hành trong `App.tsx` là `Van_Ban_ND30.docx` / `Van_Ban_HD05.docx`, hoặc `Ban_doi_chieu_chua_xac_nhan_ND30.docx` / `Ban_doi_chieu_chua_xac_nhan_HD05.docx`. Đề xuất bổ sung tên ngắn gọn theo tài liệu để tránh ghi đè nhầm nhiều lượt tải, nhưng phải xử lý ký tự không hợp lệ, trùng tên và không tiết lộ thông tin nguồn ngoài phạm vi người dùng mong muốn. Không sửa tên trong tài liệu này như thể code đã đổi; test phải kiểm tra đúng tên và nhãn cuối cùng sau khi triển khai.

Ma trận nghiệm thu cần bao phủ DOCX đơn giản và phức tạp, TXT, tạo mới, thay nguồn, đổi hệ/profile/mẫu, AI không đồng ý hoặc trả kết quả cũ, lưu thất bại, xuất thất bại, hai tác vụ tạo DOCX kết thúc ngược thứ tự, sửa sau khi xem và sai khác số bảng nguồn/ứng viên. Với sai khác “2 bảng nguồn/0 bảng ứng viên” của phiên khảo sát, trước tiên xác minh phạm vi đếm; nếu có mất bảng thật, phải chặn kết luận bảo toàn và xử lý tại cổng, không chỉ sửa câu chữ UI. Các ngưỡng hiệu quả UX chỉ chốt sau khi đo baseline với người dùng mục tiêu; các bất biến như không tải ứng viên cũ và không gửi AI khi chưa đồng ý phải có **0 vi phạm** trong tập kiểm thử được định nghĩa rõ.

## 15. Hợp đồng màn hình chi tiết để thiết kế

Các khối dưới đây là thứ tự đọc và chức năng, không ép một thư viện UI cụ thể. Desktop là mốc nghiệm thu đầu tiên. Mỗi màn phải hoạt động khi tên tệp dài, văn bản dài, danh sách vấn đề dài, thu phóng trình duyệt và chỉ dùng bàn phím.

### 15.1. Thanh ứng dụng và tiến trình

1. Thanh đầu luôn có tên tài liệu đang làm hoặc “Văn bản chưa đặt tên”; trạng thái lưu có chữ; liên kết Trợ giúp. Tên dài cắt bằng dấu ba chấm, có cách xem tên đầy đủ; không để tên đẩy nút hành động khỏi màn hình.
2. Tiến trình ba bước có nhãn chữ và trạng thái **Đang làm / Có thể mở / Chưa thể mở / Đã qua bước**. “Đã qua bước” chỉ mô tả điều hướng; dấu hoàn thành chỉ dùng khi điều kiện bước được thỏa. Khi sửa dữ liệu làm bước sau mất hiệu lực, dấu hoàn thành của bước sau phải cập nhật.
3. Bấm một bước không thể mở phải cho biết lý do qua thông báo cạnh bước và đường tới việc cần làm đầu tiên; không chỉ dùng nút xám. Nút Quay lại luôn giữ dữ liệu trừ khi người dùng xác nhận thao tác thay nguồn/chuyển hệ có ảnh hưởng.
4. Trạng thái lưu không che trạng thái xuất. “Đã lưu trên trình duyệt này” không có nghĩa đã tạo DOCX. “Có thể tải Word” không có nghĩa nháp đã ghi thành công.

### 15.2. Bước 1: thứ tự khối và hành động

| Thứ tự | Khối | Nội dung bắt buộc | Khi không có dữ liệu |
| --- | --- | --- | --- |
| 1 | Tiêu đề và lựa chọn bắt đầu | “Bạn muốn bắt đầu từ đâu?” cùng hai lựa chọn nhập tệp/tạo mới. | Chỉ hai lựa chọn, không trưng các tùy chọn AI, kiểm định, profile. |
| 2 | Tệp nguồn | Tên, loại, trạng thái đọc, Thay tệp, Tải tệp gốc khi thật sự có byte nguồn. | Không hiện nút Tải tệp gốc với nhánh tạo mới hoặc khi byte không còn. |
| 3 | Nhận diện | Hệ, loại, mẫu; nhãn “Đề xuất từ tệp” hoặc “Bạn đã chọn”; nút Thay đổi. | “Cần xác nhận”, kèm lý do, không điền giá trị giả. |
| 4 | Việc phải quyết định | Chỉ những mục liên quan tệp hiện hành; mỗi mục dẫn đến đúng vùng nguồn. | Ẩn toàn khối, không ghi “0 lỗi” như một kết luận về toàn bộ tệp. |
| 5 | Duyệt nguồn | Tóm tắt các phần đã đọc, phần chưa rõ, giới hạn hỗ trợ; hành động duyệt. | Nếu không có nguồn nhập, thay bằng tóm tắt tạo mới. |
| 6 | Tiếp tục | Một nút chính với nhãn theo điều kiện mục 4.5. | Có lý do chặn và liên kết xử lý. |

Vùng đối chiếu nguồn phải cho biết **phần nào trong tệp**, **DocForm đọc thành gì**, **dự định đặt ở đâu**, **người dùng có thể xác nhận hoặc sửa nhãn gì**. Nếu bản xem nguồn cục bộ không dựng được, vẫn phải có thông tin trích xuất và đường tải tệp gốc; không tự đánh dấu đã đối chiếu. Với nhiều mục, nhóm theo vùng (phần đầu, thân bài, phụ lục, bảng), hiện số mục mỗi nhóm và cho mở từng nhóm. Việc duyệt không được thực hiện bằng một nút “đồng ý tất cả” cho các lựa chọn mâu thuẫn chưa được xem.

### 15.3. Bước 2: thứ tự khối và hành động

| Vùng | Mặc định | Tương tác cần xác định |
| --- | --- | --- |
| Đầu bản soạn | Loại văn bản, hệ đang dùng, trạng thái lưu, nút quay lại. | Đổi hệ/mẫu phải mở cảnh báo thay đổi có thể ảnh hưởng như mục 12. |
| Bản soạn | Các trường/đoạn sửa được và các phần chỉ đọc theo đúng khả năng thực tế. | Nút sửa chỉ xuất hiện nơi có đường dữ liệu lưu và xuất; không để người dùng sửa HTML mà DOCX không phản ánh. |
| Cần xử lý | Nhóm “Chặn tiếp tục”, “Cần xem lại”, “Gợi ý”; ưu tiên nhóm có việc. | Bấm mục mở đúng vị trí; khi nhiều vấn đề ở cùng vị trí, dùng một điểm neo và danh sách con. |
| Đáy hoặc vùng hành động cố định | “Xem bản Word” hoặc lý do chưa thể chuyển. | Không che nội dung khi zoom; phím Tab đến được. |

Khi người dùng đang nhập, dữ liệu/revision và cổng ứng viên cập nhật theo thay đổi thật; danh sách việc cần làm **NÊN** giữ thứ tự nhóm, vị trí cuộn và focus, hạn chế thông báo đọc màn hình lặp liên tục. Được trì hoãn **trình bày lại danh sách** để giảm nhấp nháy; không trì hoãn việc vô hiệu ứng viên cũ. Sau khi rời trường hoặc hoàn thành thao tác, danh sách phải phản ánh phiên bản mới nhất. Nếu lưu lỗi, nội dung trong phiên mở vẫn nhìn thấy và thông báo không bị che bởi thanh công cụ.

### 15.4. Bước 3: thứ tự khối và hành động

1. Trạng thái tệp ở trên cùng: **Có thể tải Word / Chỉ có bản đối chiếu / Chưa thể tạo bản Word / Đang kiểm tra / Cần kiểm tra lại sau khi sửa**. Dùng chữ, biểu tượng và màu, không dựa vào màu đơn độc.
2. Bản xem chỉ xuất hiện từ ứng viên hiện hành. Khi đang dựng, hiện trạng thái tiến trình; nếu có bản cũ, không dùng nó làm bản xem hiện tại. Nếu dựng thất bại, vùng bản xem ghi lý do và lối quay về; không để khung trắng trông như tài liệu rỗng.
3. Vùng hành động có một nút nổi bật. Nút tải Word chỉ khả dụng khi cổng kỹ thuật cho phép; nút bản đối chiếu phải ghi đầy đủ “chưa xác nhận”. Tải tệp gốc là hành động riêng, nhãn luôn khác tệp xuất.
4. Vùng việc cần làm chỉ hiển thị các mục có hành động hoặc giới hạn cần biết trước khi tải. Báo cáo đầy đủ ở “Chi tiết kiểm tra”. Nếu không có việc trong phạm vi đã kiểm nhưng còn mục chưa đánh giá, câu trạng thái phải nhắc phạm vi đó.
5. In/Lưu PDF tham khảo chỉ khả dụng từ đúng ứng viên mà cổng in cho phép. Khi bấm, kiểm tra lại ứng viên hiện hành trước khi mở bản in; nếu đã đổi, yêu cầu dựng lại.

## 16. Máy trạng thái và thông điệp ngoại lệ

### 16.1. Điều kiện chuyển bước

| Điểm chuyển | Điều kiện tối thiểu PHẢI có | Nếu chưa đạt |
| --- | --- | --- |
| Vào Bước 2 từ tệp nhập | Tệp đã đọc đủ để tạo workspace; hệ/loại/mẫu bắt buộc đã quyết định; phân vùng/nguồn được duyệt cho đúng source hash và fingerprint theo cổng hiện hành. | Giữ Bước 1; nêu mục cần xác nhận đầu tiên, không mất tệp. |
| Vào Bước 2 từ tạo mới | Đã chọn hệ và thông tin bắt buộc của nhánh tạo mới; workspace được tạo bằng dữ liệu người dùng cung cấp hoặc trường trống hợp lệ. | Giữ thẻ tóm tắt và mở lựa chọn còn thiếu. |
| Vào Bước 3 | Workspace hiện hành đủ điều kiện tạo ứng viên theo cổng điều hướng; quyết định nguồn/phân vùng còn khớp. | Giữ Bước 2; chỉ rõ việc đang chặn. |
| Tải DOCX đủ cổng kỹ thuật | Ứng viên hiện hành có byte/XML và mọi kiểm tra bắt buộc cho cổng xuất đạt; revision/key còn khớp khi bấm tải. | Không phát tệp; cập nhật trạng thái phù hợp. |
| Tải bản đối chiếu | Cổng đối chiếu riêng cho phép và byte ứng viên hiện hành đủ điều kiện; tên tệp/câu chữ nêu rõ chưa xác nhận. | Không phát tệp; còn đường về nguồn/bản soạn. |
| In bản tham khảo | Cổng in của ứng viên hiện hành cho phép và byte dùng để in trùng byte xem/tải. | Không mở bản in cũ. |

Các điều kiện trên là hợp đồng UI với cổng dữ liệu thật, không phải mã giả để thêm một cờ `isComplete`. Ứng viên `safe` mà thiếu byte hoặc XML vẫn không được tải. Một báo cáo thể thức `NEEDS_REVIEW` có thể còn tồn tại khi cổng xuất kỹ thuật cho tải; câu chữ phải giữ sự phân biệt đó. Bản đối chiếu không làm Bước 3 “hoàn thành”.

### 16.2. Hành vi khi dữ liệu đổi

| Thay đổi | Phần còn giữ | Phần PHẢI kiểm tra lại |
| --- | --- | --- |
| Quay lại chỉ để xem | Nội dung, quyết định và nháp hiện có. | Không tự chạy lại chỉ vì đổi màn hình; khi trở lại Bước 3 kiểm tra key ứng viên. |
| Sửa một trường/đoạn | Tệp gốc, những phần không sửa; lịch sử theo cơ chế hiện hành. | Báo cáo liên quan, revision, ứng viên, preview/tải/in. |
| Đổi quyết định loại/mẫu | Byte nguồn, phần người dùng đã nhập được cơ chế chuyển đổi chứng minh còn giữ. | Quy tắc áp dụng, bằng chứng phụ thuộc loại/mẫu, ứng viên. |
| Đổi hệ | Byte nguồn và phần được luồng chuyển hệ xác nhận bảo toàn. | Toàn bộ quy tắc/profile/ứng viên, quyết định không còn phù hợp; không mang xác nhận của hệ cũ sang hệ mới. |
| Thay tệp nguồn | Không giả định nháp cũ còn trong màn mới; hiển thị đúng lựa chọn lưu/hủy trước thao tác. | Source hash/generation, phân vùng, quyết định nguồn, consent AI, manifest, ứng viên. |
| Khôi phục nháp | Dữ liệu nháp đã ghi thành công. | Điều kiện mở bước, khả dụng byte nguồn, tính hiện hành ứng viên; không tái dùng byte chỉ vì tên tệp giống. |

### 16.3. Thông điệp sự cố

| Sự cố | Câu chính | Hành động | Điều không được suy diễn |
| --- | --- | --- | --- |
| Tệp sai định dạng/hỏng | “Không đọc được tệp này. Hãy chọn tệp DOCX hoặc TXT khác.” | “Chọn tệp khác”; giữ phiên cũ nếu chưa xác nhận thay. | Không báo đã nhận diện. |
| Tệp trống | “Tệp không có nội dung để xử lý.” | “Chọn tệp khác” hoặc “Tạo văn bản mới”. | Không tạo nội dung giả. |
| Đọc/nhận diện thất bại nhưng còn byte nguồn | “DocForm chưa đọc được nội dung. Tệp gốc vẫn có thể tải lại.” | “Thử lại”, “Tải tệp gốc”. | Không cho duyệt nguồn rỗng. |
| Không lưu được nháp | “Không lưu được thay đổi trên trình duyệt này. Hãy giữ trang mở và thử lại.” | “Thử lưu lại”. | Không hứa phục hồi sau tải lại trang. |
| Không tạo DOCX | “Chưa tạo được bản Word từ bản soạn này.” | “Thử lại”, “Xem chi tiết”, “Quay lại bản soạn”. | Không hiện bản cũ như bản mới. |
| Tạo DOCX quá lâu | “Việc tạo bản Word đang mất nhiều thời gian.” | Cho tiếp tục chờ hoặc thử lại khi tác vụ cũ đã kết thúc/hủy an toàn. | Không tự báo lỗi chỉ vì qua một khoảng thời gian UI tùy ý. |
| Mất kết nối với tác vụ cần mạng | “Không kết nối được với dịch vụ [tên].” | “Thử lại”; luồng thủ công vẫn khả dụng khi có thể. | Không gộp với lỗi tạo DOCX cục bộ; không khẳng định đã gửi/nhận dữ liệu. |
| Phiên AI hết hiệu lực | “Kết nối AI đã hết hiệu lực. Bản soạn vẫn được giữ.” | “Kết nối lại” trong Công cụ hoặc tiếp tục thủ công. | Không xin lại consent âm thầm. |
| Không còn byte tệp gốc | “Không còn tệp gốc để tải lại trên trình duyệt này.” | “Chọn lại tệp gốc” nếu cần đối chiếu. | Không dựng một tệp mới rồi gọi là gốc. |
| Ứng viên cũ do thay đổi nội dung | “Bản soạn đã đổi. Cần kiểm tra lại bản Word trước khi tải.” | “Tạo và kiểm tra bản mới”. | Không giữ nút tải/in cũ. |
| Bảng/khối chưa chứng minh bảo toàn | “DocForm chưa xác nhận được phần này trong bản Word.” | “Đối chiếu phần này”, “Tải tệp gốc”. | Không báo lỗi thể thức thay cho lỗi cấu trúc. |

Khi có nguyên nhân chính xác hơn từ hệ thống, thay câu chung bằng nguyên nhân cụ thể **đã xác minh** và cách khắc phục tương ứng. Mã lỗi kỹ thuật ở Chi tiết kiểm tra; không để người dùng chỉ thấy stack trace, mã HTTP hoặc tên parser. Mọi thao tác thử lại phải chống gửi lặp và không xóa bản soạn.

## 17. Ma trận khả năng tài liệu và cách diễn đạt

Ma trận này quy định cách **hỏi và hiển thị khả năng**, không tự tuyên bố parser/export đã hỗ trợ mọi thành phần. Khi triển khai, mỗi dòng phải lấy từ tín hiệu thật của import, workspace và fidelity gate. Nếu chưa có tín hiệu đáng tin, dùng “Chưa xác nhận” thay cho “Đã giữ nguyên”.

| Thành phần | DOCX nhập: thông tin cần biết | TXT nhập / tạo mới | Câu hiển thị khi chưa chứng minh | Đường cho người dùng |
| --- | --- | --- | --- | --- |
| Chữ và thứ tự đoạn | Đã đọc đủ chưa, có đoạn chưa phân loại không, thay đổi nào có chủ ý. | TXT chỉ có văn bản; tạo mới chưa có nguồn để so. | “Có đoạn cần đối chiếu với tệp gốc.” | Mở đúng đoạn và tải nguồn khi có. |
| Bảng, ô gộp, thứ tự ô | Số bảng ở **nguồn**, **bản soạn**, **ứng viên**; kết quả đối chiếu cấu trúc. | TXT không có bảng Word gốc; bảng do người dùng tạo cần kiểm tra xuất. | “Chưa xác nhận bảng này được giữ đúng trong bản Word.” | Xem bảng nguồn và ứng viên; cổng xuất quyết định quyền tải. |
| Ảnh, hình vẽ, textbox, đối tượng nhúng | Thành phần nào đã phát hiện, thành phần nào có thể dựng/giữ và có bằng chứng nào. | Không suy ra ảnh từ TXT; tạo mới chỉ theo chức năng thật. | “Phần này có thể không hiển thị đúng; cần kiểm tra tệp gốc và Word.” | Nêu vị trí, mở nguồn; không tạo ô sửa giả. |
| Header/footer, section, ngắt trang | Phạm vi đọc/ghi OOXML và khác biệt bản xem trình duyệt. | Định dạng được tạo từ mẫu đã chọn, không gọi là giữ bố cục nguồn. | “Bản xem trên trình duyệt có thể khác cách Word phân trang.” | Mở DOCX trong Word trước phát hành. |
| Chú thích, trường động, comment, tracked changes | Phát hiện được gì và liệu có đường giữ/xuất được kiểm chứng. | Không áp dụng theo nghĩa giữ nguồn; nếu tạo mới thì theo chức năng hiện có. | “DocForm chưa xác nhận thành phần này trong bản xuất.” | Giữ nguồn, nêu giới hạn, không tự chấp nhận thay đổi. |
| Chữ ký, người ký, ngày, số hiệu | Giá trị thật từ nguồn hoặc do người dùng nhập; không bịa phần thiếu. | Để trống nếu chưa được cung cấp. | “Thông tin này chưa có/chưa xác nhận.” | Mở trường; quyền tải theo cổng thật, không đổi trạng thái bằng lời văn. |
| Phụ lục và khối chưa phân loại | Vị trí, thứ tự và quan hệ với thân bài. | Chỉ tạo khi người dùng chọn hoặc dữ liệu có thật. | “Có phần chưa xác định vị trí trong văn bản.” | Đối chiếu nguồn, chọn vị trí nếu UI hỗ trợ. |

**Quy tắc đếm:** không đặt “2 bảng” cạnh “0 bảng” nếu hai con số đếm khác đối tượng mà không ghi rõ. Nếu đếm ứng viên chưa chạy, hiển thị “Chưa kiểm tra bảng trong bản Word”, không hiển thị `0`. Khi các bộ đếm bất đồng, đánh dấu cần điều tra; không tự kết luận mất bảng và cũng không tự kết luận an toàn.

## 18. Dữ liệu, quyền riêng tư và nguồn gốc quyết định

### 18.1. Ba lớp dữ liệu người dùng cần hiểu

| Lớp | Nguồn và mục đích | Nhãn ngắn trong UI |
| --- | --- | --- |
| Tệp gốc | Byte DOCX/TXT được người dùng chọn, giữ riêng để đối chiếu/tải lại khi có. | “Tệp gốc” |
| Bản soạn | Dữ liệu đã đọc cùng những chỉnh sửa/ quyết định của người dùng theo revision. | “Bản soạn” |
| Bản Word | DOCX mới dựng từ snapshot bản soạn, có kiểm tra và điều kiện tải riêng. | “Bản Word” hoặc “Bản đối chiếu chưa xác nhận” |

Hộp thoại đổi hệ, thay nguồn, duyệt nguồn và áp dụng gợi ý phải nói rõ nó tác động lớp nào. Không dùng câu “Tệp đã được lưu” nếu chỉ lưu bản soạn vào trình duyệt. Nếu người dùng xóa dữ liệu trình duyệt, đổi thiết bị hoặc chế độ riêng tư làm kho lưu không khả dụng, không hứa nháp sẽ còn; tài liệu không đề xuất đồng bộ đám mây.

### 18.2. Hợp đồng cho mọi thao tác AI

1. Trước khi gửi: nêu **tên dịch vụ**, **mục đích**, **phạm vi văn bản trích xuất sẽ gửi**, **điểm nguồn/vị trí**, **cách tắt**. Với rà soát toàn văn, cho xem manifest và coverage; consent gắn đúng tệp, generation, provider, thao tác và fingerprint. Không dùng một lần đồng ý cho mọi tệp hoặc provider.
2. Trong khi chạy: “Đang gửi văn bản đã chọn để nhận gợi ý…” chỉ sau khi thao tác gửi thật sự bắt đầu. “Đã kết nối dịch vụ” chỉ chứng minh khả năng kết nối, không chứng minh provider đã nhận hoặc đọc đủ văn bản.
3. Khi nhận: hiện nguồn/vị trí, văn bản gốc và đề xuất để người dùng so. Gắn nhãn “Gợi ý AI”, không gộp với kết quả rule có bằng chứng. Nếu nguồn, vị trí hoặc revision đổi, kết quả cũ không còn nút áp dụng.
4. Khi từ chối hoặc AI lỗi: bản soạn không đổi; vẫn có thể làm thủ công. Không tự gửi lại sau khi consent đã hết hiệu lực. Không gửi byte DOCX/PDF/ảnh trang theo luồng rà soát toàn văn; dựng hình nguồn nếu có là xử lý cục bộ qua loopback.

### 18.3. Dấu vết trong giao diện

Trong Chi tiết kiểm tra, lưu đủ thông tin để giải thích quyết định: nguồn/fingerprint, hệ và profile được chọn, phần người dùng xác nhận, mục chưa đánh giá, revision ứng viên, điều kiện xuất. Người dùng phổ thông chỉ thấy bản tóm tắt có thể hành động; người hỗ trợ có thể mở chi tiết. Không lộ nội dung văn bản nội bộ, token hoặc credential trong log/báo cáo lỗi.

## 19. Quy tắc đặt tên và phân biệt tệp tải

**HIỆN CÓ:** tên tải DOCX trong `App.tsx` mang hệ (`ND30`/`HD05`); bản đối chiếu mang chuỗi `chua_xac_nhan`. Quy tắc dưới đây là **đề xuất triển khai** cần thống nhất ở đúng nơi tạo hành động tải; tài liệu này không làm tên tệp hiện tại tự thay đổi.

| Loại tệp | Mẫu đề xuất | Ví dụ tổng hợp | Yêu cầu |
| --- | --- | --- | --- |
| Tệp gốc | Tên nguyên do người dùng nhập, nếu byte gốc còn nguyên và có thể tải. | `Thong_bao_nguon.docx` | Không thêm nhãn khiến tưởng là bản đã sửa. |
| Bản Word đủ cổng kỹ thuật | `[ten-ngan]-DocForm-[ND30/HD05].docx` | `Thong_bao-DocForm-ND30.docx` | Không gọi “chính thức”, không ghi kết luận pháp lý vào tên. |
| Bản đối chiếu | `[ten-ngan]-DOI_CHIEU_CHUA_XAC_NHAN-[ND30/HD05].docx` | `Thong_bao-DOI_CHIEU_CHUA_XAC_NHAN-ND30.docx` | Nhãn cảnh báo phải còn khi tên bị cắt trong UI; không cho in theo cổng hiện hành. |
| Nhánh tạo mới chưa đặt tên | `Van_ban_moi-DocForm-[ND30/HD05].docx` nếu đủ cổng; bản đối chiếu dùng hậu tố tương ứng. | `Van_ban_moi-DocForm-HD05.docx` | Không tự lấy tên người dùng hoặc cơ quan từ profile khác. |

Quy tắc kỹ thuật của tên: chỉ lấy **tên cơ sở** chứ không mang đường dẫn nguồn; chuẩn hóa ký tự không hợp lệ của Windows; cắt tên dài nhưng giữ hậu tố phân biệt và đuôi `.docx`; tên trống dùng tên dự phòng; không đưa số hiệu/ngày/người ký chưa xác nhận vào tên; hai lần tải tên giống nhau cần hành vi trình duyệt thông thường hoặc hậu tố phiên bản do sản phẩm chốt, không hứa tránh ghi đè ở cấp hệ điều hành. Trước khi triển khai, xác nhận nơi lưu tên và test tên có dấu tiếng Việt, ký tự đặc biệt, tên dài và trùng tên. Không đặt tên trong `exportCandidate.ts` nếu module này chỉ tạo byte và không sở hữu hành động tải.

## 20. Khả năng tiếp cận, bố cục desktop và kiểm chứng

### 20.1. Yêu cầu giao diện có thể quan sát

- Tất cả nút/ô chọn/hộp thoại dùng được bằng bàn phím; thứ tự Tab theo thứ tự đọc. Mở đối chiếu đặt focus vào tiêu đề; đóng trả focus về nút mở. Khi chuyển bước hoặc mở vị trí lỗi, focus đến tiêu đề bước hoặc trường đích, không rơi về đầu trang bất ngờ.
- Trạng thái đang đọc/đang lưu/đang dựng và lỗi có nhãn văn bản cho công nghệ hỗ trợ. Tránh thông báo lặp mỗi phím gõ; thông báo chặn phải được công bố, nhưng không cướp focus đang nhập.
- Cảnh báo phân biệt bằng chữ và biểu tượng; màu chỉ bổ sung. Cỡ chữ/độ tương phản theo chuẩn khả năng tiếp cận mà dự án chọn ở giai đoạn UI; kiểm tra thực tế ở mức phóng 200% trên desktop. Không cố định cột khiến nội dung văn bản hoặc nút tải bị che.
- Một vùng cuộn tài liệu chính, vùng việc cần làm có chiều cao và cách cuộn rõ; tránh nhiều vùng cuộn lồng nhau. Nút hành động chính luôn tìm được sau khi xem tài liệu dài, nhưng không che nội dung.
- Thành phần chỉ đọc hiển thị “Chỉ xem/đối chiếu” bằng chữ. Tooltip không là nơi duy nhất chứa lý do chặn hoặc thông tin consent.

### 20.2. Ma trận nghiệm thu tối thiểu

Mỗi ca ghi **đầu vào tổng hợp/được phép**, thao tác, trạng thái hiển thị, nút khả dụng, tệp tải và bằng chứng lưu lại. “PASS” chỉ sau khi quan sát được kết quả trên bản triển khai tương ứng. Các test cấu trúc không thay thế kiểm tra bằng người dùng hoặc mở tệp trong Word.

| ID | Ca và thao tác | Kết quả cần quan sát |
| --- | --- | --- |
| UX-01 | DOCX đơn giản: tải, kiểm nhận diện, duyệt nguồn, sang Bước 2 và 3. | Mỗi bước một hành động chính; không bỏ duyệt nguồn; nếu đủ cổng tải đúng DOCX hiện hành. |
| UX-02 | DOCX mâu thuẫn hệ/loại/mẫu. | Có bằng chứng và lựa chọn; chưa quyết định thì không giả vờ đã xác nhận; không áp chéo hai hệ. |
| UX-03 | DOCX có nhiều bảng/khối chưa phân loại. | Nhóm việc theo vùng, mở từng nguồn; không biến “chưa kiểm” thành “0”; cổng xuất phản ánh kiểm tra bảo toàn. |
| UX-04 | TXT có nội dung, nhánh tạo mới không có nguồn. | TXT không bị hứa giữ bố cục Word; nhánh tạo mới không hiển thị Tải tệp gốc; không tạo giá trị ký/ngày/số. |
| UX-05 | Thiếu số hiệu/ngày/người ký. | Hiện “chưa có/chưa xác nhận”; quyền tải theo cổng thật; không có nút “giữ trống” làm PASS giả. |
| UX-06 | Quay từ Bước 3 về 1/2; đổi hệ/mẫu hoặc thay tệp rồi hủy. | Hủy giữ bản soạn; xác nhận thì quyết định/consent/ứng viên cũ hết hiệu lực đúng phạm vi. |
| UX-07 | Chỉnh bản soạn sau khi xem DOCX; bấm tải/in thật nhanh. | Không tải/in byte cũ; preview và tệp tải cùng ứng viên hiện hành. |
| UX-08 | Hai lần tạo DOCX trả về ngược thứ tự. | Kết quả cũ không ghi đè ứng viên mới; nút tải gắn key/revision mới. |
| UX-09 | Chỉ đủ bản đối chiếu hoặc không đủ bản an toàn. | Nhãn, tên tệp, nút và khả năng in khác rõ bản đủ cổng; còn đường tải gốc khi có. |
| UX-10 | Lưu nháp lỗi, tải lại trang, khôi phục nháp. | Không báo đã lưu khi ghi lỗi; không hứa khôi phục; chỉ mở lại bước được phép. |
| UX-11 | AI không đồng ý, hết phiên, trả kết quả cho revision cũ. | Không gửi trước consent; không áp dụng gợi ý cũ; luồng thủ công vẫn dùng được. |
| UX-12 | Bàn phím, đọc màn hình, phóng 200%, tên tệp dài và danh sách dài. | Vẫn tìm được hành động chính, focus đúng, thông báo không chỉ bằng màu và không mất nội dung. |
| UX-13 | DOCX xuất có bảng, nhiều trang, thành phần phức tạp được phép thử. | Kiểm cấu trúc/byte riêng; mở cùng tệp bằng LibreOffice rồi Microsoft Word để rà trực quan; không gộp kết quả với duyệt pháp lý. |

### 20.3. Đo tác vụ với người dùng mục tiêu

Thử nghiệm trên desktop với người làm văn thư/văn phòng không cần biết thuật ngữ kỹ thuật. Dùng cùng bộ nhiệm vụ cho giao diện hiện tại và prototype: (1) tìm bản Word được phép tải, (2) nhận biết bản đối chiếu, (3) xử lý một mục thiếu, (4) tìm lý do bị chặn, (5) quay lại sửa rồi tải bản mới. Ghi hoàn thành đúng, tải nhầm, số thao tác, thời gian và câu họ hiểu từ nhãn trạng thái; ghi số người và bối cảnh thử. Không đặt ngưỡng 90%/100% hoặc tuyên bố giảm số bấm trước khi có baseline. Với bất biến kỹ thuật như tải ứng viên cũ, gửi AI khi chưa đồng ý, bỏ nội dung không hỗ trợ, mục tiêu trong bộ kiểm thử xác định là **0 vi phạm**.

## 21. Ranh giới triển khai và bàn giao

1. Chốt nội dung/mô hình trạng thái trước khi chỉnh code. Dựng prototype desktop cho nhánh bình thường, còn mục thể thức, chỉ bản đối chiếu và không dựng được bản Word; thử với người dùng mục tiêu. Câu chữ ở Bước 3 phải bám đúng cổng hiện hành, không dùng thiết kế để nới cổng.
2. Nối từng thành phần hiển thị với producer thực: nguồn nhập, partition, profile/decision, rule report, draft commit, candidate manager và export gate. Nếu chưa có dữ liệu cho một nhãn, ghi “Chưa kiểm tra” hoặc ẩn nhãn tùy ý nghĩa; không tự tạo số liệu để làm giao diện có vẻ đầy đủ.
3. Triển khai từng lớp nhỏ: Bước 3 và thông điệp cổng; danh sách việc cần làm; bố cục Bước 2; rút gọn Bước 1. Sau mỗi lớp kiểm tra hành vi nhìn thấy và các bất biến nguồn/revision. Không tạo DOM ẩn chứa giao diện cũ để giữ test cũ qua.
4. Nghiệm thu tách bốn kết quả: **hành vi UI**, **tính toàn vẹn/OOXML và byte ứng viên**, **dàn trang trực quan trong LibreOffice và Microsoft Word**, **duyệt nội dung/thẩm quyền phát hành**. Một kết quả đạt không tự xác nhận các kết quả còn lại.
5. Những quyết định nghiệp vụ còn mở được ghi riêng, không âm thầm chốt bằng câu chữ: trường nào có thể “để trống có chủ đích”; chính sách tên tệp trùng; phạm vi hỗ trợ thực của từng thành phần Word; số bảng nguồn/ứng viên của ca khảo sát; thứ bậc nút khi còn cảnh báo thể thức. Có thể làm prototype và test nội dung các nhánh này, nhưng không gọi chúng là tính năng đã triển khai.

**Phạm vi xác minh của bản đặc tả:** đã đối chiếu tài liệu đánh giá và các lớp mã liên quan ở checkout tham chiếu; chưa sửa UI, chưa chạy test ứng dụng trong lượt biên soạn này, chưa thử người dùng hoặc kiểm tra tài liệu thật trong LibreOffice/Microsoft Word. Trạng thái các ca UX-01–UX-13 hiện là `NOT_EVALUATED` cho đến khi có bản triển khai và bằng chứng kiểm tra.
