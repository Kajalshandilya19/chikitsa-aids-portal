/** Display helpers shared by the screens. Dates are shown in India time whatever the device's zone. */

const dtf = (locale: string) =>
  new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatDateTime = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dtf(locale).format(d);
};

/** The Hindi name in Hindi when there is one, else the English name. */
export const localName = (v: { name_en: string; name_hi?: string | null } | null | undefined, locale: string): string =>
  !v ? "" : locale === "hi" && v.name_hi ? v.name_hi : v.name_en;

/** First 8 characters of a uuid, for "uploaded by" style columns that have no name to show. */
export const shortId = (id: string | null | undefined): string => (id ? id.slice(0, 8) : "");
