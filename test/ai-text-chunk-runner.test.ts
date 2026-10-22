import test from "node:test";
import assert from "node:assert/strict";

const api = await import("../src/server/aiTextChunkRunner.ts").catch(() => undefined) as any;

test("bounded task runner respects concurrency while preserving result order", async () => {
  assert.ok(api?.runBoundedTasks, "shared bounded chunk runner must exist");
  let active = 0;
  let peak = 0;
  const progress: number[] = [];
  const result = await api.runBoundedTasks([0, 1, 2, 3], async (item: number) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, item === 0 ? 24 : 2));
    active -= 1;
    return item * 10;
  }, { concurrency: 2, onResult: (_value: number, index: number) => progress.push(index) });
  assert.equal(peak, 2);
  assert.deepEqual(result, [0, 10, 20, 30]);
  assert.deepEqual([...progress].sort(), [0, 1, 2, 3]);
});

test("bounded task runner stops scheduling after cancellation", async () => {
  assert.ok(api?.runBoundedTasks, "shared bounded chunk runner must exist");
  const controller = new AbortController();
  const started: number[] = [];
  await assert.rejects(api.runBoundedTasks([0, 1, 2, 3], async (item: number) => {
    started.push(item);
    if (item === 0) controller.abort();
    await Promise.resolve();
    return item;
  }, { concurrency: 1, signal: controller.signal }), /cancel/i);
  assert.deepEqual(started, [0]);
});
