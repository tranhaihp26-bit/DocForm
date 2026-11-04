import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FullTextSegment } from "../src/shared/fullDocumentTextProtocol.ts";
import { isReviewProposalValid } from "../src/utils/documentSessionTypes.ts";

const sourceSha256 = "a".repeat(64);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

function fullTextRequest(provider: "openai_api" | "gemini" = "openai_api") {
  const text = "FULLTEXT_SOURCE_SENTINEL";
  const segments: FullTextSegment[] = [{
    id: "segment-openai",
    sourceSha256,
    sourceGeneration: 3,
    packagePartUri: "/word/document.xml",
    sourceAnchor: "body:p[0]",
    storyKind: "body",
    documentOrder: 0,
    sourceBlockId: "block-0",
    visibilityClass: "visible_text",
    text,
    textSha256: sha(text),
  }];
  const parts = [{ partUri: "/word/document.xml", status: "included", segmentIds: segments.map(segment => segment.id) }];
  const excluded: any[] = [];
  const manifestSha256 = sha(JSON.stringify({
    extractionVersion: "docx-text-manifest-v1",
    sourceSha256,
    sourceGeneration: 3,
    segments: segments.map(({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId,
      cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    }) => ({
      id, packagePartUri, sourceAnchor, storyKind, documentOrder, sourceBlockId, tableId,
      cellId, rowIndex, cellIndex, paragraphIndex, noteId, relationshipId, textSha256,
    })),
    parts,
    excluded,
  }));
  return {
    schemaVersion: 1,
    requestId: "synthetic-openai-full-text",
    provider,
    consent: {
      scope: "all_extracted_text",
      accepted: true,
      consentId: "synthetic-consent-openai",
      provider,
      sourceSha256,
      sourceGeneration: 3,
      manifestSha256,
    },
    sourceSha256,
    sourceGeneration: 3,
    manifestSha256,
    regime: "administrative",
    documentType: "synthetic",
    textScope: "all_extracted_text",
    extractionCoverage: { status: "complete", totalIncludedSegments: 1, excludedCount: 0, includedParts: 1, partialParts: 0, excludedParts: 0 },
    parts,
    excluded,
    segments,
  };
}

function fakeOpenAiClient(options: { fail?: Error } = {}) {
  const calls: Array<{ request: any; options: any }> = [];
  return {
    calls,
    client: {
      responses: {
        create: async (request: any, requestOptions: any) => {
          calls.push({ request, options: requestOptions });
          if (options.fail) throw options.fail;
          const input = String(request.input);
          if (input.includes("Reply with exactly DOCFORM_API_CONNECTION_OK.")) {
            return { output_text: "DOCFORM_API_CONNECTION_OK", model: "synthetic-model" };
          }
          if (input.includes("SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS")) {
            const envelope = JSON.parse(input.slice(0, input.indexOf("\nINSTRUCTIONS\n")));
            return {
              output_text: JSON.stringify({ schemaVersion: 1, sourceSha256: envelope.sourceSha256, sourceGeneration: envelope.sourceGeneration, crossReferences: [] }),
              model: "synthetic-model",
            };
          }
          if (input.includes("PRIMARY_SEGMENTS_JSON\n")) {
            const envelope = JSON.parse(input.slice(0, input.indexOf("\nINSTRUCTIONS\n")));
            const start = input.indexOf("PRIMARY_SEGMENTS_JSON\n") + "PRIMARY_SEGMENTS_JSON\n".length;
            const end = input.indexOf("\nCONTEXT_SEGMENTS_JSON", start);
            const primary = JSON.parse(input.slice(start, end));
            return {
              output_text: JSON.stringify({
                schemaVersion: 1,
                sourceSha256: envelope.sourceSha256,
                sourceGeneration: envelope.sourceGeneration,
                chunkId: envelope.chunkId,
                segmentResults: primary.map((segment: any) => ({ segmentId: segment.id, status: "no_finding", observations: [] })),
              }),
              model: "synthetic-model",
            };
          }
          if (input.includes("targetBlockId")) return { output_text: JSON.stringify({ proposals: [{ id: "synthetic-openai-proposal", type: "spelling", target: "body", targetBlockId: "review-block", original: "PROPOSAL_SOURCE_SENTINEL", suggested: "Synthetic suggestion", reason: "Synthetic test evidence", confidence: "high" }] }), model: "synthetic-model" };
          if (input.includes("sourceBlockId")) return { output_text: JSON.stringify({ schemaVersion: 1, proposals: [] }), model: "synthetic-model" };
          if (input.includes("proposals")) return { output_text: JSON.stringify({ proposals: [] }), model: "synthetic-model" };
          return { output_text: "Synthetic refined sentence.", model: "synthetic-model" };
        },
      },
    },
  };
}

