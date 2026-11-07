# DOCFORM — MỤC TIÊU SẢN PHẨM CUỐI, PHẠM VI CAM KẾT VÀ NGHIỆM THU NGƯỜI DÙNG

**Phiên bản:** PRODUCT-END-STATE-v1.0 — 07/11/2026  
**Tình trạng:** Đặc tả mục tiêu đích và cổng nghiệm thu; **chưa phải tuyên bố sản phẩm đã đạt**.  
**Kế hoạch thực thi duy nhất:** [Master Roadmap DocForm](../roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md).  
**Căn cứ:** [Chính sách V2.2](../DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md), [UX 3 bước](../DAC_TA_NOI_DUNG_UX_3_BUOC_DOCFORM_2026-11-04.md), [Profile Source Matrix](../profile/PROFILE_SOURCE_MATRIX.md), [đánh giá audit 07/11](../roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md), Project Memory.  
**Phạm vi ban đầu:** văn bản hành chính và văn bản Đảng sử dụng profile Công ty Hoa tiêu Hàng hải Miền Bắc/Đảng ủy tương ứng; mở rộng sau khi có bằng chứng. Không tự coi mọi mẫu trong kho skill offline là đã hỗ trợ ở DocForm.

## 1. Định nghĩa sản phẩm cuối cùng

DocForm là **công cụ làm văn bản văn phòng thực tế**, giúp cán bộ/văn thư không có kiến thức lập trình tự **tạo mới hoặc nhập DOCX/TXT → rà soát nguồn → chỉnh sửa và chuẩn hóa → tải DOCX sửa tiếp được** với ít thao tác không cần thiết, không mất dữ liệu, không phải sửa lại thể thức profile đã chốt. Có bản xem/PDF khi môi trường renderer thực sự hỗ trợ.

Thành công là **công việc của người dùng được hoàn thành**, không phải số rule, số PR, số bài test, cấu trúc OOXML hay việc ứng dụng đã chạy được trên máy lập trình. Công nghệ (React, Tiptap, docx.js, WPS/LibreOffice/COM, AI, trình duyệt hay launcher) chỉ phục vụ mục tiêu này.

**Bảy kết quả cuối phải chứng minh được:**

1. Người dùng mở và vận hành DocForm trong mô hình phân phối đã công bố mà không cần sửa mã hoặc biết lệnh npm.
2. Người dùng chọn đúng hệ, loại và profile, hiểu rõ cái gì được ứng dụng tự làm và cái gì cần họ quyết định.
3. Người dùng nhìn thấy, sửa được các thành phần đã cam kết; phần không hỗ trợ hiển thị trung thực và có đường xử lý.
4. Văn bản xuất đúng **từng thông số profile có hiệu lực**; chỉ thuộc tính profile thiếu mới fallback ND30/HD05 đúng hệ.
5. DOCX đầu ra mở và sửa được trong ứng dụng Office cam kết; không mất/thêm/đổi nội dung, bảng, hình, chú thích hoặc dữ liệu thể thức ngoài phần được duyệt.
6. Lưu nháp, quay lại, khôi phục và xuất lại bản mới đúng revision, không nhầm ứng viên cũ và không âm thầm làm mất công việc.
7. Người dùng gặp lỗi có thể hiểu và tự xử lý phần phổ biến, có hướng dẫn ngắn, không bị buộc sử dụng AI hoặc PDF để hoàn thành DOCX.

## 2. Người sử dụng, công việc và ranh giới

| Nhóm | Mục tiêu quan sát được | Không bắt họ phải biết |
|---|---|---|
| Văn thư/nhân viên văn phòng | Tạo công văn, thông báo, báo cáo, kế hoạch; sửa đoạn/bảng đơn giản; xuất tệp Word đúng profile | OOXML, số twips, lineRule, SHA, source IDs |
| Người rà soát nội bộ | Xem mục còn thiếu, đối chiếu nội dung/nguồn, yêu cầu sửa, phân biệt bản nháp và bản đủ điều kiện tải kỹ thuật | GitHub, coding agent, CI |
| Người quản trị triển khai | Cài/mở/nâng cấp, sao lưu hoặc khôi phục, kiểm máy WPS/renderer, khắc phục lỗi | Không cần chỉnh mã chỉ để mở ứng dụng hằng ngày |

