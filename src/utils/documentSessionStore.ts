/**
 * @file documentSessionStore.ts
 * @description Repository for multiple document sessions, session metadata index,
 * and active session pointer in IndexedDB (schema v3).
 */

import {
  openDatabase,
  STORE_DRAFTS,
  STORE_SESSION_INDEX,
  STORE_APP_META,
  awaitTransactionCommit,
  getMemoryFallbackDrafts,
} from "./draftStore.ts";
import {
  META_ACTIVE_SESSION_ID,
  type DocumentSessionRecord,
  type DocumentSessionSummary,
  SessionRevisionConflictError,
  ActiveSessionMismatchError,
  SessionNotFoundError,
  SessionAlreadyExistsError,
  SessionCorruptError,
  isDocumentSessionRecordValid,
  isDocumentSessionSummaryValid,
  isSummaryConsistentWithRecord,
  buildSummaryFromRecord,
  validateSourceGenerationTransition,
} from "./documentSessionTypes.ts";

// In-memory fallback stores for environments without IndexedDB (e.g. Node tests)
export const memoryFallbackSessionIndex = new Map<string, DocumentSessionSummary>();
export const memoryFallbackAppMeta = new Map<string, any>();

export function resetMemoryFallbackStores(): void {
  getMemoryFallbackDrafts().clear();
  memoryFallbackSessionIndex.clear();
  memoryFallbackAppMeta.clear();
}

export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "session-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request error"));
  });
}

function assertCloneable(value: any): void {
  if (typeof structuredClone === "function") {
    structuredClone(value);
  }
}

/**
 * Lists session summaries from `session_index`, newest first by `updatedAt` descending.
 * Does not read full draft records.
 */
export async function listSessions(
  includeArchived = false,
  customDb?: IDBDatabase
): Promise<DocumentSessionSummary[]> {
  if (typeof indexedDB === "undefined" && !customDb) {
    const items = Array.from(memoryFallbackSessionIndex.values()).filter((s) =>
      includeArchived ? true : s.status !== "archived"
    );
    items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
        b.id.localeCompare(a.id)
    );
    return structuredClone(items);
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_SESSION_INDEX], "readonly");
  const store = tx.objectStore(STORE_SESSION_INDEX);
  const all = (await promisifyRequest(store.getAll())) as DocumentSessionSummary[];

  const filtered = all.filter((s) => (includeArchived ? true : s.status !== "archived"));
  filtered.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      b.id.localeCompare(a.id)
  );
  return filtered;
}

/**
 * Loads a full session record by ID. Returns null if not found.
 * Throws SessionCorruptError if record fails schema validation.
 */
export async function loadSession(
  id: string,
  customDb?: IDBDatabase
): Promise<DocumentSessionRecord | null> {
  if (typeof indexedDB === "undefined" && !customDb) {
    const item = getMemoryFallbackDrafts().get(id);
    if (!item) return null;
    if (!isDocumentSessionRecordValid(item, id)) {
      throw new SessionCorruptError(id);
    }
    return structuredClone(item);
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS], "readonly");
  const store = tx.objectStore(STORE_DRAFTS);
  const result = await promisifyRequest(store.get(id));
  if (!result) return null;
  if (!isDocumentSessionRecordValid(result, id)) {
    throw new SessionCorruptError(id);
  }
  return result as DocumentSessionRecord;
}

/**
 * Gets the current active session ID from `app_meta`.
 */
export async function getActiveSessionId(customDb?: IDBDatabase): Promise<string | null> {
  if (typeof indexedDB === "undefined" && !customDb) {
    const meta = memoryFallbackAppMeta.get(META_ACTIVE_SESSION_ID);
    return meta?.value ?? null;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_APP_META], "readonly");
  const store = tx.objectStore(STORE_APP_META);
  const result = await promisifyRequest(store.get(META_ACTIVE_SESSION_ID));
  return result?.value ?? null;
}

/**
 * Saves an existing session record and updates its summary in `session_index`
 * within a single transaction. Validates `expectedRevision` before write.
 */
