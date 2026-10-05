# Roadmap

Work only on the current phase (R-SCOPE-0). Each task has an id, its scope, and acceptance criteria. A task is done only when its criteria AND the definition of done in AGENTS.md §9 are met. Pick tasks in order unless the reviewer says otherwise.

## Phase 0: Foundation ✅ (done 2026-10-02)

- Repository, docs, docker infra, scripts
- 3 services from one template with shared lib
- auth-service: login (Center Code, captcha, TOTP), sessions, password flows, users, assignments, roles, permissions, Districts, Centers, audit store
- core-service: settings, wiring
- data-service: import pipeline with the Center importer
- web app: login (center picker, captcha, MFA), password flows, the Chikitsa-Raj shell, Profile, an empty Dashboard
- Dockerfiles and Kubernetes manifests

Verified by 74 unit tests, 51 smoke checks and the manual checks in TEST_PLAN.md.

## Phase 0b: admin screens (web only)

The APIs for Districts, Centers, Users, Roles, Imports and the Audit Log are built and smoke-tested; their screens are not. Guide: [PHASE_0B](phases/PHASE_0B_ADMIN_SCREENS.md), tasks T-0b.1..T-0b.6. Do it before Phase 1: Phase 1's SOCH import extends the Imports screen.

## Phases 1 to 6

Each phase has a guide (the contract: SQL, endpoints with JSON, logic, screens, tests) and an acceptance script written against it. How to work through one is in [phases/README.md](phases/README.md).

| Phase | Scope | Guide | Tasks | Done when |
|---|---|---|---|---|
| 1 | SOCH import (Excel to beneficiaries, review list for UID merges), beneficiary list, detail, unmask, dashboard counts | [PHASE_1](phases/PHASE_1_SOCH_BENEFICIARIES.md) | T-1.1..T-1.8 | `scripts/dev.sh acceptance 1` passes |
| 2 | Pension application: draft, worker fields, consent + document, submit, Center In-charge sign-off or return, history | [PHASE_2](phases/PHASE_2_APPLICATION.md) | T-2.1..T-2.6 | `scripts/dev.sh acceptance 2` passes |
| 3 | Verification queue, checklist, compare, unmask, recommend, approve, reject, return, maker-checker | [PHASE_3](phases/PHASE_3_VERIFICATION.md) | T-3.1..T-3.4 | `scripts/dev.sh acceptance 3` passes |
| 4 | PPO number (system or manual), sheet, print, PDF, correction | [PHASE_4](phases/PHASE_4_PPO.md) | T-4.1..T-4.4 | `scripts/dev.sh acceptance 4` passes |
| 5 | Payments (manual and import), dashboard v2, reports, global search, exports | [PHASE_5](phases/PHASE_5_PAYMENTS_REPORTS.md) | T-5.1..T-5.6 | `scripts/dev.sh acceptance 5` passes |
| 6 | Hardening: OWASP and VAPT pre-check, SMS gateway, CSP nonces, load test, backup and restore, retention, Hindi and accessibility, monitoring, go-live data | [PHASE_6](phases/PHASE_6_HARDENING.md) | T-6.1..T-6.10 | checklist in the guide |

Earlier acceptance scripts must keep passing in every later phase.

Before Phase 1 starts with real data, the department must answer at least Q-01 (SOCH layout) and Q-04 (Center list). Until then, build against the placeholders and the synthetic fixture ([OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)).
