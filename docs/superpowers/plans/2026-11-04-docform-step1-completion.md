# DocForm Step 1 Completion Implementation Plan

> **For agentic workers:** Dùng `superpowers:executing-plans` để thực hiện từng task. Các checkbox là việc cần làm, chưa phải trạng thái đã hoàn tất. Phạm vi và quy định người dùng ưu tiên hơn quy trình mặc định của skill.

**Goal:** Hoàn thiện chức năng B1 trên desktop: chọn nguồn/tạo mới, nhận diện đúng, giữ đủ nội dung đầu–Body–cuối, duyệt nguồn đáng tin cậy và chuyển B2 với đúng approval.

**Architecture:** Giữ wizard, parser, snapshot và transaction hiện có. Làm rõ ánh xạ nguồn→vùng/field/node/ô trong B1, sửa điều kiện chấp nhận quá rộng và khóa duyệt khi có mất/nhân đôi/đảo thứ tự ngoài quyết định hợp lệ. Không viết lại engine xuất hoặc bổ sung hệ lưu trữ mới.

**Tech Stack:** TypeScript, React, SourceBlock/StructuredImport/WorkspaceSnapshot, Node test + tsx, Chromium/CDP harness hiện có.

**Spec:** [Audit B1 và backlog còn lại](../../DOCFORM_STEP1_REMAINING_AUDIT_2026-11-04.md), [đề xuất pipeline](../../DOCFORM_DATA_PIPELINE_IMPROVEMENT_PROPOSAL_2026-11-03.md), [AGENTS gốc](../../../AGENTS.md).

## Global Constraints

- Làm tại `D:\DocForm`, main; bảo toàn dirty changes có trước, không tạo nhánh/worktree, không commit/push/reset/stash.
- Main vận hành cổng 5050; browser test cổng riêng, chỉ dừng tiến trình do tác vụ tạo.
- Desktop/PC trước; UI cho nhân viên hành chính: hành động rõ, chi tiết kỹ thuật mở khi cần.
- Hai hệ độc lập; giữ source bytes, hash, ID/ô/thứ tự và thông tin thiếu; không tự tạo số/ngày/người ký.
- Không ghi dữ liệu tệp thật vào source/fixture/log. Pilot thật chỉ chạy cục bộ; test không gọi AI provider thật.
- Chưa thực hiện backlog AFTER của audit: package render policy, geometry output/Shape, B2 merge, mapping byte DOCX và Word fidelity. Không gỡ blocker/tự mở tải để làm B1 xanh.
- Duyệt nguồn là phê duyệt partition, không phải chứng nhận DOCX xuất đạt fidelity/pháp lý.

## Review Focus

1. Đoạn gần giống nhưng bị cắt mất chữ, đoạn trùng chữ và trình tự đảo: task 1 phải bắt đủ.
2. Một bảng chứa nhiều trường, chỉ một ô còn dữ liệu: task 2 phải phát hiện thiếu từng phần cần giữ.
3. Tệp mới B đến khi A đang parse/AI trả muộn, hoặc đổi hệ sau approval: task 3 phải ngăn kết quả/approval cũ áp sang nguồn mới.
4. Tạo mới có giá trị mẫu nhưng nhập nguồn thiếu không được giả thành nguồn đã có: task 4 kiểm hai nhánh độc lập.
5. Bốn bước con có thể quay lại nhưng không vượt cổng duyệt; test phải assert thực sự tới màn và dữ liệu đúng: tasks 5–6.

## File ownership và interfaces

| Nhóm | File hiện có | Trách nhiệm |
|---|---|---|
| Inventory/partition | `src/server/structuralSegmenter.ts`, `src/utils/importReview.ts` | Role, source IDs, cấu trúc tách đầu–Body–cuối và phần giữ để đối chiếu |
| Coverage/approval | `src/shared/sourceMapping.ts`, `src/utils/workspaceState.ts`, `src/utils/workspaceTransactions.ts` | Đích thực, thứ tự, báo lỗi và điều kiện duyệt |
| Phiên nhập | `src/utils/localFileImport.ts`, `src/App.tsx` | Pending/commit, source generation, lưu nguồn, confirm |
| UI B1 | `src/components/ImportStepView.tsx`, CSS tương ứng, sidebar trong `src/App.tsx` | Bốn bước nhỏ, câu chữ và hành động theo trạng thái |
| Regression | `test/data-pipeline-improvement.test.ts`, `test/import-review.test.ts`, `test/local-file-import.test.ts`, `test/stage2-regime-detection.test.ts`, `test/step1-sidebar-navigation-browser.test.ts` | Tái hiện và nghiệm thu contract B1 |

