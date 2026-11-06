import { COMPANY_HEADER_PROFILE_ID } from "./companyHeader.ts";
import { COMPANY_HEADER_HD05_PROFILE_ID } from "../hd05/companyHeaderHD05.ts";

/** Formatting preferences scoped to the administrative Hoa Tieu Northern profile. */
export const COMPANY_ND30_BODY_PROFILE = Object.freeze({
  id: COMPANY_HEADER_PROFILE_ID,
  body: Object.freeze({
    fontFace: "Times New Roman",
    fontSizePt: 14,
    alignment: "both" as const,
    lineSpacingPt: 19,
    paragraphAfterPt: 6,
    firstLineIndentIn: 0.5,
  }),
  table: Object.freeze({
    fontFace: "Times New Roman",
    fontSizePt: 13,
    headerRowIndex: 0,
    repeatHeader: true,
    boldHeader: true,
    centerHeader: true,
  }),
  appendix: Object.freeze({
    pageNumberStart: 1,
  }),
});

/** Formatting preferences scoped to the Party Hoa Tieu Northern profile (HD 05). */
export const COMPANY_HD05_BODY_PROFILE = Object.freeze({
  id: COMPANY_HEADER_HD05_PROFILE_ID,
  body: Object.freeze({
    fontFace: "Times New Roman",
    fontSizePt: 14,
    alignment: "both" as const,
    lineSpacingPt: 19,
    paragraphAfterPt: 6,
    firstLineIndentIn: 567 / 1440, // ~10 mm (567 twips) theo chuẩn Hướng dẫn 05
  }),
  table: Object.freeze({
    fontFace: "Times New Roman",
    fontSizePt: 13,
    headerRowIndex: 0,
    repeatHeader: true,
    boldHeader: true,
    centerHeader: true,
  }),
  appendix: Object.freeze({
    pageNumberStart: 1,
  }),
});

export type CompanyBodyProfile = typeof COMPANY_ND30_BODY_PROFILE | typeof COMPANY_HD05_BODY_PROFILE;

/**
 * Resolver chung nhận regime và headerProfile để lấy cấu hình body theo đúng profile ID.
 * Không dùng ID admin thay cho party và ngược lại.
 */
export function resolveCompanyBodyProfile(
  regime?: "administrative" | "party",
  headerProfile?: string | null
): CompanyBodyProfile | null {
  if (!headerProfile) return null;
  if (regime === "administrative") {
    return headerProfile === COMPANY_HEADER_PROFILE_ID ? COMPANY_ND30_BODY_PROFILE : null;
  }
  if (regime === "party") {
    return headerProfile === COMPANY_HEADER_HD05_PROFILE_ID ? COMPANY_HD05_BODY_PROFILE : null;
  }
  // When regime is omitted, only return if headerProfile exactly matches one profile ID
  if (headerProfile === COMPANY_HEADER_PROFILE_ID) return COMPANY_ND30_BODY_PROFILE;
  if (headerProfile === COMPANY_HEADER_HD05_PROFILE_ID) return COMPANY_HD05_BODY_PROFILE;
  return null;
}
