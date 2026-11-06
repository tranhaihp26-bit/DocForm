# Thay line thể thức nguồn bằng line hệ thống — Audit và kế hoạch bàn giao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Thực hiện từng task trên checkout hiện tại; không reset, checkout, clean, commit hoặc push.

**Goal:** Trong vị trí thể thức đã xác nhận, loại line thuộc tệp nguồn khỏi candidate và sinh line của regime/profile đang chọn; line dưới trích yếu phải sát đoạn chữ như hai line thể thức phần đầu, đồng nhất 0,75 pt, và riêng line đã thay không được tạo cảnh báo hoặc chặn In/PDF.

**Architecture:** Nhận diện line nguồn bằng vị trí thể thức, regime, hình học và bằng chứng OOXML; chỉ thay khi candidate sinh line hệ thống tương ứng và gắn đúng trích yếu đã chọn. Giữ byte nguồn và mọi gate độc lập về bảng, nội dung, phân vùng, revision, media và cấu trúc chưa hỗ trợ. Preview, tải và in dùng cùng candidate bytes; WPS/Word là điều kiện nghiệm thu bố cục.

**Tech Stack:** TypeScript, OOXML/DOCX, JSZip, docx, tsx, browser candidate preview, WPS/Word.

**Spec:** Yêu cầu người dùng trong hội thoại 2026-11-06; kế thừa audit/plan line trước và pilot bộ mẫu ND30/HD05.

## Ràng buộc chung

- Không sửa byte tệp gốc; chỉ xử lý candidate.
- Giữ độc lập administrative/NĐ30 và party/HD05. Không đổi dấu phân cách HD05 “-----” thành Shape Line.
- Line sau xử lý vẫn hiện trên trang nhưng phải là line hệ thống; không sao chép XML, tọa độ trang hoặc kiểu nét của line nguồn.
- Độ dày line hệ thống: 0,75 pt ở DrawingML, VML fallback và preview CSS.
- Chỉ bỏ cảnh báo sau khi candidate chứng minh đúng line hệ thống thay đúng đối tượng nguồn. Không bỏ cảnh báo table style, table/content fidelity, partition approval, media hoặc OOXML khác.
- “Line không chặn” chỉ áp dụng khi line đã được thay và không còn blocker độc lập. Không nới gate để ép pilot xuất được.
- Không ghi nội dung tài liệu nội bộ hoặc thông tin cá nhân vào test, log, báo cáo hay fixture. Dùng fixture tổng hợp; tài liệu thật chỉ xử lý cục bộ.
- Giữ nguyên mọi diff có sẵn. Không ghi đè báo cáo pilot Desktop hoặc ảnh/metrics audit đang sửa trong working tree.

## Audit snapshot ngày 2026-11-06

### Kết quả và phạm vi đã có

