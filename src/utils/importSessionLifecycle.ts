/**
 * @file importSessionLifecycle.ts
 * @description Pure preparation and atomic commit helpers for imported files,
 * templates/Pilot documents, and version history restoration.
 * Ensures source-bound state (proposals, history, modified block IDs, original source blob links)
 * is never leaked across document sessions or half-committed on parse/reconstruction errors.
 */

import DOMPurify from "dompurify";
import { deriveImportStatus, reconstructFromReviewedBlocks } from "./importReview.ts";
import { generateRuleBasedProposals } from "../server/reviewProposals.ts";
import type { ParsedImport } from "./importState.ts";
import type { OriginalDocumentSnapshot, SaveSourceBlobResult } from "./draftStore.ts";
import type {
  DocumentState,
  PartitionProposal,
  ReviewProposal,
  SourceBlock,
  StructuredImport,
} from "../shared/schemas/document.schema.ts";

export interface VersionWithSourceSnapshot {
  id: string;
  timestamp: string;
  title: string;
  data: DocumentState;
  standardType: "state" | "party";
  originalSnapshot?: OriginalDocumentSnapshot | null;
  reviewBlocks?: SourceBlock[];
  structuredImport?: StructuredImport | null;
  uploadedBlocks?: SourceBlock[];
  uploadedFileName?: string;
  uploadedFileType?: "docx" | "txt" | null;
  rawText?: string;
}

export interface PreparedImportBundle {
  doc: DocumentState;
  effectiveRegime: "state" | "party";
  rawBlocks: SourceBlock[];
  reviewBlocks: SourceBlock[];
  structuredImport: StructuredImport;
  rawText: string;
  cleanHtml: string;
  originalSnapshot: OriginalDocumentSnapshot;
  uploadedFileName: string;
  uploadedFileType: "docx" | "txt";
  blockCount: number;
  storageStatus: SaveSourceBlobResult;
  initialRuleProposals: ReviewProposal[];
}

export interface ImportSessionState {
  doc: DocumentState;
  standardType: "state" | "party";
  rawText: string;
  uploadedFileName: string;
  uploadedHtml: string;
  uploadedFileType: "docx" | "txt" | null;
  originalSnapshot: OriginalDocumentSnapshot | null;
  sourceStorageStatus: SaveSourceBlobResult | null;
  uploadedBlocks: SourceBlock[];
  structuredImport: StructuredImport | null;
  reviewBlocks: SourceBlock[];
  importReviewAccepted: boolean;
  // Source-bound partition & AI state
  partitionProposals: PartitionProposal[];
  verifiedPartitionProposalIds: Set<string>;
  partitionHistory: SourceBlock[][];
  userModifiedBlockIds: string[];
  partitionCheckNotice: string;
  partitionCheckSource: "gemini_ai" | "rule_fallback" | "mixed" | "unverified";
  reviewProposals: ReviewProposal[];
  acceptedProposalIds: Set<string>;
}

function sanitizeHtmlSafe(html: string): string {
  if (typeof DOMPurify?.sanitize === "function") {
    return DOMPurify.sanitize(html);
  }
  return html;
}

export function createInitialImportSessionState(
  doc: DocumentState,
  standardType: "state" | "party",
  originalSnapshot: OriginalDocumentSnapshot | null = null
): ImportSessionState {
  return {
    doc,
    standardType,
    rawText: originalSnapshot?.rawText || "",
    uploadedFileName: originalSnapshot?.fileName || "",
    uploadedHtml: originalSnapshot?.bodyHtml || "",
    uploadedFileType:
      originalSnapshot?.fileType === "docx" || originalSnapshot?.fileType === "txt"
        ? originalSnapshot.fileType
        : null,
    originalSnapshot,
    sourceStorageStatus: null,
    uploadedBlocks: [],
    structuredImport: null,
    reviewBlocks: [],
    importReviewAccepted: false,
    partitionProposals: [],
    verifiedPartitionProposalIds: new Set<string>(),
    partitionHistory: [],
    userModifiedBlockIds: [],
    partitionCheckNotice: "",
    partitionCheckSource: "unverified",
    reviewProposals: [],
    acceptedProposalIds: new Set<string>(),
  };
}

/**
 * Prepares the complete imported document bundle before any React state is mutated.
 * Throws if the parsed result is missing required structure or reconstruction fails.
 */
