# DocForm Local: Integrated Full-File AI and Semantic Formatting Roadmap

Date: 2026-10-21. Scope: Antigravity DocForm local only. Companion task-level plans: [full DOCX and visual AI](2026-10-21-docform-full-docx-visual-ai.md) and [Body/Appendix semantics and rules](2026-10-21-docform-semantic-reconciliation-rules.md). Evidence and design rationale: [audit](../../research/2026-10-21-docform-full-docx-semantic-audit.md).

## Product outcome

For an imported DOCX, keep the original bytes immutable. With a new consent, submit **the original DOCX file itself** through a documented, working ChatGPT-plan OAuth file-input route, and submit a complete page rendition of the same bytes for visual inspection. Have local code and AI inspect the source independently. Compare their source-linked Body and Appendix semantic units. Auto-confirm only low-risk exact matches, route all other units to the user, then select and apply rules to approved units. Preserve the existing local-only workflow if the selected connection cannot support the new AI capabilities; never label that fallback as full-file AI review.

## Evidence states and the critical distinction

| State | Minimum evidence | What it does not prove |
| --- | --- | --- |
| `local_source_verified` | Source blob bytes match stored SHA-256. | Remote transfer. |
| `local_endpoint_received` | Local server rehashes the uploaded DOCX bytes. | AI provider received a file. |
| `original_file_transfer` | Supported provider file-input request accepted the original DOCX MIME and byte count, tied to source SHA and consent. | Provider read the whole document or its layout. |
| `provider_file_read` | Structured observations quote and anchor source content, with explicit coverage and limitations. | Code-level OOXML inspection. |
| `code_read` | Supported tool/path yields source-linked structural observations, including paragraphs/tables/styles where exposed. | Accurate rendered appearance. |
| `all_page_visual_review` | A complete SHA-bound rendition and AI page observations cover every rendered page. | Pixel-perfect geometry or legal correctness. |
| `semantic_approved` | Exact low-risk reconciliation or recorded user decision, current revision. | Export fidelity. |
| `candidate_verified` | One approved candidate SHA is used for preview/download/print and passes applicable fidelity gates. | Native Word appearance without separate inspection. |

A text-only batch count such as 40/40 can report coverage of extracted text, but cannot satisfy any of the three remote file/code/vision states. A DOCX file input in the general Responses API extracts text only; the visual state requires PDF/page input on a vision-capable path. The selected ChatGPT-plan OAuth route must be checked independently from general Platform API support.

## Work sequence and gates

### Phase 0 — Freeze the baseline

- [ ] Record branch, HEAD, dirty paths, hashes of files to be edited, local server/SDK versions and current AI transport. Preserve the existing checkout changes.
- [ ] Inspect source import, `source_blobs`, partition approval, rule engine and candidate contract before wiring new states. Keep the immutable user DOCX out of fixtures and logs.
- **Gate G0:** A reproducible baseline manifest and ownership map exist. No claim from the prior audit snapshot substitutes for this fresh baseline.

### Phase 1 — Prove the exact ChatGPT-plan OAuth capabilities

- [ ] Confirm documented support and probe with a synthetic DOCX for original file input, page/PDF vision input and code/structure tool access, separately. The request must use the user's selected personal/local ChatGPT-plan connection, its supported scope and official transport. Do not paste raw bytes/XML into a text prompt as a substitute for file input.
- [ ] Implement capability discovery that returns per-feature status and reason. Mark an unproven route `NOT_VERIFIED`, a documented/observed unsupported route `BLOCKED_BY_PROVIDER`.
- **Gate G1:** No real user file leaves the machine until the relevant original-file and visual/code capabilities are supported, a file-specific consent exists, and the request path is reviewable. If OAuth lacks a capability, continue local semantic work and show the unavailable state; do not silently change provider or billing model.

### Phase 2 — Bind exact DOCX bytes to complete visual evidence

- [ ] Reuse `loadSourceBlob` and its SHA check. The local endpoint rehashes bytes and rejects stale generation, oversized file or source mismatch.
- [ ] Render the exact source bytes to PDF and ordered page images using an identified renderer/version. Hash the PDF and each page; detect missing/partial pages, timeout and cancellation. Keep renderer output temporary and outside draft persistence.
- **Gate G2:** `VisualEvidenceManifest.complete` is true only for a complete page set bound to the same DOCX SHA. Compare representative rendition with native Word before treating page observations as layout evidence.

### Phase 3 — Transfer the real file with explicit consent

