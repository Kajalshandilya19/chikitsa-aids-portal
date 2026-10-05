# Architecture

## 1. Shape

```
 browser ──HTTPS──> pension-web (Next.js 16, BFF)  :3200
                       │  httpOnly cookies hold the tokens; the browser never sees them
                       │  /api/auth/*            login, MFA, refresh, logout, passwords
                       │  /api/gateway/<svc>/*   proxy with Bearer token, CSRF + origin checked
                       ▼
     ┌─────────────────┼──────────────────────┐
     ▼                 ▼                      ▼
 pension-auth-service  pension-core-service   pension-data-service
 :3201 /auth/api/v1    :3202 /core/api/v1     :3203 /data/api/v1
 users, roles,         beneficiaries,         Excel/CSV imports,
 sessions, MFA,        applications, PPO,     exports
 Districts, Centers,   payments, settings
 audit read
     ▲      ▲                 │                      │
     │      └──── /internal (service token) ─────────┤
     │                                               │
     └──── /internal: permissions, masters, Center upsert
                       │
     Postgres 17 (one DB, one schema per service)   Redis (captcha nonces, rate limits)   MinIO (private files)
```

| Service | Owns (schema) | Calls | Called by |
|---|---|---|---|
| auth | `pension_auth`, `pension_audit` | none | web, core, data |
| core | `pension_core` | auth (`/internal`) | web, data (Phase 1) |
| data | `pension_data` | auth, core (`/internal`) | web |

A service never reads another service's schema (R-DB-1). Each service has its own DB login, and the login owns only its schema (`docker/postgres/10-bootstrap.sh`, `k8s/db-bootstrap.sql`).

## 2. Inside a service

```
src/
  index.ts            boot: connect DB (with retries), listen, graceful shutdown
  app.ts              createServiceApp({ name, mount, api, internal, ready }); registers the permission resolver
  config/index.ts     zod schema of THIS service's env keys (extends lib/base-config)
  config/datasource.ts TypeORM DataSource (schema, entity and migration globs, synchronize false)
  lib/                SHARED, byte-identical in all services (R-LIB-1), see table below
  entities/           *.entity.ts, one class per table
  migration/          hand-written SQL migrations (R-DB-5)
  dtos/               zod request schemas built from lib/validators (R-VAL-1)
  domain/             pure business rules (no DB, no HTTP): permissions, workflow, PPO pattern
  repositories/       non-trivial queries
  services/           use cases: transactions, scope checks, audit
  clients/            calls to other services or gateways
  routes/v1/          public routes (guards in the fixed order, R-API-4)
  routes/internal/    service-token-only routes
  dev/                scripts: migrate, seed, fixtures, docs generators
tests/unit/           jest; test names start with their UT- id
kube-manifests/       deployment, migration job (+ seed job, cronjobs)
Dockerfile            node:24 builder, node:24-slim runtime, non-root, tini
```

Layering is fixed: `routes` call `services`, `services` call `repositories`, `domain`, `clients` and `lib`. A route never touches the database. `domain` never imports TypeORM or Express.

### `src/lib` (shared)

