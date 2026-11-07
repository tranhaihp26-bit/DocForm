# DocForm — Ma trận nguồn cấu hình và trạng thái phê duyệt (DF-A01)

**Ngày kiểm kê:** 07/11/2026  
**Áp dụng:** 4 tuyến pilot (ND30 có tên loại; ND30 công văn; HD05 có tên loại; HD05 công văn).  
**Phiên bản mã tham chiếu:** `b8d825bfe63ac733286535bcef2197058b52520f` (đã merge DF-C01/C03).  
**Trạng thái DF-A01:** `PARTIAL_SOURCE_MAPPED`, chưa đạt `ACCEPTED` hoặc xác nhận 100% registry; những trường chưa được ánh xạ vẫn là `UNSPECIFIED/REQUIRES_REVIEW`. Không tự dùng workbook bản chưa duyệt làm master.

## A. Thứ tự áp dụng và bảo đảm không lẫn trạng thái

1. **Profile đã được người dùng chọn/xác nhận** và trường đúng role/scope có thiết lập: dùng đúng cấu hình đó, QA theo đúng profile; không so với trị số ND30/HD05.
2. Profile cùng vai trò có hai nguồn khác nhau mà chưa có thứ bậc được phê duyệt: ghi `PROFILE_CONFLICT`, **không lấy ND30/HD05 chọn hộ**. Bảo toàn master/builder hiện tại cho đến khi đủ bằng chứng.
3. Chỉ thuộc tính chưa cấu hình ở mọi lớp profile hiệu lực mới dùng `nd30-fallback` hoặc `hd05-fallback`. Không có fallback xác định: `UNSPECIFIED`.
4. `0`, `false`, `""` có chủ đích là giá trị **đã cấu hình**; không dùng `||` để thay. `null` phải xem schema; cỡ chữ đã cấu hình nhưng lẻ: `INVALID_PROFILE_FONT_SIZE` (không làm tròn/fallback).
5. Phân biệt trạng thái **nguồn** với **chứng cứ đầu ra**: có code đặt số đo không có nghĩa đã đo DOCX hậu stamp hoặc Word/WPS.
6. Workbook Drive `v1.7.4_CHOT_THEO_NGUOI_DUNG` là nguồn tham khảo đã chốt theo mục đích của bộ rule offline; `v1.7.7_CHUA_DUYET` và `v1.8.0_CHUA_DUYET` là nguồn **chưa duyệt**. Không tự sao chép giá trị workbook thành profile runtime DocForm.

### Mã nguồn và bằng chứng

| Mã | Nguồn | Tư cách |
|---|---|---|
| `P-N` | `src/canonical/nd30/profiles/hoa-tieu-hang-hai-mien-bac/profile.json` + `companyHeader.ts` | Profile ND30; JSON `status=user_approved_visual_reference`, scope `first_page_header` |
| `P-D` | `src/canonical/hd05/profiles/hoa-tieu-hang-hai-mien-bac/profile.json` + `companyHeaderHD05.ts` | Profile HD05; JSON `status=user_tuned_visual_reference`, chưa được suy toàn bộ role đã duyệt |
| `P-B` | `src/canonical/nd30/companyBodyProfile.ts` | Profile body/table tách biệt cho từng regime |
| `R-N/R-D` | `src/utils/hoaTieuHeaderReferenceXml.ts`; mẫu `header-reference.docx` cùng profile | Giá trị từ bảng XML được stamp vào DOCX khi đủ điều kiện; **không luôn đồng nhất với builder** |
| `C` | `src/utils/docxExport.ts`, `documentComposer.ts`, `ruleEngine.ts`, `tableRoundtrip.ts` | Giá trị hiện viết trong code; **không tự là master profile** |
| `F` | `src/canonical/nd30/rules.generated.json`, `src/canonical/hd05/rules.2026.json` | Fallback đúng hệ **chỉ khi thiếu property profile** |
| `D` | Registry OOXML V1.2 (tài liệu đã cung cấp), workbook/bản nháp trên Drive | Đối chiếu/đề xuất; không thay master chưa có xác nhận |
| `?` | Chưa có OOXML hậu stamp/Word/WPS theo đúng sample và revision | Không tuyên bố PASS |

