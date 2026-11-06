# Audit chi tiết luồng phần đầu, Body và phần cuối trong DocForm

- **Ngày kiểm tra:** 03/11/2026
- **Checkout:** `main`, commit `4c3751f` cùng thay đổi local chưa commit tại thời điểm kiểm tra.
- **Phạm vi:** luồng DOCX/TXT từ chọn tệp, đọc và phân vùng nguồn, soạn, tạo DOCX ứng viên, xem trước, tải và in tham khảo.
- **Tệp pilot:** tài liệu DOCX người dùng đã chọn trong phiên. Báo cáo không chép nội dung cá nhân/nội bộ của tệp vào repository.
- **Nguyên tắc:** byte nguồn và dữ liệu phân vùng là bằng chứng; kết quả tách trường không đồng nghĩa người dùng đã xác nhận đúng hoặc văn bản đã đạt thể thức.

## 1. Kết luận điều hành

DocForm giữ hai dạng dữ liệu song song:

1. **Nguồn gốc:** byte DOCX/TXT, hash, SourceBlock theo thứ tự, bảng/ô nguồn, đặc tính OOXML và manifest fidelity.
2. **Bản làm việc:** các trường phần đầu/cuối, HTML Body/phụ lục, mô hình bảng, quyết định phân vùng, revision và giao dịch chỉnh sửa.

Khi xuất, DocForm không phát lại nguyên byte DOCX nguồn. Nó dựng một DOCX ứng viên mới từ bản làm việc, thay phần đầu theo profile đang chọn, dựng Body và phần cuối từ dữ liệu đã duyệt, rồi kiểm tra ứng viên. Bước 3 hiện chỉ hiển thị preview khi ứng viên `downloadable`; tải và in cũng yêu cầu ứng viên hiện hành vượt qua cổng an toàn.

Với tệp pilot, đã chạy đường trích xuất → phân vùng → dựng ứng viên và thao tác Chromium từ Bước 1 sang Bước 2. Bộ trích xuất tạo 12 khối; phần đầu là bảng nguồn đầu tiên, phần cuối là bảng nơi nhận/chữ ký. Browser xác nhận bảng cuối đã nằm ở vùng phần cuối, không nằm trong canvas Body. Kiểm tra bảng và nội dung không phát hiện sai khác; ứng viên vẫn bị từ chối do Shape ở phần đầu và đồ họa tại trích yếu chưa được tái tạo. Vì vậy preview, tải và in ứng viên đều bị khóa; fidelity hình học phần cuối trên output vẫn chưa được kiểm chứng.

Ngoài tệp pilot, một kiểm tra nhỏ trên segmenter xác nhận đoạn phân cách `-----` ngay sau trích yếu của văn bản NĐ30 được gán `role=body` nhưng không có trong `body.html`/`body.sourceBlockIds`. Đây là nguy cơ mất nội dung cần sửa.

## 2. Sơ đồ luồng và quyền sở hữu dữ liệu

```text
File người dùng
  ├─ đọc cục bộ → SourceBlock[] + hash + fidelity manifest
  ├─ xác nhận thể thức → segmenter gán role/field/anchor
  ├─ duyệt nguồn → workspace source + partition revision được phê duyệt
  ├─ soạn → metadata fields + Body nodes + appendix nodes + ledger/revision
  └─ xuất → compose → tạo DOCX bytes → integrity/fidelity gates
       ├─ safe/current → preview, tải DOCX và in tham khảo dùng cùng bytes
       └─ blocked/stale → preview/tải/in ứng viên bị khóa; có thể tải byte gốc
```

Mô hình này tách `SourceBlock` khỏi `DocumentState` và `WorkspaceSnapshot`. Phần đầu là các trường metadata; Body là HTML/nodes; phần cuối là các trường nơi nhận/chức vụ/người ký hoặc các khối ký được duyệt. Phụ lục được giữ thành vùng riêng. Các khối chưa phân loại tiếp tục được lưu để người dùng xử lý, không tự xóa.

`createWorkspaceSnapshot` lưu manifest nguồn, fingerprint, generation, partition, working revision, ledger, editable nodes và overrides. `makeEditableNodes` tạo node cho Body và phụ lục; trường đầu/cuối được chiếu trong các form riêng. Byte nguồn được lưu trong `source_blobs` qua IndexedDB; nếu lưu bền vững không được thì trạng thái có thể chỉ là `memory` trong phiên.

### 2.1 Bản đồ sở hữu dữ liệu theo vùng

| Vùng | Dữ liệu nguồn và dấu vết | Bản làm việc | Bước 2 và cách xuất | Điều cổng hiện kiểm tra |
|---|---|---|---|---|
| Phần đầu | `header`/`metadata` blocks; các field có `sourceBlockIds`, một số trường có `sourceCell` và `exactQuote` | `DocumentState` fields như cơ quan, số/ký hiệu, địa danh/ngày, tên loại, trích yếu, ghi chú dự thảo | Form metadata; `documentComposer` chọn generic hoặc profile. Bảng đầu có thể được thay bằng OOXML profile, không phát lại nguyên bảng nguồn | Shape/OOXML chưa hỗ trợ, bảng, profile header và nội dung candidate. Chưa xác nhận mọi Shape nguồn đã được tái tạo |
| Body | Các `SourceBlock` có role `body`, giữ ID và thứ tự; bảng có `TableModel` | `doc.bodyHtml`, bảng đồng bộ với model, `EditableNode` container `body`, revision/ledger | Canvas Body; `documentComposer` đồng bộ HTML và model, exporter dựng lại đoạn/bảng DOCX | Content fidelity so candidate với bản làm việc; table fidelity kiểm ID, thứ tự và cấu trúc bảng. Hiện thiếu kiểm tra mỗi paragraph nguồn role `body` phải xuất hiện trong Body |
| Nơi nhận/chữ ký | `signature`/`recipients` blocks, có thể giữ `sourceCell` cho từng field | `recipients`, `signTitle`, `signName`, `signatureHtml`; không phải Body node trong luồng mới | Form phần cuối; exporter dựng lại vùng ký từ field, có thể khác hình học bảng nguồn | Kiểm tra candidate tổng thể; chưa có fidelity riêng cho hình học bảng cuối (đường viền, độ rộng, căn lề, ô rỗng) |
| Phụ lục | Blocks role `appendix`, tiêu đề/tham chiếu/nội dung và source IDs riêng | `AppendixDocument` và node `appendix` riêng | Canvas/phần xuất phụ lục riêng; exporter tạo section cho phụ lục | Candidate kiểm nội dung/bảng và thứ tự; phân trang cuối vẫn phụ thuộc Word/LibreOffice |
| Chưa phân loại | `unclassified` blocks vẫn tồn tại trong partition và được đưa ra duyệt | Mảng `doc.unclassified`; không tự đổi thành nội dung đã xác nhận | Exporter có vùng dữ liệu chưa phân loại riêng trong luồng dựng; vị trí cần rà theo cấu trúc từng tài liệu | Không được coi việc block còn trong manifest là đã nằm đúng trang/vùng; phải xử lý trạng thái duyệt và kiểm candidate |
| Byte nguồn | Tệp nguyên bản, `sourceHash`, generation, tên/loại tệp | Blob trong IndexedDB hoặc bộ nhớ phiên | Nút tải nguồn đọc đúng blob theo hash, không dựng ngược từ text đã parse | Hash chứng minh đúng byte đang giữ, không chứng minh bản ứng viên giữ nguyên hình thức nguồn |

