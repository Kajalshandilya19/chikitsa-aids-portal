# Test plan

Test names start with their id, so a failing test points straight at a row here (R-TEST-1).

| Prefix | Kind | Where | Run |
|---|---|---|---|
| UT-* | Unit (jest; no DB, Redis or MinIO) | `services/*/tests/unit/` | `npm test` in a service, or `scripts/dev.sh check` |
| IT-* | End-to-end smoke against a local stack | `scripts/smoke-auth.mjs`, `scripts/smoke-data.mjs` | `node scripts/smoke-*.mjs` |

## Phase 0: unit tests (74)

| Ids | Service | Proves |
|---|---|---|
| UT-VAL-001..041 | auth | Every validator accepts and refuses what VALIDATION_RULES.md says |
| UT-LIB-001..003 | auth | PII encryption round trip, blind index normalisation, name search tokens |
| UT-LIB-004 | auth | Masks |
| UT-LIB-005 | auth | Log redaction at depth |
| UT-LIB-006..008 | auth | Access token round trip; service and user tokens cannot be swapped; tampered tokens refused |
| UT-LIB-009..010 | auth | Captcha has no readable text; single use; a wrong guess burns the challenge |
| UT-LIB-011 | auth | XSS detection, including encoded forms |
| UT-LIB-012 | auth | S-CFG-1..5 profile guards |
| UT-SCOPE-001..003 | auth | Scope rules, fail-closed, 404 for out of scope |
| UT-RBAC-001..012 | auth | Catalogue completeness; templates valid for scope; MFA roles; maker-checker split; unmask holders; no worker export; delegation rules; the generated matrix doc is current |
| UT-PPO-001..002 | core | PPO pattern validation and formatting |
| UT-SET-001..002 | core | Setting defaults valid; placeholders point at a Q- id |
| UT-HTTP-001..006 | core | Security baseline of every app: envelope, no-store, request id, 401/403/200, password-change gate, internal routes need a service token, xss in query |
| UT-IMP-001..011 | data | File guard (xlsx, xls, macros, zip bombs, zip64, csv encoding, size), parsing (first sheet, dates, formulas, row numbers, row limit), Center row schema |
| UT-IMP-012..014 | data | SOCH column dictionary and spelling mappers |

## Phase 0: smoke tests (51)

`smoke-auth.mjs` (31):

| Ids | What |
|---|---|
| IT-AUTH-01..09 | Captcha, Center-code login, generic errors, captcha single use, me, lockout and unlock |
| IT-SCOPE-01..04 | Worker sees one Center; state sees 41; other Center by id is 404; district officer sees only its district |
| IT-RBAC-01..02 | Worker cannot list users; assignable flags |
| IT-USER-01..04 | Create user with temporary password; no State role by State Admin; forced password change |
| IT-PII-01 | Masked mobile in lists |
| IT-SESS-01..04 | Refresh rotation, replay kills the session, logout |
| IT-SEC-01..04 | XSS refused, unknown keys refused, internal routes need a service token, a user token is not a service token |
| IT-AUD-01..03 | Auditor reads the log, chain verifies, worker cannot read it |

`smoke-data.mjs` (20):

| Ids | What |
|---|---|
| IT-CORE-01..05 | Core verifies tokens and resolves permissions via auth; settings permissions; PPO pattern validation |
| IT-IMP-01..15 | Template, permissions, mixed file (create, update, duplicate, errors), header warnings, row errors with rule ids, view vs commit permission, commit once, master updated, cancel, rejected header, .xls and markup refused, history |

## Manual checks (Phase 0)

