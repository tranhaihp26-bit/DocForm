# DocForm Full-Text AI and Semantic Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Follow the task order and preserve the current dirty checkout.

**Goal:** Let DocForm local submit all supported extracted document text to an explicitly selected existing provider adapter (Gemini API or ChatGPT plan) in traceable text chunks, reconcile independent local-parser and AI semantic observations for Body and each Appendix, and apply only approved, evidence-backed formatting rules. Add an optional, separately consented Gemini PDF visual-review lane only after the account, model, data tier, and end-to-end capability are verified.

**Architecture:** Keep provider adapters explicit and never fall back silently. The current Gemini API integration and local SIWC ChatGPT-plan adapter are text-generation lanes; the planned full-text operation must send a complete, source-anchored extracted-text manifest through the selected adapter and prove segment/chunk coverage. Local OOXML parsing remains the code/structure evidence. Gemini's documented PDF document understanding is a separate future visual lane: DocForm would render the source locally to PDF and submit those rendered pages only after separate consent and verified model/tier support. It does not prove that Gemini read original DOCX OOXML. Gemini File Search is retrieval/indexing, not proof that every segment was reviewed; Gemini Code Execution runs hosted Python and does not gain access to DocForm's local filesystem by itself. ChatGPT-plan SIWC remains text-only unless its exact route later proves otherwise. The immutable source, semantic review decisions, transaction-based formatter, candidate fingerprint and native Word acceptance remain separate evidence stages.

**Tech Stack:** Existing TypeScript/React/Express, JSZip, IndexedDB source store, vendored SIWC local SDK, existing semantic state and candidate pipeline. Do not add a runtime dependency in this plan.

**Spec:** `docs/research/2026-10-21-docform-full-docx-semantic-audit.md`. Consolidates the earlier plans `docs/superpowers/plans/2026-10-21-docform-full-docx-visual-ai.md`, `docs/superpowers/plans/2026-10-21-docform-semantic-reconciliation-rules.md` and `docs/superpowers/plans/2026-10-21-docform-local-integrated-roadmap.md`; use this consolidated plan as the execution order to avoid duplicating their tasks.

## Global Constraints

- Work only in the Antigravity DocForm local checkout. ONLYOFFICE remains out of scope.
- Preserve the original DOCX bytes and source SHA. Text and visual-PDF transfers are distinct operations; neither should be described as original-DOCX upload. The existing local Gemini integration is API-key based and server-side; the actual Google project tier is unverified.
- Bind every consent to the source SHA/generation, explicit provider, and operation/input scope (`selected text`, `all extracted text`, or rendered PDF/pages). Provider preference in general settings never grants content consent. Do not silently switch provider after a failure; a provider change requires a new explicit choice and consent.
- Disclose in general settings that Google currently states Free-tier Gemini API content may be used to improve products, while Paid-tier content is not; verify the project and model actually used before making a tier claim or sending sensitive content.
- Do not assume general Responses API file, Code Interpreter or image capabilities are available through ChatGPT-plan OAuth. Do not add an API-key fallback or an undocumented token route.
- Do not treat Gemini File Search retrieval as a complete-document pass. Do not treat Gemini Code Execution as local OOXML access. Any PDF visual lane must record that the provider saw a locally rendered PDF, not the source DOCX package.
- Keep text coverage, original-file transfer, provider file read, code/OOXML read, visual page review, semantic agreement, user approval, rule execution and native Word appearance as distinct statuses.
- The new AI-review evidence path must never log or persist duplicate full source text, raw prompts/provider responses, DOCX bytes, page images, access tokens or refresh tokens. The established local draft/source-blob store continues to retain the imported source needed to edit the session; this gate does not delete that pre-existing local session data. Persist only minimum structured observations and short source quotes/hashes in AI-review evidence.
- Consent is specific to source SHA/generation and provider. Broader text-part inclusion requires explicit consent; the existing block-review consent cannot silently authorize newly included comments, revisions or hidden text.
- Never silently truncate, skip failed text chunks, infer agreement when AI is absent, or claim complete review from a block count alone.
- Keep Nghị định 30/2020/NĐ-CP and Hướng dẫn 05-HD/VPTW rule catalogs separate. Legal requirements, profile styles and aesthetic suggestions are different categories.
- Preserve all existing user changes in the dirty working tree. Capture a fresh baseline immediately before implementation; do not reset, clean, or commit unrelated work.

