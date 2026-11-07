# Session 07/11/2026 — DF-A04/DF-B01 — Effective Property Resolver & Project Memory

**Kết quả người dùng:** DOCX theo profile Công ty đã xác nhận; chỉ field profile còn thiếu mới fallback ND30/HD05. Mọi đợt sửa tiếp theo phải đọc mục tiêu/roadmap trước và **lưu bộ nhớ dự án trên GitHub sau khi xong**.

## Trước phiên: mục tiêu, dữ kiện đã kế thừa và ranh giới

- **Base HEAD:** `ae303d89c9647fbd72893b4a05ba756cfe245dd6` — Master Roadmap đã có, DF-C01/C03 đã merge (CI 15/15), DF-A01 `PARTIAL_SOURCE_MAPPED`; DF-B01 `OPEN`.
- **Nguồn yêu cầu:** Master Roadmap 07/11, chính sách V2.2, `docs/profile/PROFILE_SOURCE_MATRIX.md`, hướng dẫn `AGENTS.md`.
- **Mục tiêu thực hiện:** DF-A04/B01 (hợp đồng giá trị profile theo property với provenance + kiểm thử các giá trị đặc biệt) và bắt buộc ghi nhật ký phiên.
- **Cố ý không sửa:** hai giá trị Header ND30 xung đột; tên tổ chức Đảng đang chờ master; bảng phần cuối và tối ưu V6.9; không viết lại exporter; không đổi các font/body/table đã duyệt.

## Mã nguồn và tài liệu đã chỉnh

| Nhóm | Đường dẫn | Kết quả |
|---|---|---|
| Resolver mới | `src/canonical/effectiveProfileAttribute.ts` | `SET / UNSPECIFIED / INVALID / PROFILE_CONFLICT`, `source/sourceRef/profileId/path`, chỉ field thiếu mới fallback; `0,false,""` giữ nguyên, `null` fail-closed, font pt phải nguyên dương |
| Consumer thật | `src/utils/documentComposer.ts` | Lấy `body.fontSizePt` từ resolver; Công ty 14pt, generic ND30 13pt, generic HD05 14pt được giữ; profile không tự suy từ tên |
| Tests | `test/effective-profile-attribute-v22.test.ts` | 7 ca DF-A04/B01: falsy, fallback đúng regime, draft/unconfirmed, priority/conflict, invalid/null/font decimal, thông số profile thật và composer |
| CI | `.github/workflows/df-b01-project-memory-ci.yml` | Node 22, typecheck + focused tests; chỉ kích hoạt khi code/test/workflow đổi, không vì tài liệu thuần |
| Bộ nhớ dự án | `docs/PROJECT_MEMORY.md`, `docs/PROJECT_SESSION_PROTOCOL.md`, `docs/sessions/` | Chỉ mục, hợp đồng trước/sau phiên, nhật ký append-only |
| Hướng dẫn coding | `AGENTS.md`, `docs/AGENTS.md`, `src/canonical/AGENTS.md`, `src/shared/AGENTS.md`, `src/utils/AGENTS.md`, `test/AGENTS.md`, `README.md`, `docs/CODEBASE_MAP.md`, Master Roadmap, `.github/pull_request_template.md` | Cổng bắt buộc: trước thực thi kiểm mục tiêu cuối & ID roadmap; sau thực thi commit log/CI/thay đổi/blocker; không mở rộng/làm lại không cần thiết |

## Bằng chứng kiểm thử trên PR

- **PR:** [#3](https://github.com/tranhaihp26-bit/DocForm/pull/3) từ `codex/df-b01-effective-attribute-project-memory-20261107` vào `main`.
- [CI DF-B01 run 42336222630](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336222630): kết thúc **success**, `npm run lint` PASS, **26/26 tests PASS**, 0 fail, 0 skip; tại SHA `e9baf86e35b8d9560a2153ac1c805238074417a7`.
- [CI V2.2 run 42336222614](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42336222614): kết thúc **success**, `npm run lint` PASS, **31/31 tests PASS**, 0 fail, 0 skip; cùng SHA.
- Workflow install bằng `npm ci --legacy-peer-deps` do DF-E04 (Vite/esbuild peer conflict) vẫn `OPEN`; không khẳng định `npm ci` chuẩn đã được sửa.
- **Không chạy** Word/WPS, PDF visual, kiểm toàn bộ tài liệu/regime: giữ `NOT_VERIFIED_RENDER`.
- **Lưu ý:** Hai bộ test có thể trùng các ca hồi quy; không cộng 26+31 thành số lượng test độc nhất.

## Trạng thái và kết luận theo gói

- **DF-A04:** `DONE_CODE + CI_VERIFIED_FOCUSED` với các ca trạng thái/giá trị đã liệt kê, chưa có kết luận pháp lý.
- **DF-B01:** `PARTIAL_IMPLEMENTED + CI_VERIFIED_FOCUSED`: resolver hoạt động và đã nối **một** consumer thật (`body.fontSizePt`); chưa có registry được nối toàn bộ các vai trò profile. Phần nối tiếp thuộc DF-B02.
- **Project Memory / hướng dẫn:** `DONE_CODE`, còn cổng đóng phiên phải xác nhận log đã được merge và commit SHA thật.
- **Master conflicts:** A02/A03 `BLOCKED_BY_MASTER`, không làm suy đoán; A01 `PARTIAL_SOURCE_MAPPED`.

## Bàn giao cho phiên sau

1. Theo Master Roadmap, tiếp tục **DF-B02** cho đúng các thuộc tính có nguồn rõ (body/font/line/indent/table), đo OOXML sau stamp; không mở rộng vô điều kiện.
2. DF-B03 kiểm font integer theo role sau stamp; DF-E01 luồng AI confirmed-profile; DF-E04 peer dependency làm riêng nếu cần fresh npm ci.
3. Không nghiệm thu toàn diện khi chưa có WPS/Word real render và master giải quyết A02/A03.

## Hậu kiểm khi merge (bổ sung sau PR)

**PENDING_MERGE** — điền merge commit SHA, liên kết CI tại HEAD cuối và trạng thái `docs/PROJECT_MEMORY.md` sau khi merge. Không coi log provisional này là release acceptance.
