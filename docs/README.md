# Documentation index

| Doc | What it holds | Ids defined |
|---|---|---|
| [ONBOARDING.md](ONBOARDING.md) | First week for a new developer: run, read, exercises | |
| [GLOSSARY.md](GLOSSARY.md) | NACO, SOCH, ART, LFU, PPO, Jan Aadhaar, blind index, ... | |
| [phases/README.md](phases/README.md) | How to work through a phase; the phase guides (contracts) and their acceptance scripts | T-*, AT-* |
| [UI_GUIDELINES.md](UI_GUIDELINES.md) | Page types, states, status colours, personal data on screen, forms, text, accessibility | |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | The SRD and blueprint consolidated into numbered requirements, with the phase that delivers each | FR-* |
| [ROADMAP.md](ROADMAP.md) | Phases 0 to 6, and the task list per phase with acceptance criteria | T-* |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Services, schemas, tokens, BFF, internal calls, deployment shape | |
| [API_CONVENTIONS.md](API_CONVENTIONS.md) | Envelopes, error codes, paging, ids, headers | E_* |
| [API_AUTH.md](API_AUTH.md), [API_CORE.md](API_CORE.md), [API_DATA.md](API_DATA.md) | Every endpoint of each service | |
| [RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md) | Roles × permissions. GENERATED from code. | |
| [WORKFLOW.md](WORKFLOW.md) | Application status machine: who may move it, from where to where | WF-* |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Rules the services enforce | BR-* |
| [DATA_MODEL.md](DATA_MODEL.md) | Tables built so far and the target tables for later phases, PII marked 🔒 | |
| [FIELD_DICTIONARY.md](FIELD_DICTIONARY.md) | Every SRD field: column, rule, PII, who may edit it | |
| [VALIDATION_RULES.md](VALIDATION_RULES.md) | Every validation rule with its id, accepted and refused examples | V-* |
| [IMPORT_PIPELINE.md](IMPORT_PIPELINE.md) | How Excel/CSV imports work, and how to add an importer | |
| [SOCH_IMPORT_SPEC.md](SOCH_IMPORT_SPEC.md) | SOCH columns, mapping, matching and refresh rules (Phase 1) | |
| [SECURITY.md](SECURITY.md) | Security baseline and the HIV/AIDS Act obligations, as checkable rules | S-* |
| [AUDIT_EVENTS.md](AUDIT_EVENTS.md) | Every audit action and what it records | |
| [SEED_DATA.md](SEED_DATA.md) | What is seeded, what is a placeholder, how to replace it | |
| [DEMO_LOGINS.md](DEMO_LOGINS.md) | Local logins: every dev and demo user, which tab and Center, how to print the passwords | |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | Department decisions still open, with the default we built against | Q-* |
| [TEST_PLAN.md](TEST_PLAN.md) | Every unit and smoke test id, and what it proves | UT-*, IT-* |
| [HOWTO.md](HOWTO.md) | Recipes: add an endpoint, a permission, a column, a validator, an importer, a page | |
| [PR_CHECKLIST.md](PR_CHECKLIST.md) | What every pull request must show | |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Building images, secrets, DB bootstrap, migration and seed Jobs, rollout | |
| [reference/](reference/) | The original SRD and SRS blueprint (.docx) | |

Rule ids used in code comments: `R-*` in [../AGENTS.md](../AGENTS.md), `S-*` in SECURITY.md, `BR-*` in BUSINESS_RULES.md, `V-*` in VALIDATION_RULES.md, `Q-*` in OPEN_QUESTIONS.md.
