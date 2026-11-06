import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const candidateBytes = new TextEncoder().encode("synthetic candidate DOCX bytes");
const candidateSha = createHash("sha256").update(candidateBytes).digest("hex");
const pdfBytes = new TextEncoder().encode("%PDF-synthetic-candidate-preview");
const pdfSha = createHash("sha256").update(pdfBytes).digest("hex");

test("candidate PDF export rehashes local candidate bytes and returns renderer provenance", async t => {
  process.env.DOCFORM_TEST_NO_DOTENV = "true";
  process.env.NODE_ENV = "production";
  const { startServer } = await import("../server.ts");
  let rendererCalls = 0;
  let rendererBusy = false;
  let receivedBytes: Uint8Array | undefined;
  const instanceId = "00000000-0000-4000-8000-000000000001";
  const server = await startServer({
    port: 0,
    bindHost: "127.0.0.1",
    candidatePdfRenderer: async (bytes, signal) => {
      rendererCalls++;
      if (rendererBusy) throw Object.assign(new Error("renderer_busy"), { code: "renderer_busy" });
      receivedBytes = bytes.slice();
      assert.ok(signal instanceof AbortSignal);
      return { pdfBytes, pdfSha256: pdfSha, rendererName: "WPS Office", rendererVersion: "synthetic-1" };
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
  const headers = {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Origin: baseUrl,
    "X-Candidate-SHA256": candidateSha,
    "X-Candidate-Revision": "4",
    "X-Candidate-Instance": instanceId,
  };
  const response = await fetch(`${baseUrl}/api/export/candidate-pdf`, { method: "POST", headers, body: candidateBytes });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-candidate-sha256"), candidateSha);
  assert.equal(response.headers.get("x-candidate-revision"), "4");
  assert.equal(response.headers.get("x-candidate-instance"), instanceId);
  assert.equal(response.headers.get("x-rendered-pdf-sha256"), pdfSha);
  assert.equal(response.headers.get("x-pdf-renderer"), "WPS Office");
  assert.equal(response.headers.get("x-pdf-renderer-version"), "synthetic-1");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(pdfBytes));
  assert.deepEqual(Buffer.from(receivedBytes!), Buffer.from(candidateBytes));

  const badHash = await fetch(`${baseUrl}/api/export/candidate-pdf`, {
    method: "POST", headers: { ...headers, "X-Candidate-SHA256": "0".repeat(64) }, body: candidateBytes,
  });
  assert.equal(badHash.status, 409);
  const badOrigin = await fetch(`${baseUrl}/api/export/candidate-pdf`, {
    method: "POST", headers: { ...headers, Origin: "https://untrusted.example" }, body: candidateBytes,
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(rendererCalls, 1);

  rendererBusy = true;
  const busy = await fetch(`${baseUrl}/api/export/candidate-pdf`, { method: "POST", headers, body: candidateBytes });
  assert.equal(busy.status, 409);
  assert.deepEqual(await busy.json(), { error: "renderer_busy" });
  assert.equal(rendererCalls, 2);
});