export async function saveSession(
  record: DocumentSessionRecord,
  expectedRevision: number,
  customDb?: IDBDatabase
): Promise<DocumentSessionRecord> {
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("expectedRevision must be a positive safe integer");
  }
  const nextRevision = expectedRevision + 1;
  if (!Number.isSafeInteger(nextRevision)) {
    throw new Error("Revision exceeds safe integer range");
  }

  assertCloneable(record);
  const recordId = (record as any)?.id;
  if (!isDocumentSessionRecordValid(record, recordId)) {
    throw new SessionCorruptError(recordId || "unknown");
  }
  if (record.revision !== expectedRevision) {
    throw new SessionRevisionConflictError(record.id, expectedRevision, record.revision);
  }

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const existing = memoryDrafts.get(record.id) as DocumentSessionRecord | undefined;
    if (!existing) {
      throw new SessionNotFoundError(record.id);
    }
    if (!isDocumentSessionRecordValid(existing, record.id)) {
      throw new SessionCorruptError(record.id, "Existing stored record is corrupt");
    }
    if (existing.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(record.id, expectedRevision, existing.revision);
    }
    validateSourceGenerationTransition(existing, record);

    const now = new Date().toISOString();
    const existingSummary = memoryFallbackSessionIndex.get(record.id);
    const updatedRecord: DocumentSessionRecord = {
      ...record,
      title: record.title ?? existingSummary?.title,
      revision: nextRevision,
      updatedAt: now,
    };

    const updatedSummary = buildSummaryFromRecord(updatedRecord, { existingSummary });

    if (!isDocumentSessionRecordValid(updatedRecord, record.id)) {
      throw new SessionCorruptError(record.id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, record.id)) {
      throw new SessionCorruptError(record.id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedRecord)) {
      throw new SessionCorruptError(record.id, "Summary does not match record invariants");
    }

    const clonedRecord = structuredClone(updatedRecord);
    const clonedSummary = structuredClone(updatedSummary);
    const resultToReturn = structuredClone(updatedRecord);

    memoryDrafts.set(record.id, clonedRecord as any);
    memoryFallbackSessionIndex.set(record.id, clonedSummary);
    return resultToReturn;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);

    const [existingRecord, existingSummary] = await Promise.all([
      promisifyRequest(draftsStore.get(record.id)) as Promise<DocumentSessionRecord | undefined>,
      promisifyRequest(sessionIndexStore.get(record.id)) as Promise<DocumentSessionSummary | undefined>,
    ]);

    if (!existingRecord) {
      throw new SessionNotFoundError(record.id);
    }
    if (!isDocumentSessionRecordValid(existingRecord, record.id)) {
      throw new SessionCorruptError(record.id, "Existing stored record is corrupt");
    }
    if (existingRecord.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(record.id, expectedRevision, existingRecord.revision);
    }
    validateSourceGenerationTransition(existingRecord, record);

    const now = new Date().toISOString();
    const updatedRecord: DocumentSessionRecord = {
      ...record,
      title: record.title ?? existingSummary?.title,
      revision: nextRevision,
      updatedAt: now,
    };

    const updatedSummary = buildSummaryFromRecord(updatedRecord, { existingSummary });

    if (!isDocumentSessionRecordValid(updatedRecord, record.id)) {
      throw new SessionCorruptError(record.id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, record.id)) {
      throw new SessionCorruptError(record.id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedRecord)) {
      throw new SessionCorruptError(record.id, "Summary does not match record invariants");
    }

    draftsStore.put(updatedRecord);
    sessionIndexStore.put(updatedSummary);

    await commitPromise;
    return updatedRecord;
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

/**
 * Creates a new session, flushes current session if supplied, and sets activeSessionId atomically.
 */
export async function createSession(
  seed: DocumentSessionRecord,
  summary: DocumentSessionSummary,
  expectedActiveSessionId: string | null,
  current?: { record: DocumentSessionRecord; expectedRevision: number },
  customDb?: IDBDatabase
): Promise<void> {
  // Validate seed cloneability and structure upfront
  assertCloneable(seed);
  const seedId = (seed as any)?.id;
  if (!isDocumentSessionRecordValid(seed, seedId)) {
    throw new SessionCorruptError(seedId || "unknown");
  }
  if (!isDocumentSessionSummaryValid(summary, seedId)) {
    throw new SessionCorruptError(seedId || "unknown", "Invalid summary");
  }
  if (!isSummaryConsistentWithRecord(summary, seed)) {
    throw new SessionCorruptError(seedId || "unknown", "Summary does not match record invariants");
  }

  if (current) {
    assertCloneable(current.record);
    const curId = (current.record as any)?.id;
    if (!isDocumentSessionRecordValid(current.record, curId)) {
      throw new SessionCorruptError(curId || "unknown");
    }
    if (current.record.revision !== current.expectedRevision) {
      throw new SessionRevisionConflictError(current.record.id, current.expectedRevision, current.record.revision);
    }
  }

  const recordToStore: DocumentSessionRecord = {
    ...seed,
    title: seed.title ?? summary.title,
  };

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const actualActive = memoryFallbackAppMeta.get(META_ACTIVE_SESSION_ID)?.value ?? null;
    if (actualActive !== expectedActiveSessionId) {
      throw new ActiveSessionMismatchError(expectedActiveSessionId, actualActive);
    }
    if (current) {
      if (!actualActive || current.record.id !== actualActive || current.record.id !== expectedActiveSessionId) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }
    if (memoryDrafts.has(recordToStore.id)) {
      throw new SessionAlreadyExistsError(recordToStore.id);
    }

    let flushedRecord: DocumentSessionRecord | undefined;
    let flushedSummary: DocumentSessionSummary | undefined;

    if (current) {
      if (typeof current.expectedRevision !== "number" || !Number.isSafeInteger(current.expectedRevision) || current.expectedRevision < 1) {
        throw new Error("current.expectedRevision must be a positive safe integer");
      }
      const existingCurrent = memoryDrafts.get(current.record.id) as DocumentSessionRecord | undefined;
      if (!existingCurrent) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrent, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrent.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrent.revision
        );
      }
      validateSourceGenerationTransition(existingCurrent, current.record);
      const flushedRev = current.expectedRevision + 1;
      if (!Number.isSafeInteger(flushedRev)) {
        throw new Error("Revision exceeds safe integer range");
      }
      const flushedNow = new Date().toISOString();
      flushedRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: flushedNow,
      };
      const curSummary = memoryFallbackSessionIndex.get(current.record.id);
      flushedSummary = buildSummaryFromRecord(flushedRecord, { existingSummary: curSummary });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }
    }

    // Stage all clones BEFORE any write so that clone failure leaves all stores untouched (C02)
    const clonedSeed = structuredClone(recordToStore);
    const clonedSummary = structuredClone(summary);
    const clonedFlushedRecord = flushedRecord ? structuredClone(flushedRecord) : undefined;
    const clonedFlushedSummary = flushedSummary ? structuredClone(flushedSummary) : undefined;

    // Apply all mutations only after all checks and clones pass
    if (current && clonedFlushedRecord && clonedFlushedSummary) {
      memoryDrafts.set(current.record.id, clonedFlushedRecord as any);
      memoryFallbackSessionIndex.set(current.record.id, clonedFlushedSummary);
    }
    memoryDrafts.set(recordToStore.id, clonedSeed as any);
    memoryFallbackSessionIndex.set(recordToStore.id, clonedSummary);
    memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, {
      key: META_ACTIVE_SESSION_ID,
      value: recordToStore.id,
    });
    return;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX, STORE_APP_META], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);
    const appMetaStore = tx.objectStore(STORE_APP_META);

    const reads: Promise<any>[] = [
      promisifyRequest(appMetaStore.get(META_ACTIVE_SESSION_ID)),
      promisifyRequest(draftsStore.get(recordToStore.id)),
    ];

    if (current) {
      reads.push(
        promisifyRequest(draftsStore.get(current.record.id)),
        promisifyRequest(sessionIndexStore.get(current.record.id))
      );
    }

    const results = await Promise.all(reads);
    const activeMeta = results[0];
    const existingSeed = results[1];
    const actualActive = activeMeta?.value ?? null;

    if (actualActive !== expectedActiveSessionId) {
      throw new ActiveSessionMismatchError(expectedActiveSessionId, actualActive);
    }
    if (current) {
      if (!actualActive || current.record.id !== actualActive || current.record.id !== expectedActiveSessionId) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }
    if (existingSeed) {
      throw new SessionAlreadyExistsError(recordToStore.id);
    }

    if (current) {
      if (typeof current.expectedRevision !== "number" || !Number.isSafeInteger(current.expectedRevision) || current.expectedRevision < 1) {
        throw new Error("current.expectedRevision must be a positive safe integer");
      }
      const existingCurrentDraft = results[2] as DocumentSessionRecord | undefined;
      const existingCurrentSummary = results[3] as DocumentSessionSummary | undefined;

      if (!existingCurrentDraft) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrentDraft, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrentDraft.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrentDraft.revision
        );
      }
      validateSourceGenerationTransition(existingCurrentDraft, current.record);

      const flushedRev = current.expectedRevision + 1;
      if (!Number.isSafeInteger(flushedRev)) {
        throw new Error("Revision exceeds safe integer range");
      }
      const flushedNow = new Date().toISOString();
      const flushedRecord: DocumentSessionRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: flushedNow,
      };
      const flushedSummary = buildSummaryFromRecord(flushedRecord, {
        existingSummary: existingCurrentSummary,
      });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }

      draftsStore.put(flushedRecord);
      sessionIndexStore.put(flushedSummary);
    }

    draftsStore.put(recordToStore);
    sessionIndexStore.put(summary);
    appMetaStore.put({ key: META_ACTIVE_SESSION_ID, value: seed.id });

    await commitPromise;
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

