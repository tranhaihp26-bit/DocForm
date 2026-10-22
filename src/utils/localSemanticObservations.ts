import type { AppendixDocument, SourceBlock, SourceRegion } from "../shared/schemas/document.schema.ts";
import type { ParserObservation, SemanticLabel, SemanticScope, SemanticUnit } from "../shared/semanticDocument.ts";

export interface LocalSemanticContext {
  sourceSha256: string;
  sourceGeneration: number;
  partitionFingerprint: string;
  workingRevision: number;
  blocks: SourceBlock[];
  bodySourceBlockIds?: string[];
  appendices?: AppendixDocument[];
  cellRoles?: Array<{ sourceBlockId: string; cellId: string; role: SourceRegion }>;
  regime: "state" | "party";
  documentType: string;
}

const MEETING_ONLY_LABELS = new Set<SemanticLabel>([
  "meeting_time_place", "participants", "chair_secretary", "agenda", "discussion", "vote", "conclusion", "assignment", "closing",
]);

function normalizeTitle(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim().replace(/[.:;]+$/u, "").toLocaleLowerCase("vi-VN");
}

function isAppendixTitleText(text: string, appendixTitle?: string): boolean {
  const value = normalizeTitle(text);
  if (appendixTitle && value === normalizeTitle(appendixTitle)) return true;
  return /^phụ\s+lục(?:\s+(?:số\s+)?(?:[a-z]|\d+|[ivxlcdm]+))(?:\s*[:.\-–—]\s*.*)?$/iu.test(text.trim());
}

function classifyParagraph(text: string, scope: SemanticScope, isAppendixTitle: boolean, isMeetingMinutes: boolean): SemanticLabel {
  const value = text.trim();
  if (!value) return "unknown";
  if (scope === "appendix" && isAppendixTitle) return "appendix_title";
  if (scope === "appendix" && /^(?:kèm theo|ban hành kèm|phụ lục số|số:)/iu.test(value)) return "appendix_reference";
  if (/^(?:[-•●▪]|\d+[.)])\s+/u.test(value)) return "list_item";
  if (scope === "appendix" && /^(?:chương\s+[ivxlcdm\d]+|mục\s+\d+(?:\.\d+)*|[ivxlcdm]+[.)]|(?:\d+\.){2,}\s+[^\d])/iu.test(value)) return "appendix_heading";
  if (/^nguồn\s*[:：]/iu.test(value)) return "source_note";
  if (/^(?:ghi chú|chú thích|lưu ý)\s*[:：]/iu.test(value)) return "note";
  if (isMeetingMinutes) {
    if (/^(?:(?:thời gian|địa điểm)(?:\s*,\s*(?:thời gian|địa điểm))?|thời gian và địa điểm)\s*[:：]/iu.test(value)) return "meeting_time_place";
    if (/^(?:chủ trì|chủ tọa|thư ký|người ghi biên bản)\s*[:：]/iu.test(value)) return "chair_secretary";
    if (/^(?:người tham dự|thành phần tham dự|đại biểu tham dự|có mặt|vắng mặt)\s*[:：]/iu.test(value)) return "participants";
    if (/^(?:nội dung chương trình|chương trình làm việc|nội dung cuộc họp|chương trình)\s*[:：]?/iu.test(value)) return "agenda";
    if (/^(?:ý kiến|thảo luận|diễn biến cuộc họp|nội dung thảo luận)\s*[:：]?/iu.test(value)) return "discussion";
    if (/^(?:biểu quyết|kết quả biểu quyết|số phiếu)\s*[:：]?/iu.test(value)) return "vote";
    if (/^(?:kết luận|quyết nghị|nghị quyết|thống nhất)\s*[:：]?/iu.test(value)) return "conclusion";
    if (/^(?:giao|phân công|đề nghị .* thực hiện|có trách nhiệm)\b/iu.test(value)) return "assignment";
    if (/^(?:cuộc họp|hội nghị).*(?:kết thúc|bế mạc)|^(?:kết thúc|bế mạc)\b/iu.test(value)) return "closing";
  }
  if (/^(?:căn cứ|xét đề nghị|theo đề nghị)(?:\s|$)/iu.test(value)) return "legal_basis";
  if (/^(?:thực hiện|nhằm|trên cơ sở|để triển khai)\b/iu.test(value)) return "lead";
  if (/^điều\s+\d+\b/iu.test(value)) return "article";
  if (/^khoản\s+\d+\b/iu.test(value)) return "clause";
  if (/^điểm\s+[a-z]\b/iu.test(value)) return "point";
  if (/^(?:chương\s+[ivxlcdm\d]+|mục\s+\d+(?:\.\d+)*|[ivxlcdm]+[.)]|(?:\d+\.){1,}\s+[^\d])/iu.test(value)) return scope === "appendix" ? "appendix_heading" : "section_heading";
  if (value.length <= 100 && /\p{Lu}/u.test(value) && value === value.toLocaleUpperCase("vi-VN") && /\p{L}/u.test(value)) return scope === "appendix" ? "appendix_heading" : "section_heading";
  return scope === "appendix" ? "explanation" : "narrative";
}

