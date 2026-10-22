import { startServer } from "../../server.ts";

const allowedModes = new Set(["success", "partial"]);

void startServer({
  fullTextAiProviderFactory: request => {
    const mode = request.get("x-docform-test-full-text-mode");
    if (!allowedModes.has(mode ?? "")) return undefined;
    return async prompt => {
      const instructionOffset = prompt.indexOf("\nINSTRUCTIONS\n");
      if (instructionOffset < 0) throw new Error("Synthetic full-text provider received an invalid prompt.");
      const envelope = JSON.parse(prompt.slice(0, instructionOffset));
      if (envelope.marker === "SYNTHESIS_ONLY_VALIDATED_OBSERVATIONS") {
        return { model: "synthetic-full-text-provider", text: JSON.stringify({
          schemaVersion: 1, sourceSha256: envelope.sourceSha256, sourceGeneration: envelope.sourceGeneration, crossReferences: [],
        }) };
      }
      if (mode === "partial") throw new Error("Synthetic full-text provider failure.");
      const primaryStart = prompt.indexOf("PRIMARY_SEGMENTS_JSON\n") + "PRIMARY_SEGMENTS_JSON\n".length;
      const primaryEnd = prompt.indexOf("\nCONTEXT_SEGMENTS_JSON", primaryStart);
      const primary = JSON.parse(prompt.slice(primaryStart, primaryEnd));
      return { model: "synthetic-full-text-provider", text: JSON.stringify({
        schemaVersion: 1, sourceSha256: envelope.sourceSha256, sourceGeneration: envelope.sourceGeneration,
        chunkId: envelope.chunkId,
        segmentResults: primary.map((segment: { id: string }) => ({ segmentId: segment.id, status: "no_finding", observations: [] })),
      }) };
    };
  },
});
