# Onboarding (first week)

You will build Phases 1 to 5 of a portal that holds the HIV status, Aadhaar and bank details of real people. Speed matters less than getting it right. Every rule you will meet exists because a mistake here can hurt someone.

## Day 1: run it and read

- [ ] Install Docker, Node 22.9+, VS Code (ESLint + Prettier extensions).
- [ ] `scripts/setup.sh`, then `scripts/dev.sh up`. Open http://localhost:3200.
- [ ] Log in as each dev user in [SEED_DATA.md](SEED_DATA.md) §5 and click every page. Notice what each role can and cannot see.
- [ ] `scripts/dev.sh check` and `scripts/dev.sh smoke`: everything green.
- [ ] Read:
  - [../README.md](../README.md), [../AGENTS.md](../AGENTS.md) (all of it), [GLOSSARY.md](GLOSSARY.md)
  - [PRODUCT_SPEC.md](PRODUCT_SPEC.md)
  - [WORKFLOW.md](WORKFLOW.md)

## Day 2: the code

- [ ] Read [ARCHITECTURE.md](ARCHITECTURE.md). Then read these files in this order, each top to bottom:
  1. `services/pension-auth-service/src/lib/http-app.ts`
  2. `lib/auth-middleware.ts`
  3. `lib/scope.ts`
  4. `lib/validators.ts`
  5. `lib/pii.ts`
  6. `lib/audit.ts`
- [ ] Follow one request end to end: `GET /auth/api/v1/centers`, through `routes/v1/masters.routes.ts`, then `services/master.service.ts`. Notice the guard order, the scope filter and the view mapping.
- [ ] Follow one import end to end: `services/pension-data-service/src/services/import.service.ts` `upload()` and `commit()`.
- [ ] Web: read `web/pension-web/README.md` and [UI_GUIDELINES.md](UI_GUIDELINES.md), then `src/components/dashboard/` (shell, sidebar, header) and `src/app/dashboard/profile/page.tsx`. Your first web work is [phases/PHASE_0B_ADMIN_SCREENS.md](phases/PHASE_0B_ADMIN_SCREENS.md).

## Day 3: small exercises (throw-away branch, do not merge)

1. **Add a validator.** Add `V-099 testRule` (any rule) following [HOWTO.md](HOWTO.md) D. Sync it, test it, and see it appear in the web app. Then delete it.
2. **Add a column.** Add a nullable `remarks` column to `pension_auth.centers` using `node scripts/new-migration.mjs auth center-remarks`, with an entity change and a migrate/revert/run cycle. Ask yourself: is "remarks" personal data? (Yes. Look at how `check-rules.mjs` reacts if you forget the transformer.) Then delete the branch.
3. **Break a rule on purpose** and watch the guard catch it:
   - a `'pension:user.account.view'` string literal (ESLint);
   - a route without `...guard` (`check-rules.mjs`);
   - an edited `src/lib` file in core only (`check-lib-sync.sh`).

## Day 4 onward: Phase 1

- [ ] Read [phases/README.md](phases/README.md) and the whole Phase 1 guide.
- [ ] Bring all your questions in ONE message to the reviewer.
- [ ] Run `scripts/dev.sh acceptance 1 --allow-todo` and start with task T-1.1.

## How to ask for help

Say three things:

1. what you are trying to do (task id);
2. what you ran, and the exact output (with the `request_id` if there is one);
3. what you expected.

Never paste `env/local.env`, a token, an OTP or a real person's data into a chat or a ticket.