## B. Thuộc tính chung của bốn pilot

Trạng thái `ACTIVE`: đã có giá trị cấu hình trong nguồn được nêu; không tự hiểu là nghiệm thu trực quan. Trạng thái `CONFLICT`: hai nguồn profile bất đồng. Trạng thái `CODE_ONLY`: hardcode cần xét role, chưa được duyệt như profile. Trạng thái `CONDITIONAL`: chỉ áp khi đúng điều kiện. `UNSPECIFIED`: phải để thiếu hoặc chỉ fallback nếu có rule hợp lệ.

| Role/property cụ thể | ND30 Công ty (giá trị/nguồn) | HD05 Đảng ủy (giá trị/nguồn) | Trạng thái/kiểm tra tiếp |
|---|---|---|---|
| `page.size` | A4 dọc — P-N | A4 dọc — P-D | ACTIVE; OOXML `w:pgSz` |
| `page.margin.top/bottom/left/right.mm` | 20/20/30/15 — P-N | 20/20/30/15 — P-D | ACTIVE; `w:pgMar` |
| `header.table.widthTwips` | 10432 — P-N/R-N | 9980 — P-D/R-D | ACTIVE; `w:tblW` |
| `header.table.indentTwips` | −874 — P-N/R-N | −593 — P-D/R-D | ACTIVE; `w:tblInd` |
| `header.table.gridTwips` | 5187/5245 — P-N/R-N | 5540/4440 — P-D/R-D | ACTIVE; `w:tblGrid` |
| `header.table.rows/cols` | 2×2 — P-N/R-N | 1×2 — P-D/R-D | ACTIVE; kiểm bảng đầu đúng role |
| `header.table.layout` | fixed — P-N | fixed — P-D | ACTIVE; `w:tblLayout` |
| `header.table.borders` | none — P-N | none — P-D | ACTIVE; bảng ẩn không đồng nghĩa không có shape |
| `header.table.paddingTwips` | 0 — P-N | 0 — P-D | ACTIVE; **zero hợp lệ** |
| `header.parent.fontFamily/sizePt` | TNR/12 — P-N | TNR/14 — P-D | ACTIVE; cỡ chữ nguyên |
| `header.issuer.fontFamily/sizePt` | TNR/12 — P-N | TNR/14 — P-D | ACTIVE; tên tổ chức không lấy từ text dự đoán |
| `header.number.sizePt` | 13 — P-N | 14 — C + registry V1.2 | HD05 cần trace rõ role; không tự cấp số |
| `header.date.sizePt/italic` | 13/true — P-N | 14/true — P-D | ACTIVE; không tự điền ngày |
| `header.date.alignment` | JSON/builder **right**; R-N **center** | **center** — P-D/R-D | **CONFLICT ND30 (DF-A02)**; không tự sửa |
| `header.issuer.lineSpacingPt` | Builder **16**; R-N **15** | 17 theo builder HD05 (340 twips) / registry XML cần đối chiếu | **CONFLICT ND30 (DF-A02)**; HD05 `R/C/?`, chưa đo |
| `header.title.sizePt` | Quốc hiệu 12 — P-N | Tên Đảng 15 — P-D | ACTIVE, là hai role riêng |
| `header.motto.sizePt` | 13 — P-N | Không có vai trò motto ND30 | CONDITIONAL; tuyệt đối không đưa tiêu ngữ ND30 vào HD05 |
| `header.leftLine.shapeWidthPt` | 116.2 — P-N/R-N | Dấu `*`, không có line này | ACTIVE theo profile đúng hệ |
| `header.rightLine.shapeWidthMm` | ~54.997 (155.9pt) — P-N/R-N | 72.09mm — P-D/R-D | ACTIVE; không thay thế bằng border text |
| `header.line.strokePt` | 0.75 — P-N | 0.75 — P-D | ACTIVE; không áp font integer rule cho stroke |
| `header.issuer.name` | P-N | P-D hiện là “ĐẢNG ỦY CÔNG TY”; nguồn lịch sử Drive có biến thể “ĐẢNG ỦY BỘ PHẬN” | **REVIEW/DF-A03**; giữ bản runtime, không tự đổi |
| `body.normal.fontFace/sizePt` | TNR/14 — P-B | TNR/14 — P-B | ACTIVE; `w:rFonts`, `w:sz=28` |
| `body.normal.align` | both — P-B | both — P-B | ACTIVE; OOXML `w:jc=both` |
| `body.normal.lineRule/valuePt` | exact/19 — P-B | exact/19 — P-B | ACTIVE; `w:lineRule=exact`, `w:line=380` |
| `body.normal.before/afterPt` | Before chưa khai đủ/After=6 — P-B + C | Before chưa khai đủ/After=6 — P-B + C | **PARTIAL**; không quy unset thành 0 |
| `body.normal.firstLineDxa` | 720 — P-B (0.5in) | 567 — P-B (567/1440in) | ACTIVE; phải kiểm inherited styles |
| `body.table.fontFamily/sizePt` | TNR/13 — P-B | TNR/13 — P-B | ACTIVE, **locked**; không tự giảm 11/10 |
| `body.table.repeatHeader` | true **nếu hàng được xác nhận là header** — P-B + C | tương tự — P-B + C | CONDITIONAL; DF-C03 hoàn tất code/test, không đánh dấu hàng 1 bằng vị trí |
| `body.table.row.cantSplit` | giữ row flag — C | giữ row flag — C | CONDITIONAL; yêu cầu hàng ngắn chống mồ côi cần DF-C04 riêng |
| `body.table.padding/spacing/width` | Hai nhánh TableModel/HTML khác nhau — C | tương tự — C | **REVIEW DF-C04**, không suy master từ hardcode |
| `body.headings/list/appendix.fontSizePt` | Có hardcode/exporter — C | Có hardcode/exporter — C | **PARTIAL**, chưa có registry role đầy đủ/QA hậu stamp |
| `footer.distribution.label/items` | 12/11pt theo exporter — C | Đang dùng logic chung; fallback đề xuất chưa được duyệt — D/C | **REVIEW DF-C02**; không tự ép HD05=14/12 |
| `footer.signature.role/name.fontSizePt` | 13/13 — C | 14/14 — C | CODE_ONLY, cần đúng role nguồn/duyệt cho các trường cụ thể |
| `footer.signature.note` | **Không tự sinh**, chỉ render ghi chú source có thật — DF-C01 | tương tự — DF-C01 | **DONE_CODE + focused CI**, không tự chèn “(Ký, đóng dấu)” |
| `footer.signature.tableGrid` | 4878/4476 dxa =165mm (single signer) — C | dùng chung — C | REVIEW; **không tự thay** vì chưa có Word/WPS repro |
| `page.numbering.sizePt` | 13 theo registry/code — C | 14 theo registry/code — C | C/?; cần verify trên section header part |
| `source.signature/number/date/recipients` | Chỉ dữ liệu được nhập/duyệt | Chỉ dữ liệu được nhập/duyệt | Nội dung được bảo vệ; thiếu không tự điền |

