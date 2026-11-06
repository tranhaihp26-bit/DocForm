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
  Eye,
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
import type { UnsupportedFeature } from "../shared/importFidelity.ts";
import type { OriginalDocumentSnapshot } from "../utils/draftStore.ts";
import type { PartitionAiProviderKind } from "../shared/partitionAiProtocol.ts";
import type { ChatGPTLocalStatus } from "../shared/chatgptPlanProtocol.ts";
import { aiProviderDisplayName } from "../utils/aiProviderLabels.ts";
import { getImportGroupAttention, getSourceVisualFailureMessage, semanticLabelForOfficeWorker } from "../utils/step1OfficeWorkerDisplay.ts";
import type { FullDocumentAiCapability, VisualEvidenceManifest } from "../shared/fullDocumentAiProtocol.ts";
import type { SemanticDecisionStatus } from "../shared/semanticDocument.ts";
import { FullTextReviewPanel, type FullTextReviewPanelProps } from "./FullTextReviewPanel.tsx";
import { useAccessibleDialog } from "../utils/useAccessibleDialog.ts";
import "./ImportStepView.css";
import {
  deriveSourceMismatch,
  docTypeDecisionCovers,
  findAppliedTemplate,
  isImportedFileSource,
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

function getDocTypeFormatSpecs(typeName: string, isParty: boolean) {
  const norm = (typeName || "").trim().toUpperCase();
  if (isParty) {
    if (norm.includes("NGHỊ QUYẾT")) {
      return {
        title: "Quy chuẩn trình bày NGHỊ QUYẾT (Hướng dẫn 05-HD/VPTW)",
        points: [
          "Tên loại: Trình bày chữ in hoa, cỡ 14–15, đứng, đậm.",
          "Trích yếu: Trình bày chữ thường, cỡ 13–14, nghiêng, đặt dưới số ký hiệu ở cột trái.",
          "Bố cục: Gồm các phần/mục quyết nghị rõ ràng; chữ ký cấp ủy và nơi nhận chuẩn Hướng dẫn 05.",
        ],
      };
    }
    if (norm.includes("QUYẾT ĐỊNH")) {
      return {
        title: "Quy chuẩn trình bày QUYẾT ĐỊNH ĐẢNG (Hướng dẫn 05-HD/VPTW)",
        points: [
          "Tên loại: Trình bày chữ in hoa, cỡ 14–15, đứng, đậm.",
          "Căn cứ ban hành: Trình bày chữ nghiêng, cỡ 13–14, kết thúc bằng dấu chấm phẩy (;).",
          "Bố cục: Gồm các Điều, Khoản; chữ ký bí thư/phó bí thư và nơi nhận chuẩn Đảng.",
        ],
      };
    }
    return {
      title: 'Quy chuẩn thể thức văn bản Đảng (Hướng dẫn 05-HD/VPTW) cho ' + (typeName || "loại này"),
      points: [
        "Tiêu đề Đảng: 'ĐẢNG CỘNG SẢN VIỆT NAM' đặt trang trọng ở góc trên bên phải.",
        "Trích yếu nội dung đặt dưới số ký hiệu ở cột bên trái.",
        "Nơi nhận đặt phía dưới bên trái; chữ ký đại diện cấp ủy đặt phía dưới bên phải.",
      ],
    };
  }

  // Hành chính NĐ 30
  if (norm.includes("THÔNG BÁO")) {
    return {
      title: "Quy chuẩn trình bày THÔNG BÁO (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Trích yếu: Trình bày chữ thường, cỡ 12–13, đứng, đậm, đặt canh giữa ngay dưới tên loại.",
        "Bố cục: Gồm phần nội dung thông báo, nơi nhận đặt góc dưới bên trái (cỡ 11–12), chữ ký đặt góc dưới bên phải (cỡ 13–14, đậm).",
      ],
    };
  }
  if (norm.includes("QUYẾT ĐỊNH")) {
    return {
      title: "Quy chuẩn trình bày QUYẾT ĐỊNH (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Căn cứ ban hành: Trình bày chữ thường, cỡ 13–14, nghiêng, kết thúc bằng dấu chấm phẩy (;).",
        "Quyết nghị: Gồm các Điều, Khoản cụ thể; chữ ký người có thẩm quyền và nơi nhận chuẩn NĐ 30.",
      ],
    };
  }
  if (norm.includes("CÔNG VĂN")) {
    return {
      title: "Quy chuẩn trình bày CÔNG VĂN (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Không ghi tên loại văn bản; trích yếu đặt dưới số ký hiệu (chữ thường, cỡ 12–13, nghiêng).",
        "Kính gửi: Ghi cơ quan, tổ chức nhận (chữ thường, cỡ 13–14, đứng, đậm) ở đầu nội dung.",
        "Nơi nhận: Gồm cơ quan nhận, cơ quan phối hợp và bộ phận lưu trữ văn thư.",
      ],
    };
  }
  if (norm.includes("KẾ HOẠCH")) {
    return {
      title: "Quy chuẩn trình bày KẾ HOẠCH (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Trích yếu: Cỡ 12–13, đứng, đậm, đặt canh giữa dưới tên loại.",
        "Bố cục: Gồm Mục đích - Yêu cầu, Nội dung công tác, Phân công tổ chức thực hiện.",
      ],
    };
  }
  if (norm.includes("BÁO CÁO")) {
    return {
      title: "Quy chuẩn trình bày BÁO CÁO (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Trích yếu: Khái quát nội dung báo cáo định kỳ hoặc chuyên đề.",
        "Bố cục: Đánh giá kết quả đạt được, tồn tại hạn chế, phương hướng nhiệm vụ trọng tâm.",
      ],
    };
  }
  if (norm.includes("BIÊN BẢN")) {
    return {
      title: "Quy chuẩn trình bày BIÊN BẢN (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Phần đầu: Ghi rõ thời gian, địa điểm, thành phần tham dự, người chủ trì và thư ký.",
        "Phần kết: Biên bản thông qua, số bản lập và chữ ký xác nhận của các bên liên quan.",
      ],
    };
  }
  if (norm.includes("TỜ TRÌNH")) {
    return {
      title: "Quy chuẩn trình bày TỜ TRÌNH (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Kính gửi: Cơ quan/người có thẩm quyền xem xét, phê duyệt.",
        "Bố cục: Sự cần thiết ban hành, tóm tắt nội dung chính, kiến nghị đề xuất cụ thể.",
      ],
    };
  }
  if (norm.includes("HƯỚNG DẪN")) {
    return {
      title: "Quy chuẩn trình bày HƯỚNG DẪN (Nghị định 30/2020/NĐ-CP)",
      points: [
        "Tên loại: Trình bày chữ in hoa, cỡ 13–14, đứng, đậm.",
        "Bố cục: Phạm vi áp dụng, đối tượng thực hiện và quy trình hướng dẫn nghiệp vụ chi tiết.",
        "Chữ ký người có thẩm quyền và nơi nhận theo quy định.",
      ],
    };
  }
  return {
    title: 'Quy chuẩn thể thức Nghị định 30/2020/NĐ-CP cho ' + (typeName || "loại này"),
    points: [
      "Quốc hiệu, Tiêu ngữ và Tên cơ quan ban hành đặt đúng vị trí trang nhất.",
      "Tên loại và trích yếu được căn giữa trang, đúng cỡ và kiểu chữ quy định.",
      "Nơi nhận và thẩm quyền ký đặt chuẩn ở cuối trang.",
    ],
  };
}


type ImportGroupStatus = "identified" | "needs-review" | "missing" | "unverified" | "no-source";

interface ImportGroupSummary {
  id: string;
  title: string;
  value: string;
  status: ImportGroupStatus;
}

export interface SemanticReviewRow {
  id: string;
  scope: "body" | "appendix";
  appendixTitle?: string;
  label: string;
  quote: string;
  anchor: string;
  status: SemanticDecisionStatus;
  reason: string;
  aiLabel?: string;
  rules: Array<{ ruleId: string; title: string; category: string; sourceReference?: string }>;
  ruleReason?: string;
  ruleApplyAvailable: boolean;
  rulesApplied: boolean;
  ruleApplyReason?: string;
}

export interface SourceVisualUiState {
  status: "idle" | "rendering" | "complete" | "incomplete" | "error" | "unavailable";
  localEndpointReceived?: boolean;
  renderId?: string;
  sourceSha256?: string;
  sourceGeneration?: number;
  manifest?: VisualEvidenceManifest;
  reason?: string;
}

export type ImportStepFlow = "upload" | "create" | null;
export type ImportStepPhase = "choice" | "upload" | "recognition" | "metadata" | "regime" | "doctype" | "template" | "ready";

