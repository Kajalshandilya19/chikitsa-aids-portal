# pension-web

The web app of the HIV Pension Portal (Rajasthan State AIDS Control Society): a Next.js 16 app
that is both the UI and the BFF (backend for frontend). The browser talks only to this app; this
app talks to `pension-auth-service`, `pension-core-service` and `pension-data-service`.

Stack: Next 16 (App Router, Turbopack), React 19, Tailwind v4, shadcn/radix, next-intl (en/hi),
TanStack Query + Table, react-hook-form + zod, exceljs + papaparse (spreadsheets), zustand (the
in-memory spreadsheet store). Cloned from SETU's `setu-web`, which is a trimmed Chikitsa-Raj frontend.

## Run it

```bash
cd web/pension-web
npm install
npm run dev          # http://localhost:3200 (WEB_PORT), Turbopack
```

`next.config.ts` loads `../../env/local.env` when it exists (create it with `scripts/setup.sh`), so
`npm run dev` works without `scripts/dev.sh`. The services must be running for anything past the
login page (`scripts/dev.sh up`). Local dev users are created by `scripts/dev.sh seed`.

| Script | What it does |
|---|---|
| `npm run dev` | dev server on `WEB_PORT` (3200) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config, typescript-eslint + react-hooks) |
| `npm run build` | production build (`output: "standalone"`) |
| `npm start` | `next start` for a quick local check. Production runs `node .next/standalone/server.js` (copy `.next/static` and `public/` next to it). |

Never run `dev` and `build` at the same time in this folder, and do not leave a dev server running.

Env keys read (all from `env/local.env` locally, the pod env in UAT/production):
`WEB_PORT`, `WEB_ORIGIN`, `AUTH_SERVICE_URL`, `CORE_SERVICE_URL`, `DATA_SERVICE_URL`,
`SESSION_COOKIE_PREFIX` (default `hp`, inlined at build time), `COOKIE_SECURE`, `APP_ENV`,
optional `UPSTREAM_TIMEOUT_MS`. `COOKIE_SECURE=false` is refused at boot unless `APP_ENV=local`.

## Folder map

```
src/
  proxy.ts                      Next 16 middleware: session gate for /dashboard, CSRF + Origin check, security headers
  instrumentation.ts            validates the env profile at boot
  app/
    api/auth/*                  BFF auth routes (login, login/mfa, captcha, refresh, refresh/redirect, logout,
                                switch, me, options, password/otp|change|forgot|reset)
    api/gateway/[service]/[...path]   generic proxy to auth | core | data (allow-list)
    login, forgot-password, change-password    signed-out pages (AuthShell)
    dashboard/                  signed-in pages; layout.tsx verifies the session with /auth/me
      page.tsx (empty home), profile    (admin screens: docs/phases/PHASE_0B_ADMIN_SCREENS.md)
  components/
    ui/                         shadcn components + generic ones (server-data-table, confirm-dialog,
                                bulk-upload-sheet, spreadsheet/, table-export-menu, input-otp, tone-badge, ...)
    auth/ dashboard/ common/ inputs/   feature components (dashboard/ = the Chikitsa-Raj shell)
  config/nav.ts                 THE sidebar: items, permission gates, planned items (commented)
  config/audit-actions.ts       action list for the audit filter (convenience copy)
  hooks/                        use-server-table, use-masters, use-confirm, use-api-error-text, use-validation-text, ...
  lib/
    shared/validators.ts        byte-identical copy of the services' validation catalogue (never edit here)
    shared/permission-codes.ts  byte-identical copy of the permission catalogue (never edit here)
    server/                     BFF only: config, session cookies, upstream calls, auth flow helpers
    client/                     browser only: api helper, export, format, theme cookie
    api-types.ts                response shapes of the services
    security-headers.ts csrf.ts cookie-names.ts input-security.ts formula-guard.ts forms.ts
  messages/en.json, hi.json     every UI string, both languages, same keys
  providers/                    session, theme, react-query, breadcrumb
```

## Rules for interns (read before adding anything)

These come from `AGENTS.md` (R-WEB-*, R-LIB-*, R-RBAC-*) and the VAPT baseline the sister projects
were audited against. Breaking one is treated like a failing test.

### Validation comes from `src/lib/shared/validators.ts`, nothing else

