# Kế hoạch triển khai: Đơn giản hóa Bước 1 DocForm

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for Native execution, or superpowers:subagent-driven-development if the user chooses delegated execution. Các bước dùng cú pháp checkbox để theo dõi.

**Goal:** Rút gọn Bước 1 cho người dùng phổ thông, làm rõ những lựa chọn thực sự cần xác nhận và ngăn nhận nhầm mẫu Công ty Hoa tiêu miền Bắc.

**Architecture:** Giữ nguyên các phase, parser và giao thức AI; thêm quyết định nguồn-mẫu có phạm vi theo tệp để cả điều hướng sidebar lẫn nút tiếp tục chặn xung đột chưa xử lý. Tách rõ bằng chứng nguồn với lựa chọn đã được người dùng xác nhận; thu gọn nội dung ngữ nghĩa/kỹ thuật và điều chỉnh bố cục.

**Tech Stack:** React, TypeScript, CSS, Node test runner qua tsx, Vite.

**Spec:** docs/superpowers/specs/2026-10-22-docform-step1-simplification.md

## Global Constraints

- Chỉ triển khai luồng nhập DOCX/TXT ở Bước 1; không thay đổi Step 2, Step 3, ONLYOFFICE, parser, export DOCX hoặc giao thức AI.
- Không tự gửi dữ liệu; giữ consent riêng cho từng thao tác và giữ nguyên phạm vi payload/endpoint.
- Không tự xác nhận loại văn bản, cơ quan hoặc hệ thể thức dựa trên đề xuất AI.
- Không làm mất nội dung nguồn, provenance, lựa chọn đã lưu hoặc hành vi cổng duyệt hiện có; chỉ bổ sung cổng xác nhận cho xung đột mẫu cơ quan.
- Dùng fixture tổng hợp; không ghi dữ liệu tài liệu thật vào test hoặc log.
- Không sửa lỗi export-candidate profile_header_not_stamped trong kế hoạch này; ghi nhận và xử lý theo một hạng mục riêng.

## Review Focus

- Tên cơ quan có chứa “Hoa tiêu” nhưng không phải Công ty Hoa tiêu miền Bắc — Task 1 thêm kiểm tra exact-match và test âm tính.
- Bằng chứng loại văn bản mạnh nhưng chưa được người dùng xác nhận — Task 2 kiểm tra đề xuất cạnh vùng lựa chọn và giữ xác nhận chủ động.
- Không có bằng chứng hoặc bằng chứng mâu thuẫn với mẫu công ty đang lưu — Task 1 và Task 2 kiểm tra không ghi đè và bắt buộc người dùng chọn Cơ quan chung hoặc xác nhận giữ mẫu công ty.
- Nhà cung cấp AI không sẵn sàng hoặc consent đang tắt — Task 3 kiểm tra trạng thái dễ hiểu, consent độc lập và không tự gửi.
- Danh sách dài trên desktop/màn hình hẹp, cuộn bằng chuột hoặc bàn phím — Task 4 kiểm tra bố cục, nút sticky và thao tác thực tế.

---

### Task 1: Nhận diện chính xác mẫu cơ quan từ bằng chứng nguồn

**Files:**
- Modify: src/utils/sourceMismatch.ts
- Modify: src/components/ImportStepView.tsx
- Create: test/source-mismatch-profile.test.ts

**Interfaces:**
- Produces: SourceProfileEvidence = "company" | "other" | "unknown"; “company” chỉ khi cả hai dòng cơ quan khớp cặp tên chuẩn của mẫu trong regime đang chọn.
- Produces: helper thuần sourceProfileEvidence(regime, orgHeader1, orgHeader2): SourceProfileEvidence; chuẩn hóa NFC/khoảng trắng/chữ hoa trước so sánh nhưng không bỏ dấu hoặc so khớp gần đúng.

- Updates: SourceMismatchResult trả thêm sourceProfile; deriveSourceMismatch dùng helper này thay cho kiểm tra chuỗi con /HOA TIÊU/i.

