/**
 * @file sourceMapping.ts
 * @description Hợp đồng theo dõi và ánh xạ từ phần tử nguồn tới bản làm việc và byte DOCX (Đợt B).
 * Mỗi khối vật lý / ô nguồn có đích hợp lệ, phép biến đổi được ghi nhận và bằng chứng bảo toàn.
 */

import type { SourceBlock, SourceRegion, StructuredImport, DocumentState } from "./schemas/document.schema.ts";
import type { WorkspaceSnapshot } from "../utils/workspaceState.ts";
import { normalizeSemanticText, semanticHtmlParagraphs } from "../utils/candidateContentFidelity.ts";

const comparisonText = (value: string): string => normalizeSemanticText(value).toLocaleLowerCase("vi-VN");

function nonEmptyLines(value: string): string[] {
  return value.split(/\r?\n|\t+/).map(normalizeSemanticText).filter(Boolean);
}

function metadataFieldValues(doc: DocumentState): Record<string, string> {
  return {
    orgHeader1: doc.orgHeader1,
    orgHeader2: doc.orgHeader2,
    nationalHeader1: doc.nationalHeader1,
    nationalHeader2: doc.nationalHeader2,
    locationAndDate: doc.locationAndDate,
    documentType: doc.documentType,
    referenceNumber: doc.referenceNumber,
    subject: doc.subject,
    draftNote: doc.draftNote ?? "",
  };
}

function metadataFieldsForLine(doc: DocumentState, line: string): string[] {
  const normalizedLine = comparisonText(line);
  const exactFields = Object.entries(metadataFieldValues(doc))
    .filter(([, value]) => nonEmptyLines(value).some(target => comparisonText(target) === normalizedLine))
    .map(([field]) => field);
  if (exactFields.length > 0) return exactFields;
  if (/^(?:CỘNG HÒA\s+XÃ HỘI|ĐẢNG CỘNG SẢN)/i.test(line)) return ["nationalHeader1"];
  if (/^ĐỘC LẬP\s*-/i.test(line)) return ["nationalHeader2"];
  if (/^Số\s*:/i.test(line)) return ["referenceNumber"];
  if (/\bngày\b.*\btháng\b.*\bnăm\b/i.test(line)) return ["locationAndDate"];
  if (/^(?:CƠ QUAN|UBND|ỦY BAN|BỘ|SỞ|BAN CHẤP HÀNH|BAN QUẢN LÝ|CÔNG TY|TẬP ĐOÀN|TRƯỜNG|VĂN PHÒNG|CHI CỤC|CỤC|ĐẢNG BỘ|CHI BỘ|HIỆP HỘI)\b/i.test(line)) {
    return ["orgHeader1", "orgHeader2"];
  }
  return Object.keys(metadataFieldValues(doc));
}

function metadataLineComponents(line: string, doc: DocumentState): string[] {
  const documentType = normalizeSemanticText(doc.documentType ?? "");
  if (!documentType || comparisonText(line) === comparisonText(documentType)) return [line];
  if (comparisonText(line).startsWith(`${comparisonText(documentType)} `) || comparisonText(line).startsWith(`${comparisonText(documentType)}:`)) {
    const remainder = line.slice(documentType.length).replace(/^[:\s–—-]+/u, "").trim();
    return remainder ? [documentType, remainder] : [line];
  }
  return [line];
}

function metadataLineMatchesField(sourceLines: string[], field: string, target: string): boolean {
  const source = sourceLines.join(" ");
  const targetText = comparisonText(target);
  const sourceForms = [comparisonText(source)];
  if (field === "referenceNumber" && /^Số\s*:/i.test(source)) {
    sourceForms.push(comparisonText(source.replace(/^Số\s*:\s*/i, "")));
  }
  if (sourceForms.includes(targetText)) return true;
  // Date extraction canonicalizes placeholder punctuation (for example dot leaders
  // to ellipses). Keep every letter and digit identical while allowing that typography change.
  const punctuationFree = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi-VN").replace(/[^\p{L}\p{N}]/gu, "");
  return field === "locationAndDate" && sourceForms.some(value => punctuationFree(value) === punctuationFree(targetText));
}

