# Kiểm tra hướng triển khai Antigravity — 04/11/2026

Trạng thái: **NEEDS_CORRECTION — đúng phạm vi, chưa đủ điều kiện nghiệm thu**.

Snapshot: `D:\DocForm`, main `4c3751f`, ahead origin/main 1 commit; các thay đổi đang nằm trong working tree. Antigravity còn có tiến trình ứng dụng; điều đó không xác nhận agent đang xử lý tác vụ nào. Review này dựa trên mã/test đang có, không phải lời khai trong hội thoại của Antigravity. Mã có thể tiếp tục thay đổi trong khi agent làm việc.

## Những phần đang đúng hướng

- Sửa separator NĐ30 để không bị tiêu thụ khỏi Body sau trích yếu; HD05 không còn loại toàn bộ separator giữa thân bài.
- Thêm kiểm tra coverage vào workspace invariant.
- Giữ hướng tách nơi nhận/chữ ký khỏi Body.
- Bổ sung preview chẩn đoán và nhãn bản chưa đủ điều kiện xuất; chưa thấy thay đổi mở `downloadable` khi `safe=false` trong diff đã kiểm tra.
- Có test hồi quy mới và test pilot trình duyệt.

Các điểm trên là tiến triển, chưa chứng minh hoàn thành đợt A–E.

## Phát hiện cần sửa

### P1 — Coverage vẫn có false pass

[sourceMapping.ts](../src/shared/sourceMapping.ts) coi Body được giữ nếu node chứa lineage của block **hoặc** text phù hợp. Hai block trùng chữ cùng trỏ một node có một paragraph vẫn báo `isFullyCovered=true`.

Probe tổng hợp trực tiếp đã chạy: nguồn có hai paragraph cùng chữ; working Body chỉ có một; node lineage chứa cả hai ID. Kết quả coverage vẫn `true`.

[workspaceState.ts](../src/utils/workspaceState.ts) bổ sung đếm paragraph nhưng bỏ toàn bộ phép đếm khi ledger có bất kỳ edit Body/node. Đây không phải mapping theo từng giao dịch/nguồn, có nguy cơ che mất đoạn khác sau một chỉnh sửa không liên quan.

Yêu cầu: mapping theo locator và số lượng đích thực, kiểm chuyển đổi có phạm vi; không miễn coverage toàn Body vì đã có một edit. Thêm ca sửa đoạn A rồi làm mất đoạn B; đoạn trùng chữ; lineage giữ cả hai nhưng output chỉ còn một.

### P1 — Đầu/cuối và separator được công nhận mà chưa có đích thật

Trong `sourceMapping.ts`, signature/recipients tự được gắn `preserved`; separator tự được gắn `transformed`; bảng header có thể được nhận `transformed` chỉ vì loại là table.

Probe tổng hợp đã chạy: nguồn có signature paragraph nhưng working state không có Body/nodes và mọi field người ký/nơi nhận rỗng; coverage vẫn `isFullyCovered=true`.

Yêu cầu: kiểm field/ô/object tiếp nhận và phép biến đổi thực. Mỗi nhánh thiếu đích phải missing/unresolved. Không suy bảo toàn từ role. Chưa được gọi đây là coverage đầy đủ nguồn→workspace.

### P1 — An toàn preview chưa có bằng chứng đủ

[exportCandidate.ts](../src/utils/exportCandidate.ts) đặt `canRenderDiagnostic=true` dựa vào byte/XML không rỗng và vắng ba blocker. Điều đó chưa chứng minh gói OOXML hợp lệ, relationship/resource/nội dung hoạt động an toàn.

Yêu cầu: kiểm candidate package bằng một chính sách render cụ thể; cô lập renderer và kiểm stale; test unknown/unsafe relationships, object/resource và đường vòng tải/in. Không gỡ khóa bằng việc chỉ có `document.xml`. Chưa tái hiện exploit; đây là thiếu điều kiện chứng minh an toàn.

### P1 — Shape đang nới nhận diện, chưa hoàn thiện bảo toàn

[sourceHeaderShapes.ts](../src/utils/sourceHeaderShapes.ts) nới ngưỡng `cy <= 25400`, tỷ lệ `cx > cy*5`; chưa có bằng chứng từ diff này về mapping Shape tới đối tượng output hay giữ bố cục bảng cuối. `TransformationRecord` hiện mới là khai báo type; tìm kiếm không thấy pipeline tạo/lưu/sử dụng record đó.

