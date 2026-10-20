/**
 * @file sourceMismatch.ts
 * @description Chặng 3 — suy luận nguồn đã chọn và các mâu thuẫn nguồn ↔ lựa chọn
 * (loại văn bản, mẫu cơ quan, hệ thể thức của mẫu) từ dữ liệu thật của phiên.
 *
 * Tách khỏi `ImportStepView`/`App` để Bước 1 hiển thị và cổng xuất dùng **cùng một**
 * phép suy luận. Nếu hai nơi tự tính riêng, cổng có thể cho xuất một tài liệu mà
 * giao diện vẫn đang cảnh báo mâu thuẫn (đúng lỗi S3-F01).
 */
import type { StructuredImport } from "../shared/schemas/document.schema.ts";
import type { OriginalDocumentSnapshot } from "./draftStore.ts";

export type SourceOrigin = "none" | "uploaded_file" | "system_template";

/** Phần tối thiểu của `TemplatePreset` mà phép suy luận cần. */
export interface SourceTemplateLike {
  id: string;
  type: "state" | "party";
  defaultData: {
    documentType: string;
    orgHeader1: string;
    orgHeader2: string;
  };
}

/**
 * Quyết định của người dùng khi nguồn và loại văn bản đang chọn khác nhau.
 * Đây là provenance: ai/quyết định gì/lúc nào, để không xuất một cách âm thầm.
 */
export interface DocTypeDecision {
  sourceDocType: string;
  chosenDocType: string;
  regime: "state" | "party";
  decidedAt: string;
}

export interface SourceMismatchInput {
  hasSelectedSource: boolean;
  hasImportedFile: boolean;
  structuredImport: StructuredImport | null;
  originalSnapshot: OriginalDocumentSnapshot | null | undefined;
  templates: readonly SourceTemplateLike[];
  isCompanyProfile: boolean;
  chosenRegime: "state" | "party";
  chosenDocType: string;
}

export interface SourceMismatchResult {
  sourceDocType: string;
  chosenDocType: string;
  docTypeMismatch: boolean;
  profileMismatch: boolean;
  templateMismatch: boolean;
}

/** Mẫu hệ thống đang là nguồn (suy từ snapshot, không suy từ tên tệp). */
export function findAppliedTemplate<T extends SourceTemplateLike>(
  templates: readonly T[],
  originalSnapshot: OriginalDocumentSnapshot | null | undefined,
): T | null {
  if (!originalSnapshot || originalSnapshot.sourceType !== "system_template") return null;
  const sourceId = originalSnapshot.sourceId;
  if (!sourceId) return null;
  return templates.find((t) => t.id === sourceId) ?? null;
}

export function deriveSourceMismatch(input: SourceMismatchInput): SourceMismatchResult {
  const appliedTemplate = findAppliedTemplate(input.templates, input.originalSnapshot);

  const sourceDocType = (
    input.structuredImport?.fields?.documentType?.value ||
    appliedTemplate?.defaultData.documentType ||
    ""
  )
    .toUpperCase()
    .trim();
  const chosenDocType = (input.chosenDocType || "").toUpperCase().trim();

  const docTypeMismatch = Boolean(
    input.hasSelectedSource && sourceDocType && chosenDocType && sourceDocType !== chosenDocType,
  );

  const sourceOrgHeader =
    input.structuredImport?.fields?.orgHeader1?.value ||
    (appliedTemplate
      ? `${appliedTemplate.defaultData.orgHeader1} ${appliedTemplate.defaultData.orgHeader2}`
      : "");
  const sourceLooksCompany = /HOA TIÊU/i.test(sourceOrgHeader);
  const profileMismatch = Boolean(
    input.hasImportedFile && input.structuredImport && sourceLooksCompany !== input.isCompanyProfile,
  );

  const appliedTemplateRegime = appliedTemplate?.type ?? null;
  const templateMismatch = Boolean(appliedTemplateRegime && appliedTemplateRegime !== input.chosenRegime);

  return { sourceDocType, chosenDocType, docTypeMismatch, profileMismatch, templateMismatch };
}

/** Quyết định override chỉ có hiệu lực cho đúng cặp nguồn/loại/hệ đã được xác nhận. */
export function docTypeDecisionCovers(
  decision: DocTypeDecision | null | undefined,
  mismatch: SourceMismatchResult,
  chosenRegime: "state" | "party",
): boolean {
  if (!decision) return false;
  if (!mismatch.docTypeMismatch) return false;
  return (
    decision.sourceDocType === mismatch.sourceDocType &&
    decision.chosenDocType === mismatch.chosenDocType &&
    decision.regime === chosenRegime
  );
}

export interface DraftSourceLike {
  sourceOrigin?: SourceOrigin;
  originalSnapshot?: OriginalDocumentSnapshot | null;
  uploadedFileName?: string;
  uploadedBlocks?: unknown[] | null;
  reviewBlocks?: unknown[] | null;
  structuredImport?: unknown;
}

/**
 * Chặng 3 — đọc nguồn của một bản nháp, kể cả bản nháp tạo **trước** Chặng 3
 * (không có `sourceOrigin`).
 *
 * Thứ tự bằng chứng (S3-F02): snapshot gốc quyết định trước; tên tệp chỉ được dùng
 * khi không có snapshot **và** có bằng chứng khối nhập thật. Trước đây suy từ tên tệp
 * trước nên bản nháp mẫu (vốn cũng có `uploadedFileName` = tên mẫu, `reviewBlocks: []`,
 * `structuredImport: null`) bị nhận nhầm thành tệp nhập và bị khóa bước Xuất.
 */
export function inferDraftSourceOrigin(draft: DraftSourceLike): SourceOrigin {
  if (draft.sourceOrigin === "none" || draft.sourceOrigin === "uploaded_file" || draft.sourceOrigin === "system_template") {
    return draft.sourceOrigin;
  }

  const snapshotType = draft.originalSnapshot?.sourceType;
  if (snapshotType === "system_template") return "system_template";
  if (snapshotType === "uploaded_file") return "uploaded_file";

  const hasImportedEvidence =
    (Array.isArray(draft.reviewBlocks) && draft.reviewBlocks.length > 0) ||
    (Array.isArray(draft.uploadedBlocks) && draft.uploadedBlocks.length > 0) ||
    Boolean(draft.structuredImport);

  return hasImportedEvidence && draft.uploadedFileName ? "uploaded_file" : "none";
}
