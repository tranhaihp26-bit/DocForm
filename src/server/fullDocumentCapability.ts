import type { ChatGPTClient, SessionState } from "../../vendor/openai/sign-in-with-chatgpt-devkit/packages/local/src/types.ts";
import type {
  FullDocumentAiCapability,
  FullDocumentAiFeature,
  FullDocumentAiFeatureEvidence,
  FullDocumentAiProviderCapability,
} from "../shared/fullDocumentAiProtocol.ts";
export { canStartFullDocumentReview } from "../shared/fullDocumentAiProtocol.ts";

type TextOnlyChatGPTClient = Pick<ChatGPTClient, "getSession" | "listModels">;

export interface AiProviderCapabilityOptions {
  chatgptClient?: TextOnlyChatGPTClient;
  /** The key is inspected only to report configuration; it is never returned or logged. */
  geminiApiKey?: string;
}

const CHATGPT_FEATURES: Record<FullDocumentAiFeature, FullDocumentAiFeatureEvidence> = {
  original_file_transfer: {
    status: "BLOCKED_BY_PROVIDER",
    reason: "Kết nối SIWC hiện tại chỉ cung cấp streamResponse cho nội dung văn bản; không có truyền DOCX dưới dạng file input.",
  },
  provider_file_read: {
    status: "BLOCKED_BY_PROVIDER",
    reason: "Không có file input được hỗ trợ nên chưa thể xác nhận ChatGPT đã nhận và đọc tệp gốc.",
  },
  code_read: {
    status: "BLOCKED_BY_PROVIDER",
    reason: "SDK SIWC hiện tại không cung cấp công cụ đọc ZIP/OOXML hoặc thực thi mã trên tệp.",
  },
  all_page_visual_review: {
    status: "BLOCKED_BY_PROVIDER",
    reason: "SDK SIWC hiện tại chỉ gửi văn bản; không có đầu vào PDF/trang ảnh cho kết nối ChatGPT plan này.",
  },
};

const GEMINI_FEATURES: Record<FullDocumentAiFeature, FullDocumentAiFeatureEvidence> = {
  original_file_transfer: {
    status: "NOT_VERIFIED",
    reason: "DocForm chưa tích hợp luồng gửi DOCX gốc tới Gemini; khả năng API ngoài ứng dụng không chứng minh luồng này đã chạy.",
  },
  provider_file_read: {
    status: "NOT_VERIFIED",
    reason: "Chưa có kiểm thử tổng hợp xác nhận Gemini đã nhận và đọc toàn bộ tệp nguồn.",
  },
  code_read: {
    status: "NOT_VERIFIED",
    reason: "DocForm chưa tích hợp công cụ Gemini Code Execution; công cụ Python hosted không thay parser OOXML local.",
  },
  all_page_visual_review: {
    status: "NOT_VERIFIED",
    reason: "Google có tài liệu về PDF vision nhưng DocForm chưa gửi PDF dựng local hoặc kiểm chứng đủ từng trang.",
  },
};

function safeSession(session: SessionState): NonNullable<FullDocumentAiProviderCapability["session"]> {
  return { status: session.status, sharing: session.sharing === true };
}

async function getChatGPTPlanCapability(
  client?: TextOnlyChatGPTClient,
): Promise<FullDocumentAiProviderCapability> {
  const session = client
    ? await client.getSession()
    : { status: "disconnected", sharing: false } as SessionState;
  let modelAvailable = false;
  if (client && session.status === "connected" && session.sharing) {
    try {
      const models = await client.listModels();
      modelAvailable = models.some(model => typeof model.slug === "string" && model.slug.trim().length > 0);
    } catch {
      modelAvailable = false;
    }
  }

  return {
    provider: "chatgpt-plan",
    transport: "Sign in with ChatGPT DevKit @siwc/local streamResponse (text-only)",
    configured: session.status === "connected" && session.sharing === true,
    textInput: {
      status: "SUPPORTED_BY_ADAPTER",
      reason: "SIWC streamResponse hỗ trợ nội dung văn bản; điều này không xác nhận full-text manifest đã được gửi.",
    },
    fullTextManifest: {
      status: "SUPPORTED_BY_ADAPTER",
      reason: "Endpoint local gửi manifest văn bản trích xuất theo consent và báo coverage từng đoạn qua SIWC streamResponse; đây không phải DOCX file input.",
    },
    session: safeSession(session),
    modelAvailable,
    oauthFileInputProbe: "NOT_VERIFIED",
    oauthFileInputProbeReason: "Không gửi DOCX thử nghiệm: SDK SIWC hiện tại không có thao tác file input được hỗ trợ.",
    features: structuredClone(CHATGPT_FEATURES),
    fullReviewStatus: "BLOCKED_BY_PROVIDER",
  };
}

function getGeminiCapability(apiKey: string): FullDocumentAiProviderCapability {
  const configured = apiKey.trim().length > 0;
  return {
    provider: "gemini",
    transport: "Existing server-side @google/genai integration (API key; text generation)",
    configured,
    textInput: {
      status: "SUPPORTED_BY_ADAPTER",
      reason: configured
        ? "DocForm có adapter Gemini phía máy chủ; cấu hình khóa không xác nhận API reachability, model/tier hoặc độ phủ tài liệu."
        : "Adapter Gemini tồn tại nhưng máy chủ chưa phát hiện khóa API đã cấu hình.",
    },
    fullTextManifest: {
      status: "SUPPORTED_BY_ADAPTER",
      reason: "Endpoint local gửi manifest văn bản trích xuất qua Gemini text API và báo coverage từng đoạn; cấu hình không xác nhận reachability, tier hoặc đọc DOCX gốc.",
    },
    modelAvailable: false,
    features: structuredClone(GEMINI_FEATURES),
    fullReviewStatus: configured ? "NOT_VERIFIED" : "BLOCKED_BY_PROVIDER",
    dataUseTier: {
      status: "NOT_VERIFIED",
      tier: "unknown",
      reason: "DocForm không xác định được Free/Paid Tier từ khóa API; cần kiểm tra dự án Google AI Studio/Cloud gắn với khóa.",
    },
  };
}

export async function getAiProviderCapabilities(
  options: AiProviderCapabilityOptions = {},
): Promise<FullDocumentAiCapability> {
  const chatgpt = await getChatGPTPlanCapability(options.chatgptClient);
  const gemini = getGeminiCapability(options.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "");
  return {
    ...chatgpt,
    providers: {
      "chatgpt-plan": chatgpt,
      gemini,
    },
  };
}

/** Backward-compatible name used by older local callers. */
export function getFullDocumentAiCapability(
  client?: TextOnlyChatGPTClient,
): Promise<FullDocumentAiCapability> {
  return getAiProviderCapabilities({ chatgptClient: client });
}
