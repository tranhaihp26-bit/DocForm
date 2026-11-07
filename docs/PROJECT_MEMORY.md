# DocForm — Project Memory (bộ nhớ dự án xuyên phiên)

**Bắt buộc đọc trước khi sửa, cập nhật sau khi hoàn thành mỗi đợt.** Quy trình: [PROJECT_SESSION_PROTOCOL.md](PROJECT_SESSION_PROTOCOL.md). Tài liệu này là **chỉ mục ngắn**, không thay thế log phiên, Master Roadmap hay Git history.

## Trạng thái GitHub mới nhất — cuối phiên tích hợp 07/11/2026

**Đã tích hợp 5 PR:** #38, #42, #44, #46 và #48. PR #48 (Project Memory/Roadmap/nhật ký) đã merge tại `60c7990ae67c6089e12ef68109acbc4603e27c44`. **Vẫn mở, Draft:** #37, #43, #45 và #47. Các issue gốc vẫn mở nếu chưa đạt cổng nghiệm thu. **M1/M2: NO-GO** vì thiếu corpus DOCX hậu stamp, Word/WPS và UAT. [Nhật ký tích hợp](sessions/2026-11-07_github-integration-followup.md). Phần “publication” phía dưới là lịch sử tại thời điểm trước các merge.


## Mục tiêu sản phẩm không được thay đổi

Người dùng **tạo mới, nhập, chỉnh sửa, chuẩn hóa và xuất DOCX có thể tiếp tục chỉnh sửa**, ưu tiên **mọi thuộc tính có cấu hình trong profile Công ty đã xác nhận**. ND30/HD05 chỉ bổ sung từng thuộc tính profile thiếu, không dùng để đối chiếu lại giá trị đã có. Giữ nguyên nội dung không được duyệt sửa và nguồn, không tự điền số/ngày/người ký/chữ ký/dấu; preview/PDF và trạng thái kiểm tra phải trung thực. Giữ workflow Import → Editor → Export, không mặc định viết lại kiến trúc.

## Nguồn điều hành

