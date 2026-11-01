# Graphify for coding agents

Graphify is an optional development navigation tool, not an application runtime dependency. This workspace was configured with the `graphifyy` CLI version `0.9.100` and local skills for Antigravity, Codex and Hermes.

Install the CLI separately, for example with `uv tool install graphifyy==0.9.100`, and use the CLI's help for platform-specific skill setup. Local skill copies and agent hooks are excluded from Git so they can be installed for each machine.

Project guidance lives in `.agents/rules/graphify.md`; `.graphifyignore` excludes vendored SDKs and the generated output. Generated `graphify-out/` is local and is not published. It can become stale after source changes; verify every graph result against current source/tests.

Use code-only AST extraction for this project. Private reference DOCX/PDF files, uploaded documents and source fixtures must not be semantically indexed or sent to a provider by the navigation workflow. No graph query establishes test success, document fidelity, legal compliance or release approval.
