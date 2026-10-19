# Hướng Dẫn Dành Cho Coding Agent (AGENTS.md)

Tài liệu này là điểm khởi đầu bắt buộc cho mọi coding agent khi tiếp nhận nhiệm vụ tại dự án **DocForm-30**. Đọc kỹ các nguyên tắc cốt lõi trước khi thực hiện bất kỳ sửa đổi nào.

---

## 1. Mục Đích Sản Phẩm & Hai Chế Độ Thể Thức Độc Lập

DocForm-30 là công cụ hỗ trợ cán bộ, nhân viên văn phòng:
- Tải tệp Word (`.docx`) hoặc văn bản thuần (`.txt`), bóc tách cấu trúc tài liệu và bảng biểu mà không làm mất dữ liệu nguồn.
- Soạn thảo và rà soát trực quan trên mặt giấy A4 theo 2 hệ quy chuẩn độc lập.
- Nhận diện 9 nhóm thành phần thể thức chính, kiểm tra lỗi và đề xuất sửa đổi có người dùng duyệt trước khi áp dụng.
- Xuất tệp Microsoft Word (`.docx`) chuẩn OOXML và bản in PDF.

### Hai chế độ thể thức độc lập (Tuyệt đối không áp chéo rule):
1. **Hành chính Nhà nước (`administrative`):** Tuân thủ **Nghị định 30/2020/NĐ-CP** (và Phụ lục I).
   - Quốc hiệu: `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM` (12–13pt, in hoa, đứng, đậm).
   - Tiêu ngữ: `Độc lập - Tự do - Hạnh phúc` (13–14pt, in thường, đứng, đậm), có đường kẻ nét liền dài bằng dòng chữ phía dưới.
   - Cơ quan ban hành: Có đường kẻ nét liền dài từ $1/3$ đến $1/2$ độ dài dòng chữ đặt dưới tên cơ quan.
   - Số hiệu: Bắt buộc có tiền tố `Số: ` (có dấu hai chấm), ví dụ `Số: 12/QĐ-UBND`.
   - Cỡ chữ nội dung: 13–14pt Times New Roman.
2. **Văn bản Đảng (`party`):** Tuân thủ **Hướng dẫn số 05-HD/VPTW** ngày 27/5/2026 của Văn phòng Trung ương Đảng.
   - Tiêu đề: `ĐẢNG CỘNG SẢN VIỆT NAM` (15pt, in hoa, đứng, đậm), có đường kẻ nét liền dài bằng dòng chữ phía dưới.
   - Tiêu ngữ: **Tuyệt đối không có tiêu ngữ**.
   - Cơ quan ban hành: Có dấu hoa thị `*` đặt dưới tên cơ quan (không dùng đường kẻ như NĐ 30).
   - Số hiệu: Bắt buộc định dạng `Số ` (không có dấu hai chấm), ví dụ `Số 12-NQ/ĐU`.
   - Công văn Đảng: Trích yếu nội dung đặt ở cột trái dưới số hiệu (12pt, in thường, nghiêng, không đậm), không có tên loại văn bản ở giữa trang.
   - Văn bản có tên loại: Dưới trích yếu có 5 dấu gạch nối `-----`.
   - Cỡ chữ nội dung: 14pt Times New Roman.

### 9 Nhóm thành phần thể thức chính và các nhóm bổ sung có điều kiện:
Mỗi chế độ có **đúng 9 nhóm thành phần chính** (1: Tiêu đề thể thức; 2: Cơ quan ban hành; 3: Số, ký hiệu; 4: Địa danh và ngày tháng; 5: Tên loại và trích yếu; 6: Nội dung văn bản; 7: Quyền hạn, chức vụ, chữ ký; 8: Dấu, chữ ký số; 9: Nơi nhận).  
*Các thành phần như Phụ lục (`supp_appendix`), Độ mật/khẩn (`supp_security_urgency`), Chỉ dẫn phát hành (`supp_distribution`), Bản sao (`supp_copy`), Khổ trang & phân trang (`supp_page_setup`) là các nhóm bổ sung có điều kiện, tuyệt đối không tính thành thành phần chính thứ 10.*

---

## 2. Thứ Tự Đọc Mã Nguồn Theo Nhiệm Vụ

**Không đọc toàn bộ repository trước khi bắt đầu.** Hãy đọc theo thứ tự sau:

