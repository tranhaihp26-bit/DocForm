import type { SourceBlock } from "./schemas/document.schema.ts";

const INLINE_SIGN_TITLE = /^(?:(?:TM\.?|T\/M\.?|KT\.?|TL\.?|TUQ\.?)\s+)?(?:(?:BAN\s+CHẤP\s+HÀNH)\s+)?(?:TỔNG\s+GIÁM\s+ĐỐC|PHÓ\s+GIÁM\s+ĐỐC|GIÁM\s+ĐỐC|PHÓ\s+CHỦ\s+TỊCH|CHỦ\s+TỊCH|PHÓ\s+TRƯỞNG\s+PHÒNG|TRƯỞNG\s+PHÒNG|PHÓ\s+TRƯỞNG\s+ĐOÀN|TRƯỞNG\s+ĐOÀN|KẾ\s+TOÁN\s+TRƯỞNG|BÍ\s+THƯ|PHÓ\s+BÍ\s+THƯ|THỦ\s+TRƯỞNG|PHỤ\s+TRÁCH|NGƯỜI\s+KÝ)\b/i;
const MULTILINE_SIGN_TITLE = /^(?:(?:TM\.?|T\/M\.?|KT\.?|TL\.?|TUQ\.?)\s+)?(?:(?:BAN\s+CHẤP\s+HÀNH)\s+)?(?:TỔNG\s+GIÁM\s+ĐỐC|PHÓ\s+GIÁM\s+ĐỐC|GIÁM\s+ĐỐC|PHÓ\s+CHỦ\s+TỊCH|CHỦ\s+TỊCH|PHÓ\s+TRƯỞNG\s+PHÒNG|TRƯỞNG\s+PHÒNG|PHÓ\s+TRƯỞNG\s+ĐOÀN|TRƯỞNG\s+ĐOÀN|KẾ\s+TOÁN\s+TRƯỞNG|PHÓ\s+BÍ\s+THƯ|BÍ\s+THƯ|THỦ\s+TRƯỞNG|PHỤ\s+TRÁCH|NGƯỜI\s+KÝ)\b/i;

function splitInlineSignatory(line: string): { title: string; name: string } | null {
  const match = INLINE_SIGN_TITLE.exec(line);
  if (!match) return null;
  const title = match[0].trim();
  const name = line.slice(match[0].length).trim();
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(name) || name.split(/\s+/).length < 2) return null;
  return { title, name };
}

/** Semantic evidence used to classify a physical footer table into separate fields. */
export function embeddedRecipientsSignatureTable(block: SourceBlock) {
  if (block.kind !== "table" || block.tableShape?.rows !== 1 || block.tableShape.columns !== 2) return null;
  const left = block.tableData?.[0]?.[0]?.trim() ?? "";
  const right = block.tableData?.[0]?.[1]?.trim() ?? "";
  if (!/^Nơi nhận\s*:/i.test(left) || !right) return null;
  const lines = right.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const inlineSignatory = lines.length === 1 ? splitInlineSignatory(lines[0]) : null;
  if (lines.length < 2 && !inlineSignatory) return null;
  const title = inlineSignatory?.title ?? lines.slice(0, -1).join("\n");
  const name = inlineSignatory?.name ?? lines[lines.length - 1];
  if (!MULTILINE_SIGN_TITLE.test(title)) return null;
  if (!/^[\p{L}\s.'-]+$/u.test(name) || name.split(/\s+/).length < 2) return null;
  const cells = block.tableModel?.rows[0]?.cells ?? [];
  return {
    recipients: left,
    signTitle: title,
    signName: name,
    recipientCellId: cells[0]?.cellId,
    signerCellId: cells[1]?.cellId,
  };
}
