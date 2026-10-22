import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocumentSessionGate,
  type AiRequestKind,
} from "../src/utils/documentSessionGate.ts";

test("Task 1.1: old token expires after invalidate() and aborts active signal", () => {
  const gate = createDocumentSessionGate();
  const token = gate.begin("partition");

  assert.equal(gate.isCurrent(token), true, "Newly created token must be current");
  assert.equal(token.signal.aborted, false, "Signal must not be aborted initially");

  const nextEpoch = gate.invalidate();
  assert.ok(nextEpoch > token.epoch, "invalidate() must increment epoch monotonically");
  assert.equal(gate.isCurrent(token), false, "Old token must expire after invalidate()");
  assert.equal(token.signal.aborted, true, "invalidate() must abort in-flight signal");
});

test("Task 1.2: new request of the same kind aborts the previous one and increments requestId monotonically", () => {
  const gate = createDocumentSessionGate();
  const t1 = gate.begin("partition");
  const t2 = gate.begin("partition");

  assert.equal(t2.epoch, t1.epoch, "Same session epoch when only starting another request of same kind");
  assert.equal(t2.requestId, t1.requestId + 1, "Request IDs must increase monotonically by 1");
  assert.equal(t1.signal.aborted, true, "Starting t2 must abort t1 of the same kind");
  assert.equal(gate.isCurrent(t1), false, "t1 is superseded by t2");
  assert.equal(gate.isCurrent(t2), true, "t2 is now current");
});

test("Task 1.3: request kinds ('partition' and 'review') have independent controllers within the same epoch", () => {
  const gate = createDocumentSessionGate();
  const partToken = gate.begin("partition");
  const revToken = gate.begin("review");

  assert.equal(gate.isCurrent(partToken), true, "Partition token remains current when review starts");
  assert.equal(gate.isCurrent(revToken), true, "Review token is current");
  assert.equal(partToken.signal.aborted, false, "Partition signal is not aborted by review request");
  assert.equal(revToken.signal.aborted, false, "Review signal is not aborted");

  // Starting a second partition request only aborts the first partition request, not the review request
  const partToken2 = gate.begin("partition");
  assert.equal(partToken.signal.aborted, true);
  assert.equal(gate.isCurrent(partToken), false);
  assert.equal(gate.isCurrent(partToken2), true);
  assert.equal(revToken.signal.aborted, false, "Review signal must still be active");
  assert.equal(gate.isCurrent(revToken), true, "Review token must still be current");

  // invalidate() aborts both kinds at once
  gate.invalidate();
  assert.equal(partToken2.signal.aborted, true);
  assert.equal(revToken.signal.aborted, true);
  assert.equal(gate.isCurrent(partToken2), false);
  assert.equal(gate.isCurrent(revToken), false);
});

test("Task 1.4: re-upload of identical source (calling invalidate) still expires old token and prevents stale completion from touching new spinner", () => {
  const gate = createDocumentSessionGate();

  // Upload 1 of file A -> starts partition check
  const tokenUpload1 = gate.begin("partition");
  assert.equal(gate.isCurrent(tokenUpload1), true);

  // User re-uploads the exact same file A (same hash/filename/blocks) -> triggers invalidate()
  gate.invalidate();
  assert.equal(gate.isCurrent(tokenUpload1), false, "Token from first upload of file A must expire on re-upload");

  // User starts partition check on the second upload of file A
  const tokenUpload2 = gate.begin("partition");
  assert.equal(gate.isCurrent(tokenUpload2), true);

  // Now the delayed catch/finally of tokenUpload1 runs:
  let isCheckingPartitions = true;
  if (gate.isCurrent(tokenUpload1)) {
    isCheckingPartitions = false; // Must NOT execute!
  }
  assert.equal(
    isCheckingPartitions,
    true,
    "Stale finally from upload 1 must NOT turn off upload 2's spinner"
  );

  // When tokenUpload2 finishes:
  if (gate.isCurrent(tokenUpload2)) {
    isCheckingPartitions = false;
  }
  assert.equal(isCheckingPartitions, false, "Current token can turn off its own spinner");
});

test("Task 1.5: upload token is bound to regime contextKey and invalidated by regime switch, template, or restore", () => {
  const gate = createDocumentSessionGate();
  const uploadToken = gate.begin("upload", "state");

  assert.equal(gate.isCurrent(uploadToken, "state"), true);
  assert.equal(
    gate.isCurrent(uploadToken, "party"),
    false,
    "Upload started under 'state' must not be valid if active regime changed to 'party'"
  );

  // Regime switch / template / version restore calls invalidate()
  gate.invalidate();
  assert.equal(gate.isCurrent(uploadToken, "state"), false);
  assert.equal(uploadToken.signal.aborted, true);
});

test("Task 1.6: draft_restore token is cancelled by cancelKind('draft_restore') or invalidate() when user interacts after mount", () => {
  const gate = createDocumentSessionGate();
  const restoreToken = gate.begin("draft_restore");
  assert.equal(gate.isCurrent(restoreToken), true);

  // User edits a field or selects a template before loadDraft() resolves
  gate.cancelKind("draft_restore");
  assert.equal(gate.isCurrent(restoreToken), false, "Late loadDraft() must not commit after user interaction");
  assert.equal(restoreToken.signal.aborted, true);
});
