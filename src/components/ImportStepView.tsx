/**
 * @file ImportStepView.tsx
 * @description Chặng 3 — Bước 1 "Tải & nhận diện".
 *
 * Gộp ba khối của luồng cũ (chọn hệ thể thức + mẫu cơ quan + loại văn bản,
 * tải DOCX/TXT, chọn mẫu hệ thống) vào một bước duy nhất, đồng thời công khai
 * nguồn chứng cứ của quyết định thể thức: hệ người dùng chọn, hệ nguồn gợi ý,
 * chứng cứ trích dẫn và hệ đã xác nhận.
 *
 * Toàn bộ lựa chọn nằm trong luồng tài liệu cuộn được để đạt 320×568,
 * 390×844 và 844×390 mà không cắt bớt nút.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  RefreshCw,
  Scale,
  ShieldCheck,
  Upload,
  Plus,
  ArrowLeft,
  ArrowRight,
  X,
} from "lucide-react";
import DOMPurify from "dompurify";
import type { DocumentState, TemplatePreset } from "../App.tsx";
import { COMPANY_HEADER_PROFILE_ID } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../canonical/hd05/companyHeaderHD05.ts";
import type { SourceBlock, StructuredImport } from "../shared/schemas/document.schema.ts";
import type { OriginalDocumentSnapshot } from "../utils/draftStore.ts";
import { useAccessibleDialog } from "../utils/useAccessibleDialog.ts";
import "./ImportStepView.css";
import {
  deriveSourceMismatch,
  docTypeDecisionCovers,
  findAppliedTemplate,
  type DocTypeDecision,
} from "../utils/sourceMismatch.ts";

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

const REGIME_LABEL: Record<"state" | "party", string> = {
  state: "Hành chính — Nghị định 30/2020/NĐ-CP",
  party: "Văn bản Đảng — Hướng dẫn 05-HD/VPTW",
};

type ImportGroupStatus = "identified" | "needs-review" | "missing" | "unverified" | "no-source";

interface ImportGroupSummary {
  id: string;
  title: string;
  value: string;
  status: ImportGroupStatus;
}

export interface ImportStepViewProps {
  regime: "state" | "party";
  onRequestRegimeSwitch: (target: "state" | "party") => void;
  doc: DocumentState;
  templates: TemplatePreset[];
  sourceOrigin: "none" | "uploaded_file" | "system_template";
  onCreateDocument: (selection: {regime:"state"|"party";documentType:string;templateId?:string;headerProfile:"company"|"generic"}) => boolean;
  onFieldChange: (field: keyof DocumentState, value: string) => void;
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  uploadedFileName: string;
  uploadedBlocks: SourceBlock[];
  structuredImport: StructuredImport | null;
  originalSnapshot: OriginalDocumentSnapshot | null;
  originalAvailable: boolean;
  onOpenReviewModal?: () => void;
  onDownloadOriginal?: () => void;
  hasSelectedSource: boolean;
  aiPartitionConsent: boolean;
  onAiPartitionConsentChange: (enabled: boolean) => void;
  isCheckingPartitions: boolean;
  partitionCheckNotice: string;
  partitionCheckSource: "gemini_ai" | "rule_fallback" | "mixed" | "unverified";
  partitionProgress: {
    processedChunks: number;
    totalChunks: number;
    lastChunkStatus?: "completed" | "failed" | "timed_out" | "invalid_response";
  } | null;
  partitionCoverage: {
    aiReviewedBlockIds: string[];
    ruleFallbackBlockIds: string[];
    unreviewedBlockIds: string[];
    chunks: Array<{ chunkIndex: number; status: "completed" | "failed" | "timed_out" | "invalid_response"; blockIds: string[]; error?: string }>;
  } | null;
  canContinue: boolean;
  onNext: () => void;
  /**
   * S3-F01: quyết định override khi nguồn và loại văn bản khác nhau. Có quyết định
   * hợp lệ thì cổng xuất mở, và Bước 1 hiển thị provenance thay vì câu khẳng định
   * "mẫu phù hợp".
   */
  docTypeOverride: DocTypeDecision | null;
  onConfirmDocTypeOverride: () => void;
}

