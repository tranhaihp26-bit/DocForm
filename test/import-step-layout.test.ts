import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("metadata source review uses the full width while hidden context does not reserve a column", () => {
  const css = fs.readFileSync("src/components/ImportStepView.css", "utf8");
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(css, /\.df-import-step\[data-context-visible="false"\]\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
  assert.match(css, /\.df-import-step\[data-flow-phase="metadata"\][^{]*\[data-testid="semantic-review-panel"\]\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/su);
  assert.match(source, /data-testid="semantic-review-panel"/u);
  assert.match(source, /data-testid="ai-source-review-options"/u);
});

test("Step 1 action bar stays reachable and its disabled reason remains associated", () => {
  const css = fs.readFileSync("src/components/ImportStepView.css", "utf8");
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(css, /\.df-import-step\s+\.df-import-actions\s*\{[^}]*position:\s*sticky/su);
  assert.match(css, /\.df-import-step\s+\.df-import-actions\s*\{[^}]*bottom:\s*0/su);
  assert.match(css, /\.df-import-step\s+\.df-import-actions\s*\{[^}]*z-index:/su);
  assert.match(source, /aria-describedby=\{!doc\.documentType\?"doctype-required-reason":undefined\}/u);
});