function mapMetadataLinesToFields(text: string, doc: DocumentState): string[] | null {
  const sourceLines = nonEmptyLines(text).flatMap(line => metadataLineComponents(line, doc));
  if (sourceLines.length === 0) return null;
  const values = metadataFieldValues(doc);
  const targets = Object.entries(values).flatMap(([field, value]) => nonEmptyLines(value).map(text => ({ field, text })));

  const assign = (sourceIndex: number, usedTargets: Set<number>): string[] | null => {
    if (sourceIndex === sourceLines.length) return [];
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      if (usedTargets.has(targetIndex)) continue;
      const target = targets[targetIndex];
      for (let end = sourceIndex + 1; end <= sourceLines.length; end++) {
        const group = sourceLines.slice(sourceIndex, end);
        if (!group.every(line => metadataFieldsForLine(doc, line).includes(target.field))) continue;
        if (!metadataLineMatchesField(group, target.field, target.text)) continue;
        const nextUsedTargets = new Set(usedTargets);
        nextUsedTargets.add(targetIndex);
        const rest = assign(end, nextUsedTargets);
        if (rest) return [target.field, ...rest];
      }
    }
    return null;
  };

  return assign(0, new Set());
}

function metadataTextIsPreserved(text: string, doc: DocumentState): boolean {
  return mapMetadataLinesToFields(text, doc) !== null;
}

function metadataMatchingFieldNames(text: string, doc: DocumentState): string[] {
  return [...new Set(mapMetadataLinesToFields(text, doc) ?? [])];
}

function tableContentMatches(source: SourceBlock["tableModel"], target: unknown): boolean {
  if (!source || !target || typeof target !== "object") return false;
  const targetRows = (target as { rows?: Array<{ rowIndex?: number; cells?: Array<{ rowIndex?: number; colIndex?: number; text?: string }> }> }).rows;
  if (!Array.isArray(targetRows) || targetRows.length !== source.rows.length) return false;
  for (let rowOffset = 0; rowOffset < source.rows.length; rowOffset++) {
    const sourceRow = source.rows[rowOffset];
    const targetRow = targetRows.find(row => row.rowIndex === sourceRow.rowIndex) ?? targetRows[rowOffset];
    if (!targetRow || !Array.isArray(targetRow.cells) || targetRow.cells.length !== sourceRow.cells.length) return false;
    for (let cellOffset = 0; cellOffset < sourceRow.cells.length; cellOffset++) {
      const sourceCell = sourceRow.cells[cellOffset];
      const targetCell = targetRow.cells.find(cell => cell.rowIndex === sourceCell.rowIndex && cell.colIndex === sourceCell.colIndex) ?? targetRow.cells[cellOffset];
      if (!targetCell || comparisonText(targetCell.text ?? "") !== comparisonText(sourceCell.text ?? "")) return false;
    }
  }
  return true;
}

function recipientItems(value: string): string[] {
  const items: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = line.match(/^(?:[-*•]\s*)?Nơi nhận\s*:\s*(.*)$/i);
    if (header) {
      const inline = (header[1] ?? "").replace(/^[-*•]\s*/, "").trim();
      if (inline) items.push(comparisonText(inline));
      continue;
    }
    const item = line.replace(/^[-*•]\s*/, "").trim();
    if (item) items.push(comparisonText(item));
  }
  return items;
}

function recipientsCellIsPreserved(sourceText: string, workingRecipients: string): boolean {
  const sourceItems = recipientItems(sourceText);
  const workingItems = recipientItems(workingRecipients);
  return sourceItems.length > 0 && JSON.stringify(sourceItems) === JSON.stringify(workingItems);
}

function signatureFieldGroups(value: string): string[][] {
  return value
    .split(/\s*\|\s*/)
    .map(group => nonEmptyLines(group).map(comparisonText))
    .filter(group => group.length > 0);
}

