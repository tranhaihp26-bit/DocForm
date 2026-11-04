# Kiểm chứng độc lập bản hoàn thiện B1 của Antigravity

Ngày 04/11/2026. Snapshot: `D:\DocForm`, main `4c3751f` cùng thay đổi local đang có. Chỉ review/test, không sửa mã sản phẩm hoặc commit.

## Kết luận

**B1 tiến triển, chưa đủ điều kiện nghiệm thu toàn bộ.** Hai ca mất chữ/đảo đoạn Body ở trạng thái chưa chỉnh sửa đã có regression đạt. Quốc hiệu/tiêu ngữ thiếu được giữ rỗng trong đường nhập đã test. Tuy nhiên, phần đầu/cuối vẫn có thể mất hoặc thay nội dung mà approval B1 trả thành công.

Đối chiếu [kế hoạch B1](superpowers/plans/2026-11-04-docform-step1-completion.md), [audit trước](DOCFORM_STEP1_REMAINING_AUDIT_2026-11-04.md) và [báo cáo Anti](DOCFORM_STEP1_COMPLETION_REPORT_2026-11-04.md). Không dùng kết luận PASS của báo cáo Anti thay cho kết quả độc lập.

## Kiểm tra đã thực hiện

| Lệnh | Kết quả cuối | Giới hạn |
|---|---|---|
| `npm.cmd run lint` | PASS, exit 0 | TypeScript |
| `npx.cmd tsx test/data-pipeline-improvement.test.ts` | PASS 15/15, exit 0 | Ca Body truncated/reorder và các ca field rỗng mới đã bắt được; chưa bắt nội dung field không rỗng nhưng sai/thiếu một phần |
| `npx.cmd tsx test/local-file-import.test.ts` | PASS, exit 0 | Nhập local, giới hạn và giữ quốc hiệu thiếu trong các ca suite |
| `npx.cmd tsx test/import-review.test.ts` | PASS, exit 0 | Contract review trong các ca suite |
| `npx.cmd tsx test/step1-sidebar-navigation-browser.test.ts` | PASS 1/1, exit 0 | CDP tạo trắng đi tới ready, sidebar/khóa/quay lại; không chứng minh mọi layout và thao tác ở cả hai viewport |

Lượt này chưa chạy lại build, pilot thật, kiểm A→B/hủy/reload hoặc Word. Browser test dùng cổng riêng 5094/9594; sau chạy không còn listener tại hai cổng. Main 5050 không bị thay đổi.

## Ba lỗi tái hiện qua approval sản phẩm

Các probe dùng dữ liệu tổng hợp qua `createWorkspaceSnapshot` → `buildSourceToWorkspaceCoverage` → `approveWorkspacePartition`, không có ledger edit và không đưa tài liệu thật vào fixture/log.

### B1-R1 / P1 — Trích yếu/metadata vẫn chấp nhận mất chữ

Nguồn paragraph role metadata: `ALPHA LONG SUBJECT`; working subject: `ALPHA`; Body độc lập giữ đúng. Kết quả: coverage=true, approval=true, violations rỗng.

Nguyên nhân tại `sourceMapping.ts` khoảng dòng 229: nhánh metadata vẫn dùng substring hai chiều; kiểm nhiều dòng cũng chỉ đòi một dòng khớp. Việc sửa strict equality ở Body chưa sửa cùng lỗi ở phần đầu.

Yêu cầu: đối chiếu từng field nguồn theo locator và nội dung đầy đủ của các thành phần; chỉnh sửa có chủ đích phải có giao dịch đích cụ thể, không tự chấp nhận nội dung gần giống.

### B1-R2 / P1 — Bảng đầu được công nhận với giá trị không liên quan

Nguồn bảng có hai ô: cơ quan `CÔNG TY ALPHA`, quốc hiệu + tiêu ngữ. Working orgHeader2=`CÔNG TY UNRELATED`, nationalHeader1=`UNRELATED NATIONAL`, nationalHeader2 rỗng. Không có cell mapping hoặc ImportedTable tiếp nhận. Kết quả: coverage=true, approval=true, violations rỗng.

Nguyên nhân khoảng dòng 174–181: nhận diện loại ô rồi chỉ kiểm một trong các field cùng nhóm khác rỗng. Một ô có cả quốc hiệu/tiêu ngữ có thể mất tiêu ngữ mà vẫn được công nhận. Ngoài ra cell role mapping đang được coi đủ để bỏ qua kiểm nội dung, và ô không có tableModel có thể rơi vào nhánh không có nonEmptyCells rồi PASS.

