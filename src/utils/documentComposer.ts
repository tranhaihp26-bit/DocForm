import type { DocumentFormatType, DocumentState, SourceBlock, StructuredImport } from "../shared/schemas/document.schema.ts";
import { COMPANY_HEADER_PROFILE_ID, applyCompanyProfile } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID, applyCompanyHD05Profile } from "../canonical/hd05/companyHeaderHD05.ts";
import { sanitizeHtmlForDocx } from "./docxExport.ts";
import { syncImportedTablesFromHtml } from "./tableFormatUtils.ts";
import { isTransformedMetadataTable } from "./sourceTableInventory.ts";
export interface DocumentComposerSnapshot {
  doc: DocumentState;
  standardType: "state" | "party";
  reviewBlocks: SourceBlock[];
  structuredImport: StructuredImport | null;
  uploadedBlocks?: SourceBlock[];
}
/** Product composer: never reconstructs the working document from old source blocks. */
export function composeDocumentFormatData(snapshot: DocumentComposerSnapshot): DocumentFormatType {
  const { doc, standardType, reviewBlocks, structuredImport, uploadedBlocks = [] } = snapshot;
    const isParty = standardType === "party";
    let exportDoc = doc;
    let effectiveProfile: "generic" | typeof COMPANY_HEADER_PROFILE_ID | typeof COMPANY_HEADER_HD05_PROFILE_ID = "generic";
    if (!isParty && doc.headerProfile === COMPANY_HEADER_PROFILE_ID) {
      exportDoc = applyCompanyProfile(doc);
      effectiveProfile = COMPANY_HEADER_PROFILE_ID;
    } else if (isParty && doc.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID) {
      exportDoc = applyCompanyHD05Profile(doc);
      effectiveProfile = COMPANY_HEADER_HD05_PROFILE_ID;
    }

    const sourceBlocks = reviewBlocks.length > 0 ? reviewBlocks : (structuredImport?.blocks || uploadedBlocks);
    const transformedMetadataIds = new Set((sourceBlocks ?? []).filter(b => isTransformedMetadataTable(b, structuredImport?.importFidelityManifest, structuredImport?.fields)).flatMap(b => [b.id, b.tableModel?.tableId ?? b.id]));
    const importedTables: Record<string, any> = Object.fromEntries(Object.entries(structuredClone(doc.importedTables ?? {}))
      .filter(([id, model]: [string, any]) => !transformedMetadataIds.has(id) && !transformedMetadataIds.has(model.tableId)));
    if (sourceBlocks) {
      for (const block of sourceBlocks) {
        // Standard header/signature layout tables are represented by fields, not body tables.
        if (block.tableModel && !isTransformedMetadataTable(block, structuredImport?.importFidelityManifest, structuredImport?.fields)) {
          importedTables[block.id] = block.tableModel;
          if (block.tableModel.tableId) {
            importedTables[block.tableModel.tableId] = block.tableModel;
          }
        }
      }
    }

    const propagatePhysicalTableAliases = (html: string) => {
      for (const tag of html.match(/<table\b[^>]*>/gi) ?? []) {
        const htmlId = tag.match(/data-source-table-id\s*=\s*["']([^"']+)["']/i)?.[1];
        const effective = htmlId ? importedTables[htmlId] : undefined;
        if (!effective) continue;
        for (const [alias, model] of Object.entries(importedTables)) {
          if (model.tableId === effective.tableId) importedTables[alias] = effective;
        }
      }
    };

    // Đồng bộ nội dung sửa đổi mới nhất trong HTML vào importedTables (cả body và appendices)
    if (Object.keys(importedTables).length > 0) {
      if (exportDoc.bodyHtml) {
        const { syncedTables } = syncImportedTablesFromHtml(exportDoc.bodyHtml, importedTables);
        for (const [id, model] of Object.entries(syncedTables)) {
          importedTables[id] = model;
        }
        propagatePhysicalTableAliases(exportDoc.bodyHtml);
      }
      if (exportDoc.appendices && exportDoc.appendices.length > 0) {
        for (const app of exportDoc.appendices) {
          if (app.html) {
            const { syncedTables } = syncImportedTablesFromHtml(app.html, importedTables);
            for (const [id, model] of Object.entries(syncedTables)) {
              importedTables[id] = model;
            }
            propagatePhysicalTableAliases(app.html);
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
}