1. **Bản đồ mã nguồn:** Mở [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md) để xác định chính xác luồng dữ liệu, các file liên quan và bộ kiểm thử tương ứng với nhiệm vụ của bạn.
2. **Chỉ đọc các file nằm trong phạm vi cần sửa:**
   - Sửa Parser/Table/DOCX import: đọc `src/server/blockExtractor.ts`, `src/server/structuralSegmenter.ts`.
   - Sửa Rule/Validation: đọc `src/canonical/ruleEngine.ts`, `src/shared/schemas/document.schema.ts`.
   - Sửa Giao diện wizard/canvas: đọc `src/App.tsx`, `src/components/OfficeWorkerViews.tsx`, `src/components/A4DocumentPreview.tsx`.
   - Sửa Word Export: đọc `src/utils/docxExport.ts`, `src/utils/tableFormatUtils.ts`.
   - Sửa AI Review / Chính tả: đọc `src/server/reviewProposals.ts`, `server.ts`.

---

## 3. Nguyên Tắc Bảo Toàn Dữ Liệu Nguồn

Mọi thay đổi trong parser, segmenter và export phải tuân thủ nghiêm ngặt:
- **Không tự tạo chữ ký hoặc người ký giả mạo:** Đối với các văn bản dự thảo, kế hoạch hoạt động không có chữ ký trong nguồn (ví dụ tệp `Ke hoach hoat dong giai doan 2026 -2031 HH HT HHVN.docx`), hệ thống phải giữ nguyên hiện trạng, ghi nhận là văn bản chưa có chữ ký, nhóm 7 đạt trạng thái `NOT_APPLICABLE` hoặc ghi nhận rõ ràng. Tuyệt đối không tự biến các hàng trong bảng phân công thành tên người ký, chức danh hay ngày tháng giả.
- **Bảo toàn bảng biểu và hợp đồng chỉnh sửa ô bảng (TableModel, Sync Contract & Candidate Roundtrip Gate):**
  - Mọi bảng nhập phải được gán một ID duy nhất, bền vững (`block-${index}`) xuyên suốt quy trình: từ trích xuất OOXML, `data-source-table-id` trên HTML view, TipTap schema mở rộng (`PreserveTable`, `PreserveTableCell`), whitelist DOMPurify, ánh xạ `importedTables` đến xuất DOCX.
  - Khi người dùng chỉnh sửa nội dung trong ô bảng (`NGUON` -> `DA SUA`, xóa text, hoặc nhập số có số 0 đầu), hàm `syncTableModelFromHtml` đối chiếu theo `cellId` và tọa độ lưới, cập nhật mô hình `effectiveModel` mà vẫn bảo toàn 100% thuộc tính nguồn (phông chữ, cỡ chữ nửa điểm, in đậm, in nghiêng, viền, margins, shading, căn lề, `cantSplit`, `tblHeader`).
  - **Bảo toàn nhiều run định dạng trong ô khi sửa chữ (Multi-run Formatting Preservation & CSS Inline Parsing):**
    - Các hàm `parseRunsFromHtmlString`, `parseRunsFromDomElement` và `reconcileRunsWithNewText` bóc tách các thẻ định dạng (`strong`, `b`, `em`, `i`, `u`, `span`) thành các `TableCellRun` độc lập.
    - Hỗ trợ đầy đủ thuộc tính CSS `style="..."` trên thẻ `<span>`: trích xuất `font-family`, `font-size` (pt sang half-points `pt * 2`, px sang `px * 1.5`), `font-weight`, `font-style`, `text-decoration`. Hỗ trợ cấu trúc stack cho các thẻ lồng nhau và xử lý đảo chiều/tắt style (`font-weight: normal`, `font-style: normal`, `text-decoration: none`).
    - Khi người dùng sửa văn bản trong ô (kể cả khi HTML gửi lên là plain text hoặc sửa nhiều vị trí cách nhau `Abc MIDDLE xyZ`), giải thuật quy hoạch động LCS (Longest Common Subsequence) / Multi-site Alignment ánh xạ chính xác từng ký tự thay đổi về đúng run tương ứng, bảo toàn 100% in đậm, nghiêng, gạch chân cho các từ không đổi mà không gộp khoảng giữa thành một run đơn.
  - **Cổng kiểm chứng hai chiều & Chính sách bảng mới (Two-way Gate & New Tables Policy):**
    - Tệp DOCX ứng viên sinh ra được embed `w:tblCaption` mang đúng `tableId`. Cổng kiểm chứng `verifyCandidateExportFidelity` đối chiếu hai chiều: tự động phân loại bảng layout hệ thống (`region: "header"` và `region: "signature"`), giải thích mọi bảng trong `tableDecisions`; phát hiện ID trùng lặp (`duplicate_table_id`), đảo thứ tự bảng (`table_order_mismatch`), và bảng mới phát sinh ngoài dự kiến (`unexplained_new_table`) với nguyên tắc fail-closed.
    - Ngay cả khi danh sách bảng nguồn `importedTables` rỗng, cổng kiểm chứng vẫn giải nén `candidateDocxBytes`, đọc OOXML và kiểm kê toàn bộ bảng ứng viên. Nếu tệp ứng viên hỏng (`candidate_unpack_failed`) hoặc phát sinh bảng nội dung ngoài ý muốn không nằm trong `approvedNewTableIds`, cổng lập tức từ chối (`safe: false`, vi phạm `unexplained_new_table`).
  - Quét tính năng chưa hỗ trợ trực tiếp từ chuỗi XML `<w:tbl>` nguồn: phát hiện bảng lồng (`w:tbl` lồng), thẻ đồ họa/hình ảnh (`w:drawing`, `w:pict`), trường mã phức tạp (`w:fldSimple`, `w:fldChar`), hyperlink trong ô, và ô tiếp nối `vMerge continue` nhưng lại có nội dung chữ.
  - Trích xuất và bảo toàn nguyên vẹn thuộc tính định dạng nguồn từ OOXML. `buildDocxTableFromModel` tuyệt đối không tự áp preset thẩm mỹ (không gán cứng 12pt và viền mặc định).
  - Không cho phép cờ `roundtripProven` tĩnh từ phiên cũ chứng nhận bản xuất mới sau khi người dùng đã sửa đổi nội dung. Mỗi lần xuất đều phải vượt qua phép đối chiếu candidate bytes thực tế với manifest nhập.
