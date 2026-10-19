import assert from "node:assert/strict";
import { computeVisualDiff, tokenizeWords, htmlToStructuredText } from "../src/utils/diffUtils.ts";

async function main() {
  console.log("=== KIỂM THỬ VISUAL DIFF UTILITIES ===");

  // Test 1: tokenizeWords
  const tokens = tokenizeWords("Xin chào, tôi là AI!");
  assert.ok(tokens.includes("Xin"));
  assert.ok(tokens.includes("chào"));
  assert.ok(tokens.includes(","));
  assert.ok(tokens.includes("AI"));
  console.log("[PASS] Tokenizer handles Vietnamese words and punctuation");

  // Test 2: computeVisualDiff with typo correction
  const original = "<p>Thực hiện Quyết định số 12/QĐ-UBND của ủy ban nhân dân...</p>";
  const refined = "<p>Thực hiện Quyết định số 12/QĐ-UBND của Ủy ban nhân dân...</p>";

  const diff = computeVisualDiff(original, refined);
  assert.equal(diff.stats.deletedCount, 1, "Phát hiện 1 từ cũ viết sai 'ủy'");
  assert.equal(diff.stats.addedCount, 1, "Phát hiện 1 từ mới sửa đúng 'Ủy'");
  assert.ok(diff.inlineHtml.includes("<del"), "Inline HTML chứa thẻ del màu đỏ");
  assert.ok(diff.inlineHtml.includes("<ins"), "Inline HTML chứa thẻ ins màu xanh");
  assert.ok(diff.originalHighlightedHtml.includes("ủy"), "Bản gốc highlight từ cũ");
  assert.ok(diff.refinedHighlightedHtml.includes("Ủy"), "Bản mới highlight từ mới");
  console.log("[PASS] Visual Diff highlights typos and corrections accurately");

  // Test 3: Large text performance
  const largeOrig = "<p>Văn bản hành chính nhà nước ban hành theo Nghị định 30. </p>".repeat(20);
  const largeRef = "<p>Văn bản hành chính nhà nước được ban hành theo Nghị định 30/2020/NĐ-CP. </p>".repeat(20);
  const start = performance.now();
  const largeDiff = computeVisualDiff(largeOrig, largeRef);
  const duration = performance.now() - start;
  assert.ok(duration < 200, `Diff execution time must be under 200ms, took ${duration}ms`);
  console.log(`[PASS] Large text diff completed in ${duration.toFixed(1)}ms`);

  console.log("=== TẤT CẢ KIỂM THỬ DIFF UTILS ĐỀU PASS ===");
}

main().catch(console.error);