- [x] **Step 1: Viết test thất bại bằng dữ liệu tổng hợp.** Trong test/source-mismatch-profile.test.ts, thêm các ca: cặp tên chuẩn của mẫu hành chính trả về company; cặp tên chuẩn mẫu Đảng trả về company theo hệ Đảng; “HIỆP HỘI HOA TIÊU HÀNG HẢI VIỆT NAM” và “BAN CHẤP HÀNH” trả về other; thiếu tên cơ quan trả về unknown; chọn mẫu công ty trong khi nguồn other/unknown tạo profileMismatch; chọn Cơ quan chung với nguồn other không báo mismatch.

- [x] **Step 2: Chạy test mới để xác nhận đỏ.** Chạy .\node_modules\.bin\tsx.cmd --test test/source-mismatch-profile.test.ts. Kết quả ban đầu FAIL như dự kiến trước khi triển khai.

- [x] **Step 3: Triển khai helper trong sourceMismatch.ts.** Chuẩn hóa NFC, khoảng trắng và chữ hoa tiếng Việt; chỉ trả về company khi cả hai dòng khớp chính xác hằng số profile của đúng regime. Lấy cả orgHeader1 và orgHeader2 từ StructuredImport; không nhận company chỉ từ một từ khóa.

- [x] **Step 4: Nối kết quả với cảnh báo Bước 1.** Dùng sourceProfile trong deriveSourceMismatch và ImportStepView. Tạo nội dung cảnh báo riêng cho other và unknown; không tuyên bố nguồn là công ty khi chỉ thiếu chứng cứ.

- [x] **Step 5: Chạy kiểm tra xanh.** `source-mismatch-profile.test.ts` PASS. `stage3-f01-doctype-mismatch-gate.test.ts` đã chạy nhưng FAIL tại selector “Dùng mẫu” cũ trước khi đi tới kiểm tra cổng; ghi nhận là harness nền lỗi, không sửa luồng tạo từ mẫu ngoài phạm vi.

---

### Task 2: Đưa đề xuất nhận diện vào đúng chỗ cần xác nhận

**Files:**
- Modify: src/App.tsx
- Modify: src/utils/sourceMismatch.ts
- Modify: src/components/ImportStepView.tsx
- Modify: test/semantic-review-ui.test.ts
- Create: test/profile-decision-gate.test.ts

**Interfaces:**
- Consumes: sourceTypeEvidence, sourceProfile và docTypeMismatch từ Task 1 / state đang có.
- Produces: ProfileDecisionContext { sourceKey: string; regime: "state" | "party"; sourceProfile: SourceProfileEvidence; chosenProfile: "company" | "generic" } và ProfileDecision extends context với decidedAt: string.
- Produces: profileDecisionCovers(decision: ProfileDecision | null | undefined, current: ProfileDecisionContext): boolean.
- ImportStepViewProps adds profileDecisionValid: boolean and onConfirmProfileDecision(chosenProfile: "company" | "generic"): void.
- Produces: vùng đề xuất loại văn bản có test id ổn định, hiển thị loại được gợi ý, trích dẫn nguồn và nút xác nhận riêng.
- Produces: quyết định giữ/đổi mẫu được kiểm tra trong App trước mọi đường vào Step 2/3; xác nhận tạm thời gắn với source hash, regime, sourceProfile và profile đang chọn. Sau khi tải lại ứng dụng, xung đột chưa lưu trong phiên phải được xác nhận lại.

- [x] **Step 1: Viết test thất bại trước.** Mở rộng test/semantic-review-ui.test.ts để xác nhận đề xuất “Biên bản” cùng trích dẫn nằm cạnh lựa chọn và chỉ cập nhật sau thao tác chủ động. Tạo test/profile-decision-gate.test.ts cho helper thuần profileDecisionCovers; kiểm tra quyết định mất hiệu lực khi đổi sourceKey, regime, sourceProfile hoặc chosenProfile. Thêm kiểm tra hợp đồng App/UI rằng xung đột chưa được giải quyết chặn điều hướng sidebar, nút tiếp tục Step 1, canEnterStep(2), canEnterStep(3) và trạng thái hoàn tất Step 1.