- **Bảo toàn tệp gốc và cơ chế Fail-Closed:**
  - Tệp DOCX gốc được lưu trữ trong object store `source_blobs` độc lập của IndexedDB (SHA-256). Hàm `saveSourceBlob` và `parseLocalFile` trả rõ trạng thái lưu bền vững (`indexeddb`) hay tạm thời trong bộ nhớ (`memory`) để cảnh báo người dùng trung thực trên giao diện.
  - Người dùng luôn có thể tải lại tệp gốc nguyên vẹn thông qua nút "Tải Lại Tệp Gốc" tại Bước 4.
  - **Một nguồn trạng thái đã duyệt & Đề xuất AI chuẩn xác vị trí (Target Block Precision & Deterministic Reconstruction):**
    - Trạng thái phân vùng đã duyệt (`reviewBlocks`) kết hợp cùng module `proposalState.ts` (`applySingleProposal`, `applyAllProposalsSequentially`, `changeBlockRole`) bảo đảm cập nhật bất biến, không mutate React state.
    - Khi áp dụng đề xuất sửa đoạn văn hoặc ô bảng, cập nhật chính xác khối mục tiêu (`targetBlockId`) và ô chỉ định (`cellIndex`). Với ô bảng, `tableModelToHtmlView` tái tạo lại HTML chuẩn xác với các thuộc tính `data-cell-id`, ngăn chặn hoàn toàn lỗi string replace thay nhầm vị trí đầu tiên khi nhiều đoạn hoặc nhiều ô có text giống nhau (`SAME`).
    - Nội dung `doc.bodyHtml`, `structuredImport.body.html` và phụ lục tương ứng được tái dựng trực tiếp từ danh sách `reviewBlocks` đã duyệt theo một nguồn chân lý duy nhất. Mọi đề xuất có `original` không còn tồn tại đều bị từ chối an toàn với lý do rõ ràng.
