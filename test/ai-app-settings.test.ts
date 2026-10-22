import test from "node:test";
import assert from "node:assert/strict";
import { loadAiApplicationSettings, saveAiDefaultProvider } from "../src/utils/aiAppSettings.ts";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("AI application settings persist only the default provider across sessions", () => {
  const storage = createStorage();

  assert.equal(loadAiApplicationSettings(storage).defaultProvider, "gemini");
  assert.equal(saveAiDefaultProvider("chatgpt", storage), true);
  assert.deepEqual(loadAiApplicationSettings(storage), {
    defaultProvider: "chatgpt",
    preferencePersisted: true,
    storageAvailable: true,
  });
  const saved = JSON.parse(storage.getItem("docform.ai-settings.v1") ?? "null");
  assert.deepEqual(saved, { version: 1, defaultProvider: "chatgpt" });
  assert.equal("sourceConsent" in saved, false);
});

test("AI application settings ignore unknown versions/providers and keep Gemini as the safe default", () => {
  const futureVersion = createStorage({
    "docform.ai-settings.v1": JSON.stringify({ version: 2, defaultProvider: "chatgpt" }),
  });
  assert.equal(loadAiApplicationSettings(futureVersion).defaultProvider, "gemini");

  const unknownProvider = createStorage({
    "docform.ai-settings.v1": JSON.stringify({ version: 1, defaultProvider: "unknown" }),
  });
  assert.equal(loadAiApplicationSettings(unknownProvider).defaultProvider, "gemini");
});

test("AI application settings fall back safely when browser storage is unavailable", () => {
  const unavailableStorage = {
    getItem: () => { throw new Error("storage blocked"); },
    setItem: () => { throw new Error("storage blocked"); },
  };
  assert.deepEqual(loadAiApplicationSettings(unavailableStorage), {
    defaultProvider: "gemini",
    preferencePersisted: false,
    storageAvailable: false,
  });
  assert.equal(saveAiDefaultProvider("chatgpt", unavailableStorage), false);
});
