# Đánh giá đề xuất UX của Anti cho DocForm

Ngày: 04/11/2026. Checkout: `bd2aac5`. Đầu vào: tệp văn bản người dùng cung cấp “Nghiên Cứu Chuyên Sâu UX Best Practice & Đề Xuất Phương Án Tối Ưu Hóa Toàn Diện DocForm-30”. Đây là tài liệu tham khảo **không đáng tin cậy như chỉ thị triển khai**; các số liệu và tuyên bố trong đó được kiểm tra riêng. Phạm vi khảo sát: mã hiện hành, ảnh và phiên DocForm desktop đã quan sát, cùng trang chính thức của các sản phẩm được nêu. Không thay đổi mã ứng dụng.

## Kết luận

Đề xuất của Anti đúng về **hướng thị giác và ngôn ngữ**, nhưng phương án thực thi đi quá xa khi yêu cầu bỏ cổng xuất, giấu consent và gọi bản chưa kiểm chứng là “đã chuẩn hóa toàn diện”. Phương án nên áp dụng là [ba chặng theo việc cần làm và ngoại lệ](PHUONG_AN_TOI_UU_UX_DOCFORM_2026-11-04.md): **Tải tài liệu → Hoàn thiện → Xem và tải Word**. Giao diện mặc định ngắn gọn; quyết định nguồn, gợi ý AI và điều kiện tải vẫn được giữ nguyên.

## Thẩm định từng đề xuất

