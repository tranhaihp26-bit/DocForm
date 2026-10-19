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
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const currentName = currentRegime === "party" ? "Văn bản Đảng (HD 05-HD/VPTW)" : "Văn bản Hành chính (NĐ 30/2020/NĐ-CP)";
  const targetName = targetRegime === "party" ? "Văn bản Đảng (HD 05-HD/VPTW)" : "Văn bản Hành chính (NĐ 30/2020/NĐ-CP)";

  return (
    <div 
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
// 2. STEP 1: CHỌN LOẠI (HỆ THỂ THỨC, MẪU CƠ QUAN & LOẠI VĂN BẢN)
// =============================================================================
interface Step1ViewProps {
  regime: "state" | "party";
  onRequestRegimeSwitch: (target: "state" | "party") => void;
  doc: DocumentState;
  onSelectTemplate: (templateId: string) => void;
  onFieldChange: (field: keyof DocumentState, value: string) => void;
  onNext: () => void;
}

export function Step1View({
  regime,
  onRequestRegimeSwitch,
  doc,
  onFieldChange,
  onNext,
}: Step1ViewProps) {
  const isParty = regime === "party";
  const isCompanyProfile = isParty 
    ? doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID 
    : doc.headerProfile === COMPANY_HEADER_PROFILE_ID;
  const [showDiffModal, setShowDiffModal] = React.useState(false);

  const DOCUMENT_TYPES_ND30 = [
    { id: "kh", name: "KẾ HOẠCH", desc: "Kế hoạch nhiệm vụ, công tác an toàn" },
    { id: "qd", name: "QUYẾT ĐỊNH", desc: "Quyết định hành chính cá biệt" },
    { id: "cv", name: "CÔNG VĂN", desc: "Công văn gửi cơ quan, đối tác" },
    { id: "bb", name: "BIÊN BẢN", desc: "Biên bản làm việc, kiểm tra 3 bên" },
    { id: "ttr", name: "TỜ TRÌNH", desc: "Tờ trình đề xuất, xin chủ trương" },
    { id: "bc", name: "BÁO CÁO", desc: "Báo cáo định kỳ hoặc chuyên đề" },
    { id: "tb", name: "THÔNG BÁO", desc: "Thông báo kết luận, phân công" },
    { id: "hd", name: "HƯỚNG DẪN", desc: "Văn bản hướng dẫn nghiệp vụ" },
  ];

  const DOCUMENT_TYPES_HD05 = [
    { id: "nq_dang", name: "NGHỊ QUYẾT", desc: "Nghị quyết đại hội, ban chấp hành Đảng" },
    { id: "qd_dang", name: "QUYẾT ĐỊNH", desc: "Quyết định của cấp ủy, đảng bộ" },
    { id: "cv_dang", name: "CÔNG VĂN", desc: "Công văn Đảng (trích yếu cột trái)" },
    { id: "kh_dang", name: "KẾ HOẠCH", desc: "Kế hoạch công tác xây dựng Đảng" },
    { id: "bc_dang", name: "BÁO CÁO", desc: "Báo cáo công tác Đảng, chuyên đề" },
    { id: "bb_dang", name: "BIÊN BẢN", desc: "Biên bản sinh hoạt chi bộ, đại hội" },
    { id: "tb_dang", name: "THÔNG BÁO", desc: "Thông báo kết luận của cấp ủy" },
    { id: "hd_dang", name: "HƯỚNG DẪN", desc: "Hướng dẫn thực hiện nghiệp vụ Đảng" },
  ];

  const docTypes = isParty ? DOCUMENT_TYPES_HD05 : DOCUMENT_TYPES_ND30;

  return (
    <div data-wizard-step="1" className="df-wizard-page flex flex-col justify-between h-full df-step-enter overflow-hidden">
      
      {/* 1. Header: Tiêu đề & Subtitle gọn ngang hàng */}
      <div className="flex items-baseline justify-between mb-2 shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#17233D] tracking-tight">Chọn mẫu văn bản</h1>
          <p className="text-xs sm:text-sm text-[#52607A]">Chọn thể thức và loại văn bản để bắt đầu</p>
        </div>
      </div>

      {/* 2. Hàng trên: 2 panel cân đối (Hệ thể thức bên trái, Mẫu cơ quan bên phải) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        
        {/* Panel Trái: Hệ thể thức */}
        <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3 shadow-2xs">
          <h2 className="text-xs sm:text-sm font-bold text-[#17233D] mb-2">Hệ thể thức</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hệ thể thức">
            {/* Văn bản hành chính (NĐ 30) */}
            <button
              type="button"
              aria-pressed={!isParty}
              onClick={() => onRequestRegimeSwitch("state")}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer min-h-[52px] ${
                !isParty
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-purple-100 text-[#6255E8] flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">Văn bản hành chính</span>
                  <span className="block text-[10.5px] text-[#52607A]">Nghị định 30</span>
                </div>
              </div>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                !isParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
              }`}>
                ✓
              </span>
            </button>

            {/* Văn bản Đảng (HD 05) */}
            <button
              type="button"
              aria-pressed={isParty}
              onClick={() => onRequestRegimeSwitch("party")}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer min-h-[52px] ${
                isParty
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">Văn bản Đảng</span>
                  <span className="block text-[10.5px] text-[#52607A]">Hướng dẫn 05</span>
                </div>
              </div>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                isParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
              }`}>
                ✓
              </span>
            </button>
          </div>
        </div>

        {/* Panel Phải: Mẫu cơ quan */}
        <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3 shadow-2xs">
          <h2 className="text-xs sm:text-sm font-bold text-[#17233D] mb-2">Mẫu cơ quan</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mẫu cơ quan">
            {/* Hoa tiêu miền Bắc */}
            <button
              type="button"
              aria-pressed={isCompanyProfile}
              onClick={() => {
                if (isParty) {
                  onFieldChange("headerProfile" as any, COMPANY_HEADER_HD05_PROFILE_ID);
                } else {
                  onFieldChange("headerProfile" as any, COMPANY_HEADER_PROFILE_ID);
                }
              }}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer min-h-[52px] ${
                isCompanyProfile
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">Hoa tiêu miền Bắc</span>
                  <span className="block text-[10.5px] text-[#52607A] truncate">Mẫu duyệt khóa cứng</span>
                </div>
              </div>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                isCompanyProfile ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
              }`}>
                ✓
              </span>
            </button>

            {/* Cơ quan chung */}
            <button
              type="button"
              aria-pressed={!isCompanyProfile}
              onClick={() => onFieldChange("headerProfile" as any, "generic")}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between cursor-pointer min-h-[52px] ${
                !isCompanyProfile
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold truncate">Cơ quan chung</span>
                  <span className="block text-[10.5px] text-[#52607A] truncate">Tự do chỉnh sửa</span>
                </div>
              </div>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                !isCompanyProfile ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
              }`}>
                ✓
              </span>
            </button>
          </div>
        </div>

      </div>

      {/* 3. Hàng dưới: Panel Loại văn bản (Lưới 4x2 ở desktop) */}
      <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs flex-1 min-h-0 flex flex-col justify-between my-2">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="text-xs sm:text-sm font-bold text-[#17233D]">Loại văn bản</h2>
        </div>

        {/* Lưới 4x2 loại văn bản */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-h-0">
          {docTypes.map((t) => {
            const isSelected = (doc.documentType || "").toUpperCase() === t.name;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={isSelected}
                title={t.desc}
                onClick={() => onFieldChange("documentType", t.name)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "border-[#6255E8] bg-[#EEF0FE]/75 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                    : "border-[#CFD8EA] hover:border-[#94A3B8] hover:bg-[#F5F6FA] text-[#17233D]"
                }`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span className="text-xs font-bold">{t.name}</span>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    isSelected ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
                  }`}>
                    ✓
                  </span>
                </div>
                <span className="text-[11px] text-[#52607A] line-clamp-2 font-normal mt-1 leading-tight">{t.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Info banner dưới đáy card */}
        <div className="mt-2.5 p-2 bg-[#F5F6FA] border border-[#CFD8EA] rounded-xl flex items-center justify-between text-xs text-[#52607A] shrink-0">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-[#6255E8] shrink-0" />
            <span className="truncate">Mẫu trình bày phù hợp với loại văn bản đã chọn.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowDiffModal(true)}
            className="text-[#6255E8] hover:underline font-semibold flex items-center gap-1 shrink-0 ml-2 cursor-pointer"
          >
            <span>Xem khác biệt thể thức</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Modal Xem khác biệt thể thức (Progressive Disclosure) */}
      {showDiffModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#17233D]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 border border-[#CFD8EA] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-[#17233D]">
                <Scale className="w-4 h-4 text-[#6255E8]" />
                <span>Khác biệt cốt lõi giữa hai hệ thể thức</span>
              </div>
              <button type="button" onClick={() => setShowDiffModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#52607A] leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <strong className="text-[#17233D] block mb-1">🏛️ Nghị định 30/2020/NĐ-CP:</strong>
                <ul className="list-disc pl-4 space-y-1 text-[11.5px]">
                  <li>Quốc hiệu 12–13pt in hoa đậm; Tiêu ngữ 13–14pt đậm, có vạch kẻ.</li>
                  <li>Số ký hiệu bắt buộc có dấu hai chấm (<code className="text-[#17233D]">Số: .../QĐ-...</code>).</li>
                  <li>Đường kẻ cơ quan dài 1/3 đến 1/2 dòng chữ.</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <strong className="text-[#17233D] block mb-1">☭ Hướng dẫn 05-HD/VPTW:</strong>
                <ul className="list-disc pl-4 space-y-1 text-[11.5px]">
                  <li>Tiêu đề <code className="text-[#17233D]">ĐẢNG CỘNG SẢN VIỆT NAM</code> 15pt đậm; dấu <code className="text-[#17233D]">*</code> dưới tên cấp ủy.</li>
                  <li>Số ký hiệu không có dấu hai chấm (<code className="text-[#17233D]">Số 05-NQ/ĐU</code>).</li>
                  <li>Vạch 5 dấu gạch nối (<code className="text-[#17233D]">-----</code>) dưới trích yếu.</li>
                </ul>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button type="button" onClick={() => setShowDiffModal(false)} className="px-4 py-1.5 rounded-lg border border-[#CFD8EA] text-xs font-semibold text-[#17233D] hover:bg-slate-50">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// =============================================================================
// 3. STEP 2: NGUỒN TÀI LIỆU (TẢI TỆP HOẶC DÙNG MẪU)
// =============================================================================
interface Step2ViewProps {
  regime: "state" | "party";
  doc: DocumentState;
  uploadedFileName: string;
  uploadedBlocks: SourceBlock[];
  structuredImport: StructuredImport | null;
  templates: TemplatePreset[];
  onSelectTemplate: (templateId: string) => void;
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  evaluationSummary: DocumentEvaluationSummary;
  onPrev: () => void;
  onNext: () => void;
  onOpenReviewModal?: () => void;
}

export function Step2View({
  regime,
  doc,
  uploadedFileName,
  uploadedBlocks,
  structuredImport,
  templates,
  onSelectTemplate,
  onFileUpload,
  isUploading,
  onPrev,
  onNext,
  onOpenReviewModal,
}: Step2ViewProps) {
  const isParty = regime === "party";
  const isCompanyProfile = isParty 
    ? doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID 
    : doc.headerProfile === COMPANY_HEADER_PROFILE_ID;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  
  const acceptFile = (file?: File) => {
    if (!file || isUploading) return;
    if (!/\.(docx|txt)$/i.test(file.name)) {
      setUploadError("Vui lòng chọn tệp Word (.docx) hoặc văn bản (.txt).");
      return;
    }
    setUploadError("");
    onFileUpload(file);
  };

  // Stats calculation
  const tablesCount = structuredImport?.body?.tablesCount ?? (doc.bodyHtml.match(/<table\b/gi)?.length || 0);
  const blocksCount = uploadedBlocks.length;
  const appendicesCount = doc.appendices?.length || 0;

  // 4 curated templates for clean non-scrolling 4-row list
  const filteredTemplates = templates.filter(t => t.type === (isParty ? "party" : "state")).slice(0, 4);

  const hasImportedFile = Boolean(uploadedFileName || blocksCount > 0);

  return (
    <div data-wizard-step="2" className="df-wizard-page flex flex-col justify-between h-full df-step-enter overflow-hidden">
      
      {/* 1. Header: Tiêu đề & Subtitle */}
      <div className="flex items-baseline justify-between mb-2 shrink-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#17233D] tracking-tight">Chọn nguồn tài liệu</h1>
          <p className="text-xs sm:text-sm text-[#52607A]">
            {doc.documentType || "Kế hoạch"} · {isCompanyProfile ? "Hoa tiêu miền Bắc" : "Cơ quan chung"}
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.txt"
        disabled={isUploading}
        aria-label="Chọn tệp Word hoặc văn bản"
        onChange={event => {
          acceptFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
        className="hidden"
      />

      {/* 2. Hai cột: Khi đã nhập tài liệu, ưu tiên không gian cột trái ~70% (1fr 300px) */}
      <div className={`grid grid-cols-1 ${hasImportedFile ? "md:grid-cols-[1fr_300px]" : "md:grid-cols-2"} gap-3 flex-1 min-h-0 overflow-hidden my-1`}>
        
        {/* CỘT TRÁI: NGUỒN TÀI LIỆU */}
        {hasImportedFile ? (
          /* TRẠNG THÁI ĐÃ NHẬP: Thẻ nguồn + Xem nhanh nguồn */
          <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs flex flex-col justify-between h-full overflow-hidden">
            <div className="space-y-2 flex-1 min-h-0 flex flex-col">
              <h2 className="text-xs sm:text-sm font-bold text-[#17233D] shrink-0">Tài liệu đang mở</h2>
              
              {/* Thẻ tóm tắt tệp đang mở */}
              <div className="p-2.5 rounded-xl bg-[#F5F6FA] border border-[#CFD8EA] flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-xs font-bold text-[#17233D] truncate" title={uploadedFileName}>
                      {uploadedFileName || "Tài liệu Word đã nạp"}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[#127955] font-semibold">
                      <Check className="w-3 h-3 text-[#127955]" /> Đã đọc tài liệu
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg border border-[#CFD8EA] bg-white hover:bg-slate-50 text-xs font-semibold text-[#17233D] flex items-center gap-1 transition shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 text-[#6255E8]" />
                  <span>Thay tệp</span>
                </button>
              </div>

              {/* Dòng metadata ngắn */}
              <div className="text-[11.5px] text-[#52607A] font-medium shrink-0 px-1">
                {tablesCount > 0 ? `${tablesCount} bảng` : "Không có bảng"} · {appendicesCount > 0 ? `${appendicesCount} phụ lục` : "Không có phụ lục"}
              </div>

              {/* Hộp xem nhanh nguồn (A4 style có cuộn nội bộ) */}
              <div className="flex-1 min-h-0 flex flex-col border border-[#CFD8EA] rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 border-b border-[#CFD8EA] px-3 py-1.5 text-xs font-bold text-[#17233D] shrink-0">
                  Xem nhanh nguồn
                </div>
                <div 
                  className="flex-1 min-h-0 overflow-y-auto p-4 text-[13px] leading-relaxed text-[#17233D] custom-scroll bg-white pb-8"
                  style={{ fontFamily: '"Times New Roman", Times, serif' }}
                >
                  {structuredImport?.body?.html ? (
                    <div 
                      className="prose prose-xs max-w-none text-[#17233D]"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(structuredImport.body.html) }}
                    />
                  ) : doc.bodyHtml ? (
                    <div 
                      className="prose prose-xs max-w-none text-[#17233D]"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(doc.bodyHtml) }}
                    />
                  ) : (
                    <p className="italic text-slate-400">Nội dung tệp nguồn đang được đồng bộ hóa.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Dưới cùng cột trái: Đối chiếu nguồn & Gợi ý kéo thả */}
            <div className="pt-2 border-t border-[#CFD8EA] flex items-center justify-between text-xs text-[#52607A] shrink-0">
              {onOpenReviewModal ? (
                <button
                  type="button"
                  onClick={onOpenReviewModal}
                  className="text-[#6255E8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Đối chiếu nguồn</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              ) : <span />}
              <span className="text-[11px] text-slate-400">Kéo thả tệp khác để thay nguồn</span>
            </div>
          </div>
        ) : (
          /* TRẠNG THÁI CHƯA CÓ NGUỒN: Dropzone gọn */
          <div className="bg-white rounded-2xl border border-[#CFD8EA] p-4 shadow-2xs flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 text-[#6255E8] flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </span>
                  <h2 className="text-sm font-bold text-[#17233D]">Tải tài liệu của bạn</h2>
                </div>
                <span className="text-[10.5px] font-semibold text-[#6255E8] bg-[#EEF0FE] px-2 py-0.5 rounded-full">
                  Có tài liệu sẵn
                </span>
              </div>
              <p className="text-xs text-[#52607A] mb-3 leading-relaxed">
                Mở tệp Word hoặc văn bản để nhận diện các phần và đối chiếu với nội dung nguồn.
              </p>

              <button
                type="button"
                disabled={isUploading}
                aria-busy={isUploading}
                className="df-upload-dropzone my-2"
                data-dragging={isDragging}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={event => { event.preventDefault(); if (!isUploading) setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={event => { event.preventDefault(); setIsDragging(false); acceptFile(event.dataTransfer.files[0]); }}
              >
                <span className="df-upload-icon">{isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}</span>
                <strong>{isUploading ? "Đang đọc tài liệu…" : "Chọn tệp từ máy tính"}</strong>
                <span className="text-xs">{isUploading ? "Đang nhận diện nội dung và bảng biểu" : "Hoặc kéo thả tệp .docx / .txt vào đây"}</span>
              </button>
              {uploadError && <p role="alert" className="text-xs text-[#B82339] mt-2">{uploadError}</p>}
            </div>

            <div className="pt-2 border-t border-[#CFD8EA] text-[11px] text-[#52607A] flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#127955] shrink-0" />
              <span>Giữ tệp nguồn để đối chiếu trước khi áp dụng thay đổi.</span>
            </div>
          </div>
        )}

        {/* CỘT PHẢI: HOẶC BẮT ĐẦU TỪ MẪU */}
        <div className="bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs flex flex-col justify-between h-full overflow-hidden">
          <div>
            <div className="mb-2.5">
              <h2 className="text-xs sm:text-sm font-bold text-[#17233D]">Hoặc bắt đầu từ mẫu</h2>
              <p className="text-xs text-[#52607A] mt-0.5">Chọn mẫu sẽ thay nguồn hiện tại</p>
            </div>

            {/* 4 Hàng Mẫu Chuẩn Gọn Gàng */}
            <div className="space-y-2">
              {filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  className="p-2.5 rounded-xl border border-[#CFD8EA] hover:border-[#6255E8] bg-white transition flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="w-8 h-8 rounded-lg bg-indigo-50 text-[#6255E8] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="font-bold text-[#17233D] block truncate">{t.name}</span>
                      <span className="text-[11px] text-[#52607A] line-clamp-1 block mt-0.5">{t.desc}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => onSelectTemplate(t.id)}
                    className="px-3 py-1 rounded-lg border border-[#CFD8EA] bg-white hover:bg-[#EEF0FE] text-[#6255E8] font-bold text-xs shrink-0 transition cursor-pointer"
                  >
                    Dùng mẫu
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#CFD8EA] text-[11px] text-[#52607A] flex items-center gap-1.5 shrink-0">
            <Info className="w-3.5 h-3.5 text-[#6255E8] shrink-0" />
            <span>Mẫu chuẩn áp dụng sẵn phông Times New Roman {isParty ? "14pt" : "13pt"}.</span>
          </div>
        </div>

      </div>

    </div>
  );
}

// =============================================================================
// 4. STEP 4: XEM TRƯỚC & XUẤT (PROPOSED / ORIGINAL / DIFF)
// =============================================================================
interface Step4ViewProps {
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

export function Step4View({
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
}: Step4ViewProps) {
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
    <div data-wizard-step="4" className="h-full flex flex-col min-h-0 overflow-hidden df-step-enter pt-1">
      {/* Semantic accessible heading */}
      <h1 className="sr-only">Xem trước & xuất - Chuẩn thể thức</h1>

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
                      Bản nháp này chưa có bản lưu đối chiếu gốc bất biến. Bạn có thể tiếp tục chỉnh sửa hoặc tải tệp Word tại Bước 2.
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
