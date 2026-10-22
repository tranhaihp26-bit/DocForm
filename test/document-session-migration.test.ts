import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  migrateLegacyDraft,
} from "../src/utils/documentSessionMigration.ts";
import {
  DEFAULT_DRAFT_ID,
  getMemoryFallbackDrafts,
  getMemoryFallbackSourceBlobs,
  type DraftRecord,
} from "../src/utils/draftStore.ts";
import {
  LEGACY_SESSION_ID,
  META_ACTIVE_SESSION_ID,
  META_LEGACY_MIGRATION,
  SessionCorruptError,
  buildSummaryFromRecord,
} from "../src/utils/documentSessionTypes.ts";
import {
  loadSession,
  listSessions,
  getActiveSessionId,
  resetMemoryFallbackStores,
  memoryFallbackAppMeta,
  memoryFallbackSessionIndex,
} from "../src/utils/documentSessionStore.ts";
import type { DocumentState } from "../src/shared/schemas/document.schema.ts";

function createSyntheticDoc(subject: string): DocumentState {
  return {
    orgHeader1: "CƠ QUAN CHỦ QUẢN",
    orgHeader2: "CƠ QUAN BAN HÀNH",
    nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
    nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
    locationAndDate: "Hà Nội, ngày 19 tháng 10 năm 2026",
    documentType: "KẾ HOẠCH",
    referenceNumber: "Số: 10/KH-CQ",
    subject,
    bodyHtml: "<p>Nội dung thử nghiệm kế hoạch công tác tổng hợp.</p>",
    signTitle: "THỦ TRƯỞNG",
    signName: "Nguyễn Văn A",
    recipients: "Như Điều 1",
  };
}

