# Security baseline

Derived from the Chikitsa-Raj VAPT rules (CERT-In L1 report 389/26-27/2798, `Chikitsa-Raj-Workspace/docs/SECURITY_RULES.md`) and the HIV and AIDS (Prevention and Control) Act, 2017. Every rule has an id, says where it is enforced, and says how it is tested. Do not weaken a rule without changing this file in the same reviewed change.

## 1. Legal context (why this portal is stricter than usual)

The Act, as summarised in Chapter 22 of the NACO ART guidelines 2021, sets these duties.

| Duty under the Act | What the system does |
|---|---|
| Informed, purpose-specific consent | Pension-processing consent is captured per application, with text version, language, time and capturer. Submission needs YES (BR-11). |
| HIV status may be disclosed without consent only in narrow cases (care providers, court orders, government or SACS officers for monitoring, anonymised statistics) | Access is limited to staff whose role needs it (RBAC + scope); no public pages; exports masked by default; every unmask audited |
| "Every establishment keeping records of HIV-related information shall adopt data protection measures" | Encryption at rest, masking, audit, retention, and the controls below |
| Complaints Officer and pseudonymous complaints | Out of scope; if added later, complainants must be pseudonymous |

## 2. Rules

### Configuration (S-CFG)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-CFG-1 | `CORS_ORIGIN` is an explicit list, never `*`, outside local | lib/base-config.ts | UT-LIB-012 |
| S-CFG-2 | `MFA_ENFORCED=false` only when `APP_ENV=local` | same | UT-LIB-012 |
| S-CFG-3 | `COOKIE_SECURE=false` only when `APP_ENV=local` | base-config, web BFF | UT-LIB-012 |
| S-CFG-4 | `SMS_PROVIDER=log` only when `APP_ENV=local` | base-config | UT-LIB-012 |
| S-CFG-5 | `APP_ENV=local` cannot run with `NODE_ENV=production`, and every image sets `NODE_ENV=production`. This also guarantees the captcha `dev_answer` never exists outside a laptop. | base-config | UT-LIB-012 |
| S-CFG-6 | Secrets live in `env/local.env` (gitignored, mode 600) or Kubernetes Secrets; never in code, images, logs or docs | .gitignore, review | |

### Authentication and sessions (S-AUTH, S-SESS)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-AUTH-1 | Passwords: argon2id; policy V-006; the last 3 cannot be reused; temporary passwords must be changed with an OTP | password.service.ts | UT-VAL-006, IT-USER-03/04 |
| S-AUTH-2 | Login failures answer one generic error and spend the same time for unknown users; 5 failures lock for 15 minutes | auth.service.ts | IT-AUTH-03/05/08 |
| S-AUTH-3 | Captcha on login and forgot password: stroke-drawn SVG (no text in the markup), HMAC-signed, single use, one guess per challenge | lib/captcha.ts | UT-LIB-009/010, IT-AUTH-01/06 |
| S-AUTH-4 | TOTP for every STATE and DISTRICT role. The authenticator label shows no name and does not say "HIV". | totp.service.ts | manual MFA test |
| S-AUTH-5 | SMS OTP: 6 digits, 10 minutes, single use, 5 attempts, 3 sends per 10 minutes, stored as HMAC only, SMS text without "HIV" | otp.service.ts | |
| S-SESS-1 | Access token 15 minutes; refresh token rotates and its reuse revokes the session; idle 30 minutes; maximum 8 hours | session.service.ts | IT-SESS-01/02/03 |
| S-SESS-2 | Logout, password change, deactivation, Center deactivation and assignment removal revoke sessions | services | IT-SESS-04 |
| S-SESS-3 | Tokens only in httpOnly, Secure, SameSite=Strict cookies; the refresh cookie path is `/api/auth` | web BFF | web review |
| S-SESS-4 | User tokens and service tokens have different audiences and can never be swapped | lib/access-token.ts, lib/internal-call.ts | UT-LIB-007, IT-SEC-04 |

### Authorization and scope (S-SCOPE)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-SCOPE-1 | Server-side scope on every query; out of scope is 404 (R-SCOPE-1..3) | lib/scope.ts | UT-SCOPE-*, IT-SCOPE-* |
| S-SCOPE-2 | Every non-public route has `authorize(P.X)` (R-RBAC-2) | routes | IT-RBAC-*, UT-HTTP-002 |
| S-SCOPE-3 | Maker-checker on applications (R-MC-1) | domain/application-flow (P2-3) | UT-RBAC-004 now; UT-WF-* in P3 |