Giữ API `buildSourceToWorkspaceCoverage(snapshot: WorkspaceSnapshot): SourceCoverageReport`, `approveWorkspacePartition(input: WorkspaceSnapshot): WorkspaceResult`, `reconstructFromReviewedBlocks` và luồng confirmation hiện hành. Mở rộng type tại file sở hữu nếu cần nhưng không làm giả `any` để né contract.

Đích mapping phải có định danh cụ thể: Body/appendix dùng node ID và nguồn/sub-index; field dùng field name + source locator; bảng dùng table/cell ID; raw unsupported evidence dùng locator và trạng thái held/unresolved rõ. `zone` một mình không đủ bằng chứng bảo toàn. Khi nhánh chưa hỗ trợ, trả trạng thái chưa chứng minh thay vì tạo mapping giả.

### Task 1: Đóng mất chữ, trùng và đảo thứ tự trước duyệt

**Files:** sửa `sourceMapping.ts`, `workspaceState.ts`; test `data-pipeline-improvement.test.ts` và `import-review.test.ts`.

**Consumes:** source blocks bất biến, reviewed role, HTML/node hiện hành và ledger. **Produces:** SourceCoverageReport với missing/duplicate/order violations gắn locator, dùng được tại approval B1.

- [ ] Thêm test `step1_rejects_truncated_body_before_approval`: source `ALPHA LONG SOURCE`, working `<p>ALPHA</p>`, không edit; approval phải fail.
- [ ] Thêm `step1_rejects_unapproved_paragraph_reorder`: source ALPHA→BETA, working BETA→ALPHA, không move; approval fail và chỉ đúng hai vị trí.
- [ ] Thêm đoạn trùng chữ thiếu một đích; đoạn có linebreak; một paragraph nhiều run; bảng nằm giữa paragraph. Ca giữ đúng phải pass, không áp sai giả định một block luôn bằng một semantic paragraph.
- [ ] Chạy các test mới, xác nhận fail do đúng lỗi. Dùng `npx.cmd tsx test/data-pipeline-improvement.test.ts` và `npx.cmd tsx test/import-review.test.ts`.
- [ ] Bỏ matching bằng substring hai chiều trong chặng chưa chỉnh sửa. Ánh xạ dựa locator và chuỗi phần tử có thứ tự; so phần text chuẩn hóa chỉ theo biến đổi được hỗ trợ, không loại dấu phân cách hoặc dữ liệu thực.
- [ ] Mỗi đích chỉ được tiêu thụ đúng số lượng; khi một nguồn cần nhiều đích phải có sub-index theo cấu trúc nguồn. Không tự tạo lineage phủ tất cả nguồn để lấp mapping thiếu.
- [ ] Với snapshot đã sửa ở B2, dùng đích/giao dịch hiện hành thay cho miễn kiểm tra vì từng có edit; không làm B1 mới phá chỉnh sửa hợp lệ đã có. Nếu vượt phạm vi, giữ trạng thái needs review rõ và ghi lại phần cần task sau; không cấp PASS giả.
- [ ] Chạy lại hai suite và `test/workspace-candidate.test.ts`. Hoàn tất khi ca nguồn bị mất/đảo bị chặn ngay tại approval, ca nguồn đúng vẫn duyệt được.

### Task 2: Tách vùng và chứng minh field/ô đầu–cuối

**Files:** `sourceMapping.ts`, `importReview.ts`, `structuralSegmenter.ts`; test `import-review.test.ts`, `final-section-roundtrip.test.ts`, `data-pipeline-improvement.test.ts`.

**Consumes:** source table/cells, extracted field locators và quyết định role. **Produces:** mapping B1 đủ từng field/ô cần giữ, vùng cuối không lọt vào Body.

