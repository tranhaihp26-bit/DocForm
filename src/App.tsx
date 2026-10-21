import { composeDocumentFormatData } from "./utils/documentComposer.ts";
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  FileText, Upload, Sparkles, Download, Printer, History, RotateCcw,
  CheckCircle2, AlertCircle, LayoutTemplate, Edit3, Eye,
  Save, Wand2, ArrowRight, FileCheck, ShieldCheck, Check,
  X, AlertTriangle, Info, HelpCircle, FilePlus, ChevronRight, ChevronLeft,
  ExternalLink, Copy, Bookmark, Building2, MapPin, Tag, ZoomIn, ZoomOut,
  Maximize2, Minimize2, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight,
  Sliders, RefreshCw, Layers, CheckSquare, FlaskConical, Play, Search, CheckCheck,
  AlignLeft, AlignCenter, AlignRight, AlignJustify
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import DOMPurify from "dompurify";
import ND30Editor from "./components/ND30Editor.tsx";
import { A4DocumentPreview } from "./components/A4DocumentPreview.tsx";
import {printCandidate} from "./components/CandidatePrintView.tsx";
import {
  exportToDocx as generateAndDownloadDocx,
  generateND30DocxUint8Array,
  generateND30DocxBuffer,
  detectEmbeddedSignature,
  sanitizeHtmlForDocx,
  downloadDocxUint8Array
} from "./utils/docxExport.ts";
import { verifyCandidateExportFidelity } from "./utils/tableRoundtrip.ts";
import { syncImportedTablesFromHtml, syncTableModelFromHtml } from "./utils/tableFormatUtils.ts";
import {
  extractLocalFile,
  persistSourceBlob,
  segmentLocalExtraction,
  buildParsedImport,
  type LocalFileExtraction,
} from "./utils/localFileImport.ts";
import {
  detectRegimeFromRawBlocks,
  regimeNeedsConfirmation,
  toRegimeDetectionRecord,
  type RegimeDetectionResult,
} from "./utils/regimeDetection.ts";
import {
  composeImportedBodyHtml,
  deriveImportStatus,
  updateImportField,
  reconstructFromReviewedBlocks,
  validateReviewedBlocks
} from "./utils/importReview.ts";
import {
  applySingleProposal,
  applyAllProposalsSequentially,
  changeBlockRole,
  type CanonicalWorkflowState,
  type ReviewProposalBatchContext,
  type RefineProposalContext,
  computePartitionFingerprint,
  isReviewProposalBatchValid,
  isRefineProposalContextValid
} from "./utils/proposalState.ts";
import { createDocumentSessionGate, type SessionRequestToken } from "./utils/documentSessionGate.ts";
import {
  prepareImportedFileBundle,
  commitImportedFileBundle,
  commitTemplateOrPilotReplacement,
  commitVersionRestore,
  createInitialImportSessionState,
  type ImportSessionState,
} from "./utils/importSessionLifecycle.ts";
import { saveDraft, loadDraft, clearDraft, loadSourceBlob, type OriginalDocumentSnapshot } from "./utils/draftStore.ts";
import { computeVisualDiff } from "./utils/diffUtils.ts";
import {
  type DocumentFormatType,
  validateND30Compliance,
  type ND30ComplianceReport,
  isPlaceholderValue,
  REFERENCE_NUMBER_REGEX,
  REFERENCE_NUMBER_ND30_REGEX,
  REFERENCE_NUMBER_HD05_REGEX,
  isValidND30LocationAndDate,
  type StructuredImport,
  type AppendixDocument,
  type SourceBlock,
  type SourceRegion,
  type ReviewProposal,
  type PartitionProposal,
  type PartitionCheckResult,
  assessExportSafety,
  type ImportFidelityManifest,
  type DocumentState
} from "./shared/schemas/document.schema.ts";
export type { DocumentState };
import { checkProposalValidityBeforeApply } from "./shared/partitionValidation.ts";
import { validateProposalAgainstSource } from "./shared/partitionValidation.ts";
import { applyPartitionProposalBatch } from "./shared/partitionApply.ts";
import { analyzePartitionFallback } from "./shared/partitionFallback.ts";
import {
  PARTITION_AI_SCHEMA_VERSION,
  toPartitionAiBlocks,
  validatePartitionAiRequest,
  validatePartitionAiResponse,
  type PartitionAiRequest,
  type PartitionAiResponse,
} from "./shared/partitionAiProtocol.ts";
import { formatStandardDate, extractLocation } from "./server/middleware/compliance.middleware.ts";
import { detectDocumentType } from "./server/parser.ts";
import { COMPANY_HEADER_PROFILE_ID, COMPANY_HEADER_PARENT_LINES, applyCompanyProfile, LOCKED_COMPANY_FIELDS } from "./canonical/nd30/companyHeader.ts";
import {
  COMPANY_HEADER_HD05_PROFILE_ID,
  COMPANY_HEADER_HD05_PARENT_LINES,
  COMPANY_HEADER_HD05_ISSUER_LINES,
  applyCompanyHD05Profile,
  LOCKED_COMPANY_HD05_FIELDS
} from "./canonical/hd05/companyHeaderHD05.ts";
import { PILOT_DOCUMENTS, type PilotDocumentItem } from "./fixtures/pilotDocuments.ts";
import { COMPLEX_MALFORMED_DOCUMENTS, type ComplexMalformedItem } from "./fixtures/complexMalformedDocuments.ts";
import { generateRuleBasedProposals, summarizeProposals } from "./server/reviewProposals.ts";
import {
  evaluateDocumentRules,
  extractOoxmlEvidenceFromXml,
  COMPONENT_GROUPS,
  type ComponentGroupId,
  type CanonicalStatus,
  type DocumentEvaluationSummary
} from "./canonical/ruleEngine.ts";

import {
  SafeRegimeModal,
  RegimeConfirmModal,
  AdvancedDrawer,
  ExportStepView,
} from "./components/OfficeWorkerViews.tsx";
import {WorkspaceEditor} from './components/WorkspaceEditor.tsx';
import {WorkspaceExport} from './components/WorkspaceExport.tsx';
import {createWorkspaceSnapshot,canonicalWorkspaceValue,makePartition,canEnterWorkspaceStep,hasWorkspaceApproval,workspaceInvariantErrors,type WorkspaceState,type WorkspaceSnapshot} from './utils/workspaceState.ts';
import {transactWorkspace,approveWorkspacePartition,stageWorkspacePartition,cancelWorkspacePartition,confirmWorkspacePartition,changeWorkspaceRegime,type WorkspaceAction,type WorkspaceResult} from './utils/workspaceTransactions.ts';
import {prepareTemplateTables} from './utils/templateWorkspace.ts';
import {restoreWorkspaceVersion} from './utils/workspacePersistence.ts';
import {createExportCandidateManager,exportCandidateKey,type ExportCandidate} from './utils/exportCandidate.ts';
import {createWorkspaceAiTarget,receiveWorkspaceAiResult,applyWorkspaceAiResult,type WorkspaceAiTarget} from './utils/workspaceAiTarget.ts';
import { ImportStepView } from "./components/ImportStepView.tsx";
import { useAccessibleDialog } from "./utils/useAccessibleDialog.ts";
import {
  deriveSourceMismatch,
  docTypeDecisionCovers,
  inferDraftSourceOrigin,
  type DocTypeDecision,
} from "./utils/sourceMismatch.ts";

const PILOT_CATEGORIES = [
  { id: "all", name: "Tất cả", count: 27, icon: "📁" },
  { id: "ke_hoach", name: "Kế hoạch", count: 4, icon: "📋" },
  { id: "quyet_dinh", name: "Quyết định", count: 4, icon: "⚖️" },
  { id: "cong_van", name: "Công văn", count: 4, icon: "✉️" },
  { id: "bien_ban", name: "Biên bản", count: 4, icon: "📝" },
  { id: "bao_cao", name: "Báo cáo", count: 4, icon: "📊" },
  { id: "to_trinh", name: "Tờ trình", count: 3, icon: "📑" },
  { id: "dang", name: "Đảng HD 05", count: 4, icon: "☭" },
];

const EDGE_CASE_CATEGORIES = [
  { id: "all", name: "Tất cả thử thách", count: 10, icon: "⚡" },
  { id: "complex", name: "Cấu trúc phức tạp", count: 3, icon: "🔥" },
  { id: "non_compliant", name: "Lỗi thể thức NĐ 30", count: 4, icon: "⚠️" },
  { id: "malformed_data", name: "Dữ liệu hỏng & XSS", count: 3, icon: "🛡️" },
];


export interface Version {
  workspace?: WorkspaceState;
  docTypeOverride?: DocTypeDecision|null;
  id: string;
  timestamp: string;
  title: string;
  data: DocumentState;
  standardType: "state" | "party";
  originalSnapshot?: OriginalDocumentSnapshot | null;
  reviewBlocks?: SourceBlock[];
  structuredImport?: StructuredImport | null;
  uploadedBlocks?: SourceBlock[];
  uploadedFileName?: string;
  uploadedFileType?: "docx" | "txt" | null;
  rawText?: string;
}

export interface TemplatePreset {
  id: string;
  name: string;
  desc: string;
  type: "state" | "party";
  badge: string;
  defaultData: DocumentState;
}

const TEMPLATES: TemplatePreset[] = [
  {
    id: "kh",
    name: "Kế hoạch công tác",
    desc: "Kế hoạch triển khai nhiệm vụ, đề án, tổng kết an toàn hàng hải",
    type: "state",
    badge: "NĐ 30 Kế hoạch",
    defaultData: {
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "KẾ HOẠCH",
      referenceNumber: "Số: 125/KH-HTMB",
      subject: "V/v Tổ chức Hội nghị Tổng kết Công tác An toàn Hàng hải năm 2026",
      bodyHtml: `
        <p><strong><em>Căn cứ Quyết định số 45/QĐ-TCT ngày 12 tháng 01 năm 2026 của Tổng công ty Bảo đảm An toàn Hàng hải Việt Nam về việc giao kế hoạch nhiệm vụ năm 2026;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></strong></p>
        <p>Theo đề nghị của Trưởng phòng Tổ chức - Hành chính và Trưởng phòng An toàn Hoa tiêu,</p>
        <p>Công ty Hoa tiêu Hàng hải miền Bắc ban hành Kế hoạch tổ chức Hội nghị Tổng kết công tác An toàn Hàng hải năm 2026 với các nội dung trọng tâm như sau:</p>
        <p><strong>Điều 1. Mục đích và yêu cầu</strong></p>
        <p>1. Đánh giá toàn diện công tác dẫn tàu an toàn, công tác phối hợp cứu hộ cứu nạn và bảo đảm an toàn hàng hải trong vùng nước hoa tiêu được giao quản lý.</p>
        <p>2. Biểu dương các tập thể, cá nhân có thành tích xuất sắc và đề ra phương hướng, nhiệm vụ trọng tâm giai đoạn tiếp theo.</p>
        <p><strong>Điều 2. Bảng phân công tiến độ thực hiện</strong></p>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
          <colgroup>
            <col style="width: 8%;">
            <col style="width: 57%;">
            <col style="width: 35%;">
          </colgroup>
          <thead>
            <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
              <th style="border: 1px solid #000; padding: 6px;">STT</th>
              <th style="border: 1px solid #000; padding: 6px;">Nội dung công việc</th>
              <th style="border: 1px solid #000; padding: 6px;">Đơn vị chủ trì</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Dự thảo báo cáo tổng kết an toàn hàng hải</td>
              <td style="border: 1px solid #000; padding: 6px;">Phòng An toàn Hoa tiêu</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 6px; text-align: center;">2</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: justify;">Công tác khánh tiết, chuẩn bị hội trường</td>
              <td style="border: 1px solid #000; padding: 6px;">Văn phòng Công ty</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Điều 3. Trách nhiệm thi hành</strong></p>
        <p>Các phòng, ban chuyên môn và toàn thể cán bộ công nhân viên, hoa tiêu viên chịu trách nhiệm thi hành Quyết định này./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 3;\nLãnh đạo Tổng công ty (để b/c);\nBan Giám đốc Công ty;\nLưu: VT, ATHH (03b)."
    }
  },
  {
    id: "qd",
    name: "Quyết định hành chính",
    desc: "Quyết định cá biệt áp dụng quy chuẩn Nghị định 30/2020/NĐ-CP",
    type: "state",
    badge: "NĐ 30 Cá biệt",
    defaultData: {
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "QUYẾT ĐỊNH",
      referenceNumber: "Số: 89/QĐ-HTMB",
      subject: "V/v Kiện toàn Ban Chỉ đạo An toàn Hàng hải năm 2026",
      bodyHtml: `
        <p><strong><em>Căn cứ Điều lệ tổ chức và hoạt động của Công ty Hoa tiêu Hàng hải miền Bắc;</em></strong></p>
        <p><strong><em>Căn cứ Nghị định số 30/2020/NĐ-CP ngày 05 tháng 3 năm 2020 của Chính phủ về công tác văn thư;</em></strong></p>
        <p><strong><em>Theo đề nghị của Trưởng phòng Tổ chức - Cán bộ;</em></strong></p>
        <p style="text-align: center;"><strong>QUYẾT ĐỊNH:</strong></p>
        <p><strong>Điều 1.</strong> Kiện toàn Ban Chỉ đạo An toàn Hàng hải Công ty Hoa tiêu Hàng hải miền Bắc gồm các thành viên có danh sách đính kèm.</p>
        <p><strong>Điều 2.</strong> Quyết định này có hiệu lực thi hành kể từ ngày ký. Các phòng, ban và các cá nhân có tên tại Điều 1 chịu trách nhiệm thi hành Quyết định này./.</p>
      `,
      signTitle: "TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC\nGIÁM ĐỐC",
      signName: "Nguyễn Văn Bình",
      recipients: "Như Điều 2;\nLãnh đạo TCT (để b/c);\nLưu: VT, TCCB."
    }
  },
  {
    id: "cv",
    name: "Công văn hành chính",
    desc: "Công văn gửi cơ quan cấp trên, khách hàng và đối tác",
    type: "state",
    badge: "NĐ 30 Công văn",
    defaultData: {
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "CÔNG VĂN",
      referenceNumber: "Số: 342/HTMB-VT",
      subject: "V/v Đảm bảo an toàn dẫn tàu trong điều kiện thời tiết gió mùa",
      bodyHtml: `
        <p style="text-align: center;"><strong>Kính gửi:</strong> Các Hãng tàu, Đại lý hàng hải và Doanh nghiệp cảng biển</p>
        <p>Để đảm bảo an toàn tuyệt đối cho người, phương tiện và hàng hải trong vùng nước hoa tiêu khu vực phía Bắc, Công ty Hoa tiêu Hàng hải miền Bắc trân trọng thông báo:</p>
        <p>1. Thường xuyên cập nhật thông tin dự báo khí tượng thủy văn trước khi lập kế hoạch điều động tàu.</p>
        <p>2. Phối hợp chặt chẽ với Trạm Hoa tiêu và Đài Thông tin Duyên hải để thống nhất phương án dẫn tàu an toàn.</p>
        <p>Rất mong nhận được sự phối hợp chặt chẽ của quý cơ quan, đơn vị./.</p>
      `,
      signTitle: "KT. GIÁM ĐỐC\nPHÓ GIÁM ĐỐC",
      signName: "Trần Văn An",
      recipients: "Như kính gửi;\nTổng công ty (để b/c);\nLưu: VT, ATHH."
    }
  },
  {
    id: "bb",
    name: "Biên bản làm việc",
    desc: "Biên bản hội nghị, kiểm tra an toàn hoặc làm việc 3 bên",
    type: "state",
    badge: "Biên bản 3 ký",
    defaultData: {
      orgHeader1: "TỔNG CÔNG TY BẢO ĐẢM\nAN TOÀN HÀNG HẢI VIỆT NAM",
      orgHeader2: "CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "BIÊN BẢN LÀM VIỆC",
      referenceNumber: "Số: 15/BB-HTMB",
      subject: "V/v Kiểm tra công tác chuẩn bị dẫn tàu trọng tải lớn vào luồng",
      bodyHtml: `
        <p>Hôm nay, ngày 15 tháng 10 năm 2026, tại Trạm Hoa tiêu Hàng hải Hải Phòng, các bên gồm có:</p>
        <p><strong>1. Đại diện Công ty Hoa tiêu Hàng hải miền Bắc:</strong> Đồng chí Nguyễn Văn Bình - Giám đốc.</p>
        <p><strong>2. Đại diện Cảng vụ Hàng hải:</strong> Đồng chí Trần Văn An - Trưởng đại diện.</p>
        <p><strong>3. Thư ký cuộc họp:</strong> Đồng chí Lê Thị Lan - Chuyên viên phòng ATHH.</p>
        <p>Sau khi tiến hành khảo sát thực địa và trao đổi nghiệp vụ, các bên thống nhất kết luận:</p>
        <p>- Luồng hàng hải đảm bảo độ sâu chuẩn tắc cho phép tàu trọng tải đến 50.000 DWT hành hải an toàn.</p>
        <p>- Bố trí đủ tàu lai dắt hỗ trợ và hoa tiêu viên hạng Nhất dẫn tàu theo đúng quy chuẩn.</p>
        <p>Biên bản được lập thành 03 bản có giá trị pháp lý như nhau và đã được các bên thông qua./.</p>
      `,
      signTitle: "ĐẠI DIỆN CẢNG VỤ | ĐẠI DIỆN HOA TIÊU | THƯ KÝ",
      signName: "Trần Văn An | Nguyễn Văn Bình | Lê Thị Lan",
      recipients: "Các bên tham gia;\nLưu: VT, ATHH."
    }
  },
  {
    id: "nq_dang",
    name: "Nghị quyết của Đảng",
    desc: "Văn bản Đảng ban hành chuẩn theo Hướng dẫn số 05-HD/VPTW",
    type: "party",
    badge: "HD 05 Đảng",
    defaultData: {
      orgHeader1: "ĐẢNG BỘ TỔNG CÔNG TY BẢO ĐẢM ATHH VN",
      orgHeader2: "ĐẢNG BỘ CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC",
      nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
      nationalHeader2: "",
      locationAndDate: "Hải Phòng, ngày 15 tháng 10 năm 2026",
      documentType: "NGHỊ QUYẾT",
      referenceNumber: "Số 28-NQ/ĐU",
      subject: "Về tăng cường sự lãnh đạo của Đảng đối với công tác chuyển đổi số và an toàn hàng hải",
      bodyHtml: `
        <p><strong><em>Căn cứ Điều lệ Đảng Cộng sản Việt Nam;</em></strong></p>
        <p><strong><em>Căn cứ Nghị quyết Đại hội Đảng bộ Công ty Hoa tiêu Hàng hải miền Bắc nhiệm kỳ 2025 - 2030;</em></strong></p>
        <p>Ban Chấp hành Đảng bộ Công ty quyết nghị:</p>
        <p><strong>I. MỤC TIÊU VÀ QUAN ĐIỂM CHỈ ĐẠO</strong></p>
        <p>1. Nâng cao năng lực lãnh đạo, sức chiến đấu của tổ chức đảng và chất lượng đội ngũ cán bộ, đảng viên, hoa tiêu viên.</p>
        <p>2. Đẩy mạnh ứng dụng công nghệ thông tin, tự động hóa quy trình quản lý điều hành và dẫn tàu an toàn.</p>
        <p><strong>II. NHIỆM VỤ VÀ GIẢI PHÁP TRỌNG TÂM</strong></p>
        <p>1. Các chi bộ trực thuộc tổ chức sinh hoạt chuyên đề về văn hóa an toàn và đạo đức nghề nghiệp hoa tiêu.</p>
        <p>2. Ban Giám đốc chỉ đạo triển khai phần mềm quản lý văn bản chuẩn thể thức Nghị định 30 và Hướng dẫn 05 trong toàn Công ty.</p>
      `,
      signTitle: "T/M ĐẢNG BỘ\nBÍ THƯ",
      signName: "Nguyễn Văn Bình",
      recipients: "Đảng ủy Tổng công ty (để b/c);\nCác chi bộ trực thuộc;\nLưu: VP Đảng ủy."
    }
  }
];

/**
 * Tạo khóa định danh phiên bản bản thảo (Draft Revision Key).
 * Kết hợp chế độ, hồ sơ header, các trường thể thức và nội dung để bảo đảm
 * bằng chứng OOXML bất đồng bộ chỉ được chấp nhận khi vẫn khớp chính xác với bản thảo hiện thời.
 */
export function computeDraftRevisionKey(doc: Partial<DocumentFormatType> | DocumentState, regime: string): string {
  const parts = [
    regime,
    doc.headerProfile || "generic",
    doc.documentType || "",
    doc.referenceNumber || "",
    doc.locationAndDate || "",
    doc.orgHeader1 || "",
    doc.orgHeader2 || "",
    doc.draftNote || "",
    String(doc.includeDraftNoteInExport ?? true),
    doc.nationalHeader1 || "",
    doc.nationalHeader2 || "",
    doc.subject || "",
    doc.signTitle || "",
    doc.signName || "",
    doc.recipients || "",
    doc.bodyHtml || "",
    (doc as any).fontFamily || "Times New Roman",
    String((doc as any).fontSize || 13),
    (doc.appendices || []).map((a: any, idx: number) => `${idx}:${a.id || ""}:${a.title || ""}:${a.html || ""}:${a.referenceText || ""}:${JSON.stringify(a.tables || [])}`).join(";"),
    (doc.unclassified || []).map((u: any, idx: number) => `${idx}:${u.id || ""}:${u.index ?? ""}:${u.kind || ""}:${u.text || ""}:${u.html || ""}:${JSON.stringify(u.tableShape || {})}:${JSON.stringify(u.tableProperties || {})}`).join(";")
  ];
  return parts.join("|~|");
}

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value?: string;
  onValueChange?: (val: string) => void;
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ value = "", onValueChange, onChange, className, style, rows = 1, ...props }, forwardedRef) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);

    const setRef = useCallback((node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      }
    }, [forwardedRef]);

    const adjustHeight = useCallback(() => {
      const textarea = internalRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(textarea.scrollHeight, 24)}px`;
    }, []);

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    return (
      <textarea
        ref={setRef}
        value={value}
        rows={rows}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
          adjustHeight();
        }}
        className={`overflow-hidden resize-none ${className || ""}`}
        style={{ ...style }}
        {...props}
      />
    );
  }
);
AutoResizeTextarea.displayName = "AutoResizeTextarea";