## Review Focus

1. Documents exceeding the current 500-block request limit or a model context budget must be split and fully accounted for, or explicitly marked partial (Tasks 2–3).
2. Headers, footers, notes, comments, revisions, textboxes, hidden text and field codes must be inventoried; unsupported or excluded text must prevent an “all text” claim (Task 2).
3. Repeated quotes in Body, multiple tables or different Appendices must align by stable source anchors, not text alone (Tasks 3–4).
4. A failed/late response, source replacement, regime change or edit must not approve a different source generation or stale semantic unit (Tasks 3–5).
5. Merged/nested tables, unsupported rich content and ambiguous semantic boundaries must remain unresolved or readonly (Tasks 4–6).

---

## Current Evidence and Starting Point

- `runPartitionAiService` currently splits the supplied source blocks into chunks of 25 and records completed/failed block IDs; request validation accepts at most 500 blocks. Each AI block contains source text and table-cell text, without parser-assigned roles.
- `/api/ai/review-document` currently caps its `rawText` at 15,000 characters. This is a separate review route; it is not proof that every text-bearing OOXML part was submitted.
- The existing import parser remains centered on body paragraphs/tables. The on-demand `FullTextManifest` builder inventories supported text in body/table cells, referenced headers/footers, notes and stable textboxes; unsupported parts are excluded and force partial coverage. The manifest now feeds the provider-scoped, text-only review panel and endpoint after explicit per-file consent.
- The existing Gemini integration in `server.ts` uses `@google/genai`, server-side `GEMINI_API_KEY`, and text generation with model fallback; this does not establish full-manifest coverage, PDF visual review, Free Tier status, or a full-document semantic adapter. SIWC remains its separate text-only adapter.
- Google's current Gemini API documentation describes native visual understanding for PDF documents; non-PDF documents are treated as text and lose visual context. This supports evaluating a local DOCX-to-PDF visual lane, not claiming it is implemented or that it reads DOCX structure.
- Google's Code Execution tool runs Python in its hosted environment. It is not a bridge to a local DocForm path; only data explicitly submitted by the application can be processed.
- Semantic units, reconciliation, durable decisions, candidate gates and a limited formatting transaction for a simple confirmed Body paragraph already exist. Appendix child labels exist, but Appendix formatting transactions and several Body types remain unsupported.
- Current synthetic candidate and semantic persistence browser checks pass, and general AI settings are stored per browser origin/profile. Manual user-browser and native Word visual acceptance remain `NOT_VERIFIED`.
- Extracted-text transfer is implemented but no live provider request was made here. Original-DOCX transfer and provider code/OOXML reading remain `BLOCKED_BY_PROVIDER` for ChatGPT plan and `NOT_VERIFIED` for Gemini; provider all-page vision is not integrated. Account-specific OAuth behavior remains `NOT_VERIFIED`.

---

### Task 1: Freeze baseline and separate capability states

**Files:**
- Create: `docs/superpowers/evidence/2026-10-22-docform-full-text-baseline.md`
- Modify: `src/shared/fullDocumentAiProtocol.ts`
- Modify: `src/server/fullDocumentCapability.ts`
- Modify: `docs/SIWC_LOCAL.md`
- Test: `test/full-document-capability.test.ts`

**Interfaces:**
- Define capability status by provider and operation instead of a single “AI connected” boolean: `chatgpt-plan.textInput`, `chatgpt-plan.originalDocxFileInput`, `chatgpt-plan.providerFileRead`, `chatgpt-plan.codeRead`, `chatgpt-plan.pageVision`, `gemini.textInput`, `gemini.pdfDocumentInput`, `gemini.fileSearch`, `gemini.codeExecution`, and `gemini.dataUseTier`.
- Mark existing text adapters separately from the not-yet-built complete-manifest operation; verify account/session availability independently.
- Keep ChatGPT-plan file/code/vision `BLOCKED_BY_PROVIDER` until the exact OAuth route has documented support and a synthetic capability probe. Mark Gemini PDF vision as documented but `NOT_VERIFIED`/not integrated for this app until a synthetic end-to-end test succeeds. File Search is retrieval, code execution is hosted Python, and neither implies all-source coverage or local path access.

