/**
 * @file draftStore.ts
 * @description IndexedDB local storage for DocForm 30 drafts, version history,
 * and immutable source DOCX retention store (source_blobs).
 */

import type { DocumentState } from "../App.tsx";
import type { SourceBlock, StructuredImport } from "../shared/schemas/document.schema.ts";
import type { WorkspaceState } from "./workspaceState.ts";
import type { PersistedFullTextSemanticReview } from "./fullTextReviewPersistence.ts";

export interface OriginalDocumentSnapshot {
  sourceType: "uploaded_file" | "system_template";
  fileName?: string;
  fileType?: "docx" | "txt" | "template";
  sourceId?: string;
  sourceHash?: string;
  uploadedAt: string;
  bodyHtml: string;
  rawText?: string;
  blockCount?: number;
  tableCount?: number;
}

export interface SourceDocumentHandle {
  hash: string;
  fileName: string;
  fileType: "docx" | "txt";
  fileSize: number;
  uploadedAt: string;
  bytes: ArrayBuffer;
}

export interface DraftRecord {
  schemaVersion: 1 | 2;
  id: string;
  updatedAt: string;
  standardType: "state" | "party";
  doc: DocumentState;
  /** Partition approval, edit ledger and staged/frozen draft; never inferred from a source hash. */
  workspace?: WorkspaceState;
  editorState?: {activeCanvasId:string};
  /**
   * Chặng 3: vị trí wizard (1–3) và nguồn người dùng đã chọn. Khi khôi phục,
   * App kẹp lại theo dữ liệu thật trước khi mở bước.
   */
  currentStep?: 1 | 2 | 3;
  sourceOrigin?: "none" | "uploaded_file" | "system_template";
  /**
   * Chặng 3 / S3-F01: quyết định rõ ràng của người dùng khi nguồn và loại văn bản
   * đang chọn khác nhau (provenance để không xuất âm thầm một tài liệu mâu thuẫn).
   */
  docTypeOverride?: {
    sourceDocType: string;
    chosenDocType: string;
    regime: "state" | "party";
    decidedAt: string;
  } | null;
  /**
   * Chặng 3 / S3-F01 (tái audit 20/10/2026): mã băm (hash) của nguồn tệp mà
   * người dùng đã **duyệt** ở bước đối chiếu & phân vùng. Bản nhập chưa được
   * duyệt không được mở Bước 3 hoặc nút xuất/in. Ràng buộc theo hash nguồn để
   * quyết định duyệt không "rơi" sang nguồn khác và vẫn sống qua reload.
   */
  importReviewApprovedSourceHash?: string | null;
  /** User semantic decisions only; source text and AI payloads are never stored here. */
  semanticDecisions?: Record<string, { contextKey: string; status: "user_confirmed" | "rejected"; evidenceFingerprint?: string }>;
  /** Source-bound semantic observations and coverage only; no text manifest, request payload or provider credential. */
  fullTextSemanticReview?: PersistedFullTextSemanticReview;
  versions: Array<{
    id: string;
    timestamp: string;
    title: string;
    data: DocumentState;
    standardType: "state" | "party";
    workspace?: WorkspaceState;
    originalSnapshot?: OriginalDocumentSnapshot | null;
    reviewBlocks?: SourceBlock[];
    structuredImport?: StructuredImport | null;
    uploadedBlocks?: SourceBlock[];
    uploadedFileName?: string;
    uploadedFileType?: "docx" | "txt" | null;
    rawText?: string;
    docTypeOverride?: DraftRecord["docTypeOverride"];
  }>;
  originalSnapshot?: OriginalDocumentSnapshot | null;
  // Partition & Import State for Re-partitioning & Reversibility
  reviewBlocks?: SourceBlock[];
  structuredImport?: StructuredImport | null;
  uploadedBlocks?: SourceBlock[];
  uploadedFileName?: string;
  uploadedFileType?: "docx" | "txt" | null;
  rawText?: string;
}

export const DB_NAME = "DocForm30_DB";
export const STORE_DRAFTS = "drafts";
export const STORE_SOURCE_BLOBS = "source_blobs";
export const STORE_SESSION_INDEX = "session_index";
export const STORE_APP_META = "app_meta";
export const DB_VERSION = 3;
export const DEFAULT_DRAFT_ID = "current_active_draft";

