# Session 2026-11-07 — Align stale legacy HD05 geometry test

## Outcome

Restore a useful regression signal for the already-running `office-worker-redesign.test.ts` so its later draft/recovery checks are not blocked by an obsolete header-width expectation. No production profile, header geometry, or application code is changed.

## Source / decision

- Main at task start: `eed8f02e42f7f82a2fa711c6f7d0a96f12cf7b49`, after technical integrations #37, #43, #45.
- Source of truth for this limited assertion: `src/canonical/hd05/companyHeaderHD05.ts` documents **Wide Header V3**, measured from `DEMO_HD05_DangUy_CongTy_WideHeader_2Dong(3).docx`: **9980 twips = 5540 + 4440**, indent -593. `docs/profile/PROFILE_SOURCE_MATRIX.md` independently inventories the current HD05 profile table width/grid with the same numbers, and warns that this does **not** by itself mean full profile/user acceptance.
- Legacy test was hard-coded to obsolete **10170 = 5580 + 4590** and stopped before exercising its recovery cases (per PR #47).
- Only change the three stale assertion literals; preserve explicit exact numeric tests and add `left + right === width` for invariant. No arbitrary tolerance or silent test suppression.

## Changed scope

- `test/office-worker-redesign.test.ts` — correct stale test expectations to current measured V3 configuration.
- `.github/workflows/legacy-hd05-geometry-ci.yml` — run only this legacy test + TypeScript in GitHub Actions.
- This log — evidence and the follow-up limits.

## Validation and open risks

- Planned GitHub Actions result and commit must be recorded after the PR run; no PASS is presumed from a source edit.
- This is a **test-only fix**. Real Word/WPS render, Office fidelity and UAT remain `NOT_VERIFIED`.
- The unrelated `import-session-browser.test.ts` upload/modal race under deliberately pending `loadDraft` remains open: this test requires a Chromium executable and was not addressed by the geometry-only change.
- PA-05 issue #34 remains open until actual recovery and browser-session behavior meet its acceptance criteria.

## CI result / policy correction

- PR: [#49](https://github.com/tranhaihp26-bit/DocForm/pull/49); validation head `63c2c0391b1d1cc695bbedabbb4e5e6aabd9bee3`.
- Initial CI [42371133932](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371133932) reproduced next stale test after geometry was fixed: Test 6 PASS; Test 7 old `FAIL >= 5` expectation saw 4.
- Diagnostic CI [42371233520](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371233520) identified exact four FAIL rules: `ND30.PL1.I.GENERAL.MARGIN_LEFT`, `ND30.PL1.I.GENERAL.PAGE_SIZE_A4`, `PROFILE.ND30.HOA_TIEU_MB.TABLE_WIDTH`, `PROFILE.ND30.HOA_TIEU_MB.SHAPE_LINES`. Two generic ND30 line-ratio rules are deliberately `NOT_APPLICABLE` when the company profile controls the lines. This is correct Product First V2.2 behavior, not a weakened compliance gate.
- Updated Test 7 to demand those four exact negative failures and `NOT_APPLICABLE` for both generic line ratios; left other assertions intact.
- [GitHub Actions 42371345394](https://github.com/tranhaihp26-bit/DocForm/actions/runs/42371345394) **SUCCESS** on final head: `npm ci`, `npm run lint` and full `npx tsx test/office-worker-redesign.test.ts` through **TEST 20 PASS**. Test 9 and Test 13 storage/recovery were reached and passed.
- No source/app behavior changed; only test expectations and CI workflow changed. The separate Chromium upload-modal test remains unverified/failing from its earlier Windows-local run, and still needs follow-up. No Word/WPS/manual UAT is claimed.
