import assert from "node:assert/strict";
import { computeVisualDiff } from "../src/utils/diffUtils.ts";

console.log("--- REPRO TEST: 1500-word completely different text triggering RangeError ---");

const a = '<p>' + Array.from(
  { length: 1500 },
  (_, i) => 'abc' + i + (i === 749 ? '.' : '')
).join(' ') + '</p>';

const b = '<p>' + Array.from(
  { length: 1500 },
  (_, i) => 'xyz' + i + (i === 749 ? '.' : '')
).join(' ') + '</p>';

try {
  const result = computeVisualDiff(a, b);
  console.log("Success completely different! Stats:", result.stats);
  assert.equal(result.stats.deletedCount, 1500);
  assert.equal(result.stats.addedCount, 1500);
  assert.equal(result.stats.unchangedCount, 0);
} catch (err: any) {
  console.error("CAUGHT UNEXPECTED ERROR:", err.name, err.message);
  process.exit(1);
}

console.log("--- TEST: 1500-word text with single word changed ---");
const wordsBase = Array.from({ length: 1500 }, (_, i) => `word${i}` + (i % 50 === 49 ? '.' : ''));
const textOrig = '<p>' + wordsBase.join(' ') + '</p>';
const wordsMod = [...wordsBase];
wordsMod[720] = 'MODIFIEDWORD';
const textMod = '<p>' + wordsMod.join(' ') + '</p>';

const resSingleChange = computeVisualDiff(textOrig, textMod);
console.log("Success single change! Stats:", resSingleChange.stats);
assert.equal(resSingleChange.stats.deletedCount, 1, "Should detect exactly 1 deleted word");
assert.equal(resSingleChange.stats.addedCount, 1, "Should detect exactly 1 added word");
assert.equal(resSingleChange.stats.unchangedCount, 1499, "Should detect 1499 unchanged words");
console.log("All diff tests passed cleanly!");