Điểm mấu chốt: source IDs/fingerprint bảo vệ danh tính và revision; chúng chưa tự chứng minh độ bao phủ nội dung paragraph từ nguồn sang Body. Candidate fidelity hiện tập trung mạnh vào bảng và việc candidate khớp với `DocumentState` hiện hành. Nếu một block bị loại trước khi `DocumentState` được tạo, candidate có thể khớp hoàn hảo với bản làm việc nhưng vẫn thiếu so với nguồn.

### 2.2 Dấu vết chuyển vùng trên tệp pilot

Bảng sau nối các ID khối đã trích với vùng làm việc và kết quả ở từng chặng. ID/loại khối được ghi lại, không chép văn bản tài liệu.

| Vùng | Trích xuất và phân vùng | Duyệt Bước 1 | Bước 2 | Compose/candidate | Preview, tải, in |
|---|---|---|---|---|---|
| Đầu trang | `block-0` là bảng 2×2; `block-1` và `block-2` là metadata. Các field đầu trang có locator khối/ô nguồn. Shape và đối tượng đồ họa được đánh dấu fidelity riêng. | Bảng vật lý vẫn xem được; field đã tách; panel cảnh báo đối chiếu Shape/đồ họa. | Dữ liệu được chiếu vào nhóm 01–05, không gộp vào Body. | Header được dựng theo profile, không phát lại byte/bảng nguồn nguyên trạng. Candidate có hai line profile nhưng thiếu Shape thứ ba của nguồn. | Candidate bị `safe=false`, `downloadable=false`; preview ứng viên không mount; không thể đánh giá trực quan bản render hoặc hình học header trong Word ở lần chạy này. |
| Body | `block-3`–`block-10`: tám paragraph liên tiếp mang role `body`; không có khối chưa phân loại trong pilot. | Tám khối nội dung được tính trong phân vùng Body. | E2E trên Chromium mở `data-canvas-id="body"`; canvas có nội dung và không chứa dấu hiệu nơi nhận/chữ ký của pilot. | Content fidelity của Body trong reproduction trước không phát hiện khác biệt so với working state; điều đó không chứng minh đã phủ mọi paragraph nguồn, như lỗi separator NĐ30 ở mục 5.2. | Không có preview candidate do blocker ở header; không suy luận từ test candidate tổng hợp sang pilot. |
| Cuối văn bản | `block-11` là bảng 1×2 mang role `signature`; field nơi nhận, chức vụ và tên ký trỏ các ô nguồn riêng. | Bảng nguồn vẫn tồn tại để đối chiếu và các field trích được hiển thị. | E2E xác nhận 1 block role chữ ký, 8 block Body; canvas Body không có nơi nhận/chữ ký; nhóm `#df-step2-groups-after` có cả field nơi nhận và người ký. | `documentComposer` dựng khu vực ký từ field. Hình học bảng hai cột nguồn không được bảo đảm giữ nguyên. | Bị chặn cùng candidate; hình học chữ ký qua preview/in chưa được kiểm chứng. |
| Phụ lục / chưa phân loại | 0 appendix, 0 `unclassified`. | Không có vùng phụ lục để duyệt trong ca này. | Không có canvas phụ lục. | Không có nội dung phụ lục để dựng. | NOT_APPLICABLE cho ca pilot, không phải bằng chứng xử lý phụ lục tổng quát. |

Kết quả tách vùng trên pilot là đúng ở ranh giới Body/cuối văn bản trong luồng trình duyệt hiện tại. Điểm chưa đạt nằm ở fidelity nguồn→ứng viên của header: chặn tải/in là hành vi fail-closed đúng; thông báo cần chỉ rõ đối tượng/vị trí để nhân viên dễ đối chiếu.

## 3. Upload và đọc nguồn

### 3.1 Trình tự

1. `handleFileUpload` bắt đầu phiên upload mới, hủy consent AI gắn với nguồn cũ và vô hiệu kết quả cũ.
2. `extractLocalFile` kiểm tra định dạng DOCX/TXT và giới hạn dung lượng, đọc byte trong trình duyệt, tính SHA-256, rồi gọi `extractBlocksFromDocx` hoặc parser TXT. Bước này chưa phân vùng và chưa ghi byte vào kho nguồn.
3. `detectRegimeFromRawBlocks` đưa ra gợi ý hệ thể thức từ khối thô. Khi bằng chứng không đủ hoặc không khớp lựa chọn hiện hành, người dùng phải xác nhận; tệp đang mở không bị thay trước quyết định.
4. Sau xác nhận, `segmentLocalExtraction` chạy segmenter một lần theo hệ thể thức đã xác nhận; `persistSourceBlob` lưu nguồn; `buildParsedImport` dựng dữ liệu nhập. Sau đó App tạo bundle phiên import và mở giao diện duyệt nguồn.
5. Có một nhánh rà soát phân vùng AI tùy chọn riêng. Upload không tự đồng nghĩa đồng ý gửi nguồn; quy tắc cục bộ vẫn chạy và kết quả AI không tự áp dụng phân vùng.

