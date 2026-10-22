# DocForm Full DOCX and Visual AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the untouched original DOCX file from DocForm local to the selected AI only when the personal ChatGPT-plan OAuth route demonstrably supports file input; separately provide every rendered page and obtain evidence that AI read the file by code/structure and by visual inspection.

**Architecture:** Keep the browser's immutable `source_blobs` as the byte authority. Verify the exact bytes received by the local endpoint; render those bytes locally into a hashed PDF/page manifest. A provider adapter may submit the untouched DOCX as a real file input and the PDF/pages as separate visual input only on a documented, proven OAuth route. Record browser→local receipt, local→provider transfer, provider file reading, code/structure reading and all-page visual coverage separately. Capability and coverage statuses fail closed; the existing text-only partition provider remains a separate operation.

**Tech Stack:** TypeScript/React/Express, existing JSZip/IndexedDB source store, Windows Word PDF rendering where available, current SIWC DevKit only for features it actually exposes.

**Spec:** `docs/research/2026-10-21-docform-full-docx-semantic-audit.md`.

## Global Constraints

- Target only the Antigravity DocForm local checkout; do not edit the ONLYOFFICE plugin.
- Preserve original DOCX bytes and SHA-256; no full-file upload using the existing text-only consent.
- Do not assume Platform API file, image or Code Interpreter capability on a ChatGPT-plan OAuth token. No custom bypass and no silent provider/account switch.
- A multipart POST to DocForm's local server is not evidence that the remote AI received a DOCX. The remote request must carry the original DOCX as an actual supported file input, with submitted byte count/MIME and source SHA recorded; extracted text, ZIP/XML pasted into a prompt, or a PDF alone cannot satisfy `original_file_transfer`.
- Do not log original text, bytes, page images, tokens or uploaded file names. Use synthetic documents for automated tests.
- If a required capability or renderer is absent, surface `UNAVAILABLE`, preserve local workflow, and do not claim visual review.
- Freeze a fresh Git status and target-file hash manifest before implementation because the audit checkout had 157 modified/untracked paths.

## Review Focus

1. A stored blob whose bytes differ from its source SHA must be rejected before local rendering or AI transfer (Task 2).
2. A failed or partial page render must never be reported as all pages visually reviewed (Tasks 2 and 4).
3. Existing text-only consent must not authorize file bytes or page images (Task 4).
4. A late response for source A must not attach to source B or to a changed rendition (Task 3).
5. A connected ChatGPT-plan session with only text support must show `UNAVAILABLE`, not a false success or an unapproved API-key fallback (Task 1).
6. A successful local upload or remote HTTP response must not be labeled “AI read the entire DOCX” without provider/file and coverage evidence (Tasks 3 and 5).

---

### Task 1: Capability contract and supported-path gate

**Files:** Create `src/shared/fullDocumentAiProtocol.ts`, `src/server/fullDocumentCapability.ts`, `test/full-document-capability.test.ts`; modify `docs/SIWC_LOCAL.md` after the capability result is known.

**Interfaces:** `FullDocumentAiCapability = { originalDocxFileInput: boolean; pageVisionInput: boolean; codeExecution: boolean; reasonByCapability: Record<string,string>; documentedTransport?: string }`; `getFullDocumentAiCapability(provider, session): Promise<FullDocumentAiCapability>`. A full-file transfer requires `originalDocxFileInput`; the complete requested code-and-visual workflow requires all three booleans. This task does not upload a real document.

- [ ] Capture the current branch, dirty status and SHA of each target file into an implementation evidence note; keep existing changes untouched.
- [ ] Verify current official SIWC/DevKit scope, license, model and transport documentation; inspect the installed DevKit source. With a synthetic document only, probe whether this exact OAuth path permits (a) original DOCX file input, (b) PDF/page vision input and (c) code/structure inspection. Record endpoint, request content types, provider response and limitations without tokens or source text. Do not infer OAuth support from generic Platform API docs.
- [ ] Add the capability type and a gate returning `UNAVAILABLE` for the present text-only `streamResponse`; only a documented, working provider route may report all capabilities true.
- [ ] Plan/run `test/full-document-capability.test.ts`: text-only, disconnected, expired session, unsupported model and fully supported mock. Expected: no upload starts unless all requirements and consent are met.
- [ ] Gate per capability. If original DOCX file input is unsupported, disable remote original-file submission. If file input exists but vision/code does not, record the narrower supported capability without calling the complete workflow delivered. Keep local rendition and the unavailable UI useful in every case. Do not add an API-key fallback.

### Task 2: Render exact original bytes and record page evidence

**Files:** Create `src/server/sourceVisualRenderer.ts`, `src/server/sourceVisualRenderer.win.ps1`, `test/source-visual-renderer.test.ts`; modify `src/utils/localFileImport.ts` only if a new local-only rendition request needs a byte handoff.

**Interfaces:** `renderSourceDocx(bytes: Uint8Array, expectedSha256: string, signal: AbortSignal): Promise<{ manifest: VisualEvidenceManifest; pdfBytes: Uint8Array; pages: Array<{ page: number; imageBytes: Uint8Array; sha256: string }> }>`; `VisualEvidenceManifest` has source SHA, renderer/version, PDF SHA, ordered per-page SHA, page count and `complete` flag. Temporary files are cleaned up after use.

