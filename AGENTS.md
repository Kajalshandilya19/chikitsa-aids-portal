# AGENTS.md: rules for everyone who changes this repository

This file is for interns, developers and AI agents. **Every rule here is mandatory.** Each rule has an id (`R-…`) that code comments, reviews and tests refer to. If a rule blocks you, do not work around it: ask the reviewer and, if it changes, change it HERE first.

The portal handles **HIV status, Aadhaar, Jan Aadhaar and bank details** of real people. Under the HIV and AIDS (Prevention and Control) Act, 2017, a leak is not only a bug: it can harm a person and carries legal penalties. When unsure, choose the more restrictive option and ask.

Read before your first change, in this order:

1. [README.md](README.md): what the project is, how to run it
2. this file
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/HOWTO.md](docs/HOWTO.md): step-by-step recipes for the common changes
5. [docs/SECURITY.md](docs/SECURITY.md)
6. the doc of the area you are touching ([docs/README.md](docs/README.md) lists them all)

---

## 0. Scope discipline

| Id | Rule |
|---|---|
| R-SCOPE-0 | Build ONLY what the current phase in [docs/ROADMAP.md](docs/ROADMAP.md) lists. Do not add features, screens, fields, statuses, roles or integrations that no doc asks for. |
| R-SCOPE-000 | The phase guide in [docs/phases/](docs/phases/) is the contract. Its acceptance script is written against it. Never change a test to make it pass: change the guide and the script together in a reviewed PR, or fix the code. |
| R-SCOPE-00 | Anything the department has not decided is in [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md). Build against the documented DEFAULT, mark it as a placeholder, and never invent a "real" value (PPO format, pension amount, Center codes, SOCH columns). |
| R-STACK-1 | The stack is fixed: Node 22+ (images use 24), Express 5, TypeORM 0.3, Postgres 17, zod 4, Next.js 16, React 19, Tailwind v4, shadcn/radix. Do NOT add NestJS, Fastify, Prisma, Drizzle, Mongoose, Sequelize, an ORM besides TypeORM, Nx, Turborepo, or a second UI kit. |
| R-STACK-2 | No new npm dependency without a reason written in the PR and `npm audit --omit=dev --audit-level=high` passing. Never add `xlsx` (SheetJS from npm): it has unfixed high-severity advisories. Spreadsheets use `exceljs` and `papaparse`. |

## 1. Repository layout and shared code

| Id | Rule |
|---|---|
| R-LIB-1 | `services/*/src/lib/` is **byte-identical** in the three services. Edit ONLY `services/pension-auth-service/src/lib/`, then run `scripts/sync-lib.sh`. `scripts/check-lib-sync.sh` (part of `scripts/dev.sh check`) fails on any drift. |
| R-LIB-2 | `web/pension-web/src/lib/shared/validators.ts` and `permission-codes.ts` are byte-identical copies of the service files of the same name, made by `scripts/sync-lib.sh`. Never edit them in the web app. |
| R-LIB-3 | A service never imports code from another service or from the web app. Code is shared only through `src/lib` (copied) and data only through HTTP (`/internal/*`). |

## 2. API rules (services)

| Id | Rule |
|---|---|
| R-API-1 | Every JSON response is `ok(data)` / `paged(rows, total, page)` from `lib/envelopes.ts`, or an error thrown and rendered by `lib/error-middleware.ts`. Never `res.json({...})` with another shape. |
| R-API-2 | Paths are lowercase, plural nouns, kebab-case: `/centers/:id/activate`. Ids in paths are uuids only. **Never put a UID, ART number, PPO number, Aadhaar, mobile or name in a URL** (path or query); search terms go in the query string of a GET only through the `searchText` validator and are never logged (the access log prints the path without the query). |
| R-API-3 | Throw only the classes in `lib/errors.ts`. The `message` must be a plain sentence with NO personal data. The `code` is stable (`E_…`) and listed in [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md). |
| R-API-4 | Route order is fixed: `authenticate()` → rate limit → `authorize(P.X)` → `validateParams/Query/Body` → [multer] → handler. Apply guards **per route** (`...guard`), never with `router.use()` (it runs for requests meant for other routers). |
| R-API-5 | An Express app is built only by `createServiceApp()` in `lib/http-app.ts`. Do not add global middleware in a service's `app.ts`. |
| R-API-6 | Service-to-service calls use `internalCall()` (lib/internal-call.ts) to `/internal/*` routes, which accept ONLY a service token. The BFF refuses to proxy `internal/` paths. A user's token is never accepted as a service token and vice versa. |
| R-API-7 | Document every new or changed endpoint in the service's API doc (`docs/API_AUTH.md`, `API_CORE.md`, `API_DATA.md`) in the same change. |

## 3. Validation