- [ ] Thêm test header table mất một field dù còn subject; footer 1×2 mất recipients dù có signName; dữ liệu StructuredImport cũ còn nhưng working field rỗng; một bảng trộn Body–ký.
- [ ] Thêm separator NĐ30/HD05 ở sau trích yếu và giữa Body, nhiều dấu giống nhau; có subject nhưng không có đích separator không tự được công nhận.
- [ ] Chạy để xác nhận các ca âm mới fail đúng lỗi trước sửa.
- [ ] Loại điều kiện “có field bất kỳ là đủ cả bảng”. Mỗi field/ô cần đích và giá trị hiện hành; field sửa chủ động có dấu vết riêng. Không dùng bản trích ban đầu để chứng minh giá trị làm việc còn tồn tại.
- [ ] Giữ một bảng vật lý với nhiều field theo ô. Bảng chưa hỗ trợ chia vùng giữ nguyên và cần duyệt; không xóa hay đẩy cả bảng vào signature vì một ô giống chữ ký.
- [ ] Separator được thay bằng chuẩn chỉ khi có quyết định đúng hệ/loại/vị trí; dấu khác giữ đúng số lượng, thứ tự. Raw đối tượng chưa hỗ trợ giữ evidence và cảnh báo rõ, không gọi là đã tái tạo.
- [ ] Chạy ba suite; B1 duyệt ca đủ, chặn ca mất, vẫn giữ raw source và không nhân đôi field/bảng. Không yêu cầu hoàn tất hình học DOCX để chốt task này.

### Task 3: Bảo đảm vòng đời upload/approval B1

**Files:** `localFileImport.ts`, caller trong `App.tsx`, transactions/persistence nếu test chứng minh cần; test `local-file-import.test.ts`, `import-session-browser.test.ts`, `stage5-s03-import-review-gate.test.ts` theo caller hiện hành.

**Consumes:** pending extraction, hash/generation, regime/profile, partition revision. **Produces:** phiên nguồn commit nguyên tử và approval chỉ áp đúng source/partition/ngữ cảnh hiện hành.

- [ ] Rà các test hiện có; bổ sung phần còn thiếu thay vì sao chép suite legacy.
- [ ] Kiểm DOCX/TXT, giới hạn hiện hành 25 MiB, extension sai, DOCX hỏng, file rỗng, hủy chọn và thay file khi đang xử lý. Dữ liệu cũ còn nếu B lỗi/hủy; chỉ B thành công mới thay phiên A.
- [ ] Kiểm A trả muộn sau B, đổi hệ/profile sau duyệt và AI trả muộn. Không cho fingerprint/approval cũ thành hợp lệ cho nguồn mới.
- [ ] Kiểm source storage memory/IndexedDB và reload: báo đúng khả năng giữ byte nguồn; không mất draft hoặc tuyên bố có bản gốc khi không còn.
- [ ] Sửa đúng lớp quản phiên nếu test fail. Không thay transport/provider hay điều kiện gửi nguồn AI.
- [ ] Chạy lint và test chuyên biệt. Hoàn tất khi không có thao tác UI B1 nào vượt confirmation/approval hoặc dùng nhầm phiên nguồn.

### Task 4: Hoàn thiện chọn hệ/loại/profile và nhánh tạo mới

**Files:** `App.tsx`, `ImportStepView.tsx`, helper regime/profile hiện có; test `stage2-regime-detection.test.ts` và browser B1.

**Consumes:** hai nhánh upload/create, field nguồn và quyết định người dùng. **Produces:** dữ liệu thiếu phân biệt với dữ liệu mẫu và hai hệ không áp chéo.

- [ ] Tái hiện qua test nhánh confirm nguồn nhập thiếu quốc hiệu/tiêu ngữ. Nếu fallback hiện điền mẫu, chuyển thành đề xuất rõ có quyết định áp dụng, không ghi như field đã có trong nguồn.
- [ ] Giữ giá trị mẫu hợp lệ cho nhánh tạo mới; không xóa default toàn ứng dụng để sửa một lỗi của upload.
- [ ] Kiểm nguồn mâu thuẫn/không đủ bằng chứng; tên file hoặc Body không đủ tự chọn hệ/loại. Không âm thầm chọn profile theo tên cơ quan.
- [ ] Tạo mới đi đủ hệ→loại→mẫu/trang trắng→sẵn sàng. Khi thay hệ/loại ở bước trước, vô hiệu lựa chọn phụ thuộc thật sự, giữ nội dung độc lập và tránh gán sai template.
- [ ] Chạy test hai hệ và browser nhánh tạo mới; ca dữ liệu thiếu vẫn thiếu hoặc có quyết định dùng mẫu, không tự sinh số/ngày/người ký.

### Task 5: Chốt điều hướng và giao diện B1 desktop

**Files:** sidebar `App.tsx`, `ImportStepView.tsx` và CSS hiện có; test `step1-sidebar-navigation-browser.test.ts`.

