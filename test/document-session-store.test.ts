import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getMemoryFallbackDrafts } from "../src/utils/draftStore.ts";
import {
  listSessions,
  loadSession,
  saveSession,
  createSession,
  activateSession,
  getActiveSessionId,
  renameSession,
  duplicateSession,
  archiveSession,
  restoreArchivedSession,
  resetMemoryFallbackStores,
  generateSessionId,
  memoryFallbackAppMeta,
  memoryFallbackSessionIndex,
} from "../src/utils/documentSessionStore.ts";
import {
  META_ACTIVE_SESSION_ID,
  SessionRevisionConflictError,
  ActiveSessionMismatchError,
  SessionNotFoundError,
  SessionAlreadyExistsError,
  SessionCorruptError,
  isDocumentSessionSummaryValid,
  isSummaryConsistentWithRecord,
  isPartitionProposalValid,
  buildSummaryFromRecord,
  type DocumentSessionRecord,
  type DocumentSessionSummary,
} from "../src/utils/documentSessionTypes.ts";
import type { DocumentState } from "../src/shared/schemas/document.schema.ts";

function createMockSession(id: string, subject: string, revision = 1): {
  record: DocumentSessionRecord;
  summary: DocumentSessionSummary;
} {
  const now = new Date().toISOString();
  const doc: DocumentState = {
    orgHeader1: "CƠ QUAN CHỦ QUẢN",
    orgHeader2: "CƠ QUAN BAN HÀNH",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hà Nội, ngày 19 tháng 10 năm 2026",
    documentType: "CÔNG VĂN",
    referenceNumber: "Số: 01/CV",
    subject,
    bodyHtml: `<p>Nội dung tài liệu ${subject}</p>`,
    signTitle: "THỦ TRƯỞNG",
    signName: "Nguyễn Văn A",
    recipients: "Như trên",
  };

  const record: DocumentSessionRecord = {
    schemaVersion: 3,
    id,
    title: subject,
    revision,
    sourceGeneration: 1,
    updatedAt: now,
    standardType: "state",
    doc,
    versions: [],
    originalSnapshot: {
      sourceType: "uploaded_file",
      fileName: `${id}.docx`,
      sourceHash: `hash-${id}`,
      uploadedAt: now,
      bodyHtml: doc.bodyHtml,
    },
    reviewBlocks: [
      {
        id: "block-0",
        index: 0,
        kind: "paragraph",
        text: `Khối đầu tiên của ${subject}`,
        role: "body",
      },
    ],
    workflow: {
      importReviewAccepted: true,
      userModifiedBlockIds: ["block-0"],
      partitionProposals: [],
      verifiedPartitionProposalIds: [],
      reviewProposals: [],
      acceptedProposalIds: [],
    },
  };

  const summary: DocumentSessionSummary = {
    id,
    title: subject,
    createdAt: now,
    updatedAt: now,
    status: "active",
    standardType: "state",
    sourceKind: "uploaded_file",
    sourceFileName: `${id}.docx`,
    revision,
  };

  return { record, summary };
}