- [x] Record branch, HEAD, dirty paths, hashes of planned edit targets, current provider transport and test evidence. Preserve unrelated user changes.
- [x] Update capability descriptions and SIWC documentation so text-only transport is not described as original-file, code or visual review; add a separate provider capability record for Gemini without conflating current text calls with the planned full-manifest path.
- [x] Keep the future full-file gate closed for disconnected sessions, unsupported routes and missing file-specific consent.
- [x] Add Gemini data-tier state as `unknown` until directly verified from the configured project; display the Free/Paid policy disclosure independently from runtime capability.
- [x] Verify with `node --import tsx --test test/full-document-capability.test.ts`. PASS 6/6; no source transfer occurs in this task.

### Task 2: Build a complete, source-linked extracted-text inventory

**Files:**
- Create: `src/shared/fullDocumentTextProtocol.ts`
- Create: `src/utils/fullTextManifest.ts`
- Reuse: `extractDirectChildren` in `src/server/blockExtractor.ts` for direct OOXML hierarchy traversal
- Integrate on demand in Task 3 only after file-specific consent; do not eagerly persist a second text copy during `localFileImport.ts`
- Modify: `src/shared/schemas/document.schema.ts` only if durable source anchors need a schema extension
- Create: `test/full-text-extraction-manifest.test.ts`

**Interfaces:**
- `FullTextSegment`: stable segment ID, source SHA/generation, package-part URI, story kind, document order, optional block/table/cell IDs, visibility class, exact text and text hash.
- `FullTextManifest`: extraction version, ordered segments, manifest hash, included-part inventory and excluded/unsupported-part inventory with a reason.
- `buildFullTextManifest(sourceBytes, sourceSha256, sourceGeneration)`: returns a manifest without mutating or persisting a second copy of source text.

- [x] Inventory the DOCX package and classify text-bearing parts. The initial visible-text scope includes body paragraphs and tables, referenced headers/footers, footnotes/endnotes and textboxes only where stable extraction and anchors are implemented.
- [x] Inventory comments, tracked insertions/deletions, hidden text, field instructions, drawing/chart text and other text-bearing parts separately. Exclude them from transfer and report partial coverage when any possibly relevant part is unknown or unsupported.
- [x] Preserve order and anchors for paragraphs, table cells, and each Appendix. Do not flatten tables into unlabelled text. Preserve one-to-many source lineage when a paragraph contains multiple semantic units.
- [x] Do not use Mammoth HTML or browser rendering as the source of pagination/OOXML truth. Reuse Mammoth only as an optional independent text cross-check.
- [x] Verify with `node --import tsx --test test/full-text-extraction-manifest.test.ts`. Fresh PASS 18/18 on 2026-10-22: body/table, referenced header/footer, notes, repeated text in separate anchors, Appendix-like sections, textbox, hidden/revision/field, nested/unsupported parts, wrong source SHA, and empty document; also safe namespace aliases (including Unicode), conflicting/rebound/default namespace handling, foreign Unicode wrappers, aliased note IDs, valid row metadata, unknown direct children, body-level `mc:AlternateContent`, and CDATA/comment handling. Unsupported text is excluded with partial coverage rather than silently skipped as complete.

### Task 3: Send all selected text through the explicitly selected provider in bounded text chunks

**Files:**
- Create: `src/server/aiTextChunkRunner.ts`
- Create: `src/server/fullTextSemanticService.ts`
- Create: `src/server/fullTextSemanticPrompt.ts`
- Modify: `src/server/aiPartitionService.ts` to reuse shared chunk scheduling without changing its existing response contract
- Modify: `src/shared/partitionAiProtocol.ts` only for shared coverage primitives
- Modify: `src/server/chatgptPlanProvider.ts`
- Modify: existing Gemini service/provider seam in `server.ts` (reuse current `@google/genai` and server-side API key; do not create another credential store)
- Modify: `server.ts`
- Create: `test/ai-text-chunk-runner.test.ts`
- Create: `test/full-text-semantic-service.test.ts`
- Create: `test/full-text-review-endpoint.test.ts`

