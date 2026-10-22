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

const friendlyPartName = (partUri: string) => {
  const normalized = partUri.toLowerCase();
  if (normalized.endsWith("/word/document.xml")) return "Nội dung văn bản chính";
  if (normalized.includes("/word/header")) return "Phần đầu trang";
  if (normalized.includes("/word/footer")) return "Phần chân trang";
  if (normalized.endsWith("/word/footnotes.xml")) return "Chú thích cuối trang";
  if (normalized.endsWith("/word/endnotes.xml")) return "Chú thích cuối văn bản";
  if (normalized.endsWith("/word/comments.xml")) return "Ghi chú trong tài liệu";
  return "Phần bổ sung của tài liệu";
};

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
  partial: "Còn đoạn chưa có phản hồi",
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
        <h3 id="full-text-review-heading" className="flex items-center gap-1.5 text-sm font-bold text-[#17233D]"><FileText size={16}/> Rà soát văn bản đã trích xuất</h3>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#52607A]">
          DocForm kiểm kê chữ có thể đọc trong tệp trên máy này. Chỉ gửi phần văn bản được liệt kê sau khi bạn bật xác nhận riêng và nhấn nút gửi.
        </p>
      </div>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">Chỉ gửi chữ trích xuất</span>
    </div>

    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Nhà cung cấp đang chọn: {providerName(provider)}</strong>
        <span role="status" className={providerReady ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>
          {providerReady ? "Sẵn sàng theo cấu hình hiện có" : "Chưa sẵn sàng"}
        </span>
      </div>
      {!providerReady && <p className="mt-1 text-amber-900">{providerReadinessReason}</p>}
      <p className="mt-1 text-slate-600">Hãy cân nhắc điều khoản sử dụng và lưu giữ dữ liệu của nhà cung cấp trước khi gửi.</p>
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
        <span><strong>Đoạn văn có thể gửi:</strong> {manifest.coverage.totalIncludedSegments}</span>
        <span><strong>Phần có chữ:</strong> {manifest.coverage.includedParts + manifest.coverage.partialParts}</span>
        <span><strong>Phần chưa đọc được:</strong> {manifest.coverage.excludedParts}</span>
        <span className={manifest.coverage.complete ? "font-semibold text-emerald-800" : "font-semibold text-amber-800"}>
          {manifest.coverage.complete ? "Đã kiểm kê đủ trong phạm vi hỗ trợ" : "Kiểm kê một phần; xem phần chưa đọc được"}
        </span>
      </div>
      <details className="mt-2 rounded border border-slate-200 p-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Xem nội dung sẽ gửi và phần bị loại</summary>
        <h4 className="mt-2 text-[11px] font-bold text-emerald-800">Được đưa vào lượt gửi</h4>
        <ul className="mt-1 max-h-40 overflow-auto list-disc pl-5 text-[10px] text-slate-600">
          {manifest.parts.filter(part => part.segmentIds.length > 0).map(part => <li key={part.partUri}>{friendlyPartName(part.partUri)} · {part.segmentIds.length} đoạn văn</li>)}
          {manifest.parts.every(part => part.segmentIds.length === 0) && <li>Không có phần văn bản nào được trích xuất.</li>}
        </ul>
        <h4 className="mt-2 text-[11px] font-bold text-amber-900">Bị loại hoặc chưa đọc an toàn ({manifest.excluded.length})</h4>
        <ul className="mt-1 max-h-40 overflow-auto list-disc pl-5 text-[10px] text-slate-600">
          {manifest.excluded.map((item, index) => <li key={`${item.packagePartUri}:${item.anchor ?? index}:${item.code}`}>{friendlyPartName(item.packagePartUri)} · chưa gửi</li>)}
          {manifest.excluded.length === 0 && <li>Không có mục bị loại trong phạm vi kiểm kê hiện tại.</li>}
        </ul>
      </details>
      <details className="mt-2 rounded border border-slate-200 p-2" data-testid="full-text-technical-details">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Chi tiết kỹ thuật</summary>
        <div className="mt-2 space-y-2 text-[10px] leading-relaxed text-slate-600">
          <p>Phạm vi: <code>all_extracted_text</code>; SHA: <code>{manifest.sourceSha256}</code>; thế hệ nguồn: {manifest.sourceGeneration}; hash danh mục: <code>{manifest.manifestSha256}</code>.</p>
          <h4 className="font-bold text-emerald-800">Package part được gồm</h4>
          <ul className="max-h-40 overflow-auto list-disc pl-5">{manifest.parts.filter(part => part.segmentIds.length > 0).map(part => <li key={part.partUri}><code>{part.partUri}</code> · {part.segmentIds.length} đoạn · {part.status}</li>)}</ul>
          <h4 className="font-bold text-amber-900">Package part bị loại</h4>
          <ul className="max-h-40 overflow-auto list-disc pl-5">{manifest.excluded.map((item, index) => <li key={`${item.packagePartUri}:${item.anchor ?? index}:${item.code}`}><code>{item.packagePartUri}</code>{item.anchor ? ` · ${item.anchor}` : ""} · {item.code}: {item.reason}</li>)}{manifest.excluded.length === 0 && <li>Không có mục bị loại.</li>}</ul>
          <p>Máy chủ chia đoạn theo ngân sách xấp xỉ 6.000 token ước lượng, dành 1.200 token cho chỉ dẫn; đây không phải bộ đếm chính xác của provider.</p>
          <p>Hình, biểu đồ, nội dung ẩn, tracked changes, field instructions, comments và cấu trúc không an toàn không được tính là văn bản đã kiểm kê.</p>
        </div>
      </details>
    </div>}

    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
      <label className="flex items-start gap-2 text-xs font-semibold text-[#17233D]">
        <input type="checkbox" data-testid="full-text-provider-consent" checked={consentChecked}
          onChange={event => onConsentChange(event.currentTarget.checked)} disabled={!canConsent || active}
          className="mt-0.5 accent-[#6255E8]" aria-describedby="full-text-consent-scope"/>
        <span>{consentText}</span>
      </label>
      <p id="full-text-consent-scope" className="mt-1 pl-5 text-[10px] leading-relaxed text-amber-950">
        Xác nhận này chỉ áp dụng cho tệp và nhà cung cấp đang chọn; đây là quyền riêng, tách khỏi rà soát phân vùng. Không gửi tệp DOCX, PDF, ảnh trang, tên tệp, XML/HTML hay khóa API. Sau khi tải lại trang phải xác nhận lại. Mỗi lần gửi hoặc thử lại đều do bạn nhấn nút.
      </p>
      <p className="mt-1 pl-5 text-[10px] leading-relaxed text-amber-950">{providerTierNotice} DocForm không xác minh chính sách lưu giữ phía nhà cung cấp và không thể xóa bản sao phía họ.</p>
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
        {reviewStatusLabel[reviewStatus]}{reviewProvider ? ` · ${providerName(reviewProvider)}` : ""}
      </p>
      {coverage && <p className="mt-1 text-[10px] text-slate-700">
        Đã nhận phản hồi {coverage.transfer.responseReceivedSegmentIds.length}/{coverage.transfer.selectedSegmentIds.length} đoạn; còn {coverage.semanticResponse.failedSegmentIds.length} đoạn gặp lỗi.
      </p>}
      {response && <p className="mt-1 text-[10px] text-slate-500">Đã hoàn tất lượt đối chiếu văn bản trích xuất.</p>}
      {reviewError && <p role="alert" className="mt-1 text-xs text-rose-800">{reviewError}</p>}
      <p className="mt-1 text-[10px] text-slate-500">Kết quả này rà soát phần văn bản được trích xuất; không xác nhận nhà cung cấp đã mở tệp DOCX hoặc xem bố cục trang.</p>
      {(chunks.length > 0 || coverage || response) && <details className="mt-2 rounded border border-slate-200 bg-white p-2" data-testid="full-text-progress-technical-details">
        <summary className="cursor-pointer text-[10px] font-semibold text-slate-600">Chi tiết kỹ thuật</summary>
        <div className="mt-2 space-y-2 text-[10px] text-slate-600">
          {coverage && <p>Ước lượng: {coverage.extraction.totalIncludedSegments} đoạn trong {coverage.extraction.includedParts + coverage.extraction.partialParts + coverage.extraction.excludedParts} phần; bị loại {coverage.extraction.excludedCount}; đã thử gửi {coverage.transfer.attemptedSegmentIds.length}/{coverage.transfer.selectedSegmentIds.length}; phản hồi {reviewedCount}/{coverage.semanticResponse.totalSegmentIds.length}.</p>}
          {chunks.length > 0 && <ul className="max-h-36 overflow-auto space-y-1" aria-label="Tiến độ từng chunk">
            {chunks.map(chunk => <li key={chunk.chunkId} className="flex flex-wrap items-baseline gap-x-1.5 rounded bg-slate-50 px-2 py-1">
              <code>{chunk.chunkId}</code><strong>{chunkStatusLabel[chunk.status] ?? chunk.status}</strong>
              <span>{chunk.completedSegmentIds.length}/{chunk.primarySegmentIds.length} đoạn</span>
              {chunk.failedSegmentIds.length > 0 && <span className="text-amber-900">· lỗi: {chunk.failedSegmentIds.join(", ")}</span>}
              {chunk.error && <span className="text-rose-800">· {chunk.error}</span>}
            </li>)}
          </ul>}
          {response && <p>Tổng hợp liên đoạn: {response.synthesis.status}; tham chiếu được xác thực {response.synthesis.crossReferences.length}.</p>}
        </div>
      </details>}
    </div>
  </section>;
}
