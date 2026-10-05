# How to: recipes for common changes

**Generators** (use them, they encode the conventions):

| Command | Creates |
|---|---|
| `node scripts/new-migration.mjs <auth\|core\|data> <kebab-name>` | the next numbered migration in the service's band, from the template |
| `node scripts/scaffold-module.mjs <auth\|core\|data> <kebab-plural>` | DTO, service, route and test skeletons. Does not compile until you choose the permission, on purpose. |
| `node scripts/check-rules.mjs` | static rule checks (also part of `scripts/dev.sh check`) |
| `scripts/dev.sh acceptance <n> [--allow-todo]` | the phase's acceptance script |

Each recipe lists EVERY file you must touch. If you finish a recipe and something on its list is untouched, you are not done. The rules referred to are in [../AGENTS.md](../AGENTS.md).

---

## A. Add an endpoint to a service

Example: `GET /core/api/v1/beneficiaries`.

1. **DTO**: create `src/dtos/<area>.dto.ts`.
   - Query or body schema built from `lib/validators.ts` (R-VAL-1).
   - End it with `.strict()` (R-VAL-3).
   - For a list, spread `...pageQuery` and add `sort` as a `z.enum` of whitelisted keys.
2. **Service**: create `src/services/<area>.service.ts`.
   - Use `applyScope(qb, auth, { district: 'b.district_id', center: 'b.center_id' })` for lists and `assertInScope(auth, row)` for one row (R-SCOPE-1).
   - Writes go in `AppDataSource.transaction(async (em) => { ...; await writeAudit(em, {...}) })` (R-DB-7).
   - Return plain view objects (snake_case keys) with masked values (R-PII-3).
3. **Route**: add it in `src/routes/v1/<area>.routes.ts` in the fixed order (R-API-4):
   ```ts
   router.get('/beneficiaries', ...guard, authorize(P.BENEFICIARY_RECORD_VIEW), validateQuery(listQuery), async (req, res) => {
     const q = req.query as unknown as ListQuery;
     const r = await beneficiaryService.list(authOf(res), q);
     res.json(paged(r.rows, r.total, q));
   });
   ```
   Mount the router in `src/routes/v1/index.ts`.
4. **Tests**:
   - unit-test the pure parts;
   - add smoke steps covering 401, 403, 404 out of scope and 200 (R-TEST-2) to `scripts/smoke-*.mjs`;
   - add the ids to [TEST_PLAN.md](TEST_PLAN.md).
5. **Docs**: add a row to `docs/API_<SERVICE>.md`. Add any new error code to [API_CONVENTIONS.md](API_CONVENTIONS.md) §3 and any new audit action to [AUDIT_EVENTS.md](AUDIT_EVENTS.md).
6. **Web**: add the BFF use through `/api/gateway/<service>/...` (nothing to add server-side; the gateway is generic) and the screen (recipe F).
7. **Check**: `scripts/dev.sh check` plus the smoke scripts.

## B. Add a permission

1. Add `P.NEW_THING: 'pension:<section>.<resource>.<action>'` to `services/pension-auth-service/src/lib/permission-codes.ts`.
2. Add `def(P.NEW_THING, 'English label', 'हिंदी लेबल', <scopes>, { delegable?, sensitive? })` to `PERMISSIONS` in `src/domain/permissions.ts`.
3. Add it to the role templates that need it (`ROLE_TEMPLATES`, same file). Ask the reviewer which roles. Never give a CENTER role a STATE-only permission: UT-RBAC-002 fails if you do.
4. In auth-service, run `npm run docs:rbac`. This regenerates [RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md); UT-RBAC-012 fails if you forget.
5. Run `scripts/sync-lib.sh`, which copies the code list to core, data and web.
6. Run `scripts/dev.sh seed`. The rbac sync upserts it and resets non-customised templates.
7. Use `P.NEW_THING` in `authorize(...)` and in the web nav or page gate.

## C. Add a column (or a table)

1. **PII check** (R-PII-1): is it about a person? Then:
   - use `type: 'text'` with `transformer: piiTransformer`;
   - add a `<name>_lookup varchar(64)` if you need equality search or uniqueness, filled with `blindIndex()` in the service;
   - add a `<name>_last4` if lists must show it masked;
   - add the key to `DEFAULT_REDACT_KEYS` in `lib/redact.ts` (R-PII-4).
2. **Migration**: add `src/migration/<next timestamp in the service's band>-<name>.ts` with explicit SQL and a working `down()` (R-DB-5). Never edit an old migration.
3. **Entity**: add the `@Column({ name: 'snake_case', type: '...' })` property.
4. **DTO and validator**: use or add a V- rule (recipe D).
5. **Docs**: [DATA_MODEL.md](DATA_MODEL.md) (with 🔒 when encrypted) and [FIELD_DICTIONARY.md](FIELD_DICTIONARY.md) when it is a form field.
6. **Test**: for an encrypted column, a smoke or DB check that the stored value starts with `v1:`.
7. **Run**: `scripts/dev.sh migrate`, check, smoke.

## D. Add a validation rule

1. Add the schema to `services/pension-auth-service/src/lib/validators.ts`:
   - give it the next `V-0xx` in its JSDoc;
   - end every message with `(V-0xx)`;
   - normalise with `.trim()`, `.toUpperCase()` or `.overwrite()`.
2. Add a `UT-VAL-0xx` test with accepted and refused values.
3. Add a row in [VALIDATION_RULES.md](VALIDATION_RULES.md).
4. Run `scripts/sync-lib.sh`. The web app gets the same file.

## E. Add an importer

See [IMPORT_PIPELINE.md](IMPORT_PIPELINE.md) §5.

## F. Add a web page

Read [web/pension-web/README.md](../web/pension-web/README.md) first. In short:

1. Create the page under `src/app/dashboard/<area>/page.tsx`. Use the existing shell components (server-data-table, form-modal, confirm-dialog).
2. Add a nav item in `src/config/nav.ts` with `anyOf: [P.X]`. The page is also gated by `NavAccessGuard`.
3. Build the forms with react-hook-form plus `zodResolver` over a schema built from `@/lib/shared/validators`. No inline regex (R-VAL-1).
4. Add every string to `src/messages/en.json` and `hi.json`. Labels in Title Case. No em dashes and no "--" (R-WEB-4).
5. Call the API through the client helper (`/api/gateway/<service>/...`). Never call a service URL from the browser.
6. Check: `npm run typecheck && npm run lint && npm run build`. Then click through as an allowed role and as a forbidden role.

## G. Change something in `src/lib`

1. Edit ONLY `services/pension-auth-service/src/lib/...` (R-LIB-1).
2. Run `scripts/sync-lib.sh`.
3. Run `scripts/dev.sh check`, which typechecks and tests all three services. A lib change can break any of them.

## H. Run a single service with a different setting

```bash
cd services/pension-auth-service
MFA_ENFORCED=true PORT=3299 node --env-file-if-exists=../../env/local.env -r ts-node/register src/index.ts
```

Variables already set in the shell win over `env/local.env`.

## I. Look at the database

```bash
scripts/dev.sh psql
\dn                                    -- schemas
SELECT user_code, mobile_last4 FROM pension_auth.users;    -- 🔒 columns show v1:... ciphertext, by design
SELECT * FROM pension_audit.verify_chain('pension-auth-service');
```
