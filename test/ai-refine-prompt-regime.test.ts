import test from "node:test";
import assert from "node:assert/strict";
import { buildAiRefinePrompt } from "../src/server/aiRefinePrompt.ts";

test("AI refinement keeps the selected Party regime in its instructions", () => {
  const prompt = buildAiRefinePrompt("formalize", "<p>Văn bản mẫu</p>", "party");
  assert.match(prompt, /Hướng dẫn 05-HD\/VPTW/);
  assert.match(prompt, /văn bản của Đảng/);
  assert.doesNotMatch(prompt, /văn phong quản lý nhà nước/);
  assert.match(prompt, /<user_document_data>\s*<p>Văn bản mẫu<\/p>\s*<\/user_document_data>/);
});

test("AI refinement keeps administrative wording under Nghị định 30", () => {
  const prompt = buildAiRefinePrompt("proofread", "<p>Văn bản mẫu</p>", "administrative");
  assert.match(prompt, /Nghị định 30\/2020\/NĐ-CP/);
  assert.doesNotMatch(prompt, /Hướng dẫn 05-HD\/VPTW/);
});