**Ngoài phạm vi mặc định:** Word clone đủ mọi chức năng Office 365, hệ thống văn thư điện tử/luân chuyển phê duyệt, ký số/phát hành chính thức, thay đổi hiệu lực pháp luật, cloud multi-user/CMS, AI bắt buộc, tối ưu bảng tự động không kiểm soát. Không tự xây các hệ thống này nếu không có nhu cầu mới và quyết định rõ.

**Quy tắc sản phẩm đặc thù:** Hồ sơ theo profile Công ty có thể có thông số riêng khác giá trị ND30/HD05; DocForm phải áp/QA đúng profile đã chọn, **không báo xung đột pháp lý cho field đã có profile**. Việc phê duyệt pháp lý và ký/phát hành là quy trình riêng của người có thẩm quyền.

## 3. Hai mức sản phẩm: không đánh đồng MVP và hoàn thiện

| Mức | Phạm vi công bố | Điều kiện cho phép gắn nhãn |
|---|---|---|
| **M0 — Development / Technical Candidate** | Có mã/test và một số DOCX kỹ thuật; phục vụ phát triển | Test kỹ thuật có bằng chứng. Không được quảng bá là sản phẩm văn thư sẵn dùng |
| **M1 — MVP/Pilot nội bộ có kiểm soát** | Các loại văn bản và thao tác đã được đánh dấu SUPPORTED_END_TO_END; các loại khác review hoặc không hỗ trợ | Phải qua Gates T, U-pilot, R và S dưới đây, có Word/WPS thật trên corpus M1 và người dùng mục tiêu thực hiện được quy trình ba bước |
| **M2 — Sản phẩm dùng thường xuyên/hoàn thiện theo phạm vi đã công bố** | Ma trận hỗ trợ mở rộng có bằng chứng cho các loại văn bản và môi trường đã cam kết; vận hành, phục hồi, hướng dẫn đầy đủ | Phải qua tất cả Gates T/U/O/R/S; không còn blocker P0 trong phạm vi release; có quy trình cập nhật/rollback và chấp nhận của người dùng |

**Đích cuối của dự án là M2 trong phạm vi được công bố**, không phải chờ vô hạn đến khi hỗ trợ mọi tính năng của Word. M1 là cột mốc để kiểm chứng với người thật; M1 không được gọi là M2.

## 4. Bản đồ phạm vi tính năng phải khóa trước khi tuyên bố sản phẩm hỗ trợ

### 4.1. Trạng thái chuẩn theo từng hệ, loại văn bản, thao tác, ứng dụng Office

- **SUPPORTED_END_TO_END:** đã kiểm Import/New → Edit → Export → mở/sửa DOCX; có bằng chứng cho đúng loại dữ liệu.
- **SUPPORTED_WITH_REVIEW:** xử lý có điều kiện; các vùng chưa được chứng minh phải được duyệt/đối chiếu rõ.
- **READ_ONLY_SOURCE:** giữ và hiển thị nguồn; không tạo ô sửa giả hoặc tuyên bố đã chuẩn hóa vùng đó.
- **UNSUPPORTED:** không đủ bằng chứng bảo toàn hoặc không có chức năng; giữ nguồn và nói rõ lý do.
- **BLOCKED_BY_MASTER:** thiếu golden/profile được phê duyệt cho trường quan trọng.
- **NOT_VERIFIED:** chưa chạy thử cụ thể; không được gộp vào bất kỳ nhãn “đã hỗ trợ” nào.

Mỗi dòng trong Support Matrix có ít nhất: regime, loại văn bản, tạo mới/nhập, nguồn DOCX/TXT, header, body, title/subject/V-v, danh sách, bảng, ảnh/shape, phần cuối, nguồn/phiên, PDF, ứng dụng Office/version, trạng thái, bằng chứng, hạn chế và hướng thoát khi không hỗ trợ.

### 4.2. Bốn tuyến pilot đầu tiên (phạm vi thẩm định, chưa mặc định đạt)