### 3.2 Trích xuất cấu trúc

`extractBlocksFromDocx` giải nén OOXML và duyệt các phần tử đoạn văn/bảng theo thứ tự tài liệu. Khối có ID tuần tự (`block-0`, …), loại paragraph/table, text/HTML và vai trò ban đầu. Bảng có table model, table data và raw XML; paragraph có HTML/text cùng danh sách `unsupportedFeatures`. Bảng lưới, ô gộp và thuộc tính nguồn được giữ trong mô hình bảng khi được hỗ trợ. Đối tượng Word không hỗ trợ được ghi dấu để đối chiếu, không nên bị xem là đã bảo toàn chỉ vì text trích xuất được.

### 3.3 Lưu byte nguồn

`sourceHash` ràng buộc manifest và kho `source_blobs`. Nút tải tệp gốc ở Bước 3 đọc lại byte đã lưu theo hash; nếu không còn byte thì DocForm báo lỗi thay vì tạo lại tệp giả từ nội dung đã parse. Cần xem trạng thái `indexeddb`/`memory` trước khi tin rằng nguồn còn sau tải lại trang.

### 3.4 Ranh giới commit và lỗi upload

- File được chấp nhận theo phần mở rộng DOCX/TXT và giới hạn 25 MB; DOCX hỏng hoặc không hợp lệ trả lỗi đọc, không tiếp tục phân vùng như thể đọc thành công.
- Upload đầu tiên chỉ đọc byte, trích block và tính hash. Hệ thể thức được nhận diện trên block thô; khi bằng chứng không đủ hoặc xung đột, trạng thái file mới ở dạng pending để người dùng xác nhận.
- Chỉ sau khi đã có quyết định về hệ thể thức (tự chọn khi chứng cứ mạnh khớp hoặc người dùng xác nhận khi cần), hệ thống mới phân vùng, ghi blob nguồn và dựng bundle để thay phiên hiện hành. Token generation/regime ngăn kết quả upload cũ ghi đè một lần chọn tệp hoặc đổi hệ mới hơn.
- Có thể tự chọn chế độ khi chứng cứ mạnh khớp chế độ đang chọn. Vì vậy cần kiểm riêng ca “cả hai hệ”, tài liệu không tiêu đề chuẩn và lựa chọn hiện hành sai; không suy từ riêng một test upload rằng mọi trường hợp đều có xác nhận người dùng.
- Nếu blob chỉ lưu trong bộ nhớ phiên, cảnh báo UI nói rõ có thể mất khi tải lại. Đọc/parse nguồn là cục bộ; rà soát AI phân vùng là yêu cầu opt-in độc lập và có thể chạy nền, không phải điều kiện để parser tạo block.

## 4. Phần đầu: từ nguồn đến DOCX ứng viên

### 4.1 Nhận diện và lưu

Segmenter tìm bảng đầu/trường đầu và các đoạn đầu theo vị trí, kiểu bảng, nhãn và regex có căn cứ. Các trường có thể gồm:

- cơ quan cấp trên và cơ quan ban hành;
- quốc hiệu/tiêu ngữ hoặc tiêu đề hệ thể thức;
- số/ký hiệu;
- địa danh/ngày ban hành;
- tên loại và trích yếu;
- dấu dự thảo khi có.

Trường nhận diện giữ `sourceBlockIds`, `sourceCell` và/hoặc `exactQuote` nếu có bằng chứng. Giá trị thiếu/placeholder tiếp tục được xem là thiếu; không tự tạo số, ngày hoặc người ký.

Trong Bước 1, người dùng xem danh sách khối, ánh xạ đích, bảng nguồn và cảnh báo fidelity. Việc nhận diện không tự chứng minh phân vùng đúng; người dùng duyệt partition trước khi sang soạn.

### 4.2 Soạn và chọn profile

Ở Bước 2, phần đầu được sửa trong form metadata, không nằm trong Body. `documentComposer` xác định regime/profile từ trường cơ quan, regime và lựa chọn profile, rồi tạo `DocumentFormatType` cho exporter. Profile Hoa Tiêu là quyết định dựng đầu văn bản; nó không biến bảng nguồn thành bản sao nguyên trạng.

### 4.3 Xuất phần đầu và Shape

`docxExport` tạo bảng đầu và trường đầu từ `DocumentFormatType`. Với profile Hoa Tiêu, `stampHoaTieuHeader` thay bảng đầu của DOCX vừa tạo bằng bảng OOXML tham chiếu có Shape DrawingML/VML và settings tương ứng; các giá trị số/ngày được điền vào bảng profile. Nghĩa là bảng nguồn đầu có thể được thay bằng bảng profile mới, sau khi nguồn được phân loại là metadata có thể chuyển đổi.

`hasReplaceableHeaderShapeLines` hiện chỉ cho phép một mẫu đường Shape tự chứa hẹp: mỗi đối tượng phải là đường DrawingML/VML, không ảnh/chữ/trường/link, và `wp:extent` phải có `cy="0"`. Đây là nguyên nhân hai đường pilot hơi nghiêng (cao `9525` đơn vị OOXML) không vượt điều kiện dù quan sát cấu trúc thấy chúng là đường gần ngang. Mở rộng regex đơn thuần là không đủ; cần kiểm tra độ nghiêng, tọa độ, số lượng, vị trí và nội dung DrawingML/VML của từng đường trong ứng viên cuối.

### 4.4 Dấu vết phần đầu trên pilot

Pilot có `block-0` là bảng 2×2 role `header`; bốn field cơ quan/quốc hiệu trỏ về block này, còn số/ký hiệu và địa danh/ngày trỏ đúng ô trái/phải ở hàng thứ hai. `block-1` là paragraph metadata tên loại; `block-2` là trích yếu metadata. `block-0` có `drawing_or_image`; `block-2` cũng có `drawing_or_image` dù block paragraph không mang raw XML giống bảng. Do đó chỉ kiểm raw XML của bảng đầu sẽ bỏ sót dấu vết Shape tại trích yếu; manifest fidelity là nguồn để candidate safety từ chối.

