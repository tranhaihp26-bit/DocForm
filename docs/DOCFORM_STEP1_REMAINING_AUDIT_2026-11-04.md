# Audit lỗi còn lại — ưu tiên hoàn thiện Bước 1

Ngày 04/11/2026. Phạm vi sau chỉ đạo mới: **hoàn thiện chức năng B1 trước**. Lượt này chỉ audit, chạy kiểm chứng và lập kế hoạch; chưa sửa mã sản phẩm.

## 1. Snapshot và kết luận

- Checkout `D:\DocForm`, main `4c3751f`, ahead origin/main 1; có thay đổi local từ các tác vụ trước. HEAD không đại diện riêng cho mã đã kiểm tra.
- Đã đối chiếu source hiện hành, [review gần nhất](ANTIGRAVITY_FOLLOWUP_REVIEW_2026-11-04.md), các test chuyên biệt và browser pilot.
- B1 đã có các chức năng chính và pilot đi được tới soạn. **Chưa hoàn thiện cổng duyệt phân vùng:** có thể chấp nhận Body đã mất chữ hoặc đảo thứ tự; header/bảng cuối còn được công nhận bằng điều kiện quá rộng.
- Không yêu cầu hoàn tất B3 rồi mới làm B1. Lỗi package safety/preview ghi backlog riêng, giữ nguyên các gate hiện hành trong đợt B1.

SHA-256 các file trọng tâm trước/sau các probe giữ nguyên:

| File | SHA-256 |
|---|---|
| `src/shared/sourceMapping.ts` | `857139D44D3724F81ABF5F39BC3268A29742B4A4C436AE0EB7DF7C95A0F574A5` |
| `src/utils/exportCandidate.ts` | `6633F95FC646E7FBDE6657189D4A55D12CA7664CCFF29593F0EDA65B68CA5173` |
| `src/utils/sourceHeaderShapes.ts` | `750FB1F42BD34B3D40F59FE0FB8B224A73E69DA96C49C72E98E029A42AA8F7D8` |
| `test/pilot-local-document-browser.test.ts` | `3615E7DA1AD7FF16840E26E97809D67E9EBD11BE49A8F19B2567457A3743BC67` |

## 2. Chức năng B1 đã kiểm chứng và phạm vi bằng chứng

| Kiểm tra đã chạy lượt này | Kết quả cuối | Chứng minh / giới hạn |
|---|---|---|
| `npm.cmd run lint` | PASS, exit 0 | TypeScript; không chứng minh coverage đúng |
| `npm.cmd run build` | PASS, exit 0 | Build 1905 modules; có cảnh báo node:crypto externalized và bundle lớn. Chưa xác minh tác động runtime của cảnh báo |
| `npx.cmd tsx test/data-pipeline-improvement.test.ts` | PASS 8/8, exit 0 | Tám ca hiện có; không bắt được các probe mới dưới đây |
| `npx.cmd tsx test/local-file-import.test.ts` | PASS, exit 0 | Đọc DOCX/TXT cục bộ không cần API |
| `npx.cmd tsx test/import-review.test.ts` | PASS, exit 0 | Duyệt rõ ràng và giữ trạng thái thiếu/chưa phân loại trong ca suite |
| `npx.cmd tsx test/stage2-regime-detection.test.ts` | PASS 25/25, exit 0 | Nhận diện hai hệ, xung đột và nguồn yếu theo ca suite; không thay cho nghiệm thu mọi thao tác UI |
| `npx.cmd tsx test/step1-sidebar-navigation-browser.test.ts` | PASS 1/1, exit 0 | Bốn bước con trong sidebar, trạng thái khóa và quay về bước trước; chưa chứng minh toàn bộ nhánh tạo mới đi tới cuối |
| `npx.cmd tsx test/pilot-local-document-browser.test.ts` | PASS 1/1, không skip, exit 0 | CDP 1366×768, tệp thật cục bộ: 12 khối, 8 Body, 1 ký, 3 đầu; sang B2/B3, candidate blocked và có banner. Assertion render/disabled còn yếu nên không chứng nhận tải/in an toàn hoặc preview đủ nội dung |

Browser test dùng cổng riêng. Sau kiểm tra, không còn listener ở 5078/9578; kiểm thêm cổng sidebar trước bàn giao. Main 5050 không bị thay đổi. Không đưa nội dung tệp thật vào báo cáo/fixture.

## 3. Lỗi cần sửa trong B1

### B1-01 / P1 — Bị mất một phần paragraph vẫn duyệt được