- [ ] Add a separate per-file consent that names provider, original DOCX, page rendition, size, page count, persistence/deletion information and expected transfer. Reset it when the file/provider changes; retain the existing text-only consent as a separate choice.
- [ ] Use the proven provider adapter to send original DOCX as actual file input, plus PDF/pages as separate visual input. Record submitted MIME/byte count, source SHA/generation, consent ID, safe provider reference and outcome; never log bytes, document text, images or tokens.
- [ ] Require source-linked observations for file/text reading, code/structure reading and every-page visual reading. Do not accept a model's unanchored statement that it read the whole file as proof. Cancel/discard late or partial responses.
- **Gate G3:** Report `original_file_transfer`, `provider_file_read`, `code_read` and `all_page_visual_review` independently. The full requested AI-review label requires all four, with provenance and coverage; partial success stays partial.

### Phase 4 — Independently parse and reconcile Body and Appendices

- [ ] Reuse ordered `SourceBlock`/`TableModel` IDs and structural evidence. Add a versioned semantic overlay with logical child units, physical block/cell/text-span anchors, source quote/hash, parent relationship and separate Appendix IDs. Never rewrite source bytes to fit a classification.
- [ ] Run deterministic local classification and independent AI classification. The AI first pass may receive source anchors/page index but not the local labels. Align results back to exact source spans/cells, preserving ambiguous/repeated strings as unresolved.
- [ ] Compare canonical label, scope, Appendix parent, physical anchor, quote and structural/visual evidence. Auto-confirm only exact, low-risk matches with deterministic corroboration. Ask the user about conflicts and high-impact identity, regime, signature, vote, appendix boundary and merged-table decisions even if two readers agree.
- **Gate G4:** Every approved unit has current source/revision evidence. Missing AI is recorded as missing, not agreement. Source or relevant edit invalidates affected observations and approvals.

### Phase 5 — Rules, review UI and candidate

- [ ] Select rules by confirmed semantic unit, document type, legal regime and profile. Keep legal requirements, guidance and aesthetics distinct. Unknown/unsupported/unapproved units yield `NEEDS_REVIEW` or `NOT_APPLICABLE`, with reasons.
- [ ] Show local versus AI labels, source quote, page/OOXML evidence, decision and proposed rule in the workflow. Show a required-action explanation beside a disabled **Xem tóm tắt** button and offer the source-evidenced **Biên bản** type for explicit confirmation.
- [ ] Preserve original download. Include semantic decision and available visual-evidence fingerprints in the candidate identity; preview, downloaded DOCX and print derive from one approved candidate. Keep local-only export under its existing gates, visibly separate from full-file AI review.
- **Gate G5:** No format mutation is applied to an unconfirmed semantic unit. No candidate claims native layout correctness solely from a SHA match.

### Phase 6 — Acceptance and rollout decision

- [ ] Use synthetic NĐ30 and HD05 fixtures for zero/one/multiple appendices, mixed and merged tables, repeated quotes, unsupported images, cancellation, stale replies and source replacement. Use the supplied biên bản only as an authorized read-only case; it contains no appendix.
- [ ] Review actual pointer, wheel and keyboard reachability in the import and semantic-review UI, plus native Word/PDF page appearance and exact candidate-byte equality. Report parser, original-file transfer, file read, code read, page vision, reconciliation, user decisions, rule applicability, export and UI as separate `PASS`/`FAIL`/`NOT_VERIFIED`/`BLOCKED_BY_PROVIDER` rows.
- **Gate G6:** The full workflow is accepted only when the exact ChatGPT-plan OAuth path, per-file consent, original DOCX transfer, code and all-page visual review, semantic decisions and candidate fidelity all have their own evidence. A general Platform API capability, a mocked provider, a build, or 40/40 extracted blocks cannot turn this gate green.

## Dependency and stop policy

Phases 0–1 lead the remote path. Phase 2 can proceed locally while OAuth support is being established. Phase 4's local semantic schema/classifier and Phase 5's local review improvements can proceed even if G1 is blocked; remote reconciliation and the full-file claim cannot. No API-key fallback, undocumented token call or ONLYOFFICE rollout is in this scope. Any request to change the selected account/provider is a separate product decision.

## Implementation references

- File/vision/provider tasks and interfaces: `2026-10-21-docform-full-docx-visual-ai.md`.
- Semantic overlay/reconciliation/rules/UI tasks and interfaces: `2026-10-21-docform-semantic-reconciliation-rules.md`.
- Existing-code findings, reuse points, taxonomy and source-DOCX snapshot: `../../research/2026-10-21-docform-full-docx-semantic-audit.md`.
