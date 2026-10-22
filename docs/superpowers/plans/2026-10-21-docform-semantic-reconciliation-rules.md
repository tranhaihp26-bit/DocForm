# DocForm Body and Appendix Semantic Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify Body and each Appendix into source-linked semantic units, reconcile independent local/AI findings, require defensible approval and apply only rules appropriate to confirmed units.

**Architecture:** Add a versioned semantic overlay on immutable source blocks and current editable nodes. Run deterministic local classification first; ingest AI observations only through the validated full-document evidence contract when available. A reconciler maps both to common source anchors, produces explicit decisions, and passes confirmed units to a rule selector. Existing partition, transaction and candidate safety mechanisms remain the authority for source ownership and export.

**Tech Stack:** TypeScript, existing DocForm `SourceBlock`/`TableModel`, `WorkspaceSnapshot`, canonical rule engine, React review UI.

**Spec:** `docs/research/2026-10-21-docform-full-docx-semantic-audit.md`. Companion capability plan: `docs/superpowers/plans/2026-10-21-docform-full-docx-visual-ai.md`.

## Global Constraints

- Do not change original block IDs, text, OOXML, table IDs, cell IDs or physical order to make classifications agree.
- Semantic annotation is separate from the eight `SourceRegion` values and separate for each Appendix.
- Source A evidence must never approve Source B, a changed regime, or an edited/split/moved node without a new decision.
- Unsupported rich content stays readonly/fail-closed; downloading the original remains possible.
- An absent/unavailable AI yields local labels marked for human review, never fabricated agreement.
- Keep NĐ30 and HD05 rule applicability independent; profile aesthetics are not legal requirements.
- Freeze a fresh repository manifest before work and do not overwrite the existing dirty checkout's unrelated edits.

## Review Focus

1. A heading-looking sentence mentioning `Điều` or `Căn cứ` in prose must not become a legal article/basis (Task 2).
2. A merged-cell or nested table must not be flattened into one generic paragraph or silently marked approved (Tasks 2 and 4).
3. Two matching labels with different appendix parent or cell anchor must remain disputed (Task 4).
4. Moving or editing one semantic unit must invalidate only affected dependent approvals/rules, while a source switch invalidates all of them (Task 5).
5. Rule results for unknown, unsupported and unconfirmed units must be `NEEDS_REVIEW`/`NOT_APPLICABLE`, never `PASS` (Task 6).

---

### Task 1: Semantic overlay schema, lineage and draft migration

**Files:** Create `src/shared/semanticDocument.ts`, `src/utils/semanticState.ts`, `test/semantic-state.test.ts`; modify `src/utils/workspaceState.ts`, `src/utils/documentSessionTypes.ts` and existing migration code only where needed.

**Interfaces:** `SemanticUnit` has stable ID, scope `body|appendix`, optional `appendixId` and `parentUnitId`, canonical label, source block/cell IDs, text span or OOXML path, exact quote/hash, optional page reference and evidence status. `SemanticRevision` includes source SHA/generation, partition fingerprint, working revision and decision fingerprint. `createSemanticState(snapshot): SemanticState` starts every new label as unapproved; `SemanticChange` is a discriminated union for source replacement, partition approval change, source-block edit, and semantic-decision change; `invalidateSemanticState(state, change): SemanticState` returns a new value without mutating source.

- [ ] Define separate type sets for shared Body, biên bản-specific Body and Appendix labels. Preserve `unknown`, `mixed` and `unsupported`; do not force one label on a mixed physical block.
- [ ] Make logical child units reference stable physical source/cell anchors. Keep one-to-many lineage for split/merge and edition of Body/Appendix nodes. Add a versioned migration that loads existing drafts with no semantic approval instead of inventing approvals.
- [ ] Plan/run `test/semantic-state.test.ts`: one physical paragraph split into two meanings, table cell identity, two appendices with same heading, legacy draft, source switch and node edit. Expected: source bytes and block order remain unchanged.

### Task 2: Deterministic local semantic observations