**Interfaces:**
- `FullTextReviewRequest`: source SHA/generation, manifest hash, regime, document type, selected text scope, file-specific consent ID and ordered segment references/text.
- `FullTextReviewCoverage`: total/included/completed/failed segment IDs, total/completed/failed chunk IDs, extraction coverage, transfer coverage, semantic-response coverage and final status.
- `AiSegmentReview`: one validated status per segment (`reviewed`, `no_finding` or `unsupported`) plus zero or more `AiSemanticObservation` records. An observation carries source SHA/generation, segment/block/cell anchor, exact quote, Body/Appendix scope, label, parent/Appendix ID, reason and confidence.
- `reviewFullExtractedText(request, provider, signal)` dispatches only to the explicitly selected provider adapter. The ChatGPT-plan adapter sends text via `streamResponse`; the Gemini text adapter reuses the existing server-side integration. Neither text adapter accepts a DOCX byte field.

- [x] Reuse the current SIWC and Gemini text providers and per-chunk progress pattern. Keep the existing coarse source-partition endpoint intact; add a separate semantic full-text operation so old clients and approvals are not silently reinterpreted.
- [x] Split the full manifest into token-budgeted requests. Use a conservative budget with a safety margin; when the selected plan model’s context budget is unknown or a request overflows, reduce chunk size and retry without truncating. Do not call a Platform token-count endpoint unless the OAuth route is documented to support it.
- [x] Ensure every selected segment is assigned to one primary chunk exactly once. Require a validated per-segment result (`reviewed`, `no_finding` or `unsupported`); a completed chunk with omitted segment IDs is incomplete. Any overlap supplied for context is explicitly marked as context and does not inflate coverage. Carry stable document order, preceding heading/Appendix identity and anchor metadata, but never expose parser semantic labels in the AI first pass.
- [x] Add a final cross-chunk synthesis using segment IDs and validated per-chunk observations. A summary may identify cross-references but cannot replace missing source observations or approve an unobserved segment.
- [x] Treat a chunk timeout, invalid JSON, provider error, context overflow, cancellation, response truncation or stale generation as failed/partial. Do not silently switch between Gemini and ChatGPT plan. A retry using another provider requires a user choice and new provider-specific consent.
- [x] Remove the 15,000-character cap only from the new full-text path. Keep existing bounded review behavior unchanged unless separately approved.
- [x] Verify with `node --import tsx --test test/ai-text-chunk-runner.test.ts test/full-text-semantic-service.test.ts test/ai-partition-review.test.ts`. Expected: complete success reports every selected segment; one omitted or failed segment makes coverage partial; prompt payload contains text and anchors but no file bytes or parser labels.


Implementation evidence: added a local text-only endpoint with strict provider/source consent, manifest fingerprint and package-part coverage validation. Requests use a 6000 estimated-token budget with 1200 reserved prompt tokens; estimates count two UTF-8 bytes per token, and provider context overflow retries by halving primary segments. Chunk and synthesis responses are source-bound. The UI retries only failed segment IDs and carries forward source-validated results. AI evidence quotes are capped at 320 source characters and oversized quotes fail that segment. A current retry response is now tied to provider, source SHA/generation, manifest, partition, regime and document type; changing any of these clears or rejects stale results. Fresh focused run on 2026-10-22: 43/43 tests passed across extraction, chunk runner, endpoint, service, client, persistence, UI and partition regression; TypeScript passed. No live provider request was made.
### Task 4: Complete Body and Appendix semantic observations and reconciliation

