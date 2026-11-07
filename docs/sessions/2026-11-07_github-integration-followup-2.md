# DocForm — Follow-up 2: sync PR histories, integrate focused code, recover legacy tests (2026-11-07)

## Mục tiêu và phạm vi
Tiếp tục từ `main` `6fbeed9a30a52b871ba00f44e9ee7ea1abf17fb4`, không tái làm các gói đã có bằng chứng, chỉ tích hợp các PR thuộc phạm vi code/test/tài liệu, giữ điều kiện nghiệm thu người dùng. GitHub connector account: Primary. Không Word/WPS hay người dùng UAT trong lượt này.

## PR đã merge lên main
| PR | Code/tài liệu thực sự tích hợp | Merge SHA | Bằng chứng hiện có |
|---|---|---|---|
| [#37](https://github.com/tranhaihp26-bit/DocForm/pull/37) | DF-B03: auditor font-size OOXML, tests, session log, CI | `bce0f733c9b52f69736a9592fda95ad910d82769` | [42370611414](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370611414) + [42370611419](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370611419) SUCCESS trên branch reconciled |
| [#43](https://github.com/tranhaihp26-bit/DocForm/pull/43) | DF-E03/PA-06: ZIP/OOXML source/candidate preflight, test, CI, evidence schema | `1efe5e34b7ba9668babf2d1c60541e721a6a0813` | [42370734850](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370734850) SUCCESS, scoped Linux security suite; Windows-only candidate check vẫn skip |
| [#45](https://github.com/tranhaihp26-bit/DocForm/pull/45) | DF-B04: preserving header settings when stamping, test, CI | `eed8f02e42f7f82a2fa711c6f7d0a96f12cf7b49` | [42370737629](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42370737629) SUCCESS, scoped settings/dual-regime tests |
| [#47](https://github.com/tranhaihp26-bit/DocForm/pull/47) | PA-05: hướng dẫn giữ nguồn, lưu nháp/khôi phục và giới hạn trình duyệt | `12432b489bdc773e7ae50e2e098aa67741b83531` | Chỉ docs, không thay runtime; còn kiểm chứng UAT và browser process |
| [#49](https://github.com/tranhaihp26-bit/DocForm/pull/49) | Khắc phục hai kỳ vọng lỗi thời của legacy test, thêm focused CI | `058b72f7819dca525a7a57f4be527c3ac157a188` | [42371345394](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371345394) SUCCESS: clean npm ci, lint, **20/20 legacy test scenarios PASS**, gồm Test 9 & 13 draft/recovery |

**Current main sau 5 merge:** `058b72f7819dca525a7a57f4be527c3ac157a188` (trước các commit nhật ký của phiên).

## Chi tiết xử lý PR #37 không force-push
- Initial: PR branch HEAD `0a01b268b6dc6aa4e5d9a706ea05542377d0793f`, diverged: ahead 7 / behind 14.
- Đã so sánh blob SHA giữa branch và main của toàn bộ 20 tệp có mặt trong diff lịch sử; **mọi tệp ngoài 4 thành phần riêng DF-B03 đều trùng byte với main**. Tránh áp lại package-lock, exporter, workflow vốn đã merge.
- Tạo Git tree trên đúng tree hiện tại của main với 4 blob nguyên vẹn; merge commit có **hai parent** `main` và PR branch, sau đó update branch ref **non-force** với expected SHA. Reconciled commit `0104ca225a44540415004b72f6c242c92c70a4f2`.
- Kiểm lại GitHub compare: behind 0, chỉ còn bốn tệp DF-B03. Scoped CI trên commit này PASS trước khi merge.
- Tương tự PR #43 và #45 được làm merge-commit hòa lịch sử, không force, trước khi chạy CI mới và merge.

## Vì sao PR #49 sửa test mà không sửa profile
- Profile HD05 Wide Header V3 hiện hành đo được: width 9980 = 5540 + 4440 twips; legacy Test 6 chờ 10170 = 5580 + 4590 nên fail trước khi chạy các ca lưu nháp.
- Khi cập nhật Test 6, CI [42371133932](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371133932) dừng ở Test 7 vì chờ 5 rules FAIL nhưng thực tế 4.
- CI có diagnostics [42371233520](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371233520) chứng minh 4 FAIL đúng là: `ND30.PL1.I.GENERAL.MARGIN_LEFT`, `ND30.PL1.I.GENERAL.PAGE_SIZE_A4`, `PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH`, `PROFILE.ND30.HOA_TIEU_MB.SHAPE_LINES`. Hai tỷ lệ đường kẻ chung ND30 trả `NOT_APPLICABLE` do profile Công ty đã cấu hình theo Product First V2.2; không được lấy generic ND30 để cảnh báo profile.
- Test 7 hiện đòi đủ 4 rule FAIL riêng nêu trên và `NOT_APPLICABLE` của hai rule generic. Không hạ ngưỡng để che lỗi. CI cuối [42371345394](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371345394) **PASS đủ 20 ca**. Không sửa app/profile.

## Phát hiện mới về test browser import-session (PA-05 #34)
- Legacy `test/import-session-browser.test.ts` dòng 559–566 đòi vừa upload xong là side-by-side modal tự mở. Nhưng `src/App.tsx` `commitExtraction` hiện cố ý `setShowSideBySideModal(false)` và đưa người dùng về giai đoạn metadata (`setStep1Phase("metadata")`); modal kỹ thuật chỉ mở theo yêu cầu sau đó. Vì vậy **assertion của test không còn khớp UX hiện hành**.
- Test sử dụng Chrome/Edge cài trên Windows theo đường dẫn cố định và nhiều thao tác về UI/AI cũ; không được suy đơn giản đây là bug mất dữ liệu chỉ từ assertion của modal. Cần sửa contract browser test phù hợp wizard 3 bước, vẫn giữ race guards loadDraft stale và A/B source switch.
- Không thay source import, không sửa/loại assertion bảo toàn nguồn hoặc session trong lượt này; browser-test fix chưa hoàn tất.

## Trạng thái cổng nghiệm thu
- **DONE_CODE/CI_VERIFIED_FOCUSED** không đồng nghĩa `VERIFIED_RENDER`, `SUPPORTED_END_TO_END`, `ACCEPTED`.
- DF-B03 auditor chưa nối đầy đủ vào exporter candidate sau stamp. Word/WPS/Office/PDF visual thật, corpus tài liệu có quyền, UAT chưa có.
- PA-05 mới có hướng dẫn và Test 9/13 synthetic PASS; chưa xác minh actual browser-process restart/storage eviction/manual UAT.
- DF-A02/A03 vẫn `BLOCKED_BY_MASTER` đối với các thuộc tính/profile còn chưa phê duyệt.
- **M1/M2: NO-GO**, các issue #8/#16/#27/#35/#34 tiếp tục OPEN theo gate tương ứng.

## Ưu tiên bước tiếp
1. Viết kiểm thử browser đúng luồng explicit-open review (không tự mở modal) và race giữa upload với loadDraft, trên Windows Chrome, không bớt assertion bảo toàn nguồn, version, stale.
2. Đo source/candidate hậu stamp thực theo 4 pilot và role manifest; so Word/WPS/Office và visual.
3. Rà các profile conflicts DF-A02/A03 theo đúng golden/approval, không tự điều chỉnh số từ code/test.
4. Cập nhật Support Matrix và trạng thái issue chỉ khi có evidence end-to-end.