| Id | Rule |
|---|---|
| R-VAL-1 | Every field a person types (names, numbers, dates, free text, codes) is validated with a schema from `lib/validators.ts`. **No inline regex, `.min()` or `.max()` for such fields in a DTO or a form.** A missing rule is added to validators.ts with the next `V-0xx` id, documented in [docs/VALIDATION_RULES.md](docs/VALIDATION_RULES.md), unit-tested (UT-VAL-…), and synced. Technical parameters (sort keys, enum filters, internal codes) may use `z.enum` or a regex in the DTO. |
| R-VAL-2 | The browser validates with the same schemas (`src/lib/shared/validators.ts`), so the UI and the server reject the same input. The server ALWAYS validates again; the UI is a convenience. |
| R-VAL-3 | Every request-body and query schema ends with `.strict()`: unknown keys are a 422, never ignored. This is how read-only fields (e.g. SOCH data) are protected: they are simply not in the DTO. |
| R-VAL-4 | Free text never contains `<` or `>` (the validators refuse them); `lib/xss-guard.ts` additionally refuses script markup everywhere. Never strip or rewrite user text silently: refuse it. |

## 4. Access control

| Id | Rule |
|---|---|
| R-RBAC-1 | Permission codes are used ONLY as `P.<NAME>` from `lib/permission-codes.ts`. ESLint fails on a `'pension:…'` string literal. Role codes ONLY as `ROLE.<NAME>`. |
| R-RBAC-2 | Every route except `/health`, `/captcha`, `/auth/login*`, `/auth/refresh`, `/auth/password/forgot|reset` has `authenticate()` AND `authorize(...)`. A route that is reachable without a permission is a security bug. |
| R-RBAC-3 | Adding or changing a permission: follow [docs/HOWTO.md](docs/HOWTO.md) "Add a permission". The matrix doc is generated (`npm run docs:rbac`) and a test fails when it is stale. |
| R-SCOPE-1 | Every query that reads or changes a Center-scoped row (beneficiary, application, PPO, payment, document, Center user) goes through `applyScope()` (lists) or `assertInScope()` (one row) from `lib/scope.ts`. Handlers never compare district or center ids themselves. |
| R-SCOPE-2 | A row outside the caller's scope is answered with **404 Not Found**, never 403: a worker must not learn that a UID exists at another Center. |
| R-SCOPE-3 | Scope comes from the verified token only (`authOf(res)`), never from a request parameter. A `center_id` in a query string is a FILTER inside the scope, never a way to widen it. |
| R-MC-1 | Maker-checker: the person who recommends an application cannot approve it; the worker who submits cannot sign off. Enforced in the service, tested (UT-WF-…). |

## 5. Personal data (PII)

| Id | Rule |
|---|---|
| R-PII-1 | Every personal-data column uses `piiTransformer` (`type: 'text'`): names, mobile, email, address, Aadhaar, Jan Aadhaar, ABHA, SOCH ids (UID, ART No, Pre-ART No, PID, Beneficiary ID), bank account, guardian name, remarks about a person, uploaded file names. If unsure, it is PII. Mark it 🔒 in [docs/DATA_MODEL.md](docs/DATA_MODEL.md) and [docs/FIELD_DICTIONARY.md](docs/FIELD_DICTIONARY.md). |
| R-PII-2 | Equality search or uniqueness on an encrypted column uses a sibling `<name>_lookup varchar(64)` filled with `blindIndex(plain)`. Name search uses `nameBlindIndexes` tokens (`text[]`, GIN). Never index or `LIKE` the encrypted column. Never read it through raw SQL or a QueryBuilder `select()` that skips the transformer (you get ciphertext). |
| R-PII-3 | Lists, exports and logs show masked values only (`lib/mask.ts`). The full value is returned only by an endpoint guarded by `P.BENEFICIARY_PII_UNMASK` (or the export-sensitive permission) and every such read writes an audit row. |
| R-PII-4 | Any new personal-data key name is added to `DEFAULT_REDACT_KEYS` in `lib/redact.ts` in the same change. Never log a request body, a decrypted value, a token, an OTP or a key. Use the logger (it redacts), never `console.log` (ESLint fails). |
| R-PII-5 | Nothing personal is stored in the browser: no localStorage, sessionStorage, IndexedDB, or cookies other than the httpOnly session cookies. The spreadsheet component keeps data in memory only. |
| R-PII-6 | Nothing visible outside the portal says "HIV": SMS texts, the authenticator-app label, file names of downloads, e-mail subjects, browser tab titles of public pages. Use "Pension Portal" / "RSACS". |
| R-PII-7 | Real beneficiary data never leaves the server it lives on: not into fixtures, tests, screenshots, chat, tickets or a laptop. Test data is synthetic (`fixtures/`, generated). |

## 6. Database

