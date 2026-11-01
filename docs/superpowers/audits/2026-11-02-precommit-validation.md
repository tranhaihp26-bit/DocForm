# Precommit validation — 2026-11-02

Base: `f17de3cae009d5a9d2969cd879df67b4166bef81`. The user authorized committing and pushing the reviewed local changes. This checkpoint is not a production release or a claim that all Task 0–9 acceptance requirements are complete.

## Included implementation

- Block ordinary candidate download/print when integrity rejects; preserve source-file download.
- Propagate unsafe ancestry into full-text textbox extraction; bind completed AI evidence to the selected provider and invalidate it on switching.
- Process overflow split children sequentially within the bounded root task.
- Separate Appendix metadata blocks from content, reconstruct current metadata/content from reviewed blocks, and preserve edits or cleared metadata with unchanged block IDs.
- Improve recipient continuations, hard breaks and multi-signer table extraction. Signing-like tables inside Appendix remain there with `needs_review` when main-document ownership is ambiguous; do not infer a main signer from labels/row count alone.
- Apply the selected company body profile to both regimes: 14pt, exactly 19pt, after 6pt, with independent table formatting.
- Narrow inline-control helper types, retain source-inventory/hash validation, and update inherited tests to current contracts.

## Corrections found during independent review

The incoming Antigravity handoff overstates completion in some areas. Before this checkpoint, Codex fixed newly introduced Appendix defects: edited metadata was omitted in favor of stale values, legacy content beginning with “Phụ lục” could be mistaken for metadata, and a genuine Appendix form's signing table could be promoted into the main signer fields. Permanent synthetic regressions cover these cases.

The import test's local ignored pilot dependency is replaced by `test/fixtures/synthetic-ttrinh.docx`. The fixture contains generated body paragraphs and a generic signer label, with no private reference document included. Private source ZIPs, rendered evidence, machine-specific agent hooks and generated Graphify output are excluded from publication.

## Checks run for this checkpoint

| Check | Actual result |
|---|---|
| `npm run lint` | PASS, exit 0 after final source/test correction |
| `npm run build` | PASS, exit 0 after final source/test correction |
| `test/docx-inline-controls.test.ts` | 3/3 PASS |
| `test/final-section-roundtrip.test.ts` | 12/12 PASS after precommit fixes |
| `test/company-body-profile.test.ts` | 6/6 PASS |
| `test/full-text-extraction-manifest.test.ts` | 19/19 PASS |
| `test/full-text-semantic-service.test.ts` | 11/11 PASS, limited cancellation coverage below |
| `test/full-text-review-provider-binding.test.ts` | 1/1 PASS, simulated state logic rather than App UI integration |
| `test/remaining-fidelity-gaps.test.ts` | 12/12 PASS |
| `test/export-candidate-contract.test.ts` | 5/5 PASS |
| `test/workspace-appendix-state.test.ts` | 8/8 PASS |
| `test/workspace-template-export.test.ts` | 5/5 PASS |
| `test/import-segments.test.ts` | 15/15 PASS using the portable synthetic fixture |
| `test/repro-plan-signature-bug.test.ts` | 6/6 PASS |
| `test/semantic-candidate-gate.test.ts` | 1/1 PASS |
| `test/workspace-candidate.test.ts` | 13 PASS / 1 FAIL: `profile_header_not_stamped` in the generic/company composer matrix |
| `git diff --check` / staged diff check | PASS |

Commands used `npx tsx` or `node --import tsx` for the listed test files. Only focused offline tests/build were run. No real AI/provider calls, private reference-document tests, browser acceptance, physical interaction or Word-native acceptance were run in this checkpoint. Prior handoff claims for browser/Word are not independently reconfirmed here. COM activation/version alone must not be promoted into Microsoft Word product verification.

## Remaining work

1. `callWithTimeout` in `src/server/fullTextSemanticService.ts` still races provider and timeout, not parent abort. The report's `cancelPromise` claim is not reflected in source; cancellation of a noncooperating provider remains unresolved. The new cancellation test does not prove that case.
2. Several fallback routes in `server.ts` still log truncated arbitrary SDK `error.message`; only the shared helper was sanitized. No actual leakage is established, but blanket safe-logging acceptance is unsupported.
3. Provider-binding unit tests simulate the matcher/reset; add browser/App/persistence coverage for A→B→A and stale completion. Metadata disclosure still needs comparison with the complete outgoing payload.
4. The existing workspace-candidate composer failure remains visible; do not weaken header stamping to force PASS. This run confirms the failure, but does not independently prove its behavior on an isolated baseline checkout.
5. Post-Appendix signer ownership can be ambiguous; preserve and require review. Full source-block ownership fidelity, native pagination and manual UX remain separate acceptance gates.

No commit in this checkpoint changes header-reference documents or header geometry. The implementation remains reviewable in Git history; subsequent fixes should use new commits rather than rewriting this checkpoint.
