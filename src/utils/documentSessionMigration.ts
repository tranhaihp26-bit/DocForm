/**
 * @file documentSessionMigration.ts
 * @description Idempotent migration from v2 single-draft IndexedDB schema
 * to v3 multi-document session schema.
 *
 * Migration invariants:
 * 1. Deterministic session ID for the migrated legacy draft: `legacy-current-active-draft`.
 * 2. Preserves `current_active_draft` in `drafts` - never alters or deletes it.
 * 3. Preserves all entries in `source_blobs`.
 * 4. Writes record, summary, migration marker, and active pointer atomically.
 * 5. Idempotent: repeated runs make no writes and return `already_migrated`.
 * 6. Self-repairing:
 *    - If full v3 record is valid but summary is missing/corrupted, rebuilds summary from the v3 record,
 *      preserving any newer edits without overwriting from legacy.
 *    - Only rebuilds content from legacy when full record is truly missing or corrupt.
 * 7. If no legacy draft exists and no v3 record exists, returns `nothing_to_migrate` without creating dummy records.
 */

import {
  openDatabase,
  STORE_DRAFTS,
  STORE_SESSION_INDEX,
  STORE_APP_META,
  DEFAULT_DRAFT_ID,
  awaitTransactionCommit,
  getMemoryFallbackDrafts,
  type DraftRecord,
} from "./draftStore.ts";
import {
  LEGACY_SESSION_ID,
  META_ACTIVE_SESSION_ID,
  META_LEGACY_MIGRATION,
  SessionCorruptError,
  type DocumentSessionRecord,
  type DocumentSessionSummary,
  type SessionVersion,
  type LegacyMigrationMarker,
  type LegacyMigrationResult,
  isDocumentSessionRecordValid,
  isDocumentSessionSummaryValid,
  isSummaryConsistentWithRecord,
  isDocumentStateValid,
  isSourceBlockValid,
  isOriginalSnapshotValid,
  isStructuredImportValid,
  buildSummaryFromRecord,
  hasPreservableV3Content,
} from "./documentSessionTypes.ts";
import { isPersistedFullTextSemanticReviewValid } from "./fullTextReviewPersistence.ts";
import type { DocumentState } from "../shared/schemas/document.schema.ts";
import {
  memoryFallbackSessionIndex,
  memoryFallbackAppMeta,
} from "./documentSessionStore.ts";

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request error"));
  });
}

function isLegacyDocValid(doc: any): boolean {
  if (!doc || typeof doc !== "object") return false;
  const fields = [
    "orgHeader1", "orgHeader2", "nationalHeader1", "nationalHeader2",
    "locationAndDate", "documentType", "referenceNumber", "subject",
    "bodyHtml", "signTitle", "signName", "recipients"
  ];
  for (const f of fields) {
    if (typeof doc[f] !== "string") return false;
  }
  return true;
}

function isLegacyMigrationMarkerValid(marker: any): boolean {
  if (!marker || typeof marker !== "object") return false;
  const val = marker.value !== undefined ? marker.value : marker;
  if (!val || typeof val !== "object") return false;
  if (val.status !== "done") return false;
  if (val.sessionId !== LEGACY_SESSION_ID) return false;
  if (typeof val.migratedAt !== "string" || Number.isNaN(Date.parse(val.migratedAt))) return false;
  if (typeof val.legacyUpdatedAt !== "string" || Number.isNaN(Date.parse(val.legacyUpdatedAt))) return false;
  return true;
}

function buildMigrationMarker(
  legacy?: DraftRecord | any,
  existingMigrated?: DocumentSessionRecord
): LegacyMigrationMarker {
  let legacyUpdatedAt: string;
  if (
    legacy &&
    typeof legacy.updatedAt === "string" &&
    !Number.isNaN(Date.parse(legacy.updatedAt))
  ) {
    legacyUpdatedAt = legacy.updatedAt;
  } else if (
    existingMigrated &&
    typeof existingMigrated.updatedAt === "string" &&
    !Number.isNaN(Date.parse(existingMigrated.updatedAt))
  ) {
    legacyUpdatedAt = existingMigrated.updatedAt;
  } else {
    legacyUpdatedAt = new Date().toISOString();
  }

  const marker: LegacyMigrationMarker = {
    status: "done",
    sessionId: LEGACY_SESSION_ID,
    migratedAt: new Date().toISOString(),
    legacyUpdatedAt,
  };

  if (!isLegacyMigrationMarkerValid(marker)) {
    throw new SessionCorruptError(LEGACY_SESSION_ID, "Unable to build a valid legacy migration marker");
  }

  return marker;
}