**Files:**
- Modify: `src/shared/semanticDocument.ts`
- Modify: `src/utils/localSemanticObservations.ts`
- Modify: `src/utils/semanticAlignment.ts`
- Modify: `src/utils/semanticReconciliation.ts`
- Modify: `src/shared/fullDocumentTextProtocol.ts`
- Modify: `src/utils/semanticState.ts` only if the current persisted state lacks source-text coverage/observation provenance
- Modify or extend: `test/local-semantic-classifier.test.ts`, `test/semantic-ai-alignment.test.ts`, `test/semantic-reconciliation.test.ts`, `test/semantic-state.test.ts`

**Interfaces:**
- Keep `SemanticUnit` separate from physical `SourceBlock`, editable HTML and coarse `SourceRegion`.
- `SemanticDecision` records parser observation, AI observation, reconciliation result, user/policy actor, current source/revision fingerprints and approval state.

- [x] Complete shared Body labels: section heading, legal basis, lead, narrative, article/clause/point, list item, table header/data, note, media/unsupported and unknown.
- [x] Add document-type-specific meeting labels only for an identified biên bản: meeting time/place, participants, chair/secretary, agenda, discussion/opinion, vote, conclusion, assignment and closing.
- [x] Classify each Appendix independently: number/title, parent-document reference, section/heading, explanation, list item, table header/data, note/source, media/unsupported and unknown. Preserve the existing rule that only the first actual Appendix heading receives its title label.
- [x] Have the AI return semantic observations from the text manifest independently of local labels. Validate quote, segment ID, cell coordinates, Appendix ID and source SHA. Ambiguous repeated quotes remain unaligned.
- [x] Auto-confirm only exact, low-risk agreements with matching scope, parent, source anchor and quote. Regime/document type, identity, signature/recipient, Appendix boundary, vote, assignment, mixed content and merged-table decisions require user confirmation or review.
- [x] Verify semantic behavior and state with the focused suites. PASS 36/36 on 2026-10-22; includes a regression that rejects restoring a user approval against changed AI evidence.

Implementation evidence: Body and meeting labels, per-Appendix hierarchy, aligned text observations and exact low-risk reconciliation are in place. User approvals now store an evidence fingerprint so changed AI evidence cannot silently retain a prior confirmation. Synthetic classifier/alignment/reconciliation/state run: 36/36 passed.

### Task 5: Add explicit provider-scoped consent, progress and honest coverage UI

**Files:**
- Modify: `src/components/ImportStepView.tsx`
- Modify: `src/components/WorkspaceEditor.tsx`
- Modify: `src/App.tsx`
- Modify: `src/shared/partitionAiProtocol.ts` if consent scope is typed there
- Modify: `src/utils/semanticState.ts`
- Modify: `docs/SIWC_LOCAL.md`
- Modify or extend: `test/semantic-review-ui.test.ts`, `test/semantic-decision-persistence-browser.test.ts`, `test/stage2-regime-confirmation-browser.test.ts`

#### App-wide provider preference prerequisite (implemented 2026-10-22)

- The header opens general application settings on desktop and narrow screens. The global panel owns the default Gemini/ChatGPT-plan provider choice and ChatGPT local connection controls; source review displays the active provider and links to the panel.
- Persist only the versioned default provider in browser `localStorage`, scoped to the DocForm origin/profile. Do not persist ChatGPT tokens, Gemini keys, document text, or consent there. ChatGPT credentials remain in the existing local server credential store; Gemini continues through the existing server-side integration.
- Keep per-source consent in the source review UI, off after page reload, and reset it when the provider changes. A saved provider preference never authorizes sending content.
- The app cannot establish from this preference whether the configured Gemini project is on Free Tier. Verify the project quota and current Google terms separately; do not label the integration “Free Tier” without that evidence.
- [x] Add accessible general settings entry and dialog; verify pointer open, keyboard close/focus return, and narrow-viewport reachability.
- [x] Persist and restore only the default provider; test invalid versions, invalid providers and unavailable browser storage.
- [x] Move provider selection and ChatGPT connect/disconnect controls out of source-specific settings while retaining source-specific consent.

