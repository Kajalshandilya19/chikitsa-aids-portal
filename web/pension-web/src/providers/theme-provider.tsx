"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { readThemeMode, THEME_COOKIE, writeCookieValue, type ThemeMode } from "@/lib/client/theme-cookies";

/**
 * Light/dark mode, kept in the `hp_theme` cookie (next-themes would keep it in browser storage,
 * which this app never uses). Same surface as next-themes' `useTheme` (`theme`, `setTheme`, `resolvedTheme`,
 * `systemTheme`, `themes`), and the same `class` strategy: `dark` or `light` on `<html>`.
 *
 * The class is first set by the pre-paint script in the root layout, from the same cookie, so the
 * page never paints in the wrong mode. This provider keeps it in step afterwards: on a change, on
 * the OS switching mode while `system` is chosen, and on another tab changing it.
 *
 * Like next-themes, `theme` and `resolvedTheme` are undefined on the server and during hydration,
 * because the server cannot see the device's preference.
 */

interface ThemeContextValue {
  theme: ThemeMode | undefined;
  resolvedTheme: "light" | "dark" | undefined;
  systemTheme: "light" | "dark" | undefined;
  setTheme: (theme: ThemeMode | string) => void;
  themes: ThemeMode[];
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: undefined,
  resolvedTheme: undefined,
  systemTheme: undefined,
  setTheme: () => {},
  themes: ["light", "dark", "system"],
});

const CHANGE_EVENT = "hp:theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia?.(DARK_QUERY);
  mq?.addEventListener?.("change", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab changed the cookie: noticed when this one regains focus.
  window.addEventListener("focus", onChange);
  return () => {
    mq?.removeEventListener?.("change", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("focus", onChange);
  };
}

const systemDark = () => Boolean(window.matchMedia?.(DARK_QUERY).matches);

function applyMode(resolved: "light" | "dark", disableTransition: boolean) {
  const root = document.documentElement;
  if (root.classList.contains(resolved) && !root.classList.contains(resolved === "dark" ? "light" : "dark")) return;
  let restore: (() => void) | null = null;
  if (disableTransition) {
    const style = document.createElement("style");
    style.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
    document.head.appendChild(style);
    restore = () => {
      // Force a style recalculation before the transitions come back.
      void window.getComputedStyle(document.body).opacity;
      setTimeout(() => style.remove(), 1);
    };
  }
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  restore?.();
}

export function ThemeProvider({
  children,
  disableTransitionOnChange = false,
}: {
  children: ReactNode;
  disableTransitionOnChange?: boolean;
}) {
  const theme = useSyncExternalStore<ThemeMode | undefined>(subscribe, readThemeMode, () => undefined);
  const dark = useSyncExternalStore<boolean | undefined>(subscribe, systemDark, () => undefined);

  const systemTheme = dark === undefined ? undefined : dark ? "dark" : "light";
  const resolvedTheme = theme === undefined ? undefined : theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (resolvedTheme) applyMode(resolvedTheme, disableTransitionOnChange);
  }, [resolvedTheme, disableTransitionOnChange]);

  const setTheme = useCallback((next: ThemeMode | string) => {
    const mode: ThemeMode = next === "dark" || next === "light" ? next : "system";
    writeCookieValue(THEME_COOKIE, mode);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, systemTheme, setTheme, themes: ["light", "dark", "system"] }),
    [theme, resolvedTheme, systemTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
