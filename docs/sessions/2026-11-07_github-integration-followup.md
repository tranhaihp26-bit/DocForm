# DocForm — GitHub integration follow-up, 07/11/2026

## Mục tiêu phiên

Tiếp tục từ publication PR #48; kiểm tra trạng thái các PR mở, ưu tiên tích hợp các gói đủ chứng cứ kỹ thuật, giữ các cổng nghiệm thu thật và cập nhật bộ nhớ dự án. GitHub account: Primary (`tranhaihp26-bit`).

**Snapshot ban đầu:** `main` = `deffe60c91a00041765530e3192259735c36defe`. PR #37, #38, #42–#48 mở; #37 diverged (ahead 6, behind 3 so với main ban đầu). Không sửa trực tiếp source trên nhánh nào trong phiên tích hợp này.

## Các PR đã tích hợp vào main

| PR | Phạm vi thực sự | Merge commit (squash) | Kiểm chứng hiện có và giới hạn |
|---|---|---|---|
| [#38](https://github.com/tranhaihp26-bit/DocForm/pull/38) | DF-E05: chặn Origin/Host/loopback trước body parser DOCX/PDF; giới hạn payload; negative tests | `463561a079d2841a250f7e0a7b5ba51c40d6e1bf` | 41/41 focused tests + lint **trước merge** từ PR; GitHub Actions cho head PR không chạy vì path filter. Không có Office/UAT. DF-E01 không hoàn thành. |
| [#42](https://github.com/tranhaihp26-bit/DocForm/pull/42) | DF-C06: inventory/lineage và fail-closed đối với bảng chưa rõ nguồn/bao bọc/ID xung đột | `9373b8034e9f2053b48f2895fe11045a86aa0d29` | 48/48 focused tests local và GitHub workflow `42362321800` thành công tại PR head; không chứng minh OOXML end-to-end hay Word/WPS. |
| [#44](https://github.com/tranhaihp26-bit/DocForm/pull/44) | DF-A01: ma trận provenance nguồn/profile, đánh dấu profile conflict và scope phê duyệt | `373ce2b785bd6531b2e95dd55546cc5c3c617b11` | Chỉ tài liệu; `PARTIAL_SOURCE_MAPPED`, A02/A03 tiếp tục `BLOCKED_BY_MASTER`. |
| [#46](https://github.com/tranhaihp26-bit/DocForm/pull/46) | PA-01–PA-03: supplement support/editor và mẫu baseline UAT thực | `3ca6a2761d238cb29e301c97e26f166653b2199e` | Chỉ tài liệu; không có UAT thực hoặc Office/render. |

**Mọi lần merge** dùng account Primary, squash, và khóa expected head SHA. Không đóng issue theo tên PR. `main` sau 4 lần merge: `3ca6a2761d238cb29e301c97e26f166653b2199e` (theo kết quả merge trả về).

## PR giữ mở và lý do

- [#37](https://github.com/tranhaihp26-bit/DocForm/pull/37) — DF-B03; vẫn Draft. Branch diverged, tại main sau merge `ahead=6, behind=7`, diff 19 tệp bao gồm exporter, lockfile và workflow; cần cập nhật branch và kiểm tra không đưa lại thay đổi đã merge. Ba Actions trước đó PASS tại head `d5426d2`, nhưng *focused audit test* không nằm trong ba workflow. Chưa kiểm DOCX hậu stamp/Office/UAT.
- [#43](https://github.com/tranhaihp26-bit/DocForm/pull/43) — DF-E03/PA06/F02; vẫn Draft. Preflight ZIP/OPC 16/16 local synthetic PASS theo PR; không có CI cho head; branch sau 4 merge bị behind. Cần đồng bộ với #38 và xác minh tuyến renderer thật/CI trước khi kết luận. Không có Word/WPS.
- [#45](https://github.com/tranhaihp26-bit/DocForm/pull/45) — DF-B04; vẫn Draft. Settings/header focused tests local được ghi lại, nhưng thiếu Word/WPS render, UAT và CI mới. Không merge chỉ từ synthetic.
- [#47](https://github.com/tranhaihp26-bit/DocForm/pull/47) — PA-05; vẫn Draft. Hướng dẫn recovery không thay đổi runtime; hai thất bại local còn chưa xử lý: import-session-browser modal assertion tại dòng 566 trong ca giữ `loadDraft` đang pending, và office-worker-redesign geometry `9980 !== 10170`. Thiếu Office/UAT.
- [#48](https://github.com/tranhaihp26-bit/DocForm/pull/48) — bộ nhớ/publication/roadmap; cập nhật cùng phiên này, cần merge sau khi đối chiếu HEAD & thông tin trạng thái. Việc PR #48 ghi publication “chưa merge” là **snapshot lịch sử trước phiên tích hợp**, không phải trạng thái hiện hành.

`mergeable=false` được GitHub trả về nhất thời đối với một số PR sau lần cập nhật `main`; không suy thẳng đó là xung đột file nếu chưa tính toán lại. Các PR giữ Draft cho đến khi các điều kiện gói được kiểm đúng phạm vi.

## Bằng chứng / giới hạn

- Đọc trực tiếp GitHub: `get_pr_info`, danh sách thay đổi, `compare_commits`, Actions theo head và các patch liên quan.
- **Không chạy lại test local** trong phiên này; không có quyền truy cập worktree cục bộ trong kết nối GitHub và môi trường thực thi ở đây không truy cập được github.com qua git transport. Kết quả test nêu trên là chứng cứ được PR ghi và kết quả Actions đã đọc, không giả là test mới.
- **Không chạy Office Word/WPS, PDF visual, DOCX pilot thật hoặc người dùng UAT**. Các Gate T/U/R/O và release M1/M2 vẫn chưa đủ bằng chứng.
- Trạng thái nên dùng sau merge: `INTEGRATED_CODE` cho #38/#42, `INTEGRATED_DOCS` cho #44/#46; **không** `ACCEPTED` hay `VERIFIED_RENDER`.

## Tiếp theo (không làm lại việc đã có chứng cứ)

1. Đồng bộ #37 theo `main` để loại phần diff mang tính lịch sử; chạy targeted OOXML post-stamp audit test rồi mới cập nhật PR.
2. Đồng bộ #43 với #38 và thêm CI security/source-renderer ở scope thay đổi; kiểm khả năng mở gói DOCX thực và fail-closed.
3. Giải quyết hai lỗi thực tế của #47 tại test/UI/geometry đúng owner; không tự tuyên bố unrelated.
4. Kiểm #45 bằng DOCX hậu stamp + Office/WPS/visual, rồi đánh giá hợp nhất.
5. Chỉ nâng status Product Support Matrix hoặc đóng issue khi có bằng chứng đúng gate.

## Chốt trạng thái lưu trữ

- [PR #48](https://github.com/tranhaihp26-bit/DocForm/pull/48) đã merge ở `60c7990ae67c6089e12ef68109acbc4603e27c44`, đưa nhật ký này và Project Memory/Roadmap lên `main`. Bốn PR #37/#43/#45/#47 vẫn Draft và chưa được merge.
- Comments cập nhật tiến độ đã được ghi vào các issues #28, #22, #12, #4, #5, #6; vẫn giữ các issue mở do thiếu bằng chứng nghiệm thu.
- Đánh giá trạng thái này là kết quả tích hợp có thể truy xuất GitHub, **không phải** một lần full regression, Office visual QA hay nghiệm thu M1/M2.
