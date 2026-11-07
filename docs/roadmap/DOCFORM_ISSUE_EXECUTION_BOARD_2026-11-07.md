# DocForm — Bảng điều phối issue & triển khai song song

**Phiên bản:** ISSUE-BOARD-v1.0 — 07/11/2026 · **Repository:** `tranhaihp26-bit/DocForm` · **Dùng cho điều phối, không thay Master Roadmap**.  
**EPIC GitHub:** [#36 — M2 Điều phối 32 issue](https://github.com/tranhaihp26-bit/DocForm/issues/36).  
**Đích cuối:** [Product End State M1/M2](../product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md); **Kế hoạch duy nhất:** [Master Roadmap V2.0](DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md); [Project Memory](../PROJECT_MEMORY.md).  
**Cập nhật sau mỗi PR:** agent phải ghi tiến độ thực vào issue tương ứng, session log, Project Memory và roadmap nếu status thay đổi. Không chỉ tick checklist tự động.

## 1. Trạng thái nguồn GitHub — kiểm đếm

- **29 gói kỹ thuật** A–F theo Master Roadmap.
- **3 gói kỹ thuật đã có code/test và PR merge trước đợt tạo issue:** DF-A04, DF-C01, DF-C03. **Không tạo lại issue mới cho các gói này**; evidence: [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3), [PR #2](https://github.com/tranhaihp26-bit/DocForm/pull/2).
- **26 gói kỹ thuật chưa hoàn tất:** 26 issue được mở. Trong đó **DF-A01 và DF-B01 đã PARTIAL**; issue chỉ cho phần còn thiếu, không restart.
- **6 luồng nghiệm thu sản phẩm:** PA-01–PA-06 (PA-01 đã có ma trận baseline, chưa có bằng chứng nghiệm thu).
- Tổng **32 issue triển khai [#4–#35](https://github.com/tranhaihp26-bit/DocForm/issues)** + **1 EPIC [#36](https://github.com/tranhaihp26-bit/DocForm/issues/36)** (issue điều phối, không phải gói thứ 33).
- **Không tự tạo nhánh/commit triển khai runtime chỉ vì issue đã được mở**; issue là kế hoạch hành động, chưa phải PASS.

## 2. Thực hiện ngay bằng các lane độc lập (W0)

**Ưu tiên 6 PR code độc lập đầu tiên** (không đòi hỏi quyết định mới của người dùng; chọn các module không chồng lấn):

| Lane / thứ tự thực thi | Issue mở | Phạm vi chính | Điều kiện tránh đụng mã |
|---|---|---|---|
| Core-Profile | **[#7](https://github.com/tranhaihp26-bit/DocForm/issues/7) DF-B02** | Nối effective values vào các consumer đã có nguồn profile approved | #15 B01 **không chỉnh** resolver cùng lúc nếu #7 đang sửa cùng API; #12 A01 chỉ cập nhật nguồn |
| Font-Audit | **[#8](https://github.com/tranhaihp26-bit/DocForm/issues/8) DF-B03** | OOXML hậu stamp và kiểm font size nguyên theo role | Tạo validator/test riêng; tránh viết đè exporter của #7 |
| AI-Trust | **[#9](https://github.com/tranhaihp26-bit/DocForm/issues/9) DF-E01** | Trusted-profile / consent / stale ở AI server | #28 E05 chỉ bổ sung test độc lập; mọi thay đổi `server.ts` phải sắp thứ tự |
| Candidate-UX | **[#10](https://github.com/tranhaihp26-bit/DocForm/issues/10) DF-E02** | Trạng thái tải/đối chiếu/stale và PDF SHA | #29 E06 chưa sửa `App.tsx` song song |
| Infra | **[#11](https://github.com/tranhaihp26-bit/DocForm/issues/11) DF-E04** | Sửa lockfile/esbuild, clean `npm ci` | Chủ sở hữu riêng `package.json`, `package-lock.json`, CI |
| Table-Protection | **[#22](https://github.com/tranhaihp26-bit/DocForm/issues/22) DF-C06** | Inventory bảng LOCKED/CONTENT/UNKNOWN; negative tests | #20 C04 hoãn sửa `tableRoundtrip.ts` cho đến khi contract ổn định |

**Song song không chạm các 6 lane code trên:** [#4](https://github.com/tranhaihp26-bit/DocForm/issues/4) PA-01 (support scope), [#5](https://github.com/tranhaihp26-bit/DocForm/issues/5) PA-02 (UX baseline), [#6](https://github.com/tranhaihp26-bit/DocForm/issues/6) PA-03 (editability baseline), [#12](https://github.com/tranhaihp26-bit/DocForm/issues/12) DF-A01 (source matrix), [#16](https://github.com/tranhaihp26-bit/DocForm/issues/16) DF-B04 (stamp repro), [#33](https://github.com/tranhaihp26-bit/DocForm/issues/33) PA-04 (ADR phân phối), [#34](https://github.com/tranhaihp26-bit/DocForm/issues/34) PA-05 (lưu/khôi phục + hướng dẫn), [#35](https://github.com/tranhaihp26-bit/DocForm/issues/35) PA-06 (corpus schema/permissions). [#27](https://github.com/tranhaihp26-bit/DocForm/issues/27) DF-E03 có thể làm contract tests; **WPS real chỉ khi có máy**.

Các issue **repro-only có thể làm sớm**: [#18](https://github.com/tranhaihp26-bit/DocForm/issues/18) DF-B06 (spacing), [#21](https://github.com/tranhaihp26-bit/DocForm/issues/21) DF-C05 (signature pagination). Sửa code sau khi đã xác minh và tránh cùng file với #7/#19.

**Mục tiêu W0:** tạo các bằng chứng nhỏ trực tiếp liên quan kết quả người dùng; không tự coi baseline UX/Support Matrix đã là UAT PASS, không tự sửa mẫu chưa duyệt.

## 3. Quy tắc xếp thứ tự để không phát sinh xung đột merge

| Module/tệp nóng | Issue có thể chạm | Cách triển khai |
|---|---|---|
| `effectiveProfileAttribute.ts` / `documentComposer.ts` | #7 B02, #15 B01 | Cố định contract B01 hiện có; B02 dùng theo approved subset; phần đổi contract tiếp theo serial |
| `docxExport.ts` | #7 B02, #17 B05, #18 B06, #19 C02, #20 C04, #21 C05 | **Chỉ một PR chỉnh exporter lúc một thời điểm**; các issue khác có thể viết fixture/expected/test trước |
| `ruleEngine.ts` / font auditor | #7 B02, #8 B03 | B03 ở validator riêng trước; tích hợp cùng consumer theo PR nhỏ và CI focused |
| `src/App.tsx`, `WorkspaceExport.tsx`, candidate manager | #10 E02, #29 E06, #5 PA02 | UX baseline đọc/test song song, nhưng sửa App.tsx phải serial |
| `server.ts` và AI/security middleware | #9 E01, #28 E05 | E05 test-only song song; phần fix server.ts để sau E01 hoặc cherry-pick có kiểm |
| `tableRoundtrip.ts`, `tableFormatUtils.ts` | #22 C06, #20 C04 | C06 khóa role và inventory, C04 áp formatter sau |
| `package-lock.json` / workflows | #11 E04, mọi PR cần CI | E04 sở hữu lockfile; các PR khác không tự nâng dependencies |
| `profile.json`, Header XML gold | #13 A02, #14 A03, #19 C02 | **BLOCKED_BY_MASTER** cho các trường conflict; không sửa theo suy đoán |

## 4. Bảng đầy đủ 32 issue và phụ thuộc

**Nhãn trạng thái trong bảng chỉ là phân luồng khi tạo issue**, không tự đồng bộ với tiến độ thực tế; xem trạng thái live trên GitHub issue. Một số issue có thể chuyển từ READY thành BLOCKED khi gặp bằng chứng mới.

| Gói | Issue | Trạng thái khi mở | Giai đoạn ưu tiên | Phụ thuộc/ràng buộc |
|---|---|---|---|---|
| DF-A01 | [#12](https://github.com/tranhaihp26-bit/DocForm/issues/12) | PARTIAL | READY docs; không đổi master | PA01 / profile-source |
| DF-A02 | [#13](https://github.com/tranhaihp26-bit/DocForm/issues/13) | BLOCKED_MASTER | CHỜ phê duyệt | A01 + approved golden |
| DF-A03 | [#14](https://github.com/tranhaihp26-bit/DocForm/issues/14) | BLOCKED_MASTER | CHỜ phê duyệt | A01 + issuer golden |
| DF-B01 | [#15](https://github.com/tranhaihp26-bit/DocForm/issues/15) | PARTIAL | Sắp xếp cùng B02 | A01 source approved; tránh trùng B02 |
| DF-B02 | [#7](https://github.com/tranhaihp26-bit/DocForm/issues/7) | READY | W0 core | A01 approved subset + B01 đã triển khai |
| DF-B03 | [#8](https://github.com/tranhaihp26-bit/DocForm/issues/8) | READY | W0 font QA | Profile/OOXML hậu stamp; auditor độc lập |
| DF-B04 | [#16](https://github.com/tranhaihp26-bit/DocForm/issues/16) | REPRO_FIRST | W0 stamp repro | DOCX synthetic settings; không phụ thuộc master |
| DF-B05 | [#17](https://github.com/tranhaihp26-bit/DocForm/issues/17) | CONDITIONAL | W1 từng tuyến | B02/B03; A02/A03 cho field blocked |
| DF-B06 | [#18](https://github.com/tranhaihp26-bit/DocForm/issues/18) | REPRO_FIRST | W0 repro, W1 fix | Fixture spacing; code sửa sau B02/B05 |
| DF-C02 | [#19](https://github.com/tranhaihp26-bit/DocForm/issues/19) | CONDITIONAL | W1 contract | Tách role trước, HD05 style sau A03/golden |
| DF-C04 | [#20](https://github.com/tranhaihp26-bit/DocForm/issues/20) | DEPENDS | W1 | C03 DONE, C06 inventory, B02 table fields |
| DF-C05 | [#21](https://github.com/tranhaihp26-bit/DocForm/issues/21) | REPRO_FIRST | W0 repro, W1 fix | Bảng chữ ký hiện hành; tránh trùng C02 |
| DF-C06 | [#22](https://github.com/tranhaihp26-bit/DocForm/issues/22) | READY | W0 table protection | C03 DONE; lineage source/table |
| DF-D01 | [#23](https://github.com/tranhaihp26-bit/DocForm/issues/23) | OPTIONAL | W2 sau pilot | C04+C06; người dùng có nhu cầu |
| DF-D02 | [#24](https://github.com/tranhaihp26-bit/DocForm/issues/24) | OPTIONAL | W2 sau GO | D01 GO, V6.9 corpus |
| DF-D03 | [#25](https://github.com/tranhaihp26-bit/DocForm/issues/25) | OPTIONAL | W2, có thể bỏ | C04, D01 nếu cần optimizer |
| DF-D04 | [#26](https://github.com/tranhaihp26-bit/DocForm/issues/26) | BLOCKED_EVIDENCE | W2 chỉ khi có bằng chứng | D01–D03 + corpus có quyền + Office |
| DF-E01 | [#9](https://github.com/tranhaihp26-bit/DocForm/issues/9) | READY | W0 AI | PR#1 profile trust; E05 tránh cùng server.ts |
| DF-E02 | [#10](https://github.com/tranhaihp26-bit/DocForm/issues/10) | READY | W0 export UX | Candidate byte/revision; UI |
| DF-E03 | [#27](https://github.com/tranhaihp26-bit/DocForm/issues/27) | CONDITIONAL | W0 contract, W3 real | Contract tests trước; Word/WPS real cần máy |
| DF-E04 | [#11](https://github.com/tranhaihp26-bit/DocForm/issues/11) | READY | W0 infra | Package lock / CI độc lập |
| DF-E05 | [#28](https://github.com/tranhaihp26-bit/DocForm/issues/28) | READY_TESTS | W0 tests, fix xung đột serial | Security negatives; phối hợp E01 trên server.ts |
| DF-E06 | [#29](https://github.com/tranhaihp26-bit/DocForm/issues/29) | DEPENDS | W1–W3 | PA-02/03 baseline + E02 UX |
| DF-F01 | [#30](https://github.com/tranhaihp26-bit/DocForm/issues/30) | RELEASE_GATE | W4 | B/C/E merged + scope PA01 |
| DF-F02 | [#31](https://github.com/tranhaihp26-bit/DocForm/issues/31) | RELEASE_GATE | W4 | PA06, E03, F01, Golden profile |
| DF-F03 | [#32](https://github.com/tranhaihp26-bit/DocForm/issues/32) | RELEASE_GATE | W4–W5 | F01/F02, Gates S/T/U/R/O/C |
| PA-01 | [#4](https://github.com/tranhaihp26-bit/DocForm/issues/4) | READY_BASELINE | W0 scope | Support Matrix đã có; cần evidence |
| PA-02 | [#5](https://github.com/tranhaihp26-bit/DocForm/issues/5) | READY_BASELINE | W0 đo baseline | UX-01–13; cần người dùng thật cho UAT |
| PA-03 | [#6](https://github.com/tranhaihp26-bit/DocForm/issues/6) | READY_BASELINE | W0 ma trận | Editor capability; cần thao tác thật |
| PA-04 | [#33](https://github.com/tranhaihp26-bit/DocForm/issues/33) | READY_ADR | W0 ADR, W3 smoke | E04 hỗ trợ clean install, E03 hỗ trợ WPS |
| PA-05 | [#34](https://github.com/tranhaihp26-bit/DocForm/issues/34) | READY | W0 test/notes | Draft/IndexedDB/recovery + help |
| PA-06 | [#35](https://github.com/tranhaihp26-bit/DocForm/issues/35) | READY_SCHEMA | W0 evidence schema, W4 signoff | Corpus schema ngay; Office/golden sau |

## 5. Các chặng tiếp theo và điều kiện mở khóa

**W1 — DOCX/Editor thực sự đáng tin cậy:** sau contract approved của #7/#8/#22 và baseline #4–#6, mở #17 B05 (phần không conflict), #20 C04, #19 C02 (chỉ role đã duyệt), #18 B06/#21 C05 (đã có repro), #29 E06 (đúng UX pain points). #15 B01 chỉ làm phần resolver còn thiếu; không triển khai lại bài test đã PASS.

**BLOCKED_BY_MASTER:** #13 DF-A02 (right/center, Exactly 15/16) và #14 DF-A03 (tên chủ thể Đảng theo mẫu có hiệu lực) — không được kéo sang READY hay sửa profile khi chưa có golden/revision/approval. Các issue khác chỉ phụ thuộc **field cụ thể**, không chờ toàn dự án.

**W2 — V6.9 tùy chọn:** #23 D01 → #24 D02 và #25 D03 → #26 D04, chỉ mở khi #20/#22 đủ evidence và PA03/PA06 xác nhận người dùng thực sự cần. Nếu không có lợi ích hoặc thiếu corpus/Word/WPS thì `NO-GO/BLOCKED_EVIDENCE`, **không coi đó là thất bại của M1 nếu tối ưu không thuộc scope**.

**W3 — Windows, bảo mật và trải nghiệm:** #27 E03 WPS thực, #28 E05 full security negatives, #33 PA04 cài đặt, #34 PA05 recovery, #29 E06 UX theo baseline. Đúng kết quả M1: manual không AI vẫn hoàn tất DOCX.

**W4/M1 — Release có điều kiện:** #30 F01 canonical QA → #31 F02 visual Word/WPS + #35 PA06 corpus → #32 F03 đánh giá Gates S/T/U/R (M1). **Không công bố PASS từ mock/HTML/CI hoặc chưa có người dùng thực**.

**W5/M2 — Sử dụng thường xuyên:** bổ sung O/C Gates (phân phối, phục hồi, trợ giúp, rollback) cho phạm vi tính năng đã công bố; M2 đòi hỏi kết quả thực tế chứ không phải 32 issue đóng.

## 6. Checklist chung của từng issue/PR

- [ ] Xác định `DF-ID/PA-ID → kết quả người dùng → mức M1/M2 → đã có evidence nào`; đọc HEAD/PR/Project Memory để không làm lại.
- [ ] Chỉ sửa scope nhỏ và file được quyền; không tự áp workbook chưa duyệt hay fallback ND30/HD05 vào field profile đã SET.
- [ ] Test theo phạm vi diff; source/DOCX SHA, expected→actual OOXML hoặc UI/Word/WPS/UAT theo đúng gate tác động.
- [ ] Không tự điền số/ngày/người ký/chữ ký/dấu; không mất nội dung; AI consent/revision gates không được nới.
- [ ] Khi gặp phụ thuộc/golden/Office chưa có → ghi `BLOCKED_BY_MASTER` hoặc `NOT_VERIFIED_RENDER`, chuyển sang issue độc lập khác.
- [ ] Sau sửa: session log, Project Memory, Roadmap/Support Matrix theo tác động và issue comment có PR/commit/CI thực. Chỉ đóng issue khi DoD tương ứng đã đạt, không đóng nhầm PA vì unit tests.
- [ ] Ở cổng release: đủ S/T/U/R cho M1; S/T/U/R/O/C cho M2; người dùng mục tiêu thực sự làm xong văn bản.