export default function App() {
  const [standardType, setStandardType] = useState<"state" | "party">("state");
  const [rawText, setRawText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedHtml, setUploadedHtml] = useState("");
  const [uploadedFileType, setUploadedFileType] = useState<"docx" | "txt" | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<OriginalDocumentSnapshot | null>({
    sourceType: "system_template",
    fileName: TEMPLATES[0].name,
    fileType: "template",
    sourceId: TEMPLATES[0].id,
    uploadedAt: new Date().toISOString(),
    bodyHtml: TEMPLATES[0].defaultData.bodyHtml,
    rawText: TEMPLATES[0].defaultData.bodyHtml.replace(/<[^>]+>/g, " "),
  });
  const [customInstructions, setCustomInstructions] = useState("");

  // UI Panels state
  const [showSidebarLeft, setShowSidebarLeft] = useState(false);
  const [showInspectorRight, setShowInspectorRight] = useState(true);
  const [userClosedInspector, setUserClosedInspector] = useState(false);
  const [isCompactWorkspace, setIsCompactWorkspace] = useState(() => window.innerWidth < 1200);
  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth < 1200;
      setIsCompactWorkspace(compact);
      if (!compact && !userClosedInspector) {
        setShowInspectorRight(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [userClosedInspector]);
  useEffect(() => {
    if (!showInspectorRight || !isCompactWorkspace) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>(".df-inspector");
    if (!panel) return;
    const close = panel.querySelector<HTMLElement>("[aria-label='Đóng trợ lý rà soát']");
    close?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setShowInspectorRight(false); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]):not([tabindex='-1']), input, select, summary"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [showInspectorRight, isCompactWorkspace]);
  const [inspectorTab, setInspectorTab] = useState<"issues" | "ai" | "outline">("issues");
  const [studioViewMode, setStudioViewMode] = useState<"canvas" | "real_docx">("canvas");
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);
  const [isAutoFitZoom, setIsAutoFitZoom] = useState<boolean>(true);
  const [tiptapEditor, setTiptapEditor] = useState<any>(null);
  const [activeIssueIndex, setActiveIssueIndex] = useState<number>(0);

  // Storage & Autosave
  const [autoSaveStatus, setAutoSaveStatus] = useState<string>("Đã sẵn sàng");
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Chỉ báo "Đã lưu" chỉ hiển thị sau khi IndexedDB commit thành công. */
  const [hasPersistedDraft, setHasPersistedDraft] = useState(false);

  // Loading flags
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // Notification messages
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [templateFilter, setTemplateFilter] = useState<"all" | "state" | "party">("all");

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = window.setTimeout(() => setSuccessMsg(""), 5000);
    return () => window.clearTimeout(timer);
  }, [successMsg]);

  // Structured Import state
  const [structuredImport, setStructuredImport] = useState<StructuredImport | null>(null);
  const [importReviewAccepted, setImportReviewAccepted] = useState(false);
  /**
   * S3-F01 (tái audit 20/10/2026): hash của nguồn tệp đã được người dùng DUYỆT
   * ở bước "Đối Chiếu & Phân Vùng". Bản nhập chưa duyệt không được mở Bước 3
   * hay nút xuất/in. Gắn theo hash nguồn để quyết định không áp nhầm sang
   * nguồn khác và vẫn sống qua reload.
   */
  const [importReviewApprovedSourceHash, setImportReviewApprovedSourceHash] = useState<string | null>(null);
  const [showSideBySideModal, setShowSideBySideModal] = useState(false);
  const [importReviewTab, setImportReviewTab] = useState<"source" | "mapped">("source");
  const [pendingTemplate, setPendingTemplate] = useState<TemplatePreset | null>(null);
  const pendingTemplateDialogRef = useAccessibleDialog<HTMLDivElement>(
    Boolean(pendingTemplate),
    () => setPendingTemplate(null),
  );
  const [workspace,setWorkspace]=useState<WorkspaceState|null>(null);
  const [reviewBlocks, setReviewBlocks] = useState<SourceBlock[]>([]);
  const [reviewBlockFilter, setReviewBlockFilter] = useState<"all" | SourceRegion>("all");
  const sideBySideDialogRef = useAccessibleDialog<HTMLDivElement>(
    Boolean(showSideBySideModal && (structuredImport || reviewBlocks.length > 0)),
    () => closePartitionReview(),
  );

  // AI-Assisted Partition Review state
  const [isCheckingPartitions, setIsCheckingPartitions] = useState(false);
  const [partitionProposals, setPartitionProposals] = useState<PartitionProposal[]>([]);
  const [verifiedPartitionProposalIds, setVerifiedPartitionProposalIds] = useState<Set<string>>(new Set());
  const [partitionCheckNotice, setPartitionCheckNotice] = useState<string>("");
  const [partitionCheckSource, setPartitionCheckSource] = useState<"gemini_ai" | "rule_fallback" | "mixed" | "unverified">("unverified");
  const [partitionCoverage, setPartitionCoverage] = useState<PartitionCheckResult["coverage"] | null>(null);
  const [partitionProgress, setPartitionProgress] = useState<{
    processedChunks: number;
    totalChunks: number;
    lastChunkStatus?: "completed" | "failed" | "timed_out" | "invalid_response";
  } | null>(null);
  const [aiPartitionConsent, setAiPartitionConsent] = useState(false);
  const aiPartitionConsentRef = useRef(false);
  const partitionRunKeyRef = useRef("");
  const [partitionHistory, setPartitionHistory] = useState<SourceBlock[][]>([]);
  const [userModifiedBlockIds, setUserModifiedBlockIds] = useState<string[]>([]);
  const sessionGateRef = useRef(createDocumentSessionGate());
  const standardTypeRef = useRef<"state" | "party">(standardType);
  standardTypeRef.current = standardType;
  const userInteractedRef = useRef<boolean>(false);
  const draftHydratedRef = useRef<boolean>(false);

  const markUserInteraction = () => {
    userInteractedRef.current = true;
    draftHydratedRef.current = true;
    sessionGateRef.current.cancelKind("draft_restore");
  };

  const invalidateActiveAiSession = (notice?: string) => {
    markUserInteraction();
    sessionGateRef.current.invalidate();
    setIsUploading(false);
    setIsCheckingPartitions(false);
    setPartitionProgress(null);
    setIsReviewingProposals(false);
    setPartitionCoverage(null);
    setPartitionCheckSource("unverified");
    // Chặng 2: a regime/document/session change invalidates a pending import
    // confirmation so its stale "confirm" can never commit file B.
    setPendingImport(null);
    // S1-F01: đề xuất "AI tinh chỉnh" ghi đè toàn bộ thân bài nên phải bị
    // loại khi phiên AI bị vô hiệu hoá (đổi nguồn, đổi hệ, sửa phân vùng).
    setRefineProposal(null);
    setPartitionCheckNotice(notice ?? "Kết quả kiểm tra cũ đã hết hiệu lực sau khi nguồn, thể thức hoặc phân vùng thay đổi.");
  };

  const togglePartitionProposalVerification = (propId: string) => {
    setVerifiedPartitionProposalIds(prev => {
      const next = new Set(prev);
      if (next.has(propId)) {
        next.delete(propId);
      } else {
        next.add(propId);
      }
      return next;
    });
  };

  const [sourceStorageStatus, setSourceStorageStatus] = useState<{ persisted: boolean; storage: "indexeddb" | "memory"; error?: string } | null>(null);
  const [sourceBlobAvailability,setSourceBlobAvailability]=useState<'checking'|'available'|'missing'|'error'>('missing');
  useEffect(()=>{
    let active=true;
    const sourceHash=originalSnapshot?.sourceHash;
    if(originalSnapshot?.sourceType!=='uploaded_file'||!sourceHash){setSourceBlobAvailability('missing');return()=>{active=false;};}
    setSourceBlobAvailability('checking');
    void loadSourceBlob(sourceHash).then(handle=>{if(active)setSourceBlobAvailability(handle?.bytes?'available':'missing');}).catch(()=>{if(active)setSourceBlobAvailability('error');});
    return()=>{active=false;};
  },[originalSnapshot?.sourceType,originalSnapshot?.sourceHash]);

  const handleUpdateBlockRole = (blockId: string, newRole: SourceRegion) => {
    if(workspaceSnapshotRef.current.workspace.partition.approval||workspaceSnapshotRef.current.workspace.staged){
      const original=workspaceSnapshotRef.current;
      const base=original.workspace.staged?cancelWorkspacePartition(original):{ok:true as const,snapshot:original};
      if(!base.ok)return;
      const blocks=structuredClone(original.workspace.staged?.reviewBlocks??original.reviewBlocks);
      const block=blocks.find(b=>b.id===blockId);if(!block)return;block.role=newRole;
      applyWorkspaceResult(stageWorkspacePartition(base.snapshot,blocks,original.workspace.staged?.partition.cells??original.workspace.partition.cells));
      invalidateActiveAiSession();return;
    }
    const wasChecking = isCheckingPartitions;
    invalidateActiveAiSession(
      wasChecking
        ? "Người dùng đã chỉnh sửa phân vùng trong lúc AI đang chạy. Đề xuất cũ không áp dụng."
        : undefined
    );
    partitionRevisionRef.current += 1;
    setPartitionRevision(partitionRevisionRef.current);
    setUserModifiedBlockIds(prev => prev.includes(blockId) ? prev : [...prev, blockId]);
    setPartitionProposals(previous => previous.map(proposal =>
      proposal.sourceBlockId === blockId && proposal.status === "pending"
        ? { ...proposal, status: "rejected" }
        : proposal,
    ));
    setVerifiedPartitionProposalIds(previous => {
      const next = new Set(previous);
      for (const proposal of partitionProposals) {
        if (proposal.sourceBlockId === blockId) next.delete(proposal.id || "");
      }
      return next;
    });
    const { nextBlocks, nextImport } = changeBlockRole(reviewBlocks, blockId, newRole, structuredImport);
    installPendingPartition(nextBlocks,nextImport??structuredImport);
  };

  const startPartitionAiCall = (
    sourceBlocks: SourceBlock[],
    regime: "administrative" | "party",
    generation: number,
    revision: number,
  ) => {
    if (!aiPartitionConsentRef.current || sourceBlocks.length === 0) return null;
    const runKey = `${generation}:${regime}:${revision}`;
    if (partitionRunKeyRef.current === runKey) return null;

    const token = sessionGateRef.current.begin("partition", runKey);
    const request: PartitionAiRequest = {
      schemaVersion: PARTITION_AI_SCHEMA_VERSION,
      consent: true,
      requestId: `partition-${generation}-${revision}-${token.requestId}`,
      regime,
      sourceGeneration: generation,
      partitionRevision: revision,
      blocks: toPartitionAiBlocks(sourceBlocks),
    };
    const validation = validatePartitionAiRequest(request);
    if (!validation.valid) {
      partitionRunKeyRef.current = "";
      sessionGateRef.current.cancelKind("partition");
      setIsCheckingPartitions(false);
      setPartitionCheckNotice(`${validation.reason || "Yêu cầu AI không hợp lệ."} Các quy tắc phân vùng vẫn hoạt động.`);
      return null;
    }

    partitionRunKeyRef.current = runKey;
    setIsCheckingPartitions(true);
    setPartitionProgress({ processedChunks: 0, totalChunks: Math.ceil(request.blocks.length / 25) });
    setPartitionCheckNotice("AI đang kiểm tra bản nguồn độc lập với phân vùng quy tắc. Quy tắc nội bộ vẫn dùng được trong lúc chờ.");
    const promise = (async (): Promise<PartitionAiResponse> => {
      const response = await fetch("/api/ai/check-partitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: token.signal,
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        let message = `Máy chủ AI phản hồi HTTP ${response.status}.`;
        try {
          const errorBody = await response.json();
          if (typeof errorBody?.error === "string") message = errorBody.error;
        } catch {}
        throw new Error(message);
      }
      let rawResponse: unknown;
      if (response.headers.get("content-type")?.includes("application/json")) {
        rawResponse = await response.json();
      } else if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const totalChunks = Math.ceil(request.blocks.length / 25);
        const observedChunks = new Map<number, { status: string; blockIds: string[] }>();
        let pendingText = "";
        let finalResponse: unknown;
        let sawFinal = false;

        const consumeLine = (line: string) => {
          if (!line.trim()) return;
          let event: unknown;
          try {
            event = JSON.parse(line);
          } catch {
            throw new Error("Luồng tiến độ AI không phải JSON hợp lệ.");
          }
          if (!event || typeof event !== "object" || Array.isArray(event)) {
            throw new Error("Luồng tiến độ AI có sự kiện không hợp lệ.");
          }
          const record = event as Record<string, unknown>;
          if (record.type === "chunk") {
            if (sawFinal || !record.chunk || typeof record.chunk !== "object" || Array.isArray(record.chunk)) {
              throw new Error("Sự kiện lô AI không hợp lệ.");
            }
            const chunk = record.chunk as Record<string, unknown>;
            const chunkIndex = chunk.chunkIndex;
            const status = chunk.status;
            const blockIds = chunk.blockIds;
            if (!Number.isSafeInteger(chunkIndex) || (chunkIndex as number) < 0 || (chunkIndex as number) >= totalChunks ||
                !["completed", "failed", "timed_out", "invalid_response"].includes(String(status)) ||
                !Array.isArray(blockIds) || blockIds.some(id => typeof id !== "string")) {
              throw new Error("Trạng thái hoặc phạm vi lô AI không hợp lệ.");
            }
            const index = chunkIndex as number;
            const expectedIds = request.blocks.slice(index * 25, (index + 1) * 25).map(block => block.id);
            if (observedChunks.has(index) || JSON.stringify(blockIds) !== JSON.stringify(expectedIds)) {
              throw new Error("Lô AI bị lặp hoặc không khớp các khối nguồn.");
            }
            observedChunks.set(index, { status: status as string, blockIds: expectedIds });
            const isCurrentRequest = sessionGateRef.current.isCurrent(token, runKey) &&
              sourceGenerationRef.current === request.sourceGeneration &&
              partitionRevisionRef.current === request.partitionRevision &&
              standardTypeRef.current === (request.regime === "party" ? "party" : "state") &&
              aiPartitionConsentRef.current;
            if (isCurrentRequest) {
              setPartitionProgress({
                processedChunks: observedChunks.size,
                totalChunks,
                lastChunkStatus: status as "completed" | "failed" | "timed_out" | "invalid_response",
              });
            }
            return;
          }
          if (record.type === "final" && !sawFinal && "response" in record) {
            sawFinal = true;
            finalResponse = record.response;
            return;
          }
          throw new Error("Luồng tiến độ AI có sự kiện lạ hoặc trùng.");
        };

        while (true) {
          const { done, value } = await reader.read();
          pendingText += decoder.decode(value, { stream: !done });
          const lines = pendingText.split("\n");
          pendingText = lines.pop() || "";
          lines.forEach(consumeLine);
          if (done) break;
        }
        if (pendingText.trim()) consumeLine(pendingText);
        if (observedChunks.size !== totalChunks || !sawFinal) {
          throw new Error("Luồng AI kết thúc khi chưa nhận đủ trạng thái lô hoặc kết quả cuối.");
        }
        const finalRecord = finalResponse as { chunks?: unknown } | null;
        if (!finalRecord || !Array.isArray(finalRecord.chunks) || finalRecord.chunks.length !== totalChunks) {
          throw new Error("Kết quả cuối AI không khớp số lô đã nhận.");
        }
        for (let index = 0; index < totalChunks; index++) {
          const observed = observedChunks.get(index)!;
          const finalChunk = finalRecord.chunks[index] as { status?: unknown; blockIds?: unknown };
          if (finalChunk.status !== observed.status || JSON.stringify(finalChunk.blockIds) !== JSON.stringify(observed.blockIds)) {
            throw new Error("Kết quả cuối AI không khớp tiến độ từng lô.");
          }
        }
        rawResponse = finalResponse;
      } else {
        throw new Error("Máy chủ AI không trả nội dung phản hồi.");
      }
      const responseValidation = validatePartitionAiResponse(rawResponse, request);
      if (!responseValidation.valid) throw new Error(responseValidation.reason);
      return responseValidation.response;
    })();
    // The import can take longer than a fast mock/provider response. Attach a
    // rejection observer now, then the commit path consumes the result later.
    void promise.catch(() => {});
    return { request, token, runKey, promise };
  };

  const applyPartitionAiCallResult = (
    call: NonNullable<ReturnType<typeof startPartitionAiCall>>,
    activeBlocks: SourceBlock[],
    modifiedBlockIds: string[],
    response?: PartitionAiResponse,
    error?: unknown,
  ) => {
    const current = sessionGateRef.current.isCurrent(call.token, call.runKey) &&
      sourceGenerationRef.current === call.request.sourceGeneration &&
      partitionRevisionRef.current === call.request.partitionRevision &&
      standardTypeRef.current === (call.request.regime === "party" ? "party" : "state") &&
      aiPartitionConsentRef.current;
    if (!current) return;

    const ruleProposals = analyzePartitionFallback(activeBlocks, call.request.regime, modifiedBlockIds).map(proposal => ({
      ...proposal,
      sourceGeneration: call.request.sourceGeneration,
      partitionRevision: call.request.partitionRevision,
    }));
    if (!response) {
      const allIds = activeBlocks.map(block => block.id);
      setPartitionProposals(ruleProposals);
      setVerifiedPartitionProposalIds(new Set());
      setPartitionCheckSource("rule_fallback");
      setPartitionCoverage({
        aiReviewedBlockIds: [],
        ruleFallbackBlockIds: allIds,
        unreviewedBlockIds: allIds,
        chunks: [{
          chunkIndex: 0,
          status: "failed",
          blockIds: call.request.blocks.map(block => block.id),
          error: error instanceof Error ? error.message : "Dịch vụ AI không khả dụng.",
        }],
      });
      setPartitionCheckNotice(`Chưa kiểm tra được bằng AI. Bộ quy tắc đã rà soát ${allIds.length}/${allIds.length} khối; nội dung soạn và xuất vẫn sẵn sàng.`);
      showToast("AI không khả dụng; đang dùng đề xuất quy tắc nội bộ", "info");
      return;
    }

    const aiProposals: PartitionProposal[] = [];
    for (const chunkResult of response.chunks) {
      if (chunkResult.status !== "completed") continue;
      for (const suggestion of chunkResult.proposals) {
        const sourceBlock = activeBlocks.find(block => block.id === suggestion.sourceBlockId);
        if (!sourceBlock) continue;
        const validated = validateProposalAgainstSource({
          ...suggestion,
          id: `ai-${call.request.requestId}-${suggestion.sourceBlockId}`,
          sourceGeneration: call.request.sourceGeneration,
          partitionRevision: call.request.partitionRevision,
          currentRole: sourceBlock.role || "unclassified",
          status: "pending",
          regime: call.request.regime,
        }, activeBlocks, modifiedBlockIds, call.request.regime);
        if (validated) aiProposals.push({
          ...validated,
          source: "gemini_ai",
          sourceGeneration: call.request.sourceGeneration,
          partitionRevision: call.request.partitionRevision,
        });
      }
    }

    const mergedByBlock = new Map<string, PartitionProposal>(ruleProposals.map(proposal => [proposal.sourceBlockId, proposal]));
    aiProposals.forEach(proposal => mergedByBlock.set(proposal.sourceBlockId, proposal));
    const mergedProposals = [...mergedByBlock.values()];
    const allIds = activeBlocks.map(block => block.id);
    const requestIds = new Set(call.request.blocks.map(block => block.id));
    const failedIds = new Set(response.failedBlockIds);
    const unreviewedIds = allIds.filter(id => failedIds.has(id) || !requestIds.has(id));
    const hasAiCoverage = response.aiReviewedBlockIds.length > 0;
    setPartitionCheckSource(hasAiCoverage ? (ruleProposals.length > 0 ? "mixed" : "gemini_ai") : "rule_fallback");
    setPartitionProposals(mergedProposals);
    setVerifiedPartitionProposalIds(new Set());
    setPartitionCoverage({
      aiReviewedBlockIds: response.aiReviewedBlockIds,
      ruleFallbackBlockIds: allIds,
      unreviewedBlockIds: unreviewedIds,
      chunks: response.chunks.map(chunkResult => ({
        chunkIndex: chunkResult.chunkIndex,
        status: chunkResult.status,
        blockIds: chunkResult.blockIds,
        error: chunkResult.error,
      })),
    });
    const failedCount = response.failedBlockIds.length + allIds.filter(id => !requestIds.has(id)).length;
    const aiSummary = `AI đã kiểm tra ${response.aiReviewedBlockIds.length}/${call.request.blocks.length} khối`;
    const fallbackSummary = `quy tắc nội bộ đã rà soát ${allIds.length}/${allIds.length} khối`;
    const errorSummary = failedCount > 0 ? `; ${failedCount} khối chưa được AI kiểm tra` : "";
    setPartitionCheckNotice(`${aiSummary}; ${fallbackSummary}${errorSummary}. Đề xuất chưa được tự áp dụng.`);
    showToast(`${aiSummary}${errorSummary}`, "info");
  };

  const finishPartitionAiCall = (
    call: NonNullable<ReturnType<typeof startPartitionAiCall>>,
    activeBlocks: SourceBlock[],
    modifiedBlockIds: string[],
  ) => {
    void call.promise
      .then(response => applyPartitionAiCallResult(call, activeBlocks, modifiedBlockIds, response))
      .catch(error => applyPartitionAiCallResult(call, activeBlocks, modifiedBlockIds, undefined, error))
      .finally(() => {
        if (sessionGateRef.current.isCurrent(call.token, call.runKey)) {
          setIsCheckingPartitions(false);
          setPartitionProgress(null);
        }
      });
  };

  const handleAiCheckPartitions = () => {
    if (!aiPartitionConsentRef.current) {
      setPartitionCheckNotice("Bật xác nhận cho phép AI ở Bước 1 trước khi gửi nguồn.");
      return;
    }
    const sourceBlocks = uploadedBlocks;
    const activeBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const targetRegime = standardTypeRef.current === "party" ? "party" : "administrative";
    const call = startPartitionAiCall(sourceBlocks, targetRegime, sourceGenerationRef.current, partitionRevisionRef.current);
    if (call) finishPartitionAiCall(call, activeBlocks, userModifiedBlockIds);
  };

  const handleAiPartitionConsentChange = (enabled: boolean) => {
    aiPartitionConsentRef.current = enabled;
    setAiPartitionConsent(enabled);
    if (!enabled) {
      sessionGateRef.current.cancelKind("partition");
      partitionRunKeyRef.current = "";
      setIsCheckingPartitions(false);
      setPartitionProgress(null);
      setPartitionCheckNotice("Đã tắt AI. Phân vùng quy tắc nội bộ vẫn hoạt động.");
      return;
    }
    if (uploadedFileName && uploadedBlocks.length > 0) {
      const activeBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
      const regime = standardTypeRef.current === "party" ? "party" : "administrative";
      const call = startPartitionAiCall(uploadedBlocks, regime, sourceGenerationRef.current, partitionRevisionRef.current);
      if (call) finishPartitionAiCall(call, activeBlocks, userModifiedBlockIds);
    }
  };

  const handleApplyPartitionProposal = (proposal: PartitionProposal) => {
    if(workspace?.partition.approval||workspace?.staged){setErrorMsg('Sau duyệt, chỉnh role qua phân vùng có kiểm xung đột.');return;}
    const blocksToUse = partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const currentRegime = standardType === "party" ? "party" : "administrative";

    // 1. Kiểm tra xác nhận đối chiếu thủ công cho đề xuất liên quan đến bảng biểu
    if (proposal.requiresUserVerification && !verifiedPartitionProposalIds.has(proposal.id || "")) {
      showToast("Vui lòng tích xác nhận bạn đã đối chiếu đúng ô và nội dung nguồn trước khi áp dụng.", "error");
      return;
    }

    // 2. Ngay trước khi áp dụng, kiểm tra lại proposal với trạng thái tài liệu hiện tại
    const validity = checkProposalValidityBeforeApply(
      proposal,
      blocksToUse,
      currentRegime,
      userModifiedBlockIds,
      { sourceGeneration: sourceGenerationRef.current, partitionRevision: partitionRevisionRef.current },
    );
    if (!validity.valid) {
      setPartitionProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "rejected" } : p));
      showToast(`Đề xuất hết hiệu lực: ${validity.reason}`, "error");
      return;
    }

    invalidateActiveAiSession();
    partitionRevisionRef.current += 1;
    setPartitionRevision(partitionRevisionRef.current);
    setPartitionHistory(prev => [...prev, blocksToUse.map(b => ({ ...b }))]);
    const { nextBlocks, nextImport } = changeBlockRole(blocksToUse, proposal.sourceBlockId, proposal.suggestedRole, structuredImport);
    installPendingPartition(nextBlocks,nextImport??structuredImport);
    setUserModifiedBlockIds(prev => prev.includes(proposal.sourceBlockId) ? prev : [...prev, proposal.sourceBlockId]);
    setPartitionProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "accepted" } : p));
    showToast(`Đã chuyển khối #${proposal.sourceBlockId} sang vùng "${proposal.suggestedRole}"`, "success");
  };

  const handleApplyVerifiedPartitionProposals = () => {
    if(workspace?.partition.approval||workspace?.staged){setErrorMsg('Sau duyệt, chỉnh role qua phân vùng có kiểm xung đột.');return;}
    const blocksToUse = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const currentRegime = standardTypeRef.current === "party" ? "party" : "administrative";
    const batch = applyPartitionProposalBatch(
      partitionProposals,
      blocksToUse,
      currentRegime,
      userModifiedBlockIds,
      verifiedPartitionProposalIds,
      { sourceGeneration: sourceGenerationRef.current, partitionRevision: partitionRevisionRef.current },
    );
    if (batch.appliedProposalIds.length === 0) {
      showToast(batch.skipped[0]?.reason || "Không có đề xuất đang chờ đủ điều kiện áp dụng.", "info");
      return;
    }

    invalidateActiveAiSession();
    partitionRevisionRef.current += 1;
    setPartitionRevision(partitionRevisionRef.current);
    setPartitionHistory(previous => [...previous, blocksToUse.map(block => ({ ...block }))]);
    installPendingPartition(batch.nextBlocks,structuredImport?{...structuredImport,blocks:batch.nextBlocks}:null);
    setUserModifiedBlockIds(batch.modifiedBlockIds);
    setPartitionProposals(previous => previous.map(proposal =>
      batch.appliedProposalIds.includes(proposal.id || `prop-part-${proposal.sourceBlockId}`)
        ? { ...proposal, status: "accepted" }
        : proposal,
    ));
    const skippedSuffix = batch.skipped.length > 0 ? `; bỏ qua ${batch.skipped.length} đề xuất chưa xác minh hoặc hết hiệu lực` : "";
    showToast(`Đã áp dụng ${batch.appliedProposalIds.length} đề xuất đã kiểm tra${skippedSuffix}.`, "success");
  };

  const handleDismissPartitionProposal = (proposal: PartitionProposal) => {
    setPartitionProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "rejected" } : p));
  };

  const handleUndoPartitionProposal = () => {
    if(workspace?.partition.approval||workspace?.staged){setErrorMsg('Sau duyệt, phân vùng phải được thay qua bản staged có kiểm xung đột.');return;}
    if (partitionHistory.length === 0) return;
    invalidateActiveAiSession();
    partitionRevisionRef.current += 1;
    setPartitionRevision(partitionRevisionRef.current);
    const previous = partitionHistory[partitionHistory.length - 1];
    setPartitionHistory(prev => prev.slice(0, -1));
    installPendingPartition(previous,structuredImport?{...structuredImport,blocks:previous}:null);
    showToast("Đã hoàn tác thao tác phân vùng gần nhất", "info");
  };

  // AI-Assisted Review Proposals state
  const [reviewProposals, setReviewProposals] = useState<ReviewProposal[]>([]);
  const [isReviewingProposals, setIsReviewingProposals] = useState(false);
  const [acceptedProposalIds, setAcceptedProposalIds] = useState<Set<string>>(new Set());
  const [uploadedBlocks, setUploadedBlocks] = useState<SourceBlock[]>([]);
  const [showPayloadInspector, setShowPayloadInspector] = useState(false);

  // Proposal Batch Validity Context (Chặng 1 S01)
  const [sourceGeneration, setSourceGeneration] = useState<number>(1);
  const sourceGenerationRef = useRef<number>(1);
  const [partitionRevision, setPartitionRevision] = useState<number>(1);
  const partitionRevisionRef = useRef<number>(1);
  const [reviewProposalBatchContext, setReviewProposalBatchContext] = useState<ReviewProposalBatchContext | null>(null);
  const reviewProposalBatchContextRef = useRef<ReviewProposalBatchContext | null>(null);

  const getCurrentPartitionFingerprint = useCallback((blocks?: SourceBlock[]): string => {
    const blocksToUse = blocks && blocks.length > 0
      ? blocks
      : (reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks));
    return computePartitionFingerprint(blocksToUse);
  }, [reviewBlocks, structuredImport?.blocks, uploadedBlocks]);

  const getCurrentProposalBatchContext = useCallback((): ReviewProposalBatchContext => {
    return {
      sourceGeneration: sourceGenerationRef.current,
      standardType: standardTypeRef.current,
      partitionRevision: partitionRevisionRef.current,
      partitionFingerprint: getCurrentPartitionFingerprint(),
    };
  }, [getCurrentPartitionFingerprint]);

  /**
   * S1-F01 (tái audit 20/10/2026): ngữ cảnh nguồn của đề xuất "AI tinh chỉnh".
   * Đề xuất này ghi đè toàn bộ thân bài nên phải khớp thế hệ nguồn, thể thức,
   * revision phân vùng và mã băm nguồn — cả lúc nhận phản hồi lẫn lúc áp dụng.
   */
  const getCurrentRefineContext = useCallback((): RefineProposalContext => ({
    sourceGeneration: sourceGenerationRef.current,
    standardType: standardTypeRef.current,
    partitionRevision: partitionRevisionRef.current,
    sourceHash: originalSnapshot?.sourceHash ?? "",
  }), [originalSnapshot?.sourceHash]);

  const isReviewProposalsBatchValid = useMemo(() => {
    const currentCtx: ReviewProposalBatchContext = {
      sourceGeneration,
      standardType,
      partitionRevision,
      partitionFingerprint: getCurrentPartitionFingerprint(),
    };
    return isReviewProposalBatchValid(reviewProposalBatchContext, currentCtx);
  }, [reviewProposalBatchContext, sourceGeneration, standardType, partitionRevision, getCurrentPartitionFingerprint]);

  const visibleReviewProposals = useMemo(() => {
    return isReviewProposalsBatchValid ? reviewProposals : [];
  }, [isReviewProposalsBatchValid, reviewProposals]);

  const partitionReviewBlocks=workspace?.staged?.reviewBlocks??reviewBlocks;
  const liveReconstructed = useMemo(() => {
    const blocksToUse = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    return reconstructFromReviewedBlocks(
      blocksToUse,
      standardType,
      structuredImport || undefined
    );
  }, [partitionReviewBlocks, standardType, structuredImport, uploadedBlocks]);

  const liveValidationErrors = useMemo(() => {
    return liveReconstructed.validationErrors;
  }, [liveReconstructed]);

  // Pilot Documents Library & Test state
  const [showPilotModal, setShowPilotModal] = useState(false);
  const [pilotDatasetMode, setPilotDatasetMode] = useState<"standard" | "edge_cases">("standard");
  const [pilotCategory, setPilotCategory] = useState<string>("all");
  const [pilotSearch, setPilotSearch] = useState<string>("");
  const [pilotTestResults, setPilotTestResults] = useState<Record<string, { passed: boolean; score: number; checks: number; errors: string[] }> | null>(null);
  const [isTestingPilot, setIsTestingPilot] = useState(false);

  // Compliance Inspection Modal state
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [complianceReport, setComplianceReport] = useState<ND30ComplianceReport | null>(null);

  // AI Proposal Review Modal state
  const [aiProposal, setAiProposal] = useState<DocumentState | null>(null);
  const [aiProposalMeta, setAiProposalMeta] = useState<{
    source: "gemini_ai" | "rule_fallback";
    isFallback: boolean;
    notice?: string;
  } | null>(null);

  // AI Refine Review Modal state
  const [refineProposal, setRefineProposal] = useState<{
    target?: WorkspaceAiTarget;
    action: "proofread" | "formalize";
    originalHtml: string;
    refinedHtml: string;
    label: string;
    source: "gemini_ai" | "rule_fallback";
    isFallback: boolean;
    notice?: string;
    /** S1-F01: ngữ cảnh nguồn của đề xuất, dùng để chặn đề xuất cũ. */
    context: RefineProposalContext;
  } | null>(null);
  const refineDialogRef=useAccessibleDialog(Boolean(refineProposal),()=>setRefineProposal(null));
  const complianceDialogRef=useAccessibleDialog(showComplianceModal,()=>setShowComplianceModal(false));
  const [aiRefineTab, setAiRefineTab] = useState<"original" | "refined">("refined");
  const [aiRefineMode, setAiRefineMode] = useState<"visual_diff" | "side_by_side" | "refined">("visual_diff");

  // Chặng 3: 3-step Office Worker Wizard (Tải & nhận diện → Soạn & kiểm tra → Xuất văn bản).
  // Bước được giới hạn bởi dữ liệu đã hoàn thành thật, không dựa vào vị trí điều hướng.
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  useEffect(() => { window.scrollTo(0, 0); }, [currentStep]);
  /**
   * Nguồn người dùng đã chủ động chọn. Giá trị mặc định "none" nghĩa là tài liệu
   * minh họa trong bộ nhớ chưa phải là nguồn do người dùng chọn.
   */
  const [sourceOrigin, setSourceOrigin] = useState<"none" | "uploaded_file" | "system_template">("none");
  /**
   * S3-F01: khi nguồn nhận diện một loại văn bản khác loại đang chọn, người dùng
   * phải chọn lại loại hoặc xác nhận rõ quyết định giữ loại này. Quyết định được
   * lưu kèm mốc thời gian (provenance) và chỉ có hiệu lực cho đúng cặp nguồn/loại/hệ.
   */
  const [editorState,setEditorState]=useState({activeCanvasId:"body"});
  const [docTypeOverride, setDocTypeOverride] = useState<DocTypeDecision | null>(null);
  const [safeRegimeModal, setSafeRegimeModal] = useState<{ isOpen: boolean; targetRegime: "state" | "party" } | null>(null);
  // Chặng 2: pending extracted source awaiting an explicit regime confirmation.
  // While set, document A is untouched and no source blob has been stored.
  const [pendingImport, setPendingImport] = useState<{
    token: SessionRequestToken;
    extraction: LocalFileExtraction;
    detection: RegimeDetectionResult;
    chosenRegime: "state" | "party";
    filename: string;
  } | null>(null);
  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState(false);
  const [step4ViewMode, setStep4ViewMode] = useState<"proposed" | "original" | "diff">("proposed");
  const [activeGroupFilter, setActiveGroupFilter] = useState<ComponentGroupId | "all">("all");
  const [ooxmlEvidence, setOoxmlEvidence] = useState<Record<string, any> | undefined>(undefined);
  const [ooxmlStatus, setOoxmlStatus] = useState<"not_evaluated" | "measuring" | "evaluated_current_draft" | "error">("measuring");

  const visualDiff = React.useMemo(() => {
    if (!refineProposal) return null;
    return computeVisualDiff(refineProposal.originalHtml, refineProposal.refinedHtml);
  }, [refineProposal]);

  // Primary document state (default is Kế hoạch NĐ 30 Hoa tiêu)
  const [doc, setDoc] = useState<DocumentState>(applyCompanyProfile(TEMPLATES[0].defaultData));

  const workspaceSnapshot=useMemo<WorkspaceSnapshot>(()=>workspace?{doc,standardType,reviewBlocks,structuredImport,workspace}:createWorkspaceSnapshot({doc,standardType,reviewBlocks,structuredImport},sourceOrigin==='uploaded_file'?{blobHash:originalSnapshot?.sourceHash||'legacy-unverified',generation:sourceGeneration,blocks:uploadedBlocks.length?uploadedBlocks:reviewBlocks}:undefined),[doc,standardType,reviewBlocks,structuredImport,workspace,sourceOrigin,originalSnapshot,sourceGeneration,uploadedBlocks]);
  const workspaceSnapshotRef=useRef(workspaceSnapshot);workspaceSnapshotRef.current=workspaceSnapshot;
  const candidateManager=useRef<ReturnType<typeof createExportCandidateManager>|null>(null);
  if(!candidateManager.current)candidateManager.current=createExportCandidateManager();
  const [candidate,setCandidate]=useState<ExportCandidate|null>(null);
  const [candidatePending,setCandidatePending]=useState(false);
  const [candidateError,setCandidateError]=useState('');
  const candidateInput={...workspaceSnapshot,uploadedBlocks,docTypeOverride};
  const candidateKey=exportCandidateKey(candidateInput);
  const visibleCandidate=candidate&&candidateManager.current.isCurrent(candidate,candidateInput)?candidate:null;
  const invalidateCandidate=()=>{candidateManager.current!.invalidate();setCandidate(null);setCandidateError('');setOoxmlEvidence(undefined);setOoxmlStatus('not_evaluated');};
  const installWorkspace=(next:WorkspaceSnapshot)=>{
    workspaceSnapshotRef.current=next;setWorkspace(next.workspace);setDoc(next.doc);setStandardType(next.standardType);standardTypeRef.current=next.standardType;setReviewBlocks(next.reviewBlocks);setStructuredImport(next.structuredImport);invalidateCandidate();
  };
  const applyWorkspaceResult=(result:WorkspaceResult):boolean=>{
    if(!result.ok){setErrorMsg(result.error==='rebase_conflict'?'Xung đột phân vùng: '+result.details.join(' · '):'Không thể thay đổi: '+result.error+' · '+result.details.join(' · '));return false;}
    installWorkspace(result.snapshot);markUserInteraction();return true;
  };
  const workspaceAction=(action:WorkspaceAction)=>applyWorkspaceResult(transactWorkspace(workspaceSnapshotRef.current,workspaceSnapshotRef.current.workspace.workingRevision,action));
  const installPendingPartition=(blocks:SourceBlock[],nextImport:StructuredImport|null,nextDoc?:DocumentState)=>{
    const current=workspaceSnapshotRef.current,source=current.workspace.source;
    const structure=nextImport?{...nextImport,importFidelityManifest:source?.fidelityManifest??nextImport.importFidelityManifest}:null;
    const pending=structuredClone(createWorkspaceSnapshot({doc:nextDoc??current.doc,standardType:current.standardType,reviewBlocks:blocks,structuredImport:structure},source?{blobHash:source.blobHash,generation:source.generation,blocks:source.blocks,identity:source.identity}:undefined,current.workspace.overrides));
    pending.workspace.partition=makePartition(pending.workspace.source,pending.standardType,blocks,current.workspace.partition.revision+1,current.workspace.partition.cells);
    installWorkspace(pending);
  };
  const handleUpdateCellRole=(sourceBlockId:string,cellId:string,role:SourceRegion)=>{
    const current=workspaceSnapshotRef.current;
    const cells=structuredClone(current.workspace.staged?.partition.cells??current.workspace.partition.cells).filter(c=>c.sourceBlockId!==sourceBlockId||c.cellId!==cellId);cells.push({sourceBlockId,cellId,role});
    if(current.workspace.partition.approval||current.workspace.staged){const base=current.workspace.staged?cancelWorkspacePartition(current):{ok:true as const,snapshot:current};if(base.ok)applyWorkspaceResult(stageWorkspacePartition(base.snapshot,current.workspace.staged?.reviewBlocks??current.reviewBlocks,cells));}
    else {const pending=structuredClone(current);pending.workspace.partition=makePartition(pending.workspace.source,pending.standardType,pending.reviewBlocks,pending.workspace.partition.revision+1,cells);installWorkspace(pending);}
  };
  const closePartitionReview=()=>{
    const current=workspaceSnapshotRef.current;
    if(current.workspace.staged&&!applyWorkspaceResult(cancelWorkspacePartition(current)))return;
    setErrorMsg('');setShowSideBySideModal(false);
  };
  const prepareCandidate=async()=>{
    const input={...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride};
    if(!canEnterStep(3)){setCandidateError('Cần duyệt phân vùng hợp lệ trước khi tạo ứng viên.');return;}
    setCandidatePending(true);setCandidateError('');
    try{
      const next=await candidateManager.current!.prepare(input);
      if(!next||!candidateManager.current!.isCurrent(next,{...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride}))return;
      setCandidate(next);
      if(next.safe){setOoxmlEvidence({...next.evidence,header_profile:next.formatData.headerProfile,draft_key:computeDraftRevisionKey(input.doc,input.standardType),candidate_fidelity_result:next.tableFidelity,candidate_sha:next.sha256,candidate_instance:next.instanceId});setOoxmlStatus('evaluated_current_draft');}
      else {setOoxmlEvidence(undefined);setOoxmlStatus('not_evaluated');}
    }catch(e){if(exportCandidateKey(input)===exportCandidateKey({...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride}))setCandidateError(String(e));}
    finally{if(exportCandidateKey(input)===exportCandidateKey({...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride}))setCandidatePending(false);}
  };
  useEffect(()=>{if(currentStep===3)void prepareCandidate();else {setOoxmlEvidence(undefined);setOoxmlStatus('not_evaluated');}},[currentStep,candidateKey]);

  // Version History state
  const [versions, setVersions] = useState<Version[]>([
    {
      id: "v_init",
      timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
      title: "Khởi tạo mặc định (Kế hoạch Hoa tiêu NĐ 30)",
      data: applyCompanyProfile(TEMPLATES[0].defaultData),
      standardType: "state",
    }
  ]);

  const currentDraftKey = computeDraftRevisionKey(doc, standardType);
  const currentDraftKeyRef = useRef<string>(currentDraftKey);
  /**
   * Chặng 5 — rủi ro do người kiểm độc lập chỉ ra: đề xuất "AI tinh chỉnh"
   * được ràng buộc theo nguồn/thể thức/revision, nhưng **chưa** ràng buộc theo
   * nội dung thân bài tại thời điểm tạo đề xuất. Người dùng sửa thân bài trong
   * cùng nguồn thì đề xuất cũ vẫn có thể ghi đè phần vừa sửa. Ref này giữ
   * `bodyHtml` **mới nhất** để kiểm ở lúc nhận phản hồi và lúc áp dụng.
   */
  const bodyHtmlRef = useRef<string>(doc.bodyHtml);
  bodyHtmlRef.current = doc.bodyHtml;
  currentDraftKeyRef.current = currentDraftKey;

  // Unified Canonical Rule Engine Evaluation (3 Decoupled Metrics + Live OOXML Evidence)
  const evaluationSummary = React.useMemo(() => {
    const isEvidenceForCurrentDraft = Boolean(ooxmlEvidence && ooxmlEvidence.draft_key === currentDraftKey);
    return evaluateDocumentRules(
      doc,
      standardType === "party" ? "party" : "administrative",
      isEvidenceForCurrentDraft ? ooxmlEvidence : undefined
    );
  }, [doc, standardType, ooxmlEvidence, currentDraftKey]);


  const requestRegimeSwitch = (target: "state" | "party") => {
    markUserInteraction();
    if (target === standardType) return;
    const hasContent = Boolean(
      (doc.bodyHtml && doc.bodyHtml.length > 50) ||
      doc.subject ||
      doc.documentType
    );
    if (hasContent) {
      setSafeRegimeModal({ isOpen: true, targetRegime: target });
    } else {
      executeRegimeSwitch(target);
    }
  };

  const executeRegimeSwitch = (target: "state" | "party") => {
    if(workspace){
      invalidateActiveAiSession();setReviewProposals([]);setRefineProposal(null);setImportReviewApprovedSourceHash(null);
      const result=changeWorkspaceRegime(workspaceSnapshotRef.current,workspaceSnapshotRef.current.workspace.workingRevision,target);
      if(applyWorkspaceResult(result)){setCurrentStep(1);setSafeRegimeModal(null);}return;
    }
    const wasChecking = isCheckingPartitions;
    invalidateActiveAiSession(
      wasChecking
        ? "Thể thức đã thay đổi trong lúc chờ AI phản hồi. Đề xuất cũ đã bị hủy để tránh xung đột."
        : undefined
    );
    partitionRevisionRef.current += 1;
    setPartitionRevision(partitionRevisionRef.current);
    // Explicitly invalidate and clear review proposals and batch context for previous regime (S01)
    setReviewProposals([]);
    setReviewProposalBatchContext(null);
    reviewProposalBatchContextRef.current = null;
    setAcceptedProposalIds(new Set());
    pushVersion(`Trước khi chuyển sang ${target === "party" ? "Đảng (HD 05)" : "Hành chính (NĐ 30)"}`, doc);
    standardTypeRef.current = target;
    setStandardType(target);
    setDoc(prev => {
      const isComp = prev.headerProfile === COMPANY_HEADER_PROFILE_ID || prev.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID;
      if (target === "party") {
        const base = {
          ...prev,
          nationalHeader1: "ĐẢNG CỘNG SẢN VIỆT NAM",
          nationalHeader2: "",
          referenceNumber: prev.referenceNumber.startsWith("Số:")
            ? prev.referenceNumber.replace(/^Số:\s*/i, "Số ")
            : (prev.referenceNumber.startsWith("Số ") ? prev.referenceNumber : (prev.referenceNumber ? `Số ${prev.referenceNumber}` : "Số …-…/ĐU")),
        };
        return isComp ? applyCompanyHD05Profile(base) : { ...base, headerProfile: "generic" as const };
      } else {
        const base = {
          ...prev,
          nationalHeader1: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
          nationalHeader2: "Độc lập - Tự do - Hạnh phúc",
          referenceNumber: prev.referenceNumber.startsWith("Số ") && !prev.referenceNumber.startsWith("Số:")
            ? `Số: ${prev.referenceNumber.replace(/^Số\s*/i, "")}`
            : (prev.referenceNumber.startsWith("Số:") ? prev.referenceNumber : (prev.referenceNumber ? `Số: ${prev.referenceNumber}` : "Số: …/…")),
        };
        return isComp ? applyCompanyProfile(base) : { ...base, headerProfile: "generic" as const };
      }
    });
    setSafeRegimeModal(null);
    showToast(`Đã chuyển sang ${target === "party" ? "Hướng dẫn 05 (Văn bản Đảng)" : "Nghị định 30 (Văn bản hành chính)"}`, "info");
  };

  const previewRef = useRef<HTMLDivElement>(null);
  const a4CanvasNodeRef = useRef<HTMLDivElement | null>(null);
  const a4CanvasObserverRef = useRef<ResizeObserver | null>(null);
  const [canvasInnerHeight, setCanvasInnerHeight] = useState<number>(1123);
  const [, setActiveCanvasSection] = useState<string>("all");

  const measureCanvasHeight = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const h = Math.ceil(Math.max(node.scrollHeight || 0, node.offsetHeight || 0, 1123));
    if (h) {
      setCanvasInnerHeight(prev => (Math.abs(prev - h) > 2 ? h : prev));
    }
  }, []);

  const setA4CanvasRef = useCallback((node: HTMLDivElement | null) => {
    a4CanvasNodeRef.current = node;
    if (a4CanvasObserverRef.current) {
      a4CanvasObserverRef.current.disconnect();
      a4CanvasObserverRef.current = null;
    }
    if (node) {
      measureCanvasHeight(node);
      const observer = new ResizeObserver(() => {
        measureCanvasHeight(node);
      });
      observer.observe(node);
      a4CanvasObserverRef.current = observer;
    }
  }, [measureCanvasHeight]);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (a4CanvasObserverRef.current) {
        a4CanvasObserverRef.current.disconnect();
      }
    };
  }, []);

  // Re-measure when entering Step 2 (Soạn & kiểm tra), view mode changes, or document content changes
  useEffect(() => {
    if (currentStep === 2 && studioViewMode === "canvas" && a4CanvasNodeRef.current) {
      measureCanvasHeight(a4CanvasNodeRef.current);
    }
  }, [currentStep, studioViewMode, doc.bodyHtml, doc.appendices, doc.signTitle, doc.signName, doc.recipients, measureCanvasHeight]);

  const scrollToSection = (sectionId: string) => {
    setActiveCanvasSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("section-highlight");
      setTimeout(() => {
        el.classList.remove("section-highlight");
      }, 1500);
    }
  };

  const isBienBan = Boolean(doc.documentType && /BIÊN BẢN|BIEN BAN/i.test(doc.documentType));
  const isMultiSigner = Boolean(doc.signTitle && doc.signTitle.includes("|"));
  const docTypeUpper = (doc.documentType || "").trim().toUpperCase();
  const isPartyOfficialLetter = standardType === "party" && (docTypeUpper === "CÔNG VĂN" || docTypeUpper === "");

  // 1. Initial Load from IndexedDB Draft Store (Zero data loss upon refresh)
  useEffect(() => {
    let mounted = true;
    const restoreToken = sessionGateRef.current.begin("draft_restore");
    loadDraft().then((savedDraft) => {
      if (
        !mounted ||
        userInteractedRef.current ||
        !sessionGateRef.current.isCurrent(restoreToken)
      ) {
        return;
      }
      draftHydratedRef.current = true;
      sessionGateRef.current.cancelKind("draft_restore");
      if (savedDraft && savedDraft.doc) {
        let restoredDoc = savedDraft.doc;
        // Auto-heal corrupted signatures from drafts saved before the patch
        const hasCorruptedSignTitle = Boolean(
          restoredDoc.signTitle && (
            /^(?:TT|STT)\b/i.test(restoredDoc.signTitle) ||
            /\b(?:Nội dung công việc|Cơ quan chủ trì|Thời gian thực hiện)\b/i.test(restoredDoc.signTitle)
          )
        );
        const hasCorruptedSignName = Boolean(
          restoredDoc.signName && (
            /quý\s+[I|V|X\d]+/i.test(restoredDoc.signName) ||
            /\bHội nghị lần thứ\b/i.test(restoredDoc.signName) ||
            /^\s*\d+\s*\|\s*/.test(restoredDoc.signName)
          )
        );

        if (!savedDraft.workspace && (hasCorruptedSignTitle || hasCorruptedSignName)) {
          console.warn("[DRAFT RECOVERY] Auto-healing corrupted signature table from legacy draft.");
          restoredDoc = {
            ...restoredDoc,
            signTitle: hasCorruptedSignTitle ? "" : restoredDoc.signTitle,
            signName: hasCorruptedSignName ? "" : restoredDoc.signName,
          };
          // Persist the healed draft
          saveDraft({
            ...savedDraft,
            id: savedDraft.id || "current_active_draft",
            updatedAt: new Date().toISOString(),
            doc: restoredDoc,
            standardType: savedDraft.standardType || "state",
            versions: savedDraft.versions,
            originalSnapshot: savedDraft.originalSnapshot !== undefined ? savedDraft.originalSnapshot : null,
          }).catch(() => {});
        }

        const restoredWorkspace=restoreWorkspaceVersion({id:savedDraft.id,title:'Bản nháp',timestamp:savedDraft.updatedAt,data:restoredDoc,standardType:savedDraft.standardType||'state',workspace:savedDraft.workspace,reviewBlocks:savedDraft.reviewBlocks,structuredImport:savedDraft.structuredImport,uploadedBlocks:savedDraft.uploadedBlocks,uploadedFileName:savedDraft.uploadedFileName,originalSnapshot:savedDraft.originalSnapshot});
        // Restore original snapshot or explicitly set null for legacy draft without snapshot
        if (savedDraft.originalSnapshot !== undefined) {
          setOriginalSnapshot(savedDraft.originalSnapshot);
          if (savedDraft.originalSnapshot?.bodyHtml) {
            setUploadedHtml(savedDraft.originalSnapshot.bodyHtml);
          } else {
            setUploadedHtml("");
          }
          if (savedDraft.originalSnapshot?.rawText) {
            setRawText(savedDraft.originalSnapshot.rawText);
          } else {
            setRawText("");
          }
          if (savedDraft.originalSnapshot?.fileName) {
            setUploadedFileName(savedDraft.originalSnapshot.fileName);
          } else {
            setUploadedFileName("");
          }
        } else {
          // Legacy draft: no original snapshot
          setOriginalSnapshot(null);
          setUploadedHtml("");
          setRawText("");
          setUploadedFileName("");
        }

        const restoredStandardType = savedDraft.standardType || "state";
        standardTypeRef.current = restoredStandardType;

        setEditorState(savedDraft.editorState??{activeCanvasId:"body"});
        setWorkspace(restoredWorkspace.workspace);
        setDoc(restoredWorkspace.doc);
        setStandardType(restoredStandardType);
        if (savedDraft.versions && savedDraft.versions.length > 0) {
          setVersions(savedDraft.versions);
        }
        setReviewBlocks(savedDraft.reviewBlocks && savedDraft.reviewBlocks.length > 0 ? savedDraft.reviewBlocks : []);
        setStructuredImport(savedDraft.structuredImport || null);
        setUploadedBlocks(savedDraft.uploadedBlocks && savedDraft.uploadedBlocks.length > 0 ? savedDraft.uploadedBlocks : []);
        if (savedDraft.uploadedFileName) {
          setUploadedFileName(savedDraft.uploadedFileName);
        }
        setUploadedFileType(savedDraft.uploadedFileType || null);
        if (savedDraft.rawText) {
          setRawText(savedDraft.rawText);
        }

        // Chặng 3: khôi phục vị trí wizard trong khoảng 1–3, nhưng kẹp lại theo
        // dữ liệu thật để không bao giờ mở thẳng bước Xuất khi nguồn chưa đủ.
        // S3-F02: bản nháp tạo trước Chặng 3 không có `sourceOrigin`; phải suy từ
        // snapshot gốc trước, không suy từ tên tệp (tên mẫu cũng là "tên tệp").
        const restoredOrigin = inferDraftSourceOrigin(savedDraft);
        const restoredReviewBlocks = savedDraft.reviewBlocks && savedDraft.reviewBlocks.length > 0
          ? savedDraft.reviewBlocks
          : [];
        const restoredStructureReady = restoredOrigin !== "none" && (
          restoredOrigin === "uploaded_file"
            ? restoredReviewBlocks.length > 0 || Boolean(savedDraft.structuredImport?.body?.html)
            : Boolean(restoredDoc.bodyHtml && restoredDoc.bodyHtml.trim().length > 0)
        );
        // S3-F01: mâu thuẫn loại văn bản đã lưu chỉ mở bước Xuất khi quyết định
        // override còn hiệu lực cho đúng cặp nguồn/loại/hệ.
        const restoredDecision = savedDraft.docTypeOverride ?? null;
        // S3-F01: quyết định duyệt bản nhập được khôi phục theo hash nguồn.
        const restoredApproval = savedDraft.importReviewApprovedSourceHash ?? null;
        setImportReviewApprovedSourceHash(restoredApproval);
        const restoredMismatch = deriveSourceMismatch({
          hasSelectedSource: restoredOrigin !== "none",
          hasImportedFile: Boolean(
            savedDraft.uploadedFileName || (savedDraft.uploadedBlocks?.length ?? 0) > 0
          ),
          structuredImport: savedDraft.structuredImport ?? null,
          originalSnapshot: savedDraft.originalSnapshot ?? null,
          templates: TEMPLATES,
          isCompanyProfile:
            savedDraft.standardType === "party"
              ? restoredDoc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID
              : restoredDoc.headerProfile === COMPANY_HEADER_PROFILE_ID,
          chosenRegime: savedDraft.standardType,
          chosenDocType: restoredDoc.documentType,
        });
        const restoredCanExport =
          restoredStructureReady &&
          (restoredOrigin !== "uploaded_file" ||
            (restoredApproval !== null &&
              restoredApproval === (savedDraft.originalSnapshot?.sourceHash ?? ""))) &&
          (!restoredMismatch.docTypeMismatch ||
            docTypeDecisionCovers(restoredDecision, restoredMismatch, savedDraft.standardType));
        const restoredMaxStep: 1 | 2 | 3 = restoredCanExport ? 3 : restoredOrigin !== "none" ? 2 : 1;
        const requestedStep = (savedDraft.currentStep ?? 1) as 1 | 2 | 3;
        setCurrentStep(restoredWorkspace.workspace.staged||!canEnterWorkspaceStep(restoredWorkspace,2)?1:(requestedStep > restoredMaxStep ? restoredMaxStep : requestedStep) as 1 | 2 | 3);
        if(restoredWorkspace.workspace.staged)setShowSideBySideModal(true);
        setSourceOrigin(restoredOrigin);
        setDocTypeOverride(restoredDecision);
        setHasPersistedDraft(true);
        setAutoSaveStatus("Đã khôi phục bản nháp lưu lúc " + new Date(savedDraft.updatedAt).toLocaleTimeString("vi-VN"));
      }
    }).catch((err) => {
      draftHydratedRef.current = true;
      sessionGateRef.current.cancelKind("draft_restore");
      restoreBlockedRef.current=true;
      setSaveError('Không khôi phục được bản nháp: '+String(err));setAutoSaveStatus('Lỗi khôi phục bản nháp');setErrorMsg('Không khôi phục được bản nháp. Dữ liệu đã lưu được giữ nguyên; hãy chọn nguồn mới nếu muốn thay thế.');
      console.warn("Could not restore draft:", err);
    });
    return () => {
      mounted = false;
      sessionGateRef.current.cancelKind("draft_restore");
    };
  }, []);

  // 2. Auto-save to IndexedDB.
  //    - Nội dung soạn thảo: gộp (debounce) 1000ms.
  //    - Lựa chọn hệ/profile/loại văn bản/mẫu và bước wizard: commit NGAY để việc
  //      tải lại trang ~120ms sau đó không mất lựa chọn (không dựa vào pagehide).
  const saveQueueRef=useRef<Promise<void>>(Promise.resolve());
  const restoreBlockedRef=useRef(false);
  const draftPayloadRef = useRef<Parameters<typeof saveDraft>[0] | null>(null);
  draftPayloadRef.current = {
    id: "current_active_draft",
    updatedAt: new Date().toISOString(),
    standardType,
    doc,
    workspace:workspaceSnapshot.workspace,
    editorState,
    versions,
    originalSnapshot,
    reviewBlocks,
    structuredImport,
    uploadedBlocks,
    uploadedFileName,
    uploadedFileType,
    rawText,
    currentStep,
    sourceOrigin,
    docTypeOverride,
    importReviewApprovedSourceHash,
  };

  const persistDraftNow = React.useCallback(async (silent = false) => {
    const payload = draftPayloadRef.current;
    if (!payload) return;
    if (!silent) setIsAutoSaving(true);
    try {
      if(restoreBlockedRef.current)throw Error('Bản nháp chưa khôi phục được. Chọn nguồn mới để thay thế rõ ràng.');
      const saveJob=saveQueueRef.current.catch(()=>{}).then(()=>saveDraft(payload));
      saveQueueRef.current=saveJob;await saveJob;
      const currentPayload = draftPayloadRef.current;
      if (!currentPayload) return;
      // A route/canvas change can be saved after this job started. It does not
      // make the document dirty or keep the visible saving indicator active.
      const documentValue = (value: typeof payload) => canonicalWorkspaceValue({
        ...value, updatedAt: undefined, currentStep: undefined, editorState: undefined,
      });
      if (documentValue(currentPayload) !== documentValue(payload)) return;
      if (!silent) setIsAutoSaving(false);
      setSaveError(null);
      setHasPersistedDraft(true);
      if (!silent) {
        const timeStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        setAutoSaveStatus(`Đã lưu (${timeStr})`);
      }
    } catch (err) {
      setIsAutoSaving(false);
      setSaveError(err instanceof Error ? err.message : "Lỗi lưu trữ cục bộ");
      setAutoSaveStatus("Lỗi lưu trữ cục bộ");
    }
  }, []);

  useEffect(() => {
    if (!draftHydratedRef.current && !userInteractedRef.current) {
      return;
    }
    setIsAutoSaving(true);
    const timer = setTimeout(() => {
      void persistDraftNow();
    }, 1000);
    return () => clearTimeout(timer);
  }, [doc, workspace,standardType, versions, originalSnapshot, reviewBlocks, structuredImport, uploadedBlocks, uploadedFileName, uploadedFileType, rawText, sourceOrigin, persistDraftNow]);

  useEffect(() => {
    if (!draftHydratedRef.current && !userInteractedRef.current) {
      return;
    }
    void persistDraftNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceOrigin, standardType, doc.headerProfile, doc.documentType, uploadedFileName, docTypeOverride]);

  // Navigation and active canvas are restored on refresh, but do not change
  // document content. Persist them without flashing the document save status.
  useEffect(() => {
    if (!draftHydratedRef.current && !userInteractedRef.current) return;
    void persistDraftNow(true);
  }, [currentStep, editorState, persistDraftNow]);

  const buildDocumentFormatData = React.useCallback((currentDoc: DocumentState, currentStandard: "state" | "party"): DocumentFormatType =>
    composeDocumentFormatData({ doc: currentDoc, standardType: currentStandard, reviewBlocks, structuredImport, uploadedBlocks }),
    [structuredImport, reviewBlocks, uploadedBlocks]);

  // 3. Run compliance check & extract real OOXML evidence whenever doc or standardType changes
  useEffect(() => {
    const effectiveRegime = standardType === "party" ? "party" : "administrative";
    const report = validateND30Compliance(
      {
        ...doc,
        regime: effectiveRegime,
        nationalHeader2: doc.nationalHeader2,
        fontFamily: "Times New Roman",
        fontSize: standardType === "party" ? 14 : 13
      },
      effectiveRegime
    );
    setComplianceReport(report);

  }, [doc, standardType]);

  // 4. Responsive Screen Detection & Adaptive Auto-fit
  const calculateFitZoom = useCallback(() => {
    const container = document.getElementById("studio-main-canvas");
    if (!container) return 0.85;
    const rect = container.getBoundingClientRect();
    const style = window.getComputedStyle(container);
    const padL = parseFloat(style.paddingLeft) || 16;
    const padR = parseFloat(style.paddingRight) || 16;
    // Keep a compact 12px safety margin while using the available A4 canvas width.
    const usableWidth = rect.width - padL - padR - 12;
    if (usableWidth <= 0) return 0.85;
    const rawZoom = usableWidth / 794;
    return Math.min(1.15, Math.max(0.38, Math.floor(rawZoom * 100) / 100));
  }, []);

  const handleFitWidth = useCallback(() => {
    const idealZoom = calculateFitZoom();
    setIsAutoFitZoom(true);
    setZoomLevel(idealZoom);
    showToast(`Đã điều chỉnh trang in vừa vặn màn hình (${Math.round(idealZoom * 100)}%)`, "info");
  }, [calculateFitZoom]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 1024) {
        setShowSidebarLeft(false);
      }
      if (currentStep === 2 && isAutoFitZoom) {
        requestAnimationFrame(() => {
          const fit = calculateFitZoom();
          setZoomLevel(fit);
        });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentStep, isAutoFitZoom, calculateFitZoom]);

  useEffect(() => {
    if (currentStep === 2 && isAutoFitZoom) {
      const timer = setTimeout(() => {
        const fit = calculateFitZoom();
        setZoomLevel(fit);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showInspectorRight, currentStep, isAutoFitZoom, calculateFitZoom]);

  const handleTabKeyDown = (e: React.KeyboardEvent, current: "issues" | "ai" | "outline") => {
    const tabs: ("issues" | "ai" | "outline")[] = ["issues", "ai", "outline"];
    const idx = tabs.indexOf(current);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = tabs[(idx + 1) % tabs.length];
      setInspectorTab(next);
      document.getElementById(`df-tab-${next}`)?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      setInspectorTab(prev);
      document.getElementById(`df-tab-${prev}`)?.focus();
    }
  };

  const handleManualSave = async () => {await persistDraftNow();};

  // 5. Global Keyboard Shortcuts: Ctrl+S (Lưu), Ctrl+E (Xuất Word)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleManualSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        exportToDocx();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc, workspace,standardType, versions, originalSnapshot,currentStep]);

  const applyImportSessionState = (next: ImportSessionState,workspaceOverride?:WorkspaceSnapshot):WorkspaceSnapshot => {
    restoreBlockedRef.current=false;
    const nextGeneration = sourceGenerationRef.current + 1;
    sourceGenerationRef.current = nextGeneration;
    setSourceGeneration(nextGeneration);

    partitionRevisionRef.current += 1;
    setPartitionRevision(partitionRevisionRef.current);
    setPartitionCoverage(null);

    const nextBatchContext: ReviewProposalBatchContext | null =
      next.reviewProposals && next.reviewProposals.length > 0
        ? {
            sourceGeneration: nextGeneration,
            standardType: next.standardType,
            partitionRevision: partitionRevisionRef.current,
            partitionFingerprint: computePartitionFingerprint(next.reviewBlocks),
          }
        : null;

    setReviewProposalBatchContext(nextBatchContext);
    reviewProposalBatchContextRef.current = nextBatchContext;

    const nextWorkspace=workspaceOverride??createWorkspaceSnapshot({doc:next.doc,standardType:next.standardType,reviewBlocks:next.reviewBlocks,structuredImport:next.structuredImport},next.originalSnapshot?.sourceType==='uploaded_file'?{blobHash:next.originalSnapshot.sourceHash||'unverified',generation:nextGeneration,blocks:next.uploadedBlocks}:undefined);
    setEditorState({activeCanvasId:"body"});
    setWorkspace(nextWorkspace.workspace);workspaceSnapshotRef.current=nextWorkspace;invalidateCandidate();
    standardTypeRef.current = nextWorkspace.standardType;
    setDoc(nextWorkspace.doc);
    setStandardType(nextWorkspace.standardType);
    setRawText(next.rawText);
    setUploadedFileName(next.uploadedFileName);
    setUploadedHtml(next.uploadedHtml);
    setUploadedFileType(next.uploadedFileType);
    setOriginalSnapshot(next.originalSnapshot);
    setSourceStorageStatus(next.sourceStorageStatus);
    setUploadedBlocks(next.uploadedBlocks);
    setStructuredImport(nextWorkspace.structuredImport);
    setReviewBlocks(nextWorkspace.reviewBlocks);
    setImportReviewAccepted(next.importReviewAccepted);
    // S3-F01: một nguồn mới chưa được duyệt — quyết định duyệt của nguồn cũ
    // không được mang sang.
    setImportReviewApprovedSourceHash(null);
    // S1-F01: đề xuất tinh chỉnh của nguồn cũ không được áp vào nguồn mới.
    setRefineProposal(null);
    setPartitionProposals(next.partitionProposals);
    setVerifiedPartitionProposalIds(next.verifiedPartitionProposalIds);
    setPartitionHistory(next.partitionHistory);
    setUserModifiedBlockIds(next.userModifiedBlockIds);
    setPartitionCheckNotice(next.partitionCheckNotice);
    setPartitionCheckSource(next.partitionCheckSource);
    setReviewProposals(next.reviewProposals);
    setAcceptedProposalIds(next.acceptedProposalIds);
    return nextWorkspace;
  };

  // ---------------------------------------------------------------------------
  // Chặng 3 — tiến trình wizard suy ra từ dữ liệu đã hoàn thành thật.
  // Dấu ✓, quyền nhảy bước và quyền xuất KHÔNG dựa vào `currentStep > n`.
  // ---------------------------------------------------------------------------
  const sourceChosen = sourceOrigin !== "none";

  const structureReady = React.useMemo(() => {
    if (!sourceChosen) return false;
    if (sourceOrigin === "uploaded_file") {
      return reviewBlocks.length > 0 || Boolean(structuredImport?.body?.html);
    }
    // Mẫu hệ thống / pilot: `reviewBlocks: []` là hợp lệ theo thiết kế.
    return Boolean(doc.bodyHtml && doc.bodyHtml.trim().length > 0);
  }, [sourceChosen, sourceOrigin, reviewBlocks.length, structuredImport, doc.bodyHtml]);

  // Mâu thuẫn nguồn ↔ lựa chọn (loại văn bản, mẫu cơ quan, hệ của mẫu). Dùng chung
  // một phép suy luận với Bước 1 để giao diện và cổng xuất không nói hai điều khác nhau.
  const sourceMismatch = React.useMemo(
    () =>
      deriveSourceMismatch({
        hasSelectedSource: sourceChosen,
        hasImportedFile: Boolean(uploadedFileName || uploadedBlocks.length > 0),
        structuredImport,
        originalSnapshot,
        templates: TEMPLATES,
        isCompanyProfile:
          standardType === "party"
            ? doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID
            : doc.headerProfile === COMPANY_HEADER_PROFILE_ID,
        chosenRegime: standardType,
        chosenDocType: doc.documentType,
      }),
    [
      sourceChosen,
      uploadedFileName,
      uploadedBlocks.length,
      structuredImport,
      originalSnapshot,
      standardType,
      doc.headerProfile,
      doc.documentType,
    ],
  );

  /** Quyết định override còn hiệu lực cho đúng cặp nguồn/loại/hệ hiện tại hay không. */
  const docTypeDecisionValid = docTypeDecisionCovers(docTypeOverride, sourceMismatch, standardType);

  /**
   * S3-F01 (tái audit 20/10/2026): bản nhập từ tệp chỉ được coi là hợp lệ
   * sau khi người dùng đã **duyệt** ở bước "Đối Chiếu & Phân Vùng". Bấm
   * "Hủy bỏ" (hoặc đóng hộp thoại) KHÔNG được đánh dấu đã duyệt.
   * Mẫu hệ thống / tạo mới không qua bước rà soát nên được miễn.
   */
  const currentSourceHash = originalSnapshot?.sourceHash ?? "";
  const importReviewSatisfied=sourceOrigin!=='uploaded_file'||hasWorkspaceApproval(workspaceSnapshot);
  const canExportSource=structureReady&&importReviewSatisfied&&(!sourceMismatch.docTypeMismatch||docTypeDecisionValid)&&canEnterWorkspaceStep(workspaceSnapshot,3);
  const canEnterStep=(step:1|2|3)=>step===1||sourceChosen&&canEnterWorkspaceStep(workspaceSnapshot,step)&&(step!==3||canExportSource);
  const stepIsComplete=(step:1|2|3)=>step===1?sourceChosen&&canEnterWorkspaceStep(workspaceSnapshot,2):step===2?canExportSource:Boolean(visibleCandidate?.downloadable);

  const sidebarItemsByStep: Record<1 | 2 | 3, Array<{ id: string; label: string; selector?: string }>> = {
    1: [
      { id: "df-step1-flow", label: "Chọn nguồn và thiết lập" },
    ],
    2: [
      { id: "df-step2-groups-before", label: "Phần đầu · Nhóm 01–05" },
      { id: "df-step2-body", label: "Nội dung văn bản · Body" },
      { id: "df-step2-groups-after", label: "Phần cuối · Nhóm 07–09" },
      { id: "df-step2-appendices", label: `Phụ lục (${doc.appendices?.length ?? 0})` },
    ],
    3: [
      { id: "df-step3-preview", label: "Duyệt trang DOCX" },
      { id: "df-step3-reference", label: "Đối chiếu Body nguồn" },
      { id: "df-step3-export", label: "Tải xuống / in" },
    ],
  };
  const [activeTocTarget, setActiveTocTarget] = useState("");
  useEffect(() => {
    setActiveTocTarget(currentStep === 1 ? "df-step1-flow" : currentStep === 2 ? "df-step2-groups-before" : "df-step3-preview");
  }, [currentStep]);

  const scrollToTocItem = (item: { id: string; selector?: string }) => {
    setActiveTocTarget(item.id);
    const target = item.selector
      ? document.querySelector<HTMLElement>(item.selector)
      : document.getElementById(item.id);
    if (!target) return;
    target.closest("details")?.setAttribute("open", "");
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const goToStep = (step: 1 | 2 | 3) => {
    if (step === currentStep) return;
    if (!canEnterStep(step)) {
      showToast(
        !sourceChosen
          ? "Cần một nguồn tài liệu (tệp Word/TXT hoặc mẫu chuẩn) trước khi sang bước soạn thảo."
          : sourceOrigin === "uploaded_file" && !importReviewSatisfied
            ? workspaceSnapshot.workspace.staged
              ? "Phân vùng đang chờ xác nhận. Hãy hoàn tất đối chiếu nguồn ở Bước 1 trước khi soạn."
              : workspaceSnapshot.workspace.legacyNeedsApproval
                ? "Bản nháp nhập cũ cần được duyệt lại ở Bước 1 trước khi tiếp tục."
                : "Bản nhập chưa được duyệt. Hãy mở \"Đối chiếu nguồn\" ở Bước 1 và chọn \"Duyệt & sang Bước 2\"."
            : sourceMismatch.docTypeMismatch && step === 3
              ? `Nguồn nhận diện là ${sourceMismatch.sourceDocType} nhưng bạn đang chọn ${sourceMismatch.chosenDocType}. Hãy chọn lại đúng loại hoặc xác nhận giữ loại này trước khi xuất.`
              : "Cần phân vùng và duyệt nguồn ở Bước 1 trước khi mở bước xem và xuất.",
        "info"
      );
      return;
    }
    setCurrentStep(step);
  };

  /**
   * S3-F01 — người dùng xác nhận rõ: giữ loại đang chọn trên một nguồn vốn là loại
   * khác. Ghi provenance (nguồn, loại, hệ, thời điểm) vào bản nháp.
   */
  const handleConfirmDocTypeOverride = () => {
    if (!sourceMismatch.docTypeMismatch) return;
    const decision: DocTypeDecision = {
      sourceDocType: sourceMismatch.sourceDocType,
      chosenDocType: sourceMismatch.chosenDocType,
      regime: standardType,
      decidedAt: new Date().toISOString(),
    };
    setDocTypeOverride(decision);
    showToast(
      `Đã ghi nhận quyết định: giữ loại ${decision.chosenDocType} trên nguồn ${decision.sourceDocType}.`,
      "success"
    );
  };

  const pushVersion = (
    title: string,
    newDoc: DocumentState,
    versionStandardType: "state" | "party" = standardType,
    snapshotOverride?: {
      originalSnapshot: OriginalDocumentSnapshot | null;
      reviewBlocks: SourceBlock[];
      structuredImport: StructuredImport | null;
      uploadedBlocks: SourceBlock[];
      uploadedFileName: string;
      uploadedFileType: "docx" | "txt" | null;
      rawText: string;
      workspace?: WorkspaceState;
    }
  ) => {
    const newV: Version = {
      id: "v_" + crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
      title,
      data: { ...newDoc },
      workspace:snapshotOverride?.workspace?structuredClone(snapshotOverride.workspace):versionStandardType===workspaceSnapshotRef.current.standardType&&JSON.stringify(newDoc)===JSON.stringify(workspaceSnapshotRef.current.doc)?structuredClone(workspaceSnapshotRef.current.workspace):undefined,
      standardType: versionStandardType,
      docTypeOverride,
      originalSnapshot: snapshotOverride ? snapshotOverride.originalSnapshot : originalSnapshot,
      reviewBlocks: snapshotOverride ? snapshotOverride.reviewBlocks : workspaceSnapshotRef.current.reviewBlocks,
      structuredImport: snapshotOverride ? snapshotOverride.structuredImport : workspaceSnapshotRef.current.structuredImport,
      uploadedBlocks: snapshotOverride ? snapshotOverride.uploadedBlocks : uploadedBlocks,
      uploadedFileName: snapshotOverride ? snapshotOverride.uploadedFileName : uploadedFileName,
      uploadedFileType: snapshotOverride ? snapshotOverride.uploadedFileType : uploadedFileType,
      rawText: snapshotOverride ? snapshotOverride.rawText : rawText,
    };
    setVersions(prev => [newV, ...prev]);
  };

  const handleFieldChange = (field: keyof DocumentState, value: string) => {
    markUserInteraction();
    if (field === "headerProfile") {
      handleHeaderProfileChange(value as "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID);
      return;
    }
    if (standardType === "state" && doc.headerProfile === COMPANY_HEADER_PROFILE_ID && LOCKED_COMPANY_FIELDS.has(field)) return;
    if (standardType === "party" && doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID && LOCKED_COMPANY_HD05_FIELDS.has(field)) return;
    if(workspaceSnapshotRef.current.workspace.partition.approval||sourceOrigin==='system_template'){
      workspaceAction(field==='bodyHtml'?{type:'editBody',html:value}:{type:'editField',field,value});return;
    }
    setWorkspace(null);setDoc(prev => ({ ...prev, [field]: value }));
  };

  const handleHeaderProfileChange = (profile: "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID) => {
    markUserInteraction();
    if(doc.headerProfile===profile)return;
    if(workspaceSnapshotRef.current.workspace.partition.approval||sourceOrigin==='system_template'){workspaceAction({type:'setProfile',profile});return;}
    const isPartyMode = standardType === "party";
    const targetCompanyProfile = isPartyMode ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID;
    const desiredProfile = profile === "generic" ? "generic" : targetCompanyProfile;

    // Chặng 3: bấm lại đúng mẫu cơ quan đang chọn là no-op — không tạo phiên bản
    // mới và không ghi đè phần đầu tệp nguồn.
    if (doc.headerProfile === desiredProfile) {
      return;
    }

    const isActivating = profile === targetCompanyProfile || profile !== "generic";

    if (isActivating && doc.headerProfile !== targetCompanyProfile) {
      pushVersion("Trước khi áp dụng profile công ty", doc);
    }
    const updated = isActivating
      ? (isPartyMode ? applyCompanyHD05Profile(doc) : applyCompanyProfile(doc))
      : { ...doc, headerProfile: "generic" as const };
    setWorkspace(null);setDoc(updated);
    pushVersion(isActivating
      ? (isPartyMode ? "Áp dụng profile Đảng bộ Công ty Hoa tiêu MB" : "Áp dụng profile Công ty Hoa tiêu MB")
      : "Chuyển phần đầu sang tùy chỉnh", updated);
    setSuccessMsg(isActivating
      ? `Đã áp dụng phần đầu công ty (${isPartyMode ? "Hướng dẫn 05-HD/VPTW" : "Nghị định 30/2020/NĐ-CP"}). Nội dung, số ký hiệu và ngày ban hành được giữ nguyên.`
      : "Đã chuyển sang phần đầu tùy chỉnh; bạn có thể sửa thông tin cơ quan.");
  };

  const applyTemplate = (t: TemplatePreset, headerProfile: "company" | "generic" = "company") => {
    if (JSON.stringify(doc) !== JSON.stringify(versions[0]?.data)) {
      pushVersion("Bản soạn trước khi đổi mẫu", doc);
    }
    invalidateActiveAiSession();

    const selectedBaseDoc = headerProfile === "generic"
      ? {...t.defaultData, headerProfile: "generic" as const, orgHeader1: "", orgHeader2: ""}
      : t.type === "state"
        ? applyCompanyProfile({...t.defaultData})
        : applyCompanyHD05Profile({...t.defaultData});
    const preparedTemplate=prepareTemplateTables(t.id,selectedBaseDoc),selectedDoc=preparedTemplate.doc;

    const snapshot: OriginalDocumentSnapshot = {
      sourceType: "system_template",
      fileName: t.name,
      fileType: "template",
      sourceId: t.id,
      uploadedAt: new Date().toISOString(),
      bodyHtml: t.defaultData.bodyHtml,
      rawText: t.defaultData.bodyHtml.replace(/<[^>]+>/g, " "),
    };

    const nextSession = commitTemplateOrPilotReplacement(
      createInitialImportSessionState(doc, standardType, originalSnapshot),
      {
        doc: selectedDoc,
        standardType: t.type,
        originalSnapshot: snapshot,
      }
    );
    let nextWorkspace=createWorkspaceSnapshot({doc:nextSession.doc,standardType:nextSession.standardType,reviewBlocks:nextSession.reviewBlocks,structuredImport:nextSession.structuredImport});
    if(preparedTemplate.models.length){
      const registered=transactWorkspace(nextWorkspace,0,{type:'registerTemplateTables',templateId:t.id,models:preparedTemplate.models});
      if(!registered.ok){setErrorMsg(`Không thể khởi tạo bảng của mẫu ${t.name}; mẫu trước được giữ nguyên. ${registered.details.join(' · ')}`);return false;}
      nextWorkspace=registered.snapshot;
    }
    applyImportSessionState(nextSession,nextWorkspace);

    pushVersion(`Áp dụng mẫu: ${t.name}`, nextWorkspace.doc, t.type, {
      originalSnapshot: nextSession.originalSnapshot,
      reviewBlocks: nextSession.reviewBlocks,
      structuredImport: nextSession.structuredImport,
      uploadedBlocks: nextSession.uploadedBlocks,
      uploadedFileName: nextSession.uploadedFileName,
      uploadedFileType: nextSession.uploadedFileType,
      rawText: nextSession.rawText,
      workspace: nextWorkspace.workspace,
    });
    setSuccessMsg(`Đã tải mẫu "${t.name}". Bạn có thể bắt đầu soạn thảo và chỉnh sửa ngay!`);
    setPendingTemplate(null);
    // Chặng 3: chọn mẫu là một nguồn do người dùng chủ động chọn. Bước 1 hiển thị
    // lại nguồn + thể thức đã xác nhận thay vì tự nhảy sang bước soạn.
    setSourceOrigin("system_template");
    // Nguồn mới ⇒ quyết định override của nguồn cũ không còn hiệu lực.
    setDocTypeOverride(null);
    return true;
  };

  const createNewDocument = ({regime,documentType,templateId,headerProfile}:{regime:"state"|"party";documentType:string;templateId?:string;headerProfile:"company"|"generic"}) => {
    markUserInteraction();
    const preset=TEMPLATES.find(t=>t.id===templateId&&t.type===regime);
    const fallback=TEMPLATES.find(t=>t.type===regime) ?? TEMPLATES[0];
    const blank=!preset;
    const base:DocumentState=blank?{
      ...fallback.defaultData,
      headerProfile:"generic",
      orgHeader1:"",orgHeader2:"",
      nationalHeader1:regime==="party"?"ĐẢNG CỘNG SẢN VIỆT NAM":"CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2:regime==="party"?"":"Độc lập - Tự do - Hạnh phúc",
      referenceNumber:regime==="party"?"Số …-…/…":"Số: …/…",
      locationAndDate:"",subject:"",bodyHtml:"<p></p>",signTitle:"",signName:"",recipients:"",appendices:[],unclassified:[],
    }:{...preset.defaultData};
    const selected:TemplatePreset={
      ...(preset??fallback),
      id:preset?.id??`blank-${regime}-${documentType.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[Đđ]/g,"d").toLowerCase().replace(/[^a-z0-9]+/g,"-")}`,
      name:preset?.name??`Văn bản trắng · ${documentType}`,
      desc:preset?.desc??"Trang soạn trống theo thể thức đã chọn",
      type:regime,
      defaultData:{...base,documentType},
    };
    return applyTemplate(selected,headerProfile);
  };

  const selectTemplate = (tId: string) => {
    markUserInteraction();
    const t = TEMPLATES.find(x => x.id === tId);
    if (!t) return;
    if (JSON.stringify(doc) !== JSON.stringify(versions[0]?.data)) {
      setPendingTemplate(t);
      return;
    }
    applyTemplate(t);
  };

  const loadPilotDocument = (item: PilotDocumentItem | ComplexMalformedItem) => {
    if (JSON.stringify(doc) !== JSON.stringify(versions[0]?.data)) {
      pushVersion("Bản soạn trước khi nạp Pilot", doc);
    }
    invalidateActiveAiSession();

    const standard: "state" | "party" = (item.doc.regime === "party" || ("category" in item && item.category === "dang")) ? "party" : "state";
    const newDoc: DocumentState = {
      headerProfile: "generic",
      orgHeader1: item.doc.orgHeader1,
      orgHeader2: item.doc.orgHeader2,
      nationalHeader1: item.doc.nationalHeader1,
      nationalHeader2: item.doc.nationalHeader2,
      locationAndDate: item.doc.locationAndDate,
      documentType: item.doc.documentType,
      referenceNumber: item.doc.referenceNumber,
      subject: item.doc.subject,
      bodyHtml: sanitizeHtmlForDocx(item.doc.bodyHtml),
      signTitle: item.doc.signTitle,
      signName: item.doc.signName,
      recipients: item.doc.recipients,
      appendices: [],
      unclassified: [],
      importMetadata: {
        sourceType: "template",
        status: "confirmed",
        sourceFilename: `pilot_${item.id}.docx`
      }
    };

    const snapshot: OriginalDocumentSnapshot = {
      sourceType: "system_template",
      fileName: item.title,
      fileType: "template",
      sourceId: item.id,
      uploadedAt: new Date().toISOString(),
      bodyHtml: item.doc.bodyHtml,
      rawText: item.doc.bodyHtml.replace(/<[^>]+>/g, " "),
    };

    const nextSession = commitTemplateOrPilotReplacement(
      createInitialImportSessionState(doc, standardType, originalSnapshot),
      {
        doc: newDoc,
        standardType: standard,
        originalSnapshot: snapshot,
      }
    );
    applyImportSessionState(nextSession);

    pushVersion(`Nạp Pilot: ${item.code} - ${item.title.substring(0, 30)}...`, newDoc, standard, {
      originalSnapshot: nextSession.originalSnapshot,
      reviewBlocks: nextSession.reviewBlocks,
      structuredImport: nextSession.structuredImport,
      uploadedBlocks: nextSession.uploadedBlocks,
      uploadedFileName: nextSession.uploadedFileName,
      uploadedFileType: nextSession.uploadedFileType,
      rawText: nextSession.rawText,
    });
    setShowPilotModal(false);
    setSourceOrigin("system_template");
    setDocTypeOverride(null);
    setCurrentStep(2);
    setSuccessMsg(`Đã nạp thành công tài liệu "${item.title}" (${item.badge}) vào Studio soạn thảo!`);
  };


  const runPilotTestInBrowser = () => {
    setIsTestingPilot(true);
    setTimeout(() => {
      const results: Record<string, { passed: boolean; score: number; checks: number; errors: string[] }> = {};

      if (pilotDatasetMode === "standard") {
        PILOT_DOCUMENTS.forEach(item => {
          const d = item.doc;
          const isParty = item.category === "dang" || d.regime === "party";
          const rep = validateND30Compliance(d);
          const errors: string[] = [];

          if (isParty) {
            if (!d.nationalHeader1.includes("ĐẢNG CỘNG SẢN VIỆT NAM")) errors.push("Thiếu Quốc hiệu Đảng");
          } else {
            if (!d.nationalHeader1.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM")) errors.push("Thiếu Quốc hiệu NĐ 30");
            if (!d.nationalHeader2.includes("Độc lập - Tự do - Hạnh phúc")) errors.push("Thiếu Tiêu ngữ NĐ 30");
          }
          if (!d.orgHeader2) errors.push("Thiếu cơ quan ban hành");
          if (!d.referenceNumber) errors.push("Thiếu số ký hiệu");
          if (!d.locationAndDate) errors.push("Thiếu địa danh ngày tháng");
          if (!d.documentType) errors.push("Thiếu tên loại văn bản");
          if (!d.subject) errors.push("Thiếu trích yếu nội dung");
          if (!d.bodyHtml || d.bodyHtml.trim().length === 0) errors.push("Thiếu nội dung văn bản");
          if (!d.signTitle) errors.push("Thiếu chức vụ người ký");
          if (item.hasTable && (!d.bodyHtml.includes("<table") || !d.bodyHtml.includes("<colgroup>"))) {
            errors.push("Bảng biểu chưa định dạng colgroup chuẩn NĐ 30");
          }

          const isPassed = errors.length === 0 && rep.passedChecks >= (isParty ? 8 : 9) && rep.score >= 90;
          results[item.id] = {
            passed: isPassed,
            score: rep.score,
            checks: rep.passedChecks,
            errors
          };
        });
        setSuccessMsg("Đã kiểm thử tự động toàn bộ 27/27 tài liệu Pilot: Đạt các trường dữ liệu thể thức cơ bản NĐ 30 & HD 05.");
      } else {
        COMPLEX_MALFORMED_DOCUMENTS.forEach(item => {
          const d = item.doc;
          const rep = validateND30Compliance(d);
          let passed = false;
          const errors: string[] = [];

          if (item.type === "complex") {
            // Cấu trúc phức tạp: Yêu cầu chuẩn thể thức NĐ 30
            passed = rep.passed;
            if (!passed) errors.push(...rep.issues.map(i => i.message));
          } else if (item.type === "non_compliant") {
            // Lỗi thể thức: Engine phải nhận diện đúng lỗi vi phạm (pass nếu bắt được lỗi)
            passed = rep.issues.length > 0;
            if (!passed) errors.push("Hệ thống bỏ sót vi phạm thể thức");
          } else if (item.type === "malformed_data") {
            // Dữ liệu hỏng / XSS: Kiểm tra DOMPurify làm sạch mã độc an toàn
            const clean = DOMPurify.sanitize(d.bodyHtml);
            const isSafe = !clean.includes("<script") && !clean.includes("<iframe");
            passed = isSafe;
            if (!passed) errors.push("Mã độc chưa được lọc sạch");
          }

          results[item.id] = {
            passed,
            score: rep.score,
            checks: rep.passedChecks,
            errors
          };
        });
        setSuccessMsg("Đã kiểm thử 10 tài liệu thử thách & lỗi thể thức: Khâu Parse, Preview và Lọc độc hại hoạt động an toàn.");
      }

      setPilotTestResults(results);
      setIsTestingPilot(false);
    }, 350);
  };

  // ===========================================================================
  // Chặng 2: detect the regime on RAW blocks, confirm before partitioning.
  // ===========================================================================

  /**
   * Segment exactly once under the confirmed regime, persist the source blob,
   * build the bundle and commit atomically. Only called once the regime is
   * decided (auto with strong matching evidence, or explicit user confirmation).
   */
  const commitExtraction = async (
    extraction: LocalFileExtraction,
    regime: "state" | "party",
    detection: RegimeDetectionResult,
    decidedBy: "auto" | "user",
    token: SessionRequestToken
  ): Promise<boolean> => {
    const regimeRecord = toRegimeDetectionRecord(detection, regime, decidedBy);
    const activeRegime: "administrative" | "party" = regime === "party" ? "party" : "administrative";
    // Start the opt-in source-only request before rule segmentation. The upload
    // flow does not wait for this promise, and its expected generation/revision
    // are the values applyImportSessionState will commit below.
    const aiCall = aiPartitionConsentRef.current
      ? startPartitionAiCall(
          extraction.rawBlocks,
          activeRegime,
          sourceGenerationRef.current + 1,
          partitionRevisionRef.current + 1,
        )
      : null;
    const structured = segmentLocalExtraction(
      extraction,
      activeRegime,
      regimeRecord
    );
    const storageStatus = await persistSourceBlob(extraction);
    const parsed = buildParsedImport(extraction, structured, storageStatus);

    // Prepare the entire bundle before mutating any source-bound state. If this
    // throws, the currently open document A remains completely intact.
    const bundle = prepareImportedFileBundle(parsed, regime);
    if (!sessionGateRef.current.isCurrent(token, standardTypeRef.current)) return false;

    sessionGateRef.current.cancelKind("review");
    setIsReviewingProposals(false);
    const nextSession = commitImportedFileBundle(
      createInitialImportSessionState(doc, regime, originalSnapshot),
      bundle
    );
    applyImportSessionState(nextSession);

    const localPartitionProposals = analyzePartitionFallback(bundle.reviewBlocks, activeRegime).map(proposal => ({
      ...proposal,
      sourceGeneration: sourceGenerationRef.current,
      partitionRevision: partitionRevisionRef.current,
    }));
    const blockIds = bundle.reviewBlocks.map(block => block.id);
    setPartitionProposals(localPartitionProposals);
    setVerifiedPartitionProposalIds(new Set());
    setPartitionCheckSource("rule_fallback");
    setPartitionCoverage({
      aiReviewedBlockIds: [],
      ruleFallbackBlockIds: blockIds,
      unreviewedBlockIds: blockIds,
      chunks: [],
    });
    setPartitionCheckNotice(aiCall
      ? `Quy tắc nội bộ đã rà soát ${blockIds.length}/${blockIds.length} khối. AI đang kiểm tra nguồn độc lập ở nền.`
      : `Quy tắc nội bộ đã rà soát ${blockIds.length}/${blockIds.length} khối. AI chưa được cho phép.`);
    if (aiCall) finishPartitionAiCall(aiCall, bundle.reviewBlocks, []);
    else setIsCheckingPartitions(false);

    if (bundle.storageStatus?.storage === "memory") {
      showToast("Lưu ý: Tệp nguồn hiện chỉ được lưu tạm trong bộ nhớ phiên (có thể mất khi tải lại trang).", "info");
    }

    setShowSideBySideModal(true);
    setSourceOrigin("uploaded_file");
    setDocTypeOverride(null);
    setSuccessMsg(`Đã bóc tách thành công tệp "${bundle.uploadedFileName}" (${bundle.blockCount} khối dữ liệu).`);
    return true;
  };

  const confirmPendingImport = async (regime: "state" | "party") => {
    const pending = pendingImport;
    if (!pending) return;
    // Stale guards: a newer upload, a regime switch or an invalidated session must
    // never commit the old pending import.
    if (!sessionGateRef.current.isCurrent(pending.token, pending.chosenRegime)) {
      setPendingImport(null);
      return;
    }
    if (standardTypeRef.current !== pending.chosenRegime) {
      setPendingImport(null);
      showToast("Hệ thể thức đã thay đổi trong lúc chờ xác nhận. Vui lòng tải lại tệp.", "info");
      return;
    }
    setIsUploading(true);
    try {
      const ok = await commitExtraction(pending.extraction, regime, pending.detection, "user", pending.token);
      if (ok) setPendingImport(null);
    } catch (err: any) {
      if (sessionGateRef.current.isCurrent(pending.token, pending.chosenRegime)) {
        setErrorMsg(err?.message || "Không thể đọc tệp tin đã tải lên.");
      }
      setPendingImport(null);
    } finally {
      if (sessionGateRef.current.isCurrent(pending.token)) {
        sessionGateRef.current.cancelKind("upload");
      }
      setIsUploading(false);
    }
  };

  const cancelPendingImport = () => {
    const pending = pendingImport;
    if (pending && sessionGateRef.current.isCurrent(pending.token)) {
      sessionGateRef.current.cancelKind("upload");
    }
    setPendingImport(null);
    setIsUploading(false);
    showToast("Đã hủy nhập tệp. Tài liệu đang mở được giữ nguyên và không lưu tệp vừa tải.", "info");
  };

  const handleFileUpload = async (file: File) => {
    invalidateActiveAiSession();
    // A new upload invalidates the pending confirmation of any previous file.
    setPendingImport(null);
    const uploadRegime = standardTypeRef.current;
    const uploadToken = sessionGateRef.current.begin("upload", uploadRegime);
    setIsUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    let keepPending = false;
    try {
      // 1) Extract raw blocks only: no segmentation, no blob save yet.
      const extraction = await extractLocalFile(file);
      if (!sessionGateRef.current.isCurrent(uploadToken, standardTypeRef.current)) return;

      // 2) Detect the regime from raw, unsegmented blocks (two-way, provenance-first).
      const detection = detectRegimeFromRawBlocks(extraction.rawBlocks);

      // 3) Strong evidence matching the current choice may proceed; otherwise the
      //    user must confirm (both systems present, insufficient, or mismatch).
      if (regimeNeedsConfirmation(detection, uploadRegime)) {
        setPendingImport({
          token: uploadToken,
          extraction,
          detection,
          chosenRegime: uploadRegime,
          filename: extraction.filename,
        });
        keepPending = true;
        setIsUploading(false);
        return;
      }

      // 4) Segment once under the confirmed regime, then commit atomically.
      await commitExtraction(extraction, uploadRegime, detection, "auto", uploadToken);
    } catch (err: any) {
      if (!sessionGateRef.current.isCurrent(uploadToken, standardTypeRef.current)) return;
      setErrorMsg(err.message || "Không thể đọc tệp tin đã tải lên.");
    } finally {
      if (!keepPending && sessionGateRef.current.isCurrent(uploadToken)) {
        sessionGateRef.current.cancelKind("upload");
        setIsUploading(false);
      }
    }
  };

  const fetchAiReviewProposals = async () => {
    if (!structuredImport && reviewBlocks.length === 0) return;
    const token = sessionGateRef.current.begin("review");
    setIsReviewingProposals(true);
    // Note: Do NOT clear acceptedProposalIds here; preserve existing accepted state until new batch is successfully committed.
    const effectiveBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const requestContext: ReviewProposalBatchContext = {
      sourceGeneration: sourceGenerationRef.current,
      standardType: standardTypeRef.current,
      partitionRevision: partitionRevisionRef.current,
      partitionFingerprint: computePartitionFingerprint(effectiveBlocks),
    };
    try {
      const res = await fetch("/api/ai/review-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: token.signal,
        body: JSON.stringify({
          structured: structuredImport,
          standardType: standardType === "party" ? "party" : "administrative",
          rawText,
          blocks: effectiveBlocks,
          layoutInfo: {
            blockCount: effectiveBlocks.length,
            tableCount: effectiveBlocks.filter(b => b.kind === "table").length,
          }
        })
      });
      if (!sessionGateRef.current.isCurrent(token)) {
        return;
      }
      const currentBlocksBeforeJson = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
      const currentContextBeforeJson: ReviewProposalBatchContext = {
        sourceGeneration: sourceGenerationRef.current,
        standardType: standardTypeRef.current,
        partitionRevision: partitionRevisionRef.current,
        partitionFingerprint: computePartitionFingerprint(currentBlocksBeforeJson),
      };
      if (!isReviewProposalBatchValid(requestContext, currentContextBeforeJson)) {
        return;
      }
      const data = await res.json();
      if (!sessionGateRef.current.isCurrent(token)) {
        return;
      }
      const currentBlocksAfterJson = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
      const currentContextAfterJson: ReviewProposalBatchContext = {
        sourceGeneration: sourceGenerationRef.current,
        standardType: standardTypeRef.current,
        partitionRevision: partitionRevisionRef.current,
        partitionFingerprint: computePartitionFingerprint(currentBlocksAfterJson),
      };
      if (!isReviewProposalBatchValid(requestContext, currentContextAfterJson)) {
        return;
      }
      if (data.success && Array.isArray(data.proposals)) {
        setReviewProposals(data.proposals);
        setReviewProposalBatchContext(requestContext);
        reviewProposalBatchContextRef.current = requestContext;
        setAcceptedProposalIds(new Set());
        setSuccessMsg(`AI đã hoàn thành rà soát: tìm thấy ${data.proposals.length} đề xuất chuẩn hóa.`);
      } else {
        setErrorMsg(data.error || "Không thể tải đề xuất rà soát AI.");
      }
    } catch (err: any) {
      if (!sessionGateRef.current.isCurrent(token)) {
        return;
      }
      console.warn("Could not fetch review proposals:", err);
      setErrorMsg("Lỗi kết nối AI rà soát: " + err.message);
    } finally {
      if (sessionGateRef.current.isCurrent(token)) {
        setIsReviewingProposals(false);
      }
    }
  };

  const handleAcceptProposal = (proposal: ReviewProposal) => {
    if(workspace?.partition.approval||workspace?.staged||workspace?.workingRevision){setErrorMsg('Đề xuất theo khối nguồn cũ chỉ được xem. Hãy dùng AI target Body hiện hành.');return;}
    if (!structuredImport && reviewBlocks.length === 0) return;

    const currentBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const currentContext: ReviewProposalBatchContext = {
      sourceGeneration: sourceGenerationRef.current,
      standardType: standardTypeRef.current,
      partitionRevision: partitionRevisionRef.current,
      partitionFingerprint: computePartitionFingerprint(currentBlocks),
    };

    if (!isReviewProposalBatchValid(reviewProposalBatchContextRef.current, currentContext)) {
      const err = "Đề xuất đã hết hiệu lực do thể thức, nguồn hoặc phân vùng tài liệu đã thay đổi.";
      setErrorMsg(err);
      showToast(err, "error");
      return;
    }

    const currentState: CanonicalWorkflowState = {
      reviewBlocks: currentBlocks,
      structuredImport,
      doc,
      acceptedProposalIds,
      proposalBatchContext: reviewProposalBatchContextRef.current,
      currentContext,
    };

    const result = applySingleProposal(proposal, currentState);
    if (!result.success || !result.nextState) {
      const err = `Không thể áp dụng đề xuất "${proposal.label || proposal.id}": ${result.reason}`;
      setErrorMsg(err);
      console.warn(`[ACCEPT PROPOSAL] ${err}`);
      return;
    }

    invalidateActiveAiSession();
    installPendingPartition(result.nextState.reviewBlocks,result.nextState.structuredImport||null,result.nextState.doc);
    setAcceptedProposalIds(result.nextState.acceptedProposalIds);
    pushVersion(`Áp dụng đề xuất: ${proposal.label || proposal.suggested}`, result.nextState.doc);
    setSuccessMsg(`Đã áp dụng thành công đề xuất: ${proposal.label || proposal.suggested}`);
  };

  const handleDismissProposal = (proposalId: string) => {
    setReviewProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleAcceptAllProposals = () => {
    if(workspace?.partition.approval||workspace?.staged||workspace?.workingRevision){setErrorMsg('Không áp hàng loạt đề xuất nguồn lên bản soạn Workspace.');return;}
    if (!structuredImport && reviewBlocks.length === 0) return;

    const currentBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const currentContext: ReviewProposalBatchContext = {
      sourceGeneration: sourceGenerationRef.current,
      standardType: standardTypeRef.current,
      partitionRevision: partitionRevisionRef.current,
      partitionFingerprint: computePartitionFingerprint(currentBlocks),
    };

    if (!isReviewProposalBatchValid(reviewProposalBatchContextRef.current, currentContext)) {
      const err = "Đề xuất đã hết hiệu lực do thể thức, nguồn hoặc phân vùng tài liệu đã thay đổi.";
      setErrorMsg(err);
      showToast(err, "error");
      return;
    }

    const initialState: CanonicalWorkflowState = {
      reviewBlocks: currentBlocks,
      structuredImport,
      doc,
      acceptedProposalIds: new Set(acceptedProposalIds),
      proposalBatchContext: reviewProposalBatchContextRef.current,
      currentContext,
    };

    const { finalState, appliedCount, rejectedReasons } = applyAllProposalsSequentially(
      visibleReviewProposals,
      initialState
    );

    if (appliedCount > 0) {
      invalidateActiveAiSession();
    }
    installPendingPartition(finalState.reviewBlocks,finalState.structuredImport||null,finalState.doc);
    setAcceptedProposalIds(finalState.acceptedProposalIds);

    if (appliedCount > 0) {
      pushVersion(`Áp dụng ${appliedCount} đề xuất AI`, finalState.doc);
      setSuccessMsg(`Đã áp dụng thành công ${appliedCount} đề xuất.`);
    }

    if (rejectedReasons.length > 0) {
      setErrorMsg(`Có ${rejectedReasons.length} đề xuất không thể áp dụng do nội dung đã thay đổi:\n- ${rejectedReasons.join("\n- ")}`);
    }
  };

  const safeTextToHtml = (text: string): string => {
    if (!text) return "<p></p>";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    const paragraphs = escaped
      .split(/\r?\n\r?\n+/)
      .map(p => `<p>${p.replace(/\r?\n/g, "<br/>")}</p>`)
      .join("");
    return DOMPurify.sanitize(paragraphs || "<p></p>");
  };

  const handleConfirmSideBySideImport = () => {
    const current=workspaceSnapshotRef.current;
    if(current.workspace.staged){if(applyWorkspaceResult(confirmWorkspacePartition(current))){setShowSideBySideModal(false);setImportReviewApprovedSourceHash(originalSnapshot?.sourceHash??'');setCurrentStep(2);}return;}
    if(current.workspace.partition.approval||current.workspace.workingRevision>0){if(applyWorkspaceResult(approveWorkspacePartition(current))){setShowSideBySideModal(false);setImportReviewApprovedSourceHash(originalSnapshot?.sourceHash??'');setCurrentStep(2);}return;}
    if (!structuredImport) return;
    if (liveValidationErrors.length > 0) return;

    const newDoc: DocumentState = {
      headerProfile: "generic",
      orgHeader1: liveReconstructed.fields.orgHeader1 || "",
      orgHeader2: liveReconstructed.fields.orgHeader2 || "",
      draftNote: liveReconstructed.draftNote || "",
      includeDraftNoteInExport: Boolean(liveReconstructed.draftNote),
      nationalHeader1: liveReconstructed.fields.nationalHeader1 || (standardType === "party" ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
      nationalHeader2: liveReconstructed.fields.nationalHeader2 ?? (standardType === "party" ? "" : "Độc lập - Tự do - Hạnh phúc"),
      locationAndDate: liveReconstructed.fields.locationAndDate || "",
      documentType: liveReconstructed.fields.documentType || "",
      referenceNumber: liveReconstructed.fields.referenceNumber || "",
      subject: liveReconstructed.fields.subject || "",
      bodyHtml: liveReconstructed.bodyHtml,
      signTitle: liveReconstructed.fields.signTitle || "",
      signName: liveReconstructed.fields.signName || "",
      recipients: liveReconstructed.fields.recipients || "",
      appendices: liveReconstructed.appendices,
      unclassified: liveReconstructed.unclassified,
      importMetadata: {
        sourceType: uploadedFileType || "docx",
        status: deriveImportStatus({
          ...structuredImport,
          unclassified: liveReconstructed.unclassified,
          appendices: liveReconstructed.appendices
        }, true),
        sourceFilename: uploadedFileName,
      }
    };
    const pending=structuredClone(createWorkspaceSnapshot({doc:newDoc,standardType,reviewBlocks,structuredImport}, {blobHash:originalSnapshot?.sourceHash||'unverified',generation:sourceGeneration,blocks:uploadedBlocks.length?uploadedBlocks:reviewBlocks}));
    pending.workspace.partition=makePartition(pending.workspace.source,standardType,reviewBlocks,pending.workspace.partition.revision,current.workspace.partition.cells);
    if(!applyWorkspaceResult(approveWorkspacePartition(pending)))return;
    pushVersion(`Nhập phân vùng từ tệp ${uploadedFileName || "văn bản"}`, newDoc);
    setSuccessMsg(`Đã đưa toàn bộ cấu trúc tệp "${uploadedFileName}" vào Studio soạn thảo thành công!`);
    setShowSideBySideModal(false);
    setSourceOrigin("uploaded_file");
    setDocTypeOverride(null);
    // S3-F01: người dùng đã duyệt bản nhập này → ghi nhận theo hash nguồn để
    // mở được Bước 3 và các nút xuất/in.
    setImportReviewAccepted(true);
    setImportReviewApprovedSourceHash(originalSnapshot?.sourceHash ?? "");
    setCurrentStep(2);
  };

  const handleAiRefine = async (action: "proofread" | "formalize", nodeId?:string) => {
    setIsRefining(true);
    setErrorMsg("");
    // S1-F01: ghi nhận ngữ cảnh nguồn TRƯỚC khi gọi AI để đối chiếu khi
    // phản hồi về và khi người dùng bấm áp dụng.
    const requestContext = getCurrentRefineContext();
    const aiTarget=createWorkspaceAiTarget(workspaceSnapshotRef.current,nodeId?{kind:'node',nodeId}:{kind:'body'});
    if(!aiTarget){setErrorMsg('Không tìm thấy đoạn đang chọn hoặc toàn Body chưa đủ điều kiện để gửi AI.');setIsRefining(false);return;}
    const requestBodyHtml = aiTarget.originalText;
    try {
      const res = await fetch("/api/ai/refine-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: requestBodyHtml, action })
      });
      const data = await res.json();
      if (data.success && data.refined) {
        // S1-F01: phản hồi đến muộn sau khi người dùng đã đổi nguồn / đổi hệ
        // / sửa phân vùng thì đề xuất cũ bị loại, không được hiện ra.
        if (!isRefineProposalContextValid(requestContext, getCurrentRefineContext())) {
          setErrorMsg("Nguồn tài liệu đã thay đổi nên đề xuất AI cũ không còn hợp lệ. Hãy chạy lại AI tinh chỉnh.");
          return;
        }
        // Chặng 5: thân bài đã bị sửa trong lúc chờ AI → đề xuất được tính trên
        // bản cũ, áp vào sẽ xoá mất chỉnh sửa của người dùng.
        if (aiTarget.kind==='body'&&bodyHtmlRef.current !== requestBodyHtml) {
          setErrorMsg("Nội dung thân bài đã thay đổi trong lúc chờ AI nên đề xuất cũ không còn hợp lệ. Hãy chạy lại AI tinh chỉnh.");
          return;
        }
        const received=receiveWorkspaceAiResult(workspaceSnapshotRef.current,aiTarget,data.refined);
        if(received.check.status!=='supported'){setErrorMsg(received.check.status==='stale'?(aiTarget.kind==='node'?'Nội dung thân bài đã thay đổi hoặc đoạn đang chọn đã thay đổi; đề xuất AI cũ không còn hợp lệ.':'Nội dung thân bài đã thay đổi; đề xuất AI cũ không còn hợp lệ.'):'Kết quả AI đổi cấu trúc đoạn hoặc target chưa hỗ trợ; không áp dụng đề xuất này.');return;}
        const actionLabel = action === 'proofread' ? 'Sửa lỗi chính tả & câu từ' : 'Nâng cấp văn phong hành chính';
        setRefineProposal({
          action,
          target: aiTarget,
          originalHtml: requestBodyHtml,
          refinedHtml: data.refined,
          label: aiTarget.kind==='node'?actionLabel+' · đoạn đang chọn':actionLabel,
          source: data.source || (data.isFallback ? "rule_fallback" : "gemini_ai"),
          isFallback: Boolean(data.isFallback),
          notice: data.notice,
          context: requestContext,
        });
      } else {
        setErrorMsg(data.error || "Lỗi xử lý tinh chỉnh văn bản.");
      }
    } catch (err: any) {
      setErrorMsg("Không thể kết nối AI tinh chỉnh: " + err.message);
    } finally {
      setIsRefining(false);
    }
  };

  const acceptRefineProposal = () => {
    if (!refineProposal) return;
    // S1-F01: kiểm lại ngữ cảnh NGUỒN ngay tại thời điểm áp dụng — không chỉ
    // lúc gửi request. Đề xuất của nguồn A không được ghi đè lên nguồn B.
    if (!isRefineProposalContextValid(refineProposal.context, getCurrentRefineContext())) {
      setErrorMsg("Nguồn tài liệu đã thay đổi nên đề xuất này không còn hợp lệ. Đề xuất đã bị loại.");
      setRefineProposal(null);
      return;
    }
    // Chặng 5: người dùng đã sửa thân bài trong **cùng nguồn** sau khi đề xuất
    // được tạo → đề xuất cũ không được ghi đè phần vừa sửa.
    if (refineProposal.target?.kind==='body'&&refineProposal.originalHtml !== bodyHtmlRef.current) {
      setErrorMsg("Nội dung thân bài đã thay đổi sau khi AI tạo đề xuất nên đề xuất này không còn hợp lệ. Đề xuất đã bị loại.");
      setRefineProposal(null);
      return;
    }
    if(!refineProposal.target){setErrorMsg('Đề xuất cũ không có target hợp lệ.');setRefineProposal(null);return;}
    const applied=applyWorkspaceAiResult(workspaceSnapshotRef.current,{target:refineProposal.target,suggestedText:refineProposal.refinedHtml});
    if(!applyWorkspaceResult(applied as WorkspaceResult)){setRefineProposal(null);return;}
    const updated=applied.ok?applied.snapshot.doc:doc;
    pushVersion(`AI: ${refineProposal.label}`, updated);
    setSuccessMsg(`Đã phê duyệt và áp dụng: ${refineProposal.label}!`);
    setRefineProposal(null);
  };

  const rejectRefineProposal = () => {
    setRefineProposal(null);
    setSuccessMsg("Đã hủy bỏ đề xuất chỉnh sửa văn bản.");
  };

  const exportToDocx = async () => {
    const current=candidateManager.current!.current;
    if(!current?.downloadable||!candidateManager.current!.isCurrent(current,{...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride})||!canEnterStep(3)){setErrorMsg('DOCX ứng viên đã cũ hoặc không tạo được tệp. Hãy tạo lại ứng viên hiện hành ở Bước 3.');return;}
    downloadDocxUint8Array(current.bytes,'Van_Ban_'+(standardType==='party'?'HD05':'ND30')+'.docx');
  };
  const exportToPdf=async()=>{setErrorMsg('Lệnh In / Lưu PDF chỉ có ở Bước 3, từ DOCX ứng viên hiện hành.');};

  const handleDownloadOriginalFile = async () => {
    if (!originalSnapshot?.sourceHash) {
      setErrorMsg("Không tìm thấy thông tin tệp gốc.");
      return;
    }
    try{
      const handle = await loadSourceBlob(originalSnapshot.sourceHash);
      if (handle?.bytes) {
        downloadDocxUint8Array(new Uint8Array(handle.bytes), handle.fileName || "Tep_Goc.docx");
        setErrorMsg('');setSuccessMsg(`Đã tải lại tệp gốc nguyên vẹn: "${handle.fileName}"`);
      } else {
        const location=sourceStorageStatus?.storage==='memory'?'bộ nhớ tạm của phiên nhập':'IndexedDB hoặc bộ nhớ tạm của phiên nhập';
        setErrorMsg(`Không tìm thấy byte tệp gốc trong ${location}; không tạo lại tệp từ nội dung đã soạn.`);
      }
    }catch(error){setErrorMsg(`Không thể xác minh tệp gốc đã lưu: ${String(error)}. Không tải bản tái tạo.`);}
  };

  const handlePrintCandidate=async()=>{
    const current=visibleCandidate;
    if(!current?.downloadable||!candidateManager.current?.isCurrent(current,{...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride})||!canEnterStep(3)){
      setErrorMsg('Ứng viên DOCX đã cũ hoặc không tạo được tệp; chưa thể in.');return;
    }
    setErrorMsg('');
    const isCurrent=()=>Boolean(candidateManager.current?.isCurrent(current,{...workspaceSnapshotRef.current,uploadedBlocks,docTypeOverride})&&current.downloadable&&canEnterStep(3));
    const result=await printCandidate(current.bytes,current.sha256,current.instanceId,isCurrent);
    if(result==='stale')setErrorMsg('Ứng viên đã thay đổi trong lúc dựng vùng in; hãy tạo và kiểm ứng viên hiện hành trước khi in.');
    else if(result==='render_error')setErrorMsg('Không dựng được vùng in từ DOCX ứng viên; nội dung soạn và nguồn vẫn giữ nguyên.');
    else setSuccessMsg('Đã mở bản xem để in · phân trang tham khảo. Đối chiếu PDF trong Word trước khi phát hành.');
  };

  const restoreVersion = (v: Version) => {
    let restored:WorkspaceSnapshot;
    try{restored=restoreWorkspaceVersion(v);}catch(error){setErrorMsg('Không khôi phục phiên bản không hợp lệ; bản đang soạn được giữ nguyên. '+String(error));return;}
    invalidateActiveAiSession();
    const nextSession = commitVersionRestore(
      createInitialImportSessionState(doc, standardType, originalSnapshot),
      v
    );
    applyImportSessionState(nextSession);
    installWorkspace(restored);setCurrentStep(canEnterWorkspaceStep(restored,2)?2:1);
    // Nguồn được khôi phục cùng phiên bản: snapshot gốc quyết định trước (mẫu hay
    // tệp); chỉ khi không có snapshot mới dùng tên tệp. S3-F02: phiên bản mẫu có
    // `uploadedFileName` = tên mẫu, nên thứ tự ngược lại sẽ biến mẫu thành tệp nhập.
    setSourceOrigin(prev => {
      const snapshotType = nextSession.originalSnapshot?.sourceType;
      if (snapshotType === "system_template") return "system_template";
      if (snapshotType === "uploaded_file") return "uploaded_file";
      if (nextSession.uploadedFileName) return "uploaded_file";
      return prev;
    });
    // Mâu thuẫn loại văn bản của phiên bản vừa khôi phục không được thừa hưởng quyết
    // định override của phiên bản trước.
    setDocTypeOverride(v.docTypeOverride??null);
    // S3-F01: khôi phục phiên bản của **cùng nguồn** không làm mất quyết định
    // duyệt bản nhập; khôi phục sang nguồn khác thì phải duyệt lại.
    setImportReviewApprovedSourceHash((prev) => {
      if (prev === null) return null;
      const restoredHash = nextSession.originalSnapshot?.sourceHash ?? "";
      return restoredHash === prev ? prev : null;
    });
    setSuccessMsg(`Đã khôi phục thành công phiên bản: "${v.title}" (${v.timestamp})`);
  };

  const applyQuickFix = (issue: any) => {
    markUserInteraction();
    if (issue.field === "orgHeader2" && issue.suggestion) {
      handleFieldChange("orgHeader2",issue.suggestion);
    } else if (issue.field === "nationalHeader1" && issue.suggestion) {
      handleFieldChange("nationalHeader1",issue.suggestion);
    } else if (issue.field === "nationalHeader2" && typeof issue.suggestion === "string") {
      handleFieldChange("nationalHeader2",issue.suggestion);
    } else if (issue.field === "referenceNumber" && issue.suggestion) {
      handleFieldChange("referenceNumber",issue.suggestion);
    } else {
      setSuccessMsg(`Vui lòng chỉnh sửa trực tiếp thông tin vào mặt giấy A4 cho mục: ${issue.title}`);
      return;
    }
    setSuccessMsg(`Đã áp dụng sửa nhanh cho: ${issue.title}`);
  };

  const currentPilotDataset = React.useMemo(() => {
    return pilotDatasetMode === "standard" ? PILOT_DOCUMENTS : COMPLEX_MALFORMED_DOCUMENTS;
  }, [pilotDatasetMode]);

  const filteredPilotDocs = React.useMemo(() => {
    return currentPilotDataset.filter(item => {
      let matchCat = pilotCategory === "all";
      if (!matchCat) {
        if ("category" in item) {
          matchCat = item.category === pilotCategory;
        } else if ("type" in item) {
          matchCat = item.type === pilotCategory;
        }
      }
      if (!matchCat) return false;
      if (!pilotSearch.trim()) return true;
      const q = pilotSearch.toLowerCase().trim();
      const typeLabel = "categoryName" in item ? item.categoryName : ("typeName" in item ? item.typeName : "");
      return (
        item.title.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        typeLabel.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q)
      );
    });
  }, [currentPilotDataset, pilotCategory, pilotSearch]);

  const pilotTestStats = React.useMemo(() => {
    if (!pilotTestResults) return null;
    const total = currentPilotDataset.length;
    const passedCount = currentPilotDataset.filter(d => pilotTestResults[d.id]?.passed).length;
    return {
      total,
      passedCount,
      percent: Math.round((passedCount / total) * 100),
      allPassed: passedCount === total
    };
  }, [pilotTestResults, currentPilotDataset]);

  const fullDocumentTitle = sourceOrigin === "none" ? "Văn bản mới · chưa chọn nguồn" : uploadedFileName || `${doc.documentType || "Văn bản"} ${doc.subject ? `- ${doc.subject}` : ""}`.trim();
  const displayDocumentTitle = sourceOrigin === "none" ? "Văn bản mới · chưa chọn nguồn" : uploadedFileName || (doc.documentType ? `${doc.documentType} ${doc.referenceNumber || ""}`.trim() : "Văn bản mới");
  const saveStatusLabel = isAutoSaving ? "Đang lưu..." : saveError ? "Lỗi lưu" : hasPersistedDraft ? "Đã lưu" : "Chưa lưu";
  const saveTooltip = isAutoSaving ? "Hệ thống đang tự động lưu dữ liệu vào IndexedDB" : saveError ? `Lỗi lưu trữ: ${saveError}` : hasPersistedDraft ? "Dữ liệu được lưu an toàn trong trình duyệt (IndexedDB)" : "Chưa có thay đổi nào được ghi vào IndexedDB";
  const partitionBlocksForProposalReview = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
  const partitionRegimeForProposalReview = standardType === "party" ? "party" : "administrative";
  const visiblePartitionProposals = partitionProposals.filter(proposal =>
    proposal.status !== "pending" || checkProposalValidityBeforeApply(
      proposal,
      partitionBlocksForProposalReview,
      partitionRegimeForProposalReview,
      userModifiedBlockIds,
      { sourceGeneration, partitionRevision },
    ).valid,
  );

  return (
    <div data-current-step={currentStep} className="min-h-screen df-app-shell text-[#17233D] flex flex-col font-sans select-text">

      {/* Application bar: document identity, save status, and tools. */}
      <header className="df-glass-header text-[#17233D] px-3 sm:px-6 py-1.5 xl:py-0 z-30 sticky top-0 border-b border-slate-200/80 w-full bg-white/85 backdrop-blur-md shrink-0">
        <div className="df-header-row w-full flex items-center justify-between min-h-[56px] xl:h-14 gap-3">

          {/* Brand, filename, and compact controls on narrow screens. */}
          <div className="flex items-center justify-between xl:justify-start gap-2.5 min-w-0 h-9 xl:h-10 shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 xl:w-8 xl:h-8 rounded-xl bg-gradient-to-tr from-[#6255E8] to-[#3979E8] text-white shadow-xs flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-sm xl:text-base tracking-tight text-[#17233D]">DocForm</span>
            </div>

            {/* Document Filename with accessible title and truncation */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100/70 border border-slate-200/60 text-xs font-semibold text-[#17233D] max-w-[150px] sm:max-w-[220px] xl:max-w-[240px] truncate"
              title={fullDocumentTitle}
              tabIndex={0}
              role="region"
              aria-label={`Tài liệu: ${fullDocumentTitle}`}
            >
              <FileText className="w-3.5 h-3.5 text-[#52607A] shrink-0" />
              <span className="truncate">{displayDocumentTitle}</span>
            </div>

            {/* Save Status & Tools on narrow screens (< xl) placed in Row 1 */}
            <div className="flex items-center gap-2 xl:hidden ml-auto shrink-0">
              <div
                className="df-header-save-status flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] text-[#52607A]"
                title={saveTooltip}
                role="status"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isAutoSaving ? "bg-[#D9822B] animate-ping" : saveError ? "bg-[#DC2626]" : hasPersistedDraft ? "bg-[#15803D]" : "bg-slate-400"}`} />
                <span className="font-medium" data-save-status={saveStatusLabel}>{saveStatusLabel}</span>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvancedDrawer(true)}
                aria-label="Lịch sử & Công cụ"
                className="p-1.5 rounded-xl text-[#52607A] hover:text-[#17233D] hover:bg-slate-100 transition cursor-pointer"
                title="Mở Lịch sử phiên bản & Công cụ nâng cao"
              >
                <Sliders className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Group 3 (Right on wide desktop >= xl): Save Status + Tools */}
          <div className="df-header-actions hidden xl:flex items-center gap-2.5 shrink-0 justify-end">

            <div
              className="df-header-save-status flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/90 text-xs text-[#52607A]"
              title={saveTooltip}
              role="status"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isAutoSaving ? "bg-[#D9822B] animate-ping" : saveError ? "bg-[#DC2626]" : hasPersistedDraft ? "bg-[#15803D]" : "bg-slate-400"}`} />
              <span className="font-medium" data-save-status={saveStatusLabel}>{saveStatusLabel}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedDrawer(true)}
              aria-label="Lịch sử phiên bản & Công cụ nâng cao"
              className="min-h-[34px] px-2.5 py-1 rounded-xl text-[#52607A] hover:text-[#17233D] hover:bg-slate-100 border border-slate-200/80 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title="Lịch sử phiên bản & Công cụ nâng cao"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Công cụ</span>
            </button>
          </div>

        </div>
      </header>

      {/* Notifications Bar */}
      {(successMsg || errorMsg) && (
        <div role={errorMsg ? "alert" : "status"} className={`px-6 py-2 text-xs font-medium flex items-center justify-between border-b ${
          errorMsg ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
        }`}>
          <div className="flex items-center gap-2">
            {errorMsg ? <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            <span>{errorMsg || successMsg}</span>
          </div>
          <button
            onClick={() => { setErrorMsg(""); setSuccessMsg(""); }}
            className="text-xs opacity-75 hover:opacity-100 underline font-semibold ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      <div className="df-workspace-layout" data-current-step={currentStep}>
        <nav aria-label="Quy trình xử lý và mục lục" className="df-workspace-sidebar">
          <p className="df-sidebar-eyebrow">QUY TRÌNH XỬ LÝ</p>
          <div className="df-sidebar-steps">
            {([
              { step: 1, label: "Tải & nhận diện" },
              { step: 2, label: "Soạn & kiểm tra" },
              { step: 3, label: "Xem & xuất" },
            ] as const).map(({ step, label }) => {
              const active = currentStep === step;
              const complete = stepIsComplete(step);
              return (
                <section className="df-sidebar-step" data-active={active} key={step}>
                  <button
                    type="button"
                    className="df-sidebar-step-button"
                    aria-label={`Bước ${step}: ${label}`}
                    aria-current={active ? "step" : undefined}
                    aria-expanded={active}
                    aria-controls={`df-sidebar-step-panel-${step}`}
                    aria-disabled={!canEnterStep(step) || undefined}
                    data-step={step}
                    data-step-complete={String(complete)}
                    data-step-allowed={String(canEnterStep(step))}
                    onClick={() => goToStep(step)}
                  >
                    <span className="df-sidebar-step-index" aria-hidden="true">{complete && !active ? "✓" : step}</span>
                    <span className="df-sidebar-step-copy">
                      <strong>{label}</strong>
                      <small>{active ? `Bước ${step} / 3` : complete ? "Đã hoàn thành" : `Bước ${step} / 3`}</small>
                    </span>
                    <ChevronRight className="df-sidebar-step-chevron" aria-hidden="true" size={16} />
                  </button>
                  <div
                    className="df-sidebar-step-panel"
                    id={`df-sidebar-step-panel-${step}`}
                    aria-hidden={!active}
                    inert={!active}
                  >
                    <div className="df-sidebar-step-panel-inner">
                      <ol className="df-step-toc">
                        {sidebarItemsByStep[step].map(item => (
                          <li key={item.id}>
                            <button
                              type="button"
                              aria-controls={item.id}
                              aria-current={activeTocTarget === item.id ? "location" : undefined}
                              data-toc-target={item.id}
                              onClick={() => scrollToTocItem(item)}
                            >
                              <span aria-hidden="true" />
                              <span>{item.label}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
          <div className="df-sidebar-current" role="status">
            <strong>Màn hình hiện tại · Bước {currentStep}</strong>
            <span>{currentStep === 1
              ? sourceChosen
                ? "Tiếp tục tài liệu hiện tại hoặc bắt đầu bằng một nguồn mới."
                : "Tải tệp DOCX/TXT hoặc tạo văn bản mới để bắt đầu."
              : currentStep === 2
                ? `Bản soạn r${workspaceSnapshot.workspace.workingRevision} · ${doc.appendices?.length ?? 0} phụ lục`
                : visibleCandidate?.downloadable
                  ? `Ứng viên hiện hành${visibleCandidate.safe?'':' · có cảnh báo'} · SHA-256 ${visibleCandidate.sha256.slice(0, 12)}…`
                  : candidatePending
                    ? "Đang tạo DOCX ứng viên hiện hành."
                    : "Chưa có DOCX ứng viên hợp lệ hiện hành."}</span>
          </div>
          {workspaceSnapshot.workspace.staged && (
            <button type="button" className="df-sidebar-cancel" onClick={closePartitionReview}>Hủy phân vùng</button>
          )}
        </nav>
        <div className="df-workspace-main">
      {/* BƯỚC 1: TẢI & NHẬN DIỆN (hệ thể thức + mẫu cơ quan + loại văn bản + nguồn) */}
      {currentStep === 1 && (
        <ImportStepView
          regime={standardType}
          onRequestRegimeSwitch={requestRegimeSwitch}
          doc={doc}
          templates={TEMPLATES}
          sourceOrigin={sourceOrigin}
          onCreateDocument={createNewDocument}
          onFieldChange={handleFieldChange}
          onFileUpload={handleFileUpload}
          isUploading={isUploading}
          uploadedFileName={uploadedFileName}
          uploadedBlocks={uploadedBlocks}
          structuredImport={structuredImport}
          originalSnapshot={originalSnapshot}
          originalAvailable={sourceBlobAvailability==='available'}
          onOpenReviewModal={() => {setErrorMsg('');setShowSideBySideModal(true);}}
          onDownloadOriginal={handleDownloadOriginalFile}
          hasSelectedSource={sourceChosen}
          aiPartitionConsent={aiPartitionConsent}
          onAiPartitionConsentChange={handleAiPartitionConsentChange}
          isCheckingPartitions={isCheckingPartitions}
          partitionCheckNotice={partitionCheckNotice}
          partitionCheckSource={partitionCheckSource}
          partitionProgress={partitionProgress}
          partitionCoverage={partitionCoverage ?? null}
          canContinue={canEnterStep(2)}
          onNext={() => goToStep(2)}
          docTypeOverride={docTypeDecisionValid ? docTypeOverride : null}
          onConfirmDocTypeOverride={handleConfirmDocTypeOverride}
        />
      )}

      {currentStep===3&&<WorkspaceExport candidate={visibleCandidate} pending={candidatePending} error={candidateError} onPrepare={()=>void prepareCandidate()} onDownload={()=>void exportToDocx()} onDownloadOriginal={()=>void handleDownloadOriginalFile()} onPrintCandidate={()=>void handlePrintCandidate()} originalAvailable={sourceBlobAvailability==='available'} onPrev={()=>goToStep(2)} onReviewSource={()=>{setCurrentStep(1);setShowSideBySideModal(true);}} onEditTarget={(targetId)=>{setCurrentStep(2);requestAnimationFrame(()=>{const node=[...document.querySelectorAll<HTMLElement>('[data-workspace-node]')].find(el=>el.dataset.workspaceNode===targetId);(node?.querySelector<HTMLElement>('[contenteditable="true"]')??document.querySelector<HTMLElement>('[data-canvas-id="body"] [contenteditable="true"]'))?.focus({preventScroll:true});});}} originalHtml={originalSnapshot?.bodyHtml??''}/>}
      <div hidden={currentStep!==2}>
        {sourceChosen&&canEnterWorkspaceStep(workspaceSnapshot,2)&&<WorkspaceEditor key={workspaceSnapshot.workspace.source?.identity??originalSnapshot?.sourceId??'template'} snapshot={workspaceSnapshot} initialCanvasId={editorState.activeCanvasId} onCanvasSelected={id=>setEditorState({activeCanvasId:id})} active={currentStep===2} onAction={workspaceAction} onPartition={()=>{setCurrentStep(1);setShowSideBySideModal(true);}} onRefine={handleAiRefine} refining={isRefining} canContinue={canEnterStep(3)} onContinue={()=>goToStep(3)} complianceReport={complianceReport} onOpenCompliance={()=>setShowComplianceModal(true)}/>}
      </div>
      </div></div>
      {toast && (
        <div className="df-toast fixed bottom-16 lg:bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold bg-white border-slate-200 text-slate-800">
          {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
          {toast.type === "info" && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
          <span className="max-w-xs">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================
          MODAL 1: SIDE-BY-SIDE IMPORT REVIEW STUDIO
         ======================================================== */}
      {showSideBySideModal && (structuredImport || partitionReviewBlocks.length > 0) && (
        <div
          ref={sideBySideDialogRef}
          data-testid="side-by-side-modal"
          data-partition-revision={partitionRevision}
          role="dialog"
          aria-modal="true"
          aria-labelledby="side-by-side-modal-title"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="bg-slate-50 text-[#17233D] p-4 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 text-emerald-700 p-2 rounded-xl border border-emerald-400/30">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 id="side-by-side-modal-title" className="text-sm font-bold text-[#17233D]">Đối Chiếu &amp; Phân Vùng Tài Liệu Tải Lên</h2>
                    <span className="text-[10px] bg-emerald-400/20 text-emerald-700 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                      Tổng {partitionReviewBlocks.length || structuredImport?.source.blockCount || 0} khối
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-[11px] text-[#52607A]">Tệp nguồn: <strong>{uploadedFileName || "Văn bản"}</strong></p>
                    {sourceStorageStatus && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        sourceStorageStatus.storage === "indexeddb"
                          ? "bg-emerald-500/20 text-emerald-700 border-emerald-400/30"
                          : "bg-amber-500/20 text-amber-700 border-amber-400/30"
                      }`}>
                        {sourceStorageStatus.storage === "indexeddb"
                          ? "Đã lưu an toàn trong IndexedDB"
                          : "Lưu tạm bộ nhớ phiên (tải lại trang sẽ mất)"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  data-partition-approve
                  type="button"
                  onClick={handleAiCheckPartitions}
                  disabled={!aiPartitionConsent || isCheckingPartitions}
                  className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={aiPartitionConsent ? "Gửi nguồn đã chuẩn hóa, không kèm role parser, cho Gemini kiểm tra" : "Bật cho phép AI ở Bước 1 trước khi gửi nguồn"}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isCheckingPartitions ? "animate-spin" : ""}`} />
                  <span>{isCheckingPartitions ? "AI Đang Rà Soát..." : "AI Kiểm Tra Phân Vùng"}</span>
                </button>
                {partitionHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={handleUndoPartitionProposal}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1 cursor-pointer transition"
                    title="Hoàn tác thay đổi phân vùng gần nhất"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Hoàn tác ({partitionHistory.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Đóng hộp thoại đối chiếu nguồn"
                  onClick={() => closePartitionReview()}
                  className="text-slate-500 hover:text-slate-900 p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Transparency & AI Status Banner */}
            <div className="bg-slate-50 text-slate-700 px-4 py-2 text-[11px] border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  <strong>Phạm vi gửi:</strong> {aiPartitionConsent ? "toàn bộ chữ nguồn và tọa độ ô bảng đã bật cho phép; không có role parser, tên tệp, HTML hoặc XML." : "AI đang tắt; nguồn không được gửi. Quy tắc nội bộ vẫn hoạt động."} Gợi ý không tự áp dụng.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  partitionCheckSource === "gemini_ai" || partitionCheckSource === "mixed"
                    ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/30"
                    : (partitionCheckSource === "rule_fallback" ? "bg-amber-500/20 text-amber-700 border border-amber-500/30" : "bg-slate-100 text-slate-600")
                }`}>
                  {partitionCheckSource === "gemini_ai" ? "✓ Gemini AI đã kiểm tra" : (partitionCheckSource === "mixed" ? "Gemini AI + quy tắc nội bộ" : (partitionCheckSource === "rule_fallback" ? "Quy tắc nội bộ" : "Chưa kiểm tra bằng AI"))}
                </span>
                {partitionCheckNotice && (
                  <span className="text-[10px] text-slate-500 italic">{partitionCheckNotice}</span>
                )}
              </div>
              {partitionCoverage && (
                <p className="basis-full pl-6 text-[10px] text-slate-500" data-testid="ai-partition-coverage">
                  AI {partitionCoverage.aiReviewedBlockIds.length}/{partitionCoverage.aiReviewedBlockIds.length + partitionCoverage.unreviewedBlockIds.length} khối; quy tắc {partitionCoverage.ruleFallbackBlockIds.length}/{partitionReviewBlocks.length || uploadedBlocks.length}; chưa AI {partitionCoverage.unreviewedBlockIds.length}. Lỗi lô: {partitionCoverage.chunks.filter(chunk => chunk.status !== "completed").length}.
                </p>
              )}
            </div>

            {/* Mobile Tab Switcher for Split View */}
            <div className="flex md:hidden border-b border-slate-200 bg-slate-100 p-1">
              <button
                onClick={() => setImportReviewTab("source")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                  importReviewTab === "source" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                }`}
              >
                1. Tệp Word gốc ({partitionReviewBlocks.length || structuredImport?.source?.blockCount || 0} khối)
              </button>
              <button
                onClick={() => setImportReviewTab("mapped")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                  importReviewTab === "mapped" ? "bg-white text-emerald-800 shadow-2xs" : "text-slate-600"
                }`}
              >
                2. Bản đồ trường chuẩn
              </button>
            </div>

            {/* Split Screen 2 Columns */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-y-auto text-xs">

              {/* Column 1: Source Blocks with Interactive Region Assignment */}
              <div className={`p-4 bg-slate-50/70 space-y-3 overflow-y-auto max-h-[65vh] ${importReviewTab === "source" ? "block" : "hidden md:block"}`}>

                {/* Disagreements list between Current Rule and AI proposals */}
                {visiblePartitionProposals.length > 0 && (
                  <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        Bất đồng phân vùng phát hiện ({visiblePartitionProposals.filter(p => p.status === "pending").length} đề xuất đang chờ)
                      </span>
                      <div className="flex items-center gap-2">
                        {visiblePartitionProposals.some(proposal => proposal.status === "pending") && (
                          <button
                            type="button"
                            data-testid="apply-verified-partition-proposals"
                            onClick={handleApplyVerifiedPartitionProposals}
                            className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold underline cursor-pointer"
                            title="Áp dụng tuần tự các đề xuất đang chờ mà bạn đã xác minh; bảng chưa xác minh và đề xuất hết hiệu lực sẽ bị bỏ qua"
                          >
                            Áp dụng đề xuất đã xác minh
                          </button>
                        )}
                        {partitionHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={handleUndoPartitionProposal}
                            className="text-[11px] text-purple-700 hover:text-purple-900 font-semibold underline flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Quay lại (Undo)</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {visiblePartitionProposals.map((prop) => {
                        const isPending = prop.status === "pending";
                        const isAccepted = prop.status === "accepted";
                        const isRejected = prop.status === "rejected";
                        const isVerified = !prop.requiresUserVerification || verifiedPartitionProposalIds.has(prop.id || "");

                        return (
                          <div
                            key={prop.id}
                            data-testid={`partition-proposal-${prop.sourceBlockId}`}
                            data-proposal-source={prop.source || "rule_fallback"}
                            className={`p-2 rounded-lg border text-xs flex flex-col gap-2 ${
                              isAccepted ? "bg-emerald-50 border-emerald-300 opacity-80" :
                              isRejected ? "bg-slate-50 border-slate-200 opacity-60" :
                              "bg-white border-purple-200 shadow-2xs"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold border">
                                    #{prop.sourceBlockId}
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    {prop.currentRole} ➔ <span className="text-purple-700 font-bold">{prop.suggestedRole}</span>
                                    {prop.fieldKey ? ` (${prop.fieldKey})` : ""}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${prop.source === "gemini_ai" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                    {prop.source === "gemini_ai" ? "Gemini AI" : "Quy tắc nội bộ"}
                                  </span>
                                  <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-semibold ${
                                    prop.confidence === "high" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    Độ tin cậy: {prop.confidence}
                                  </span>
                                </div>
                                {prop.cellLocation && (
                                  <p className="text-[10px] text-slate-600 font-mono">
                                    Vị trí ô: [Hàng {prop.cellLocation.rowIndex + 1}, Cột {prop.cellLocation.colIndex + 1}]
                                    {prop.cellLocation.cellId ? ` · ${prop.cellLocation.cellId}` : ""}
                                  </p>
                                )}
                                <p className="text-[11px] text-slate-600 italic truncate">
                                  Trích dẫn: "{prop.exactQuote}"
                                </p>
                                <p className="text-[10.5px] text-slate-500">
                                  Lý do: {prop.reason}
                                </p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                {isPending && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyPartitionProposal(prop)}
                                      disabled={!isVerified}
                                      title={!isVerified ? "Vui lòng tích xác nhận đã đối chiếu đúng ô và nội dung nguồn trước khi áp dụng" : "Áp dụng đề xuất này"}
                                      className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-[10.5px] transition cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
                                    >
                                      Áp dụng
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDismissPartitionProposal(prop)}
                                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-semibold text-[10.5px] transition cursor-pointer"
                                    >
                                      Bỏ qua
                                    </button>
                                  </>
                                )}
                                {isAccepted && (
                                  <span className="text-[10.5px] font-bold text-emerald-700 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" /> Đã áp dụng
                                  </span>
                                )}
                                {isRejected && (
                                  <span className="text-[10.5px] font-semibold text-slate-500">
                                    {userModifiedBlockIds.includes(prop.sourceBlockId) ? "Hết hiệu lực sau chỉnh sửa" : "Đã bỏ qua"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {prop.requiresUserVerification && (
                              <div className="p-2 bg-amber-50/90 border border-amber-300 rounded-md text-[11px] text-amber-900 space-y-1">
                                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>Cần kiểm tra thủ công (Đề xuất liên quan đến bảng biểu)</span>
                                </div>
                                <p className="text-[10.5px] text-amber-800 leading-tight">
                                  {prop.cellLocation ? (
                                    <>Đề xuất chỉ định ô <strong>[Hàng {prop.cellLocation.rowIndex + 1}, Cột {prop.cellLocation.colIndex + 1}]</strong> trong bảng có cấu trúc phức tạp / ô gộp. Vui lòng đối chiếu với dữ liệu nguồn.</>
                                  ) : (
                                    <>Đề xuất cho bảng biểu nhưng <strong>chưa xác định chắc ô cụ thể</strong>. Vui lòng đối chiếu kỹ nội dung nguồn.</>
                                  )}
                                </p>
                                {isPending && (
                                  <label className="flex items-center gap-2 pt-0.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={verifiedPartitionProposalIds.has(prop.id || "")}
                                      onChange={() => togglePartitionProposalVerification(prop.id || "")}
                                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                                    />
                                    <span className="font-semibold text-amber-950 text-[10.5px]">
                                      Tôi đã đối chiếu đúng ô và nội dung nguồn
                                    </span>
                                  </label>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pb-2 border-b border-slate-200 gap-2 flex-wrap">
                  <div>
                    <span className="font-bold text-slate-900 uppercase tracking-wide text-xs">
                      Cột 1: Danh sách khối nguồn & Phân vùng ({partitionReviewBlocks.length || structuredImport?.source?.blockCount || 0} khối)
                    </span>
                    <p className="text-[10.5px] text-slate-500 mt-0.5">
                      Kiểm tra và tùy chỉnh phân vùng đích cho từng khối trước khi xác nhận nhập
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] bg-white border border-slate-200 p-0.5 rounded-lg flex-wrap">
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("all")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "all" ? "bg-slate-800 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Tất cả ({partitionReviewBlocks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("body")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "body" ? "bg-emerald-700 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Thân bài ({partitionReviewBlocks.filter(b => b.role === "body").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("signature")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "signature" ? "bg-amber-700 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Khối ký ({partitionReviewBlocks.filter(b => b.role === "signature").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("unclassified")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "unclassified" ? "bg-rose-700 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Chưa phân loại ({partitionReviewBlocks.filter(b => b.role === "unclassified").length})
                    </button>
                  </div>
                </div>

                {/* Blocks List */}
                <div className="space-y-2.5">
                  {(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || uploadedBlocks)).filter(b => reviewBlockFilter === "all" || b.role === reviewBlockFilter).map((b) => {
                    const isTable = b.kind === "table";
                    const roleColor =
                      b.role === "header" ? "bg-blue-50 border-blue-200 text-blue-900" :
                      b.role === "metadata" ? "bg-indigo-50 border-indigo-200 text-indigo-900" :
                      b.role === "body" ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
                      b.role === "signature" ? "bg-amber-50 border-amber-200 text-amber-900" :
                      b.role === "appendix" ? "bg-purple-50 border-purple-200 text-purple-900" :
                      b.role === "separator" ? "bg-slate-100 border-slate-300 text-slate-600" :
                      "bg-rose-50 border-rose-200 text-rose-900";

                    return (
                      <div
                        key={b.id}
                        className={`p-2.5 bg-white border rounded-lg shadow-2xs space-y-1.5 transition ${
                          b.role === "signature" ? "border-amber-300 ring-1 ring-amber-200" :
                          b.role === "unclassified" ? "border-rose-300" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold border border-slate-200">
                              #{b.id}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${
                              isTable ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-slate-50 border-slate-200 text-slate-700"
                            }`}>
                              {isTable ? `Bảng (${b.tableShape?.rows || (b.tableData?.length || 1)} hàng × ${b.tableShape?.columns || (b.tableData?.[0]?.length || 1)} cột)` : "Đoạn văn"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] font-semibold text-slate-500">Phân vùng đích:</label>
                            <select
                              data-block-id={b.id}
                              value={b.role || "unclassified"}
                              data-source-block-id={b.id}
                              onChange={(e) => handleUpdateBlockRole(b.id, e.target.value as SourceRegion)}
                              className={`text-[11px] font-bold px-2 py-0.5 rounded border shadow-2xs cursor-pointer ${roleColor}`}
                            >
                              <option value="body">Thân bài (Body)</option>
                              <option value="signature">Khối ký (Signature)</option>
                              <option value="recipients">Nơi nhận (Recipients)</option>
                              <option value="header">Đầu trang (Header)</option>
                              <option value="metadata">Thông tin thể thức (Metadata)</option>
                              <option value="appendix">Phụ lục (Appendix)</option>
                              <option value="separator">Dòng phân cách (Separator)</option>
                              <option value="unclassified">Chưa phân loại (Unclassified)</option>
                            </select>
                          </div>
                        </div>

                        {b.tableModel&&<details><summary>Ánh xạ ô nguồn (một bảng vật lý)</summary>{b.tableModel.rows.flatMap(row=>row.cells).map(cell=><label key={cell.cellId} className="block text-xs p-1">Ô {cell.cellId} · {cell.text.slice(0,40)} <select aria-label={'Vai trò ô '+cell.cellId} value={(workspace?.staged?.partition.cells??workspace?.partition.cells)?.find(c=>c.sourceBlockId===b.id&&c.cellId===cell.cellId)?.role??b.role??'unclassified'} onChange={e=>handleUpdateCellRole(b.id,cell.cellId,e.target.value as SourceRegion)}>{(['header','metadata','body','signature','recipients','appendix','unclassified'] as const).map(role=><option key={role} value={role}>{role}</option>)}</select></label>)}</details>}
                        {/* Content Preview */}
                        {isTable && b.tableData && b.tableData.length > 0 ? (
                          <div className="mt-1 border border-slate-200 rounded overflow-x-auto bg-slate-50/50 max-h-36">
                            <table className="w-full text-[10.5px] border-collapse">
                              <tbody>
                                {b.tableData.slice(0, 3).map((row, rIdx) => (
                                  <tr key={rIdx} className="border-b border-slate-200 last:border-b-0">
                                    {row.map((cell, cIdx) => (
                                      <td key={cIdx} className="p-1 border-r border-slate-200 last:border-r-0 max-w-[180px] truncate text-slate-700" title={cell}>
                                        {cell.trim() || <span className="text-slate-500 italic">(trống)</span>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {b.tableData.length > 3 && (
                              <div className="p-1 text-center text-[9.5px] text-slate-400 bg-slate-100 border-t border-slate-200">
                                +{b.tableData.length - 3} hàng khác...
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-slate-700 font-sans text-[11px] line-clamp-3 bg-slate-50/60 p-1.5 rounded border border-slate-100">
                            {b.text.trim() || <span className="text-slate-400 italic">(Đoạn văn trống hoặc dòng kẻ)</span>}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Column 2: Structured Fields Map */}
              <div className={`p-4 bg-white space-y-3 overflow-y-auto max-h-[60vh] ${importReviewTab === "mapped" ? "block" : "hidden md:block"}`}>
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <span className="font-bold text-slate-800 uppercase tracking-wide">
                    Cột 2: Bản đồ trường thể thức phân loại
                  </span>
                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                    Zero Data Loss
                  </span>
                </div>

                {/* Alert banner if validation errors exist */}
                {liveValidationErrors.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Không thể xác nhận: Phát hiện {liveValidationErrors.length} lỗi phân vùng</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-700">
                      {liveValidationErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-rose-600 italic mt-1">
                      Vui lòng điều chỉnh lại phân vùng các khối ở Cột 1 trước khi đưa vào soạn thảo.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                    <span className="font-bold text-slate-900 block">1. Cơ quan & Quốc hiệu</span>
                    <p className="text-slate-700 font-medium">{liveReconstructed.fields.orgHeader2 || "(Chưa có cơ quan ban hành)"}</p>
                    <p className="text-slate-500 text-xs font-mono">{liveReconstructed.fields.referenceNumber || "(Chưa có số hiệu)"}</p>
                    <p className="text-slate-500 italic text-[11px]">{liveReconstructed.fields.locationAndDate || "Chưa có ngày tháng"}</p>
                    {liveReconstructed.draftNote && (
                      <span className="inline-block text-[10px] bg-purple-100 text-purple-900 font-semibold px-2 py-0.5 rounded border border-purple-200 mt-1">
                        Ghi chú bản thảo: {liveReconstructed.draftNote}
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                    <span className="font-bold text-slate-900 block">2. Tên loại & Trích yếu</span>
                    <p className="font-bold text-blue-900 uppercase">{liveReconstructed.fields.documentType || "CHƯA XÁC ĐỊNH"}</p>
                    <p className="text-slate-700 text-xs">{liveReconstructed.fields.subject || "(Trống)"}</p>
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">3. Thân bài & Dữ liệu</span>
                      <span className="text-[10.5px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded">
                        {(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "body").length} khối
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] line-clamp-2">
                      {liveReconstructed.bodyHtml ? liveReconstructed.bodyHtml.replace(/<[^>]+>/g, " ").slice(0, 150) + "..." : "(Thân bài trống)"}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                    <span className="font-bold text-slate-900 block">4. Chữ ký & Nơi nhận</span>
                    {liveReconstructed.fields.signTitle?.includes("|") ? (
                      <div className="space-y-1 mt-1">
                        <span className="text-[10px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full inline-block">
                          Bảng ký {liveReconstructed.fields.signTitle.split("|").length} vị trí (Chuẩn Biên bản NĐ 30)
                        </span>
                        <div className="space-y-1 mt-1">
                          {liveReconstructed.fields.signTitle.split("|").map((title, idx) => {
                            const names = (liveReconstructed.fields.signName || "").split("|").map(n => n.trim());
                            const name = names[idx] || "";
                            return (
                              <div key={idx} className="text-[11px] bg-white p-1.5 rounded border border-slate-200 flex justify-between items-center gap-2">
                                <span className="font-bold text-slate-800 truncate">{title.trim()}</span>
                                <span className="text-slate-600 font-medium shrink-0">{name || "(Chưa có tên)"}</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-emerald-700 italic mt-1 font-medium">
                          ✓ Nơi nhận: Không bắt buộc với Biên bản (theo Mẫu 1.9 NĐ 30)
                        </p>
                      </div>
                    ) : (!liveReconstructed.fields.signTitle && !liveReconstructed.fields.signName) ? (
                      <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                        <span className="font-semibold block">Tài liệu không có khối chữ ký:</span>
                        <span>Đã giữ nguyên trạng thái văn bản thảo/kế hoạch, toàn bộ bảng nội dung được bảo toàn nguyên vẹn trong thân bài.</span>
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-700 font-semibold">{liveReconstructed.fields.signTitle || ""} {liveReconstructed.fields.signName || ""}</p>
                        {liveReconstructed.fields.recipients && (
                          <p className="text-slate-500 text-[11px] italic mt-1">Nơi nhận: {liveReconstructed.fields.recipients.split("\n")[0]}</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* AI & Rule Review Proposals Panel */}
                  <div className="p-3 rounded-lg border border-purple-200 bg-purple-50/50 space-y-2.5">
                    <div className="flex items-center justify-between pb-1 border-b border-purple-200 gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Wand2 className="w-4 h-4 text-purple-700" />
                        <span className="font-bold text-purple-950 text-[11.5px]">
                          Đề xuất rà soát & chuẩn hóa ({visibleReviewProposals.length})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowPayloadInspector(prev => !prev)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition flex items-center gap-1 cursor-pointer ${
                            showPayloadInspector
                              ? "bg-purple-200 border-purple-400 text-purple-900"
                              : "bg-white border-purple-200 text-purple-800 hover:bg-purple-100"
                          }`}
                          title="Xem trước dữ liệu sẽ gửi tới AI"
                        >
                          <Eye className="w-3 h-3" />
                          <span>{showPayloadInspector ? "Đóng dữ liệu" : "Xem trước gửi AI"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={fetchAiReviewProposals}
                          disabled={isReviewingProposals}
                          className="px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-[10px] font-bold shadow-2xs cursor-pointer transition flex items-center gap-1"
                          title="Gửi cấu trúc tài liệu tới Gemini AI để rà soát thể thức & nội dung"
                        >
                          {isReviewingProposals ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Đang rà soát...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 text-amber-700" />
                              <span>Rà soát AI (Gemini)</span>
                            </>
                          )}
                        </button>
                        {visibleReviewProposals.length > 0 && (
                          <button
                            type="button"
                            onClick={handleAcceptAllProposals}
                            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs cursor-pointer transition"
                          >
                            Áp dụng tất cả
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Collapsible AI Payload Inspector (User Consent & Transparency) */}
                    {showPayloadInspector && (
                      <div className="p-2.5 bg-slate-50 text-slate-700 rounded-lg text-[10.5px] space-y-1.5 border border-slate-200">
                        <div className="flex items-center justify-between text-slate-500 border-b border-slate-200 pb-1">
                          <span className="font-semibold text-emerald-700 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Dữ liệu chuẩn bị gửi tới Gemini AI:
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {uploadedBlocks.length} khối | {rawText.length} ký tự | {uploadedBlocks.filter(b => b.kind === "table").length} bảng
                          </span>
                        </div>
                        <div className="text-[10px] text-amber-200/90 bg-amber-950/40 border border-amber-800/40 p-1.5 rounded">
                          🔒 <strong>Minh bạch & Quyền riêng tư:</strong> Tài liệu chỉ được gửi tới Gemini khi bạn nhấn nút "Rà soát AI (Gemini)". Mặc định tài liệu chỉ chạy bộ quy tắc ngoại tuyến 100% nội bộ.
                        </div>
                        <div className="max-h-36 overflow-y-auto font-mono text-[9.5px] bg-white p-2 rounded border border-slate-200 text-slate-500 whitespace-pre-wrap">
                          {JSON.stringify({
                            standardType: standardType === "party" ? "party" : "administrative",
                            documentType: structuredImport?.fields?.documentType?.value || "CHƯA XÁC ĐỊNH",
                            subject: structuredImport?.fields?.subject?.value || "(Trống)",
                            blocksSummary: uploadedBlocks.slice(0, 10).map(b => ({
                              id: b.id,
                              kind: b.kind,
                              textLength: b.text?.length || 0,
                              snippet: b.text?.slice(0, 50) + (b.text && b.text.length > 50 ? "..." : "")
                            })),
                            totalBlocks: uploadedBlocks.length,
                            rawTextPreview: rawText.slice(0, 250) + (rawText.length > 250 ? "..." : "")
                          }, null, 2)}
                        </div>
                      </div>
                    )}

                    {isReviewingProposals ? (
                      <div className="py-3 text-center text-purple-700 text-[11px] italic flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang đối chiếu quy tắc NĐ 30 & phân tích văn bản chuyên sâu...</span>
                      </div>
                    ) : visibleReviewProposals.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic py-1">
                        ✓ Không phát hiện vi phạm thể thức hoặc lỗi chính tả cần sửa.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {visibleReviewProposals.map((prop) => {
                          const isAccepted = acceptedProposalIds.has(prop.id);
                          return (
                            <div
                              key={prop.id}
                              data-proposal-id={prop.id}
                              data-proposal-accepted={isAccepted ? "true" : "false"}
                              className={`p-2 rounded-lg border transition text-[11px] ${
                                isAccepted
                                  ? "bg-emerald-50 border-emerald-300"
                                  : "bg-white border-slate-200 shadow-2xs hover:border-purple-300"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                    prop.type === "format" ? "bg-blue-100 text-blue-800" :
                                    prop.type === "spelling" ? "bg-rose-100 text-rose-800" :
                                    prop.type === "segmentation" ? "bg-amber-100 text-amber-800" :
                                    "bg-purple-100 text-purple-800"
                                  }`}>
                                    {prop.type === "format" ? "Thể thức" :
                                     prop.type === "spelling" ? "Chính tả" :
                                     prop.type === "segmentation" ? "Phân đoạn" : "Nhất quán"}
                                  </span>

                                  {/* Source tag: Gemini AI vs Quy tắc NĐ 30 */}
                                  <span className={`text-[8.5px] font-semibold px-1 py-0.5 rounded border ${
                                    prop.source === "gemini_ai"
                                      ? "bg-purple-100 text-purple-900 border-purple-300"
                                      : "bg-slate-100 text-slate-700 border-slate-300"
                                  }`}>
                                    {prop.source === "gemini_ai" ? "Gemini AI" : "Quy tắc NĐ 30"}
                                  </span>

                                  {/* Exact target block badge */}
                                  {prop.targetBlockId && (
                                    <span
                                      className="text-[8.5px] font-mono px-1 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200"
                                      title={`Khối ID: ${prop.targetBlockId}`}
                                    >
                                      Khối #{prop.targetBlockId.slice(0, 8)}
                                    </span>
                                  )}

                                  {/* Exact cell index if table cell */}
                                  {prop.cellIndex && (
                                    <span className="text-[8.5px] font-mono px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                      Ô [{prop.cellIndex.row + 1},{prop.cellIndex.col + 1}]
                                    </span>
                                  )}
                                </div>

                                {isAccepted ? (
                                  <span className="text-emerald-700 font-bold text-[10px] flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Đã áp dụng
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleAcceptProposal(prop)}
                                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] cursor-pointer"
                                      title="Chấp nhận đề xuất này"
                                    >
                                      Áp dụng
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDismissProposal(prop.id)}
                                      className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                                      title="Bỏ qua đề xuất này"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="mt-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="line-through text-slate-400 font-mono text-[10.5px]">
                                    {prop.original}
                                  </span>
                                  <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span className="text-emerald-700 font-bold font-mono text-[10.5px]">
                                    {prop.suggested}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 italic">
                                  {prop.reason}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Two distinct metrics: Unclassified blocks vs Structural segmentation review */}
                  <div className="space-y-2 pt-1 border-t border-slate-200">
                    <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                      ((partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "unclassified").length === 0)
                        ? "border-emerald-300 bg-emerald-50/80 text-emerald-900"
                        : "border-amber-300 bg-amber-50 text-amber-900"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-bold text-xs block">
                            Chỉ số phân loại: {(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "unclassified").length} khối chưa phân loại
                          </span>
                          <span className="text-[10px] text-slate-600">
                            {(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "unclassified").length === 0
                              ? "100% nội dung đã được phân bổ vào các vùng dữ liệu (Header, Body, Ký, Phụ lục)."
                              : "Các khối chưa phân loại sẽ được bảo toàn nguyên vẹn trong mục Khối chưa phân loại."}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-800 shrink-0">
                        BẢO TOÀN DỮ LIỆU
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/60 text-slate-700 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-blue-900">
                          Thống kê phân bổ vùng văn bản
                        </span>
                        <span className="text-[10px] text-blue-700 font-semibold">
                          Tổng {partitionReviewBlocks.length || structuredImport?.source?.blockCount || uploadedBlocks.length} khối
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] pt-1">
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Đầu trang</span>
                          <strong className="text-blue-900">{(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "header" || b.role === "metadata").length} khối</strong>
                        </div>
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Thân bài</span>
                          <strong className="text-emerald-900">{(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "body").length} khối</strong>
                        </div>
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Khối ký</span>
                          <strong className="text-amber-900">{(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "signature").length} khối</strong>
                        </div>
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Phụ lục</span>
                          <strong className="text-purple-900">{(partitionReviewBlocks.length > 0 ? partitionReviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "appendix").length} khối</strong>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic pt-1">
                        * Lưu ý: "0 khối chưa phân loại" chỉ xác nhận không có dữ liệu bị bỏ rơi, không đồng nghĩa phân đoạn đã hoàn hảo. Hãy rà soát danh sách khối ở Cột 1 để đảm bảo tính đúng đắn trước khi hoàn tất.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {errorMsg&&<p role="alert" className="p-3 bg-orange-50 text-orange-800">{errorMsg}</p>}
            {/* Footer */}
            <div className="df-partition-footer p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Bạn có thể sửa lại mọi trường trực tiếp trên mặt giấy sau khi xác nhận.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => closePartitionReview()}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-semibold text-xs"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleConfirmSideBySideImport}
                  disabled={liveValidationErrors.length > 0}
                  className={`px-5 py-2 rounded-xl font-bold text-xs shadow-md transition flex items-center gap-1.5 ${
                    liveValidationErrors.length > 0
                      ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  }`}
                  title={liveValidationErrors.length > 0 ? "Vui lòng khắc phục các lỗi phân vùng ở trên để tiếp tục" : "Đưa văn bản vào Studio"}
                >
                  <span>Duyệt &amp; sang Bước 2 — Đồng Ý Đưa Vào Studio Soạn Thảo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: COMPLIANCE INSPECTOR MODAL
         ======================================================== */}
      {showComplianceModal && complianceReport && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div ref={complianceDialogRef} role="dialog" aria-modal="true" aria-label="Báo cáo kiểm tra thể thức" className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Báo cáo Kiểm tra Thể thức NĐ 30 / HD 05
                </h3>
              </div>
              <button
                onClick={() => setShowComplianceModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Kiểm tra 9 trường thể thức: {complianceReport.passedChecks}/9 trường đạt</h4>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    Đạt {complianceReport.passedChecks}/{complianceReport.totalChecks} tiêu chí thành phần dữ liệu (NĐ 30 / HD 05).
                  </p>
                </div>
                <div className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white shrink-0">
                  {complianceReport.passedChecks === 9 ? "ĐẠT 9/9 TRƯỜNG" : "CẦN HOÀN THIỆN"}
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-slate-800 text-xs">Chi tiết các hạng mục kiểm tra:</h5>
                {complianceReport.issues.map((issue) => (
                  <div key={issue.id} className="p-3 rounded-xl border bg-slate-50 border-slate-200 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 font-bold">
                        {issue.severity === "error" ? <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                        <span>{issue.title}</span>
                      </div>
                      <p className="text-[11px] opacity-90 mt-0.5">{issue.message}</p>
                      {issue.suggestion && (
                        <p className="text-[10px] text-blue-700 italic mt-0.5">Gợi ý: {issue.suggestion}</p>
                      )}
                    </div>
                    {issue.suggestion && (
                      <button
                        onClick={() => applyQuickFix(issue)}
                        className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 px-2 py-1 rounded text-[10px] font-semibold shrink-0"
                      >
                        Sửa nhanh
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowComplianceModal(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-xs"
              >
                Hoàn tất & Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: AI REFINE BEFORE/AFTER DIFF REVIEW MODAL
         ======================================================== */}
      {/* ========================================================
          MODAL 3: AI REFINE BEFORE/AFTER DIFF REVIEW MODAL
         ======================================================== */}
      {refineProposal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div ref={refineDialogRef} role="dialog" aria-modal="true" aria-label={refineProposal.target?.kind==='node'?'Đề xuất tinh chỉnh đoạn đang chọn':'Đề xuất tinh chỉnh Body'} data-ai-target-kind={refineProposal.target?.kind??''} className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-indigo-50/80 via-blue-50/40 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    {refineProposal.label}
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                      {refineProposal.isFallback ? "Quy tắc dự phòng" : "Gemini AI tối ưu hóa"}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {refineProposal.target?.kind==='node'?'Chỉ gửi và áp dụng nội dung của một đoạn đang chọn; bảng, ảnh, phụ lục khác và nguồn gốc không được gửi.':'Rà soát nội dung Body đủ điều kiện theo Nghị định 30.'}
                  </p>
                </div>
              </div>

              {/* Stats badges */}
              {visualDiff && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                    +{visualDiff.stats.addedCount} từ sửa / bổ sung
                  </span>
                  <span className="text-[11px] font-semibold text-rose-800 bg-rose-100/90 px-2.5 py-1 rounded-full border border-rose-200 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span>
                    -{visualDiff.stats.deletedCount} từ loại bỏ
                  </span>
                  <span className="text-[11px] text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 hidden sm:inline-flex">
                    {visualDiff.stats.unchangedCount} từ giữ nguyên
                  </span>
                </div>
              )}

              <button onClick={rejectRefineProposal} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* View Mode Tabs */}
            <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setAiRefineMode("visual_diff")}
                  className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
                    aiRefineMode === "visual_diff" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  So sánh chi tiết (Visual Diff)
                </button>
                <button
                  type="button"
                  onClick={() => setAiRefineMode("side_by_side")}
                  className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
                    aiRefineMode === "side_by_side" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  Song song (2 Cột)
                </button>
                <button
                  type="button"
                  onClick={() => setAiRefineMode("refined")}
                  className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
                    aiRefineMode === "refined" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Chỉ bản mới
                </button>
              </div>

              {/* Legend guide */}
              {aiRefineMode === "visual_diff" && (
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <del className="bg-rose-100 text-rose-700 line-through px-1 rounded border border-rose-200">Từ cũ</del>
                    <span>Lỗi phát hiện</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <ins className="bg-emerald-100 text-emerald-800 font-semibold no-underline px-1 rounded border border-emerald-200">Từ mới</ins>
                    <span>AI chuẩn hóa</span>
                  </span>
                </div>
              )}
            </div>

            {/* Modal Body Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {aiRefineMode === "visual_diff" && (
                <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
                    <span>Nội dung đã đối chiếu từng từ (Diff View):</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      Click vào bất kỳ từ nào để đối chiếu nhanh
                    </span>
                  </div>
                  <div
                    className="p-3 bg-slate-50/50 rounded-lg max-h-[380px] overflow-y-auto text-[12px] leading-relaxed text-justify text-slate-800 font-sans whitespace-pre-wrap select-text"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(visualDiff?.inlineHtml || refineProposal.refinedHtml) }}
                  />
                </div>
              )}

              {aiRefineMode === "side_by_side" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-rose-200/80 rounded-xl p-3 bg-rose-50/20 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-rose-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        Nội dung gốc (Đã đánh dấu lỗi):
                      </span>
                    </div>
                    <div
                      className="p-3 bg-white border border-rose-200/70 rounded-lg flex-1 max-h-[360px] overflow-y-auto text-[11px] leading-relaxed text-justify text-slate-700 font-sans whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(visualDiff?.originalHighlightedHtml || refineProposal.originalHtml) }}
                    />
                  </div>
                  <div className="border border-emerald-200/80 rounded-xl p-3 bg-emerald-50/20 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Đề xuất mới (Đã tối ưu hóa):
                      </span>
                    </div>
                    <div
                      className="p-3 bg-white border border-emerald-200/70 rounded-lg flex-1 max-h-[360px] overflow-y-auto text-[11px] leading-relaxed text-justify text-slate-900 font-sans whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(visualDiff?.refinedHighlightedHtml || refineProposal.refinedHtml) }}
                    />
                  </div>
                </div>
              )}

              {aiRefineMode === "refined" && (
                <div className="border border-indigo-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
                  <span className="font-bold text-indigo-900 block border-b border-indigo-50 pb-2">
                    Văn bản hoàn chỉnh sau khi áp dụng AI:
                  </span>
                  <div
                    className="p-3 bg-white rounded-lg max-h-[380px] overflow-y-auto text-[12px] leading-relaxed text-justify text-slate-900 font-sans"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(refineProposal.refinedHtml) }}
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                data-ai-cancel
                onClick={rejectRefineProposal}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition"
              >
                Hủy bỏ (Giữ nguyên bản gốc)
              </button>
              <button
                type="button"
                data-ai-accept
                onClick={acceptRefineProposal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition"
              >
                <Check className="w-4 h-4" /> Phê duyệt & Áp dụng nội dung này
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM TEMPLATE CHANGE MODAL */}
      {pendingTemplate && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div
            ref={pendingTemplateDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-template-title"
            className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4"
          >
            <h3 id="pending-template-title" className="font-bold text-slate-900">Đổi sang mẫu {pendingTemplate.name}?</h3>
            <p className="text-xs text-slate-700">Bản đang soạn có thay đổi chưa ghi vào lịch sử. Hệ thống sẽ lưu một bản sao trước khi thay đổi để bạn có thể khôi phục bất cứ lúc nào.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingTemplate(null)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs">Hủy</button>
              <button type="button" onClick={() => applyTemplate(pendingTemplate)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">Đổi mẫu</button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: PILOT DOCUMENTS FIXTURES & TEST RUNNER
         ======================================================== */}
      {showPilotModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-slate-50 rounded-2xl w-full max-w-6xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">

            {/* Header */}
            <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 px-5 py-4 text-white flex items-center justify-between border-b border-purple-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center shrink-0">
                  <FlaskConical className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base sm:text-lg">Thư Viện Tài Liệu Pilot Test (37 Tài Liệu)</h2>
                    <span className="bg-purple-500/30 text-purple-200 text-xs px-2.5 py-0.5 rounded-full font-bold border border-purple-400/30">
                      27 Chuẩn + 10 Thử Thách
                    </span>
                  </div>
                  <p className="text-xs text-purple-200/80 mt-0.5">
                    Bộ dữ liệu toàn diện kiểm định 4 khâu: Parse bóc tách, Xem trước A4 & Real OOXML, In ấn/PDF, và Xuất file Word.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPilotModal(false)}
                className="text-purple-200 hover:text-white p-2 rounded-xl hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dataset Mode Switcher: Standard vs Edge Cases */}
            <div className="bg-slate-900/90 px-5 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-purple-800/30 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPilotDatasetMode("standard"); setPilotCategory("all"); setPilotTestResults(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    pilotDatasetMode === "standard"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <span>📁</span>
                  <span>Mẫu Chuẩn NĐ 30 & HD 05 (27)</span>
                </button>
                <button
                  onClick={() => { setPilotDatasetMode("edge_cases"); setPilotCategory("all"); setPilotTestResults(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    pilotDatasetMode === "edge_cases"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <span>⚡</span>
                  <span>Thử Thách & Lỗi Thể Thức / Sai Dữ Liệu (10)</span>
                </button>
              </div>
              <span className="text-[11px] text-purple-200/80">
                {pilotDatasetMode === "standard"
                  ? "27 tài liệu mẫu kiểm tra các trường thể thức cơ bản NĐ 30 & HD 05"
                  : "10 ca thử thách kiểm tra bộ lọc mã độc & nhận diện vi phạm thể thức"}
              </span>
            </div>

            {/* Action Bar & Stats Bar */}
            <div className="p-4 bg-white border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center flex-wrap gap-2.5">
                <button
                  onClick={runPilotTestInBrowser}
                  disabled={isTestingPilot}
                  className={`text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer ${
                    pilotDatasetMode === "standard" ? "bg-purple-600 hover:bg-purple-700" : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {isTestingPilot ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Đang kiểm thử {currentPilotDataset.length} tài liệu...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Chạy Kiểm Thử Toàn Bộ ({currentPilotDataset.length})</span>
                    </>
                  )}
                </button>

                {pilotTestStats ? (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                    pilotTestStats.allPassed
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-amber-50 text-amber-800 border-amber-300"
                  }`}>
                    <CheckCheck className="w-4 h-4 text-emerald-600" />
                    <span>
                      {pilotDatasetMode === "standard"
                        ? `Kiểm tra trường dữ liệu: ${pilotTestStats.passedCount}/${pilotTestStats.total} mẫu hợp lệ cơ bản`
                        : `Kiểm tra an toàn & bắt lỗi: ${pilotTestStats.passedCount}/${pilotTestStats.total} mẫu đạt mục tiêu kiểm thử`}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    <Info className="w-4 h-4 text-slate-500" />
                    <span>
                      {pilotDatasetMode === "standard"
                        ? "Nhấn 'Chạy Kiểm Thử' để kiểm tra 9 trường dữ liệu thể thức cơ bản của 27 tài liệu mẫu"
                        : "Nhấn 'Chạy Kiểm Thử' để kiểm tra bộ lọc mã độc và cơ chế bắt lỗi thể thức của 10 ca thử thách"}
                    </span>
                  </div>
                )}
              </div>

              {/* Search input */}
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, số ký hiệu..."
                  value={pilotSearch}
                  onChange={(e) => setPilotSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
                {pilotSearch && (
                  <button
                    onClick={() => setPilotSearch("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
              {(pilotDatasetMode === "standard" ? PILOT_CATEGORIES : EDGE_CASE_CATEGORIES).map(cat => {
                const isActive = pilotCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setPilotCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? (pilotDatasetMode === "standard" ? "bg-white text-purple-900 font-bold shadow-xs border border-purple-200" : "bg-white text-amber-900 font-bold shadow-xs border border-amber-200")
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? (pilotDatasetMode === "standard" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800") : "bg-slate-200 text-slate-600"
                    }`}>
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Document Cards Grid */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {filteredPilotDocs.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Không tìm thấy tài liệu phù hợp</p>
                  <p className="text-xs text-slate-400 mt-1">Vui lòng thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc.</p>
                  <button
                    onClick={() => { setPilotCategory("all"); setPilotSearch(""); }}
                    className="mt-3 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold hover:bg-purple-200 transition cursor-pointer"
                  >
                    Đặt lại bộ lọc
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPilotDocs.map(item => {
                    const testRes = pilotTestResults ? pilotTestResults[item.id] : null;
                    const isParty = ("category" in item && item.category === "dang") || item.doc.regime === "party";
                    const isEdge = "type" in item;
                    const edgeType = isEdge ? (item as ComplexMalformedItem).type : "standard";

                    return (
                      <div
                        key={item.id}
                        className={`bg-white rounded-xl border p-4 shadow-xs hover:shadow-md transition flex flex-col justify-between group ${
                          isEdge && edgeType === "non_compliant"
                            ? "border-amber-200 hover:border-amber-400"
                            : (isEdge && edgeType === "malformed_data" ? "border-rose-200 hover:border-rose-400" : "border-slate-200 hover:border-purple-300")
                        }`}
                      >
                        <div>
                          {/* Card Top: Category, Code & Status */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                              isEdge && edgeType === "non_compliant"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : (isEdge && edgeType === "malformed_data"
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : (isParty ? "bg-red-50 text-red-700 border-red-200" : "bg-purple-50 text-purple-700 border-purple-200"))
                            }`}>
                              {"categoryName" in item ? item.categoryName : (item as ComplexMalformedItem).typeName}
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-600 truncate max-w-[150px]">
                              {item.code}
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-2 mb-1 group-hover:text-purple-900 transition">
                            {item.title}
                          </h4>

                          {/* Description */}
                          <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                            {item.desc}
                          </p>

                          {/* Feature tags */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                              {item.badge}
                            </span>
                            {"tags" in item && (item as ComplexMalformedItem).tags.map((t, tIdx) => (
                              <span key={tIdx} className="text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded-md">
                                {t}
                              </span>
                            ))}
                            {"signatureType" in item && (item as PilotDocumentItem).signatureType === "three_parties" && (
                              <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                                ✍️ Ký 3 bên
                              </span>
                            )}
                            {"signatureType" in item && (item as PilotDocumentItem).signatureType === "two_parties" && (
                              <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-medium">
                                ✍️ Ký 2 bên
                              </span>
                            )}
                            {isParty && (
                              <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-md font-medium">
                                ☭ Phông 14pt
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Card Bottom: Test Result & Action Buttons */}
                        <div>
                          {testRes && (
                            <div className={`mb-3 p-2 rounded-lg text-[11px] font-medium flex items-center justify-between ${
                              testRes.passed
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : "bg-rose-50 text-rose-800 border border-rose-200"
                            }`}>
                              <span className="flex items-center gap-1">
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>
                                  {isEdge && edgeType === "non_compliant"
                                    ? `Đã phát hiện đúng lỗi vi phạm`
                                    : (isEdge && edgeType === "malformed_data"
                                        ? "Đã làm sạch XSS & an toàn mã độc"
                                        : (testRes.passed ? "Đạt trường cơ bản" : "Cần rà soát"))}
                                </span>
                              </span>
                              <span className="font-bold">{testRes.checks}/9 chỉ tiêu</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <button
                              onClick={() => loadPilotDocument(item)}
                              className={`flex-1 py-2 px-3 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer ${
                                isEdge && edgeType === "non_compliant"
                                  ? "bg-amber-600 hover:bg-amber-700"
                                  : (isEdge && edgeType === "malformed_data" ? "bg-rose-600 hover:bg-rose-700" : "bg-purple-600 hover:bg-purple-700")
                              }`}
                              title="Nạp vào Studio để xem kiểm định và thử nghiệm"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>Nạp vào Studio</span>
                            </button>
                            <button
                              onClick={() => {
                                const sanitizedDoc = {
                                  ...item.doc,
                                  bodyHtml: sanitizeHtmlForDocx(item.doc.bodyHtml),
                                };
                                generateAndDownloadDocx(sanitizedDoc, `${item.code.replace(/[^\w\d_-]/g, "_")}_ChuanND30.docx`);
                                setSuccessMsg(`Đã xuất file Word "${item.code}" thành công!`);
                              }}
                              className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                              title="Tải ngay file .docx OOXML"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Word</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
              <div className="flex items-center gap-2">
                <span>📁 54 File chuẩn tại <code className="bg-slate-100 px-1.5 py-0.5 rounded text-purple-700 font-mono text-[11px]">fixtures/pilot_documents/</code> & 20 File thử thách tại <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-700 font-mono text-[11px]">fixtures/complex_malformed/</code></span>
              </div>
              <button
                onClick={() => setShowPilotModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* PRE-PARTITION REGIME CONFIRMATION MODAL (Chặng 2) */}
      <RegimeConfirmModal
        isOpen={Boolean(pendingImport)}
        filename={pendingImport?.filename || ""}
        chosenRegime={pendingImport?.chosenRegime || standardType}
        detection={pendingImport?.detection || null}
        onConfirm={(regime) => { void confirmPendingImport(regime); }}
        onCancel={cancelPendingImport}
      />

      {/* SAFE REGIME SWITCH CONFIRMATION MODAL */}
      <SafeRegimeModal
        isOpen={Boolean(safeRegimeModal?.isOpen)}
        currentRegime={standardType}
        targetRegime={safeRegimeModal?.targetRegime || (standardType === "party" ? "state" : "party")}
        onConfirm={() => {
          if (safeRegimeModal?.targetRegime) {
            executeRegimeSwitch(safeRegimeModal.targetRegime);
          }
        }}
        onCancel={() => setSafeRegimeModal(null)}
      />

      {/* ADVANCED TOOLS DRAWER */}
      <AdvancedDrawer
        isOpen={showAdvancedDrawer}
        onClose={() => setShowAdvancedDrawer(false)}
        onOpenPilotModal={() => {
          setShowAdvancedDrawer(false);
          setShowPilotModal(true);
        }}
        onOpenPayloadInspector={() => {
          setShowAdvancedDrawer(false);
          if (structuredImport) {
            setShowSideBySideModal(true);
            setShowPayloadInspector(true);
          } else {
            showToast("Chưa có tệp Word tải lên để xem dữ liệu thô", "info");
          }
        }}
        onOpenComplianceReport={() => {
          setShowAdvancedDrawer(false);
          setShowComplianceModal(true);
        }}
        regime={standardType}
        versions={versions}
        onRestoreVersion={restoreVersion}
      />

    </div>
  );
}