- **Kiểm định thân bài bằng chứng thực tế (Gate B & Rule Engine):**
  - Bằng chứng OOXML phần thân (`body_evidence`) được trích xuất bằng cách phân loại ngữ nghĩa từng đoạn văn trực tiếp của `w:body` (`detectParagraphRole`), tự động loại trừ tên loại văn bản, trích yếu, tiêu đề lớn, nơi nhận, chữ ký và phụ lục khỏi chỉ số đo đạc thân bài. Đoạn văn căn đều hai bên (`both`) hoặc dài > 150 ký tự không bị nhận nhầm thành `subject`. Các đề mục số La Mã (`I-`, `II-`) và số Ả Rập (`1.`, `2.1`) được nhận diện chính xác là `heading`.
  - Các quy tắc bảng biểu `BODY.TABLE.PRESERVATION` và `BODY.TABLE.HEADER_ROW` loại bỏ hoàn toàn `PASS` cố định, chỉ `PASS` khi có bằng chứng candidate fidelity đạt an toàn trên đúng tệp DOCX ứng viên; nếu tài liệu không chứa bảng hoặc không có bảng nào yêu cầu tiêu đề thì trả trạng thái chuẩn xác `NOT_APPLICABLE`.
  - Quy tắc dãn dòng văn bản Đảng `HD05-BODY-LINE-SPACING` đánh giá trên **toàn bộ** đoạn thân bài hợp lệ: mọi đoạn thân bài đủ điều kiện phải thỏa mãn dãn dòng cố định (exactly) 18–22pt (360–440 dxa); nếu có bất kỳ đoạn nào vi phạm thì trả `FAIL`.
- **Bảo toàn phụ lục và khối chưa phân loại:** Khối nội dung chưa xác định phải được gom vào `unclassified` để người dùng kiểm tra, không được tự ý xóa bỏ. Bảng phụ lục tuyệt đối không lọt vào thân bài.
- **Gợi ý AI phải có xác nhận:** Gợi ý AI / rà soát chính tả phải được lưu dưới dạng đề xuất (`proposals`) có `targetBlockId` rõ ràng để người dùng nhấn **Áp dụng** hoặc **Bỏ qua**. Không tự động thay thế trực tiếp vào nội dung gốc khi chưa có lệnh của người dùng.

---

## 4. Tách Biệt Các Lớp Quy Chuẩn & Trạng Thái Đánh Giá

Khi bổ sung hoặc chỉnh sửa các bộ quy tắc, phân định rõ 4 nhóm:
1. **Quy định pháp lý bắt buộc (`mandatory_legal`):** Trích xuất trực tiếp từ Nghị định 30 hoặc Hướng dẫn 05, có điều khoản/trang PDF làm căn cứ. Vi phạm = LEGAL_ERROR.
2. **Hướng dẫn kỹ thuật chính thức (`official_guidance`):** Khuyến nghị bố cục, khoảng cách dòng, thụt lề từ cơ quan có thẩm quyền. Vi phạm = WARNING.
3. **Profile riêng của đơn vị (`company_profile`):** Tùy biến theo mẫu được duyệt của Công ty Hoa tiêu hàng hải miền Bắc (kích thước bảng header twips, nét Shape Line DrawingML). *Profile không được vi phạm hoặc nới lỏng quy định pháp lý, và chỉ được tính `PASS` khi tài liệu thực sự chọn profile đó kèm bằng chứng OOXML khớp thông số.*
4. **Thiết lập thẩm mỹ tùy chọn (`aesthetic_preset`):** Khuyến nghị viền bảng 0.5-0.75pt, padding, tỷ lệ cột tối ưu. *Tuyệt đối không biến thông số preset bảng thành lỗi pháp lý hay quy định bắt buộc của NĐ 30 / HD 05.*
5. **Gợi ý chính tả và văn phong (`style_spelling`):** Từ điển lỗi đánh máy phổ biến và gợi ý văn phong công vụ. *Tuyệt đối không trình bày gợi ý chính tả như một kết luận pháp lý bắt buộc.*

