import { COMPANY_HEADER_PROFILE_ID } from "./companyHeader.ts";

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
