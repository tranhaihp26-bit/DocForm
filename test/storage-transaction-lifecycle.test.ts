import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { saveSourceBlob, loadSourceBlob, saveDraft, awaitTransactionCommit } from "../src/utils/draftStore.ts";

describe("Task 1: Storage Transaction Lifecycle & Verification", () => {
  it("B04: Do not report persistence if transaction aborts after request success or microtask", async () => {
    const old = (globalThis as any).indexedDB;
    let aborted = false;
    const fakeDb = {
      transaction() {
        const tx: any = {
          error: null,
          objectStore() {
            return {
              put() {
                const req: any = {};
                queueMicrotask(() => {
                  req.onsuccess?.();
                  setTimeout(() => {
                    aborted = true;
                    tx.error = new Error("Synthetic delayed transaction abort");
                    tx.onabort?.();
                  }, 5);
                });
                return req;
              },
            };
          },
        };
        return tx;
      },
    };

    (globalThis as any).indexedDB = {
      open() {
        const req: any = { result: fakeDb };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    };

    let result: any;
    try {
      result = await saveSourceBlob({
        hash: "lifecycle-delayed-abort",
        fileName: "synthetic.docx",
        fileType: "docx",
        fileSize: 1,
        uploadedAt: "2026-10-17",
        bytes: new Uint8Array([1]).buffer,
      });
      await new Promise(resolve => setTimeout(resolve, 20));
    } finally {
      if (old === undefined) delete (globalThis as any).indexedDB;
      else (globalThis as any).indexedDB = old;
    }

    const loaded = await loadSourceBlob("lifecycle-delayed-abort");
    assert.equal(aborted, true, "Transaction must have aborted");
    assert.equal(result.persisted, false, "Must not report persisted=true on aborted transaction");
    assert.equal(result.storage, "memory", "Must fall back to memory");
    assert.equal(Boolean(loaded), true, "Must be recoverable from memory fallback");
  });

  it("Transaction commit normal lifecycle resolves only on oncomplete", async () => {
    let completed = false;
    const tx: any = {
      oncomplete: null,
      onabort: null,
      onerror: null,
    };
    const req: any = {};

    const promise = awaitTransactionCommit(tx, req);
    let resolved = false;
    promise.then(() => { resolved = true; });

    // Request success does NOT resolve
    req.onsuccess?.();
    await new Promise(r => setTimeout(r, 5));
    assert.equal(resolved, false, "Must not resolve on request success");

    // Only oncomplete resolves
    completed = true;
    tx.oncomplete?.();
    await promise;
    assert.equal(resolved, true, "Must resolve on transaction.oncomplete");
    assert.equal(completed, true);
  });

  it("saveDraft rejects when transaction aborts", async () => {
    const old = (globalThis as any).indexedDB;
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      transaction() {
        const tx: any = {
          error: new Error("Draft commit failed"),
          objectStore() {
            return {
              put() {
                const req: any = {};
                queueMicrotask(() => {
                  req.onsuccess?.();
                  tx.onabort?.();
                });
                return req;
              },
            };
          },
        };
        return tx;
      },
    };

    (globalThis as any).indexedDB = {
      open() {
        const req: any = { result: fakeDb };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    };

    try {
      let rejected = false;
      try {
        await saveDraft({
          id: "draft_test_abort",
          updatedAt: new Date().toISOString(),
          doc: { bodyHtml: "<p>TEST</p>" } as any,
          standardType: "state",
          versions: [],
        });
      } catch (e) {
        rejected = true;
      }
      assert.equal(rejected, true, "saveDraft must reject on transaction abort");
    } finally {
      if (old === undefined) delete (globalThis as any).indexedDB;
      else (globalThis as any).indexedDB = old;
    }
  });
});