describe("Task 1: Document Session Repository Operations", () => {
  beforeEach(() => {
    resetMemoryFallbackStores();
  });

  it("creates two ID-isolated sessions A and B with identical block-0 IDs and sorts summaries by updatedAt descending", async () => {
    const sessionA = createMockSession("sess-A", "Tài liệu A", 1);
    const sessionB = createMockSession("sess-B", "Tài liệu B", 1);

    // Initial state: no active session
    await createSession(sessionA.record, sessionA.summary, null);
    assert.equal(await getActiveSessionId(), "sess-A");

    // Make session B newer
    sessionB.record.updatedAt = new Date(Date.now() + 5000).toISOString();
    sessionB.summary.updatedAt = sessionB.record.updatedAt;

    // Create session B, flushing current session A
    await createSession(sessionB.record, sessionB.summary, "sess-A", {
      record: sessionA.record,
      expectedRevision: 1,
    });
    assert.equal(await getActiveSessionId(), "sess-B");

    // Verify A was flushed and incremented
    const loadedA = await loadSession("sess-A");
    assert.ok(loadedA);
    assert.equal(loadedA.revision, 2);
    assert.equal(loadedA.reviewBlocks?.[0].text, "Khối đầu tiên của Tài liệu A");

    // Verify B is independent
    const loadedB = await loadSession("sess-B");
    assert.ok(loadedB);
    assert.equal(loadedB.revision, 1);
    assert.equal(loadedB.reviewBlocks?.[0].text, "Khối đầu tiên của Tài liệu B");

    // Both have block-0, but they are isolated per session
    assert.equal(loadedA.reviewBlocks?.[0].id, "block-0");
    assert.equal(loadedB.reviewBlocks?.[0].id, "block-0");

    // listSessions returns newest first (B then A)
    const list = await listSessions();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, "sess-B");
    assert.equal(list[1].id, "sess-A");
  });

  it("saveSession validates expectedRevision and throws SessionRevisionConflictError on mismatch", async () => {
    const sessionA = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(sessionA.record, sessionA.summary, null);

    // Save with correct expectedRevision 1 -> increments to 2
    const updated = await saveSession(sessionA.record, 1);
    assert.equal(updated.revision, 2);

    const reloaded = await loadSession("sess-A");
    assert.equal(reloaded?.revision, 2);

    // Stale save with expectedRevision 1 must throw conflict
    await assert.rejects(
      async () => {
        await saveSession(sessionA.record, 1);
      },
      (err: any) => {
        assert.ok(err instanceof SessionRevisionConflictError);
        assert.equal(err.expectedRevision, 1);
        assert.equal(err.actualRevision, 2);
        return true;
      }
    );
  });

  it("activateSession checks expectedActiveSessionId, flushes current session, and updates active pointer atomically", async () => {
    const sessionA = createMockSession("sess-A", "Tài liệu A", 1);
    const sessionB = createMockSession("sess-B", "Tài liệu B", 1);

    await createSession(sessionA.record, sessionA.summary, null);
    await createSession(sessionB.record, sessionB.summary, "sess-A");
    assert.equal(await getActiveSessionId(), "sess-B");

    // Attempt activate with stale expected active pointer throws ActiveSessionMismatchError
    await assert.rejects(
      async () => {
        await activateSession("sess-A", "sess-WRONG");
      },
      (err: any) => {
        assert.ok(err instanceof ActiveSessionMismatchError);
        assert.equal(err.expected, "sess-WRONG");
        assert.equal(err.actual, "sess-B");
        return true;
      }
    );

    // Activating nonexistent session throws SessionNotFoundError
    await assert.rejects(
      async () => {
        await activateSession("nonexistent-id", "sess-B");
      },
      (err: any) => {
        assert.ok(err instanceof SessionNotFoundError);
        return true;
      }
    );

    // Successful activation with current flush
    const loadedTarget = await activateSession("sess-A", "sess-B", {
      record: sessionB.record,
      expectedRevision: 1,
    });

    assert.equal(loadedTarget.id, "sess-A");
    assert.equal(await getActiveSessionId(), "sess-A");

    // Verify B was flushed to revision 2
    const reloadedB = await loadSession("sess-B");
    assert.equal(reloadedB?.revision, 2);
  });

  it("duplicateSession clones source session into new UUID and activates it in one transaction", async () => {
    const sessionA = createMockSession("sess-A", "Bản gốc", 1);
    await createSession(sessionA.record, sessionA.summary, null);

    const clonedSummary = await duplicateSession(
      "sess-A",
      "Bản sao chép của A",
      "sess-A",
      { record: sessionA.record, expectedRevision: 1 }
    );

    assert.ok(clonedSummary.id);
    assert.notEqual(clonedSummary.id, "sess-A");
    assert.equal(clonedSummary.title, "Bản sao chép của A");
    assert.equal(clonedSummary.revision, 1);
    assert.equal(await getActiveSessionId(), clonedSummary.id);

    // Verify cloned record in store
    const clonedRecord = await loadSession(clonedSummary.id);
    assert.ok(clonedRecord);
    assert.equal(clonedRecord.title, "Bản sao chép của A");
    assert.equal(clonedRecord.revision, 1);
    assert.equal(clonedRecord.reviewBlocks?.length, 1);

    // Verify source session A was flushed to revision 2 and remains unaltered in content
    const reloadedA = await loadSession("sess-A");
    assert.equal(reloadedA?.revision, 2);
    assert.equal(reloadedA?.title, "Bản gốc");
  });

  it("renameSession atomically updates title in summary and draft record, incrementing revision", async () => {
    const sessionA = createMockSession("sess-A", "Tên ban đầu", 1);
    await createSession(sessionA.record, sessionA.summary, null);

    const updatedSummary = await renameSession("sess-A", "Tên mới đã đổi", 1);
    assert.equal(updatedSummary.title, "Tên mới đã đổi");
    assert.equal(updatedSummary.revision, 2);

    const reloaded = await loadSession("sess-A");
    assert.equal(reloaded?.title, "Tên mới đã đổi");
    assert.equal(reloaded?.revision, 2);

    // Stale rename throws conflict
    await assert.rejects(
      async () => {
        await renameSession("sess-A", "Tên khác", 1);
      },
      (err: any) => err instanceof SessionRevisionConflictError
    );
  });

  it("archiveSession marks status archived, clears active pointer if open, and restoreArchivedSession unarchives it", async () => {
    const sessionA = createMockSession("sess-A", "Tài liệu lưu trữ", 1);
    await createSession(sessionA.record, sessionA.summary, null);
    assert.equal(await getActiveSessionId(), "sess-A");

    // Archive the open session
    await archiveSession("sess-A", 1);

    // Active pointer must be cleared (null)
    assert.equal(await getActiveSessionId(), null);

    // listSessions(false) excludes archived session
    const activeList = await listSessions(false);
    assert.equal(activeList.length, 0);

    // listSessions(true) includes archived session
    const fullList = await listSessions(true);
    assert.equal(fullList.length, 1);
    assert.equal(fullList[0].status, "archived");
    assert.equal(fullList[0].revision, 2);

    // Restore archived session
    await restoreArchivedSession("sess-A");

    const restoredList = await listSessions(false);
    assert.equal(restoredList.length, 1);
    assert.equal(restoredList[0].status, "active");
    assert.equal(restoredList[0].revision, 3);
  });

  it("createSession throws SessionAlreadyExistsError when session ID already exists", async () => {
    const sessionA = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(sessionA.record, sessionA.summary, null);

    await assert.rejects(
      async () => {
        await createSession(sessionA.record, sessionA.summary, "sess-A");
      },
      (err: any) => err instanceof SessionAlreadyExistsError
    );
  });

  it("loadSession throws SessionCorruptError if stored record has invalid schemaVersion or ID", async () => {
    const sessionA = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(sessionA.record, sessionA.summary, null);

    // Intentionally corrupt schemaVersion in store
    const raw: any = await loadSession("sess-A");
    raw.schemaVersion = 99; // invalid
    getMemoryFallbackDrafts().set("sess-A", raw);

    await assert.rejects(
      async () => {
        await loadSession("sess-A");
      },
      (err: any) => err instanceof SessionCorruptError
    );
  });

  it("saveSession rejects and makes no writes when transaction aborts", async () => {
    let aborted = false;
    const session = createMockSession("sess-abort", "Bị abort", 1);
    const fakeDb: any = {
      transaction() {
        const tx: any = {
          error: new Error("QuotaExceededError: Synthetic storage quota reached"),
          oncomplete: null,
          onabort: null,
          onerror: null,
          abort() {
            if (!aborted) {
              aborted = true;
              queueMicrotask(() => tx.onabort?.());
            }
          },
          objectStore(storeName: string) {
            return {
              get() {
                const req: any = {
                  result: structuredClone(storeName === "drafts" ? session.record : session.summary),
                };
                queueMicrotask(() => req.onsuccess?.());
                return req;
              },
              put() {
                const req: any = {};
                queueMicrotask(() => {
                  req.onsuccess?.();
                  setTimeout(() => {
                    aborted = true;
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

    await assert.rejects(
      async () => {
        await saveSession(session.record, 1, fakeDb);
      },
      /QuotaExceededError/
    );
    assert.equal(aborted, true, "Transaction must have aborted");
  });

  it("F01: archiveSession with current on active session preserves unsaved edits", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const edited = structuredClone(a.record);
    edited.doc.bodyHtml = "<p>UNSAVED CONTENT</p>";

    await archiveSession("sess-A", 1, { record: edited, expectedRevision: 1 });

    const loaded = await loadSession("sess-A");
    assert.ok(loaded);
    assert.equal(loaded.doc.bodyHtml, "<p>UNSAVED CONTENT</p>", "Must preserve unsaved edits in archived record");
    assert.equal(loaded.revision, 2);
    assert.equal(await getActiveSessionId(), null, "Active pointer must be cleared");

    const fullList = await listSessions(true);
    const summaryA = fullList.find((s) => s.id === "sess-A");
    assert.ok(summaryA);
    assert.equal(summaryA.status, "archived");
    assert.equal(summaryA.revision, 2);
  });

  it("F03: duplicateSession with missing source throws SessionNotFoundError and does not mutate current flush", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const edited = structuredClone(a.record);
    edited.doc.bodyHtml = "<p>UNSAVED EDITS</p>";

    await assert.rejects(
      async () => {
        await duplicateSession("NONEXISTENT", "Copy", "sess-A", {
          record: edited,
          expectedRevision: 1,
        });
      },
      (err: any) => err instanceof SessionNotFoundError
    );

    // Verify session A was NOT changed: revision must remain 1, body must remain original
    const loaded = await loadSession("sess-A");
    assert.ok(loaded);
    assert.equal(loaded.revision, 1, "A revision must remain 1 after duplicate failure");
    assert.equal(loaded.doc.bodyHtml, "<p>Nội dung tài liệu Tài liệu A</p>", "A content must remain original");
  });

  it("F03: createSession with uncloneable seed rolls back and leaves current session untouched", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const b = createMockSession("sess-B", "Tài liệu B", 1);
    (b.record as any).uncloneable = () => {};

    await assert.rejects(
      async () => {
        await createSession(b.record, b.summary, "sess-A", {
          record: a.record,
          expectedRevision: 1,
        });
      }
    );

    // Verify session A remains revision 1
    const loaded = await loadSession("sess-A");
    assert.ok(loaded);
    assert.equal(loaded.revision, 1);
    assert.equal(await getActiveSessionId(), "sess-A");
  });

  it("F05: flush updates summary regime when switching from state to party", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const b = createMockSession("sess-B", "Tài liệu B", 1);
    const editedParty = structuredClone(a.record);
    editedParty.standardType = "party";
    editedParty.doc.nationalHeader1 = "ĐẢNG CỘNG SẢN VIỆT NAM";
    editedParty.doc.nationalHeader2 = "";

    await createSession(b.record, b.summary, "sess-A", {
      record: editedParty,
      expectedRevision: 1,
    });

    const sessions = await listSessions(false);
    const summaryA = sessions.find((s) => s.id === "sess-A");
    assert.ok(summaryA);
    assert.equal(summaryA.standardType, "party", "Summary standardType must be updated to party");
  });

  it("R01: archiveSession with invalid current (missing workflow) rejects and leaves session intact", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const corruptCurrent = structuredClone(a.record);
    delete (corruptCurrent as any).workflow;

    await assert.rejects(
      async () => {
        await archiveSession("sess-A", 1, {
          record: corruptCurrent,
          expectedRevision: 1,
        });
      },
      (err: any) => err instanceof SessionCorruptError
    );

    const loaded = await loadSession("sess-A");
    assert.ok(loaded);
    assert.equal(loaded.revision, 1);
    assert.ok(loaded.workflow, "Original workflow must remain intact");
  });

  it("R03: saving session with cleared source sets sourceKind to unknown and removes sourceFileName", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    a.record.originalSnapshot = {
      sourceType: "uploaded_file",
      fileName: "test.docx",
      sourceHash: "dummy",
      uploadedAt: a.record.updatedAt,
      bodyHtml: a.record.doc.bodyHtml,
    };
    a.record.uploadedFileName = "test.docx";
    a.summary.sourceKind = "uploaded_file";
    a.summary.sourceFileName = "test.docx";

    await createSession(a.record, a.summary, null);

    const cleared = structuredClone(a.record);
    cleared.originalSnapshot = null;
    cleared.uploadedFileName = "";

    await saveSession(cleared, 1);

    const sessions = await listSessions(false);
    const summary = sessions.find((s) => s.id === "sess-A");
    assert.ok(summary);
    assert.equal(summary.sourceKind, "unknown");
    assert.equal(summary.sourceFileName, undefined);
  });

  it("R01: archiveSession with current missing doc.orgHeader2 rejects and leaves session intact", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const corruptCurrent = structuredClone(a.record);
    delete (corruptCurrent.doc as any).orgHeader2;

    await assert.rejects(
      async () => {
        await archiveSession("sess-A", 1, {
          record: corruptCurrent,
          expectedRevision: 1,
        });
      },
      (err: any) => err instanceof SessionCorruptError
    );

    const loaded = await loadSession("sess-A");
    assert.ok(loaded);
    assert.equal(loaded.revision, 1);
    assert.equal(loaded.doc.orgHeader2, "CƠ QUAN BAN HÀNH");

    const sessions = await listSessions(false);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].status, "active");
    assert.equal(sessions[0].revision, 1);

    const activeId = await getActiveSessionId();
    assert.equal(activeId, "sess-A");
  });

  it("R01: activateSession with current missing doc.orgHeader2 rejects and preserves state", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);

    const b = createMockSession("sess-B", "Tài liệu B", 1);
    await createSession(b.record, b.summary, "sess-A");

    // Active session is sess-B
    assert.equal(await getActiveSessionId(), "sess-B");

    const corruptCurrent = structuredClone(b.record);
    delete (corruptCurrent.doc as any).orgHeader2;

    await assert.rejects(
      async () => {
        await activateSession("sess-A", "sess-B", {
          record: corruptCurrent,
          expectedRevision: 1,
        });
      },
      (err: any) => err instanceof SessionCorruptError
    );

    // Assert neither session was modified
    const loadedA = await loadSession("sess-A");
    assert.equal(loadedA?.revision, 1);
    const loadedB = await loadSession("sess-B");
    assert.equal(loadedB?.revision, 1);
    assert.equal(loadedB?.doc.orgHeader2, "CƠ QUAN BAN HÀNH");

    const activeId = await getActiveSessionId();
    assert.equal(activeId, "sess-B");
  });

  it("createSession rejects when summary has mismatched revision, standardType, or source", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);

    // 1. Mismatched revision (summary revision 99 vs seed revision 1)
    const badSummaryRev = { ...a.summary, revision: 99 };
    await assert.rejects(
      async () => {
        await createSession(a.record, badSummaryRev, null);
      },
      (err: any) => err instanceof SessionCorruptError
    );
    assert.equal(await loadSession("sess-A"), null);
    assert.equal(await getActiveSessionId(), null);

    // 2. Mismatched standardType (summary party vs seed state)
    const badSummaryRegime = { ...a.summary, standardType: "party" as const };
    await assert.rejects(
      async () => {
        await createSession(a.record, badSummaryRegime, null);
      },
      (err: any) => err instanceof SessionCorruptError
    );
    assert.equal(await loadSession("sess-A"), null);
    assert.equal(await getActiveSessionId(), null);

    // 3. Mismatched sourceKind (seed has uploaded_file, summary claims unknown)
    const badSummarySource = { ...a.summary, sourceKind: "unknown" as const, sourceFileName: undefined };
    await assert.rejects(
      async () => {
        await createSession(a.record, badSummarySource, null);
      },
      (err: any) => err instanceof SessionCorruptError
    );
    assert.equal(await loadSession("sess-A"), null);
    assert.equal(await getActiveSessionId(), null);
  });

  it("restoreArchivedSession on corrupt record (missing orgHeader2) is atomic and preserves state", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);
    await archiveSession("sess-A", 1);

    // Snapshot before corruption and failed restore
    const memDrafts = getMemoryFallbackDrafts();
    const targetDraft = memDrafts.get("sess-A")!;
    assert.ok(targetDraft);
    // Artificially corrupt the archived record in storage
    delete (targetDraft.doc as any).orgHeader2;

    const snapDraft = structuredClone(targetDraft);
    const snapSummary = structuredClone((await listSessions(true)).find((s) => s.id === "sess-A")!);
    const snapActive = await getActiveSessionId();

    await assert.rejects(
      async () => {
        await restoreArchivedSession("sess-A");
      },
      (err: any) => err instanceof SessionCorruptError
    );

    // Assert that targetDraft in Map was not mutated (revision was not bumped, updatedAt not changed)
    const actualDraft = memDrafts.get("sess-A");
    assert.deepEqual(actualDraft, snapDraft, "Draft in memory must remain completely unaltered after failure");

    const actualSummary = (await listSessions(true)).find((s) => s.id === "sess-A");
    assert.deepEqual(actualSummary, snapSummary, "Summary in session_index must remain archived and unchanged");

    const actualActive = await getActiveSessionId();
    assert.equal(actualActive, snapActive, "Active pointer must remain unchanged");
  });

  it("restoreArchivedSession on corrupt workflow is atomic and preserves state", async () => {
    const a = createMockSession("sess-A", "Tài liệu A", 1);
    await createSession(a.record, a.summary, null);
    await archiveSession("sess-A", 1);

    const memDrafts = getMemoryFallbackDrafts();
    const targetDraft = memDrafts.get("sess-A") as unknown as DocumentSessionRecord;
    targetDraft.workflow.partitionProposals = [null as any];

    const snapDraft = structuredClone(targetDraft);
    const snapSummary = structuredClone((await listSessions(true)).find((s) => s.id === "sess-A")!);

    await assert.rejects(
      async () => {
        await restoreArchivedSession("sess-A");
      },
      (err: any) => err instanceof SessionCorruptError
    );

    assert.deepEqual(memDrafts.get("sess-A"), snapDraft);
    assert.deepEqual((await listSessions(true)).find((s) => s.id === "sess-A"), snapSummary);
  });

  it("loadSession rejects record containing partitionProposals with null, bad enum, or wrong coordinate type", async () => {
    const memDrafts = getMemoryFallbackDrafts();

    // 1. null element
    const a1 = createMockSession("sess-1", "Doc 1", 1);
    a1.record.workflow.partitionProposals = [null as any];
    memDrafts.set("sess-1", a1.record as any);
    await assert.rejects(async () => loadSession("sess-1"), (err: any) => err instanceof SessionCorruptError);

    // 2. bad enum
    const a2 = createMockSession("sess-2", "Doc 2", 1);
    a2.record.workflow.partitionProposals = [
      {
        sourceBlockId: "block-0",
        currentRole: "header",
        suggestedRole: "INVALID_ROLE" as any,
        exactQuote: "quote",
        reason: "reason",
        confidence: "high",
        status: "pending",
        regime: "administrative",
      },
    ];
    memDrafts.set("sess-2", a2.record as any);
    await assert.rejects(async () => loadSession("sess-2"), (err: any) => err instanceof SessionCorruptError);

    // 3. negative coordinate
    const a3 = createMockSession("sess-3", "Doc 3", 1);
    a3.record.workflow.partitionProposals = [
      {
        sourceBlockId: "block-0",
        currentRole: "header",
        suggestedRole: "body",
        exactQuote: "quote",
        reason: "reason",
        confidence: "high",
        status: "pending",
        regime: "administrative",
        cellLocation: { rowIndex: -1, colIndex: 0 },
      },
    ];
    memDrafts.set("sess-3", a3.record as any);
    await assert.rejects(async () => loadSession("sess-3"), (err: any) => err instanceof SessionCorruptError);

    // 4. non-integer coordinate
    const a4 = createMockSession("sess-4", "Doc 4", 1);
    a4.record.workflow.partitionProposals = [
      {
        sourceBlockId: "block-0",
        currentRole: "header",
        suggestedRole: "body",
        exactQuote: "quote",
        reason: "reason",
        confidence: "high",
        status: "pending",
        regime: "administrative",
        cellLocation: { rowIndex: 1.5, colIndex: 0 },
      },
    ];
    memDrafts.set("sess-4", a4.record as any);
    await assert.rejects(async () => loadSession("sess-4"), (err: any) => err instanceof SessionCorruptError);
  });

  it("loadSession rejects record containing reviewProposals with null, bad type enum, or wrong coordinate type", async () => {
    const memDrafts = getMemoryFallbackDrafts();

    // 1. null element
    const a1 = createMockSession("sess-r1", "Doc R1", 1);
    a1.record.workflow.reviewProposals = [null as any];
    memDrafts.set("sess-r1", a1.record as any);
    await assert.rejects(async () => loadSession("sess-r1"), (err: any) => err instanceof SessionCorruptError);

    // 2. bad type enum
    const a2 = createMockSession("sess-r2", "Doc R2", 1);
    a2.record.workflow.reviewProposals = [
      {
        id: "rev-1",
        type: "INVALID_TYPE" as any,
        target: "body",
        original: "orig",
        suggested: "sugg",
        reason: "reason",
        confidence: "high",
      },
    ];
    memDrafts.set("sess-r2", a2.record as any);
    await assert.rejects(async () => loadSession("sess-r2"), (err: any) => err instanceof SessionCorruptError);

    // 3. negative coordinate
    const a3 = createMockSession("sess-r3", "Doc R3", 1);
    a3.record.workflow.reviewProposals = [
      {
        id: "rev-2",
        type: "format",
        target: "body",
        original: "orig",
        suggested: "sugg",
        reason: "reason",
        confidence: "high",
        cellIndex: { row: 0, col: -1 },
      },
    ];
    memDrafts.set("sess-r3", a3.record as any);
    await assert.rejects(async () => loadSession("sess-r3"), (err: any) => err instanceof SessionCorruptError);
  });

  it("loadSession rejects record with non-string elements in userModifiedBlockIds, verifiedPartitionProposalIds, acceptedProposalIds", async () => {
    const memDrafts = getMemoryFallbackDrafts();

    const a1 = createMockSession("sess-id1", "Doc ID1", 1);
    a1.record.workflow.userModifiedBlockIds = [123 as any];
    memDrafts.set("sess-id1", a1.record as any);
    await assert.rejects(async () => loadSession("sess-id1"), (err: any) => err instanceof SessionCorruptError);

    const a2 = createMockSession("sess-id2", "Doc ID2", 1);
    a2.record.workflow.verifiedPartitionProposalIds = [null as any];
    memDrafts.set("sess-id2", a2.record as any);
    await assert.rejects(async () => loadSession("sess-id2"), (err: any) => err instanceof SessionCorruptError);

    const a3 = createMockSession("sess-id3", "Doc ID3", 1);
    a3.record.workflow.acceptedProposalIds = ["" as any];
    memDrafts.set("sess-id3", a3.record as any);
    await assert.rejects(async () => loadSession("sess-id3"), (err: any) => err instanceof SessionCorruptError);
  });

  it("isDocumentSessionSummaryValid rejects non-string sourceFileName and isSummaryConsistentWithRecord is type-safe", () => {
    const a = createMockSession("sess-test", "Doc Test", 1);

    const badSummaryNum = { ...a.summary, sourceFileName: 12345 as any };
    assert.equal(isDocumentSessionSummaryValid(badSummaryNum), false);

    // isSummaryConsistentWithRecord must return false safely without throwing TypeError
    assert.doesNotThrow(() => {
      const res = isSummaryConsistentWithRecord(badSummaryNum, a.record);
      assert.equal(res, false);
    });
  });

  it("S04: memory store operates on detached clones across create, load, list, save", async () => {
    const a = createMockSession("sess-detach", "Doc Detach", 1);
    await createSession(a.record, a.summary, null);

    // Mutating input must not affect store
    a.record.doc.bodyHtml = "<p>UNSAVED MUTATION</p>";
    const loaded1 = await loadSession("sess-detach");
    assert.notEqual(loaded1?.doc.bodyHtml, "<p>UNSAVED MUTATION</p>");

    // Mutating loaded object must not affect store
    loaded1!.doc.bodyHtml = "<p>ANOTHER MUTATION</p>";
    const loaded2 = await loadSession("sess-detach");
    assert.notEqual(loaded2?.doc.bodyHtml, "<p>ANOTHER MUTATION</p>");

    // Mutating save output must not affect store
    const saved = await saveSession(structuredClone(loaded2!), 1);
    saved.doc.bodyHtml = "<p>SAVED MUTATION</p>";
    const loaded3 = await loadSession("sess-detach");
    assert.notEqual(loaded3?.doc.bodyHtml, "<p>SAVED MUTATION</p>");

    // Mutating list output must not affect store
    const list = await listSessions(true);
    list[0].status = "archived";
    const list2 = await listSessions(true);
    assert.equal(list2[0].status, "active");
  });

  it("S05: activateSession on current session returns committed flushed record", async () => {
    const a = createMockSession("sess-self", "Doc Self", 1);
    await createSession(a.record, a.summary, null);

    const edited = structuredClone(a.record);
    edited.doc.bodyHtml = "<p>NEW EDITED SELF</p>";

    const returned = await activateSession("sess-self", "sess-self", {
      record: edited,
      expectedRevision: 1,
    });

    const stored = await loadSession("sess-self");
    assert.equal(returned.revision, 2);
    assert.equal(returned.revision, stored?.revision);
    assert.equal(returned.doc.bodyHtml, "<p>NEW EDITED SELF</p>");
    assert.equal(returned.doc.bodyHtml, stored?.doc.bodyHtml);
  });

  it("S06: create, activate, duplicate, archive reject when current does not match active session", async () => {
    const a = createMockSession("sess-a", "Doc A", 1);
    const b = createMockSession("sess-b", "Doc B", 1);
    const next = createMockSession("sess-c", "Doc C", 1);

    await createSession(a.record, a.summary, null);
    await createSession(b.record, b.summary, "sess-a");
    // After creating b, active is sess-b
    assert.equal(await getActiveSessionId(), "sess-b");

    // wrongCurrent claims to be sess-a when active is sess-b
    const wrongCurrentA = structuredClone(a.record);
    wrongCurrentA.doc.bodyHtml = "<p>WRONG A</p>";

    // createSession with wrong current
    await assert.rejects(
      async () => createSession(next.record, next.summary, "sess-b", {
        record: wrongCurrentA,
        expectedRevision: 1,
      }),
      (err: any) => err instanceof ActiveSessionMismatchError
    );

    // activateSession with wrong current
    await assert.rejects(
      async () => activateSession("sess-a", "sess-b", {
        record: wrongCurrentA,
        expectedRevision: 1,
      }),
      (err: any) => err instanceof ActiveSessionMismatchError
    );

    // duplicateSession with wrong current
    await assert.rejects(
      async () => duplicateSession("sess-b", "sess-b-copy", "sess-b", {
        record: wrongCurrentA,
        expectedRevision: 1,
      }),
      (err: any) => err instanceof ActiveSessionMismatchError
    );

    // archiveSession with wrong current
    await assert.rejects(
      async () => archiveSession("sess-a", 1, {
        record: wrongCurrentA,
        expectedRevision: 1,
      }),
      (err: any) => err instanceof ActiveSessionMismatchError
    );
  });

  it("S08: saveSession rejects unsafe integer revisions", async () => {
    const a = createMockSession("sess-unsafe", "Doc Unsafe", 2 ** 53);
    await assert.rejects(
      async () => createSession(a.record, a.summary, null),
      (err: any) => err instanceof SessionCorruptError
    );
  });

  it("S02: loadSession and renameSession reject records with malformed source filename", async () => {
    const a = createMockSession("sess-malformed-meta", "Doc Meta", 1);
    a.record.originalSnapshot = {
      sourceType: "uploaded_file",
      fileName: 12345 as any,
      uploadedAt: a.record.updatedAt,
      bodyHtml: a.record.doc.bodyHtml,
    };
    const memDrafts = getMemoryFallbackDrafts();
    memDrafts.set("sess-malformed-meta", a.record as any);
    memoryFallbackSessionIndex.set("sess-malformed-meta", a.summary);

    await assert.rejects(
      async () => loadSession("sess-malformed-meta"),
      (err: any) => err instanceof SessionCorruptError
    );

    await assert.rejects(
      async () => renameSession("sess-malformed-meta", "New Name", 1),
      (err: any) => err instanceof SessionCorruptError
    );
  });

  it("S09: isPartitionProposalValid strictly enforces componentGroupIndex domain 1..9", () => {
    const proposal = {
      id: "p1",
      sourceBlockId: "block-0",
      currentRole: "body" as const,
      suggestedRole: "body" as const,
      exactQuote: "Synthetic",
      reason: "",
      confidence: "high" as const,
      status: "pending" as const,
      regime: "administrative" as const,
    };

    const testValues = [-1, 0, 1, 5, 9, 10, 3.5, NaN, Infinity];
    const accepted = testValues.filter(n =>
      isPartitionProposalValid({ ...proposal, componentGroupIndex: n })
    );

    assert.deepEqual(accepted, [1, 5, 9]);
  });

  it("C02: create-with-uncloneable-summary-keeps-all-stores-unchanged leaves all stores and active pointer unchanged on failure", async () => {
    const a = createMockSession("A", "Doc A", 1);
    await createSession(a.record, a.summary, null);

    const edited = structuredClone(a.record);
    edited.doc.bodyHtml = "<p>UNSAVED A</p>";

    const b = createMockSession("B", "Doc B", 1);
    (b.summary as any).uncloneable = () => {};

    const memDrafts = getMemoryFallbackDrafts();
    const snapshotBefore = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
    };

    let error: any;
    try {
      await createSession(b.record, b.summary, "A", { record: edited, expectedRevision: 1 });
    } catch (e: any) {
      error = e;
    }

    assert.ok(error, "Expected an error (e.g. DataCloneError)");

    const snapshotAfter = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
    };

    assert.deepEqual(snapshotAfter, snapshotBefore, "Stores must be unchanged when clone fails");
    const actualA = await loadSession("A");
    assert.equal(actualA?.revision, 1);
    assert.equal(actualA?.doc.bodyHtml, "<p>Nội dung tài liệu Doc A</p>");
    assert.equal(await getActiveSessionId(), "A");
  });

  it("C03: empty-snapshot-filename-falls-back-consistently derives source metadata identically in builder and pair checker", async () => {
    // 1. snapshot.fileName="" and uploadedFileName="A.docx" -> "A.docx"
    const a1 = createMockSession("A1", "Doc A1", 1);
    a1.record.originalSnapshot = {
      sourceType: "uploaded_file",
      fileName: "",
      uploadedAt: a1.record.updatedAt,
      bodyHtml: a1.record.doc.bodyHtml,
    };
    a1.record.uploadedFileName = "A.docx";
    const s1 = buildSummaryFromRecord(a1.record);
    assert.equal(s1.sourceFileName, "A.docx");
    assert.equal(isSummaryConsistentWithRecord(s1, a1.record), true);
    await assert.doesNotReject(async () => createSession(a1.record, s1, null));

    // 2. snapshot.fileName="   " and uploadedFileName="A.docx" -> "A.docx"
    const a2 = createMockSession("A2", "Doc A2", 1);
    a2.record.originalSnapshot = {
      sourceType: "uploaded_file",
      fileName: "   ",
      uploadedAt: a2.record.updatedAt,
      bodyHtml: a2.record.doc.bodyHtml,
    };
    a2.record.uploadedFileName = "A.docx";
    const s2 = buildSummaryFromRecord(a2.record);
    assert.equal(s2.sourceFileName, "A.docx");
    assert.equal(isSummaryConsistentWithRecord(s2, a2.record), true);

    // 3. snapshot.fileName="B.docx" and uploadedFileName="A.docx" -> "B.docx"
    const a3 = createMockSession("A3", "Doc A3", 1);
    a3.record.originalSnapshot = {
      sourceType: "uploaded_file",
      fileName: "B.docx",
      uploadedAt: a3.record.updatedAt,
      bodyHtml: a3.record.doc.bodyHtml,
    };
    a3.record.uploadedFileName = "A.docx";
    const s3 = buildSummaryFromRecord(a3.record);
    assert.equal(s3.sourceFileName, "B.docx");
    assert.equal(isSummaryConsistentWithRecord(s3, a3.record), true);

    // 4. both empty -> undefined
    const a4 = createMockSession("A4", "Doc A4", 1);
    a4.record.originalSnapshot = {
      sourceType: "uploaded_file",
      fileName: "",
      uploadedAt: a4.record.updatedAt,
      bodyHtml: a4.record.doc.bodyHtml,
    };
    a4.record.uploadedFileName = "";
    const s4 = buildSummaryFromRecord(a4.record);
    assert.equal(s4.sourceFileName, undefined);
    assert.equal(isSummaryConsistentWithRecord(s4, a4.record), true);

    // 5. system_template even with old uploadedFileName -> sourceKind = system_template, no filename
    const a5 = createMockSession("A5", "Doc A5", 1);
    a5.record.originalSnapshot = {
      sourceType: "system_template",
      uploadedAt: a5.record.updatedAt,
      bodyHtml: a5.record.doc.bodyHtml,
    };
    a5.record.uploadedFileName = "OldUpload.docx";
    const s5 = buildSummaryFromRecord(a5.record);
    assert.equal(s5.sourceKind, "system_template");
    assert.equal(s5.sourceFileName, undefined);
    assert.equal(isSummaryConsistentWithRecord(s5, a5.record), true);
  });

  it("C04: v3-shape-validation-must-not-be-loosened strictly rejects non-canonical v3 records", async () => {
    const memDrafts = getMemoryFallbackDrafts();

    // 1. Version missing sourceGeneration
    const r1 = createMockSession("var-no-gen", "Doc", 1).record;
    r1.versions = [
      {
        id: "v1",
        timestamp: r1.updatedAt,
        title: "V1",
        standardType: "state",
        data: r1.doc,
      } as any,
    ];
    memDrafts.set("var-no-gen", r1 as any);
    await assert.rejects(async () => loadSession("var-no-gen"), (err: any) => err instanceof SessionCorruptError);

    // 2. Version using legacy aliases name/doc instead of title/data
    const r2 = createMockSession("var-aliases", "Doc", 1).record;
    r2.versions = [
      {
        id: "v1",
        timestamp: r2.updatedAt,
        name: "V1",
        standardType: "state",
        sourceGeneration: 1,
        doc: r2.doc,
      } as any,
    ];
    memDrafts.set("var-aliases", r2 as any);
    await assert.rejects(async () => loadSession("var-aliases"), (err: any) => err instanceof SessionCorruptError);

    // 3. reviewBlocks has element with only id
    const r3 = createMockSession("var-bad-block", "Doc", 1).record;
    r3.reviewBlocks = [{ id: "block-0" } as any];
    memDrafts.set("var-bad-block", r3 as any);
    await assert.rejects(async () => loadSession("var-bad-block"), (err: any) => err instanceof SessionCorruptError);

    // 4. structuredImport is array
    const r4 = createMockSession("var-arr-import", "Doc", 1).record;
    r4.structuredImport = [] as any;
    memDrafts.set("var-arr-import", r4 as any);
    await assert.rejects(async () => loadSession("var-arr-import"), (err: any) => err instanceof SessionCorruptError);

    // 5. uploadedFileType is number
    const r5 = createMockSession("var-bad-type", "Doc", 1).record;
    r5.uploadedFileType = 123 as any;
    memDrafts.set("var-bad-type", r5 as any);
    await assert.rejects(async () => loadSession("var-bad-type"), (err: any) => err instanceof SessionCorruptError);
  });

  it("D02: reject-invalid-nested-v3-fields rejects bad role enum and bad field structure", async () => {
    const memDrafts = getMemoryFallbackDrafts();

    // 1. Invalid SourceBlock.role
    const badRole = createMockSession("bad-role", "Doc", 1).record;
    badRole.reviewBlocks = [
      { id: "block-0", index: 0, kind: "paragraph", text: "TEXT", role: "nonexistent-region" as any },
    ];
    memDrafts.set("bad-role", badRole as any);
    await assert.rejects(async () => loadSession("bad-role"), (err: any) => err instanceof SessionCorruptError);

    // 2. Invalid StructuredImport.fields
    const badField = createMockSession("bad-field", "Doc", 1).record;
    badField.structuredImport = {
      source: { filename: "A.docx", type: "docx", blockCount: 0 },
      fields: { subject: 123 as any },
      body: { html: "", sourceBlockIds: [] },
      appendices: [],
      unclassified: [],
      order: [],
    };
    memDrafts.set("bad-field", badField as any);
    await assert.rejects(async () => loadSession("bad-field"), (err: any) => err instanceof SessionCorruptError);
  });
});