- Working tree có nhiều diff chưa commit. File line đã đổi gồm src/utils/sourceHeaderShapes.ts, src/utils/exportCandidate.ts, src/utils/docxExport.ts, src/utils/hoaTieuHeaderStamp.ts, src/utils/formalLineThickness.ts, src/canonical/nd30/canonicalAudit.ts, src/components/A4DocumentPreview.tsx và các test liên quan. Đây là trạng thái nền cần giữ, không làm lại từ đầu.
- Pilot 57 DOCX: import 57/57 PASS, hash khớp 57/57; có 41 candidate tạo trong bộ nhớ, 14 tệp chờ xác nhận regime, 2 tài liệu tham khảo chưa duyệt được bỏ qua.
- Cả 41 candidate bị gate xuất chặn vì partition chưa được duyệt. Bảng 12 PASS/29 FAIL; nội dung 24 PASS/17 FAIL; export safety 9 allow/32 reject. Năm candidate qua cả ba mục nhưng vẫn bị partition gate chặn. Pilot này không chứng minh gỡ cảnh báo line sẽ cho mọi hồ sơ xuất được.
- Đo cấu trúc candidate: 48 line hệ thống trong 25 candidate đều ở 0,75 pt trong DrawingML và VML. Có 17 candidate có subject underline; tỷ lệ đo được đều xấp xỉ 0,40.
- Pilot năm fixture tổng hợp dài 8, 51, 96, 59 ký tự (2 dòng xuống cứng) và 211 ký tự có line ngay sau đoạn, flow inline và spacing trước/sau theo metric pilot bằng 0 twips. Preview render cục bộ đã được xem; chưa xác nhận bằng WPS/Word.
- Quét OOXML bộ 57 tệp: 24 thẻ w:drawing và 24 w:pict ở 12 tài liệu; 18 hình học DrawingML dạng line và 8 v:line. Các block line-like được ghi nhận nằm trong bảng; không có paragraph line-like độc lập trong corpus.
- Có 21 paragraph-border w:pBdr trong corpus, tất cả nằm trong table cell; 36 tài liệu có table borders, 20 có cell borders. Đây là bộ phận cấu trúc bảng, không được tự động xóa như line trang trí. w:u là định dạng gạch chân chữ; không coi tất cả thẻ này là Shape Line.
- DOCX ví dụ 59 block do người dùng cung cấp vẫn tồn tại nhưng bị một tiến trình khác giữ file khi audit. Audit này không mở, đóng hoặc sửa tệp đó. Snapshot trước trong plan ghi nhận: block đầu có hai line DrawingML/VML và cảnh báo table style độc lập; paragraph trích yếu có một line DrawingML/VML; block nơi nhận/chữ ký không chứa line.
- Theo ảnh người dùng, line hiện ở cả preview và WPS. Lỗi là khoảng cách dọc WPS so với trích yếu, không phải làm line biến mất. Độ rộng line được ước tính gần 40% ở cả hai; ảnh so sánh trước ghi gap preview khoảng 5 pt, WPS khoảng 24 pt. Đây là phép đo ước lượng từ ảnh, chưa phải WPS trên candidate mới cùng SHA.
- Code hiện hỗ trợ một số line AlternateContent DrawingML/VML, kể cả VML có imagedata rỗng; có nhánh riêng cho subject line; đã lọc drawing_or_image theo block thay thế. Tuy nhiên subjectUnderlineProofFromDocumentXml mới kiểm paragraph trước line là centered/bold, chưa nhận expectedSubject từ formatData.subject; proof chưa ràng buộc chắc chắn line với trích yếu đã chọn.
- Bộ nhận diện hiện tập trung DrawingML/VML. Yêu cầu gồm line tạo bằng nhiều cơ chế. Cần kiểm kê định dạng thực tế trong vị trí thể thức trước khi quyết định hỗ trợ paragraph border, table border, AutoShape/connector khác hoặc cơ chế khác. Không suy rộng từ tag count.
- Plan cũ đánh dấu một số test tự động đã hoàn thành theo kết quả được báo trước. Audit này không chạy lại test; mọi PASS trong handoff phải được xác nhận lại trên checkout cuối.

### Đường dẫn evidence cho Anti

- DOCX ví dụ 59 block: C:\Users\GIAP\Downloads\Thông_báo_chương_trình_tổng_kết-DOI_CHIEU_CHUA_XAC_NHAN-ND30 (2).docx. File bị lock trong audit; mở read-only qua bản sao khi khả dụng.
- Corpus pilot 57 DOCX: C:\Users\GIAP\Desktop\BO_MAU_ND30_HD05_MO_RONG_v2_2026-10-30 (1).
- Kết quả pilot hiện có: C:\Users\GIAP\Desktop\PILOT_KET_QUA_DOCFORM_2026-11-06; xem PILOT-REPORT.md, pilot-results.csv, pilot-results.json. Không ghi đè; xuất lần chạy mới vào thư mục mới.
- Metric pilot 5 độ dài: D:\DocForm\tmp\pdfs\subject-line-pilot-20261106\pilot-metrics.json; preview comparison: D:\DocForm\tmp\pdfs\subject-line-pilot-20261106\subject-line-pilot-comparison.pdf. Đây là evidence cục bộ hiện có; không sửa/xóa thư mục tmp trong lúc dùng.
### Kết luận gốc lỗi