export function prepareImportedFileBundle(
  parsed: ParsedImport & {
    blockCount: number;
    storageStatus: SaveSourceBlobResult;
  },
  currentStandardType: "state" | "party"
): PreparedImportBundle {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Kết quả đọc tệp không hợp lệ.");
  }
  if (!parsed.structured || typeof parsed.structured !== "object") {
    throw new Error("Cấu trúc bóc tách tài liệu (structured) không hợp lệ hoặc bị thiếu.");
  }

  const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const reviewBlocks = Array.isArray(parsed.structured.blocks) && parsed.structured.blocks.length > 0
    ? parsed.structured.blocks.map((b) => ({ ...b }))
    : rawBlocks.map((b) => ({ ...b }));

  if (reviewBlocks.length === 0) {
    throw new Error("Tệp tải lên không có khối nội dung hợp lệ để phân vùng.");
  }

  const cleanHtml = sanitizeHtmlSafe(parsed.html || "");
  const rawText = parsed.text || "";

  // Chặng 2: the regime is decided by the pre-partition detector and passed in
  // explicitly. Never rescan the whole text here (that caused one-way flips and
  // turned body/recipient/appendix keywords into a party decision).
  const effectiveRegime: "state" | "party" = currentStandardType === "party" ? "party" : "state";

  const initialRuleProposals = generateRuleBasedProposals(
    parsed.structured,
    effectiveRegime === "party" ? "party" : "administrative",
    rawText,
    rawBlocks
  );

  const reconstructed = reconstructFromReviewedBlocks(
    reviewBlocks,
    effectiveRegime,
    parsed.structured
  );

  const newDoc: DocumentState = {
    headerProfile: "generic",
    orgHeader1: reconstructed.fields.orgHeader1 || "",
    orgHeader2: reconstructed.fields.orgHeader2 || "",
    draftNote: reconstructed.draftNote || "",
    includeDraftNoteInExport: Boolean(reconstructed.draftNote),
    nationalHeader1:
      reconstructed.fields.nationalHeader1 ||
      (effectiveRegime === "party"
        ? "ĐẢNG CỘNG SẢN VIỆT NAM"
        : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
    nationalHeader2:
      reconstructed.fields.nationalHeader2 ??
      (effectiveRegime === "party" ? "" : "Độc lập - Tự do - Hạnh phúc"),
    locationAndDate: reconstructed.fields.locationAndDate || "",
    documentType:
      reconstructed.fields.documentType ||
      parsed.structured.fields.documentType?.value ||
      "",
    referenceNumber: reconstructed.fields.referenceNumber || "",
    subject: reconstructed.fields.subject || "",
    bodyHtml: reconstructed.bodyHtml,
    signTitle: reconstructed.fields.signTitle || "",
    signName: reconstructed.fields.signName || "",
    recipients: reconstructed.fields.recipients || "",
    appendices: reconstructed.appendices,
    unclassified: reconstructed.unclassified,
    importMetadata: {
      sourceType: parsed.fileType || "docx",
      status: deriveImportStatus(
        {
          ...parsed.structured,
          unclassified: reconstructed.unclassified,
          appendices: reconstructed.appendices,
        },
        false
      ),
      sourceFilename: parsed.filename,
    },
  };

  const originalSnapshot: OriginalDocumentSnapshot = {
    sourceType: "uploaded_file",
    fileName: parsed.filename,
    fileType: parsed.fileType,
    uploadedAt: new Date().toISOString(),
    bodyHtml: cleanHtml,
    rawText,
    blockCount: parsed.blockCount,
    tableCount: rawBlocks.filter((b) => b.kind === "table").length,
    sourceHash: parsed.sourceHash,
  };

  return {
    doc: newDoc,
    effectiveRegime,
    rawBlocks,
    reviewBlocks,
    structuredImport: {
      ...parsed.structured,
      blocks: reviewBlocks,
    },
    rawText,
    cleanHtml,
    originalSnapshot,
    uploadedFileName: parsed.filename,
    uploadedFileType: parsed.fileType,
    blockCount: parsed.blockCount,
    storageStatus: parsed.storageStatus,
    initialRuleProposals,
  };
}

/**
 * Atomically commits a prepared import bundle and resets all source-bound state from the previous session.
 */
export function commitImportedFileBundle(
  _previousState: ImportSessionState,
  bundle: PreparedImportBundle
): ImportSessionState {
  return {
    doc: bundle.doc,
    standardType: bundle.effectiveRegime,
    rawText: bundle.rawText,
    uploadedFileName: bundle.uploadedFileName,
    uploadedHtml: bundle.cleanHtml,
    uploadedFileType: bundle.uploadedFileType,
    originalSnapshot: bundle.originalSnapshot,
    sourceStorageStatus: bundle.storageStatus,
    uploadedBlocks: bundle.rawBlocks,
    structuredImport: bundle.structuredImport,
    reviewBlocks: bundle.reviewBlocks,
    importReviewAccepted: false,
    partitionProposals: [],
    verifiedPartitionProposalIds: new Set<string>(),
    partitionHistory: [],
    userModifiedBlockIds: [],
    partitionCheckNotice: "",
    partitionCheckSource: "unverified",
    reviewProposals: bundle.initialRuleProposals,
    acceptedProposalIds: new Set<string>(),
  };
}