## 5. Body: biên, chỉnh sửa và xuất

### 5.1 Tách Body

Segmenter tìm vùng metadata, tên loại/trích yếu, phụ lục và chữ ký/nơi nhận. Body được dựng từ các khối `unclassified` nằm giữa ranh giới trên; bảng nội dung được chiếu thành HTML có ID ổn định và `TableModel`. Phụ lục giữ tiêu đề/tham chiếu/nội dung và ID riêng. Các khối không khớp vẫn cần duyệt, thay vì bị loại âm thầm.

Trong Bước 2, `WorkspaceEditor` dựng canvas Body và phụ lục từ workspace nodes, cho phép sửa theo giao dịch/revision. Form phần đầu và phần cuối vẫn là vùng riêng. Các chỉnh sửa bảng phải đồng bộ HTML, table model và reviewed blocks; các đề xuất AI gắn target/anchor và chỉ cập nhật sau khi người dùng duyệt.

### 5.2 Dòng gạch, dấu sao và đoạn rỗng

`isSeparatorParagraph` coi đoạn chỉ gồm dấu gạch, gạch dài, gạch dưới, khoảng trắng hoặc dấu sao (3–10 ký tự) là dòng phân cách. Ở phần tên cơ quan, `parseOrgHeaders` loại các dòng phân cách khỏi giá trị cơ quan; nhãn dự thảo được đưa sang `draftNote`.

Với thể thức Đảng không phải công văn, nếu có trích yếu, exporter dự kiến tạo lại dòng `-----` dưới trích yếu; segmenter vì vậy phân loại dòng nguồn làm `separator` để tránh tạo hai dòng. Văn bản NĐ30 và văn bản Đảng dạng công văn phải giữ nguyên dòng phân cách nguồn.

**Sai lệch đã tái hiện ở NĐ30:** vòng `while` ngay sau trích yếu đánh dấu separator là `body`, sau đó tăng `nextStartIndex`. Vòng tạo Body bắt đầu từ index mới nên không đưa separator đó vào `body.html`/`body.sourceBlockIds`. Kiểm tra với 4 khối tổng hợp cho ra role của dấu `-----` là `body`, nhưng Body chỉ chứa đoạn sau dấu. Do đó comment “giữ nguyên” chưa khớp hành vi; có nguy cơ mất dòng trong bản xuất và workspace ownership.

Kiểm tra sâu hơn cho bốn chuỗi `-----`, `- - -`, `___`, `* * *` ở vị trí ngay sau trích yếu đều cho cùng kết quả: block separator mang role `body` nhưng ID không nằm trong `body.sourceBlockIds` và chuỗi không nằm trong `body.html`. Khi dựng workspace từ trạng thái đó, `workspaceInvariantErrors` trả rỗng. Sau khi duyệt partition và gọi `prepareExportCandidate`, candidate tổng hợp vẫn có `safe=true`, `downloadable=true`, không blocker, `contentFidelity.safe=true`, `tableFidelity.safe=true`, `exportSafety=allow`.

**Nguyên nhân của false pass:** content fidelity so ứng viên với `doc.bodyHtml` hiện hành; nó không so từng paragraph nguồn với candidate. Vì separator đã mất trước khi tạo `DocumentState`, cả candidate lẫn Body working state cùng thiếu dòng đó. `workspaceInvariantErrors` yêu cầu HTML node ghép lại bằng `doc.bodyHtml` và yêu cầu đủ ID trong danh sách review, nhưng không yêu cầu toàn bộ block role `body` được ánh xạ vào `body.sourceBlockIds`/HTML. Đây là lỗi bao phủ nguồn xuyên các lớp, không chỉ lỗi hiển thị separator.

**HD05 có nguy cơ mất thêm separator:** bộ phân vùng loại mọi paragraph chỉ gồm dấu phân cách khỏi Body khi exporter tự sinh separator dưới trích yếu. Probe tổng hợp có hai dòng `-----` (một dưới trích yếu, một giữa thân bài) cho thấy cả hai block thành role `separator`, Body chỉ còn hai đoạn chữ, DOCX cuối có đúng một dấu gạch do exporter sinh. Test hiện hành chỉ xác nhận không nhân đôi một dấu nguồn; nó không xác nhận giữ nhiều separator nguồn hoặc xác nhận vị trí có ý nghĩa trong thân bài.

### 5.3 Bảng và fidelity

Khi tạo ứng viên, exporter ghép lại bảng từ `TableModel` và HTML đã đồng bộ. `verifyCandidateExportFidelity` so ID/thứ tự/lưới/nội dung/định dạng được hỗ trợ với manifest và chính byte ứng viên hiện tại. Đây là kiểm tra cấu trúc trong phạm vi được hỗ trợ; nó không đảm bảo mọi thuộc tính OOXML, bố cục Word hoặc pháp lý.

## 6. Phần cuối: nơi nhận, chữ ký, dấu và phụ lục

### 6.1 Phân vùng và trích trường

Segmenter rà vùng cuối trước phụ lục hoặc cuối tài liệu để tìm công thức ký, “Nơi nhận” và bảng. Hàm `embeddedRecipientsSignatureTable` nhận diện bảng kết hợp khi cấu trúc đủ tin cậy; trong thay đổi local hiện tại, bảng đó được gán `role=signature`, đồng thời lấy nơi nhận từ ô trái và chức vụ/tên ký từ ô phải, gắn `sourceCell` và `exactQuote`. Bảng không được đưa vào Body trong cách phân vùng mới.

`reconstructFromReviewedBlocks` giữ các giá trị chữ ký gốc chỉ khi danh sách ID khối và nội dung hiện tại còn khớp dữ liệu nhập. Khi nội dung/role thay đổi, nó dựng lại nơi nhận/chức vụ/tên ký từ khối đã duyệt, tránh tái dùng trường cũ. Có nhánh tương thích các phiên cũ đã để bảng cuối trong Body.