/**
 * Activates an existing session atomically. If `current` is supplied, flushes it
 * and changes the active pointer in the same transaction.
 */
export async function activateSession(
  targetId: string,
  expectedActiveSessionId: string | null,
  current?: { record: DocumentSessionRecord; expectedRevision: number },
  customDb?: IDBDatabase
): Promise<DocumentSessionRecord> {
  if (current) {
    assertCloneable(current.record);
    const curId = (current.record as any)?.id;
    if (!isDocumentSessionRecordValid(current.record, curId)) {
      throw new SessionCorruptError(curId || "unknown");
    }
    if (current.record.revision !== current.expectedRevision) {
      throw new SessionRevisionConflictError(current.record.id, current.expectedRevision, current.record.revision);
    }
  }

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const actualActive = memoryFallbackAppMeta.get(META_ACTIVE_SESSION_ID)?.value ?? null;
    if (actualActive !== expectedActiveSessionId) {
      throw new ActiveSessionMismatchError(expectedActiveSessionId, actualActive);
    }
    if (current) {
      if (!actualActive || current.record.id !== actualActive || current.record.id !== expectedActiveSessionId) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }

    const targetDraft = memoryDrafts.get(targetId) as DocumentSessionRecord | undefined;
    if (!targetDraft) {
      throw new SessionNotFoundError(targetId);
    }
    if (!isDocumentSessionRecordValid(targetDraft, targetId)) {
      throw new SessionCorruptError(targetId);
    }

    let flushedRecord: DocumentSessionRecord | undefined;
    let flushedSummary: DocumentSessionSummary | undefined;

    if (current) {
      if (typeof current.expectedRevision !== "number" || !Number.isSafeInteger(current.expectedRevision) || current.expectedRevision < 1) {
        throw new Error("current.expectedRevision must be a positive safe integer");
      }
      const existingCurrent = memoryDrafts.get(current.record.id) as DocumentSessionRecord | undefined;
      if (!existingCurrent) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrent, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrent.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrent.revision
        );
      }
      validateSourceGenerationTransition(existingCurrent, current.record);
      const flushedRev = current.expectedRevision + 1;
      if (!Number.isSafeInteger(flushedRev)) {
        throw new Error("Revision exceeds safe integer range");
      }
      const flushedNow = new Date().toISOString();
      flushedRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: flushedNow,
      };
      const curSummary = memoryFallbackSessionIndex.get(current.record.id);
      flushedSummary = buildSummaryFromRecord(flushedRecord, { existingSummary: curSummary });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }
    }

    // Stage all clones and return value BEFORE any write (C02)
    const clonedFlushedRecord = flushedRecord ? structuredClone(flushedRecord) : undefined;
    const clonedFlushedSummary = flushedSummary ? structuredClone(flushedSummary) : undefined;
    const resultToReturn = structuredClone(
      current && current.record.id === targetId && flushedRecord ? flushedRecord : targetDraft
    );

    if (current && clonedFlushedRecord && clonedFlushedSummary) {
      memoryDrafts.set(current.record.id, clonedFlushedRecord as any);
      memoryFallbackSessionIndex.set(current.record.id, clonedFlushedSummary);
    }
    memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, {
      key: META_ACTIVE_SESSION_ID,
      value: targetId,
    });
    return resultToReturn;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX, STORE_APP_META], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);
    const appMetaStore = tx.objectStore(STORE_APP_META);

    const reads: Promise<any>[] = [
      promisifyRequest(appMetaStore.get(META_ACTIVE_SESSION_ID)),
      promisifyRequest(draftsStore.get(targetId)),
    ];

    if (current) {
      reads.push(
        promisifyRequest(draftsStore.get(current.record.id)),
        promisifyRequest(sessionIndexStore.get(current.record.id))
      );
    }

    const results = await Promise.all(reads);
    const activeMeta = results[0];
    const targetDraft = results[1] as DocumentSessionRecord | undefined;
    const actualActive = activeMeta?.value ?? null;

    if (actualActive !== expectedActiveSessionId) {
      throw new ActiveSessionMismatchError(expectedActiveSessionId, actualActive);
    }
    if (current) {
      if (!actualActive || current.record.id !== actualActive || current.record.id !== expectedActiveSessionId) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }
    if (!targetDraft) {
      throw new SessionNotFoundError(targetId);
    }
    if (!isDocumentSessionRecordValid(targetDraft, targetId)) {
      throw new SessionCorruptError(targetId);
    }

    let flushedRecord: DocumentSessionRecord | undefined;

    if (current) {
      if (typeof current.expectedRevision !== "number" || !Number.isSafeInteger(current.expectedRevision) || current.expectedRevision < 1) {
        throw new Error("current.expectedRevision must be a positive safe integer");
      }
      const existingCurrentDraft = results[2] as DocumentSessionRecord | undefined;
      const existingCurrentSummary = results[3] as DocumentSessionSummary | undefined;

      if (!existingCurrentDraft) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrentDraft, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrentDraft.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrentDraft.revision
        );
      }
      validateSourceGenerationTransition(existingCurrentDraft, current.record);

      const flushedRev = current.expectedRevision + 1;
      if (!Number.isSafeInteger(flushedRev)) {
        throw new Error("Revision exceeds safe integer range");
      }
      const flushedNow = new Date().toISOString();
      flushedRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: flushedNow,
      };
      const flushedSummary = buildSummaryFromRecord(flushedRecord, {
        existingSummary: existingCurrentSummary,
      });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }

      draftsStore.put(flushedRecord);
      sessionIndexStore.put(flushedSummary);
    }

    appMetaStore.put({ key: META_ACTIVE_SESSION_ID, value: targetId });

    await commitPromise;
    if (current && current.record.id === targetId && flushedRecord) {
      return flushedRecord;
    }
    return targetDraft;
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