| Tuyến | Kết quả phải chứng minh | Rủi ro phải kiểm |
|---|---|---|
| ND30 có tên loại | Tạo/nhập thông báo/báo cáo theo mẫu được phê duyệt; body/profile và line đúng điều kiện | Header ND30 date right/center, issuer Exactly15/16 đang mâu thuẫn; không tự chốt |
| ND30 công văn | Đúng V/v, Kính gửi, không thêm heading/đường gạch không áp dụng | Trích yếu dài, nhiều người nhận, khoảng cách và chia trang |
| HD05 có tên loại | Đúng header Đảng, dấu *, năm dấu gạch nối khi áp dụng, tiêu đề 15pt integer, body 14/Exactly19 | Chủ thể Đảng theo phiên bản mẫu và phần cuối đang chờ xác minh |
| HD05 công văn | Không trộn ND30, trình bày V/v/nơi nhận đúng role | Chỉ dùng giá trị HD05 đã có nguồn; fallback khi thuộc tính profile thiếu |

**Không suy “9 nhóm ND30 + 9 nhóm HD05”, 31 nhóm hay 209/64 mẫu trong thư viện đồng nghĩa hỗ trợ 100% ở runtime.** Mỗi nhóm thêm vào M2 phải có dòng ma trận và evidence tương đương.

## 5. Hợp đồng chức năng theo hành trình ba bước

### Bước 1 — Bắt đầu/nhập

**P-IMP-01:** mở tài liệu DOCX/TXT hoặc tạo mới; giữ byte nguồn độc lập để tải/so, phân biệt đã đọc/đang đọc/đọc lỗi.  
**P-IMP-02:** hiển thị và cho xác nhận hệ ND30/HD05, loại và profile; nhận diện chỉ là *gợi ý*, không tự chốt từ tên cơ quan hoặc AI.  
**P-IMP-03:** hiển thị đúng phần không được hiểu: bảng ô gộp, ảnh, field, textbox, section, phụ lục; nguồn khó không được lặng lẽ mất.  
**P-IMP-04:** khi đổi tệp/hệ/profile phải có quyết định/hủy giữ nguyên công việc; quyết định cũ và candidate cũ hết hiệu lực đúng phạm vi.  
**P-IMP-05:** sau nguồn được duyệt, có một hành động chính dẫn vào Editor; không bắt người dùng qua nhiều màn hình chỉ để xác nhận những thông tin đã rõ.  
**P-IMP-06:** tạo mới theo loại văn bản, không tự tạo số/ký hiệu/ngày/người ký; chỉ sinh khung được profile và người dùng chọn cho phép.

### Bước 2 — Hoàn thiện

**P-EDT-01:** nội dung hiển thị dễ đọc, có thể sửa đoạn, tiêu đề, trích yếu, V/v, Kính gửi, nơi nhận và thông tin được phép; thay đổi quay lại không bị mất.  
**P-EDT-02:** bảng đơn giản trong phạm vi hỗ trợ cho phép sửa text/ô và giữ cấu trúc; bảng phức tạp phải nêu rõ READ_ONLY/REVIEW/UNSUPPORTED, không đánh tráo giao diện.  
**P-EDT-03:** mỗi thành phần có trạng thái: EDITABLE / READ_ONLY_SOURCE / REVIEW_ONLY / UNSUPPORTED; chỉ đưa điều khiển chỉnh sửa khi dữ liệu thực sự được ghi và phản ánh vào DOCX.  
**P-EDT-04:** sau thay đổi, profile được áp theo từng property/role; **giữ nội dung gốc**, không bắt giữ nguyên định dạng sai trong văn bản được chuẩn hóa.  
**P-EDT-05:** tập trung “Việc cần xử lý” chỉ ở những mục thật sự có quyết định hoặc sai sót; bấm mở đúng trường, có đường quay lại.  
**P-EDT-06:** lưu nháp có trạng thái thật; sửa mới vô hiệu candidate cũ; thao tác undo/hủy/khôi phục theo phạm vi đã cam kết và có thể kiểm.  
**P-EDT-07:** AI là công cụ tùy chọn; trước khi gửi phải có consent phù hợp tệp/provider/phạm vi, kết quả có vùng nguồn và chờ người dùng áp dụng; offline/manual vẫn hoàn tất được.

