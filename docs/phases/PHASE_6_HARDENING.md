# Phase 6: Hardening and go-live readiness

**Goal:** the portal survives a CERT-In VAPT, a full SOCH file, a lost server, and the first real users. Most items here are reviews, configuration and runbooks, not features.

Each item has an owner. "Intern" items are code; "Lead" items need the reviewer or the infrastructure team.

| Id | Item | Owner | Done when |
|---|---|---|---|
| T-6.1 | OWASP Top 10 review of the whole diff since Phase 0 (`security-owasp` skill, or `/security-review`), findings fixed | Intern + Lead | Findings list in `docs/VAPT_LOG.md` with the fix commit per item |
| T-6.2 | VAPT pre-check, using the checklist in §2 below | Intern | Every row ticked with evidence |
| T-6.3 | eSanchar SMS client: `clients/sms.client.ts` provider `esanchar`; timeout 8 s; no retry storm (one retry); message template id; the text never says "HIV" | Intern | OTP arrives on a real phone in UAT (Q-15 answered) |
| T-6.4 | CSP nonces: replace `'unsafe-inline'` for scripts with a per-request nonce (Next 16 `proxy.ts` + `headers()`) | Intern | No `'unsafe-inline'` in `script-src` in production; app works |
| T-6.5 | Load test at 80,000 beneficiaries (§3) | Intern | p95 under 800 ms for list and search; the 80k SOCH import completes in under 10 minutes |
| T-6.6 | Backup and restore runbook (`docs/RUNBOOK_BACKUP.md`): encrypted `pg_dump` per schema, MinIO bucket mirror, key escrow for `PII_*` keys, a tested restore into a scratch DB | Lead | One restore drill done and timed (RPO and RTO for Q-14) |
| T-6.7 | Retention jobs for Q-14 answers (e.g. purge consent documents of REJECTED applications after N years) | Intern | CronJob + UT; documented in SECURITY.md S-RET |
| T-6.8 | Hindi review of every screen by a native reader; accessibility pass (keyboard only, screen reader labels, 200% zoom, contrast) | Intern + reviewer | Issues fixed; `docs/ACCESSIBILITY.md` lists what was checked |
| T-6.9 | Monitoring: JSON logs shipped; alerts on 5xx rate, login failures per minute, audit chain verify failing (daily CronJob calling `/audit/verify`) | Lead | Alerts fire in a drill |
| T-6.10 | Go-live data: RSACS Center list imported, placeholders deactivated, real State users created, `create-superadmin` run, dev users absent | Lead | Checklist in DEPLOYMENT.md §5 passes in production |

## 2. VAPT pre-check

Each row is a finding the Chikitsa-Raj VAPT (389/26-27/2798) raised on a sister system. Prove this portal does not have it.

| # | Check | How to prove |
|---|---|---|
| 1 | Brute force on login | IT-AUTH-08 (lockout), the rate limit headers, the captcha single use |
| 2 | Captcha bypass with a dummy token | `verifyCaptcha('XXXX.DUMMY', ...)` refused (UT-LIB-010) |
| 3 | User enumeration | Same error and timing for an unknown user and a wrong password (IT-AUTH-05) |
| 4 | Stored XSS through any text field, including encoded payloads | IT-SEC-01, UT-LIB-011; try `%3Cscript%3E` in every form |
| 5 | Unrestricted file upload | UT-IMP-001..006, AT-P2-08 |
| 6 | IDOR: another Center's record by id | AT-P1-10, AT-P2-03, AT-P4-08 (404) |
| 7 | Privilege escalation through the role editor | UT-RBAC-007..011; State Admin cannot assign STATE roles |
| 8 | Session fixation / tokens in JS | Cookies httpOnly, Secure, SameSite=Strict; `document.cookie` shows only `hp_csrf` |
| 9 | CSRF | Mutating `/api/*` without the `X-CSRF-Token` header answers 403 |
| 10 | Missing security headers / caching of personal data | `curl -I` every page: CSP, HSTS, nosniff, frame-ancestors, no-store |
| 11 | Verbose errors | A production 500 shows "internal server error" and a request id only |
| 12 | Vulnerable dependencies | `npm audit --omit=dev --audit-level=high` clean in all 4 packages |
| 13 | Sensitive data in URLs or logs | grep the logs of a full acceptance run for every synthetic Aadhaar, Jan Aadhaar and account value: zero hits |
| 14 | Source code or maps on the server | `find / -name "*.map" -o -name "*.ts"` inside each image: zero (except node_modules typings) |

## 3. Load test recipe

1. **Generate a big synthetic file:**
   ```bash
   cd services/pension-data-service
   npm run fixture:soch -- --rows 80000 --out ../../.data/soch-80k.xlsx
   ```
   The `--rows` and `--out` options must be added to `make-soch-fixture.ts`; part of T-6.5. Never commit the generated file.
2. **Import it** through the UI or `scripts/acceptance/phase1.mjs`-style code. Time the upload and the commit.
3. **Load the endpoints** with k6 or autocannon against `GET /beneficiaries?q=...` and `/applications`. Run 20 virtual users for 5 minutes as `stateadmin`, `dapcu.ajmer` and `worker.rj001`, rotating tokens.
4. **Record** p50, p95, p99 and the error rate in `docs/LOAD_TEST.md`.
5. **Fix slow queries** with `EXPLAIN ANALYZE`. The expected indexes are in the phase docs.
