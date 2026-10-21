const PLACEHOLDER = String.raw`(?:\.{2,}|…+|_{2,})`;
const PLACE_TOKEN = String.raw`(?:\d{1,2}|${PLACEHOLDER})`;
const YEAR_TOKEN = String.raw`(?:\d{4}|${PLACEHOLDER})`;
const PLACE_NAME = String.raw`(?:[\p{L}][\p{L}\p{M}\s.'’\-]{0,79}|${PLACEHOLDER})`;

const STANDALONE_LOCATION_DATE = new RegExp(
  String.raw`^\s*${PLACE_NAME}\s*,\s*ngày\s+${PLACE_TOKEN}\s+tháng\s+${PLACE_TOKEN}\s+năm\s+${YEAR_TOKEN}\s*[.;]?\s*$`,
  "iu",
);

/** Return a normalized standalone location/date line, including dotted placeholders. */
export function extractStandaloneLocationDate(text: string): string | null {
  const candidate = text.normalize("NFC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return candidate && STANDALONE_LOCATION_DATE.test(candidate) ? candidate : null;
}