- Every form uses react-hook-form with `zodResolver(schema)`, where `schema` is a `z.object({...})`
  built from the exported schemas (`userCode`, `mobile`, `centerCode`, `hindiText`, ...).
- Never write a regex, `.min()`, `.max()` or `.length` check for a field. If a rule is missing,
  ask for it to be added to `services/pension-auth-service/src/lib/validators.ts` with a new V- id;
  `scripts/sync-lib.sh` copies it here. `scripts/check-lib-sync.sh` fails on any drift.
- Helpers that only compose rules live in `src/lib/forms.ts` (`blankOr`, `sameAs`, `filledIn`).
- Show errors with `<FormMessage />`: it translates the schema's English message to Hindi by rule id
  (`validation.byRule.V0xx` in `hi.json`).
- The service re-validates everything. Client checks are a convenience, never security.

### Permissions use `P.*`

- Import `P` from `@/lib/shared/permission-codes`. A string like `"pension:user.account.view"` in
  code is a lint error.
- Hide what the user cannot use with `useSession().can(P.X, P.Y)` (any-of). That is UX only; the
  service checks the permission on every request.

### Add a page + nav item + permission gate

1. Create `src/app/dashboard/<name>/page.tsx` (a client component is fine; use `PageHeader`).
2. Add an item to `NAV` in `src/config/nav.ts` with `anyOf: [P.SOMETHING_VIEW]`. The sidebar hides
   it from roles without the permission and `NavAccessGuard` shows a 403 panel if the URL is typed.
3. Add `nav.items.<key>` and the page's own namespace to BOTH `src/messages/en.json` and `hi.json`.
4. For a paged list use `useServerTable(gw("core", "things"), filters, { search, sortMap })` with
   `<ServerDataTable columns={...} {...table.tableProps} />`. Only pass `search`/`sortMap` when the
   endpoint accepts `q`/`sort` (service queries are `.strict()`).
5. Gate every action button by its own permission constant.
6. Run `npm run typecheck && npm run lint && npm run build`.

### Text and i18n

- Every visible string is `t("key")` from next-intl, present in `en.json` AND `hi.json`.
- Labels in Title Case, acronyms kept (User ID, OTP, IFSC, PPO, ART, SOCH, LGD). Use `<Label required>`
  / `<FormLabel required>` for the red marker.
- Never an em dash or `--` in any user-facing text, English or Hindi.

### BFF rules

- The browser calls only `/api/auth/*` and `/api/gateway/<auth|core|data>/*`, through
  `api.get/post/put/patch/del/download` in `src/lib/client/api.ts` (never `fetch` directly). The
  helper adds the CSRF header, refuses script markup, refreshes once on a 401 and sends the user to
  `/login?expired=1` when the session is over.
- Address services with `gw("core", "path")`. `internal/*` paths are refused by the gateway.
- Tokens live only in httpOnly cookies (`hp_access`, `hp_refresh`, `hp_mfa`). Never put a token in a
  response body, a URL or JS. Server code that calls a service goes through `lib/server/upstream.ts`,
  which forwards the bearer token, `x-request-id` and the client IP (`X-Forwarded-For`), never cookies.
- New mutating BFF routes are CSRF-checked by `proxy.ts` automatically. Only add to `CSRF_EXEMPT`
  for a route that runs before a session exists.
