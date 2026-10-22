import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("metadata wizard explains the disabled summary action and asks before confirming source-evidenced Biên bản", () => {
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(source, /Chưa thể xem tóm tắt: hãy xác nhận loại văn bản/u);
  assert.match(source, /sourceEvidenceSuggestsMinutes/u);
  assert.match(source, /data-testid="doctype-source-suggestion"/u);
  assert.match(source, /Gợi ý từ nội dung/u);
  assert.match(source, /Xác nhận “Biên bản”/u);
  assert.match(source, /onConfirmProfileDecision/u);
  assert.match(source, /Dùng Cơ quan chung/u);
  assert.match(source, /Vẫn dùng Hoa tiêu miền Bắc/u);
  assert.match(source, /aria-describedby=\{!doc\.documentType\?"doctype-required-reason":undefined\}/u);
  assert.match(source, /data-testid="semantic-review-panel"/u);
  assert.match(source, /Không gửi tệp DOCX, PDF hoặc ảnh trang/u);
  assert.match(app, /profileDecisionCovers/u);
  assert.match(app, /!sourceMismatch\.profileMismatch\s*\|\|\s*profileDecisionValid/u);
  assert.match(app, /canEnterProfileDecision/u);
  assert.match(app, /stepIsComplete=.*canEnterProfileDecision/u);
});

test("local visual status and provider capability are shown separately", () => {
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(source, /data-testid="local-source-visual-status"/u);
  assert.match(source, /data-testid="provider-capability-status"/u);
  assert.match(source, /Đã dựng đủ trang/u);
  assert.match(source, /BLOCKED_BY_PROVIDER|value\.status/u);
  assert.match(source, /originalAvailable\?"Tệp gốc đã lưu trên máy\."/u);
  assert.match(source, /Gói Gemini hiện tại chưa được xác minh là Free Tier/u);
});

test("AI and semantic review details are optional disclosures with useful default summaries", () => {
  const source = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  assert.match(source, /data-testid="ai-source-review-options"/u);
  assert.match(source, /Đối chiếu bằng AI \(tùy chọn\)/u);
  assert.match(source, /id="df-step1-semantic-review"/u);
  assert.match(source, /Xem các mục cần duyệt/u);
  assert.match(source, /Chi tiết kỹ thuật/u);
  assert.match(source, /data-semantic-technical-details/u);
  assert.match(source, /Xem bố cục trang gốc/u);
});