/**
 * Atomically replaces active session with a system template or Pilot document,
 * clearing all imported-file blocks, source blob links, and stale AI/partition state.
 */
export function commitTemplateOrPilotReplacement(
  _previousState: ImportSessionState,
  params: {
    doc: DocumentState;
    standardType: "state" | "party";
    originalSnapshot: OriginalDocumentSnapshot;
  }
): ImportSessionState {
  const cleanSnapshot: OriginalDocumentSnapshot = {
    ...params.originalSnapshot,
    sourceType: "system_template",
    sourceHash: undefined,
  };

  return {
    doc: params.doc,
    standardType: params.standardType,
    rawText: cleanSnapshot.rawText || "",
    uploadedFileName: cleanSnapshot.fileName || "",
    uploadedHtml: cleanSnapshot.bodyHtml || "",
    uploadedFileType: null,
    originalSnapshot: cleanSnapshot,
    sourceStorageStatus: null,
    uploadedBlocks: [],
    structuredImport: null,
    reviewBlocks: [],
    importReviewAccepted: false,
    partitionProposals: [],
    verifiedPartitionProposalIds: new Set<string>(),
    partitionHistory: [],
    userModifiedBlockIds: [],
    partitionCheckNotice: "",
    partitionCheckSource: "unverified",
    reviewProposals: [],
    acceptedProposalIds: new Set<string>(),
  };
}

/**
 * Restores a saved Version without leaking the currently active source blob or partition state
 * if the version did not record its own source identity.
 */
export function commitVersionRestore(
  _previousState: ImportSessionState,
  version: VersionWithSourceSnapshot
): ImportSessionState {
  const rawHtml = version.data?.bodyHtml || "";
  const matches =
    rawHtml.match(/<[^>]+>[\s\S]*?<\/[^>]+>/g) || (rawHtml.trim() ? [rawHtml] : []);

  const restoredBlocks: SourceBlock[] =
    version.reviewBlocks && version.reviewBlocks.length > 0
      ? version.reviewBlocks.map((b) => ({ ...b }))
      : matches.length > 0
        ? matches.map((h, i) => ({
            id: `restored_${i}_${version.id}`,
            index: i,
            kind: /<table\b/i.test(h) ? ("table" as const) : ("paragraph" as const),
            role: "body" as const,
            text: h.replace(/<[^>]+>/g, "").trim(),
            html: h,
          }))
        : [
            {
              id: `restored_0_${version.id}`,
              index: 0,
              kind: "paragraph" as const,
              role: "body" as const,
              text: rawHtml.replace(/<[^>]+>/g, "").trim(),
              html: rawHtml || "<p></p>",
            },
          ];

  const hasKnownSourceSnapshot = version.originalSnapshot !== undefined;
  const restoredSnapshot = hasKnownSourceSnapshot ? version.originalSnapshot ?? null : null;

  const restoredFileType =
    version.uploadedFileType !== undefined
      ? version.uploadedFileType
      : restoredSnapshot?.fileType === "docx" || restoredSnapshot?.fileType === "txt"
        ? restoredSnapshot.fileType
        : null;

  const restoredFileName =
    version.uploadedFileName !== undefined
      ? version.uploadedFileName
      : restoredSnapshot?.fileName || "";

  const restoredRawText =
    version.rawText !== undefined
      ? version.rawText
      : restoredSnapshot?.rawText || rawHtml.replace(/<[^>]+>/g, " ").trim();

  const restoredHtml = restoredSnapshot?.bodyHtml || rawHtml;

  return {
    doc: { ...version.data },
    standardType: version.standardType,
    rawText: restoredRawText,
    uploadedFileName: restoredFileName,
    uploadedHtml: restoredHtml,
    uploadedFileType: restoredFileType,
    originalSnapshot: restoredSnapshot,
    sourceStorageStatus: null,
    uploadedBlocks: version.uploadedBlocks ? version.uploadedBlocks.map((b) => ({ ...b })) : [],
    structuredImport: version.structuredImport ? { ...version.structuredImport } : null,
    reviewBlocks: restoredBlocks,
    importReviewAccepted: false,
    partitionProposals: [],
    verifiedPartitionProposalIds: new Set<string>(),
    partitionHistory: [],
    userModifiedBlockIds: [],
    partitionCheckNotice: "",
    partitionCheckSource: "unverified",
    reviewProposals: [],
    acceptedProposalIds: new Set<string>(),
  };
}
