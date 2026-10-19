import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  saveSourceBlob,
  loadSourceBlob,
  computeSourceHash,
  type SourceDocumentHandle,
  saveDraft,
  loadDraft,
  clearDraft,
} from "../src/utils/draftStore.ts";

// Simple in-memory polyfill for IndexedDB in Node.js test environment
class MockIDBStore {
  items = new Map<string, any>();
  currentTx: any = null;
  put(val: any) {
    this.items.set(val.id || val.hash, val);
    const req: any = { onsuccess: null, onerror: null };
    queueMicrotask(() => {
      req.result = val.id || val.hash;
      req.onsuccess?.({ target: req });
      queueMicrotask(() => {
        this.currentTx?.oncomplete?.();
      });
    });
    return req;
  }
  get(key: string) {
    const val = this.items.get(key);
    const req: any = { onsuccess: null, onerror: null, result: val };
    queueMicrotask(() => {
      req.onsuccess?.({ target: req });
    });
    return req;
  }
  delete(key: string) {
    this.items.delete(key);
    const req: any = { onsuccess: null, onerror: null };
    queueMicrotask(() => {
      req.onsuccess?.({ target: req });
      queueMicrotask(() => {
        this.currentTx?.oncomplete?.();
      });
    });
    return req;
  }
}

const mockStores: Record<string, MockIDBStore> = {
  drafts: new MockIDBStore(),
  source_blobs: new MockIDBStore(),
};

(globalThis as any).indexedDB = {
  open: () => {
    const req: any = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: {
        transaction: (storeNames: string[]) => {
          const tx: any = {
            oncomplete: null,
            onabort: null,
            onerror: null,
            error: null,
            objectStore: (name: string) => {
              const s = mockStores[name] || new MockIDBStore();
              s.currentTx = tx;
              return s;
            },
          };
          return tx;
        },
      },
    };
    queueMicrotask(() => {
      req.onsuccess?.({ target: req });
    });
    return req;
  },
};

describe("Task 2: Source DOCX Retention & Provenance Store", () => {
  it("tính toán hash SHA-256 nhất quán cho bytes gốc", async () => {
    const sampleBytes = new TextEncoder().encode("DocForm-30-Sample-Docx-Content").buffer;
    const hash1 = await computeSourceHash(sampleBytes);
    const hash2 = await computeSourceHash(sampleBytes);
    assert.equal(hash1, hash2);
    assert.ok(hash1.length >= 32);
  });

  it("lưu và đọc lại tệp gốc qua SourceDocumentHandle", async () => {
    const sampleBytes = new TextEncoder().encode("DocForm-30-Sample-Docx-Content").buffer;
    const hash = await computeSourceHash(sampleBytes);
    const handle: SourceDocumentHandle = {
      hash,
      fileName: "KeHoach_2026.docx",
      fileType: "docx",
      fileSize: sampleBytes.byteLength,
      uploadedAt: new Date().toISOString(),
      bytes: sampleBytes,
    };

    await saveSourceBlob(handle);
    const loaded = await loadSourceBlob(hash);
    assert.ok(loaded);
    assert.equal(loaded.hash, hash);
    assert.equal(loaded.fileName, "KeHoach_2026.docx");
    assert.equal(loaded.fileSize, sampleBytes.byteLength);
  });

  it("sửa đổi bản nháp không làm thay đổi hay xóa tệp gốc đã lưu", async () => {
    const sampleBytes = new TextEncoder().encode("Untouched-Original-DOCX-Bytes").buffer;
    const hash = await computeSourceHash(sampleBytes);
    await saveSourceBlob({
      hash,
      fileName: "Goc.docx",
      fileType: "docx",
      fileSize: sampleBytes.byteLength,
      uploadedAt: new Date().toISOString(),
      bytes: sampleBytes,
    });

    // Bản nháp thay đổi body
    const mockDoc: any = {
      headerProfile: "generic",
      bodyHtml: "<p>Nội dung đã bị sửa đổi nhiều lần</p>",
      documentType: "KẾ HOẠCH",
    };
    await saveDraft({
      id: "test_draft",
      updatedAt: new Date().toISOString(),
      standardType: "state",
      doc: mockDoc,
      versions: [],
      originalSnapshot: {
        sourceType: "uploaded_file",
        fileName: "Goc.docx",
        fileType: "docx",
        uploadedAt: new Date().toISOString(),
        bodyHtml: "<p>Nội dung gốc</p>",
        sourceId: hash,
      },
    });

    // Nạp lại tệp gốc từ store độc lập
    const original = await loadSourceBlob(hash);
    assert.ok(original);
    const textDecoder = new TextDecoder();
    assert.equal(textDecoder.decode(original.bytes), "Untouched-Original-DOCX-Bytes");
  });
});