- Every `<form>` with a password, OTP or identifier: `method="post"` and `onSubmit` that prevents the
  default (react-hook-form's `handleSubmit` does).

### Never store data in the browser

- No `localStorage`, `sessionStorage`, IndexedDB, Cache API or service worker for anything. Server
  data lives in the react-query memory cache and React state only.
- Personal data is shown masked as the service sends it (mobile `98XXXXXX21`). Never fetch or display
  an unmasked value unless a feature and its permission say so.
- No identifier or personal data in a page URL: routes carry uuids only; search text stays in state.
- Temporary passwords and TOTP secrets are shown once, from React state, and are gone when the dialog
  closes.
- Exports (`TableExportMenu`) write only the rows on screen, already masked, and guard formula cells.
- No `console.log` (lint error). Never log a token, password, OTP or personal data.

## Decisions

Where the brief left something open, the simplest option consistent with SETU was taken:

1. **Next 16.3.8, not 16.2.6.** 16.2.6 fails `npm audit --audit-level=high` (critical Next advisories,
   high postcss/sharp). The remaining moderates are `uuid` under `exceljs` (no fixed exceljs 4 yet).
2. **Refresh cookie scope.** `hp_refresh` has `Path=/api/auth`, so neither `proxy.ts` (pages) nor the
   gateway can see it. Pages without an access cookie go once through `/api/auth/refresh/redirect`
   (SETU's pattern, `_r=1` loop guard); it lands on `/login` (or `/login?expired=1` when a session
   existed). A gateway 401 is answered to the browser, whose api helper refreshes through
   `/api/auth/refresh` (single flight per tab) and retries once. The `/api/auth/*` routes that need a
   session (me, options, switch, logout, password/otp, password/change) refresh server-side themselves.
3. **Refresh replay.** A refresh token is single use and a replay ends the session. The BFF shares one
   rotation between concurrent requests holding the same refresh token (in-process, 10 s). With several
   web replicas, use session affinity.
4. **Client IP.** `X-Forwarded-For` sent to the services is the first hop of the incoming header (else
   `X-Real-IP`). The ingress in UAT/production must overwrite, not append to, a client-sent
   `X-Forwarded-For`, or a user could pick their own rate-limit bucket.
5. **CSRF cookie.** `hp_csrf` is JS-readable (double submit), `SameSite=Strict`, 12 h. The Origin (or
   Referer) must equal `WEB_ORIGIN` exactly; a request with neither header is refused. Opening the app
   on another host name (a LAN IP) needs `WEB_ORIGIN` set to it.
6. **Login hero panel.** SETU's district map (d3-geo, topojson-client, framer-motion; 33 districts in
   `public/geo/districts/rajasthan.json`) with the Government of Rajasthan lockup in the centre and
   orbiting capability chips. Reduced motion is read after mount, so the server render matches. The
   Rajasthan skyline background is kept.
7. **Captcha answer** is V-041 `captchaAnswer` in validators.ts; the service checks the value.
8. **Password checklist** reads the V-006 rules from the `password` schema itself (two probe values
   that fail every check), so it follows validators.ts without a copy of the rules.
9. **Hindi validation messages** are per rule id (`validation.byRule`), exact sentences for the
   password checklist (`validation.byText`). English shows the schema's own sentence.
10. **Center import.** File column headers ("Center Code", ...) are a data contract with the
    data-service and stay English. The upload response is read as either `data` or `data.batch`
    (the contract says `201 { batch }`; the service currently returns the batch as `data`). Server row
    errors are fetched 100 per page, at most 2,000, and placed onto the grid cells.
11. **Formula guard.** Every file written for people (table exports, spreadsheet CSV export) prefixes
    `= + - @` (and tab/CR) with `'`. The file rebuilt from the grid for upload is NOT guarded: it goes
    to our own data-service, which stores a leading `= + - @` as text, and the quote would change data.
12. **Spreadsheet store** is one global in-memory zustand store, reset when the sheet closes or
    unmounts; only one bulk upload sheet can be open at a time.
13. **Server data table.** SETU's column drag-reorder and persisted column/density preferences were
    removed; visibility, widths and density live in memory for the page only. dnd-kit is used only by
    the sidebar nav reorder, as in Chikitsa-Raj.
14. **Preferences in cookies**, non-sensitive and JS-written: `hp_theme`, `hp_locale`, `hp_text`
    (text size), `hp_sidebar`, `hp_nav_order` (sidebar order, nav keys only), `hp_login_tab` (last
    login tab, `Path=/login`).
15. **Users screen (Phase 0b).** The list API has no sort, so the table does not sort. Edit never pre-fills mobile
    or email (only masked values exist): blank keeps the current value. The search box (`q`, possibly a
    mobile number) is sent in the BFF API query string because the contract defines `GET /users?q=`; it
    never appears in a page URL.
16. **Audit filter (Phase 0b)** offers a fixed action list (`config/audit-actions.ts`, copied from the service's
    `AUDIT`); dates use the native date input (`pastDate`, V-016). Calendar/date-picker components
    were removed.
17. **Dashboard** is empty until Phase 1 brings the counters (`KpiCard`).
18. **Imports drawer (Phase 0b)** shows Confirm / Cancel for a `VALIDATED` batch, gated by the kind's commit /
    upload permission (API_DATA §1).
19. **Local captcha** responses from the auth-service carry `dev_answer` in `APP_ENV=local` (for the
    scripts). The BFF passes on only `image`, `token` and `expires_in`, so the browser never sees it.
