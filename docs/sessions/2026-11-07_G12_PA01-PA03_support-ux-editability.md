# G12 — PA-01/PA-02/PA-03 scope, UX baseline, Editor roles

- Date: 2026-11-07
- Base: `deffe60c91a00041765530e3192259735c36defe` (`main`, after PR #39–#41)
- Deliverable commit: `0ffdb5eccbd977ef1c12983d4d3e594b83a4985f`
- Worktree/branch: `C:\Users\dtron\.codex\worktrees\docform-g12\DocForm`, `codex/g12-pa01-pa03-20261107`
- Issues: PA-01/#4, PA-02/#5, PA-03/#6; all were observed open with no comments at preflight.
- Result: local evidence supplement and baseline template created; no UI, exporter, or shared product matrix changes.

## Sources reviewed

- `docs/PROJECT_MEMORY.md`, Product End State v1.0, Master Roadmap V2.0, Issue Execution Board, `docs/PROJECT_SESSION_PROTOCOL.md`, repository instructions, `docs/CODEBASE_MAP.md`, existing UX-01–UX-13 and U-01–U-12 references.
- `docs/product/PRODUCT_SUPPORT_MATRIX.md` for S-01–S-04 baseline statuses and A02/A03 dependencies.
- `src/utils/workspaceCapabilities.ts`, `src/components/WorkspaceEditor.tsx`, `src/components/WorkspaceExport.tsx`, `src/utils/exportCandidate.ts`, and relevant workspace/export tests for code path only.
- `package.json` declares version `1.0.0`; this does not establish which installed/distributed build an end user would run.

## Deliverables

- `docs/product/PA01_PA03_SCOPE_EVIDENCE_SUPPLEMENT.md` — action-level status for S-01–S-04, app/Office version evidence, conditional Editor capability notes, and handoffs. Does not duplicate or modify the shared Support Matrix.
- `docs/product/PA02_REAL_USER_BASELINE_TEMPLATE.md` — reusable real-user task protocol and blank case record using existing U-01–U-12 scenarios. No participant result or invented measurement is included.

## Evidence and status

- G12 did not run interactive UI, create/import/edit/export a DOCX, open it in Word/WPS/LibreOffice, or conduct UAT. Those outcomes are `NOT_TESTED` / `NOT_VERIFIED_RENDER`.
- No Office/renderer version has been selected or confirmed. App package version is declared as `1.0.0`; actual user-facing build is `NOT_TESTED`.
- Cross-lane technical evidence relayed to G12 on the same base `deffe60`: `npx tsx test/candidate-preview-print-browser.test.ts` passed 1/1 in headless Chromium with synthetic data; `npx tsx test/import-session-browser.test.ts` failed twice at the modal expectation (line 566) while `loadDraft()` was pending, before storage/recovery assertions. These are not G12-run, user, Office, or UAT evidence; the upload/session race is a G10/G00 follow-up.
- No tests were run by G12 because the changes are documentation-only.
- No PR/CI URL exists. GitHub comments, issue changes, PRs, and publication were not made while approval was pending. Session evidence is local only: `NOT_PERSISTED` to GitHub.

## Validation

- Local Markdown link-target check: `PASS`; all local targets exist in this checkout.
- `git diff --cached --check`: `PASS`; no whitespace errors.
- `PRODUCT_SUPPORT_MATRIX.md`, `src/App.tsx`, and exporters were not modified.

## G00 delta and next handoff

- Keep S-01–S-04 below `SUPPORTED_END_TO_END`; retain existing `BLOCKED_BY_MASTER` and `NOT_VERIFIED` evidence until approved A02/A03 values, versioned Office render, and real-user cases exist.
- Add the supplemental matrix and real-user template to the G00 review set; merge changes to shared memory, roadmap, and Support Matrix only under G00 ownership and after integration review.
- G10: investigate the synthetic upload/modal race during pending draft initialization. Reproduce and report actual user impact before changing the wizard.
- G07: when reporting Editor scope, separate code-level conditional input from observed edit-save-export behavior; tables may expose cell inputs while structure remains locked.
- G01/G02: do not treat Editor fields as approval of profile/master values or evidence of correct output.
- Next evidence gate: select the actual app/browser and Office versions; use approved synthetic corpus and a real target user for U-01–U-12; save case-level expected/actual, measured-only time/help, DOCX hash, Office/version, and outcome.

**Persistence:** local worktree only; GitHub persistence awaits G00/approval. No M1/M2, UAT, Word/WPS, or end-to-end acceptance claim is made.

## Publication update — 2026-11-07

- Publication was authorized through GitHub Primary. Branch `codex/g12-pa01-pa03-20261107` now points to commit `08888786f4b10414a0e635daaf1c6014a02b7ad2`; its tree `4967c148b27009a2dcb60d68d13adabf6374a791` matches the reviewed local tree.
- [Draft PR #46](https://github.com/tranhaihp26-bit/DocForm/pull/46) is open and unmerged. It references issues #4, #5, and #6; all remain open. No Actions workflow run was created for this docs-only head.
- This publication step did not rerun tests or perform interactive UI, Office rendering, or UAT. PA-01–PA-03 remain NOT_VERIFIED for end-to-end user acceptance.
