<!-- Fill in every section. Template source: docs/PR_CHECKLIST.md -->
## What and why
<task id from docs/ROADMAP.md, one paragraph>

## Rules touched
<R-, S-, BR-, V-, WF- ids this change implements or affects>

## Checks (paste the summary lines)
- [ ] scripts/dev.sh check                      -> lib sync OK; rule check OK; typecheck/lint/tests OK in auth, core, data, web
- [ ] node scripts/smoke-auth.mjs                -> N passed, 0 failed
- [ ] node scripts/smoke-data.mjs                -> N passed, 0 failed
- [ ] scripts/dev.sh acceptance <phase>          -> N passed, 0 failed, M todo (0 todo when the phase is finished)
- [ ] web: npm run build                         -> OK            (if web changed)
- [ ] npm audit --omit=dev --audit-level=high    -> OK            (if dependencies changed)

## Security and privacy
- [ ] every new route: authenticate + authorize(P.X); scope via applyScope/assertInScope; 404 out of scope
- [ ] every new person-related column: piiTransformer (+ _lookup / _last4), redact key added, 🔒 in docs
- [ ] no identifier or personal data in URLs, logs, error messages, audit data, SMS text
- [ ] DTOs .strict() and built from lib/validators.ts only
- [ ] writes + audit in one transaction

## Docs updated
- [ ] API_<service>.md   - [ ] DATA_MODEL / FIELD_DICTIONARY   - [ ] AUDIT_EVENTS   - [ ] TEST_PLAN   - [ ] OPEN_QUESTIONS (placeholders)

## Manually tried as
<roles that should succeed> / <a role that should be refused>
