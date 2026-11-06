---
trigger: always_on
description: Optional Graphify navigation guidance; use only when it adds value beyond the Codebase Map and targeted source search.
---

## Graphify Developer Navigation

`graphify-out/` is a local code-structure index that can help agents navigate cross-file relationships. It is a navigation aid, not a source of truth or proof of runtime behavior, test results, or legal compliance.

- This rule being always available does not require Graphify execution for every task. Start with the Codebase Map and targeted source search. For broad or cross-file questions, optionally use `graphify query "<question>"`, `graphify path "<A>" "<B>"` or `graphify explain "<concept>"` when the CLI/graph is available and adds useful navigation; otherwise continue with source search.
- Preserve all existing repository instructions and the user's task constraints. Graphify does not replace `docs/CODEBASE_MAP.md`, targeted source/test review, or runtime validation. Treat inferred graph edges as hypotheses and verify claims against current code and tests.
- Keep this project's graph code-only: build with `graphify extract . --code-only` and `GRAPHIFY_BACKEND=none`. Do not semantically index DOCX/PDF files, uploaded documents, OCR, or document fixtures.
- Set `GRAPHIFY_QUERY_LOG_DISABLE=1` before `query`, `path`, or `explain`; Graphify versions may store query text and corpus paths locally.
- When relying on an existing graph after code changes, refresh it with `graphify update .` (AST-only). If refresh fails or cannot run, treat the graph as stale and verify through current source; report that limitation when it affects the result. Documentation-only changes do not require a graph refresh.
