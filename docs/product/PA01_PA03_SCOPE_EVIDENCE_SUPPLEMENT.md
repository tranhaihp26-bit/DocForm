# PA-01/PA-03 — Bổ sung phạm vi hỗ trợ và bằng chứng năng lực Editor

**Snapshot:** checkout `deffe60c91a00041765530e3192259735c36defe` (`main`, sau PR #39–#41), 07/11/2026.
**Trạng thái:** `EVIDENCE_SUPPLEMENT / NOT_VERIFIED_UAT`; tài liệu này bổ sung evidence cho [Product Support Matrix](PRODUCT_SUPPORT_MATRIX.md), không thay thế hoặc tạo thêm catalog sản phẩm thứ hai.

## Cách đọc

- `NOT_VERIFIED` = chưa có quan sát hành trình người dùng cho đúng phạm vi.
- `NOT_VERIFIED_RENDER` = chưa mở bản DOCX trong Office/WPS đã chốt.
- `BLOCKED_BY_MASTER` = có trường cần mẫu/profile được duyệt nhưng quyết định còn thiếu; không suy giá trị thay thế.
- Có component, test hoặc code path trong repo không đồng nghĩa người dùng đã hoàn tất hành trình.

## Bốn tuyến pilot × thao tác

Các cột thao tác đều giữ trạng thái kiểm chứng trung thực. Repository có code cho wizard/editor/export, nhưng snapshot này chưa có biên bản người dùng thật hoặc Word/WPS cho từng tuyến.

| Support ID | Regime / loại văn bản | Tạo mới | Nhập DOCX/TXT | Sửa trong Editor | Xuất DOCX | Office / người dùng | Trạng thái tổng hợp và điều kiện mở khóa |
|---|---|---|---|---|---|---|---|
| S-01 | NĐ30 — văn bản có tên loại | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED_RENDER` | `NOT_TESTED` | `BLOCKED_BY_MASTER` cho kết luận end-to-end: A02 chưa chốt căn phải/căn giữa ngày và dòng cơ quan 15/16; cần golden được duyệt, DOCX hậu stamp, Word/WPS và UAT. |
| S-02 | NĐ30 — công văn V/v, Kính gửi nhiều nơi | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED_RENDER` | `NOT_TESTED` | `BLOCKED_BY_MASTER` ở các trường header A02. V/v dài, nhiều nơi nhận và phân trang cần ca riêng; không coi code field là kết quả đã sửa-xuất. |
| S-03 | HD05 — văn bản Đảng có tên loại | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED_RENDER` | `NOT_TESTED` | `BLOCKED_BY_MASTER` ở issuer A03 cho loại tổ chức/phiên bản còn thiếu; dấu `*`, tiêu đề và phần cuối chưa có nghiệm thu Office/UAT. |
| S-04 | HD05 — công văn Đảng V/v và nơi nhận | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED` | `NOT_VERIFIED_RENDER` | `NOT_TESTED` | `BLOCKED_BY_MASTER` ở issuer A03 và footer theo role khi áp dụng; cần chứng cứ cho V/v, nơi nhận, DOCX editable và Office/UAT. |

`BLOCKED_BY_MASTER` nêu blocker cho việc công bố hỗ trợ hoàn chỉnh; không kết luận rằng mọi tính năng nhập hoặc Editor đều không chạy. Các kết quả độc lập chỉ được nâng trạng thái khi có case evidence đúng tuyến.

## Phiên bản và phạm vi môi trường

| Lớp | Evidence của snapshot | Trạng thái |
|---|---|---|
| Mã nguồn | Commit `deffe60c91a00041765530e3192259735c36defe`. | Đã xác định checkout; không phải mã phiên bản phát hành. |
| Khai báo package | [`package.json`](../../package.json) khai báo `version: 1.0.0`; chưa xác nhận build/phân phối mà người dùng sẽ chạy. | `VERSION_DECLARED_ONLY` |
| Hệ điều hành / browser chạy UI | Không có phiên UI người dùng được ghi trong G12. | `NOT_TESTED` |
| Word / WPS / LibreOffice | Chưa chọn hoặc mở DOCX trên phiên bản Office cụ thể. | `NOT_VERIFIED_RENDER` |
| PDF renderer | Không có kiểm tra renderer Office thật trong G12. | `NOT_TESTED` |

Vì chưa có cặp Office/version được cam kết và thử, bốn tuyến S-01–S-04 chưa thể được đánh dấu supported theo môi trường cụ thể.

## PA-03 — Vai trò Editor theo bằng chứng code

Owner/support scope chi tiết vẫn nằm trong [Product End State §7](DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md). Dưới đây là quan sát code ở snapshot trên; chưa phải kết quả thử người dùng hoặc Office.

| Đối tượng | Hành vi code có thể chỉ ra | Trạng thái kiểm chứng UI→draft→DOCX | Bằng chứng kế tiếp |
|---|---|---|---|
| Đoạn thân bài đơn giản | `WorkspaceEditor` chỉ mở input khi `assessWorkspaceNodeCapability` chấp nhận HTML/nguồn; thay đổi đi qua workspace action. | `NOT_TESTED`; code path có điều kiện chưa chứng minh UI→draft→DOCX. | Người dùng sửa đoạn, rời/quay lại, tải DOCX revision hiện hành và thấy đúng thay đổi trong Office. |
| Tiêu đề, trích yếu, V/v, Kính gửi | Các field/card dựng theo nhóm; input và `readOnly` phụ thuộc capability/policy. | `NOT_TESTED` theo từng regime/type; việc control xuất hiện chưa xác minh thao tác. | Một case có tên loại và một case công văn; xác định field thuộc nội dung hay profile rồi kiểm byte DOCX. |
| Số hiệu, ngày, người ký, nơi nhận | Có field/schema/export path; giá trị phải do người dùng nhập/xác nhận, không tự sinh khi thiếu. | `NOT_TESTED`; chưa xác minh bản nháp và DOCX. | Thử trường trống/có dữ liệu; so bản nháp, DOCX và nội dung nguồn. |
| Bảng đơn giản | Bảng giữ cấu trúc; chỉ ô qua capability và có source evidence mới nhận input sửa. | `NOT_TESTED`; code gate không chứng minh edit hay bảo toàn bố cục đầu ra. | Case bảng nhập và bảng tạo mới; kiểm hàng/cột/ô trước-sau trong DOCX. |
| Ô gộp, nhiều đoạn/run giàu định dạng, bảng lồng/nhiều section | Capability từ chối một số kiểu merge/rich/nested/thiếu `rawXml`; code có nhánh khóa theo capability. | `NOT_TESTED`; nhánh readonly chưa được xác nhận trực quan trong UI. | Thử case âm tính; xác nhận vùng bị khóa, lý do hiển thị, nguồn còn nguyên và có đường thoát. |
| Ảnh/phương tiện, field, textbox, hyperlink, tracked changes và OOXML phức tạp | Node có media/dấu hiệu OOXML phức tạp có thể bị khóa hoặc không đủ điều kiện sửa. | `NOT_TESTED`; khả năng bảo toàn và render vẫn `NOT_VERIFIED_RENDER`. | So coverage source/candidate và mở trong Office; không quảng bá sửa đối tượng ngoài scope. |
| Header/footer, shape và thuộc tính profile | Header thể thức có phần profile/stamp; trường không editable không nên biến thành input tự do. | `NOT_TESTED`; blocker master và hình học Word/WPS vẫn cần kiểm riêng. | Golden/version được duyệt, OOXML hậu stamp, rồi kiểm Word/WPS. |
| Phụ lục | Có đường code thêm phụ lục; chưa có quan sát đủ về sửa, lưu và xuất từng loại. | `NOT_TESTED`. | Tạo/nhập phụ lục, sửa, reload, xuất DOCX và xác nhận nội dung. |
| Preview, tải và in | `WorkspaceExport` phân biệt stale, downloadable, review-only và blocked; nút tải/in phụ thuộc candidate gate. PDF WPS chỉ sẵn sàng khi renderer trả kết quả. | Browser smoke kỹ thuật có một phần; luồng người dùng và Office `NOT_TESTED` / `NOT_VERIFIED_RENDER`. | Người dùng phân biệt bản đối chiếu, bản đủ cổng, bản stale; kiểm đúng SHA và Office/version. |

Theo Product End State §7, chỉ gắn nhãn `EDITABLE` sau khi có ca UI→lưu→xuất DOCX chứng minh thay đổi; bảng trên không gắn `EDITABLE`, `SUPPORTED_END_TO_END` hay `PASS` từ code/test đơn lẻ.

### Evidence tham chiếu tại checkout

- Capability và readonly: [`workspaceCapabilities.ts`](../../src/utils/workspaceCapabilities.ts), [`WorkspaceEditor.tsx`](../../src/components/WorkspaceEditor.tsx).
- Candidate state và action gates: [`WorkspaceExport.tsx`](../../src/components/WorkspaceExport.tsx), [`exportCandidate.ts`](../../src/utils/exportCandidate.ts).
- Test source có sẵn (không khẳng định đã chạy trong G12): [`workspace-target-capabilities.test.ts`](../../test/workspace-target-capabilities.test.ts), [`workspace-node-edits.test.ts`](../../test/workspace-node-edits.test.ts), [`workspace-mixed-content-browser.test.ts`](../../test/workspace-mixed-content-browser.test.ts), [`export-candidate-contract.test.ts`](../../test/export-candidate-contract.test.ts).
- Báo cáo liên-lane trên cùng base `deffe60`: `npx tsx test/candidate-preview-print-browser.test.ts` — `PASS 1/1` trong headless Chromium với dữ liệu tổng hợp; kiểm byte source/download, byte preview/download của candidate và khóa tải khi candidate stale. Đây là browser smoke kỹ thuật, không phải người dùng thật, Office render hay UAT.
- `npx tsx test/import-session-browser.test.ts` — `FAIL` ở hai lần chạy liên-lane: test mong modal đối chiếu xuất hiện sau khi tải `Synthetic_Alpha.docx` trong lúc `loadDraft()` còn pending; dừng trước assertion storage/recovery. Đây là pain point cần G10/G00 điều tra; G12 không sửa UI.

## Delta cho G00 và lane liên quan

- Giữ bốn tuyến S-01–S-04 ở trạng thái hiện có trong `PRODUCT_SUPPORT_MATRIX.md`; không nâng `SUPPORTED_END_TO_END` từ component/test.
- G10: tái hiện/định tuyến race modal khi upload nguồn trong lúc khởi tạo draft đang chờ (`test/import-session-browser.test.ts`, line 566 theo báo cáo chạy liên-lane).
- G07: khi mô tả Editor, phân biệt ô đơn giản có thể sửa với cấu trúc bảng vẫn readonly; không gọi mọi bảng là editable.
- G01/G02: field có code editor không tự chứng minh profile/property đã được duyệt hoặc xuất đúng.
- Gate U/R còn thiếu người dùng mục tiêu và mở DOCX trong Word/WPS có version được chọn. Chi tiết thu thập ở [mẫu baseline PA-02](PA02_REAL_USER_BASELINE_TEMPLATE.md).