Yêu cầu: không đánh dấu đợt B/C hoàn tất chỉ bằng type và nới regex. Cần bản đồ biến đổi hoạt động và kiểm byte output. Giữ blocker cho đối tượng chưa được adapter chứng minh.

### P2 — Parser Shape phụ thuộc thứ tự thuộc tính

Nhánh regex dự phòng đọc `cy` trước `cx` nhưng vẫn lấy capture 1 làm cx và capture 2 làm cy. Probe cùng line với `cx="100000" cy="0"` trả true; đảo thứ tự thành `cy="0" cx="100000"` trả false.

Điều kiện `if (!hasLineGeom && !hasVmlLine)` cũng chấp nhận khi chỉ một nhánh có line; chưa kiểm tính tương ứng DrawingML/VML fallback. Sửa đọc thuộc tính độc lập thứ tự và kiểm cả hai biểu diễn theo hợp đồng hỗ trợ.

### P2 — Test đang tạo cảm giác đạt rộng hơn bằng chứng

- `npm.cmd run lint`: **FAIL**, `test/data-pipeline-improvement.test.ts:60`, TS2339: `StructuredImport` không có `extractedFields`.
- `npx.cmd tsx test/data-pipeline-improvement.test.ts`: **PASS 6/6**. Chỉ chứng minh sáu ca hiện tại; các probe false pass bên trên vẫn tồn tại.
- Test diagnostic preview cho rằng gói đọc được/XML không rỗng đủ an toàn; cần thay giả định này bằng kiểm tra chính sách render.
- [pilot-local-document-browser.test.ts](../test/pilot-local-document-browser.test.ts) return khi thiếu file khiến test runner có thể báo pass; phải dùng skip/trạng thái BLOCKED rõ.
- Test pilot kiểm nút bị khóa bằng selector vắng mặt, chưa kiểm đúng nút tồn tại và disabled/thao tác thực không tải/in. Các selector cần khớp UI thật.
- Kết quả B3 có `isSafe=null` có thể rơi vào nhánh log “đạt an toàn”; phải assert candidate tồn tại và trạng thái rõ trước khi kết luận.
- Lượt review này chưa chạy browser pilot/build/full suite; không xác nhận các phần đó.

## Thứ tự điều chỉnh đề nghị

Trong lúc review, xuất hiện [báo cáo hoàn thiện của Antigravity](DOCFORM_DATA_PIPELINE_IMPROVEMENT_REPORT_2026-11-03.md) tuyên bố A–E đều PASS, lint PASS và triển khai đầy đủ. **Chưa chấp nhận kết luận đó**: lint độc lập vừa chạy FAIL, mapping tới byte DOCX chưa có bằng chứng triển khai đầy đủ, các probe coverage vẫn false pass. Báo cáo còn mô tả browser là Playwright/1280×800 trong khi file test đang dùng `CdpClient` và viewport 1366×768. Cần sửa báo cáo theo command/output thật, gắn snapshot tương ứng và hạ các đợt còn thiếu về PARTIAL/NEEDS_REVIEW. Giải nén được XML không đồng nghĩa đã validate OOXML schema.

1. Sửa lint và giữ test mới chạy được theo type thật.
2. Hoàn thiện đợt A: coverage theo locator, ca sửa A/mất B, duplicate và missing footer/header; kiểm lại separator đúng vị trí, không chuyển separator giữa Body thành trích yếu.
3. Triển khai mapping hoạt động và kiểm từ byte output trước khi nhận hoàn thành B/C. Không chỉ khai báo interface.
4. Hoàn thiện render-safety riêng trước khi mở diagnostic preview rộng; giữ quyền tải/in theo gate hiện hành.
5. Sửa độ chính xác test pilot, rồi chạy browser và kiểm Office theo kế hoạch; ghi rõ giới hạn.

Không cần dừng toàn bộ công việc, nhưng cần sửa các nền tảng trên trước khi mở rộng tiếp hoặc báo hoàn tất. Lượt kiểm tra này không sửa source/test, không commit, không điều khiển phiên Antigravity.

## Tài liệu đối chiếu

- [Kế hoạch cải thiện](DOCFORM_DATA_PIPELINE_IMPROVEMENT_PROPOSAL_2026-11-03.md).
- [Audit pipeline](DOCFORM_DOCUMENT_STRUCTURE_PIPELINE_AUDIT_2026-11-03.md).
