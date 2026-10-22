/**
 * @file documentSessionTypes.ts
 * @description Shared types, constants and error classes for multiple independent
 * document sessions stored in IndexedDB (schema v3).
 *
 * A "session" is one document being worked on. A "version" is a milestone inside a
 * session. Session IDs are random UUIDs (or the fixed legacy ID below) and are never
 * derived from a file name, source SHA-256 or `block-N`.
 */

import type { Version } from "../App.tsx";
import type {
  PartitionProposal,
  ReviewProposal,
  DocumentState,
} from "../shared/schemas/document.schema.ts";
import type { DraftRecord } from "./draftStore.ts";
import type { WorkspaceState } from "./workspaceState.ts";
import { isWorkspaceStateValid } from "./workspacePersistence.ts";
import { isPersistedFullTextSemanticReviewValid } from "./fullTextReviewPersistence.ts";

/** Stable ID of the session created from the v2 `current_active_draft` record. */
export const LEGACY_SESSION_ID = "legacy-current-active-draft";
/** `app_meta` keys. */
export const META_ACTIVE_SESSION_ID = "activeSessionId";
export const META_LEGACY_MIGRATION = "legacyMigration";

export type SessionStatus = "active" | "archived";
export type SessionSourceKind = "uploaded_file" | "system_template" | "unknown";

export interface DocumentSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  standardType: "state" | "party";
  sourceKind: SessionSourceKind;
  sourceFileName?: string;
  /** Always equals the revision of the matching full record in `drafts`. */
  revision: number;
}

export interface SessionVersion extends Version {
  sourceGeneration: number;
  workspace?: WorkspaceState;
  docTypeOverride?: DraftRecord["docTypeOverride"];
}

export interface SessionWorkflowState {
  importReviewAccepted: boolean;
  userModifiedBlockIds: string[];
  partitionProposals: PartitionProposal[];
  verifiedPartitionProposalIds: string[];
  reviewProposals: ReviewProposal[];
  acceptedProposalIds: string[];
}

export interface DocumentSessionRecord
  extends Omit<DraftRecord, "schemaVersion" | "id" | "versions"> {
  schemaVersion: 3;
  id: string;
  title?: string;
  /** Monotonic; incremented by the repository on every durable write. */
  revision: number;
  /** Incremented when the source is replaced (even with identical bytes). */
  sourceGeneration: number;
  versions: SessionVersion[];
  workflow: SessionWorkflowState;
}

/** Value stored in `app_meta` under {@link META_LEGACY_MIGRATION}. */
export interface LegacyMigrationMarker {
  status: "done";
  sessionId: string;
  migratedAt: string;
  legacyUpdatedAt: string;
}

export type LegacyMigrationStatus =
  | "nothing_to_migrate"
  | "already_migrated"
  | "migrated"
  | "repaired";

export interface LegacyMigrationResult {
  status: LegacyMigrationStatus;
  sessionId?: string;
}

