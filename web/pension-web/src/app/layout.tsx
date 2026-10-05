import type { Metadata, Viewport } from "next";
import { Geist_Mono, Marcellus, Poppins } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import "./globals.css";
import { Providers } from "@/providers/providers";

// Poppins: clear geometric sans with Devanagari glyphs, so English and Hindi share one family.
const sans = Poppins({ variable: "--font-sans", weight: ["400", "500", "600", "700"], subsets: ["latin", "devanagari"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
// Marcellus: display serif for headings (font-display). Latin only; Hindi falls back to Poppins.
const display = Marcellus({ variable: "--font-serif", weight: "400", subsets: ["latin"], display: "swap" });

/** Reader-chosen text size (A-, A, A+), applied to <html> so every rem scales. */
const TEXT_SIZES = ["90", "100", "112", "125"] as const;

const TITLE = "HIV Pension Portal";
const DESCRIPTION = "HIV Pension Portal, Rajasthan State AIDS Control Society, Government of Rajasthan";

export const metadata: Metadata = {
  applicationName: TITLE,
  title: { default: TITLE, template: `%s | ${TITLE}` },
  description: DESCRIPTION,
  authors: [{ name: "Rajasthan State AIDS Control Society" }],
  publisher: "Rajasthan State AIDS Control Society, Government of Rajasthan",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#160d0f" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Pre-paint: apply the saved light/dark mode from the hp_theme cookie before React renders (light by default).
const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var x=document.cookie.match(/(?:^|; )hp_theme=([^;]*)/);var t=x?decodeURIComponent(x[1]):'light';var m=t==='dark'?'dark':t==='light'?'light':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');d.classList.remove('light','dark');d.classList.add(m);d.style.colorScheme=m;}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, jar] = await Promise.all([getLocale(), getMessages(), cookies()]);
  const size = jar.get("hp_text")?.value;
  const fontSize = size && (TEXT_SIZES as readonly string[]).includes(size) && size !== "100" ? `${size}%` : undefined;
  return (
    <html lang={locale} suppressHydrationWarning style={fontSize ? { fontSize } : undefined} className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}>
      <head>
        <script id="hp-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