function isHighRisk(label: SemanticLabel, scope: SemanticScope, unsupported: boolean): boolean {
  return unsupported || label === "unknown" || MEETING_ONLY_LABELS.has(label) ||
    label === "appendix_title" || label === "appendix_reference" || label === "table" ||
    label === "table_header" || label === "table_data" || label === "table_header_cell" || label === "table_cell" ||
    label === "media_unsupported" || scope === "appendix";
}

function observation(
  context: LocalSemanticContext,
  unit: SemanticUnit,
  rationale: string,
  evidence: ParserObservation["evidence"],
): ParserObservation {
  return { sourceSha256: context.sourceSha256, sourceGeneration: context.sourceGeneration,
    partitionFingerprint: context.partitionFingerprint, workingRevision: context.workingRevision,
    unit, rationale, evidence };
}

function classifyBlock(
  context: LocalSemanticContext,
  block: SourceBlock,
  scope: SemanticScope,
  appendixId?: string,
  isFirstAppendixBlock = false,
  appendixTitle?: string,
  isMeetingMinutes = false,
  explicitCellsOnly = false,
): ParserObservation[] {
  const unsupported = (block.unsupportedFeatures?.length ?? 0) > 0 || Boolean(block.tableProperties?.partiallyPreserved);
  const unsupportedUnit = (): ParserObservation => observation(context, {
    id: "semantic.v1." + scope + "." + (appendixId ?? "body") + "." + block.id + ".unsupported",
    scope,
    ...(appendixId ? { appendixId } : {}),
    label: "media_unsupported",
    quote: block.text,
    anchor: {
      blockId: block.id,
      blockIndex: block.index,
      ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}),
      ...(block.kind === "table" ? { tableId: block.tableModel?.tableId ?? block.id } : {}),
    },
    risk: "high",
    needsReview: true,
    unsupportedEvidence: true,
    formattingUnsupportedReason: "Khối nguồn chứa cấu trúc hoặc nội dung chưa được hỗ trợ; chỉ đọc và yêu cầu rà soát.",
    sourceBlockIds: [block.id],
  }, "Khối nguồn có cấu trúc hoặc nội dung chưa được hỗ trợ; không áp quy tắc định dạng.", "unsupported_structure");
  if (block.kind === "table") {
    const tableId = block.tableModel?.tableId ?? block.id;
    const tableUnitId = `semantic.v1.${scope}.${appendixId ?? "body"}.${block.id}.table`;
    const tableUnit: SemanticUnit = {
      id: tableUnitId, scope, ...(appendixId ? { appendixId } : {}), label: "table", quote: block.text,
      anchor: { blockId: block.id, blockIndex: block.index, ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}), tableId },
      risk: "high", needsReview: true, ...(unsupported ? { unsupportedEvidence: true } : {}), sourceBlockIds: [block.id],
    };
    const items = [...(unsupported ? [unsupportedUnit()] : []), observation(context, tableUnit,
      unsupported ? "Bảng có dấu hiệu cấu trúc chưa được hỗ trợ; giữ nguyên hình học và yêu cầu rà soát." : "Đơn vị bảng được giữ nguyên theo ID nguồn và cần xác nhận cấu trúc.",
      unsupported ? "unsupported_structure" : "source_text")];
    const model = block.tableModel;
    if (model) {
      for (const row of model.rows) for (const cell of row.cells) {
        const cellRole = context.cellRoles?.find(item => item.sourceBlockId === block.id && item.cellId === cell.cellId)?.role;
        if (cellRole && cellRole !== "body" && cellRole !== "appendix") continue;
        if (explicitCellsOnly && !cellRole) continue;
        const cellScope: SemanticScope = cellRole === "appendix" ? "appendix" : cellRole === "body" ? "body" : scope;
        const cellAppendixId = cellScope === "appendix" ? appendixId : undefined;
        const differentParent = cellScope !== scope || cellAppendixId !== appendixId;
        const cellParentId = differentParent ? `${tableUnitId}.scope.${cellScope}.${cellAppendixId ?? "unassigned"}` : tableUnitId;
        if (differentParent && !items.some(item => item.unit.id === cellParentId)) {
          const parent: SemanticUnit = { id: cellParentId, scope: cellScope,
            ...(cellAppendixId ? { appendixId: cellAppendixId } : {}), parentUnitId: tableUnitId,
            label: "table", quote: block.text,
            anchor: { blockId: block.id, blockIndex: block.index, ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}), tableId },
            risk: "high", needsReview: true, ...(unsupported ? { unsupportedEvidence: true } : {}), sourceBlockIds: [block.id] };
          items.push(observation(context, parent, "Bảng có ô thuộc nhiều vùng phân loại; giữ quan hệ vật lý và yêu cầu duyệt.", "unsupported_structure"));
        }
        const complexCell = unsupported || cell.gridSpan > 1 || Boolean(cell.vMerge) || (cell.rowSpan ?? 1) > 1;
        const label: SemanticLabel = row.isHeader ? "table_header" : "table_data";
        const unit: SemanticUnit = {
          id: `${cellParentId}.cell.${cell.cellId}`, scope: cellScope, ...(cellAppendixId ? { appendixId: cellAppendixId } : {}), parentUnitId: cellParentId,
          label, quote: cell.text,
          anchor: { blockId: block.id, blockIndex: block.index, ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}),
            tableId: model.tableId, cellId: cell.cellId, rowIndex: cell.rowIndex, colIndex: cell.colIndex },
          risk: "high", needsReview: complexCell || (cellScope === "appendix" && !cellAppendixId) || differentParent,
          ...(unsupported ? { unsupportedEvidence: true } : {}), sourceBlockIds: [block.id],
        };
        items.push(observation(context, unit,
          complexCell ? "Ô gộp hoặc bảng có cấu trúc chưa hỗ trợ; cần duyệt vị trí và quan hệ ô." : "Ô được neo bằng cellId và tọa độ lưới nguồn.",
          unsupported ? "unsupported_structure" : "table_cell"));
      }
    } else {
      for (const [rowIndex, row] of (block.tableData ?? []).entries()) for (const [colIndex, quote] of row.entries()) {
        if (explicitCellsOnly) continue;
        const unit: SemanticUnit = { id: `${tableUnitId}.cell.${rowIndex}.${colIndex}`, scope,
          ...(appendixId ? { appendixId } : {}), parentUnitId: tableUnitId, label: "table_data", quote,
          anchor: { blockId: block.id, blockIndex: block.index, ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}),
            tableId, rowIndex, colIndex }, risk: "high", needsReview: true, unsupportedEvidence: true, sourceBlockIds: [block.id] };
        items.push(observation(context, unit, "Không có cellId ổn định trong nguồn đã trích; tọa độ hiện tại chỉ dùng để rà soát.", "unsupported_structure"));
      }
    }
    return items;
  }

  const text = block.text ?? "";
  const lines = text.split(/\n/u);
  const lineSegmentedBlock = lines.length > 1;
  const appendixTitleParagraphIndex = isFirstAppendixBlock
    ? lines.findIndex(line => isAppendixTitleText(line, appendixTitle))
    : -1;
  const result: ParserObservation[] = unsupported ? [unsupportedUnit()] : [];
  let cursor = 0;
  let parentUnitId: string | undefined;
  for (const [paragraphIndex, line] of lines.entries()) {
    const start = cursor;
    const end = start + line.length;
    cursor = end + (paragraphIndex < lines.length - 1 ? 1 : 0);
    if (!line.trim()) continue;
    const isAppendixTitle = paragraphIndex === appendixTitleParagraphIndex;
    const label = classifyParagraph(line, scope, isAppendixTitle, isMeetingMinutes);
    const level = label === "section_heading" || label === "appendix_heading" ? (line.match(/^\s*(\d+(?:\.\d+)*)/u)?.[1].split(".").length ?? 1) : undefined;
    const unitId = `semantic.v1.${scope}.${appendixId ?? "body"}.${block.id}.p${paragraphIndex}`;
    if (label === "section_heading" || label === "appendix_heading" || label === "article") parentUnitId = unitId;
    const unit: SemanticUnit = { id: unitId, scope, ...(appendixId ? { appendixId } : {}),
      ...(label !== "section_heading" && label !== "appendix_heading" && label !== "article" && parentUnitId ? { parentUnitId } : {}), label, quote: line,
      anchor: { blockId: block.id, blockIndex: block.index, ...(block.sourcePath ? { sourcePath: block.sourcePath } : {}),
        paragraphIndex, charStart: start, charEnd: end },
      risk: isHighRisk(label, scope, unsupported) || lineSegmentedBlock ? "high" : "low",
      needsReview: unsupported || lineSegmentedBlock || label === "unknown" || MEETING_ONLY_LABELS.has(label) || scope === "appendix",
      ...(unsupported ? { unsupportedEvidence: true } : {}),
      ...(lineSegmentedBlock ? { formattingUnsupportedReason: "Khối nguồn có nhiều dòng con; không thể áp quy tắc đoạn văn cho riêng một dòng." } : {}),
      sourceBlockIds: [block.id] };
    const headingHint = level && level > 1 ? `; cấp đề mục ${level}` : "";
    result.push(observation(context, unit, unsupported
      ? "Khối có tính năng chưa hỗ trợ, không suy diễn ngữ nghĩa."
      : `Nhãn cục bộ dựa trên nội dung nguyên văn và vị trí đoạn${headingHint}; chưa thay đổi nguồn.`,
    unsupported ? "unsupported_structure" : "source_text"));
  }
  return result;
}

