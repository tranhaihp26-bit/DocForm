import type { PartitionAiProviderKind } from "../shared/partitionAiProtocol.ts";

const STORAGE_KEY = "docform.ai-settings.v1";
const SETTINGS_VERSION = 1;

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export interface AiApplicationSettings {
  defaultProvider: PartitionAiProviderKind;
  preferencePersisted: boolean;
  storageAvailable: boolean;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadAiApplicationSettings(storage: KeyValueStorage | null = browserStorage()): AiApplicationSettings {
  if (!storage) {
    return { defaultProvider: "gemini", preferencePersisted: false, storageAvailable: false };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { defaultProvider: "gemini", preferencePersisted: false, storageAvailable: true };
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" && value !== null &&
      "version" in value && value.version === SETTINGS_VERSION &&
      "defaultProvider" in value &&
      (value.defaultProvider === "gemini" || value.defaultProvider === "chatgpt")
    ) {
      return { defaultProvider: value.defaultProvider, preferencePersisted: true, storageAvailable: true };
    }
    return { defaultProvider: "gemini", preferencePersisted: false, storageAvailable: true };
  } catch {
    return { defaultProvider: "gemini", preferencePersisted: false, storageAvailable: false };
  }
}

export function saveAiDefaultProvider(
  provider: PartitionAiProviderKind,
  storage: KeyValueStorage | null = browserStorage(),
): boolean {
  if (!storage || (provider !== "gemini" && provider !== "chatgpt")) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: SETTINGS_VERSION, defaultProvider: provider }));
    return true;
  } catch {
    return false;
  }
}