Vị trí: [sourceMapping.ts](../src/shared/sourceMapping.ts), nhánh Body khoảng dòng 258. Dùng `p.includes(norm) || norm.includes(p)` cho phép đoạn đích chỉ giữ một phần nguồn.

Probe qua API sản phẩm: tạo source paragraph `ALPHA LONG SOURCE`, working Body `<p>ALPHA</p>`, không có ledger edit. `createWorkspaceSnapshot` → `approveWorkspacePartition` → `prepareExportCandidate` cho coverage=true, approval=true, safe=true, downloadable=true, không blocker.

Đây là lỗi đã đi qua cổng duyệt B1 và tới ứng viên, không chỉ lỗi hàm phụ. Cần exact normalized equality cho ca chưa chỉnh sửa, cùng locator để phân biệt đoạn trùng. Phép biến đổi hợp lệ phải có giao dịch/đích cụ thể.

### B1-02 / P1 — Thứ tự paragraph không được kiểm

Probe source `[ALPHA, BETA]`, working HTML `[BETA, ALPHA]`, không giao dịch di chuyển: coverage=true, approval=true, candidate safe/downloadable=true.

Thuật toán tiêu thụ bằng findIndex kiểm tập hợp, chưa kiểm trình tự. Cần đối chiếu thứ tự theo vùng và cho phép thay đổi chỉ khi có quyết định/giao dịch hợp lệ. Không ảnh hưởng việc cùng một bảng vật lý có nhiều field theo ô.

### B1-03 / P1 — Đích đầu/cuối/sep chưa ràng buộc từng nguồn

Probe tổng hợp ở lượt review trước đã xác minh, source hiện hành vẫn có các điều kiện:

- Header table: chỉ cần bất kỳ field đầu có giá trị hoặc cell role được khai báo; không chứng minh đủ nội dung từng ô.
- Signature table: chỉ cần signTitle hoặc signName; chưa kiểm nơi nhận trong cùng bảng.
- Metadata paragraph có thể dùng field từ StructuredImport cũ để công nhận dù working field đã đổi/rỗng.
- Separator: có subject là được xem có đích; chưa ràng buộc regime/loại/vị trí/cách dựng. Body có chuỗi giống cũng chưa chứng minh đúng locator và số lượng.

Cần giải quyết ngay khi lập bản nhập và khi duyệt B1. Mọi thành phần cần thiết có đích hiện hành hoặc trạng thái chưa giải quyết; không công nhận cả bảng bằng một field bất kỳ. Đối tượng chưa hỗ trợ vẫn giữ raw evidence và cảnh báo, không giả là đã chuyển đổi thành công.

### B1-04 / P1 — Mapping chưa đủ để duyệt và chuyển B2 đáng tin cậy

TransformationRecord hiện chủ yếu có `targetLocator.zone`, thiếu targetId/subTarget/ô ở nhiều record, được dựng lại từ heuristic. Chưa đủ phát hiện một nguồn bị ghép sai đích hoặc nhiều nguồn đếm cùng một field.

Ưu tiên phạm vi B1: source→partition→fields/body/appendix/held evidence có locator cụ thể. Kiểm byte DOCX và dựng lại bố cục nằm ở đợt sau. Không thêm hệ lưu trữ tài liệu song song; bổ sung vào snapshot/mapping hiện hành.

### B1-05 / NEEDS_REVIEW — Tự điền quốc hiệu khi duyệt nguồn nhập

`App.tsx:handleConfirmSideBySideImport` dùng fallback quốc hiệu theo hệ khi field nguồn rỗng. Nhánh tạo mới có thể dùng mẫu, nhưng nguồn nhập thiếu phải phân biệt dữ liệu nguồn với giá trị mẫu đề xuất.

Chỉ xác nhận từ source, chưa tái hiện qua browser ca tài liệu thiếu quốc hiệu. Cần test trước khi sửa: thiếu/placeholder phải giữ trạng thái thiếu; nếu đề nghị dùng mẫu thì hiện rõ và người dùng chọn áp dụng. Không xóa giá trị template trong nhánh tạo mới.

### B1-06 / Chưa đánh giá đủ — Độ hoàn chỉnh workflow desktop

Các ca cần thêm: thay tệp khi parse chưa xong; tệp hỏng/hủy; đổi hệ/profile sau khi đã duyệt; reload với nguồn memory; tạo mới đi đủ 4 bước; quay lại giữ dữ liệu nhưng không giữ approval sai nguồn; tùy chọn AI mặc định đóng và thất bại AI không chặn parser local.

