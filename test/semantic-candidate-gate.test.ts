import test from "node:test";
import assert from "node:assert/strict";
import { createExportCandidateManager, exportCandidateKey, type ExportCandidateSnapshot } from "../src/utils/exportCandidate.ts";
import JSZip from "jszip";

test("candidate identity changes when current semantic evidence or decision fingerprint changes", async () => {
  const invalidSynthetic = await new JSZip().file("wrong.txt", "SYNTHETIC NON-DOCX").generateAsync({ type: "uint8array" });
  const manager = createExportCandidateManager(async () => invalidSynthetic);
  const input: ExportCandidateSnapshot = { doc: {
    orgHeader1: "", orgHeader2: "", nationalHeader1: "", nationalHeader2: "", locationAndDate: "",
    documentType: "BIÊN BẢN", referenceNumber: "", subject: "", bodyHtml: "", signTitle: "", signName: "", recipients: "",
  }, standardType: "state", reviewBlocks: [], structuredImport: null, semanticEvidenceFingerprint: "semantic-review-1",
    sourceVisualEvidenceFingerprint: "visual-source-1" };
  const first = await manager.prepare(input);
  assert.ok(first);
  const changedInput = { ...input, semanticEvidenceFingerprint: "semantic-review-2" };
  const second = await manager.prepare(changedInput);
  assert.ok(second);
  assert.notEqual(first.key, second.key);
  assert.notEqual(first.instanceId, second.instanceId);
  assert.equal(manager.isCurrent(first, changedInput), false);
  assert.equal(manager.isCurrent(second, changedInput), true);
  const changedVisual = { ...changedInput, sourceVisualEvidenceFingerprint: "visual-source-2" };
  const third = await manager.prepare(changedVisual);
  assert.ok(third);
  assert.notEqual(second.key, third.key);
  assert.equal(manager.isCurrent(second, changedVisual), false);
  const withManifest = { ...input, fullTextManifestSha256: "manifest-1", ruleSelectionFingerprint: "rules-1", sourceGeneration: 4 };
  const manifestCandidate = await manager.prepare(withManifest);
  assert.ok(manifestCandidate);
  for (const changedEvidence of [
    { ...withManifest, fullTextManifestSha256: "manifest-2" },
    { ...withManifest, ruleSelectionFingerprint: "rules-2" },
    { ...withManifest, sourceGeneration: 5 },
  ]) {
    assert.notEqual(exportCandidateKey(changedEvidence), manifestCandidate.key,
      "manifest, rule selection and source generation must each bind candidate identity");
  }
});
