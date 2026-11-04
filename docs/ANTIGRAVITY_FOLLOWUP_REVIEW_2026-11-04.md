# Kiểm chứng bản sửa tiếp theo của Antigravity

Ngày 04/11/2026. Checkout `D:\DocForm`, main `4c3751f` cùng working tree đang sửa. Kết luận: **có tiến triển, vẫn NEEDS_REVIEW; chưa chấp nhận A/D/E hoàn tất toàn bộ**.

Nguồn đối chiếu: bản kết quả người dùng gửi, source hiện hành và [review trước](ANTIGRAVITY_DIRECTION_REVIEW_2026-11-04.md). Không sửa mã sản phẩm trong lượt này.

## Các sửa đổi đã xác nhận

- `npm.cmd run lint`: PASS, exit 0; lỗi `extractedFields` trước đây đã được xử lý.
- `npx.cmd tsx test/data-pipeline-improvement.test.ts`: PASS 8/8, exit 0.
- `npx.cmd tsx test/final-section-roundtrip.test.ts`: PASS 18/18, exit 0 (một tên test vẫn ghi footer trong Body dù contract/assertion đã đổi; cần sửa tên cho chính xác).
- `npx.cmd tsx test/workspace-candidate.test.ts`: PASS 14/14, exit 0.
- Coverage đã tiêu thụ paragraph theo số lượng ở ca chưa chỉnh sửa, bỏ miễn kiểm tra toàn Body qua biến `textEdits`; thêm kiểm đích rỗng đầu/cuối và danh sách transformation.
- Shape đọc cx/cy độc lập thứ tự và yêu cầu cả DrawingML/VML line.
- Preview có thêm kiểm tra package; test pilot dùng skip khi thiếu tệp và kiểm trạng thái candidate xác định.
- Báo cáo Anti đã chuyển B/C thành PARTIAL, phù hợp hơn trước.

## Các lỗi vẫn tái hiện được

Các probe dưới đây gọi trực tiếp hàm trên dữ liệu tổng hợp, không dùng nội dung tài liệu thật, không gửi mạng và không tạo file test vào repository. Kết quả hàm coverage/policy PASS không tự chứng minh mọi gate candidate hoặc exploit trình duyệt cũng đi qua; đó là false pass tại đúng lớp đang kiểm tra.

### 1. P1 — Có lịch sử edit thì khối có thể không cần đích

`sourceMapping.ts` nhánh Body: không khớp paragraph nhưng có ledger edit chứa source ID thì đặt `found=true`. Không kiểm node đích hiện còn hay giao dịch đã cập nhật ra đâu.

Probe: nguồn có paragraph A; working Body và nodes đều rỗng; ledger có edit của A. `isFullyCovered=true`.

Cần xác minh đích hiện hành của edit/merge và tiêu thụ đích; lịch sử edit không phải quyết định xóa. Thêm ca edit A rồi mất A, editBody có sourceRefs nhiều block rồi mất B, undo/redo và merge thiếu nội dung. Không chỉ kiểm ca edit A nhưng B chưa từng được edit.

### 2. P1 — Header, bảng ký và separator vẫn dùng điều kiện quá rộng

Ba probe đều cho `isFullyCovered=true`:

- Header table có text nguồn riêng; không field/bảng/mapping tiếp nhận, chỉ có subject không liên quan trong doc.
- Table role signature chứa cả nơi nhận/người ký; doc có signName nhưng recipients rỗng, không cell mapping. Nơi nhận mất vẫn được công nhận.
- Separator nguồn không có trong Body/nodes và không có đích render được xác minh; chỉ cần subject khác rỗng.

Cần kiểm từng phần tử/ô/field thật và quyết định dựng separator theo regime/loại/profile. Field bất kỳ có giá trị không chứng minh toàn bảng đã được giữ. Không công nhận dữ liệu StructuredImport cũ như bằng chứng working/output còn nội dung.

TransformationRecord hiện được sinh từ những kết luận heuristic này; đích nhiều record chỉ có `zone`, chưa chỉ ra node/field/object thực. B/C tiếp tục PARTIAL cho tới khi kiểm mapping có đích và byte output.

### 3. P1 — Render policy bỏ sót external relationship do thứ tự XML

`exportCandidate.ts` regex chỉ bắt TargetMode đứng trước Target.

Probe package tổng hợp có ba part cần thiết và relationship:

```xml
<Relationship Id="r1" Target="https://example.invalid/remote" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>
```

`isPackageSafeForDiagnosticRender` trả `{safe:true}`. Không có truy cập tới URL trong probe.

Cần đọc XML/thuộc tính độc lập thứ tự, namespace/encoding và resolve relationship theo chính sách resource cụ thể. Kiểm part tồn tại không phải kiểm XML well-formed; comment “chỉ standard content types” hiện rộng hơn phép quét blacklist macro đang thực thi. Bổ sung ca thứ tự thuộc tính, quote, external/relative resource và part hỏng. Chưa chứng minh có exploit; chưa đủ cơ sở gọi D hoàn tất.

### 4. P2 — Shape cy=0 bỏ qua đối chiếu VML

`sourceHeaderShapes.ts` trả true ngay khi cy=0, trước khi đọc from/to của VML.

Probe DrawingML extent cy=0, VML line từ `0,0` tới `100pt,80pt` vẫn được chấp nhận. Hai hình học không tương ứng.

Cần kiểm cả hai nhánh kể cả cy=0; chuẩn hóa đơn vị trước so sánh. `parseFloat` không phân biệt pt/mm/in; thiếu hoặc không đọc được tọa độ cần trạng thái unsupported thay vì cho qua. Extent không tự chứng minh độ dày stroke.

### 5. P2 — Test khóa nút vẫn có nhánh báo đạt khi selector vắng

Trong `pilot-local-document-browser.test.ts`, biểu thức:

```js
document.querySelector(selector)?.getAttribute('disabled') !== null
```

Khi không tìm thấy phần tử, kết quả là `undefined !== null`, tức true. Do đó kiểm disabled vẫn có thể PASS khi selector sai. Class `is-locked` cũng không tự chứng minh handler chặn.

Cần lấy phần tử, assert tồn tại và dùng thuộc tính `button.disabled`; test thao tác không phát sinh download/print khi khóa. Test đang đọc `hasDocxPreviewWrapper` nhưng chưa assert render trang có nội dung thành công. Lượt review này chưa chạy lại browser pilot, build hoặc Office nên không xác nhận các kết quả đó.

## Hướng xử lý tiếp

1. Thêm regression cho các probe mới; kiểm chúng FAIL trước sửa.
2. Đóng các điều kiện công nhận coverage không có đích, đặc biệt edit và từng ô bảng cuối.
3. Dùng kiểm XML/relationship theo cấu trúc cho policy preview; sửa Shape tương ứng hai biểu diễn.
4. Sửa assertion pilot, chạy browser và test identity/stale/tải/in hiện hành.
5. Chạy lint/build và regression bị ảnh hưởng trên bản cuối; cập nhật trạng thái A/D/E đúng phạm vi, giữ B/C PARTIAL nếu chưa hoàn thiện.

Không lặp vòng chỉ thêm một test đặc biệt rồi công bố toàn bộ false pass đã đóng. Cần sửa điều kiện chấp nhận chung và có ca âm cho cùng nhóm lỗi.