async function startLocalServer(t: any, options: Record<string, unknown> = {}) {
  process.env.DOCFORM_TEST_NO_DOTENV = "true";
  process.env.NODE_ENV = "production";
  process.env.DOCFORM_SIWC_ENABLED = "false";
  const { startServer } = await import("../server.ts");
  const server = await startServer({ port: 0, bindHost: "127.0.0.1", ...options } as any);
  await new Promise<void>((resolve, reject) => {
    if (server.listening) resolve();
    else {
      server.once("listening", resolve);
      server.once("error", reject);
    }
  });
  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function post(baseUrl: string, route: string, body: unknown, origin = baseUrl) {
  return fetch(baseUrl + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

test("local synthetic connection probe rejects remote origins and document payloads", async t => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-openai-key";
  t.after(() => { process.env.OPENAI_API_KEY = priorKey; });
  const { client } = fakeOpenAiClient();
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: client });

  const remoteOrigin = await post(baseUrl, "/api/ai/test-connection", { provider: "openai_api" }, "https://attacker.example");
  assert.equal(remoteOrigin.status, 403);
  const documentPayload = await post(baseUrl, "/api/ai/test-connection", { provider: "openai_api", text: "DOCUMENT_SENTINEL" });
  assert.equal(documentPayload.status, 400);
});

test("OpenAI connection probe uses only the fixed synthetic prompt", async t => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-openai-key";
  t.after(() => { process.env.OPENAI_API_KEY = priorKey; });
  const fake = fakeOpenAiClient();
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: fake.client });

  const response = await post(baseUrl, "/api/ai/test-connection", { provider: "openai_api" });
  assert.equal(response.status, 200);
  const result = await response.json() as any;
  assert.deepEqual(Object.keys(result).sort(), ["latencyMs", "model", "ok", "provider"]);
  assert.equal(result.ok, true);
  assert.equal(result.provider, "openai_api");
  assert.equal(fake.calls[0].request.input, "Reply with exactly DOCFORM_API_CONNECTION_OK.");
  assert.equal(fake.calls[0].request.store, false);
});

test("Gemini and OpenAI connection probes report missing local keys without calling a provider", async t => {
  const priorGeminiKey = process.env.GEMINI_API_KEY;
  const priorOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  t.after(() => {
    process.env.GEMINI_API_KEY = priorGeminiKey;
    process.env.OPENAI_API_KEY = priorOpenAiKey;
  });
  const fake = fakeOpenAiClient();
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: fake.client });

  for (const provider of ["gemini", "openai_api"] as const) {
    const response = await post(baseUrl, "/api/ai/test-connection", { provider });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, provider, errorCode: "not_configured" });
  }
  assert.equal(fake.calls.length, 0, "A missing-key check never calls either provider adapter");
});