- [**Product End State — đích M2 và cổng nghiệm thu**](product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md)
- [**Product Support Matrix — phạm vi được chứng minh**](product/PRODUCT_SUPPORT_MATRIX.md)
- [Master Roadmap V2.0 & trạng thái các gói DF-A–F/PA-01–PA-06](roadmap/DOCFORM_MASTER_AUDIT_IMPLEMENTATION_ROADMAP_2026-11-07.md)
- [**Issue Execution Board — 32 issue, lane song song và phụ thuộc**](roadmap/DOCFORM_ISSUE_EXECUTION_BOARD_2026-11-07.md) · [EPIC #36](https://github.com/tranhaihp26-bit/DocForm/issues/36)
- [Chính sách V2.2](DOCFORM_PRODUCT_FIRST_PROFILE_POLICY_V2_2.md)
- [Profile Source Matrix DF-A01](profile/PROFILE_SOURCE_MATRIX.md) — `PARTIAL_SOURCE_MAPPED`, không tự sửa A02/A03 đang conflict
- [Codebase Map](CODEBASE_MAP.md)
- [Quy trình nhớ phiên, chống làm trùng/lạc mục tiêu](PROJECT_SESSION_PROTOCOL.md)

## Tiến độ hiện tại (theo phiên đã lưu)

| Gói | Trạng thái kiểm chứng | Bằng chứng |
|---|---|---|
| DF-C01 | DONE_CODE + VERIFIED_OOXML_FOCUSED | PR #2, merge `b8d825bf`, GitHub Actions 42332869724 |
| DF-C03 | DONE_CODE + VERIFIED_OOXML_FOCUSED | PR #2, merge `b8d825bf`, GitHub Actions 42332869724 |
| DF-A01 | PARTIAL_SOURCE_MAPPED | [Ma trận nguồn](profile/PROFILE_SOURCE_MATRIX.md); còn role chưa xác thực |
| DF-A02/A03 | BLOCKED_BY_MASTER | Xung đột ND30 date alignment/issuer line; tên tổ chức Đảng theo mẫu khác phiên bản |
| DF-A04 | DONE_CODE + CI_VERIFIED_FOCUSED | [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3), merge `cf5fb619`; CI 26/26 & 31/31 ở HEAD cuối |
| DF-B01 | PARTIAL_IMPLEMENTED + CI_VERIFIED_FOCUSED — mới nối body.fontSizePt | [Nhật ký phiên](sessions/2026-11-07_DF-A04-B01_effective-profile-and-memory.md); còn DF-B02 cho các consumer khác |
| DF-B02/B03 | OPEN | Nối các thuộc tính còn lại vào exporter/QA sau khi B01 ổn định |
| DF-E03/F02 | NOT_VERIFIED_RENDER | Chưa có bằng chứng Word/WPS thực |
| PA-01 | BASELINE_DOCUMENTED / NOT_VERIFIED_UAT | [Support Matrix](product/PRODUCT_SUPPORT_MATRIX.md) — bốn tuyến pilot có trạng thái BLOCKED_BY_MASTER/NOT_VERIFIED, **chưa được công bố hỗ trợ end-to-end** |
| PA-02–PA-06 | PLANNED / NOT_VERIFIED | [Product End State](product/DOCFORM_MUC_TIEU_SAN_PHAM_CUOI_V1_0_2026-11-07.md) + Master Roadmap V2.0; chưa có UAT, Word/WPS hoặc evidence vận hành máy sạch |

## Phiên lập mục tiêu cuối và cập nhật roadmap (07/11/2026)

- **Trạng thái:** Product End State v1.0 + Master Roadmap v2.0 đã lưu; PA-01 có ma trận baseline, **chưa có UAT/Word/WPS nghiệm thu**.
- **Session log:** [PA-01–PA-06 — Product End State và Master Roadmap V2.0](sessions/2026-11-07_PA01-PA06_product-endstate-master-v2.md).
- **Công việc ưu tiên kế tiếp:** PA-01 khóa phạm vi M1 có dữ liệu chứng minh, DF-B02 per-property; PA-02/PA-03 baseline usability/editability sớm. Chỉ sửa những field có profile approved.

## Phiên tạo issue theo Master Roadmap V2.0 (07/11/2026)

- **Đã tạo và kiểm tra trên GitHub:** 32 issue triển khai [#4–#35](https://github.com/tranhaihp26-bit/DocForm/issues), mỗi DF/PA-ID duy nhất, không tạo lại ba gói DONE_CODE. [EPIC #36](https://github.com/tranhaihp26-bit/DocForm/issues/36) có checklist đầy đủ. Đây chỉ là backlog/DoD, **không phải runtime được sửa hoặc UAT đã PASS**.
- **Điều phối song song:** [Issue Board](roadmap/DOCFORM_ISSUE_EXECUTION_BOARD_2026-11-07.md): W0 #7 B02, #8 B03, #9 E01, #10 E02, #11 E04, #22 C06; PA-01/02/03 và source/infrastructure/recovery song song. #13/#14 BLOCKED_BY_MASTER.
- **Log phiên:** [2026-11-07 — Tạo và điều phối issue M2](sessions/2026-11-07_DF-M2_issue-backlog-parallel-lanes.md).
- **Bước ưu tiên tiếp:** thực hiện từng lane W0 bằng PR nhỏ, không chồng file; baseline PA01/02/03 ngay. Sau merge cập nhật issue/comment, memory và trạng thái đúng; không tự triển khai D01–04 trước gate.

## Phiên làm việc gần nhất

- **Phiên:** 07/11/2026 — DF-A04/DF-B01 + thiết lập bộ nhớ dự án, nhánh `codex/df-b01-effective-attribute-project-memory-20261107`.
- **Trạng thái cuối:** [PR #3](https://github.com/tranhaihp26-bit/DocForm/pull/3) đã merge tại [`cf5fb619`](https://github.com/tranhaihp26-bit/DocForm/commit/cf5fb6190a1bd06db9da846039ad6eebd75e027c); CI tại head `457f0930` PASS [26/26](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367558) và [31/31](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336367566). Chưa nghiệm thu Word/WPS.
- **Nhật ký phiên đã lưu:** [07/11/2026 — DF-A04/B01 resolver & bộ nhớ dự án](sessions/2026-11-07_DF-A04-B01_effective-profile-and-memory.md), có commit, tệp thay đổi, CI, giới hạn và bước sau.
- **Hành động ưu tiên tiếp theo:** DF-B02 nối các thuộc tính đã duyệt còn thiếu vào consumer/exporter/OOXML QA bằng test phạm vi nhỏ; không sửa master A02/A03 bằng suy đoán. Các phần Word/WPS vẫn NOT_VERIFIED_RENDER.

**Lưu ý:** Khi bắt đầu phiên mới, đọc HEAD/PR live trên GitHub. Không dùng SHA nêu trong nhật ký cũ làm HEAD hiện hành mà không kiểm tra lại.


## GitHub publication status — 07/11/2026

- [Nhật ký phiên publication](sessions/2026-11-07_github-publication.md) is published in [draft PR #48](https://github.com/tranhaihp26-bit/DocForm/pull/48); the PR remains open and unmerged.
- Draft feature PRs: DF-A01 [#44](https://github.com/tranhaihp26-bit/DocForm/pull/44), head `6ff2bc02b88995cf00084a0037cbc9c86a98bfff`, still PARTIAL_SOURCE_MAPPED; DF-B03 [#37](https://github.com/tranhaihp26-bit/DocForm/pull/37), head `d5426d2077cb76f3adb6b56bea6ccf9f0fe393c8`, local focused audit 2/2 and current-head GitHub Actions passed; DF-B04 [#45](https://github.com/tranhaihp26-bit/DocForm/pull/45), head `0500c4a9d39bc3612ee85163b23c3443e9bb9c9a`, local focused suites/lint passed; PA-01–PA-03 [#46](https://github.com/tranhaihp26-bit/DocForm/pull/46), head `4d31de98624dd14844f1832f14288deaeea71269`, documentation baseline only; PA-05 [#47](https://github.com/tranhaihp26-bit/DocForm/pull/47), head `340e758499c83ff200f07560d563b1039d1a38cb`, guide draft with local test failures disclosed.
- At the final check, Actions had no runs for PR #44, #45, #46 or #47 heads. PR #37's three configured workflows succeeded; details and test limits are in the session log. No Word/WPS, UAT, or end-to-end acceptance is claimed. Issues #8, #12, #16, #4–#6, and #34 remain open.
- Previously published lanes remain as-is: PR #38 (G09), #42 (G07), and #43 (G14) were already on GitHub with matching local trees; PRs #39–#41 were already merged before this publication task. No change was made to main in this publication.
- Next action: review the open draft PRs and complete the missing evidence gates; preserve NOT_VERIFIED_RENDER and NOT_VERIFIED_UAT until actual Office/user checks exist.

## Integration update — 07/11/2026 (sau publication)

**Main sau 4 PR merge:** `3ca6a2761d238cb29e301c97e26f166653b2199e`. Các PR đã **merge** qua GitHub Primary: [#38](https://github.com/tranhaihp26-bit/DocForm/pull/38) DF-E05 bảo vệ upload (`463561a`), [#42](https://github.com/tranhaihp26-bit/DocForm/pull/42) DF-C06 kiểm bảng fail-closed (`9373b803`), [#44](https://github.com/tranhaihp26-bit/DocForm/pull/44) DF-A01 ma trận nguồn (`373ce2b7`), [#46](https://github.com/tranhaihp26-bit/DocForm/pull/46) PA01–PA03 baseline UAT (`3ca6a276`). Các issue #28, #22, #12, #4–#6 vẫn **OPEN** do còn điều kiện chưa nghiệm thu. `INTEGRATED_CODE` / `INTEGRATED_DOCS` **không** bằng `ACCEPTED`.

**PR còn mở:** #37 (DF-B03, lịch sử diverged), #43 (DF-E03/PA06/F02), #45 (DF-B04), #47 (PA-05, 2 test failures đã biết), #48 (nhật ký/roadmap đang cập nhật); tại mốc tích hợp còn Draft. Kết quả Actions/kiểm thử focused được kế thừa đúng head và phạm vi; không chạy test local mới trong phiên merge. Word/WPS, DOCX pilot hậu stamp và UAT vẫn `NOT_VERIFIED`; release M1/M2 **NO-GO**.

**Nhật ký chi tiết:** [GitHub integration follow-up 07/11](sessions/2026-11-07_github-integration-followup.md). **Ưu tiên tiếp:** đồng bộ nhánh #37 và kiểm post-stamp OOXML, sau đó #43 (renderer security), #45 (header/settings Word/WPS), xử lý hai lỗi test được nêu ở #47. Không lặp lại các kiểm thử có bằng chứng hợp lệ khi không thay phạm vi.
