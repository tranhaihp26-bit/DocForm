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
