import { enforceND30Standards } from "../server/middleware/compliance.middleware.ts";
import type { DocumentFormatType, SourceBlock } from "../shared/schemas/document.schema.ts";

export interface PreviewDocumentSource {
  headerProfile?: DocumentFormatType["headerProfile"];
  omitNationalHeader?: boolean;
  orgHeader1?: string;
  orgHeader2?: string;
  referenceNumber?: string;
  nationalHeader1?: string;
  nationalHeader2?: string;
  locationAndDate?: string;
  documentType?: string;
  subject?: string;
  bodyHtml?: string;
  recipients?: string;
  signTitle?: string;
  signName?: string;
  regime?: "administrative" | "party";
  appendices?: any[];
  unclassified?: SourceBlock[];
  importMetadata?: DocumentFormatType["importMetadata"];
}

/** Build the DOCX preview without inventing values absent from an imported file. */
export function preparePreviewDocument(
  doc: PreviewDocumentSource,
  regime: "administrative" | "party",
): DocumentFormatType {
  const normalized = enforceND30Standards(doc, regime);
  const sourceType = doc.importMetadata?.sourceType;
  if (sourceType !== "docx" && sourceType !== "txt") return normalized;

  return {
    ...normalized,
    orgHeader1: doc.orgHeader1 ?? "",
    orgHeader2: doc.orgHeader2 ?? "",
    referenceNumber: doc.referenceNumber ?? "",
    locationAndDate: doc.locationAndDate ?? "",
    documentType: doc.documentType ?? "",
    subject: doc.subject ?? "",
    bodyHtml: doc.bodyHtml ?? "",
    recipients: doc.recipients ?? "",
    signTitle: doc.signTitle ?? "",
    signName: doc.signName ?? "",
  };
}