1. **Bố cục:** Bằng chứng hiện tại chỉ ra sai khác gap dọc giữa subject và line; chiều rộng và sự hiện diện line đã phù hợp. Đo lại trên cùng candidate và tỷ lệ trang trước khi đổi spacing.
2. **Thay đối tượng:** Pilot 57 tài liệu không có paragraph line nguồn để kiểm chứng thay line dưới trích yếu. Nó không xác nhận việc thay line trong DOCX ví dụ 59 block.
3. **Proof chưa chặt:** Candidate proof chưa nhận expectedSubject; có nguy cơ chứng minh line dưới một paragraph centered/bold khác mà không ràng buộc đúng trích yếu đã chọn.
4. **Phạm vi cơ chế:** Không coi DrawingML/VML là toàn bộ cách Word có thể biểu diễn line. Phải phân biệt line trang trí với viền lưới bảng và gạch chân chữ.
5. **Gate:** Gỡ line warning không đồng nghĩa cho phép xuất. Partition, fidelity và cảnh báo độc lập tiếp tục được áp dụng.

## Review Focus

1. Pure DrawingML/VML line, kể cả VML imagedata rỗng không có relationship, trong formal slot được thay.
2. DML/VML có relationship ảnh, ảnh thật, textbox, field, hyperlink hoặc đối tượng hỗn hợp không bị nhận nhầm thành line.
3. Paragraph border chỉ được thay nếu thuộc paragraph thể thức riêng, xác định chắc chắn; table/cell border dùng làm lưới không bị xóa.
4. Gạch chân chữ, dấu gạch HD05, line trong body/phụ lục hoặc vùng chưa phân loại không bị tự động thay.
5. Candidate subject ngắn, dài một dòng, nhiều dòng explicit và tự wrap vẫn đặt line đúng; candidate cũ không được tái dùng sau khi subject/revision đổi.

---

### Task 1: Dựng lại baseline trên đúng tài liệu nguồn

**Files:**
- Read-only: DOCX ví dụ 59 block của người dùng, khi đọc được an toàn.
- Review: src/utils/localFileImport.ts, src/utils/exportCandidate.ts, src/utils/workspaceState.ts.
- Evidence mới: thư mục pilot mới, không ghi đè kết quả hiện có.

**Interfaces:**
- Dùng pipeline hiện hành: extractLocalFile → detectRegimeFromRawBlocks → segmentLocalExtraction → prepareExportCandidate.
- Ghi candidate SHA, regime, block ID, line mechanism/geometry và blocker code; không ghi text tài liệu.

- [ ] Ghi git status --short, HEAD và danh sách diff trước khi làm; bảo toàn mọi thay đổi.
- [ ] Khi tệp nguồn không còn bị lock, tạo bản sao làm việc trong thư mục tạm; ghi SHA-256 nguồn và bản sao để xác nhận byte không đổi.
- [ ] Chạy import cục bộ và xác nhận lại block/header/subject/recipient bằng ID và loại block; không log nội dung.
- [ ] Tạo candidate từ đúng source state hiện tại; ghi SHA dùng trong preview và khi mở WPS.
- [ ] Ghi baseline blocker trước/sau thay line; tách drawing_or_image, unsupported_table_style, table/content fidelity, partition approval và blocker khác.
- [ ] Nếu gate ngăn tải chính thức, chỉ tạo bản chẩn đoán local trong tmp, dán nhãn NEEDS_REVIEW; không đổi safe/downloadable và không dùng để in/phát hành.

**Verification:**
- Lặp hash nguồn trước/sau.
- Ghi import/regime/candidate và lỗi chính xác; nếu không tái tạo được line source hoặc gap WPS thì dừng đổi spacing và đánh dấu NOT_REPRODUCED.

