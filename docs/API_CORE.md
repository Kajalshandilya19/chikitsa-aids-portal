# pension-core-service API

Base path `/core/api/v1` (port 3202). Conventions: [API_CONVENTIONS.md](API_CONVENTIONS.md).

## 1. Phase 0 (built)

| Method | Path | Permission | Response `data` |
|---|---|---|---|
| GET | `/context` | logged in | `{ user_id, role, scope, district_id, center_id, center_code, permissions[] }`. Shows what core-service resolved for the caller; used to check the wiring. |
| GET | `/settings` | `MASTER_SETTINGS_VIEW` | `[{ key, value, is_default, placeholder, description, question, updated_at }]` |
| PUT | `/settings/:key` | `MASTER_SETTINGS_EDIT` (Super Admin) | Request `{ value }`, checked against the key's schema in [domain/settings.ts](../services/pension-core-service/src/domain/settings.ts). Unknown keys are 404. Audited. |

Settings keys:

| Key | Default (placeholder?) | Open question |
|---|---|---|
| `ppo.number_pattern` | `RJ/HIVP/{DIST}/{YYYY}/{SEQ:6}` (yes) | Q-05 |
| `ppo.sequence_scope` | `DISTRICT_YEAR` (yes) | Q-05 |
| `ppo.assignment_mode` | `SYSTEM` (yes) | Q-05 |
| `pension.monthly_amount` | `null` (yes) | Q-08 |
| `workflow.center_signoff_required` | `true` (no) | |
| `consent.text` | placeholder text, version `v0-placeholder` (yes) | Q-06 |
| `ppo.print_footer` | "DRAFT FORMAT ..." (yes) | Q-05 |

## 2. Planned endpoints (later phases)

**The normative contracts (request and response JSON, errors, logic) are in the phase guides: [phases/](phases/).** The table below is an index only.


**Every list and read below is scoped** with `applyScope` / `assertInScope` (R-SCOPE-1). An out-of-scope id returns 404.

| Phase | Method | Path | Permission |
|---|---|---|---|
| 1 | GET | `/beneficiaries` (q, center_id, district_id, art_status, has_application, page) | `BENEFICIARY_RECORD_VIEW` |
| 1 | GET | `/beneficiaries/:id` (masked) | `BENEFICIARY_RECORD_VIEW` |
| 1 | POST | `/beneficiaries/:id/unmask` (returns the full identifiers; audited every time) | `BENEFICIARY_PII_UNMASK` |
| 1 | POST | `/internal/beneficiaries/upsert-batch` | service token (data-service SOCH commit) |
| 1 | GET | `/dashboard/summary` | `DASHBOARD_*_VIEW` (counters at the caller's scope) |
| 2 | POST | `/applications` `{ beneficiary_id }` (creates a DRAFT; one active per beneficiary) | `APPLICATION_DRAFT_CREATE` |
| 2 | GET | `/applications`, `/applications/:id` | `APPLICATION_RECORD_VIEW` |
| 2 | PATCH | `/applications/:id` (only worker-editable fields, only in DRAFT or RETURNED) | `APPLICATION_DRAFT_EDIT` |
| 2 | POST | `/applications/:id/consent-document` (multipart, PDF or image) | `CONSENT_DOCUMENT_UPLOAD` |
| 2 | GET | `/applications/:id/consent-document` (signed link) | `CONSENT_DOCUMENT_VIEW` |
| 2 | POST | `/applications/:id/transitions` `{ action, reason? }` (see WORKFLOW.md for the action to permission map) | per action |
| 2 | GET | `/applications/:id/history` | `APPLICATION_HISTORY_VIEW` |
| 3 | GET | `/queues/verification`, `/queues/approval` | `VERIFICATION_QUEUE_VIEW`, `APPROVAL_QUEUE_VIEW` |
| 3 | PUT | `/applications/:id/review` (checklist) | `APPLICATION_WORKFLOW_RECOMMEND` |
| 4 | POST | `/applications/:id/ppo` (`SYSTEM` mode: generates; `MANUAL`: `{ ppo_number }`) | `PPO_RECORD_GENERATE` / `PPO_RECORD_MANUAL_ASSIGN` |
| 4 | GET | `/ppo/:id`, `/ppo/:id/print` (HTML), `/ppo/:id/pdf` | `PPO_RECORD_VIEW`, `PPO_DOCUMENT_PRINT` |
| 4 | POST | `/ppo/:id/correct` `{ field, value, reason }` | `PPO_RECORD_CORRECT` |
| 5 | GET/POST/PATCH | `/payments` | `PAYMENT_RECORD_*` |
| 5 | POST | `/internal/payments/upsert-batch` | service token |
