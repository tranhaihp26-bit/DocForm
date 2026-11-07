# Session 07/11/2026 — M2 — Tạo 32 GitHub issues và điều phối triển khai song song

**Mục tiêu user:** Nghiên cứu Master Roadmap V2.0, trực tiếp tạo đủ issue để hoàn thiện DocForm, **ưu tiên công việc độc lập có thể thực hiện song song** và lưu thông tin lên GitHub để tiếp quản.

## 1. Căn cứ và hiện trạng trước khi tạo

- **Base `main`:** `f3ca7946addbcd416cd43785bfcea1b1807348ad`. Master Roadmap V2.0 giữ 29 DF gói kỹ thuật, Product End State M1/M2 và 6 luồng PA.
- **GitHub Issue list ban đầu:** chỉ #1–#3 là Pull Request đóng, **0 issue công việc mở**. Không có PR đang mở.
- **Đã kế thừa:** DF-C01 và DF-C03 theo PR #2, DF-A04 theo PR #3; DF-A01/B01 PARTIAL, A02/A03 BLOCKED_BY_MASTER. Không mở lại ba gói hoàn thành phạm vi code.
- **Không thay mã nguồn:** phiên này chỉ tạo issue + tài liệu điều phối. Không cài deps, không chạy runtime, không làm lại test đã PASS.

## 2. Kết quả thực hiện

- **Tạo 32 issue #4–#35:** mỗi một ID DF/PA chưa hoàn tất có đúng 1 issue; đã kiểm live 32 issue riêng biệt, 0 duplicate, 0 missing.
- **Tạo EPIC [#36](https://github.com/tranhaihp26-bit/DocForm/issues/36):** checklist đúng 32 issue, lane chạy song song, điều kiện dừng và gating nghiệm thu M1/M2. EPIC không là gói thứ 33.
- **Issue bodies:** outcome cho người dùng, status trước khi triển khai, priority P0/P1/P2, lane, phụ thuộc, file dự kiến, checklist công việc, DoD, stop/ngoài phạm vi, lưu session GitHub.
- **Tạo [Issue Execution Board](../roadmap/DOCFORM_ISSUE_EXECUTION_BOARD_2026-11-07.md):** toàn bộ ID→issue, W0 độc lập, file mutex, giai đoạn W1–W5 và blockers.
- **Cập nhật [Master Roadmap V2.0](../roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md), [Project Memory](../PROJECT_MEMORY.md), [Codebase Map](../CODEBASE_MAP.md), `AGENTS.md` và PR template:** coding agents phải tra issue board trước và comment/ghi log sau.

## 3. Kết quả kiểm tra đúng phạm vi

- Tải danh sách GitHub issue **trực tiếp sau tạo**, 32 unique package IDs [#4–#35] và EPIC #36; không thiếu.
- Sau commit tài liệu, phải kiểm đường dẫn và Git tree trên HEAD mới; trạng thái `docs-only`: **không chạy lint/build/test** vì không đổi runtime/CI; không tuyên bố UAT/Word/WPS PASS.
- Không dùng issue label/milestone chưa được tạo; priority/lane trong title/body và board, tránh gắn giả các label không tồn tại.
- Giữ `PA-01=BASELINE_DOCUMENTED`, `PA-02–06=PLANNED`, `DF-A02/03=BLOCKED_BY_MASTER`; chưa tạo ticket con trùng các deliverables nhỏ không đủ bằng chứng.

## 4. Quy tắc chạy song song / khóa file

- **Bắt đầu:** #7 DF-B02, #8 DF-B03, #9 DF-E01, #10 DF-E02, #11 DF-E04, #22 DF-C06 (module tương đối độc lập); các việc tài liệu/đo baseline #4/5/6/12/33/34/35 có thể song song.
- **Phối hợp:** #9/#28 đụng server.ts; #7/#15 đụng resolver; #7/#17/#18/#19/#20/#21 có thể đụng docxExport.ts; #10/#29 App.tsx; #11 độc quyền lockfile.
- **Blocker riêng:** #13/14 thiếu approved golden → không tự sửa tên/số đo; #27 WPS thật cần môi trường; #26 D04 cần corpus được phép và Office.
- **D01–D04 chỉ optional**, không làm trước khi table role và PA03/PA06 xác nhận lợi ích thực.

## 5. Hành động tiếp

Bắt đầu W0 theo từng issue, PR nhỏ và test có phạm vi. Sau mỗi PR cập nhật issue comment, `docs/sessions/`, `docs/PROJECT_MEMORY.md`, Master Roadmap/Support Matrix nếu trạng thái/scope đổi. Chỉ đóng issue khi DoD đủ bằng chứng, không đồng nhất issue closed với M1/M2 GO. **M2 chưa nghiệm thu**.