### Task 2: Hoàn thiện nhận diện line theo vị trí và cơ chế

**Files:**
- Chỉ sửa nếu baseline cho thấy thiếu: src/utils/sourceHeaderShapes.ts, parser/manifest owner theo Codebase Map.
- Test: test/source-subject-underline-replacement.test.ts; test import/fidelity chỉ khi producer thay đổi.

**Interfaces:**
- Giữ helper hiện có trừ khi có bằng chứng cần đổi contract:
  - isDecorativeLineShape(fragment: string): boolean
  - hasReplaceableHeaderShapeLines(sourceXml: string): boolean
  - hasReplaceableSubjectUnderlineShape(sourceXml: string, sourceText: string, expectedSubject: string): boolean

- [ ] Lập inventory biểu diễn thực sự có ở formal slot của DOCX đích và corpus: DrawingML line/connector, VML line/shape, paragraph border và dạng khác nếu có. Ghi riêng line source với table grid và text underline.
- [ ] Với DrawingML/VML: chỉ nhận hình học thẳng/ngang tối đa 2 pt, DML/VML fallback tương ứng; empty imagedata chỉ được bỏ qua khi không có r:id, src, link, embed hay quan hệ ảnh.
- [ ] Chỉ thêm paragraph border hoặc dạng khác nếu baseline chứng minh nó xuất hiện ở vị trí thể thức riêng và có thể loại khỏi candidate một cách cô lập.
- [ ] Không nhận table/cell border làm line thay thế nếu nó là khung/lưới; giữ warning của bảng trừ khi phép biến đổi bảng được chứng minh riêng.
- [ ] Thêm test dương cho từng representation được hỗ trợ và test âm cho ảnh thật, relationship, textbox, field, line nghiêng, line hỗn hợp, body/phụ lục, gạch chân chữ và cấu trúc bảng.
- [ ] Không tạo schema/type chung mới nếu producer/consumer hiện tại đủ biểu diễn evidence; nếu thêm thì nối đầy đủ parser → manifest → candidate gate → UI.

**Verification:**
- npx tsx test/source-subject-underline-replacement.test.ts
- Kỳ vọng: chỉ pure line trong formal slot được nhận; shape/mixed content chưa chứng minh vẫn cần đối chiếu.

### Task 3: Ràng buộc proof candidate với trích yếu được chọn

**Files:**
- Modify: src/canonical/nd30/canonicalAudit.ts, src/utils/exportCandidate.ts.
- Review caller: src/components/A4DocumentPreview.tsx.
- Test: test/subject-underline-warning.test.ts, test/data-pipeline-improvement.test.ts.

**Interfaces:**
- Dùng strict path, ví dụ subjectUnderlineProofFromDocumentXml(xml, expectedSubject). Nếu giữ đường gọi không có expected subject cho audit tổng quát, export bắt buộc truyền formatData.subject và fail-closed khi text không khớp.

- [ ] Chuẩn hóa text theo NFC/whitespace; strict proof khớp formatData.subject, không chỉ dựa paragraph adjacent centered/bold.
- [ ] Yêu cầu đúng một ND30 Plain Line 3, inline ngay sau subject; line paragraph không có text, field hoặc shape phụ.
- [ ] Kiểm tra DML và VML fallback cùng chiều dài, ngang, flow trong paragraph và đúng 0,75 pt; thiếu fallback hoặc sai thickness không tạo PASS proof.
- [ ] Candidate chỉ xóa drawing_or_image của source block ID đã xác minh; feature khác trong block vẫn còn.
- [ ] Thêm test âm: subject lân cận khác, line gắn dưới document type, duplicate line, text trong line paragraph, sai độ dày, sai chiều rộng DML/VML, line absolute/page-relative.
- [ ] Thêm test dương bằng fixture ẩn danh mô phỏng source subject; xác nhận source shape/anchor không còn trong candidate, system line mới có đúng một lần, source text không đổi.

