/**
 * Light/dark preference, readable before first paint (the pre-paint script in app/layout.tsx
 * hard-codes the same cookie name). A few bytes, identifies nobody, so page JS may read it.
 */
export const THEME_COOKIE = "hp_theme";
export type ThemeMode = "light" | "dark" | "system";

const YEAR_S = 365 * 24 * 60 * 60;

export function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

export function writeCookieValue(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR_S}; SameSite=Lax${secure}`;
}

export const isThemeMode = (v: unknown): v is ThemeMode => v === "light" || v === "dark" || v === "system";

export function readThemeMode(): ThemeMode {
  const v = readCookieValue(THEME_COOKIE);
  // Light unless the user chose otherwise (the portal default is light; "system" is an explicit choice).
  return isThemeMode(v) ? v : "light";
}