function signatureTargetOrders(doc: DocumentState): string[][] {
  const titles = signatureFieldGroups(doc.signTitle ?? "");
  const names = signatureFieldGroups(doc.signName ?? "");
  const roleMajor = [...titles.flat(), ...names.flat()];
  const signerMajor = Array.from({ length: Math.max(titles.length, names.length) }, (_, index) => [
    ...(titles[index] ?? []),
    ...(names[index] ?? []),
  ]).flat();
  return [roleMajor, signerMajor].filter(order => order.length > 0);
}

function isOrderedSubsequence(sourceLines: string[], targetLines: string[]): boolean {
  let targetIndex = 0;
  for (const sourceLine of sourceLines) {
    while (targetIndex < targetLines.length && targetLines[targetIndex] !== sourceLine) targetIndex++;
    if (targetIndex === targetLines.length) return false;
    targetIndex++;
  }
  return sourceLines.length > 0;
}

function signatureCellIsPreserved(sourceText: string, doc: DocumentState): boolean {
  const sourceLines = nonEmptyLines(sourceText).map(comparisonText);
  return signatureTargetOrders(doc).some(targetOrder => isOrderedSubsequence(sourceLines, targetOrder));
}

export type TransformKind =
  | "preserve"
  | "transform_metadata"
  | "replace_by_profile"
  | "generated_by_profile"
  | "user_edit"
  | "user_remove";

export interface SourceLocator {
  blockId: string;
  blockIndex: number;
  kind: string;
  cell?: { rowIndex: number; colIndex: number };
  elementKind?: "paragraph" | "table" | "cell" | "shape_line" | "image" | "field";
  textSnippet?: string;
}

export interface TargetLocator {
  zone: SourceRegion;
  targetId?: string;
  targetCell?: { rowIndex: number; colIndex: number };
  subTarget?: string;
}

export interface TransformationRecord {
  sourceLocator: SourceLocator;
  targetLocator: TargetLocator;
  transformKind: TransformKind;
  reason?: string;
  confirmedByUser?: boolean;
  version: number;
}

export interface SourceCoverageItem {
  blockId: string;
  blockIndex: number;
  kind: string;
  role: SourceRegion;
  status: "preserved" | "transformed" | "missing" | "duplicate" | "unresolved";
  targetZone?: SourceRegion;
  targetDescription?: string;
  messageVi?: string;
}

export interface SourceCoverageReport {
  sourceHash?: string;
  totalSourceBlocks: number;
  preservedCount: number;
  transformedCount: number;
  missingCount: number;
  duplicateCount: number;
  unresolvedCount: number;
  items: SourceCoverageItem[];
  transformations: TransformationRecord[];
  isFullyCovered: boolean;
  violations: string[];
}

/**
 * Xây dựng bản đồ chuyển đổi và kiểm tra độ bao phủ từ nguồn sang workspace.
 * Ngăn chặn tuyệt đối các false pass:
 * - Khối trùng chữ phải có đủ số lượng đích thực tế tương ứng (trừ khi có giao dịch merge được ghi nhận).
 * - Chỉnh sửa một node không làm miễn kiểm tra độ bao phủ của các node khác.
 * - Header, footer, chữ ký, nơi nhận và phân cách phải có trường/ô/đích tiếp nhận thực tế có nội dung.
 */