- [x] **Step 2: Chạy test để xác nhận đỏ.** Chạy test mới trước khi triển khai; các assertion mới thất bại như dự kiến.

- [x] **Step 3: Chuyển đề xuất lên cạnh lựa chọn loại văn bản và thêm cổng xung đột mẫu.** Hiển thị trích dẫn, nhãn “Gợi ý từ nội dung” và nút xác nhận cạnh loại văn bản; giữ nguyên documentType cho tới khi người dùng bấm. Nếu thiếu bằng chứng, ghi “Chưa xác định”. Tạo context quyết định mẫu từ sourceKey ổn định (ưu tiên SHA và thế hệ nguồn; dùng identity của snapshot khi không có SHA), regime, sourceProfile và profile đang chọn. Với profileMismatch, hiển thị hai hành động tường minh “Dùng Cơ quan chung” và “Vẫn dùng Hoa tiêu miền Bắc”; callback cập nhật lựa chọn và ghi quyết định cùng thao tác. Cổng đã nối với điều hướng, hoàn tất Bước 1, Step 2/3, xuất và khôi phục bản nháp; quyết định chỉ giữ trong phiên.

- [x] **Step 4: Thu gọn thao tác ít dùng.** Màn hình metadata làm nổi bật hệ thể thức, loại văn bản, gợi ý có trích dẫn và mẫu cơ quan; giữ quyết định chọn loại rõ ràng. Xung đột mẫu yêu cầu hành động riêng; mở/đóng chi tiết không tự thay đổi dữ liệu.

- [x] **Step 5: Chạy test xanh và hồi quy nhận diện.** `semantic-review-ui.test.ts` PASS; `stage2-regime-detection.test.ts` PASS 25/25.

---

### Task 3: Rút gọn khu vực AI và rà soát ngữ nghĩa

**Files:**
- Modify: src/components/ImportStepView.tsx
- Modify: src/components/FullTextReviewPanel.tsx
- Modify: test/semantic-review-ui.test.ts
- Modify: test/full-text-review-ui.test.ts

**Interfaces:**
- Consumes: fullTextReview, aiPartitionConsent và semanticReviewRows hiện có.
- Preserves: props, API gửi, cách tính consent, trạng thái quyết định, callback xác nhận/từ chối và hành vi áp dụng rule.

- [x] **Step 1: Viết test hợp đồng giao diện.** Bổ sung test yêu cầu consent và phạm vi dữ liệu hiển thị trước khi gửi; thông tin kỹ thuật nằm trong disclosure đóng mặc định; semantic review chỉ hiện số mục cần xem trước khi mở; nút xác nhận/từ chối vẫn còn.

- [x] **Step 2: Chạy test để xác nhận đỏ.** Chạy các assertion mới trước khi sửa giao diện; chúng thất bại như dự kiến.

- [x] **Step 3: Tạo lối vào AI dễ hiểu, không làm mất quyền kiểm soát.** Khu AI mặc định thu gọn; khi mở hiển thị provider, trạng thái, phạm vi dữ liệu và consent riêng cùng nút gửi chủ động. SHA/token/URI/chẩn đoán được thu gọn. Không tự gửi, không tuyên bố AI đã xem bố cục. (Phạm vi payload/API và consent không đổi.)

- [x] **Step 4: Thu gọn danh sách ngữ nghĩa.** `df-step1-semantic-review` mặc định chỉ hiện số mục cần xem; khi mở vẫn giữ trích đoạn, nhãn, trạng thái, lý do và nút xác nhận/từ chối. Anchor/revision/rule metadata nằm trong chi tiết kỹ thuật; không tự duyệt hoặc áp rule.