export function classifyLocalSemantics(context: LocalSemanticContext): ParserObservation[] {
  const appendices = context.appendices ?? [];
  const appendixSources = new Map<string, Array<{ id: string; block: SourceBlock; isFirstAppendixBlock: boolean; title?: string }>>();
  for (const appendix of appendices) {
    const refs = new Set(appendix.sourceBlockIds);
    const titleBlockId = appendix.blocks.find(block => refs.has(block.id) && block.kind !== "table" &&
      block.text.split(/\n/u).some(line => isAppendixTitleText(line, appendix.title)))?.id;
    for (const block of appendix.blocks) if (refs.has(block.id)) {
      const list = appendixSources.get(block.id) ?? [];
      list.push({ id: appendix.id, block, isFirstAppendixBlock: block.id === titleBlockId, title: appendix.title });
      appendixSources.set(block.id, list);
    }
  }
  const bodyIds = new Set(context.bodySourceBlockIds ?? []);
  const isMeetingMinutes = /biên\s*bản|meeting\s+minutes|minutes/i.test(context.documentType);
  const fallbackAppendixTitleBlockId = context.blocks.find(block =>
    block.role === "appendix" && block.kind !== "table" && block.text.split(/\n/u).some(line => isAppendixTitleText(line)))?.id;
  return context.blocks.flatMap(block => {
    const apps = appendixSources.get(block.id);
    if (apps?.length) return apps.flatMap(({ id, block: appendixBlock, isFirstAppendixBlock, title }) =>
      classifyBlock(context, appendixBlock, "appendix", id, isFirstAppendixBlock, title, isMeetingMinutes));
    if (block.role === "appendix") return classifyBlock(context, block, "appendix", undefined, block.id === fallbackAppendixTitleBlockId, undefined, isMeetingMinutes);
    if (block.role === "body" || bodyIds.has(block.id)) return classifyBlock(context, block, "body", undefined, false, undefined, isMeetingMinutes);
    if (block.kind === "table" && context.cellRoles?.some(item => item.sourceBlockId === block.id && (item.role === "body" || item.role === "appendix"))) {
      return classifyBlock(context, block, "body", undefined, false, undefined, isMeetingMinutes, true);
    }
    return [];
  });
}