- [x] Add an explicit per-file `all_extracted_text` consent scope naming the selected provider, exactly which text-bearing parts are included/excluded, chunking, retention/deletion behavior where applicable, and that DOCX bytes/page images are not sent in this lane. Keep current block-review consent separate; reset consent when source SHA/generation or provider changes.
- [ ] Add a distinct `rendered_pdf_visual_review` consent scope only when the optional Gemini PDF lane is implemented. Explain that DocForm renders the DOCX locally and sends the resulting PDF/pages to Google; bind consent to source SHA, renderer/version, PDF SHA, page hashes, model and generation. Never present this as a provider read of original DOCX OOXML.
- [x] Show extraction coverage, text submitted, text response coverage and failed segments separately; do not say “AI đã đọc nguyên tệp” or imply visual review.
- [x] Show the provider actually used for each run and an explicit data-tier notice for Gemini. General settings stores only the provider preference; consent remains per-source/per-operation and is not persisted across reloads.
- [x] Show per-chunk progress and allow cancel/retry of failed chunks. A retry binds to the same source SHA/generation and does not duplicate or overwrite approved observations.
- [x] Keep AI/local labels side by side with source quotes and anchors. Preserve decisions in IndexedDB; invalidate stale decisions when semantic evidence changes.
- [x] In the metadata stage, explain next required action beside disabled “Xem tóm tắt”; offer a source-evidenced document-type suggestion for explicit user confirmation.
- [x] Verify the full text browser flow after the current test completes. PASS 1/1 on 2026-10-22 at 390×844 with synthetic DOCX and injected provider: opening/inventory/consent alone sends no request; first request stays partial; retry includes only failed segment IDs; evidence persists without a duplicate source segment, manifest or consent; reload resets consent and in-memory manifest.

Implementation evidence: general settings own the durable default provider preference. The full-text panel displays included/excluded package parts, estimated chunking and provider retention limits, requires consent plus an explicit send action, and shows transfer/response coverage. AI-review evidence storage excludes the raw manifest, consent and duplicate source segments. Browser pointer verification used a synthetic DOCX and injected provider only.

Execution ruling (2026-10-22): the non-persistence rule applies to new AI-review evidence/logs, while the existing local draft and source-blob stores retain their source data for editing. The browser test therefore checks the AI evidence object instead of the whole draft. Cost if wrong: imported text and DOCX bytes remain stored locally under the existing session lifecycle.

### Task 6: Finish rule applicability and reversible formatting by semantic type

**Files:**
- Modify: `src/canonical/semanticRuleSelector.ts`
- Modify: `src/utils/semanticRuleFormatting.ts`
- Modify: `src/utils/workspaceTransactions.ts`
- Modify: `src/utils/docxExport.ts`
- Modify: `src/canonical/ruleEngine.ts`
- Modify: `src/components/WorkspaceEditor.tsx`
- Modify or extend: `test/semantic-rule-selector.test.ts`, `test/semantic-rule-formatting.test.ts`, `test/semantic-approval-transactions.test.ts`

- [x] Build an applicability matrix keyed by regime, document type, profile, Body/Appendix scope, semantic label, evidence requirement and supported transaction. Every executable rule cites a verified legal/guidance source or is explicitly marked as a profile preference.
- [x] Retain the existing simple confirmed Body-paragraph transaction as the only supported formatting operation. Headings/lists remain disabled until they have exact OOXML mapping and transaction tests.
- [ ] Add Appendix rules by verified subtype; do not inherit Body indentation, line spacing or heading styles by default. Appendix references and metadata labels remain semantic-only where no verified style rule applies.
- [x] Keep table-cell rules disabled until supported simple structures have stable table/cell coordinates; merged/nested tables, rich drawings and ambiguous mappings remain readonly/fail-closed.
- [x] A formatting transaction requires a current `user_confirmed` or permitted low-risk `auto_confirmed` semantic unit and current source/partition/rule evidence. It applies no text changes as a side effect; accepted mutations invalidate the candidate revision/export.
- [x] Verify selector/transaction/export tests. PASS 36/36 on 2026-10-22; includes candidate invalidation after changed rule/evidence identity.

