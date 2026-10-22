export interface BoundedTaskOptions<R> {
  concurrency?: number;
  signal?: AbortSignal;
  onResult?: (result: R, index: number) => void;
}

/** Runs independent chunks with bounded concurrency and returns results in input order. */
export async function runBoundedTasks<T, R>(
  tasks: readonly T[],
  runTask: (task: T, index: number, total: number) => Promise<R>,
  options: BoundedTaskOptions<R> = {},
): Promise<R[]> {
  if (options.signal?.aborted) throw new Error("AI chunk request was cancelled.");
  if (tasks.length === 0) return [];

  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency ?? 2)));
  const results = new Array<R>(tasks.length);
  let nextIndex = 0;
  const worker = async () => {
    while (!options.signal?.aborted) {
      const index = nextIndex++;
      if (index >= tasks.length) return;
      const result = await runTask(tasks[index], index, tasks.length);
      results[index] = result;
      try { options.onResult?.(result, index); } catch { /* progress UI must not change task outcome */ }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  if (options.signal?.aborted) throw new Error("AI chunk request was cancelled.");
  return results;
}