### Ý nghĩa 5 trạng thái kiểm định (Không được gộp chung):
- `PASS`: Đã đo đạc hoặc xác minh bằng chứng cụ thể từ OOXML/văn bản và thỏa mãn ràng buộc của rule (ví dụ: kích thước trang A4 210x297mm, lề trang 20-20-30-15mm, tỉ lệ đường line, đúng chuỗi Quốc hiệu).
- `FAIL`: Có bằng chứng đo lường nhưng giá trị thực tế vi phạm ràng buộc của quy định.
- `NOT_EVALUATED`: Chưa đủ bằng chứng hoặc thuộc tính chưa thể đo đạc tự động. **Không được tính `NOT_EVALUATED` vào điểm `PASS`**.
- `NEEDS_REVIEW`: Cần chuyên viên văn phòng đối chiếu trực quan hoặc kiểm tra thẩm quyền.
- `NOT_APPLICABLE`: Quy tắc không áp dụng cho loại văn bản hoặc profile hiện tại (ví dụ: rule `PROFILE.*` khi dùng mẫu chung; công văn không có tên loại giữa trang; kế hoạch dự thảo không có chữ ký).

> **Lưu ý:** "Đã nhận diện $x/9$ nhóm thành phần" chỉ có nghĩa là parser đã cấu trúc hóa được các vùng tài liệu, **không đồng nghĩa** với việc văn bản đã đạt chuẩn pháp lý $x/9$ tiêu chí.

---

## 5. Mẫu Header Đã Chốt Của Công Ty Hoa Tiêu Hàng Hải Miền Bắc

Template phần đầu văn bản cho **Công ty Hoa tiêu hàng hải miền Bắc** ở cả hai hệ đã được chốt kích thước hình học chính xác theo các tệp mẫu gốc:
- NĐ 30: [`src/canonical/nd30/profiles/hoa-tieu-hang-hai-mien-bac/header-reference.docx`](src/canonical/nd30/profiles/hoa-tieu-hang-hai-mien-bac/header-reference.docx)
- HD 05: [`src/canonical/hd05/profiles/hoa-tieu-hang-hai-mien-bac/header-reference.docx`](src/canonical/hd05/profiles/hoa-tieu-hang-hai-mien-bac/header-reference.docx)
- Mã triển khai tương ứng: [`src/canonical/nd30/companyHeader.ts`](src/canonical/nd30/companyHeader.ts) và [`src/canonical/hd05/companyHeaderHD05.ts`](src/canonical/hd05/companyHeaderHD05.ts).

**Nguyên tắc:** Chỉ sửa đổi các file profile này khi có yêu cầu rõ ràng kèm tệp Word mẫu mới của công ty làm đối chứng. Không thay đổi kích thước bảng twips hay tọa độ DrawingML/VML của profile này khi làm các nhiệm vụ chung.

---

## 6. Hướng Dẫn Bảo Mật Tối Thiểu

- **Không đưa API Key vào mã nguồn:** `server.ts` gọi `dotenv.config()` để nạp biến môi trường `GEMINI_API_KEY` từ file `.env` (lưu ý: `dotenv.config()` mặc định đọc `.env`, không tự động đọc `.env.local`). Tuyệt đối không commit khóa API lên repository hoặc in khóa ra console log.
- **Không ghi nội dung văn bản nhạy cảm vào log/fixture:** Không đưa dữ liệu văn bản nội bộ thật, danh tính cá nhân chưa được phép công khai vào các file test, log hoặc tài liệu markdown. Sử dụng dữ liệu mẫu tổng hợp (synthetic) hoặc dữ liệu đã khử nhận dạng.

---

## 7. Lệnh Chạy Ứng Dụng & Kiểm Thử Thực Tế

Các lệnh thực sự tồn tại trong [`package.json`](package.json) và môi trường dự án:

| Mục đích | Lệnh thực thi | Ghi chú |
|---|---|---|
| Chạy ứng dụng trên cổng vận hành 5050 | `npx tsx server.ts --port 5050` (hoặc đặt `PORT=5050` trong `.env` rồi chạy `npm run dev`) | Cổng vận hành thực tế là **5050** (`server.ts` chỉ dùng `3000` làm giá trị dự phòng khi không truyền `--port` và không có `PORT`) |
| Kiểm tra kiểu dữ liệu TypeScript | `npm run lint` (thực thi `tsc --noEmit`) | Bắt buộc đạt exit code `0` trước khi hoàn tất thay đổi |
| Build đóng gói sản phẩm + kiểm tra kiểu | `npm run build` (thực thi `vite build && tsc --noEmit`) | Đóng gói production bundle vào `dist/` và kiểm tra toàn bộ kiểu TypeScript |
| Chạy bản kiểm thử thể thức NĐ 30 | `npm test` | Chạy 32 bài test tại [`test/nd30-compliance.test.ts`](test/nd30-compliance.test.ts) |
| Kiểm thử workflow 4 bước & ruleEngine | `npx tsx test/office-worker-redesign.test.ts` | Kiểm tra 19 bài test: cách ly 2 hệ, bảng biểu, regex, tệp không chữ ký, OOXML audit, chuyển hệ, draftStore, visualDiff tài liệu dài (chống đệ quy vô hạn), snapshot Step 4, và tính trung thực của nhãn đạt chuẩn |
| Kiểm thử phần đầu 2 hệ thể thức | `npx tsx test/header-dual-regime.test.ts` | Kiểm tra 5 ca header NĐ 30 & HD 05 (Generic & Hoa Tiêu) |
| Kiểm thử trích xuất bảng & body | `npm run test:body:tables` | Chạy [`test/table-and-body-format.test.ts`](test/table-and-body-format.test.ts) |
| Kiểm thử phân đoạn cấu trúc | `npm run test:import:segments` | Chạy [`test/import-segments.test.ts`](test/import-segments.test.ts) |
| Kiểm thử hồi quy chữ ký kế hoạch | `npm run test:repro` | Chạy [`test/repro-plan-signature-bug.test.ts`](test/repro-plan-signature-bug.test.ts) |
| Kiểm thử bộ mẫu pilot (27 file) | `npm run test:pilot` | Chạy [`test/pilot-documents.test.ts`](test/pilot-documents.test.ts) |
| Kiểm thử các ca dữ liệu thử thách | `npm run test:edgecases` | Chạy [`test/complex-malformed-pipeline.test.ts`](test/complex-malformed-pipeline.test.ts) |
| Kiểm tra 5 điểm phát hiện qua audit độc lập | `npx tsx test/audit-fixes.test.ts` | 13 bài test: candidate roundtrip gate, ID bảng duy nhất, scan XML thô, bảo toàn định dạng nguồn, kiểm định thân bài |
| Kiểm thử follow-up audit F01–F09 | `npx tsx test/followup-audit-fixes.test.ts` | 10 bài test: sửa ô bảng, đối chiếu hai chiều, bằng chứng thân bài, dãn dòng Đảng, CSS units |
| Kiểm thử các khoảng trống bảo toàn (Remaining Gaps) | `npx tsx test/remaining-fidelity-gaps.test.ts` | 12 bài test: single source of truth, fold đề xuất tuần tự, chính sách bảng mới, bảo toàn multi-run trong ô, nhận diện heading/body_paragraph, báo trung thực lưu trữ |
| Kiểm chứng thực tế tài liệu DOCX & LibreOffice PDF | `npx tsx test/real-documents-roundtrip.test.ts` | Nhập -> sửa 1 chữ ngoài bảng -> xuất -> nhập lại và sinh PDF LibreOffice cho tài liệu thật |
| Kiểm thử E2E trình duyệt & MS Word COM | `npx tsx test/browser-live-e2e.test.ts` | Kiểm thử toàn trình Chromium headless trên cổng 5050 và mở tệp Word COM 16.0 |

---

## 8. Tiêu Chí Hoàn Tất Một Thay Đổi (Definition of Done)

Một nhiệm vụ coding chỉ được coi là hoàn tất khi agent đáp ứng đủ 4 tiêu chí:

1. **Kiểm tra đúng luồng liên quan:** Đã chạy thử luồng chức năng bị ảnh hưởng (ví dụ: sửa parser thì chạy parse thử DOCX; sửa export thì kiểm tra cấu trúc OOXML sinh ra).
2. **Chạy và báo cáo bộ kiểm thử thực tế:** Chạy lệnh kiểm thử liên quan bằng terminal, trích dẫn kết quả thực tế (số bài test PASS/FAIL). Không copy lại kết quả từ các phiên làm việc trước.
3. **Nêu rõ giới hạn chưa kiểm chứng:** Ghi rõ điểm gì đã kiểm chứng qua automated test và điểm gì chưa thể kiểm chứng tự động (ví dụ: ngắt trang trực quan trên Microsoft Word thực tế cần người dùng mở file kiểm tra).
4. **Báo cáo danh sách file đã sửa:** Liệt kê chính xác đường dẫn các file đã tạo mới hoặc chỉnh sửa, giải thích lý do ngắn gọn.