**Files:** Create `src/server/bodySemanticClassifier.ts`, `src/server/appendixSemanticClassifier.ts`, `src/utils/localSemanticObservations.ts`, `test/local-semantic-classifier.test.ts`; modify `src/server/structuralSegmenter.ts` only to replace misleading automatic Appendix `confirmed` status with an honest review status when needed.

**Interfaces:** `classifyLocalSemantics(blocks, structuredImport, regime, documentType): ParserObservation[]`; each observation carries source anchors, exact quote, scope/parent and rule-based rationale. It may return `unknown` but never alter source.

- [ ] Reuse block extraction, `bodyOoxmlEvidence`, `tableRoleClassifier` and Appendix source IDs. Keep boundary detection (Body versus Appendix) separate from semantic sublabeling; a mention of “phụ lục” in prose is insufficient to move following blocks.
- [ ] Classify shared Body roles and biên bản context; classify each Appendix independently, including number/title, reference line, hierarchy, explanation, lists, table header/data, notes and unsupported media. Preserve table geometry and every physical cell coordinate.
- [ ] Plan/run `test/local-semantic-classifier.test.ts` with synthetic NĐ30/HD05, biên bản, 0/1/multiple appendices, ambiguous section markers and nested/merged tables. Expected: low-evidence units are `unknown`/`needs_review`, never silently accepted.

### Task 3: Validate and align independent AI observations

**Files:** Create `src/shared/semanticAiProtocol.ts`, `src/utils/semanticAlignment.ts`, `test/semantic-ai-alignment.test.ts`.

**Interfaces:** `validateAiSemanticResult(raw, FullDocumentEvidenceBundle): AiObservation[]`; `alignSemanticObservations(ai, sourceManifest, visualManifest): AlignedAiObservation[]`. AI first pass must not receive local labels. The validator checks source SHA, page coverage, exact quote, source block/cell/range and known taxonomy.

- [ ] Accept only a `FullDocumentEvidenceBundle` from the companion plan. When it is `UNAVAILABLE`, return no AI agreement and leave user review available.
- [ ] Map AI quote/page references back to source blocks/cells without guessing when repeated text is ambiguous. Record `unaligned`, `ambiguous` or `aligned` explicitly; require page/image evidence only for visual claims.
- [ ] Plan/run `test/semantic-ai-alignment.test.ts`: repeated identical strings, shifted page, wrong source SHA, invented cell, missing page, appendix parent mismatch and valid match. Expected: only exact anchored matches become `aligned`.

### Task 4: Reconciliation and decision policy

**Files:** Create `src/utils/semanticReconciliation.ts`, `test/semantic-reconciliation.test.ts`.

**Interfaces:** `reconcileSemantics(local: ParserObservation[], ai: AlignedAiObservation[], context): ReconciliationDecision[]`. `DecisionPolicy` returns `auto_confirmed|needs_review|unsupported`; high-impact scope/boundary/identity decisions never auto-confirm solely because both readers agree.

- [ ] Compare canonical label, scope, appendix ID, parent, physical anchor, exact quote and structural/visual evidence. Track AI and parser provenance separately. No AI result is a missing vote, not an agreement.
- [ ] Auto-confirm only low-risk items with exact deterministic corroboration. Require user confirmation for regime/document type, signer/recipient, appendix start/end, mixed tables, inferred vote/assignment, unsupported content and any weak visual alignment.
- [ ] Plan/run `test/semantic-reconciliation.test.ts` for agreement with valid evidence, shared mistake, repeated quote, label conflict, parent conflict, mixed table and absent AI. Expected: no high-impact item is auto-confirmed.

### Task 5: User decisions, revisions and invalidation

**Files:** Modify `src/utils/workspaceState.ts`, `src/utils/workspaceTransactions.ts`, `src/utils/documentSessionTypes.ts`; create `test/semantic-approval-transactions.test.ts`.

**Interfaces:** Add typed transactions `approveSemanticUnit`, `rejectSemanticUnit` and `reopenSemanticUnit` with expected revision and actor `user|policy`. Approval records source SHA, partition fingerprint, semantic evidence fingerprint and target unit ID. Any relevant edit invalidates a dependent decision.

