import { extractBlocksFromDocx, extractBlocksFromTxt } from "../server/blockExtractor.ts";
import { segmentSourceBlocks } from "../server/structuralSegmenter.ts";
import { parseImportResponse, type ParsedImport } from "./importState.ts";
import { computeSourceHash, saveSourceBlob, type SaveSourceBlobResult } from "./draftStore.ts";
import {
  type ImportFidelityManifest,
  type UnsupportedFeature,
  scanRawTableXmlFeatures,
} from "../shared/importFidelity.ts";
import type {
  RegimeDetectionRecord,
  SourceBlock,
  StructuredImport,
} from "../shared/schemas/document.schema.ts";

/** Raw, unsegmented source extracted from a local file (Chặng 2). */
export interface LocalFileExtraction {
  filename: string;
  fileType: "docx" | "txt";
  bytes: ArrayBuffer;
  fileSize: number;
  rawBlocks: SourceBlock[];
  rawText: string;
  rawHtml: string;
  sourceHash: string;
  blockCount: number;
}

function validateLocalFile(file: File): "docx" | "txt" {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "docx" && extension !== "txt") {
    throw new Error("Định dạng file không được hỗ trợ. Vui lòng chọn .docx hoặc .txt.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Tệp tin quá lớn. Kích thước tối đa cho phép là 25 MB.");
  }
  return extension;
}

/**
 * Read + validate + extract raw blocks. This step never segments, never saves a
 * blob and never mutates document A, so the UI can detect the regime first.
 */
export async function extractLocalFile(file: File): Promise<LocalFileExtraction> {
  const extension = validateLocalFile(file);
  const bytes = await file.arrayBuffer();
  const sourceHash = await computeSourceHash(bytes);

  let extracted;
  if (extension === "txt") {
    const content = await file.text();
    extracted = extractBlocksFromTxt(content);
  } else {
    try {
      extracted = await extractBlocksFromDocx(bytes);
    } catch {
      throw new Error("Tệp tin không đúng định dạng Microsoft Word (DOCX) hợp lệ hoặc đã bị hỏng.");
    }
  }

  return {
    filename: file.name,
    fileType: extension,
    bytes,
    fileSize: file.size,
    rawBlocks: extracted.blocks,
    rawText: extracted.rawText,
    rawHtml: extracted.rawHtml,
    sourceHash,
    blockCount: extracted.blocks.length,
  };
}

/**
 * Persist the immutable source blob. Called at commit time (after the user has
 * confirmed the regime) so a cancelled upload never stores file B.
 */
export async function persistSourceBlob(extraction: LocalFileExtraction): Promise<SaveSourceBlobResult> {
  return saveSourceBlob({
    hash: extraction.sourceHash,
    fileName: extraction.filename,
    fileType: extraction.fileType,
    fileSize: extraction.fileSize,
    uploadedAt: new Date().toISOString(),
    bytes: extraction.bytes,
  });
}

/**
 * Segment raw blocks exactly once, under the confirmed regime, and build the
 * fidelity manifest from that segmentation result.
 */
export function segmentLocalExtraction(
  extraction: LocalFileExtraction,
  standardType: "administrative" | "party",
  regimeDetection?: RegimeDetectionRecord,
): StructuredImport {
  const structured = segmentSourceBlocks(extraction.rawBlocks, {
    filename: extraction.filename,
    fileType: extraction.fileType,
    standardType,
  });

  // Track content tables only (metadata header/signature tables become fields).
  const blocksForManifest = structured.blocks || extraction.rawBlocks;
  const tableBlocks = blocksForManifest.filter(
    (b) => b.kind === "table" && b.role !== "header" && b.role !== "signature",
  );
  const tableIds = tableBlocks.map((b) => b.id);
  const unsupportedFeatures: UnsupportedFeature[] = [];
  for (const tb of tableBlocks) {
    if (tb.rawXml) {
      unsupportedFeatures.push(...scanRawTableXmlFeatures(tb.rawXml, tb.id, tb.id));
    } else if (tb.unsupportedFeatures && tb.unsupportedFeatures.length > 0) {
      unsupportedFeatures.push(...tb.unsupportedFeatures);
    }
  }

  const manifest: ImportFidelityManifest = {
    sourceKind: extraction.fileType === "docx" ? "uploaded_docx" : "uploaded_txt",
    sourceHash: extraction.sourceHash,
    sourceFilename: extraction.filename,
    sourceBlockIds: extraction.rawBlocks.map((b) => b.id),
    tableIds,
    unsupportedFeatures,
    roundtripProven: false,
  };

  structured.importFidelityManifest = manifest;
  if (regimeDetection) {
    structured.regimeDetection = regimeDetection;
  }
  return structured;
}

/** Assemble the same `ParsedImport` shape the rest of the pipeline expects. */
export function buildParsedImport(
  extraction: LocalFileExtraction,
  structured: StructuredImport,
  storageStatus: SaveSourceBlobResult,
): ParsedImport & {
  blockCount: number;
  storageStatus: SaveSourceBlobResult;
} {
  const parsed = parseImportResponse(extraction.filename, {
    success: true,
    text: extraction.rawText,
    html: extraction.rawHtml,
    fileType: extraction.fileType,
    structured,
    sourceHash: extraction.sourceHash,
  });

  return {
    ...parsed,
    sourceHash: extraction.sourceHash,
    blocks: extraction.rawBlocks,
    blockCount: extraction.blockCount,
    storageStatus,
  };
}

/**
 * Backward-compatible facade used by existing tests/call-sites.
 * New UI code must use `extractLocalFile` + `detectRegimeFromRawBlocks` +
 * `segmentLocalExtraction` so segmentation happens only after the regime is
 * confirmed.
 */
export async function parseLocalFile(
  file: File,
  standardType?: "administrative" | "party",
): Promise<ParsedImport & {
  blockCount: number;
  storageStatus: SaveSourceBlobResult;
}> {
  const extraction = await extractLocalFile(file);
  const structured = segmentLocalExtraction(
    extraction,
    standardType === "party" ? "party" : "administrative",
  );
  const storageStatus = await persistSourceBlob(extraction);
  return buildParsedImport(extraction, structured, storageStatus);
}