### 6.2 Bước 2 và exporter

Nơi nhận/chức vụ/tên người ký hiển thị ở form phần cuối, không phải canvas Body. Exporter tạo lại vùng ký từ các trường: nơi nhận được phân dòng; chức vụ/tên ký được bố trí thành một hay nhiều cột tùy dữ liệu. Vì vậy việc đưa bảng cuối ra khỏi Body đúng với yêu cầu phân vùng, nhưng **không tự bảo đảm giữ hình học bảng nguồn** (đường viền, độ rộng cột, khoảng cách, căn lề, các ô rỗng). Nếu muốn giữ nguyên bố cục bảng cuối, phải lưu/chiếu TableModel vùng signature và kiểm tra nó trong candidate fidelity; hiện luồng compose loại các bảng metadata đã chuyển đổi ra khỏi `importedTables` và dựng từ trường.

### 6.3 Dấu và khoảng trắng

Chữ ký thực tế chỉ xuất khi có dữ liệu; DocForm không tự tạo tên người ký. Nơi nhận vẫn có thể xuất độc lập nếu trường ký bị bỏ trống. Bảng ký trong phụ lục không được tự nâng thành chữ ký của văn bản chính nếu quyền sở hữu còn mơ hồ; phụ lục có thể chuyển sang `needs_review`.

### 6.4 Kết quả xác minh giao diện phần cuối

`test/final-footer-browser.test.ts` chạy Chromium riêng, upload DOCX tổng hợp và đi đến màn duyệt nguồn Bước 1. Các kiểm tra giá trị nơi nhận/chức vụ/tên, `sourceCell` trái/phải và việc vẫn hiển thị nguyên bảng vật lý đều đạt. Test FAIL ở nhãn phân vùng: UI không có tùy chọn “Bảng kết hợp · Nơi nhận và chữ ký”; danh sách đang hiển thị các nhãn chung như “Thông tin thể thức”, “Nội dung chính”, “Chữ ký”. Đây là khoảng trống phân loại dễ hiểu cho người dùng, không phải lỗi parser trường trong ca đó. Test sẵn có dừng ở assertion này nên không tự đi tiếp Bước 2.

Để kiểm chứng hành vi thực tế đang được hỏi, đã chạy thêm Chromium headless trên cổng test riêng với đúng tệp pilot, thao tác upload → xác nhận hệ thể thức → duyệt nguồn → “Tiếp tục đưa vào Studio soạn thảo”. Kết quả: Bước 1 có 1 block được chọn role chữ ký và 8 block Body; tại Bước 2 canvas Body không chứa trường nơi nhận/người ký; `#df-step2-groups-after` chứa cả nơi nhận và chức vụ/tên ký. **PASS cho ranh giới hiển thị cuối văn bản/Body trong luồng hiện tại**. Đây là pilot cục bộ, không phải kiểm thử Word hoặc mọi biến thể footer; đoạn script kiểm tra tạm đã xóa sau khi chạy.

Luồng Bước 1→2 trên pilot đã được thao tác thật trong Chromium cô lập, nhưng Bước 3 không thể kiểm chứng bằng preview/in do chính candidate bị khóa bởi Shape/đồ họa header. Đường segmenter→`reconstructFromReviewedBlocks`→`documentComposer` cũng đưa `block-11` thành `signature`, chỉ đưa `block-3`–`block-10` vào Body IDs. Đồng thời hai assertion legacy trong `final-section-roundtrip.test.ts` vẫn kỳ vọng bảng hỗn hợp ở Body, đối nghịch yêu cầu sản phẩm hiện tại; cần cập nhật test contract, không đưa footer trở lại Body.

## 7. Duyệt nguồn, partition và revision

Sau khi nhập, workspace giữ source manifest bất biến (hash/generation/blocks/fingerprint), partition có vai trò cho từng khối và mapping ô, working revision, ledger giao dịch, editable nodes và overrides. Người dùng xác nhận phân vùng trước khi sang Bước 2. Khi sửa vai trò, thay đổi được dựng thành partition pending mới; kiểm tra invariant đòi hỏi mỗi khối nguồn có đúng chủ sở hữu và đủ dữ liệu.

Phân biệt hai mức invariant: `validateReviewedBlocks` có thể xác nhận danh sách ID nguồn không bị xóa khỏi danh sách review; `workspaceInvariantErrors` xác nhận role map khớp review blocks và HTML node khớp `doc.bodyHtml`. Các invariant này hiện không bắt buộc mọi paragraph có role `body` phải xuất hiện trong danh sách block Body/HTML. Reproduction separator ở mục 5.2 chứng minh khoảng trống đó có thể đi qua approval mà không báo lỗi.

Candidate key được tính từ toàn snapshot, gồm nguồn, partition approval, tài liệu, nodes, overrides và evidence liên quan. Thay đổi nguồn/partition/working revision làm ứng viên cũ stale; kết quả sinh muộn không được thay ứng viên mới.

## 8. Tạo DOCX, preview, tải và in

### 8.1 Cổng ứng viên

`prepareExportCandidate` đóng băng snapshot, dựng `DocumentFormatType`, tạo byte DOCX một lần, tính SHA-256, đọc lại XML/settings từ đúng byte đó, rồi chạy:

- invariant/approval của workspace;
- kiểm tra OOXML/media chưa hỗ trợ và profile header;
- table roundtrip/fidelity;
- content fidelity cho Body/phụ lục;
- export safety theo manifest và kết quả candidate fidelity.

`safe` đòi hỏi không có blockers, table/content fidelity đạt và export safety `allow`. `downloadable` yêu cầu bytes và XML hợp lệ đồng thời `safe=true`. `safe` không phải chứng nhận định dạng pháp lý.

### 8.2 Preview

`CandidateDocumentPreview` nhận `candidate.bytes` hiện hành, xác minh SHA trước khi gọi `docx-preview`, rồi đánh dấu trang/geometry. Có chỉnh CSS vị trí bảng profile Hoa Tiêu trong preview. Nó không phải Microsoft Word; khả năng render Shape, ngắt trang và OOXML phức tạp có giới hạn.

