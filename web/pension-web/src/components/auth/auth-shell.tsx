"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { LoginFooter } from "@/components/auth/login-footer";
import { LoginMapPanel } from "@/components/auth/login-map-panel";
import { Attribution, LoginLockup } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TextSizeControl } from "@/components/text-size-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { useMediaQuery } from "@/hooks/use-media-query";

/* The skyline is ~1,900 SVG paths: its own chunk, after the form is interactive. */
const LoginIllustration = dynamic(() => import("@/components/auth/login-illustration").then((m) => m.LoginIllustration), { ssr: false });

/**
 * The frame of every signed-out page (login, forgot password, change password): soft primary glow,
 * dotted backdrop, Rajasthan skyline, the district map panel on desktop, and the page's own form on the right,
 * with the Developed by / Managed by credits under it.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  return (
    <div className="relative min-h-svh bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-[46%] lg:block"
        style={{
          backgroundImage:
            "radial-gradient(58% 85% at 16% 0%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 62%)," +
            "radial-gradient(48% 70% at 84% 0%, color-mix(in srgb, var(--primary) 20%, transparent), transparent 62%)," +
            "radial-gradient(42% 60% at 50% 0%, color-mix(in srgb, var(--primary) 13%, transparent), transparent 70%)",
        }}
      />
      <div className="login-dots login-dots-fade login-dots-anim absolute inset-0 hidden lg:block" aria-hidden />
      {isDesktop && <LoginIllustration />}

      <div className="absolute right-4 top-4 z-20 flex items-center gap-1 text-foreground">
        <TextSizeControl />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <main className="login-shell relative z-10 flex min-h-svh items-center justify-center p-4 pb-16 sm:p-6 lg:p-8 lg:pb-20">
        <div className="grid w-full max-w-md overflow-hidden rounded-2xl lg:max-w-5xl lg:grid-cols-[3fr_2fr] lg:border lg:border-border/50 lg:bg-card/65 lg:shadow-xl lg:backdrop-blur-xl lg:supports-[backdrop-filter]:bg-card/42">
          <LoginMapPanel />
          <section className="login-form flex flex-col p-4 sm:p-6 lg:p-10">
            <LoginLockup />
            <div className="mt-6">
              <h1 className="font-display text-center text-2xl text-primary lg:text-left lg:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1.5 text-center text-sm text-muted-foreground lg:text-left">{subtitle}</p>}
            </div>
            <div className="mt-6">{children}</div>
            <div className="mt-auto pt-8">
              <Attribution />
            </div>
          </section>
        </div>
      </main>

      <LoginFooter />
    </div>
  );
}
