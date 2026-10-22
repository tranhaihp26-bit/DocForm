import type { SourceBlock } from "./schemas/document.schema.ts";

/** Semantic evidence inside one physical table. The table itself stays in Body. */
export function embeddedRecipientsSignatureTable(block: SourceBlock) {
  if (block.kind !== "table" || block.tableShape?.rows !== 1 || block.tableShape.columns !== 2) return null;
  const left = block.tableData?.[0]?.[0]?.trim() ?? "";
  const right = block.tableData?.[0]?.[1]?.trim() ?? "";
  if (!/^Nơi nhận\s*:/i.test(left) || !right) return null;
  const lines = right.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const title = lines.slice(0, -1).join("\n");
  const name = lines[lines.length - 1];
  if (!/^(?:PHỤ TRÁCH|TM\.|T\/M\.|KT\.|TL\.|TUQ\.|GIÁM ĐỐC|PHÓ GIÁM ĐỐC|TỔNG GIÁM ĐỐC|CHỦ TỊCH|PHÓ CHỦ TỊCH|BÍ THƯ|TRƯỞNG PHÒNG|THỦ TRƯỞNG|NGƯỜI KÝ)\b/i.test(title)) return null;
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
