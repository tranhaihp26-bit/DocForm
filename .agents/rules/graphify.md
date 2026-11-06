---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions.
---

## Graphify Developer Navigation

`graphify-out/` is a local code-structure index that can help agents navigate cross-file relationships. It is a navigation aid, not a source of truth or proof of runtime behavior, test results, or legal compliance.

- For broad or cross-file codebase questions, use `graphify query "<question>"`; use `graphify path "<A>" "<B>"` or `graphify explain "<concept>"` for focused navigation. For a narrow task that already identifies its files, follow the task-specific source and test order in `AGENTS.md` first and use Graphify only if it adds useful navigation.
- Preserve all existing repository instructions and the user's task constraints. Graphify does not replace `docs/CODEBASE_MAP.md`, targeted source/test review, or runtime validation. Treat inferred graph edges as hypotheses and verify claims against current code and tests.
- Keep this project's graph code-only: build with `graphify extract . --code-only` and `GRAPHIFY_BACKEND=none`. Do not semantically index DOCX/PDF files, uploaded documents, OCR, or document fixtures.
- Set `GRAPHIFY_QUERY_LOG_DISABLE=1` before `query`, `path`, or `explain`; Graphify versions may store query text and corpus paths locally.
- After code changes, if a graph exists, refresh it with `graphify update .` (AST-only). If an update fails, report that instead of treating the graph as current.
