import type { PartitionAiProvider } from "../../src/server/aiPartitionService.ts";

export type PartitionAiMockMode = "success" | "partial" | "error";

function getPromptChunkIndex(prompt: string): number {
  const match = prompt.match(/Đang xử lý cụm\s+(\d+)\//);
  return match ? Number(match[1]) - 1 : 0;
}

function getPromptBlocks(prompt: string): Array<{ id: string; text: string }> {
  const match = prompt.match(/<danh_sach_khoi>\s*([\s\S]*?)\s*<\/danh_sach_khoi>/);
  if (!match) throw new Error("Synthetic provider could not read the test prompt manifest.");
  const blocks: unknown = JSON.parse(match[1]);
  if (!Array.isArray(blocks)) throw new Error("Synthetic provider received an invalid test manifest.");
  return blocks as Array<{ id: string; text: string }>;
}

function waitForSyntheticPartial(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, 650);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Synthetic provider aborted.", "AbortError"));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** A synthetic provider used only by the isolated browser test server. */
export function createPartitionAiMockProvider(mode: PartitionAiMockMode): PartitionAiProvider {
  return async (prompt, signal) => {
    const chunkIndex = getPromptChunkIndex(prompt);
    if (mode === "error" || (mode === "partial" && chunkIndex > 0)) {
      if (mode === "partial") await waitForSyntheticPartial(signal);
      throw new Error("Synthetic partition provider failure.");
    }

    const target = getPromptBlocks(prompt).find(block => block.text.includes("FULL_SOURCE_MARKER"));
    const proposals = target ? [{
      sourceBlockId: target.id,
      suggestedRole: "appendix",
      exactQuote: target.text,
      reason: "Nội dung nguồn tổng hợp dùng để kiểm tra giao diện.",
      confidence: "high",
    }] : [];
    return {
      text: JSON.stringify({ schemaVersion: 1, proposals }),
      model: "synthetic-partition-provider",
    };
  };
}