Research source check: Nghị định 30/2020/NĐ-CP, Phụ lục I, Phần I, mục 2(e), allows 1 cm or 1.27 cm first-line indent and single-to-1.5 line spacing. Hướng dẫn 05-HD/VPTW (27/5/2026), Phần II, Mục I, khoản 6.2.2, specifies about 10 mm indent and exactly 18–22 pt line spacing. The official Hướng dẫn 05 PDF also gives separate Appendix requirements: Phần II, Mục II, khoản 1 requires an Appendix indicator, separate presentation, title and an accompanying-document reference line; Phần IV, mục 5.2 says each Appendix restarts page numbering. These establish title/reference/page-number rules, but do not establish a complete style map for every Appendix child subtype or table shape. No Appendix formatting transaction was enabled in this implementation; the Appendix rule checkbox stays open until each executable subtype has a verified mapping and transaction/export tests. Table/heading/list mutations remain closed.

### Task 7: Candidate, export and native Word acceptance

**Files:**
- Modify: `src/utils/exportCandidate.ts`
- Modify: `src/utils/candidateContentFidelity.ts`
- Modify: `src/components/WorkspaceExport.tsx`
- Modify or extend: `test/semantic-candidate-gate.test.ts`, `test/candidate-preview-print-browser.test.ts`, `test/stage5-word-visual-acceptance.test.ts`

- [x] Include semantic decision, text-coverage manifest hash, rule-selection fingerprint and current source generation in candidate identity. Text-review coverage alone does not certify visual layout.
- [x] Keep original DOCX download distinct from transformed candidate download. Synthetic browser PASS 1/1 on 2026-10-22: candidate download SHA equals preview SHA; print uses that SHA/instance; original download SHA equals source; stale candidate does not print.
- [x] Run synthetic fixtures with no/one/multiple Appendices, long cross-chunk context, tables, unsupported content and partial AI failures. Focused suites cover Body-only, one and multiple Appendices, table/cell anchors, unsupported package content, cross-chunk retry and partial results; browser candidate fixture includes an Appendix and multiple pages. No user DOCX content was used.
- [ ] Perform manual Microsoft Word open/render comparison on synthetic documents after automated candidate checks. Record native Word result separately; retain `NOT_VERIFIED` until the document is actually inspected in Word.
- [x] Verify build/type checks, targeted suites and browser interactions at desktop and narrow viewport sizes. Fresh TypeScript and Vite build passed; targeted groups passed 49/49 full-text, 36/36 semantic, 13/13 settings/capability/candidate, 1/1 block-extractor and 32/32 compliance checks. The table/import-fidelity command group exited 0: table/body reported 8/8, import-fidelity logged 5 PASS, and imported-grid logged 2 PASS. After the final table-CDATA parser adjustment, the focused manifest/block-extractor pair passed 19/19 and TypeScript passed again. The combined settings, semantic persistence, full-text and candidate browser run passed 4/4 at desktop/narrow sizes; candidate preview/print/original-download browser test was rerun after the table parser change and passed 1/1. Vite emitted `node:crypto` browser-externalization and >500 kB chunk warnings. Browser tests used localhost and synthetic data. Native Word remains `NOT_VERIFIED`.

### Task 8: Conditional Gemini PDF vision and provider file/code lanes

**Files:** No transport change until the relevant capability and data-policy gates are met. For Gemini PDF, extend `src/server/fullDocumentCapability.ts`, `src/shared/fullDocumentAiProtocol.ts`, `src/server/sourceVisualRenderer.ts`, `server.ts`, `src/components/ImportStepView.tsx` and dedicated provider tests. For ChatGPT-plan file/code/vision, only proceed if the exact OAuth route gains documented support.

