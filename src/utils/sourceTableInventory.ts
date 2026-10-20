import type { ImportFidelityManifest, SourceBlock, StructuredImport } from "../shared/schemas/document.schema.ts";

type MetadataFieldKey = "orgHeader1" | "orgHeader2" | "nationalHeader1" | "nationalHeader2" | "referenceNumber" | "locationAndDate" | "signTitle" | "signName" | "recipients";
const normalize = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("vi-VN");
const isDecoration = (line: string) => /^[-—–_*\s]+$/.test(line)
  || /^\(?KÝ,?\s*(?:ĐÓNG DẤU|GHI RÕ HỌ TÊN|CHỮ KÝ)\)?$/.test(line);
function hasFieldCoverage(block: SourceBlock, sourceFields: StructuredImport["fields"] | null | undefined): boolean {
  const keys: MetadataFieldKey[] = block.role === "header"
    ? ["orgHeader1", "orgHeader2", "nationalHeader1", "nationalHeader2", "referenceNumber", "locationAndDate"]
    : ["signTitle", "signName", "recipients"];
  // These are the values extracted from this source block at import time. The
  // current document fields are editable and must never revoke that mapping.
  const represented = normalize(keys.filter(key => sourceFields?.[key]?.sourceBlockIds.includes(block.id))
    .map(key => sourceFields![key].value ?? "").join("\n"));
  const rawLines = block.tableModel!.rows.flatMap(row => row.cells.flatMap(cell => cell.text.split(/\r?\n/)))
    .map(normalize).filter(Boolean);
  const meaningful = rawLines.filter(line => !isDecoration(line));
  if (meaningful.length === 0) return rawLines.length > 0 && rawLines.every(isDecoration);
  return meaningful.every(line => represented.includes(line));
}

/** Header and signature layout tables are reconstructed as document fields.
 * A table explicitly present in the immutable content manifest remains a content
 * obligation, even if a later partition changes its role. */
export function isTransformedMetadataTable(block: SourceBlock, manifest: ImportFidelityManifest | null | undefined, sourceFields: StructuredImport["fields"] | null | undefined): boolean {
  if (!block.tableModel || (block.role !== "header" && block.role !== "signature")) return false;
  const id = block.tableModel.tableId || block.id;
  return !manifest?.tableIds.some(sourceId => sourceId === id || sourceId === block.id) && hasFieldCoverage(block, sourceFields);
}
