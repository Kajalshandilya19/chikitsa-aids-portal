# HIV Pension Portal (Rajasthan, RSACS)

A secure, Center-scoped case-management portal for pension applications of eligible people living with HIV in Rajasthan:

> SOCH Excel → Import → Beneficiary master → Center Worker fills the pension application (consent, bank) → Center In-charge signs off → State Verifier checks → State Approver approves → PPO number and PPO print → payment history

The functional source is the department's SRD and the SRS blueprint in [docs/reference/](docs/reference/). They are consolidated in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md). The stack is the Chikitsa-Raj stack, not the PHP stack proposed in the SRD.

**Status: Phase 0 (foundation)**. Login, roles, masters, audit, the import pipeline (Center import) and the web shell work. The pension workflow is built in Phases 1 to 6 ([docs/ROADMAP.md](docs/ROADMAP.md)).

**Before you change anything, read [AGENTS.md](AGENTS.md).** It holds the mandatory rules.

## Layout

```
services/
  pension-auth-service   :3201  login, sessions, MFA, users, roles, permissions, Districts, Centers, audit log
  pension-core-service   :3202  beneficiaries, applications, verification, PPO, payments, settings (Phase 0: settings only)
  pension-data-service   :3203  Excel/CSV imports (stage, validate, preview, commit) and exports
web/
  pension-web            :3200  Next.js 16 app and BFF (the only thing a browser talks to)
docs/                          every spec, rule and recipe (index: docs/README.md)
scripts/                       setup, dev runner, lib sync, smoke tests
docker-compose.yml             local Postgres 17, Redis, MinIO (bound to 127.0.0.1)
k8s/                           namespace, secrets example, DB bootstrap, network policy
fixtures/                      SYNTHETIC test files only (soch-sample.xlsx)
```

## Run it locally

Requirements: Docker, Node 22.9 or newer, openssl.

```bash
scripts/setup.sh          # once: env/local.env with fresh secrets, docker infra, npm ci, migrate, seed
scripts/dev.sh up         # infra + 3 services + web in the background (logs in .logs/)
open http://localhost:3200
```

Log in with a dev user from [docs/SEED_DATA.md](docs/SEED_DATA.md) §5. The password is `DEV_USER_PASSWORD` in `env/local.env`.

- Center login: Center Code `RJ001`, User ID `worker.rj001`.
- State login: User ID `stateadmin`, no Center Code.
- A local captcha answer also appears in the API response as `dev_answer`. This only happens locally.

### If you received this project as a zip

The zip (`chikitsa-aids-portal.zip`) is a complete package:

- the source code and every doc;
- `db-dump/chikitsa-aids-portal-db.sql`: the sender's local database (users, Districts, Centers, import batches, audit log; synthetic data only);
- `db-dump/chikitsa-aids-portal-keys.txt`: the three values the dump needs (`PII_ENCRYPTION_KEY`, `PII_HMAC_KEY`, `DEV_USER_PASSWORD`). Names, mobiles and imported rows in the dump are encrypted with these keys, and logins are looked up through them.

It has no `node_modules`, no `.git` and no `env/local.env`: the steps below create them. Requirements: Docker (running), Node 22.9 or newer, openssl.

```bash
unzip chikitsa-aids-portal.zip && cd chikitsa-aids-portal
chmod +x scripts/*.sh               # only if your unzip tool dropped the execute bit

# 1. env/local.env with fresh secrets, then put in the three keys of the dump
scripts/setup.sh --env-only
K='^(PII_ENCRYPTION_KEY|PII_HMAC_KEY|DEV_USER_PASSWORD)='
{ grep -vE "$K" env/local.env; grep -E "$K" db-dump/chikitsa-aids-portal-keys.txt; } > env/local.env.new
mv env/local.env.new env/local.env && chmod 600 env/local.env

# 2. infrastructure, npm ci in 4 packages, migrations, seed (a few minutes)
scripts/setup.sh

# 3. load the dump (replaces the four pension_* schemas completely)
set -a; source env/local.env; set +a
docker exec -i -e PGPASSWORD="$DB_ADMIN_PASSWORD" hiv-pension-postgres \
  psql -q -v ON_ERROR_STOP=1 -U "$DB_ADMIN_USER" -d "$DB_NAME" < db-dump/chikitsa-aids-portal-db.sql

# 4. start everything and get the logins
scripts/dev.sh up
scripts/dev.sh status               # all four components should say "running"
scripts/dev.sh creds --reset        # dev users and their password; new temporary passwords for the demo users
open http://localhost:3200
```

Active sessions are not in the dump, so everybody logs in again. To load the dump again later, run `scripts/dev.sh down` first, then step 3, then `scripts/dev.sh up`. Never commit `env/local.env` or `db-dump/` (both are in `.gitignore`).

These ports must be free on 127.0.0.1: web `3200`, auth `3201`, core `3202`, data `3203`, Postgres `15432`, Redis `16379`, MinIO `19010` and `19011`. To use other ports, change them in `env/local.env` after step 1.

If a component does not start, read its log with `scripts/dev.sh logs <auth|core|data|web>`. To start over with an empty database: `scripts/dev.sh reset-db` (it asks first, then migrates and seeds again).

Other commands: `scripts/dev.sh help`. The most used are listed below.

| Command | What it does |
|---|---|
| `scripts/dev.sh status` | What is running, on which port |
| `scripts/dev.sh logs auth` | Tail a log (auth, core, data, web) |
| `scripts/dev.sh start auth` / `stop auth` | One component |
| `scripts/dev.sh migrate` / `seed` | Migrations, then RBAC catalogue, Districts, placeholder Centers, dev users |
| `scripts/dev.sh check` | Lib sync check, typecheck, lint, unit tests everywhere. Must pass before every PR. |
| `node scripts/smoke-auth.mjs` | End-to-end checks of login, scope, sessions, lockout and audit |
| `node scripts/smoke-data.mjs` | End-to-end checks of the import pipeline and the core wiring |
| `scripts/dev.sh acceptance <n> [--allow-todo]` | Acceptance script of phase n (shows what is still TODO) |
| `node scripts/new-migration.mjs`, `node scripts/scaffold-module.mjs` | Generators (docs/HOWTO.md) |
| `node scripts/seed-demo.mjs` | Demo users, Centers and import batches for a local walkthrough (docs/SEED_DATA.md §1a) |
| `scripts/dev.sh reset-db` | Delete the local database and start over (asks first) |

## Where to read next

| You want to | Read |
|---|---|
| Understand the product | [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md), [docs/WORKFLOW.md](docs/WORKFLOW.md), [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) |
| Understand the code | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API_CONVENTIONS.md](docs/API_CONVENTIONS.md) |
| Make a change | [docs/HOWTO.md](docs/HOWTO.md), [docs/PR_CHECKLIST.md](docs/PR_CHECKLIST.md) |
| Start (new developer) | [docs/ONBOARDING.md](docs/ONBOARDING.md), [docs/GLOSSARY.md](docs/GLOSSARY.md) |
| Pick up work | [docs/ROADMAP.md](docs/ROADMAP.md), [docs/phases/](docs/phases/README.md) |
| Know what is still undecided | [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) |
