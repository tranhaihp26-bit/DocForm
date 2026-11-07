import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

const rendererApi = await import("../src/server/sourceVisualRenderer.ts") as any;
const inputSafety = await import("../src/server/docxRenderInputSafety.ts") as any;

const RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_DOCUMENT_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";

async function syntheticDocx(options: {
  rootRelationships?: string;
  document?: string;
  documentRelationships?: string | null;
  documentEntryName?: string;
  extraEntries?: Array<[string, string]>;
} = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", options.rootRelationships ?? `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="word/document.xml"/></Relationships>`);
  zip.file(options.documentEntryName ?? "word/document.xml", options.document ?? `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>`);
  if (options.documentRelationships !== null) {
    zip.file("word/_rels/document.xml.rels", options.documentRelationships ?? `<Relationships xmlns="${RELATIONSHIPS}"/>`);
  }
  for (const [name, content] of options.extraEntries ?? []) zip.file(name, content);
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

const sourceBytes = await syntheticDocx();
const pdfBytes = new TextEncoder().encode("synthetic-pdf");
const pageOne = new TextEncoder().encode("synthetic-page-1");
const pageTwo = new TextEncoder().encode("synthetic-page-2");
const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");

function replaceAsciiEverywhere(input: Uint8Array, from: string, to: string): Buffer {
  const source = Buffer.from(input);
  const fromBytes = Buffer.from(from, "ascii");
  const toBytes = Buffer.from(to, "ascii");
  assert.equal(fromBytes.byteLength, toBytes.byteLength, "ZIP name mutation must preserve the archive offsets");
  let count = 0;
  const headers = [
    { signature: Buffer.from([0x50, 0x4b, 0x03, 0x04]), fixedLength: 30, nameLengthOffset: 26 },
    { signature: Buffer.from([0x50, 0x4b, 0x01, 0x02]), fixedLength: 46, nameLengthOffset: 28 },
  ];
  for (const header of headers) {
    let offset = source.indexOf(header.signature);
    while (offset >= 0) {
      const nameLength = source.readUInt16LE(offset + header.nameLengthOffset);
      const nameStart = offset + header.fixedLength;
      if (source.subarray(nameStart, nameStart + nameLength).equals(fromBytes)) {
        toBytes.copy(source, nameStart);
        count++;
      }
      offset = source.indexOf(header.signature, offset + header.signature.byteLength);
    }
  }
  assert.equal(count, 2, "the name must appear in both local and central ZIP headers");
  return source;
}

function lieAboutEntryExpandedSize(input: Uint8Array, entryName: string, declaredSize: number): Buffer {
  const bytes = Buffer.from(input);
  const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let central = bytes.indexOf(centralSignature);
  let localOffset: number | undefined;
  while (central >= 0) {
    const nameLength = bytes.readUInt16LE(central + 28);
    const name = bytes.subarray(central + 46, central + 46 + nameLength).toString("utf8");
    if (name === entryName) {
      localOffset = bytes.readUInt32LE(central + 42);
      bytes.writeUInt32LE(declaredSize, central + 24);
      break;
    }
    central = bytes.indexOf(centralSignature, central + 4);
  }
  assert.notEqual(localOffset, undefined, `expected ZIP entry ${entryName}`);
  bytes.writeUInt32LE(declaredSize, localOffset! + 22);
  return bytes;
}

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

test("rejects external OOXML relationships before invoking the source renderer", async () => {
  const externalRelationshipPackages = [
    await syntheticDocx({
      rootRelationships: `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="https://example.invalid/template.dotm" TargetMode="External"/></Relationships>`,
    }),
    await syntheticDocx({
      rootRelationships: `<Relationships xmlns="${RELATIONSHIPS}" xml:base="https://example.invalid/"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="template.dotm"/></Relationships>`,
    }),
    await syntheticDocx({
      rootRelationships: `<?xml-stylesheet href="https://example.invalid/relationships.xsl"?><Relationships xmlns="${RELATIONSHIPS}"/>`,
    }),
  ];

  for (const externalBytes of externalRelationshipPackages) {
    let calls = 0;
    const adapter = successfulAdapter({ renderPdf: async () => { calls++; return { pdfBytes, rendererVersion: "synthetic-1" }; } });
    const result = await rendererApi.renderSourceDocx(externalBytes, createHash("sha256").update(externalBytes).digest("hex"), new AbortController().signal, adapter);
    assert.equal(result.manifest.complete, false);
    assert.equal(result.manifest.failureCode, "unsafe_source_package");
    assert.equal(calls, 0);
  }
});

test("rejects relationship and archive path traversal before invoking the source renderer", async () => {
  const traversalRelationships = await syntheticDocx({
    rootRelationships: `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="../outside.xml"/></Relationships>`,
  });
  const archiveTraversal = replaceAsciiEverywhere(sourceBytes, "word/document.xml", "../../../../x.xml");
  for (const bytes of [traversalRelationships, archiveTraversal]) {
    let calls = 0;
    const adapter = successfulAdapter({ renderPdf: async () => { calls++; return { pdfBytes, rendererVersion: "synthetic-1" }; } });
    const result = await rendererApi.renderSourceDocx(bytes, createHash("sha256").update(bytes).digest("hex"), new AbortController().signal, adapter);
    assert.equal(result.manifest.failureCode, "unsafe_source_package");
    assert.equal(calls, 0);
  }
});

test("canonicalizes encoded ZIP part names before duplicate, required-part, and relationship checks", async () => {
  const externalRelationshipAlias = await syntheticDocx({
    documentRelationships: null,
    extraEntries: [[
      "word/_rels/document.xml%2erels",
      `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rIdExt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/linked.docx" TargetMode="External"/></Relationships>`,
    ]],
  });
  const duplicateDecodedPartAlias = await syntheticDocx({
    extraEntries: [["word/%64ocument.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`]],
  });
  const encodedRequiredPart = await syntheticDocx({ documentEntryName: "word/%64ocument.xml" });

  for (const bytes of [externalRelationshipAlias, duplicateDecodedPartAlias]) {
    let calls = 0;
    const adapter = successfulAdapter({ renderPdf: async () => { calls++; return { pdfBytes, rendererVersion: "synthetic-1" }; } });
    const result = await rendererApi.renderSourceDocx(bytes, createHash("sha256").update(bytes).digest("hex"), new AbortController().signal, adapter);
    assert.equal(result.manifest.failureCode, "unsafe_source_package");
    assert.equal(calls, 0);
  }

  const canonicalRequiredPartCheck = inputSafety.inspectDocxRenderInput(encodedRequiredPart, 100 * 1024 * 1024);
  assert.equal(canonicalRequiredPartCheck.safe, true);
});

test("rejects encoded URI delimiters before they can hide relationship path traversal", async () => {
  const encodedDelimiterTraversal = await syntheticDocx({
    documentRelationships: `<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="rId1" Type="${OFFICE_DOCUMENT_RELATIONSHIP}" Target="word%3F/../../outside.xml"/></Relationships>`,
  });
  let calls = 0;
  const adapter = successfulAdapter({ renderPdf: async () => { calls++; return { pdfBytes, rendererVersion: "synthetic-1" }; } });

  const result = await rendererApi.renderSourceDocx(encodedDelimiterTraversal, createHash("sha256").update(encodedDelimiterTraversal).digest("hex"), new AbortController().signal, adapter);

  assert.equal(result.manifest.failureCode, "unsafe_source_package");
  assert.equal(calls, 0);
});

test("bounds expansion using actual inflate output when ZIP size metadata lies", async () => {
  const largeDocument = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${"x".repeat(32 * 1024)}</w:body></w:document>`;
  const actualLargePackage = await syntheticDocx({ document: largeDocument });
  const lyingPackage = lieAboutEntryExpandedSize(actualLargePackage, "word/document.xml", 1);

  const inspection = inputSafety.inspectDocxRenderInput(lyingPackage, 16 * 1024);

  assert.deepEqual(inspection, { safe: false, failureCode: "unsafe_source_package" });
});

test("rejects declared aggregate expansion above the source render byte ceiling", async () => {
  const largeDocument = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${"x".repeat(32 * 1024)}</w:body></w:document>`;
  const largePackage = await syntheticDocx({ document: largeDocument });

  const inspection = inputSafety.inspectDocxRenderInput(largePackage, 16 * 1024);

  assert.deepEqual(inspection, { safe: false, failureCode: "source_too_large" });
});

test("rejects ZIP32 sentinel counts, local-central metadata disagreement, and CRC mismatch", async () => {
  const sentinelCount = Buffer.from(sourceBytes);
  const eocd = sentinelCount.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(eocd, -1);
  sentinelCount.writeUInt16LE(0xffff, eocd + 8);
  sentinelCount.writeUInt16LE(0xffff, eocd + 10);
  const badLocalMetadata = Buffer.from(sourceBytes);
  const localHeader = badLocalMetadata.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.notEqual(localHeader, -1);
  badLocalMetadata.writeUInt32LE(badLocalMetadata.readUInt32LE(localHeader + 22) + 1, localHeader + 22);
  const badCrc = Buffer.from(sourceBytes);
  const crcLocalHeader = badCrc.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralHeader = badCrc.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.notEqual(crcLocalHeader, -1);
  assert.notEqual(centralHeader, -1);
  const wrongCrc = (badCrc.readUInt32LE(crcLocalHeader + 14) + 1) >>> 0;
  badCrc.writeUInt32LE(wrongCrc, crcLocalHeader + 14);
  badCrc.writeUInt32LE(wrongCrc, centralHeader + 16);

  assert.deepEqual(inputSafety.inspectDocxRenderInput(sentinelCount, 100 * 1024 * 1024), { safe: false, failureCode: "unsafe_source_package" });
  assert.deepEqual(inputSafety.inspectDocxRenderInput(badLocalMetadata, 100 * 1024 * 1024), { safe: false, failureCode: "unsafe_source_package" });
  assert.deepEqual(inputSafety.inspectDocxRenderInput(badCrc, 100 * 1024 * 1024), { safe: false, failureCode: "unsafe_source_package" });
});

test("candidate rendering rejects an unsafe package before creating temp files or invoking WPS", {
  skip: process.platform !== "win32" ? "candidate renderer is Windows-only; rejection is exercised before WPS on Windows" : false,
}, async () => {
  await assert.rejects(
    rendererApi.renderCandidatePdfWithWps(replaceAsciiEverywhere(sourceBytes, "word/document.xml", "../../../../x.xml"), new AbortController().signal),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "unsafe_source_package"),
  );
});

test("temporary render directories are removed and cleanup failures reject visibly", async () => {
  const prefix = path.join(os.tmpdir(), "docform-render-cleanup-test-");
  const cleanedDirectory = await rendererApi.withRendererTempDirectory(prefix, async (directory: string) => directory);
  await assert.rejects(fs.access(cleanedDirectory));

  let failedCleanupDirectory = "";
  await assert.rejects(
    rendererApi.withRendererTempDirectory(prefix, async (directory: string) => {
      failedCleanupDirectory = directory;
      return "rendered";
    }, async (directory: string) => {
      await fs.rm(directory, { recursive: true, force: true });
      throw new Error("synthetic cleanup failure");
    }),
    (error: unknown) => error instanceof Error && error.message === "Renderer temporary-directory cleanup failed." &&
      error.cause instanceof Error && error.cause.message === "synthetic cleanup failure",
  );
  await assert.rejects(fs.access(failedCleanupDirectory));
});
