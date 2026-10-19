/**
 * @file draftStore.ts
 * @description IndexedDB local storage for DocForm 30 drafts, version history,
 * and immutable source DOCX retention store (source_blobs).
 */

import type { DocumentState } from "../App.tsx";
import type { SourceBlock, StructuredImport } from "../shared/schemas/document.schema.ts";

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
  versions: Array<{
    id: string;
    timestamp: string;
    title: string;
    data: DocumentState;
    standardType: "state" | "party";
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

const DB_NAME = "DocForm30_DB";
const STORE_DRAFTS = "drafts";
const STORE_SOURCE_BLOBS = "source_blobs";
const DB_VERSION = 2;
const DEFAULT_DRAFT_ID = "current_active_draft";

// In-memory fallback for environments without native IndexedDB (e.g. Node tests)
const memoryFallbackDrafts = new Map<string, DraftRecord>();
const memoryFallbackSourceBlobs = new Map<string, SourceDocumentHandle>();

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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SOURCE_BLOBS)) {
        db.createObjectStore(STORE_SOURCE_BLOBS, { keyPath: "hash" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

export interface SaveSourceBlobResult {
  persisted: boolean;
  storage: "indexeddb" | "memory";
  error?: string;
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
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_SOURCE_BLOBS], "readwrite");
    const store = transaction.objectStore(STORE_SOURCE_BLOBS);
    const req = store.put(handle);
    await awaitTransactionCommit(transaction, req);
    return {
      persisted: true,
      storage: "indexeddb",
    };
  } catch (err: any) {
    // Fallback to memory
    memoryFallbackSourceBlobs.set(handle.hash, handle);
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
    return await new Promise<SourceDocumentHandle | null>((resolve, reject) => {
      const transaction = db.transaction([STORE_SOURCE_BLOBS], "readonly");
      const store = transaction.objectStore(STORE_SOURCE_BLOBS);
      const req = store.get(hash);
      req.onsuccess = () => resolve(req.result || memoryFallbackSourceBlobs.get(hash) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryFallbackSourceBlobs.get(hash) || null;
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
        resolve(req.result || memoryFallbackDrafts.get(id) || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return memoryFallbackDrafts.get(id) || null;
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
