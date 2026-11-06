import OpenAI from "openai";

export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
const CONNECTION_TEST_PROMPT = "Reply with exactly DOCFORM_API_CONNECTION_OK.";
const CONNECTION_TEST_TIMEOUT_MS = 15_000;

export type OpenAiApiErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "cancelled"
  | "empty_response"
  | "provider_error";

const SAFE_ERROR_MESSAGES: Record<OpenAiApiErrorCode, string> = {
  not_configured: "OpenAI API chưa được cấu hình trên máy chủ local.",
  invalid_credentials: "OpenAI API từ chối khóa đã cấu hình. Hãy kiểm tra lại khóa và quyền truy cập.",
  rate_limited: "OpenAI API đang giới hạn lượt gọi. Hãy thử lại sau.",
  provider_unavailable: "OpenAI API hiện không khả dụng. Hãy thử lại sau.",
  timeout: "OpenAI API không phản hồi trong thời gian cho phép.",
  cancelled: "Yêu cầu OpenAI API đã bị hủy.",
  empty_response: "OpenAI API không trả về nội dung có thể sử dụng.",
  provider_error: "Không thể hoàn tất yêu cầu OpenAI API.",
};

export class OpenAiApiProviderError extends Error {
  constructor(public readonly code: OpenAiApiErrorCode, public readonly statusCode: number) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "OpenAiApiProviderError";
  }
}

export interface OpenAiResponsesRequest {
  model: string;
  input: string;
  store: false;
  text?: { format: { type: "json_object" } };
}

export interface OpenAiResponsesClient {
  responses: {
    create(
      request: OpenAiResponsesRequest,
      options?: { signal?: AbortSignal },
    ): Promise<{ output_text?: string | null; model?: string | null }>;
  };
}

export interface OpenAiApiProviderOptions {
  /** API keys are supplied only by server configuration or synthetic tests. */
  apiKey?: string;
  model?: string;
  format?: "text" | "json";
  client?: OpenAiResponsesClient;
}

export type OpenAiApiTextProvider = (
  prompt: string,
  signal: AbortSignal,
) => Promise<{ text: string; model: string }>;

function configuredModel(model?: string): string {
  return model?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function safeProviderError(error: unknown): OpenAiApiProviderError {
  if (error instanceof OpenAiApiProviderError) return error;
  const value = error as { status?: unknown; statusCode?: unknown; name?: unknown } | null;
  if (value?.name === "AbortError" || value?.name === "TimeoutError") {
    return new OpenAiApiProviderError(value.name === "TimeoutError" ? "timeout" : "cancelled", value.name === "TimeoutError" ? 504 : 499);
  }
  const status = Number(value?.status ?? value?.statusCode);
  if (status === 401 || status === 403) return new OpenAiApiProviderError("invalid_credentials", 502);
  if (status === 429) return new OpenAiApiProviderError("rate_limited", 503);
  if (Number.isFinite(status) && status >= 500) return new OpenAiApiProviderError("provider_unavailable", 503);
  return new OpenAiApiProviderError("provider_error", 503);
}

/** Create a server-side, abortable Responses API text provider. */
export function createOpenAiApiProvider(options: OpenAiApiProviderOptions = {}): OpenAiApiTextProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const model = configuredModel(options.model);
  let client = options.client;

  return async (prompt, signal) => {
    if (!apiKey.trim()) throw new OpenAiApiProviderError("not_configured", 503);
    if (typeof prompt !== "string" || !prompt.trim()) throw new OpenAiApiProviderError("provider_error", 400);
    if (signal.aborted) throw new OpenAiApiProviderError("cancelled", 499);

    client ??= new OpenAI({ apiKey: apiKey.trim() }) as unknown as OpenAiResponsesClient;
    const request: OpenAiResponsesRequest = {
      model,
      input: prompt,
      store: false,
      ...(options.format === "json" ? { text: { format: { type: "json_object" as const } } } : {}),
    };

    try {
      const response = await client.responses.create(request, { signal });
      const text = response.output_text?.trim() ?? "";
      if (!text) throw new OpenAiApiProviderError("empty_response", 502);
      return { text, model: response.model?.trim() || model };
    } catch (error) {
      throw safeProviderError(error);
    }
  };
}

/** Verify only the configured connection with a fixed synthetic phrase; no caller text is accepted. */
export async function testOpenAiApiConnection(
  options: Omit<OpenAiApiProviderOptions, "format"> = {},
): Promise<{ model: string; latencyMs: number }> {
  const provider = createOpenAiApiProvider({ ...options, format: "text" });
  const start = Date.now();
  const result = await provider(CONNECTION_TEST_PROMPT, AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS));
  return { model: result.model, latencyMs: Date.now() - start };
}
