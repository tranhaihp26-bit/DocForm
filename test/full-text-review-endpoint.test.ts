import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FullTextSegment } from "../src/shared/fullDocumentTextProtocol.ts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceSha256 = "a".repeat(64);

function reviewRequest(provider: "gemini" | "chatgpt") {
  const text = "Synthetic endpoint paragraph.";
  const segments: FullTextSegment[] = [{
    id: "segment-" + provider,
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
    requestId: "endpoint-test-" + provider,
    provider,
    consent: {
      scope: "all_extracted_text",
      accepted: true,
      consentId: "synthetic-consent-" + provider,
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

test("local full-text endpoint binds consent and routes only to the selected injected provider", async t => {
  process.env.DOCFORM_TEST_NO_DOTENV = "true";
  process.env.NODE_ENV = "production";
  process.env.DOCFORM_SIWC_ENABLED = "false";
  const { startServer } = await import("../server.ts");
  const selected: string[] = [];
  const prompts: string[] = [];
  const server = await startServer({
    port: 0,
    bindHost: "127.0.0.1",
    fullTextAiProviderFactory: request => {
      selected.push(String((request.body as any)?.provider));
      return async prompt => {
        prompts.push(prompt);
        const instructionOffset = prompt.indexOf("\nINSTRUCTIONS\n");
        const envelope = JSON.parse(prompt.slice(0, instructionOffset));
        if (envelope.marker === "SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS") {
          return {
            model: "synthetic",
            text: JSON.stringify({
              schemaVersion: 1,
              sourceSha256,
              sourceGeneration: 3,
              crossReferences: [],
            }),
          };
        }
        const primaryStart = prompt.indexOf("PRIMARY_SEGMENTS_JSON\n") + "PRIMARY_SEGMENTS_JSON\n".length;
        const primaryEnd = prompt.indexOf("\nCONTEXT_SEGMENTS_JSON", primaryStart);
        const primary = JSON.parse(prompt.slice(primaryStart, primaryEnd));
        return {
          model: "synthetic",
          text: JSON.stringify({
            schemaVersion: 1,
            sourceSha256,
            sourceGeneration: 3,
            chunkId: envelope.chunkId,
            segmentResults: primary.map((segment: any) => ({
              segmentId: segment.id,
              status: "no_finding",
              observations: [],
            })),
          }),
        };
      };
    },
  });
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
  const baseUrl = "http://127.0.0.1:" + address.port;
  for (const provider of ["gemini", "chatgpt"] as const) {
    const response = await fetch(baseUrl + "/api/ai/review-full-text", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify(reviewRequest(provider)),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /application\/x-ndjson/);
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    const final = events.find(event => event.type === "final")?.response;
    assert.equal(final?.coverage.status, "complete");
    assert.equal(final?.provider, provider);
    assert.equal(final?.sourceGeneration, 3);
    assert.deepEqual(final?.coverage.semanticResponse.noFindingSegmentIds, ["segment-" + provider]);
  }
  assert.deepEqual(selected, ["gemini", "chatgpt"]);
  assert.ok(prompts.every(prompt => prompt.includes("Synthetic endpoint paragraph.")));
  assert.ok(prompts.every(prompt => !/docxBytes/i.test(prompt)));

  const invalidConsent = reviewRequest("gemini");
  invalidConsent.consent.provider = "chatgpt" as any;
  const denied = await fetch(baseUrl + "/api/ai/review-full-text", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify(invalidConsent),
  });
  assert.equal(denied.status, 403);

  const rawFileAttempt = { ...reviewRequest("gemini"), docxBytes: "synthetic bytes" };
  const rejected = await fetch(baseUrl + "/api/ai/review-full-text", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify(rawFileAttempt),
  });
  assert.equal(rejected.status, 400);
});