export function ImportStepView({
  regime,
  onRequestRegimeSwitch,
  doc,
  templates,
  sourceOrigin,
  onCreateDocument,
  onFieldChange,
  onFileUpload,
  isUploading,
  uploadedFileName,
  uploadedBlocks,
  structuredImport,
  originalSnapshot,
  originalAvailable,
  onOpenReviewModal,
  onDownloadOriginal,
  hasSelectedSource,
  aiPartitionConsent,
  onAiPartitionConsentChange,
  isCheckingPartitions,
  partitionCheckNotice,
  partitionCheckSource,
  partitionProgress,
  partitionCoverage,
  canContinue,
  onNext,
  docTypeOverride,
  onConfirmDocTypeOverride,
}: ImportStepViewProps) {
  const isParty = regime === "party";
  const isCompanyProfile = isParty
    ? doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID
    : doc.headerProfile === COMPANY_HEADER_PROFILE_ID;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [flow,setFlow]=useState<"upload"|"create"|null>(null);
  const [phase,setPhase]=useState<"choice"|"upload"|"recognition"|"metadata"|"regime"|"doctype"|"template"|"ready">("choice");
  const [draftRegime,setDraftRegime]=useState<"state"|"party">(regime);
  const [draftDocType,setDraftDocType]=useState("");
  const [draftProfile,setDraftProfile]=useState<"company"|"generic">("company");
  const [pendingUpload,setPendingUpload]=useState(false);
  const diffDialogRef = useAccessibleDialog(showDiffModal, () => setShowDiffModal(false));

  useEffect(()=>{
    if(pendingUpload&&sourceOrigin==="uploaded_file"&&!isUploading&&uploadedFileName){
      setPendingUpload(false);
      setPhase("recognition");
    }
  },[pendingUpload,sourceOrigin,isUploading,uploadedFileName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wideScreen = window.matchMedia("(min-width: 1536px)");
    const syncContextVisibility = () => setContextOpen(wideScreen.matches);
    syncContextVisibility();
    wideScreen.addEventListener("change", syncContextVisibility);
    return () => wideScreen.removeEventListener("change", syncContextVisibility);
  }, []);

  const acceptFile = (file?: File) => {
    if (!file || isUploading) return;
    if (!/\.(docx|txt)$/i.test(file.name)) {
      setUploadError("Vui lòng chọn tệp Word (.docx) hoặc văn bản (.txt).");
      return;
    }
    setUploadError("");
    setPendingUpload(true);
    onFileUpload(file);
  };

  const choosingNew=flow==="create";
  const choiceIsParty=choosingNew?draftRegime==="party":isParty;
  const choiceIsCompany=choosingNew?draftProfile==="company":isCompanyProfile;
  const docTypes = choiceIsParty ? DOCUMENT_TYPES_HD05 : DOCUMENT_TYPES_ND30;
  const tablesCount = structuredImport?.source.tableCount ?? structuredImport?.body?.tablesCount ?? (doc.bodyHtml.match(/<table\b/gi)?.length || 0);
  const blocksCount = uploadedBlocks.length;
  const appendicesCount = structuredImport?.appendices.length ?? doc.appendices?.length ?? 0;
  const filteredTemplates = templates.filter((t) => t.type === (draftRegime === "party" ? "party" : "state") && t.defaultData.documentType.toUpperCase().startsWith(draftDocType));
  const hasImportedFile = Boolean(uploadedFileName || blocksCount > 0);
  const hasUploadedSource = sourceOrigin === "uploaded_file" && hasImportedFile;
  const detection = structuredImport?.regimeDetection ?? null;
  const appliedTemplate = findAppliedTemplate(templates, originalSnapshot);
  const appliedTemplateRegime = appliedTemplate?.type ?? null;

  const chosenDocType = (doc.documentType || "").toUpperCase().trim();

  // ---------------------------------------------------------------------------
  // Provenance: chosen / suggested / confirmed + the reason for each mismatch.
  // Phép suy luận nguồn ↔ lựa chọn dùng CHUNG với cổng xuất trong App
  // (`utils/sourceMismatch.ts`), để giao diện không bao giờ cảnh báo mâu thuẫn mà
  // cổng xuất lại coi là hợp lệ (lỗi S3-F01).
  // ---------------------------------------------------------------------------
  const mismatch = deriveSourceMismatch({
    hasSelectedSource,
    hasImportedFile,
    structuredImport,
    originalSnapshot,
    templates,
    isCompanyProfile,
    chosenRegime: regime,
    chosenDocType,
  });
  const { sourceDocType, docTypeMismatch, profileMismatch, templateMismatch } = mismatch;
  // Quyết định override chỉ có hiệu lực cho đúng cặp nguồn/loại/hệ đã xác nhận.
  const overrideCovers = docTypeDecisionCovers(docTypeOverride, mismatch, regime);

  const suggestedRegimeText = !detection
    ? null
    : detection.suggestedRegime
      ? REGIME_LABEL[detection.suggestedRegime]
      : detection.conflict
        ? "Xung đột hai hệ — bạn phải chọn"
        : "Chưa đủ chứng cứ — bạn phải chọn";

  const confirmedRegimeText = detection
    ? `${REGIME_LABEL[detection.confirmedRegime]} (${detection.decidedBy === "user" ? "do bạn xác nhận" : "theo chứng cứ mạnh"})`
    : null;

  const sourceOrgHeader =
    structuredImport?.fields?.orgHeader1?.value ||
    (appliedTemplate ? `${appliedTemplate.defaultData.orgHeader1} ${appliedTemplate.defaultData.orgHeader2}` : "");
  const sourceLooksCompany = /HOA TIÊU/i.test(sourceOrgHeader);

  const evidenceItems = detection?.evidence ?? [];
  const demoDocType = (templates[0]?.defaultData.documentType || "").toUpperCase().trim();
  const demoDocTypeMismatch = Boolean(
    !hasSelectedSource && demoDocType && chosenDocType && demoDocType !== chosenDocType
  );

  const summarizeFields = (keys: string[], fallback: string): { value: string; status: ImportGroupStatus } => {
    if (!hasSelectedSource) return { value: "Chưa có nguồn tài liệu", status: "no-source" };
    const records = keys.map((key) => structuredImport?.fields[key]).filter((field) => field !== undefined);
    if (records.length > 0) {
      const value = records.map((field) => field.value?.trim()).filter(Boolean).join(" · ");
      if (records.some((field) => field.status === "ambiguous")) {
        return { value: value || "Cần đối chiếu nguồn", status: "needs-review" };
      }
      if (value) return { value, status: "identified" };
      return { value: "Chưa tìm thấy trong nguồn", status: "missing" };
    }
    return fallback.trim()
      ? { value: fallback.trim(), status: "identified" }
      : { value: "Chưa tìm thấy trong nguồn", status: "missing" };
  };

  const importGroups: ImportGroupSummary[] = [
    { id: "01", title: "Tiêu đề thể thức", ...summarizeFields(["nationalHeader1", "nationalHeader2"], [doc.nationalHeader1, doc.nationalHeader2].filter(Boolean).join(" · ")) },
    { id: "02", title: "Cơ quan ban hành", ...summarizeFields(["orgHeader1", "orgHeader2"], [doc.orgHeader1, doc.orgHeader2].filter(Boolean).join(" · ")) },
    { id: "03", title: "Số, ký hiệu", ...summarizeFields(["referenceNumber"], doc.referenceNumber) },
    { id: "04", title: "Địa danh, ngày tháng", ...summarizeFields(["locationAndDate"], doc.locationAndDate) },
    { id: "05", title: "Tên loại và trích yếu", ...summarizeFields(["documentType", "subject"], [doc.documentType, doc.subject].filter(Boolean).join(" · ")) },
    { id: "06", title: "Nội dung văn bản (Body)", value: hasSelectedSource && (structuredImport?.body?.html || doc.bodyHtml) ? `${structuredImport?.body?.sourceBlockIds.length ?? blocksCount} khối nội dung` : hasSelectedSource ? "Chưa tìm thấy nội dung Body" : "Chưa có nguồn tài liệu", status: !hasSelectedSource ? "no-source" : (structuredImport?.body?.html || doc.bodyHtml) ? "identified" : "missing" },
    { id: "07", title: "Quyền hạn, chức vụ, chữ ký", ...summarizeFields(["signTitle", "signName"], [doc.signTitle, doc.signName].filter(Boolean).join(" · ")) },
    {
      id: "08",
      title: "Dấu, chữ ký số",
      value: !hasSelectedSource ? "Chưa có nguồn tài liệu" : structuredImport?.seal?.status === "present" ? structuredImport.seal.type === "digital_signature" ? "Có chữ ký số" : "Có dấu" : structuredImport?.seal?.status === "missing" ? "Không thấy dấu hoặc chữ ký số" : structuredImport?.seal?.status === "unverified" ? "Chưa xác minh" : "Chưa có dữ liệu nhận diện",
      status: !hasSelectedSource ? "no-source" : structuredImport?.seal?.status === "present" ? "identified" : structuredImport?.seal?.status === "missing" ? "missing" : "unverified",
    },
    { id: "09", title: "Nơi nhận", ...summarizeFields(["recipients"], doc.recipients) },
  ];
  const identifiedGroupsCount = importGroups.filter((group) => group.status === "identified" || (group.status === "needs-review" && group.value !== "Cần đối chiếu nguồn")).length;
  const groupsNeedingReview = importGroups.filter((group) => group.status === "needs-review").length;
  const aiSourceLabel = partitionCheckSource === "gemini_ai" ? "AI đã kiểm tra" : partitionCheckSource === "mixed" ? "AI và quy tắc nội bộ" : partitionCheckSource === "rule_fallback" ? "Quy tắc nội bộ" : "Chưa kiểm tra";
  const canOpenSourceReview = hasSelectedSource && Boolean(onOpenReviewModal);
  const flowSourceReady=flow==="upload"?sourceOrigin==="uploaded_file":flow==="create"?sourceOrigin==="system_template":false;
  const continueDisabled = !flowSourceReady||(!canContinue && !canOpenSourceReview);
  const handleContinue = () => {
    if (!flowSourceReady) return;
    if (canContinue) onNext();
    else if (canOpenSourceReview) onOpenReviewModal?.();
  };
  const selectFlow=(next:"upload"|"create")=>{
    setFlow(next);
    setPhase(next==="upload"?"upload":"regime");
    setUploadError("");
    setDraftDocType("");
  };
  const createFromChoice=(templateId?:string)=>{
    if(!draftDocType)return;
    if(onCreateDocument({regime:draftRegime,documentType:draftDocType,templateId,headerProfile:draftProfile}))setPhase("ready");
  };
  const phaseLabels=flow==="upload"?["Tải tệp","Xem nhận diện","Xác nhận thông tin","Sẵn sàng soạn"]:["Hệ thể thức","Loại văn bản","Chọn mẫu","Sẵn sàng soạn"];
  const phaseIndex=flow==="upload"?(["upload","recognition","metadata","ready"] as const).indexOf(phase as "upload"):(["regime","doctype","template","ready"] as const).indexOf(phase as "regime");

  return (
    <div
      data-wizard-step="1"
      data-has-source={hasSelectedSource ? "true" : "false"}
      data-flow-phase={phase}
      data-context-visible={flow==="upload"&&(phase==="recognition"||phase==="ready")?"true":"false"}
      className="df-step-layout df-import-step df-step-enter"
    >
      <div className="df-step-content" id="df-step1-flow">
      {/* 1. Header */}
      <div className="df-import-heading flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#17233D] tracking-tight">{flow==="create"?"Tạo văn bản mới":"Tải & nhận diện"}</h1>
        <p className="text-xs sm:text-sm text-[#52607A]">{flow==="upload"?"Tải tệp, xem kết quả nhận diện và xác nhận trước khi soạn.":flow==="create"?"Chọn thể thức, loại văn bản và mẫu theo từng bước.":"Bạn muốn bắt đầu từ tệp có sẵn hay tạo một văn bản mới?"}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.txt"
        disabled={isUploading}
        aria-label="Chọn tệp Word hoặc văn bản"
        onChange={(event) => {
          acceptFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
        className="hidden"
      />

      {flow&&<div className="df-import-flow-progress" aria-label="Tiến trình trong Bước 1">
        {phaseLabels.map((label,index)=><span key={label} className={index===phaseIndex?"is-current":index<phaseIndex?"is-done":""}><b>{index<phaseIndex?<Check className="w-3 h-3"/>:index+1}</b>{label}</span>)}
        <button type="button" onClick={()=>{setFlow(null);setPhase("choice");}}><ArrowLeft className="w-3.5 h-3.5"/> Đổi cách bắt đầu</button>
      </div>}

      {phase==="choice"&&<section className="df-import-entry" aria-labelledby="df-step1-entry-title">
        <div className="df-import-entry-heading"><span>BƯỚC ĐẦU TIÊN</span><h2 id="df-step1-entry-title">Bạn muốn bắt đầu như thế nào?</h2><p>Chọn một cách để DocForm chỉ hiện những thông tin cần thiết tiếp theo.</p></div>
        {sourceOrigin!=="none"&&<div className="df-import-resume"><span><strong>Đang mở: {uploadedFileName||doc.documentType}</strong><small>{sourceOrigin==="uploaded_file"?"Tệp đã tải và nhận diện":"Văn bản tạo từ mẫu"}</small></span><button type="button" onClick={()=>{setFlow(sourceOrigin==="uploaded_file"?"upload":"create");setPhase(sourceOrigin==="uploaded_file"?(canContinue?"ready":"recognition"):"ready");}}>Tiếp tục tài liệu hiện tại <ArrowRight size={15}/></button></div>}
        <div className="df-import-entry-options">
          <button type="button" onClick={()=>selectFlow("upload")}><span className="df-import-entry-icon"><Upload/></span><strong>Tải tài liệu có sẵn</strong><small>Đọc DOCX/TXT, nhận diện nội dung và duyệt nguồn trước khi soạn.</small><span className="df-import-entry-link">Tải tài liệu <ArrowRight size={16}/></span></button>
          <button type="button" onClick={()=>selectFlow("create")}><span className="df-import-entry-icon"><Plus/></span><strong>Tạo văn bản mới</strong><small>Chọn hệ thể thức, loại văn bản và mẫu hoặc bắt đầu từ trang trắng.</small><span className="df-import-entry-link">Tạo mới <ArrowRight size={16}/></span></button>
        </div>
      </section>}

      {/* 2. Hệ thể thức + Mẫu cơ quan */}
      {((flow==="create"&&(phase==="regime"||phase==="template"))||(flow==="upload"&&phase==="metadata"))&&<div id="df-step1-regime" className="df-import-choice-grid grid grid-cols-1 lg:grid-cols-2 gap-3">
        {phase!=="template"&&<>
        <section className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3 shadow-2xs" aria-labelledby="wizard-regime-heading">
          <span className="df-import-stage-kicker">BƯỚC 1 / 4 · TẠO VĂN BẢN</span>
          <h2 id="wizard-regime-heading" className="text-xs sm:text-sm font-bold text-[#17233D] mb-2">
            Chọn hệ thể thức
          </h2>
          <p className="df-import-stage-description">Văn bản của bạn sẽ theo quy định trình bày nào? Lựa chọn này quyết định các mẫu và loại văn bản ở bước tiếp theo.</p>
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2" role="group" aria-label="Hệ thể thức">
            <button
              type="button"
              aria-pressed={!choiceIsParty}
              onClick={() => choosingNew ? (setDraftRegime("state"),setDraftDocType("")) : onRequestRegimeSwitch("state")}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[52px] ${
                !choiceIsParty
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-purple-100 text-[#6255E8] flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold">Văn bản hành chính</span>
                  <span className="block text-[10.5px] text-[#52607A]">Nghị định 30</span>
                </div>
              </div>
              {choosingNew&&<span className="df-import-regime-detail">Dành cho công văn, quyết định, kế hoạch và các văn bản hành chính.</span>}
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  !choiceIsParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
                }`}
              >
                ✓
              </span>
            </button>

            <button
              type="button"
              aria-pressed={choiceIsParty}
              onClick={() => choosingNew ? (setDraftRegime("party"),setDraftDocType("")) : onRequestRegimeSwitch("party")}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[52px] ${
                choiceIsParty
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold">Văn bản Đảng</span>
                  <span className="block text-[10.5px] text-[#52607A]">Hướng dẫn 05</span>
                </div>
              </div>
              {choosingNew&&<span className="df-import-regime-detail">Dành cho văn bản của tổ chức Đảng theo Hướng dẫn 05.</span>}
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  choiceIsParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          </div>
        </section>
        </>}

        {phase!=="regime"&&<section className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3 shadow-2xs" aria-labelledby="wizard-profile-heading">
          <h2 id="wizard-profile-heading" className="text-xs sm:text-sm font-bold text-[#17233D] mb-2">
            {choosingNew?"Thông tin cơ quan ban hành":"Mẫu cơ quan"}
          </h2>
          {choosingNew&&<p className="df-import-stage-description">Dùng phần đầu Hoa tiêu miền Bắc đã thiết lập, hoặc để trống thông tin cơ quan và tự nhập ở Bước 2.</p>}
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2" role="group" aria-label="Mẫu cơ quan">
            <button
              type="button"
              aria-pressed={choiceIsCompany}
              onClick={() => {
                if(choosingNew){setDraftProfile("company");return;}
                if (isParty) {
                  onFieldChange("headerProfile" as keyof DocumentState, COMPANY_HEADER_HD05_PROFILE_ID);
                } else {
                  onFieldChange("headerProfile" as keyof DocumentState, COMPANY_HEADER_PROFILE_ID);
                }
              }}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[52px] ${
                choiceIsCompany
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold">Hoa tiêu miền Bắc</span>
                  <span className="block text-[10.5px] text-[#52607A]">Mẫu duyệt khóa cứng</span>
                </div>
              </div>
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  choiceIsCompany ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
                }`}
              >
                ✓
              </span>
            </button>

            <button
              type="button"
              aria-pressed={!choiceIsCompany}
              onClick={() => choosingNew ? setDraftProfile("generic") : onFieldChange("headerProfile" as keyof DocumentState, "generic")}
              className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[52px] ${
                !choiceIsCompany
                  ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs"
                  : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <span className="block text-xs font-bold">Cơ quan chung</span>
                  <span className="block text-[10.5px] text-[#52607A]">Tự do chỉnh sửa</span>
                </div>
              </div>
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  !choiceIsCompany ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          </div>
        </section>}
      </div>}

      {/* 3. Loại văn bản */}
      {((flow==="create"&&phase==="doctype")||(flow==="upload"&&phase==="metadata"))&&<section id="df-step1-document-type" className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs" aria-labelledby="wizard-doctype-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-2">
          {choosingNew&&<span className="df-import-stage-kicker">BƯỚC 2 / 4 · TẠO VĂN BẢN</span>}
          <h2 id="wizard-doctype-heading" className="text-xs sm:text-sm font-bold text-[#17233D]">
            {choosingNew?"Bạn muốn tạo loại văn bản nào?":"Loại văn bản nhận diện"}
          </h2>
          {!choosingNew&&sourceDocType && (
            <span className="text-[11px] text-[#52607A]">
              Nguồn nhận diện: <strong className="text-[#17233D]">{sourceDocType}</strong>
            </span>
          )}
        </div>
        {choosingNew&&<p className="df-import-stage-description">Chọn một loại để DocForm hiển thị các mẫu phù hợp với hệ thể thức đã chọn.</p>}

        <div className="df-import-type-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
          {docTypes.map((t) => {
            const isSelected = (choosingNew?draftDocType:doc.documentType || "").toUpperCase() === t.name;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={isSelected}
                title={t.desc}
                onClick={() => choosingNew?setDraftDocType(t.name):onFieldChange("documentType", t.name)}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between min-h-[64px] ${
                  isSelected
                    ? "border-[#6255E8] bg-[#EEF0FE]/75 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                    : "border-[#CFD8EA] hover:border-[#94A3B8] hover:bg-[#F5F6FA] text-[#17233D]"
                }`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span className="text-xs font-bold">{t.name}</span>
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                      isSelected ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </div>
                <span className="text-[11px] text-[#52607A] font-normal mt-1 leading-tight">{t.desc}</span>
              </button>
            );
          })}
        </div>

        {!choosingNew&&docTypeMismatch && (
          <div
            id="source-mismatch-doctype"
            data-source-warning="doc-type"
            data-doctype-override={overrideCovers ? "true" : "false"}
            role={overrideCovers ? "note" : "status"}
            className={
              overrideCovers
                ? "mt-2.5 p-2.5 rounded-xl bg-[#F5F6FA] border border-[#CFD8EA] text-[11.5px] text-[#3B4663] flex flex-col gap-1.5"
                : "mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11.5px] text-[#9E5206] flex flex-col gap-1.5"
            }
          >
            <div className="flex items-start gap-2">
              {overrideCovers ? (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#2E7D4F]" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              )}
              <span>
                {overrideCovers ? (
                  <>
                    Bạn đã xác nhận giữ loại <strong>{chosenDocType}</strong> trên nguồn vốn là{" "}
                    <strong>{sourceDocType}</strong>
                    {docTypeOverride ? ` lúc ${new Date(docTypeOverride.decidedAt).toLocaleString("vi-VN")}` : ""}. Nội
                    dung nguồn giữ nguyên; quyết định này được ghi vào bản nháp làm bằng chứng.
                  </>
                ) : (
                  <>
                    Loại bạn chọn (<strong>{chosenDocType}</strong>) khác loại nhận diện từ nguồn (
                    <strong>{sourceDocType}</strong>). Nội dung nguồn giữ nguyên — phải chọn đúng loại hoặc xác nhận
                    rõ quyết định giữ loại này trước khi xuất.
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-5.5">
              <button
                type="button"
                data-action="resolve-doctype-mismatch"
                onClick={() => onFieldChange("documentType", sourceDocType)}
                className="inline-flex items-center gap-1 font-semibold text-[#6255E8] hover:underline cursor-pointer"
              >
                <Check className="w-3 h-3" />
                Đổi loại về {sourceDocType}
              </button>
              {!overrideCovers && (
                <button
                  type="button"
                  data-action="override-doctype-mismatch"
                  onClick={onConfirmDocTypeOverride}
                  className="inline-flex items-center gap-1 font-semibold text-[#9E5206] hover:underline cursor-pointer"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Vẫn giữ {chosenDocType} (ghi nhận quyết định)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Info banner: no truncate + wrap so it never overflows horizontally. */}
        {!choosingNew&&<div className="mt-2.5 p-2 bg-[#F5F6FA] border border-[#CFD8EA] rounded-xl flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#52607A]">
          <div className="flex items-center gap-2 min-w-0 flex-1 basis-[200px]">
            <Info className="w-3.5 h-3.5 text-[#6255E8] shrink-0" />
            <span className="min-w-0">
              {docTypeMismatch
                ? `Mẫu đang dùng được thiết kế cho ${sourceDocType}, không phải ${chosenDocType}.`
                : "Mẫu trình bày phù hợp với loại văn bản đã chọn."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowDiffModal(true)}
            className="text-[#6255E8] hover:underline font-semibold flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
          >
            <span>Xem khác biệt thể thức</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>}
      </section>}

      {/* 4. Nguồn tài liệu: tệp hoặc mẫu */}
      {((flow==="upload"&&phase==="upload")||(flow==="create"&&phase==="template"))&&<section id="df-step1-source" className="df-import-source-grid grid grid-cols-1 gap-3" aria-label="Chọn nguồn văn bản">
        {flow==="upload"&&<>
        <div className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 id="wizard-source-heading" className="text-xs sm:text-sm font-bold text-[#17233D]">
              Chọn tài liệu để bắt đầu
            </h2>
            <span className="text-[10.5px] font-semibold text-[#6255E8] bg-[#EEF0FE] px-2 py-0.5 rounded-full">
              DOCX / TXT
            </span>
          </div>
          <p className="df-import-stage-description">Tải tệp Word hoặc TXT. DocForm sẽ đọc nội dung, nhận diện các thành phần và cho bạn duyệt trước khi soạn.</p>
          {originalSnapshot?.sourceType==='uploaded_file'&&originalAvailable&&onDownloadOriginal&&<button type="button" data-original-download onClick={onDownloadOriginal} className="self-start mb-3 min-h-10 px-3 border border-slate-300 rounded-lg text-xs font-semibold">Tải tệp gốc · tải lại nguyên vẹn</button>}

          <details className="df-import-ai-options" data-testid="ai-partition-consent-panel">
            <summary>Tùy chọn kiểm tra phân vùng bằng AI <span>{aiPartitionConsent?"Đang bật":"Mặc định tắt"}</span></summary>
            <div>
            <label className="flex items-start gap-2 text-xs font-semibold text-[#17233D] cursor-pointer">
              <input
                type="checkbox"
                data-testid="ai-partition-consent"
                checked={aiPartitionConsent}
                onChange={event => onAiPartitionConsentChange(event.currentTarget.checked)}
                className="mt-0.5 accent-[#6255E8]"
                aria-describedby="ai-partition-consent-details"
              />
              <span>Cho phép AI kiểm tra phân vùng nguồn</span>
            </label>
            <p id="ai-partition-consent-details" className="mt-1 pl-5 text-[10.5px] leading-relaxed text-[#52607A]">
              Khi bật, toàn bộ văn bản khối và chữ trong các ô bảng cùng ID/tọa độ nguồn được gửi qua máy chủ đến Gemini. Không gửi tệp, tên tệp, HTML/XML hoặc role parser. Gợi ý không tự áp dụng; phân vùng quy tắc vẫn chạy độc lập. Mặc định tắt sau khi tải lại trang.
            </p>
            {uploadedFileName && partitionCheckNotice && (
              <div className="mt-1.5 pl-5 text-[10.5px]" role="status" data-testid="ai-partition-status">
                <span className={`font-semibold ${partitionCheckSource === "gemini_ai" || partitionCheckSource === "mixed" ? "text-emerald-700" : "text-amber-700"}`}>
                  {isCheckingPartitions ? "Đang kiểm tra" : partitionCheckSource === "gemini_ai" ? "AI đã kiểm tra" : partitionCheckSource === "mixed" ? "AI và quy tắc" : partitionCheckSource === "rule_fallback" ? "Chỉ quy tắc nội bộ" : "Chưa kiểm tra"}
                </span>
                <span className="text-[#52607A]"> · {partitionCheckNotice}</span>
                {isCheckingPartitions && partitionProgress && (
                  <span className="block text-[#52607A]" role="status" data-testid="ai-partition-progress">
                    Đã nhận {partitionProgress.processedChunks}/{partitionProgress.totalChunks} lô AI
                    {partitionProgress.lastChunkStatus ? ` · lô gần nhất: ${partitionProgress.lastChunkStatus}` : ""}.
                  </span>
                )}
                {partitionCoverage && (
                  <span className="block text-[#52607A]">
                    AI: {partitionCoverage.aiReviewedBlockIds.length}/{blocksCount}; quy tắc: {partitionCoverage.ruleFallbackBlockIds.length}/{blocksCount}; AI chưa xử lý: {partitionCoverage.unreviewedBlockIds.length} khối.
                  </span>
                )}
              </div>
            )}
            </div>
          </details>

          {hasUploadedSource ? (
            <>
              <div className="p-2.5 rounded-xl bg-[#F5F6FA] border border-[#CFD8EA] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-[180px]">
                  <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-xs font-bold text-[#17233D] break-all" title={uploadedFileName}>
                      {uploadedFileName || "Mẫu hệ thống đang mở"}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[#127955] font-semibold">
                      <Check className="w-3 h-3 text-[#127955]" /> {uploadedFileName ? "Đã đọc tài liệu" : "Đã áp dụng mẫu hệ thống"}
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

              <div className="text-[11.5px] text-[#52607A] font-medium mt-1.5 px-1">
                {tablesCount > 0 ? `${tablesCount} bảng` : "Không có bảng"} · {appendicesCount > 0 ? `${appendicesCount} phụ lục` : "Không có phụ lục"}
                {blocksCount > 0 ? ` · ${blocksCount} khối nguồn` : ""}
              </div>

              <div className="mt-2 border border-[#CFD8EA] rounded-xl overflow-hidden bg-white shadow-2xs flex flex-col">
                <div className="bg-slate-50 border-b border-[#CFD8EA] px-3 py-1.5 text-xs font-bold text-[#17233D] flex items-center justify-between gap-2">
                  <span>Xem nhanh nguồn</span>
                  {onOpenReviewModal && (
                    <button
                      type="button"
                      onClick={onOpenReviewModal}
                      className="text-[#6255E8] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Đối chiếu nguồn</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div
                  id="wizard-source-preview"
                  data-testid="wizard-source-preview"
                  className="max-h-[220px] overflow-y-auto p-3 text-[13px] leading-relaxed text-[#17233D] custom-scroll bg-white"
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

              <p className="mt-1.5 text-[11px] text-slate-500">Kéo thả tệp khác để thay nguồn.</p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isUploading}
                aria-busy={isUploading}
                className="df-upload-dropzone"
                data-dragging={isDragging}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isUploading) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  acceptFile(event.dataTransfer.files[0]);
                }}
              >
                <span className="df-upload-icon">
                  {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                </span>
                <strong>{isUploading ? "Đang đọc tài liệu…" : "Chọn tệp từ máy tính"}</strong>
                <span className="text-xs">
                  {isUploading ? "Đang nhận diện nội dung và bảng biểu" : "Hoặc kéo thả tệp .docx / .txt vào đây"}
                </span>
              </button>
              {uploadError && (
                <p role="alert" className="text-xs text-[#B82339] mt-2">
                  {uploadError}
                </p>
              )}
              <div className="mt-2 pt-2 border-t border-[#CFD8EA] text-[11px] text-[#52607A] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#127955] shrink-0" />
                <span>Giữ tệp nguồn để đối chiếu trước khi áp dụng thay đổi.</span>
              </div>
            </>
          )}
        </div>

        </>}
        {flow==="create"&&<div id="df-step1-template" className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs flex flex-col">
          <span className="df-import-stage-kicker">BƯỚC 3 / 4 · TẠO VĂN BẢN</span>
          <h2 className="text-xs sm:text-sm font-bold text-[#17233D]">Bắt đầu {draftDocType.toLowerCase()} từ đâu?</h2>
          <p className="df-import-stage-description">Chọn mẫu nội dung có sẵn hoặc trang trắng. Sau khi tạo, bạn có thể chỉnh sửa ở Bước 2.</p>

          <div className="space-y-2">
            <button type="button" onClick={()=>createFromChoice()} className="df-import-blank-template"><span className="w-8 h-8 rounded-lg bg-indigo-50 text-[#6255E8] flex items-center justify-center shrink-0"><Plus className="w-4 h-4"/></span><span><strong>Văn bản trắng</strong><small>Chỉ thiết lập thể thức và loại; nội dung, người ký và số hiệu để bạn tự soạn.</small></span><ArrowRight size={17}/></button>
            {filteredTemplates.map((t) => (
              <div
                key={t.id}
                className="p-2.5 rounded-xl border border-[#CFD8EA] hover:border-[#6255E8] bg-white transition flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-[170px]">
                  <span className="w-8 h-8 rounded-lg bg-indigo-50 text-[#6255E8] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="font-bold text-[#17233D] block">{t.name}</span>
                    <span className="text-[11px] text-[#52607A] block mt-0.5">{t.desc}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => createFromChoice(t.id)}
                  className="px-3 py-1 rounded-lg border border-[#CFD8EA] bg-white hover:bg-[#EEF0FE] text-[#6255E8] font-bold text-xs shrink-0 transition cursor-pointer"
                >
                  Dùng mẫu
                </button>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-2 border-t border-[#CFD8EA] text-[11px] text-[#52607A] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#6255E8] shrink-0" />
            <span>Mẫu chuẩn áp dụng sẵn phông Times New Roman {draftRegime === "party" ? "14pt" : "13pt"}.</span>
          </div>
        </div>}
      </section>}

      {/* 5. Nhận diện thể thức: chọn / gợi ý / chứng cứ / đã xác nhận */}
      {flow==="upload"&&phase==="recognition"&&<section id="df-step1-recognition" className="df-import-card df-import-recognition bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs" aria-labelledby="wizard-detection-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 id="wizard-detection-heading" className="text-xs sm:text-sm font-bold text-[#17233D] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#0D9488]" />
            Kết quả nhận diện tài liệu
          </h2>
          {detection && (
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-[#52607A]">
              Độ tin cậy: {detection.confidence}
            </span>
          )}
        </div>

        <div className="df-import-metrics" aria-label="Tóm tắt dữ liệu nguồn">
          <div className="df-import-metric" data-metric="groups">
            <strong>{identifiedGroupsCount}/9</strong>
            <span>Nhóm có dữ liệu nhận diện</span>
          </div>
          <div className="df-import-metric" data-metric="appendices">
            <strong>{String(appendicesCount).padStart(2, "0")}</strong>
            <span>Phụ lục đã tách</span>
          </div>
          <div className="df-import-metric" data-metric="review">
            <strong>{String(groupsNeedingReview).padStart(2, "0")}</strong>
            <span>Nhóm cần xác nhận</span>
          </div>
          <div className="df-import-metric" data-metric="tables">
            <strong>{String(tablesCount).padStart(2, "0")}</strong>
            <span>Bảng trong nguồn</span>
          </div>
        </div>

        <div className="df-import-group-heading">
          <h3>Thành phần đã nhận diện từ nguồn</h3>
          <span>{hasSelectedSource ? "Trạng thái lấy từ kết quả phân tích hiện tại" : "Chưa có nguồn để đối chiếu"}</span>
        </div>
        <div className="df-import-groups" aria-label="Trạng thái 9 nhóm thành phần">
          {importGroups.map((group) => {
            const statusLabel = group.status === "identified"
              ? uploadedFileName ? "Đã nhận diện" : originalSnapshot?.sourceType === "system_template" ? "Có trong mẫu" : "Có dữ liệu"
              : group.status === "needs-review" ? "Cần xác nhận"
                : group.status === "missing" ? "Chưa tìm thấy"
                  : group.status === "unverified" ? "Chưa xác minh"
                    : "Chưa có nguồn";
            return (
              <article className={`df-import-group df-import-group--${group.status}`} key={group.id} data-group-id={group.id} data-group-status={group.status}>
                <div className="df-import-group-top">
                  <h4>{group.id}. {group.title}</h4>
                  <span className="df-import-status">{statusLabel}</span>
                </div>
                <p>{group.value}</p>
              </article>
            );
          })}
        </div>

        {appendicesCount > 0 && (
          <details className="df-import-disclosure df-import-appendices">
            <summary>Phụ lục / thành phần bổ sung <span>{appendicesCount} mục</span></summary>
            {(structuredImport?.appendices ?? doc.appendices ?? []).map((appendix, index) => (
              <div className="df-import-appendix" key={appendix.id || `${appendix.title}-${index}`}>
                <span aria-hidden="true">▤</span>
                <strong>{appendix.title || `Phụ lục ${String(index + 1).padStart(2, "0")}`}</strong>
                <span data-appendix-status={appendix.extractionStatus}>
                  {appendix.extractionStatus === "needs_review" ? "Cần xem lại" : "Đã tách riêng"}
                </span>
              </div>
            ))}
          </details>
        )}

        {!hasSelectedSource ? (
          <div
            id="wizard-source-gate-notice"
            data-gate-notice="source-required"
            className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11.5px] text-[#9E5206] flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Chưa chọn nguồn tài liệu. Hãy tải tệp Word/TXT hoặc chọn một mẫu chuẩn để hệ thống nhận diện và mở bước soạn thảo.
              {demoDocTypeMismatch && (
                <> Nội dung đang mở chỉ là bản minh họa “{templates[0]?.name}” với loại <strong>{demoDocType}</strong> — đổi sang{" "}
                <strong>{chosenDocType}</strong> không tạo ra nguồn mới và không được coi là hợp lệ.</>
              )}
            </span>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11.5px]">
              <div className="p-2.5 rounded-xl bg-[#F5F6FA] border border-[#CFD8EA] min-w-0">
                <dt className="text-[10.5px] uppercase tracking-wide text-[#52607A] font-semibold">Hệ bạn chọn</dt>
                <dd id="regime-chosen" className="font-bold text-[#17233D] mt-0.5 break-words">
                  {REGIME_LABEL[regime]}
                </dd>
              </div>
              <div className="p-2.5 rounded-xl bg-[#F5F6FA] border border-[#CFD8EA] min-w-0">
                <dt className="text-[10.5px] uppercase tracking-wide text-[#52607A] font-semibold">Hệ nguồn gợi ý</dt>
                <dd id="regime-suggested" className="font-bold text-[#17233D] mt-0.5 break-words">
                  {suggestedRegimeText ?? "Nguồn là mẫu hệ thống — không cần nhận diện"}
                </dd>
              </div>
              <div className="p-2.5 rounded-xl bg-[#F5F6FA] border border-[#CFD8EA] min-w-0">
                <dt className="text-[10.5px] uppercase tracking-wide text-[#52607A] font-semibold">Hệ đã xác nhận</dt>
                <dd id="regime-confirmed" className="font-bold text-[#17233D] mt-0.5 break-words">
                  {confirmedRegimeText ?? "Theo mẫu hệ thống đã chọn"}
                </dd>
              </div>
            </dl>

            <details className="df-import-disclosure mt-2.5">
              <summary>Chứng cứ trích từ nguồn <span>{evidenceItems.length} mục</span></summary>
              {evidenceItems.length > 0 ? (
                <ul id="regime-evidence-list" className="space-y-1">
                  {evidenceItems.map((item, index) => (
                    <li
                      key={`${item.sourceBlockId}-${index}`}
                      data-regime-evidence={item.regime}
                      data-evidence-kind={item.kind}
                      className="text-[11.5px] text-[#17233D] p-2 rounded-lg border border-[#CFD8EA] bg-white break-words"
                    >
                      <span className="font-semibold text-[#52607A]">
                        {item.regime === "party" ? "Đảng" : "Hành chính"} · {item.kind} · {item.strength}
                      </span>
                      <span className="block mt-0.5">“{item.exactQuote}”</span>
                      <span className="block mt-0.5 text-[10.5px] text-slate-500">
                        {item.sourceBlockId}
                        {item.cell ? ` · ô ${item.cell.rowIndex + 1}:${item.cell.colIndex + 1}` : item.lineIndex !== undefined ? ` · dòng ${item.lineIndex + 1}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11.5px] text-[#52607A]">Không có chứng cứ thể thức — quyết định dựa trên mẫu hoặc lựa chọn của bạn.</p>
              )}
            </details>

            {detection?.documentType && (
              <p className="mt-2 text-[11.5px] text-[#52607A]">
                Loại văn bản trong nguồn: <strong className="text-[#17233D]">{detection.documentType.value}</strong> · “
                {detection.documentType.exactQuote}”
              </p>
            )}
          </>
        )}

        {profileMismatch && (
          <div
            id="source-mismatch-profile"
            data-source-warning="profile"
            role="status"
            className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11.5px] text-[#9E5206] flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {sourceLooksCompany
                ? "Phần đầu nguồn có tên Công ty Hoa tiêu nhưng bạn đang chọn “Cơ quan chung”. Hệ thống không tự ép mẫu công ty lên tệp nhập — bấm “Hoa tiêu miền Bắc” nếu muốn dùng mẫu đã duyệt."
                : "Bạn đang chọn mẫu “Hoa tiêu miền Bắc” nhưng phần đầu nguồn không có tên Công ty Hoa tiêu. Hãy chọn “Cơ quan chung” hoặc xác nhận bạn muốn áp mẫu công ty."}
            </span>
          </div>
        )}

        {templateMismatch && (
          <div
            id="source-mismatch-template"
            data-source-warning="template"
            role="status"
            className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11.5px] text-[#9E5206] flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Mẫu đang dùng thuộc hệ <strong>{appliedTemplateRegime === "party" ? "Văn bản Đảng" : "Hành chính"}</strong> nhưng bạn chọn hệ{" "}
              <strong>{REGIME_LABEL[regime]}</strong>. Nội dung mẫu không bị đổi — hãy chọn lại mẫu đúng hệ hoặc chuyển hệ thể thức.
            </span>
          </div>
        )}
      </section>}

      {phase==="ready"&&<section id="df-step1-ready" className="df-import-card df-import-ready" aria-labelledby="df-step1-ready-title">
        <span className="df-import-ready-icon"><CheckCircle2 size={22}/></span>
        <div><h2 id="df-step1-ready-title">{flow==="upload"?"Tài liệu đã được nhận diện":"Văn bản mới đã được khởi tạo"}</h2>
          <p>{flow==="upload"?`${uploadedFileName} · ${blocksCount} khối nguồn · ${tablesCount} bảng · ${appendicesCount} phụ lục`:`${doc.documentType} · ${REGIME_LABEL[regime]} · ${isCompanyProfile?"Mẫu Hoa tiêu miền Bắc":"Cơ quan chung"}`}</p>
          {flow==="upload"&&<p>{canContinue?"Nguồn đã được duyệt, có thể soạn nội dung.":"Kiểm tra và duyệt phân vùng nguồn trước khi tiếp tục."}</p>}
          {flow==="upload"&&canOpenSourceReview&&<button type="button" onClick={onOpenReviewModal}>Xem và duyệt nguồn <ArrowRight size={15}/></button>}
        </div>
      </section>}

      {flow&&phase!=="choice"&&<div className="df-wizard-actions df-import-actions">
        <button type="button" className="df-import-back" onClick={()=>setPhase(phase==="upload"||phase==="regime"?"choice":phase==="recognition"?"upload":phase==="metadata"?"recognition":phase==="doctype"?"regime":phase==="template"?"doctype":flow==="upload"?"metadata":"template")}><ArrowLeft size={15}/> Quay lại</button>
        <span className="df-import-action-hint">{phase==="regime"?`Đang chọn: ${draftRegime==="party"?"Văn bản Đảng · Hướng dẫn 05":"Văn bản hành chính · Nghị định 30"}`:phase==="doctype"?draftDocType?`Đã chọn: ${draftDocType}`:"Chọn một loại văn bản để tiếp tục":phase==="template"?`Thể thức ${draftRegime==="party"?"Đảng":"hành chính"} · ${draftDocType}`:phase==="upload"?"Tệp DOCX hoặc TXT · dữ liệu nguồn được giữ để đối chiếu":""}</span>
        {phase==="upload"&&<button type="button" className="df-import-forward" disabled={!hasUploadedSource||isUploading} onClick={()=>setPhase("recognition")}>Xem kết quả nhận diện <ArrowRight size={16}/></button>}
        {phase==="recognition"&&<button type="button" className="df-import-forward" onClick={()=>setPhase("metadata")}>Xác nhận thông tin <ArrowRight size={16}/></button>}
        {phase==="metadata"&&<button type="button" className="df-import-forward" disabled={!doc.documentType} onClick={()=>setPhase("ready")}>Xem tóm tắt <ArrowRight size={16}/></button>}
        {phase==="regime"&&<button type="button" className="df-import-forward" onClick={()=>setPhase("doctype")}>Chọn loại văn bản <ArrowRight size={16}/></button>}
        {phase==="doctype"&&<button type="button" className="df-import-forward" disabled={!draftDocType} onClick={()=>setPhase("template")}>Chọn mẫu <ArrowRight size={16}/></button>}
        {phase==="ready"&&<button type="button" data-action="wizard-next" className="df-import-forward" disabled={continueDisabled} onClick={handleContinue}>{canContinue&&flowSourceReady?"Sang Bước 2: Soạn & kiểm tra":canOpenSourceReview&&flowSourceReady?"Duyệt nguồn trước":"Chọn nguồn trước khi tiếp tục"} <ArrowRight size={16}/></button>}
      </div>}

      {showDiffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#17233D]/50 backdrop-blur-xs">
          <div
            ref={diffDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="regime-diff-modal-title"
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 border border-[#CFD8EA] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <div id="regime-diff-modal-title" className="flex items-center gap-2 font-bold text-sm text-[#17233D]">
                <Scale className="w-4 h-4 text-[#6255E8]" />
                <span>Khác biệt cốt lõi giữa hai hệ thể thức</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                aria-label="Đóng hộp thoại khác biệt thể thức"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#52607A] leading-relaxed">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <strong className="text-[#17233D] block mb-1">🏛️ Nghị định 30/2020/NĐ-CP:</strong>
                <ul className="list-disc pl-4 space-y-1 text-[11.5px]">
                  <li>Quốc hiệu 12–13pt in hoa đậm; Tiêu ngữ 13–14pt đậm, có vạch kẻ.</li>
                  <li>
                    Số ký hiệu bắt buộc có dấu hai chấm (<code className="text-[#17233D]">Số: .../QĐ-...</code>).
                  </li>
                  <li>Đường kẻ cơ quan dài 1/3 đến 1/2 dòng chữ.</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <strong className="text-[#17233D] block mb-1">☭ Hướng dẫn 05-HD/VPTW:</strong>
                <ul className="list-disc pl-4 space-y-1 text-[11.5px]">
                  <li>
                    Tiêu đề <code className="text-[#17233D]">ĐẢNG CỘNG SẢN VIỆT NAM</code> 15pt đậm; dấu{" "}
                    <code className="text-[#17233D]">*</code> dưới tên cấp ủy.
                  </li>
                  <li>
                    Số ký hiệu không có dấu hai chấm (<code className="text-[#17233D]">Số 05-NQ/ĐU</code>).
                  </li>
                  <li>Vạch 5 dấu gạch nối (<code className="text-[#17233D]">-----</code>) dưới trích yếu.</li>
                </ul>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="px-4 py-1.5 rounded-lg border border-[#CFD8EA] text-xs font-semibold text-[#17233D] hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {flow==="upload"&&(phase==="recognition"||phase==="ready")&&<aside className={`df-step-context df-import-context ${contextOpen ? "df-import-context--open" : "df-import-context--closed"}`} aria-label="Tình trạng nhập tài liệu">
        <details open={contextOpen} onToggle={(event) => setContextOpen(event.currentTarget.open)}>
          <summary>
            <span className="df-import-context-icon" aria-hidden="true">✦</span>
            <span>
              <strong>Tình trạng nguồn</strong>
              <small>{hasSelectedSource ? "Theo dữ liệu của phiên hiện tại" : "Đang chờ nguồn tài liệu"}</small>
            </span>
          </summary>
          <div className="df-import-context-body">
            <section className="df-import-context-card" aria-label="Kết quả phân tích">
              <h3>{hasSelectedSource ? "Kết quả nhận diện" : "Bắt đầu tại đây"}</h3>
              {hasSelectedSource ? (
                <>
                  <p>{identifiedGroupsCount}/9 nhóm có dữ liệu; {tablesCount} bảng; {appendicesCount} phụ lục.</p>
                  {detection && <p>Hệ gợi ý: <strong>{suggestedRegimeText ?? "Chưa đủ chứng cứ"}</strong> · độ tin cậy {detection.confidence}.</p>}
                  {groupsNeedingReview > 0 && <p className="df-import-context-warning">{groupsNeedingReview} nhóm cần xác nhận theo trạng thái nhận diện.</p>}
                </>
              ) : (
                <p>Tải DOCX/TXT hoặc chọn một mẫu để phân tích và mở bước soạn.</p>
              )}
            </section>

            <section className="df-import-context-card" aria-label="Trạng thái phân vùng">
              <h3>Phân tích phân vùng</h3>
              <p>{aiPartitionConsent ? aiSourceLabel : "Bạn chưa cho phép AI kiểm tra"}</p>
              {isCheckingPartitions && partitionProgress && (
                <p role="status">Đang xử lý {partitionProgress.processedChunks}/{partitionProgress.totalChunks} lô{partitionProgress.lastChunkStatus ? ` · lô gần nhất: ${partitionProgress.lastChunkStatus}` : ""}.</p>
              )}
              {uploadedFileName && partitionCheckNotice && <p>{partitionCheckNotice}</p>}
              {partitionCoverage && <p>AI {partitionCoverage.aiReviewedBlockIds.length} · quy tắc {partitionCoverage.ruleFallbackBlockIds.length} · chưa xử lý {partitionCoverage.unreviewedBlockIds.length} khối.</p>}
            </section>

            {originalSnapshot?.sourceType === "uploaded_file" && (
              <section className="df-import-context-card" aria-label="Bản gốc">
                <h3>Bản gốc</h3>
                <p>{originalAvailable ? "Tệp gốc hiện có để tải lại." : "Không có bản gốc khả dụng trong phiên này."}</p>
                {onDownloadOriginal && originalAvailable && (
                  <button type="button" data-original-download-context onClick={onDownloadOriginal}>Tải tệp gốc</button>
                )}
              </section>
            )}

            <section className="df-import-context-card df-import-next-card" aria-label="Bước tiếp theo">
              <h3>Gợi ý tiếp theo</h3>
              <p>{canContinue ? "Nguồn đã đủ điều kiện. Bạn có thể chuyển sang soạn và kiểm tra." : hasSelectedSource ? "Đối chiếu các vùng nguồn và xác nhận những mục còn cần xem lại." : "Chọn nguồn tài liệu để bắt đầu quy trình."}</p>
              {!canContinue && canOpenSourceReview && (
                <button type="button" onClick={onOpenReviewModal} className="df-import-context-action">Mở đối chiếu nguồn →</button>
              )}
              {canContinue&&flowSourceReady && (
                <button type="button" onClick={handleContinue} className="df-import-context-action">Sang Bước 2 →</button>
              )}
            </section>
          </div>
        </details>
      </aside>}
    </div>
  );
}