describe("Task 1: Document Session Migration", () => {
  beforeEach(() => {
    resetMemoryFallbackStores();
  });

  it("returns nothing_to_migrate when legacy draft does not exist and creates no sessions", async () => {
    const result = await migrateLegacyDraft();
    assert.equal(result.status, "nothing_to_migrate");
    assert.equal(result.sessionId, undefined);

    const sessions = await listSessions();
    assert.equal(sessions.length, 0, "Must not create any dummy session");

    const activeId = await getActiveSessionId();
    assert.equal(activeId, null, "Must not set active session pointer");
  });

  it("migrates v2 current_active_draft to deterministic legacy session ID with schemaVersion 3 and active pointer", async () => {
    const doc = createSyntheticDoc("Kế hoạch kiểm tra an toàn 2026");
    const syntheticLegacy: DraftRecord = {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      updatedAt: "2026-10-18T10:00:00.000Z",
      standardType: "state",
      doc,
      versions: [
        {
          id: "v-1",
          timestamp: "2026-10-18T09:00:00.000Z",
          title: "Bản thảo ban đầu",
          data: doc,
          standardType: "state",
        },
      ],
      originalSnapshot: {
        sourceType: "uploaded_file",
        fileName: "ke_hoach_goc.docx",
        fileType: "docx",
        sourceId: "src-1",
        sourceHash: "abc123def456",
        uploadedAt: "2026-10-18T08:55:00.000Z",
        bodyHtml: "<p>Nội dung thô</p>",
      },
      uploadedFileName: "ke_hoach_goc.docx",
      uploadedFileType: "docx",
    };

    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, syntheticLegacy);

    const result = await migrateLegacyDraft();
    assert.equal(result.status, "migrated");
    assert.equal(result.sessionId, LEGACY_SESSION_ID);

    // Verify session record
    const sessionRecord = await loadSession(LEGACY_SESSION_ID);
    assert.ok(sessionRecord, "Migrated session record must exist");
    assert.equal(sessionRecord.schemaVersion, 3);
    assert.equal(sessionRecord.id, LEGACY_SESSION_ID);
    assert.equal(sessionRecord.revision, 1);
    assert.equal(sessionRecord.sourceGeneration, 1);
    assert.equal(sessionRecord.standardType, "state");
    assert.equal(sessionRecord.doc.subject, "Kế hoạch kiểm tra an toàn 2026");
    assert.equal(sessionRecord.versions.length, 1);
    assert.equal(sessionRecord.versions[0].sourceGeneration, 1);
    assert.equal(sessionRecord.originalSnapshot?.fileName, "ke_hoach_goc.docx");
    assert.equal(sessionRecord.originalSnapshot?.sourceHash, "abc123def456");

    // Verify workflow defaults
    assert.deepEqual(sessionRecord.workflow, {
      importReviewAccepted: false,
      userModifiedBlockIds: [],
      partitionProposals: [],
      verifiedPartitionProposalIds: [],
      reviewProposals: [],
      acceptedProposalIds: [],
    });

    // Verify summary in session_index
    const sessions = await listSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, LEGACY_SESSION_ID);
    assert.equal(sessions[0].title, "Kế hoạch kiểm tra an toàn 2026");
    assert.equal(sessions[0].status, "active");
    assert.equal(sessions[0].sourceKind, "uploaded_file");
    assert.equal(sessions[0].sourceFileName, "ke_hoach_goc.docx");
    assert.equal(sessions[0].revision, 1);

    // Verify active pointer in app_meta
    const activeId = await getActiveSessionId();
    assert.equal(activeId, LEGACY_SESSION_ID);

    // Verify legacy record is preserved unaltered
    const legacyStillThere = getMemoryFallbackDrafts().get(DEFAULT_DRAFT_ID);
    assert.ok(legacyStillThere, "Legacy current_active_draft must be preserved");
    assert.equal(legacyStillThere.schemaVersion, 2);
    assert.equal(legacyStillThere.id, DEFAULT_DRAFT_ID);
  });

  it("is idempotent: running migration twice returns already_migrated and does not increment revision or create duplicate sessions", async () => {
    const doc = createSyntheticDoc("Quyết định ban hành 2026");
    const syntheticLegacy: DraftRecord = {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      updatedAt: "2026-10-18T10:00:00.000Z",
      standardType: "state",
      doc,
      versions: [],
    };
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, syntheticLegacy);

    const firstRun = await migrateLegacyDraft();
    assert.equal(firstRun.status, "migrated");

    const recordAfterFirst = await loadSession(LEGACY_SESSION_ID);
    assert.equal(recordAfterFirst?.revision, 1);

    // Second run
    const secondRun = await migrateLegacyDraft();
    assert.equal(secondRun.status, "already_migrated");
    assert.equal(secondRun.sessionId, LEGACY_SESSION_ID);

    // Must still have exactly 1 session
    const sessions = await listSessions();
    assert.equal(sessions.length, 1);

    const recordAfterSecond = await loadSession(LEGACY_SESSION_ID);
    assert.equal(recordAfterSecond?.revision, 1, "Revision must not be incremented by duplicate migration run");
  });

  it("preserves source_blobs contents and handles shared bytes without mutation", async () => {
    const rawBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]).buffer;
    getMemoryFallbackSourceBlobs().set("sha256-test-hash", {
      hash: "sha256-test-hash",
      fileName: "original_test.docx",
      fileType: "docx",
      fileSize: rawBytes.byteLength,
      uploadedAt: "2026-10-19T08:00:00.000Z",
      bytes: rawBytes,
    });

    const doc = createSyntheticDoc("Văn bản bảo toàn bytes");
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      updatedAt: "2026-10-19T08:00:00.000Z",
      standardType: "state",
      doc,
      versions: [],
      originalSnapshot: {
        sourceType: "uploaded_file",
        fileName: "original_test.docx",
        sourceHash: "sha256-test-hash",
        uploadedAt: "2026-10-19T08:00:00.000Z",
        bodyHtml: "<p>Thử nghiệm</p>",
      },
    });

    await migrateLegacyDraft();

    // Verify source blob remains completely untouched
    const blob = getMemoryFallbackSourceBlobs().get("sha256-test-hash");
    assert.ok(blob, "Blob must still exist");
    assert.equal(blob.fileName, "original_test.docx");
    assert.equal(new Uint8Array(blob.bytes)[0], 0x50);
    assert.equal(new Uint8Array(blob.bytes)[1], 0x4b);
  });

  it("self-repairs from legacy draft when marker exists but session record is corrupted or missing", async () => {
    const doc = createSyntheticDoc("Văn bản phục hồi");
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      updatedAt: "2026-10-18T12:00:00.000Z",
      standardType: "state",
      doc,
      versions: [],
    });

    // Run first migration
    await migrateLegacyDraft();

    // Corrupt the migrated draft (e.g. accidentally deleted or corrupted schema)
    getMemoryFallbackDrafts().delete(LEGACY_SESSION_ID);

    // Marker still exists
    assert.ok(memoryFallbackAppMeta.has(META_LEGACY_MIGRATION));

    // Next migration should detect missing/corrupt record and repair from legacy
    const repairResult = await migrateLegacyDraft();
    assert.equal(repairResult.status, "repaired");
    assert.equal(repairResult.sessionId, LEGACY_SESSION_ID);

    const repairedRecord = await loadSession(LEGACY_SESSION_ID);
    assert.ok(repairedRecord, "Session must be repaired");
    assert.equal(repairedRecord.schemaVersion, 3);
    assert.equal(repairedRecord.doc.subject, "Văn bản phục hồi");
  });

  it("F02: when full record v3 is valid but summary is missing, rebuilds summary from v3 record and preserves newer edits", async () => {
    const doc = createSyntheticDoc("Văn bản gốc");
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      updatedAt: "2026-10-18T10:00:00.000Z",
      standardType: "state",
      doc,
      versions: [],
    });

    // 1. First migration
    await migrateLegacyDraft();

    // 2. User edits and saves the migrated session to revision 2 with newer content
    const session = await loadSession(LEGACY_SESSION_ID);
    assert.ok(session);
    session.doc.bodyHtml = "<p>NEWER SAVED</p>";
    session.doc.subject = "Văn bản đã sửa mới hơn";
    const { saveSession } = await import("../src/utils/documentSessionStore.ts");
    await saveSession(session, 1);

    const saved = await loadSession(LEGACY_SESSION_ID);
    assert.equal(saved?.revision, 2);
    assert.equal(saved?.doc.bodyHtml, "<p>NEWER SAVED</p>");
    assert.equal(saved?.title, "Văn bản gốc", "Session title remains independent of edited document subject");

    // 3. Simulate missing/deleted summary in session_index
    const { memoryFallbackSessionIndex } = await import("../src/utils/documentSessionStore.ts");
    memoryFallbackSessionIndex.delete(LEGACY_SESSION_ID);

    // 4. Re-run migration: must repair summary from the existing v3 record without overwriting from legacy
    const recovery = await migrateLegacyDraft();
    assert.equal(recovery.status, "repaired");

    const afterRecovery = await loadSession(LEGACY_SESSION_ID);
    assert.ok(afterRecovery);
    assert.equal(afterRecovery.doc.bodyHtml, "<p>NEWER SAVED</p>", "Must preserve newer saved edits");
    assert.equal(afterRecovery.doc.subject, "Văn bản đã sửa mới hơn");
    assert.equal(afterRecovery.revision, 2, "Must keep revision 2");

    // Summary must be rebuilt from the newer record, preserving its independent session title
    const summaryList = await listSessions();
    const summary = summaryList.find((s) => s.id === LEGACY_SESSION_ID);
    assert.ok(summary);
    assert.equal(summary.title, "Văn bản gốc");
    assert.equal(summary.revision, 2);
  });

  it("R02: corrupt legacy draft missing doc throws SessionCorruptError and does not create session", async () => {
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      standardType: "state",
      updatedAt: "2026-10-19T00:00:00.000Z",
      versions: [],
    } as any);

    await assert.rejects(
      async () => {
        await migrateLegacyDraft();
      },
      (err: any) => err instanceof SessionCorruptError
    );

    const actual = await loadSession(LEGACY_SESSION_ID);
    assert.equal(actual, null, "Must not create any session when legacy doc is missing or corrupt");
  });

  it("migrates valid legacy draft with all-empty strings without synthesizing fake values", async () => {
    const emptyDoc: DocumentState = {
      orgHeader1: "",
      orgHeader2: "",
      nationalHeader1: "",
      nationalHeader2: "",
      locationAndDate: "",
      documentType: "",
      referenceNumber: "",
      subject: "",
      bodyHtml: "",
      signTitle: "",
      signName: "",
      recipients: "",
    };

    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      standardType: "state",
      updatedAt: "2026-10-19T00:00:00.000Z",
      doc: emptyDoc,
      versions: [],
    });

    const result = await migrateLegacyDraft();
    assert.equal(result.status, "migrated");
    assert.equal(result.sessionId, LEGACY_SESSION_ID);

    const session = await loadSession(LEGACY_SESSION_ID);
    assert.ok(session);
    assert.equal(session.doc.orgHeader1, "");
    assert.equal(session.doc.orgHeader2, "");
    assert.equal(session.doc.nationalHeader1, "");
    assert.equal(session.doc.nationalHeader2, "");
    assert.equal(session.doc.locationAndDate, "");
    assert.equal(session.doc.documentType, "");
    assert.equal(session.doc.referenceNumber, "");
    assert.equal(session.doc.subject, "");
    assert.equal(session.doc.bodyHtml, "");
    assert.equal(session.doc.signTitle, "");
    assert.equal(session.doc.signName, "");
    assert.equal(session.doc.recipients, "");
    // Ensure no synthetic placeholder was injected
    assert.notEqual(session.doc.signTitle, "THỦ TRƯỞNG");
    assert.notEqual(session.doc.signName, "Nguyễn Văn A");
  });

  it("rejects legacy draft with missing required doc field (e.g. missing orgHeader2) with SessionCorruptError", async () => {
    const docWithMissingField = createSyntheticDoc("Thiếu orgHeader2");
    delete (docWithMissingField as any).orgHeader2;

    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      standardType: "state",
      updatedAt: "2026-10-19T00:00:00.000Z",
      doc: docWithMissingField,
      versions: [],
    });

    await assert.rejects(
      async () => {
        await migrateLegacyDraft();
      },
      (err: any) => err instanceof SessionCorruptError
    );

    const actual = await loadSession(LEGACY_SESSION_ID);
    assert.equal(actual, null, "Must not create any session when legacy doc is missing required field");
    const sessions = await listSessions();
    assert.equal(sessions.length, 0);
  });

  it("rejects legacy draft with wrong field type (e.g. bodyHtml is a number) with SessionCorruptError", async () => {
    const docWithWrongType = createSyntheticDoc("Sai kiểu bodyHtml");
    (docWithWrongType as any).bodyHtml = 12345;

    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      standardType: "state",
      updatedAt: "2026-10-19T00:00:00.000Z",
      doc: docWithWrongType,
      versions: [],
    });

    await assert.rejects(
      async () => {
        await migrateLegacyDraft();
      },
      (err: any) => err instanceof SessionCorruptError
    );

    const actual = await loadSession(LEGACY_SESSION_ID);
    assert.equal(actual, null, "Must not create any session when legacy doc has wrong field type");
    const sessions = await listSessions();
    assert.equal(sessions.length, 0);
  });

  it("repairs summary when v3 summary has mismatched revision, standardType, or source, and subsequent run returns already_migrated", async () => {
    const doc = createSyntheticDoc("Văn bản kiểm tra repair summary");
    getMemoryFallbackDrafts().set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      standardType: "state",
      updatedAt: "2026-10-18T10:00:00.000Z",
      doc,
      versions: [],
    });

    // Initial migration
    const res1 = await migrateLegacyDraft();
    assert.equal(res1.status, "migrated");

    // Advance session to revision 2 with party regime and uploaded file
    const session = (await loadSession(LEGACY_SESSION_ID))!;
    assert.ok(session);
    session.revision = 2;
    session.standardType = "party";
    session.uploadedFileName = "party_document.docx";
    session.doc.subject = "Chủ đề v3 sửa đổi";
    session.doc.bodyHtml = "<p>Nội dung v3 được bảo vệ</p>";
    getMemoryFallbackDrafts().set(LEGACY_SESSION_ID, session as any);

    // 1. Stale revision in summary (revision 1 vs record revision 2)
    const staleRevSummary = {
      ...memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!,
      revision: 1,
    };
    memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, staleRevSummary);

    const repairRev = await migrateLegacyDraft();
    assert.equal(repairRev.status, "repaired");
    const summaryAfterRev = memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!;
    assert.equal(summaryAfterRev.revision, 2);
    assert.equal(summaryAfterRev.standardType, "party");
    assert.equal(summaryAfterRev.sourceKind, "uploaded_file");
    assert.equal(summaryAfterRev.sourceFileName, "party_document.docx");

    // Idempotent: second run returns already_migrated
    const secondRunRev = await migrateLegacyDraft();
    assert.equal(secondRunRev.status, "already_migrated");
    assert.equal((await loadSession(LEGACY_SESSION_ID))?.revision, 2);

    // 2. Mismatched standardType in summary
    const mismatchedRegimeSummary = {
      ...memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!,
      standardType: "state" as const,
    };
    memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, mismatchedRegimeSummary);

    const repairRegime = await migrateLegacyDraft();
    assert.equal(repairRegime.status, "repaired");
    assert.equal(memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!.standardType, "party");

    // Idempotent
    assert.equal((await migrateLegacyDraft()).status, "already_migrated");

    // 3. Mismatched sourceKind in summary
    const mismatchedSourceSummary = {
      ...memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!,
      sourceKind: "unknown" as const,
      sourceFileName: undefined,
    };
    memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, mismatchedSourceSummary);

    const repairSource = await migrateLegacyDraft();
    assert.equal(repairSource.status, "repaired");
    const fixedSummary = memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!;
    assert.equal(fixedSummary.sourceKind, "uploaded_file");
    assert.equal(fixedSummary.sourceFileName, "party_document.docx");

    // Deep record content and active pointer preserved
    const finalRecord = (await loadSession(LEGACY_SESSION_ID))!;
    assert.equal(finalRecord.doc.bodyHtml, "<p>Nội dung v3 được bảo vệ</p>");
    assert.equal(finalRecord.revision, 2);
    assert.equal(await getActiveSessionId(), LEGACY_SESSION_ID);

    // Final idempotent check
    assert.equal((await migrateLegacyDraft()).status, "already_migrated");
  });

  it("S01: repair-invalid-lifecycle repairs invalid summary lifecycle and createdAt without modifying record", async () => {
    const memDrafts = getMemoryFallbackDrafts();
    const doc = createSyntheticDoc("V3 Document");
    const v3Record = {
      schemaVersion: 3 as const,
      id: LEGACY_SESSION_ID,
      title: "V3 Document",
      revision: 1,
      sourceGeneration: 1,
      updatedAt: "2026-10-19T00:00:00.000Z",
      standardType: "state" as const,
      doc,
      versions: [],
      workflow: {
        importReviewAccepted: false,
        userModifiedBlockIds: [],
        partitionProposals: [],
        verifiedPartitionProposalIds: [],
        reviewProposals: [],
        acceptedProposalIds: [],
      },
    };
    memDrafts.set(LEGACY_SESSION_ID, v3Record as any);

    // Corrupt summary status and createdAt
    memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, {
      id: LEGACY_SESSION_ID,
      title: "V3 Document",
      revision: 1,
      updatedAt: "2026-10-19T00:00:00.000Z",
      createdAt: "not-a-date" as any,
      status: "deleted" as any,
      standardType: "state",
      sourceKind: "unknown",
    } as any);

    const first = await migrateLegacyDraft();
    assert.equal(first.status, "repaired");

    const repairedSummary = memoryFallbackSessionIndex.get(LEGACY_SESSION_ID)!;
    assert.equal(repairedSummary.status, "active");
    assert.equal(repairedSummary.createdAt, "2026-10-19T00:00:00.000Z");

    const second = await migrateLegacyDraft();
    assert.equal(second.status, "already_migrated");

    // Stored record unchanged
    const storedRecord = memDrafts.get(LEGACY_SESSION_ID);
    assert.deepEqual(storedRecord, v3Record);
  });

  it("S03: rejects malformed legacy draft with non-array versions or invalid standardType", async () => {
    const memDrafts = getMemoryFallbackDrafts();
    const doc = createSyntheticDoc("Legacy malformed");

    // 1. Non-array versions
    memDrafts.set(DEFAULT_DRAFT_ID, {
      id: DEFAULT_DRAFT_ID,
      schemaVersion: 2,
      doc,
      standardType: "state",
      versions: { broken: true } as any,
      updatedAt: new Date().toISOString(),
    } as any);

    await assert.rejects(
      async () => migrateLegacyDraft(),
      (err: any) => err instanceof SessionCorruptError
    );

    // 2. Invalid standardType
    memDrafts.set(DEFAULT_DRAFT_ID, {
      id: DEFAULT_DRAFT_ID,
      schemaVersion: 2,
      doc,
      standardType: "invalid-regime" as any,
      versions: [],
      updatedAt: new Date().toISOString(),
    } as any);

    await assert.rejects(
      async () => migrateLegacyDraft(),
      (err: any) => err instanceof SessionCorruptError
    );
  });

  it("S07: corrupt-v3-without-legacy throws SessionCorruptError and leaves stores untouched", async () => {
    const memDrafts = getMemoryFallbackDrafts();
    memDrafts.set(LEGACY_SESSION_ID, { id: LEGACY_SESSION_ID, schemaVersion: 3 } as any);

    await assert.rejects(
      async () => migrateLegacyDraft(),
      (err: any) => err instanceof SessionCorruptError
    );
  });

  it("S07: corrupt-migration-marker is reconstructed when authoritative record exists", async () => {
    const memDrafts = getMemoryFallbackDrafts();
    const doc = createSyntheticDoc("Valid V3");
    const v3Record = {
      schemaVersion: 3 as const,
      id: LEGACY_SESSION_ID,
      title: "Valid V3",
      revision: 1,
      sourceGeneration: 1,
      updatedAt: "2026-10-19T00:00:00.000Z",
      standardType: "state" as const,
      doc,
      versions: [],
      workflow: {
        importReviewAccepted: false,
        userModifiedBlockIds: [],
        partitionProposals: [],
        verifiedPartitionProposalIds: [],
        reviewProposals: [],
        acceptedProposalIds: [],
      },
    };
    memDrafts.set(LEGACY_SESSION_ID, v3Record as any);

    // Broken marker
    memoryFallbackAppMeta.set(META_LEGACY_MIGRATION, {
      key: META_LEGACY_MIGRATION,
      value: { status: "broken" } as any,
    });

    const result = await migrateLegacyDraft();
    assert.equal(result.status, "repaired");

    const second = await migrateLegacyDraft();
    assert.equal(second.status, "already_migrated");

    const marker = memoryFallbackAppMeta.get(META_LEGACY_MIGRATION)?.value;
    assert.equal(marker?.status, "done");
    assert.equal(marker?.sessionId, LEGACY_SESSION_ID);
  });

  it("C01: preserves-newer-v3-when-optional-metadata-corrupt throws SessionCorruptError and never overwrites newer v3 with legacy", async () => {
    const memDrafts = getMemoryFallbackDrafts();
    const legacyDoc = createSyntheticDoc("Legacy Document");
    legacyDoc.bodyHtml = "<p>OLD LEGACY</p>";

    memDrafts.set(DEFAULT_DRAFT_ID, {
      id: DEFAULT_DRAFT_ID,
      schemaVersion: 2,
      doc: legacyDoc,
      standardType: "state",
      versions: [],
      updatedAt: "2026-10-19T00:00:00.000Z",
    } as any);

    const v3Doc = createSyntheticDoc("V3 Document");
    v3Doc.bodyHtml = "<p>NEWER USER EDITS</p>";

    const currentV3 = {
      schemaVersion: 3 as const,
      id: LEGACY_SESSION_ID,
      title: "V3 Document",
      revision: 2,
      sourceGeneration: 1,
      updatedAt: "2026-10-19T01:00:00.000Z",
      standardType: "state" as const,
      doc: v3Doc,
      versions: [],
      workflow: {
        importReviewAccepted: false,
        userModifiedBlockIds: [],
        partitionProposals: [],
        verifiedPartitionProposalIds: [],
        reviewProposals: [],
        acceptedProposalIds: [],
      },
      originalSnapshot: {
        sourceType: "uploaded_file" as const,
        fileName: 123 as any,
        uploadedAt: "2026-10-19T01:00:00.000Z",
        bodyHtml: "<p>NEWER USER EDITS</p>",
      },
    };
    memDrafts.set(LEGACY_SESSION_ID, currentV3 as any);

    const snapshotBefore = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };

    let error: any;
    try {
      await migrateLegacyDraft();
    } catch (e: any) {
      error = e;
    }

    assert.ok(error instanceof SessionCorruptError, `Expected SessionCorruptError, got: ${error?.name}`);
    assert.equal(error.sessionId, LEGACY_SESSION_ID);

    const snapshotAfter = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };

    assert.deepEqual(snapshotAfter, snapshotBefore, "Every store must remain strictly unchanged");
    const storedV3 = memDrafts.get(LEGACY_SESSION_ID) as any;
    assert.equal(storedV3.revision, 2);
    assert.equal(storedV3.doc.bodyHtml, "<p>NEWER USER EDITS</p>");
  });

  it("C05: repaired marker derives valid date and second migration call executes zero writes", async () => {
    resetMemoryFallbackStores();
    const memDrafts = getMemoryFallbackDrafts();

    // 1. Setup valid v3 record and valid summary
    const v3Record = {
      schemaVersion: 3 as const,
      id: LEGACY_SESSION_ID,
      title: "V3 Active Doc",
      revision: 2,
      sourceGeneration: 1,
      updatedAt: "2026-10-19T02:00:00.000Z",
      standardType: "state" as const,
      doc: createSyntheticDoc("V3 Document Content"),
      versions: [],
      workflow: {
        importReviewAccepted: true,
        userModifiedBlockIds: [],
        partitionProposals: [],
        verifiedPartitionProposalIds: [],
        reviewProposals: [],
        acceptedProposalIds: [],
      },
    };
    memDrafts.set(LEGACY_SESSION_ID, v3Record as any);
    const summary = buildSummaryFromRecord(v3Record as any);
    memoryFallbackSessionIndex.set(LEGACY_SESSION_ID, summary);

    // Legacy draft has invalid updatedAt
    memDrafts.set(DEFAULT_DRAFT_ID, {
      schemaVersion: 2,
      id: DEFAULT_DRAFT_ID,
      standardType: "state",
      updatedAt: "invalid-date",
      doc: createSyntheticDoc("Old Legacy"),
      versions: [],
    } as any);

    // Marker is missing initially
    memoryFallbackAppMeta.delete(META_LEGACY_MIGRATION);

    // First call: repairs marker
    const res1 = await migrateLegacyDraft();
    const rawMarker = memoryFallbackAppMeta.get(META_LEGACY_MIGRATION);
    const marker = rawMarker?.value ?? rawMarker;
    assert.ok(marker, "Marker must be created");
    assert.equal(marker.status, "done");
    assert.equal(marker.sessionId, LEGACY_SESSION_ID);
    assert.ok(
      typeof marker.legacyUpdatedAt === "string" && !Number.isNaN(Date.parse(marker.legacyUpdatedAt)),
      "Marker legacyUpdatedAt must be a valid ISO date string"
    );
    assert.equal(marker.legacyUpdatedAt, "2026-10-19T02:00:00.000Z");

    // Second call: must return already_migrated with zero Map.set calls!
    let setCalls = 0;
    const origSet = Map.prototype.set;
    Map.prototype.set = function (k: any, v: any) {
      setCalls++;
      return origSet.call(this, k, v);
    };

    try {
      const res2 = await migrateLegacyDraft();
      assert.equal(res2.status, "already_migrated");
      assert.equal(setCalls, 0, `Second migration must execute ZERO Map.set operations across all stores, saw: ${setCalls}`);
    } finally {
      Map.prototype.set = origSet;
    }
  });

  it("D01: preserve-v3-snapshot-when-doc-is-corrupt throws SessionCorruptError and preserves stores", async () => {
    resetMemoryFallbackStores();
    const memDrafts = getMemoryFallbackDrafts();

    const legacy = {
      schemaVersion: 2 as const,
      id: DEFAULT_DRAFT_ID,
      standardType: "state" as const,
      updatedAt: "2026-10-18T00:00:00.000Z",
      doc: createSyntheticDoc("OLD LEGACY"),
      versions: [],
    };
    memDrafts.set(DEFAULT_DRAFT_ID, legacy as any);

    const newer = {
      schemaVersion: 3 as const,
      id: LEGACY_SESSION_ID,
      revision: 2,
      sourceGeneration: 1,
      updatedAt: "2026-10-19T01:00:00.000Z",
      standardType: "state" as const,
      doc: null as any,
      versions: [],
      originalSnapshot: {
        sourceType: "uploaded_file" as const,
        fileName: "new.docx",
        uploadedAt: "2026-10-19T01:00:00.000Z",
        bodyHtml: "<p>NEW SNAPSHOT CONTENT</p>",
      },
      workflow: {
        importReviewAccepted: true,
        userModifiedBlockIds: [],
        partitionProposals: [],
        verifiedPartitionProposalIds: [],
        reviewProposals: [],
        acceptedProposalIds: [],
      },
    };
    memDrafts.set(LEGACY_SESSION_ID, newer as any);

    const snapBefore = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };

    let error: any;
    try {
      await migrateLegacyDraft();
    } catch (e: any) {
      error = e;
    }

    assert.ok(error instanceof SessionCorruptError, `Expected SessionCorruptError, got: ${error?.name}`);
    const snapAfter = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };
    assert.deepEqual(snapAfter, snapBefore, "All stores must remain strictly untouched");
    const stored = memDrafts.get(LEGACY_SESSION_ID) as any;
    assert.equal(stored.originalSnapshot?.bodyHtml, "<p>NEW SNAPSHOT CONTENT</p>");
    assert.equal(stored.revision, 2);
  });

  it("D01: preserve-v3-review-blocks-when-doc-is-corrupt throws SessionCorruptError and preserves stores", async () => {
    resetMemoryFallbackStores();
    const memDrafts = getMemoryFallbackDrafts();

    const legacy = {
      schemaVersion: 2 as const,
      id: DEFAULT_DRAFT_ID,
      standardType: "state" as const,
      updatedAt: "2026-10-18T00:00:00.000Z",
      doc: createSyntheticDoc("OLD LEGACY"),
      versions: [],
    };
    memDrafts.set(DEFAULT_DRAFT_ID, legacy as any);

    const newer = {
      schemaVersion: 3 as const,
      id: LEGACY_SESSION_ID,
      revision: 2,
      sourceGeneration: 1,
      updatedAt: "2026-10-19T01:00:00.000Z",
      standardType: "state" as const,
      doc: null as any,
      versions: [],
      reviewBlocks: [
        { id: "block-0", index: 0, kind: "paragraph" as const, text: "NEW USER BLOCK" },
      ],
      workflow: {
        importReviewAccepted: true,
        userModifiedBlockIds: [],
        partitionProposals: [],
        verifiedPartitionProposalIds: [],
        reviewProposals: [],
        acceptedProposalIds: [],
      },
    };
    memDrafts.set(LEGACY_SESSION_ID, newer as any);

    const snapBefore = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };

    let error: any;
    try {
      await migrateLegacyDraft();
    } catch (e: any) {
      error = e;
    }

    assert.ok(error instanceof SessionCorruptError, `Expected SessionCorruptError, got: ${error?.name}`);
    const snapAfter = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };
    assert.deepEqual(snapAfter, snapBefore, "All stores must remain strictly untouched");
    const stored = memDrafts.get(LEGACY_SESSION_ID) as any;
    assert.equal(stored.reviewBlocks?.[0]?.text, "NEW USER BLOCK");
    assert.equal(stored.revision, 2);
  });

  it("D03: reject-legacy-version-without-data throws SessionCorruptError and does not invent data", async () => {
    resetMemoryFallbackStores();
    const memDrafts = getMemoryFallbackDrafts();

    const legacy = {
      schemaVersion: 2 as const,
      id: DEFAULT_DRAFT_ID,
      standardType: "state" as const,
      updatedAt: "2026-10-18T00:00:00.000Z",
      doc: createSyntheticDoc("OLD LEGACY"),
      versions: [
        { id: "v1", timestamp: "2026-10-17T00:00:00.000Z", title: "Historical", standardType: "state" as const },
      ],
    };
    memDrafts.set(DEFAULT_DRAFT_ID, legacy as any);

    const snapBefore = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };

    let error: any;
    try {
      await migrateLegacyDraft();
    } catch (e: any) {
      error = e;
    }

    assert.ok(error instanceof SessionCorruptError, `Expected SessionCorruptError, got: ${error?.name}`);
    const snapAfter = {
      drafts: structuredClone([...memDrafts.entries()]),
      session_index: structuredClone([...memoryFallbackSessionIndex.entries()]),
      app_meta: structuredClone([...memoryFallbackAppMeta.entries()]),
      source_blobs: structuredClone([...getMemoryFallbackSourceBlobs().entries()]),
    };
    assert.deepEqual(snapAfter, snapBefore, "All stores must remain strictly untouched");
  });

  it("D03 positive: successfully migrates legacy draft with valid historical versions", async () => {
    resetMemoryFallbackStores();
    const memDrafts = getMemoryFallbackDrafts();

    const historicalDoc = createSyntheticDoc("HISTORICAL DOC CONTENT");
    const legacy = {
      schemaVersion: 2 as const,
      id: DEFAULT_DRAFT_ID,
      standardType: "state" as const,
      updatedAt: "2026-10-18T00:00:00.000Z",
      doc: createSyntheticDoc("CURRENT DOC CONTENT"),
      versions: [
        {
          id: "v1",
          timestamp: "2026-10-17T00:00:00.000Z",
          title: "Bản thảo ban đầu",
          standardType: "state" as const,
          data: historicalDoc,
        },
      ],
    };
    memDrafts.set(DEFAULT_DRAFT_ID, legacy as any);

    const res = await migrateLegacyDraft();
    assert.equal(res.status, "migrated");
    const migrated = (await loadSession(LEGACY_SESSION_ID))!;
    assert.ok(migrated);
    assert.equal(migrated.versions.length, 1);
    assert.equal(migrated.versions[0].title, "Bản thảo ban đầu");
    assert.equal(migrated.versions[0].data.bodyHtml, historicalDoc.bodyHtml);
    assert.equal(migrated.doc.bodyHtml, legacy.doc.bodyHtml);
  });
});