- [ ] For Gemini, verify project tier, the selected model's PDF support/limits and current retention/data terms. Google's docs describe PDF native visual understanding; non-PDF input is treated as text and loses visual context. The app has not integrated or probed this route yet.
- [ ] Render a synthetic DOCX locally through the established source renderer; record source SHA, renderer/version, PDF SHA, page count and per-page hashes. Send only that PDF to Gemini, with explicit PDF-specific consent; require one validated visual observation/`no_finding`/`unsupported` status per page or report partial coverage.
- [ ] Verify retention and deletion semantics before choosing inline PDF versus Files API. Prefer inline transfer for temporary single-request review when it satisfies the documented limits; if a remote file/store is used, create and delete it deterministically where supported, and report any remaining retention boundary.
- [ ] Evaluate Gemini File Search only for a retrieval workflow if needed. Its indexed/retrieved chunks do not establish that every document segment or page was read; it cannot satisfy the full-text coverage gate alone.
- [ ] Treat Gemini Code Execution as a hosted Python tool. If used for a bounded task, pass only the explicitly consented extracted data; it does not read the user's local filesystem or replace the local OOXML parser.
- [ ] Probe ChatGPT-plan file, code and vision only with a synthetic DOCX through the exact OAuth route after official support is documented. Require separate evidence for original DOCX transfer, provider file read, code/OOXML tool execution and per-page visual observations.
- [x] If any capability remains unsupported, leave it `BLOCKED_BY_PROVIDER` or `NOT_VERIFIED`; keep the text-only lanes usable and never label them full-file/code/visual AI review. A change to Platform API billing or credential type is a separate product decision.

## Gates and Completion Rules

| Gate | PASS requires | Does not prove |
|---|---|---|
| G0 Baseline | Fresh dirty-state and target-file manifest | Product behavior |
| G1 Text capability | Explicit selected Gemini or SIWC adapter; session/account status and provider identity reported honestly | Complete manifest coverage, file, code or vision support |
| G2 Extraction | All selected text-bearing parts inventoried and anchored; unsupported/excluded scope visible | AI received the text |
| G3 Text transfer | Every selected segment has successful request/response coverage tied to source SHA and explicit provider-specific consent | Original DOCX upload or visual review |
| G4 Semantics | Independent parser/AI observations aligned; decisions current; conflicts routed to user | Formatting correctness |
| G5 Rules/candidate | Approved units only; allowlisted transactions; candidate evidence current | Word rendering correctness |
| G6 Native acceptance | Same candidate SHA inspected in Microsoft Word; UI actions reachable | Future provider capabilities not exercised |
| G7 Optional visual lane | Gemini PDF route and tier verified; each rendered page has provider evidence tied to source/PDF/page hashes and separate consent | Original DOCX OOXML/code read or native Word equivalence |

A text-only run may pass G1–G4 while `original_file_transfer`, `code_read`, `all_page_visual_review` remain `BLOCKED_BY_PROVIDER` or `NOT_VERIFIED`. A Gemini PDF run may eventually establish page-visual review for the rendered artifact; it still does not establish original-DOCX OOXML reading. Do not combine these statuses into one overall “AI đã đọc toàn bộ tài liệu” badge.

## References

- Current local transport and usage: `docs/SIWC_LOCAL.md`, `src/server/chatgptPlanProvider.ts`, `src/server/aiPartitionService.ts`, `src/shared/partitionAiProtocol.ts`, `server.ts`.
- Existing design audit: `docs/research/2026-10-21-docform-full-docx-semantic-audit.md`.
- Official SIWC DevKit text transport: https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/packages/local/src/responses.ts
- OpenAI file input behavior: https://developers.openai.com/api/docs/guides/file-inputs
- OpenAI context and token counting: https://developers.openai.com/api/docs/guides/token-counting and https://developers.openai.com/api/docs/guides/conversation-state
- Microsoft Word PDF export: https://learn.microsoft.com/en-us/office/vba/api/word.document.exportasfixedformat
- Gemini document understanding (PDF visual input; non-PDF input treated as text): https://ai.google.dev/gemini-api/docs/document-processing
- Gemini API pricing and Free/Paid data-use terms: https://ai.google.dev/gemini-api/docs/pricing
- Gemini Code Execution: https://ai.google.dev/gemini-api/docs/code-execution
- Gemini File Search retrieval/indexing: https://ai.google.dev/gemini-api/docs/file-search
- Nghị định 30/2020/NĐ-CP: https://vanban.chinhphu.vn/default.aspx?docid=199378&pageid=27160
- Hướng dẫn 05-HD/VPTW: https://xaydungchinhsach.chinhphu.vn/huong-dan-so-05-hd-vptw-ve-the-thuc-va-ky-thuat-trinh-bay-van-ban-cua-dang-119260601101535274.htm
