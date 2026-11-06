import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, AlertCircle, ArrowLeft, ArrowRight,
  Bold, Calendar, Check, CheckCircle2, HelpCircle, IndentIncrease, Italic, List, ListOrdered,
  Maximize2, Minimize2, Redo2, Search, Sparkles, Underline, Undo2, Wand2, X,
} from 'lucide-react';
import { projectWorkspace } from '../utils/workspaceProjection.ts';
import { assessTableCellCapabilities, workspaceNodeTableId, type EditorSafety } from '../utils/workspaceCapabilities.ts';
import { canEnterWorkspaceStep, type EditableNode, type WorkspaceSnapshot } from '../utils/workspaceState.ts';
import type { WorkspaceAction } from '../utils/workspaceTransactions.ts';
import type { TableModel } from '../shared/tableModel.ts';
import type { PartitionAiProviderKind } from '../shared/partitionAiProtocol.ts';
import { isPlaceholderValue, type DocumentState, type ND30ComplianceReport, type RecipientBlock, type RecipientItem, type RecipientKind } from '../shared/schemas/document.schema.ts';
import { aiProviderDisplayName } from '../utils/aiProviderLabels.ts';
import { WorkspaceCanvasEditor } from './ND30Editor.tsx';
import { useAccessibleDialog } from '../utils/useAccessibleDialog.ts';
import { BUILT_IN_ISSUER_PROFILES, loadIssuerProfiles, saveIssuerProfiles, type IssuerProfile } from '../utils/issuerProfiles.ts';
import { COMPANY_HEADER_PROFILE_ID } from '../canonical/nd30/companyHeader.ts';
import { COMPANY_HEADER_HD05_PROFILE_ID } from '../canonical/hd05/companyHeaderHD05.ts';
import {
  applySemanticRuleFormatting,
  readSemanticParagraphFormatting,
  resolveSemanticRuleFormatting,
} from '../utils/semanticRuleFormatting.ts';
import { createWorkspaceAiTarget, receiveWorkspaceAiResult, type WorkspaceAiTarget } from '../utils/workspaceAiTarget.ts';
import './WorkspaceEditor.css';

const labels: Record<string, string> = {
  nationalHeader1: 'Quốc hiệu / Tiêu đề', nationalHeader2: 'Tiêu ngữ',
  orgHeader1: 'Cơ quan cấp trên', orgHeader2: 'Cơ quan ban hành',
  referenceNumber: 'Số, ký hiệu', locationAndDate: 'Địa danh và ngày tháng',
  documentType: 'Tên loại', subject: 'Trích yếu', signTitle: 'Chức vụ người ký',
  signName: 'Họ tên người ký', recipients: 'Nơi nhận',
};

type ProjectedNode = EditableNode & { safety: EditorSafety; editable: boolean };
type Canvas = { id: string; title: string; accessibilityLabel: string; nodes: ProjectedNode[] };

interface BodyRuleSuggestion {
  id: string;
  nodeId: string;
  category: 'spelling' | 'clause' | 'punctuation';
  categoryLabel: string;
  beforeExcerpt: string;
  afterExcerpt: string;
  reason: string;
  nextHtml: string;
}

interface BatchAiQueueItem {
  nodeId: string;
  target: WorkspaceAiTarget;
  originalHtml: string;
  originalText: string;
  refinedHtml: string;
  refinedText: string;
  editedText: string;
  isEditing: boolean;
}

const BODY_SPELLING_RULES: Array<{ pattern: RegExp; replacement: string; reason: string }> = [
  { pattern: /(?<=^|[^\p{L}\d])uỷ ban(?=[^\p{L}\d]|$)/giu, replacement: 'ủy ban', reason: "Chuẩn hóa chính tả 'ủy ban' theo quy định văn thư Nhà nước" },
  { pattern: /(?<=^|[^\p{L}\d])qui định(?=[^\p{L}\d]|$)/giu, replacement: 'quy định', reason: "Chuẩn hóa âm 'y' trong 'quy định' theo chuẩn NĐ 30" },
  { pattern: /(?<=^|[^\p{L}\d])qui trình(?=[^\p{L}\d]|$)/giu, replacement: 'quy trình', reason: "Chuẩn hóa âm 'y' trong 'quy trình'" },
  { pattern: /(?<=^|[^\p{L}\d])nghị đinh(?=[^\p{L}\d]|$)/giu, replacement: 'nghị định', reason: "Sửa lỗi thiếu dấu nặng trong 'nghị định'" },
  { pattern: /(?<=^|[^\p{L}\d])quyêt định(?=[^\p{L}\d]|$)/giu, replacement: 'quyết định', reason: "Sửa lỗi thiếu dấu sắc trong 'quyết định'" },
  { pattern: /(?<=^|[^\p{L}\d])kế hoach(?=[^\p{L}\d]|$)/giu, replacement: 'kế hoạch', reason: "Sửa lỗi thiếu dấu nặng trong 'kế hoạch'" },
  { pattern: /(?<=^|[^\p{L}\d])tờ trinh(?=[^\p{L}\d]|$)/giu, replacement: 'tờ trình', reason: "Sửa lỗi thiếu dấu huyền trong 'tờ trình'" },
  { pattern: /(?<=^|[^\p{L}\d])biên ban(?=[^\p{L}\d]|$)/giu, replacement: 'biên bản', reason: "Sửa lỗi thiếu dấu hỏi trong 'biên bản'" },
  { pattern: /(?<=^|[^\p{L}\d])giám đôc(?=[^\p{L}\d]|$)/giu, replacement: 'giám đốc', reason: "Sửa lỗi thiếu dấu sắc trong 'giám đốc'" },
  { pattern: /(?<=^|[^\p{L}\d])chuẩn bi(?=[^\p{L}\d]|$)/giu, replacement: 'chuẩn bị', reason: "Sửa lỗi thiếu dấu nặng trong 'chuẩn bị'" },
  { pattern: /(?<=^|[^\p{L}\d])thực hiên(?=[^\p{L}\d]|$)/giu, replacement: 'thực hiện', reason: "Sửa lỗi thiếu dấu nặng trong 'thực hiện'" },
  { pattern: /(?<=^|[^\p{L}\d])tiến đô(?=[^\p{L}\d]|$)/giu, replacement: 'tiến độ', reason: "Sửa lỗi thiếu dấu nặng trong 'tiến độ'" },
  { pattern: /(?<=^|[^\p{L}\d])đai hội(?=[^\p{L}\d]|$)/giu, replacement: 'đại hội', reason: "Sửa lỗi thiếu dấu nặng trong 'đại hội'" },
  { pattern: /(?<=^|[^\p{L}\d])hội nghi(?=[^\p{L}\d]|$)/giu, replacement: 'hội nghị', reason: "Sửa lỗi thiếu dấu nặng trong 'hội nghị'" },
  { pattern: /(?<=^|[^\p{L}\d])nhiêm vụ(?=[^\p{L}\d]|$)/giu, replacement: 'nhiệm vụ', reason: "Sửa lỗi thiếu dấu nặng trong 'nhiệm vụ'" },
  { pattern: /(?<=^|[^\p{L}\d])nhiêm kỳ(?=[^\p{L}\d]|$)/giu, replacement: 'nhiệm kỳ', reason: "Sửa lỗi thiếu dấu nặng trong 'nhiệm kỳ'" },
  { pattern: /(?<=^|[^\p{L}\d])xắp xếp(?=[^\p{L}\d]|$)/giu, replacement: 'sắp xếp', reason: "Sửa lỗi chính tả âm đầu s/x: 'xắp xếp' → 'sắp xếp'" },
  { pattern: /(?<=^|[^\p{L}\d])bổ xung(?=[^\p{L}\d]|$)/giu, replacement: 'bổ sung', reason: "Sửa lỗi chính tả âm đầu s/x: 'bổ xung' → 'bổ sung'" },
  { pattern: /(?<=^|[^\p{L}\d])xử lí(?=[^\p{L}\d]|$)/giu, replacement: 'xử lý', reason: "Chuẩn hóa chính tả 'xử lý' theo quy định văn thư hành chính" },
  { pattern: /(?<=^|[^\p{L}\d])kỉ luật(?=[^\p{L}\d]|$)/giu, replacement: 'kỷ luật', reason: "Chuẩn hóa chính tả 'kỷ luật' theo quy định văn thư hành chính" },
  { pattern: /(?<=^|[^\p{L}\d])kí kết(?=[^\p{L}\d]|$)/giu, replacement: 'ký kết', reason: "Chuẩn hóa chính tả 'ký kết' theo quy định văn thư hành chính" },
  { pattern: /(?<=^|[^\p{L}\d])chuyên môn nghiệp vụ(?=[^\p{L}\d]|$)/giu, replacement: 'chuyên môn, nghiệp vụ', reason: "Bổ sung dấu phẩy ngăn cách cụm liệt kê 'chuyên môn, nghiệp vụ'" },
];

