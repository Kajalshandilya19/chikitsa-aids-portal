// English + Hindi. Cookie-based locale (no /[locale]/ URL prefix), same as Chikitsa-Raj.
export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "hp_locale";

export const languageConfig: Record<Locale, { name: string; nativeName: string; dir: "ltr" | "rtl" }> = {
  en: { name: "English", nativeName: "English", dir: "ltr" },
  hi: { name: "Hindi", nativeName: "हिन्दी", dir: "ltr" },
};

export const isLocale = (v: string | undefined): v is Locale => !!v && (locales as readonly string[]).includes(v);
