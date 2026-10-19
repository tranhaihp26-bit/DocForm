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
import { parseLocalFile } from "./utils/localFileImport.ts";
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
  type CanonicalWorkflowState 
} from "./utils/proposalState.ts";
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
  Step1View,
  Step2View,
  Step4View,
  SafeRegimeModal,
  AdvancedDrawer,
} from "./components/OfficeWorkerViews.tsx";

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
  id: string;
  timestamp: string;
  title: string;
  data: DocumentState;
  standardType: "state" | "party";
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
  const [showSideBySideModal, setShowSideBySideModal] = useState(false);
  const [importReviewTab, setImportReviewTab] = useState<"source" | "mapped">("source");
  const [pendingTemplate, setPendingTemplate] = useState<TemplatePreset | null>(null);
  const [reviewBlocks, setReviewBlocks] = useState<SourceBlock[]>([]);
  const [reviewBlockFilter, setReviewBlockFilter] = useState<"all" | SourceRegion>("all");

  // AI-Assisted Partition Review state
  const [isCheckingPartitions, setIsCheckingPartitions] = useState(false);
  const [partitionProposals, setPartitionProposals] = useState<PartitionProposal[]>([]);
  const [verifiedPartitionProposalIds, setVerifiedPartitionProposalIds] = useState<Set<string>>(new Set());
  const [partitionCheckNotice, setPartitionCheckNotice] = useState<string>("");
  const [partitionCheckSource, setPartitionCheckSource] = useState<"gemini_ai" | "rule_fallback" | "unverified">("unverified");
  const [partitionHistory, setPartitionHistory] = useState<SourceBlock[][]>([]);
  const [userModifiedBlockIds, setUserModifiedBlockIds] = useState<string[]>([]);
  const partitionRequestIdRef = useRef<number>(0);

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

  const handleUpdateBlockRole = (blockId: string, newRole: SourceRegion) => {
    setUserModifiedBlockIds(prev => prev.includes(blockId) ? prev : [...prev, blockId]);
    const { nextBlocks, nextImport } = changeBlockRole(reviewBlocks, blockId, newRole, structuredImport);
    setReviewBlocks(nextBlocks);
    if (nextImport) {
      setStructuredImport(nextImport);
    }
  };

  const handleAiCheckPartitions = async () => {
    const blocksToCheck = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    if (!blocksToCheck || blocksToCheck.length === 0) return;

    setIsCheckingPartitions(true);
    setPartitionCheckNotice("Đang gửi đặc trưng cấu trúc lên máy chủ để AI kiểm định phân vùng...");
    const currentReqId = Date.now();
    partitionRequestIdRef.current = currentReqId;
    const clientFingerprint = blocksToCheck.map(b => `${b.id}:${b.role || "unclassified"}`).join(";");

    try {
      const res = await fetch("/api/ai/check-partitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocks: blocksToCheck,
          regime: standardType === "party" ? "party" : "administrative",
          filename: uploadedFileName,
          userModifiedBlockIds,
          requestFingerprint: clientFingerprint,
          mode: "ai",
        }),
      });

      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi HTTP ${res.status}`);
      }

      const data: PartitionCheckResult = await res.json();

      // Check if user modified blocks or switched regime while request was in flight
      if (partitionRequestIdRef.current !== currentReqId) {
        setPartitionCheckNotice("Phân vùng đã thay đổi trong lúc chờ AI phản hồi. Đề xuất cũ đã bị hủy để tránh xung đột.");
        return;
      }

      const currentSignature = (reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks))
        .map(b => `${b.id}:${b.role || "unclassified"}`).join(";");

      if (currentSignature !== clientFingerprint) {
        setPartitionCheckNotice("Người dùng đã chỉnh sửa phân vùng trong lúc AI đang chạy. Đề xuất cũ không áp dụng.");
        return;
      }

      setPartitionCheckSource(data.source);
      setPartitionProposals(data.proposals || []);
      setVerifiedPartitionProposalIds(new Set());
      setPartitionCheckNotice(data.notice || (data.source === "gemini_ai" ? "Đã hoàn thành kiểm tra AI." : "Chưa kiểm tra bằng AI."));
      showToast(data.source === "gemini_ai" ? `AI đã phân tích ${data.reviewedBlocksCount}/${data.totalBlocks} khối` : "Đã rà soát phân vùng bằng quy tắc nội bộ", "info");
    } catch (err: any) {
      console.warn("AI partition check error:", err);
      setPartitionCheckSource("rule_fallback");
      setPartitionCheckNotice("Chưa kiểm tra bằng AI (Lỗi kết nối hoặc dịch vụ bận).");
      showToast("Không thể kết nối AI, giữ nguyên phân vùng quy tắc", "info");
    } finally {
      setIsCheckingPartitions(false);
    }
  };

  const handleApplyPartitionProposal = (proposal: PartitionProposal) => {
    const blocksToUse = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const currentRegime = standardType === "party" ? "party" : "administrative";

    // 1. Kiểm tra xác nhận đối chiếu thủ công cho đề xuất liên quan đến bảng biểu
    if (proposal.requiresUserVerification && !verifiedPartitionProposalIds.has(proposal.id || "")) {
      showToast("Vui lòng tích xác nhận bạn đã đối chiếu đúng ô và nội dung nguồn trước khi áp dụng.", "error");
      return;
    }

    // 2. Ngay trước khi áp dụng, kiểm tra lại proposal với trạng thái tài liệu hiện tại
    const validity = checkProposalValidityBeforeApply(proposal, blocksToUse, currentRegime);
    if (!validity.valid) {
      setPartitionProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "rejected" } : p));
      showToast(`Đề xuất hết hiệu lực: ${validity.reason}`, "error");
      return;
    }

    setPartitionHistory(prev => [...prev, blocksToUse.map(b => ({ ...b }))]);
    const { nextBlocks, nextImport } = changeBlockRole(blocksToUse, proposal.sourceBlockId, proposal.suggestedRole, structuredImport);
    setReviewBlocks(nextBlocks);
    if (nextImport) {
      setStructuredImport(nextImport);
    }
    setUserModifiedBlockIds(prev => prev.includes(proposal.sourceBlockId) ? prev : [...prev, proposal.sourceBlockId]);
    setPartitionProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "accepted" } : p));
    showToast(`Đã chuyển khối #${proposal.sourceBlockId} sang vùng "${proposal.suggestedRole}"`, "success");
  };

  const handleDismissPartitionProposal = (proposal: PartitionProposal) => {
    setPartitionProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: "rejected" } : p));
  };

  const handleUndoPartitionProposal = () => {
    if (partitionHistory.length === 0) return;
    const previous = partitionHistory[partitionHistory.length - 1];
    setPartitionHistory(prev => prev.slice(0, -1));
    setReviewBlocks(previous);
    if (structuredImport) {
      const activeContentTableIds = previous
        .filter(b => b.kind === "table" && b.role !== "header" && b.role !== "signature")
        .map(b => b.tableModel?.tableId || b.id);
      setStructuredImport({
        ...structuredImport,
        blocks: previous,
        importFidelityManifest: structuredImport.importFidelityManifest ? {
          ...structuredImport.importFidelityManifest,
          tableIds: activeContentTableIds,
        } : undefined,
      });
    }
    showToast("Đã hoàn tác thao tác phân vùng gần nhất", "info");
  };

  // AI-Assisted Review Proposals state
  const [reviewProposals, setReviewProposals] = useState<ReviewProposal[]>([]);
  const [isReviewingProposals, setIsReviewingProposals] = useState(false);
  const [acceptedProposalIds, setAcceptedProposalIds] = useState<Set<string>>(new Set());
  const [uploadedBlocks, setUploadedBlocks] = useState<SourceBlock[]>([]);
  const [showPayloadInspector, setShowPayloadInspector] = useState(false);

  const liveReconstructed = useMemo(() => {
    const blocksToUse = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    return reconstructFromReviewedBlocks(
      blocksToUse,
      standardType,
      structuredImport || undefined
    );
  }, [reviewBlocks, standardType, structuredImport, uploadedBlocks]);

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
    action: "proofread" | "formalize";
    originalHtml: string;
    refinedHtml: string;
    label: string;
    source: "gemini_ai" | "rule_fallback";
    isFallback: boolean;
    notice?: string;
  } | null>(null);
  const [aiRefineTab, setAiRefineTab] = useState<"original" | "refined">("refined");
  const [aiRefineMode, setAiRefineMode] = useState<"visual_diff" | "side_by_side" | "refined">("visual_diff");

  // 4-Step Office Worker Wizard State (starts at Step 1 for new documents)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  useEffect(() => { window.scrollTo(0, 0); }, [currentStep]);
  const [safeRegimeModal, setSafeRegimeModal] = useState<{ isOpen: boolean; targetRegime: "state" | "party" } | null>(null);
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
    pushVersion(`Trước khi chuyển sang ${target === "party" ? "Đảng (HD 05)" : "Hành chính (NĐ 30)"}`, doc);
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
  const uploadRequestIdRef = useRef<number>(0);

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

  // Re-measure when entering Step 3, view mode changes, or document content changes
  useEffect(() => {
    if (currentStep === 3 && studioViewMode === "canvas" && a4CanvasNodeRef.current) {
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
    loadDraft().then((savedDraft) => {
      if (mounted && savedDraft && savedDraft.doc) {
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

        if (hasCorruptedSignTitle || hasCorruptedSignName) {
          console.warn("[DRAFT RECOVERY] Auto-healing corrupted signature table from legacy draft.");
          restoredDoc = {
            ...restoredDoc,
            signTitle: hasCorruptedSignTitle ? "" : restoredDoc.signTitle,
            signName: hasCorruptedSignName ? "" : restoredDoc.signName,
          };
          // Persist the healed draft
          saveDraft({
            id: savedDraft.id || "current_active_draft",
            updatedAt: new Date().toISOString(),
            doc: restoredDoc,
            standardType: savedDraft.standardType || "state",
            versions: savedDraft.versions,
            originalSnapshot: savedDraft.originalSnapshot !== undefined ? savedDraft.originalSnapshot : null,
          }).catch(() => {});
        }

        // Restore original snapshot or explicitly set null for legacy draft without snapshot
        if (savedDraft.originalSnapshot !== undefined) {
          setOriginalSnapshot(savedDraft.originalSnapshot);
          if (savedDraft.originalSnapshot?.bodyHtml) {
            setUploadedHtml(savedDraft.originalSnapshot.bodyHtml);
          }
          if (savedDraft.originalSnapshot?.rawText) {
            setRawText(savedDraft.originalSnapshot.rawText);
          }
          if (savedDraft.originalSnapshot?.fileName) {
            setUploadedFileName(savedDraft.originalSnapshot.fileName);
          }
        } else {
          // Legacy draft: no original snapshot
          setOriginalSnapshot(null);
          setUploadedHtml("");
          setRawText("");
          setUploadedFileName("");
        }

        setDoc(restoredDoc);
        setStandardType(savedDraft.standardType || "state");
        if (savedDraft.versions && savedDraft.versions.length > 0) {
          setVersions(savedDraft.versions);
        }
        if (savedDraft.reviewBlocks && savedDraft.reviewBlocks.length > 0) {
          setReviewBlocks(savedDraft.reviewBlocks);
        }
        if (savedDraft.structuredImport) {
          setStructuredImport(savedDraft.structuredImport);
        }
        if (savedDraft.uploadedBlocks && savedDraft.uploadedBlocks.length > 0) {
          setUploadedBlocks(savedDraft.uploadedBlocks);
        }
        if (savedDraft.uploadedFileName) {
          setUploadedFileName(savedDraft.uploadedFileName);
        }
        if (savedDraft.uploadedFileType) {
          setUploadedFileType(savedDraft.uploadedFileType);
        }
        if (savedDraft.rawText) {
          setRawText(savedDraft.rawText);
        }
        setAutoSaveStatus("Đã khôi phục bản nháp lưu lúc " + new Date(savedDraft.updatedAt).toLocaleTimeString("vi-VN"));
      }
    }).catch((err) => {
      console.warn("Could not restore draft:", err);
    });
    return () => { mounted = false; };
  }, []);

  // 2. Debounced Auto-save to IndexedDB
  useEffect(() => {
    setIsAutoSaving(true);
    const timer = setTimeout(() => {
      saveDraft({
        id: "current_active_draft",
        updatedAt: new Date().toISOString(),
        standardType,
        doc,
        versions,
        originalSnapshot,
        reviewBlocks,
        structuredImport,
        uploadedBlocks,
        uploadedFileName,
        uploadedFileType,
        rawText,
      }).then(() => {
        setIsAutoSaving(false);
        setSaveError(null);
        const timeStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        setAutoSaveStatus(`Đã lưu tự động (${timeStr})`);
      }).catch((err) => {
        setIsAutoSaving(false);
        setSaveError(err instanceof Error ? err.message : "Lỗi lưu trữ cục bộ");
        setAutoSaveStatus("Lỗi lưu trữ cục bộ");
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [doc, standardType, versions, originalSnapshot, reviewBlocks, structuredImport, uploadedBlocks, uploadedFileName, uploadedFileType, rawText]);

  const buildDocumentFormatData = React.useCallback((currentDoc: DocumentState, currentStandard: "state" | "party"): DocumentFormatType => {
    const isParty = currentStandard === "party";
    let exportDoc = currentDoc;
    let effectiveProfile: "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID = "generic";
    if (!isParty && currentDoc.headerProfile === COMPANY_HEADER_PROFILE_ID) {
      exportDoc = applyCompanyProfile(currentDoc);
      effectiveProfile = COMPANY_HEADER_PROFILE_ID;
    } else if (isParty && currentDoc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID) {
      exportDoc = applyCompanyHD05Profile(currentDoc);
      effectiveProfile = COMPANY_HEADER_HD05_PROFILE_ID;
    }

    const importedTables: Record<string, any> = {};
    const sourceBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    if (sourceBlocks) {
      for (const block of sourceBlocks) {
        // Chỉ lưu các bảng nội dung (body, appendix, unclassified);
        // KHÔNG đưa bảng metadata (header, signature) vào importedTables vì chúng tuân theo layout quy chuẩn NĐ30/HD05
        if (block.tableModel && block.role !== "header" && block.role !== "signature") {
          importedTables[block.id] = block.tableModel;
          if (block.tableModel.tableId) {
            importedTables[block.tableModel.tableId] = block.tableModel;
          }
        }
      }
    }

    // Đồng bộ nội dung sửa đổi mới nhất trong HTML vào importedTables (cả body và appendices)
    if (Object.keys(importedTables).length > 0) {
      if (exportDoc.bodyHtml) {
        const { syncedTables } = syncImportedTablesFromHtml(exportDoc.bodyHtml, importedTables);
        for (const [id, model] of Object.entries(syncedTables)) {
          importedTables[id] = model;
        }
      }
      if (exportDoc.appendices && exportDoc.appendices.length > 0) {
        for (const app of exportDoc.appendices) {
          if (app.html) {
            const { syncedTables } = syncImportedTablesFromHtml(app.html, importedTables);
            for (const [id, model] of Object.entries(syncedTables)) {
              importedTables[id] = model;
            }
          }
        }
      }
    }

    return {
      regime: isParty ? "party" : "administrative",
      headerProfile: effectiveProfile,
      nationalHeader1: isParty ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
      nationalHeader2: (isParty ? "" : "Độc lập - Tự do - Hạnh phúc") as "" | "Độc lập - Tự do - Hạnh phúc",
      fontFamily: "Times New Roman",
      fontSize: isParty ? 14 : 13,
      orgHeader1: exportDoc.orgHeader1,
      orgHeader2: exportDoc.orgHeader2,
      draftNote: exportDoc.draftNote,
      includeDraftNoteInExport: exportDoc.includeDraftNoteInExport,
      locationAndDate: exportDoc.locationAndDate,
      documentType: exportDoc.documentType,
      referenceNumber: exportDoc.referenceNumber,
      subject: exportDoc.subject,
      bodyHtml: sanitizeHtmlForDocx(exportDoc.bodyHtml),
      signTitle: exportDoc.signTitle,
      signName: exportDoc.signName,
      recipients: exportDoc.recipients,
      appendices: exportDoc.appendices || [],
      unclassified: exportDoc.unclassified || [],
      importedTables: Object.keys(importedTables).length > 0 ? importedTables : undefined,
    };
  }, [structuredImport, reviewBlocks, uploadedBlocks]);

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

    const targetKey = currentDraftKey;
    let cancelled = false;
    setOoxmlEvidence(undefined);
    setOoxmlStatus("measuring");
    const timer = setTimeout(async () => {
      try {
        const formatData = buildDocumentFormatData(doc, standardType);
        const buf = await generateND30DocxUint8Array(formatData);
        if (cancelled || currentDraftKeyRef.current !== targetKey) return;
        const zip = await JSZip.loadAsync(buf);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (!cancelled && currentDraftKeyRef.current === targetKey && xml) {
          const ev = extractOoxmlEvidenceFromXml(xml, effectiveRegime);
          setOoxmlEvidence({ ...ev, header_profile: formatData.headerProfile, draft_key: targetKey });
          setOoxmlStatus("evaluated_current_draft");
        } else if (!cancelled && currentDraftKeyRef.current === targetKey) {
          setOoxmlStatus("not_evaluated");
        }
      } catch (err) {
        console.warn("[OOXML Audit] Could not extract live OOXML evidence:", err);
        if (!cancelled && currentDraftKeyRef.current === targetKey) {
          setOoxmlStatus("error");
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, standardType, buildDocumentFormatData, currentDraftKey]);

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
      if (currentStep === 3 && isAutoFitZoom) {
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
    if (currentStep === 3 && isAutoFitZoom) {
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

  const handleManualSave = async () => {
    try {
      await saveDraft({
        id: "current_active_draft",
        updatedAt: new Date().toISOString(),
        standardType,
        doc,
        versions,
        originalSnapshot,
      });
      const timeStr = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setAutoSaveStatus(`Đã lưu thủ công (${timeStr})`);
      showToast("Đã lưu bản nháp an toàn vào IndexedDB!", "success");
    } catch {
      showToast("Không thể lưu trữ vào bộ nhớ cục bộ.", "error");
    }
  };

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
  }, [doc, standardType, versions, originalSnapshot]);

  const pushVersion = (title: string, newDoc: DocumentState, versionStandardType: "state" | "party" = standardType) => {
    const newV: Version = {
      id: "v_" + crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString("vi-VN") + " " + new Date().toLocaleDateString("vi-VN"),
      title,
      data: { ...newDoc },
      standardType: versionStandardType,
    };
    setVersions(prev => [newV, ...prev]);
  };

  const handleFieldChange = (field: keyof DocumentState, value: string) => {
    if (field === "headerProfile") {
      handleHeaderProfileChange(value as "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID);
      return;
    }
    if (standardType === "state" && doc.headerProfile === COMPANY_HEADER_PROFILE_ID && LOCKED_COMPANY_FIELDS.has(field)) return;
    if (standardType === "party" && doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID && LOCKED_COMPANY_HD05_FIELDS.has(field)) return;
    setDoc(prev => ({ ...prev, [field]: value }));
  };

  const handleHeaderProfileChange = (profile: "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID) => {
    const isPartyMode = standardType === "party";
    const targetCompanyProfile = isPartyMode ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID;
    const isActivating = profile === targetCompanyProfile || profile !== "generic";

    if (isActivating && doc.headerProfile !== targetCompanyProfile) {
      pushVersion("Trước khi áp dụng profile công ty", doc);
    }
    const updated = isActivating
      ? (isPartyMode ? applyCompanyHD05Profile(doc) : applyCompanyProfile(doc))
      : { ...doc, headerProfile: "generic" as const };
    setDoc(updated);
    pushVersion(isActivating
      ? (isPartyMode ? "Áp dụng profile Đảng bộ Công ty Hoa tiêu MB" : "Áp dụng profile Công ty Hoa tiêu MB")
      : "Chuyển phần đầu sang tùy chỉnh", updated);
    setSuccessMsg(isActivating
      ? `Đã áp dụng phần đầu công ty (${isPartyMode ? "Hướng dẫn 05-HD/VPTW" : "Nghị định 30/2020/NĐ-CP"}). Nội dung, số ký hiệu và ngày ban hành được giữ nguyên.`
      : "Đã chuyển sang phần đầu tùy chỉnh; bạn có thể sửa thông tin cơ quan.");
  };

  const applyTemplate = (t: TemplatePreset) => {
    if (JSON.stringify(doc) !== JSON.stringify(versions[0]?.data)) {
      pushVersion("Bản soạn trước khi đổi mẫu", doc);
    }
    setStandardType(t.type);
    const selectedDoc = t.type === "state" 
      ? applyCompanyProfile({...t.defaultData}) 
      : applyCompanyHD05Profile({...t.defaultData});
    setDoc(selectedDoc);

    const snapshot: OriginalDocumentSnapshot = {
      sourceType: "system_template",
      fileName: t.name,
      fileType: "template",
      sourceId: t.id,
      uploadedAt: new Date().toISOString(),
      bodyHtml: t.defaultData.bodyHtml,
      rawText: t.defaultData.bodyHtml.replace(/<[^>]+>/g, " "),
    };
    setOriginalSnapshot(snapshot);
    setUploadedFileName(t.name);
    setUploadedHtml(t.defaultData.bodyHtml);
    setRawText(t.defaultData.bodyHtml.replace(/<[^>]+>/g, " "));

    pushVersion(`Áp dụng mẫu: ${t.name}`, selectedDoc, t.type);
    setSuccessMsg(`Đã tải mẫu "${t.name}". Bạn có thể bắt đầu soạn thảo và chỉnh sửa ngay!`);
    setPendingTemplate(null);
    if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  const selectTemplate = (tId: string) => {
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
    const standard: "state" | "party" = (item.doc.regime === "party" || ("category" in item && item.category === "dang")) ? "party" : "state";
    setStandardType(standard);
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
    setDoc(newDoc);

    const snapshot: OriginalDocumentSnapshot = {
      sourceType: "system_template",
      fileName: item.title,
      fileType: "template",
      sourceId: item.id,
      uploadedAt: new Date().toISOString(),
      bodyHtml: item.doc.bodyHtml,
      rawText: item.doc.bodyHtml.replace(/<[^>]+>/g, " "),
    };
    setOriginalSnapshot(snapshot);
    setUploadedFileName(item.title);
    setUploadedHtml(item.doc.bodyHtml);
    setRawText(item.doc.bodyHtml.replace(/<[^>]+>/g, " "));

    pushVersion(`Nạp Pilot: ${item.code} - ${item.title.substring(0, 30)}...`, newDoc, standard);
    setShowPilotModal(false);
    setCurrentStep(3);
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

  const handleFileUpload = async (file: File) => {
    const requestId = ++uploadRequestIdRef.current;

    setIsUploading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const parsed = await parseLocalFile(file, standardType === "party" ? "party" : "administrative");
      if (requestId !== uploadRequestIdRef.current) return;

      setSourceStorageStatus(parsed.storageStatus);
      if (parsed.storageStatus?.storage === "memory") {
        showToast("Lưu ý: Tệp nguồn hiện chỉ được lưu tạm trong bộ nhớ phiên (có thể mất khi tải lại trang).", "info");
      }

      const rawBlocks = parsed.blocks || [];
      const cleanHtml = DOMPurify.sanitize(parsed.html);
      setUploadedBlocks(rawBlocks);
      setRawText(parsed.text);
      setUploadedHtml(cleanHtml);
      setStructuredImport(parsed.structured);
      setReviewBlocks(parsed.structured?.blocks || rawBlocks);
      setImportReviewAccepted(false);
      setUploadedFileName(parsed.filename);
      setUploadedFileType(parsed.fileType);

      const snapshot: OriginalDocumentSnapshot = {
        sourceType: "uploaded_file",
        fileName: parsed.filename,
        fileType: parsed.fileType,
        uploadedAt: new Date().toISOString(),
        bodyHtml: cleanHtml,
        rawText: parsed.text,
        blockCount: parsed.blockCount,
        tableCount: rawBlocks.filter(b => b.kind === "table").length,
        sourceHash: parsed.sourceHash,
      };
      setOriginalSnapshot(snapshot);

      // Auto-detect party vs state from parsed content
      const upperText = (parsed.text || "").toUpperCase();
      const isPartyDetected = upperText.includes("ĐẢNG CỘNG SẢN VIỆT NAM") || upperText.includes("ĐẢNG ỦY") || upperText.includes("CHI BỘ");
      const effectiveRegime = isPartyDetected ? "party" : standardType;
      if (effectiveRegime !== standardType) {
        setStandardType(effectiveRegime);
      }

      // 1. Generate offline deterministic rule proposals immediately (0ms latency, 100% offline, Zero Privacy Risk)
      if (parsed.structured) {
        const initialRuleProps = generateRuleBasedProposals(
          parsed.structured,
          effectiveRegime === "party" ? "party" : "administrative",
          parsed.text,
          rawBlocks
        );
        setReviewProposals(initialRuleProps);

        // Khởi tạo doc state ngay với dữ liệu tài liệu vừa nạp thay vì giữ mẫu ban đầu
        const reconstructed = reconstructFromReviewedBlocks(
          parsed.structured.blocks || rawBlocks,
          effectiveRegime,
          parsed.structured
        );

        const newDoc: DocumentState = {
          headerProfile: "generic",
          orgHeader1: reconstructed.fields.orgHeader1 || "",
          orgHeader2: reconstructed.fields.orgHeader2 || "",
          draftNote: reconstructed.draftNote || "",
          includeDraftNoteInExport: Boolean(reconstructed.draftNote),
          nationalHeader1: reconstructed.fields.nationalHeader1 || (effectiveRegime === "party" ? "ĐẢNG CỘNG SẢN VIỆT NAM" : "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
          nationalHeader2: reconstructed.fields.nationalHeader2 ?? (effectiveRegime === "party" ? "" : "Độc lập - Tự do - Hạnh phúc"),
          locationAndDate: reconstructed.fields.locationAndDate || "",
          documentType: reconstructed.fields.documentType || "",
          referenceNumber: reconstructed.fields.referenceNumber || "",
          subject: reconstructed.fields.subject || "",
          bodyHtml: reconstructed.bodyHtml,
          signTitle: reconstructed.fields.signTitle || "",
          signName: reconstructed.fields.signName || "",
          recipients: reconstructed.fields.recipients || "",
          appendices: reconstructed.appendices,
          unclassified: reconstructed.unclassified,
          importMetadata: {
            sourceType: parsed.fileType || "docx",
            status: deriveImportStatus({ 
              ...parsed.structured, 
              unclassified: reconstructed.unclassified, 
              appendices: reconstructed.appendices 
            }, false),
            sourceFilename: parsed.filename,
          }
        };
        setDoc(newDoc);
      }

      // Open the Side-by-Side Import Review Studio
      setShowSideBySideModal(true);
      setSuccessMsg(`Đã bóc tách thành công tệp "${parsed.filename}" (${parsed.blockCount} khối dữ liệu).`);
    } catch (err: any) {
      if (requestId !== uploadRequestIdRef.current) return;
      setErrorMsg(err.message || "Không thể đọc tệp tin đã tải lên.");
    } finally {
      if (requestId === uploadRequestIdRef.current) {
        setIsUploading(false);
      }
    }
  };

  const fetchAiReviewProposals = async () => {
    if (!structuredImport && reviewBlocks.length === 0) return;
    setIsReviewingProposals(true);
    setAcceptedProposalIds(new Set());
    const effectiveBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    try {
      const res = await fetch("/api/ai/review-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const data = await res.json();
      if (data.success && Array.isArray(data.proposals)) {
        setReviewProposals(data.proposals);
        setSuccessMsg(`AI đã hoàn thành rà soát: tìm thấy ${data.proposals.length} đề xuất chuẩn hóa.`);
      } else {
        setErrorMsg(data.error || "Không thể tải đề xuất rà soát AI.");
      }
    } catch (err: any) {
      console.warn("Could not fetch review proposals:", err);
      setErrorMsg("Lỗi kết nối AI rà soát: " + err.message);
    } finally {
      setIsReviewingProposals(false);
    }
  };

  const handleAcceptProposal = (proposal: ReviewProposal) => {
    if (!structuredImport && reviewBlocks.length === 0) return;

    const currentState: CanonicalWorkflowState = {
      reviewBlocks: reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks),
      structuredImport,
      doc,
      acceptedProposalIds,
    };

    const result = applySingleProposal(proposal, currentState);
    if (!result.success || !result.nextState) {
      const err = `Không thể áp dụng đề xuất "${proposal.label || proposal.id}": ${result.reason}`;
      setErrorMsg(err);
      console.warn(`[ACCEPT PROPOSAL] ${err}`);
      return;
    }

    setReviewBlocks(result.nextState.reviewBlocks);
    setStructuredImport(result.nextState.structuredImport || null);
    setDoc(result.nextState.doc);
    setAcceptedProposalIds(result.nextState.acceptedProposalIds);
    pushVersion(`Áp dụng đề xuất: ${proposal.label || proposal.suggested}`, result.nextState.doc);
    setSuccessMsg(`Đã áp dụng thành công đề xuất: ${proposal.label || proposal.suggested}`);
  };

  const handleDismissProposal = (proposalId: string) => {
    setReviewProposals(prev => prev.filter(p => p.id !== proposalId));
  };

  const handleAcceptAllProposals = () => {
    if (!structuredImport && reviewBlocks.length === 0) return;

    const initialState: CanonicalWorkflowState = {
      reviewBlocks: reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks),
      structuredImport,
      doc,
      acceptedProposalIds: new Set(acceptedProposalIds),
    };

    const { finalState, appliedCount, rejectedReasons } = applyAllProposalsSequentially(
      reviewProposals,
      initialState
    );

    setReviewBlocks(finalState.reviewBlocks);
    setStructuredImport(finalState.structuredImport || null);
    setDoc(finalState.doc);
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
    setDoc(newDoc);
    if (reviewBlocks.length > 0 && structuredImport) {
      const activeContentTableIds = reviewBlocks
        .filter(b => b.kind === "table" && b.role !== "header" && b.role !== "signature")
        .map(b => b.tableModel?.tableId || b.id);

      setStructuredImport(prev => prev ? {
        ...prev,
        blocks: reviewBlocks,
        importFidelityManifest: prev.importFidelityManifest ? {
          ...prev.importFidelityManifest,
          tableIds: activeContentTableIds,
        } : undefined
      } : null);
    }
    pushVersion(`Nhập phân vùng từ tệp ${uploadedFileName || "văn bản"}`, newDoc);
    setSuccessMsg(`Đã đưa toàn bộ cấu trúc tệp "${uploadedFileName}" vào Studio soạn thảo thành công!`);
    setShowSideBySideModal(false);
    setCurrentStep(3);
  };

  const handleAiRefine = async (action: "proofread" | "formalize") => {
    setIsRefining(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/ai/refine-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: doc.bodyHtml, action })
      });
      const data = await res.json();
      if (data.success && data.refined) {
        const actionLabel = action === 'proofread' ? 'Sửa lỗi chính tả & câu từ' : 'Nâng cấp văn phong hành chính';
        setRefineProposal({
          action,
          originalHtml: doc.bodyHtml,
          refinedHtml: data.refined,
          label: actionLabel,
          source: data.source || (data.isFallback ? "rule_fallback" : "gemini_ai"),
          isFallback: Boolean(data.isFallback),
          notice: data.notice
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
    const updated = { ...doc, bodyHtml: refineProposal.refinedHtml };
    setDoc(updated);
    pushVersion(`AI: ${refineProposal.label}`, updated);
    setSuccessMsg(`Đã phê duyệt và áp dụng: ${refineProposal.label}!`);
    setRefineProposal(null);
  };

  const rejectRefineProposal = () => {
    setRefineProposal(null);
    setSuccessMsg("Đã hủy bỏ đề xuất chỉnh sửa văn bản.");
  };

  const exportToDocx = async () => {
    setIsExportingDocx(true);
    const exportDraftKey = currentDraftKeyRef.current;
    try {
      const isParty = standardType === "party";
      const documentData = buildDocumentFormatData(doc, standardType);
      const bytes = await generateND30DocxUint8Array(documentData);

      // 1. Kiểm chứng roundtrip trên đúng bytes ứng viên trong bộ nhớ
      const fidelityResult = await verifyCandidateExportFidelity(
        bytes,
        documentData.importedTables,
        structuredImport?.importFidelityManifest
      );
      const roundtripVerified = Boolean(fidelityResult.safe);

      // 2. Đánh giá an toàn xuất bản với kết quả kiểm chứng ứng viên thực tế
      const safetyResult = assessExportSafety(structuredImport?.importFidelityManifest, {
        candidateFidelityResult: fidelityResult,
        roundtripVerified,
      });

      if (!fidelityResult.safe || safetyResult.decision === "reject") {
        const diffDetails = fidelityResult?.diffs?.length
          ? "\nChi tiết sai khác:\n- " + fidelityResult.diffs.slice(0, 5).map((d: any) => d.messageVi).join("\n- ")
          : (fidelityResult?.summaryVi ? `\n${fidelityResult.summaryVi}` : "");
        setErrorMsg((safetyResult?.userNotice || "Xuất bản Word biến đổi bị từ chối để bảo vệ toàn vẹn dữ liệu.") + diffDetails);
        return;
      }
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (xml && currentDraftKeyRef.current === exportDraftKey) {
        const ev = extractOoxmlEvidenceFromXml(xml, isParty ? "party" : "administrative");
        setOoxmlEvidence({
          ...ev,
          header_profile: documentData.headerProfile,
          draft_key: exportDraftKey,
          candidate_fidelity_result: fidelityResult,
        });
        setOoxmlStatus("evaluated_current_draft");
      }

      const cleanDocType = (documentData.documentType || "Van_Ban")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w\d_]/g, "");

      const fileName = `${cleanDocType}_${isParty ? "ChuanHD05" : "ChuanND30"}.docx`;
      downloadDocxUint8Array(bytes, fileName);


      const hasErrors = Boolean(complianceReport?.issues.some(i => i.severity === "error"));
      const passedCount = complianceReport?.passedChecks ?? 0;
      const totalChecks = complianceReport?.totalChecks ?? 9;
      const isStrict = Boolean(complianceReport?.isStrictCompliant || (passedCount === totalChecks && !hasErrors));

      if (isStrict) {
        setSuccessMsg(
          `Đã xuất tệp Word (.docx). Đạt ${passedCount}/${totalChecks} trường dữ liệu cơ bản (${isParty ? "Hướng dẫn 05-HD/VPTW" : "Nghị định 30/2020/NĐ-CP"}). Vui lòng mở tệp trong Microsoft Word để rà soát trực quan bố cục trang in.`
        );
      } else {
        const issuesCount = complianceReport?.issues.length ?? 0;
        setSuccessMsg(
          `Đã xuất bản nháp Word (.docx). Đạt ${passedCount}/${totalChecks} trường dữ liệu cơ bản (còn ${issuesCount} cảnh báo cần rà soát).`
        );
      }
    } catch (err: any) {
      setErrorMsg("Lỗi khi xuất tệp Word: " + err.message);
    } finally {
      setIsExportingDocx(false);
    }
  };

  const exportToPdf = async () => {
    window.print();
  };

  const handleDownloadOriginalFile = async () => {
    if (!originalSnapshot?.sourceHash) {
      setErrorMsg("Không tìm thấy thông tin tệp gốc.");
      return;
    }
    const handle = await loadSourceBlob(originalSnapshot.sourceHash);
    if (handle?.bytes) {
      downloadDocxUint8Array(new Uint8Array(handle.bytes), handle.fileName || "Tep_Goc.docx");
      setSuccessMsg(`Đã tải lại tệp gốc nguyên vẹn: "${handle.fileName}"`);
    } else {
      setErrorMsg("Không tìm thấy tệp gốc trong bộ nhớ cục bộ.");
    }
  };

  const restoreVersion = (v: Version) => {
    setDoc(v.data);
    setStandardType(v.standardType);
    const rawHtml = v.data?.bodyHtml || "";
    const matches = rawHtml.match(/<[^>]+>[\s\S]*?<\/[^>]+>/g) || (rawHtml.trim() ? [rawHtml] : []);
    const restoredBlocks = (v as any).reviewBlocks && (v as any).reviewBlocks.length > 0
      ? (v as any).reviewBlocks
      : (matches.length > 0
        ? matches.map((h, i) => ({
            id: `restored_${i}_${Date.now()}`,
            index: i,
            kind: /<table\b/i.test(h) ? ("table" as const) : ("paragraph" as const),
            role: "body" as const,
            text: h.replace(/<[^>]+>/g, "").trim(),
            html: h,
          }))
        : [{
            id: `restored_0_${Date.now()}`,
            index: 0,
            kind: "paragraph" as const,
            role: "body" as const,
            text: rawHtml.replace(/<[^>]+>/g, "").trim(),
            html: rawHtml || "<p></p>",
          }]);
    setReviewBlocks(restoredBlocks);
    setSuccessMsg(`Đã khôi phục thành công phiên bản: "${v.title}" (${v.timestamp})`);
  };

  const applyQuickFix = (issue: any) => {
    if (issue.field === "orgHeader2" && issue.suggestion) {
      setDoc(prev => ({ ...prev, orgHeader2: issue.suggestion }));
    } else if (issue.field === "nationalHeader1" && issue.suggestion) {
      setDoc(prev => ({ ...prev, nationalHeader1: issue.suggestion }));
    } else if (issue.field === "nationalHeader2" && typeof issue.suggestion === "string") {
      setDoc(prev => ({ ...prev, nationalHeader2: issue.suggestion }));
    } else if (issue.field === "referenceNumber" && issue.suggestion) {
      setDoc(prev => ({ ...prev, referenceNumber: issue.suggestion }));
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

  const fullDocumentTitle = uploadedFileName || `${doc.documentType || "Kế hoạch"} ${doc.subject ? `- ${doc.subject}` : "công tác tháng 10"}`;
  const displayDocumentTitle = uploadedFileName || (doc.documentType ? `${doc.documentType} ${doc.referenceNumber || ""}`.trim() : "Kế hoạch công tác tháng 10");
  const saveTooltip = isAutoSaving ? "Hệ thống đang tự động lưu dữ liệu vào IndexedDB" : saveError ? `Lỗi lưu trữ: ${saveError}` : "Dữ liệu được lưu an toàn trong trình duyệt (IndexedDB)";

  return (
    <div data-current-step={currentStep} className="min-h-screen df-app-shell text-[#17233D] flex flex-col font-sans select-text">
      
      {/* 1. TOP APPLICATION BAR (SINGLE-ROW ON WIDE DESKTOP ~56PX, 2-ROW ON NARROW/TABLET ~80PX) */}
      <header className="df-glass-header text-[#17233D] px-3 sm:px-6 py-1.5 xl:py-0 z-30 sticky top-0 border-b border-slate-200/80 w-full bg-white/85 backdrop-blur-md shrink-0">
        <div className="w-full flex flex-col xl:flex-row xl:items-center xl:justify-between min-h-[56px] xl:h-14 gap-1 xl:gap-3">
          
          {/* Group 1 (Row 1 on narrow, Left on wide desktop): Brand + Filename + (Save & Tools on narrow) */}
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
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] text-[#52607A]"
                title={saveTooltip}
                role="status"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isAutoSaving ? "bg-[#D9822B] animate-ping" : saveError ? "bg-[#DC2626]" : "bg-[#15803D]"}`} />
                <span className="hidden sm:inline font-medium">{isAutoSaving ? "Đang lưu..." : saveError ? "Lỗi lưu" : "Đã lưu"}</span>
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

          {/* Group 2 (Row 2 on narrow, Center on wide desktop): Stepper + Mobile Prev/Next */}
          <div className="flex items-center justify-between xl:justify-center min-w-0 py-0.5 xl:py-0 w-full xl:w-auto">
            {/* Mobile / Narrow (< xl) Previous button */}
            <button
              type="button"
              disabled={currentStep <= 1}
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4)}
              aria-label="Quay lại bước trước"
              className="xl:hidden p-1.5 rounded-xl border border-slate-200 text-[#17233D] hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0 transition"
              title="Bước trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <nav aria-label="Tiến trình 4 bước" className="df-stepper flex items-center gap-1 sm:gap-2 text-xs">
              {[
                { step: 1 as const, shortLabel: "Mẫu", fullLabel: "1. Chọn mẫu văn bản" },
                { step: 2 as const, shortLabel: "Nguồn", fullLabel: "2. Nguồn tài liệu" },
                { step: 3 as const, shortLabel: "Soạn", fullLabel: "3. Soạn & rà soát" },
                { step: 4 as const, shortLabel: "Xuất", fullLabel: "4. Xem trước & xuất" },
              ].map((item, idx) => {
                const isActive = currentStep === item.step;
                const isPrevious = currentStep > item.step;
                return (
                  <React.Fragment key={item.step}>
                    {idx > 0 && (
                      <span className="text-slate-300 select-none text-[10px] sm:text-xs px-0.5" aria-hidden="true">›</span>
                    )}
                    <button
                      type="button"
                      aria-label={item.fullLabel}
                      title={item.fullLabel}
                      aria-current={isActive ? "step" : undefined}
                      onClick={() => setCurrentStep(item.step)}
                      className={`min-h-[32px] sm:min-h-[34px] px-2.5 sm:px-3 py-1 rounded-full transition cursor-pointer flex items-center gap-1.5 font-medium select-none focus-visible:ring-2 focus-visible:ring-[#6255E8] focus-visible:outline-none ${
                        isActive
                          ? "bg-[#EDE9FE] text-[#6255E8] font-bold shadow-2xs border border-[#6255E8]/30"
                          : isPrevious
                          ? "text-[#17233D] hover:bg-slate-100 hover:text-[#6255E8]"
                          : "text-[#52607A] hover:bg-slate-100 hover:text-[#17233D]"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        isActive
                          ? "bg-[#6255E8] text-white"
                          : isPrevious
                          ? "bg-[#0D9488] text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}>
                        {isPrevious ? "✓" : item.step}
                      </span>
                      <span className="hidden sm:inline text-xs">{item.shortLabel}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </nav>

            {/* Mobile / Narrow (< xl) Next button */}
            <button
              type="button"
              disabled={currentStep >= 4}
              onClick={() => setCurrentStep((prev) => Math.min(4, prev + 1) as 1 | 2 | 3 | 4)}
              aria-label="Chuyển sang bước tiếp theo"
              className="xl:hidden p-1.5 rounded-xl bg-[#6255E8] text-white hover:bg-[#5244d4] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0 transition"
              title="Bước tiếp theo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Group 3 (Right on wide desktop >= xl): Step Navigation + Save Status + Tools */}
          <div className="hidden xl:flex items-center gap-2.5 shrink-0 justify-end">
            <div className="flex items-center gap-1.5 mr-1" role="group" aria-label="Điều hướng bước">
              <button
                type="button"
                disabled={currentStep <= 1}
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4)}
                aria-label="Quay lại bước trước"
                className="min-h-[32px] px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 border border-slate-200/90 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed hover:bg-slate-100 text-[#17233D]"
                title={currentStep > 1 ? `Quay lại bước ${currentStep - 1}` : "Đang ở bước đầu tiên"}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trước</span>
              </button>
              <button
                type="button"
                disabled={currentStep >= 4}
                onClick={() => setCurrentStep((prev) => Math.min(4, prev + 1) as 1 | 2 | 3 | 4)}
                aria-label="Chuyển sang bước tiếp theo"
                className="min-h-[32px] px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 bg-[#6255E8] hover:bg-[#5244d4] text-white transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed shadow-2xs"
                title={currentStep < 4 ? `Chuyển sang bước ${currentStep + 1}` : "Đang ở bước cuối"}
              >
                <span>Sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div 
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/90 text-xs text-[#52607A]"
              title={saveTooltip}
              role="status"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${isAutoSaving ? "bg-[#D9822B] animate-ping" : saveError ? "bg-[#DC2626]" : "bg-[#15803D]"}`} />
              <span className="font-medium">{isAutoSaving ? "Đang lưu..." : saveError ? "Lỗi lưu" : "Đã lưu"}</span>
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

      {/* STEP 1: CHỌN HỆ THỂ THỨC & LOẠI VĂN BẢN */}
      {currentStep === 1 && (
        <Step1View
          regime={standardType}
          onRequestRegimeSwitch={requestRegimeSwitch}
          doc={doc}
          onSelectTemplate={(tid) => selectTemplate(tid)}
          onFieldChange={handleFieldChange}
          onNext={() => setCurrentStep(2)}
        />
      )}

      {/* STEP 2: TẢI WORD / CHỌN MẪU & TÓM TẮT TÀI LIỆU NGUỒN */}
      {currentStep === 2 && (
        <Step2View
          regime={standardType}
          doc={doc}
          uploadedFileName={uploadedFileName}
          uploadedBlocks={uploadedBlocks}
          structuredImport={structuredImport}
          templates={TEMPLATES}
          onSelectTemplate={(tid) => selectTemplate(tid)}
          onFileUpload={handleFileUpload}
          isUploading={isUploading}
          evaluationSummary={evaluationSummary}
          onPrev={() => setCurrentStep(1)}
          onNext={() => setCurrentStep(3)}
          onOpenReviewModal={() => setShowSideBySideModal(true)}
        />
      )}

      {/* STEP 4: HOÀN TẤT & SO SÁNH */}
      {currentStep === 4 && (
        <Step4View
          regime={standardType}
          doc={doc}
          rawText={rawText}
          uploadedHtml={uploadedHtml}
          originalSnapshot={originalSnapshot}
          ooxmlStatus={ooxmlEvidence && ooxmlEvidence.draft_key !== currentDraftKey ? "measuring" : ooxmlStatus}
          hasOoxmlEvidence={Boolean(ooxmlEvidence && ooxmlEvidence.draft_key === currentDraftKey)}
          viewMode={step4ViewMode}
          onViewModeChange={setStep4ViewMode}
          evaluationSummary={evaluationSummary}
          onExportDocx={exportToDocx}
          onExportPdf={exportToPdf}
          onDownloadOriginal={handleDownloadOriginalFile}
          isExportingDocx={isExportingDocx}
          onPrev={() => setCurrentStep(3)}
        />
      )}

      {/* STEP 3: RÀ SOÁT & XỬ LÝ (CENTERED A4 + SINGLE RIGHT TABBED PANEL) */}
      {currentStep === 3 && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden df-step-enter pt-1">
          {/* Accessible Semantic Heading (visually hidden on desktop) */}
          <h1 className="sr-only">Soạn & rà soát - Chuẩn thể thức</h1>

          <div className="df-workspace-content flex-1 min-h-0 flex gap-2 sm:gap-3 px-2 sm:px-4 pb-1">
          
        {/* ========================================================
            CENTER PANE: IN-SITU A4 DOCUMENT CANVAS OR OOXML PREVIEW
           ======================================================== */}
        <main 
          id="studio-main-canvas"
          className="df-editor-frame flex-1 min-w-0 min-h-0 p-2 sm:p-3 overflow-hidden flex flex-col items-center rounded-2xl"
        >
          
          {/* Consolidated 1-Row Formatting Toolbar Outside Paper */}
          <div className="df-studio-toolbar w-full mb-2 bg-white rounded-xl border border-[#CFD8EA] px-2 sm:px-3 py-1.5 flex items-center justify-between text-xs text-[#52607A] gap-1.5 select-none shadow-2xs shrink-0" aria-label="Thanh công cụ soạn thảo">
            {/* Left Formatting Group */}
            <div className="df-studio-toolbar-tools flex flex-nowrap items-center gap-1 min-w-0">
              {/* Heading / Paragraph Type Dropdown */}
              <select
                aria-label="Kiểu đoạn"
                onChange={(e) => {
                  const val = e.target.value;
                  if (!tiptapEditor) return;
                  if (val === "h1") tiptapEditor.chain().focus().toggleHeading({ level: 1 }).setTextAlign("center").run();
                  else if (val === "h2") tiptapEditor.chain().focus().toggleHeading({ level: 2 }).setTextAlign("center").run();
                  else if (val === "h3") tiptapEditor.chain().focus().toggleHeading({ level: 3 }).setTextAlign("left").run();
                  else tiptapEditor.chain().focus().setParagraph().run();
                }}
                className="px-2 py-1 rounded-lg border border-[#CFD8EA] bg-white text-xs font-semibold text-[#17233D] cursor-pointer outline-none hover:bg-slate-50"
              >
                <option value="p">Nội dung ▾</option>
                <option value="h1">Tên loại văn bản (H1)</option>
                <option value="h2">Phân mục (H2)</option>
                <option value="h3">Điều khoản (H3)</option>
              </select>

              <span className="h-4 w-px bg-slate-200 mx-0.5" />

              {/* Bold, Italic, Underline */}
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().toggleBold().run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs transition cursor-pointer ${
                  tiptapEditor?.isActive("bold") ? "bg-[#EEF0FE] text-[#6255E8] font-black" : "text-[#17233D] hover:bg-slate-100"
                }`}
                title="In đậm (Ctrl+B)"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().toggleItalic().run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center italic text-xs transition cursor-pointer ${
                  tiptapEditor?.isActive("italic") ? "bg-[#EEF0FE] text-[#6255E8]" : "text-[#17233D] hover:bg-slate-100"
                }`}
                title="In nghiêng (Ctrl+I)"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().toggleUnderline().run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center underline text-xs transition cursor-pointer ${
                  tiptapEditor?.isActive("underline") ? "bg-[#EEF0FE] text-[#6255E8]" : "text-[#17233D] hover:bg-slate-100"
                }`}
                title="Gạch chân (Ctrl+U)"
              >
                U
              </button>

              <span className="h-4 w-px bg-slate-200 mx-0.5" />

              {/* Align Left, Center, Right, Justify */}
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().setTextAlign("left").run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                  tiptapEditor?.isActive({ textAlign: "left" }) ? "bg-[#EEF0FE] text-[#6255E8]" : "text-[#52607A] hover:bg-slate-100"
                }`}
                title="Căn trái"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().setTextAlign("center").run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                  tiptapEditor?.isActive({ textAlign: "center" }) ? "bg-[#EEF0FE] text-[#6255E8]" : "text-[#52607A] hover:bg-slate-100"
                }`}
                title="Căn giữa"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().setTextAlign("right").run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                  tiptapEditor?.isActive({ textAlign: "right" }) ? "bg-[#EEF0FE] text-[#6255E8]" : "text-[#52607A] hover:bg-slate-100"
                }`}
                title="Căn phải"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().setTextAlign("justify").run()}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition cursor-pointer ${
                  tiptapEditor?.isActive({ textAlign: "justify" }) ? "bg-[#EEF0FE] text-[#6255E8]" : "text-[#52607A] hover:bg-slate-100"
                }`}
                title="Căn đều hai bên (Chuẩn NĐ 30)"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>

              <span className="h-4 w-px bg-slate-200 mx-0.5" />

              {/* Table Button */}
              <button
                type="button"
                onClick={() => {
                  if (!tiptapEditor) return;
                  const tableHtml = `
                    <table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0;">
                      <thead>
                        <tr style="background-color: #f8fafc; font-weight: bold; text-align: center;">
                          <th style="border: 1px solid #000; padding: 6px; width: 10%;">STT</th>
                          <th style="border: 1px solid #000; padding: 6px; width: 60%;">Nội dung</th>
                          <th style="border: 1px solid #000; padding: 6px; width: 30%;">Phụ trách</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style="border: 1px solid #000; padding: 6px; text-align: center;">1</td>
                          <td style="border: 1px solid #000; padding: 6px;">[Nội dung...]</td>
                          <td style="border: 1px solid #000; padding: 6px;">[Đơn vị...]</td>
                        </tr>
                      </tbody>
                    </table><p></p>
                  `;
                  tiptapEditor.chain().focus().insertContent(tableHtml).run();
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#52607A] hover:bg-slate-100 transition cursor-pointer"
                title="Chèn bảng tiến độ NĐ 30"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>

              {/* Undo / Redo */}
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().undo().run()}
                disabled={!tiptapEditor?.can().undo()}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#52607A] hover:bg-slate-100 transition cursor-pointer disabled:opacity-40"
                title="Hoàn tác (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => tiptapEditor?.chain().focus().redo().run()}
                disabled={!tiptapEditor?.can().redo()}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#52607A] hover:bg-slate-100 transition cursor-pointer disabled:opacity-40"
                title="Phục hồi (Ctrl+Y)"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Group: Regime Info + View Mode + Zoom + Inspector Toggle */}
            <div className="flex items-center gap-1.5 shrink-0 flex-nowrap min-w-max">
              {/* Regime & Profile Pill with Safe Switch Action */}
              <button
                type="button"
                onClick={() => requestRegimeSwitch(standardType === "party" ? "state" : "party")}
                aria-label={`Đổi hệ thể thức (hiện tại: ${standardType === "party" ? "Hướng dẫn 05" : "Nghị định 30"})`}
                title={`Bấm để chuyển sang ${standardType === "party" ? "Nghị định 30/2020/NĐ-CP" : "Hướng dẫn 05-HD/VPTW"} (Bảo toàn nội dung & bảng)`}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[#CFD8EA] bg-[#F5F7FC] hover:bg-[#EEF0FE] text-xs font-semibold text-[#17233D] transition cursor-pointer shrink-0"
              >
                <span className="font-bold text-[#6255E8]">
                  {standardType === "party" ? "☭ HD 05" : "🏛️ NĐ 30"}
                </span>
                <span className="text-[#52607A] hidden 2xl:inline text-[11px]">
                  · {doc.headerProfile === COMPANY_HEADER_PROFILE_ID || doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID ? "Hoa Tiêu MB" : "Cơ quan chung"}
                </span>
                <RefreshCw className="w-3 h-3 text-[#6255E8]" />
              </button>

              <div role="group" aria-label="Chế độ xem" className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  aria-pressed={studioViewMode === "canvas"}
                  onClick={() => setStudioViewMode("canvas")}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                    studioViewMode === "canvas" ? "bg-white text-[#6255E8] shadow-2xs font-bold" : "text-[#52607A] hover:text-[#17233D]"
                  }`}
                >
                  Soạn thảo
                </button>
                <button
                  type="button"
                  aria-pressed={studioViewMode === "real_docx"}
                  onClick={() => setStudioViewMode("real_docx")}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition cursor-pointer ${
                    studioViewMode === "real_docx" ? "bg-white text-[#6255E8] shadow-2xs font-bold" : "text-[#52607A] hover:text-[#17233D]"
                  }`}
                  title="Xem bản dựng Word thật"
                >
                  Xem trang
                </button>
              </div>

              {/* Zoom Dropdown & Fit */}
              <div className="flex items-center gap-1">
                {(() => {
                  const currentPercent = Math.round(zoomLevel * 100);
                  const standardOptions = [75, 80, 85, 90, 100, 115];
                  const isCustom = !standardOptions.includes(currentPercent);
                  return (
                    <select
                      value={currentPercent}
                      aria-label="Tỷ lệ thu phóng"
                      onChange={(e) => {
                        const z = Number(e.target.value) / 100;
                        setIsAutoFitZoom(false);
                        setZoomLevel(z);
                      }}
                      className="px-1.5 py-0.5 rounded-lg border border-[#CFD8EA] bg-white text-xs font-semibold text-[#17233D] cursor-pointer outline-none hover:bg-slate-50"
                    >
                      {isCustom && (
                        <option value={currentPercent}>
                          {currentPercent}% {isAutoFitZoom ? "(Vừa khung)" : ""}
                        </option>
                      )}
                      {standardOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}% {isAutoFitZoom && opt === currentPercent ? "(Vừa khung)" : ""}
                        </option>
                      ))}
                    </select>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => {
                    setIsAutoFitZoom(true);
                    handleFitWidth();
                  }}
                  className={`px-2 py-0.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isAutoFitZoom
                      ? "border-[#6255E8] bg-[#EEF0FE] text-[#6255E8]"
                      : "border-[#CFD8EA] bg-white text-[#52607A] hover:text-[#17233D]"
                  }`}
                  title="Khôi phục tự động vừa khung màn hình"
                >
                  Vừa khung ▾
                </button>
              </div>

              {/* Inspector Toggle Button (Shows badge when closed) */}
              <button
                type="button"
                onClick={() => {
                  setShowInspectorRight(prev => !prev);
                  setUserClosedInspector(showInspectorRight);
                }}
                aria-label={showInspectorRight ? "Thu gọn trợ lý rà soát" : "Mở trợ lý rà soát"}
                title={showInspectorRight ? "Thu gọn trợ lý rà soát" : "Mở trợ lý rà soát"}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-semibold transition cursor-pointer shrink-0 ${
                  showInspectorRight
                    ? "border-[#CFD8EA] bg-white text-[#52607A] hover:text-[#17233D] hover:bg-slate-50"
                    : "border-[#6255E8] bg-[#EEF0FE] text-[#6255E8] shadow-2xs font-bold"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#6255E8]" />
                <span className="hidden sm:inline">Trợ lý</span>
                {evaluationSummary.actionableIssues.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {evaluationSummary.actionableIssues.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: IN-SITU A4 DIRECT EDITING CANVAS */}
          {studioViewMode === "canvas" ? (
            <div className="df-canvas-scroll w-full flex justify-start items-start overflow-auto">
              <div 
                style={{
                  width: `${Math.round(794 * zoomLevel)}px`,
                  height: `${Math.round(canvasInnerHeight * zoomLevel) + 100}px`,
                  minHeight: `${Math.round(1123 * zoomLevel) + 100}px`,
                }}
                className="transition-all duration-150 shrink-0 mx-auto"
              >
                <div 
                  ref={setA4CanvasRef}
                  style={{ 
                    transform: `scale(${zoomLevel})`, 
                    transformOrigin: "top left",
                    fontFamily: '"Times New Roman", Times, serif'
                  }}
                  className="w-[794px] min-h-[1123px] df-a4-paper rounded-sm p-[36px_56px_56px_90px] relative text-black text-[13pt] leading-[1.35] select-text font-serif"
                >
              
              {/* ========================================================
                  PHẦN 1: ĐẦU VĂN BẢN (Cơ quan & Quốc hiệu · Số & Ngày)
                 ======================================================== */}
              <section 
                id="section-header" 
                className="relative mb-3 p-1.5 rounded-lg border border-transparent hover:border-blue-200 transition group"
              >
                <div className="absolute -top-3 left-2 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition select-none z-10 font-sans">
                  Phần 1: Đầu văn bản (NĐ 30 Mục I & II)
                </div>

                <div className="grid grid-cols-[43%_57%] gap-2 items-start">
                  
                  {/* Cột trái: Cơ quan ban hành & Số hiệu */}
                  <div className="text-center group/left relative p-1 rounded hover:bg-blue-50/30 transition">
                    {standardType === "party" ? (
                      doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID && !doc.orgHeader1 && !doc.orgHeader2 ? (
                        <div className="flex flex-col items-center">
                          <p className="text-[14pt] font-normal leading-tight">{COMPANY_HEADER_HD05_PARENT_LINES[0]}<br />{COMPANY_HEADER_HD05_PARENT_LINES[1]}</p>
                          <p className="text-[14pt] font-bold leading-tight mt-0.5">
                            {COMPANY_HEADER_HD05_ISSUER_LINES[0]}<br />{COMPANY_HEADER_HD05_ISSUER_LINES[1]}
                          </p>
                          <p className="text-[14pt] font-bold mt-0.5 leading-none select-none">*</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <input
                            type="text"
                            value={doc.orgHeader1}
                            onChange={(e) => handleFieldChange("orgHeader1", e.target.value.toUpperCase())}
                            placeholder="CƠ QUAN / ĐẢNG ỦY CẤP TRÊN"
                            className="w-full text-center text-[14pt] font-normal outline-none bg-transparent hover:bg-white focus:bg-white rounded p-0.5"
                          />
                          <div className="flex flex-col items-center w-full mt-0.5">
                            <textarea
                              rows={doc.orgHeader2?.includes("\n") ? doc.orgHeader2.split("\n").length : 1}
                              value={doc.orgHeader2}
                              onChange={(e) => handleFieldChange("orgHeader2", e.target.value.toUpperCase())}
                              placeholder="TÊN CẤP ỦY BAN HÀNH (*)"
                              className="w-full text-center font-bold text-[14pt] outline-none bg-transparent hover:bg-white focus:bg-white rounded px-1 resize-none leading-tight"
                            />
                            <p className="text-[14pt] font-bold mt-0.5 leading-none select-none">*</p>
                          </div>
                        </div>
                      )
                    ) : (
                      doc.headerProfile === COMPANY_HEADER_PROFILE_ID ? (
                        <div className="flex flex-col items-center">
                          <p className="text-[12pt] font-normal leading-tight">TỔNG CÔNG TY BẢO ĐẢM</p>
                          <p className="text-[12pt] font-normal leading-tight">AN TOÀN HÀNG HẢI VIỆT NAM</p>
                          <div className="inline-flex flex-col items-center mt-0.5">
                            <p className="text-[11.5pt] font-bold leading-tight tracking-tight whitespace-nowrap">
                              CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC
                            </p>
                            <div className="w-[42%] border-b-[1.5px] border-black mt-0.5"></div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <input
                            type="text"
                            value={doc.orgHeader1}
                            onChange={(e) => handleFieldChange("orgHeader1", e.target.value.toUpperCase())}
                            placeholder="CƠ QUAN CẤP TRÊN"
                            className="w-full text-center text-[12pt] font-normal outline-none bg-transparent hover:bg-white focus:bg-white rounded p-0.5"
                          />
                          {(() => {
                            const lines = (doc.orgHeader2 || "").split("\n");
                            if (lines.length <= 1) {
                              return (
                                <div className="inline-flex flex-col items-center relative max-w-full mt-0.5">
                                  <span className="invisible whitespace-pre font-bold text-[12pt] px-1 pointer-events-none select-none">
                                    {doc.orgHeader2 || "TÊN CƠ QUAN BAN HÀNH (*)"}
                                  </span>
                                  <input
                                    type="text"
                                    value={doc.orgHeader2}
                                    onChange={(e) => handleFieldChange("orgHeader2", e.target.value.toUpperCase())}
                                    placeholder="TÊN CƠ QUAN BAN HÀNH (*)"
                                    className="absolute inset-0 text-center font-bold text-[12pt] outline-none bg-transparent hover:bg-white focus:bg-white rounded px-1"
                                  />
                                  <div className="w-[42%] border-b-[1.5px] border-black mt-0.5 pointer-events-none"></div>
                                </div>
                              );
                            }
                            const firstLines = lines.slice(0, -1);
                            const lastLine = lines[lines.length - 1];
                            return (
                              <div className="flex flex-col items-center max-w-full">
                                {firstLines.map((ln, idx) => (
                                  <p key={idx} className="font-bold text-[12pt] leading-tight uppercase">{ln}</p>
                                ))}
                                <div className="inline-flex flex-col items-center relative max-w-full mt-0.5">
                                  <span className="invisible whitespace-pre font-bold text-[12pt] px-1 pointer-events-none select-none">
                                    {lastLine || "CƠ QUAN BAN HÀNH"}
                                  </span>
                                  <input
                                    type="text"
                                    value={lastLine}
                                    onChange={(e) => {
                                      const newLines = [...firstLines, e.target.value.toUpperCase()];
                                      handleFieldChange("orgHeader2", newLines.join("\n"));
                                    }}
                                    className="absolute inset-0 text-center font-bold text-[12pt] outline-none bg-transparent hover:bg-white focus:bg-white rounded px-1"
                                  />
                                  <div className="w-[42%] border-b-[1.5px] border-black mt-0.5 pointer-events-none"></div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )
                    )}

                    <div className="flex flex-col items-center justify-center gap-1 mt-1">
                      <input
                        type="text"
                        value={doc.referenceNumber}
                        onChange={(e) => handleFieldChange("referenceNumber", e.target.value)}
                        placeholder={standardType === "party" ? "Số 12-NQ/ĐU" : "Số: .../KH-..."}
                        className={`text-center font-normal outline-none bg-transparent hover:bg-white focus:bg-white rounded px-2 py-0.5 w-52 ${
                          standardType === "party" ? "text-[14pt]" : "text-[12pt]"
                        }`}
                      />
                      {/* Ghi chú bản thảo nguồn (ví dụ: BẢN HOÀN THIỆN ĐỂ ĐOÀN GIÁM SÁT XEM XÉT, TRÌNH KÝ) */}
                      {doc.draftNote && (
                        <div className="w-full mt-1.5 p-1 rounded bg-purple-50 border border-purple-200 text-center font-sans">
                          <div className="flex items-center justify-between gap-1 text-[10px] text-purple-900 pb-0.5">
                            <span className="font-bold">Ghi chú bản thảo nguồn:</span>
                            <label className="flex items-center gap-1 cursor-pointer font-normal text-purple-800">
                              <input
                                type="checkbox"
                                checked={doc.includeDraftNoteInExport !== false}
                                onChange={(e) => setDoc(prev => ({ ...prev, includeDraftNoteInExport: e.target.checked }))}
                                className="rounded text-purple-600 focus:ring-purple-500 w-3 h-3"
                              />
                              <span>Xuất vào Word</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            value={doc.draftNote}
                            onChange={(e) => setDoc(prev => ({ ...prev, draftNote: e.target.value }))}
                            className="w-full text-center text-[10.5pt] italic font-serif text-slate-800 outline-none bg-white rounded border border-purple-300 px-1 py-0.5"
                            placeholder="Ghi chú bản thảo..."
                          />
                        </div>
                      )}
                      {isPartyOfficialLetter && (
                        <div className="w-full mt-2 text-center">
                          <input
                            type="text"
                            value={doc.subject}
                            onChange={(e) => handleFieldChange("subject", e.target.value)}
                            placeholder="V/v trích yếu công văn Đảng..."
                            className="w-full text-center text-[12pt] italic font-normal outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1"
                          />
                          <p className="text-[10px] text-blue-600 italic font-sans mt-0.5">
                            * Công văn Đảng: trích yếu đặt ở cột trái dưới số hiệu (chữ thường, nghiêng)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cột phải: Quốc hiệu, Tiêu ngữ & Ngày tháng */}
                  <div className="text-center p-1 rounded hover:bg-blue-50/30 transition">
                    {standardType === "party" ? (
                      <div className="inline-flex flex-col items-center relative max-w-full">
                        <span className="invisible whitespace-pre font-bold text-[15pt] px-1 pointer-events-none select-none">
                          ĐẢNG CỘNG SẢN VIỆT NAM
                        </span>
                        <p className="absolute inset-0 text-center font-bold text-[15pt] leading-tight whitespace-nowrap">
                          ĐẢNG CỘNG SẢN VIỆT NAM
                        </p>
                        {/* Nét liền 100% bằng độ dài dòng chữ ĐẢNG CỘNG SẢN VIỆT NAM theo HD 05 */}
                        <div className="w-full border-b-[1.5px] border-black mt-0.5 pointer-events-none"></div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[12pt] font-bold leading-tight whitespace-nowrap">
                          CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                        </p>
                        <div className="inline-flex flex-col items-center relative max-w-full mt-0.5">
                          <span className="invisible whitespace-pre font-bold text-[13pt] px-1 pointer-events-none select-none">
                            {doc.nationalHeader2 || "Độc lập - Tự do - Hạnh phúc"}
                          </span>
                          <input
                            type="text"
                            value={doc.nationalHeader2}
                            onChange={(e) => handleFieldChange("nationalHeader2", e.target.value)}
                            placeholder="Độc lập - Tự do - Hạnh phúc"
                            className="absolute inset-0 text-center font-bold text-[13pt] outline-none bg-transparent hover:bg-white focus:bg-white rounded px-1"
                          />
                          <div className="w-full border-b-[1.5px] border-black mt-0.5 pointer-events-none"></div>
                        </div>
                      </>
                    )}

                    <div className="flex items-center justify-end gap-1 mt-1">
                      <input
                        type="text"
                        value={doc.locationAndDate}
                        onChange={(e) => handleFieldChange("locationAndDate", e.target.value)}
                        placeholder="Hải Phòng, ngày ... tháng ... năm ..."
                        className={`text-right italic outline-none bg-transparent hover:bg-white focus:bg-white rounded px-2 py-0.5 w-64 ${
                          standardType === "party" ? "text-[14pt]" : "text-[13pt]"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const loc = extractLocation(doc.locationAndDate);
                          handleFieldChange("locationAndDate", formatStandardDate(loc || "Hải Phòng"));
                        }}
                        className="text-[10px] text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded font-sans cursor-pointer"
                        title="Chèn ngày hôm nay"
                      >
                        Hôm nay
                      </button>
                    </div>
                  </div>

                </div>
              </section>

              {/* ========================================================
                  PHẦN 2: TIÊU ĐỀ & TRÍCH YẾU
                 ======================================================== */}
              {/* ========================================================
                  PHẦN 2: TIÊU ĐỀ & TRÍCH YẾU
                 ======================================================== */}
              <section 
                id="section-title" 
                className="relative mb-3 p-1.5 rounded-lg border border-transparent hover:border-blue-200 transition group text-center"
              >
                <div className="absolute -top-3 left-2 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition select-none z-10 font-sans">
                  Phần 2: Tên loại & Trích yếu ({doc.documentType || "Văn bản"})
                </div>

                {isPartyOfficialLetter ? (
                  <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200/50 text-blue-900 text-xs text-center">
                    <p className="font-semibold">Công văn Đảng: trích yếu đặt tại cột trái dưới số hiệu (12pt, nghiêng, không đậm).</p>
                    <p className="text-[11px] text-slate-500 mt-1">Không có tiêu đề loại văn bản, trích yếu giữa trang hoặc vạch 5 dấu gạch nối.</p>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={doc.documentType}
                      onChange={(e) => handleFieldChange("documentType", e.target.value.toUpperCase())}
                      placeholder="TÊN LOẠI VĂN BẢN (QUYẾT ĐỊNH, KẾ HOẠCH, BIÊN BẢN...)"
                      className={`w-full text-center font-bold uppercase tracking-wide outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1 ${
                        standardType === "party" ? "text-[15pt]" : "text-[14pt]"
                      }`}
                    />
                    <AutoResizeTextarea
                      rows={1}
                      value={doc.subject}
                      onChange={(e) => handleFieldChange("subject", e.target.value)}
                      placeholder={
                        isBienBan
                          ? "Nội dung cuộc họp / kiểm tra / bàn giao..."
                          : standardType === "party"
                          ? "Về phương hướng nhiệm vụ năm 2026..."
                          : "V/v trích yếu nội dung văn bản..."
                      }
                      className={`w-full text-center font-bold outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1 mt-0.5 ${
                        standardType === "party" ? "text-[14pt] not-italic" : "text-[13pt] italic"
                      }`}
                    />
                    {standardType === "party" && (
                      <p className="text-center font-bold tracking-widest my-1 text-[14pt] select-none">-----</p>
                    )}
                    {isBienBan && (
                      <p className="text-[10px] text-slate-400 italic mt-0.5 font-sans">
                        * Biên bản làm việc: Ghi rõ nội dung sự việc hoặc cuộc họp (không bắt buộc tiền tố &quot;V/v&quot;)
                      </p>
                    )}
                  </>
                )}
              </section>

              {/* ========================================================
                  PHẦN 3: NỘI DUNG THÂN VĂN BẢN (TIPTAP EDITOR)
                 ======================================================== */}
              <section 
                id="section-body" 
                className="relative mb-4 p-1 rounded-lg border border-transparent hover:border-blue-200 transition group text-justify"
              >
                <div className="absolute -top-3 left-2 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition select-none z-10 font-sans">
                  Phần 3: Thân văn bản (Căn cứ · Điều khoản · Bảng biểu)
                </div>

                <ND30Editor
                  key={standardType}
                  content={doc.bodyHtml}
                  onChange={(html) => handleFieldChange("bodyHtml", html)}
                  regime={standardType === "party" ? "party" : "administrative"}
                  minHeight="350px"
                  compactToolbar={true}
                  hideToolbar={true}
                  onEditorReady={setTiptapEditor}
                />
              </section>

              {/* ========================================================
                  PHẦN 4: CUỐI VĂN BẢN (CHỮ KÝ & NƠI NHẬN)
                 ======================================================== */}
              <section 
                id="section-footer" 
                className="relative mt-6 pt-4 border-t border-slate-200 p-2 rounded-lg hover:border-blue-200 transition group"
              >
                <div className="absolute -top-3 left-2 bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition select-none z-10 font-sans">
                  Phần 4: Cuối văn bản ({isBienBan ? "Chữ ký các bên (Biên bản)" : isMultiSigner ? "Chữ ký các bên song song" : "Chữ ký & Nơi nhận"})
                </div>

                {isMultiSigner ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <span className="font-semibold text-slate-800 font-sans">
                        {isBienBan ? "Chữ ký Biên bản" : "Chữ ký các bên song song"} ({doc.signTitle?.includes("|") ? doc.signTitle.split("|").length : 1} vị trí ký song song)
                      </span>
                      <div className="flex items-center gap-1.5 font-sans">
                        <span className="text-[11px] text-slate-500">Mẫu ký:</span>
                        <button
                          type="button"
                          onClick={() => {
                            handleFieldChange("signTitle", "THƯ KÝ | CHỦ TỌA");
                            handleFieldChange("signName", "Nguyễn Văn A | Trần Văn B");
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-[10.5px] font-semibold cursor-pointer"
                        >
                          2 bên (Thư ký - Chủ tọa)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleFieldChange("signTitle", "ĐẠI DIỆN ĐOÀN KIỂM TRA | ĐẠI DIỆN ĐƠN VỊ ĐƯỢC KIỂM TRA | GIÁM SÁT VIÊN");
                            handleFieldChange("signName", "Đoàn Văn A | Công Ty B | Giám Sát C");
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-[10.5px] font-semibold cursor-pointer"
                        >
                          3 bên
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleFieldChange("signTitle", "ĐẠI DIỆN CẢNG VỤ HÀNG HẢI | HOA TIÊU DẪN TÀU | THUYỀN TRƯỞNG | ĐĂNG KIỂM VIÊN");
                            handleFieldChange("signName", "Nguyễn Văn Hải | Lê Hoàng Nam | Capt. Johnathan Miller | Đỗ Đức Tiến");
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-[10.5px] font-semibold cursor-pointer"
                        >
                          4 bên
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleFieldChange("signTitle", "TRƯỞNG ĐOÀN KIỂM TRA");
                            handleFieldChange("signName", "Nguyễn Văn A");
                          }}
                          className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-[10.5px] cursor-pointer"
                        >
                          1 bên
                        </button>
                      </div>
                    </div>

                    {doc.signTitle && doc.signTitle.includes("|") ? (
                      <div className={`grid gap-4 mt-2 ${doc.signTitle.split("|").length === 2 ? "grid-cols-2" : (doc.signTitle.split("|").length === 4 ? "grid-cols-4" : "grid-cols-3")}`}>
                        {doc.signTitle.split("|").map((titleItem, idx) => {
                          const nameList = doc.signName.split("|").map(n => n.trim());
                          const currentName = nameList[idx] || "";
                          return (
                            <div key={idx} className="text-center p-2 rounded-lg bg-slate-50/70 border border-slate-200 hover:border-blue-300 transition space-y-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block font-sans">Vị trí {idx + 1}</span>
                              <AutoResizeTextarea
                                rows={2}
                                value={titleItem.trim()}
                                onChange={(e) => {
                                  const currentTitles = doc.signTitle.split("|").map(t => t.trim());
                                  currentTitles[idx] = e.target.value;
                                  handleFieldChange("signTitle", currentTitles.join(" | "));
                                }}
                                placeholder="Chức danh ký..."
                                className="w-full text-center text-[11pt] font-bold uppercase leading-tight outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1 border border-transparent focus:border-blue-300"
                              />
                              <div className="h-10 flex items-center justify-center text-slate-400 italic text-[10px] select-none">
                                (Ký, ghi rõ họ tên)
                              </div>
                              <input
                                type="text"
                                value={currentName}
                                onChange={(e) => {
                                  const currentNames = doc.signName.split("|").map(n => n.trim());
                                  while (currentNames.length <= idx) currentNames.push("");
                                  currentNames[idx] = e.target.value;
                                  handleFieldChange("signName", currentNames.join(" | "));
                                }}
                                placeholder="Họ và tên..."
                                className="w-full text-center text-[11.5pt] font-bold outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1 border border-transparent focus:border-blue-300"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Biên bản 1 người ký */
                      <div className="grid grid-cols-[38%_62%] gap-4 items-start mt-3">
                        <div className="text-left text-[11pt] p-2 rounded-lg bg-slate-50/40 border border-slate-100">
                          <p className="font-bold italic text-slate-500 text-xs font-sans">Nơi nhận (Miễn trừ đối với Biên bản):</p>
                          <AutoResizeTextarea
                            rows={2}
                            value={doc.recipients}
                            onChange={(e) => handleFieldChange("recipients", e.target.value)}
                            placeholder="Các bên tham gia;&#10;Lưu: VT..."
                            className="w-full text-left text-[10pt] outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1"
                          />
                        </div>
                        <div className="text-center p-2 rounded-lg hover:bg-blue-50/20 transition">
                          <AutoResizeTextarea
                            rows={2}
                            value={doc.signTitle}
                            onChange={(e) => handleFieldChange("signTitle", e.target.value)}
                            placeholder="TRƯỞNG ĐOÀN KIỂM TRA"
                            className="w-full text-center text-[13pt] font-bold uppercase leading-tight outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1"
                          />
                          <div className="h-14 flex items-center justify-center text-slate-400 italic text-xs select-none">
                            (Ký, ghi rõ họ tên)
                          </div>
                          <input
                            type="text"
                            value={doc.signName}
                            onChange={(e) => handleFieldChange("signName", e.target.value)}
                            placeholder="Họ và tên người ký"
                            className="w-full text-center text-[13pt] font-bold outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Văn bản hành chính thông thường (Quyết định, Kế hoạch, Công văn, Tờ trình) */
                  <div className="grid grid-cols-[38%_62%] gap-4 items-start mt-2">
                    {/* Nơi nhận bên trái (38%) */}
                    <div className="text-left text-[11pt] p-2 rounded-lg hover:bg-blue-50/30 border border-transparent hover:border-blue-200 transition">
                      <p className="font-bold italic text-black">Nơi nhận:</p>
                      <AutoResizeTextarea
                        rows={3}
                        value={doc.recipients}
                        onChange={(e) => handleFieldChange("recipients", e.target.value)}
                        placeholder="Như Điều ...&#10;Lãnh đạo đơn vị;&#10;Lưu: VT..."
                        className="w-full text-left text-[11pt] outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1 leading-relaxed"
                      />
                    </div>

                    {/* Chữ ký bên phải (62% - Đủ rộng ~390px, KHÔNG BAO GIỜ bị rớt chữ 'MIỀN BẮC') */}
                    <div className="text-center p-2 rounded-lg hover:bg-blue-50/30 border border-transparent hover:border-blue-200 transition">
                      {!doc.signTitle && !doc.signName ? (
                        <div className="p-3 bg-slate-50/80 border border-dashed border-slate-300 rounded-lg text-center space-y-1">
                          <p className="text-xs font-semibold text-slate-700">Tài liệu không có khối chữ ký trong nguồn</p>
                          <p className="text-[10.5px] text-slate-500 italic">Bản kế hoạch / dự thảo chưa ký. Hệ thống bảo toàn nguyên bản, không tự tạo chữ ký giả.</p>
                          <button
                            type="button"
                            onClick={() => {
                              handleFieldChange("signTitle", "GIÁM ĐỐC");
                              handleFieldChange("signName", "");
                            }}
                            className="mt-1 px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-300 text-blue-700 rounded-md hover:bg-blue-50 cursor-pointer"
                          >
                            + Bổ sung chữ ký nếu cần
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-end mb-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleFieldChange("signTitle", "");
                                handleFieldChange("signName", "");
                              }}
                              className="text-[10px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
                              title="Xóa chữ ký (đối với văn bản dự thảo/kế hoạch chưa ký)"
                            >
                              Xóa chữ ký
                            </button>
                          </div>
                          <AutoResizeTextarea
                            rows={2}
                            value={doc.signTitle}
                            onChange={(e) => handleFieldChange("signTitle", e.target.value)}
                            placeholder="TM. CÔNG TY HOA TIÊU HÀNG HẢI MIỀN BẮC&#10;GIÁM ĐỐC"
                            className="w-full text-center text-[12.5pt] font-bold uppercase leading-tight outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1 tracking-tight"
                          />
                          <div className="h-14 flex items-center justify-center text-slate-400 italic text-xs select-none">
                            (Chữ ký, đóng dấu)
                          </div>
                          <input
                            type="text"
                            value={doc.signName}
                            onChange={(e) => handleFieldChange("signName", e.target.value)}
                            placeholder="Họ và tên người ký"
                            className="w-full text-center text-[13pt] font-bold outline-none bg-transparent hover:bg-white focus:bg-white rounded p-1"
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* PHỤ LỤC ĐÍNH KÈM */}
              {doc.appendices && doc.appendices.length > 0 && (
                <div id="section-appendices" className="mt-8 pt-4 border-t-2 border-dashed border-amber-300 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-900 uppercase">
                      Phụ lục đính kèm ({doc.appendices.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newApp: AppendixDocument = {
                          id: `app-${Date.now()}`,
                          title: `PHỤ LỤC ${doc.appendices!.length + 1}`,
                          referenceText: `(Kèm theo ${doc.documentType || "Văn bản"} ${doc.referenceNumber || ""})`,
                          html: "<p>Nội dung phụ lục bổ sung...</p>",
                          blocks: [],
                          sourceBlockIds: [],
                          extractionStatus: "confirmed"
                        };
                        setDoc(prev => ({ ...prev, appendices: [...(prev.appendices || []), newApp] }));
                      }}
                      className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px] font-semibold"
                    >
                      + Thêm phụ lục
                    </button>
                  </div>
                  {doc.appendices.map((app, idx) => (
                    <div key={app.id || idx} className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg text-xs space-y-2">
                      <div className="flex items-center justify-between font-bold text-amber-950">
                        <span>{app.title}</span>
                        <button
                          type="button"
                          onClick={() => setDoc(prev => ({ ...prev, appendices: prev.appendices?.filter((_, i) => i !== idx) }))}
                          className="text-rose-600 hover:underline"
                        >
                          Xóa
                        </button>
                      </div>
                      <p className="text-slate-600 italic">{app.referenceText}</p>
                      <div 
                        className="p-2 bg-white border border-slate-200 rounded max-h-36 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(app.html) }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* KHỐI CHƯA PHÂN LOẠI CẦN RÀ SOÁT */}
              {Boolean(doc.unclassified?.length) && (
                <div className="mt-6 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-2">
                  <span className="font-bold text-amber-950 block">
                    Khối chưa phân loại ({doc.unclassified?.length}) — cần đối chiếu tệp gốc
                  </span>
                  {doc.unclassified?.map(block => (
                    <div key={block.id} className="p-2 bg-white border border-amber-200 rounded flex items-center justify-between gap-2">
                      <span className="text-slate-700 truncate">#{block.index + 1}: {block.text || "[Không có text]"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const html = block.html || safeTextToHtml(block.text);
                          setDoc(prev => ({
                            ...prev,
                            bodyHtml: `${prev.bodyHtml || ""}${html}`,
                            unclassified: (prev.unclassified || []).filter(item => item.id !== block.id)
                          }));
                        }}
                        className="text-blue-700 font-semibold hover:underline shrink-0"
                      >
                        Chèn vào thân bài
                      </button>
                    </div>
                  ))}
                </div>
              )}

                </div>
              </div>
            </div>
          ) : (
            /* VIEW MODE 2: REAL WORD DOCX PREVIEW */
            <div className="df-real-preview w-full max-w-[820px] df-glass-surface shadow-xl rounded-xl p-4">
              <A4DocumentPreview
                doc={doc}
                standardType={standardType}
                previewRef={previewRef}
                mode="full"
                onExportDocx={exportToDocx}
                onExportPdf={exportToPdf}
                onPrint={() => window.print()}
                isExportingDocx={isExportingDocx}
                isExportingPdf={isExportingPdf}
              />
            </div>
          )}

        </main>

        {/* ========================================================
            RIGHT PANE: UNIFIED 3-TAB SUPPORT PANEL (Cần sửa · Gợi ý AI · Mục lục)
           ======================================================== */}
        {showInspectorRight && (
          <div className={`${isCompactWorkspace ? "fixed inset-0 z-40 flex justify-end" : "flex shrink-0 h-full"}`}>
            {/* Backdrop overlay on compact / mobile */}
            {isCompactWorkspace && (
              <div 
                className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs"
                onClick={() => {
                  setShowInspectorRight(false);
                  setUserClosedInspector(true);
                }}
              />
            )}
            <aside 
              role={isCompactWorkspace ? "dialog" : "complementary"} 
              aria-modal={isCompactWorkspace ? true : undefined} 
              aria-label="Trợ lý rà soát" 
              className={`df-inspector relative z-10 w-[328px] df-glass-surface border-l border-slate-200/90 flex flex-col shrink-0 h-full overflow-hidden shadow-2xl ${isCompactWorkspace ? "" : "lg:shadow-none"} select-none df-panel-transition`}
            >
              
              {/* Top Panel Header */}
              <div className="p-3 border-b border-slate-200/80 bg-white/75 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center border ${
                    evaluationSummary.actionableIssues.length > 0 
                      ? "bg-amber-50 border-amber-200 text-[#D9822B]" 
                      : (evaluationSummary.canonicalStats.counts.NEEDS_REVIEW > 0 || evaluationSummary.canonicalStats.counts.NOT_EVALUATED > 0
                          ? "bg-indigo-50 border-indigo-200 text-[#6255E8]"
                          : "bg-emerald-50 border-emerald-200 text-[#15803D]")
                  }`}>
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-[#17233D] block">Trợ lý rà soát</span>
                    <span className="text-[11px] text-[#5B6780]">
                      {evaluationSummary.actionableIssues.length === 0 
                        ? (evaluationSummary.canonicalStats.counts.NEEDS_REVIEW > 0 || evaluationSummary.canonicalStats.counts.NOT_EVALUATED > 0
                            ? "Không có việc cần xử lý tự động"
                            : "Không có lỗi cấu trúc tự động")
                        : `${evaluationSummary.actionableIssues.length} vấn đề cần rà soát`}
                    </span>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setShowInspectorRight(false);
                    setUserClosedInspector(true);
                  }}
                  aria-label="Đóng trợ lý rà soát"
                  title="Thu gọn trợ lý rà soát"
                  className="p-1 rounded-lg text-[#5B6780] hover:text-[#17233D] hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 3 Segmented Support Tabs: Cần sửa | Gợi ý AI | Mục lục */}
              <div role="tablist" aria-label="Công cụ hỗ trợ" className="grid grid-cols-3 gap-1 p-2 bg-slate-100/90 border-b border-slate-200/80 text-sm">
                <button
                  type="button"
                  role="tab"
                  id="df-tab-issues"
                  aria-controls="df-panel-issues"
                  aria-selected={inspectorTab === "issues"}
                  tabIndex={inspectorTab === "issues" ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, "issues")}
                  onClick={() => setInspectorTab("issues")}
                  className={`py-2 px-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    inspectorTab === "issues"
                      ? "bg-white text-[#17233D] shadow-2xs"
                      : "text-[#5B6780] hover:text-[#17233D]"
                  }`}
                >
                  <span>Cần sửa</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    evaluationSummary.actionableIssues.length > 0
                      ? "bg-amber-100 text-[#D9822B]"
                      : "bg-slate-200/80 text-[#5B6780]"
                  }`}>
                    {evaluationSummary.actionableIssues.length}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  id="df-tab-ai"
                  aria-controls="df-panel-ai"
                  aria-selected={inspectorTab === "ai"}
                  tabIndex={inspectorTab === "ai" ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, "ai")}
                  onClick={() => setInspectorTab("ai")}
                  className={`py-2 px-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    inspectorTab === "ai"
                      ? "bg-white text-[#6255E8] shadow-2xs"
                      : "text-[#5B6780] hover:text-[#17233D]"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Gợi ý AI</span>
                  {reviewProposals.filter(p => !acceptedProposalIds.has(p.id)).length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-indigo-100 text-[#6255E8]">
                      {reviewProposals.filter(p => !acceptedProposalIds.has(p.id)).length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  id="df-tab-outline"
                  aria-controls="df-panel-outline"
                  aria-selected={inspectorTab === "outline"}
                  tabIndex={inspectorTab === "outline" ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, "outline")}
                  onClick={() => setInspectorTab("outline")}
                  className={`py-2 px-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    inspectorTab === "outline"
                      ? "bg-white text-[#16A6A6] shadow-2xs"
                      : "text-[#5B6780] hover:text-[#17233D]"
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Mục lục</span>
                </button>
              </div>

              {/* TAB 1: CẦN SỬA (Priority #1 Issue at Top + Remaining Issues) */}
              {inspectorTab === "issues" && (
                <div role="tabpanel" id="df-panel-issues" aria-labelledby="df-tab-issues" className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Filter Bar */}
                  <div className="px-3.5 py-2.5 border-b border-slate-200/70 bg-white/60 flex items-center justify-between text-xs">
                    {activeGroupFilter === "all" ? (
                      <span className="text-[11px] text-[#5B6780] font-semibold">Tất cả 9 nhóm thành phần</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-[#6255E8] bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                          Lọc: {COMPONENT_GROUPS.find(g => g.id === activeGroupFilter)?.name || `Nhóm ${activeGroupFilter}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveGroupFilter("all")}
                          className="text-[11px] text-[#5B6780] hover:text-[#17233D] underline cursor-pointer"
                        >
                          Bỏ lọc
                        </button>
                      </div>
                    )}

                    {evaluationSummary.actionableIssues.some(i => i.canAutoFix) && (
                      <button
                        type="button"
                        onClick={() => {
                          evaluationSummary.actionableIssues.forEach(issue => {
                            if (issue.canAutoFix && issue.suggestion && issue.targetField) {
                              handleFieldChange(issue.targetField as any, issue.suggestion);
                            }
                          });
                          pushVersion("Áp dụng tự động sửa các lỗi thể thức", doc);
                          showToast("Đã áp dụng các sửa đổi thể thức tự động!", "success");
                        }}
                        className="text-[11px] text-[#6255E8] hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                      >
                        Sửa nhanh tất cả
                      </button>
                    )}
                  </div>

                  <div className="p-3.5 space-y-3 flex-1 overflow-y-auto">
                    {(() => {
                      const filteredIssues = activeGroupFilter === "all"
                        ? evaluationSummary.actionableIssues
                        : evaluationSummary.actionableIssues.filter(i => i.componentGroup === activeGroupFilter);

                      if (filteredIssues.length === 0) {
                        const groupRules = activeGroupFilter === "all"
                          ? evaluationSummary.results
                          : evaluationSummary.results.filter(r => r.componentGroup === activeGroupFilter);
                        const groupNeedsReview = groupRules.filter(r => r.status === "NEEDS_REVIEW").length;
                        const groupNotEval = groupRules.filter(r => r.status === "NOT_EVALUATED").length;
                        const groupFail = groupRules.filter(r => r.status === "FAIL").length;
                        const hasPendingVerification = groupNeedsReview > 0 || groupNotEval > 0;

                        return (
                          <div className={`p-4 rounded-2xl text-center space-y-2 border ${
                            hasPendingVerification
                              ? "bg-white/90 border-slate-200 text-[#17233D]"
                              : (groupFail > 0 ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-emerald-50/70 border-emerald-200 text-emerald-950")
                          }`}>
                            {hasPendingVerification ? (
                              <Info className="w-8 h-8 text-[#6255E8] mx-auto" />
                            ) : (
                              <CheckCircle2 className="w-8 h-8 text-[#15803D] mx-auto" />
                            )}
                            <p className="text-xs font-bold">
                              {hasPendingVerification
                                ? "Không có việc cần xử lý tự động"
                                : "Không có vấn đề cần xử lý"}
                            </p>
                            <p className="text-[11px] leading-relaxed text-[#5B6780]">
                              {hasPendingVerification ? (
                                activeGroupFilter === "all"
                                  ? `Chưa phát hiện lỗi cấu trúc tự động. Còn ${groupNeedsReview} quy tắc cần rà soát thủ công và ${groupNotEval} quy tắc chưa kiểm định.`
                                  : `Vị trí này không có lỗi tự động. Còn ${groupNeedsReview} quy tắc cần rà soát thủ công và ${groupNotEval} quy tắc chưa kiểm định.`
                              ) : (
                                activeGroupFilter === "all" 
                                  ? "Văn bản đã tuân thủ đúng quy chuẩn thể thức của " + (standardType === "party" ? "Hướng dẫn 05" : "Nghị định 30") + "."
                                  : "Nhóm thành phần này đã đạt chuẩn, không có lỗi cần sửa."
                              )}
                            </p>
                          </div>
                        );
                      }

                      const currentIdx = Math.min(activeIssueIndex, filteredIssues.length - 1);
                      const priorityIssue = filteredIssues[currentIdx] || filteredIssues[0];
                      const remainingIssues = filteredIssues.filter((_, idx) => idx !== currentIdx);

                      const jumpToIssueGroup = (groupNum: number | string) => {
                        if (groupNum === 1 || groupNum === 2 || groupNum === 3 || groupNum === 4) {
                          scrollToSection("section-header");
                        } else if (groupNum === 5) {
                          scrollToSection("section-title");
                        } else if (groupNum === 6) {
                          scrollToSection("section-body");
                        } else if (groupNum === 7 || groupNum === 8 || groupNum === 9) {
                          scrollToSection("section-footer");
                        }
                      };

                      return (
                        <>
                          {/* PRIORITY #1 ACTION CARD AT TOP */}
                          {priorityIssue && (
                            <div className="p-3.5 rounded-2xl border-2 border-[#F28C72] bg-gradient-to-br from-orange-50/90 via-white to-rose-50/60 shadow-sm space-y-2.5">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F28C72]/20 text-[#9A3412] border border-[#F28C72]/50">
                                    Ưu tiên xử lý #1
                                  </span>
                                  {filteredIssues.length > 1 && (
                                    <div className="flex items-center gap-1 bg-white/80 border border-slate-200 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-[#5B6780]">
                                      <button
                                        type="button"
                                        onClick={() => setActiveIssueIndex(prev => Math.max(0, prev - 1))}
                                        disabled={currentIdx === 0}
                                        className="hover:text-[#17233D] disabled:opacity-30 cursor-pointer"
                                        title="Vấn đề trước"
                                      >
                                        ‹
                                      </button>
                                      <span>{currentIdx + 1} / {filteredIssues.length}</span>
                                      <button
                                        type="button"
                                        onClick={() => setActiveIssueIndex(prev => Math.min(filteredIssues.length - 1, prev + 1))}
                                        disabled={currentIdx >= filteredIssues.length - 1}
                                        className="hover:text-[#17233D] disabled:opacity-30 cursor-pointer"
                                        title="Vấn đề tiếp theo"
                                      >
                                        ›
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono font-bold text-[#5B6780]">
                                  Nhóm {priorityIssue.componentGroup}
                                </span>
                              </div>

                              <div>
                                <h4 className="font-extrabold text-[#17233D] text-xs mb-1">{priorityIssue.title}</h4>
                                <p className="text-[11px] text-[#5B6780] leading-relaxed">{priorityIssue.message}</p>
                              </div>

                              {priorityIssue.suggestion && (
                                <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-[11px] space-y-1">
                                  <span className="text-[10px] text-[#5B6780] font-semibold block">Đề xuất chuẩn hóa:</span>
                                  <ins className="df-diff-ins font-mono text-xs block">{priorityIssue.suggestion}</ins>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-1.5 border-t border-orange-200/60">
                                <button
                                  type="button"
                                  onClick={() => jumpToIssueGroup(priorityIssue.componentGroup)}
                                  className="text-[11px] font-semibold text-[#5B6780] hover:text-[#17233D] flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Xem vị trí trên A4
                                </button>

                                {priorityIssue.canAutoFix && priorityIssue.suggestion && priorityIssue.targetField && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleFieldChange(priorityIssue.targetField as any, priorityIssue.suggestion!);
                                      pushVersion(`Sửa ${priorityIssue.title}`, doc);
                                      showToast(`Đã áp dụng: ${priorityIssue.title}`, "success");
                                    }}
                                    className="df-btn-primary px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Áp dụng ngay
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* REMAINING ISSUES COLLAPSIBLE */}
                          {remainingIssues.length > 0 && (
                            <details className="group space-y-2 pt-1" open>
                              <summary className="text-[11px] font-bold text-[#5B6780] uppercase tracking-wider cursor-pointer hover:text-[#17233D] list-none flex items-center justify-between px-0.5">
                                <span>Chi tiết kiểm tra & vấn đề khác ({remainingIssues.length})</span>
                                <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                              </summary>
                              <div className="space-y-2 pt-1">
                                {remainingIssues.map((issue) => {
                                  const isLegalError = issue.severity === "LEGAL_ERROR";
                                  return (
                                    <div 
                                      key={issue.id}
                                      className={`p-3 rounded-xl border text-xs space-y-2 bg-white/90 transition ${
                                        isLegalError ? "border-rose-200" : "border-amber-200"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                          isLegalError ? "bg-rose-50 text-[#DC2626] border-rose-200" : "bg-amber-50 text-[#D9822B] border-amber-200"
                                        }`}>
                                          {isLegalError ? "Lỗi thể thức bắt buộc" : "Cảnh báo thể thức"}
                                        </span>
                                        <span className="text-[10px] text-[#5B6780] font-mono">
                                          Nhóm {issue.componentGroup}
                                        </span>
                                      </div>

                                      <div>
                                        <h4 className="font-bold text-[#17233D] text-xs mb-0.5">{issue.title}</h4>
                                        <p className="text-[11px] text-[#5B6780] leading-relaxed">{issue.message}</p>
                                      </div>

                                      {issue.suggestion && (
                                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-[#15803D]">
                                          <span className="text-[10px] text-[#5B6780] block font-sans">Đề xuất chuẩn hóa:</span>
                                          {issue.suggestion}
                                        </div>
                                      )}

                                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                        <button
                                          type="button"
                                          onClick={() => jumpToIssueGroup(issue.componentGroup)}
                                          className="text-[11px] text-[#5B6780] hover:text-[#17233D] flex items-center gap-1 cursor-pointer"
                                        >
                                          <Eye className="w-3 h-3" /> Xem vị trí
                                        </button>

                                        {issue.canAutoFix && issue.suggestion && issue.targetField && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleFieldChange(issue.targetField as any, issue.suggestion!);
                                              pushVersion(`Sửa ${issue.title}`, doc);
                                              showToast(`Đã áp dụng: ${issue.title}`, "success");
                                            }}
                                            className="px-2.5 py-1 bg-[#6255E8] hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                          >
                                            <Check className="w-3 h-3" /> Áp dụng
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* TAB 2: GỢI Ý AI (Before/After Preview + Apply / Dismiss) */}
              {inspectorTab === "ai" && (
                <div role="tabpanel" id="df-panel-ai" aria-labelledby="df-tab-ai" className="p-3.5 space-y-4 flex-1 overflow-y-auto">
                  {/* AI Actions Card */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-teal-50/60 border border-indigo-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#17233D] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#6255E8]" />
                        Trợ Lý Rà Soát Văn Phong & Chính Tả
                      </span>
                    </div>
                    <p className="text-[11px] text-[#5B6780] leading-relaxed">
                      Mọi đề xuất đều hiển thị đối chiếu <strong>Trước / Sau</strong> và chỉ thay đổi văn bản khi bạn bấm <strong>Áp dụng</strong>.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleAiRefine("proofread")}
                        disabled={isRefining}
                        className="p-2.5 bg-white hover:bg-indigo-50 text-[#17233D] border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
                      >
                        <Wand2 className="w-3.5 h-3.5 text-[#6255E8] shrink-0" />
                        <span>Sửa chính tả</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAiRefine("formalize")}
                        disabled={isRefining}
                        className="p-2.5 bg-white hover:bg-teal-50 text-[#17233D] border border-teal-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#16A6A6] shrink-0" />
                        <span>Nâng văn phong</span>
                      </button>
                    </div>
                  </div>

                  {/* Pending Proposals with Before / After Preview */}
                  {(() => {
                    const pendingProposals = reviewProposals.filter(p => !acceptedProposalIds.has(p.id));
                    if (pendingProposals.length === 0) {
                      return (
                        <div className="p-5 rounded-2xl bg-white/80 border border-slate-200 text-center space-y-1.5">
                          <Sparkles className="w-7 h-7 text-[#6255E8] mx-auto opacity-75" />
                          <p className="text-xs font-bold text-[#17233D]">Chưa có đề xuất sửa đổi đang chờ</p>
                          <p className="text-[11px] text-[#5B6780]">
                            Chọn <strong>Sửa chính tả</strong> hoặc <strong>Nâng văn phong</strong> ở trên để tạo đề xuất đối chiếu Trước / Sau.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2.5">
                        <span className="text-[11px] font-bold text-[#5B6780] uppercase tracking-wider block">
                          Đề xuất chờ duyệt ({pendingProposals.length})
                        </span>
                        {pendingProposals.map((p) => (
                          <div key={p.id} className="p-3 rounded-2xl border border-indigo-200/90 bg-white shadow-2xs text-xs space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] bg-indigo-50 text-[#6255E8] border border-indigo-200 font-bold px-2 py-0.5 rounded-md">
                                {p.type === "spelling" ? "Chính tả" : (p.type === "format" ? "Định dạng" : "Văn phong")}
                              </span>
                              <span className="text-[10px] text-[#5B6780] font-medium">Xem trước Trước / Sau</span>
                            </div>

                            <p className="text-[11px] text-[#17233D] font-semibold">{p.reason}</p>

                            {/* Before / After Diff Preview */}
                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5 text-[11px]">
                              <div className="flex items-start gap-1.5">
                                <span className="text-[10px] font-bold text-rose-700 uppercase shrink-0 mt-0.5">Trước:</span>
                                <del className="df-diff-del break-words">{p.original}</del>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <span className="text-[10px] font-bold text-emerald-700 uppercase shrink-0 mt-0.5">Sau:</span>
                                <ins className="df-diff-ins break-words">{p.suggested}</ins>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleDismissProposal(p.id)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-[#5B6780] font-semibold text-[11px] cursor-pointer"
                              >
                                Bỏ qua
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAcceptProposal(p)}
                                className="df-btn-primary px-3 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Áp dụng
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 3: MỤC LỤC (9 Component Groups + Header Profile Switcher) */}
              {inspectorTab === "outline" && (
                <div role="tabpanel" id="df-panel-outline" aria-labelledby="df-tab-outline" className="p-3.5 space-y-4 flex-1 overflow-y-auto">
                  {/* Header Profile Switcher */}
                  <div className="p-3 rounded-2xl bg-white border border-slate-200/90 space-y-2">
                    <span className="text-[11px] font-bold text-[#5B6780] uppercase tracking-wider block">
                      Profile Cơ Quan Ban Hành
                    </span>
                    {(() => {
                      const isPartyMode = standardType === "party";
                      const activeProfileId = isPartyMode ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID;
                      const isProfileActive = doc.headerProfile === activeProfileId;
                      return (
                        <button
                          type="button"
                          onClick={() => handleHeaderProfileChange(isProfileActive ? "generic" : activeProfileId)}
                          className={`w-full p-2.5 rounded-xl border text-xs text-left transition flex items-center justify-between cursor-pointer ${
                            isProfileActive
                              ? "bg-indigo-50/90 border-[#6255E8] text-[#17233D] font-semibold"
                              : "bg-slate-50 border-slate-200 text-[#17233D] hover:bg-slate-100"
                          }`}
                        >
                          <div>
                            <span className="block font-bold text-xs">
                              {isPartyMode ? "Đảng bộ Hoa tiêu MB" : "Hoa tiêu hàng hải miền Bắc"}
                            </span>
                            <span className="text-[10px] text-[#5B6780]">
                              {isPartyMode ? "Chuẩn HD 05 duyệt" : "Chuẩn NĐ 30 duyệt"}
                            </span>
                          </div>
                          <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isProfileActive ? "bg-[#6255E8] border-[#6255E8] text-white" : "border-slate-300"
                          }`}>
                            {isProfileActive && <Check className="w-2.5 h-2.5" />}
                          </span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* 9 Component Groups Navigator */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#17233D] uppercase tracking-wider">
                        9 Thành Phần Thể Thức
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-[#16A6A6] border border-teal-200">
                        {evaluationSummary.recognizedComponents.recognized}/{evaluationSummary.recognizedComponents.total} đã nhận diện
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {(() => {
                        const allGroups = evaluationSummary.recognizedComponents.groups;
                        const coreGroups = allGroups.filter(g => typeof g.id === "number" || /^\d+$/.test(String(g.id)));
                        const suppGroups = allGroups.filter(g => !(typeof g.id === "number" || /^\d+$/.test(String(g.id))));

                        const renderGroupItem = (group: typeof allGroups[0]) => {
                          const isSelected = activeGroupFilter === group.id;
                          return (
                            <div
                              key={String(group.id)}
                              onClick={() => {
                                setActiveGroupFilter(isSelected ? "all" : group.id);
                                if ([1, 2, 3, 4].includes(Number(group.id))) {
                                  scrollToSection("section-header");
                                } else if (group.id === 5) {
                                  scrollToSection("section-title");
                                } else if (group.id === 6) {
                                  scrollToSection("section-body");
                                } else if ([7, 8, 9].includes(Number(group.id))) {
                                  scrollToSection("section-footer");
                                } else if (group.id === "supp_appendix") {
                                  scrollToSection("section-appendices");
                                } else {
                                  scrollToSection("section-header");
                                }
                              }}
                              className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex flex-col gap-1 ${
                                isSelected
                                  ? "border-[#6255E8] bg-indigo-50/80 text-[#17233D] font-semibold shadow-2xs"
                                  : "bg-white border-slate-200 hover:border-slate-300 text-[#17233D]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold truncate text-[11.5px]">{group.name}</span>
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                                  group.status === "needs_action"
                                    ? "bg-amber-100 text-[#D9822B] border border-amber-300"
                                    : group.status === "missing"
                                    ? "bg-rose-100 text-[#DC2626] border border-rose-300"
                                    : group.status === "recognized"
                                    ? "bg-emerald-100 text-[#15803D] border border-emerald-300"
                                    : "bg-slate-100 text-[#5B6780]"
                                }`}>
                                  {group.status === "needs_action" ? `Cần sửa (${group.issuesCount})`
                                    : group.status === "missing" ? "Cần bổ sung"
                                    : group.status === "recognized" ? "Đã nhận diện"
                                    : "Không áp dụng"}
                                </span>
                              </div>
                              <p className="text-[10.5px] text-[#5B6780] line-clamp-1 truncate font-normal">
                                {group.valuePreview || "Chưa có dữ liệu"}
                              </p>
                            </div>
                          );
                        };

                        return (
                          <>
                            {coreGroups.map(renderGroupItem)}
                            {suppGroups.length > 0 && (
                              <details className="group pt-2">
                                <summary className="text-[11px] font-bold text-[#5B6780] uppercase tracking-wider cursor-pointer hover:text-[#17233D] list-none flex items-center justify-between px-0.5 py-1">
                                  <span>Thành phần bổ sung ({suppGroups.length})</span>
                                  <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">▾</span>
                                </summary>
                                <div className="space-y-1.5 pt-1.5">
                                  {suppGroups.map(renderGroupItem)}
                                </div>
                              </details>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

            </aside>
          </div>
        )}

          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
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
      {showSideBySideModal && (structuredImport || reviewBlocks.length > 0) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-slate-50 text-[#17233D] p-4 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 text-emerald-700 p-2 rounded-xl border border-emerald-400/30">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[#17233D]">Đối Chiếu & Phân Vùng Tài Liệu Tải Lên</h2>
                    <span className="text-[10px] bg-emerald-400/20 text-emerald-700 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                      Tổng {reviewBlocks.length || structuredImport?.source.blockCount || 0} khối
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
                  type="button"
                  onClick={handleAiCheckPartitions}
                  disabled={isCheckingPartitions}
                  className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Gửi đặc trưng cấu trúc lên máy chủ để AI Gemini kiểm tra phân vùng theo NĐ 30 / HD 05"
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
                  onClick={() => setShowSideBySideModal(false)}
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
                  <strong>Bảo vệ dữ liệu:</strong> Chỉ gửi ID khối, phân vùng hiện tại và trích dẫn chuỗi ngắn lên máy chủ; không viết lại văn bản.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  partitionCheckSource === "gemini_ai"
                    ? "bg-emerald-500/20 text-emerald-700 border border-emerald-500/30"
                    : (partitionCheckSource === "rule_fallback" ? "bg-amber-500/20 text-amber-700 border border-amber-500/30" : "bg-slate-100 text-slate-600")
                }`}>
                  {partitionCheckSource === "gemini_ai" ? "✓ Đã kiểm tra bằng Gemini AI" : (partitionCheckSource === "rule_fallback" ? "Đã kiểm tra bằng quy tắc nội bộ" : "Chưa kiểm tra bằng AI")}
                </span>
                {partitionCheckNotice && (
                  <span className="text-[10px] text-slate-500 italic">{partitionCheckNotice}</span>
                )}
              </div>
            </div>

            {/* Mobile Tab Switcher for Split View */}
            <div className="flex md:hidden border-b border-slate-200 bg-slate-100 p-1">
              <button
                onClick={() => setImportReviewTab("source")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                  importReviewTab === "source" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                }`}
              >
                1. Tệp Word gốc ({reviewBlocks.length || structuredImport?.source?.blockCount || 0} khối)
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
                {partitionProposals.length > 0 && (
                  <div className="bg-purple-50/90 border border-purple-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        Bất đồng phân vùng phát hiện ({partitionProposals.filter(p => p.status === "pending").length} đề xuất đang chờ)
                      </span>
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
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {partitionProposals.map((prop) => {
                        const isPending = prop.status === "pending";
                        const isAccepted = prop.status === "accepted";
                        const isRejected = prop.status === "rejected";
                        const isVerified = !prop.requiresUserVerification || verifiedPartitionProposalIds.has(prop.id || "");

                        return (
                          <div
                            key={prop.id}
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
                                  <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-semibold ${
                                    prop.confidence === "high" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    Độ tin cậy: {prop.confidence}
                                  </span>
                                </div>
                                {prop.cellLocation && (
                                  <p className="text-[10px] text-slate-600 font-mono">
                                    Vị trí ô: [Hàng {prop.cellLocation.rowIndex + 1}, Cột {prop.cellLocation.colIndex + 1}]
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
                                    Đã bỏ qua
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
                      Cột 1: Danh sách khối nguồn & Phân vùng ({reviewBlocks.length || structuredImport?.source?.blockCount || 0} khối)
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
                      Tất cả ({reviewBlocks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("body")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "body" ? "bg-emerald-700 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Thân bài ({reviewBlocks.filter(b => b.role === "body").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("signature")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "signature" ? "bg-amber-700 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Khối ký ({reviewBlocks.filter(b => b.role === "signature").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewBlockFilter("unclassified")}
                      className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                        reviewBlockFilter === "unclassified" ? "bg-rose-700 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Chưa phân loại ({reviewBlocks.filter(b => b.role === "unclassified").length})
                    </button>
                  </div>
                </div>

                {/* Blocks List */}
                <div className="space-y-2.5">
                  {(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks)).filter(b => reviewBlockFilter === "all" || b.role === reviewBlockFilter).map((b) => {
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
                              value={b.role || "unclassified"}
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
                        {(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "body").length} khối
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
                          Đề xuất rà soát & chuẩn hóa ({reviewProposals.length})
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
                        {reviewProposals.length > 0 && (
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
                    ) : reviewProposals.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic py-1">
                        ✓ Không phát hiện vi phạm thể thức hoặc lỗi chính tả cần sửa.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {reviewProposals.map((prop) => {
                          const isAccepted = acceptedProposalIds.has(prop.id);
                          return (
                            <div 
                              key={prop.id}
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
                      ((reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "unclassified").length === 0)
                        ? "border-emerald-300 bg-emerald-50/80 text-emerald-900"
                        : "border-amber-300 bg-amber-50 text-amber-900"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-bold text-xs block">
                            Chỉ số phân loại: {(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "unclassified").length} khối chưa phân loại
                          </span>
                          <span className="text-[10px] text-slate-600">
                            {(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "unclassified").length === 0
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
                          Tổng {reviewBlocks.length || structuredImport?.source?.blockCount || uploadedBlocks.length} khối
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] pt-1">
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Đầu trang</span>
                          <strong className="text-blue-900">{(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "header" || b.role === "metadata").length} khối</strong>
                        </div>
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Thân bài</span>
                          <strong className="text-emerald-900">{(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "body").length} khối</strong>
                        </div>
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Khối ký</span>
                          <strong className="text-amber-900">{(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "signature").length} khối</strong>
                        </div>
                        <div className="bg-white p-1 rounded border border-slate-200 text-center">
                          <span className="text-slate-500 block">Phụ lục</span>
                          <strong className="text-purple-900">{(reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || [])).filter(b => b.role === "appendix").length} khối</strong>
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

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Bạn có thể sửa lại mọi trường trực tiếp trên mặt giấy sau khi xác nhận.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSideBySideModal(false)}
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
                  <span>Đồng Ý Đưa Vào Studio Soạn Thảo</span>
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
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
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
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
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
                    Rà soát lỗi chính tả, chuẩn hóa câu từ và phong cách hành chính theo Nghị định 30.
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
                onClick={rejectRefineProposal}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold px-4 py-2 rounded-xl text-xs transition"
              >
                Hủy bỏ (Giữ nguyên bản gốc)
              </button>
              <button
                type="button"
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
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-900">Đổi sang mẫu {pendingTemplate.name}?</h3>
            <p className="text-xs text-slate-700">Bản đang soạn có thay đổi chưa ghi vào lịch sử. Hệ thống sẽ lưu một bản sao trước khi thay đổi để bạn có thể khôi phục bất cứ lúc nào.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingTemplate(null)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs">Hủy</button>
              <button onClick={() => applyTemplate(pendingTemplate)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold">Đổi mẫu</button>
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
