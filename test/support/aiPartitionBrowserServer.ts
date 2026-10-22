import { startServer } from "../../server.ts";
import { createPartitionAiMockProvider, type PartitionAiMockMode } from "./partitionAiMockProvider.ts";

const allowedModes = new Set<PartitionAiMockMode>(["success", "partial", "error"]);

void startServer({
  partitionAiProviderFactory: request => {
    const mode = request.get("x-docform-test-ai-mode");
    return allowedModes.has(mode as PartitionAiMockMode)
      ? createPartitionAiMockProvider(mode as PartitionAiMockMode)
      : undefined;
  },
});
