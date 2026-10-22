import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("metadata wizard explains the disabled summary action and asks before confirming source-evidenced Biên bản", () => {
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(source, /Chưa thể xem tóm tắt: hãy xác nhận loại văn bản/u);
  assert.match(source, /sourceEvidenceSuggestsMinutes/u);
  assert.match(source, /Xác nhận “Biên bản”/u);
  assert.match(source, /aria-describedby=\{!doc\.documentType\?"doctype-required-reason":undefined\}/u);
  assert.match(source, /data-testid="semantic-review-panel"/u);
  assert.match(source, /Không gửi tệp, PDF hoặc ảnh sang AI/u);
});

test("local visual status and provider capability are shown separately", () => {
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(source, /data-testid="local-source-visual-status"/u);
  assert.match(source, /data-testid="provider-capability-status"/u);
  assert.match(source, /Trang đã dựng/u);
  assert.match(source, /BLOCKED_BY_PROVIDER|value\.status/u);
  assert.match(source, /originalAvailable\?"đã lưu, có thể tải lại"/u);
});