| File | Purpose |
|---|---|
| `base-config.ts` | Env keys every service needs; refuses unsafe settings outside `APP_ENV=local` (S-CFG) |
| `http-app.ts` | THE Express app factory: headers, CORS, body limit, request id, access log, xss guard, health, error handler |
| `access-token.ts` | Access token claims; issue (auth only) and verify (all) |
| `auth-middleware.ts` | `authenticate()`, `authorize(P.X)`, `requireServiceToken()`, `caller(res)` |
| `scope.ts` | `applyScope()`, `assertInScope()`: Center and District visibility (R-SCOPE) |
| `permission-codes.ts` | `P.*`, `ROLE.*`, `ScopeLevel` (also copied to the web app) |
| `validators.ts` | The validation catalogue V-001 to V-040 (also copied to the web app) |
| `pii.ts` | AES-256-GCM `piiTransformer`, `blindIndex`, name-search tokens |
| `mask.ts` | Masking for lists and exports |
| `redact.ts` | Keys never written to logs |
| `audit.ts` | `writeAudit()` and the `AUDIT` action list |
| `internal-call.ts` | Service tokens; `internalCall()` |
| `captcha.ts` | Stroke-drawn SVG arithmetic captcha, single use |
| `kv.ts` | Redis (or in-memory, local only) for nonces and counters |
| `rate-limit.ts` | `perUser`, `perIdentifier` limiters (Redis store) |
| `errors.ts`, `error-middleware.ts`, `format-db-error.ts`, `envelopes.ts` | Error and response shapes |
| `validate.ts` | `validateBody/Query/Params(schema)` |
| `request-id.ts`, `request-context.ts`, `logger.ts` | Request id, per-request context, redacting logger |
| `xss-guard.ts`, `no-store.ts` | Markup refusal, no-store caching |
| `upload-guard.ts`, `object-store.ts`, `signed-file.ts` | Document uploads (magic bytes), MinIO, signed download links (used from Phase 2) |
| `sequence-counter.ts`, `sort.ts` | Atomic number sequences (PPO), whitelisted sorting |

## 3. Identity and tokens

- **Login** (auth-service) returns an access token (JWT HS256, 15 minutes) and an opaque refresh token. The refresh token rotates on every use, and replay detection kills the session.
- The **BFF** keeps both tokens in httpOnly cookies (`hp_access`, `hp_refresh` on path `/api/auth`) and forwards the access token as `Authorization: Bearer`.
- **Access token claims**: user id, session id, active assignment, role id and code, scope, district id, center id and code, must-change-password flag ([lib/access-token.ts](../services/pension-auth-service/src/lib/access-token.ts)).
- **Every service verifies tokens locally** with the shared `JWT_SIGNING_KEY`. auth-service also checks that the session is not revoked. Core and data accept a token until it expires, at most 15 minutes after a logout.
- **Permissions** are resolved per role:
  - auth-service reads its own tables;
  - core and data call `GET /auth/api/v1/internal/roles/:id/permissions`;
  - the result is cached for 60 seconds per process.

## 4. Service-to-service calls

- `internalCall('auth', '/internal/...')` sends `x-service-token`. This is a short-lived JWT signed with the same key, with audience `<JWT_AUDIENCE>-internal` and `svc: true`.
- `/internal/*` routes accept only that token.
- The BFF never proxies `internal/` paths.
- Kubernetes NetworkPolicies ([../k8s/network-policy.yaml](../k8s/network-policy.yaml)) allow exactly these flows:
  - web to every service
  - core and data to auth
  - data to core

## 5. Data protection at rest

- Personal fields are encrypted per value: AES-256-GCM with `PII_ENCRYPTION_KEY`, stored as `v1:iv:tag:ciphertext`.
- Search uses HMAC blind indexes made with `PII_HMAC_KEY`.
- Staged import rows and uploaded file names are encrypted too.
- The uploaded file itself is not stored, only its SHA-256.
- The audit log is append-only and hash-chained in `pension_audit`:
  - core and data can only call `append_event()`;
  - an UPDATE or DELETE fails even for the owner.

## 6. Local vs cluster

| | Local | Cluster |
|---|---|---|
| Infra | docker-compose (127.0.0.1 only) | managed Postgres, Redis, MinIO |
| Env | `env/local.env` (from `scripts/setup.sh`) | Secrets `pension-common` + `pension-<svc>` |
| Migrations | `scripts/dev.sh migrate` | `kube-manifests/migration-job.yaml` per service |
| Seed | `scripts/dev.sh seed` (with dev users) | `seed-job.yaml` (no dev users) |
| `APP_ENV` | `local` | `uat` / `production` (`local` + `NODE_ENV=production` is refused) |
