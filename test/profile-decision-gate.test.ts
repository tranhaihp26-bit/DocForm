import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as profileDecision from "../src/utils/profileDecision.ts";

type Context = {
  sourceKey: string;
  regime: "state" | "party";
  sourceProfile: "company" | "other" | "unknown";
  chosenProfile: "company" | "generic";
};

const covers = profileDecision.profileDecisionCovers as unknown as (
  decision: (Context & { decidedAt: string }) | null | undefined,
  current: Context,
) => boolean;
const base: Context = {
  sourceKey: "sha256:abc:generation:4",
  regime: "state",
  sourceProfile: "other",
  chosenProfile: "company",
};

test("profile decision helper accepts only a complete decision for the current source context", () => {
  assert.equal(typeof profileDecision.profileDecisionCovers, "function");
  assert.equal(covers({ ...base, decidedAt: "2026-10-22T00:00:00.000Z" }, base), true);
  assert.equal(covers(null, base), false);
  assert.equal(covers({ ...base, decidedAt: "" }, base), false);
});

test("profile decisions expire when source, regime, evidence, or chosen profile changes", () => {
  const decision = { ...base, decidedAt: "2026-10-22T00:00:00.000Z" };
  assert.equal(covers(decision, { ...base, sourceKey: "sha256:def:generation:5" }), false);
  assert.equal(covers(decision, { ...base, regime: "party" }), false);
  assert.equal(covers(decision, { ...base, sourceProfile: "unknown" }), false);
  assert.equal(covers(decision, { ...base, chosenProfile: "generic" }), false);
});

test("all Step 2 and Step 3 navigation and completion gates include profile resolution", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const importView = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(app, /const canEnterProfileDecision\s*=\s*!sourceMismatch\.profileMismatch\s*\|\|\s*profileDecisionValid/u);
  assert.match(app, /const canExportSource\s*=.*canEnterProfileDecision/u);
  assert.match(app, /const canEnterStep\s*=.*canEnterProfileDecision/u);
  assert.match(app, /const stepIsComplete\s*=.*canEnterProfileDecision/u);
  assert.match(app, /hasImportedFile:\s*Boolean\(sourceOrigin\s*===\s*"uploaded_file"\s*\|\|\s*originalSnapshot\?\.sourceType\s*===\s*"uploaded_file"/u);
  assert.match(importView, /const hasImportedFile\s*=\s*sourceOrigin\s*===\s*"uploaded_file"\s*\|\|\s*originalSnapshot\?\.sourceType\s*===\s*"uploaded_file"/u);
  assert.match(app, /const restoredMismatch\s*=\s*deriveSourceMismatch\(\{\s*hasSelectedSource:\s*restoredOrigin\s*!==\s*"none",\s*hasImportedFile:\s*Boolean\(\s*restoredOrigin\s*===\s*"uploaded_file"\s*\|\|\s*savedDraft\.originalSnapshot\?\.sourceType\s*===\s*"uploaded_file"/su);
  assert.match(app, /const restoredMaxStep:\s*1\s*\|\s*2\s*\|\s*3\s*=\s*restoredMismatch\.profileMismatch\s*\?\s*1/u);
});
