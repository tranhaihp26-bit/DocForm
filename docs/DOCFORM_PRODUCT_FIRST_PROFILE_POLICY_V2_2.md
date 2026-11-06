# DocForm — Định hướng sản phẩm và quy tắc áp dụng profile V2.2

**Ngày xác định yêu cầu:** 06/11/2026. **Phạm vi:** cả hệ hành chính ND30 (`administrative`) và văn bản Đảng HD05 (`party`). **Trạng thái:** tài liệu yêu cầu đã chốt; không đồng nghĩa code đã hoàn thiện. Đây là nguồn chính cho các hướng dẫn coding agent.

## I. Mục tiêu người dùng cuối

DocForm phải giúp người dùng **tạo mới, nhập, chỉnh sửa và chuẩn hóa văn bản** nhanh, dễ dùng, xuất tệp DOCX có thể tiếp tục chỉnh sửa; cung cấp PDF khi có renderer. **Khi chọn profile riêng của Công ty Hoa tiêu Hàng hải Miền Bắc, văn bản đầu ra phải đúng mọi thông số đã được profile xác định**, trước tiên; những thông số profile chưa có mới lấy từ ND30 hoặc HD05 tương ứng. Cùng lúc, không làm mất hoặc thay đổi nội dung chưa được người dùng cho phép, không tự điền ngày/số/chữ ký, không đánh tráo tình trạng kiểm tra.

**Bảo toàn định dạng DOCX nguồn không phải mục tiêu.** Phải lưu nguyên tệp nguồn phục vụ truy vết, nhưng định dạng sai được phép và cần chuẩn hóa. OOXML, HTML, Tiptap, template, Document IR, WPS/LibreOffice và ứng dụng Windows chỉ là công cụ giải quyết nhu cầu, không phải mục tiêu triển khai tự thân.

## II. Hợp đồng thông số hiệu lực: profile → fallback theo *từng thuộc tính*

1. Nếu profile được người dùng chọn, xác nhận và áp đúng chế độ văn bản **đã thiết lập một thuộc tính**, dùng **chính xác** giá trị đó và nguồn `company-profile`; **không đối chiếu, báo lỗi/cảnh báo xung đột, hậu kiểm hoặc ghi đè** với giá trị ND30/HD05 của cùng thuộc tính.
2. Nếu thuộc tính đó **chưa thiết lập ở tất cả các cấp profile hiệu lực**, dùng rule ND30 (`administrative`) hoặc HD05 (`party`) tương ứng nếu tồn tại, nguồn `nd30-fallback` hoặc `hd05-fallback`. Không dùng rule của hệ còn lại.
3. Nếu không có ở hai nguồn thì `UNSPECIFIED`/`NOT_EVALUATED`. Không tự bịa trị số; không gọi PASS.
4. `0`, `false`, `""` **được thiết lập có chủ ý** phải được coi là giá trị; không dùng `||` hoặc kiểm tra truthy để xác định có cấu hình hay không. `null` phải được schema quyết định là giá trị xóa hay chưa thiết lập; không suy đoán.
5. Phân giải theo đường dẫn **thuộc tính có cùng ngữ nghĩa/scope**: `body.fontSizePt` và `header.parentSizePt` là hai trường khác nhau; profile đã có `body.fontSizePt` không có nghĩa toàn `body.*` đều bị khóa. Chuẩn hóa đơn vị, chế độ, phiên bản trước khi quyết định.
6. QA so **DOCX thực tế** với thông số **effective** cuối cùng và xuất trace gồm `path`, `value`, `source`, `profileId`, `regime`, `revision`. Không có bước độc lập đối chiếu ND30/HD05 cho trường `source=company-profile`.
7. Khi profile chưa được chọn/xác nhận, **không tự áp profile theo tên file**; chỉ dùng chế độ pháp quy đã được xác nhận. Các kiểm tra an toàn, độ tin cậy nội dung, revision, phê duyệt AI và gate tài liệu **vẫn giữ nguyên**.
8. Đây là **quy tắc lựa chọn thông số của sản phẩm**, không tuyên bố thay đổi hiệu lực pháp lý. Nếu được giao nhiệm vụ rà soát pháp lý độc lập thì đó là báo cáo riêng, không tự thay đổi kết quả định dạng theo profile.

