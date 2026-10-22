import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function getBrowserExecutablePath(): string {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  if (fs.existsSync(chromePath)) return chromePath;
  if (fs.existsSync(edgePath)) return edgePath;
  throw new Error("No supported Chromium browser found (checked Chrome and Edge)");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Task 1: Real Chromium IndexedDB Integration Tests", () => {
  it("verifies F01-F06 invariants on native IndexedDB multi-store transactions", async () => {
    const serverPort = 5055;
    const cdpPort = 9669;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "docform-task1-idb-"));

    const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
    const serverProc = spawn(process.execPath, [tsxCli, "server.ts", "--port", String(serverPort)], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, PORT: String(serverPort), NODE_ENV: "development" },
    });

    let serverStderr = "";
    serverProc.stderr?.on("data", (chunk) => {
      serverStderr += chunk.toString();
    });

    let browserProc: ChildProcess | null = null;
    let ws: WebSocket | null = null;

    try {
      // 1. Wait for server
      let serverReady = false;
      for (let i = 0; i < 120; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${serverPort}/`);
          if (res.ok) {
            serverReady = true;
            break;
          }
        } catch {
          // wait
        }
        await sleep(250);
      }
      assert.ok(serverReady, "Dev server failed to start on port " + serverPort + (serverStderr ? ": " + serverStderr : ""));

      // 2. Launch headless Chromium
      const browserExe = getBrowserExecutablePath();
      browserProc = spawn(browserExe, [
        "--headless=new",
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "about:blank",
      ], { windowsHide: true, stdio: "ignore" });

      let pageInfo: any = null;
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
          if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list) && list.length > 0) {
              pageInfo = list.find((x: any) => x.type === "page" && x.webSocketDebuggerUrl);
              if (pageInfo) break;
            }
          }
        } catch {
          // wait
        }
        await sleep(100);
      }
      assert.ok(pageInfo?.webSocketDebuggerUrl, "Chromium CDP page endpoint not available");

      // 3. Connect WebSocket CDP
      ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        ws!.onopen = () => resolve();
        ws!.onerror = (err) => reject(err);
      });

      let nextId = 0;
      const pending = new Map<number, (res: any) => void>();
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data.toString());
        if (msg.id && pending.has(msg.id)) {
          const cb = pending.get(msg.id)!;
          pending.delete(msg.id);
          cb(msg);
        }
      };

      const send = (method: string, params: Record<string, any> = {}): Promise<any> =>
        new Promise((resolve, reject) => {
          const id = ++nextId;
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP Timeout: ${method}`));
          }, 20000);
          pending.set(id, (result) => {
            clearTimeout(timer);
            resolve(result);
          });
          ws!.send(JSON.stringify({ id, method, params }));
        });

      // 4. Navigate to server to allow ES module imports
      await send("Page.navigate", { url: `http://localhost:${serverPort}/src/utils/documentSessionStore.ts` });
      for (let i = 0; i < 50; i++) {
        const check = await send("Runtime.evaluate", { expression: "location.origin", returnByValue: true });
        if (check.result?.result?.value === `http://localhost:${serverPort}`) break;
        await sleep(100);
      }

      // 5. Evaluate tests inside real browser with real IndexedDB
      const evalScript = `(async function () {
          const store = await import("/src/utils/documentSessionStore.ts");
          const migration = await import("/src/utils/documentSessionMigration.ts");
          const draft = await import("/src/utils/draftStore.ts");
          const types = await import("/src/utils/documentSessionTypes.ts");

          const findings = [];
          const unhandled = [];
          addEventListener("unhandledrejection", (event) => {
            unhandled.push({
              name: event.reason?.name,
              message: String(event.reason?.message || event.reason),
            });
            event.preventDefault();
          });
          const req = (r) =>
            new Promise((resolve, reject) => {
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            });
          const done = (tx) =>
            new Promise((resolve, reject) => {
              tx.oncomplete = resolve;
              tx.onabort = () => reject(tx.error);
              tx.onerror = () => reject(tx.error);
            });

          let n = 0;
          async function createTestDb() {
            const open = indexedDB.open("Task1RealIdbTest-" + Date.now() + "-" + ++n, 3);
            open.onupgradeneeded = () => {
              for (const [name, keyPath] of [
                ["drafts", "id"],
                ["source_blobs", "hash"],
                ["session_index", "id"],
                ["app_meta", "key"],
              ]) {
                open.result.createObjectStore(name, { keyPath });
              }
            };
            return req(open);
          }

          async function write(database, name, value, remove = false) {
            const tx = database.transaction(name, "readwrite");
            const commit = done(tx);
            if (remove) tx.objectStore(name).delete(value);
            else tx.objectStore(name).put(value);
            await commit;
          }

          async function snapshotDb(database) {
            const res = {};
            for (const s of ["drafts", "session_index", "app_meta", "source_blobs"]) {
              res[s] = await req(database.transaction(s).objectStore(s).getAll());
            }
            return res;
          }

          function seed(id = "A") {
            const now = "2026-10-19T00:00:00.000Z";
            const doc = {
              orgHeader1: "",
              orgHeader2: "SYNTHETIC",
              nationalHeader1: "HEADER",
              nationalHeader2: "",
              locationAndDate: "",
              documentType: "TEST",
              referenceNumber: "",
              subject: id,
              bodyHtml: "<p>OLD</p>",
              signTitle: "TITLE",
              signName: "NAME",
              recipients: "RECIPIENTS",
            };
            const record = {
              schemaVersion: 3,
              id,
              title: id,
              revision: 1,
              sourceGeneration: 1,
              updatedAt: now,
              standardType: "state",
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
            const summary = {
              id,
              title: id,
              revision: 1,
              createdAt: now,
              updatedAt: now,
              status: "active",
              standardType: "state",
              sourceKind: "unknown",
            };
            return { record, summary };
          }

          async function run(name, callback) {
            const database = await createTestDb();
            try {
              findings.push({ name, ...(await callback(database)) });
            } catch (err) {
              findings.push({ name, error: err.stack, passed: false });
            } finally {
              database.close();
            }
          }

          // F01: archiveSession with current on active session preserves unsaved edits
          await run("archive-active-preserves-unsaved", async (database) => {
            const a = seed();
            await store.createSession(a.record, a.summary, null, undefined, database);
            const edited = structuredClone(a.record);
            edited.doc.bodyHtml = "<p>UNSAVED</p>";
            await store.archiveSession("A", 1, { record: edited, expectedRevision: 1 }, database);
            const actual = await store.loadSession("A", database);
            return {
              expected: "<p>UNSAVED</p>",
              actual: actual.doc.bodyHtml,
              passed: actual.doc.bodyHtml === "<p>UNSAVED</p>",
              active: await store.getActiveSessionId(database),
            };
          });

          // F03: duplicate error rolls back flush
          await run("duplicate-error-rolls-back-flush", async (database) => {
            const a = seed();
            await store.createSession(a.record, a.summary, null, undefined, database);
            const edited = structuredClone(a.record);
            edited.doc.bodyHtml = "<p>UNSAVED</p>";
            let error;
            try {
              await store.duplicateSession("MISSING", "copy", "A", { record: edited, expectedRevision: 1 }, database);
            } catch (e) {
              error = e.name;
            }
            const actual = await store.loadSession("A", database);
            return {
              error,
              expected: { revision: 1, body: "<p>OLD</p>" },
              actual: { revision: actual.revision, body: actual.doc.bodyHtml },
              passed: actual.revision === 1 && actual.doc.bodyHtml === "<p>OLD</p>",
            };
          });

          // F02: missing summary preserves newer v3 record
          await run("migration-missing-summary-preserves-newer-record", async (database) => {
            const a = seed("current_active_draft");
            a.record.schemaVersion = 2;
            await write(database, "drafts", a.record);
            await migration.migrateLegacyDraft(database);
            const session = await store.loadSession("legacy-current-active-draft", database);
            session.doc.bodyHtml = "<p>NEWER SAVED</p>";
            await store.saveSession(session, 1, database);
            await write(database, "session_index", "legacy-current-active-draft", true);
            const recovery = await migration.migrateLegacyDraft(database);
            const actual = await store.loadSession("legacy-current-active-draft", database);
            return {
              recovery,
              expected: "<p>NEWER SAVED</p>",
              actual: actual.doc.bodyHtml,
              revision: actual.revision,
              passed: actual.doc.bodyHtml === "<p>NEWER SAVED</p>" && actual.revision === 2,
            };
          });

          // F04: load rejects corrupt record
          await run("load-rejects-corrupt-record", async (database) => {
            await write(database, "drafts", { id: "BROKEN", schemaVersion: 3 });
            let error;
            try {
              await store.loadSession("BROKEN", database);
            } catch (e) {
              error = e.name;
            }
            return {
              expected: "SessionCorruptError",
              actual: error || "accepted",
              passed: error === "SessionCorruptError",
            };
          });

          // F03: create uncloneable seed rolls back flush
          await run("create-clone-error-rolls-back-flush", async (database) => {
            const a = seed();
            await store.createSession(a.record, a.summary, null, undefined, database);
            const b = seed("B");
            b.record.uncloneable = () => {};
            let error;
            try {
              await store.createSession(b.record, b.summary, "A", { record: a.record, expectedRevision: 1 }, database);
            } catch (e) {
              error = e.name;
            }
            const actual = await store.loadSession("A", database);
            return {
              error,
              expectedRevision: 1,
              actualRevision: actual.revision,
              passed: actual.revision === 1,
            };
          });

          // F05: flush updates summary regime
          await run("flush-updates-summary-regime", async (database) => {
            const a = seed();
            await store.createSession(a.record, a.summary, null, undefined, database);
            const b = seed("B");
            const edited = structuredClone(a.record);
            edited.standardType = "party";
            await store.createSession(b.record, b.summary, "A", { record: edited, expectedRevision: 1 }, database);
            const actual = (await store.listSessions(false, database)).find((x) => x.id === "A");
            return {
              expected: "party",
              actual: actual.standardType,
              passed: actual.standardType === "party",
            };
          });

          // R03: clear source clears summary metadata
          await run("clear-source-clears-summary-metadata", async (database) => {
            const a = seed();
            a.record.originalSnapshot = {
              sourceType: "uploaded_file",
              fileName: "A.docx",
              sourceHash: "synthetic",
              uploadedAt: a.record.updatedAt,
              bodyHtml: a.record.doc.bodyHtml,
            };
            a.record.uploadedFileName = "A.docx";
            a.summary.sourceKind = "uploaded_file";
            a.summary.sourceFileName = "A.docx";
            await store.createSession(a.record, a.summary, null, undefined, database);
            const cleared = structuredClone(a.record);
            cleared.originalSnapshot = null;
            cleared.uploadedFileName = "";
            await store.saveSession(cleared, 1, database);
            const actual = (await store.listSessions(false, database))[0];
            return {
              expected: { sourceKind: "unknown", sourceFileName: null },
              actual: { sourceKind: actual.sourceKind, sourceFileName: actual.sourceFileName || null },
              passed: actual.sourceKind === "unknown" && !actual.sourceFileName,
            };
          });

          // R02: corrupt legacy does not invent signature/dates
          await run("corrupt-legacy-does-not-invent-signature", async (database) => {
            await write(database, "drafts", {
              schemaVersion: 2,
              id: "current_active_draft",
              standardType: "state",
              updatedAt: "2026-10-19T00:00:00.000Z",
              versions: [],
            });
            let error, status;
            try {
              status = await migration.migrateLegacyDraft(database);
            } catch (e) {
              error = e.name;
            }
            const actual = await store.loadSession("legacy-current-active-draft", database);
            return {
              status,
              error,
              actual: actual
                ? {
                    signTitle: actual.doc.signTitle,
                    signName: actual.doc.signName,
                    referenceNumber: actual.doc.referenceNumber,
                  }
                : null,
              passed: !actual,
            };
          });

          // R01: invalid current does not corrupt valid record
          await run("invalid-current-does-not-corrupt-valid-record", async (database) => {
            const a = seed();
            await store.createSession(a.record, a.summary, null, undefined, database);
            const edited = structuredClone(a.record);
            delete edited.workflow;
            let error;
            try {
              await store.archiveSession("A", 1, { record: edited, expectedRevision: 1 }, database);
            } catch (e) {
              error = e.name;
            }
            let loadError;
            try {
              await store.loadSession("A", database);
            } catch (e) {
              loadError = e.name;
            }
            return {
              error,
              loadError,
              passed: !!error && !loadError,
            };
          });

          // R01: current missing doc.orgHeader2 rejects and preserves valid record
          await run("archive-rejects-missing-orgHeader2", async (database) => {
            const a = seed();
            await store.createSession(a.record, a.summary, null, undefined, database);
            const edited = structuredClone(a.record);
            delete edited.doc.orgHeader2;
            let error;
            try {
              await store.archiveSession("A", 1, { record: edited, expectedRevision: 1 }, database);
            } catch (e) {
              error = e.name;
            }
            const actual = await store.loadSession("A", database);
            return {
              error,
              expected: { error: "SessionCorruptError", revision: 1, orgHeader2: "SYNTHETIC" },
              actual: { error, revision: actual ? actual.revision : null, orgHeader2: actual ? actual.doc.orgHeader2 : null },
              passed: error === "SessionCorruptError" && actual !== null && actual.revision === 1 && actual.doc.orgHeader2 === "SYNTHETIC",
            };
          });

          // Pair link: createSession rejects mismatched summary
          await run("create-rejects-mismatched-summary", async (database) => {
            const a = seed();
            const mismatchedSummary = { ...a.summary, revision: 99 };
            let error;
            try {
              await store.createSession(a.record, mismatchedSummary, null, undefined, database);
            } catch (e) {
              error = e.name;
            }
            const actual = await store.loadSession("A", database);
            return {
              error,
              passed: error === "SessionCorruptError" && !actual,
            };
          });

          // Incomplete draft: legacy doc with all-empty strings migrates without synthesized values
          await run("legacy-migration-preserves-all-empty-strings", async (database) => {
            const emptyDoc = {
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
            await write(database, "drafts", {
              schemaVersion: 2,
              id: "current_active_draft",
              standardType: "state",
              updatedAt: "2026-10-19T00:00:00.000Z",
              doc: emptyDoc,
              versions: [],
            });
            const status = await migration.migrateLegacyDraft(database);
            const actual = await store.loadSession("legacy-current-active-draft", database);
            return {
              status,
              passed:
                status.status === "migrated" &&
                actual !== null &&
                actual.doc.orgHeader1 === "" &&
                actual.doc.signTitle === "" &&
                actual.doc.signName === "" &&
                actual.doc.referenceNumber === "",
            };
          });

          // Migration repairs mismatched summary and subsequent run returns already_migrated
          await run("migration-repairs-mismatched-summary", async (database) => {
            const a = seed("legacy-current-active-draft");
            a.record.revision = 2;
            a.record.standardType = "state";
            a.record.doc.bodyHtml = "<p>PRESERVED V3</p>";
            await write(database, "drafts", a.record);
            const mismatchedSummary = {
              ...a.summary,
              id: "legacy-current-active-draft",
              title: "Mismatched",
              revision: 1,
              standardType: "party",
              createdAt: "2026-10-01T00:00:00.000Z",
              updatedAt: "2026-10-01T00:00:00.000Z",
              status: "active",
              sourceKind: "unknown",
            };
            await write(database, "session_index", mismatchedSummary);

            const firstRun = await migration.migrateLegacyDraft(database);
            const recordAfterFirst = await store.loadSession("legacy-current-active-draft", database);
            const summaryAfterFirst = await req(database.transaction("session_index").objectStore("session_index").get("legacy-current-active-draft"));

            const secondRun = await migration.migrateLegacyDraft(database);
            const recordAfterSecond = await store.loadSession("legacy-current-active-draft", database);
            const summaryAfterSecond = await req(database.transaction("session_index").objectStore("session_index").get("legacy-current-active-draft"));

            return {
              firstRun,
              secondRun,
              recordAfterFirstBody: recordAfterFirst?.doc.bodyHtml,
              summaryAfterFirstStandardType: summaryAfterFirst?.standardType,
              passed:
                firstRun.status === "repaired" &&
                summaryAfterFirst?.standardType === "state" &&
                summaryAfterFirst?.revision === 2 &&
                summaryAfterFirst?.createdAt === "2026-10-01T00:00:00.000Z" &&
                recordAfterFirst?.doc.bodyHtml === "<p>PRESERVED V3</p>" &&
                secondRun.status === "already_migrated" &&
                recordAfterSecond?.revision === 2 &&
                summaryAfterSecond?.revision === 2 &&
                summaryAfterSecond?.updatedAt === summaryAfterFirst?.updatedAt,
            };
          });

          // restoreArchivedSession fails atomically on corrupt record and leaves stores unaltered
          await run("restore-corrupt-record-leaves-stores-unaltered", async (database) => {
            const a = seed("ARCHIVED_CORRUPT");
            a.record.revision = 1;
            delete a.record.doc.orgHeader2;
            a.summary.status = "archived";
            a.summary.revision = 1;

            await write(database, "drafts", a.record);
            await write(database, "session_index", a.summary);

            let error;
            try {
              await store.restoreArchivedSession("ARCHIVED_CORRUPT", database);
            } catch (e) {
              error = e.name;
            }

            const recordInDb = await req(database.transaction("drafts").objectStore("drafts").get("ARCHIVED_CORRUPT"));
            const summaryInDb = await req(database.transaction("session_index").objectStore("session_index").get("ARCHIVED_CORRUPT"));

            return {
              error,
              expected: { error: "SessionCorruptError", revision: 1, status: "archived" },
              actual: { error, revision: recordInDb?.revision, status: summaryInDb?.status },
              passed:
                error === "SessionCorruptError" &&
                recordInDb !== null &&
                recordInDb.revision === 1 &&
                !("orgHeader2" in recordInDb.doc) &&
                summaryInDb !== null &&
                summaryInDb.status === "archived" &&
                summaryInDb.revision === 1,
            };
          });

          // C01: preserves-newer-v3-when-optional-metadata-corrupt
          await run("preserves-newer-v3-when-optional-metadata-corrupt", async (database) => {
            const legacy = seed("current_active_draft").record;
            legacy.schemaVersion = 2;
            legacy.doc.bodyHtml = "<p>OLD LEGACY</p>";
            await write(database, "drafts", legacy);

            const v3 = seed("legacy-current-active-draft").record;
            v3.revision = 2;
            v3.doc.bodyHtml = "<p>NEWER USER EDITS</p>";
            v3.originalSnapshot = {
              sourceType: "uploaded_file",
              fileName: 123,
              uploadedAt: v3.updatedAt,
              bodyHtml: v3.doc.bodyHtml,
            };
            await write(database, "drafts", v3);

            const snapBefore = await snapshotDb(database);
            let error;
            try {
              await migration.migrateLegacyDraft(database);
            } catch (e) {
              error = e.name;
            }
            const snapAfter = await snapshotDb(database);
            const stored = await req(database.transaction("drafts").objectStore("drafts").get("legacy-current-active-draft"));

            return {
              expected: "SessionCorruptError with unchanged stores",
              actual: { error, revision: stored?.revision, body: stored?.doc?.bodyHtml },
              passed:
                error === "SessionCorruptError" &&
                JSON.stringify(snapBefore) === JSON.stringify(snapAfter) &&
                stored?.revision === 2 &&
                stored?.doc?.bodyHtml === "<p>NEWER USER EDITS</p>",
            };
          });

          // C05: repaired marker derives valid date and second migration call executes zero writes
          await run("repaired-marker-valid-date-and-idempotent-zero-writes", async (database) => {
            const v3 = seed("legacy-current-active-draft", 2);
            await store.createSession(v3.record, v3.summary, null, undefined, database);

            const legacy = seed("current_active_draft");
            legacy.record.schemaVersion = 2;
            legacy.record.updatedAt = "invalid-date";
            await write(database, "drafts", legacy.record);

            // Delete marker so migration must reconstruct it
            const delTx = database.transaction("app_meta", "readwrite");
            delTx.objectStore("app_meta").delete("legacyMigration");
            await new Promise((res, rej) => { delTx.oncomplete = res; delTx.onerror = () => rej(delTx.error); });

            // First run: repairs marker
            const res1 = await migration.migrateLegacyDraft(database);
            const markerRaw = await req(database.transaction("app_meta").objectStore("app_meta").get("legacyMigration"));
            const marker = markerRaw?.value ?? markerRaw;
            const validDate = typeof marker?.legacyUpdatedAt === "string" && !Number.isNaN(Date.parse(marker.legacyUpdatedAt));

            // Second run: spy on IDBObjectStore.prototype.put
            let putCalls = 0;
            const origPut = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) {
              putCalls++;
              return origPut.apply(this, args);
            };

            let res2;
            try {
              res2 = await migration.migrateLegacyDraft(database);
            } finally {
              IDBObjectStore.prototype.put = origPut;
            }

            return {
              expected: "valid marker date and 0 put operations on second migration",
              actual: { res1: res1.status, res2: res2.status, markerDateValid: validDate, markerDate: marker?.legacyUpdatedAt, putCalls },
              passed: validDate && res2.status === "already_migrated" && putCalls === 0,
            };
          });

          // D01: preserve-v3-snapshot-when-doc-is-corrupt on real IndexedDB
          await run("preserve-v3-snapshot-when-doc-is-corrupt", async (database) => {
            const legacy = seed("current_active_draft");
            legacy.record.schemaVersion = 2;
            legacy.record.doc.bodyHtml = "<p>OLD LEGACY</p>";
            await write(database, "drafts", legacy.record);

            const newer = seed("legacy-current-active-draft", 2);
            newer.record.doc = null;
            newer.record.originalSnapshot = {
              sourceType: "uploaded_file",
              fileName: "new.docx",
              uploadedAt: newer.record.updatedAt,
              bodyHtml: "<p>NEW SNAPSHOT CONTENT</p>",
            };
            await write(database, "drafts", newer.record);

            const snapBefore = await snapshotDb(database);
            let error;
            try {
              await migration.migrateLegacyDraft(database);
            } catch (e) {
              error = e.name;
            }
            const snapAfter = await snapshotDb(database);
            const after = await req(database.transaction("drafts").objectStore("drafts").get("legacy-current-active-draft"));

            return {
              expected: "SessionCorruptError and snapshot unchanged",
              actual: { error, snapBody: after?.originalSnapshot?.bodyHtml, unchanged: JSON.stringify(snapBefore) === JSON.stringify(snapAfter) },
              passed: error === "SessionCorruptError" && JSON.stringify(snapBefore) === JSON.stringify(snapAfter) && after?.originalSnapshot?.bodyHtml === "<p>NEW SNAPSHOT CONTENT</p>",
            };
          });

          // D02: reject-invalid-nested-v3-fields on real IndexedDB
          await run("reject-invalid-nested-v3-fields", async (database) => {
            const badRole = seed("bad-role");
            badRole.record.reviewBlocks = [{ id: "block-0", index: 0, kind: "paragraph", text: "TEXT", role: "nonexistent-region" }];
            const badField = seed("bad-field");
            badField.record.structuredImport = { source: { filename: "A.docx", type: "docx", blockCount: 0 }, fields: { subject: 123 }, body: { html: "", sourceBlockIds: [] }, appendices: [], unclassified: [], order: [] };

            const accepted = [];
            for (const item of [badRole, badField]) {
              await write(database, "drafts", item.record);
              let loadError;
              try {
                await store.loadSession(item.record.id, database);
              } catch (e) {
                loadError = e.name;
              }
              if (types.isDocumentSessionRecordValid(item.record) || loadError !== "SessionCorruptError") {
                accepted.push(item.record.id);
              }
            }
            return {
              expected: "No invalid variants accepted",
              actual: { accepted },
              passed: accepted.length === 0,
            };
          });

          // D03: reject-legacy-version-without-data on real IndexedDB
          await run("reject-legacy-version-without-data", async (database) => {
            const legacy = seed("current_active_draft");
            legacy.record.schemaVersion = 2;
            legacy.record.versions = [{ id: "v1", timestamp: legacy.record.updatedAt, title: "Historical", standardType: "state" }];
            await write(database, "drafts", legacy.record);

            const snapBefore = await snapshotDb(database);
            let error;
            try {
              await migration.migrateLegacyDraft(database);
            } catch (e) {
              error = e.name;
            }
            const snapAfter = await snapshotDb(database);
            return {
              expected: "SessionCorruptError and stores unchanged",
              actual: { error, unchanged: JSON.stringify(snapBefore) === JSON.stringify(snapAfter) },
              passed: error === "SessionCorruptError" && JSON.stringify(snapBefore) === JSON.stringify(snapAfter),
            };
          });

          // Real v2 -> v3 upgrade preserving source blobs
          const legacyOpen = indexedDB.open("DocForm30_RealUpgrade_" + Date.now(), 2);
          legacyOpen.onupgradeneeded = () => {
            legacyOpen.result.createObjectStore("drafts", { keyPath: "id" });
            legacyOpen.result.createObjectStore("source_blobs", { keyPath: "hash" });
          };
          const legacyDb = await req(legacyOpen);
          const legacy = seed("current_active_draft").record;
          legacy.schemaVersion = 2;
          await write(legacyDb, "drafts", legacy);
          const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
          await write(legacyDb, "source_blobs", { hash: "synthetic-hash", bytes });
          legacyDb.close();

          const upgradeReq = indexedDB.open(legacyDb.name, 3);
          upgradeReq.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("session_index")) db.createObjectStore("session_index", { keyPath: "id" });
            if (!db.objectStoreNames.contains("app_meta")) db.createObjectStore("app_meta", { keyPath: "key" });
          };
          const upgraded = await req(upgradeReq);
          await migration.migrateLegacyDraft(upgraded);
          const blob = await req(upgraded.transaction("source_blobs").objectStore("source_blobs").get("synthetic-hash"));
          findings.push({
            name: "real-v2-v3-upgrade",
            passed: upgraded.version === 3 && new Uint8Array(blob.bytes).join(",") === "1,2,3,4",
            version: upgraded.version,
            stores: [...upgraded.objectStoreNames],
          });
          upgraded.close();

          // R04: caught repository errors have no unhandled rejections
          await new Promise((resolve) => setTimeout(resolve, 200));
          findings.push({
            name: "caught-repository-errors-have-no-unhandled-rejections",
            expected: [],
            actual: unhandled,
            passed: unhandled.length === 0,
          });

          return { findings };
        })()`;

      const evalRes = await send("Runtime.evaluate", {
        awaitPromise: true,
        returnByValue: true,
        expression: evalScript,
      });

      if (evalRes.result?.exceptionDetails) {
        console.error("CDP Exception:", JSON.stringify(evalRes.result.exceptionDetails, null, 2));
      }
      const value = evalRes.result?.result?.value;
      assert.ok(value?.findings, `Audit evaluation returned no findings: ${JSON.stringify(evalRes)}`);

      for (const finding of value.findings) {
        assert.equal(
          finding.passed,
          true,
          `Failed finding ${finding.name}: expected ${JSON.stringify(finding.expected)}, got ${JSON.stringify(
            finding.actual
          )}${finding.error ? `\nError: ${finding.error}` : ""}`
        );
      }
    } finally {
      try {
        ws?.close();
      } catch {}
      try {
        browserProc?.kill();
      } catch {}
      try {
        serverProc.kill();
      } catch {}
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {}
    }
  });
});
