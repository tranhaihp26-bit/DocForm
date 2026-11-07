# PA-06 — Renderer evidence record schema

**Status:** evidence contract draft. This file defines how renderer evidence must be recorded; it is not Office acceptance, fidelity approval, or production readiness.

## Required record

Each corpus case has one record with these fields:

| Field | Required content |
|---|---|
| `caseId` | Stable case identifier, unique within the corpus. |
| `corpusClass` | `synthetic`, `deidentified`, or `approved-private`; private source files stay out of the repository unless their owner has explicitly approved storage. |
| `purpose` | The behavior or layout the case is intended to exercise, such as ordinary text flow, tables, headers, images, or a security rejection. |
| `source` | SHA-256 and byte length of the exact DOCX tested. Do not publish the source file or text unless permitted. |
| `documentContext` | Regime, document type, profile/version, and expected page count when known. Record unknown values as `NOT_ASSESSED`; do not infer them from a filename. |
| `expected` | Expected render eligibility and page/layout observations, with the source of the expectation (fixture construction or approved reference). |
| `candidate` | Candidate SHA-256 and revision when comparing source to an exported candidate; otherwise `NOT_APPLICABLE`. |
| `renderer` | Product, version/build, OS version, locale, and relevant font set. Record missing fields as `NOT_VERIFIED`. |
| `renderResult` | `PASS`, `FAIL`, `NOT_VERIFIED_RENDER`, or `BLOCKED`; include PDF SHA-256, page count, per-page image hashes, and failure code when output exists. |
| `visualReview` | `PASS`, `FAIL`, `NOT_VERIFIED`, or `NOT_APPLICABLE`, plus reviewer role, review date, pages/regions inspected, and concrete observations. |
| `limitations` | Unsupported features, missing tools, untested pages, or known gaps for this case. |

## Evidence rules

- Hashes and machine checks bind evidence to exact bytes; they do not prove visual fidelity.
- A synthetic fixture may prove a parser/security contract, but it cannot establish Word/WPS layout acceptance.
- `PASS` for rendering or visual review requires actual output from the named Word or WPS build and a recorded page-by-page review. A missing Office runtime or unavailable golden reference remains `NOT_VERIFIED_RENDER` / `NOT_VERIFIED`.
- Keep source and candidate evidence separate. Compare only when their hashes and candidate revision are recorded.
- Store only synthetic or explicitly approved/deidentified documents in public repository artifacts. Put private corpus evidence in its authorized storage and record a non-sensitive reference ID here.

## Synthetic cases in this lane

The tests in [`../../test/source-visual-renderer.test.ts`](../../test/source-visual-renderer.test.ts) create synthetic packages in memory for external relationships (including an encoded `.rels` part alias), decoded duplicate part names, encoded-delimiter traversal, archive path traversal, misleading expanded-size metadata, ZIP32 sentinel counts, and local/central metadata disagreement. These cases are security-contract evidence only. No Word/WPS render or fidelity result was collected in this lane.
