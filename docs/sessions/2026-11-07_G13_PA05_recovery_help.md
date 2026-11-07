# Session 2026-11-07 — G13 PA-05 #34 — draft recovery and help

- Base: `deffe60c91a00041765530e3192259735c36defe` (main after PR #41). Branch: `codex/g13-pa05-20261107`; worktree: `C:\Users\dtron\.codex\worktrees\docform-g13\DocForm`.
- Issue #34 is OPEN. No UI/source code was changed. No GitHub comment or PR was created; remote writes are blocked by parent-level auto-review and explicit payload approval is pending.
- User help: [PA-05 recovery guide](../product/PA05_RECOVERY_HELP.md). It explains the three common save states, how to resume, how to retrieve/re-upload the original, and what REVIEW/BLOCKED/NOT_EVALUATED mean. It states that the browser copy is local and not cloud backup. AI/PDF are not required to save or download an enabled Word candidate.
- Verified current behavior in `src/utils/draftStore.ts`, `src/utils/localFileImport.ts`, and the current UI:
  - Draft saves resolve only after IndexedDB transaction completion; a failed/aborted write rejects. The UI shows `Không lưu được thay đổi` and tells the user to keep the page open and retry.
  - The original file bytes are stored separately by hash. If IndexedDB cannot store them, the source store returns `persisted:false, storage:memory`; the UI labels this as session-only and warns that reload loses it.
  - Step 3 downloads original bytes only when the matching source blob remains available. It does not reconstruct the original from edited text.
  - The app uses one active draft ID in the current UI; `documentSessionStore` is not treated as a multi-document user-facing recovery feature.
- Verification:
  - `npm ci` — PASS (308 packages added, 309 audited, 0 vulnerabilities).
  - `npx tsx --test test/storage-transaction-lifecycle.test.ts test/source-retention.test.ts` — PASS, 6/6 (transaction abort, save rejection, source hash/readback, source bytes unaffected by draft edits).
  - Synthetic in-process `QuotaExceededError` probe — PASS; `saveDraft` rejected and did not report persistence. This does not simulate actual browser quota exhaustion or storage eviction.
  - `npx tsx test/candidate-preview-print-browser.test.ts` — PASS, 1/1 in headless Chromium with synthetic bytes. Candidate SHA matched preview/download SHA; original SHA matched original download SHA; after an edit the old candidate became stale and its download was disabled. PDF response in this test is synthetic; no WPS/Word render was run. Evidence output was redirected to `C:\Users\dtron\AppData\Local\Temp\docform-g13-evidence-20261107`, outside the repository.
  - `npx tsx test/import-session-browser.test.ts` — FAIL, exit 1 on two runs with the same assertion at `test/import-session-browser.test.ts:566`: “Side-by-side modal should open for Synthetic_Alpha.docx.” It fails after the synthetic upload while the test deliberately holds the initial `loadDraft()` response; it occurs before releasing that response and before the recovery/storage assertions. Classified as a source-upload/session-race UI test failure, adjacent to PA-05 but not evidence about IndexedDB persistence. No App/UI changes made.
  - `npx tsx test/office-worker-redesign.test.ts` — FAIL, exit 1 at unrelated Test 6 header assertion (`9980 !== 10170`, line 292); later Test 9 storage cases were not reached.
- Reload evidence: the candidate browser test seeds synthetic source/draft in real Chromium IndexedDB, calls `c.reload()`, resumes the draft, and later downloads the original bytes with the same SHA. This is an automated same-profile page reload, not a manual user test or browser-process restart.
- Not evaluated: actual quota/storage eviction, browser profile/data clearing, WPS/Word, and UAT. The synthetic tests do not prove recovery across browser profiles or devices.
- G00 delta: keep #34 open until manual close/reopen and user recovery expectations are observed in the release environment. Consider linking the guide from the user-facing help surface after UI ownership is scheduled; no `App.tsx` or `WorkspaceExport.tsx` edit was made.

## Publication update — 2026-11-07

- Publication was authorized through GitHub Primary. Branch `codex/g13-pa05-20261107` now points to commit `3e0e0a8e9f6b4cbe6f3dea0dbcb33907a9879092`; its tree `8293a9c67ebbd76a35b55fc38e32943d9d483a20` matches the reviewed local tree.
- [Draft PR #47](https://github.com/tranhaihp26-bit/DocForm/pull/47) is open and unmerged; issue #34 remains open. Actions had no workflow run for this docs-only head when checked.
- Previously recorded storage/preview checks and the two test failures above are local evidence, not rerun for publication. Word/WPS, browser-process restart, and UAT remain unverified.