### Bước 3 — Xem và tải Word

**P-EXP-01:** một candidate DOCX gắn source SHA, workspace revision và quyết định profile; preview/tải/in nếu có dùng cùng byte và đúng revision.  
**P-EXP-02:** phân biệt downloadable, review-only, blocked, stale, NOT_EVALUATED; tải bản đối chiếu phải được đặt tên/cảnh báo đúng; không tuyên bố đã được ban hành.  
**P-EXP-03:** trên vùng được hỗ trợ, font, đoạn, khoảng cách, đường kẻ, bảng, header, phần cuối, hình học trang phải khớp profile sau mọi hậu xử lý OOXML.  
**P-EXP-04:** DOCX phải mở/sửa được trong Office đã cam kết; không tự điền ngày/số/ký, không chèn “(Ký, đóng dấu)” khi nguồn không có.  
**P-EXP-05:** nếu thiếu WPS/renderer, DOCX đủ cổng kỹ thuật vẫn có thể tải theo chính sách; PDF bị ghi NOT_VERIFIED, không đóng giả một preview khớp Word.  
**P-EXP-06:** xuất không thành công phải giữ nguồn và draft, có nguyên nhân/chỉ dẫn xử lý và retry đúng revision, không hiện candidate cũ như kết quả mới.

## 6. Yêu cầu không được thỏa hiệp

| Mã | Điều kiện bắt buộc | Dấu hiệu FAIL |
|---|---|---|
| INV-01 | 100% thuộc tính profile đã cấu hình, thuộc phạm vi release, khớp effective-value trên DOCX hậu stamp | Một thuộc tính bị fallback hoặc hậu kiểm bằng ND30/HD05 khi đã SET |
| INV-02 | 0 mất, thêm hoặc thay đổi nội dung/bảng/ảnh/field không được chấp thuận trên đường hỗ trợ | Bỏ lặng lẽ object, đổi chữ, chèn số/ngày/người ký |
| INV-03 | Khi có 0/false/chuỗi rỗng, coi là giá trị đã thiết lập; font size nguyên dương | Fallback theo truthy, ép 15,5 thành 15/16 |
| INV-04 | Không tự suy profile từ tên, không nhận profile giả do AI | Áp sai ND30/HD05 hoặc profile chưa được xác nhận |
| INV-05 | DOCX revision và byte source được truy vết; ứng viên cũ không được tải/in thành mới | Stale candidate bị hiển thị như bản hiện hành |
| INV-06 | Không nới fidelity/security gate để tăng tỷ lệ thành công | Có lỗi mất cấu trúc mà ứng dụng báo PASS |
| INV-07 | AI không được gửi dữ liệu khi chưa được đồng ý; không lộ khóa hoặc hồ sơ nội bộ | Gửi trước consent, xuất log chứa nội dung nhạy cảm |
| INV-08 | Không đồng nhất test kỹ thuật với chứng nhận phát hành pháp lý | UI hoặc release tuyên bố “đủ điều kiện ban hành” từ PASS nội bộ |

## 7. Ma trận năng lực Editor bắt buộc

| Đối tượng | Mức cam kết đầu tiên cần kiểm (không mặc định code đã đạt) | Bằng chứng |
|---|---|---|
| Đoạn văn, in đậm/nghiêng, căn lề, sửa chữ | EDITABLE trong vùng editor hiện có | Sửa → lưu → xuất DOCX → mở lại thấy thay đổi đúng |
| Tiêu đề, trích yếu, V/v, Kính gửi | EDITABLE theo trường/role và policy | Không làm sai header, trích yếu hoặc sinh nội dung mới |
| Số/ngày/người ký/nơi nhận | EDITABLE nếu người dùng nhập/xác nhận; không tự điền | Empty source → empty exported; source có → giữ chính xác |
| Bảng đơn giản được hỗ trợ | EDITABLE đối với dữ liệu đã được nhận đầy đủ | Sửa nội dung ô, giữ merge/rows/header, in có đủ dữ liệu |
| Bảng nhiều section/nested, merge khó | REVIEW/READ_ONLY cho đến khi có test | Không có nút sửa giả; source còn nguyên, có lối thoát |
| Ảnh/shape, field, footnote, textbox, tracked changes | Chỉ hỗ trợ theo capability evidence, không mặc định là EDITABLE | Nêu giữ nguồn/không hỗ trợ, không mất lặng lẽ |
| Profile/header/table-layout bị khóa | Chỉ thay theo chọn profile/mẫu có quyền, không cho sửa tùy ý làm mất chuẩn | OOXML sau stamp khớp version được duyệt |

