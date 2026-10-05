"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconRefresh } from "@tabler/icons-react";

import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/client/api";
import type { Captcha } from "@/lib/api-types";

/**
 * The service's own captcha (an SVG data URL, single use, 5 minutes). Fetch a new one after every
 * failed attempt (`reload`), because the old token is spent either way.
 */
export function useCaptcha() {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    setFailed(false);
    setCaptcha(null);
    try {
      setCaptcha(await api.get<Captcha>("/api/auth/captcha"));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { captcha, failed, reload };
}

/**
 * The captcha as ONE field (same pattern as Chikitsa-Raj's CaptchaField): the image, the answer box
 * and the refresh button inside a single bordered input group, as tall as the inputs above it.
 * `children` is the answer input: `<FormControl><InputGroupInput {...field} /></FormControl>`, so
 * react-hook-form keeps owning the value and the validation.
 */
export function CaptchaImage({ captcha, failed, onReload, children }: { captcha: Captcha | null; failed: boolean; onReload: () => void; children?: ReactNode }) {
  const t = useTranslations("auth");
  return (
    <InputGroup className="h-11 overflow-hidden bg-background dark:bg-input/30">
      <InputGroupAddon align="inline-start" className="h-full p-0">
        {captcha ? (
          <img src={captcha.image} alt={t("captchaAlt")} width={150} height={48} className="h-full w-auto select-none border-r bg-[#f5f0e8]" draggable={false} />
        ) : (
          <span className="flex h-full w-[8.5rem] items-center justify-center border-r bg-muted">
            {failed ? <span className="px-2 text-center text-[11px] leading-tight text-destructive">{t("captchaFailed")}</span> : <Spinner />}
          </span>
        )}
      </InputGroupAddon>
      {children}
      <button
        type="button"
        onClick={onReload}
        aria-label={t("captchaRefresh")}
        title={t("captchaRefresh")}
        className="flex h-full w-11 shrink-0 items-center justify-center border-l text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted"
      >
        <IconRefresh className={captcha || failed ? "size-4" : "size-4 animate-spin"} />
      </button>
    </InputGroup>
  );
}
