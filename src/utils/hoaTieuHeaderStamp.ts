import JSZip from "jszip";
import type { DocumentFormatType } from "../shared/schemas/document.schema.ts";
import { COMPANY_HEADER_PROFILE_ID, COMPANY_HEADER_PARENT, COMPANY_HEADER_ISSUER, COMPANY_DEFAULT_NUMBER, COMPANY_DEFAULT_DATE } from "../canonical/nd30/companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID, COMPANY_HEADER_HD05_PARENT, COMPANY_HEADER_HD05_ISSUER, COMPANY_HEADER_HD05_DEFAULT_NUMBER, COMPANY_HEADER_HD05_REFERENCE_DATE } from "../canonical/hd05/companyHeaderHD05.ts";
import { ND30_HOA_TIEU_TABLE_XML, ND30_HOA_TIEU_SETTINGS_XML, HD05_HOA_TIEU_TABLE_XML, HD05_HOA_TIEU_SETTINGS_XML } from "./hoaTieuHeaderReferenceXml.ts";

const normalized = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleUpperCase("vi-VN");
const xmlText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function profileParts(data: DocumentFormatType) {
  const administrative = data.regime === "administrative" && data.headerProfile === COMPANY_HEADER_PROFILE_ID;
  const party = data.regime === "party" && data.headerProfile === COMPANY_HEADER_HD05_PROFILE_ID;
  if (!administrative && !party) return null;
  const parent = administrative ? COMPANY_HEADER_PARENT : COMPANY_HEADER_HD05_PARENT;
  const issuer = administrative ? COMPANY_HEADER_ISSUER : COMPANY_HEADER_HD05_ISSUER;
  // The literal reference table has fixed organization lines. Never silently replace custom organization data.
  if ((data.orgHeader1 && normalized(data.orgHeader1) !== normalized(parent)) ||
      (data.orgHeader2 && normalized(data.orgHeader2) !== normalized(issuer))) return null;
  return administrative
    ? { table: ND30_HOA_TIEU_TABLE_XML, settings: ND30_HOA_TIEU_SETTINGS_XML, number: COMPANY_DEFAULT_NUMBER, date: COMPANY_DEFAULT_DATE }
    : { table: HD05_HOA_TIEU_TABLE_XML, settings: HD05_HOA_TIEU_SETTINGS_XML, number: COMPANY_HEADER_HD05_DEFAULT_NUMBER, date: COMPANY_HEADER_HD05_REFERENCE_DATE };
}

function stampedTable(data: DocumentFormatType): { table: string; settings: string } | null {
  const parts = profileParts(data);
  if (!parts) return null;
  return {
    table: parts.table
      .replace(`>${parts.number}</w:t>`, `>${xmlText(data.referenceNumber?.trim() || parts.number)}</w:t>`)
      .replace(`>${parts.date}</w:t>`, `>${xmlText(data.locationAndDate?.trim() ?? "")}</w:t>`),
    settings: parts.settings,
  };
}

/** Copy the complete first table and Word Shape settings from the canonical Hoa Tieu DOCX. */
export async function stampHoaTieuHeader(bytes: Uint8Array, data: DocumentFormatType): Promise<Uint8Array> {
  const stamp = stampedTable(data);
  if (!stamp) return bytes;
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return bytes;
  const firstTable = xml.match(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/)?.[0];
  const expectedShape = data.regime === "administrative" ? "ND30 Plain Line 1" : "Straight Connector 1";
  if (!firstTable?.includes(expectedShape)) return bytes;
  zip.file("word/document.xml", xml.replace(firstTable, stamp.table));
  zip.file("word/settings.xml", stamp.settings);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export function hasStampedHoaTieuHeader(documentXml: string, settingsXml: string, data: DocumentFormatType): boolean {
  const stamp = stampedTable(data);
  return Boolean(stamp && settingsXml === stamp.settings && documentXml.includes(stamp.table));
}