test("each AI operation routes only to the selected OpenAI API provider", async t => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-openai-key";
  t.after(() => { process.env.OPENAI_API_KEY = priorKey; });
  const fake = fakeOpenAiClient();
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: fake.client });
  const originHeaders = { "Content-Type": "application/json", Origin: baseUrl };

  const partition = await fetch(baseUrl + "/api/ai/check-partitions", {
    method: "POST",
    headers: originHeaders,
    body: JSON.stringify({
      schemaVersion: 1, consent: true, provider: "openai_api", requestId: "synthetic-partition",
      regime: "administrative", sourceGeneration: 1, partitionRevision: 1,
      blocks: [{ id: "partition-block", index: 0, kind: "paragraph", text: "PARTITION_SOURCE_SENTINEL" }],
    }),
  });
  assert.equal(partition.status, 200);
  assert.match((await partition.text()), /"provider":"openai_api"/);

  const documentReview = await fetch(baseUrl + "/api/ai/review-document", {
    method: "POST",
    headers: originHeaders,
    body: JSON.stringify({
      provider: "openai_api", consent: true, standardType: "administrative", mode: "ai",
      structured: { fields: {}, body: { html: "" }, source: { filename: "synthetic.txt", type: "txt", blockCount: 1 } },
      rawText: "PROPOSAL_SOURCE_SENTINEL", blocks: [{ id: "review-block", text: "PROPOSAL_SOURCE_SENTINEL" }],
    }),
  });
  assert.equal(documentReview.status, 200);
  const documentReviewResult = await documentReview.json() as any;
  assert.equal(documentReviewResult.source, "openai_api_ai");
  assert.equal(isReviewProposalValid({
    id: "synthetic-openai-proposal", type: "spelling", target: "body", targetBlockId: "review-block",
    original: "SOURCE_TEXT", suggested: "SUGGESTED_TEXT", reason: "Synthetic test evidence", confidence: "high", source: "openai_api_ai",
  }), true, "OpenAI results remain valid in persisted review-proposal state");

  const fullTextReview = await fetch(baseUrl + "/api/ai/review-full-text", {
    method: "POST",
    headers: originHeaders,
    body: JSON.stringify(fullTextRequest()),
  });
  assert.equal(fullTextReview.status, 200);
  const fullTextEvents = (await fullTextReview.text()).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(fullTextEvents.find(event => event.type === "final")?.response.provider, "openai_api");

  const refine = await fetch(baseUrl + "/api/ai/refine-text", {
    method: "POST",
    headers: originHeaders,
    body: JSON.stringify({ provider: "openai_api", consent: true, text: "REFINE_SOURCE_SENTINEL", action: "proofread", standardType: "administrative" }),
  });
  assert.equal(refine.status, 200);
  const refined = await refine.json() as any;
  assert.equal(refined.source, "openai_api_ai");
  assert.equal(refined.refined, "Synthetic refined sentence.");

  const inputs = fake.calls.map(call => String(call.request.input));
  for (const sentinel of ["PARTITION_SOURCE_SENTINEL", "PROPOSAL_SOURCE_SENTINEL", "FULLTEXT_SOURCE_SENTINEL", "REFINE_SOURCE_SENTINEL"]) {
    assert.ok(inputs.some(input => input.includes(sentinel)), `selected OpenAI adapter should receive ${sentinel}`);
  }
  assert.ok(fake.calls.every(call => call.request.store === false));
});

test("selected OpenAI API with no key returns unavailable without a Gemini call", async t => {
  const priorOpenAiKey = process.env.OPENAI_API_KEY;
  const priorGeminiKey = process.env.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  t.after(() => {
    process.env.OPENAI_API_KEY = priorOpenAiKey;
    process.env.GEMINI_API_KEY = priorGeminiKey;
  });
  const fake = fakeOpenAiClient();
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: fake.client });
  const response = await post(baseUrl, "/api/ai/review-document", {
    provider: "openai_api", consent: true, standardType: "administrative", mode: "ai",
    structured: { fields: {}, body: { html: "" }, source: { filename: "synthetic.txt", type: "txt", blockCount: 1 } },
    rawText: "MISSING_KEY_SOURCE_SENTINEL", blocks: [],
  });
  assert.equal(response.status, 503);
  assert.notEqual((await response.json() as any).success, true);
  assert.equal(fake.calls.length, 0, "no adapter call is made when the selected OpenAI key is missing");
});

test("OpenAI selected-text refinement requires operation consent", async t => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-openai-key";
  t.after(() => { process.env.OPENAI_API_KEY = priorKey; });
  const fake = fakeOpenAiClient();
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: fake.client });
  const response = await post(baseUrl, "/api/ai/refine-text", {
    provider: "openai_api",
    text: "REFINE_CONSENT_SENTINEL",
    action: "proofread",
    standardType: "administrative",
  });

  assert.equal(response.status, 403);
  assert.equal(fake.calls.length, 0, "the provider is not called without consent");
});

test("OpenAI provider failure does not become an AI success fallback", async t => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-openai-key";
  t.after(() => { process.env.OPENAI_API_KEY = priorKey; });
  const fake = fakeOpenAiClient({ fail: new Error("RAW_PROVIDER_ERROR PRIVATE_SOURCE_SENTINEL") });
  const baseUrl = await startLocalServer(t, { openAiResponsesClient: fake.client });
  const response = await post(baseUrl, "/api/ai/review-document", {
    provider: "openai_api", consent: true, standardType: "administrative", mode: "ai",
    structured: { fields: {}, body: { html: "" }, source: { filename: "synthetic.txt", type: "txt", blockCount: 1 } },
    rawText: "PRIVATE_SOURCE_SENTINEL", blocks: [],
  });
  assert.equal(response.status, 503);
  const body = await response.json() as any;
  assert.notEqual(body.success, true);
  assert.doesNotMatch(JSON.stringify(body), /RAW_PROVIDER_ERROR|PRIVATE_SOURCE_SENTINEL|synthetic-openai-key/);
});