- [ ] Verify `loadSourceBlob` hash before handing bytes to the local renderer. Detect renderer availability explicitly. On Windows, use Word's PDF export on a read-only copy; a different renderer is identified by name and never silently treated as Word-identical.
- [ ] Convert every PDF page to an image at a documented resolution; hash PDF and images. Stop on missing pages, timeout or cancellation. Record document properties that affect pagination (renderer, fonts if available) without logging source text.
- [ ] Plan/run `test/source-visual-renderer.test.ts` for wrong SHA, missing Word, render failure, zero pages, page count mismatch, cancellation and successful synthetic two-page file. Expected: only the last case yields `complete: true`.
- [ ] Gate: compare a sample rendition with native Word viewing; report any page or font divergence. A hash binds identity, not layout correctness.

### Task 3: Provider adapter for original file plus visual pages

**Files:** Create `src/server/fullDocumentAiProvider.ts`, `src/server/fullDocumentAiPrompt.ts`, `test/full-document-ai-provider.test.ts`; modify `server.ts` only after Task 1 proves an authorized route.

**Interfaces:** `reviewFullDocument(input: { sourceBytes: Uint8Array; sourceSha256: string; visual: VisualEvidenceManifest; pdfBytes: Uint8Array; pageImages: Uint8Array[]; regime: 'administrative'|'party'; consentId: string; sourceGeneration: number; signal: AbortSignal }): Promise<FullDocumentAiResult>`. `FullDocumentAiResult` includes a `FullFileTransferRecord` with submitted MIME/byte count and safe provider request/file reference; it records provider file-read, code-read and visual coverage separately, page count, model, source SHA, visual-manifest hash, observations and failures. Its observations must use original quotes/page evidence, not local parser labels.

- [ ] Implement only the officially supported transport proven in Task 1. If impossible with ChatGPT-plan OAuth, leave this adapter unavailable; do not swap in an API key without a separate product decision.
- [ ] Submit the exact original DOCX bytes under its original DOCX MIME type as a documented file input; do not substitute extracted text or the rendered PDF for this transfer. Pass a rendition of those same bytes and page evidence separately. Request machine inspection of DOCX structure and visual inspection of every page; validate returned structured evidence and reject fabricated source anchors. A provider that merely accepts a DOCX but exposes only extracted text must be reported as file/text reading, not code/OOXML inspection.
- [ ] Record three distinct milestones: remote original-file transfer accepted, source-linked file/structure observations received, and visual observations covering every rendered page. Reject an AI self-report without verifiable source quotes/page references as proof of full reading.
- [ ] Bind request/response to source SHA, source generation, rendition hash, model and consent ID; cancel or discard late/stale results. Limit input by explicit file/page caps and show when a cap prevents full review.
- [ ] Plan/run `test/full-document-ai-provider.test.ts` with a synthetic provider for full coverage, omitted page, wrong SHA, missing quote, provider timeout, stale response and unsupported capability. Expected: no result can claim full code-and-visual review unless all parts completed.

### Task 4: Local endpoint and explicit full-file consent UI

**Files:** Modify `server.ts`, `src/App.tsx`, `src/components/ImportStepView.tsx`, `docs/SIWC_LOCAL.md`; create `test/full-document-consent.test.ts`.

**Interfaces:** `POST /api/ai/review-full-source` accepts one DOCX with verified SHA, source generation, provider and `consentScope: 'full_docx_and_pages'`; `GET /api/ai/full-source-capability` returns safe status with no token. Response reports coverage and errors without returning the original bytes.

- [ ] Keep the old text-only checkbox and endpoint semantics unchanged. Add a separate per-file consent that states original DOCX bytes plus PDF/page images leave the machine, names the destination/provider, and shows file SHA/size and page count plus documented provider retention/deletion behavior. Reset on source/provider change. Never infer this consent from the existing checkbox.
- [ ] Reuse local Host/Origin/loopback checks, encrypted session storage, upload size and abort handling; verify request hash and reject missing consent before rendering or remote transfer. Cap local memory and temporary files deliberately.
- [ ] Surface distinct states: not consented, rendering, original-file transfer, file/text read, code/structure read, page review, partial review, fully reviewed, unavailable and failed. Show per-capability reason when unsupported. `40/40` alone must never imply an original-file or visual pass.
- [ ] Plan/run `test/full-document-consent.test.ts` and UI pointer/keyboard acceptance for absent consent, replay, file swap, disconnect, cancel and unsupported transport. Expected: no original byte crosses the AI boundary in any denied case.

### Task 5: End-to-end evidence handoff

**Files:** Modify `src/shared/fullDocumentAiProtocol.ts` and `docs/SIWC_LOCAL.md` as needed; create `test/full-document-evidence-contract.test.ts`.

**Interfaces:** A read-only `FullDocumentEvidenceBundle` contains source SHA/generation, capability record, visual manifest, AI observations and exact completion/failure flags. The semantic plan consumes this bundle, never raw provider text.

- [ ] Validate that local source, remote file-transfer record, rendered pages and AI observations share one source SHA and request generation; serialize no token or entire DOCX into the draft. Distinguish full original-file transfer from merely delivering all extracted text in chunks.
- [ ] Plan/run synthetic end-to-end checks for all-page coverage, cancelled request and reconnect. Then perform a separate real local-account acceptance using a nonsensitive test document only if capability exists.
- [ ] Gate result independently for `original_file_transfer`, `provider_file_read`, `code_read` and `all_page_visual_review`: `PASS`, `FAIL`, `BLOCKED_BY_PROVIDER` or `NOT_VERIFIED` with evidence. Only all required `PASS` values permit the label “AI read the entire DOCX by code and visually”; do not reclassify the text-only path as full review.