- [x] **Step 5: Chạy test xanh.** `semantic-review-ui.test.ts` PASS 3/3; `full-text-review-ui.test.ts` PASS 3/3. Consent phân vùng và rà soát toàn văn vẫn độc lập; không có gửi tự động.

---

### Task 4: Sửa bố cục và giúp tìm nút tiếp tục

**Files:**
- Modify: src/components/ImportStepView.css
- Modify: test/semantic-review-ui.test.ts
- Create: test/import-step-layout.test.ts

**Interfaces:**
- Consumes: data-flow-phase và data-context-visible trên ImportStepView.
- Produces: trong phase metadata, chỉ các thẻ lựa chọn ngắn nằm ở hai cột; khu vực AI/ngữ nghĩa và hành động chính dùng toàn bề ngang. Thanh hành động Bước 1 sticky trong vùng cuộn, không che nội dung hoặc focus.

- [x] **Step 1: Viết kiểm tra bố cục trước.** Tạo `test/import-step-layout.test.ts` xác nhận các thẻ lựa chọn, semantic review full-width, action bar sticky và không tái tạo cột context trống.

- [x] **Step 2: Chạy test để xác nhận đỏ.** Các assertion mới được chạy trước phần sửa CSS và thất bại như dự kiến.

- [x] **Step 3: Sửa vùng metadata hẹp theo nguyên nhân thật.** Giữ hai cột cho thẻ lựa chọn; semantic review, AI review và action bar trải toàn chiều rộng.

- [x] **Step 4: Giữ thanh hành động trong tầm nhìn.** Action bar sticky có nền, viền và chừa khoảng cuộn; lý do disabled tiếp tục liên kết với nút bằng `aria-describedby`.

- [ ] **Step 5: Kiểm tra giao diện tương tác thực tế — NOT_VERIFIED.** `import-step-layout.test.ts` và `semantic-review-ui.test.ts` PASS. Chưa xác minh bằng chuột, cuộn, Tab/Enter tại 1920×1080 và 390×844 vì môi trường hiện tại không cung cấp runtime điều khiển giao diện được skill yêu cầu; cần kiểm tra acceptance này trước khi tuyên bố UX đã được chấp nhận.

---

### Task 5: Kiểm tra hồi quy toàn Bước 1 và báo cáo

**Files:**
- Test: test/source-mismatch-profile.test.ts
- Test: test/profile-decision-gate.test.ts
- Test: test/semantic-review-ui.test.ts
- Test: test/full-text-review-ui.test.ts
- Test: test/import-step-layout.test.ts
- Regression: test/import-segments.test.ts, test/stage2-regime-detection.test.ts

- [x] **Step 1: Chạy nhóm kiểm thử mục tiêu.** Tất cả bảy test mục tiêu PASS: source mismatch 7/7; profile gate 3/3; semantic UI 3/3; full-text review 3/3; layout 2/2; import segments 1/1; stage2 regime 25/25.

- [x] **Step 2: Build và kiểm tra TypeScript.** `tsc --noEmit` PASS; `vite build` PASS. Còn warning hiện hữu về `node:crypto` được externalize cho browser và bundle lớn hơn 500 KB; không phải lỗi test.

- [x] **Step 3: So sánh lỗi nền ngoài phạm vi.** `workspace-candidate.test.ts` đã chạy và FAIL 13/14 tại `profile_header_not_stamped`; không sửa exporter trong đợt Bước 1.

- [x] **Step 4: Ghi nhận giới hạn chấp nhận.** Đã phân loại PASS/FAIL/NOT_VERIFIED trong ledger. Không gọi provider và không gửi tài liệu thật; kiểm thử chuột/cuộn/bàn phím desktop/mobile vẫn NOT_VERIFIED.

## Handoff

Đã triển khai cục bộ trong checkout canonical. Các thay đổi chưa commit/push. Còn bước chấp nhận UI tương tác thật ở desktop/mobile; không tuyên bố UX hoàn tất trước khi bước đó được xác minh.
