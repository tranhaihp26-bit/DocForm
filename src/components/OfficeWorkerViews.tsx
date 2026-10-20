import React, { useEffect, useRef } from "react";
import { 
  FileText, Upload, Download, Printer, CheckCircle2, AlertCircle, 
  AlertTriangle, Info, Check, X, ChevronLeft, ChevronRight, ArrowRight, ShieldCheck,
  Eye, Sliders, RefreshCw, Layers, 
  FlaskConical, Building2, Tag, BookOpen,
  CheckSquare, RotateCcw, History, Scale, Sparkles, ChevronDown, ExternalLink
} from "lucide-react";
import DOMPurify from "dompurify";
import { A4DocumentPreview } from "./A4DocumentPreview.tsx";
import { computeVisualDiff } from "../utils/diffUtils.ts";
import type { DocumentState, TemplatePreset, Version } from "../App.tsx";
import type { 
  DocumentEvaluationSummary, 
} from "../canonical/ruleEngine.ts";
import { COMPANY_HEADER_PROFILE_ID } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../canonical/hd05/companyHeaderHD05.ts";
import type { SourceBlock, StructuredImport } from "../shared/schemas/document.schema.ts";
import type { OriginalDocumentSnapshot } from "../utils/draftStore.ts";
import { useAccessibleDialog } from "../utils/useAccessibleDialog.ts";


