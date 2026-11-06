import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./support/browserHarness.ts";

test("AI document review requires consent for the requested operation", async () => {
  const port = 5261;
  const server = await startTestServer(port);
  const request = {
    provider: "gemini",
    standardType: "administrative",
    structured: { fields: {}, body: { html: "" }, source: { filename: "synthetic.txt", type: "txt", blockCount: 0 } },
    rawText: "Nội dung tổng hợp.",
    blocks: [],
  };
  const post = (body: object) => fetch(`http://127.0.0.1:${port}/api/ai/review-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  try {
    const denied = await post(request);
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).error, /xác nhận gửi nội dung/);

    const openAiDenied = await post({ ...request, provider: "openai_api" });
    assert.equal(openAiDenied.status, 403, "OpenAI API review needs consent for the current operation");
    assert.match((await openAiDenied.json()).error, /xác nhận gửi nội dung/);

    const localOnly = await post({ ...request, mode: "local_only" });
    assert.equal(localOnly.status, 200, "A local-only rule check does not send data to AI");
    assert.equal((await localOnly.json()).source, "rule_fallback");

    const consented = await post({ ...request, consent: true });
    assert.equal(consented.status, 200, "Explicitly consented request reaches the existing local fallback when no provider key is configured");
  } finally {
    server.kill();
  }
});
