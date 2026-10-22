import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const rendererApi = await import("../src/server/sourceVisualRenderer.ts").catch(() => undefined) as any;

const sourceBytes = new TextEncoder().encode("synthetic-docx-source");
const pdfBytes = new TextEncoder().encode("synthetic-pdf");
const pageOne = new TextEncoder().encode("synthetic-page-1");
const pageTwo = new TextEncoder().encode("synthetic-page-2");
const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");

function page(number: number, bytes: Uint8Array) {
  return { page: number, imageBytes: bytes };
}

function successfulAdapter(overrides: Record<string, unknown> = {}) {
  return {
    rendererName: "Synthetic Word",
    renderPdf: async () => ({ pdfBytes, rendererVersion: "synthetic-1" }),
    renderPages: async () => ({
      pageCount: 2,
      pages: [page(1, pageOne), page(2, pageTwo)],
      rasterizerName: "Synthetic PDF renderer",
      rasterizerVersion: "synthetic-2",
    }),
    ...overrides,
  };
}

test("rejects a source SHA mismatch before invoking a renderer", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  let calls = 0;
  const adapter = successfulAdapter({ renderPdf: async () => { calls++; return { pdfBytes, rendererVersion: "synthetic-1" }; } });

  const result = await rendererApi.renderSourceDocx(sourceBytes, "0".repeat(64), new AbortController().signal, adapter);

  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.failureCode, "source_hash_mismatch");
  assert.equal(calls, 0);
});

test("reports missing Word as an incomplete local rendition", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  const adapter = successfulAdapter({ renderPdf: async () => { throw Object.assign(new Error("missing"), { code: "renderer_unavailable" }); } });

  const result = await rendererApi.renderSourceDocx(sourceBytes, sourceSha, new AbortController().signal, adapter);

  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.failureCode, "renderer_unavailable");
});

test("reports Word export failure without claiming page coverage", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  const adapter = successfulAdapter({ renderPdf: async () => { throw new Error("render failed"); } });

  const result = await rendererApi.renderSourceDocx(sourceBytes, sourceSha, new AbortController().signal, adapter);

  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.failureCode, "render_failed");
  assert.equal(result.manifest.pageCount, 0);
});

test("rejects a PDF with no pages", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  const adapter = successfulAdapter({ renderPages: async () => ({ pageCount: 0, pages: [], rasterizerName: "Synthetic PDF renderer", rasterizerVersion: "synthetic-2" }) });

  const result = await rendererApi.renderSourceDocx(sourceBytes, sourceSha, new AbortController().signal, adapter);

  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.failureCode, "zero_pages");
});

test("rejects a rendered page count that does not match the PDF", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  const adapter = successfulAdapter({ renderPages: async () => ({ pageCount: 2, pages: [page(1, pageOne)], rasterizerName: "Synthetic PDF renderer", rasterizerVersion: "synthetic-2" }) });

  const result = await rendererApi.renderSourceDocx(sourceBytes, sourceSha, new AbortController().signal, adapter);

  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.failureCode, "page_count_mismatch");
  assert.equal(result.manifest.pages.length, 1);
});

test("cancellation never returns a complete visual manifest", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  const controller = new AbortController();
  controller.abort();

  const result = await rendererApi.renderSourceDocx(sourceBytes, sourceSha, controller.signal, successfulAdapter());

  assert.equal(result.manifest.complete, false);
  assert.equal(result.manifest.failureCode, "cancelled");
});

test("binds all page hashes to the verified source and returns the exact PDF and pages", async () => {
  assert.ok(rendererApi, "source visual renderer implementation must exist");
  let renderedSource: Uint8Array | undefined;
  const adapter = successfulAdapter({ renderPdf: async (bytes: Uint8Array) => { renderedSource = bytes; return { pdfBytes, rendererVersion: "synthetic-1" }; } });

  const result = await rendererApi.renderSourceDocx(sourceBytes, sourceSha, new AbortController().signal, adapter);

  assert.equal(result.manifest.complete, true);
  assert.equal(result.manifest.sourceSha256, sourceSha);
  assert.equal(result.manifest.pageCount, 2);
  assert.deepEqual(renderedSource, sourceBytes);
  assert.deepEqual(result.pdfBytes, pdfBytes);
  assert.deepEqual(result.pages.map((item: any) => item.page), [1, 2]);
  assert.equal(result.manifest.pages[0].sha256, createHash("sha256").update(pageOne).digest("hex"));
  assert.equal(result.manifest.pages[1].sha256, createHash("sha256").update(pageTwo).digest("hex"));
});