## C. Overlay theo loại pilot (không trộn cùng một vai trò)

| Pilot | Role riêng bắt buộc | Quy tắc/nguồn | Trạng thái |
|---|---|---|---|
| ND30 có tên loại | `title.documentType`, `title.subject`, `title.subjectUnderline` | Title 14pt theo registry V1.2; line trích yếu có điều kiện, đọc theo source C/R/F | **PARTIAL**: kiểm line XML cuối đúng tên loại, không gán mọi ND30 |
| ND30 công văn | `subject.vvInNumberColumn`, `recipients.kinhGui` | Không tự sinh heading “CÔNG VĂN”; `V/v` tại vị trí công văn; thụt tab người nhận theo profile | **PARTIAL**, case V/v dài và nhiều nơi nhận chưa render |
| HD05 có tên loại | `title.documentType`, `title.subject`, `title.separator5Hyphens` | Title 15pt (integer), năm dấu `-----` kiểu text đúng điều kiện; không dựng shape ND30 | **PARTIAL**, cần đo đủ role & spacing sau stamp |
| HD05 công văn | `subject.vv`, `recipients.kinhGui`, `title.noNamedDocType` | Không trộn header ND30; không tự đặt `-----` sai ngữ cảnh | **PARTIAL**, kiểm source role và render thực |
| Mọi pilot | `draft.autoGeneratedFields` | Không tự cấp số/ngày/chữ ký/dấu/nơi nhận; không suy profile từ tên cơ quan | **DONE_CODE một phần**, cần QA end-to-end đặc biệt sau AI |
| Mọi pilot | `candidate.provenance/renderStatus` | Bản tải là candidate đã qua cổng kỹ thuật; thiếu WPS thật → `NOT_VERIFIED_RENDER` | **PARTIAL**, chưa có visual sign-off |