// In-memory fallback for environments without native IndexedDB (e.g. Node tests)
const memoryFallbackDrafts = new Map<string, DraftRecord>();
const memoryFallbackSourceBlobs = new Map<string, SourceDocumentHandle>();

export function getMemoryFallbackDrafts(): Map<string, DraftRecord> {
  return memoryFallbackDrafts;
}

export function getMemoryFallbackSourceBlobs(): Map<string, SourceDocumentHandle> {
  return memoryFallbackSourceBlobs;
}

export async function computeSourceHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
  try {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
  } catch {
    // Ultra fallback
    let hash = 0;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i++) {
      hash = ((hash << 5) - hash + view[i]) | 0;
    }
    return "hash_" + Math.abs(hash).toString(16);
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Upgrade only ADDS stores. It must never delete or rewrite `drafts` or `source_blobs`.
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SOURCE_BLOBS)) {
        db.createObjectStore(STORE_SOURCE_BLOBS, { keyPath: "hash" });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION_INDEX)) {
        db.createObjectStore(STORE_SESSION_INDEX, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_APP_META)) {
        db.createObjectStore(STORE_APP_META, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Let a newer schema upgrade (another tab) proceed instead of blocking on this connection.
      try {
        db.onversionchange = () => {
          try { db.close(); } catch { /* ignore */ }
        };
      } catch { /* ignore */ }
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

export interface SaveSourceBlobResult {
  persisted: boolean;
  storage: "indexeddb" | "memory";
  error?: string;
}

export class SourceBlobIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "SourceBlobIntegrityError"; }
}

function assertSameSourceBytes(existing: SourceDocumentHandle, candidate: SourceDocumentHandle): void {
  if (!(existing.bytes instanceof ArrayBuffer) || existing.hash !== candidate.hash
    || existing.bytes.byteLength !== candidate.bytes.byteLength) {
    throw new SourceBlobIntegrityError("Immutable source blob cannot be replaced with different bytes");
  }
  const before = new Uint8Array(existing.bytes), after = new Uint8Array(candidate.bytes);
  if (before.some((byte, index) => byte !== after[index])) {
    throw new SourceBlobIntegrityError("Immutable source blob cannot be replaced with different bytes");
  }
}

async function verifiedSourceCopy(handle: SourceDocumentHandle): Promise<SourceDocumentHandle> {
  const copy = structuredClone(handle);
  if (!(copy.bytes instanceof ArrayBuffer) || copy.fileSize !== copy.bytes.byteLength
    || await computeSourceHash(copy.bytes) !== copy.hash) {
    throw new SourceBlobIntegrityError("Source blob bytes do not match the declared hash or size");
  }
  return copy;
}

/**
 * Helper nội bộ chờ IndexedDB transaction commit.
 * Chỉ resolve ở transaction.oncomplete.
 * Reject ở transaction.onabort hoặc transaction.onerror, hoặc request.onerror.
 */
export function awaitTransactionCommit(transaction: IDBTransaction, request?: IDBRequest): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const doResolve = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const doReject = (err: any) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    transaction.oncomplete = () => doResolve();
    transaction.onabort = () => doReject(transaction.error || new Error("Transaction aborted"));
    transaction.onerror = () => doReject(transaction.error || new Error("Transaction failed"));

    if (request) {
      request.onerror = () => doReject(request.error || new Error("IndexedDB request error"));
    }
  });
}

/**
 * Lưu tệp DOCX gốc vào Object Store riêng biệt (source_blobs).
 * Tránh nhân bản dữ liệu nhị phân dung lượng lớn vào mỗi lần auto-save bản thảo.
 */
