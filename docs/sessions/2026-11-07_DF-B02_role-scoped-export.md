# Session 2026-11-07 — DF-B02 — Role-scoped DOCX formatting

- **Kết quả người dùng / roadmap:** DOCX của profile ND30/HD05 giữ thông số body-normal đã duyệt; tiêu đề dùng fallback theo regime khi chưa có thuộc tính heading được duyệt. Phạm vi nhỏ của DF-B02; không chứng minh M1/M2 hoặc hỗ trợ end-to-end.
- **Base HEAD:** `5f8b00fab7f3fe87f1165aa3ca645c370c4cef5c`.
- **Branch:** `codex/g02-df-b02-20261107`.
- **Issue/PR:** DF-B02 #7 còn OPEN; DF-B01 #15 còn OPEN và không thay đổi trong phiên. PR #3 đã merge, chỉ nối `body.fontSizePt` vào composer. PR #39: https://github.com/tranhaihp26-bit/DocForm/pull/39 (OPEN, unmerged). Local commit ban đầu: c2ac0c295adac8ddffe1f009ff16112be290091e; remote code head khi mở PR: 546ac135607dd1c3781032118a22b9ed80f51a6f; tree SHA hai phía khớp.
- **Bằng chứng kế thừa:** `docs/profile/PROFILE_SOURCE_MATRIX.md` đánh dấu `body.normal.fontFace/sizePt`, line rule, first-line indent và body table TNR/13 là thuộc tính đã duyệt; headings/list/appendix/caption/field/pageNumber còn PARTIAL. Không sửa profile/master hoặc giá trị đang conflict.

## Thay đổi

- `src/utils/docxExport.ts`: profile body chỉ ghi đè cỡ chữ body; không truyền `body.fontSizePt` sang H1/H2/H3. Các tiêu đề H1/H2/H3 giữ cỡ chữ, dãn dòng và khoảng cách sau theo fallback hiện có của regime. Body-normal tiếp tục dùng thuộc tính profile đã duyệt.
- `src/canonical/ruleEngine.ts`: kiểm tra line spacing ND30 của profile chỉ đo các đoạn được phân loại là thân bài; tiêu đề nhận diện riêng không làm body-normal audit thất bại.
- `test/df-b02-profile-export-ooxml.test.ts`: fixture tổng hợp ND30/HD05 và generic xuất qua `generateND30DocxBuffer` (gồm hậu xử lý/stamp), kiểm tra `w:rFonts`, `w:sz`, `w:spacing`, `w:firstLine`, fallback heading và kết quả audit thật từ OOXML đã xuất.
- Bảng body profile (TNR/13) được ma trận đánh dấu ACTIVE/locked và exporter hiện dùng; không sửa trong lát cắt này. Không thay resolver đã merge, `semanticRuleFormatting`, schema hoặc dữ liệu profile.

## Kiểm chứng

- `npm ci --legacy-peer-deps` — **PASS**; cài 310 package, audit báo 0 vulnerability. Đây là workaround peer mismatch Vite/esbuild đã ghi nhận, **không phải clean install**.
- `npm run lint` — **PASS**, `tsc --noEmit`.
- `npx tsx --test test/df-b02-profile-export-ooxml.test.ts test/company-body-profile.test.ts test/effective-profile-attribute-v22.test.ts test/profile-first-v22.test.ts test/semantic-rule-formatting.test.ts test/body-ooxml-audit.test.ts` — **PASS**, 30 test / 0 fail / 0 skipped trên checkout này.
- Test mới tái hiện lỗi trước sửa: profile ND30 áp 14pt body sang H2/H3 thay fallback 13pt; sau khi xuất/stamp, các rule cỡ chữ, first-line indent và line spacing body đều PASS cho cả hai regime.
- CI GitHub trên code head `546ac135607dd1c3781032118a22b9ed80f51a6f`: **PASS** — “DocForm draft signature and table header” run 2 (42350712081) và “DocForm V2.2 focused profile checks” run 10 (42350712089). `git diff --cached --check` — **PASS**, không có whitespace error trong staged diff.

## Trạng thái và giới hạn

- **Trạng thái:** `DONE_CODE + VERIFIED_OOXML_FOCUSED` cho thay đổi role-scoped; PR #39 đang OPEN, DF-B02 tổng thể vẫn **PARTIAL/OPEN**. Chưa đủ căn cứ đóng #7.
- Word/WPS render: `NOT_VERIFIED_RENDER`. UAT: `NOT_VERIFIED`. Chưa chạy toàn bộ canonical suite.
- Audit hiện chỉ loại trừ heading khi bộ nhận diện cấu trúc hiện có nhận diện được (ví dụ heading đánh số La Mã/Ả Rập). Không mở rộng claim cho tiêu đề không đánh số hoặc mọi cấu trúc Word.

## Delta đề xuất cho nhóm điều phối sau PR/merge

- **Project Memory:** thêm link tới log này và PR/head SHA/CI thực; ghi DF-B02 là lát cắt code + OOXML focused, giữ `PARTIAL/OPEN`; không đổi DF-B01 hoặc gắn nhãn Office/UAT.
- **Master Roadmap:** cập nhật tiến độ B02 đúng bằng chứng thực; không chuyển sang M1/ACCEPTED, không suy ra QA cho table/header/page hoặc heading roles còn thiếu nguồn.
- **Product Support Matrix:** không thêm `SUPPORTED_END_TO_END`; nếu ghi chú B02 thì nêu đúng rằng body-normal có synthetic OOXML evidence, heading roles vẫn fallback/partial, Word/WPS và người dùng chưa nghiệm thu.
- **Việc tiếp theo:** G00 cập nhật các tài liệu điều hành dùng chung sau khi xem PR/CI; lane này không chỉnh trực tiếp các file dùng chung.