function WizardHeading({ title, description, children }: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="df-wizard-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// 1. SAFE REGIME SWITCH CONFIRMATION MODAL
// =============================================================================
interface SafeRegimeModalProps {
  isOpen: boolean;
  currentRegime: "state" | "party";
  targetRegime: "state" | "party";
  onConfirm: () => void;
  onCancel: () => void;
}

export function SafeRegimeModal({
  isOpen,
  currentRegime,
  targetRegime,
  onConfirm,
  onCancel,
}: SafeRegimeModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onCancel);

  if (!isOpen) return null;

  const currentName = currentRegime === "party" ? "Văn bản Đảng (HD 05-HD/VPTW)" : "Văn bản Hành chính (NĐ 30/2020/NĐ-CP)";
  const targetName = targetRegime === "party" ? "Văn bản Đảng (HD 05-HD/VPTW)" : "Văn bản Hành chính (NĐ 30/2020/NĐ-CP)";

  return (
    <div 
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="safe-regime-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#17233D]/55 backdrop-blur-xs df-step-enter"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-[#CFD8EA] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#CFD8EA] flex items-center justify-between bg-[#FFF6E6]">
          <div id="safe-regime-modal-title" className="flex items-center gap-2.5 text-[#9E5206] font-bold text-base">
            <AlertTriangle className="w-5 h-5 text-[#9E5206] shrink-0" />
            <span>Xác Nhận Chuyển Đổi Hệ Quy Chuẩn</span>
          </div>
          <button 
            type="button"
            onClick={onCancel} 
            aria-label="Đóng hộp thoại"
            className="p-1.5 rounded-lg text-[#52607A] hover:text-[#17233D] hover:bg-white/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs sm:text-sm text-[#17233D]">
          <div className="p-3.5 rounded-xl bg-[#EEF2FA] border border-[#CFD8EA] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#52607A] font-medium">Đang áp dụng:</span>
              <span className="font-bold text-[#17233D]">{currentName}</span>
            </div>
            <div className="flex items-center justify-center py-0.5 text-[#6255E8]">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#52607A] font-medium">Chuyển sang:</span>
              <span className="font-bold text-[#6255E8]">{targetName}</span>
            </div>
          </div>

          <div className="space-y-2 text-xs leading-relaxed text-[#52607A]">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#127955] shrink-0 mt-0.5" />
              <span><strong className="text-[#17233D]">Bảo toàn dữ liệu:</strong> Toàn bộ nội dung văn bản, bảng biểu, danh sách, phụ lục và chữ ký được giữ nguyên.</span>
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#127955] shrink-0 mt-0.5" />
              <span><strong className="text-[#17233D]">Sao lưu tự động:</strong> Một bản sao lưu phiên bản hiện tại sẽ được lưu vào Lịch sử phiên bản trước khi chuyển.</span>
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#6255E8] shrink-0 mt-0.5" />
              <span><strong className="text-[#17233D]">Đánh giá thể thức mới:</strong> Hệ thống sẽ áp dụng đúng bộ quy chuẩn {targetRegime === "party" ? "Hướng dẫn 05" : "Nghị định 30"} để rà soát.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F5F6FA] border-t border-[#CFD8EA] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold text-[#17233D] bg-white border border-[#CFD8EA] hover:bg-[#EEF2FA] transition cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[38px] px-5 py-2 rounded-xl text-xs font-bold df-btn-primary flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Xác Nhận Chuyển Đổi</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 2. PRE-PARTITION REGIME CONFIRMATION MODAL (Chặng 2)
// =============================================================================
export interface RegimeConfirmEvidence {
  kind: string;
  regime: "state" | "party";
  strength: "high" | "medium";
  sourceBlockId: string;
  blockIndex: number;
  lineIndex?: number;
  cell?: { rowIndex: number; colIndex: number };
  exactQuote: string;
}

export interface RegimeConfirmDetection {
  suggestedRegime: "state" | "party" | null;
  confidence: "high" | "medium" | "low";
  conflict: boolean;
  insufficient: boolean;
  evidence: RegimeConfirmEvidence[];
  documentTypeEvidence: {
    value: string;
    sourceBlockId: string;
    blockIndex: number;
    lineIndex?: number;
    cell?: { rowIndex: number; colIndex: number };
    exactQuote: string;
  } | null;
}

interface RegimeConfirmModalProps {
  isOpen: boolean;
  filename: string;
  chosenRegime: "state" | "party";
  detection: RegimeConfirmDetection | null;
  onConfirm: (regime: "state" | "party") => void;
  onCancel: () => void;
}

const EVIDENCE_KIND_LABELS: Record<string, string> = {
  national_header_state: "Quốc hiệu (NĐ 30)",
  national_header_party: "Tiêu đề Đảng (HD 05)",
  motto_state: "Tiêu ngữ (NĐ 30)",
  party_org_header: "Tên cơ quan Đảng",
  reference_number_state: "Số, ký hiệu (NĐ 30)",
  reference_number_party: "Số, ký hiệu (HD 05)",
};

export function RegimeConfirmModal({
  isOpen,
  filename,
  chosenRegime,
  detection,
  onConfirm,
  onCancel,
}: RegimeConfirmModalProps) {
  const [selected, setSelected] = React.useState<"state" | "party">(chosenRegime);
  const dialogRef = useAccessibleDialog(isOpen, onCancel);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(detection?.suggestedRegime ?? chosenRegime);
  }, [isOpen, filename, detection?.suggestedRegime, chosenRegime]);

  if (!isOpen) return null;

  const evidence = detection?.evidence || [];
  const suggestedLabel =
    detection?.suggestedRegime === "party"
      ? "Văn bản Đảng (HD 05)"
      : detection?.suggestedRegime === "state"
        ? "Văn bản Hành chính (NĐ 30)"
        : "Chưa xác định";

  const formatLocation = (item: {
    sourceBlockId: string;
    blockIndex: number;
    lineIndex?: number;
    cell?: { rowIndex: number; colIndex: number };
  }) => {
    const parts = [`Khối ${item.blockIndex + 1}`];
    if (item.cell) parts.push(`ô [${item.cell.rowIndex + 1}, ${item.cell.colIndex + 1}]`);
    if (item.lineIndex !== undefined) parts.push(`dòng ${item.lineIndex + 1}`);
    parts.push(`#${item.sourceBlockId}`);
    return parts.join(" · ");
  };

  return (
    <div
      ref={dialogRef}
      data-testid="regime-confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regime-confirm-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#17233D]/55 backdrop-blur-xs df-step-enter"
    >
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-[#CFD8EA] overflow-hidden">
        <div className="p-5 border-b border-[#CFD8EA] flex items-center justify-between bg-[#FFF6E6]">
          <div id="regime-confirm-modal-title" className="flex items-center gap-2.5 text-[#9E5206] font-bold text-base">
            <AlertTriangle className="w-5 h-5 text-[#9E5206] shrink-0" />
            <span>Xác Nhận Hệ Thể Thức Trước Khi Nhập</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Đóng hộp thoại"
            className="p-1.5 rounded-lg text-[#52607A] hover:text-[#17233D] hover:bg-white/80 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs sm:text-sm text-[#17233D] max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-[#52607A]">
            Tệp nguồn: <strong className="text-[#17233D]">{filename}</strong>
          </p>

          <div data-testid="regime-detection-summary" className="p-3.5 rounded-xl bg-[#EEF2FA] border border-[#CFD8EA] space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#52607A] font-medium">Hệ được đề xuất:</span>
              <span className="font-bold text-[#6255E8]">{suggestedLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#52607A] font-medium">Độ tin cậy:</span>
              <span className="font-semibold text-[#17233D]">{detection?.confidence || "low"}</span>
            </div>
            {detection?.conflict && (
              <p data-testid="regime-conflict-notice" className="text-[#9E5206] font-semibold">
                Phát hiện dấu hiệu của cả hai hệ ở phần đầu tài liệu. Vui lòng chọn hệ đúng.
              </p>
            )}
            {detection?.insufficient && (
              <p data-testid="regime-insufficient-notice" className="text-[#9E5206] font-semibold">
                Chưa đủ chứng cứ tin cậy để tự quyết định hệ. Vui lòng chọn hệ đúng.
              </p>
            )}
            {!detection?.conflict && !detection?.insufficient && detection?.suggestedRegime && detection.suggestedRegime !== chosenRegime && (
              <p data-testid="regime-mismatch-notice" className="text-[#9E5206] font-semibold">
                Chứng cứ khác với hệ đang chọn. Vui lòng xác nhận lại.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-[#17233D]">Chứng cứ trích từ tài liệu nguồn:</div>
            {evidence.length === 0 ? (
              <p data-testid="regime-no-evidence" className="text-xs text-[#52607A] italic">
                Không tìm thấy dấu hiệu quốc hiệu, tiêu ngữ, tiêu đề Đảng, số/ký hiệu hay tên cơ quan đáng tin cậy ở phần đầu.
              </p>
            ) : (
              <ul data-testid="regime-evidence-list" className="space-y-1.5">
                {evidence.map((item, idx) => (
                  <li
                    key={`${item.sourceBlockId}-${item.kind}-${idx}`}
                    data-testid="regime-evidence-item"
                    className="p-2.5 rounded-lg border border-[#E3E8F4] bg-[#FBFCFE]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#17233D]">{EVIDENCE_KIND_LABELS[item.kind] || item.kind}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.regime === "party" ? "bg-[#FDECEC] text-[#B02A2A]" : "bg-[#E9F2FE] text-[#1F5FBF]"}`}>
                        {item.regime === "party" ? "HD 05" : "NĐ 30"}
                      </span>
                    </div>
                    <div className="text-[#17233D] mt-1 break-words">“{item.exactQuote}”</div>
                    <div className="text-[10px] text-[#7A8699] mt-0.5">{formatLocation(item)}</div>
                  </li>
                ))}
              </ul>
            )}
            {detection?.documentTypeEvidence && (
              <p data-testid="regime-doctype-evidence" className="text-xs text-[#52607A]">
                Loại văn bản nhận diện: <strong className="text-[#17233D]">{detection.documentTypeEvidence.value}</strong>{" "}
                ({formatLocation(detection.documentTypeEvidence)})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-[#17233D]">Chọn hệ thể thức để phân vùng:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Chọn hệ thể thức">
              <button
                type="button"
                role="radio"
                aria-checked={selected === "state"}
                data-testid="regime-option-state"
                onClick={() => setSelected("state")}
                className={`text-left p-3 rounded-xl border transition cursor-pointer ${selected === "state" ? "border-[#6255E8] bg-[#F1F0FE] ring-1 ring-[#6255E8]" : "border-[#CFD8EA] bg-white hover:bg-[#F5F6FA]"}`}
              >
                <div className="font-bold text-[#17233D]">Nghị định 30/2020/NĐ-CP</div>
                <div className="text-[11px] text-[#52607A]">Văn bản hành chính nhà nước (Quốc hiệu, tiêu ngữ, “Số: ”)</div>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={selected === "party"}
                data-testid="regime-option-party"
                onClick={() => setSelected("party")}
                className={`text-left p-3 rounded-xl border transition cursor-pointer ${selected === "party" ? "border-[#6255E8] bg-[#F1F0FE] ring-1 ring-[#6255E8]" : "border-[#CFD8EA] bg-white hover:bg-[#F5F6FA]"}`}
              >
                <div className="font-bold text-[#17233D]">Hướng dẫn 05-HD/VPTW</div>
                <div className="text-[11px] text-[#52607A]">Văn bản Đảng (“ĐẢNG CỘNG SẢN VIỆT NAM”, “Số ”)</div>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-[#7A8699]">
            Nếu hủy, tài liệu đang mở (A) và mọi đề xuất của A được giữ nguyên; tệp vừa tải không được lưu.
          </p>
        </div>

        <div className="p-4 bg-[#F5F6FA] border-t border-[#CFD8EA] flex items-center justify-end gap-2.5">
          <button
            type="button"
            data-testid="regime-cancel-button"
            onClick={onCancel}
            className="min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold text-[#17233D] bg-white border border-[#CFD8EA] hover:bg-[#EEF2FA] transition cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            data-testid="regime-confirm-button"
            onClick={() => onConfirm(selected)}
            className="min-h-[38px] px-5 py-2 rounded-xl text-xs font-bold df-btn-primary flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Xác Nhận và Nhập</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 4. BƯỚC 3: XUẤT VĂN BẢN (PROPOSED / ORIGINAL / DIFF)
// =============================================================================
interface ExportStepViewProps {
  regime: "state" | "party";
  doc: DocumentState;
  rawText: string;
  uploadedHtml: string;
  originalSnapshot: OriginalDocumentSnapshot | null;
  ooxmlStatus?: "not_evaluated" | "measuring" | "evaluated_current_draft" | "error";
  hasOoxmlEvidence?: boolean;
  viewMode: "proposed" | "original" | "diff";
  onViewModeChange: (mode: "proposed" | "original" | "diff") => void;
  evaluationSummary: DocumentEvaluationSummary;
  onExportDocx: () => void;
  onExportPdf: () => void;
  onDownloadOriginal?: () => void;
  isExportingDocx: boolean;
  onPrev: () => void;
}

export function ExportStepView({
  regime,
  doc,
  originalSnapshot,
  ooxmlStatus = "not_evaluated",
  hasOoxmlEvidence = false,
  viewMode,
  onViewModeChange,
  evaluationSummary,
  onExportDocx,
  onExportPdf,
  onDownloadOriginal,
  isExportingDocx,
  onPrev,
}: ExportStepViewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [mobileTab, setMobileTab] = React.useState<"preview" | "export">("preview");
  const actionableCount = evaluationSummary.actionableIssues.length;
  const recognizedCoreCount = evaluationSummary.recognizedComponents.recognized;
  const counts = evaluationSummary.canonicalStats.counts;

  // Xử lý snapshot tài liệu gốc bất biến
  const hasOriginalSnapshot = Boolean(
    originalSnapshot && (originalSnapshot.bodyHtml || originalSnapshot.rawText)
  );
  const isTemplateOrigin = originalSnapshot?.sourceType === "system_template";

  // Không dùng doc.bodyHtml làm bản gốc dự phòng để tránh báo sai lệch "0 thay đổi"
  const originalBodyClean = hasOriginalSnapshot
    ? (originalSnapshot?.bodyHtml || (originalSnapshot?.rawText ? `<p>${originalSnapshot.rawText.replace(/\n\n+/g, "</p><p>")}</p>` : ""))
    : "";

  // Tính toán visual diff chỉ khi có snapshot gốc thực tế
  const visualDiff = React.useMemo(() => {
    if (!hasOriginalSnapshot || !originalBodyClean) {
      return null;
    }
    return computeVisualDiff(originalBodyClean, doc.bodyHtml);
  }, [hasOriginalSnapshot, originalBodyClean, doc.bodyHtml]);

  // Chỉ đạt chuẩn thể thức tuyệt đối khi cổng kiểm định xác nhận PASS (HD05_VALIDATED / ND30_VALIDATED)
  const isStrictlyCompliant =
    evaluationSummary.verificationGate?.status === "PASS" ||
    (counts.FAIL === 0 &&
      actionableCount === 0 &&
      counts.NOT_EVALUATED === 0 &&
      counts.NEEDS_REVIEW === 0 &&
      counts.PASS > 0 &&
      (ooxmlStatus === "evaluated_current_draft" && Boolean(hasOoxmlEvidence)));

  const getExportDocxButtonLabel = () => isExportingDocx
    ? "Đang tạo Word…"
    : isStrictlyCompliant ? (regime === "party" ? "Tải Word đạt chuẩn HD05" : "Tải Word đạt chuẩn NĐ30") : "Tải Word bản thảo";

  return (
    <div data-wizard-step="3" className="h-full flex flex-col min-h-0 overflow-hidden df-step-enter pt-1">
      {/* Semantic accessible heading */}
      <h1 className="sr-only">Xuất văn bản - Chuẩn thể thức</h1>

      {/* Mobile Tab Switcher (< lg) to prevent squishing preview on 390px */}
      <div className="lg:hidden px-3 py-1.5 bg-white border-b border-[#CFD8EA] flex items-center justify-between shrink-0">
        <div role="tablist" aria-label="Chế độ xem trước và xuất" className="grid grid-cols-2 gap-1 w-full bg-[#F5F6FA] p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "preview"}
            onClick={() => setMobileTab("preview")}
            className={`min-h-[34px] py-1 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === "preview" ? "bg-white text-[#6255E8] shadow-xs" : "text-[#52607A]"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Xem văn bản</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "export"}
            onClick={() => setMobileTab("export")}
            className={`min-h-[34px] py-1 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === "export" ? "bg-white text-[#6255E8] shadow-xs" : "text-[#52607A]"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Kiểm tra & Xuất</span>
            {actionableCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {actionableCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 2. Responsive Work Area: Stacked on mobile, side-by-side on desktop (>= lg) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 sm:gap-4 px-2 sm:px-4 pb-1 overflow-hidden">
        
        {/* Left Column: Preview Frame (Full width on mobile preview tab, ~70% on desktop) */}
        <div className={`${mobileTab === "preview" ? "flex" : "hidden"} lg:flex flex-1 min-w-0 bg-white rounded-2xl border border-[#CFD8EA] flex-col overflow-hidden shadow-xs`}>
          
          {/* Header xem trước: Tabs chế độ + Điều khiển zoom */}
          <div className="p-2 sm:p-2.5 border-b border-[#CFD8EA] flex items-center justify-between flex-wrap gap-2 shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#EEF2FA] p-0.5 rounded-xl border border-[#CFD8EA]">
                <button
                  type="button"
                  aria-pressed={viewMode === "proposed"}
                  onClick={() => onViewModeChange("proposed")}
                  className={`min-h-[28px] px-2.5 sm:px-3 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    viewMode === "proposed" ? "bg-white text-[#6255E8] font-bold shadow-xs" : "text-[#52607A] hover:text-[#17233D]"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Bản thảo</span>
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === "original"}
                  onClick={() => onViewModeChange("original")}
                  className={`min-h-[28px] px-2.5 sm:px-3 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    viewMode === "original" ? "bg-white text-[#17233D] font-bold shadow-xs" : "text-[#52607A] hover:text-[#17233D]"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isTemplateOrigin ? "Mẫu ban đầu" : "Bản gốc"}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === "diff"}
                  onClick={() => onViewModeChange("diff")}
                  className={`min-h-[28px] px-2.5 sm:px-3 py-0.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    viewMode === "diff" ? "bg-white text-[#6255E8] font-bold shadow-xs" : "text-[#52607A] hover:text-[#17233D]"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Thay đổi</span>
                </button>
              </div>
            </div>

          </div>

          {/* Canvas cuộn bên trong */}
          <div className="flex-1 min-h-0 overflow-hidden bg-[#F5F6FA] p-3 sm:p-4 flex flex-col items-center">
            {viewMode === "proposed" && (
              <A4DocumentPreview doc={doc} standardType={regime} previewRef={previewRef} mode="full" compact />
            )}

            {viewMode === "original" && (
              <div className="df-reading-panel w-full max-w-[820px] bg-white rounded-xl p-5 border border-[#CFD8EA] shadow-2xs space-y-4 text-sm leading-relaxed text-[#17233D]">
                {hasOriginalSnapshot ? (
                  <>
                    <div className="flex items-center justify-between font-bold text-sm text-[#17233D] pb-2 border-b border-[#CFD8EA] flex-wrap gap-2">
                      <span>{isTemplateOrigin ? "NỘI DUNG MẪU KHỞI TẠO BAN ĐẦU" : "VĂN BẢN NGUYÊN GỐC BAN ĐẦU"}</span>
                      <span className="text-[11px] font-normal text-[#52607A]">{originalSnapshot?.fileName}</span>
                    </div>
                    <div 
                      className="prose max-w-none text-[#17233D]"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(originalBodyClean) }}
                    />
                  </>
                ) : (
                  <div className="p-8 text-center text-[#52607A] bg-[#FFF6E6] border border-[#F5C376] rounded-xl space-y-2">
                    <AlertCircle className="w-8 h-8 text-[#9E5206] mx-auto" />
                    <p className="font-bold text-[#17233D]">Không có dữ liệu bản gốc để đối chiếu</p>
                    <p className="text-xs text-[#52607A] max-w-md mx-auto leading-relaxed">
                      Bản nháp này chưa có bản lưu đối chiếu gốc bất biến. Bạn có thể tiếp tục chỉnh sửa hoặc tải tệp Word tại Bước 1.
                    </p>
                  </div>
                )}
              </div>
            )}

            {viewMode === "diff" && (
              <div className="df-reading-panel w-full max-w-[820px] bg-white rounded-xl p-5 border border-[#CFD8EA] shadow-2xs space-y-4 text-sm leading-relaxed text-[#17233D]">
                {hasOriginalSnapshot && visualDiff ? (
                  <>
                    <div className="flex items-center justify-between font-bold text-sm text-[#6255E8] pb-2 border-b border-[#CFD8EA] flex-wrap gap-2">
                      <span>SO SÁNH TRỰC QUAN KHÁC BIỆT (DIFF)</span>
                      <span className="text-[11px] font-medium text-[#52607A]">
                        Thêm: <strong className="text-[#127955]">+{visualDiff.stats.addedCount}</strong> · Xóa: <strong className="text-[#B82339]">-{visualDiff.stats.deletedCount}</strong> · Giữ: <strong>{visualDiff.stats.unchangedCount}</strong>
                      </span>
                    </div>

                    {visualDiff.isPartial && (
                      <div className="p-3 bg-[#FFF6E6] border border-[#F5C376] rounded-lg text-xs text-[#9E5206] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span><strong>Chưa thể so sánh đầy đủ chi tiết:</strong> {visualDiff.limitReason}.</span>
                      </div>
                    )}

                    <div 
                      className="visual-diff-content space-y-2"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(visualDiff.inlineHtml) }}
                    />
                  </>
                ) : (
                  <div className="p-8 text-center text-[#52607A] bg-[#F5F6FA] border border-[#CFD8EA] rounded-xl space-y-2">
                    <Info className="w-8 h-8 text-[#52607A] mx-auto" />
                    <p className="font-bold text-[#17233D]">Không thể thực hiện so sánh Diff</p>
                    <p className="text-xs text-[#52607A] max-w-md mx-auto leading-relaxed">
                      Không có bản gốc đối chiếu để phân tích các thay đổi thêm/xóa/sửa.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer xem trước: Phân trang */}
          <div className="px-4 py-2 border-t border-[#CFD8EA] bg-white flex items-center justify-between text-xs text-[#52607A] shrink-0">
            <span>Trang 1 / 2</span>
            <div className="flex items-center gap-1">
              <button type="button" className="p-1 rounded border border-[#CFD8EA] hover:bg-slate-50 cursor-pointer">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button type="button" className="p-1 rounded border border-[#CFD8EA] hover:bg-slate-50 cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Cột phải: Thẻ Rà soát & Thẻ Xuất tài liệu */}
        <div className={`${mobileTab === "export" ? "flex" : "hidden"} lg:flex df-export-sidebar w-full lg:w-[320px] shrink-0 min-h-0 flex-col gap-3 overflow-y-auto`}>
          
          {/* Card 1: Kiểm tra trước khi xuất */}
          <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3.5 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-[#17233D]">
              <Sparkles className="w-4 h-4 text-[#6255E8]" />
              <span>Kiểm tra trước khi xuất</span>
            </div>

            {/* Banner trạng thái kiểm định */}
            {isStrictlyCompliant ? (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold">Đã kiểm tra đầy đủ thể thức</p>
                  <p className="text-[10.5px] text-emerald-700">Các quy tắc áp dụng có bằng chứng đạt yêu cầu.</p>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-[#EEF0FE] border border-[#6255E8]/30 text-[#17233D] text-xs flex items-center gap-2">
                <Info className="w-4 h-4 text-[#6255E8] shrink-0" />
                <div>
                  <p className="font-bold">Đã kiểm tra một phần</p>
                  <p className="text-[10.5px] text-[#52607A]">Còn nội dung cần bạn đối chiếu.</p>
                </div>
              </div>
            )}

            {/* Mục cần sửa */}
            {actionableCount > 0 && (
              <button
                type="button"
                onClick={onPrev}
                className="w-full p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 text-left transition flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#9A3412]">
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
                  <span>{actionableCount} mục cần sửa</span>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-600" />
              </button>
            )}

            {/* Mục cần rà soát thủ công */}
            {counts.NEEDS_REVIEW > 0 && (
              <div className="w-full p-2.5 rounded-xl border border-rose-200 bg-rose-50/60 text-left flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#B82339]">
                  <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
                  <span>Một số mục cần rà soát thủ công</span>
                </div>
                <ChevronRight className="w-4 h-4 text-rose-400" />
              </div>
            )}

            {/* Chi tiết kiểm tra có thể mở rộng */}
            <details className="df-review-details text-xs">
              <summary className="cursor-pointer font-bold text-[#17233D] flex items-center justify-between p-1">
                <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#52607A]" /> Chi tiết kiểm tra</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </summary>
              <div className="space-y-1.5 pt-2 text-[11px] text-[#52607A] leading-relaxed">
                <p><strong>Phân vùng nội dung:</strong> {recognizedCoreCount}/9 nhóm đã nhận diện · {actionableCount} việc cần sửa tự động.</p>
                <p><strong>Đã kiểm tra:</strong> {counts.PASS} đạt · {counts.FAIL} không đạt · {counts.NOT_APPLICABLE} không áp dụng.</p>
                <p><strong>Nguồn đối chiếu:</strong> {hasOriginalSnapshot ? originalSnapshot?.fileName : "Chưa có bản gốc được lưu"}.</p>
                <p><strong>Bằng chứng OOXML:</strong> {ooxmlStatus === "measuring" ? "Đang đo lường bản thảo hiện tại…" : ooxmlStatus === "evaluated_current_draft" && hasOoxmlEvidence ? "Đã đo lường bản thảo hiện tại." : ooxmlStatus === "error" ? "Chưa đo được; hãy thử lại trước khi phát hành." : "Chưa đo lường bản thảo hiện tại."}</p>
              </div>
            </details>
          </div>

          {/* Card 2: Xuất tài liệu */}
          <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3.5 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-[#17233D]">
              <Download className="w-4 h-4 text-[#6255E8]" />
              <span>Xuất tài liệu</span>
            </div>

            <button
              type="button"
              onClick={onExportDocx}
              disabled={isExportingDocx}
              className="w-full min-h-[42px] df-btn-primary font-bold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {isExportingDocx ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{getExportDocxButtonLabel()}</span>
            </button>

            <button
              type="button"
              onClick={onExportPdf}
              className="w-full min-h-[38px] rounded-xl border border-[#CFD8EA] bg-white text-[#17233D] font-semibold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#52607A]" />
              <span>In / PDF</span>
            </button>

            {onDownloadOriginal && originalSnapshot?.sourceHash && (
              <button
                type="button"
                onClick={onDownloadOriginal}
                className="w-full py-1 text-xs text-[#6255E8] hover:underline flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Tải tệp gốc</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => alert("Hướng dẫn xuất: Bản Word (.docx) được tạo đạt chuẩn theo Nghị định 30/2020/NĐ-CP hoặc Hướng dẫn 05-HD/VPTW. Bạn có thể mở trực tiếp trong Microsoft Word hoặc in ấn xuất PDF.")}
              className="w-full pt-1 text-xs text-[#6255E8] hover:underline flex items-center justify-center gap-1 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Hướng dẫn xuất</span>
              <ExternalLink className="w-3 h-3" />
            </button>

          </div>

        </div>

      </div>

      {/* 3. Mobile-only Action Bar (< lg) */}
      <div className="lg:hidden px-3 py-2 bg-white/95 border-t border-[#CFD8EA] flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onPrev}
          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#CFD8EA] bg-white text-[#17233D] font-semibold text-xs flex items-center gap-1 cursor-pointer shrink-0"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Soạn</span>
        </button>

        <button
          type="button"
          onClick={onExportDocx}
          disabled={isExportingDocx}
          className="flex-1 min-h-[38px] df-btn-primary font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm truncate px-2"
        >
          {isExportingDocx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="truncate">{getExportDocxButtonLabel()}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab(mobileTab === "preview" ? "export" : "preview")}
          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#6255E8]/40 bg-[#EEF0FE] text-[#6255E8] font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
        >
          {mobileTab === "preview" ? (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Kiểm tra</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Xem trang</span>
            </>
          )}
        </button>
      </div>

    </div>
  );
}

// =============================================================================
// 5. LỊCH SỬ PHIÊN BẢN, CĂN CỨ PHÁP LÝ & CÔNG CỤ NÂNG CAO (DRAWER / MODAL)
// =============================================================================
interface AdvancedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPilotModal: () => void;
  onOpenPayloadInspector: () => void;
  onOpenComplianceReport: () => void;
  regime: "state" | "party";
  versions?: Version[];
  onRestoreVersion?: (v: Version) => void;
}

export function AdvancedDrawer({
  isOpen,
  onClose,
  onOpenPilotModal,
  onOpenPayloadInspector,
  onOpenComplianceReport,
  regime,
  versions = [],
  onRestoreVersion,
}: AdvancedDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save current active element to restore focus on close
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Lock background scroll
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus first interactive element inside drawer
    const focusTimer = setTimeout(() => {
      if (drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          drawerRef.current.focus();
        }
      }
    }, 30);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusables = (Array.from(
          drawerRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ) as HTMLElement[]).filter(el => el.offsetParent !== null || el === document.activeElement);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !drawerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !drawerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = origOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isParty = regime === "party";

  return (
    <div 
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="advanced-drawer-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-end bg-[#17233D]/45 backdrop-blur-xs df-step-enter outline-none"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="df-glass-drawer h-full max-w-md w-full flex flex-col justify-between overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#CFD8EA] flex items-center justify-between bg-white/80">
          <div id="advanced-drawer-title" className="flex items-center gap-2.5 font-bold text-[#17233D] text-sm">
            <div className="w-8 h-8 rounded-lg df-btn-primary flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <span className="block">Lịch Sử Phiên Bản & Công Cụ Nâng Cao</span>
              <span className="text-[11px] font-normal text-[#52607A]">
                Đang áp dụng: {isParty ? "Hướng dẫn 05-HD/VPTW" : "Nghị định 30/2020/NĐ-CP"}
              </span>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            aria-label="Đóng ngăn công cụ"
            className="p-1.5 rounded-lg text-[#52607A] hover:text-[#17233D] hover:bg-[#EEF2FA] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 flex-1 overflow-y-auto studio-scrollbar">
          
          {/* 1. Lịch sử phiên bản */}
          {versions.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#17233D] flex items-center gap-1.5">
                  <History className="w-4 h-4 text-[#6255E8]" />
                  <span>Lịch Sử Phiên Bản ({versions.length})</span>
                </span>
                <span className="text-[10.5px] text-[#52607A]">Khôi phục tức thì</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 studio-scrollbar">
                {versions.slice(0, 8).map((v) => (
                  <div key={v.id} className="p-2.5 rounded-xl border border-[#CFD8EA] bg-white flex items-center justify-between gap-2 text-xs shadow-2xs">
                    <div className="truncate">
                      <span className="font-bold text-[#17233D] block truncate text-[11.5px]">{v.title}</span>
                      <span className="text-[10.5px] text-[#52607A]">{v.timestamp}</span>
                    </div>
                    {onRestoreVersion && (
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreVersion(v);
                          onClose();
                        }}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#EEF0FE] hover:bg-[#6255E8] text-[#6255E8] hover:text-white text-[11px] font-bold shrink-0 transition cursor-pointer"
                      >
                        Khôi phục
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Tóm tắt căn cứ pháp lý hiện hành */}
          <div className="p-3.5 rounded-xl bg-[#EEF2FA] border border-[#CFD8EA] space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#17233D]">
              <Scale className="w-4 h-4 text-[#16A6A6]" />
              <span>Căn cứ thể thức đang kích hoạt</span>
            </div>
            <p className="text-[11px] text-[#52607A] leading-relaxed">
              {isParty
                ? "Hướng dẫn số 05-HD/VPTW: Tiêu đề ĐẢNG CỘNG SẢN VIỆT NAM 15pt đậm, dấu * dưới tên cấp ủy, Số không dấu hai chấm, phông 14pt Times New Roman."
                : "Nghị định số 30/2020/NĐ-CP: Quốc hiệu 12-13pt đậm, Tiêu ngữ 13-14pt đậm, Số có dấu hai chấm (Số: ...), lề chuẩn 20-20-30-15mm, phông 13-14pt."}
            </p>
          </div>

          {/* 3. Công cụ kiểm thử & kỹ thuật */}
          <div className="space-y-2.5">
            <span className="text-sm font-bold text-[#17233D] block">
              Công Cụ Kỹ Thuật & Thư Viện Mẫu
            </span>

            <button 
              type="button"
              onClick={() => { onClose(); onOpenPilotModal(); }}
              className="w-full p-3.5 rounded-xl border border-[#6255E8]/30 bg-[#EEF0FE]/50 hover:bg-[#EEF0FE] transition cursor-pointer flex items-center justify-between group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl df-btn-primary text-white">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-[#17233D] block">Thư Viện 27 Tài Liệu Pilot & 10 Ca Thử Thách</span>
                  <span className="text-[11px] text-[#52607A]">Khảo nghiệm tự động KH, QĐ, CV, BB, TTr và Đảng HD 05</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#6255E8] group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            <button 
              type="button"
              onClick={() => { onClose(); onOpenComplianceReport(); }}
              className="w-full p-3.5 rounded-xl border border-[#CFD8EA] bg-white hover:bg-[#F5F6FA] transition cursor-pointer flex items-center justify-between group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#E8F8F8] text-[#0B5C5C]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-[#17233D] block">Bảng Kiểm Tra Chi Tiết 9 Thành Phần</span>
                  <span className="text-[11px] text-[#52607A]">Xem bảng kiểm định 9 tiêu chí thể thức tổng hợp</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#52607A] group-hover:translate-x-0.5 transition shrink-0" />
            </button>

            <button 
              type="button"
              onClick={() => { onClose(); onOpenPayloadInspector(); }}
              className="w-full p-3.5 rounded-xl border border-[#CFD8EA] bg-white hover:bg-[#F5F6FA] transition cursor-pointer flex items-center justify-between group text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#17233D] text-white">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-xs text-[#17233D] block">Trình Kiểm Tra Dữ Liệu Nguồn & AI Payload</span>
                  <span className="text-[11px] text-[#52607A]">Xem cấu trúc khối phân vùng và dữ liệu gửi AI</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#52607A] group-hover:translate-x-0.5 transition shrink-0" />
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-white/90 border-t border-[#CFD8EA] flex items-center justify-between text-xs">
          <span className="text-[11px] text-[#52607A]">Nhấn <kbd className="px-1.5 py-0.5 bg-[#EEF2FA] border border-[#CFD8EA] rounded text-[10px]">Esc</kbd> để đóng</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 py-1.5 rounded-xl text-xs font-bold text-[#17233D] bg-[#EEF2FA] hover:bg-[#CFD8EA]/60 transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