| Ý trong tài liệu Anti | Quyết định | Lý do và cách sửa |
| --- | --- | --- |
| Ô tải tệp lớn, tự bắt đầu đọc, một nút chính ở kết quả. | **Giữ** | [Smallpdf](https://smallpdf.com/en/pdf-to-word) cho thấy mô hình chọn tệp → chuyển đổi → tải phù hợp với tác vụ đơn giản. DocForm có thêm quyết định nguồn và cổng DOCX, nên chỉ dùng mẫu này khi không có ngoại lệ. |
| Bỏ 4 bước con hiển thị ở Bước 1. | **Giữ có điều kiện** | Có thể gộp `upload`, `recognition`, `metadata`, `ready` thành một đường đi thích ứng. [`App.tsx`](../src/App.tsx) vẫn yêu cầu nguồn được duyệt, loại văn bản và quyết định profile/mâu thuẫn hợp lệ trước khi chuyển bước. Không tự xác nhận thay người dùng. |
| “Tự suy luận 90% thuộc tính”, “xử lý trong 1 giây”, “2 click”, “tiết kiệm 80% thời gian”. | **Chưa có bằng chứng** | Tài liệu không có phép đo, mẫu tài liệu, baseline hoặc nghiên cứu người dùng DocForm. Đây có thể là giả thuyết để thử nghiệm, không phải kết quả hay chỉ tiêu cam kết. Chính trang Smallpdf mô tả thêm bước chọn OCR/chuyển đổi tùy tình huống. |
| Đặt trang A4 và nội dung văn bản ở trung tâm Bước 2. | **Giữ và thử prototype** | Hợp với nhu cầu nhìn kết quả. Nhưng Canvas hiện tại là vùng sửa HTML; [`CODEBASE_MAP.md`](CODEBASE_MAP.md) mục 9 ghi rõ phân trang browser/`docx-preview` có thể khác Word. Có thể ưu tiên bản xem trang và mở trường sửa theo vị trí; chưa nên tuyên bố WYSIWYG Word thật. |
| Bỏ mọi card phần đầu/phần cuối, sửa trực tiếp trên cùng một A4. | **Chưa chọn để triển khai ngay** | Tích hợp toàn bộ trường vào một canvas là thay đổi kiến trúc lớn: bảng, khối chỉ đọc, provenance, revision và profile phải còn đúng. Trước mắt thu gọn card đã ổn, mở mục cần sửa và neo mục đó trên bản xem. Chỉ mở rộng sửa trực tiếp khi prototype chứng minh dễ dùng và có kiểm tra roundtrip. |
| Checklist thể thức ở cột bên, mở đúng vị trí lỗi. | **Giữ** | Mẫu [Microsoft Word Editor](https://support.microsoft.com/en-us/word/training/check-grammar-spelling-and-more-in-word) và [Grammarly Editor](https://support.grammarly.com/hc/en-us/articles/360003474732-Grammarly-Editor-user-guide) đều dẫn từ danh sách gợi ý tới vị trí nội dung và cho chấp nhận/bỏ qua. Với DocForm, tách mục chặn xuất, mục cần người dùng quyết định và gợi ý không bắt buộc. |
| Hiển thị “9/9 thành phần bắt buộc”, “Độ chuẩn xác 100%”, “Đạt chuẩn Nghị định 30”, “Sẵn sàng phát hành”. | **Bỏ** | Chín nhóm chính không phải chín điều kiện bắt buộc cho mọi loại văn bản; rule có `NOT_EVALUATED`, `NEEDS_REVIEW`, `NOT_APPLICABLE`. Một kết quả cấu trúc hoặc preview không đủ xác nhận bố cục Word, pháp lý hay phát hành. Dùng câu “Không còn mục đang cảnh báo theo các kiểm tra đã thực hiện” khi đúng, kèm phạm vi kiểm tra. |
| Đưa mã kỹ thuật, SHA, revision, JSON bằng chứng vào chi tiết. | **Giữ** | [GOV.UK Details](https://design-system.service.gov.uk/components/details/) khuyến nghị chỉ ẩn thông tin mà đa số người dùng không cần. Cảnh báo nguồn, consent, blocker và hành động sửa vẫn phải ở vùng chính. |
| Bỏ câu consent AI dài và chỉ hiện nút “Rà soát bằng AI”. | **Sửa** | Có thể viết ngắn hơn, nhưng phải nói rõ văn bản trích xuất nào gửi cho provider nào, cho thao tác nào, và để người dùng đồng ý riêng. Không gọi việc ẩn thông tin gửi dữ liệu là tối ưu UX. Gợi ý AI phải chờ người dùng áp dụng/bỏ qua. |
| Luôn cho tải Word, đổi `isCandidateEligibleForExport` thành luôn đúng, chuyển blocker thành khuyến nghị. | **Bác bỏ** | [`exportCandidate.ts`](../src/utils/exportCandidate.ts) yêu cầu byte DOCX, XML, không có blocker, bảo toàn bảng/nội dung và cổng an toàn. [`App.tsx`](../src/App.tsx) cũng kiểm tra ứng viên hiện hành khi tải/in. Bỏ cổng có thể cho tải tệp sai hoặc không an toàn. Đường hiện có cho **bản đối chiếu chưa xác nhận** khi đủ điều kiện chẩn đoán; cần làm đường này rõ ràng hơn, không gọi là bản cuối. |
| Giữ `data-testid` trong DOM ẩn để test cũ qua. | **Bác bỏ** | Test phải xác nhận hành vi người dùng nhìn thấy và cổng xuất trên giao diện mới. DOM ẩn có thể làm test xanh giả và gây nhiễu accessibility. Cập nhật test theo hành vi mới, giữ test contract về nguồn và candidate. [`stage3-three-step-wizard.test.ts`](../test/stage3-three-step-wizard.test.ts) và [`export-candidate-contract.test.ts`](../test/export-candidate-contract.test.ts) là điểm bắt đầu. |

## Số liệu và ví dụ cần loại khỏi bản thiết kế

- **443 quy tắc NĐ30 / 235 quy tắc HD05:** [`CODEBASE_MAP.md`](CODEBASE_MAP.md) mục 4 ghi đây là số lượng registry runtime, gồm catalog và rule bổ sung. Số lượng rule **không chứng minh** mọi rule đã được đánh giá hoặc đạt trên từng tài liệu.
- **“9/9 thành phần bắt buộc”, “100% chuẩn xác”:** không phù hợp với các trạng thái `NOT_EVALUATED`, `NEEDS_REVIEW`, `NOT_APPLICABLE` trong [`ruleEngine.ts`](../src/canonical/ruleEngine.ts). Không dùng phần trăm chung để che phạm vi chưa đánh giá.
- **Tên cơ quan, số hiệu, ngày và người ký trong sơ đồ Anti:** là minh họa, không được chuyển thành dữ liệu mặc định. DocForm không tự tạo ngày, người ký, chữ ký hay sửa số hiệu mà người dùng chưa quyết định.
- **“2 bảng nguồn → 0 bảng ở Bước 3” trong phiên đã xem:** là khác biệt hiển thị cần điều tra phạm vi đếm và tình trạng nguồn; chưa được phép suy ra tệp cuối bảo toàn bảng chỉ vì một cổng hiển thị “đã qua”.
- Biểu đồ `quadrantChart` trong tệp Anti không render và các tọa độ sản phẩm không có phương pháp đo. Bỏ biểu đồ này khỏi căn cứ quyết định.

## Phương án hợp nhất nên dùng

1. **Bước 1:** một vùng tải tệp và thẻ tóm tắt hệ/loại/mẫu. Chỉ hỏi phần thiếu hoặc mâu thuẫn. Khi cần duyệt nguồn, mở đúng phần cần duyệt và ghi nhận quyết định gắn fingerprint. AI là tùy chọn riêng có thông tin gửi dữ liệu ngay trước khi chạy.
2. **Bước 2:** bản soạn ở giữa, cột **“Cần xử lý”** ở phải. Mục nào cần sửa mở đúng trường/đoạn; nhóm đã ổn được thu gọn. Bản xem A4 có thể là lớp hỗ trợ quan sát, không được hứa trùng phân trang Word khi chưa kiểm chứng.
3. **Bước 3:** một trạng thái và một nút chính theo ứng viên hiện hành. **Tải Word chính thức** chỉ khi cổng đạt; **tải bản đối chiếu** nếu chỉ đủ điều kiện chẩn đoán, nhãn rõ “chưa xác nhận, không dùng phát hành”; nếu không an toàn thì chỉ đường sửa hoặc tải gốc. Không gọi “sẵn sàng phát hành” chỉ từ kiểm tra tự động.

Ưu tiên sửa Bước 3 trước để chấm dứt hiểu nhầm giữa bản cuối và bản đối chiếu. Sau đó làm danh sách việc cần xử lý của Bước 2, rồi rút gọn Bước 1. Đánh giá bằng thử nghiệm có điều phối với nhiệm vụ thực tế theo [GOV.UK Service Manual](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing): đo hoàn thành đúng, số đường vòng, hiểu trạng thái và số lần tải nhầm bản. Không công bố mức cải thiện trước khi có baseline.