/** Another writer saved this session first (or the caller read a stale revision). */
export class SessionRevisionConflictError extends Error {
  readonly sessionId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number | null;
  constructor(sessionId: string, expectedRevision: number, actualRevision: number | null) {
    super(
      `Xung đột phiên bản lưu của phiên ${sessionId}: mong đợi revision ${expectedRevision}, hiện có ${actualRevision ?? "không tồn tại"}.`
    );
    this.name = "SessionRevisionConflictError";
    this.sessionId = sessionId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

/** The active-session pointer is not what the caller believed. */
export class ActiveSessionMismatchError extends Error {
  readonly expected: string | null;
  readonly actual: string | null;
  constructor(expected: string | null, actual: string | null) {
    super(
      `Phiên đang mở đã thay đổi: mong đợi ${expected ?? "không có"}, hiện là ${actual ?? "không có"}.`
    );
    this.name = "ActiveSessionMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class SessionNotFoundError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Không tìm thấy phiên tài liệu ${sessionId}.`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}

export class SessionAlreadyExistsError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Phiên tài liệu ${sessionId} đã tồn tại.`);
    this.name = "SessionAlreadyExistsError";
    this.sessionId = sessionId;
  }
}

/** A stored session record fails schema validation. */
export class SessionCorruptError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string, details?: string) {
    super(
      details
        ? `Dữ liệu phiên tài liệu ${sessionId} bị hỏng: ${details}`
        : `Dữ liệu phiên tài liệu ${sessionId} bị hỏng hoặc không đúng cấu trúc.`
    );
    this.name = "SessionCorruptError";
    this.sessionId = sessionId;
  }
}

/**
 * The 12 required keys of DocumentState that must be present as strings in storage.
 * Empty strings are valid for in-progress drafts, but missing or wrong-type keys indicate corruption.
 */
export const REQUIRED_DOCUMENT_STATE_KEYS = [
  "orgHeader1",
  "orgHeader2",
  "nationalHeader1",
  "nationalHeader2",
  "locationAndDate",
  "documentType",
  "referenceNumber",
  "subject",
  "bodyHtml",
  "signTitle",
  "signName",
  "recipients",
] as const;

/**
 * Validates that an object satisfies structural DocumentState storage integrity.
 * Requires all 12 keys to be present and of string type (empty strings allowed).
 */
export function isDocumentStateValid(doc: any): doc is DocumentState {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  for (const key of REQUIRED_DOCUMENT_STATE_KEYS) {
    if (typeof doc[key] !== "string") return false;
  }
  if (doc.appendices !== undefined) {
    if (!Array.isArray(doc.appendices)) return false;
    for (const app of doc.appendices) {
      if (!app || typeof app !== "object" || Array.isArray(app)) return false;
      if (typeof app.id !== "string" || !app.id.trim()) return false;
      if (typeof app.title !== "string") return false;
      if (typeof app.html !== "string") return false;
    }
  }
  if (doc.unclassified !== undefined) {
    if (!Array.isArray(doc.unclassified)) return false;
  }
  if (doc.importMetadata !== undefined) {
    if (!doc.importMetadata || typeof doc.importMetadata !== "object" || Array.isArray(doc.importMetadata)) return false;
  }
  return true;
}

export const VALID_SOURCE_REGIONS = new Set<string>([
  "header",
  "metadata",
  "body",
  "signature",
  "recipients",
  "appendix",
  "separator",
  "unclassified",
]);

export function isPartitionProposalValid(p: any): p is PartitionProposal {
  if (!p || typeof p !== "object") return false;
  if (p.id !== undefined && (typeof p.id !== "string" || !p.id.trim())) return false;
  if (typeof p.sourceBlockId !== "string" || !p.sourceBlockId.trim()) return false;
  if (p.sourceGeneration !== undefined && (!Number.isSafeInteger(p.sourceGeneration) || p.sourceGeneration < 0)) return false;
  if (p.partitionRevision !== undefined && (!Number.isSafeInteger(p.partitionRevision) || p.partitionRevision < 0)) return false;
  if (!VALID_SOURCE_REGIONS.has(p.currentRole)) return false;
  if (!VALID_SOURCE_REGIONS.has(p.suggestedRole)) return false;
  if (p.fieldKey !== undefined && typeof p.fieldKey !== "string") return false;
  if (typeof p.exactQuote !== "string") return false;
  if (p.cellLocation !== undefined && p.cellLocation !== null) {
    if (typeof p.cellLocation !== "object") return false;
    if (
      typeof p.cellLocation.rowIndex !== "number" ||
      !Number.isInteger(p.cellLocation.rowIndex) ||
      !Number.isFinite(p.cellLocation.rowIndex) ||
      p.cellLocation.rowIndex < 0
    ) {
      return false;
    }
    if (
      typeof p.cellLocation.colIndex !== "number" ||
      !Number.isInteger(p.cellLocation.colIndex) ||
      !Number.isFinite(p.cellLocation.colIndex) ||
      p.cellLocation.colIndex < 0
    ) {
      return false;
    }
  } else if (p.cellLocation === null) {
    return false;
  }
  if (typeof p.reason !== "string") return false;
  if (p.confidence !== "high" && p.confidence !== "medium" && p.confidence !== "low") return false;
  if (
    p.status !== "pending" &&
    p.status !== "accepted" &&
    p.status !== "rejected" &&
    p.status !== "skipped"
  ) {
    return false;
  }
  if (p.regime !== "administrative" && p.regime !== "party") return false;
  if (p.componentGroupIndex !== undefined) {
    if (
      typeof p.componentGroupIndex !== "number" ||
      !Number.isInteger(p.componentGroupIndex) ||
      !Number.isFinite(p.componentGroupIndex) ||
      p.componentGroupIndex < 1 ||
      p.componentGroupIndex > 9
    ) {
      return false;
    }
  }
  if (p.requiresUserVerification !== undefined && typeof p.requiresUserVerification !== "boolean") {
    return false;
  }
  return true;
}

export const VALID_REVIEW_PROPOSAL_TYPES = new Set<string>([
  "segmentation",
  "format",
  "spelling",
  "consistency",
]);

export function isReviewProposalValid(r: any): r is ReviewProposal {
  if (!r || typeof r !== "object") return false;
  if (typeof r.id !== "string" || !r.id.trim()) return false;
  if (!VALID_REVIEW_PROPOSAL_TYPES.has(r.type)) return false;
  if (typeof r.target !== "string") return false;
  if (r.targetBlockId !== undefined && typeof r.targetBlockId !== "string") return false;
  if (r.cellIndex !== undefined && r.cellIndex !== null) {
    if (typeof r.cellIndex !== "object") return false;
    if (
      typeof r.cellIndex.row !== "number" ||
      !Number.isInteger(r.cellIndex.row) ||
      !Number.isFinite(r.cellIndex.row) ||
      r.cellIndex.row < 0
    ) {
      return false;
    }
    if (
      typeof r.cellIndex.col !== "number" ||
      !Number.isInteger(r.cellIndex.col) ||
      !Number.isFinite(r.cellIndex.col) ||
      r.cellIndex.col < 0
    ) {
      return false;
    }
  } else if (r.cellIndex === null) {
    return false;
  }
  if (typeof r.original !== "string") return false;
  if (typeof r.suggested !== "string") return false;
  if (typeof r.reason !== "string") return false;
  if (r.confidence !== "high" && r.confidence !== "medium" && r.confidence !== "low") return false;
  if (r.source !== undefined && r.source !== "gemini_ai" && r.source !== "chatgpt_ai" && r.source !== "rule_fallback") return false;
  if (r.label !== undefined && typeof r.label !== "string") return false;
  if (r.title !== undefined && typeof r.title !== "string") return false;
  return true;
}

/**
 * Validates that an object conforms strictly to the SourceBlock schema.
 */
export function isSourceBlockValid(b: any): boolean {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  if (typeof b.id !== "string" || !b.id.trim()) return false;
  if (typeof b.index !== "number" || !Number.isSafeInteger(b.index) || b.index < 0) return false;
  if (b.kind !== "paragraph" && b.kind !== "table" && b.kind !== "section-break") return false;
  if (typeof b.text !== "string") return false;
  if (b.html !== undefined && typeof b.html !== "string") return false;
  if (b.rawXml !== undefined && typeof b.rawXml !== "string") return false;
  if (b.style !== undefined && typeof b.style !== "string") return false;
  if (b.sourcePath !== undefined && typeof b.sourcePath !== "string") return false;
  if (b.confidence !== undefined && b.confidence !== "high" && b.confidence !== "medium" && b.confidence !== "low") return false;
  if (b.isConfirmed !== undefined && typeof b.isConfirmed !== "boolean") return false;
  if (b.role !== undefined && !VALID_SOURCE_REGIONS.has(b.role)) return false;
  if (b.tableShape !== undefined) {
    if (!b.tableShape || typeof b.tableShape !== "object" || Array.isArray(b.tableShape)) return false;
    if (typeof b.tableShape.rows !== "number" || !Number.isSafeInteger(b.tableShape.rows) || b.tableShape.rows < 0) return false;
    if (typeof b.tableShape.columns !== "number" || !Number.isSafeInteger(b.tableShape.columns) || b.tableShape.columns < 0) return false;
  }
  if (b.tableCell !== undefined) {
    if (!b.tableCell || typeof b.tableCell !== "object" || Array.isArray(b.tableCell)) return false;
    const r = b.tableCell.row ?? b.tableCell.rowIndex ?? b.tableCell.r;
    const c = b.tableCell.col ?? b.tableCell.colIndex ?? b.tableCell.c;
    if (r !== undefined && (typeof r !== "number" || !Number.isSafeInteger(r) || r < 0)) return false;
    if (c !== undefined && (typeof c !== "number" || !Number.isSafeInteger(c) || c < 0)) return false;
  }
  return true;
}

/**
 * Validates that an object conforms strictly to OriginalDocumentSnapshot.
 */
export function isOriginalSnapshotValid(snap: any): boolean {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return false;
  if (snap.sourceType !== "uploaded_file" && snap.sourceType !== "system_template") return false;
  if (
    typeof snap.uploadedAt !== "string" ||
    Number.isNaN(Date.parse(snap.uploadedAt))
  ) {
    return false;
  }
  if (typeof snap.bodyHtml !== "string") return false;

  if (snap.fileName !== undefined && typeof snap.fileName !== "string") return false;
  if (
    snap.fileType !== undefined &&
    snap.fileType !== "docx" &&
    snap.fileType !== "txt" &&
    snap.fileType !== "template"
  ) {
    return false;
  }
  if (snap.sourceId !== undefined && typeof snap.sourceId !== "string") return false;
  if (snap.sourceHash !== undefined && typeof snap.sourceHash !== "string") return false;
  if (snap.rawText !== undefined && typeof snap.rawText !== "string") return false;
  if (
    snap.fileSize !== undefined &&
    (typeof snap.fileSize !== "number" || !Number.isFinite(snap.fileSize) || snap.fileSize < 0)
  ) {
    return false;
  }
  if (
    snap.blockCount !== undefined &&
    (typeof snap.blockCount !== "number" || !Number.isSafeInteger(snap.blockCount) || snap.blockCount < 0)
  ) {
    return false;
  }
  if (
    snap.tableCount !== undefined &&
    (typeof snap.tableCount !== "number" || !Number.isSafeInteger(snap.tableCount) || snap.tableCount < 0)
  ) {
    return false;
  }
  return true;
}

/**
 * Validates that an object conforms strictly to ExtractedField schema.
 */
export function isExtractedFieldValid(f: any): boolean {
  if (!f || typeof f !== "object" || Array.isArray(f)) return false;
  if (f.value !== null && typeof f.value !== "string") return false;
  if (f.confidence !== "high" && f.confidence !== "medium" && f.confidence !== "low") return false;
  if (
    f.status !== "extracted" &&
    f.status !== "missing" &&
    f.status !== "ambiguous" &&
    f.status !== "user_confirmed"
  ) {
    return false;
  }
  if (!Array.isArray(f.sourceBlockIds)) return false;
  for (const id of f.sourceBlockIds) {
    if (typeof id !== "string") return false;
  }
  if (f.note !== undefined && typeof f.note !== "string") return false;
  return true;
}

/**
 * Validates that an object conforms strictly to StructuredImport.
 */
export function isStructuredImportValid(si: any): boolean {
  if (!si || typeof si !== "object" || Array.isArray(si)) return false;

  // source
  if (!si.source || typeof si.source !== "object" || Array.isArray(si.source)) return false;
  if (typeof si.source.filename !== "string") return false;
  if (si.source.type !== "docx" && si.source.type !== "txt") return false;
  if (typeof si.source.blockCount !== "number" || !Number.isSafeInteger(si.source.blockCount) || si.source.blockCount < 0) return false;
  if (
    si.source.fileSize !== undefined &&
    (typeof si.source.fileSize !== "number" || !Number.isFinite(si.source.fileSize) || si.source.fileSize < 0)
  ) {
    return false;
  }
  if (
    si.source.extractedAt !== undefined &&
    (typeof si.source.extractedAt !== "string" || Number.isNaN(Date.parse(si.source.extractedAt)))
  ) {
    return false;
  }
  if (si.source.hash !== undefined && typeof si.source.hash !== "string") return false;
  if (si.source.previewText !== undefined && typeof si.source.previewText !== "string") return false;

  // fields: Record<string, ExtractedField<string>>
  if (!si.fields || typeof si.fields !== "object" || Array.isArray(si.fields)) return false;
  for (const [key, field] of Object.entries(si.fields)) {
    if (typeof key !== "string") return false;
    if (!isExtractedFieldValid(field)) return false;
  }

  // body
  if (!si.body || typeof si.body !== "object" || Array.isArray(si.body)) return false;
  if (typeof si.body.html !== "string") return false;
  if (!Array.isArray(si.body.sourceBlockIds)) return false;
  for (const id of si.body.sourceBlockIds) {
    if (typeof id !== "string") return false;
  }

  // appendices
  if (!Array.isArray(si.appendices)) return false;
  for (const app of si.appendices) {
    if (!app || typeof app !== "object" || Array.isArray(app)) return false;
    if (typeof app.id !== "string" || !app.id.trim()) return false;
    if (typeof app.title !== "string") return false;
    if (typeof app.html !== "string") return false;
    if (!Array.isArray(app.blocks)) return false;
    for (const b of app.blocks) {
      if (!isSourceBlockValid(b)) return false;
    }
    if (!Array.isArray(app.sourceBlockIds)) return false;
    for (const id of app.sourceBlockIds) {
      if (typeof id !== "string") return false;
    }
    if (app.extractionStatus !== "confirmed" && app.extractionStatus !== "needs_review") return false;
  }

  // unclassified
  if (!Array.isArray(si.unclassified)) return false;
  for (const b of si.unclassified) {
    if (!isSourceBlockValid(b)) return false;
  }

  // order
  if (!Array.isArray(si.order)) return false;
  for (const item of si.order) {
    if (typeof item !== "string") return false;
  }

  return true;
}

/**
 * Validates that an object conforms strictly to SessionVersion.
 * Note: canonical v3 requires title (not name), data (not doc), and positive sourceGeneration.
 */
export function isSessionVersionValid(v: any): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  if (typeof v.id !== "string" || !v.id.trim()) return false;
  if (typeof v.timestamp !== "string" || Number.isNaN(Date.parse(v.timestamp))) return false;
  if (typeof v.title !== "string") return false;
  if (v.standardType !== "state" && v.standardType !== "party") return false;
  if (
    typeof v.sourceGeneration !== "number" ||
    !Number.isSafeInteger(v.sourceGeneration) ||
    v.sourceGeneration < 1
  ) {
    return false;
  }
  if (!isDocumentStateValid(v.data)) return false;
  if (v.workspace !== undefined && !isWorkspaceStateValid(v.workspace, {
    doc: v.data, standardType: v.standardType, reviewBlocks: v.reviewBlocks ?? [], structuredImport: v.structuredImport ?? null,
  })) return false;

  if (v.uploadedFileName !== undefined && typeof v.uploadedFileName !== "string") return false;
  if (v.uploadedFileType !== undefined && v.uploadedFileType !== null) {
    if (v.uploadedFileType !== "docx" && v.uploadedFileType !== "txt") return false;
  }
  if (v.rawText !== undefined && typeof v.rawText !== "string") return false;

  if (v.originalSnapshot !== undefined && v.originalSnapshot !== null) {
    if (!isOriginalSnapshotValid(v.originalSnapshot)) return false;
  }
  if (v.reviewBlocks !== undefined) {
    if (!Array.isArray(v.reviewBlocks)) return false;
    for (const b of v.reviewBlocks) {
      if (!isSourceBlockValid(b)) return false;
    }
  }
  if (v.uploadedBlocks !== undefined) {
    if (!Array.isArray(v.uploadedBlocks)) return false;
    for (const b of v.uploadedBlocks) {
      if (!isSourceBlockValid(b)) return false;
    }
  }
  if (v.structuredImport !== undefined && v.structuredImport !== null) {
    if (!isStructuredImportValid(v.structuredImport)) return false;
  }

  return true;
}

/**
 * Validates that an object conforms strictly to the v3 DocumentSessionRecord schema.
 */
export function isDocumentSessionRecordValid(
  record: any,
  expectedId?: string
): record is DocumentSessionRecord {
  if (!record || typeof record !== "object") return false;
  if (record.schemaVersion !== 3) return false;
  if (typeof record.id !== "string" || !record.id.trim()) return false;
  if (expectedId !== undefined && record.id !== expectedId) return false;

  if (
    typeof record.revision !== "number" ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1
  ) {
    return false;
  }
  if (
    typeof record.sourceGeneration !== "number" ||
    !Number.isSafeInteger(record.sourceGeneration) ||
    record.sourceGeneration < 1
  ) {
    return false;
  }

  if (
    typeof record.updatedAt !== "string" ||
    Number.isNaN(Date.parse(record.updatedAt))
  ) {
    return false;
  }

  if (record.standardType !== "state" && record.standardType !== "party") {
    return false;
  }

  if (!isDocumentStateValid(record.doc)) {
    return false;
  }
  if (record.workspace !== undefined && !isWorkspaceStateValid(record.workspace, {
    doc: record.doc, standardType: record.standardType, reviewBlocks: record.reviewBlocks ?? [], structuredImport: record.structuredImport ?? null,
  })) return false;

  // Validate optional metadata fields when present (S02)
  if (record.title !== undefined && typeof record.title !== "string") {
    return false;
  }
  if (record.uploadedFileName !== undefined && typeof record.uploadedFileName !== "string") {
    return false;
  }
  if (record.rawText !== undefined && typeof record.rawText !== "string") {
    return false;
  }

  if (record.uploadedFileType !== undefined && record.uploadedFileType !== null) {
    if (record.uploadedFileType !== "docx" && record.uploadedFileType !== "txt") {
      return false;
    }
  }

  if (record.originalSnapshot !== undefined && record.originalSnapshot !== null) {
    if (!isOriginalSnapshotValid(record.originalSnapshot)) return false;
  }

  if (record.reviewBlocks !== undefined) {
    if (!Array.isArray(record.reviewBlocks)) return false;
    for (const b of record.reviewBlocks) {
      if (!isSourceBlockValid(b)) return false;
    }
  }

  if (record.uploadedBlocks !== undefined) {
    if (!Array.isArray(record.uploadedBlocks)) return false;
    for (const b of record.uploadedBlocks) {
      if (!isSourceBlockValid(b)) return false;
    }
  }

  if (record.structuredImport !== undefined && record.structuredImport !== null) {
    if (!isStructuredImportValid(record.structuredImport)) return false;
  }

  if (record.semanticDecisions !== undefined) {
    if (!record.semanticDecisions || typeof record.semanticDecisions !== "object" || Array.isArray(record.semanticDecisions)) return false;
    for (const [unitId, decision] of Object.entries(record.semanticDecisions)) {
      if (!unitId || !decision || typeof decision !== "object") return false;
      const value = decision as { contextKey?: unknown; status?: unknown; evidenceFingerprint?: unknown };
      if (typeof value.contextKey !== "string" ||
          (value.status !== "user_confirmed" && value.status !== "rejected") ||
          (value.evidenceFingerprint !== undefined && (typeof value.evidenceFingerprint !== "string" || value.evidenceFingerprint.length > 200_000))) return false;
    }
  }
  if (record.fullTextSemanticReview !== undefined && !isPersistedFullTextSemanticReviewValid(record.fullTextSemanticReview)) return false;

  if (!Array.isArray(record.versions)) return false;
  for (const v of record.versions) {
    if (!isSessionVersionValid(v)) return false;
  }

  const wf = record.workflow;
  if (!wf || typeof wf !== "object") return false;
  if (typeof wf.importReviewAccepted !== "boolean") return false;

  if (!Array.isArray(wf.userModifiedBlockIds)) return false;
  for (const id of wf.userModifiedBlockIds) {
    if (typeof id !== "string" || !id.trim()) return false;
  }

  if (!Array.isArray(wf.verifiedPartitionProposalIds)) return false;
  for (const id of wf.verifiedPartitionProposalIds) {
    if (typeof id !== "string" || !id.trim()) return false;
  }

  if (!Array.isArray(wf.acceptedProposalIds)) return false;
  for (const id of wf.acceptedProposalIds) {
    if (typeof id !== "string" || !id.trim()) return false;
  }

  if (!Array.isArray(wf.partitionProposals)) return false;
  for (const p of wf.partitionProposals) {
    if (!isPartitionProposalValid(p)) return false;
  }

  if (!Array.isArray(wf.reviewProposals)) return false;
  for (const r of wf.reviewProposals) {
    if (!isReviewProposalValid(r)) return false;
  }

  return true;
}

/**
 * Checks whether an invalid or partial v3 record contains valuable user content
 * or source references that must NEVER be silently overwritten by an older legacy draft (C01, D01).
 */
export function hasPreservableV3Content(record: any): boolean {
  if (!record || typeof record !== "object") return false;

  // A frozen draft / ledger may be the only surviving copy after a partial write.
  // Treat even a damaged workspace as valuable; migration must never replace it.
  if (record.workspace !== undefined && record.workspace !== null) return true;
  if (record.semanticDecisions && typeof record.semanticDecisions === "object" &&
      Object.keys(record.semanticDecisions).length > 0) return true;
  if (record.fullTextSemanticReview !== undefined) return true;

  // 1. Any version containing data, doc, or other user content
  if (Array.isArray(record.versions) && record.versions.length > 0) {
    if (
      record.versions.some(
        (v: any) =>
          v &&
          typeof v === "object" &&
          (v.data ||
            v.doc ||
            v.workspace ||
            v.originalSnapshot ||
            (Array.isArray(v.reviewBlocks) && v.reviewBlocks.length > 0) ||
            (Array.isArray(v.uploadedBlocks) && v.uploadedBlocks.length > 0) ||
            v.structuredImport ||
            v.rawText)
      )
    ) {
      return true;
    }
  }

  // 2. Doc containing any of the 12 required keys as strings or any non-empty string content
  const doc = record.doc;
  if (doc && typeof doc === "object") {
    if (REQUIRED_DOCUMENT_STATE_KEYS.some((k) => typeof doc[k] === "string")) {
      return true;
    }
    if (Object.values(doc).some((val) => typeof val === "string" && val.trim().length > 0)) {
      return true;
    }
  }

  // 3. Original snapshot containing content or provenance (D01)
  const snap = record.originalSnapshot;
  if (snap && typeof snap === "object") {
    if (
      typeof snap.bodyHtml === "string" ||
      typeof snap.fileName === "string" ||
      typeof snap.sourceHash === "string" ||
      typeof snap.sourceId === "string" ||
      typeof snap.rawText === "string" ||
      snap.sourceType === "uploaded_file" ||
      snap.sourceType === "system_template"
    ) {
      return true;
    }
  }

  // 4. Review blocks or uploaded blocks containing content (D01)
  if (Array.isArray(record.reviewBlocks) && record.reviewBlocks.length > 0) {
    if (
      record.reviewBlocks.some(
        (b: any) =>
          b &&
          typeof b === "object" &&
          (typeof b.text === "string" || typeof b.html === "string" || typeof b.id === "string")
      )
    ) {
      return true;
    }
  }

  if (Array.isArray(record.uploadedBlocks) && record.uploadedBlocks.length > 0) {
    if (
      record.uploadedBlocks.some(
        (b: any) =>
          b &&
          typeof b === "object" &&
          (typeof b.text === "string" || typeof b.html === "string" || typeof b.id === "string")
      )
    ) {
      return true;
    }
  }

  // 5. Structured import containing content (D01)
  const si = record.structuredImport;
  if (si && typeof si === "object") {
    if (
      typeof si.body?.html === "string" ||
      typeof si.source?.filename === "string" ||
      (Array.isArray(si.appendices) && si.appendices.length > 0) ||
      (Array.isArray(si.unclassified) && si.unclassified.length > 0) ||
      (si.fields && typeof si.fields === "object" && Object.keys(si.fields).length > 0)
    ) {
      return true;
    }
  }

  // 6. Raw text or uploaded file name (D01)
  if (typeof record.rawText === "string" && record.rawText.trim().length > 0) {
    return true;
  }
  if (typeof record.uploadedFileName === "string" && record.uploadedFileName.trim().length > 0) {
    return true;
  }

  // 7. Workflow modified blocks or proposals (D01)
  const wf = record.workflow;
  if (wf && typeof wf === "object") {
    if (
      (Array.isArray(wf.userModifiedBlockIds) && wf.userModifiedBlockIds.length > 0) ||
      (Array.isArray(wf.partitionProposals) && wf.partitionProposals.length > 0) ||
      (Array.isArray(wf.reviewProposals) && wf.reviewProposals.length > 0)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that an object conforms strictly to the DocumentSessionSummary schema.
 */
export function isDocumentSessionSummaryValid(
  summary: any,
  expectedId?: string
): summary is DocumentSessionSummary {
  if (!summary || typeof summary !== "object") return false;
  if (typeof summary.id !== "string" || !summary.id.trim()) return false;
  if (expectedId !== undefined && summary.id !== expectedId) return false;
  if (typeof summary.title !== "string") return false;
  if (summary.status !== "active" && summary.status !== "archived") return false;
  if (summary.standardType !== "state" && summary.standardType !== "party") return false;
  if (
    summary.sourceKind !== "uploaded_file" &&
    summary.sourceKind !== "system_template" &&
    summary.sourceKind !== "unknown"
  ) {
    return false;
  }
  if (
    summary.sourceFileName !== undefined &&
    typeof summary.sourceFileName !== "string"
  ) {
    return false;
  }
  if (
    typeof summary.revision !== "number" ||
    !Number.isSafeInteger(summary.revision) ||
    summary.revision < 1
  ) {
    return false;
  }
  if (
    typeof summary.createdAt !== "string" ||
    Number.isNaN(Date.parse(summary.createdAt))
  ) {
    return false;
  }
  if (
    typeof summary.updatedAt !== "string" ||
    Number.isNaN(Date.parse(summary.updatedAt))
  ) {
    return false;
  }
  return true;
}

/**
 * Unifies source metadata derivation across summary builder and pair checker (C03).
 * Prioritizes system_template; for uploaded_file, uses snapshot.fileName if non-empty,
 * otherwise falls back to uploadedFileName if non-empty; otherwise returns unknown.
 */
export function deriveSourceMetadata(record: any): {
  sourceKind: SessionSourceKind;
  sourceFileName?: string;
} {
  if (!record || typeof record !== "object") {
    return { sourceKind: "unknown", sourceFileName: undefined };
  }

  const snap = record.originalSnapshot;
  if (snap?.sourceType === "system_template") {
    return { sourceKind: "system_template", sourceFileName: undefined };
  }

  const snapName = typeof snap?.fileName === "string" ? snap.fileName.trim() : "";
  const uploadName = typeof record.uploadedFileName === "string" ? record.uploadedFileName.trim() : "";

  if (snap?.sourceType === "uploaded_file" || uploadName.length > 0) {
    const fileName = snapName.length > 0 ? snapName : (uploadName.length > 0 ? uploadName : undefined);
    return { sourceKind: "uploaded_file", sourceFileName: fileName };
  }

  return { sourceKind: "unknown", sourceFileName: undefined };
}

/**
 * Enforces record-summary pair linkage invariants across write boundaries.
 * Guarantees same id, same revision, same standardType, and matching derived source metadata.
 */
export function isSummaryConsistentWithRecord(
  summary: any,
  record: any
): boolean {
  if (!summary || typeof summary !== "object") return false;
  if (!record || typeof record !== "object") return false;
  if (summary.id !== record.id) return false;
  if (summary.revision !== record.revision) return false;
  if (summary.standardType !== record.standardType) return false;

  const { sourceKind: expectedSourceKind, sourceFileName: expectedSourceFileName } =
    deriveSourceMetadata(record);

  if (summary.sourceKind !== expectedSourceKind) return false;
  if (summary.sourceFileName !== undefined && typeof summary.sourceFileName !== "string") {
    return false;
  }
  const normSummaryFile =
    typeof summary.sourceFileName === "string" && summary.sourceFileName.trim().length > 0
      ? summary.sourceFileName.trim()
      : undefined;
  if (normSummaryFile !== expectedSourceFileName) return false;

  return true;
}

function isValidIsoDate(d: any): boolean {
  return typeof d === "string" && d.trim().length > 0 && !Number.isNaN(Date.parse(d));
}

/**
 * Derives a DocumentSessionSummary from a full DocumentSessionRecord consistently.
 * Accurately updates standardType, sourceKind, sourceFileName, revision, and title.
 */
export function buildSummaryFromRecord(
  record: DocumentSessionRecord,
  options?: {
    status?: SessionStatus;
    createdAt?: string;
    existingSummary?: DocumentSessionSummary | null;
  }
): DocumentSessionSummary {
  const existing = options?.existingSummary;

  // Title: derived from record title, then valid existing title, then doc.subject, then default (D10, S01)
  const rawTitle = typeof record.title === "string" && record.title.trim() ? record.title.trim() : "";
  const existingTitle = typeof existing?.title === "string" && existing.title.trim() ? existing.title.trim() : "";
  const subjectTitle = typeof record.doc?.subject === "string" && record.doc.subject.trim() ? record.doc.subject.trim() : "";
  const title = rawTitle || existingTitle || subjectTitle || "Tài liệu chưa đặt tên";

  // Status: only active or archived are valid. (S01: if invalid in existing, default to active)
  let status: SessionStatus = "active";
  if (options?.status === "active" || options?.status === "archived") {
    status = options.status;
  } else if (existing?.status === "active" || existing?.status === "archived") {
    status = existing.status;
  }

  // CreatedAt: must be valid ISO date (S01: if invalid in existing, fallback to record.updatedAt)
  let createdAt: string;
  if (isValidIsoDate(options?.createdAt)) {
    createdAt = options!.createdAt!;
  } else if (isValidIsoDate(existing?.createdAt)) {
    createdAt = existing!.createdAt;
  } else if (isValidIsoDate(record.updatedAt)) {
    createdAt = record.updatedAt;
  } else {
    createdAt = new Date().toISOString();
  }

  const { sourceKind, sourceFileName } = deriveSourceMetadata(record);

  return {
    id: record.id,
    title,
    createdAt,
    updatedAt: record.updatedAt,
    status,
    standardType: record.standardType,
    sourceKind,
    sourceFileName,
    revision: record.revision,
  };
}

/**
 * Validates that source generation does not decrease, and increments when source identity changes (D07).
 */
export function validateSourceGenerationTransition(
  existing: DocumentSessionRecord,
  incoming: DocumentSessionRecord
): void {
  const existingGen = typeof existing.sourceGeneration === "number" ? existing.sourceGeneration : 1;
  const incomingGen = typeof incoming.sourceGeneration === "number" ? incoming.sourceGeneration : 1;
  if (incomingGen < existingGen) {
    throw new SessionCorruptError(
      incoming.id,
      `sourceGeneration cannot decrease (existing: ${existingGen}, incoming: ${incomingGen})`
    );
  }
  const existingSnap = existing.originalSnapshot;
  const incomingSnap = incoming.originalSnapshot;
  const existingHash =
    typeof existingSnap?.sourceHash === "string" && existingSnap.sourceHash.trim()
      ? existingSnap.sourceHash.trim()
      : null;
  const incomingHash =
    typeof incomingSnap?.sourceHash === "string" && incomingSnap.sourceHash.trim()
      ? incomingSnap.sourceHash.trim()
      : null;
  const existingType = existingSnap?.sourceType;
  const incomingType = incomingSnap?.sourceType;
  const sourceChanged =
    (existingHash !== null && incomingHash !== null && existingHash !== incomingHash) ||
    (existingType !== undefined && incomingType !== undefined && existingType !== incomingType);
  if (sourceChanged && incomingGen <= existingGen) {
    throw new SessionCorruptError(
      incoming.id,
      `sourceGeneration must increment when source identity changes (existing: ${existingGen}, incoming: ${incomingGen})`
    );
  }
}
