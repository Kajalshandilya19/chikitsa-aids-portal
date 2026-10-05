import fs from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// `npm run dev` from this folder works without scripts/dev.sh: load the shared LOCAL profile when it
// exists. Values already in the environment win (process.loadEnvFile never overrides them).
const LOCAL_ENV = path.resolve(process.cwd(), "../../env/local.env");
if (fs.existsSync(LOCAL_ENV)) process.loadEnvFile(LOCAL_ENV);

// Locale + messages per request from src/i18n/request.ts (cookie based, no URL prefix).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Inlined at build time so the browser bundle knows the CSRF cookie name (`<prefix>_csrf`).
  // Not a secret: only the prefix of the cookie names.
  env: { SESSION_COOKIE_PREFIX: process.env.SESSION_COOKIE_PREFIX || "hp" },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