function extractPlainText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isEligibleNarrativeParagraph(html: string, plainText: string): boolean {
  if (!plainText) return false;
  if (/<p\b[^>]*style\s*=\s*(["'])[^"']*text-align\s*:\s*(?:center|right)/i.test(html)) return false;
  if (/^\s*[-—–_.\s]{3,}$/u.test(plainText)) return false;
  if (/^(?:điều\s+\d+|chương\s+|mục\s+)/iu.test(plainText)) return false;
  return true;
}

function scanBodyNodesForRuleSuggestions(nodes: ProjectedNode[]): BodyRuleSuggestion[] {
  const suggestions: BodyRuleSuggestion[] = [];
  for (const node of nodes) {
    if (!node.editable || node.container !== 'body') continue;
    const match = node.html.trim().match(/^<p\b([^>]*)>([\s\S]*)<\/p>$/i);
    if (!match) continue;
    const [, attrs, innerHtml] = match;
    if (/<(?:table|img|svg|ul|ol|li|br|span)\b/i.test(innerHtml)) continue;
    const plain = extractPlainText(node.html);
    if (!plain) continue;

    // 1. Check clause prefix rules (Điều / Khoản / Điểm)
    const dieuColon = plain.match(/^(\s*Điều\s+\d+)\s*:\s*(.+)$/iu);
    if (dieuColon) {
      const updatedInner = innerHtml.replace(/^(\s*(?:<(?:strong|b)>)?\s*Điều\s+\d+)\s*:\s*/iu, '$1. ');
      if (updatedInner !== innerHtml) {
        suggestions.push({
          id: `rule-dieu-${node.editableNodeId}`,
          nodeId: node.editableNodeId,
          category: 'clause',
          categoryLabel: 'Quy cách Điều/Khoản',
          beforeExcerpt: `${dieuColon[1]}:`,
          afterExcerpt: `${dieuColon[1]}.`,
          reason: 'Sau số thứ tự Điều phải dùng dấu chấm (Điều 1.) thay vì dấu hai chấm theo Phụ lục I Nghị định 30.',
          nextHtml: `<p${attrs}>${updatedInner}</p>`,
        });
        continue;
      }
    }

    const khoanSlash = plain.match(/^(\s*)(\d+)\s*[/)]\s+(.+)$/u);
    if (khoanSlash && !/<(?:strong|b|em|i|u)\b/i.test(innerHtml)) {
      const nextPlain = plain.replace(/^(\s*)(\d+)\s*[/)]\s+/u, '$1$2. ');
      suggestions.push({
        id: `rule-khoan-${node.editableNodeId}`,
        nodeId: node.editableNodeId,
        category: 'clause',
        categoryLabel: 'Quy cách Khoản',
        beforeExcerpt: plain.slice(0, 28),
        afterExcerpt: nextPlain.slice(0, 28),
        reason: 'Số thứ tự Khoản trong văn bản hành chính dùng chữ số Ả Rập kèm dấu chấm (1., 2.).',
        nextHtml: `<p${attrs}>${escapeHtmlText(nextPlain)}</p>`,
      });
      continue;
    }

    const diemDot = plain.match(/^(\s*)([a-zđ])\.\s+(.+)$/u);
    if (diemDot && !/<(?:strong|b|em|i|u)\b/i.test(innerHtml)) {
      const nextPlain = plain.replace(/^(\s*)([a-zđ])\.\s+/u, '$1$2) ');
      suggestions.push({
        id: `rule-diem-${node.editableNodeId}`,
        nodeId: node.editableNodeId,
        category: 'clause',
        categoryLabel: 'Quy cách Điểm',
        beforeExcerpt: plain.slice(0, 28),
        afterExcerpt: nextPlain.slice(0, 28),
        reason: 'Các Điểm trong Khoản dùng chữ cái thường kèm dấu ngoặc đơn đóng: a), b), c).',
        nextHtml: `<p${attrs}>${escapeHtmlText(nextPlain)}</p>`,
      });
      continue;
    }

    // 2. Check spelling rules
    for (const rule of BODY_SPELLING_RULES) {
      rule.pattern.lastIndex = 0;
      const found = rule.pattern.exec(plain);
      if (found) {
        const matchedWord = found[0];
        const preserveCap = matchedWord[0] === matchedWord[0]?.toUpperCase() && matchedWord[0] !== matchedWord[0]?.toLowerCase()
          ? rule.replacement[0].toUpperCase() + rule.replacement.slice(1)
          : rule.replacement;
        const nextInner = innerHtml.replace(matchedWord, preserveCap);
        if (nextInner !== innerHtml) {
          suggestions.push({
            id: `rule-spell-${node.editableNodeId}-${matchedWord}`,
            nodeId: node.editableNodeId,
            category: 'spelling',
            categoryLabel: 'Chính tả & Câu từ',
            beforeExcerpt: matchedWord,
            afterExcerpt: preserveCap,
            reason: rule.reason,
            nextHtml: `<p${attrs}>${nextInner}</p>`,
          });
        }
      }
    }
  }
  return suggestions;
}

function capabilityMessage(reason: string): string {
  if (reason === 'table_source_evidence_unavailable') return 'Thiếu bằng chứng nguồn đủ để mở sửa ô này.';
  if (reason === 'merged_cell_readonly') return 'Ô gộp; cấu trúc ô vẫn được giữ nguyên.';
  if (reason === 'multi_paragraph_cell_readonly') return 'Ô có nhiều đoạn; thao tác sửa ô chưa chứng minh bảo toàn cấu trúc.';
  if (reason === 'rich_cell_runs_readonly') return 'Ô có định dạng hoặc nhiều lượt chữ; chỉ đọc để giữ nguyên.';
  if (reason === 'template_table_not_registered') return 'Bảng mẫu chưa được đăng ký trong mô hình làm việc.';
  return 'Ô chỉ đọc để bảo toàn định dạng và dữ liệu nguồn.';
}

function groupStatus(
  group: ReturnType<typeof projectWorkspace>['groups'][number],
  seal: ReturnType<typeof projectWorkspace>['seal'],
  issues?: ND30ComplianceReport['issues'],
) {
  if (group.id === 8) {
    if (seal?.status === 'present') return { label: 'Nguồn ghi nhận có', tone: 'evidence', Icon: CheckCircle2 };
    if (seal?.status === 'missing') return { label: 'Nguồn ghi nhận chưa có', tone: 'quiet', Icon: AlertCircle };
    if (seal?.status === 'unverified') return { label: 'Chưa xác minh', tone: 'review', Icon: HelpCircle };
    return { label: 'Chưa có bằng chứng', tone: 'quiet', Icon: HelpCircle };
  }
  const groupFieldKeys = new Set<string>(group.fields.map(field => field.key));
  const matchedIssue = issues?.find(issue => groupFieldKeys.has(issue.field));
  if (matchedIssue) {
    return { label: matchedIssue.title || 'Cần xem lại thể thức', tone: 'review', Icon: AlertCircle };
  }
  const fieldsToCheck = group.id === 1 ? group.fields.filter(field => field.key === 'nationalHeader1')
    : group.id === 2 ? group.fields.filter(field => field.key === 'orgHeader2') : group.fields;
  const complete = fieldsToCheck.length > 0 && fieldsToCheck.every(field => !isPlaceholderValue(field.value));
  if (complete) return { label: 'Có dữ liệu', tone: 'evidence', Icon: CheckCircle2 };
  if (group.id === 7) return { label: 'Chưa xác định người ký', tone: 'quiet', Icon: HelpCircle };
  const hasSourceOrDraft = group.sourceBlockIds.length > 0 || group.fields.some(field => field.value.trim().length > 0);
  return hasSourceOrDraft
    ? { label: 'Cần bổ sung', tone: 'review', Icon: AlertCircle }
    : { label: 'Chưa có dữ liệu', tone: 'quiet', Icon: AlertCircle };
}

function parseLocationAndDate(value: string) {
  const text = value.trim();
  const vietnameseDate = text.match(/^(.*?)(?:,\s*|\s+)?ngày\s+(\d{1,2}|[.…]{1,6})\s+tháng\s+(\d{1,2}|[.…]{1,6})\s+năm\s+(\d{4}|[.…]{1,6})$/i);
  if (vietnameseDate) {
    const [, location = '', dayText = '', monthText = '', yearText = ''] = vietnameseDate;
    if (/^\d+$/.test(dayText) && /^\d+$/.test(monthText) && /^\d{4}$/.test(yearText)) {
      const day = Number(dayText), month = Number(monthText), year = Number(yearText);
      const date = new Date(Date.UTC(year, month - 1, day));
      const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
      return { location: location.trim(), date: valid ? yearText + '-' + monthText.padStart(2, '0') + '-' + dayText.padStart(2, '0') : '', recognized: true };
    }
    return { location: location.trim(), date: '', recognized: true };
  }
  const slashDate = text.match(/^(.*?)(?:,\s*|\s+)?(?:ngày\s+)?(\d{1,2})\s*[/. -]\s*(\d{1,2})\s*[/. -]\s*(\d{4})$/i);
  if (slashDate) {
    const [, location = '', dayText = '', monthText = '', yearText = ''] = slashDate;
    const day = Number(dayText), month = Number(monthText), year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return { location: location.trim(), date: valid ? yearText + '-' + monthText.padStart(2, '0') + '-' + dayText.padStart(2, '0') : '', recognized: true };
  }
  return { location: text, date: '', recognized: false };
}

function composeLocationAndDate(location: string, date: string) {
  const place = location.trim().replace(/,\s*$/, '');
  if (!place && !date) return '';
  let dateText = 'ngày ...... tháng ...... năm ......';
  if (date) {
    const [year = '', month = '', day = ''] = date.split('-');
    dateText = 'ngày ' + day.padStart(2, '0') + ' tháng ' + month.padStart(2, '0') + ' năm ' + year;
  }
  return (place ? place + ', ' : '') + dateText;
}

function formatLocationAndDate(value: string) {
  const parts = parseLocationAndDate(value);
  if (parts.recognized) return composeLocationAndDate(parts.location, parts.date);
  if (/\bngày\b|\d{1,2}\s*[/. -]\s*\d{1,2}\s*[/. -]\s*\d{4}/i.test(value)) return value.trim();
  return composeLocationAndDate(parts.location, '');
}

function ComponentCard({
  group, seal, issues, onAction, isOfficialLetter = false, standardType, omitNationalHeader, headerProfile, onRequestRegimeSwitch,
}: {
  group: ReturnType<typeof projectWorkspace>['groups'][number];
  seal: ReturnType<typeof projectWorkspace>['seal'];
  issues?: ND30ComplianceReport['issues'];
  onAction: (action: WorkspaceAction) => boolean;
  isOfficialLetter?: boolean;
  standardType: 'state' | 'party';
  omitNationalHeader?: boolean;
  headerProfile?: DocumentState['headerProfile'];
  onRequestRegimeSwitch: (regime: 'state' | 'party') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<keyof DocumentState, string>>>({});
  const [locationDraft, setLocationDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [issuerProfiles, setIssuerProfiles] = useState<IssuerProfile[]>(loadIssuerProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false);
  const [profileManagerOpen, setProfileManagerOpen] = useState(false);
  const [headerChoiceDraft, setHeaderChoiceDraft] = useState<'state' | 'party' | 'none'>('state');
  const previewButton = useRef<HTMLButtonElement | null>(null);
  const editDialog = useAccessibleDialog(editing, () => setEditing(false), { initialFocusSelector: 'input, textarea' });
  const status = group.id === 1 && omitNationalHeader
    ? { label: 'Đã chọn không dùng', tone: 'evidence', Icon: CheckCircle2 }
    : groupStatus(group, seal, issues);
  const hasEditableFields = group.id === 1 || group.id === 2 || group.fields.some(field => field.editable);
  const availableProfiles = [...BUILT_IN_ISSUER_PROFILES, ...issuerProfiles].filter(profile => profile.regime === standardType);
  const StatusIcon = status.Icon;
  const beginEditing = () => {
    const nextDrafts: Partial<Record<keyof DocumentState, string>> = {};
    for (const field of group.fields) nextDrafts[field.key] = field.value;
    setDrafts(nextDrafts);
    const dateParts = parseLocationAndDate(group.fields.find(field => field.key === 'locationAndDate')?.value ?? '');
    setLocationDraft(dateParts.location);
    setDateDraft(dateParts.date);
    setHeaderChoiceDraft(omitNationalHeader ? 'none' : standardType);
    if (group.id === 2) {
      const org1 = String(nextDrafts.orgHeader1 ?? '');
      const org2 = String(nextDrafts.orgHeader2 ?? '');
      const match = availableProfiles.find(profile => profile.orgHeader1 === org1 && profile.orgHeader2 === org2);
      setSelectedProfileId(match?.id ?? '');
      setProfileName(match?.builtIn ? '' : match?.name ?? '');
      setProfileNotice('');
      setConfirmDeleteProfile(false);
      setProfileManagerOpen(false);
    }
    setEditing(true);
  };
  const saveAndClose = () => {
    if (group.id === 1) {
      if (headerChoiceDraft === (omitNationalHeader ? 'none' : standardType)) {
        setEditing(false);
        return;
      }
      if (headerChoiceDraft === 'none') {
        if (onAction({ type: 'setNationalHeaderOmitted', omitted: true })) setEditing(false);
      } else if (headerChoiceDraft === standardType) {
        if (onAction({ type: 'setNationalHeaderOmitted', omitted: false })) setEditing(false);
      } else {
        setEditing(false);
        onRequestRegimeSwitch(headerChoiceDraft);
      }
      return;
    }
    if (group.id === 2) {
      const orgHeader1 = String(drafts.orgHeader1 ?? group.fields.find(field => field.key === 'orgHeader1')?.value ?? '');
      const orgHeader2 = String(drafts.orgHeader2 ?? group.fields.find(field => field.key === 'orgHeader2')?.value ?? '');
      if (!selectedProfileId && headerProfile && headerProfile !== 'generic'
        && orgHeader1 === group.fields.find(field => field.key === 'orgHeader1')?.value
        && orgHeader2 === group.fields.find(field => field.key === 'orgHeader2')?.value) {
        setEditing(false); return;
      }
      const selected = availableProfiles.find(profile => profile.id === selectedProfileId);
      const exactPreset = selected?.builtIn && selected.orgHeader1 === orgHeader1 && selected.orgHeader2 === orgHeader2;
      const profile = exactPreset ? standardType === 'party' ? COMPANY_HEADER_HD05_PROFILE_ID : COMPANY_HEADER_PROFILE_ID : 'generic';
      if (orgHeader1 === group.fields.find(field => field.key === 'orgHeader1')?.value
        && orgHeader2 === group.fields.find(field => field.key === 'orgHeader2')?.value && profile === (headerProfile ?? 'generic')) {
        setEditing(false); return;
      }
      if (onAction({ type: 'applyIssuerProfile', orgHeader1, orgHeader2, profile })) setEditing(false);
      return;
    }
    const fields: Partial<Record<keyof DocumentState, string>> = {};
    for (const field of group.fields) {
      if (!field.editable) continue;
      const value = field.key === 'locationAndDate'
        ? composeLocationAndDate(locationDraft, dateDraft)
        : drafts[field.key] ?? field.value;
      if (value !== field.value) fields[field.key] = value;
    }
    if (!Object.keys(fields).length || onAction({ type: 'editFields', fields })) setEditing(false);
  };
  const selectIssuerProfile = (id: string) => {
    const selected = availableProfiles.find(profile => profile.id === id);
    setSelectedProfileId(id);
    setProfileName(selected?.builtIn ? '' : selected?.name ?? '');
    setConfirmDeleteProfile(false);
    setProfileNotice('');
    setDrafts(current => ({
      ...current,
      orgHeader1: selected?.orgHeader1 ?? group.fields.find(field => field.key === 'orgHeader1')?.value ?? '',
      orgHeader2: selected?.orgHeader2 ?? group.fields.find(field => field.key === 'orgHeader2')?.value ?? '',
    }));
  };
  const saveIssuerProfile = () => {
    const name = profileName.trim();
    const orgHeader1 = String(drafts.orgHeader1 ?? '').trim();
    const orgHeader2 = String(drafts.orgHeader2 ?? '').trim();
    if (!name || !orgHeader2) { setProfileNotice('Nhập tên profile và cơ quan ban hành trước khi lưu.'); return; }
    const existing = issuerProfiles.find(profile => profile.id === selectedProfileId);
    const nextProfile: IssuerProfile = { id: existing?.id ?? crypto.randomUUID(), name, regime: standardType, orgHeader1, orgHeader2 };
    const next = existing ? issuerProfiles.map(profile => profile.id === existing.id ? nextProfile : profile) : [...issuerProfiles, nextProfile];
    if (!saveIssuerProfiles(next)) { setProfileNotice('Không thể lưu profile trên trình duyệt này.'); return; }
    setIssuerProfiles(next);
    setSelectedProfileId(nextProfile.id);
    setProfileNotice('Đã lưu profile. Chọn “Lưu & đóng” để áp dụng vào văn bản.');
  };
  const deleteIssuerProfile = () => {
    const selected = issuerProfiles.find(profile => profile.id === selectedProfileId);
    if (!selected) return;
    const next = issuerProfiles.filter(profile => profile.id !== selected.id);
    if (!saveIssuerProfiles(next)) { setProfileNotice('Không thể xóa profile trên trình duyệt này.'); return; }
    setIssuerProfiles(next);
    setSelectedProfileId('');
    setProfileName('');
    setDrafts(current => ({
      ...current,
      orgHeader1: group.fields.find(field => field.key === 'orgHeader1')?.value ?? '',
      orgHeader2: group.fields.find(field => field.key === 'orgHeader2')?.value ?? '',
    }));
    setConfirmDeleteProfile(false);
    setProfileNotice('Đã xóa profile. Nội dung đang có trong văn bản được giữ nguyên.');
  };
  const statusIcon = <span role="img" data-status-tone={status.tone} className={`df-ws-status-icon df-ws-status-icon-${status.tone}`} aria-label={status.label} title={status.label}><StatusIcon size={16} strokeWidth={2.5} aria-hidden="true" /></span>;
  const title = <span className="df-ws-component-title" role="heading" aria-level={3}><span>{String(group.id).padStart(2, '0')}.</span> {group.name.replace(/^\d+\.\s*/, '')}</span>;
  const values = group.id === 2
    ? <div className="df-ws-issuer-summary">
      {(['orgHeader1', 'orgHeader2'] as const).map(key => <div className="df-ws-issuer-summary-row" key={key}>
        <span>{labels[key]}</span>
        <strong>{group.fields.find(field => field.key === key)?.value.trim() || 'Chưa có dữ liệu'}</strong>
      </div>)}
    </div>
    : group.id === 1 && omitNationalHeader
    ? <span className="df-ws-component-value df-ws-empty-header">Không dùng tiêu đề thể thức</span>
    : group.id === 8
    ? <span className="df-ws-component-value">{seal?.status === 'present' ? 'Có dấu hoặc chữ ký số trong nguồn.' : seal?.status === 'missing' ? 'Nguồn ghi nhận chưa có dấu hoặc chữ ký số.' : seal?.status === 'unverified' ? 'Dấu hoặc chữ ký số cần được đối chiếu.' : 'Chưa có dữ liệu bằng chứng cho dấu hoặc chữ ký số.'}</span>
    : group.id === 9
    ? <div className="df-ws-component-values df-ws-recipients-container">
      {group.fields.map(field => {
        const rawValue = field.value.trim();
        if (!rawValue) {
          return <span className="df-ws-component-value" key={field.key}>Chưa có dữ liệu trong bản soạn.</span>;
        }
        let lines = rawValue.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1 && rawValue.includes(';')) {
          const rawParts = rawValue.split(/;\s*/).map(l => l.trim()).filter(Boolean);
          if (rawParts.length > 1) {
            lines = rawParts.map((part, idx) => (idx < rawParts.length - 1 ? part + ';' : part));
          }
        }
        if (lines.length > 0 && /^Nơi nhận\s*:\s*[-–]/i.test(lines[0])) {
          const first = lines[0];
          const colonIdx = first.indexOf(':');
          const header = first.slice(0, colonIdx + 1).trim();
          const rest = first.slice(colonIdx + 1).trim();
          lines = [header, rest, ...lines.slice(1)];
        }
        return <div className="df-ws-recipients-list" key={field.key} title={rawValue}>
          {lines.map((line, idx) => {
            const isHeader = idx === 0 && /^Nơi nhận\s*:/i.test(line);
            return (
              <div
                key={idx}
                className={isHeader ? 'df-ws-recipient-header' : 'df-ws-recipient-item'}
              >
                {line}
              </div>
            );
          })}
        </div>;
      })}
      {group.fields.length === 0 && <span className="df-ws-component-value">Chưa có dữ liệu trong bản soạn.</span>}
    </div>
    : <span className="df-ws-component-values">
      {group.fields.map(field => {
        const value = field.value.trim()
          ? field.key === 'locationAndDate' ? formatLocationAndDate(field.value) : field.value.trim()
          : 'Chưa có dữ liệu trong bản soạn.';
        return <span className="df-ws-component-value" key={field.key} title={value}>
          {group.id === 5 && <span className="df-ws-field-caption">{labels[field.key] ?? field.key}</span>}
          <span>{value}</span>
        </span>;
      })}
      {group.fields.length === 0 && <span className="df-ws-component-value">Chưa có dữ liệu trong bản soạn.</span>}
    </span>;
  const fieldEditor = group.id === 1 ? <fieldset className="df-ws-header-choice">
    <legend>Tiêu đề thể thức</legend>
    <label><input type="radio" name="national-header-choice" checked={headerChoiceDraft === 'state'} onChange={() => setHeaderChoiceDraft('state')} /> NĐ30 · Quốc hiệu và tiêu ngữ</label>
    <label><input type="radio" name="national-header-choice" checked={headerChoiceDraft === 'party'} onChange={() => setHeaderChoiceDraft('party')} /> HD05 · Đảng Cộng sản Việt Nam</label>
    <label><input type="radio" name="national-header-choice" checked={headerChoiceDraft === 'none'} onChange={() => setHeaderChoiceDraft('none')} /> Không dùng · để trống vị trí này</label>
  </fieldset> : group.fields.map(field => {
    if (field.key === 'locationAndDate' && field.editable) return <div className="df-ws-date-fields" key={field.key}>
      <label>
        <span>Địa danh</span>
        <input aria-label="Địa danh" data-workspace-field="location" type="text" value={locationDraft} onChange={event => setLocationDraft(event.target.value)} placeholder="Ví dụ: Hải Phòng" />
      </label>
      <label>
        <span>Ngày tháng (có thể để trống khi soạn)</span>
        <input aria-label="Chọn ngày tháng" data-workspace-field="date" type="date" value={dateDraft} onChange={event => setDateDraft(event.target.value)} />
      </label>
      <p className="df-ws-date-preview">{composeLocationAndDate(locationDraft, dateDraft) || 'ngày ...... tháng ...... năm ......'}</p>
    </div>;
    return <label key={field.key}>
      <span>{labels[field.key] ?? field.key}</span>
      {field.editable || group.id === 2
        ? <textarea
          aria-label={labels[field.key] ?? field.key}
          data-workspace-field={field.key}
          value={drafts[field.key] ?? field.value}
          rows={field.key === 'recipients' ? 10 : field.key === 'referenceNumber' ? 5 : field.key === 'subject' ? 3 : 2}
          onChange={event => setDrafts(current => ({ ...current, [field.key]: event.target.value }))}
        />
        : <textarea aria-label={labels[field.key] ?? field.key} value={field.value} readOnly rows={field.key === 'subject' ? 3 : 2} />}
    </label>;
  });

  return <>
    <article
      id={`df-step2-group-${group.id}`}
      className={`df-ws-component-card df-ws-tone-${status.tone}`}
      data-workspace-group={group.id}
      data-office-letter={group.id === 5 && isOfficialLetter ? 'true' : undefined}
    >
      {hasEditableFields
        ? <button ref={previewButton} type="button" className="df-ws-component-preview" aria-haspopup="dialog" onClick={beginEditing}>
          <span className="df-ws-component-heading"><span className="df-ws-component-label">{title}{statusIcon}</span></span>
          {values}
        </button>
        : <header className="df-ws-component-heading">
          <div className="df-ws-component-label"><h3><span>{String(group.id).padStart(2, '0')}.</span> {group.name.replace(/^\d+\.\s*/, '')}</h3>{statusIcon}</div>
        </header>}
      {!hasEditableFields && values}
      {group.cellReferences.length > 0 && <p className="df-ws-component-note">{group.cellReferences.length} ô bảng nguồn được tham chiếu.</p>}
    </article>
    {editing && createPortal(<div className="df-ws-edit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(false); }}>
      <section ref={editDialog} role="dialog" aria-modal="true" aria-labelledby={`df-ws-edit-title-${group.id}`} className="df-ws-edit-dialog">
        <header className="df-ws-edit-dialog-header">
          <h2 id={`df-ws-edit-title-${group.id}`}>{String(group.id).padStart(2, '0')}. {group.name.replace(/^\d+\.\s*/, '')}</h2>
          <button type="button" aria-label="Đóng hộp thoại" onClick={() => setEditing(false)}>×</button>
        </header>
        <div className="df-ws-edit-dialog-body">
          <div className="df-ws-field-editor" id={`df-ws-field-editor-${group.id}`}>
            {group.id === 2 && <fieldset className="df-ws-profile-picker">
              <legend>Profile cơ quan</legend>
              <label className={`df-ws-profile-choice${!selectedProfileId ? ' is-selected' : ''}`}>
                <input type="radio" name="issuer-profile-choice" checked={!selectedProfileId} onChange={() => selectIssuerProfile('')} />
                <span className="df-ws-profile-choice-content"><strong>Thông tin hiện tại / profile mới</strong>
                  <span><b>Cơ quan cấp trên</b>{String(drafts.orgHeader1 ?? '').trim() || 'Để trống'}</span>
                  <span><b>Cơ quan ban hành</b>{String(drafts.orgHeader2 ?? '').trim() || 'Để trống'}</span>
                </span>
              </label>
              {availableProfiles.map(profile => <label key={profile.id} className={`df-ws-profile-choice${selectedProfileId === profile.id ? ' is-selected' : ''}`}>
                <input type="radio" name="issuer-profile-choice" checked={selectedProfileId === profile.id} onChange={() => selectIssuerProfile(profile.id)} />
                <span className="df-ws-profile-choice-content"><strong>{profile.name}{profile.builtIn ? ' · mẫu có sẵn' : ''}</strong>
                  <span><b>Cơ quan cấp trên</b>{profile.orgHeader1.trim() || 'Để trống'}</span>
                  <span><b>Cơ quan ban hành</b>{profile.orgHeader2.trim() || 'Để trống'}</span>
                </span>
              </label>)}
              <button type="button" className="df-ws-profile-manage-toggle" aria-expanded={profileManagerOpen} aria-controls="df-ws-profile-manager-2" onClick={() => setProfileManagerOpen(value => !value)}>{profileManagerOpen ? 'Ẩn quản lý profile' : 'Quản lý profile'}</button>
            </fieldset>}
            {fieldEditor}
            {group.id === 2 && profileManagerOpen && <div className="df-ws-profile-manager" id="df-ws-profile-manager-2">
              <div className="df-ws-profile-actions">
                <button type="button" onClick={() => { setSelectedProfileId(''); setProfileName(''); setConfirmDeleteProfile(false); setProfileNotice('Nhập tên và thông tin cơ quan để tạo profile mới.'); }}>Thêm profile</button>
                {selectedProfileId && !availableProfiles.find(profile => profile.id === selectedProfileId)?.builtIn && (confirmDeleteProfile
                  ? <><span>Xóa profile này?</span><button type="button" onClick={deleteIssuerProfile}>Xác nhận xóa</button><button type="button" onClick={() => setConfirmDeleteProfile(false)}>Hủy</button></>
                  : <button type="button" onClick={() => setConfirmDeleteProfile(true)}>Xóa profile</button>)}
              </div>
              {!availableProfiles.find(profile => profile.id === selectedProfileId)?.builtIn && <div className="df-ws-profile-save">
                <label><span>Tên profile</span><input aria-label="Tên profile cơ quan" value={profileName} onChange={event => setProfileName(event.target.value)} placeholder="Ví dụ: Cơ quan của tôi" /></label>
                <button type="button" onClick={saveIssuerProfile}>{issuerProfiles.some(profile => profile.id === selectedProfileId) ? 'Cập nhật profile' : 'Lưu profile mới'}</button>
              </div>}
              {availableProfiles.find(profile => profile.id === selectedProfileId)?.builtIn && <p>Profile mẫu chỉ đọc. Chọn “Thêm profile” để lưu bản tùy chỉnh.</p>}
            </div>}
            {group.id === 2 && profileNotice && <p className="df-ws-profile-notice" role="status">{profileNotice}</p>}
          </div>
        </div>
        <footer className="df-ws-edit-dialog-footer">
          <button type="button" onClick={() => setEditing(false)}>Hủy</button>
          <button type="button" className="df-ws-save-close" onClick={saveAndClose}>Lưu &amp; đóng</button>
        </footer>
      </section>
    </div>, document.body)}
  </>;
}


function RecipientComponentCard({
  recipientHeader,
  standardType,
  documentType,
  subject,
  onSave,
  onRestoreToBody,
}: {
  recipientHeader?: RecipientBlock;
  standardType: 'state' | 'party';
  documentType?: string;
  subject?: string;
  onSave: (header: RecipientBlock | undefined) => void;
  onRestoreToBody: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isToTrinh = /tờ\s*trình/i.test(documentType || '') || /tờ\s*trình/i.test(subject || '');
  const isParty = standardType === 'party';

  const [kind, setKind] = useState<RecipientKind>(
    recipientHeader?.kind ?? (isParty && isToTrinh ? 'kinh_trinh' : 'kinh_gui')
  );
  const [textDraft, setTextDraft] = useState<string>(
    recipientHeader?.items?.map((it: RecipientItem) => it.text).join('\n') ?? ''
  );

  const openModal = () => {
    setKind(recipientHeader?.kind ?? (isParty && isToTrinh ? 'kinh_trinh' : 'kinh_gui'));
    setTextDraft(recipientHeader?.items?.map((it: RecipientItem) => it.text).join('\n') ?? '');
    setEditing(true);
  };

  const handleSave = () => {
    const rawLines = textDraft.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) {
      onSave(undefined);
    } else {
      const items: RecipientItem[] = rawLines.map((line, idx) => ({
        id: recipientHeader?.items?.[idx]?.id || crypto.randomUUID(),
        text: line.replace(/^[-*•–—]\s*/, '').replace(/[\.;]+$/, '').trim(),
      }));
      onSave({
        id: recipientHeader?.id || `recipient-header-${crypto.randomUUID()}`,
        kind: (!isParty && isToTrinh) ? 'kinh_gui' : kind,
        presence: 'confirmed',
        items,
        sourceAnchor: recipientHeader?.sourceAnchor,
      });
    }
    setEditing(false);
  };

  const handleRemove = () => {
    onSave(undefined);
    setEditing(false);
  };

  const handleRestore = () => {
    onRestoreToBody();
    setEditing(false);
  };

  const effectiveKind = (!isParty && isToTrinh) ? 'kinh_gui' : (recipientHeader?.kind || 'kinh_gui');
  const labelText = effectiveKind === 'kinh_trinh' ? 'Kính trình:' : 'Kính gửi:';
  const hasItems = Boolean(recipientHeader?.items && recipientHeader.items.length > 0);

  return (
    <>
      <article
        id="df-step2-group-recipient"
        className={`df-ws-component-card df-ws-recipient-card ${hasItems ? 'df-ws-recipient-card-active' : ''}`}
        data-workspace-group="recipient-header"
      >
        <button
          type="button"
          className="df-ws-component-preview"
          aria-haspopup="dialog"
          onClick={openModal}
        >
          <header className="df-ws-component-heading">
            <div className="df-ws-component-label">
              <h3><span>05b.</span> Khối Kính gửi / Kính trình</h3>
              <span className={`df-ws-badge ${hasItems ? 'is-verified' : 'is-neutral'}`}>
                {hasItems ? `${recipientHeader!.items.length} nơi nhận` : 'Chưa thiết lập'}
              </span>
            </div>
          </header>
          {hasItems ? (
            <div className="df-ws-recipient-header-content">
              <p className="font-semibold text-indigo-900">{labelText}</p>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {recipientHeader!.items.map((it: RecipientItem, idx: number) => (
                  <li key={it.id || idx}>{it.text}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Nhấn để thêm hoặc bóc tách khối Kính gửi / Kính trình độc lập khỏi Thân bài.
            </p>
          )}
        </button>
      </article>

      {editing && createPortal(
        <div className="df-ws-edit-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="df-ws-edit-title-recipient" className="df-ws-edit-dialog">
            <header className="df-ws-edit-dialog-header">
              <h2 id="df-ws-edit-title-recipient">Chỉnh sửa Khối Kính gửi / Kính trình</h2>
              <button type="button" aria-label="Đóng hộp thoại" onClick={() => setEditing(false)}>×</button>
            </header>
            <div className="df-ws-edit-dialog-body space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-slate-700">Hình thức xưng hô:</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="recipient-kind"
                      value="kinh_gui"
                      checked={kind === 'kinh_gui'}
                      onChange={() => setKind('kinh_gui')}
                    />
                    <span>Kính gửi</span>
                  </label>
                  <label className={`flex items-center gap-2 ${!isParty ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      name="recipient-kind"
                      value="kinh_trinh"
                      checked={kind === 'kinh_trinh'}
                      disabled={!isParty}
                      onChange={() => setKind('kinh_trinh')}
                    />
                    <span>Kính trình (chỉ áp dụng văn bản Đảng)</span>
                  </label>
                </div>
                {!isParty && isToTrinh && (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                    Theo Nghị định 30/2020/NĐ-CP, Tờ trình hành chính bắt buộc dùng "Kính gửi:", không dùng "Kính trình:".
                  </p>
                )}
              </fieldset>

              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">
                  Danh sách nơi nhận (mỗi dòng một đơn vị/cơ quan):
                </span>
                <textarea
                  className="w-full border rounded p-2 text-sm font-mono"
                  rows={6}
                  value={textDraft}
                  onChange={e => setTextDraft(e.target.value)}
                  placeholder="Ví dụ:\nCục Hàng hải Việt Nam\nCác phòng ban liên quan"
                />
              </label>

              <div className="flex justify-between items-center pt-2 border-t text-xs">
                {hasItems && (
                  <button
                    type="button"
                    className="text-amber-700 hover:underline"
                    onClick={handleRestore}
                  >
                    Chuyển lại vào Thân bài (Body)
                  </button>
                )}
                {hasItems && (
                  <button
                    type="button"
                    className="text-rose-600 hover:underline"
                    onClick={handleRemove}
                  >
                    Xóa khối Kính gửi
                  </button>
                )}
              </div>
            </div>
            <footer className="df-ws-edit-dialog-footer">
              <button type="button" onClick={() => setEditing(false)}>Hủy</button>
              <button type="button" className="df-ws-save-close" onClick={handleSave}>Lưu &amp; đóng</button>
            </footer>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}

export function WorkspaceEditor({
  snapshot, active, initialCanvasId, onCanvasSelected, onAction, onRequestRegimeSwitch, onPartition, onRefine,
  refining, aiProvider = 'gemini', chatGPTReady = true, onAiSettings = () => {}, canContinue, complianceReport, complianceRevision, onOpenCompliance,
  onPrev, onNext,
}: {
  snapshot: WorkspaceSnapshot;
  active: boolean;
  initialCanvasId: string;
  onCanvasSelected: (id: string) => void;
  onAction: (a: WorkspaceAction) => boolean;
  onRequestRegimeSwitch: (regime: 'state' | 'party') => void;
  onPartition: () => void;
  onRefine: (a: 'proofread' | 'formalize', nodeId?: string) => void;
  refining: boolean;
  aiProvider?: PartitionAiProviderKind;
  chatGPTReady?: boolean;
  onAiSettings?: () => void;
  canContinue: boolean;
  complianceReport: ND30ComplianceReport | null;
  complianceRevision: number | null;
  onOpenCompliance: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const projection = projectWorkspace(snapshot);
  const unlocked = canEnterWorkspaceStep(snapshot, 2);
  const [activeCanvas, setActiveCanvas] = useState(initialCanvasId);
  const [activeEditorId, setActiveEditorId] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [contextTab, setContextTab] = useState<'ai' | 'checks'>('ai');
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [formatNotice, setFormatNotice] = useState<string>('');
  const [ruleScanExecuted, setRuleScanExecuted] = useState(false);
  const [dismissedRuleIds, setDismissedRuleIds] = useState<Set<string>>(new Set());
  const [batchAiRunning, setBatchAiRunning] = useState(false);
  const [batchAiProgress, setBatchAiProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchAiQueue, setBatchAiQueue] = useState<BatchAiQueueItem[]>([]);
  const [batchAiNotice, setBatchAiNotice] = useState('');

  useEffect(() => {
    if (!active) setCanvasExpanded(false);
  }, [active]);
  useEffect(() => {
    if (!canvasExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCanvasExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canvasExpanded]);

  useEffect(() => {
    if (!contextOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contextOpen]);

  useEffect(() => {
    if (!formatNotice) return;
    const timer = window.setTimeout(() => setFormatNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [formatNotice]);

  const setActive = (id: string) => {
    setActiveCanvas(id);
    onCanvasSelected(id);
    setActiveEditorId('');
  };
  const editors = useRef(new Map<string, any>());
  const [removeId, setRemoveId] = useState<string | null>(null);
  const dialog = useAccessibleDialog(Boolean(removeId), () => setRemoveId(null));
  const selected = activeCanvas === 'body' || projection.appendices.some(appendix => appendix.id === activeCanvas) ? activeCanvas : 'body';
  const canvases: Canvas[] = [
    { id: 'body', title: 'Nội dung văn bản', accessibilityLabel: 'Nội dung văn bản', nodes: projection.body.nodes as ProjectedNode[] },
    ...projection.appendices.map((appendix, index) => {
      const title = appendix.title?.trim() || 'Chưa đặt tên';
      return { id: appendix.id, title: appendix.title || 'Phụ lục', accessibilityLabel: `Nội dung phụ lục ${index + 1}: ${title}`, nodes: appendix.nodes as ProjectedNode[] };
    }),
  ];
  const selectedCanvas = canvases.find(canvas => canvas.id === selected)!;
  const bodyNodes = (projection.body.nodes as ProjectedNode[]);
  const editableBodyNodes = useMemo(
    () => bodyNodes.filter(node => node.editable && extractPlainText(node.html).length > 0),
    [bodyNodes],
  );
  const activeBodyNode = selected === 'body'
    ? selectedCanvas.nodes.find(node => node.editableNodeId === activeEditorId && node.editable)
    : undefined;
  const printOrder = [2, 1, 3, 4, 5];
  const beforeGroups = projection.groups.filter(group => group.id >= 1 && group.id <= 5)
    .sort((a, b) => printOrder.indexOf(a.id) - printOrder.indexOf(b.id));
  const afterPrintOrder = [9, 7, 8];
  const afterGroups = projection.groups.filter(group => group.id >= 7 && group.id <= 9)
    .sort((a, b) => afterPrintOrder.indexOf(a.id) - afterPrintOrder.indexOf(b.id));
  const isOfficialLetter = snapshot.doc.documentType.trim().toLocaleUpperCase('vi-VN').startsWith('CÔNG VĂN');

  const currentComplianceReport = complianceRevision === snapshot.workspace.workingRevision ? complianceReport : null;

  const mapIssueToTarget = (field: string): { selector: string; label: string } | null => {
    if (field === 'referenceNumber') return { selector: '#df-step2-group-3', label: 'Mở số, ký hiệu' };
    if (field === 'locationAndDate') return { selector: '#df-step2-group-4', label: 'Mở ngày tháng' };
    if (field === 'documentType' || field === 'subject') return { selector: '#df-step2-group-5', label: 'Mở loại, trích yếu' };
    if (field === 'signTitle' || field === 'signName') return { selector: '#df-step2-group-7', label: 'Mở người ký' };
    if (field === 'recipients') return { selector: '#df-step2-group-9', label: 'Mở nơi nhận' };
    if (field === 'nationalHeader1' || field === 'nationalHeader2') return { selector: '#df-step2-group-1', label: 'Mở tiêu đề' };
    if (field === 'orgHeader1' || field === 'orgHeader2') return { selector: '#df-step2-group-2', label: 'Mở cơ quan' };
    return null;
  };

  const handleFocusTarget = (selector: string) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const btn = el.querySelector<HTMLButtonElement>('button.df-ws-component-preview');
    if (btn) {
      btn.click();
      return;
    }
    const editable = el.querySelector<HTMLElement>('[contenteditable="true"], input, textarea, button');
    if (editable) {
      editable.focus({ preventScroll: true });
    }
  };

  const handleFillTodayDate = () => {
    const currentVal = snapshot.doc.locationAndDate || '';
    const parsed = parseLocationAndDate(currentVal);
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const place = parsed.location || (snapshot.doc.headerProfile === COMPANY_HEADER_PROFILE_ID || snapshot.doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID ? 'Hải Phòng' : 'Hà Nội');
    const nextValue = composeLocationAndDate(place, `${yyyy}-${mm}-${dd}`);
    if (onAction({ type: 'editFields', fields: { locationAndDate: nextValue } })) {
      setFormatNotice(`Đã điền ngày hôm nay: ${nextValue}`);
    }
  };

  const actionItems: Array<{
    id: string;
    field?: string;
    title: string;
    message: string;
    impact: string;
    severity: 'blocked' | 'warning' | 'optional';
    actionLabel: string;
    onAction: () => void;
  }> = [];

  if (projection.unclassified.blocks.length > 0) {
    actionItems.push({
      id: 'unclassified_blocks',
      title: `${projection.unclassified.blocks.length} khối nội dung chưa phân loại`,
      message: 'Cần xác nhận phân vùng cho các khối chưa phân loại trước khi xuất văn bản.',
      impact: 'Cần phân vùng trước khi xuất',
      severity: 'blocked',
      actionLabel: 'Phân vùng',
      onAction: onPartition,
    });
  }

  if (currentComplianceReport?.issues.length) {
    for (const issue of currentComplianceReport.issues) {
      const target = mapIssueToTarget(issue.field);
      actionItems.push({
        id: issue.id,
        field: issue.field,
        title: issue.title,
        message: issue.message,
        impact: 'Cần xem lại thể thức',
        severity: 'warning',
        actionLabel: target?.label ?? 'Xem báo cáo',
        onAction: target ? () => handleFocusTarget(target.selector) : onOpenCompliance,
      });
    }
  }

  const targetStandardFormatting = useMemo(() => {
    const ruleIds = snapshot.standardType === 'party'
      ? (['HD05-BODY-LINE-SPACING', 'HD05-BODY-FIRST-LINE-INDENT'] as const)
      : (['BODY.PARAGRAPH.LINE_SPACING', 'BODY.PARAGRAPH.FIRST_LINE_INDENT'] as const);
    return resolveSemanticRuleFormatting(snapshot.standardType, snapshot.doc.headerProfile ?? 'generic', ruleIds);
  }, [snapshot.standardType, snapshot.doc.headerProfile]);

  const handleToggleFirstLineIndent = () => {
    if (!activeBodyNode) {
      setFormatNotice('Hãy đặt con trỏ vào một đoạn văn trong Thân bài để bật/tắt thụt đầu dòng.');
      return;
    }
    const plain = extractPlainText(activeBodyNode.html);
    if (!plain) return;
    const currentFmt = readSemanticParagraphFormatting(activeBodyNode.html);
    if (currentFmt.firstLineIndent) {
      const nextHtml = activeBodyNode.html.replace(/\sdata-df-first-line-indent\s*=\s*(["']).*?\1/i, '');
      if (nextHtml !== activeBodyNode.html && onAction({ type: 'editNode', id: activeBodyNode.editableNodeId, html: nextHtml })) {
        setFormatNotice('Đã bỏ thụt lề đầu dòng cho đoạn đang chọn.');
      }
      return;
    }
    const applied = applySemanticRuleFormatting(activeBodyNode.html, plain, targetStandardFormatting);
    if (applied.ok && applied.html !== activeBodyNode.html) {
      if (onAction({ type: 'editNode', id: activeBodyNode.editableNodeId, html: applied.html })) {
        setFormatNotice(`Đã áp dụng thụt đầu dòng (${targetStandardFormatting.firstLineIndent}) & giãn dòng chuẩn (${targetStandardFormatting.lineSpacing}).`);
      }
    } else {
      setFormatNotice('Đoạn đang chọn đã ở định dạng chuẩn hoặc chứa cấu trúc nhiều dòng.');
    }
  };

  const handleStandardizeBodyFormatting = () => {
    let updatedCount = 0;
    let skippedCount = 0;
    for (const node of bodyNodes) {
      if (!node.editable) {
        skippedCount += 1;
        continue;
      }
      const plain = extractPlainText(node.html);
      if (!isEligibleNarrativeParagraph(node.html, plain)) {
        skippedCount += 1;
        continue;
      }
      const applied = applySemanticRuleFormatting(node.html, plain, targetStandardFormatting);
      if (applied.ok && applied.html !== node.html) {
        if (onAction({ type: 'editNode', id: node.editableNodeId, html: applied.html })) {
          updatedCount += 1;
        }
      }
    }
    const regimeLabel = snapshot.standardType === 'party' ? 'Hướng dẫn 05' : 'Nghị định 30';
    if (updatedCount > 0) {
      setFormatNotice(`Đã chuẩn hóa thụt đầu dòng (${targetStandardFormatting.firstLineIndent}), giãn dòng (${targetStandardFormatting.lineSpacing}) & căn đều theo ${regimeLabel} cho ${updatedCount} đoạn văn.`);
    } else {
      setFormatNotice(`Tất cả đoạn văn đủ điều kiện trong Thân bài đã đạt chuẩn định dạng ${regimeLabel}${skippedCount > 0 ? ` (giữ nguyên ${skippedCount} bảng/tiêu đề)` : ''}.`);
    }
  };

  const bodyRuleSuggestions = useMemo(
    () => scanBodyNodesForRuleSuggestions(bodyNodes).filter(item => !dismissedRuleIds.has(item.id)),
    [bodyNodes, dismissedRuleIds],
  );

  const handleApplyRuleSuggestion = (suggestion: BodyRuleSuggestion) => {
    if (onAction({ type: 'editNode', id: suggestion.nodeId, html: suggestion.nextHtml })) {
      setFormatNotice(`Đã sửa: "${suggestion.beforeExcerpt}" → "${suggestion.afterExcerpt}"`);
    }
  };

  const handleApplyAllRuleSuggestions = () => {
    let applied = 0;
    const byNode = new Map<string, BodyRuleSuggestion[]>();
    for (const item of bodyRuleSuggestions) {
      const list = byNode.get(item.nodeId) ?? [];
      list.push(item);
      byNode.set(item.nodeId, list);
    }
    for (const [nodeId, items] of byNode.entries()) {
      const node = bodyNodes.find(n => n.editableNodeId === nodeId);
      if (!node) continue;
      if (items.length === 1) {
        if (onAction({ type: 'editNode', id: nodeId, html: items[0].nextHtml })) {
          applied += 1;
        }
        continue;
      }
      let currentHtml = node.html;
      let countForNode = 0;
      for (const item of items) {
        if (item.category === 'spelling') {
          const next = currentHtml.replace(item.beforeExcerpt, item.afterExcerpt);
          if (next !== currentHtml) {
            currentHtml = next;
            countForNode += 1;
          }
        } else {
          currentHtml = item.nextHtml;
          countForNode += 1;
        }
      }
      if (countForNode > 0 && currentHtml !== node.html) {
        if (onAction({ type: 'editNode', id: nodeId, html: currentHtml })) {
          applied += countForNode;
        }
      }
    }
    if (applied > 0) {
      setFormatNotice(`Đã áp dụng ${applied} đề xuất chuẩn hóa chính tả & quy cách đầu mục.`);
    }
  };

  const handleBatchAiProofread = async () => {
    if (batchAiRunning || refining) return;
    if (aiProvider === 'chatgpt' && !chatGPTReady) {
      onAiSettings();
      return;
    }
    const candidates = editableBodyNodes.filter(node => extractPlainText(node.html).length >= 8);
    if (candidates.length === 0) {
      setBatchAiNotice('Không có đoạn văn bản nào đủ điều kiện trong Thân bài để quét AI.');
      return;
    }
    setBatchAiRunning(true);
    setBatchAiQueue([]);
    setBatchAiNotice('');
    const foundItems: BatchAiQueueItem[] = [];
    try {
      for (let i = 0; i < candidates.length; i += 1) {
        const node = candidates[i];
        setBatchAiProgress({ current: i + 1, total: candidates.length });
        const aiTarget = createWorkspaceAiTarget(snapshot, { kind: 'node', nodeId: node.editableNodeId });
        if (!aiTarget) continue;
        const response = await fetch('/api/ai/refine-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: aiTarget.originalText,
            action: 'proofread',
            standardType: snapshot.standardType === 'party' ? 'party' : 'administrative',
            provider: aiProvider,
            consent: true,
          }),
        });
        const data = await response.json();
        if (data?.success && typeof data.refined === 'string') {
          const origPlain = extractPlainText(aiTarget.originalText);
          const refPlain = extractPlainText(data.refined);
          if (refPlain && refPlain !== origPlain) {
            const check = receiveWorkspaceAiResult(snapshot, aiTarget, data.refined);
            if (check.check.status === 'supported') {
              foundItems.push({
                nodeId: node.editableNodeId,
                target: aiTarget,
                originalHtml: aiTarget.originalText,
                originalText: origPlain,
                refinedHtml: data.refined,
                refinedText: refPlain,
                editedText: refPlain,
                isEditing: false,
              });
              setBatchAiQueue([...foundItems]);
            }
          }
        }
      }
      if (foundItems.length === 0) {
        setBatchAiNotice(`Đã rà soát ${candidates.length}/${candidates.length} đoạn văn: Chưa phát hiện lỗi chính tả hoặc câu từ cần sửa.`);
      } else {
        setBatchAiNotice(`Đã rà soát ${candidates.length} đoạn văn · Phát hiện ${foundItems.length} đoạn có gợi ý hoàn thiện.`);
      }
    } catch (err: any) {
      setBatchAiNotice(`Quét AI gián đoạn: ${err?.message || 'Không thể kết nối máy chủ AI.'}`);
    } finally {
      setBatchAiRunning(false);
      setBatchAiProgress(null);
    }
  };

  const handleApplyBatchAiItem = (item: BatchAiQueueItem) => {
    const currentNode = bodyNodes.find(n => n.editableNodeId === item.nodeId);
    if (!currentNode || currentNode.html !== item.originalHtml) {
      setBatchAiNotice('Đoạn văn đã thay đổi sau khi quét nên đề xuất cũ được bỏ qua.');
      setBatchAiQueue(prev => prev.filter(q => q.nodeId !== item.nodeId));
      return;
    }
    const match = item.refinedHtml.trim().match(/^<p\b([^>]*)>([\s\S]*)<\/p>$/i);
    const attrs = match ? match[1] : '';
    const finalHtml = item.editedText.trim() !== item.refinedText.trim()
      ? `<p${attrs}>${escapeHtmlText(item.editedText.trim())}</p>`
      : item.refinedHtml;
    if (onAction({ type: 'editNode', id: item.nodeId, html: finalHtml })) {
      setBatchAiQueue(prev => prev.filter(q => q.nodeId !== item.nodeId));
      setFormatNotice('Đã áp dụng gợi ý chỉnh sửa đoạn văn vào mặt giấy.');
    }
  };

  const command = (name: 'undo' | 'redo' | 'toggleBold' | 'toggleItalic' | 'toggleUnderline' | 'toggleBulletList' | 'toggleOrderedList' | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify') => {
    const editor = editors.current.get(activeEditorId);
    if (!editor?.isEditable) return;
    if (name.startsWith('align')) {
      editor.chain().focus().setTextAlign(name.slice(5).toLowerCase()).run();
    } else {
      editor.chain().focus()[name]().run();
    }
  };
  const selectedText = activeBodyNode
    ? DOMPurify.sanitize(activeBodyNode.html, { ALLOWED_TAGS: [] }).replace(/\s+/g, ' ').trim()
    : '';
  const activeNodeFormatting = activeBodyNode ? readSemanticParagraphFormatting(activeBodyNode.html) : {};

  const tableModel = (id: string): TableModel | undefined => snapshot.doc.importedTables?.[id]
    ?? snapshot.workspace.source?.blocks.find(block => (block.tableModel?.tableId ?? block.id) === id)?.tableModel
    ?? snapshot.reviewBlocks.find(block => (block.tableModel?.tableId ?? block.id) === id)?.tableModel;
  const renderNode = (node: ProjectedNode, canvasLabel: string) => {
    const tableId = workspaceNodeTableId(node.html);
    if (tableId) {
      const model = tableModel(tableId), cells = assessTableCellCapabilities(snapshot, tableId);
      return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability="readonly" data-workspace-atom="table" data-readonly-reason="table_atom_structure_locked" className="df-ws-atom" onPointerDown={() => setActiveEditorId('')} onFocusCapture={() => setActiveEditorId('')}>
        <div className="df-ws-atom-source" aria-label={`Bảng nguồn ${tableId}`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(node.html, { ADD_ATTR: ['data-cell-id', 'data-source-table-id', 'style', 'colspan', 'rowspan'] }) }} />
        <p className="df-ws-atom-reason">Bảng giữ nguyên cấu trúc và định dạng. Chỉ ô đủ điều kiện mới có trường sửa bên dưới.</p>
        {model && <div className="df-ws-cell-editors" aria-label={`Các ô sửa được của bảng ${tableId}`}>
          {model.rows.flatMap(row => row.cells).map(cell => {
            const capability = cells.find(item => item.cellId === cell.cellId), editable = Boolean(unlocked && capability?.editable);
            return <label key={cell.cellId} className="df-ws-cell-edit">
              <span>Ô {cell.cellId}</span>
              {editable
                ? <input type="text" data-workspace-cell={cell.cellId} aria-label={`Sửa ô ${cell.cellId}`} value={cell.text} onChange={event => onAction({ type: 'editCell', tableId, cellId: cell.cellId, text: event.target.value })} />
                : <span className="df-ws-cell-locked" data-workspace-cell-readonly={cell.cellId}>{cell.text || '(ô trống)'} · {capabilityMessage(capability?.reason ?? 'approval_required')}</span>}
            </label>;
          })}
        </div>}
      </article>;
    }
    if (/<(?:img|svg|iframe|object|canvas)\b/i.test(node.html)) return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability="readonly" data-workspace-atom="image" data-readonly-reason="media_atom_readonly" className="df-ws-atom" onPointerDown={() => setActiveEditorId('')} onFocusCapture={() => setActiveEditorId('')}>
      <div className="df-ws-atom-source" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(node.html, { ADD_ATTR: ['src', 'alt', 'width', 'height'] }) }} />
      <p className="df-ws-atom-reason">Ảnh và phương tiện nguồn chỉ đọc; thứ tự và nội dung được giữ nguyên.</p>
    </article>;
    const activateEditableNode = () => {
      if (!node.editable) return;
      const targetCanvas = node.container === 'body' ? 'body' : node.appendixId ?? 'body';
      setActiveCanvas(targetCanvas);
      onCanvasSelected(targetCanvas);
      setActiveEditorId(node.editableNodeId);
    };
    return <article key={node.editableNodeId} data-workspace-node={node.editableNodeId} data-workspace-node-capability={node.editable ? 'editable' : 'readonly'} data-node-container={node.container} className={`df-ws-node${activeEditorId === node.editableNodeId ? ' is-active-node' : ''}`} onClick={activateEditableNode} onPointerDown={activateEditableNode} onFocusCapture={activateEditableNode}>
      <WorkspaceCanvasEditor
        ariaLabel={canvasLabel}
        content={node.html}
        safety={node.safety}
        onChange={html => onAction({ type: 'editNode', id: node.editableNodeId, html })}
        onEditorReady={editor => { editors.current.set(node.editableNodeId, editor); }}
        onActive={activateEditableNode}
      />
    </article>;
  };

  return <div className="df-step-layout df-step-layout-workspace" data-context-open={contextOpen}>
    <main data-wizard-step={active ? '2' : undefined} className="df-workspace-editor df-step-content">
      <h1 className="sr-only">Soạn &amp; kiểm tra</h1>

      {formatNotice && (
        <div className="df-ws-format-toast" role="status" aria-live="polite">
          <CheckCircle2 size={15} />
          <span>{formatNotice}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setFormatNotice('')}><X size={14} /></button>
        </div>
      )}

      {/* TỜ GIẤY SOẠN THẢO A4 LIỀN MẠCH (UNIFIED A4 PAPER CANVAS) */}
      <div className="df-ws-unified-paper">
        <section id="df-step2-groups-before" className="df-ws-region df-ws-paper-header-zone" aria-labelledby="df-step2-groups-before-title">
          <header className="df-ws-region-heading">
            <div><h2 id="df-step2-groups-before-title">Phần đầu văn bản</h2></div>
            <span>Nhóm 01–05 · Click vào từng vùng trên giấy để sửa</span>
          </header>
          <div className="df-ws-groups df-ws-group-cards">
            {beforeGroups.map(group => (
              <ComponentCard
                key={group.id}
                group={group}
                seal={projection.seal}
                issues={currentComplianceReport?.issues}
                onAction={onAction}
                onRequestRegimeSwitch={onRequestRegimeSwitch}
                standardType={snapshot.standardType}
                omitNationalHeader={snapshot.doc.omitNationalHeader}
                headerProfile={snapshot.doc.headerProfile}
                isOfficialLetter={isOfficialLetter}
              />
            ))}
          </div>
        </section>

                {/* Khối Kính gửi / Kính trình (Nhóm 05b) */}
        <section id="df-step2-recipient-header" className="df-ws-region df-ws-recipient-region">
          <RecipientComponentCard
            recipientHeader={snapshot.doc.recipientHeader}
            standardType={snapshot.standardType}
            documentType={snapshot.doc.documentType}
            subject={snapshot.doc.subject}
            onSave={(updated) => onAction({ type: 'setRecipientHeader', recipientHeader: updated })}
            onRestoreToBody={() => {
              if (snapshot.doc.recipientHeader && snapshot.doc.recipientHeader.items?.length) {
                const isPartyDoc = snapshot.standardType === 'party';
                const isToTrinhDoc = /tờ\s*trình/i.test(snapshot.doc.documentType || '');
                const effectiveKind = (!isPartyDoc && isToTrinhDoc) ? 'kinh_gui' : (snapshot.doc.recipientHeader.kind || 'kinh_gui');
                const label = effectiveKind === 'kinh_trinh' ? 'Kính trình:' : 'Kính gửi:';
                const itemsText = snapshot.doc.recipientHeader.items.map(it => it.text).join('<br/>- ');
                const restoredHtml = `<p><strong>${label}</strong><br/>- ${itemsText}</p>` + (snapshot.doc.bodyHtml || '');
                onAction({ type: 'setRecipientHeader', recipientHeader: undefined });
                onAction({ type: 'editBody', html: restoredHtml });
              }
            }}
          />
        </section>

        <section id="df-step2-body" className={`df-ws-region df-ws-body-region${canvasExpanded ? ' is-expanded' : ''}`} aria-labelledby="df-step2-body-title">
          <header className="df-ws-body-heading">
            <div><p className="df-ws-eyebrow">Nhóm 06</p><h2 id="df-step2-body-title">Nội dung văn bản (Thân bài)</h2></div>
            <div className="df-ws-body-meta">
              {selected === 'body' && activeBodyNode && <span className="df-ws-status df-ws-status-active">Đang chỉnh sửa đoạn văn</span>}
              <span>{projection.appendices.length} phụ lục</span>
            </div>
          </header>
          <div role="tablist" aria-label="Canvas nội dung" className="df-ws-canvas-tabs">
            {canvases.map((canvas, index) => <button
              role="tab"
              id={`canvas-tab-${canvas.id}`}
              aria-controls={`canvas-${canvas.id}`}
              aria-selected={selected === canvas.id}
              tabIndex={selected === canvas.id ? 0 : -1}
              data-canvas-tab={canvas.id}
              key={canvas.id}
              onClick={() => setActive(canvas.id)}
              onKeyDown={event => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? canvases.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + canvases.length) % canvases.length;
                  setActive(canvases[next].id);
                  document.getElementById(`canvas-tab-${canvases[next].id}`)?.focus();
                }
              }}
            >{canvas.id === 'body' ? 'Thân văn bản (Body)' : canvas.title || 'Phụ lục'}</button>)}
          </div>
          <div role="toolbar" aria-label="Công cụ Canvas đang chọn" className="df-ws-toolbar df-ws-editor-toolbar">
            <span className="df-ws-toolbar-group">
              <button type="button" data-workspace-command="undo" aria-label="Hoàn tác" title="Hoàn tác" onMouseDown={event => event.preventDefault()} onClick={() => command('undo')}><Undo2 size={16} /></button>
              <button type="button" data-workspace-command="redo" aria-label="Làm lại" title="Làm lại" onMouseDown={event => event.preventDefault()} onClick={() => command('redo')}><Redo2 size={16} /></button>
            </span>
            <span className="df-ws-toolbar-hint" aria-hidden="true">Đoạn văn · Times New Roman</span>
            <span className="df-ws-toolbar-group">
              <button type="button" data-workspace-command="toggleBold" aria-label="Đậm" title="Đậm" onMouseDown={event => event.preventDefault()} onClick={() => command('toggleBold')}><Bold size={16} /></button>
              <button type="button" data-workspace-command="toggleItalic" aria-label="Nghiêng" title="Nghiêng" onMouseDown={event => event.preventDefault()} onClick={() => command('toggleItalic')}><Italic size={16} /></button>
              <button type="button" data-workspace-command="toggleUnderline" aria-label="Gạch chân" title="Gạch chân" onMouseDown={event => event.preventDefault()} onClick={() => command('toggleUnderline')}><Underline size={16} /></button>
            </span>
            <span className="df-ws-toolbar-group">
              {([['alignLeft', 'Căn trái', AlignLeft], ['alignCenter', 'Căn giữa', AlignCenter], ['alignRight', 'Căn phải', AlignRight], ['alignJustify', 'Căn đều', AlignJustify]] as const).map(([name, label, Icon]) => <button type="button" key={name} data-workspace-command={name} aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={() => command(name)}><Icon size={16} /></button>)}
            </span>
            <span className="df-ws-toolbar-group">
              <button type="button" data-workspace-command="toggleBulletList" aria-label="Danh sách dấu đầu dòng" title="Danh sách dấu đầu dòng" onMouseDown={event => event.preventDefault()} onClick={() => command('toggleBulletList')}><List size={16} /></button>
              <button type="button" data-workspace-command="toggleOrderedList" aria-label="Danh sách đánh số" title="Danh sách đánh số" onMouseDown={event => event.preventDefault()} onClick={() => command('toggleOrderedList')}><ListOrdered size={16} /></button>
            </span>
            <span className="df-ws-toolbar-group df-ws-toolbar-nd30-group">
              <button
                type="button"
                data-workspace-command="toggleFirstLineIndent"
                className={`df-ws-toolbar-pill${activeNodeFormatting.firstLineIndent ? ' is-active' : ''}`}
                aria-label="Thụt đầu dòng chuẩn"
                title={`Bật/tắt thụt đầu dòng chuẩn (${targetStandardFormatting.firstLineIndent}) cho đoạn đang chọn`}
                onMouseDown={event => event.preventDefault()}
                onClick={handleToggleFirstLineIndent}
              >
                <IndentIncrease size={15} />
                <span>Thụt lề {targetStandardFormatting.firstLineIndent}</span>
              </button>
              <button
                type="button"
                data-workspace-command="standardizeBody"
                className="df-ws-toolbar-pill df-ws-toolbar-pill-accent"
                aria-label="Chuẩn hóa định dạng Thân bài"
                title={`Chuẩn hóa thụt đầu dòng (${targetStandardFormatting.firstLineIndent}), giãn dòng (${targetStandardFormatting.lineSpacing}) và căn đều cho toàn bộ đoạn văn đủ điều kiện`}
                onMouseDown={event => event.preventDefault()}
                onClick={handleStandardizeBodyFormatting}
              >
                <Wand2 size={14} />
                <span>Chuẩn hóa Thân bài</span>
              </button>
            </span>
            <button type="button" className="df-ws-toolbar-expand" aria-label={canvasExpanded ? 'Thu nhỏ Canvas' : 'Mở rộng Canvas'} aria-pressed={canvasExpanded} title={canvasExpanded ? 'Thu nhỏ Canvas (Esc)' : 'Mở rộng Canvas'} onClick={() => setCanvasExpanded(value => !value)}>{canvasExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span>{canvasExpanded ? 'Thu nhỏ' : 'Mở rộng'}</span></button>
          </div>
          {canvases.map(canvas => <section key={canvas.id} id={`canvas-${canvas.id}`} role="tabpanel" aria-labelledby={`canvas-tab-${canvas.id}`} tabIndex={selected === canvas.id ? 0 : -1} hidden={selected !== canvas.id} data-canvas-id={canvas.id} data-format-profile={snapshot.doc.headerProfile} className="df-ws-sheet">
            {canvas.id !== 'body' && <h3>{canvas.title || 'Phụ lục'}</h3>}
            {canvas.id !== 'body' && <div className="df-ws-appendix-actions">
              <label>Tiêu đề phụ lục<input aria-label={`Tiêu đề ${canvas.id}`} value={snapshot.doc.appendices?.find(appendix => appendix.id === canvas.id)?.title ?? ''} onChange={event => onAction({ type: 'renameAppendix', id: canvas.id, title: event.target.value })} /></label>
              <button type="button" onClick={() => onAction({ type: 'moveAppendix', id: canvas.id, index: 0 })}>Đưa lên đầu</button>
              <button type="button" onClick={() => setRemoveId(canvas.id)}>Xóa phụ lục</button>
            </div>}
            <div className="df-ws-mixed-surface">{canvas.nodes.map(node => renderNode(node, canvas.accessibilityLabel))}</div>
          </section>)}
        </section>

        <section id="df-step2-groups-after" className="df-ws-region df-ws-paper-footer-zone" aria-labelledby="df-step2-groups-after-title">
          <header className="df-ws-region-heading">
            <div><h2 id="df-step2-groups-after-title">Phần cuối văn bản</h2></div>
            <span>Nhóm 07–09 · Chữ ký, Dấu &amp; Nơi nhận</span>
          </header>
          <div className="df-ws-groups df-ws-group-cards df-ws-group-cards-after">
            {afterGroups.map(group => (
              <ComponentCard
                key={group.id}
                group={group}
                seal={projection.seal}
                issues={currentComplianceReport?.issues}
                onAction={onAction}
                onRequestRegimeSwitch={onRequestRegimeSwitch}
                standardType={snapshot.standardType}
                omitNationalHeader={snapshot.doc.omitNationalHeader}
                headerProfile={snapshot.doc.headerProfile}
              />
            ))}
          </div>
        </section>
      </div>

      <section id="df-step2-appendices" className="df-ws-region df-ws-appendices-region" aria-labelledby="df-step2-appendices-title">
        <header className="df-ws-region-heading df-ws-appendices-heading">
          <div><p className="df-ws-eyebrow">Phụ lục đính kèm</p><h2 id="df-step2-appendices-title">Phụ lục và thành phần phụ</h2></div>
          <div className="df-ws-appendices-heading-actions">
            <span className="df-ws-appendices-count">{projection.appendices.length} phụ lục</span>
            <button
              type="button"
              className="df-ws-add-appendix df-ws-add-appendix-btn"
              onClick={() => {
                const id = crypto.randomUUID();
                if (onAction({ type: 'addAppendix', appendix: { id, title: `Phụ lục ${String(projection.appendices.length + 1).padStart(2, '0')}`, html: '<p></p>', sourceBlockIds: [], blocks: [], extractionStatus: 'confirmed' } })) {
                  setActive(id);
                  document.getElementById('df-step2-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              + Thêm phụ lục
            </button>
          </div>
        </header>
        {projection.appendices.length > 0
          ? <ul className="df-ws-appendix-list">
            {projection.appendices.map((appendix, index) => <li key={appendix.id}>
              <span className="df-ws-appendix-index" aria-hidden="true">▦</span>
              <div className="df-ws-appendix-summary">
                <strong>Phụ lục {String(index + 1).padStart(2, '0')} — {appendix.title || 'Chưa đặt tên'}</strong>
                <span>{appendix.nodes.length} khối nội dung · độc lập với Thân bài</span>
              </div>
              <button type="button" onClick={() => {
                setActive(appendix.id);
                document.getElementById('df-step2-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById(`canvas-tab-${appendix.id}`)?.focus({ preventScroll: true });
              }}>Mở phụ lục <span aria-hidden="true">↗</span></button>
            </li>)}
          </ul>
          : <div className="df-ws-empty-appendix-wrap">
              <p className="df-ws-empty-appendix">Chưa có phụ lục đính kèm trong bản soạn.</p>
              <button
                type="button"
                className="df-ws-add-appendix-action-btn"
                onClick={() => {
                  const id = crypto.randomUUID();
                  if (onAction({ type: 'addAppendix', appendix: { id, title: 'Phụ lục 01', html: '<p></p>', sourceBlockIds: [], blocks: [], extractionStatus: 'confirmed' } })) {
                    setActive(id);
                    document.getElementById('df-step2-body')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              >
                + Thêm phụ lục đính kèm
              </button>
            </div>
        }
      </section>

      {projection.unclassified.blocks.length > 0 && <aside className="df-ws-unclassified">
        <h2>Khối chưa phân loại · chỉ đọc</h2>
        {projection.unclassified.blocks.map(block => <div key={block.id} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html || block.text) }} />)}
        <button type="button" onClick={onPartition}>Về Bước 1 để phân vùng</button>
      </aside>}

      <footer className="df-ws-step-actions">
        <div className="df-ws-step-actions-bar">
          {onPrev && (
            <button type="button" className="df-ws-prev-btn" onClick={onPrev}>
              <ArrowLeft size={15} />
              <span>Quay lại Bước 1</span>
            </button>
          )}
          <p className="df-ws-step-status-text">
            {canContinue
              ? 'Bản soạn đã sẵn sàng để kiểm tra và xuất file Word.'
              : 'Cần duyệt nguồn hoặc xử lý thông tin thể thức trước khi xuất.'}
          </p>
          {onNext && (
            <button
              type="button"
              className="df-ws-next"
              data-action="workspace-next-bottom"
              disabled={!canContinue}
              onClick={onNext}
            >
              <span>Tiếp tục xem &amp; xuất</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </footer>

      {removeId && <div className="df-ws-modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="delete-appendix-title" className="df-ws-modal">
        <h2 id="delete-appendix-title">Xóa phụ lục khỏi bản soạn?</h2>
        <p>Nguồn gốc vẫn được giữ. Thao tác được ghi trong lịch sử, bao gồm bảng trong phụ lục.</p>
        <button type="button" onClick={() => setRemoveId(null)}>Hủy</button>
        <button type="button" onClick={() => { if (onAction({ type: 'deleteAppendix', id: removeId, confirmed: true })) { setRemoveId(null); setActive('body'); } }}>Xác nhận xóa</button>
      </div></div>}
    </main>

    <aside
      id="df-step2-context"
      className={`df-step-context${contextOpen ? ' is-open' : ''}`}
      aria-label="Kiểm tra và trợ lý AI"
    >
      <button
        type="button"
        className="df-step-context-toggle df-ws-edge-toggle"
        aria-expanded={contextOpen}
        aria-controls="df-step2-context"
        onClick={() => setContextOpen(value => !value)}
        title={contextOpen ? 'Đóng Trợ lý & Thể thức (Esc)' : 'Mở Trợ lý AI & Thể thức'}
      >
        <Sparkles size={16} />
        <span className="df-ws-edge-toggle-text">
          {contextOpen ? 'Đóng Trợ lý' : 'Trợ lý AI & Thể thức'}
        </span>
        {actionItems.length > 0 && !contextOpen && (
          <span className="df-ws-edge-toggle-badge">{actionItems.length}</span>
        )}
      </button>

      <header className="df-ws-context-drawer-header">
        <div className="df-ws-context-drawer-title-wrap">
          <div className="df-ws-context-drawer-icon" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="df-ws-context-drawer-title">Trợ lý AI &amp; Thể thức</h2>
            <p className="df-ws-context-drawer-subtitle">
              {snapshot.standardType === 'party' ? 'Quy cách Hướng dẫn 05' : 'Quy cách Nghị định 30'}
            </p>
          </div>
        </div>
      </header>

      <div className="df-ws-context-drawer-body">
      {/* KHỐI TỔNG QUAN THỂ THỨC & CẦN HOÀN THIỆN (GỘP DUY NHẤT, KHÔNG LẶP) */}
      {complianceReport ? (
        <div className="df-ws-check-summary">
          <CheckCircle2 size={18} aria-hidden="true" />
          <div className="df-ws-check-summary-body">
            <div className="df-ws-check-summary-top">
              <strong>{complianceReport.passedChecks}/{complianceReport.totalChecks} trường thể thức đạt</strong>
              <span>{Math.round((complianceReport.passedChecks / Math.max(1, complianceReport.totalChecks)) * 100)}%</span>
            </div>
            <div className="df-ws-progress-track" aria-hidden="true">
              <div
                className="df-ws-progress-fill"
                style={{ width: `${Math.round((complianceReport.passedChecks / Math.max(1, complianceReport.totalChecks)) * 100)}%` }}
              />
            </div>
            <span>{actionItems.length === 0 ? 'Các mục thể thức chính đã đạt chuẩn.' : `${actionItems.length} mục cần hoàn thiện trên mặt giấy.`}</span>
          </div>
        </div>
      ) : (
        <p className="df-ws-check-empty">Đang chuẩn bị kết quả kiểm tra thể thức.</p>
      )}

      <section className="df-ws-actions-card" aria-labelledby="df-ws-actions-heading">
        <div className="df-ws-actions-card-header">
          <h3 id="df-ws-actions-heading" className="df-ws-rail-section-title" style={{ margin: 0 }}>
            Cần hoàn thiện {actionItems.length > 0 ? `(${actionItems.length})` : ''}
          </h3>
          <span className={`df-ws-actions-pill ${actionItems.length === 0 ? 'is-clean' : 'is-attention'}`}>
            {actionItems.length === 0 ? currentComplianceReport ? 'Đạt chuẩn' : 'Đang kiểm tra' : `${actionItems.length} mục`}
          </span>
        </div>
        {actionItems.length > 0 ? (
          <ul className="df-ws-actions-list">
            {actionItems.map(item => (
              <li key={item.id} className={`df-ws-action-item is-${item.severity}`}>
                <div className="df-ws-action-item-info">
                  <strong>{item.title}</strong>
                  <span className="df-ws-action-impact">{item.message || item.impact}</span>
                </div>
                <div className="df-ws-action-btn-group">
                  {item.field === 'locationAndDate' && (
                    <button
                      type="button"
                      className="df-ws-action-btn df-ws-action-btn-quick"
                      title="Điền nhanh ngày hôm nay"
                      onClick={handleFillTodayDate}
                    >
                      <Calendar size={12} />
                      <span>Hôm nay</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="df-ws-action-btn"
                    onClick={item.onAction}
                  >
                    {item.actionLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="df-ws-actions-empty">
            {currentComplianceReport
              ? 'Không có mục thể thức nào cần xem lại. Toàn bộ 9 nhóm thể thức đã hợp lệ.'
              : 'Đang cập nhật kết quả kiểm tra cho bản soạn hiện tại.'}
          </p>
        )}
      </section>

      <header className="df-ws-ai-heading">
        <span aria-hidden="true"><Sparkles size={17} /></span>
        <div>
          <h2>Trợ lý AI &amp; Chuẩn hóa Thân bài</h2>
        </div>
      </header>

      <div role="tablist" aria-label="Chế độ rà soát" className="df-ws-context-tabs" onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = contextTab === 'ai' ? 'checks' : 'ai';
        setContextTab(next);
        document.getElementById(next === 'ai' ? 'df-ws-ai-tab' : 'df-ws-checks-tab')?.focus();
      }}>
        <button type="button" role="tab" id="df-ws-ai-tab" aria-controls="df-ws-ai-panel" aria-selected={contextTab === 'ai'} tabIndex={contextTab === 'ai' ? 0 : -1} onClick={() => setContextTab('ai')}>
          Trợ lý AI ✨
        </button>
        <button type="button" role="tab" id="df-ws-checks-tab" aria-label="Kiểm tra tự động" aria-controls="df-ws-checks-panel" aria-selected={contextTab === 'checks'} tabIndex={contextTab === 'checks' ? 0 : -1} onClick={() => setContextTab('checks')}>
          Định dạng &amp; Quy tắc
        </button>
      </div>

      {/* TAB 2: CHUẨN HÓA ĐỊNH DẠNG & BÁO CÁO ĐẦY ĐỦ */}
      <div role="tabpanel" id="df-ws-checks-panel" aria-labelledby="df-ws-checks-tab" hidden={contextTab !== 'checks'} className="df-ws-context-panel">
        {/* KHỐI CHUẨN HÓA THÂN BÀI & QUÉT LỖI NHANH (DETERMINISTIC ENGINE) */}
        <section className="df-ws-body-tools-card" aria-label="Công cụ chuẩn hóa Thân bài">
          <h3 className="df-ws-rail-section-title">
            Chuẩn hóa Thân bài ({snapshot.standardType === 'party' ? 'HD 05' : 'NĐ 30'})
            <span>Tức thời</span>
          </h3>
          <div className="df-ws-body-tools-actions">
            <button
              type="button"
              data-workspace-action="format-body-standard"
              className="df-ws-tool-btn df-ws-tool-btn-primary"
              onClick={handleStandardizeBodyFormatting}
            >
              <Wand2 size={15} className="df-ws-tool-btn-icon" />
              <div>
                <strong>Chuẩn hóa căn lề &amp; thụt đầu dòng</strong>
                <small>Thụt đầu dòng {targetStandardFormatting.firstLineIndent} · Giãn dòng {targetStandardFormatting.lineSpacing} · Căn đều 2 bên</small>
              </div>
            </button>
            <button
              type="button"
              data-workspace-action="scan-body-rules"
              className="df-ws-tool-btn"
              onClick={() => setRuleScanExecuted(true)}
            >
              <Search size={15} className="df-ws-tool-btn-icon" />
              <div>
                <strong>Quét chính tả &amp; quy cách Điều/Khoản</strong>
                <small>Kiểm tra từ điển hành chính và đầu mục Điều 1., 1., a)</small>
              </div>
            </button>
          </div>

          {(ruleScanExecuted || bodyRuleSuggestions.length > 0) && (
            <div className="df-ws-rule-suggestions" data-testid="body-rule-suggestions">
              {bodyRuleSuggestions.length > 0 ? (
                <>
                  <div className="df-ws-rule-suggestions-header">
                    <span>Phát hiện {bodyRuleSuggestions.length} gợi ý chuẩn hóa</span>
                    {bodyRuleSuggestions.length > 1 && (
                      <button type="button" className="df-ws-apply-all-btn" onClick={handleApplyAllRuleSuggestions}>
                        Áp dụng tất cả ({bodyRuleSuggestions.length})
                      </button>
                    )}
                  </div>
                  <ul className="df-ws-rule-suggestion-list">
                    {bodyRuleSuggestions.map(item => (
                      <li key={item.id} className="df-ws-rule-suggestion-card">
                        <div className="df-ws-rule-suggestion-top">
                          <span className="df-ws-rule-badge">{item.categoryLabel}</span>
                          <button
                            type="button"
                            className="df-ws-rule-dismiss"
                            aria-label="Bỏ qua gợi ý"
                            onClick={() => setDismissedRuleIds(prev => new Set(prev).add(item.id))}
                          >×</button>
                        </div>
                        <div className="df-ws-rule-diff">
                          <del>{item.beforeExcerpt}</del>
                          <span aria-hidden="true">→</span>
                          <ins>{item.afterExcerpt}</ins>
                        </div>
                        <p className="df-ws-rule-reason">{item.reason}</p>
                        <div className="df-ws-rule-card-actions">
                          <button
                            type="button"
                            className="df-ws-rule-focus-btn"
                            onClick={() => handleFocusTarget(`[data-workspace-node="${item.nodeId}"]`)}
                          >Xem trên giấy</button>
                          <button
                            type="button"
                            className="df-ws-rule-apply-btn"
                            onClick={() => handleApplyRuleSuggestion(item)}
                          >
                            <Check size={12} /> Áp dụng
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="df-ws-rule-clean">✓ Không phát hiện lỗi từ điển hành chính hay sai quy cách đánh số Điều/Khoản/Điểm.</p>
              )}
            </div>
          )}
        </section>

        {complianceReport && (
          <button type="button" className="df-ws-check-details" onClick={onOpenCompliance}>
            Xem báo cáo kiểm tra đầy đủ <span aria-hidden="true">→</span>
          </button>
        )}
      </div>

      {/* TAB 2: TRỢ LÝ AI (ĐOẠN ĐANG CHỌN + QUÉT HÀNG ĐỢI TOÀN THÂN BÀI) */}
      <div role="tabpanel" id="df-ws-ai-panel" aria-labelledby="df-ws-ai-tab" hidden={contextTab !== 'ai'} className="df-ws-context-panel">
        <h3 className="df-ws-rail-section-title">Đoạn đang chọn <span>{selected === 'body' ? 'Body' : 'Phụ lục'}</span></h3>
        {activeBodyNode
          ? <div className="df-ws-ai-target"><strong>Đoạn văn đang đặt con trỏ</strong><p>{selectedText.slice(0, 180) || 'Đoạn chưa có chữ.'}{selectedText.length > 180 ? '…' : ''}</p></div>
          : <p className="df-ws-ai-target">{selected === 'body' ? 'Chọn một đoạn có thể sửa trong Thân bài để rà riêng đoạn đó, hoặc dùng nút Quét toàn Thân bài bên dưới.' : 'AI hiện chỉ hỗ trợ đoạn trong Body; phụ lục và ô bảng không được gửi.'}</p>}
        <h3 className="df-ws-rail-section-title">Công cụ AI cho đoạn đang chọn</h3>
        <p className="df-ws-ai-approval" data-testid="ai-refine-disclosure">Khi nhấn một công cụ, bạn đồng ý gửi nội dung đoạn đang chọn tới {aiProviderDisplayName(aiProvider)} cho đúng thao tác đó. Chỉ nội dung đoạn này được gửi; đề xuất chỉ áp dụng sau khi bạn duyệt.</p>
        {aiProvider === 'chatgpt' && !chatGPTReady && <button type="button" className="df-ws-check-details" onClick={onAiSettings}>Mở cài đặt chung để kết nối ChatGPT plan <span aria-hidden="true">→</span></button>}
        <div className="df-ws-ai-actions">
          <button type="button" data-ai-action="proofread" data-ai-target-node={activeBodyNode?.editableNodeId ?? ''} disabled={selected !== 'body' || refining || !activeBodyNode || (aiProvider === 'chatgpt' && !chatGPTReady)} onClick={() => activeBodyNode && onRefine('proofread', activeBodyNode.editableNodeId)}>
            <span className="df-ws-ai-icon" aria-hidden="true">⌕</span><span><strong>Rà chính tả, câu từ</strong><small>Kiểm tra lỗi chính tả, ngữ pháp và dấu câu đoạn đang chọn</small></span><span aria-hidden="true">→</span>
          </button>
          <button type="button" data-ai-action="formalize" data-ai-target-node={activeBodyNode?.editableNodeId ?? ''} disabled={selected !== 'body' || refining || !activeBodyNode || (aiProvider === 'chatgpt' && !chatGPTReady)} onClick={() => activeBodyNode && onRefine('formalize', activeBodyNode.editableNodeId)}>
            <span className="df-ws-ai-icon" aria-hidden="true">✎</span><span><strong>Nâng văn phong</strong><small>Gợi ý diễn đạt rõ ràng, chuẩn văn phong công vụ</small></span><span aria-hidden="true">→</span>
          </button>
        </div>

        {/* QUÉT HÀNG LOẠT TOÀN THÂN BÀI THEO TỪNG ĐOẠN AN TOÀN */}
        <div className="df-ws-batch-ai-section">
          <h3 className="df-ws-rail-section-title">
            Rà soát toàn Thân bài
            <span>{editableBodyNodes.length} đoạn văn</span>
          </h3>
          <p className="df-ws-batch-ai-desc">
            Tự động quét lần lượt từng đoạn văn bản trong Thân bài và giữ nguyên tuyệt đối các bảng biểu, hình ảnh nhúng.
          </p>
          <button
            type="button"
            data-ai-action="batch-proofread"
            className="df-ws-batch-ai-btn"
            disabled={selected !== 'body' || batchAiRunning || refining || editableBodyNodes.length === 0 || (aiProvider === 'chatgpt' && !chatGPTReady)}
            onClick={() => void handleBatchAiProofread()}
          >
            <Sparkles size={15} />
            <span>
              {batchAiRunning && batchAiProgress
                ? `Đang rà soát đoạn ${batchAiProgress.current}/${batchAiProgress.total}…`
                : `Quét chính tả AI toàn Thân bài (${editableBodyNodes.length} đoạn)`}
            </span>
          </button>

          {batchAiNotice && <p className="df-ws-batch-ai-notice" role="status">{batchAiNotice}</p>}

          {batchAiQueue.length > 0 && (
            <ul className="df-ws-batch-ai-list" data-testid="batch-ai-queue">
              {batchAiQueue.map(item => (
                <li key={item.nodeId} className="df-ws-batch-ai-card">
                  <div className="df-ws-batch-ai-card-header">
                    <strong>Đề xuất hoàn thiện đoạn văn</strong>
                    <button
                      type="button"
                      className="df-ws-rule-dismiss"
                      aria-label="Bỏ qua đề xuất"
                      onClick={() => setBatchAiQueue(prev => prev.filter(q => q.nodeId !== item.nodeId))}
                    >×</button>
                  </div>
                  <div className="df-ws-batch-ai-compare">
                    <div className="df-ws-batch-ai-orig">
                      <span>Gốc:</span> {item.originalText}
                    </div>
                    {item.isEditing ? (
                      <textarea
                        className="df-ws-batch-ai-textarea"
                        rows={3}
                        value={item.editedText}
                        onChange={e => {
                          const val = e.target.value;
                          setBatchAiQueue(prev => prev.map(q => q.nodeId === item.nodeId ? { ...q, editedText: val } : q));
                        }}
                      />
                    ) : (
                      <div className="df-ws-batch-ai-refined">
                        <span>Đề xuất:</span> {item.editedText}
                      </div>
                    )}
                  </div>
                  <div className="df-ws-rule-card-actions">
                    <button
                      type="button"
                      className="df-ws-rule-focus-btn"
                      onClick={() => {
                        handleFocusTarget(`[data-workspace-node="${item.nodeId}"]`);
                        setBatchAiQueue(prev => prev.map(q => q.nodeId === item.nodeId ? { ...q, isEditing: !q.isEditing } : q));
                      }}
                    >
                      {item.isEditing ? 'Xong chỉnh sửa' : '✎ Sửa lại'}
                    </button>
                    <button
                      type="button"
                      className="df-ws-rule-apply-btn"
                      onClick={() => handleApplyBatchAiItem(item)}
                    >
                      <Check size={12} /> Áp dụng
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="df-ws-ai-approval">{refining ? 'Đang tạo đề xuất…' : 'Mọi đề xuất AI chỉ áp dụng sau khi bạn duyệt.'}</p>
      </div>
      </div>
    </aside>
  </div>;
}