**Giả mã hợp đồng (không đại diện cho hàm đang có):**

```ts
function resolveAttribute(path, confirmedProfile, regimeRules) {
  const p = getExplicitValueFromProfileHierarchy(confirmedProfile, path);
  if (p.isSet) return { path, value: p.value, source: "company-profile" };
  const r = getApplicableExplicitRule(regimeRules, path);
  if (r.isSet) return { path, value: r.value,
    source: regimeRules.regime === "administrative" ? "nd30-fallback" : "hd05-fallback" };
  return { path, source: "unspecified" };
}
```

Cần xác nhận producer → resolver → consumer export → OOXML evidence → UI/QA trước khi gọi chính sách đã được triển khai. Không xây abstraction lớn chỉ để minh họa giả mã.

## III. Profile đã có trong repository

- ND30 phần đầu: `src/canonical/nd30/profiles/hoa-tieu-hang-hai-mien-bac/profile.json` cùng mẫu `header-reference.docx`; bảng 2 cột cố định và đường line theo mẫu đã duyệt.
- HD05 phần đầu: `src/canonical/hd05/profiles/hoa-tieu-hang-hai-mien-bac/profile.json` cùng mẫu tham chiếu riêng; **không dùng** số đo ND30.
- Profile body/bảng cho **hai hệ**: `src/canonical/nd30/companyBodyProfile.ts`: Times New Roman **14 pt**, line **Exactly 19 pt**, after **6 pt** cho thân; bảng **13 pt**, repeat header; first-line ND30 **0,5 inch**, HD05 **567 twips**. Đây là giá trị **profile**, không phải trị số mặc định cho mọi tổ chức.
- Profile header và body hiện nằm ở **nhiều module khác nhau**; `profile.json` ghi `scope=first_page_header` không có nghĩa toàn bộ thuộc tính body/footer chưa thiết lập. Cần lập ma trận kiểm kê từng thuộc tính thực tế, tránh hai nguồn sự thật.

## IV. Kết quả mong muốn theo ba bước

**Bước 1 — Import:** Nhập DOCX/TXT hoặc tạo mới; xác nhận chế độ, loại văn bản, profile. Lưu byte nguồn, provenance, trạng thái chưa hiểu được; không làm mất bảng, ảnh, field không hỗ trợ một cách âm thầm.

**Bước 2 — Editor:** Chỉnh sửa nội dung, áp profile theo từng trường có cấu hình; các trường còn lại lấy fallback ND30/HD05; chưa có thì ghi thiếu. Không tự tạo ngày/số/chữ ký và không áp gợi ý AI khi chưa được duyệt. Giữ revision và bản gốc.

**Bước 3 — Export:** Tận dụng pipeline hiện tại (DocumentComposer → `docx.js` → shape postprocess → canonical header XML stamp → candidate gates). So kết quả theo effective attribute; giữ gate nội dung/bảng/nguồn/revision. Hiển thị đúng `downloadable`, `review-only`, `blocked`, `stale`, `NOT_EVALUATED`. **Không gọi văn bản “đủ điều kiện ban hành” chỉ từ PASS tự động.** WPS-PDF chỉ là chứng cứ render thật khi có WPS thật; mock chỉ kiểm contract. DOCX hợp lệ không bị đồng nhất với khả dụng của PDF.

## V. Lộ trình tối thiểu (chỉ làm có bằng chứng)

