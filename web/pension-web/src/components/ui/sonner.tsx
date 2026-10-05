"use client";

import { useTheme } from "@/providers/theme-provider";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { IconCircleCheckFilled as CircleCheckIcon, IconInfoCircleFilled as InfoIcon, IconCircleXFilled as OctagonXIcon, IconAlertTriangleFilled as TriangleAlertIcon, IconX as XIcon } from "@tabler/icons-react";

import { Spinner } from "@/components/ui/spinner";

/**
 * App toasts.
 *
 * Three things were wrong with the previous version and are worth naming, because each looked like
 * a style choice and was actually a defect:
 *
 *  - **They were always dark.** `theme="dark"` with hardcoded hex, so on a light chart a black slab
 *    appeared in the corner matching nothing else on screen. Tones now come from the same
 *    vocabulary `StatusBadge` uses, so a success toast is the green a success badge is, in whichever
 *    theme the user is in.
 *  - **The progress bar lied.** The toast lived 3000ms and the bar drained over 2000ms, so it sat
 *    empty and apparently frozen for the last third of every toast. One constant now drives both.
 *  - **The bar ignored hover.** Sonner pauses its dismiss timer while the toaster is hovered, but a
 *    CSS animation kept running, so stopping to read a long message left a drained bar above a
 *    toast that stubbornly stayed. The animation now pauses with it.
 *  - **The tone did not show in light mode.** `classNames.default` was set as well as the per-type
 *    class. Sonner applies `default` to EVERY toast and joins with a plain `join(' ')`, not
 *    tailwind-merge, so `bg-popover` and `bg-emerald-100` both landed on the element and stylesheet
 *    order picked the winner, the neutral one. `default` is gone; the neutral toast is now a
 *    `@layer base` rule in `globals.css`, which utilities outrank by cascade layer, so a tone
 *    always wins. Full story there.
 *
 * Structural styling (the bar, the close button, wrapping) is in `globals.css` under
 * `.toast-with-progress`; the colours are here, as classes, per the project's no-hex rule.
 */

/** Long enough to read a sentence, short enough not to stack up during a busy save. */
const DURATION_MS = 4500;

/**
 * The same vocabulary `StatusBadge` uses, so a success toast is the green a success badge is.
 *
 * `error` takes the red scale rather than `bg-destructive/10`: an opacity tint needs `color-mix()`,
 * and where that is missing the fallback goes solid, a black slab is a poor failure mode for the
 * one toast that most has to stay readable.
 *
 * No entry sets a `default`. Each of these is the ONLY tone utility on its toast; see the note above.
 */
const TONE = {
  success:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  error:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  warning:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  info: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      position="top-right"
      closeButton
      duration={DURATION_MS}
      // On a phone the toaster used to sit under the app header. Sonner's own mobile offset keeps
      // it clear of it and lets the toast use the width it has.
      mobileOffset={{ top: "0.75rem", left: "0.75rem", right: "0.75rem" }}
      style={{ "--width": "356px" } as React.CSSProperties}
      icons={{
        success: <CircleCheckIcon className="size-4 shrink-0" />,
        info: <InfoIcon className="size-4 shrink-0" />,
        warning: <TriangleAlertIcon className="size-4 shrink-0" />,
        error: <OctagonXIcon className="size-4 shrink-0" />,
        loading: <Spinner className="shrink-0" />,
        close: <XIcon strokeWidth={2.5} />,
      }}
      toastOptions={{
        unstyled: true,
        className:
          "toast-with-progress relative mt-2 flex w-full items-center gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-10 text-sm leading-snug shadow-lg",
        style: {
          "--toast-duration": `${DURATION_MS}ms`,
        } as React.CSSProperties & { "--toast-duration": string },
        classNames: {
          // Deliberately no `default`, sonner applies it to every toast, not just untyped ones,
          // which is what broke the tones. The neutral look is the `:where()` rule in globals.css.
          success: TONE.success,
          error: TONE.error,
          warning: TONE.warning,
          info: TONE.info,
          // Marker only: a loading toast has no known end, so it gets no bar to drain and keeps
          // the neutral surface.
          loading: "toast-loading",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