function buildRecordFromLegacy(
  legacy: DraftRecord,
  existingRevision = 0
): { record: DocumentSessionRecord; summary: DocumentSessionSummary } {
  if (!isLegacyDocValid(legacy.doc)) {
    throw new SessionCorruptError(DEFAULT_DRAFT_ID, "Legacy draft missing or corrupt doc content");
  }

  // Validate standardType if present (S03)
  if (
    legacy.standardType !== undefined &&
    legacy.standardType !== "state" &&
    legacy.standardType !== "party" &&
    legacy.standardType !== ("administrative" as any)
  ) {
    throw new SessionCorruptError(DEFAULT_DRAFT_ID, "Invalid legacy standardType");
  }

  // Validate versions if present (S03)
  if (legacy.versions !== undefined && !Array.isArray(legacy.versions)) {
    throw new SessionCorruptError(DEFAULT_DRAFT_ID, "Invalid legacy versions structure");
  }

  const title =
    legacy.doc.subject?.trim() ||
    legacy.originalSnapshot?.fileName ||
    legacy.uploadedFileName ||
    "Tài liệu cũ (chuyển đổi)";

  const now = new Date().toISOString();
  const updatedAt = legacy.updatedAt || now;
  const revision = existingRevision + 1;

  if (legacy.standardType !== "party" && legacy.standardType !== "state") {
    throw new SessionCorruptError(DEFAULT_DRAFT_ID, "Legacy draft has invalid standardType");
  }

  const versions: SessionVersion[] = [];
  if (legacy.versions !== undefined) {
    if (!Array.isArray(legacy.versions)) {
      throw new SessionCorruptError(DEFAULT_DRAFT_ID, "Legacy versions must be an array");
    }
    for (let index = 0; index < legacy.versions.length; index++) {
      const v: any = (legacy.versions as any)[index];
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} is invalid`);
      }
      if (typeof v.id !== "string" || !v.id.trim()) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid id`);
      }
      if (typeof v.timestamp !== "string" || Number.isNaN(Date.parse(v.timestamp))) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid timestamp`);
      }
      const title = typeof v.title === "string" ? v.title : typeof v.name === "string" ? v.name : null;
      if (title === null) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} missing title`);
      }
      if (v.title !== undefined && typeof v.title !== "string") {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} title is not a string`);
      }
      if (v.standardType !== undefined && v.standardType !== "party" && v.standardType !== "state") {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid standardType`);
      }
      const vData = v.data ?? v.doc;
      if (!isDocumentStateValid(vData)) {
        throw new SessionCorruptError(
          DEFAULT_DRAFT_ID,
          `Legacy version ${v.id || index + 1} missing or corrupt document data`
        );
      }
      if (v.reviewBlocks !== undefined) {
        if (!Array.isArray(v.reviewBlocks)) {
          throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} reviewBlocks must be an array`);
        }
        for (const b of v.reviewBlocks) {
          if (!isSourceBlockValid(b)) {
            throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid review block`);
          }
        }
      }
      if (v.uploadedBlocks !== undefined) {
        if (!Array.isArray(v.uploadedBlocks)) {
          throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} uploadedBlocks must be an array`);
        }
        for (const b of v.uploadedBlocks) {
          if (!isSourceBlockValid(b)) {
            throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid uploaded block`);
          }
        }
      }
      if (v.originalSnapshot !== undefined && !isOriginalSnapshotValid(v.originalSnapshot)) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid originalSnapshot`);
      }
      if (v.structuredImport !== undefined && v.structuredImport !== null && !isStructuredImportValid(v.structuredImport)) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid structuredImport`);
      }
      if (
        v.sourceGeneration !== undefined &&
        (typeof v.sourceGeneration !== "number" || !Number.isSafeInteger(v.sourceGeneration) || v.sourceGeneration <= 0)
      ) {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid sourceGeneration`);
      }
      if (v.uploadedFileName !== undefined && typeof v.uploadedFileName !== "string") {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid uploadedFileName`);
      }
      if (v.uploadedFileType !== undefined && v.uploadedFileType !== "docx" && v.uploadedFileType !== "txt") {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid uploadedFileType`);
      }
      if (v.rawText !== undefined && typeof v.rawText !== "string") {
        throw new SessionCorruptError(DEFAULT_DRAFT_ID, `Legacy version ${index + 1} has invalid rawText`);
      }

      versions.push({
        id: v.id,
        timestamp: v.timestamp,
        title,
        standardType: v.standardType ?? (legacy.standardType === "party" ? "party" : "state"),
        data: structuredClone(vData),
        sourceGeneration:
          typeof v.sourceGeneration === "number" && Number.isSafeInteger(v.sourceGeneration) && v.sourceGeneration > 0
            ? v.sourceGeneration
            : v.workspace?.source?.generation ?? 1,
        ...(v.originalSnapshot ? { originalSnapshot: structuredClone(v.originalSnapshot) } : {}),
        ...(v.reviewBlocks ? { reviewBlocks: structuredClone(v.reviewBlocks) } : {}),
        ...(v.uploadedBlocks ? { uploadedBlocks: structuredClone(v.uploadedBlocks) } : {}),
        ...(v.structuredImport !== undefined ? { structuredImport: structuredClone(v.structuredImport) } : {}),
        ...(typeof v.uploadedFileName === "string" ? { uploadedFileName: v.uploadedFileName } : {}),
        ...(v.uploadedFileType === "docx" || v.uploadedFileType === "txt"
          ? { uploadedFileType: v.uploadedFileType }
          : {}),
        ...(typeof v.rawText === "string" ? { rawText: v.rawText } : {}),
        ...(v.workspace !== undefined ? { workspace: structuredClone(v.workspace) } : {}),
        ...(v.docTypeOverride !== undefined ? { docTypeOverride: structuredClone(v.docTypeOverride) } : {}),
      });
    }
  }

  const record: DocumentSessionRecord = {
    schemaVersion: 3,
    id: LEGACY_SESSION_ID,
    revision,
    sourceGeneration: legacy.workspace?.source?.generation ?? 1,
    updatedAt,
    standardType: legacy.standardType,
    doc: structuredClone(legacy.doc),
    versions,
    originalSnapshot: legacy.originalSnapshot ? structuredClone(legacy.originalSnapshot) : null,
    reviewBlocks: legacy.reviewBlocks ? structuredClone(legacy.reviewBlocks) : [],
    structuredImport: legacy.structuredImport ? structuredClone(legacy.structuredImport) : null,
    uploadedBlocks: legacy.uploadedBlocks ? structuredClone(legacy.uploadedBlocks) : [],
    uploadedFileName: legacy.uploadedFileName,
    uploadedFileType: (legacy.uploadedFileType === "docx" || legacy.uploadedFileType === "txt") ? legacy.uploadedFileType : null,
    rawText: legacy.rawText,
    ...(legacy.workspace !== undefined ? { workspace: structuredClone(legacy.workspace) } : {}),
    ...(legacy.currentStep !== undefined ? { currentStep: legacy.currentStep } : {}),
    ...(legacy.sourceOrigin !== undefined ? { sourceOrigin: legacy.sourceOrigin } : {}),
    ...(legacy.docTypeOverride !== undefined ? { docTypeOverride: structuredClone(legacy.docTypeOverride) } : {}),
    ...(legacy.semanticDecisions && typeof legacy.semanticDecisions === "object" && !Array.isArray(legacy.semanticDecisions)
      ? { semanticDecisions: Object.fromEntries(Object.entries(legacy.semanticDecisions).filter(([unitId, decision]) =>
          Boolean(unitId) && decision && typeof decision.contextKey === "string" &&
          (decision.status === "user_confirmed" || decision.status === "rejected") &&
          (decision.evidenceFingerprint === undefined || typeof decision.evidenceFingerprint === "string" && decision.evidenceFingerprint.length <= 200_000))
          .map(([unitId, decision]) => [unitId, { contextKey: decision.contextKey, status: decision.status,
            ...(typeof decision.evidenceFingerprint === "string" ? { evidenceFingerprint: decision.evidenceFingerprint } : {}) }])) }
      : {}),
    ...(isPersistedFullTextSemanticReviewValid(legacy.fullTextSemanticReview)
      ? { fullTextSemanticReview: structuredClone(legacy.fullTextSemanticReview) }
      : {}),
    // Retain the historical hint for audit only. Workspace approval is never created from it.
    ...(legacy.importReviewApprovedSourceHash !== undefined
      ? { importReviewApprovedSourceHash: legacy.importReviewApprovedSourceHash }
      : {}),
    workflow: {
      importReviewAccepted: false,
      userModifiedBlockIds: [],
      partitionProposals: [],
      verifiedPartitionProposalIds: [],
      reviewProposals: [],
      acceptedProposalIds: [],
    },
  };

  if (!isDocumentSessionRecordValid(record, LEGACY_SESSION_ID)) {
    throw new SessionCorruptError(LEGACY_SESSION_ID);
  }

  const summary = buildSummaryFromRecord(record, {
    createdAt: updatedAt,
    status: "active",
  });

  if (!isDocumentSessionSummaryValid(summary, LEGACY_SESSION_ID)) {
    throw new SessionCorruptError(LEGACY_SESSION_ID, "Invalid summary");
  }
  if (!isSummaryConsistentWithRecord(summary, record)) {
    throw new SessionCorruptError(LEGACY_SESSION_ID, "Summary does not match record invariants");
  }

  return { record, summary };
}

/**
 * Executes idempotent migration of the v2 `current_active_draft` into a v3 document session.
 */
export async function migrateLegacyDraft(customDb?: IDBDatabase): Promise<LegacyMigrationResult> {
  // Fallback for Node environments without native IndexedDB
  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const legacy = memoryDrafts.get(DEFAULT_DRAFT_ID);
    const existingMigrated = memoryDrafts.get(LEGACY_SESSION_ID) as DocumentSessionRecord | undefined;
    const existingSummary = memoryFallbackSessionIndex.get(LEGACY_SESSION_ID);
    const marker = memoryFallbackAppMeta.get(META_LEGACY_MIGRATION);

    // 1. If existing v3 record is already valid
    if (isDocumentSessionRecordValid(existingMigrated, LEGACY_SESSION_ID)) {
      if (
        isDocumentSessionSummaryValid(existingSummary, LEGACY_SESSION_ID) &&
        isSummaryConsistentWithRecord(existingSummary, existingMigrated)
      ) {
        const markerToSet = !isLegacyMigrationMarkerValid(marker) ? {
          key: META_LEGACY_MIGRATION,
          value: buildMigrationMarker(legacy, existingMigrated),
        } : undefined;
        const activeMetaToSet = !memoryFallbackAppMeta.has(META_ACTIVE_SESSION_ID) ? {
          key: META_ACTIVE_SESSION_ID,
          value: LEGACY_SESSION_ID,
        } : undefined;

        // Stage all clones BEFORE any write (C02)
        const clonedMarker = markerToSet ? structuredClone(markerToSet) : undefined;
        const clonedActive = activeMetaToSet ? structuredClone(activeMetaToSet) : undefined;

        if (clonedMarker) {
          memoryFallbackAppMeta.set(META_LEGACY_MIGRATION, clonedMarker);
        }
        if (clonedActive) {
          memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, clonedActive);
        }
        return { status: "already_migrated", sessionId: LEGACY_SESSION_ID };
      }

      // Summary missing, invalid, or inconsistent with record, BUT v3 record is valid -> reconstruct summary from v3 record (preserves edits!)
      const repairedSummary = buildSummaryFromRecord(existingMigrated, { existingSummary });
      if (
        !isDocumentSessionSummaryValid(repairedSummary, LEGACY_SESSION_ID) ||
        !isSummaryConsistentWithRecord(repairedSummary, existingMigrated)
      ) {
        throw new SessionCorruptError(LEGACY_SESSION_ID, "Reconstructed summary is invalid or inconsistent");
      }
      // Stage all clones BEFORE any write (C02)
      const clonedRepairedSummary = structuredClone(repairedSummary);
      const markerToSet = !isLegacyMigrationMarkerValid(marker) ? {
        key: META_LEGACY_MIGRATION,
        value: buildMigrationMarker(legacy, existingMigrated),
      } : undefined;
      const clonedMarker = markerToSet ? structuredClone(markerToSet) : undefined;
      const activeMetaToSet = !memoryFallbackAppMeta.has(META_ACTIVE_SESSION_ID) ? {
        key: META_ACTIVE_SESSION_ID,
        value: LEGACY_SESSION_ID,
      } : undefined;
      const clonedActive = activeMetaToSet ? structuredClone(activeMetaToSet) : undefined;

      memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, clonedRepairedSummary);
      if (clonedMarker) {
        memoryFallbackAppMeta.set(META_LEGACY_MIGRATION, clonedMarker);
      }
      if (clonedActive) {
        memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, clonedActive);
      }
      return { status: "repaired", sessionId: LEGACY_SESSION_ID };
    }

    // 2. No valid v3 record exists.
    // FAIL-CLOSED: if a v3 record exists but is NOT valid, NEVER overwrite it with legacy draft! (C01, D01, D04)
    if (existingMigrated !== undefined && existingMigrated !== null) {
      throw new SessionCorruptError(
        LEGACY_SESSION_ID,
        "Record v3 exists but is corrupt; refusing to overwrite with legacy draft"
      );
    }

    // If v3 record is absent, but summary has user edits:
    if (existingSummary !== undefined && existingSummary !== null) {
      const s = existingSummary as any;
      const legacySubject = typeof (legacy as any)?.doc?.subject === "string" ? (legacy as any).doc.subject.trim() : "";
      const sTitle = typeof s.title === "string" ? s.title.trim() : "";
      if (
        (typeof s.revision === "number" && s.revision > 1) ||
        (sTitle && sTitle !== legacySubject) ||
        s.status === "archived"
      ) {
        throw new SessionCorruptError(
          LEGACY_SESSION_ID,
          "Session summary contains user edits but draft record is missing; refusing to overwrite"
        );
      }
    }

    // Truly empty database
    if (!legacy) {
      return { status: "nothing_to_migrate" };
    }

    // 3. Migrate from legacy
    const isRepair = Boolean(existingMigrated || existingSummary || marker);
    const prevRev = typeof (existingMigrated as any)?.revision === "number" ? (existingMigrated as any).revision : 0;
    const { record, summary } = buildRecordFromLegacy(legacy, prevRev);

    // Stage all clones BEFORE any write (C02)
    const clonedRecord = structuredClone(record);
    const clonedSummary = structuredClone(summary);
    const markerToSet = {
      key: META_LEGACY_MIGRATION,
      value: buildMigrationMarker(legacy, record),
    };
    const clonedMarker = structuredClone(markerToSet);
    const activeMetaToSet = !memoryFallbackAppMeta.has(META_ACTIVE_SESSION_ID) ? {
      key: META_ACTIVE_SESSION_ID,
      value: LEGACY_SESSION_ID,
    } : undefined;
    const clonedActive = activeMetaToSet ? structuredClone(activeMetaToSet) : undefined;

    memoryDrafts.set(LEGACY_SESSION_ID, clonedRecord as any);
    memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, clonedSummary);
    memoryFallbackAppMeta.set(META_LEGACY_MIGRATION, clonedMarker);
    if (clonedActive) {
      memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, clonedActive);
    }

    return {
      status: isRepair ? "repaired" : "migrated",
      sessionId: LEGACY_SESSION_ID,
    };
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX, STORE_APP_META], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);
    const appMetaStore = tx.objectStore(STORE_APP_META);

    const [legacyDraft, migratedDraft, migratedSummary, migrationMarker, activeMeta] =
      await Promise.all([
        promisifyRequest(draftsStore.get(DEFAULT_DRAFT_ID)),
        promisifyRequest(draftsStore.get(LEGACY_SESSION_ID)),
        promisifyRequest(sessionIndexStore.get(LEGACY_SESSION_ID)),
        promisifyRequest(appMetaStore.get(META_LEGACY_MIGRATION)),
        promisifyRequest(appMetaStore.get(META_ACTIVE_SESSION_ID)),
      ]);

    // 1. If existing v3 record is already valid:
    if (isDocumentSessionRecordValid(migratedDraft, LEGACY_SESSION_ID)) {
      if (
        isDocumentSessionSummaryValid(migratedSummary, LEGACY_SESSION_ID) &&
        isSummaryConsistentWithRecord(migratedSummary, migratedDraft)
      ) {
        if (!isLegacyMigrationMarkerValid(migrationMarker)) {
          appMetaStore.put({
            key: META_LEGACY_MIGRATION,
            value: buildMigrationMarker(legacyDraft, migratedDraft),
          });
        }
        if (activeMeta === undefined) {
          appMetaStore.put({
            key: META_ACTIVE_SESSION_ID,
            value: LEGACY_SESSION_ID,
          });
        }
        await commitPromise;
        return { status: "already_migrated", sessionId: LEGACY_SESSION_ID };
      }

      // Summary is missing, invalid, or inconsistent with record, BUT full v3 record is valid -> reconstruct summary from v3 record (preserves edits!)
      const repairedSummary = buildSummaryFromRecord(migratedDraft, { existingSummary: migratedSummary });
      if (
        !isDocumentSessionSummaryValid(repairedSummary, LEGACY_SESSION_ID) ||
        !isSummaryConsistentWithRecord(repairedSummary, migratedDraft)
      ) {
        throw new SessionCorruptError(LEGACY_SESSION_ID, "Reconstructed summary is invalid or inconsistent");
      }
      sessionIndexStore.put(repairedSummary);
      if (!isLegacyMigrationMarkerValid(migrationMarker)) {
        appMetaStore.put({
          key: META_LEGACY_MIGRATION,
          value: buildMigrationMarker(legacyDraft, migratedDraft),
        });
      }
      if (activeMeta === undefined) {
        appMetaStore.put({
          key: META_ACTIVE_SESSION_ID,
          value: LEGACY_SESSION_ID,
        });
      }
      await commitPromise;
      return { status: "repaired", sessionId: LEGACY_SESSION_ID };
    }

    // 2. v3 record is missing or corrupt.
    // FAIL-CLOSED: if a v3 record exists but is NOT valid, NEVER overwrite it with legacy draft! (C01, D01, D04)
    if (migratedDraft !== undefined && migratedDraft !== null) {
      throw new SessionCorruptError(
        LEGACY_SESSION_ID,
        "Record v3 exists but is corrupt; refusing to overwrite with legacy draft"
      );
    }

    // If v3 record is absent, but summary has user edits:
    if (migratedSummary !== undefined && migratedSummary !== null) {
      const s = migratedSummary as any;
      const legacySubject = typeof (legacyDraft as any)?.doc?.subject === "string" ? (legacyDraft as any).doc.subject.trim() : "";
      const sTitle = typeof s.title === "string" ? s.title.trim() : "";
      if (
        (typeof s.revision === "number" && s.revision > 1) ||
        (sTitle && sTitle !== legacySubject) ||
        s.status === "archived"
      ) {
        throw new SessionCorruptError(
          LEGACY_SESSION_ID,
          "Session summary contains user edits but draft record is missing; refusing to overwrite"
        );
      }
    }

    if (!legacyDraft) {
      await commitPromise;
      return { status: "nothing_to_migrate" };
    }

    // 3. Reconstruct from legacy draft:
    const isRepair = Boolean(migratedDraft || migratedSummary || migrationMarker);
    const prevRev = typeof (migratedDraft as any)?.revision === "number" ? (migratedDraft as any).revision : 0;
    const { record, summary } = buildRecordFromLegacy(legacyDraft, prevRev);

    draftsStore.put(record);
    sessionIndexStore.put(summary);
    appMetaStore.put({
      key: META_LEGACY_MIGRATION,
      value: buildMigrationMarker(legacyDraft, record),
    });
    if (activeMeta === undefined) {
      appMetaStore.put({
        key: META_ACTIVE_SESSION_ID,
        value: LEGACY_SESSION_ID,
      });
    }

    await commitPromise;
    return {
      status: isRepair ? "repaired" : "migrated",
      sessionId: LEGACY_SESSION_ID,
    };
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // ignore
    }
    await commitPromise.catch(() => {});
    throw err;
  }
}
