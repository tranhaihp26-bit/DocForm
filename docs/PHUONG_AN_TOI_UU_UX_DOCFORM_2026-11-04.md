# Phương án UX ưu tiên cho DocForm: 3 bước theo việc cần làm

Ngày: 04/11/2026. Checkout được khảo sát: `bd2aac5`. Phạm vi: luồng desktop nhập DOCX/TXT để nhận DOCX đã định dạng. Đây là nghiên cứu và đặc tả đề xuất, **chưa triển khai hoặc nghiệm thu**. Tài liệu khảo sát ban đầu: [Đề xuất đơn giản hóa 3 bước](DE_XUAT_DON_GIAN_HOA_GIAO_DIEN_3_BUOC_2026-11-04.md).

## Quyết định đề xuất

Giữ ba chặng nghiệp vụ **Tải tài liệu → Hoàn thiện → Xem và tải Word**, nhưng biến chúng thành luồng **theo ngoại lệ**: hệ thống tự kiểm tra ở nền và chỉ yêu cầu người dùng xử lý điều còn thiếu, mâu thuẫn hoặc chưa được duyệt. Một trạng thái xuất duy nhất, một danh sách việc cần làm và một nút chính trên mỗi màn hình. Không tự bỏ qua duyệt nguồn, không tự áp dụng AI, không điền thông tin chưa có và không nới cổng toàn vẹn DOCX.

Đây là phương án tốt nhất **theo bằng chứng hiện có**, chưa phải kết luận từ thử nghiệm với người dùng DocForm. Nó giảm số màn hình mặc định mà vẫn giữ ba ranh giới cần thiết: duyệt nguồn, quyết định nội dung/thể thức và kiểm tra byte ứng viên xuất.

## Bằng chứng và mẫu tham chiếu

