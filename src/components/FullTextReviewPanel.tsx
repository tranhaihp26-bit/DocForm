import React from "react";
import { AlertTriangle, CheckCircle2, FileText, LoaderCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import type {
  FullTextAiProviderKind,
  FullTextChunkResult,
  FullTextManifest,
  FullTextReviewCoverage,
} from "../shared/fullDocumentTextProtocol.ts";
import type { FullTextReviewServerResponse } from "../utils/fullTextReviewClient.ts";

export type FullTextManifestUiStatus = "idle" | "building" | "ready" | "error";
export type FullTextReviewUiStatus = "idle" | "reviewing" | "complete" | "partial" | "error" | "cancelled";

export interface FullTextReviewPanelProps {
  provider: FullTextAiProviderKind;
  providerReady: boolean;
  providerReadinessReason: string;
  providerTierNotice: string;
  sourceSha256: string;
  sourceGeneration: number;
  sourceIsDocx: boolean;
  manifestStatus: FullTextManifestUiStatus;
  manifest: FullTextManifest | null;
  manifestError?: string;
  onPrepareManifest: () => void;
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  reviewStatus: FullTextReviewUiStatus;
  reviewProvider?: FullTextAiProviderKind;
  chunks: FullTextChunkResult[];
  coverage?: FullTextReviewCoverage;
  response?: FullTextReviewServerResponse | null;
  reviewError?: string;
  onStart: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
}

const providerName = (provider: FullTextAiProviderKind) => provider === "gemini"
  ? "Gemini API hiện có"
  : "ChatGPT plan qua máy chủ local";

const chunkStatusLabel: Record<FullTextChunkResult["status"], string> = {
  completed: "Có phản hồi đầy đủ",
  partial: "Có một phần phản hồi",
  failed: "Lỗi",
  timed_out: "Hết thời gian chờ",
  invalid_response: "Phản hồi sai cấu trúc",
  preflight_failed: "Vượt giới hạn trước khi gửi",
};

const reviewStatusLabel: Record<FullTextReviewUiStatus, string> = {
  idle: "Chưa gửi văn bản",
  reviewing: "Đang rà soát",
  complete: "Đã nhận phản hồi cho toàn bộ đoạn được chọn",
  partial: "Coverage một phần; còn đoạn chưa có phản hồi",
  error: "Rà soát thất bại",
  cancelled: "Đã hủy rà soát",
};

export function FullTextReviewPanel({
  provider, providerReady, providerReadinessReason, providerTierNotice, sourceSha256, sourceGeneration,
  sourceIsDocx, manifestStatus, manifest, manifestError, onPrepareManifest, consentChecked, onConsentChange,
  reviewStatus, reviewProvider, chunks, coverage, response, reviewError, onStart, onCancel, onRetryFailed,
}: FullTextReviewPanelProps) {
  const canConsent = Boolean(manifest && manifest.sourceSha256 === sourceSha256 && manifest.sourceGeneration === sourceGeneration && providerReady);
  const hasFailedSegments = (coverage?.semanticResponse.failedSegmentIds.length ?? 0) > 0 && Boolean(response) &&
    response?.provider === provider && response?.sourceSha256 === sourceSha256 &&
    response?.sourceGeneration === sourceGeneration && response?.manifestSha256 === manifest?.manifestSha256 &&
    reviewProvider === provider;
  const reviewedCount = coverage
    ? coverage.semanticResponse.reviewedSegmentIds.length + coverage.semanticResponse.noFindingSegmentIds.length + coverage.semanticResponse.unsupportedSegmentIds.length
    : 0;
  const active = reviewStatus === "reviewing";
  const consentText = manifest
    ? `Cho phép gửi ${manifest.segments.length} đoạn văn trích xuất thuộc ${manifest.parts.filter(part => part.segmentIds.length > 0).length} phần DOCX, bằng ${providerName(provider)}. Các phần được gửi và bị loại trừ được liệt kê bên trên.`
    : `Cho phép gửi toàn bộ văn bản trích xuất bằng ${providerName(provider)}.`;

  return <section className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3" data-testid="full-text-review-panel" aria-labelledby="full-text-review-heading">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 id="full-text-review-heading" className="flex items-center gap-1.5 text-sm font-bold text-[#17233D]"><FileText size={16}/> Rà soát toàn văn đã trích xuất</h3>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#52607A]">
          DocForm đọc OOXML trên máy này để lập danh mục văn bản có thể trích xuất. Chỉ gửi văn bản sau khi bạn kiểm tra phạm vi, bật consent riêng và nhấn nút gửi.
        </p>
      </div>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">Phạm vi: all_extracted_text</span>
    </div>

    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Nhà cung cấp đang chọn: {providerName(provider)}</strong>
        <span role="status" className={providerReady ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>
          {providerReady ? "Sẵn sàng theo cấu hình hiện có" : "Chưa sẵn sàng"}
        </span>
      </div>
      {!providerReady && <p className="mt-1 text-amber-900">{providerReadinessReason}</p>}
      <p className="mt-1 text-slate-600">{providerTierNotice}</p>
      <p className="mt-1 text-slate-600">DocForm không xác nhận chính sách lưu giữ phía nhà cung cấp và không thể xóa bản sao phía họ. Gói Gemini hiện dùng chưa được xác minh là Free Tier.</p>
    </div>

    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" onClick={onPrepareManifest} disabled={!sourceIsDocx || !sourceSha256 || manifestStatus === "building" || active}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-800 disabled:opacity-50">
        {manifestStatus === "building" ? <LoaderCircle className="animate-spin" size={14}/> : <FileText size={14}/>}
        {manifestStatus === "building" ? "Đang kiểm kê trên máy…" : manifest ? "Kiểm kê lại văn bản trích xuất trên máy" : "Kiểm kê văn bản trích xuất trên máy"}
      </button>
      {!sourceIsDocx && <span className="text-xs text-amber-800">Rà soát toàn văn hiện chỉ hỗ trợ DOCX gốc đã lưu local.</span>}
      {manifestError && <span role="alert" className="text-xs text-rose-800">{manifestError}</span>}
    </div>

    {manifest && <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5" data-testid="full-text-manifest-inventory">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" role="status">
        <span><strong>SHA:</strong> <code>{manifest.sourceSha256.slice(0, 16)}</code> · thế hệ {manifest.sourceGeneration}</span>
        <span><strong>Đoạn trích xuất:</strong> {manifest.coverage.totalIncludedSegments}</span>
        <span><strong>Phần được đọc:</strong> {manifest.coverage.includedParts}</span>
        <span><strong>Phần một phần:</strong> {manifest.coverage.partialParts}</span>
        <span><strong>Phần bị loại:</strong> {manifest.coverage.excludedParts}</span>
        <span className={manifest.coverage.complete ? "font-semibold text-emerald-800" : "font-semibold text-amber-800"}>
          Kiểm kê {manifest.coverage.complete ? "đầy đủ trong phạm vi hỗ trợ" : "một phần; xem danh sách loại trừ"}
        </span>
      </div>
      <details className="mt-2 rounded border border-slate-200 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Xem chính xác package part được gồm và loại trừ</summary>
        <h4 className="mt-2 text-[11px] font-bold text-emerald-800">Được gồm</h4>
        <ul className="mt-1 max-h-40 overflow-auto list-disc pl-5 text-[10px] text-slate-600">
          {manifest.parts.filter(part => part.segmentIds.length > 0).map(part => <li key={part.partUri}><code>{part.partUri}</code> · {part.segmentIds.length} đoạn · {part.status}</li>)}
          {manifest.parts.every(part => part.segmentIds.length === 0) && <li>Không có phần văn bản nào được trích xuất.</li>}
        </ul>
        <h4 className="mt-2 text-[11px] font-bold text-amber-900">Bị loại trừ / chưa trích xuất an toàn ({manifest.excluded.length})</h4>
        <ul className="mt-1 max-h-52 overflow-auto list-disc pl-5 text-[10px] text-slate-600">
          {manifest.excluded.map((item, index) => <li key={`${item.packagePartUri}:${item.anchor ?? index}:${item.code}`}><code>{item.packagePartUri}</code>{item.anchor ? ` · ${item.anchor}` : ""} · {item.code}: {item.reason}</li>)}
          {manifest.excluded.length === 0 && <li>Không có mục bị loại trừ trong phạm vi extractor hiện tại.</li>}
        </ul>
      </details>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-600">Máy chủ chia đoạn theo ngân sách xấp xỉ 6.000 token ước lượng, dành 1.200 token cho chỉ dẫn; ước lượng không phải bộ đếm token chính xác của provider. Khi quá giới hạn, đoạn được chia nhỏ cùng provider. Provider có thể áp dụng lưu giữ riêng; DocForm chưa xác minh thời hạn hoặc khả năng xóa bản sao phía họ.</p>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-600">Danh mục có thể gồm chữ hiển thị trong Body, bảng, header/footer được tham chiếu, footnote/endnote và textbox. Hình, biểu đồ, nội dung ẩn, tracked changes, field instructions, comments hoặc cấu trúc không an toàn được nêu riêng ở danh sách trên.</p>
    </div>}

    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
      <label className="flex items-start gap-2 text-xs font-semibold text-[#17233D]">
        <input type="checkbox" data-testid="full-text-provider-consent" checked={consentChecked}
          onChange={event => onConsentChange(event.currentTarget.checked)} disabled={!canConsent || active}
          className="mt-0.5 accent-[#6255E8]" aria-describedby="full-text-consent-scope"/>
        <span>{consentText}</span>
      </label>
      <p id="full-text-consent-scope" className="mt-1 pl-5 text-[10px] leading-relaxed text-amber-950">
        Consent này được buộc vào provider, SHA, thế hệ nguồn và hash manifest hiện tại; nó khác consent phân vùng. Không gửi tệp DOCX, PDF, ảnh trang, tên tệp, XML/HTML hay khóa API. Sau khi tải lại trang phải consent lại. Mỗi lần gửi hoặc retry đều do bạn nhấn nút.
      </p>
      {!canConsent && manifest && <p className="mt-1 pl-5 text-[10px] text-amber-900">{providerReady ? "Danh mục không khớp nguồn hiện tại; hãy kiểm kê lại." : providerReadinessReason}</p>}
    </div>

    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" onClick={onStart} disabled={!consentChecked || !manifest || !providerReady || active}
        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-45">
        <ShieldCheck size={14}/>{response ? "Rà soát lại toàn bộ văn bản trích xuất" : "Gửi toàn bộ văn bản trích xuất để rà soát"}
      </button>
      {active && <button type="button" onClick={onCancel} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800">Hủy rà soát</button>}
      {!active && hasFailedSegments && <button type="button" onClick={onRetryFailed} disabled={!consentChecked || !providerReady}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"><RefreshCw size={13}/>Thử lại các đoạn chưa có phản hồi</button>}
    </div>

    <div className="mt-2" aria-live="polite" data-testid="full-text-review-progress">
      <p className={`flex items-center gap-1.5 text-xs font-semibold ${reviewStatus === "complete" ? "text-emerald-800" : reviewStatus === "error" || reviewStatus === "partial" ? "text-amber-900" : "text-slate-700"}`}>
        {reviewStatus === "complete" ? <CheckCircle2 size={14}/> : reviewStatus === "error" ? <XCircle size={14}/> : reviewStatus === "reviewing" ? <LoaderCircle size={14} className="animate-spin"/> : reviewStatus === "partial" ? <AlertTriangle size={14}/> : null}
        {reviewStatusLabel[reviewStatus]}{reviewProvider ? ` · provider đã dùng: ${providerName(reviewProvider)}` : ""}
      </p>
      {coverage && <p className="mt-1 text-[10px] text-slate-700">
        Trích xuất: {coverage.extraction.totalIncludedSegments} đoạn / {coverage.extraction.includedParts + coverage.extraction.partialParts + coverage.extraction.excludedParts} phần · loại trừ {coverage.extraction.excludedCount};
        đã gửi {coverage.transfer.attemptedSegmentIds.length}/{coverage.transfer.selectedSegmentIds.length};
        có phản hồi {coverage.transfer.responseReceivedSegmentIds.length}/{coverage.transfer.selectedSegmentIds.length};
        Có phản hồi trạng thái {reviewedCount}/{coverage.semanticResponse.totalSegmentIds.length} đoạn · lỗi {coverage.semanticResponse.failedSegmentIds.length}.
      </p>}
      {chunks.length > 0 && <ul className="mt-1 max-h-36 overflow-auto space-y-1 text-[10px]" aria-label="Tiến độ từng chunk">
        {chunks.map(chunk => <li key={chunk.chunkId} className="flex flex-wrap items-baseline gap-x-1.5 rounded bg-white px-2 py-1">
          <code>{chunk.chunkId}</code><strong>{chunkStatusLabel[chunk.status] ?? chunk.status}</strong>
          <span>{chunk.completedSegmentIds.length}/{chunk.primarySegmentIds.length} đoạn</span>
          {chunk.failedSegmentIds.length > 0 && <span className="text-amber-900">· lỗi: {chunk.failedSegmentIds.join(", ")}</span>}
          {chunk.error && <span className="text-rose-800">· {chunk.error}</span>}
        </li>)}
      </ul>}
      {response && <p className="mt-1 text-[10px] text-slate-500">Tổng hợp liên đoạn: {response.synthesis.status}; tham chiếu được xác thực {response.synthesis.crossReferences.length}.</p>}
      {reviewError && <p role="alert" className="mt-1 text-xs text-rose-800">{reviewError}</p>}
      <p className="mt-1 text-[10px] text-slate-500">Đây là rà soát văn bản trích xuất. Không chứng minh provider đã mở DOCX nguyên bản, đọc OOXML bằng code hoặc xem bố cục từng trang.</p>
    </div>
  </section>;
}