export interface ImportStepViewProps {
  regime: "state" | "party";
  onRequestRegimeSwitch: (target: "state" | "party") => void;
  doc: DocumentState;
  templates: TemplatePreset[];
  sourceOrigin: "none" | "uploaded_file" | "system_template";
  flow: ImportStepFlow;
  phase: ImportStepPhase;
  onFlowChange: (flow: ImportStepFlow) => void;
  onPhaseChange: (phase: ImportStepPhase) => void;
  onCreateDocument: (selection: {regime:"state"|"party";documentType:string;templateId?:string;headerProfile:"company"|"generic"}) => boolean;
  onFieldChange: (field: keyof DocumentState, value: string) => void;
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  uploadedFileName: string;
  uploadedBlocks: SourceBlock[];
  structuredImport: StructuredImport | null;
  originalSnapshot: OriginalDocumentSnapshot | null;
  originalAvailable: boolean;
  sourceVisualState?: SourceVisualUiState;
  fullDocumentCapability?: FullDocumentAiCapability | null;
  fullTextReview?: FullTextReviewPanelProps;
  onRenderSourceVisual?: () => void;
  semanticReviewRows?: SemanticReviewRow[];
  semanticDecisionFingerprint?: string;
  onSemanticDecision?: (unitId: string, decision: "user_confirmed" | "rejected") => void;
  onApplySemanticRules?: (unitId: string) => void;
  onOpenReviewModal?: () => void;
  onDownloadOriginal?: () => void;
  hasSelectedSource: boolean;
  partitionAiProvider?: PartitionAiProviderKind;
  onOpenAppSettings?: () => void;
  chatGPTStatus?: ChatGPTLocalStatus;
  aiPartitionConsent: boolean;
  onAiPartitionConsentChange: (enabled: boolean) => void;
  isCheckingPartitions: boolean;
  partitionCheckNotice: string;
  partitionCheckSource: "gemini_ai" | "openai_api_ai" | "chatgpt_ai" | "rule_fallback" | "mixed" | "unverified";
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
  profileDecisionValid: boolean;
  onConfirmProfileDecision: (chosenProfile: "company" | "generic") => void;
}

