import assert from "node:assert/strict";
import { parseImportResponse, ParsedImport } from "../src/utils/importState.ts";

interface MockResponse {
  success: boolean;
  text?: string;
  html?: string;
  fileType?: "docx" | "txt";
  structured?: any;
  blocks?: any[];
  error?: string;
  warnings?: string[];
}

async function runTest(id: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`[PASS] ${id}: ${name}`);
  } catch (err: any) {
    console.error(`[FAIL] ${id}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function createMockResponse(overrides: Partial<MockResponse> = {}): MockResponse {
  return {
    success: true,
    text: "Test document content",
    html: "<p>Test document content</p>",
    fileType: "docx",
    structured: null,
    blocks: [],
    warnings: [],
    ...overrides,
  };
}

function createValidStructured() {
  return {
    source: { filename: "test.docx", type: "docx" as const, blockCount: 10 },
    fields: { documentType: { value: "QUYẾT ĐỊNH", confidence: "high", status: "extracted", sourceBlockIds: [] } },
    body: { html: "<p>Body</p>", sourceBlockIds: [] },
    appendices: [],
    unclassified: [],
    order: [],
  };
}

async function main() {
  console.log("==================================================================");
  console.log(" TASK 1: IMPORT STATE TESTS - parseImportResponse validation");
  console.log("==================================================================\n");

  // ==================== VALID RESPONSE TESTS ====================

  await runTest("IMP-01", "Valid DOCX response parses correctly with all fields", () => {
    const response = createMockResponse({
      fileType: "docx",
      text: "Valid DOCX content",
      html: "<p>Valid DOCX content</p>",
      structured: createValidStructured(),
    });
    const result = parseImportResponse("test.docx", response);

    assert.strictEqual(result.filename, "test.docx");
    assert.strictEqual(result.fileType, "docx");
    assert.strictEqual(result.text, "Valid DOCX content");
    assert.strictEqual(result.html, "<p>Valid DOCX content</p>");
    assert.ok(result.structured !== null);
  });

  await runTest("IMP-02", "Valid TXT response parses correctly with fileType txt", () => {
    const response = createMockResponse({
      fileType: "txt",
      text: "Valid TXT content",
      html: "<p>Valid TXT content</p>",
    });
    const result = parseImportResponse("test.txt", response);

    assert.strictEqual(result.filename, "test.txt");
    assert.strictEqual(result.fileType, "txt");
    assert.strictEqual(result.text, "Valid TXT content");
    assert.strictEqual(result.html, "<p>Valid TXT content</p>");
    assert.strictEqual(result.structured, null);
  });

  await runTest("IMP-03", "Valid response with empty structured still returns structured as null", () => {
    const response = createMockResponse({
      fileType: "docx",
      structured: null,
    });
    const result = parseImportResponse("test.docx", response);
    assert.strictEqual(result.structured, null);
  });

  // ==================== INVALID/EMPTY RESPONSE TESTS ====================

  await runTest("IMP-04", "Response with success:false throws error", () => {
    const response = createMockResponse({ success: false, error: "Parse failed" });
    assert.throws(() => parseImportResponse("test.docx", response), /Parse failed/);
  });

  await runTest("IMP-05", "Response with missing success field throws error", () => {
    const response = { text: "content", html: "<p>content</p>", fileType: "docx" } as any;
    assert.throws(() => parseImportResponse("test.docx", response), /Unknown server error/);
  });

  await runTest("IMP-06", "Response with empty text throws error", () => {
    const response = createMockResponse({ text: "", html: "<p></p>" });
    assert.throws(() => parseImportResponse("test.docx", response), /Empty text content/);
  });

  await runTest("IMP-07", "Response with whitespace-only text throws error", () => {
    const response = createMockResponse({ text: "   \n\t  ", html: "<p></p>" });
    assert.throws(() => parseImportResponse("test.docx", response), /Empty text content/);
  });

  await runTest("IMP-08", "Response with missing text field throws error", () => {
    const response = createMockResponse({ text: undefined as any, html: "<p>content</p>" });
    assert.throws(() => parseImportResponse("test.docx", response), /Missing text field/);
  });

  await runTest("IMP-09", "Response with missing html field throws error", () => {
    const response = createMockResponse({ text: "content", html: undefined as any });
    assert.throws(() => parseImportResponse("test.docx", response), /Missing html field/);
  });

  await runTest("IMP-10", "Response with invalid fileType throws error", () => {
    const response = createMockResponse({ fileType: "pdf" as any });
    assert.throws(() => parseImportResponse("test.pdf", response), /Invalid fileType/);
  });

  await runTest("IMP-11", "Response with missing fileType throws error", () => {
    const response = createMockResponse({ fileType: undefined as any });
    assert.throws(() => parseImportResponse("test.docx", response), /Invalid fileType/);
  });

  // ==================== NETWORK/SERVER ERROR TESTS ====================

  await runTest("IMP-12", "Network error response (simulated) throws error", () => {
    const response = { success: false, error: "Network error: Failed to fetch" };
    assert.throws(() => parseImportResponse("test.docx", response), /Network error/);
  });

  await runTest("IMP-13", "Server error 500 response throws error", () => {
    const response = { success: false, error: "Internal server error" };
    assert.throws(() => parseImportResponse("test.docx", response), /Internal server error/);
  });

  await runTest("IMP-14", "422 Unprocessable Entity response throws error", () => {
    const response = { success: false, error: "File format invalid or corrupted" };
    assert.throws(() => parseImportResponse("test.docx", response), /File format invalid/);
  });

  // ==================== FILETYPE/FILENAME CONSISTENCY TESTS ====================

  await runTest("IMP-15", "Rejects .docx file with server returning fileType=txt", () => {
    const response = createMockResponse({ fileType: "txt", text: "Content" });
    assert.throws(() => parseImportResponse("document.docx", response), /File type mismatch/);
  });

  await runTest("IMP-16", "Rejects .txt file with server returning fileType=docx", () => {
    const response = createMockResponse({ fileType: "docx", text: "Content" });
    assert.throws(() => parseImportResponse("document.txt", response), /File type mismatch/);
  });

  await runTest("IMP-17", "Accepts .docx file with fileType=docx (server ignores MIME)", () => {
    const response = createMockResponse({ fileType: "docx", text: "DOCX content" });
    const result = parseImportResponse("document.docx", response);
    assert.strictEqual(result.fileType, "docx");
  });

  await runTest("IMP-18", "Accepts .txt file with fileType=txt", () => {
    const response = createMockResponse({ fileType: "txt", text: "TXT content" });
    const result = parseImportResponse("document.txt", response);
    assert.strictEqual(result.fileType, "txt");
  });

  // ==================== STRUCTURED IMPORT VALIDATION ====================

  await runTest("IMP-19", "Structured import with valid structure is preserved", () => {
    const response = createMockResponse({ fileType: "docx", structured: createValidStructured() });
    const result = parseImportResponse("test.docx", response);
    assert.ok(result.structured !== null);
    assert.strictEqual(result.structured!.fields.documentType.value, "QUYẾT ĐỊNH");
  });

  await runTest("IMP-20", "Rejects structured with missing source", () => {
    const structured = { fields: {}, body: { html: "<p>Body</p>", sourceBlockIds: [] }, appendices: [], unclassified: [], order: [] };
    const response = createMockResponse({ fileType: "docx", structured });
    assert.throws(() => parseImportResponse("test.docx", response), /Invalid structured: missing source/);
  });

  await runTest("IMP-21", "Rejects structured with invalid source.type", () => {
    const structured = { source: { filename: "test.docx", type: "pdf", blockCount: 10 }, fields: {}, body: { html: "<p>Body</p>", sourceBlockIds: [] }, appendices: [], unclassified: [], order: [] };
    const response = createMockResponse({ fileType: "docx", structured });
    assert.throws(() => parseImportResponse("test.docx", response), /Invalid structured\.source\.type/);
  });

  await runTest("IMP-22", "Rejects structured with missing body.html", () => {
    const structured = { source: { filename: "test.docx", type: "docx", blockCount: 10 }, fields: {}, body: { sourceBlockIds: [] }, appendices: [], unclassified: [], order: [] };
    const response = createMockResponse({ fileType: "docx", structured });
    assert.throws(() => parseImportResponse("test.docx", response), /Invalid structured\.body: missing html/);
  });

  await runTest("IMP-23", "Rejects structured with missing body.sourceBlockIds", () => {
    const structured = { source: { filename: "test.docx", type: "docx", blockCount: 10 }, fields: {}, body: { html: "<p>Body</p>" }, appendices: [], unclassified: [], order: [] };
    const response = createMockResponse({ fileType: "docx", structured });
    assert.throws(() => parseImportResponse("test.docx", response), /Invalid structured\.body: missing html or sourceBlockIds/);
  });

  await runTest("IMP-24", "Rejects structured with invalid appendix shape", () => {
    const structured: any = createValidStructured();
    structured.appendices = [{ id: "1", title: "App" }]; // missing required fields
    const response = createMockResponse({ fileType: "docx", structured });
    assert.throws(() => parseImportResponse("test.docx", response), /Invalid appendix/);
  });

  await runTest("IMP-25", "Accepts structured with valid appendices and tables", () => {
    const structured: any = createValidStructured();
    structured.appendices = [{
      id: "app-1",
      title: "PHỤ LỤC 1",
      referenceText: "(Kèm theo...)",
      html: "<table><tr><td>A</td></tr></table>",
      blocks: [],
      sourceBlockIds: ["b1"],
      extractionStatus: "confirmed",
      tables: [{ rows: 1, columns: 1, data: [["A"]] }],
    }];
    const response = createMockResponse({ fileType: "docx", structured });
    const result = parseImportResponse("test.docx", response);
    assert.ok(result.structured !== null);
    assert.strictEqual(result.structured!.appendices.length, 1);
  });

  // ==================== OVERSIZE/EMPTY FILE RESPONSE TESTS ====================

  await runTest("IMP-26", "Empty file response (success but empty content) throws error", () => {
    const response = createMockResponse({ text: "", html: "<p></p>" });
    assert.throws(() => parseImportResponse("empty.docx", response), /Empty text content/);
  });

  await runTest("IMP-27", "Response with only warnings but valid content succeeds", () => {
    const response = createMockResponse({ 
      text: "Content with warnings",
      html: "<p>Content with warnings</p>",
      warnings: ["Minor formatting issue"]
    });
    const result = parseImportResponse("test.docx", response);
    assert.strictEqual(result.text, "Content with warnings");
  });

  // ==================== PURITY / NO SHARED STATE TESTS ====================

  await runTest("IMP-28", "parseImportResponse is pure - no shared state between calls", () => {
    const responseA = createMockResponse({ fileType: "docx", text: "Content A" });
    const responseB = createMockResponse({ fileType: "txt", text: "Content B" });

    const resultA = parseImportResponse("fileA.docx", responseA);
    const resultB = parseImportResponse("fileB.txt", responseB);

    assert.strictEqual(resultA.filename, "fileA.docx");
    assert.strictEqual(resultA.text, "Content A");
    assert.strictEqual(resultA.fileType, "docx");

    assert.strictEqual(resultB.filename, "fileB.txt");
    assert.strictEqual(resultB.text, "Content B");
    assert.strictEqual(resultB.fileType, "txt");
  });

  console.log("\n==================================================================");
  console.log(" ALL PARSEIMPORTRESPONSE TESTS COMPLETED");
  console.log("==================================================================\n");
}

main();