/**
 * Renames a session, updating both summary and draft record revision atomically.
 */
export async function renameSession(
  id: string,
  title: string,
  expectedRevision: number,
  customDb?: IDBDatabase
): Promise<DocumentSessionSummary> {
  if (!title || !title.trim()) {
    throw new Error("Title cannot be empty");
  }
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("expectedRevision must be a positive safe integer");
  }
  const nextRev = expectedRevision + 1;
  if (!Number.isSafeInteger(nextRev)) {
    throw new Error("Revision exceeds safe integer range");
  }

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const existingDraft = memoryDrafts.get(id) as DocumentSessionRecord | undefined;
    const existingSummary = memoryFallbackSessionIndex.get(id);

    if (!existingDraft || !existingSummary) {
      throw new SessionNotFoundError(id);
    }
    if (!isDocumentSessionRecordValid(existingDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (existingDraft.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(id, expectedRevision, existingDraft.revision);
    }

    const now = new Date().toISOString();
    const updatedDraft: DocumentSessionRecord = {
      ...existingDraft,
      title: title.trim(),
      revision: nextRev,
      updatedAt: now,
    };
    const updatedSummary = buildSummaryFromRecord(updatedDraft, { existingSummary });

    if (!isDocumentSessionRecordValid(updatedDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
      throw new SessionCorruptError(id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
      throw new SessionCorruptError(id, "Summary does not match record invariants");
    }

    // Stage all clones and return value BEFORE any write (C02)
    const clonedDraft = structuredClone(updatedDraft);
    const clonedSummary = structuredClone(updatedSummary);
    const resultToReturn = structuredClone(updatedSummary);

    memoryDrafts.set(id, clonedDraft as any);
    memoryFallbackSessionIndex.set(id, clonedSummary);
    return resultToReturn;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);

    const [existingDraft, existingSummary] = await Promise.all([
      promisifyRequest(draftsStore.get(id)) as Promise<DocumentSessionRecord | undefined>,
      promisifyRequest(sessionIndexStore.get(id)) as Promise<DocumentSessionSummary | undefined>,
    ]);

    if (!existingDraft || !existingSummary) {
      throw new SessionNotFoundError(id);
    }
    if (!isDocumentSessionRecordValid(existingDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (existingDraft.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(id, expectedRevision, existingDraft.revision);
    }

    const now = new Date().toISOString();
    const updatedDraft: DocumentSessionRecord = {
      ...existingDraft,
      title: title.trim(),
      revision: nextRev,
      updatedAt: now,
    };
    const updatedSummary = buildSummaryFromRecord(updatedDraft, { existingSummary });

    if (!isDocumentSessionRecordValid(updatedDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
      throw new SessionCorruptError(id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
      throw new SessionCorruptError(id, "Summary does not match record invariants");
    }

    draftsStore.put(updatedDraft);
    sessionIndexStore.put(updatedSummary);

    await commitPromise;
    return updatedSummary;
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

/**
 * Duplicates a session into a new random UUID session and activates it in one transaction.
 * If the source is the currently open session, clones its flushed current state.
 */
export async function duplicateSession(
  sourceId: string,
  newTitle: string,
  expectedActiveSessionId: string | null,
  current?: { record: DocumentSessionRecord; expectedRevision: number },
  customDb?: IDBDatabase
): Promise<DocumentSessionSummary> {
  const newId = generateSessionId();

  if (current) {
    assertCloneable(current.record);
    const curId = (current.record as any)?.id;
    if (!isDocumentSessionRecordValid(current.record, curId)) {
      throw new SessionCorruptError(curId || "unknown");
    }
    if (current.record.revision !== current.expectedRevision) {
      throw new SessionRevisionConflictError(current.record.id, current.expectedRevision, current.record.revision);
    }
  }

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const actualActive = memoryFallbackAppMeta.get(META_ACTIVE_SESSION_ID)?.value ?? null;
    if (actualActive !== expectedActiveSessionId) {
      throw new ActiveSessionMismatchError(expectedActiveSessionId, actualActive);
    }
    if (current) {
      if (!actualActive || current.record.id !== actualActive || current.record.id !== expectedActiveSessionId) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }

    let flushedRecord: DocumentSessionRecord | undefined;
    let flushedSummary: DocumentSessionSummary | undefined;
    let sourceRecord: DocumentSessionRecord | undefined;

    if (current) {
      if (typeof current.expectedRevision !== "number" || !Number.isSafeInteger(current.expectedRevision) || current.expectedRevision < 1) {
        throw new Error("current.expectedRevision must be a positive safe integer");
      }
      const existingCurrent = memoryDrafts.get(current.record.id) as DocumentSessionRecord | undefined;
      if (!existingCurrent) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrent, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrent.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrent.revision
        );
      }
      validateSourceGenerationTransition(existingCurrent, current.record);
      const flushedRev = current.expectedRevision + 1;
      if (!Number.isSafeInteger(flushedRev)) {
        throw new Error("Revision exceeds safe integer range");
      }
      const flushedNow = new Date().toISOString();
      flushedRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: flushedNow,
      };
      const curSummary = memoryFallbackSessionIndex.get(current.record.id);
      flushedSummary = buildSummaryFromRecord(flushedRecord, { existingSummary: curSummary });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }

      if (current.record.id === sourceId) {
        sourceRecord = flushedRecord;
      }
    }

    if (!sourceRecord) {
      sourceRecord = memoryDrafts.get(sourceId) as DocumentSessionRecord | undefined;
    }
    if (!sourceRecord) {
      // Throws before making ANY changes! (F03 fix)
      throw new SessionNotFoundError(sourceId);
    }
    if (!isDocumentSessionRecordValid(sourceRecord, sourceId)) {
      throw new SessionCorruptError(sourceId);
    }

    const now = new Date().toISOString();
    const clonedRecord: DocumentSessionRecord = {
      ...structuredClone(sourceRecord),
      id: newId,
      title: newTitle,
      revision: 1,
      updatedAt: now,
      doc: structuredClone(sourceRecord.doc),
    };
    const clonedSummary = buildSummaryFromRecord(clonedRecord, {
      createdAt: now,
      status: "active",
    });

    if (!isDocumentSessionRecordValid(clonedRecord, newId)) {
      throw new SessionCorruptError(newId);
    }
    if (!isDocumentSessionSummaryValid(clonedSummary, newId)) {
      throw new SessionCorruptError(newId, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(clonedSummary, clonedRecord)) {
      throw new SessionCorruptError(newId, "Summary does not match record invariants");
    }

    // Stage all clones and return value BEFORE any write (C02)
    const clonedFlushedRecord = flushedRecord ? structuredClone(flushedRecord) : undefined;
    const clonedFlushedSummary = flushedSummary ? structuredClone(flushedSummary) : undefined;
    const clonedNewRecord = structuredClone(clonedRecord);
    const clonedNewSummary = structuredClone(clonedSummary);
    const resultToReturn = structuredClone(clonedSummary);

    // Apply writes only after all checks and clones passed
    if (current && clonedFlushedRecord && clonedFlushedSummary) {
      memoryDrafts.set(current.record.id, clonedFlushedRecord as any);
      memoryFallbackSessionIndex.set(current.record.id, clonedFlushedSummary);
    }
    memoryDrafts.set(newId, clonedNewRecord as any);
    memoryFallbackSessionIndex.set(newId, clonedNewSummary);
    memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, {
      key: META_ACTIVE_SESSION_ID,
      value: newId,
    });
    return resultToReturn;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX, STORE_APP_META], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);
    const appMetaStore = tx.objectStore(STORE_APP_META);

    const reads: Promise<any>[] = [
      promisifyRequest(appMetaStore.get(META_ACTIVE_SESSION_ID)),
      promisifyRequest(draftsStore.get(sourceId)),
      promisifyRequest(sessionIndexStore.get(sourceId)),
    ];

    if (current) {
      reads.push(
        promisifyRequest(draftsStore.get(current.record.id)),
        promisifyRequest(sessionIndexStore.get(current.record.id))
      );
    }

    const results = await Promise.all(reads);
    const activeMeta = results[0];
    const actualActive = activeMeta?.value ?? null;

    if (actualActive !== expectedActiveSessionId) {
      throw new ActiveSessionMismatchError(expectedActiveSessionId, actualActive);
    }
    if (current) {
      if (!actualActive || current.record.id !== actualActive || current.record.id !== expectedActiveSessionId) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }

    let sourceDraft = results[1] as DocumentSessionRecord | undefined;

    let flushedRecord: DocumentSessionRecord | undefined;
    let flushedSummary: DocumentSessionSummary | undefined;

    if (current) {
      if (typeof current.expectedRevision !== "number" || !Number.isSafeInteger(current.expectedRevision) || current.expectedRevision < 1) {
        throw new Error("current.expectedRevision must be a positive safe integer");
      }
      const existingCurrentDraft = results[3] as DocumentSessionRecord | undefined;
      const existingCurrentSummary = results[4] as DocumentSessionSummary | undefined;

      if (!existingCurrentDraft) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrentDraft, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrentDraft.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrentDraft.revision
        );
      }
      validateSourceGenerationTransition(existingCurrentDraft, current.record);

      const flushedRev = current.expectedRevision + 1;
      if (!Number.isSafeInteger(flushedRev)) {
        throw new Error("Revision exceeds safe integer range");
      }
      const flushedNow = new Date().toISOString();
      flushedRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: flushedNow,
      };
      const flushedSummary = buildSummaryFromRecord(flushedRecord, {
        existingSummary: existingCurrentSummary,
      });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }

      if (current.record.id === sourceId) {
        sourceDraft = flushedRecord;
      }
    }

    // Check source existence BEFORE writing anything! (F03 fix)
    if (!sourceDraft) {
      throw new SessionNotFoundError(sourceId);
    }
    if (!isDocumentSessionRecordValid(sourceDraft, sourceId)) {
      throw new SessionCorruptError(sourceId);
    }

    const now = new Date().toISOString();
    const clonedRecord: DocumentSessionRecord = {
      ...structuredClone(sourceDraft),
      id: newId,
      title: newTitle,
      revision: 1,
      updatedAt: now,
      doc: structuredClone(sourceDraft.doc),
    };
    const clonedSummary = buildSummaryFromRecord(clonedRecord, {
      createdAt: now,
      status: "active",
    });

    if (!isDocumentSessionRecordValid(clonedRecord, newId)) {
      throw new SessionCorruptError(newId);
    }
    if (!isDocumentSessionSummaryValid(clonedSummary, newId)) {
      throw new SessionCorruptError(newId, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(clonedSummary, clonedRecord)) {
      throw new SessionCorruptError(newId, "Summary does not match record invariants");
    }

    // Write flushed current only if all checks passed
    if (flushedRecord && flushedSummary) {
      draftsStore.put(flushedRecord);
      sessionIndexStore.put(flushedSummary);
    }

    draftsStore.put(clonedRecord);
    sessionIndexStore.put(clonedSummary);
    appMetaStore.put({ key: META_ACTIVE_SESSION_ID, value: newId });

    await commitPromise;
    return clonedSummary;
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

/**
 * Archives a session and clears the active pointer if the archived session was open.
 * If current is supplied, preserves and persists its latest edits in the same transaction.
 */
export async function archiveSession(
  id: string,
  expectedRevision: number,
  current?: { record: DocumentSessionRecord; expectedRevision: number },
  customDb?: IDBDatabase
): Promise<void> {
  const now = new Date().toISOString();

  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
    throw new SessionRevisionConflictError(id, expectedRevision, null);
  }

  if (current) {
    assertCloneable(current.record);
    const curId = (current.record as any)?.id;
    if (!isDocumentSessionRecordValid(current.record, curId)) {
      throw new SessionCorruptError(curId || "unknown");
    }
    if (!Number.isSafeInteger(current.expectedRevision) || current.expectedRevision <= 0) {
      throw new SessionRevisionConflictError(curId, current.expectedRevision, null);
    }
    if (!Number.isSafeInteger(current.expectedRevision + 1)) {
      throw new SessionRevisionConflictError(curId, current.expectedRevision, null);
    }
  }

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const actualActive = memoryFallbackAppMeta.get(META_ACTIVE_SESSION_ID)?.value ?? null;

    if (current) {
      if (!actualActive || current.record.id !== actualActive) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }

    // Target session existence and integrity checks
    const targetDraft = memoryDrafts.get(id) as DocumentSessionRecord | undefined;
    const targetSummary = memoryFallbackSessionIndex.get(id);
    if (!targetDraft || !targetSummary) {
      throw new SessionNotFoundError(id);
    }
    if (!isDocumentSessionRecordValid(targetDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (targetDraft.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(id, expectedRevision, targetDraft.revision);
    }

    // F01 fix: if current is the session being archived, preserve its latest edits!
    if (current && current.record.id === id) {
      if (current.expectedRevision !== expectedRevision) {
        throw new SessionRevisionConflictError(id, expectedRevision, current.expectedRevision);
      }
      if (current.record.revision !== expectedRevision) {
        throw new SessionRevisionConflictError(id, expectedRevision, current.record.revision);
      }
      validateSourceGenerationTransition(targetDraft, current.record);

      const nextRev = expectedRevision + 1;
      if (!Number.isSafeInteger(nextRev)) {
        throw new SessionRevisionConflictError(id, expectedRevision, null);
      }
      const updatedDraft: DocumentSessionRecord = {
        ...current.record,
        revision: nextRev,
        updatedAt: now,
      };
      const updatedSummary = buildSummaryFromRecord(updatedDraft, {
        status: "archived",
        existingSummary: targetSummary,
      });

      if (!isDocumentSessionRecordValid(updatedDraft, id)) {
        throw new SessionCorruptError(id);
      }
      if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
        throw new SessionCorruptError(id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
        throw new SessionCorruptError(id, "Summary does not match record invariants");
      }

      // Stage all clones BEFORE any write (C02)
      const clonedDraft = structuredClone(updatedDraft);
      const clonedSummary = structuredClone(updatedSummary);

      memoryDrafts.set(id, clonedDraft as any);
      memoryFallbackSessionIndex.set(id, clonedSummary);

      if (actualActive === id) {
        memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, {
          key: META_ACTIVE_SESSION_ID,
          value: null,
        });
      }
      return;
    }

    // current is another session
    let flushedRecord: DocumentSessionRecord | undefined;
    let flushedSummary: DocumentSessionSummary | undefined;

    if (current && current.record.id !== id) {
      if (current.record.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(current.record.id, current.expectedRevision, current.record.revision);
      }
      const existingCurrent = memoryDrafts.get(current.record.id) as DocumentSessionRecord | undefined;
      if (!existingCurrent) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrent, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrent.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrent.revision
        );
      }
      const flushedRev = current.expectedRevision + 1;
      flushedRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: now,
      };
      const curSummary = memoryFallbackSessionIndex.get(current.record.id);
      flushedSummary = buildSummaryFromRecord(flushedRecord, { existingSummary: curSummary });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }
    }

    if (targetDraft.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(id, expectedRevision, targetDraft.revision);
    }

    const nextRev = targetDraft.revision + 1;
    if (!Number.isSafeInteger(nextRev)) {
      throw new SessionRevisionConflictError(id, expectedRevision, null);
    }
    const updatedDraft: DocumentSessionRecord = {
      ...targetDraft,
      revision: nextRev,
      updatedAt: now,
    };
    const updatedSummary = buildSummaryFromRecord(updatedDraft, {
      status: "archived",
      existingSummary: targetSummary,
    });

    if (!isDocumentSessionRecordValid(updatedDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
      throw new SessionCorruptError(id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
      throw new SessionCorruptError(id, "Summary does not match record invariants");
    }

    // Stage all clones BEFORE any write (C02)
    const clonedFlushedRecord = flushedRecord ? structuredClone(flushedRecord) : undefined;
    const clonedFlushedSummary = flushedSummary ? structuredClone(flushedSummary) : undefined;
    const clonedUpdatedDraft = structuredClone(updatedDraft);
    const clonedUpdatedSummary = structuredClone(updatedSummary);

    if (clonedFlushedRecord && clonedFlushedSummary) {
      memoryDrafts.set(current!.record.id, clonedFlushedRecord as any);
      memoryFallbackSessionIndex.set(current!.record.id, clonedFlushedSummary);
    }
    memoryDrafts.set(id, clonedUpdatedDraft as any);
    memoryFallbackSessionIndex.set(id, clonedUpdatedSummary);

    if (actualActive === id) {
      memoryFallbackAppMeta.set(META_ACTIVE_SESSION_ID, {
        key: META_ACTIVE_SESSION_ID,
        value: null,
      });
    }
    return;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX, STORE_APP_META], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);
    const appMetaStore = tx.objectStore(STORE_APP_META);

    const reads: Promise<any>[] = [
      promisifyRequest(appMetaStore.get(META_ACTIVE_SESSION_ID)),
      promisifyRequest(draftsStore.get(id)),
      promisifyRequest(sessionIndexStore.get(id)),
    ];

    if (current && current.record.id !== id) {
      reads.push(
        promisifyRequest(draftsStore.get(current.record.id)),
        promisifyRequest(sessionIndexStore.get(current.record.id))
      );
    }

    const results = await Promise.all(reads);
    const activeMeta = results[0];
    const targetDraft = results[1] as DocumentSessionRecord | undefined;
    const targetSummary = results[2] as DocumentSessionSummary | undefined;
    const actualActive = activeMeta?.value ?? null;

    if (current) {
      if (!actualActive || current.record.id !== actualActive) {
        throw new ActiveSessionMismatchError(actualActive, current.record.id);
      }
    }

    if (!targetDraft || !targetSummary) {
      throw new SessionNotFoundError(id);
    }
    if (!isDocumentSessionRecordValid(targetDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (targetDraft.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(id, expectedRevision, targetDraft.revision);
    }

    // F01 fix: if current is the session being archived, preserve its unsaved edits!
    if (current && current.record.id === id) {
      if (current.expectedRevision !== expectedRevision) {
        throw new SessionRevisionConflictError(id, expectedRevision, current.expectedRevision);
      }
      if (current.record.revision !== expectedRevision) {
        throw new SessionRevisionConflictError(id, expectedRevision, current.record.revision);
      }
      validateSourceGenerationTransition(targetDraft, current.record);

      const nextRev = expectedRevision + 1;
      if (!Number.isSafeInteger(nextRev)) {
        throw new SessionRevisionConflictError(id, expectedRevision, null);
      }
      const updatedDraft: DocumentSessionRecord = {
        ...current.record,
        revision: nextRev,
        updatedAt: now,
      };
      const updatedSummary = buildSummaryFromRecord(updatedDraft, {
        status: "archived",
        existingSummary: targetSummary,
      });

      if (!isDocumentSessionRecordValid(updatedDraft, id)) {
        throw new SessionCorruptError(id);
      }
      if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
        throw new SessionCorruptError(id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
        throw new SessionCorruptError(id, "Summary does not match record invariants");
      }

      draftsStore.put(updatedDraft);
      sessionIndexStore.put(updatedSummary);

      if (actualActive === id) {
        appMetaStore.put({ key: META_ACTIVE_SESSION_ID, value: null });
      }

      await commitPromise;
      return;
    }

    // current is another session
    if (current && current.record.id !== id) {
      if (current.record.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(current.record.id, current.expectedRevision, current.record.revision);
      }
      const existingCurrentDraft = results[3] as DocumentSessionRecord | undefined;
      const existingCurrentSummary = results[4] as DocumentSessionSummary | undefined;

      if (!existingCurrentDraft) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          null
        );
      }
      if (!isDocumentSessionRecordValid(existingCurrentDraft, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Existing current record is corrupt");
      }
      if (existingCurrentDraft.revision !== current.expectedRevision) {
        throw new SessionRevisionConflictError(
          current.record.id,
          current.expectedRevision,
          existingCurrentDraft.revision
        );
      }
      validateSourceGenerationTransition(existingCurrentDraft, current.record);

      const flushedRev = current.expectedRevision + 1;
      const flushedRecord: DocumentSessionRecord = {
        ...current.record,
        revision: flushedRev,
        updatedAt: now,
      };
      const flushedSummary = buildSummaryFromRecord(flushedRecord, {
        existingSummary: existingCurrentSummary,
      });

      if (!isDocumentSessionRecordValid(flushedRecord, current.record.id)) {
        throw new SessionCorruptError(current.record.id);
      }
      if (!isDocumentSessionSummaryValid(flushedSummary, current.record.id)) {
        throw new SessionCorruptError(current.record.id, "Invalid summary");
      }
      if (!isSummaryConsistentWithRecord(flushedSummary, flushedRecord)) {
        throw new SessionCorruptError(current.record.id, "Flushed summary does not match record invariants");
      }

      draftsStore.put(flushedRecord);
      sessionIndexStore.put(flushedSummary);
    }

    if (targetDraft.revision !== expectedRevision) {
      throw new SessionRevisionConflictError(id, expectedRevision, targetDraft.revision);
    }

    const nextRev = targetDraft.revision + 1;
    if (!Number.isSafeInteger(nextRev)) {
      throw new SessionRevisionConflictError(id, expectedRevision, null);
    }
    const updatedDraft: DocumentSessionRecord = {
      ...targetDraft,
      revision: nextRev,
      updatedAt: now,
    };
    const updatedSummary = buildSummaryFromRecord(updatedDraft, {
      status: "archived",
      existingSummary: targetSummary,
    });

    if (!isDocumentSessionRecordValid(updatedDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
      throw new SessionCorruptError(id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
      throw new SessionCorruptError(id, "Summary does not match record invariants");
    }

    draftsStore.put(updatedDraft);
    sessionIndexStore.put(updatedSummary);

    if (actualActive === id) {
      appMetaStore.put({ key: META_ACTIVE_SESSION_ID, value: null });
    }

    await commitPromise;
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

/**
 * Restores an archived session to active status in `session_index`.
 */
export async function restoreArchivedSession(
  id: string,
  customDb?: IDBDatabase
): Promise<void> {
  const now = new Date().toISOString();

  if (typeof indexedDB === "undefined" && !customDb) {
    const memoryDrafts = getMemoryFallbackDrafts();
    const targetDraft = memoryDrafts.get(id) as DocumentSessionRecord | undefined;
    const targetSummary = memoryFallbackSessionIndex.get(id);

    if (!targetDraft || !targetSummary) {
      throw new SessionNotFoundError(id);
    }
    if (!isDocumentSessionRecordValid(targetDraft, id)) {
      throw new SessionCorruptError(id);
    }

    const nextRev = targetDraft.revision + 1;
    if (!Number.isSafeInteger(nextRev)) {
      throw new SessionRevisionConflictError(id, targetDraft.revision, null);
    }
    const updatedDraft: DocumentSessionRecord = {
      ...targetDraft,
      revision: nextRev,
      updatedAt: now,
    };
    const updatedSummary = buildSummaryFromRecord(updatedDraft, {
      status: "active",
      existingSummary: targetSummary,
    });

    if (!isDocumentSessionRecordValid(updatedDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
      throw new SessionCorruptError(id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
      throw new SessionCorruptError(id, "Summary does not match record invariants");
    }

    // Stage all clones BEFORE any write (C02)
    const clonedDraft = structuredClone(updatedDraft);
    const clonedSummary = structuredClone(updatedSummary);

    memoryDrafts.set(id, clonedDraft as any);
    memoryFallbackSessionIndex.set(id, clonedSummary);
    return;
  }

  const db = customDb ?? (await openDatabase());
  const tx = db.transaction([STORE_DRAFTS, STORE_SESSION_INDEX], "readwrite");
  const commitPromise = awaitTransactionCommit(tx);

  try {
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const sessionIndexStore = tx.objectStore(STORE_SESSION_INDEX);

    const [targetDraft, targetSummary] = await Promise.all([
      promisifyRequest(draftsStore.get(id)) as Promise<DocumentSessionRecord | undefined>,
      promisifyRequest(sessionIndexStore.get(id)) as Promise<DocumentSessionSummary | undefined>,
    ]);

    if (!targetDraft || !targetSummary) {
      throw new SessionNotFoundError(id);
    }
    if (!isDocumentSessionRecordValid(targetDraft, id)) {
      throw new SessionCorruptError(id);
    }

    const nextRev = targetDraft.revision + 1;
    if (!Number.isSafeInteger(nextRev)) {
      throw new SessionRevisionConflictError(id, targetDraft.revision, null);
    }
    const updatedDraft: DocumentSessionRecord = {
      ...targetDraft,
      revision: nextRev,
      updatedAt: now,
    };
    const updatedSummary = buildSummaryFromRecord(updatedDraft, {
      status: "active",
      existingSummary: targetSummary,
    });

    if (!isDocumentSessionRecordValid(updatedDraft, id)) {
      throw new SessionCorruptError(id);
    }
    if (!isDocumentSessionSummaryValid(updatedSummary, id)) {
      throw new SessionCorruptError(id, "Invalid summary");
    }
    if (!isSummaryConsistentWithRecord(updatedSummary, updatedDraft)) {
      throw new SessionCorruptError(id, "Summary does not match record invariants");
    }

    draftsStore.put(updatedDraft);
    sessionIndexStore.put(updatedSummary);

    await commitPromise;
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
