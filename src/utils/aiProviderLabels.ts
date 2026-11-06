import type { PartitionAiProviderKind } from "../shared/partitionAiProtocol.ts";

export type AiApiProviderKind = Extract<PartitionAiProviderKind, "gemini" | "openai_api">;
export interface AiApiConnectionStatus {
  state: "idle" | "checking" | "connected" | "error";
  message: string;
}

export function aiProviderDisplayName(provider: PartitionAiProviderKind): string {
  switch (provider) {
    case "openai_api": return "OpenAI API";
    case "chatgpt": return "ChatGPT plan · local";
    default: return "Gemini API";
  }
}

export type AiProviderResultSource = "gemini_ai" | "openai_api_ai" | "chatgpt_ai";

export function aiProviderResultSource(provider: PartitionAiProviderKind): AiProviderResultSource {
  switch (provider) {
    case "openai_api": return "openai_api_ai";
    case "chatgpt": return "chatgpt_ai";
    default: return "gemini_ai";
  }
}

export function aiProviderResultLabel(source: AiProviderResultSource): string {
  switch (source) {
    case "openai_api_ai": return "OpenAI API";
    case "chatgpt_ai": return "ChatGPT plan";
    default: return "Gemini AI";
  }
}