export function ImportStepView({
  regime,
  onRequestRegimeSwitch,
  doc,
  templates,
  sourceOrigin,
  flow,
  phase,
  onFlowChange,
  onPhaseChange,
  onCreateDocument,
  onFieldChange,
  onFileUpload,
  isUploading,
  uploadedFileName,
  uploadedBlocks,
  structuredImport,
  originalSnapshot,
  originalAvailable,
  sourceVisualState = { status: "idle" },
  fullDocumentCapability = null,
  fullTextReview,
  onRenderSourceVisual = () => {},
  semanticReviewRows = [],
  semanticDecisionFingerprint,
  onSemanticDecision = () => {},
  onApplySemanticRules = () => {},
  onOpenReviewModal,
  onDownloadOriginal,
  hasSelectedSource,
  partitionAiProvider = "gemini",
  onOpenAppSettings = () => {},
  chatGPTStatus = { enabled: false, reason: "ChatGPT plan local chưa được bật.", session: { status: "disconnected", sharing: false } },
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
  profileDecisionValid,
  onConfirmProfileDecision,
}: ImportStepViewProps) {
  const isParty = regime === "party";
  const isCompanyProfile = isParty
    ? doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID
    : doc.headerProfile === COMPANY_HEADER_PROFILE_ID;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(null);
  const [forceShowDropzone, setForceShowDropzone] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [draftRegime,setDraftRegime]=useState<"state"|"party">(regime);
  const [draftDocType,setDraftDocType]=useState("");
  const [draftProfile,setDraftProfile]=useState<"company"|"generic">("company");
  const [activeSourcePage,setActiveSourcePage]=useState(1);
  const [sourcePagePreview,setSourcePagePreview]=useState<string | null>(null);
  const [sourcePagePreviewError,setSourcePagePreviewError]=useState("");
  const diffDialogRef = useAccessibleDialog(showDiffModal, () => setShowDiffModal(false));

  useEffect(()=>setActiveSourcePage(1),[sourceVisualState.renderId]);
  useEffect(()=>{
    const manifest=sourceVisualState.manifest;
    const renderId=sourceVisualState.renderId;
    if(sourceVisualState.status!=="complete"||!manifest?.complete||!renderId){setSourcePagePreview(null);setSourcePagePreviewError("");return;}
    const controller=new AbortController();
    let objectUrl:string|undefined;
    setSourcePagePreview(null);setSourcePagePreviewError("");
    void (async()=>{
      try{
        const page=manifest.pages[activeSourcePage-1];
        if(!page||page.page!==activeSourcePage)throw new Error("page_manifest_missing");
        const response=await fetch(`/api/ai/source-visual/${encodeURIComponent(renderId)}/page/${activeSourcePage}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok||response.headers.get("X-Source-SHA256")!==sourceVisualState.sourceSha256||
          response.headers.get("X-Source-Generation")!==String(sourceVisualState.sourceGeneration))throw new Error("source_page_identity_mismatch");
        const bytes=new Uint8Array(await response.arrayBuffer());
        const digest=await globalThis.crypto.subtle.digest("SHA-256",bytes);
        const pageSha=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
        if(pageSha!==page.sha256)throw new Error("source_page_hash_mismatch");
        if(controller.signal.aborted)return;
        objectUrl=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));
        setSourcePagePreview(objectUrl);
      }catch(error){
        if(!controller.signal.aborted)setSourcePagePreviewError(error instanceof Error?error.message:"Không tải được trang nguồn local.");
      }
    })();
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[sourceVisualState.status,sourceVisualState.manifest,sourceVisualState.renderId,sourceVisualState.sourceSha256,sourceVisualState.sourceGeneration,activeSourcePage]);


  // Giữ thanh ngữ cảnh phụ thu gọn mặc định để giao diện chính tập trung vào tài liệu
  useEffect(() => {
    setContextOpen(false);
  }, [flow, phase]);

  const acceptFile = (file?: File) => {
    if (!file || isUploading) return;
    if (!/\.(docx|txt)$/i.test(file.name)) {
      setUploadError("Vui lòng chọn tệp Word (.docx) hoặc văn bản (.txt).");
      return;
    }
    setUploadError("");
    // Nếu đang có tài liệu mở sẵn và người dùng tải tệp khác tên -> Hiện hộp thoại xác nhận thay thế
    if (hasUploadedSource && uploadedFileName && uploadedFileName !== file.name) {
      setPendingReplaceFile(file);
      return;
    }
    setForceShowDropzone(false);
    onFileUpload(file);
  };

  const handleConfirmReplaceFile = () => {
    if (pendingReplaceFile) {
      const fileToUpload = pendingReplaceFile;
      setPendingReplaceFile(null);
      setForceShowDropzone(false);
      onFileUpload(fileToUpload);
    }
  };

  const handleCancelReplaceFile = () => {
    setPendingReplaceFile(null);
    setForceShowDropzone(false);
  };



  const choosingNew=flow==="create";
  const choiceIsParty=choosingNew?draftRegime==="party":isParty;
  const choiceIsCompany=choosingNew?draftProfile==="company":isCompanyProfile;
  const docTypes = choiceIsParty ? DOCUMENT_TYPES_HD05 : DOCUMENT_TYPES_ND30;
  const tablesCount = structuredImport?.source.tableCount ?? structuredImport?.body?.tablesCount ?? (doc.bodyHtml.match(/<table\b/gi)?.length || 0);
  const blocksCount = uploadedBlocks.length;
  const appendicesCount = structuredImport?.appendices.length ?? doc.appendices?.length ?? 0;
  const filteredTemplates = templates.filter((t) => t.type === (draftRegime === "party" ? "party" : "state") && t.defaultData.documentType.toUpperCase().startsWith(draftDocType));
  const hasImportedFile = isImportedFileSource({
    sourceOrigin,
    originalSnapshot,
    fileName: uploadedFileName,
    uploadedBlockCount: blocksCount,
  });
  const hasUploadedSource = sourceOrigin === "uploaded_file" && hasImportedFile;
  const detection = structuredImport?.regimeDetection ?? null;
  const sourceTypeEvidence = detection?.documentType ?? null;
  const sourceEvidenceSuggestsMinutes = Boolean(sourceTypeEvidence &&
    (/^\s*biên\s*bản\b|^\s*bien\s*ban\b/iu.test(sourceTypeEvidence.value) ||
      /^\s*biên\s*bản\b|^\s*bien\s*ban\b/iu.test(sourceTypeEvidence.exactQuote)));
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
  const { sourceDocType, docTypeMismatch, sourceProfile, profileMismatch, templateMismatch } = mismatch;
  // Quyết định override chỉ có hiệu lực cho đúng cặp nguồn/loại/hệ đã xác nhận.
  const overrideCovers = docTypeDecisionCovers(docTypeOverride, mismatch, regime);
  const selectProfile = (selectedProfile: "company" | "generic") => {
    if (choosingNew) {
      setDraftProfile(selectedProfile);
      return;
    }
    if (hasUploadedSource && profileMismatch) {
      onConfirmProfileDecision(selectedProfile);
      return;
    }
    const profileId = selectedProfile === "generic"
      ? "generic"
      : isParty ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID;
    onFieldChange("headerProfile" as keyof DocumentState, profileId);
  };

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
    { id: "06", title: "Nội dung văn bản", value: hasSelectedSource && (structuredImport?.body?.html || doc.bodyHtml) ? `${structuredImport?.body?.sourceBlockIds.length ?? blocksCount} khối nội dung` : hasSelectedSource ? "Chưa tìm thấy nội dung văn bản" : "Chưa có nguồn tài liệu", status: !hasSelectedSource ? "no-source" : (structuredImport?.body?.html || doc.bodyHtml) ? "identified" : "missing" },
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
  const importGroupAttention = getImportGroupAttention(importGroups);
  const aiSourceLabel = partitionCheckSource === "gemini_ai" ? "Gemini đã rà soát · chờ duyệt" : partitionCheckSource === "openai_api_ai" ? "OpenAI API đã rà soát · chờ duyệt" : partitionCheckSource === "chatgpt_ai" ? "ChatGPT plan đã rà soát · chờ duyệt" : partitionCheckSource === "mixed" ? "AI và quy tắc · chờ duyệt" : partitionCheckSource === "rule_fallback" ? "Quy tắc nội bộ" : "Chưa kiểm tra";
  const canOpenSourceReview = hasSelectedSource && Boolean(onOpenReviewModal);
  const flowSourceReady=flow==="upload"?sourceOrigin==="uploaded_file":flow==="create"?sourceOrigin==="system_template":false;
  const continueDisabled = !flowSourceReady||(!canContinue && !canOpenSourceReview);
  const semanticConfirmedCount = semanticReviewRows.filter(row => row.status === "user_confirmed" || row.status === "auto_confirmed").length;
  const semanticPendingCount = semanticReviewRows.filter(row => row.status === "needs_review" || row.status === "unsupported").length;
  const sourceVisualStatusText = sourceVisualState.status === "rendering"
    ? "Đang dựng trang trên máy này…"
    : sourceVisualState.status === "complete"
      ? sourceVisualState.manifest?.complete ? "Đã dựng đủ trang để xem bố cục." : "Đã dựng một phần trang; cần kiểm tra lại."
      : sourceVisualState.status === "incomplete"
        ? getSourceVisualFailureMessage("incomplete")
        : sourceVisualState.status === "error" || sourceVisualState.status === "unavailable"
          ? getSourceVisualFailureMessage(sourceVisualState.status)
          : "Chưa xem bố cục trang gốc.";
  const handleContinue = () => {
    if (!flowSourceReady) return;
    onNext();
  };
  const selectFlow=(next:"upload"|"create")=>{
    onFlowChange(next);
    onPhaseChange(next==="upload"?"upload":"regime");
    setUploadError("");
    setDraftDocType("");
  };
  const createFromChoice=(templateId?:string)=>{
    if(!draftDocType)return;
    if(onCreateDocument({regime:draftRegime,documentType:draftDocType,templateId,headerProfile:draftProfile}))onPhaseChange("ready");
  };

  return (
    <div
      data-wizard-step="1"
      data-has-source={hasSelectedSource ? "true" : "false"}
      data-flow-phase={phase}
      data-context-visible={contextOpen && flow==="upload"&&(phase==="recognition"||phase==="ready")?"true":"false"}
      className="df-step-layout df-import-step df-step-enter"
    >
      <div className="df-step-content" id="df-step1-flow">
      <h1 className="sr-only">{flow==="create"?"Tạo văn bản mới":"Tải & nhận diện"}</h1>

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

      {phase==="choice"&&<section
        className="df-import-entry"
        aria-labelledby="df-step1-entry-title"
        data-dragging={isDragging}
        onDragOver={(event) => {
          event.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          acceptFile(event.dataTransfer.files?.[0]);
        }}
      >
        <div className="df-import-entry-heading">
          <span>BẮT ĐẦU TÀI LIỆU</span>
          <h2 id="df-step1-entry-title">Bạn muốn bắt đầu như thế nào?</h2>
          <p>Soạn thảo và chuẩn hóa thể thức theo Nghị định 30 (Hành chính) & Hướng dẫn 05 (Đảng).</p>
        </div>
        {sourceOrigin!=="none"&&<div className="df-import-resume">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-purple-100 text-[#6255E8] flex items-center justify-center shrink-0">
              <FileText size={18} />
            </span>
            <span className="min-w-0 text-left">
              <strong>Đang mở: {uploadedFileName||doc.documentType}</strong>
              <small>{sourceOrigin==="uploaded_file"?"Tệp đã tải và nhận diện sẵn sàng":"Văn bản tạo từ mẫu"}</small>
            </span>
          </div>
          <button type="button" onClick={()=>{setForceShowDropzone(false);onFlowChange(sourceOrigin==="uploaded_file"?"upload":"create");onPhaseChange(canContinue ? "ready" : (sourceOrigin==="uploaded_file"?"metadata":"ready"));}}>
            Tiếp tục tài liệu hiện tại <ArrowRight size={15}/>
          </button>
        </div>}
        <div className="df-import-entry-options">
          <button
            type="button"
            data-testid="upload-existing-file-button"
            className="df-upload-card-button"
            disabled={isUploading}
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <span className="df-import-entry-icon">
              {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Upload/>}
            </span>
            <strong>{isUploading ? "Đang đọc tài liệu…" : "Tải tài liệu có sẵn"}</strong>
            <small>Đọc DOCX/TXT từ máy tính hoặc kéo thả tệp vào đây để nhận diện.</small>
            <span className="df-import-entry-link">
              {isUploading ? "Đang xử lý…" : "Chọn tệp hoặc kéo thả"} <ArrowRight size={16}/>
            </span>
          </button>
          <button type="button" onClick={()=>selectFlow("create")}>
            <span className="df-import-entry-icon"><Plus/></span>
            <strong>Tạo văn bản mới</strong>
            <small>Chọn hệ thể thức, loại văn bản và mẫu chuẩn hoặc bắt đầu từ trang trắng.</small>
            <span className="df-import-entry-link">Tạo mới <ArrowRight size={16}/></span>
          </button>
        </div>
        {uploadError && (
          <p role="alert" className="text-xs text-[#B82339] mt-3 text-center">
            {uploadError}
          </p>
        )}
      </section>}

            {/* 1. Thanh tệp nguồn tinh gọn */}
      {flow === "upload" && hasUploadedSource && !forceShowDropzone && (
        <section className="df-import-card bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-2xs mb-3 flex flex-wrap items-center justify-between gap-2.5" aria-label="Tệp nguồn đã tải">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs sm:text-sm text-slate-900 truncate" title={uploadedFileName}>
                  {uploadedFileName || "Tài liệu đang mở"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200 shrink-0">
                  <Check size={12} /> Đã đọc tệp
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{blocksCount} khối nội dung · {tablesCount > 0 ? `${tablesCount} bảng` : "Không có bảng"}</span>
                <span>·</span>
                <span>Hệ nhận diện: <strong className="text-slate-700">{REGIME_LABEL[regime]}</strong></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canOpenSourceReview && (
              <button
                type="button"
                data-action="open-partition-review"
                onClick={onOpenReviewModal}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1"
              >
                <Eye size={12} className="text-indigo-600" />
                <span>Mở rà soát phân vùng</span>
              </button>
            )}
            {originalSnapshot?.sourceType === 'uploaded_file' && originalAvailable && onDownloadOriginal && (
              <button type="button" data-original-download onClick={onDownloadOriginal} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                Tải tệp gốc
              </button>
            )}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100 text-xs font-semibold text-indigo-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw size={12} className="text-indigo-600" />
              <span>Thay tệp khác</span>
            </button>
          </div>

          {(() => {
            const allUnsupportedFeatures: UnsupportedFeature[] = [
              ...(structuredImport?.importFidelityManifest?.unsupportedFeatures || []),
              ...(uploadedBlocks || []).flatMap((b: SourceBlock) => b.unsupportedFeatures || []),
            ];
            const unsupportedFeatures = Array.from(new Map(allUnsupportedFeatures.map(feature => [
              `${feature.code}:${feature.tableId ?? ""}:${feature.blockId ?? ""}:${feature.description}`,
              feature,
            ])).values());
            if (unsupportedFeatures.length === 0) return null;
            return (
              <div className="w-full mt-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50/80 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Tài liệu có {unsupportedFeatures.length} đối tượng hình ảnh/đồ họa nhúng · DocForm bảo toàn nguyên vẹn khi xuất bản Word
                  </span>
                </div>
                <details className="text-[11px]">
                  <summary className="cursor-pointer font-semibold text-amber-800 hover:underline">Chi tiết</summary>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px] text-amber-800">
                    {unsupportedFeatures.map((f: UnsupportedFeature, idx: number) => {
                      const desc = f.code === "drawing_or_image"
                        ? "Hình ảnh hoặc đối tượng đồ họa nhúng"
                        : f.description;
                      return <li key={idx}>{desc}</li>;
                    })}
                  </ul>
                </details>
              </div>
            );
          })()}
        </section>
      )}

      {/* 2. KHU VỰC THIẾT LẬP THỂ THỨC (LUỒNG TẠO MỚI) */}
      {flow==="create" && (phase==="regime"||phase==="template") && (
        <div id="df-step1-regime" className="df-import-choice-grid grid grid-cols-1 lg:grid-cols-2 gap-3">
          {phase!=="template"&&<>
          <section className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3 shadow-2xs" aria-labelledby="wizard-regime-heading">
            <span className="df-import-stage-kicker">CHỌN HỆ THỂ THỨC</span>
            <h2 id="wizard-regime-heading" className="text-xs sm:text-sm font-bold text-[#17233D] mb-2">
              Chọn hệ thể thức
            </h2>
            <p className="df-import-stage-description">Văn bản của bạn sẽ theo quy định trình bày nào? Lựa chọn này quyết định các mẫu và loại văn bản ở bước tiếp theo.</p>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2" role="group" aria-label="Hệ thể thức">
              <button
                type="button"
                aria-pressed={!choiceIsParty}
                onClick={() => { setDraftRegime("state"); setDraftDocType(""); }}
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
                <span className="df-import-regime-detail">Dành cho công văn, quyết định, kế hoạch và các văn bản hành chính.</span>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${!choiceIsParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
              </button>
              <button
                type="button"
                aria-pressed={choiceIsParty}
                onClick={() => { setDraftRegime("party"); setDraftDocType(""); }}
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
                <span className="df-import-regime-detail">Dành cho văn bản của tổ chức Đảng theo Hướng dẫn 05.</span>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${choiceIsParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
              </button>
            </div>
          </section>
          </>}
          {phase!=="regime"&&<section className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3 shadow-2xs" aria-labelledby="wizard-profile-heading">
            <h2 id="wizard-profile-heading" className="text-xs sm:text-sm font-bold text-[#17233D] mb-2">Thông tin cơ quan ban hành</h2>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2" role="group" aria-label="Mẫu cơ quan">
              <button type="button" aria-pressed={choiceIsCompany} onClick={() => selectProfile("company")} className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[52px] ${choiceIsCompany ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs" : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"}`}>
                <div className="flex items-center gap-2 min-w-0"><span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0"><Building2 className="w-3.5 h-3.5" /></span><div className="min-w-0"><span className="block text-xs font-bold">Hoa tiêu miền Bắc</span><span className="block text-[10.5px] text-[#52607A]">Mẫu duyệt khóa cứng</span></div></div>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${choiceIsCompany ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
              </button>
              <button type="button" aria-pressed={!choiceIsCompany} onClick={() => selectProfile("generic")} className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer min-h-[52px] ${!choiceIsCompany ? "border-[#6255E8] bg-[#EEF0FE]/70 text-[#17233D] ring-1 ring-[#6255E8]/30 shadow-2xs" : "border-[#CFD8EA] hover:border-slate-400 bg-white text-[#17233D]"}`}>
                <div className="flex items-center gap-2 min-w-0"><span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0"><Building2 className="w-3.5 h-3.5" /></span><div className="min-w-0"><span className="block text-xs font-bold">Cơ quan chung</span><span className="block text-[10.5px] text-[#52607A]">Tự do chỉnh sửa</span></div></div>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${!choiceIsCompany ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
              </button>
            </div>
          </section>}
        </div>
      )}

      {/* LOẠI VĂN BẢN (LUỒNG TẠO MỚI) */}
      {flow==="create" && phase==="doctype" && (
        <section id="df-step1-document-type" className="df-import-card bg-white rounded-2xl border border-[#CFD8EA] p-3.5 shadow-2xs" aria-labelledby="wizard-doctype-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 mb-2">
            <span className="df-import-stage-kicker">CHỌN LOẠI VĂN BẢN</span>
            <h2 id="wizard-doctype-heading" className="text-xs sm:text-sm font-bold text-[#17233D]">Bạn muốn tạo loại văn bản nào?</h2>
          </div>
          <div className="df-import-type-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
            {docTypes.map((t) => {
              const isSelected = draftDocType.toUpperCase() === t.name;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={isSelected}
                  title={t.desc}
                  onClick={() => setDraftDocType(t.name)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between min-h-[64px] ${
                    isSelected
                      ? "border-[#6255E8] bg-[#EEF0FE]/75 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                      : "border-[#CFD8EA] hover:border-[#94A3B8] hover:bg-[#F5F6FA] text-[#17233D]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span className="text-xs font-bold">{t.name}</span>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${isSelected ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
                  </div>
                  <span className="text-[11px] text-[#52607A] font-normal mt-1 leading-tight">{t.desc}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. GIAO DIỆN HỢP NHẤT CHUYÊN NGHIỆP SAU KHI TẢI TỆP (LUỒNG UPLOAD) */}
      {flow === "upload" && hasUploadedSource && !forceShowDropzone && (
        <div className="df-unified-main-grid grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch mb-3">
          {/* CỘT TRÁI (5 phần): Hệ thể thức, Mẫu cơ quan & Thông tin trích xuất */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {/* Hệ thể thức & Mẫu cơ quan */}
            <div id="df-step1-regime" className="df-import-card bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  1. Hệ thể thức văn bản
                </h3>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Hệ thể thức">
                  <button
                    type="button"
                    aria-pressed={!choiceIsParty}
                    onClick={() => onRequestRegimeSwitch("state")}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      !choiceIsParty
                        ? "border-[#6255E8] bg-[#EEF0FE]/80 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">Hành chính</span>
                      <span className="block text-[11px] text-slate-500 font-normal">Nghị định 30</span>
                    </div>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${!choiceIsParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={choiceIsParty}
                    onClick={() => onRequestRegimeSwitch("party")}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      choiceIsParty
                        ? "border-[#6255E8] bg-[#EEF0FE]/80 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">Văn bản Đảng</span>
                      <span className="block text-[11px] text-slate-500 font-normal">Hướng dẫn 05</span>
                    </div>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${choiceIsParty ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
                  </button>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  2. Mẫu cơ quan ban hành
                </h3>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mẫu cơ quan">
                  <button
                    type="button"
                    aria-pressed={choiceIsCompany}
                    onClick={() => selectProfile("company")}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      choiceIsCompany
                        ? "border-[#6255E8] bg-[#EEF0FE]/80 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">Hoa tiêu MB</span>
                      <span className="block text-[11px] text-slate-500 font-normal">Mẫu chuẩn khóa</span>
                    </div>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${choiceIsCompany ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={!choiceIsCompany}
                    onClick={() => selectProfile("generic")}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                      !choiceIsCompany
                        ? "border-[#6255E8] bg-[#EEF0FE]/80 text-[#17233D] font-bold shadow-2xs ring-1 ring-[#6255E8]/30"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block text-xs font-bold">Cơ quan chung</span>
                      <span className="block text-[11px] text-slate-500 font-normal">Tự do chỉnh sửa</span>
                    </div>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${!choiceIsCompany ? "bg-[#6255E8] text-white font-bold" : "border border-slate-300 text-transparent"}`}>✓</span>
                  </button>
                </div>

                {profileMismatch && (
                  <div
                    id="source-mismatch-profile"
                    data-source-warning="profile"
                    data-testid="source-profile-conflict"
                    role="status"
                    className="mt-2.5 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"
                  >
                    <div className="flex items-start gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{sourceProfile === "company" ? "Khớp mẫu Hoa tiêu miền Bắc nhưng bạn đang chọn Cơ quan chung." : "Tên cơ quan không khớp đầy đủ với mẫu Hoa tiêu miền Bắc."}</span>
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" data-action="confirm-generic-profile" onClick={() => onConfirmProfileDecision("generic")} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Dùng Cơ quan chung</button>
                      <button type="button" data-action="confirm-company-profile" onClick={() => onConfirmProfileDecision("company")} className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">Vẫn dùng Hoa tiêu miền Bắc</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Thông tin nhận diện từ tệp (Document Metadata Summary) */}
            <div className="df-import-card df-office-summary-card bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs space-y-2.5 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Thông tin nhận diện từ tệp
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Tự động điền
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-medium w-20 shrink-0 text-[11px] pt-0.5">CƠ QUAN:</span>
                    <span className="font-semibold text-slate-800 break-words flex-1">
                      {[doc.orgHeader1, doc.orgHeader2].filter(Boolean).join(" · ") || "(Chưa phát hiện)"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-medium w-20 shrink-0 text-[11px] pt-0.5">SỐ HIỆU:</span>
                    <span className="font-mono font-semibold text-slate-800 flex-1">
                      {doc.referenceNumber || "(Chưa có số hiệu)"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-medium w-20 shrink-0 text-[11px] pt-0.5">TRÍCH YẾU:</span>
                    <span className="font-medium text-slate-800 flex-1 line-clamp-2" title={[doc.documentType, doc.subject].filter(Boolean).join(" · ")}>
                      {[doc.documentType, doc.subject].filter(Boolean).join(" · ") || "(Chưa có trích yếu)"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-medium w-20 shrink-0 text-[11px] pt-0.5">NGƯỜI KÝ:</span>
                    <span className="font-semibold text-slate-800 flex-1">
                      {[doc.signTitle, doc.signName].filter(Boolean).join(" · ") || "(Chưa phát hiện)"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                💡 Toàn bộ thông tin có thể chỉnh sửa trực tiếp trên mặt giấy ở <strong>Bước 2</strong>.
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (7 phần): Loại văn bản */}
          <div className="lg:col-span-7 flex flex-col h-full">
            <section id="df-step1-document-type" className="df-import-card bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs h-full flex flex-col" aria-labelledby="wizard-doctype-heading">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 id="wizard-doctype-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  3. Loại văn bản
                </h3>
                {sourceDocType && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Nguồn nhận diện: <strong className="text-indigo-900">{sourceDocType}</strong>
                  </span>
                )}
              </div>

              {/* Lưới 8 loại văn bản thiết kế compact & hiện đại */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 content-start">
                {docTypes.map((t) => {
                  const isSelected = (doc.documentType || "").toUpperCase() === t.name;
                  const isSourceMatch = sourceDocType?.toUpperCase() === t.name;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={isSelected}
                      title={t.desc}
                      onClick={() => onFieldChange("documentType", t.name)}
                      className={`px-3 py-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[58px] ${
                        isSelected
                          ? "border-[#6255E8] bg-[#EEF0FE]/90 text-[#17233D] font-bold shadow-xs ring-1 ring-[#6255E8]/30"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5 w-full">
                        <span className="text-xs font-bold leading-tight">{t.name}</span>
                        {isSelected && <span className="text-[#6255E8] text-[11px] font-bold">✓</span>}
                      </div>
                      {isSourceMatch && !isSelected && (
                        <span className="text-[10px] text-emerald-600 font-medium">Khớp nguồn</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {docTypeMismatch && (
                <div
                  id="source-mismatch-doctype"
                  data-source-warning="doc-type"
                  data-doctype-override={overrideCovers ? "true" : "false"}
                  role={overrideCovers ? "note" : "status"}
                  className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col gap-1.5"
                >
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      Loại chọn (<strong>{chosenDocType}</strong>) khác với nguồn (<strong>{sourceDocType}</strong>).
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pl-5">
                    <button
                      type="button"
                      data-action="resolve-doctype-mismatch"
                      onClick={() => onFieldChange("documentType", sourceDocType)}
                      className="font-bold text-indigo-700 hover:underline cursor-pointer inline-flex items-center gap-1"
                    >
                      <Check size={12} /> Đổi về {sourceDocType}
                    </button>
                    {!overrideCovers && (
                      <button
                        type="button"
                        data-action="override-doctype-mismatch"
                        onClick={onConfirmDocTypeOverride}
                        className="font-medium text-amber-800 hover:underline cursor-pointer"
                      >
                        Vẫn giữ {chosenDocType}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Khung quy chuẩn thể thức tương ứng (Specs Card) - Khắc phục khoảng trống thừa và mang lại giá trị nghiệp vụ */}
              {(() => {
                const activeDocType = doc.documentType || chosenDocType || (docTypes[0]?.name ?? "THÔNG BÁO");
                const specs = getDocTypeFormatSpecs(activeDocType, isParty);
                return (
                  <div className="mt-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 text-xs text-slate-700 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-950 text-xs">
                      <Scale className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{specs.title}</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                      {specs.points.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </section>
          </div>
        </div>
      )}

      {flow==="upload"&&phase==="metadata"&&<details className="df-import-card mt-3 border border-[#CFD8EA] bg-white rounded-2xl p-3.5 shadow-2xs space-y-3" data-testid="semantic-review-panel" aria-labelledby="semantic-review-heading">
        <summary className="cursor-pointer font-bold text-xs sm:text-sm text-[#17233D] flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-purple-50 text-[#6255E8] flex items-center justify-center"><Eye size={13} /></span>
            <span>Tùy chọn xem lại tệp gốc & Đối chiếu nguồn (Tùy chọn)</span>
          </span>
          <span className="text-[11px] text-[#52607A] font-normal">Xem đối chiếu song song · Bố cục trang gốc</span>
        </summary>
        <div className="pt-2 space-y-3">
          {/* Card Mở Studio đối chiếu song song */}
          <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/40 flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong className="text-xs text-slate-900">Đối chiếu song song với tệp gốc (Side-by-side)</strong>
              <p className="text-[11px] text-slate-500 mt-0.5">Mở màn hình so sánh trực quan hai bên giữa văn bản gốc và bản bóc tách chuẩn thể thức.</p>
            </div>
            {canOpenSourceReview && (
              <button
                type="button"
                onClick={onOpenReviewModal}
                className="px-3 py-1.5 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-xs font-semibold text-indigo-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              >
                <ExternalLink size={13} />
                <span>Mở studio đối chiếu</span>
              </button>
            )}
          </div>

          <div>
            <h2 id="semantic-review-heading" className="text-sm font-bold text-[#17233D]">Đọc và đối chiếu tài liệu</h2>
            <p className="mt-1 text-xs text-[#52607A]">DocForm đọc nội dung tại máy. Bạn có thể xem bố cục trang gốc; gửi văn bản cho AI là tùy chọn.</p>
          </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" data-testid="local-source-visual-status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="text-[#17233D]">Tài liệu gốc</strong>
              <p className="mt-0.5 text-[#52607A]">{originalAvailable?"Tệp gốc đã lưu trên máy.":"Chưa xác nhận tệp gốc còn trong kho."} {sourceVisualStatusText}</p>
            </div>
            <button type="button" onClick={onRenderSourceVisual} disabled={sourceVisualState.status==="rendering"||!originalSnapshot?.sourceHash||originalSnapshot.fileType!=="docx"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#6255E8] bg-white px-3 py-2 text-xs font-semibold text-[#5145C0] disabled:opacity-50"
              aria-label="Xem bố cục trang gốc">
              <Eye size={15}/>{sourceVisualState.status==="rendering"?"Đang dựng trang…":sourceVisualState.status==="complete"?"Tải lại bố cục trang":"Xem bố cục trang gốc"}
            </button>
          </div>
          {sourceVisualState.status==="complete"&&sourceVisualState.renderId&&sourceVisualState.manifest&&<div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex items-center justify-between gap-2 text-xs"><div className="flex items-center gap-1"><button type="button" disabled={activeSourcePage<=1} onClick={()=>setActiveSourcePage(page=>Math.max(1,page-1))} aria-label="Trang nguồn trước">‹</button><span>Trang {activeSourcePage}/{sourceVisualState.manifest.pageCount}</span><button type="button" disabled={activeSourcePage>=sourceVisualState.manifest.pageCount} onClick={()=>setActiveSourcePage(page=>Math.min(sourceVisualState.manifest?.pageCount??1,page+1))} aria-label="Trang nguồn tiếp">›</button></div><a href={`/api/ai/source-visual/${encodeURIComponent(sourceVisualState.renderId)}/source.pdf`} target="_blank" rel="noreferrer" className="font-semibold text-[#5145C0] underline">Mở bản PDF xem trước</a></div>
            {sourcePagePreview?<img src={sourcePagePreview} alt={`Trang ${activeSourcePage} dựng cục bộ từ DOCX gốc`} className="mt-2 mx-auto max-h-[68vh] max-w-full object-contain border border-slate-200"/>:sourcePagePreviewError?<p role="alert" className="mt-2 text-[11px] text-rose-800">Không hiển thị được trang gốc. Hãy thử lại hoặc xem chi tiết kỹ thuật.</p>:<p className="mt-2 text-[11px] text-slate-600" role="status">Đang tải trang xem trước…</p>}
          </div>}
          <details className="mt-2 rounded-lg border border-slate-200 bg-white p-2" data-testid="local-source-technical-details">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Chi tiết kỹ thuật</summary>
            <div className="mt-2 space-y-1 text-[10px] text-slate-600">
              <p>SHA nguồn: <code>{originalSnapshot?.sourceHash??"chưa có"}</code></p>
              {sourceVisualState.manifest&&<p>Endpoint local nhận byte gốc: {sourceVisualState.localEndpointReceived?"có":"chưa"}; trang dựng {sourceVisualState.manifest.pages.length}/{sourceVisualState.manifest.pageCount}; renderer {sourceVisualState.manifest.rendererName} {sourceVisualState.manifest.rendererVersion??""}; SHA khớp {sourceVisualState.sourceSha256===originalSnapshot?.sourceHash?"có":"không"}.</p>}
              {sourceVisualState.reason&&<p role="status">Lý do: {sourceVisualState.reason}</p>}
              {sourcePagePreviewError&&<p role="status">Lỗi hiển thị trang: {sourcePagePreviewError}</p>}
              {sourceVisualState.renderId&&<p>Render ID: <code>{sourceVisualState.renderId}</code>. Bản dựng tạm được giữ local tối đa 10 phút; trang không được gửi sang nhà cung cấp AI.</p>}
            </div>
          </details>
        </div>

        {/* Khối kỹ thuật nâng cao dành cho chuyên viên/kiểm thử (mặc định đóng gọn gàng) */}
        <details className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900">
            Chi tiết kỹ thuật & Rà soát chuyên sâu
          </summary>
          <div className="mt-2 space-y-3">
        <details className="rounded-xl border border-violet-200 bg-violet-50/40 p-3" data-testid="ai-source-review-options">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[#17233D]">
            <span>Đối chiếu bằng AI (tùy chọn)</span>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-600">Không tự gửi</span>
          </summary>
          <p className="mt-2 text-xs text-[#52607A]">ChatGPT plan hiện không nhận DOCX nguyên bản. Nếu rà soát văn bản trích xuất khả dụng, DocForm chỉ gửi sau khi bạn xem phạm vi, bật consent riêng và nhấn nút gửi.</p>
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs" data-testid="provider-capability-status">
            <strong className="text-[#17233D]">Trạng thái nhà cung cấp</strong>
            {fullDocumentCapability?<>
              <p className="mt-1">ChatGPT plan: {fullDocumentCapability.providers["chatgpt-plan"].session?.status??fullDocumentCapability.session?.status??"chưa xác định"}. Chưa có xác nhận rằng nhà cung cấp đã mở hoặc xem tệp gốc.</p>
              <p className="mt-1">Gemini API: {fullDocumentCapability.providers.gemini.configured?"đã có cấu hình":"chưa sẵn sàng"}. Gói Gemini hiện tại chưa được xác minh là Free Tier.</p>
              <details className="mt-2 rounded border border-amber-200 bg-white p-2" data-testid="provider-capability-details">
                <summary className="cursor-pointer text-xs font-semibold">Chi tiết kỹ thuật</summary>
                <div className="mt-2 space-y-2 text-[10px] text-slate-600">
                  <p>ChatGPT plan / OAuth · văn bản: {fullDocumentCapability.providers["chatgpt-plan"].textInput.status}; manifest: {fullDocumentCapability.providers["chatgpt-plan"].fullTextManifest.status}.</p>
                  <ul className="list-disc pl-4">{Object.entries(fullDocumentCapability.providers["chatgpt-plan"].features).map(([key,value])=><li key={`chatgpt-${key}`}><code>{key}</code>: <strong>{value.status}</strong> — {value.reason}</li>)}</ul>
                  <p>Gemini API · văn bản: {fullDocumentCapability.providers.gemini.textInput.status}; manifest: {fullDocumentCapability.providers.gemini.fullTextManifest.status}; tier: {fullDocumentCapability.providers.gemini.dataUseTier?.tier??"chưa xác minh"}.</p>
                  <ul className="list-disc pl-4">{Object.entries(fullDocumentCapability.providers.gemini.features).map(([key,value])=><li key={`gemini-${key}`}><code>{key}</code>: <strong>{value.status}</strong> — {value.reason}</li>)}</ul>
                  <p>OpenAI API · văn bản: {fullDocumentCapability.providers["openai-api"].textInput.status}; manifest: {fullDocumentCapability.providers["openai-api"].fullTextManifest.status}; tier: {fullDocumentCapability.providers["openai-api"].dataUseTier?.tier??"chưa xác minh"}.</p>
                  <ul className="list-disc pl-4">{Object.entries(fullDocumentCapability.providers["openai-api"].features).map(([key,value])=><li key={`openai-${key}`}><code>{key}</code>: <strong>{value.status}</strong> — {value.reason}</li>)}</ul>
                  <p>{fullDocumentCapability.providers["chatgpt-plan"].oauthFileInputProbeReason}</p>
                  <p>{fullDocumentCapability.providers.gemini.dataUseTier?.reason??"Chưa xác minh cấu hình Free Tier."}</p>
                  <p>{fullDocumentCapability.providers["openai-api"].dataUseTier?.reason??"Chưa xác minh cấu hình dữ liệu OpenAI API."}</p>
                </div>
              </details>
            </>:<p className="mt-1">Chưa lấy được trạng thái nhà cung cấp từ máy chủ local.</p>}
            <p className="mt-1 font-semibold">Không gửi tệp DOCX, PDF hoặc ảnh trang. Văn bản trích xuất không đồng nghĩa với việc AI đã đọc nguyên tệp.</p>
          </div>
          {fullTextReview && <FullTextReviewPanel {...fullTextReview} />}
        </details>

        <details id="df-step1-semantic-review" className="rounded-xl border border-[#CFD8EA] bg-white p-3" aria-label="Các đơn vị nội dung thân văn bản và phụ lục cần xem">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
            <span id="semantic-review-heading" className="text-sm font-bold text-[#17233D]">Thân văn bản và phụ lục</span>
            <span className="text-xs text-[#52607A]">{semanticConfirmedCount} đã xác nhận · {semanticPendingCount} chờ bạn xem</span>
            <span className="text-xs font-semibold text-[#5145C0]">{semanticPendingCount>0?"Xem các mục cần duyệt":"Xem kết quả"}</span>
          </summary>
          <p className="mt-2 text-xs text-[#52607A]">Các nhãn chưa được xác nhận sẽ không tự áp dụng quy tắc. Bạn có thể xem trích đoạn rồi xác nhận hoặc từ chối từng mục.</p>
          <div className="mt-2 max-h-80 space-y-2 overflow-y-auto" aria-label="Các đơn vị ngữ nghĩa cần rà soát">
            {semanticReviewRows.length===0?<p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Chưa có nội dung thân văn bản hoặc phụ lục đủ căn cứ để phân loại.</p>:semanticReviewRows.map(row=><article key={row.id} className="rounded-lg border border-slate-200 p-2.5" data-semantic-unit-id={row.id}>
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-[#17233D]">{row.scope==="body"?"Thân văn bản":`Phụ lục · ${row.appendixTitle??"chưa xác định vị trí"}`} · {semanticLabelForOfficeWorker(row.label)}</strong><span className="text-[10px] font-semibold text-amber-800">{row.status==="user_confirmed"?"Đã xác nhận":row.status==="auto_confirmed"?"Khớp tự động":row.status==="rejected"?"Đã từ chối":row.status==="unsupported"?"Chưa hỗ trợ":"Chờ duyệt"}</span></div>
              <blockquote className="mt-1 border-l-2 border-slate-300 pl-2 text-xs text-[#3B4663] whitespace-pre-wrap">{row.quote||"(ô nguồn không có chữ)"}</blockquote>
              <p className="mt-1 text-[11px] text-slate-600">{row.reason}</p>
              {row.rules.length>0&&<p className="mt-1 text-[11px] text-slate-600">Quy tắc liên quan: {row.rules.map(rule=>rule.title).join(" · ")}</p>}
              {row.rules.length>0&&(row.status==="user_confirmed"||row.status==="auto_confirmed")&&(row.rulesApplied
                ?<p className="mt-1 text-[10px] font-semibold text-emerald-800" role="status">Đã áp dụng quy tắc vào đúng đoạn thân văn bản. Bản xuất sẽ dùng các giá trị này.</p>
                :row.ruleApplyAvailable
                  ?<button type="button" onClick={()=>onApplySemanticRules(row.id)} className="mt-2 rounded border border-[#6255E8] bg-[#F6F5FF] px-2 py-1 text-[11px] font-semibold text-[#5145C0]">Áp dụng quy tắc vào đoạn soạn</button>
                  :<p className="mt-1 text-[10px] text-amber-800">Chưa thể áp dụng: {row.ruleApplyReason??"neo nguồn chưa đủ chính xác để sửa một đoạn riêng lẻ."}</p>)}
              {row.rules.length>0&&row.status!=="user_confirmed"&&row.status!=="auto_confirmed"&&<p className="mt-1 text-[10px] text-slate-500">Xác nhận nhãn này trước khi áp dụng định dạng.</p>}
              {(row.status==="needs_review"||row.status==="unsupported")&&<div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={()=>onSemanticDecision(row.id,"user_confirmed")} className="rounded border border-emerald-700 px-2 py-1 text-[11px] font-semibold text-emerald-800">Xác nhận nhãn</button><button type="button" onClick={()=>onSemanticDecision(row.id,"rejected")} className="rounded border border-slate-400 px-2 py-1 text-[11px] text-slate-700">Từ chối nhãn</button></div>}
              <details className="mt-2 rounded border border-slate-200 p-2" data-semantic-technical-details>
                <summary className="cursor-pointer text-[10px] font-semibold text-slate-600">Chi tiết kỹ thuật</summary>
                <div className="mt-1 space-y-1 break-words text-[10px] text-slate-500">
                  <p>Nguồn: {row.anchor} · quan sát AI: {row.aiLabel??"chưa có"}.</p>
                  <p>{semanticDecisionFingerprint?`Revision ${semanticDecisionFingerprint.slice(0,12)}. `:""}{row.rules.length?row.rules.map(rule=>`${rule.title} [${rule.ruleId}; ${rule.category}; ${rule.sourceReference??"chưa gắn căn cứ"}]`).join(" · "):row.ruleReason??"Chưa có quy tắc phù hợp."}</p>
                </div>
              </details>
            </article>)}
          </div>
        </details>
          </div>
        </details>

        </div>
      </details>}

      {/* 4. Nguồn tài liệu: tệp hoặc mẫu */}
      {((flow==="upload" && (!hasUploadedSource || forceShowDropzone))||(flow==="create"&&phase==="template"))&&<section id="df-step1-source" className="df-import-source-grid grid grid-cols-1 gap-3" aria-label="Chọn nguồn văn bản">
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

          {/* Tùy chọn AI đã được chuyển vào Modal Cài đặt chung theo yêu cầu người dùng */}
          <div className="flex items-center justify-between text-xs text-[#52607A] mb-2 px-1">
            <span>Thiết lập nhà cung cấp và quyền rà soát AI được quản lý trong <button type="button" onClick={onOpenAppSettings} className="text-[#6255E8] font-semibold hover:underline cursor-pointer">⚙ Cài đặt chung</button>.</span>
            {aiPartitionConsent && <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">AI rà soát: Đang bật</span>}
          </div>
          <details className="sr-only" data-testid="ai-partition-consent-panel">
            <summary>Tùy chọn kiểm tra phân vùng bằng AI <span>{aiPartitionConsent?"Đang bật":"Mặc định tắt"}</span></summary>
            <div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="text-xs">
                <span className="text-slate-600">Nhà cung cấp mặc định: </span>
                <strong className="text-[#17233D]">{aiProviderDisplayName(partitionAiProvider)}</strong>
                {partitionAiProvider === "chatgpt" && <span className={`ml-2 ${chatGPTStatus.enabled && chatGPTStatus.session.status === "connected" && chatGPTStatus.session.sharing ? "text-emerald-700" : "text-amber-800"}`} role="status">
                  {chatGPTStatus.enabled && chatGPTStatus.session.status === "connected" && chatGPTStatus.session.sharing ? "Đã kết nối" : "Chưa sẵn sàng"}
                </span>}
              </div>
              <button type="button" data-testid="open-app-ai-settings" onClick={onOpenAppSettings} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                Cài đặt chung
              </button>
            </div>
            <p className="ml-5 text-[10.5px] text-slate-600">Nhà cung cấp này cũng dùng cho rà soát tài liệu và tinh chỉnh đoạn ở Bước 2. Mỗi thao tác chỉ gửi nội dung khi bạn nhấn nút tương ứng.</p>
            <label className="flex items-start gap-2 text-xs font-semibold text-[#17233D] cursor-pointer">
              <input
                type="checkbox"
                data-testid="ai-partition-consent"
                checked={aiPartitionConsent}
                onChange={event => onAiPartitionConsentChange(event.currentTarget.checked)}
                disabled={partitionAiProvider === "chatgpt" && (!chatGPTStatus.enabled || chatGPTStatus.session.status !== "connected" || !chatGPTStatus.session.sharing)}
                className="mt-0.5 accent-[#6255E8]"
                aria-describedby="ai-partition-consent-details"
              />
              <span>Cho phép gửi nguồn cho {aiProviderDisplayName(partitionAiProvider)}</span>
            </label>
            <p id="ai-partition-consent-details" className="mt-1 pl-5 text-[10.5px] leading-relaxed text-[#52607A]">
              Khi bật, toàn bộ văn bản khối và chữ trong các ô bảng cùng ID/tọa độ nguồn được gửi qua máy chủ local đến {partitionAiProvider === "chatgpt" ? "OpenAI qua ChatGPT plan đã cấp quyền" : aiProviderDisplayName(partitionAiProvider)}. Không gửi tệp, tên tệp, HTML/XML hoặc role parser. Gợi ý không tự áp dụng; phân vùng quy tắc vẫn chạy độc lập. Mặc định tắt sau khi tải lại trang; mỗi tệp nguồn cần được bật cho phép riêng.
            </p>
            {uploadedFileName && partitionCheckNotice && (
              <div className="mt-1.5 pl-5 text-[10.5px]" role="status" data-testid="ai-partition-status">
                <span className={`font-semibold ${partitionCheckSource === "gemini_ai" || partitionCheckSource === "openai_api_ai" || partitionCheckSource === "chatgpt_ai" || partitionCheckSource === "mixed" ? "text-emerald-700" : "text-amber-700"}`}>
                  {isCheckingPartitions ? "Đang rà soát" : aiSourceLabel === "Chưa kiểm tra" ? "Chưa kiểm tra" : partitionCheckSource === "rule_fallback" ? "Chỉ quy tắc nội bộ" : aiSourceLabel}
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

          {(hasUploadedSource && !forceShowDropzone) ? (
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
                <div className="df-import-file-actions">
                {canOpenSourceReview && (
                  <button
                    type="button"
                    data-action="open-partition-review"
                    onClick={onOpenReviewModal}
                    className="px-2.5 py-1 rounded-lg border border-[#CFD8EA] bg-white hover:bg-slate-50 text-xs font-semibold text-[#6255E8] flex items-center gap-1 transition shrink-0 cursor-pointer"
                  >
                    <Eye className="w-3 h-3 text-[#6255E8]" />
                    <span>Mở rà soát phân vùng</span>
                  </button>
                )}
                {originalSnapshot?.sourceType==='uploaded_file'&&originalAvailable&&onDownloadOriginal&&<button type="button" data-original-download onClick={onDownloadOriginal} className="px-2.5 py-1 rounded-lg border border-[#CFD8EA] bg-white text-xs font-semibold text-[#17233D]">Tải tệp gốc</button>}
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
              </div>

              <div className="text-[11.5px] text-[#52607A] font-medium mt-1.5 px-1">
                {tablesCount > 0 ? `${tablesCount} bảng` : "Không có bảng"} · {appendicesCount > 0 ? `${appendicesCount} phụ lục` : "Không có phụ lục"}
                {blocksCount > 0 ? ` · ${blocksCount} khối nguồn` : ""}
              </div>

              {/* Cảnh báo đặc điểm bảng phức tạp (bảng lồng, hyperlink, vMerge) */}
              {(() => {
                const allUnsupportedFeatures: UnsupportedFeature[] = [
                  ...(structuredImport?.importFidelityManifest?.unsupportedFeatures || []),
                  ...(uploadedBlocks || []).flatMap((b: SourceBlock) => b.unsupportedFeatures || []),
                ];
                const unsupportedFeatures = Array.from(new Map(allUnsupportedFeatures.map(feature => [
                  `${feature.code}:${feature.tableId ?? ""}:${feature.blockId ?? ""}:${feature.description}`,
                  feature,
                ])).values());
                if (unsupportedFeatures.length === 0) return null;
                return (
                  <div className="mt-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11.5px] text-amber-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Cần đối chiếu {unsupportedFeatures.length} phần của tài liệu với tệp gốc</span>
                    </div>
                    <p className="text-[11px] text-amber-700">
                      Một số phần có thể chưa hiển thị hoặc chỉnh sửa đúng như tệp gốc. Hãy đối chiếu trước khi tiếp tục.
                    </p>
                    <details className="text-[10.5px] text-amber-800 pt-0.5">
                      <summary className="cursor-pointer font-medium hover:underline">Xem chi tiết ({unsupportedFeatures.length})</summary>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5 font-mono text-[10px]">
                        {unsupportedFeatures.map((f: UnsupportedFeature, idx: number) => (
                          <li key={idx}>{f.description} ({f.code})</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                );
              })()}

              <div className="df-import-source-tools">
                <details className="df-import-disclosure df-import-source-details">
                  <summary>{originalSnapshot?.fileType === "txt" ? "Xem nhanh nội dung tệp đã đọc" : "Xem nhanh phần thân bài đã tách"} <span>Mở khi cần</span></summary>
                  <p className="text-[11px] text-slate-500 italic px-3 pt-2">
                    {originalSnapshot?.fileType === "txt"
                      ? "* Tệp TXT không có bố cục trang; khung này hiển thị các dòng đã đọc, giữ dòng trống và thụt đầu dòng."
                      : "* Lưu ý: Khung này chỉ hiển thị phần thân bài đã bóc tách, không bao gồm tiêu đề, nơi nhận và khối chữ ký."}
                  </p>
                  <div
                    id="wizard-source-preview"
                    data-testid="wizard-source-preview"
                    className="max-h-[220px] overflow-y-auto p-3 text-[13px] leading-relaxed text-[#17233D] custom-scroll bg-white"
                    style={{ fontFamily: '"Times New Roman", Times, serif' }}
                  >
                    {originalSnapshot?.fileType === "txt" && uploadedBlocks.length > 0 ? (
                      <div className="prose prose-xs max-w-none text-[#17233D]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(uploadedBlocks.map(block => block.html || `<p>${block.text}</p>`).join("")) }} />
                    ) : structuredImport?.body?.html ? (
                      <div className="prose prose-xs max-w-none text-[#17233D]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(structuredImport.body.html) }} />
                    ) : doc.bodyHtml ? (
                      <div className="prose prose-xs max-w-none text-[#17233D]" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(doc.bodyHtml) }} />
                    ) : (
                      <p className="italic text-slate-400">Nội dung tệp nguồn đang được đồng bộ hóa.</p>
                    )}
                  </div>
                </details>
                  {onOpenReviewModal && (
                    <button
                      type="button"
                      onClick={onOpenReviewModal}
                      className="df-import-review-link"
                    >
                      <span>Rà soát phân vùng nội dung</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
              </div>
            </>
          ) : (
            <>
              {forceShowDropzone && hasUploadedSource && (
                <div className="mb-3 p-2.5 rounded-xl bg-violet-50 border border-violet-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#17233D]">
                    Đang mở tài liệu: <strong>{uploadedFileName}</strong>. Chọn hoặc kéo thả tệp mới để thay thế.
                  </span>
                  <button
                    type="button"
                    onClick={() => setForceShowDropzone(false)}
                    className="font-bold text-[#6255E8] hover:underline shrink-0 cursor-pointer"
                  >
                    ← Quay lại tài liệu hiện tại
                  </button>
                </div>
              )}
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
          {detection && detection.confidence !== "high" && (
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-[#52607A]">
              {detection.confidence === "low" ? "Hãy kiểm tra hệ thể thức" : "Nên kiểm tra hệ thể thức"}
            </span>
          )}
        </div>

        <div className="df-import-metrics" aria-label="Tóm tắt dữ liệu nguồn">
          <div className="df-import-metric" data-metric="groups">
            <strong>{identifiedGroupsCount}/9</strong>
            <span>Nhóm có dữ liệu nhận diện</span>
          </div>
          <div className="df-import-metric" data-metric="appendices">
            <strong>{appendicesCount}</strong>
            <span>Phụ lục đã tách</span>
          </div>
          <div className="df-import-metric" data-metric="review">
            <strong>{groupsNeedingReview}</strong>
            <span>Nhóm cần xác nhận</span>
          </div>
          <div className="df-import-metric" data-metric="tables">
            <strong>{tablesCount}</strong>
            <span>Bảng trong nguồn</span>
          </div>
        </div>

        {hasUploadedSource && onOpenReviewModal && <button type="button" className="df-import-review-link" onClick={onOpenReviewModal}>Rà soát phân vùng nội dung <ArrowRight size={15} /></button>}

        {hasSelectedSource && (importGroupAttention.unverified.length > 0 || importGroupAttention.missing.length > 0) && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" data-testid="recognition-attention-summary" role="status" aria-live="polite">
            <strong className="block">Một số thành phần cần bạn đối chiếu</strong>
            {importGroupAttention.unverified.length > 0 && <p className="mt-1">{importGroupAttention.unverified.length} nhóm chưa xác minh: {importGroupAttention.unverified.join(", ")}.</p>}
            {importGroupAttention.missing.length > 0 && <p className="mt-1">{importGroupAttention.missing.length} nhóm chưa tìm thấy: {importGroupAttention.missing.join(", ")}.</p>}
            <p className="mt-1">Hãy đối chiếu với tệp gốc nếu văn bản có các thành phần này.</p>
          </div>
        )}

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
            <details className="df-import-disclosure df-import-regime-evidence">
              <summary>Hệ thể thức và chứng cứ <span>{suggestedRegimeText ?? REGIME_LABEL[regime]}</span></summary>
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
            </details>
          </>
        )}

        {(profileMismatch || templateMismatch) && <details className="df-import-disclosure df-import-recognition-warnings" open={profileMismatch || undefined}>
          <summary>Cần kiểm tra lựa chọn mẫu <span>{Number(profileMismatch) + Number(templateMismatch)} lưu ý</span></summary>
        {profileMismatch && (
          <div
            id="source-mismatch-profile"
            data-source-warning="profile"
            data-testid="source-profile-conflict"
            role="status"
            className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11.5px] text-[#9E5206] flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p>
                {sourceProfile === "company"
                  ? "Hai dòng cơ quan trong nguồn khớp mẫu Hoa tiêu miền Bắc, nhưng bạn đang chọn “Cơ quan chung”."
                  : sourceProfile === "other"
                    ? "Tên cơ quan trong nguồn không khớp đầy đủ với mẫu Hoa tiêu miền Bắc."
                    : "Chưa đủ thông tin hai dòng cơ quan để đối chiếu với mẫu Hoa tiêu miền Bắc."}
                {profileDecisionValid && " Bạn đã xác nhận lựa chọn cho tệp này trong phiên hiện tại."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Xác nhận mẫu cơ quan cho tệp này">
                <button type="button" data-action="confirm-generic-profile" onClick={() => onConfirmProfileDecision("generic")}
                  className="rounded-lg border border-[#CFD8EA] bg-white px-2.5 py-1.5 font-semibold text-[#17233D] hover:border-[#6255E8]">
                  Dùng Cơ quan chung
                </button>
                <button type="button" data-action="confirm-company-profile" onClick={() => onConfirmProfileDecision("company")}
                  className="rounded-lg border border-[#6255E8] bg-white px-2.5 py-1.5 font-semibold text-[#5145C0] hover:bg-[#F6F5FF]">
                  Vẫn dùng Hoa tiêu miền Bắc
                </button>
              </div>
            </div>
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
        </details>}
      </section>}

      {phase==="ready"&&<section id="df-step1-ready" className="df-import-card df-import-ready" aria-labelledby="df-step1-ready-title">
        <span className="df-import-ready-icon"><CheckCircle2 size={24}/></span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="df-step1-ready-title" className="text-sm sm:text-base font-bold text-[#17233D]">
              {flow==="upload"?(canContinue?"Tài liệu đã sẵn sàng để soạn thảo":"Tài liệu đã được nhận diện"):"Văn bản mới đã được khởi tạo"}
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {flow==="upload" ? (canContinue ? "Đủ điều kiện" : "Cần duyệt nguồn") : "Sẵn sàng"}
            </span>
          </div>
          <p className="text-xs text-[#52607A] mt-1">
            {flow==="upload"?`${uploadedFileName} · ${blocksCount} khối nguồn · ${tablesCount} bảng · ${appendicesCount} phụ lục`:`${doc.documentType} · ${REGIME_LABEL[regime]} · ${isCompanyProfile?"Mẫu Hoa tiêu miền Bắc":"Cơ quan chung"}`}
          </p>
          <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#35445F] flex flex-wrap items-center justify-between gap-2">
            <span>
              {flow==="upload"
                ? canContinue
                  ? "✓ Toàn bộ phân vùng và thông tin thể thức đã được thiết lập chuẩn xác."
                  : "Vui lòng kiểm tra phân vùng nguồn trước khi tiếp tục."
                : "✓ Mẫu văn bản chuẩn đã được nạp sẵn sàng vào Studio."}
            </span>
            {flow==="upload" && canOpenSourceReview && (
              <button type="button" onClick={onOpenReviewModal} className="text-xs font-semibold text-[#6255E8] hover:underline inline-flex items-center gap-1">
                Xem chi tiết nguồn <ArrowRight size={13}/>
              </button>
            )}
          </div>
        </div>
      </section>}

      {flow&&phase!=="choice"&&<div className="df-wizard-actions df-import-actions">
        <button type="button" className="df-import-back" onClick={()=>{
          if (flow === "upload") {
            onPhaseChange("choice");
            onFlowChange(null as any);
          } else {
            onPhaseChange(phase==="regime"?"choice":phase==="doctype"?"regime":phase==="template"?"doctype":"template");
          }
        }}><ArrowLeft size={15}/> Quay lại</button>
        <span className="df-import-action-hint">
          {flow === "upload"
            ? hasUploadedSource && !forceShowDropzone
              ? `Đã nhận diện: ${doc.documentType || "Chưa chọn loại"} · ${REGIME_LABEL[regime]}`
              : "Tệp DOCX hoặc TXT · dữ liệu nguồn được giữ để đối chiếu"
            : phase==="regime"?`Đang chọn: ${draftRegime==="party"?"Văn bản Đảng · Hướng dẫn 05":"Văn bản hành chính · Nghị định 30"}`:phase==="doctype"?draftDocType?`Đã chọn: ${draftDocType}`:"Chọn một loại văn bản để tiếp tục":phase==="template"?`Thể thức ${draftRegime==="party"?"Đảng":"hành chính"} · ${draftDocType}`:""}
        </span>
        {flow === "upload" && hasUploadedSource && !forceShowDropzone ? (
          <>
            {!doc.documentType && (
              <div id="doctype-required-reason" data-testid="doctype-source-suggestion" role="status" aria-live="polite" className="sr-only">
                Chưa thể xem tóm tắt: hãy xác nhận loại văn bản
                {sourceEvidenceSuggestsMinutes && <span>Gợi ý từ nội dung: <button type="button" onClick={() => onFieldChange("documentType", "BIÊN BẢN")}>Xác nhận “Biên bản”</button></span>}
              </div>
            )}
            <button
              type="button"
              data-action="wizard-next"
              className="df-import-forward"
              disabled={!doc.documentType || isUploading}
              aria-describedby={!doc.documentType?"doctype-required-reason":undefined}
              onClick={handleContinue}
            >
              Tiếp tục đưa vào Studio soạn thảo <ArrowRight size={16}/>
            </button>
          </>
        ) : flow === "upload" ? null : (
          <>
            {phase==="regime"&&<button type="button" className="df-import-forward" onClick={()=>onPhaseChange("doctype")}>Chọn loại văn bản <ArrowRight size={16}/></button>}
            {phase==="doctype"&&<button type="button" className="df-import-forward" disabled={!draftDocType} onClick={()=>onPhaseChange("template")}>Chọn mẫu <ArrowRight size={16}/></button>}
            {phase==="ready"&&<button type="button" data-action="wizard-next" className="df-import-forward" disabled={continueDisabled} onClick={handleContinue}>{canContinue&&flowSourceReady?"Tiếp tục đưa vào Studio soạn thảo":canOpenSourceReview&&flowSourceReady?"Rà soát phân vùng trước":"Chọn nguồn trước khi tiếp tục"} <ArrowRight size={16}/></button>}
          </>
        )}
      </div>}

      {/* Modal xác nhận thay đổi tài liệu khi đang có tài liệu mở sẵn */}
      {pendingReplaceFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#17233D]/50 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="replace-file-dialog-title">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-[#CFD8EA] shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 id="replace-file-dialog-title" className="text-sm sm:text-base font-bold text-[#17233D]">
                  Xác nhận thay đổi tài liệu
                </h3>
                <p className="text-xs text-[#52607A] mt-1 leading-relaxed">
                  Bạn đang có một tài liệu đang được thực hiện. Việc tải tệp mới sẽ thay thế phiên làm việc hiện tại.
                </p>
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-[#52607A] font-semibold w-28 shrink-0">Đang thực hiện:</span>
                <span className="font-bold text-rose-700 break-all">{uploadedFileName || doc.documentType || "Tài liệu hiện tại"}</span>
              </div>
              <div className="flex items-center justify-center text-slate-400">
                <ArrowRight size={14} className="rotate-90 sm:rotate-0" />
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#52607A] font-semibold w-28 shrink-0">Tệp mới thay thế:</span>
                <span className="font-bold text-emerald-700 break-all">{pendingReplaceFile.name}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
              💡 Phiên làm việc của tài liệu cũ đã được tự động lưu trữ trên trình duyệt này. Bạn có thể mở lại sau nếu cần.
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancelReplaceFile}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                Giữ tài liệu hiện tại
              </button>
              <button
                type="button"
                onClick={handleConfirmReplaceFile}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Xác nhận thay thế</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

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
              <p>{canContinue ? "Nguồn đã đủ điều kiện. Bạn có thể chuyển sang soạn và kiểm tra." : hasSelectedSource ? "Rà soát các phân vùng nguồn và xác nhận những mục còn cần xem lại." : "Chọn nguồn tài liệu để bắt đầu quy trình."}</p>
              {!canContinue && canOpenSourceReview && (
                <button type="button" onClick={onOpenReviewModal} className="df-import-context-action">Mở rà soát phân vùng →</button>
              )}
              {canContinue&&flowSourceReady && (
                <button type="button" onClick={handleContinue} className="df-import-context-action">Tiếp tục đưa vào Studio soạn thảo →</button>
              )}
            </section>
          </div>
        </details>
      </aside>}
    </div>
  );
}
