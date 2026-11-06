# Graphify for coding agents

Graphify is an optional local code-navigation aid. It is not a DocForm runtime dependency, a test runner, or evidence that a document meets a legal or formatting rule. This project uses a code-only graph because the repository contains document fixtures and reference DOCX/PDF files.

## Install for Codex

The official CLI package is `graphifyy` (the command is `graphify`). As of 2026-11-02, the pinned version used for this project is `0.9.100` ([official release](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.100)). Install it separately from the JavaScript dependencies, then register the project skill:

```powershell
uv tool install graphifyy==0.9.100
graphify install --project --platform codex
```

The Codex installer may append generated guidance to `AGENTS.md` and writes a local skill/hook under `.codex/`. This repository already has a concise, curated Graphify section in `AGENTS.md`; merge setup changes there instead of appending a duplicate. Generated `.codex/skills/graphify/` and `.codex/hooks.json` are ignored by Git.

## Build and refresh the graph

Use only the local AST path. `--code-only` skips documents, PDFs, images, and other non-code inputs; `GRAPHIFY_BACKEND=none` disables Graphify's LLM backends as an additional guard.

```powershell
$env:GRAPHIFY_BACKEND = 'none'
$env:GRAPHIFY_QUERY_LOG_DISABLE = '1'
graphify extract . --code-only
```

After code changes, refresh an existing code-only graph with:

```powershell
$env:GRAPHIFY_BACKEND = 'none'
graphify update .
```

Keep `graphify-out/` local and ignored. It can be stale until updated. `.graphifyignore` excludes project documents, fixtures, media, and generated output as a second guard if a command omits `--code-only`.

## Use and limits

- Use `graphify query`, `graphify path`, and `graphify explain` for broad or cross-file navigation. For narrow tasks, use the task-specific source/test order in `AGENTS.md` first.
- Graphify records extracted and inferred relationships; confirm important claims in current source and tests. It cannot prove runtime behavior, test results, candidate fidelity, legal compliance, or release readiness.
- Set `GRAPHIFY_QUERY_LOG_DISABLE=1` before queries; Graphify versions may store query text and repository paths locally.
- Never semantically index or send DocForm reference documents, uploaded files, OCR, or document fixtures to a model through Graphify.