Không gọi các ca trên là lỗi runtime đã tái hiện. Đây là khoảng trống nghiệm thu B1. Xem caller thật và test hiện có trước khi thêm suite trùng lặp.

## 4. Phát hiện liên quan nhưng làm sau B1

### AFTER-01 / P1 — Package policy không được nối vào candidate

Hàm `isPackageSafeForDiagnosticRender` tồn tại nhưng không được gọi trong `prepareExportCandidate`; `canRenderDiagnostic` vẫn chỉ dùng một số blocker và XML không rỗng.

Probe dùng generator thử nghiệm được API hỗ trợ: tạo DOCX tổng hợp hợp lệ, thêm part marker `word/vbaProject.bin` với 3 byte vô hại. Helper trả safe=false/unsafe_binary_part, nhưng candidate trả diagnostic=true, safe=true, downloadable=true, blockers rỗng. Không chạy macro, không có bằng chứng người dùng có thể khai thác qua upload; đây là lỗi nối gate tại ranh giới byte output đã xác minh.

Đợt sau cần nối policy với render và an toàn package đầu ra, cùng regression qua `prepareExportCandidate`, không chỉ test helper. Không nới khóa tải/in trong lúc hoàn thiện B1.

### AFTER-02 / P1 — Policy regex và kiểm gói chưa đầy đủ

External relationship có Target trước TargetMode được helper chấp nhận; chỉ part tồn tại không chứng minh XML hợp lệ. Cần parser XML cấu trúc dùng được browser/Node, namespace/thuộc tính/URI và allowlist capability rõ; không nhập dependency chỉ chạy Node vào client.

### AFTER-03 / P2 — Shape fallback chưa đồng nhất

cy=0 trả sớm trước kiểm VML; DrawingML line ngang + VML `to="100pt,80pt"` vẫn được chấp nhận. parseFloat chưa chuẩn hóa mm/pt/in. Cần geometry adapter và fixture; B1 chỉ phân loại đúng “đường kẻ/đối tượng chưa hỗ trợ”, giữ evidence và cảnh báo, chưa gỡ blocker.

### AFTER-04 / P2 — Giao dịch edit/merge và coverage còn mâu thuẫn

Edit có sourceRefs có thể tự miễn kiểm đích. Probe giao dịch thật `editNode` thành `<p></p>` được chấp nhận và record vẫn gọi preserved; cần phân biệt chỉnh sửa/xóa chủ động với mất nội dung ngoài ý muốn. Không kết luận mọi thao tác xóa chữ của người dùng là bất hợp lệ.

Merge hợp lệ hai node ALPHA/BETA thành `<p>ALPHABETA</p>` bị `invalid_transaction`, details missing_body_block:b1/body_paragraph_omitted:BETA. SourceMapping đòi merge confirmed trong khi transaction merge không tạo confirmed; không chỉ thêm cờ rồi miễn toàn bộ, phải đối chiếu node kết quả thực. Đây là B2, hoãn đến sau B1.

### AFTER-05 / P2 — Test B3 có false assertion

Selector vắng → optional chaining trả undefined → `undefined !== null` vẫn true; test có đọc ButtonExists nhưng không assert. Preview wrapper chưa được assert đã render nội dung. PASS browser hiện tại chỉ chứng minh các assertion đã chạy, chưa chứng minh tất cả claims của báo cáo.

## 5. Quyết định phạm vi và tiêu chí hoàn tất B1

B1 hoàn tất khi hai nhánh tải/tạo mới chạy đủ trên desktop; đầu–Body–cuối được tách và giữ đủ; không duyệt khi nguồn mất/nhân đôi/sai thứ tự chưa giải thích; thông tin thiếu không bị tự biến thành nguồn đã có; bước nhỏ quay lại đúng và approval theo đúng source/hệ/profile.

Phân biệt ba trạng thái: (1) mất ánh xạ/nội dung: chặn duyệt và chỉ rõ vị trí; (2) đối tượng chưa hỗ trợ nhưng còn raw evidence: hiện cần đối chiếu, không tuyên bố output bảo toàn; (3) thiếu thông tin bản nháp: hiển thị để bổ sung, không tự tạo dữ liệu. Quyền chuyển B2 theo contract hiện hành và quyết định người dùng; duyệt nguồn không cấp quyền tải/in.

Kế hoạch thực hiện nằm ở [kế hoạch hoàn thiện B1](superpowers/plans/2026-11-04-docform-step1-completion.md). Các vấn đề AFTER giữ backlog, không kéo vào phạm vi B1 ngoài thay đổi tối thiểu cần giữ an toàn hiện hành.
