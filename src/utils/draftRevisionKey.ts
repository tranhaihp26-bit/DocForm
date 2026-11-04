import type { DocumentFormatType, DocumentState } from "../shared/schemas/document.schema.ts";
import { canonicalWorkspaceValue } from "./workspaceState.ts";

/**
 * Legacy draft-field key retained for regression checks. Current export evidence
 * is bound to exportCandidateKey for the complete workspace snapshot.
 */
export function computeDraftRevisionKey(doc: Partial<DocumentFormatType> | DocumentState, regime: string): string {
  const parts = [
    regime,
    doc.headerProfile || "generic",
    String(doc.omitNationalHeader === true),
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
    canonicalWorkspaceValue(doc.importedTables ?? {}),
    (doc as any).fontFamily || "Times New Roman",
    String((doc as any).fontSize || 13),
    (doc.appendices || []).map((appendix, index) => `${index}:${appendix.id || ""}:${appendix.title || ""}:${appendix.html || ""}:${appendix.referenceText || ""}:${JSON.stringify(appendix.tables || [])}`).join(";"),
    (doc.unclassified || []).map((block, index) => `${index}:${block.id || ""}:${block.index ?? ""}:${block.kind || ""}:${block.text || ""}:${block.html || ""}:${JSON.stringify(block.tableShape || {})}:${JSON.stringify(block.tableProperties || {})}`).join(";")
  ];
  return parts.join("|~|");
}
