export type FullDocumentAiProvider = "chatgpt-plan" | "gemini";

export type FullDocumentAiFeature =
  | "original_file_transfer"
  | "provider_file_read"
  | "code_read"
  | "all_page_visual_review";

export type FullDocumentAiFeatureStatus =
  | "PASS"
  | "FAIL"
  | "NOT_VERIFIED"
  | "BLOCKED_BY_PROVIDER"
  | "SUPPORTED_BY_ADAPTER";

export interface FullDocumentAiFeatureEvidence {
  status: FullDocumentAiFeatureStatus;
  reason: string;
}

export interface FullDocumentAiProviderCapability {
  provider: FullDocumentAiProvider;
  transport: string;
  configured: boolean;
  textInput: FullDocumentAiFeatureEvidence;
  fullTextManifest: FullDocumentAiFeatureEvidence;
  session?: {
    status: "disconnected" | "connecting" | "connected" | "reauth_required";
    sharing: boolean;
  };
  modelAvailable: boolean;
  oauthFileInputProbe?: "NOT_VERIFIED";
  oauthFileInputProbeReason?: string;
  features: Record<FullDocumentAiFeature, FullDocumentAiFeatureEvidence>;
  fullReviewStatus: FullDocumentAiFeatureStatus;
  dataUseTier?: {
    status: "NOT_VERIFIED";
    tier: "unknown";
    reason: string;
  };
}

/** Aggregate provider capability response. Top-level fields preserve the existing ChatGPT status view. */
export interface FullDocumentAiCapability extends FullDocumentAiProviderCapability {
  providers: Record<FullDocumentAiProvider, FullDocumentAiProviderCapability>;
}

export type VisualEvidenceFailureCode =
  | "source_hash_mismatch"
  | "invalid_source_sha"
  | "empty_source"
  | "source_too_large"
  | "renderer_unavailable"
  | "render_failed"
  | "pdf_page_count_unavailable"
  | "zero_pages"
  | "page_render_failed"
  | "page_count_mismatch"
  | "too_many_pages"
  | "pdf_too_large"
  | "cancelled"
  | "timeout";

export interface VisualEvidenceManifest {
  sourceSha256: string;
  rendererName: string;
  rendererVersion?: string;
  rasterizerName?: string;
  rasterizerVersion?: string;
  pdfSha256?: string;
  pageCount: number;
  pages: Array<{ page: number; sha256: string }>;
  complete: boolean;
  failureCode?: VisualEvidenceFailureCode;
}

export function canStartFullDocumentReview(
  capability: FullDocumentAiProviderCapability,
  fileSpecificConsent: boolean,
): boolean {
  return fileSpecificConsent === true &&
    capability.provider === "chatgpt-plan" &&
    capability.configured &&
    capability.session?.status === "connected" &&
    capability.session?.sharing === true &&
    capability.modelAvailable === true &&
    (Object.values(capability.features) as FullDocumentAiFeatureEvidence[])
      .every(feature => feature.status === "PASS");
}