- [ ] Preserve undo/version behavior, pending partition checks and readonly source. Never mutate `SourceBlock` to store semantic labels. Persist review decisions without persisting raw AI prompts, DOCX bytes or page images in the draft.
- [ ] Invalidate appropriately after source replacement, regime switch, repartition, parent/appendix move, table edit and node split/merge; reject late AI results from old generations.
- [ ] Plan/run `test/semantic-approval-transactions.test.ts` for optimistic revision, undo, reload/migration, two appendices with same text, targeted edit and source switch. Expected: stale approval cannot open a rule or candidate gate.

### Task 6: Semantic rule selection and rule evidence

**Files:** Create `src/canonical/semanticRuleSelector.ts`, `test/semantic-rule-selector.test.ts`; modify `src/canonical/bodyRuleApplicability.ts` and `src/canonical/ruleEngine.ts` to consume confirmed unit IDs, not regex-only Body guesses.

**Interfaces:** `selectRulesForUnit(unit, regime, documentType, profile, approvedState): RuleSelection[]` returns rule ID, target and applicability with reason. Only `auto_confirmed` or `user_confirmed` units can yield an executable formatting change; legal, guidance and aesthetic categories remain separate.

- [ ] Map each approved subtype to an explicit allowlist of existing canonical rules; add a new rule only with a verified source and applicability conditions. Body paragraph rules exclude headings and tables; Appendix table rules are scoped to the correct Appendix and do not inherit Body paragraph indentation.
- [ ] Produce `NEEDS_REVIEW` for unconfirmed/ambiguous targets and `NOT_APPLICABLE` for mismatched regime or subtype. Never turn missing OOXML or visual measurements into `PASS`.
- [ ] Plan/run `test/semantic-rule-selector.test.ts` for biên bản headings, meeting narrative, Body tables, Appendix table headers, profile mismatch, two legal regimes and unknown unit. Expected: no cross-regime or cross-container rule application.

### Task 7: Review UI and candidate/export gate

**Files:** Modify `src/components/ImportStepView.tsx`, `src/components/WorkspaceEditor.tsx`, `src/App.tsx`, `src/utils/exportCandidate.ts`; create `test/semantic-review-ui.test.ts` and `test/semantic-candidate-gate.test.ts`.

**Interfaces:** Review list groups Body by heading hierarchy and Appendices by `appendixId`; each row displays local label, AI label, exact source quote, page/OOXML evidence, selected rule and decision. Candidate key includes semantic decision fingerprint and, when a supported visual review exists, its evidence identity. The existing local-only export remains available under its present gates, clearly labeled as lacking visual AI review; it must never claim completion of the requested full-file AI workflow.

- [ ] Give users explicit per-unit approve/change/reject controls, accessible keyboard/pointer reachability and a visible unresolved count. Show full-file/vision capability and coverage separately from text-block coverage. The user can reach a disputed unit from the workflow stepper.
- [ ] In the import metadata step, display an explicit reason beside the disabled **Xem tóm tắt** action when `doc.documentType` is empty. Offer the source-evidenced document type as a confirmable suggestion, never silently select it; keep regime conflicts visible. Check the supplied biên bản path with real pointer and keyboard input.
- [ ] Require a confirmed semantic target before applying format changes; explain blocked/readonly units. Keep original download available. Generate one candidate revision; preview/download/print use the same candidate bytes and SHA.
- [ ] Plan/run UI and candidate checks for disabled CTA explanation, manual decision, stale result, unsupported media, split/merge, appendix separation and same-byte preview/download/print. Perform native Word/PDF visual acceptance separately for layout-sensitive cases.
- [ ] Final matrix must state `PASS`, `FAIL` or `NOT_VERIFIED` independently for parser, AI code/file review, page vision, reconciliation, user review, semantic rule selection, OOXML export, browser UI and native Word. No all-green claim from a build or 40/40 text coverage alone.