**Điều kiện bắt buộc:** một role chỉ được gắn EDITABLE khi có một ca thao tác thực và DOCX đầu ra chứng minh. Mức độ hỗ trợ phân tách theo loại văn bản, không gộp thành cờ “Editor hỗ trợ Word”.

## 8. Vận hành thực tế, offline và dữ liệu

- **Mô hình phân phối:** trong giai đoạn phát triển giữ local webapp; trước M1/M2 phải chọn một trong (a) launcher/local packaged, (b) Windows desktop wrapper nếu thực sự cần, (c) webapp nội bộ do IT vận hành. Không bắt người dùng văn thư chạy lệnh npm như quy trình hằng ngày.
- **Kiểm thử máy sạch:** cài/mở bằng luồng được phát hành, dùng offline không AI khi cam kết, tạo/nhập/sửa/xuất, đóng/mở lại, kiểm source và draft, update/rollback không làm mất tài liệu.
- **Lưu nháp:** trạng thái “đã lưu” chỉ sau khi có xác nhận ghi; IndexedDB không phải sao lưu qua nhiều máy. Cần cơ chế backup/export draft vừa đủ hoặc giới hạn/cảnh báo dễ hiểu và đường khôi phục cụ thể, không mặc định xây cloud sync.
- **PDF:** WPS COM/Word/LibreOffice là renderer có phiên bản và giới hạn; PDF thất bại không làm mất quyền xuất DOCX hợp lệ. Không dùng HTML preview làm bằng chứng giống Word tuyệt đối.
- **Hướng dẫn người dùng:** trang ngắn “Bắt đầu, chỉnh sửa, tải Word”, giải thích các nhãn REVIEW/BLOCKED/NOT_EVALUATED, nguồn gốc file, cách xử lý mất WPS/PDF và cách tải tệp gốc.
- **An toàn:** tài liệu nội bộ và mẫu thật không commit vào GitHub công khai; test dữ liệu giả/đã ẩn danh có quyền sử dụng; hạn chế network mặc định và AI consent.

## 9. Cổng nghiệm thu sản phẩm cuối (không lấy số unit tests thay thế)

| Gate | Điều kiện qua | Bằng chứng bắt buộc |
|---|---|---|
| **S — Phạm vi và lời cam kết** | Support Matrix có trạng thái cho từng loại/tính năng/hệ/Office; không quảng bá ngoài phạm vi đã chứng minh | File ma trận phiên bản, danh sách pilot/release, chữ ký người nghiệm thu sản phẩm |
| **T — Chính xác & an toàn** | INV-01–INV-08 đạt trong scope hỗ trợ; role đã SET đúng profile sau stamp, unsupported được chặn rõ | DOCX SHA, effective properties, OOXML expected/actual, source fidelity report, revision |
| **U — Hoàn thành việc thực tế** | Người dùng đại diện hoàn tất kịch bản chính, hiểu cảnh báo và không tải sai; đo so baseline | Biên bản nhiệm vụ, số người, số file, pass/fail, thời gian, click, lỗi cần trợ giúp |
| **R — Tương thích và trực quan** | DOCX mở/chỉnh trên Office/version cam kết, hình học và phân trang không có lỗi nghiêm trọng trong mẫu hỗ trợ | DOCX/PDF SHA, version Office, ảnh/trang đầu-giữa-cuối, danh mục sai khác/biên bản |
| **O — Vận hành & phục hồi** | Cài/mở/restart/offline/manual, lưu/khôi phục và lỗi PDF có hành vi đúng, người dùng không cần dev | Máy/OS/phiên bản, video/ghi nhận smoke, các ca storage/network/recovery |
| **C — Bàn giao & duy trì** | Quy tắc dừng, trợ giúp, phạm vi ngoại lệ, backup/rollback, memory/session/CI đồng bộ | Release notes, checklist, tài liệu người dùng, Project Memory và git SHA |