**UI hiện tại chỉ mount preview khi `candidate.downloadable`**. Vì vậy ứng viên có thể đọc/render được nhưng thất bại một fidelity gate vẫn hiện khung rỗng “Ứng viên chưa sẵn sàng để xem”. Đây là trải nghiệm chẩn đoán kém: người dùng không thể nhìn bản dựng để tìm sai khác dù tải/in vẫn cần bị chặn.

### 8.3 Tải

Tải DOCX ứng viên yêu cầu `downloadable`, `safe`, candidate manager xác nhận đúng snapshot hiện tại và quyền vào Bước 3. Khi gate lỗi, nút tải ứng viên bị khóa. Tải bản gốc dùng byte từ `source_blobs` theo hash; nếu byte gốc không còn, DocForm báo không thể tạo lại nguồn.

### 8.4 In/PDF tham khảo

`printCandidate` nhận cùng bytes/SHA/instance ID như preview và tải; kiểm tra hash và tính hiện hành trước/sau khi render `docx-preview` trong iframe, rồi gọi `window.print()`. Đây là in bản render trình duyệt hoặc lưu PDF tham khảo, không phải engine phân trang Microsoft Word. Bố cục cuối cùng vẫn cần mở DOCX trong Word để kiểm tra.

### 8.5 Kết quả kiểm tra candidate an toàn và giới hạn

Browser test `candidate-preview-print-browser.test.ts` dùng candidate tổng hợp đã qua gate: SHA của preview trùng SHA tải candidate, SHA tải tệp gốc khớp blob nguồn, in diễn ra trong iframe riêng; nếu sửa Body trong lúc chờ font thì candidate cũ không được gọi `print()`. Đây là PASS cho byte identity và stale guard ở ca an toàn tổng hợp. Nó không bao phủ candidate bị chặn do Shape của pilot, không kiểm tra cách hiển thị preview chẩn đoán cho candidate `safe=false`, và không thay thế kiểm tra Word.

Audit trong Work hiện không truy cập được tab trình duyệt local vì cài đặt tắt browser-use; vì vậy chưa quan sát live UI `localhost:5050` ở lượt này. Browser evidence ở trên đến từ Chromium cô lập do test harness khởi chạy, trên cổng test riêng.

## 9. Kết quả chạy lại tệp pilot

| Dấu vết | Kết quả không kèm nội dung tài liệu |
|---|---|
| Kích thước/đếm | 20.700 byte; 12 SourceBlock; 0 phụ lục; 0 khối `unclassified`. |
| `block-0` | Bảng 2×2, role `header`, có `drawing_or_image`; bốn field cơ quan/quốc hiệu trỏ vào bảng, số/ký hiệu có `sourceCell=(rowIndex:1,colIndex:0)`, địa danh/ngày có `sourceCell=(rowIndex:1,colIndex:1)` (tọa độ 0-based). |
| `block-1`, `block-2` | Hai paragraph role `metadata`; block 1 là tên loại; block 2 là trích yếu và mang `drawing_or_image`. |
| `block-3`–`block-10` | Tám paragraph role `body`; đúng tám ID được đưa vào `body.sourceBlockIds`. |
| `block-11` | Bảng 1×2 role `signature`; nơi nhận trỏ ô `(rowIndex:0,colIndex:0)`, chức vụ và tên ký cùng trỏ ô `(rowIndex:0,colIndex:1)` (0-based). |
| Field values | Có giá trị/placeholder ở lần parse, nhưng báo cáo chỉ lưu trạng thái và locator, không lưu nội dung riêng tư của tài liệu. |
| Bảng/nội dung trong candidate | Không có table diff hoặc content violation trong reproduction candidate. Chỉ chứng minh candidate khớp nội dung làm việc được tạo; không xóa được khoảng trống kiểm tra paragraph coverage đã tái hiện ở NĐ30. |
| Shape | Nguồn có hai Shape trong bảng đầu và một Shape ở trích yếu; candidate chỉ có hai Shape tên `ND30 Plain Line 1/2`, không có Shape thứ ba. |
| Quyết định | Candidate `safe=false`, `downloadable=false`; blocker cụ thể `unsupported_source_ooxml:block-0`. Export safety cũng trả `reject` do đối tượng nguồn chưa hỗ trợ. |
| Tác động UI | Preview ứng viên không được mount; tải/in ứng viên bị chặn. Tệp gốc vẫn có thể tải nếu blob nguồn còn. |

> Tệp pilot là một ca thật được đọc trong phiên kiểm tra, không phải fixture đã khử nhận dạng trong repository. Kết quả này chỉ chứng minh lần chạy trên tệp đó, không tổng quát cho mọi DOCX.

Hai mục kiểm tra trong panel có thể phản ánh một blocker cụ thể cộng thông báo từ chối tổng quát; không nên diễn giải thành hai lỗi dữ liệu độc lập nếu không có hai violation riêng.

## 10. Kiểm thử đã chạy và trạng thái checkout

Checkout tại lúc kiểm tra: `D:\DocForm`, nhánh `main`, `HEAD=4c3751fd22977b325aed00af729c91f8e49211e4` (ahead `origin/main` 1 commit). Working tree đã có thay đổi chưa commit ở `src/App.tsx`, `src/components/ImportStepView.css`, `src/components/ImportStepView.tsx`, `src/index.css`, `src/server/structuralSegmenter.ts`, `src/shared/embeddedSignatureTable.ts`, `src/utils/importReview.ts`, `test/final-section-roundtrip.test.ts`, `test/step1-sidebar-navigation-browser.test.ts` và evidence `docs/superpowers/audits/2026-10-20-uiux-m1-evidence/g4-preview-metrics.json`. Đây là trạng thái dirty hiện hành; kết quả không đại diện riêng cho commit `HEAD`.

