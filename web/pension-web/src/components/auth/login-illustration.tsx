"use client";

import * as React from "react";

import { RajasthanBg } from "@/components/auth/rajasthan-bg";

/**
 * Bottom-pinned decorative Rajasthan skyline for the login page, recolored to
 * the live theme primary.
 *
 * Reading the tone is deliberately indirect: `CustomThemeProvider` writes
 * `--primary` as an inline `oklch(...)` on <html>, which `RajasthanBg`'s
 * parser doesn't speak, so whatever `getComputedStyle` returns is normalized
 * to `#rrggbb` through a canvas 2D context (the browser parses any color
 * format). A MutationObserver on <html> `class`/`style` re-reads on both
 * next-themes flips and custom-theme inline-var writes, regardless of effect
 * ordering. Tone starts undefined → default palette on SSR/first paint, so
 * there is no hydration mismatch.
 */
function useResolvedPrimary(): string | undefined {
  const [hex, setHex] = React.useState<string>();

  React.useEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const read = () => {
      if (!ctx) return;
      const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      if (!raw) return;
      ctx.fillStyle = "#010203"; // sentinel: unchanged ⇒ `raw` didn't parse
      ctx.fillStyle = raw;
      const parsed = ctx.fillStyle;
      setHex(parsed !== "#010203" ? parsed : undefined);
    };
    read();
    let raf = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return hex;
}

/* Memoized so page re-renders (mode switches, form state) never touch the
   ~1,900-path SVG tree. Never animate this component. */
export const LoginIllustration = React.memo(function LoginIllustration() {
  const tone = useResolvedPrimary();
  return (
    <div
      aria-hidden
      className="login-illustration pointer-events-none absolute inset-x-0 bottom-0 z-[1] select-none"
    >
      {/* Natural aspect (w-full h-auto) so the artwork is never cropped. Dark
          mode deepens the light-toned artwork into a dusk silhouette instead
          of a washed-out ghost. */}
      <RajasthanBg
        tone={tone}
        className="h-auto w-full opacity-60 dark:opacity-45 dark:brightness-[.55] dark:saturate-125"
      />
    </div>
  );
});