### Input and output (S-IN)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-IN-1 | zod `.strict()` DTOs from validators.ts; unknown keys refused | dtos | IT-SEC-02 |
| S-IN-2 | Script markup refused in every body and query, also when encoded | lib/xss-guard.ts | UT-LIB-011, IT-SEC-01, UT-HTTP-006 |
| S-IN-3 | No identifiers in URLs; the access log prints the path only | lib/http-app.ts, R-API-2 | review |
| S-IN-4 | Error messages carry no personal data; database errors are translated (column names only) | lib/format-db-error.ts | |
| S-IN-5 | Security headers: helmet on services; CSP, HSTS, frame-ancestors none, nosniff, no-referrer, X-Robots-Tag noindex on the web app; `Cache-Control: no-store` everywhere | lib/http-app.ts, lib/no-store.ts, web proxy.ts | UT-HTTP-001 |
| S-IN-6 | CSRF: double-submit token plus Origin check on mutating BFF calls | web proxy.ts | web review |

### Personal data (S-PII)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-PII-1 | AES-256-GCM per value for every 🔒 column; HMAC blind indexes for search | lib/pii.ts | UT-LIB-001..003, DB check |
| S-PII-2 | Masked lists; unmask is permission-gated and audited | lib/mask.ts | UT-LIB-004, IT-PII-01 |
| S-PII-3 | Logs redacted by key; no bodies, tokens, OTPs or keys in logs | lib/redact.ts, logger | UT-LIB-005 |
| S-PII-4 | Nothing personal stored in the browser (no local storage of any kind); the spreadsheet is memory-only | web | web review |
| S-PII-5 | Exports masked unless `REPORT_FILE_EXPORT_SENSITIVE`; every export audited with its filters; formula injection guarded | data-service (P5) | |

### Files (S-FILE)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-FILE-1 | Spreadsheet uploads: type from bytes; xlsx zip checks; csv UTF-8; size and row limits | imports/file-guard.ts, parse.ts | UT-IMP-001..009, IT-IMP-13/14 |
| S-FILE-2 | Document uploads: magic-byte allowlist (PDF, PNG, JPEG), PDFs with scripts refused, stored type replaced by the detected one | lib/upload-guard.ts (P2) | |
| S-FILE-3 | Private MinIO bucket; downloads through signed 15-minute links; anything not renderable is served as an attachment | lib/object-store.ts, lib/signed-file.ts (P2) | |
| S-FILE-4 | Uploaded spreadsheets are not stored (SHA-256 only); staged rows encrypted | import.service.ts | DB check |
| S-FILE-5 | Exported cells starting with `= + - @` are prefixed with `'` | web export, data-service export (P5) | |

### Audit (S-AUD)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-AUD-1 | Append-only: UPDATE, DELETE and TRUNCATE raise an error even for the owner | migration 1801000000002 | DB check |
| S-AUD-2 | Hash chain per service; `GET /audit/verify` recomputes it | append_event, verify_chain | IT-AUD-02 |
| S-AUD-3 | Core and data can only EXECUTE append_event; they cannot read or change rows | grants | DB check |
| S-AUD-4 | Audit `data` holds ids, codes, counts and field names only (also passed through redact) | lib/audit.ts | review |

### Abuse limits (S-RL)

| Id | Rule | Enforced in | Test |
|---|---|---|---|
| S-RL-1 | Rate limits per user or per IP + identifier, never one global bucket; numbers in routes/v1/limits.ts | lib/rate-limit.ts | |
| S-RL-2 | Counters and nonces in Redis outside local (the in-memory fallback is refused) | lib/kv.ts | |
| S-RL-3 | The BFF forwards the real client IP; services trust exactly TRUST_PROXY_HOPS | web gateway, lib/http-app.ts | |

### Retention, network, dependencies

| Id | Rule | Where |
|---|---|---|
| S-RET-1 | Staged import rows deleted after 7 days (purge CronJob); other retention periods per Q-14 | data-service purge |
| S-NET-1 | NetworkPolicies allow only web to services, core and data to auth, and data to core; all infra bound to private networks | k8s/network-policy.yaml |
| S-DEP-1 | `npm audit --omit=dev --audit-level=high` passes in every package. Known: 4 moderate advisories via `minio` (decode-uri-component, stream-json), whose inputs come only from our own MinIO; accepted until minio updates. | each package |
| S-DEP-2 | No `xlsx` (SheetJS npm) anywhere | R-STACK-2 |

## 3. Before calling a security-relevant change done

1. Run the `security-owasp` review on the diff (Chikitsa-Raj skill) or an equivalent OWASP Top 10 pass.
2. Add or extend the tests named in the table.
3. Update this file when a rule changes.