Yêu cầu: kiểm từng thành phần trong ô, giữ nguồn→field/ô hiện hành. Role map không phải bằng chứng nội dung còn tồn tại. Thiếu table model/evidence phải unresolved hoặc held evidence có trạng thái rõ, không mặc định cả bảng trống.

### B1-R3 / P1 — Bảng cuối mất một nơi nhận vẫn duyệt

Nguồn bảng 1×2: trái có `Nơi nhận: - UNIT A; - UNIT B;`, phải có chức vụ/tên ký tổng hợp. Working giữ đúng signer nhưng recipients chỉ còn UNIT A. Kết quả: coverage=true, approval=true, violations rỗng.

Nguyên nhân khoảng dòng 475–490: chỉ kiểm recipients/signTitle/signName có giá trị hoặc có cell role mapping. Chưa kiểm giữ đủ các dòng nơi nhận, chức vụ và tên từng người ký.

Yêu cầu: cùng ca đủ nội dung PASS; mất UNIT B FAIL; thay signer không có giao dịch FAIL; field edit hợp lệ có provenance thì đối chiếu theo bản đã duyệt. Không dùng một signName để bảo toàn nhiều ô ký.

## Các hạn chế khác cần ghi đúng

- `hasBodyReorderTransaction` vẫn cho phép mọi paragraph đổi thứ tự nếu có bất kỳ move/split/edit Body/node; chưa giới hạn đúng các sourceRefs bị tác động. Đây là nguy cơ khi quay lại duyệt phiên đã chỉnh sửa; chưa tái hiện runtime mới ở lượt này.
- TargetId/subTarget đã thêm nhưng nhiều record vẫn là ID bảng/nhãn nhóm, chưa ánh xạ đủ từng giá trị trong ô. Không coi có field tên targetId là mapping hoàn chỉnh.
- Báo cáo mô tả Task 3 có rawFileContent/originalBlocks/reviewedBlocks/activeProfile/reviewDecisions và unresolvedBlocks. Không tìm thấy các tên đó trong hai module được nêu; ImportSessionState thực tế có rawText/uploadedBlocks/reviewBlocks… Diff importSessionLifecycle hiện chủ yếu thay fallback quốc hiệu. Chức năng vòng đời có thể đã tồn tại ở caller khác; cần báo đúng module, thay đổi thật và bằng chứng A→B/hủy/reload, không suy mới hoàn thiện từ test đọc tệp.
- Browser sidebar test chỉ đổi viewport sang 1920×1080 ở màn ready và kiểm phase/nút tồn tại; chưa có assertion overflow, focus, chiều rộng hoặc thao tác đầy đủ lại ở viewport đó. Chưa đủ cơ sở mô tả “hoạt động hoàn hảo” cả hai độ phân giải.

## Sửa tiếp trong phạm vi B1

1. Thêm ba regression R1–R3, xác nhận FAIL trước sửa, cùng ca dương giữ đủ và ca edit hợp lệ.
2. Thay kiểm “khác rỗng”/substring bằng đối chiếu đủ nội dung + locator + quyết định biến đổi. Dùng nguồn kiểm kê đã có; không bổ sung loạt regex riêng cho mỗi fixture.
3. Không dùng mapping khai báo, dữ liệu trích cũ hoặc tên nhóm làm bằng chứng field/ô đích còn dữ liệu. Không bỏ qua ô vì thiếu model.
4. Giới hạn ngoại lệ reorder/edit đúng đối tượng và giao dịch; không miễn cả vùng do một edit không liên quan.
5. Bổ sung bằng chứng cho upload thay/hủy/race/reload và hai nhánh UI; không nhận toàn Task 3/5/6 từ các suite chưa bao phủ.
6. Cập nhật báo cáo Anti: Task 2 và nghiệm thu tổng thể NEEDS_REVIEW; Task 3 chỉ ghi phần đã chứng minh; giữ backlog B2/B3 như đã chốt.

Đợt này không cần mở rộng sang exporter hoặc Shape output. Tiếp tục B1 tới khi các ca nội dung đầu–thân–cuối đủ và sai khác trái phép bị chặn ở approval.