**Các bất biến an toàn là 0 vi phạm trên ca thử trong scope**; không làm tròn bằng trung bình. Các mục mức độ tiện lợi (thời gian, số thao tác, tỷ lệ hoàn thành) **phải đo baseline trước, rồi chốt ngưỡng chấp nhận trước vòng UAT cuối**. Không bịa 90%, “tiết kiệm 50%” hoặc SLA chưa đo. Một pilot tiết kiệm để quan sát ban đầu: khoảng 5 người văn thư, 8–12 tệp đại diện; số lượng chính thức cần chọn khi lập test plan, không suy là kiểm chứng thống kê.

### 9.1. Những ca người dùng phải có bằng chứng hành trình hoàn chỉnh

| Mã | Kịch bản | Đầu ra bắt buộc |
|---|---|---|
| U-01 | Tạo ND30 văn bản có tên loại | DOCX profile đúng, mở sửa được |
| U-02 | Tạo công văn ND30 V/v dài và nhiều Kính gửi | Không sai vị trí, không phải chỉnh tay header |
| U-03 | Tạo HD05 có tên loại, dấu * và ----- khi áp dụng | Không lẫn với ND30; title integer |
| U-04 | Công văn HD05 | Đúng trường V/v, role nơi nhận, body |
| U-05 | Nhập DOCX có format sai → sửa body → xuất | Thể thức được sửa, nội dung không mất |
| U-06 | Bảng nhập row0 không header rồi một bảng có header lặp thật | Không tự gán header; repeat khi đúng |
| U-07 | Bảng dài, merge/ảnh/đối tượng lạ | Có kết quả được chứng minh hoặc REVIEW trung thực, không xóa |
| U-08 | Sửa lại sau khi xem/tải ứng viên | Không xuất nhầm bản cũ; revision và PDF cùng candidate |
| U-09 | Tạm dừng, reload/khởi động lại rồi tiếp tục | Draft đúng; storage lỗi không được ghi “đã lưu” |
| U-10 | Không AI/không mạng, không WPS | Luồng manual còn dùng; PDF lỗi không khóa DOCX hợp lệ |
| U-11 | AI đề xuất sai profile hoặc nội dung | Không tự áp; phải có consent; từ chối không đổi draft |
| U-12 | Máy sạch + người dùng không biết npm | Khởi động và làm xong nhiệm vụ theo mô hình phân phối |

**Có thể mở rộng từ [UX-01–UX-13](../DAC_TA_NOI_DUNG_UX_3_BUOC_DOCFORM_2026-11-04.md); không tạo lại bộ test UX với cùng nội dung.**

## 10. Khi thiếu dữ liệu hoặc không hỗ trợ

Mọi trạng thái REVIEW/BLOCKED phải trả lời: **vùng nào**, **vì sao**, **có ảnh hưởng tệp Word hay không**, **người dùng có thể làm gì ngay** (quay lại xác nhận, giữ nguồn, tải bản đối chiếu nếu chính sách cho phép, sửa trong Word, hoặc cần nâng cấp). Không âm thầm nâng trạng thái thành PASS để đạt tỷ lệ hoàn thành. Không bắt người dùng hiểu mã quy tắc để tìm cách đi tiếp.

**Chính sách lỗi có ưu tiên:** mất nội dung/stale/AI consent → chặn; sai profile có cấu hình → chặn hoặc không gọi đạt; renderer/PDF lỗi nhưng DOCX an toàn → cung cấp DOCX đúng gate; ngoại lệ bố cục còn cần rà soát → cảnh báo và hướng xử lý theo mức độ được khai báo.

## 11. Quyết định mở và giả định bảo thủ để không dừng công việc