**Verification:**
- npx tsx test/subject-underline-warning.test.ts
- npx tsx test/data-pipeline-improvement.test.ts
- Kỳ vọng: proof chỉ PASS khi candidate có line hệ thống dưới đúng subject đã chọn.

### Task 4: Đồng bộ độ dày và sửa gap theo WPS

**Files:**
- Chỉ sửa nếu verification thất bại: src/utils/docxExport.ts, src/utils/formalLineThickness.ts, src/utils/hoaTieuHeaderStamp.ts, src/components/A4DocumentPreview.tsx.
- Test: test/subject-underline-warning.test.ts, test/header-dual-regime.test.ts, subject-line browser/render test.

**Interfaces:**
- Dùng SYSTEM_FORMAL_LINE_THICKNESS_PT, SYSTEM_FORMAL_LINE_THICKNESS_EMU, SYSTEM_FORMAL_LINE_THICKNESS_CSS.
- Giữ subjectUnderlineWidthTwips và inline ND30 Plain Line 3; không phục hồi tọa độ trang cố định.

- [ ] Xác nhận mọi system line NĐ30/HD05/profile và preview CSS dùng 0,75 pt; không đổi tọa độ/chiều dài hai line profile đã chốt.
- [ ] Giữ width khoảng 0,40 của dòng subject hiển thị dài nhất; kiểm tra không vượt bề rộng dòng và DML/VML khớp.
- [ ] Render cùng candidate SHA ở preview và WPS/Word. Đo khoảng từ đáy nét chữ cuối subject tới đỉnh line, chuẩn hóa theo chiều rộng trang A4.
- [ ] So gap subject với gap hai line thể thức tham chiếu ngay phía trên trên cùng trang/render. Tiêu chí: sai khác không quá 2 pt so với trung bình hai gap tham chiếu; không chồng chữ, không đẩy body bất thường.
- [ ] Nếu WPS gap còn lớn: kiểm tra line paragraph, w:spacing, line box, inline extent và VML fallback từng yếu tố; thay một yếu tố mỗi lần. after của line paragraph là khoảng cách với nội dung dưới line, không mặc định là nguyên nhân gap phía trên.
- [ ] Giữ preview line gắn với proof từ candidate bytes; không tạo line chỉ vì gặp document type quen thuộc. Chỉ chỉnh CSS top margin khi phép đo cùng SHA chứng minh lệch WPS.
- [ ] Kiểm tra subject ngắn 8 ký tự, trung bình 51, dài 96, explicit 2 dòng/59 ký tự, tự wrap 211 ký tự và subject thực tế. Độ dày luôn 0,75 pt; line ở dưới dòng chữ cuối.

**Verification:**
- Kỳ vọng cấu trúc: DML 9525 EMU, VML 0,75 pt, CSS 0,75 pt.
- Kỳ vọng trực quan: gap đạt tiêu chí trong WPS/Word và preview; ghi ứng dụng thực tế và SHA candidate.

### Task 5: Giữ gate và cảnh báo chỉ còn vấn đề chưa xử lý

**Files:**
- Chỉ sửa nếu behavior thất bại: src/utils/exportCandidate.ts, src/shared/importFidelity.ts, src/components/WorkspaceExport.tsx, src/utils/workspaceExportMessages.ts.
- Test: test/data-pipeline-improvement.test.ts, test/export-candidate-contract.test.ts, test/candidate-preview-print-browser.test.ts.