| Id | Check |
|---|---|
| MT-01 | MFA: run auth with `MFA_ENFORCED=true`, log in as `verifier`: QR enrolment, wrong code refused, next login asks for the code |
| MT-02 | Built image: run `pension-auth-service:local` with `APP_ENV=uat`: `/health/ready` OK, `dev_answer` absent, JSON logs |
| MT-03 | Audit append-only: `DELETE` as the core DB user is denied; `UPDATE` as the auth DB user raises the trigger error |
| MT-04 | Web: log in as every dev user; the nav shows only permitted items; a forbidden URL shows the 403 panel |
| MT-05 | Preview demo: search and filter beneficiaries, change pages, open a row by its id, return to the list, reject invalid name/age/category/address values, edit/save and cancel, search payment history, reveal and auto-hide synthetic identifiers, print, and copy a demo transaction reference. Confirm edits stay in memory and reset after reload. |
| MT-06 | Districts: load and search the API-backed list, reject an invalid Hindi name under V-035, edit Hindi name and active status with an authorized role, confirm the change persists after refetch, confirm an auditor has no Edit action, confirm a District Officer sees 403, and confirm API errors expose a retry and request id. |
| MT-07 | Centers: verify the list filters and server sorting/paging, Add and Edit validation/save/cancel, permission-gated actions, Activate/Deactivate confirmation and refetch, Center template download, import validation and server row errors, commit and cancel permissions, and the 360px horizontal table layout. |
| MT-08 | Centers preview: search/filter/sort and change pages; validate Add/Edit forms, save and cancel; confirm status changes; upload a synthetic CSV/XLSX, review row errors, confirm or cancel import; verify the visible demo notice and that changes reset after reload without contacting production APIs. |
| MT-09 | Users: verify the protected route requires session and `USER_ACCOUNT_VIEW`; search/filter/paging, role and scope assignment validation, create/edit/cancel, assignment add/remove, account activate/deactivate/unlock/reset confirmation, one-time temporary-password display, self/State-account restrictions, and masked contact data. In `/preview/users`, verify synthetic-only create/edit/assignment/status behavior, search/filter/paging, password dialog, and 360px layout; confirm preview changes reset after reload and never call production APIs. |

## Phases 1 to 5: acceptance scripts (written before the code)

| Script | Ids | Covers |
|---|---|---|
| `scripts/acceptance/phase1.mjs` | AT-P1-01..25 | SOCH columns endpoint; fixture import counts and per-field errors; idempotent re-import; scope (worker, district); search by UID and name; masking; unmask permission and audit; UID-merge review flow; dashboard |
| `scripts/acceptance/phase2.mjs` | AT-P2-01..30 | Draft, one active application, scope 404, incomplete submit, V-007, read-only SOCH keys, consent document (type check, signed link, tamper), masking, edit view, stale version, consent required, submit, sign-off, return with reason, resubmit, history, audit, lists, dashboard |
| `scripts/acceptance/phase3.mjs` | AT-P3-01..23 | Queues, pick and takeover rule, checklist rules, compare, unmask, recommend, approval queue, approve, maker-checker (Super Admin), reject with reason, no new application after rejection, return from verification, audit |
| `scripts/acceptance/phase4.mjs` | AT-P4-01..15 | Generate permissions and status, unique under concurrency, search by PPO, scope, sheet, PDF headers, Super Admin correction with reason and audit, MANUAL mode |
| `scripts/acceptance/phase5.mjs` | AT-P5-01..23 | Payments (create, duplicate, validation, reversed, scope), payment import, dashboard v2 by scope, reports scope and filters, global search, exports (worker 403, masked CSV, xlsx, sensitive permission, audit) |

Shared helpers: `scripts/lib/smoke-kit.mjs` (PASS / FAIL / TODO / BLOCKED, `guardChecks` for 401/403/404/200) and `scripts/lib/flows.mjs` (reach "submitted", "approved", "PPO generated" through the documented API).

## Later phases must add

- **UT-WF-*:** every transition in WORKFLOW.md, including the maker-checker refusals (Phases 2 and 3).
- **UT-CORE-M01..M06:** every SOCH match outcome (Phase 1). **UT-IMP-S01..S03:** SOCH row schema, fixture error rows, fingerprint stability (Phase 1).
- **UT-PPO-0xx:** 100 concurrent generations give 100 unique numbers (Phase 4).
- **IT-*:** every new endpoint, covering 401 without a token, 403 without the permission, 404 out of scope, and success (R-TEST-2).
- **SOCH import:** the fixture's 8 error rows are each rejected with the right rule. A re-import changes no application field.
