import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("full-text review panel shows exact local extraction inventory and separate provider consent", () => {
  const source = fs.readFileSync("src/components/FullTextReviewPanel.tsx", "utf8");
  assert.match(source, /all_extracted_text/u);
  assert.match(source, /Kiểm kê văn bản trích xuất trên máy/u);
  assert.match(source, /Không gửi tệp DOCX, PDF, ảnh/u);
  assert.match(source, /data-testid="full-text-provider-consent"/u);
  assert.match(source, /data-testid="full-text-technical-details"/u);
  assert.match(source, /Không gửi tệp DOCX, PDF, ảnh trang/u);
  assert.match(source, /Mỗi lần gửi hoặc thử lại đều do bạn nhấn nút/u);
  assert.match(source, /excluded\.map/u);
  assert.match(source, /part\.partUri/u);
  assert.match(source, /providerTierNotice/u);
});

test("full-text review UI offers per-chunk progress, cancellation and failed-segment-only retry", () => {
  const source = fs.readFileSync("src/components/FullTextReviewPanel.tsx", "utf8");
  assert.match(source, /Đang rà soát/u);
  assert.match(source, /Hủy rà soát/u);
  assert.match(source, /Thử lại các đoạn chưa có phản hồi/u);
  assert.match(source, /failedSegmentIds\.length/u);
  assert.match(source, /responseReceivedSegmentIds/u);
});

test("full-text panel is part of the source step without reusing coarse partition consent", () => {
  const importView = fs.readFileSync("src/components/ImportStepView.tsx", "utf8");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(importView, /FullTextReviewPanel/u);
  assert.match(importView, /fullTextReview\?\s*:/u);
  assert.match(app, /fullTextConsentChecked/u);
  assert.match(app, /runFullTextReview\(false\)/u);
  assert.match(app, /runFullTextReview\(true\)/u);
  assert.match(importView, /aiPartitionConsent/u);
});