| Id | Rule |
|---|---|
| R-DB-1 | One schema per service, owned by that service's DB login: `pension_auth`, `pension_audit` (auth), `pension_core`, `pension_data`. A service never reads or writes another service's schema. |
| R-DB-2 | `synchronize: false` always. |
| R-DB-3 | SQL values are ALWAYS parameters (`$1`, `:name`). Never build SQL from request text. Dynamic WHERE clauses may only join constant fragments (see `audit-query.service.ts`). ESLint flags `${}` inside `.query(...)`. |
| R-DB-4 | Every table: `uuid` primary key `DEFAULT gen_random_uuid()`, `created_at`/`updated_at timestamptz`. Every `@Column` states `name` and `type`. snake_case in the database, camelCase in TypeScript. |
| R-DB-5 | Migrations are hand-written SQL in `src/migration/<timestamp>-<name>.ts`, with a working `down()`. Never edit a migration that has run anywhere; add a new one. Timestamp bands: auth `1801…`, core `1802…`, data `1803…`. |
| R-DB-6 | Migrations never run at service boot. Locally: `scripts/dev.sh migrate`. In Kubernetes: the migration Job. Scripts refuse unless `DB_ALLOW_MIGRATIONS=true`. |
| R-DB-7 | A change and its audit row are written in ONE transaction (`writeAudit(em, …)` with the transaction's manager). |
| R-DB-8 | TypeORM `query()` returns `[rows, rowCount]` for UPDATE/DELETE … RETURNING, and `rows` for SELECT/INSERT. Read it accordingly. With `skip/take` and joins, order by PROPERTY paths (`c.nameEn`), not column names. |

## 7. Audit

| Id | Rule |
|---|---|
| R-AUDIT-1 | Every state change and every sensitive read writes an audit row via `writeAudit()` with an action from the `AUDIT` list in `lib/audit.ts` ([docs/AUDIT_EVENTS.md](docs/AUDIT_EVENTS.md)). `data` holds ids, codes, counts and FIELD NAMES, never values. |
| R-AUDIT-2 | Nobody writes `pension_audit.audit_logs` directly. Services call `pension_audit.append_event()`; the table is append-only (trigger) and hash-chained. |

## 8. Web app

| Id | Rule |
|---|---|
| R-WEB-1 | The browser calls only the Next.js BFF (`/api/auth/*`, `/api/gateway/<service>/*`). Tokens live in httpOnly cookies and never reach JavaScript. |
| R-WEB-2 | Every page and nav item is gated by `P.*` (nav `anyOf`, `NavAccessGuard`). Hiding a button is UX only; the service decides. |
| R-WEB-3 | Every `<form>` with a password, OTP or identifier uses `method="post"`. Mutating requests carry the CSRF header (the api helper does it). |
| R-WEB-4 | UI text: labels in Title Case (keep acronyms: UID, ART, PPO, IFSC, OTP, ID), every string in `src/messages/en.json` AND `hi.json`, **no em dashes and no "--"** anywhere in user-facing text. |
| R-WEB-5 | No identifier or personal data in a URL; routes carry uuids only. |
| R-WEB-6 | Read [web/pension-web/README.md](web/pension-web/README.md) before adding a page. |

## 9. Tests and definition of done

| Id | Rule |
|---|---|
| R-TEST-1 | Every rule id you implement gets a test whose name starts with its test id (`UT-…` unit, `IT-…` integration/smoke) listed in [docs/TEST_PLAN.md](docs/TEST_PLAN.md). |
| R-TEST-2 | Scope and permission behaviour is tested for every new endpoint: no token → 401, wrong permission → 403, out of scope → 404, right caller → 200. |
| R-TEST-3 | Tests use synthetic data only. |

A change is **done** only when ALL of these pass and are pasted in the PR (template: [docs/PR_CHECKLIST.md](docs/PR_CHECKLIST.md)):

1. `scripts/dev.sh check` (lib sync + rule check + typecheck + lint + unit tests in every package)
2. `scripts/dev.sh smoke` (both Phase 0 smoke scripts) and `scripts/dev.sh acceptance <current phase> --allow-todo` with **0 FAIL**, plus the acceptance scripts of every finished phase with 0 FAIL and 0 TODO (when you touched services)
3. `npm run build` in `web/pension-web` (when you touched the web app)
4. `npm audit --omit=dev --audit-level=high` in every package you changed dependencies of
5. docs updated: API doc, FIELD_DICTIONARY / DATA_MODEL for new columns, AUDIT_EVENTS for new actions, TEST_PLAN for new tests, OPEN_QUESTIONS when you used a placeholder
6. you ran the screen in the browser as the roles it is meant for, and as one role it is NOT meant for

## 10. Git

| Id | Rule |
|---|---|
| R-GIT-1 | Never commit `env/*.env`, `.data/`, `.logs/`, real spreadsheets, screenshots with data, or keys. |
| R-GIT-2 | One topic per branch and PR. Branch names: `phase<N>/<short-topic>`. Commit messages: `<area>: <what changed>` (area = auth, core, data, web, docs, infra). |
| R-GIT-3 | Do not push, merge or deploy without the reviewer's go. |
