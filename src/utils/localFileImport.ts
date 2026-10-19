import { extractBlocksFromDocx, extractBlocksFromTxt } from "../server/blockExtractor.ts";
import { segmentSourceBlocks } from "../server/structuralSegmenter.ts";
import { parseImportResponse, type ParsedImport } from "./importState.ts";
import { computeSourceHash, saveSourceBlob } from "./draftStore.ts";
import { 
  type ImportFidelityManifest, 
  type UnsupportedFeature,
  scanRawTableXmlFeatures 
} from "../shared/importFidelity.ts";

export async function parseLocalFile(
  file: File,
  standardType?: "administrative" | "party"
): Promise<ParsedImport & { 
  blockCount: number; 
  storageStatus: { persisted: boolean; storage: "indexeddb" | "memory"; error?: string };
}> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "docx" && extension !== "txt") {
    throw new Error("Định dạng file không được hỗ trợ. Vui lòng chọn .docx hoặc .txt.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Tệp tin quá lớn. Kích thước tối đa cho phép là 25 MB.");
  }

  let extracted;
  let arrayBuffer: ArrayBuffer;
  let sourceHash = "";

  arrayBuffer = await file.arrayBuffer();
  sourceHash = await computeSourceHash(arrayBuffer);

  if (extension === "txt") {
    const content = await file.text();
    extracted = extractBlocksFromTxt(content);
  } else {
    try {
      extracted = await extractBlocksFromDocx(arrayBuffer);
    } catch {
      throw new Error("Tệp tin không đúng định dạng Microsoft Word (DOCX) hợp lệ hoặc đã bị hỏng.");
    }
  }

  // Lưu tệp nguồn bất biến vào store source_blobs (không nhân bản vào draft history)
  const storageStatus = await saveSourceBlob({
    hash: sourceHash,
    fileName: file.name,
    fileType: extension as "docx" | "txt",
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
    bytes: arrayBuffer,
  });

  const structured = segmentSourceBlocks(extracted.blocks, {
    filename: file.name,
    fileType: extension,
    standardType,
  });

  // Xây dựng ImportFidelityManifest cho tệp nạp: chỉ theo dõi bảng nội dung (body, appendix, unclassified),
  // không tính các bảng metadata header/signature đã chuyển thành trường chuẩn NĐ30/HD05
  const blocksForManifest = structured.blocks || extracted.blocks;
  const tableBlocks = blocksForManifest.filter(b => b.kind === "table" && b.role !== "header" && b.role !== "signature");
  const tableIds = tableBlocks.map(b => b.id);
  const unsupportedFeatures: UnsupportedFeature[] = [];

  for (const tb of tableBlocks) {
    if (tb.rawXml) {
      const scanned = scanRawTableXmlFeatures(tb.rawXml, tb.id, tb.id);
      unsupportedFeatures.push(...scanned);
    } else if (tb.unsupportedFeatures && tb.unsupportedFeatures.length > 0) {
      unsupportedFeatures.push(...tb.unsupportedFeatures);
    }
  }

  const manifest: ImportFidelityManifest = {
    sourceKind: extension === "docx" ? "uploaded_docx" : "uploaded_txt",
    sourceHash,
    sourceFilename: file.name,
    sourceBlockIds: extracted.blocks.map(b => b.id),
    tableIds,
    unsupportedFeatures,
    roundtripProven: false, // Sẽ được kiểm chứng khi qua roundtrip engine ở Task 4
  };

  structured.importFidelityManifest = manifest;

  const parsed = parseImportResponse(file.name, {
    success: true,
    text: extracted.rawText,
    html: extracted.rawHtml,
    fileType: extension,
    structured,
    sourceHash,
  });

  return { 
    ...parsed, 
    sourceHash, 
    blocks: extracted.blocks, 
    blockCount: extracted.blocks.length,
    storageStatus,
  };
}
