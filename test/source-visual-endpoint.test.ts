import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const requestApi = await import("../src/server/localSourceVisualRequest.ts").catch(() => undefined) as any;
const source = new TextEncoder().encode("synthetic-docx-bytes");
const sha256 = createHash("sha256").update(source).digest("hex");
const pageBytes = new TextEncoder().encode("synthetic rendered page bytes");
const pageSha256 = createHash("sha256").update(pageBytes).digest("hex");
const pdfBytes = new TextEncoder().encode("synthetic rendered PDF bytes");
const pdfSha256 = createHash("sha256").update(pdfBytes).digest("hex");

function request(overrides: Record<string, unknown> = {}) {
  return {
    host: "localhost:5050",
    origin: "http://localhost:5050",
    remoteAddress: "127.0.0.1",
    port: 5050,
    cloudRun: false,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    expectedSha256: sha256,
    sourceGeneration: 7,
    sourceBytes: source,
    ...overrides,
  };
}

test("accepts only a verified DOCX request from the local DocForm page", () => {
  assert.ok(requestApi, "local source visual request validator must exist");
  const result = requestApi.validateLocalSourceVisualRequest(request());
  assert.deepEqual(result, { valid: true, sourceSha256: sha256, sourceGeneration: 7 });
});

test("rejects a request when endpoint bytes do not match the claimed source SHA", () => {
  assert.ok(requestApi, "local source visual request validator must exist");
  const result = requestApi.validateLocalSourceVisualRequest(request({ expectedSha256: "0".repeat(64) }));
  assert.deepEqual(result, { valid: false, reason: "source_hash_mismatch" });
});

test("rejects non-local, cloud, non-DOCX, and stale request envelopes", () => {
  assert.ok(requestApi, "local source visual request validator must exist");
  const cases = [
    [request({ origin: "https://evil.example" }), "origin_not_local"],
    [request({ host: "localhost.evil.example:5050" }), "origin_not_local"],
    [request({ remoteAddress: "192.0.2.44" }), "origin_not_local"],
    [request({ cloudRun: true }), "cloud_disabled"],
    [request({ contentType: "application/json" }), "unsupported_media_type"],
    [request({ sourceGeneration: -1 }), "invalid_source_generation"],
    [request({ expectedSha256: "not-a-sha" }), "invalid_source_sha"],
  ] as const;

  for (const [input, reason] of cases) {
    assert.deepEqual(requestApi.validateLocalSourceVisualRequest(input), { valid: false, reason });
  }
});

test("local endpoint rehashes bytes and returns only the complete page manifest", async (t) => {
  process.env.DOCFORM_TEST_NO_DOTENV = "true";
  process.env.NODE_ENV = "production";
  const { startServer } = await import("../server.ts");
  let rendererCalls = 0;
  let receivedBytes: Uint8Array | undefined;
  const server = await startServer({
    port: 0,
    bindHost: "127.0.0.1",
    sourceVisualRenderer: async (bytes, expectedSha256, signal) => {
      rendererCalls++;
      receivedBytes = bytes.slice();
      assert.equal(expectedSha256, sha256);
      assert.ok(signal instanceof AbortSignal);
      return {
        manifest: {
          sourceSha256: sha256,
          rendererName: "Synthetic Word",
          rendererVersion: "synthetic-1",
          rasterizerName: "Synthetic PDF renderer",
          rasterizerVersion: "synthetic-2",
          pdfSha256,
          pageCount: 1,
          pages: [{ page: 1, sha256: pageSha256 }],
          complete: true,
        },
        pdfBytes,
        pages: [{ page: 1, imageBytes: pageBytes, sha256: pageSha256 }],
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
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const capabilityResponse = await fetch(`${baseUrl}/api/ai/full-document-capability`);
  assert.equal(capabilityResponse.status, 200);
  const capability = await capabilityResponse.json() as any;
  assert.equal(capability.oauthFileInputProbe, "NOT_VERIFIED");
  assert.ok(Object.values(capability.features).every((feature: any) => feature.status === "BLOCKED_BY_PROVIDER"));
  const headers = {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Origin: baseUrl,
    "X-Source-SHA256": sha256,
    "X-Source-Generation": "7",
  };
  const success = await fetch(`${baseUrl}/api/ai/render-source-docx`, {
    method: "POST",
    headers,
    body: source,
  });
  assert.equal(success.status, 200);
  const payload = await success.json() as any;
  assert.equal(payload.localEndpointReceived, true);
  assert.equal(payload.sourceSha256, sha256);
  assert.equal(payload.sourceGeneration, 7);
  assert.equal(payload.manifest.complete, true);
  assert.equal(payload.manifest.pageCount, 1);
  assert.equal(typeof payload.renderId, "string");
  assert.equal("pdfBytes" in payload, false);
  assert.equal(JSON.stringify(payload).includes("synthetic rendered PDF bytes"), false);
  assert.deepEqual(Buffer.from(receivedBytes!), Buffer.from(source));

  const pageResponse = await fetch(`${baseUrl}/api/ai/source-visual/${payload.renderId}/page/1`);
  assert.equal(pageResponse.status, 200);
  assert.equal(pageResponse.headers.get("x-source-sha256"), sha256);
  assert.equal(pageResponse.headers.get("x-source-generation"), "7");
  assert.equal(pageResponse.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.deepEqual(Buffer.from(await pageResponse.arrayBuffer()), Buffer.from(pageBytes));
  const pdfResponse = await fetch(`${baseUrl}/api/ai/source-visual/${payload.renderId}/source.pdf`);
  assert.equal(pdfResponse.status, 200);
  assert.equal(pdfResponse.headers.get("x-source-sha256"), sha256);
  assert.deepEqual(Buffer.from(await pdfResponse.arrayBuffer()), Buffer.from(pdfBytes));
  const crossOriginPage = await fetch(`${baseUrl}/api/ai/source-visual/${payload.renderId}/page/1`, { headers: { Origin: "https://untrusted.example" } });
  assert.equal(crossOriginPage.status, 403);

  const badHash = await fetch(`${baseUrl}/api/ai/render-source-docx`, {
    method: "POST",
    headers: { ...headers, "X-Source-SHA256": "0".repeat(64) },
    body: source,
  });
  assert.equal(badHash.status, 409);
  assert.equal(rendererCalls, 1);

  const badOrigin = await fetch(`${baseUrl}/api/ai/render-source-docx`, {
    method: "POST",
    headers: { ...headers, Origin: "https://untrusted.example" },
    body: source,
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(rendererCalls, 1);
});
