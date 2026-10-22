import test from "node:test";
import assert from "node:assert/strict";

const capabilityApi = await import("../src/server/fullDocumentCapability.ts").catch(() => undefined) as any;

function textOnlyClient(session: Record<string, unknown>, models: Array<{ slug: string; displayName: string }> = [{ slug: "synthetic-model", displayName: "Synthetic model" }]) {
  return {
    getSession: async () => session,
    listModels: async () => models,
    streamResponse: async () => ({ text: "synthetic" }),
  };
}

test("text-only ChatGPT plan transport blocks each full-document capability", async () => {
  assert.ok(capabilityApi, "full-document capability implementation must exist");
  const capability = await capabilityApi.getFullDocumentAiCapability(textOnlyClient({ status: "connected", sharing: true }));

  assert.equal(capability.features.original_file_transfer.status, "BLOCKED_BY_PROVIDER");
  assert.equal(capability.features.provider_file_read.status, "BLOCKED_BY_PROVIDER");
  assert.equal(capability.features.code_read.status, "BLOCKED_BY_PROVIDER");
  assert.equal(capability.features.all_page_visual_review.status, "BLOCKED_BY_PROVIDER");
  assert.equal(capabilityApi.canStartFullDocumentReview(capability, true), false);
});

test("disconnected and expired ChatGPT sessions cannot start a full-document review", async () => {
  assert.ok(capabilityApi, "full-document capability implementation must exist");
  for (const status of ["disconnected", "reauth_required"]) {
    const capability = await capabilityApi.getFullDocumentAiCapability(textOnlyClient({ status, sharing: true }, []));
    assert.equal(capability.session.status, status);
    assert.equal(capabilityApi.canStartFullDocumentReview(capability, true), false);
  }
});

test("an unsupported model cannot start a full-document review", async () => {
  assert.ok(capabilityApi, "full-document capability implementation must exist");
  const capability = await capabilityApi.getFullDocumentAiCapability(
    textOnlyClient({ status: "connected", sharing: true }, []),
  );

  assert.equal(capability.modelAvailable, false);
  assert.equal(capabilityApi.canStartFullDocumentReview(capability, true), false);
});

test("the review gate requires all capabilities and a separate file consent", () => {
  assert.ok(capabilityApi, "full-document capability implementation must exist");
  const supportedMock = {
    provider: "chatgpt-plan",
    transport: "synthetic supported route",
    configured: true,
    textInput: { status: "SUPPORTED_BY_ADAPTER", reason: "synthetic" },
    fullTextManifest: { status: "PASS", reason: "synthetic" },
    session: { status: "connected", sharing: true },
    modelAvailable: true,
    oauthFileInputProbe: "NOT_VERIFIED",
    oauthFileInputProbeReason: "synthetic route mock",
    features: Object.fromEntries([
      "original_file_transfer",
      "provider_file_read",
      "code_read",
      "all_page_visual_review",
    ].map(key => [key, { status: "PASS", reason: "synthetic supported-route fixture" }])),
    fullReviewStatus: "PASS",
  };

  assert.equal(capabilityApi.canStartFullDocumentReview(supportedMock, false), false);
  assert.equal(capabilityApi.canStartFullDocumentReview(supportedMock, true), true);
});

test("provider capability matrix separates Gemini text support from unverified full-document lanes", async () => {
  assert.ok(capabilityApi?.getAiProviderCapabilities, "provider capability matrix must exist");
  const sentinelSecret = "synthetic-gemini-key-must-not-leak";
  const capabilities = await capabilityApi.getAiProviderCapabilities({
    chatgptClient: textOnlyClient({ status: "connected", sharing: true }),
    geminiApiKey: sentinelSecret,
  });

  const gemini = capabilities.providers.gemini;
  assert.equal(gemini.configured, true);
  assert.equal(gemini.textInput.status, "SUPPORTED_BY_ADAPTER");
  assert.equal(gemini.fullTextManifest.status, "SUPPORTED_BY_ADAPTER");
  assert.equal(gemini.dataUseTier.tier, "unknown");
  assert.equal(gemini.dataUseTier.status, "NOT_VERIFIED");
  assert.equal(gemini.features.original_file_transfer.status, "NOT_VERIFIED");
  assert.equal(gemini.features.provider_file_read.status, "NOT_VERIFIED");
  assert.equal(gemini.features.code_read.status, "NOT_VERIFIED");
  assert.equal(gemini.features.all_page_visual_review.status, "NOT_VERIFIED");
  assert.equal(JSON.stringify(capabilities).includes(sentinelSecret), false);
});

test("provider capability matrix keeps the current ChatGPT-plan adapter text-only", async () => {
  assert.ok(capabilityApi?.getAiProviderCapabilities, "provider capability matrix must exist");
  const capabilities = await capabilityApi.getAiProviderCapabilities({
    chatgptClient: textOnlyClient({ status: "connected", sharing: true }),
    geminiApiKey: "",
  });

  const chatgpt = capabilities.providers["chatgpt-plan"];
  assert.equal(chatgpt.textInput.status, "SUPPORTED_BY_ADAPTER");
  assert.equal(chatgpt.fullTextManifest.status, "SUPPORTED_BY_ADAPTER");
  assert.equal(chatgpt.session.status, "connected");
  assert.equal(chatgpt.features.original_file_transfer.status, "BLOCKED_BY_PROVIDER");
  assert.equal(chatgpt.features.provider_file_read.status, "BLOCKED_BY_PROVIDER");
  assert.equal(chatgpt.features.code_read.status, "BLOCKED_BY_PROVIDER");
  assert.equal(chatgpt.features.all_page_visual_review.status, "BLOCKED_BY_PROVIDER");
});
