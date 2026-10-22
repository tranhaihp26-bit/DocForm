import type { ChatGPTClient } from "../../vendor/openai/sign-in-with-chatgpt-devkit/packages/local/src/types.ts";

type TextClient = Pick<ChatGPTClient, "getSession" | "listModels" | "streamResponse">;

export class ChatGPTPlanProviderError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number) {
    super(code);
    this.name = "ChatGPTPlanProviderError";
  }
}

export interface LocalChatGPTActionRequest {
  host?: string;
  origin?: string;
  port: number;
  consent: unknown;
}

export function isLocalChatGPTActionRequest(request: LocalChatGPTActionRequest): boolean {
  if (request.consent !== true || !Number.isInteger(request.port) || request.port < 1 || request.port > 65535) return false;
  const allowedHosts = new Set([`localhost:${request.port}`, `127.0.0.1:${request.port}`]);
  if (!request.host || !request.origin || !allowedHosts.has(request.host)) return false;
  try {
    const origin = new URL(request.origin);
    return origin.protocol === "http:" && origin.host === request.host && origin.origin === request.origin;
  } catch {
    return false;
  }
}

export async function createChatGPTPlanProvider(
  client: TextClient,
  signal: AbortSignal,
): Promise<(prompt: string, signal: AbortSignal) => Promise<{ text: string; model: string }>> {
  signal.throwIfAborted();
  const session = await client.getSession();
  if (session.status !== "connected") throw new ChatGPTPlanProviderError("sign_in_required", 401);
  if (!session.sharing) throw new ChatGPTPlanProviderError("sharing_not_enabled", 403);
  const models = await client.listModels({ signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  const model = models.find(item => typeof item.slug === "string" && item.slug.length > 0);
  if (!model) throw new ChatGPTPlanProviderError("model_unavailable", 503);
  return async (prompt, requestSignal) => {
    requestSignal.throwIfAborted();
    const response = await client.streamResponse({ model: model.slug, input: prompt, signal: requestSignal });
    return { text: response.text, model: model.slug };
  };
}
