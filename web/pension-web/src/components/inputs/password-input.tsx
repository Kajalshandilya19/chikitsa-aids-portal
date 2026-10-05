"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { IconEye as Eye, IconEyeOff as EyeOff } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide toggle. Drop-in for any password input, spread RHF `field` onto
 * it. Reusable across login, reset, change-password, and admin user creation.
 *
 * ## Why the toggle is a plain button
 *
 * It was the shared `Button`, at `size="icon"` and `rounded-full`, and both of those broke it.
 *
 * `rounded-full` is not only paint: browsers hit-test against the border radius, so a 32px round
 * button in a 44px field accepts clicks inside a 32px CIRCLE and lets the corners fall through to
 * the input underneath. And the shared button carries `active:translate-y-px` with `transition-all`
 *, it nudges down on press, which is the wobble, and worse: a press near the edge moved the button
 * out from under the pointer, so the release landed on the input and no `click` ever fired. Between
 * the two, only the middle of the icon reliably worked.
 *
 * So: a rectangle, the full height of the field, that does not move when pressed. The visible eye
 * is still 16px; what changed is the area you can hit to reach it.
 */
export function PasswordInput({
  className,
  type: _type,
  ...props
}: React.ComponentProps<"input">) {
  const t = useTranslations("common");
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        // Out of the tab order deliberately: tabbing from the password box should reach Sign in,
        // not a control that only changes how the field is drawn. It is still reachable by pointer
        // and named for a screen reader.
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t("hidePassword") : t("showPassword")}
        aria-pressed={show}
        disabled={props.disabled}
        className={cn(
          // `inset-y-0`: the target is the whole height of the field, whatever height it is set to.
          // Login uses h-11, settings h-10, dialogs the default, one rule covers all of them.
          "text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md transition-colors",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {/* Fixed box: the two glyphs are not the same width, and swapping them inside a shrink-to-
            fit parent shifted the icon a pixel or two on every toggle. */}
        <span className="flex size-4 items-center justify-center">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </span>
      </button>
    </div>
  );
}