**Consumes:** trạng thái phiên, coverage/approval và phase hiện hành. **Produces:** bốn bước nhỏ trong sidebar dưới B1, trạng thái và hành động dễ hiểu.

- [ ] Giữ upload phases: Tải tệp → Xem nhận diện → Xác nhận thông tin → Sẵn sàng soạn; create phases: Hệ thể thức → Loại văn bản → Chọn mẫu → Sẵn sàng soạn.
- [ ] Test click bước đã đủ điều kiện để quay lại; bước chưa đủ điều kiện disabled và không thể gọi handler để bỏ qua gate. Quay lại không tự xóa dữ liệu hoặc cấp approval.
- [ ] Mặc định hiển thị tệp, trạng thái đọc, tóm tắt đầu–thân–cuối và các điểm cần người dùng xử lý. Field thiếu có nhãn thiếu; lỗi mất ánh xạ có nút tới vị trí; chưa hỗ trợ có lời giải thích và đối chiếu nguồn.
- [ ] Giữ chi tiết block ID/XML/coverage kỹ thuật và AI trong phần mở khi cần. Khi không có vấn đề không hiển thị dàn hướng dẫn dài.
- [ ] Kiểm 1366×768 và 1920×1080, bàn phím/focus modal, cuộn và tên file dài. Không tối ưu màn hình khác trong task này.
- [ ] Test dùng phần tử thật, assert tồn tại/disabled/aria-current; không dùng optional chaining rồi suy PASS từ selector vắng. Không chỉ đổi class để coi hành vi đúng.

### Task 6: Nghiệm thu B1 và bàn giao

**Files:** các test B1 ở trên, `test/pilot-local-document-browser.test.ts` chỉ phần cần xác minh B1 hoặc một test pilot B1 riêng nếu tránh đụng B3; báo cáo docs mới, Codebase Map nếu thêm test/module.

- [ ] Chạy lint/build trên bản cuối và các suite B1 bị ảnh hưởng; ghi command/exit code cuối. Không gọi đây là toàn bộ repository tests.
- [ ] Browser desktop chạy đủ upload và tạo mới, quay lại từng bước, đổi nguồn, duyệt và chuyển B2. Chỉ kiểm ranh giới B2 để xác nhận đầu–Body–cuối đúng, không kéo triển khai B2/B3 vào task.
- [ ] Pilot tệp thật cục bộ theo đường dẫn đã được người dùng cung cấp; không chép nội dung vào repo/log. Thiếu file skip có lý do/BLOCKED phần pilot. Đủ file thì không chấp nhận skip như PASS.
- [ ] Assert không chỉ đếm 12 khối: đối chiếu đúng role/ID/field/ô, không mất/trùng/đảo, Body không có nơi nhận/người ký, phần cuối còn cả nơi nhận và signer.
- [ ] Ca lỗi nguồn mất phải có cảnh báo tại B1 và không cấp approval; ca raw unsupported còn evidence không bị gọi là output đã bảo toàn. Giữ gate tải/in hiện hành.
- [ ] Dừng browser/server test; xác minh PID/port do task tạo, giữ main 5050. Rà diff bảo toàn thay đổi trước.
- [ ] Viết báo cáo B1 riêng với mỗi chức năng: PASS/FAIL/BLOCKED/NOT_EVALUATED/NEEDS_REVIEW, bằng chứng, giới hạn và backlog AFTER. Không ghi đã hoàn thiện toàn bộ sản phẩm.

## Thứ tự và điều kiện chuyển giai đoạn

Tasks 1→2 tạo nền tảng duyệt nguồn. Task 3 có thể rà/test trong lúc thiết kế mapping nhưng phải kiểm lại với approval mới. Task 4 và 5 sử dụng trạng thái của ba task đầu. Task 6 chỉ PASS khi các chức năng B1 đủ bằng chứng; test xanh nhưng source vẫn có fallback công nhận mù phải giữ NEEDS_REVIEW.

Trong đợt B1, có thể sửa tối thiểu tại shared/workspace để giữ invariants nhưng không tiếp tục mở rộng exporter, adapter Shape hoặc provider AI. Sau nghiệm thu B1 mới xử lý AFTER-01/02 (package gate), rồi mapping output/geometry và hoàn thiện B2/B3. Các lỗi output đã được audit giữ nguyên ưu tiên rủi ro trong backlog; không được trình bày như đã sửa.