| Ưu tiên | Kết quả cần đạt | Chủ sở hữu mã nguồn |
|---|---|---|
| P0.1 | Trạng thái/copy Bước 3 đúng, không tuyên bố ban hành sai | `src/components/WorkspaceExport.tsx` |
| P0.2 | Trường profile/fallback được áp thực tế ở DOCX; thử 4 luồng người dùng | `src/canonical/ruleEngine.ts`, `companyBodyProfile.ts`, `src/utils/documentComposer.ts`, `docxExport.ts`, `exportCandidate.ts` |
| P0.3 | WPS COM thật, identity DOCX/PDF, giới hạn an toàn mở DOCX không tin cậy | `src/server/sourceVisualRenderer.ts`, `candidatePdfRenderer.win.ps1`, endpoint |
| P1 | Header/body/bảng/footer/3 đường kẻ và phân trang đúng mẫu/profile, đo có bằng chứng trên tài liệu thật | các module company profiles, TableModel, exporter và QA |
| P2 | Chỉ thử selective OOXML patch khi exporter hiện tại làm mất cấu trúc có ý nghĩa và sửa tại chỗ không hợp lý | spike A/B có điều kiện |
| P3 | Đóng gói Windows theo nhu cầu triển khai cụ thể; không dùng EXE che lỗi DOCX | thử nghiệm Electron/Tauri khi cần |

**Không thực hiện mặc định:** thay toàn engine, Document IR tổng quát, template engine thứ hai, chuyển bảng thành Text Box, viết Word clone, full test vô điều kiện.

## VI. Điều kiện nghiệm thu theo giá trị người dùng

Bốn ca pilot: (1) tạo văn bản ND30 theo profile Công ty, (2) tạo HD05 theo profile Công ty, (3) nhập DOCX sai định dạng cần chuẩn hóa, (4) nhập DOCX có bảng. Thêm ca biên theo lỗi đã ghi nhận: ba đường kẻ, trích yếu dài/ngắn, nơi nhận, repeat header, orphan/split row, WPS có/vắng/bận, revision đổi.

- 100% **thuộc tính profile trong phạm vi kiểm tra** được áp theo profile; **0 hậu kiểm ND30/HD05 đối với chính các thuộc tính này** và 0 cảnh báo xung đột từ giá trị pháp quy khác profile.
- 100% thuộc tính fallback có căn cứ trong phạm vi kiểm tra dùng đúng ND30/HD05 theo regime. Thiếu cả hai → `UNSPECIFIED`.
- Ca `0`, `false`, `""`, absent, `null` (theo schema), và profile khác default pháp quy phải có test dương/âm.
- 0 nội dung/chữ/số/bảng bị mất, thêm hoặc đổi không có chấp thuận; tài liệu unsupported bị chặn trung thực thay vì lặng lẽ xuất sai.
- DOCX phải chỉnh sửa được trong ứng dụng văn phòng dùng để nghiệm thu; khi chưa test thực tế ghi `NOT_VERIFIED`.
- Không lấy số rule PASS hay mock WPS làm bằng chứng pháp lý, approval hoặc độ giống PDF thật. Ghi version renderer, hash/revision và giới hạn môi trường.

Chỉ chạy test đúng phạm vi sửa và kiểm tra kiểu; full suite tại cổng nghiệm thu có rủi ro lớn, không chạy đi chạy lại vô ích.

## VII. Trạng thái triển khai

**Cập nhật tài liệu V2.2 trên GitHub không phải triển khai runtime.** Những hạng mục còn phải thực thi và kiểm chứng sau: resolver thống nhất theo đường dẫn thuộc tính, chặn/hạn chế rule ND30/HD05 trên trường profile đã có, kết nối vào exporter/QA, copy Bước 3, PDF WPS thật và pilot. Không báo `PASS` cho những hạng mục đó trước khi viết code và thử nghiệm thực.

Các hướng dẫn AGENTS và README tham chiếu tới văn bản này để không lặp nhiều bản chính sách.