export function buildSourceToWorkspaceCoverage(snapshot: WorkspaceSnapshot): SourceCoverageReport {
  const sourceBlocks = snapshot.workspace.source?.blocks ?? snapshot.reviewBlocks;
  const items: SourceCoverageItem[] = [];
  const violations: string[] = [];
  const transformations: TransformationRecord[] = [];

  const bodyNodes = snapshot.workspace.nodes.filter(n => n.container === "body");
  const bodyParagraphs = semanticHtmlParagraphs(snapshot.doc.bodyHtml ?? "");
  const availableBodyParagraphs: Array<{ text: string; originalIndex: number }> = bodyParagraphs.map((text, idx) => ({
    text,
    originalIndex: idx,
  }));
  let lastBodyOrderIndex = -1;
  const hasBodyReorderTransaction = snapshot.workspace.ledger.some(
    e => e.action === "move" || e.action === "split" || (e.action === "edit" && (e.kind === "body" || e.kind === "node"))
  );

  // Set các giao dịch gộp (merge) đã xác nhận trong ledger
  const confirmedMerges = snapshot.workspace.ledger
    .filter(e => e.action === "merge" && e.confirmed)
    .map(e => new Set(e.sourceRefs));

  const removedIds = new Set(
    snapshot.workspace.ledger
      .filter(e => e.action === "remove" && e.confirmed)
      .flatMap(e => [...e.sourceRefs, ...(e.removedTableIds ?? [])])
  );

  const seenBlockIds = new Set<string>();
  let subjectSeparatorClaimed = false;

  for (const block of sourceBlocks) {
    if (seenBlockIds.has(block.id)) {
      items.push({
        blockId: block.id,
        blockIndex: block.index,
        kind: block.kind,
        role: block.role ?? "unclassified",
        status: "duplicate",
        messageVi: `Khối #${block.id} bị trùng lặp trong nguồn.`,
      });
      violations.push(`duplicate_source_block:${block.id}`);
      continue;
    }
    seenBlockIds.add(block.id);

    const reviewed = snapshot.reviewBlocks.find(b => b.id === block.id);
    const role: SourceRegion = reviewed?.role ?? block.role ?? "unclassified";

    if (removedIds.has(block.id)) {
      items.push({
        blockId: block.id,
        blockIndex: block.index,
        kind: block.kind,
        role,
        status: "transformed",
        targetDescription: "Người dùng đã xác nhận xóa qua giao dịch sổ cái",
      });
      transformations.push({
        sourceLocator: { blockId: block.id, blockIndex: block.index, kind: block.kind, textSnippet: block.text?.slice(0, 50) },
        targetLocator: { zone: role },
        transformKind: "user_remove",
        confirmedByUser: true,
        version: snapshot.workspace.workingRevision,
      });
      continue;
    }

    if (role === "header" || role === "metadata") {
      let hasTarget = false;
      const matchingFields: string[] = [];

      if (block.kind === "table") {
        const tableId = block.tableModel?.tableId ?? block.id;
        const importedTable = snapshot.doc.importedTables?.[tableId] ?? snapshot.doc.importedTables?.[block.id];
        if (tableContentMatches(block.tableModel, importedTable)) {
          hasTarget = true;
          matchingFields.push(`importedTable:${tableId}`);
        } else if (!block.tableModel) {
          violations.push(`missing_source_table_model:${block.id}`);
        } else {
          const cells = block.tableModel?.rows.flatMap(r => r.cells) ?? [];
          const nonEmptyCells = cells.filter(c => normalizeSemanticText(c.text).length > 0);
          let allCellsHaveTarget = nonEmptyCells.length > 0;
          for (const cell of nonEmptyCells) {
            const mapping = snapshot.workspace.partition.cells.find(
              c => c.sourceBlockId === block.id && c.cellId === cell.cellId
            );
            if (mapping && mapping.role !== "header" && mapping.role !== "metadata") {
              allCellsHaveTarget = false;
              violations.push(`invalid_header_table_cell_role:${block.id}:${cell.cellId}`);
            }
            if (!metadataTextIsPreserved(cell.text, snapshot.doc)) {
              allCellsHaveTarget = false;
              violations.push(`unmapped_header_table_cell:${block.id}:${cell.cellId}`);
            }
          }
          if (nonEmptyCells.length === 0) violations.push(`unmapped_header_table:${block.id}`);
          hasTarget = allCellsHaveTarget;
        }
      } else {
        hasTarget = metadataTextIsPreserved(block.text, snapshot.doc);
        if (hasTarget) matchingFields.push(...metadataMatchingFieldNames(block.text, snapshot.doc));
      }

      if (hasTarget) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "transformed",
          targetZone: role,
          targetDescription: matchingFields.length > 0 ? `Trường: ${matchingFields.join(", ")}` : "Thông tin thể thức",
        });
        transformations.push({
          sourceLocator: {
            blockId: block.id,
            blockIndex: block.index,
            kind: block.kind,
            elementKind: block.kind === "table" ? "table" : "field",
            textSnippet: block.text?.slice(0, 50),
          },
          targetLocator: {
            zone: role,
            targetId: matchingFields.length > 0 ? matchingFields[0] : (block.kind === "table" ? (block.tableModel?.tableId ?? block.id) : undefined),
            subTarget: block.kind === "table" ? (block.tableModel?.tableId ?? block.id) : undefined,
          },
          transformKind: "transform_metadata",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "unresolved",
          targetZone: role,
          messageVi: `Khối metadata #${block.id} chưa có trường ngữ nghĩa tiếp nhận hoặc dữ liệu đích rỗng.`,
        });
        violations.push(`unmapped_metadata_block:${block.id}`);
      }
    } else if (role === "separator") {
      let sepTarget = false;
      const sepText = block.text.trim();
      const firstBodyIndex = snapshot.reviewBlocks.find(b => b.role === "body")?.index ?? 999999;
      const isUnderSubjectPosition = block.index < firstBodyIndex;

      if (!subjectSeparatorClaimed && isUnderSubjectPosition && Boolean(snapshot.doc.subject?.trim())) {
        subjectSeparatorClaimed = true;
        sepTarget = true;
      } else if (snapshot.doc.bodyHtml && snapshot.doc.bodyHtml.includes(sepText)) {
        sepTarget = true;
      }

      if (sepTarget) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "transformed",
          targetZone: "separator",
          targetDescription: "Dấu phân cách theo thể thức",
        });
        transformations.push({
          sourceLocator: {
            blockId: block.id,
            blockIndex: block.index,
            kind: block.kind,
            elementKind: "shape_line",
            textSnippet: block.text?.slice(0, 50),
          },
          targetLocator: { zone: "separator", subTarget: `sep:${block.index}` },
          transformKind: "replace_by_profile",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "unresolved",
          messageVi: `Dấu phân cách #${block.id} không tìm thấy vị trí thể thức tương ứng.`,
        });
        violations.push(`unmapped_separator:${block.id}`);
      }
    } else if (role === "body") {
      let found = false;
      let isUnapprovedReorder = false;
      let matchedNodeId: string | undefined;

      if (block.kind === "table") {
        const tableId = block.tableModel?.tableId ?? block.id;
        const matchingNode = bodyNodes.find(n => n.lineage.includes(block.id) || n.html.includes(tableId) || n.html.includes(`data-block-id="${block.id}"`));
        if (matchingNode) {
          found = true;
          matchedNodeId = matchingNode.editableNodeId;
        }
      } else {
        const norm = normalizeSemanticText(block.text);
        if (!norm) {
          found = true;
        } else {
          // Kiểm tra xem đoạn này có được hợp nhất hợp lệ qua sổ cái hay không
          const isMerged = confirmedMerges.some(set => set.has(block.id));
          if (isMerged) {
            const matchingNode = bodyNodes.find(n => n.lineage.includes(block.id));
            if (matchingNode) {
              found = true;
              matchedNodeId = matchingNode.editableNodeId;
            }
          } else {
            const isEdited = snapshot.workspace.ledger.some(
              e => e.action === "edit" && e.sourceRefs?.includes(block.id)
            );
            if (isEdited) {
              found = true;
              const matchingNode = bodyNodes.find(n => n.lineage.includes(block.id));
              matchedNodeId = matchingNode?.editableNodeId;
            } else {
              // Tìm khớp chính xác trong availableBodyParagraphs (không dùng substring)
              const blockLines = (block.text || "").split(/\r?\n/).map(normalizeSemanticText).filter(Boolean);

              // 1. Thử khớp đơn đoạn văn
              // Ưu tiên tìm đoạn theo đúng thứ tự (originalIndex > lastBodyOrderIndex)
              let matchIdx = availableBodyParagraphs.findIndex(
                entry => entry.text === norm && (hasBodyReorderTransaction || entry.originalIndex > lastBodyOrderIndex)
              );

              if (matchIdx !== -1) {
                found = true;
                lastBodyOrderIndex = availableBodyParagraphs[matchIdx].originalIndex;
                availableBodyParagraphs.splice(matchIdx, 1);
              } else if (blockLines.length > 1) {
                // 2. Thử khớp nhiều đoạn văn liên tiếp tương ứng các dòng trong block
                for (let i = 0; i <= availableBodyParagraphs.length - blockLines.length; i++) {
                  let allMatch = true;
                  for (let j = 0; j < blockLines.length; j++) {
                    if (availableBodyParagraphs[i + j].text !== blockLines[j]) {
                      allMatch = false;
                      break;
                    }
                  }
                  if (allMatch && (hasBodyReorderTransaction || availableBodyParagraphs[i].originalIndex > lastBodyOrderIndex)) {
                    found = true;
                    lastBodyOrderIndex = availableBodyParagraphs[i + blockLines.length - 1].originalIndex;
                    availableBodyParagraphs.splice(i, blockLines.length);
                    break;
                  }
                }
              }

              // Nếu chưa tìm thấy nhưng tồn tại văn bản này ở vị trí trước đó (đảo thứ tự không hợp lệ)
              if (!found && !hasBodyReorderTransaction) {
                const outOfOrderIdx = availableBodyParagraphs.findIndex(entry => entry.text === norm);
                if (outOfOrderIdx !== -1) {
                  isUnapprovedReorder = true;
                  availableBodyParagraphs.splice(outOfOrderIdx, 1);
                }
              }
            }
          }
        }
      }

      if (isUnapprovedReorder) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "unresolved",
          targetZone: "body",
          messageVi: `Khối thân bài #${block.id} bị đảo thứ tự so với nguồn mà chưa có giao dịch di chuyển hợp lệ.`,
        });
        violations.push(`unapproved_body_reorder:${block.id}`);
      } else if (found) {
        const matchingNode = bodyNodes.find(n => n.lineage.includes(block.id));
        matchedNodeId = matchedNodeId ?? matchingNode?.editableNodeId;
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "preserved",
          targetZone: "body",
          targetDescription: "Nội dung thân bài (Body canvas)",
        });
        transformations.push({
          sourceLocator: {
            blockId: block.id,
            blockIndex: block.index,
            kind: block.kind,
            elementKind: block.kind === "table" ? "table" : "paragraph",
            textSnippet: block.text?.slice(0, 50),
          },
          targetLocator: {
            zone: "body",
            targetId: matchedNodeId,
            subTarget: block.kind === "table" ? (block.tableModel?.tableId ?? block.id) : `p:${block.index}`,
          },
          transformKind: "preserve",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "missing",
          targetZone: "body",
          messageVi: `Khối thân bài #${block.id} vắng mặt trong nội dung làm việc.`,
        });
        violations.push(`missing_body_block:${block.id}`);
        violations.push(`body_paragraph_omitted:${normalizeSemanticText(block.text).slice(0, 30)}`);
      }
    } else if (role === "signature") {
      let hasTarget = false;
      const targetIds: string[] = [];

      if (block.kind === "table") {
        const cells = block.tableModel?.rows.flatMap(r => r.cells) ?? [];
        const importedTable = snapshot.doc.importedTables?.[block.tableModel?.tableId ?? block.id] ?? snapshot.doc.importedTables?.[block.id];
        if (tableContentMatches(block.tableModel, importedTable)) {
          hasTarget = true;
          targetIds.push(`importedTable:${block.tableModel?.tableId ?? block.id}`);
        } else {
          const nonEmptyCells = cells.filter(c => normalizeSemanticText(c.text).length > 0);
          let allCellsHaveTarget = nonEmptyCells.length > 0;
          const signatureCellTexts: string[] = [];
          const signatureCellIds: string[] = [];
          for (const cell of nonEmptyCells) {
            const cellText = cell.text.trim();
            const isRecipientsCell = /Nơi nhận\s*:/i.test(cellText) || /Kính gửi\s*:/i.test(cellText);
            if (isRecipientsCell) {
              if (!recipientsCellIsPreserved(cellText, snapshot.doc.recipients ?? "")) {
                allCellsHaveTarget = false;
                violations.push(`missing_recipients_destination:${block.id}:${cell.cellId}`);
              } else {
                targetIds.push("recipients");
              }
            } else {
              signatureCellTexts.push(cellText);
              signatureCellIds.push(cell.cellId);
            }
          }
          if (signatureCellTexts.length > 0) {
            if (!signatureCellIsPreserved(signatureCellTexts.join("\n"), snapshot.doc)) {
              allCellsHaveTarget = false;
              violations.push(`missing_signature_destination:${block.id}:${signatureCellIds.join(",")}`);
            } else {
              targetIds.push("signature");
            }
          }
          if (nonEmptyCells.length === 0) violations.push(`unmapped_signature_table:${block.id}`);
          hasTarget = allCellsHaveTarget;
        }
      } else {
        hasTarget = signatureCellIsPreserved(block.text, snapshot.doc);
        if (hasTarget) targetIds.push("signature");
      }

      if (hasTarget) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "preserved",
          targetZone: "signature",
          targetDescription: "Vùng chữ ký người ký",
        });
        transformations.push({
          sourceLocator: {
            blockId: block.id,
            blockIndex: block.index,
            kind: block.kind,
            elementKind: block.kind === "table" ? "table" : "field",
            textSnippet: block.text?.slice(0, 50),
          },
          targetLocator: {
            zone: "signature",
            targetId: targetIds.join(",") || "signature",
            subTarget: block.kind === "table" ? (block.tableModel?.tableId ?? block.id) : undefined,
          },
          transformKind: "transform_metadata",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "missing",
          targetZone: "signature",
          messageVi: `Khối chữ ký #${block.id} không có trường hoặc bảng ký tiếp nhận trong bản làm việc.`,
        });
        violations.push(`missing_signature_destination:${block.id}`);
      }
    } else if (role === "recipients") {
      let hasTarget = false;
      const targetIds: string[] = [];

      if (block.kind === "table") {
        const cells = block.tableModel?.rows.flatMap(r => r.cells) ?? [];
        const importedTable = snapshot.doc.importedTables?.[block.tableModel?.tableId ?? block.id] ?? snapshot.doc.importedTables?.[block.id];
        if (tableContentMatches(block.tableModel, importedTable)) {
          hasTarget = true;
          targetIds.push(`importedTable:${block.tableModel?.tableId ?? block.id}`);
        } else {
          const nonEmptyCells = cells.filter(c => normalizeSemanticText(c.text).length > 0);
          let allCellsHaveTarget = nonEmptyCells.length > 0;
          const signatureCellTexts: string[] = [];
          const signatureCellIds: string[] = [];
          for (const cell of nonEmptyCells) {
            const cellText = cell.text.trim();
            const isSignCell = /(?:KÝ THAY|CHỦ TỊCH|GIÁM ĐỐC|TRƯỞNG BAN|BÍ THƯ|HIỆU TRƯỞNG)/i.test(cellText);
            if (isSignCell) {
              signatureCellTexts.push(cellText);
              signatureCellIds.push(cell.cellId);
            } else {
              if (!recipientsCellIsPreserved(cellText, snapshot.doc.recipients ?? "")) {
                allCellsHaveTarget = false;
                violations.push(`missing_recipients_destination:${block.id}:${cell.cellId}`);
              } else {
                targetIds.push("recipients");
              }
            }
          }
          if (signatureCellTexts.length > 0) {
            if (!signatureCellIsPreserved(signatureCellTexts.join("\n"), snapshot.doc)) {
              allCellsHaveTarget = false;
              violations.push(`missing_signature_destination:${block.id}:${signatureCellIds.join(",")}`);
            } else {
              targetIds.push("signature");
            }
          }
          if (nonEmptyCells.length === 0) violations.push(`unmapped_recipients_table:${block.id}`);
          hasTarget = allCellsHaveTarget;
        }
      } else {
        hasTarget = recipientsCellIsPreserved(block.text, snapshot.doc.recipients ?? "");
        if (hasTarget) targetIds.push("recipients");
      }

      if (hasTarget) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "preserved",
          targetZone: "recipients",
          targetDescription: "Vùng nơi nhận văn bản",
        });
        transformations.push({
          sourceLocator: {
            blockId: block.id,
            blockIndex: block.index,
            kind: block.kind,
            elementKind: block.kind === "table" ? "table" : "field",
            textSnippet: block.text?.slice(0, 50),
          },
          targetLocator: {
            zone: "recipients",
            targetId: targetIds.join(",") || "recipients",
            subTarget: block.kind === "table" ? (block.tableModel?.tableId ?? block.id) : undefined,
          },
          transformKind: "transform_metadata",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "missing",
          targetZone: "recipients",
          messageVi: `Khối nơi nhận #${block.id} không có trường nơi nhận tiếp nhận trong bản làm việc.`,
        });
        violations.push(`missing_recipients_destination:${block.id}`);
      }
    } else if (role === "appendix") {
      const inApp = (snapshot.doc.appendices ?? []).some(a =>
        a.sourceBlockIds?.includes(block.id) ||
        (a.blocks ?? []).some(ab => ab.id === block.id) ||
        a.titleBlockId === block.id ||
        a.referenceBlockId === block.id ||
        (Boolean(a.title) && normalizeSemanticText(a.title || "").includes(normalizeSemanticText(block.text))) ||
        (Boolean(a.referenceText) && normalizeSemanticText(a.referenceText || "").includes(normalizeSemanticText(block.text)))
      ) || (snapshot.structuredImport?.appendices ?? []).some(a =>
        a.sourceBlockIds?.includes(block.id) ||
        a.titleBlockId === block.id ||
        a.referenceBlockId === block.id ||
        (a.blocks ?? []).some(ab => ab.id === block.id)
      );

      if (inApp) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "preserved",
          targetZone: "appendix",
          targetDescription: "Vùng phụ lục",
        });
        transformations.push({
          sourceLocator: { blockId: block.id, blockIndex: block.index, kind: block.kind, textSnippet: block.text?.slice(0, 50) },
          targetLocator: { zone: "appendix" },
          transformKind: "preserve",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role,
          status: "missing",
          targetZone: "appendix",
          messageVi: `Khối phụ lục #${block.id} chưa thuộc phụ lục nào trong bản làm việc.`,
        });
        violations.push(`missing_appendix_block:${block.id}`);
      }
    } else {
      const inUnclass = (snapshot.doc.unclassified ?? []).some(b => b.id === block.id);
      if (inUnclass) {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role: "unclassified",
          status: "preserved",
          targetZone: "unclassified",
          targetDescription: "Khối chưa phân loại (giữ để đối chiếu)",
        });
        transformations.push({
          sourceLocator: { blockId: block.id, blockIndex: block.index, kind: block.kind, textSnippet: block.text?.slice(0, 50) },
          targetLocator: { zone: "unclassified" },
          transformKind: "preserve",
          version: snapshot.workspace.workingRevision,
        });
      } else {
        items.push({
          blockId: block.id,
          blockIndex: block.index,
          kind: block.kind,
          role: "unclassified",
          status: "missing",
          targetZone: "unclassified",
          messageVi: `Khối chưa phân loại #${block.id} bị mất khỏi danh sách chưa phân loại.`,
        });
        violations.push(`missing_unclassified_block:${block.id}`);
      }
    }
  }

  const preservedCount = items.filter(i => i.status === "preserved").length;
  const transformedCount = items.filter(i => i.status === "transformed").length;
  const missingCount = items.filter(i => i.status === "missing").length;
  const duplicateCount = items.filter(i => i.status === "duplicate").length;
  const unresolvedCount = items.filter(i => i.status === "unresolved").length;

  return {
    sourceHash: snapshot.workspace.source?.blobHash,
    totalSourceBlocks: sourceBlocks.length,
    preservedCount,
    transformedCount,
    missingCount,
    duplicateCount,
    unresolvedCount,
    items,
    transformations,
    isFullyCovered: missingCount === 0 && duplicateCount === 0 && unresolvedCount === 0,
    violations: [...new Set(violations)],
  };
}