- [ ] Line-only issue bị bỏ khỏi blocker/warning sau khi strict proof PASS; system line vẫn hiện.
- [ ] Mixed/unproven source shape vẫn giữ warning và gate.
- [ ] Candidate còn unsupported_table_style, missing table, content mismatch, unsupported image/OOXML hoặc partition chưa duyệt tiếp tục bị chặn theo gate hiện hành.
- [ ] Có test line-only: sau khi duyệt nguồn và qua kiểm tra khác, safe/downloadable và In/PDF được phép.
- [ ] Có test mixed issue: line thay xong nhưng table-style issue vẫn hiện và vẫn chặn nếu gate yêu cầu.
- [ ] Xác nhận preview/download/print dùng cùng candidate instance, SHA-256 và revision; đổi subject làm candidate cũ stale và sinh lại line.
- [ ] Không mở rộng UI redesign hiện có. Giữ diff UI ngoài line nguyên trạng; chỉ sửa copy/condition liên quan line nếu test chứng minh cần.

**Verification:**
- npx tsx test/data-pipeline-improvement.test.ts
- npx tsx test/export-candidate-contract.test.ts
- Browser test chỉ chạy sau khi kiểm tra side effect: hiện test ghi g4-candidate-preview-fit.png và g4-preview-metrics.json, hai file đang có diff. Nếu cần chạy, cho test nhận DOCFORM_EVIDENCE_DIR và ghi vào tmp mới; không ghi đè audit evidence hiện tại.
- Kỳ vọng: line đã thay không tạo warning/gate riêng; gate độc lập không đổi.

### Task 6: Pilot hoàn tất và nghiệm thu

**Files:**
- Test/report mới ở thư mục timestamp mới; không ghi đè PILOT_KET_QUA_DOCFORM_2026-11-06 hoặc ZIP cũ.
- Không đưa nội dung tài liệu thật vào report hoặc fixture.

- [ ] Chạy focused tests Task 2–5 và npm run lint trên diff cuối.
- [ ] Chạy lại pilot corpus 57 DOCX sau khi line path ổn định. So sánh import/hash/regime/gate; ghi riêng source line thay, warning line trước/sau và line system DML/VML thickness.
- [ ] Dùng DOCX 59 block để chứng minh source shape IDs không còn trong candidate và system line hiện dưới subject. Corpus 57 không thay thế ca này.
- [ ] Mở đúng candidate SHA trong WPS; chụp trang A4 và đo gap như Task 4. Nếu chỉ xem preview/LibreOffice thì Word/WPS ghi NOT_EVALUATED.
- [ ] Ghi blocker độc lập còn lại của candidate đích; không ghi line là nguyên nhân sau khi line warning đã gỡ.
- [ ] Báo từng trạng thái PASS, FAIL, BLOCKED, NEEDS_REVIEW, NOT_EVALUATED; không kết luận release-ready chỉ từ test cấu trúc hoặc diagnostic preview.

## Tiêu chí hoàn thành

- Đúng line source trong formal slot bị loại khỏi candidate và thay bằng line regime/profile đang chọn; line vẫn hiện trên trang.
- Line dưới trích yếu sát dòng chữ cuối, gap tương đương hai line thể thức tham chiếu; WPS/Word và preview cùng vị trí.
- System line DML/VML/CSS thống nhất 0,75 pt.
- Không còn warning/blocker do line đã thay; warning độc lập vẫn còn và gate không bị nới.
- Ảnh thật, textbox, field, mixed shape, viền lưới bảng, gạch chân chữ, dấu “-----” HD05 và line trong body/phụ lục không bị xóa nhầm.
- Byte nguồn, nội dung subject, provenance và revision không đổi/không bị tráo.

## Handoff cho Anti

Thực hiện plan này trên checkout hiện tại. Bắt đầu bằng đối chiếu git status và audit snapshot; không reset, xóa hoặc ghi đè diff có sẵn. Chỉ sửa task còn fail sau khi tái hiện; không lặp phần đã chứng minh. Ưu tiên DOCX 59 block và gap WPS; pilot 57 tài liệu chỉ là regression vì không có source line trong paragraph trích yếu. Không bỏ partition/fidelity/safety gate để ép xuất. Khi xong, báo file đã sửa, focused tests/lint, candidate SHA và bằng chứng WPS; nếu chưa mở cùng candidate trong WPS thì ghi NEEDS_REVIEW.
