import type { StructuredImport, SourceBlock } from "../shared/schemas/document.schema.ts";

/**
 * Result of parsing an import API response
 */
export interface ParsedImport {
  filename: string;
  fileType: "docx" | "txt";
  text: string;
  html: string;
  structured: StructuredImport | null;
  blocks?: SourceBlock[];
  sourceHash?: string;
}

/**
 * Validates StructuredImport shape to prevent corrupt import
 */
function validateStructuredImport(structured: unknown): StructuredImport {
  if (!structured || typeof structured !== "object") {
    throw new Error("Invalid structured: not an object");
  }
  const s = structured as Record<string, unknown>;

  // Required fields for StructuredImport
  if (!s.source || typeof s.source !== "object") {
    throw new Error("Invalid structured: missing source");
  }
  const source = s.source as Record<string, unknown>;
  if (typeof source.filename !== "string" || typeof source.type !== "string") {
    throw new Error("Invalid structured.source: missing filename/type");
  }
  if (source.type !== "docx" && source.type !== "txt") {
    throw new Error(`Invalid structured.source.type: ${source.type}`);
  }
  if (typeof source.blockCount !== "number") {
    throw new Error("Invalid structured.source.blockCount");
  }

  // fields is required but can be empty object
  if (!s.fields || typeof s.fields !== "object") {
    throw new Error("Invalid structured: missing fields");
  }

  // body is required
  if (!s.body || typeof s.body !== "object") {
    throw new Error("Invalid structured: missing body");
  }
  const body = s.body as Record<string, unknown>;
  if (typeof body.html !== "string" || !Array.isArray(body.sourceBlockIds)) {
    throw new Error("Invalid structured.body: missing html or sourceBlockIds");
  }

  // appendices is optional but must be array if present
  if (s.appendices !== undefined) {
    if (!Array.isArray(s.appendices)) {
      throw new Error("Invalid structured.appendices: not an array");
    }
    for (const app of s.appendices as unknown[]) {
      if (!app || typeof app !== "object") throw new Error("Invalid appendix: not object");
      const a = app as Record<string, unknown>;
      if (typeof a.id !== "string" || typeof a.title !== "string" || typeof a.html !== "string" ||
          !Array.isArray(a.blocks) || !Array.isArray(a.sourceBlockIds) ||
          typeof a.extractionStatus !== "string") {
        throw new Error("Invalid appendix: missing required fields");
      }
      if (a.tables !== undefined && !Array.isArray(a.tables)) {
        throw new Error("Invalid appendix.tables: not an array");
      }
    }
  }

  // unclassified is optional but must be array if present
  if (s.unclassified !== undefined && !Array.isArray(s.unclassified)) {
    throw new Error("Invalid structured.unclassified: not an array");
  }

  // order is optional but must be array if present
  if (s.order !== undefined && !Array.isArray(s.order)) {
    throw new Error("Invalid structured.order: not an array");
  }

  return structured as StructuredImport;
}

/**
 * Validates and parses the API response from /api/parse-docx
 * Throws descriptive errors for invalid responses to prevent state corruption
 * 
 * @param filename - Original filename from the file input
 * @param data - Raw response data from the API
 * @returns Validated ParsedImport object
 * @throws Error with descriptive message for any validation failure
 */
export function parseImportResponse(filename: string, data: unknown): ParsedImport {
  // Validate response is an object
  if (!data || typeof data !== "object") {
    throw new Error("Invalid response: not an object");
  }

  const response = data as Record<string, unknown>;

  // Check success field exists and is true
  if (response.success !== true) {
    const errorMsg = typeof response.error === "string" ? response.error : "Unknown server error";
    throw new Error(errorMsg);
  }

  // Validate text field
  if (typeof response.text !== "string") {
    throw new Error("Missing text field");
  }
  const text = response.text.trim();
  if (!text) {
    throw new Error("Empty text content");
  }

  // Validate html field
  if (typeof response.html !== "string") {
    throw new Error("Missing html field");
  }

  // Validate fileType
  const fileType = response.fileType;
  if (fileType !== "docx" && fileType !== "txt") {
    throw new Error(`Invalid fileType: expected "docx" or "txt", got "${fileType}"`);
  }

  // Validate fileType consistency with filename extension
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "docx" && fileType !== "docx") {
    throw new Error(`File type mismatch: .docx file but server returned fileType="${fileType}"`);
  }
  if (ext === "txt" && fileType !== "txt") {
    throw new Error(`File type mismatch: .txt file but server returned fileType="${fileType}"`);
  }

  // Validate structured field if present
  let structured: StructuredImport | null = null;
  if (response.structured !== undefined && response.structured !== null) {
    if (typeof response.structured === "object" && response.structured !== null) {
      structured = validateStructuredImport(response.structured);
    }
  }

  return {
    filename,
    fileType,
    text: response.text,
    html: response.html,
    structured,
  };
}