| ID | Quyết định cần khi tới cổng | Trong khi chưa chốt |
|---|---|---|
| DEC-P01 | Phạm vi sử dụng đầu tiên: nội bộ Công ty/Đảng ủy hay nhiều tổ chức | Phát triển theo bốn tuyến pilot đã định, không tuyên bố rộng |
| DEC-P02 | Mô hình phân phối M1/M2: launcher, desktop wrapper, hay webapp nội bộ | Duy trì local webapp; chuẩn bị test cold-start, không viết EXE vội |
| DEC-P03 | WPS/Word/LibreOffice phiên bản nào là ứng dụng văn phòng cam kết | Ghi rõ NOT_VERIFIED_RENDER ở ứng dụng chưa thử; không gọi tương thích |
| DEC-P04 | Nhóm bảng/tài liệu phức tạp nào bắt buộc sửa trực tiếp tại M2 | Giữ source, review/blocked, không tự nới gate; đo corpus trước |
| DEC-P05 | Các thuộc tính Header ND30 và tên chủ thể HD05 hiện còn conflict | Giữ bản đang vận hành, khóa sau khi có golden/hash đúng phiên bản |
| DEC-P06 | Ngưỡng đo thời gian, click và task completion của UAT | Ghi baseline rồi chốt tiêu chí trước UAT chứ không đặt ngưỡng ảo |

Những quyết định này không phải lý do ngừng sửa các nhánh độc lập còn OPEN. Chỉ được thay master/profile khi có phiên bản phê duyệt và bằng chứng.

## 12. Đường đến sản phẩm cuối cùng

1. Khóa **PA-01 Support Matrix** và tiêu chí các mức M1/M2. Đồng thời lấy baseline UX/Editor từ phiên bản đang chạy, chưa chỉnh sửa UI hàng loạt.
2. Thực hiện các gói technical P0 còn thiếu: DF-B02/B03/B05, DF-C02/C04/C06, DF-E01/E02; mỗi gói phải có **một hành trình người dùng thực** tương ứng, không chỉ test riêng module.
3. Giải quyết các xung đột Master có bằng chứng; nếu thiếu, không đưa đường văn bản bị blocker vào phạm vi SUPPORTED_END_TO_END.
4. Kiểm UAT sớm và đo vấn đề thực trước khi đầu tư DF-Dxx/V6.9; optimizer chỉ opt-in khi có lợi ích thực trên mẫu phổ biến.
5. Hoàn thiện cài đặt/offline/lưu/khôi phục, kiểm DOCX mở/sửa trên Office cam kết, chuẩn hóa hướng dẫn người dùng.
6. Release Gate: **M1** khi scope hữu dụng có bằng chứng S/T/U/R; **M2** chỉ khi S/T/U/R/O/C đều đạt và người dùng mục tiêu thực sự tự hoàn thành công việc.

## 13. Trạng thái tại thời điểm ban hành tài liệu

**Đã có bằng chứng code/test, không phải nghiệm thu sản phẩm:** DF-C01/C03, DF-A04; DF-B01 partial; ma trận nguồn DF-A01 partial, DF-A02/A03 blocked. CI trong Project Memory gồm 26/26 và 31/31 test focused tại PR #3; không cộng là 57 test độc lập. Không có báo cáo Word/WPS visual UAT, pilot người dùng hoặc installer sử dụng hằng ngày được xác minh trong phiên xây dựng tài liệu.

**Chưa triển khai trong lượt viết tài liệu này:** các chức năng PA-01–PA-06 ngoài việc mô tả điều kiện cần đo; chưa có khảo sát người dùng thật; chưa sửa mã, chưa đổi profile. Các gate và kịch bản nêu trên là mục tiêu/tiêu chí tương lai, **không được tính PASS khi chỉ có tài liệu**.

**Nguyên tắc duy trì:** mọi phiên coding phải đọc [Project Memory](../PROJECT_MEMORY.md), [Master Roadmap](../roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md) và tài liệu này trước khi sửa; sau khi thực hiện cập nhật log/CI/commit/việc còn mở trên GitHub. Không lập roadmap cạnh tranh hoặc ghi lại lịch sử thành kết quả mới.