| Lệnh | Kết quả | Ý nghĩa |
|---|---|---|
| `npx.cmd tsx test/import-segments.test.ts` | PASS | Suite báo các ca phân vùng, phụ lục, ký, dấu sao HD05 và separator đạt; không bao phủ tất cả cấu trúc DOCX. |
| `npx.cmd tsx test/header-dual-regime.test.ts` | PASS, 5/5 case | Kiểm profile header generic/Hoa Tiêu cho NĐ30/HD05; không kiểm bảo toàn Shape nguồn bất kỳ trong upload. |
| `npx.cmd tsx test/stage5-s02-document-type-and-separator.test.ts` | PASS, `failures=0` | TXT tổng hợp; xác nhận một separator HD05 không bị nhân đôi khi xuất. Không kiểm separator NĐ30 hoặc nhiều separator nguồn. |
| `npx.cmd tsx test/workspace-candidate.test.ts` | PASS, 14/14 | Snapshot, candidate cache, fidelity, thứ tự bảng và fail-closed trong phạm vi test. Không phát hiện việc separator nguồn bị bỏ trước khi tạo Body. |
| `npx.cmd tsx test/import-fidelity-gate.test.ts` | PASS, 5/5 | Các ca bảng nguồn thiếu tính năng/roundtrip; không kiểm paragraph source coverage. |
| `npx.cmd tsx test/export-candidate-contract.test.ts` | PASS, 5/5 | Candidate hỏng/mất nội dung tổng hợp bị chặn; không tái hiện lỗi phân vùng làm mất block trước khi compose. |
| `npx.cmd tsx test/candidate-preview-print-browser.test.ts` | PASS, 1/1 trên Chromium test riêng | Candidate tổng hợp an toàn: preview/download/print gắn cùng bytes; original download đúng hash; sửa lúc đang in làm candidate stale và không gọi print. Không kiểm candidate bị chặn hoặc Word. Test ghi output metrics tại `docs/superpowers/audits/2026-10-20-uiux-m1-evidence/g4-preview-metrics.json`, tệp vốn đã dirty trước audit; nội dung có thể được test cập nhật và không bị reset. |
| `npx.cmd tsx test/final-footer-browser.test.ts` | FAIL, 0/1 | Trích đúng field và hiển thị bảng nguồn, nhưng UI thiếu nhãn “Bảng kết hợp · Nơi nhận và chữ ký” mà test yêu cầu; test dừng ở assertion nhãn, không tự đi tiếp Bước 2. |
| Kiểm tra Chromium tạm trên pilot, upload → duyệt → Bước 2 | PASS, 1/1 | B1 có 1 block role chữ ký và 8 Body; tại B2 canvas Body không chứa Nơi nhận/người ký, nhóm Phần cuối có cả hai. Script audit tạm đã xóa; không kiểm candidate preview vì Shape header chặn B3. |
| `npx.cmd tsx test/final-section-roundtrip.test.ts` | FAIL, 16/18 | Hai assertion tại dòng 383 và 413 còn yêu cầu `role=body`; mã local hiện trả `role=signature`. Cần thống nhất contract/test, không dùng lỗi test cũ để đưa footer trở lại Body. |
| Probe NĐ30 separator → workspace → candidate | **FAIL nghiêm trọng về bao phủ nguồn**: separator role `body` nhưng vắng khỏi Body; invariant không báo lỗi; candidate `safe=true`, `downloadable=true` | Bằng chứng trực tiếp cho lỗi silent omission và false pass tại mục 5.2; cần sửa parser và gate paragraph coverage. |
| Probe HD05 có hai separator nguồn | **FAIL bảo toàn**: hai block thành `separator`, Body bỏ cả hai; DOCX có một separator do exporter tự sinh | Test một separator xanh không bao phủ số lượng/vị trí separator nguồn. |
| `npx.cmd tsc --noEmit` | PASS | TypeScript kiểm tra được; không chứng minh hành vi runtime hay Word layout. |
| `git diff --check` | PASS, chỉ có cảnh báo LF/CRLF trên JSON evidence | Kiểm tra whitespace cho thay đổi tracked; báo cáo mới là untracked nên cần kiểm tra riêng trước khi bàn giao. |

Không chạy kiểm thử trực quan Word/LibreOffice cho tài liệu pilot. Không đánh giá live browser `localhost:5050` vì browser-use bị tắt; đã chạy test browser cô lập. Không sửa mã nguồn, không commit, không push. Báo cáo là tài liệu audit; các thay đổi mã local trước đó được giữ nguyên. Lưu ý test candidate-preview có ghi evidence JSON như nêu trong bảng; do tệp đã có local diff trước lần chạy, không khôi phục mù để tránh xóa dữ liệu người dùng.

## 11. Vấn đề và khuyến nghị theo ưu tiên

### P1 — Thêm cổng bao phủ paragraph nguồn trước khi candidate được phép tải

Trước khi tạo/duyệt candidate, kiểm tra từng SourceBlock paragraph theo role đã duyệt có một ánh xạ hợp lệ sang vùng làm việc hoặc một quyết định bỏ/biến đổi có ghi nhận. Tại tối thiểu, các block `body` phải được phủ bởi `body.sourceBlockIds` và nội dung/anchor trong HTML; separator HD05 do exporter chủ động dựng lại phải có mapping nguồn→đích rõ ràng. Candidate không được `safe` chỉ vì byte khớp với `doc.bodyHtml` nếu chính `doc.bodyHtml` đã thiếu paragraph nguồn. Thêm regression e2e từ upload/segment → workspace approval → candidate, assert dòng bị thiếu sẽ chặn xuất.

### P1 — Không xóa separator nguồn HD05 khi exporter chỉ tạo một separator chuẩn

Tách “separator dưới trích yếu do thể thức yêu cầu” khỏi các paragraph separator khác trong body. Nếu nguồn có nhiều separator hoặc vị trí không trùng vị trí chuẩn, giữ lại hoặc yêu cầu người dùng xác nhận xử lý; không gom toàn bộ thành một dấu rồi đánh dấu fidelity đạt. Bổ sung ca NĐ30/HD05 với `-----`, `- - -`, `___`, `* * *`, separator sau trích yếu và separator giữa Body; kiểm đồng thời block IDs, UI Body và XML DOCX.

### P1 — Tách preview chẩn đoán khỏi quyền tải/in