## D. Trường chưa có thông số/đang mâu thuẫn — không tự chốt

| ID | Đường dẫn thuộc tính/nhóm | Cần quyết định hoặc bằng chứng | Cho phép thực hiện |
|---|---|---|---|
| A02-1 | ND30 `header.date.alignment` | Mẫu DOCX/PDF **đúng phiên bản đã duyệt** và trường `w:jc` | Không đổi JSON/master stamp cho đến khi có golden approval |
| A02-2 | ND30 `header.issuer.lineSpacingPt` | Builder vs XML master; xác định output phải 15 hay 16 | Không sửa “để giống luật”; test hai nhánh stamp |
| A03-1 | HD05 `header.issuer.name` | Quyết định/phiên bản template về “Đảng ủy Công ty” và “Đảng ủy bộ phận” | Giữ nội dung hiện hành cho đến khi phê duyệt mẫu tương ứng |
| C02-1 | HD05 footer `distribution.label/items` | Mẫu nơi nhận/khối ký được duyệt theo regime và loại | Fallback được ghi nguồn, không lấy workbook draft thành profile |
| B01-1 | Headings/list/appendix/caption/field/pageNumber | Mapping role-specific theo OOXML/styling và source code | Chỉ tiếp tục resolver cho field đã có bằng chứng, các field khác `UNSPECIFIED` |
| C04-1 | Padding/cell spacing/width/cantSplit trên bảng content | Đối chiếu output thật của hai nhánh + master profile | Không mở optimizer V6.9 mặc định; font 13pt vẫn locked |

## E. Gate DF-A01 trước khi có thể tuyên bố DONE

- [x] Đã phân tách **mẫu profile ND30**, **HD05**, **body/table TS**, **stamp XML**, **hardcode code** và **Drive draft**; không trộn hiệu lực.
- [x] Đã nhận diện blocker profile nội bộ và phân vùng pilot.
- [x] Mẫu bảng content không phải layout table, không tự xem row 0 là header (DF-C03).
- [ ] Bảng mapping role/property **đã được xác thực đầy đủ** cho từng object của 4 pilot, gồm Header/Footer/Styles/Shapes/section/appendix/field.
- [ ] Master được duyệt với SHA/profile version rõ cho A02/A03; ở GitHub public **không commit mẫu Drive nội bộ**.
- [ ] Test snapshot từ DOCX **hậu stamp** và Word/WPS render: không có trong phiên lập ma trận này.

**Trạng thái:** `DF-A01=PARTIAL_SOURCE_MAPPED`. Coding agent có thể dùng ma trận làm cơ sở **ưu tiên các field đã chốt**, nhưng không được dùng trường `PARTIAL` hoặc `CONFLICT` để tự ghi đè output.
