import { createHash } from "node:crypto";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export interface LocalSourceVisualRequestEnvelope {
  host?: string;
  origin?: string;
  remoteAddress?: string;
  port: number;
  cloudRun: boolean;
  contentType?: string;
  expectedSha256?: string;
  sourceGeneration: number;
  sourceBytes?: Uint8Array;
}

export type LocalSourceVisualRequestValidation =
  | { valid: true; sourceSha256: string; sourceGeneration: number }
  | { valid: false; reason: string };

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function validateLocalSourceVisualRequest(
  request: LocalSourceVisualRequestEnvelope,
): LocalSourceVisualRequestValidation {
  if (request.cloudRun) return { valid: false, reason: "cloud_disabled" };
  if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535 ||
      !isLoopbackAddress(request.remoteAddress)) return { valid: false, reason: "origin_not_local" };
  const allowedHosts = new Set([`localhost:${request.port}`, `127.0.0.1:${request.port}`]);
  if (!request.host || !request.origin || !allowedHosts.has(request.host)) {
    return { valid: false, reason: "origin_not_local" };
  }
  try {
    const origin = new URL(request.origin);
    if (origin.protocol !== "http:" || origin.host !== request.host || origin.origin !== request.origin) {
      return { valid: false, reason: "origin_not_local" };
    }
  } catch {
    return { valid: false, reason: "origin_not_local" };
  }
  if ((request.contentType ?? "").split(";", 1)[0].trim().toLowerCase() !== DOCX_MIME_TYPE) {
    return { valid: false, reason: "unsupported_media_type" };
  }
  if (!Number.isSafeInteger(request.sourceGeneration) || request.sourceGeneration < 0) {
    return { valid: false, reason: "invalid_source_generation" };
  }
  if (!request.expectedSha256 || !/^[a-f0-9]{64}$/i.test(request.expectedSha256)) {
    return { valid: false, reason: "invalid_source_sha" };
  }
  if (!(request.sourceBytes instanceof Uint8Array) || request.sourceBytes.byteLength === 0) {
    return { valid: false, reason: "empty_source" };
  }
  if (request.sourceBytes.byteLength > MAX_SOURCE_BYTES) {
    return { valid: false, reason: "source_too_large" };
  }

  const sourceSha256 = createHash("sha256").update(request.sourceBytes).digest("hex");
  if (sourceSha256 !== request.expectedSha256.toLowerCase()) {
    return { valid: false, reason: "source_hash_mismatch" };
  }
  return { valid: true, sourceSha256, sourceGeneration: request.sourceGeneration };
}