Cho phép dựng một preview có nhãn rõ “Bản ứng viên chưa vượt kiểm tra; chỉ dùng để đối chiếu” khi DOCX vẫn đọc/render được, nhưng tiếp tục khóa tải/in. Dùng cùng byte candidate/SHA hiện hành, hiển thị blocker cạnh preview, không xem render thành bằng chứng đạt fidelity. Giữ nguyên fail-closed cho tải/in.

### P1 — Bảo toàn và kiểm chứng Shape ở metadata

Thay kiểm tra `cy=0` đơn nhất bằng parser hình học có giới hạn độ nghiêng và validate đồng thời DrawingML/VML fallback, extents, anchors, nội dung và số lượng. Gắn Shape trích yếu với SourceBlock/anchor/raw fragment để biết chính xác nó thuộc vùng nào. Tạo ứng viên có ba đường hoặc tiếp tục khóa với chẩn đoán ba vị trí; không bỏ qua manifest unsupported feature.

### P1 — Sửa mất separator NĐ30

Không tăng con trỏ qua separator NĐ30 trước khi nó được đưa vào HTML Body; hoặc thêm nó như một editable/source node riêng đúng thứ tự. Bảo đảm cùng lúc `role`, `body.sourceBlockIds`, HTML, preview và candidate XML nhất quán. Không dừng ở sửa con trỏ: phải đóng false pass của workspace/candidate ở khuyến nghị đầu tiên.

### P1 — Chốt hợp đồng phần cuối

Yêu cầu sản phẩm hiện tại là nơi nhận/chữ ký thuộc phần cuối, không Body. Đồng bộ toàn bộ assertion legacy với contract này; kiểm tra thêm Bước 1, Bước 2, export candidate, byte OOXML, nơi nhận/chữ ký trong PDF tham khảo. Nếu cần bảo toàn bảng hai cột nguồn, xuất TableModel signature hoặc có mapping fidelity riêng; không chỉ trích text thành fields rồi mặc định bảng dựng lại giống nguồn.

Đặt nhãn dễ nhận biết cho bảng hỗn hợp trong đối chiếu Bước 1 và giữ nguyên bảng vật lý làm bằng chứng nguồn. Chromium ad hoc trên pilot hiện xác nhận field cuối tách khỏi Body sau khi chuyển Bước 2; cần đưa assertion này vào test browser được duy trì, gồm cả biến thể bảng/đoạn văn và ca candidate bị chặn ở Bước 3, để tránh regression và không lệ thuộc script audit tạm.

### P2 — Chẩn đoán blocker theo vị trí

Gộp thông báo integrity tổng quát với blocker gốc hoặc nhóm theo SourceBlock/feature. Hiện một blocker Shape cộng thông báo `exportSafety reject` có thể bị đếm như hai mục. Mỗi mục nên chỉ rõ: vùng nguồn, feature, trạng thái tái tạo, action đối chiếu.

### P2 — Thêm pilot ẩn danh cho pipeline

Tạo DOCX tổng hợp có: header table + hai đường nghiêng DrawingML/VML, Shape trích yếu, separator ở NĐ30, footer table nơi nhận/chữ ký, bảng nội dung và phụ lục. Đo hash byte nguồn, block roles/anchors, candidate XML, preview SHA và trạng thái print. Tệp nội bộ thật không được đưa vào test/fixture.

## 12. Bản đồ mã nguồn được đối chiếu

- Upload và ghép phiên import: [App.tsx](../src/App.tsx)
- Đọc tệp cục bộ, phân vùng một lần theo hệ đã chốt và dựng fidelity manifest: [localFileImport.ts](../src/utils/localFileImport.ts)
- Trích khối OOXML: [blockExtractor.ts](../src/server/blockExtractor.ts)
- Phân vùng và trích trường: [structuralSegmenter.ts](../src/server/structuralSegmenter.ts)
- Nhận diện nơi nhận/chữ ký trong bảng hai cột: [embeddedSignatureTable.ts](../src/shared/embeddedSignatureTable.ts)
- Quy tắc separator dùng chung segmenter/exporter: [separator.ts](../src/shared/separator.ts)
- Nhãn và điều khiển duyệt nguồn Bước 1: [ImportStepView.tsx](../src/components/ImportStepView.tsx)
- Lưu byte nguồn: [draftStore.ts](../src/utils/draftStore.ts)
- Dựng lại metadata/Body/cuối từ khối duyệt: [importReview.ts](../src/utils/importReview.ts)
- Manifest, partition, editable nodes và invariant: [workspaceState.ts](../src/utils/workspaceState.ts)
- Duyệt partition và revision giao dịch: [workspaceTransactions.ts](../src/utils/workspaceTransactions.ts)
- Mô hình và profile xuất: [documentComposer.ts](../src/utils/documentComposer.ts)
- Tạo DOCX và separator/header: [docxExport.ts](../src/utils/docxExport.ts)
- Thay bảng đầu và settings profile: [hoaTieuHeaderStamp.ts](../src/utils/hoaTieuHeaderStamp.ts)
- Gate Shape đầu nguồn: [sourceHeaderShapes.ts](../src/utils/sourceHeaderShapes.ts)
- Candidate cache và fidelity gates: [exportCandidate.ts](../src/utils/exportCandidate.ts)
- Gate bảng: [tableRoundtrip.ts](../src/utils/tableRoundtrip.ts)
- Giao diện xem/xuất: [WorkspaceExport.tsx](../src/components/WorkspaceExport.tsx)
- Render preview: [A4DocumentPreview.tsx](../src/components/A4DocumentPreview.tsx)
- Render in tham khảo: [CandidatePrintView.tsx](../src/components/CandidatePrintView.tsx)
- E2E bảng cuối ở Bước 1: [final-footer-browser.test.ts](../test/final-footer-browser.test.ts)
- Roundtrip phần cuối và phụ lục: [final-section-roundtrip.test.ts](../test/final-section-roundtrip.test.ts)
- Preview, print, stale candidate và tải nguồn: [candidate-preview-print-browser.test.ts](../test/candidate-preview-print-browser.test.ts)