export async function saveSourceBlob(handle: SourceDocumentHandle): Promise<SaveSourceBlobResult> {
  // Validate outside the storage fallback catch: corruption must never become a memory "save".
  const copy = await verifiedSourceCopy(handle);
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_SOURCE_BLOBS], "readwrite");
    const committed = awaitTransactionCommit(transaction);
    // Consume any rejection immediately even if a request fails before we await commit below.
    void committed.catch(() => {});
    try {
      const store = transaction.objectStore(STORE_SOURCE_BLOBS);
      const existing = await new Promise<SourceDocumentHandle | undefined>((resolve, reject) => {
        const read = store.get(copy.hash);
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error || new Error("Source blob read failed"));
      });
      if (existing) assertSameSourceBytes(existing, copy);
      else store.put(copy);
      await committed;
      return { persisted: true, storage: "indexeddb" };
    } catch (error) {
      // A failed request must not leave a live write transaction behind.
      try { transaction.abort(); } catch { /* already complete/aborted */ }
      // Integrity failures can occur in incomplete mocks as well; never hang their caller.
      void committed.catch(() => {});
      throw error;
    }
  } catch (err: any) {
    if (err instanceof SourceBlobIntegrityError) throw err;
    // Fallback to memory
    const existing = memoryFallbackSourceBlobs.get(copy.hash);
    if (existing) assertSameSourceBytes(existing, copy);
    else memoryFallbackSourceBlobs.set(copy.hash, structuredClone(copy));
    return {
      persisted: false,
      storage: "memory",
      error: err?.message || "IndexedDB unavailable",
    };
  }
}

/**
 * Truy xuất tệp DOCX gốc theo hash bất biến.
 */
export async function loadSourceBlob(hash: string): Promise<SourceDocumentHandle | null> {
  try {
    const db = await openDatabase();
    const handle = await new Promise<SourceDocumentHandle | null>((resolve, reject) => {
      const transaction = db.transaction([STORE_SOURCE_BLOBS], "readonly");
      const store = transaction.objectStore(STORE_SOURCE_BLOBS);
      const req = store.get(hash);
      req.onsuccess = () => resolve(req.result || memoryFallbackSourceBlobs.get(hash) || null);
      req.onerror = () => reject(req.error);
    });
    if (handle && handle.hash !== hash) throw new SourceBlobIntegrityError("Source blob key does not match the stored hash");
    return handle ? await verifiedSourceCopy(handle) : null;
  } catch (error) {
    if (error instanceof SourceBlobIntegrityError) throw error;
    const handle = memoryFallbackSourceBlobs.get(hash);
    if (handle && handle.hash !== hash) throw new SourceBlobIntegrityError("Source blob key does not match the stored hash");
    return handle ? await verifiedSourceCopy(handle) : null;
  }
}

/**
 * Xóa tệp DOCX gốc khi người dùng yêu cầu làm sạch
 */
export async function clearSourceBlob(hash: string): Promise<void> {
  memoryFallbackSourceBlobs.delete(hash);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_SOURCE_BLOBS], "readwrite");
      const store = transaction.objectStore(STORE_SOURCE_BLOBS);
      const req = store.delete(hash);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

export async function saveDraft(record: Omit<DraftRecord, "schemaVersion">): Promise<void> {
  const data: DraftRecord = {
    ...record,
    id: record.id || DEFAULT_DRAFT_ID,
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    originalSnapshot: record.originalSnapshot !== undefined ? record.originalSnapshot : null,
    reviewBlocks: record.reviewBlocks,
    structuredImport: record.structuredImport,
    uploadedBlocks: record.uploadedBlocks,
    uploadedFileName: record.uploadedFileName,
    uploadedFileType: record.uploadedFileType,
    rawText: record.rawText,
  };

  const db = await openDatabase();
  const transaction = db.transaction([STORE_DRAFTS], "readwrite");
  const store = transaction.objectStore(STORE_DRAFTS);
  const req = store.put(data);
  await awaitTransactionCommit(transaction, req);
}

export async function loadDraft(id: string = DEFAULT_DRAFT_ID): Promise<DraftRecord | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_DRAFTS], "readonly");
      const store = transaction.objectStore(STORE_DRAFTS);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result || memoryFallbackDrafts.get(id);
        resolve(record ? structuredClone(record) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    const record = memoryFallbackDrafts.get(id);
    return record ? structuredClone(record) : null;
  }
}

export async function clearDraft(id: string = DEFAULT_DRAFT_ID): Promise<void> {
  memoryFallbackDrafts.delete(id);
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_DRAFTS], "readwrite");
      const store = transaction.objectStore(STORE_DRAFTS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[DraftStore] Could not clear draft from IndexedDB:", err);
  }
}