| Nguồn/dự án | Điều đã được mô tả trong nguồn | Áp dụng cho DocForm | Giới hạn khi suy rộng |
| --- | --- | --- | --- |
| [GOV.UK Task list](https://design-system.service.gov.uk/components/task-list/) và [Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/) | Việc cần làm có trạng thái, người dùng mở đúng việc, số loại trạng thái nên ít. | Một danh sách **Cần xử lý** dẫn tới đúng trường/khối, thay cho nhiều bảng trạng thái phân tán. | DocForm có phụ thuộc thứ tự duyệt nguồn và cổng xuất; không cho làm mọi việc tùy ý. |
| [GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/) | Tóm tắt quyết định trước bước xác nhận; cho sửa câu trả lời mà giữ dữ liệu đã nhập. | Một thẻ tóm tắt hệ thể thức, loại văn bản, mẫu cơ quan trước khi soạn; cho sửa đúng lựa chọn. | Tóm tắt không thay việc đối chiếu DOCX thật. |
| [GOV.UK Validation](https://design-system.service.gov.uk/patterns/validation/) và [Error summary](https://design-system.service.gov.uk/components/error-summary/) | Lỗi nêu cách sửa, hiện ở đầu và cạnh trường, liên kết và chuyển focus tới chỗ lỗi; giữ dữ liệu đã nhập. | Khi không thể tiếp tục/xuất: nói **thiếu gì, ở đâu, phải làm gì**; nút đi tới vị trí đó. | Không gọi mọi cảnh báo là lỗi nhập liệu; có cảnh báo nguồn/cổng xuất mà người dùng không thể sửa trực tiếp. |
| [GOV.UK Details](https://design-system.service.gov.uk/components/details/) và [NN/g Complex Applications](https://www.nngroup.com/articles/complex-application-design/) | Nội dung ít người cần có thể mở khi cần; ứng dụng phức tạp nên giảm rối mà vẫn giữ năng lực. | Đưa ID khối, coverage, SHA, revision, mô tả cổng và công cụ AI vào chi tiết. | Không giấu cảnh báo, bằng chứng mâu thuẫn, consent hoặc hành động bắt buộc. |
| [Microsoft Word Editor](https://support.microsoft.com/en-us/word/training/check-grammar-spelling-and-more-in-word) và [Accessibility Assistant](https://support.microsoft.com/en-us/accessibility/office-accessibility/improve-accessibility-in-your-documents-with-the-accessibility-assistant) | Vấn đề được đánh dấu tại nội dung, bảng bên giúp đi từng vấn đề và gợi ý cách xử lý. | Danh sách việc cần làm nằm cạnh bản soạn; chọn mục sẽ mở đúng trường/đoạn. | Các gợi ý trong Word không xác nhận thể thức pháp lý của DocForm. |
| [Google Docs Suggesting](https://support.google.com/docs/answer/6033474) | Gợi ý có thể chấp nhận hoặc từ chối, nguồn không đổi trước quyết định. | AI và đề xuất vẫn nằm trong luồng duyệt riêng, gắn vị trí nguồn. | Không dùng “áp dụng tất cả” làm lối tắt mặc định cho tài liệu có bảng/khối chưa xác minh. |
| [Adobe Acrobat Preflight](https://helpx.adobe.com/acrobat/using/analyzing-documents-preflight-tool-acrobat.html) | Kiểm tra và sửa là hai thao tác khác nhau; có vấn đề cần sửa ở nguồn. | Tách “đã kiểm tra” khỏi “đã sửa/đủ điều kiện tải”; mở đúng nguồn khi lỗi không sửa ở bước xuất. | Preflight PDF không chứng minh DOCX tương thích Word hoặc tuân thủ NĐ30/HD05. |
| [WCAG 2.2: Error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification) và [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Lỗi cần mô tả bằng chữ; thay đổi trạng thái phải nhận biết được bằng công nghệ hỗ trợ. | Trạng thái không dựa riêng vào màu; thông báo khi kiểm tra xong, khi bản ứng viên bị vô hiệu, khi còn việc cần làm. | Cần kiểm chứng bằng bàn phím và trình đọc màn hình trên giao diện thật. |

Các mẫu trên là **tham chiếu thiết kế**, không phải bằng chứng người dùng DocForm đã hiểu hoặc thao tác nhanh hơn. Hướng dẫn [GOV.UK về thử nghiệm có điều phối](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing) yêu cầu quan sát người dùng làm nhiệm vụ thực tế; đó là bước quyết định trước khi gọi phương án này là tối ưu đã được xác nhận.

## So sánh các phương án

| Phương án | Lợi ích | Rủi ro/công sức | Kết luận |
| --- | --- | --- | --- |
| Giữ nguyên 3 bước, chỉ đổi câu chữ và thu gọn thẻ | Ít sửa mã. | Vẫn còn bốn màn hình con của Bước 1 và trạng thái rải rác; giảm chữ nhưng không giảm lượt thao tác. | Chưa đủ. |
| Một nút “Tự động chuẩn hóa và tải” | Có vẻ nhanh trên tài liệu đơn giản. | Dễ che khuất quyết định hệ/loại/mẫu, duyệt nguồn, dữ liệu chưa hỗ trợ và gợi ý AI; có thể hứa sai về đầu ra. | Không chọn. |
| Hai màn hình Tải → Tải kết quả, tự bỏ qua soạn thảo | Ngắn với ca không có ngoại lệ. | Khi có thiếu/mâu thuẫn phải mở luồng sửa phức tạp; khó biểu thị trạng thái trung gian. | Chỉ dùng như **đường đi nhanh bên trong 3 chặng** khi không có việc cần làm. |
| **Ba chặng theo ngoại lệ** | Người dùng thấy đúng việc cần làm; các cổng và nguồn vẫn minh bạch; có đường nhanh khi sạch. | Cần chuẩn hóa trạng thái và liên kết đến vị trí sửa. | **Chọn.** |

## Hợp đồng hiển thị chung

Không dựng một “điểm chuẩn” tổng hợp. Dùng ba nhóm trạng thái độc lập:

1. **Nguồn:** chưa tải / đang đọc / cần đối chiếu hoặc xác nhận / đã duyệt cho đúng tệp.
2. **Thể thức và nội dung:** thiếu dữ liệu / cần người dùng xem / không có mục đang cảnh báo theo bộ kiểm tra hiện có. Điều kiện này không tự chứng minh hợp pháp hoặc sẵn sàng phát hành.
3. **DOCX xuất:** chưa tạo / đang kiểm / đủ điều kiện tải chính thức / chỉ có bản đối chiếu / không thể dựng an toàn. Trạng thái cuối lấy từ ứng viên hiện hành, không lấy từ việc người dùng đã đi qua Bước 2.

Mỗi mục trong danh sách việc cần làm có: câu mô tả dễ hiểu, mức ảnh hưởng đến **tải bản cuối** hay **chỉ cần xem lại**, vị trí nguồn/trường, một hành động “Xem/Sửa”, và lý do kỹ thuật trong chi tiết. Danh sách được tính lại từ nguồn, quyết định người dùng, báo cáo thể thức và ứng viên hiện hành; không lưu một cờ “đã hoàn thành” độc lập có thể lỗi thời.

### Quy tắc đặt nhãn cho bản Word

| Cổng DOCX | Báo cáo thể thức | Nhãn chính | Hành động |
| --- | --- | --- | --- |
| Đủ điều kiện tải | Không có mục đang cảnh báo theo kiểm tra hiện có | “Có thể tải bản Word” | “Tải Word (.docx)” |
| Đủ điều kiện tải | Có mục cần xem lại | “Có thể tải Word, còn N mục thể thức cần xem” | “Xem và sửa” nổi bật; tải Word vẫn có thể dùng theo cổng hiện hành, không gọi tệp “đã chuẩn”. |
| Chỉ có bản đối chiếu | Bất kỳ | “Chưa thể tải bản Word hoàn chỉnh” | “Xử lý vấn đề”; bản chẩn đoán nằm ở lựa chọn phụ “Tải bản đối chiếu, không dùng phát hành”. |
| Không thể dựng an toàn | Bất kỳ | “Chưa thể tạo bản Word an toàn” | “Đối chiếu nguồn” hoặc “Tải tệp gốc” khi có nguồn. |

## Màn hình và đường đi cụ thể

### Chặng 1 — Tải tài liệu

**Màn hình mặc định:** tiêu đề “Tải tài liệu cần định dạng”; một vùng chọn DOCX/TXT; một câu giải thích nguồn được giữ để đối chiếu. Sau tải, hiển thị tên tệp, trạng thái đọc, tóm tắt ba quyết định **hệ thể thức · loại văn bản · mẫu cơ quan**. Nếu dữ liệu nhận diện rõ và nguồn đã được duyệt theo đúng fingerprint, hành động chính là **“Tiếp tục hoàn thiện”**. Nếu chưa duyệt, hành động là **“Kiểm tra nội dung đã đọc”**; mở thẳng vị trí cần xác nhận, sau đó cho người dùng duyệt nguồn bằng thao tác rõ ràng.

**Ngoại lệ:** vấn đề bố cục/khối không hỗ trợ, mâu thuẫn hệ/loại/mẫu và nội dung chưa phân loại hiện ngay trên vùng chính. Không giấu những mục này trong `details`; các chi tiết parser, số khối, coverage và tùy chọn AI mới nằm ở “Thông tin thêm”. Consent gửi văn bản trích xuất tới provider phải độc lập và hiện đúng lúc người dùng chọn AI.

**Giảm lượt:** bốn `phase` hiện hành (`upload`, `recognition`, `metadata`, `ready`) trở thành một đường đi điều kiện. Chỉ hiện trang/câu hỏi riêng khi cần quyết định; việc duyệt nguồn không tự động biến mất.

### Chặng 2 — Hoàn thiện

**Bố cục desktop:** bản soạn chiếm trọng tâm; bên phải là “Cần xử lý” theo thứ tự: phần ảnh hưởng đến khả năng xuất, mục thể thức cần xem, gợi ý không bắt buộc. Chọn mục sẽ cuộn, mở nhóm, đặt focus ở trường/đoạn tương ứng. Các nhóm 9 thành phần vẫn có trong dữ liệu và báo cáo, nhưng nhóm đã ổn được thu gọn; phần đầu, nội dung, phần cuối được đặt bằng tên người dùng hiểu. Không hiện khối phụ lục rỗng và không mở trợ lý AI mặc định.

**Hành động chính:** “Xem bản Word”. Trước khi đi tiếp, không chặn chỉ vì có khuyến nghị không bắt buộc; nếu còn thiếu quyết định nguồn hoặc dữ liệu chặn cổng, hiển thị danh sách ở đầu và cạnh trường. Gợi ý AI chỉ mở khi người dùng chọn, có phạm vi gửi và quyết định áp dụng/bỏ qua riêng.

### Chặng 3 — Xem và tải Word

**Bố cục desktop:** bản xem DOCX hiện hành bên trái; bên phải là một thẻ trạng thái và hành động chính theo ma trận trên. Nút “Kiểm tra lại” chỉ hiện khi kiểm tra chưa chạy, có lỗi hoặc người dùng cần chạy lại; không chiếm vị trí trên cùng khi ứng viên đã hiện hành. Thông tin bảng/nội dung/an toàn, SHA và revision nằm trong “Chi tiết kiểm tra”. Bản đối chiếu chưa xác nhận không được đặt cạnh nút tải bản cuối với cùng mức nhấn mạnh.

Khi người dùng sửa bản soạn, hủy trạng thái ứng viên cũ ngay; preview, download và print chỉ dùng cùng byte ứng viên mới. Bản in/PDF trình duyệt giữ nhãn **tham khảo** và không được trình bày là đã đối chiếu phân trang trong Word.

## Ví dụ câu chữ cho trường hợp đang quan sát

> **Chưa thể tải bản Word hoàn chỉnh**\
> Còn phần nguồn cần đối chiếu và thông tin thể thức cần xem.\
> 1. So sánh 2 phần với tệp gốc — **Mở đối chiếu**\
> 2. Kiểm tra số, ký hiệu văn bản — **Mở trường**\
> 3. Bổ sung hoặc xác nhận ngày ban hành — **Mở trường**\
> **Xem bản đối chiếu trong Word** (chưa xác nhận, không dùng phát hành)

Đây là ví dụ giao diện, không khẳng định cả ba mục đều là blocker của cổng DOCX. UI phải gắn nhãn mức ảnh hưởng từ trạng thái thật. Trong phiên khảo sát, Bước 1 báo 2 bảng nguồn còn tóm tắt ứng viên ở Bước 3 báo 0 bảng; phải làm rõ phạm vi đếm trước khi đưa số bảng vào tóm tắt tin cậy.

## Lộ trình triển khai ít rủi ro

1. **Chuẩn hóa cách diễn đạt trạng thái:** dựng một lớp trình bày lấy dữ liệu từ state hiện có trong [`../src/App.tsx`](../src/App.tsx), [`../src/components/ImportStepView.tsx`](../src/components/ImportStepView.tsx), [`../src/components/WorkspaceEditor.tsx`](../src/components/WorkspaceEditor.tsx), [`../src/components/WorkspaceExport.tsx`](../src/components/WorkspaceExport.tsx). Không thay logic gate. Xác định blocker, quyết định bắt buộc, khuyến nghị và vị trí sửa.
2. **Đổi Bước 3 trước:** đây là nơi người dùng quyết định tải tệp. Một trạng thái, một nút chính, danh sách việc cần làm và nhãn bản đối chiếu. Giữ byte/revision/fidelity gate và đường tải gốc.
3. **Đổi Bước 2:** mặc định mở “Cần xử lý”, thu gọn nhóm đạt, cho mở AI/công cụ khi cần. Thử thao tác chuột/bàn phím trên desktop.
4. **Rút ngắn Bước 1:** gộp màn hình con theo điều kiện sau khi chứng minh các quyết định nguồn và modal duyệt vẫn ghi nhận đúng tệp. Không dùng một xác nhận chung để thay consent AI hoặc phê duyệt phân vùng.
5. **Thử nghiệm và điều chỉnh câu chữ:** dùng tệp không có vấn đề, tệp thiếu thông tin, tệp nguồn mâu thuẫn, tệp có bảng/khối không hỗ trợ, và ứng viên chỉ có bản đối chiếu. Thử trên dữ liệu được phép sử dụng; không đưa văn bản nội bộ vào báo cáo.

## Điều kiện xác nhận phương án thực sự tốt hơn

- So sánh prototype cũ/mới bằng nhiệm vụ: “Nhận DOCX có thể tải”, “Xác định vì sao chưa tải được”, “Tìm và sửa mục còn thiếu”, “Nhận ra bản đối chiếu không dùng phát hành”. Ghi tỷ lệ hoàn thành đúng, số thao tác/đường vòng, thời gian, lỗi chọn nhầm bản, và mức hiểu trạng thái; không đặt ngưỡng thành công tùy ý trước khi có baseline.
- Kiểm tra khả năng dùng bàn phím: danh sách dẫn đúng vị trí, focus sau chuyển bước và sau lỗi, tên nút có nghĩa, thông báo trạng thái đọc được, cảnh báo không chỉ dựa vào màu. Tuân theo [WCAG 2.2 về thứ tự focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) và các tiêu chí lỗi/trạng thái nêu trên.
- Kiểm tra nguồn và xuất: không tự điền ngày/người ký/chữ ký; không bỏ bảng/khối chưa phân loại; nguồn mới buộc duyệt mới; AI không tự áp dụng; ứng viên cũ bị vô hiệu sau sửa; bản xem/tải/in cùng byte. Đối chiếu bản xuất bằng LibreOffice trước và Microsoft Word cùng mẫu để đánh giá bố cục; kiểm tra cấu trúc không thay cho nhìn trang thật hoặc duyệt pháp lý.

## Kết luận

Đầu tư đầu tiên nên là **một danh sách việc cần làm xuyên suốt và một trạng thái xuất không gây hiểu nhầm**. Việc rút ngắn số lần bấm ở Bước 1 chỉ an toàn sau khi lớp này dẫn người dùng qua đúng các quyết định nguồn. Phương án giữ năng lực chuyên sâu, nhưng đưa chúng ra khỏi đường đi mặc định của người chỉ muốn DOCX cuối.
