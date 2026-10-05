# Phase 2: Pension application (Center Worker and Center In-charge)

**Goal:** a Center Worker opens a beneficiary, starts the pension application, and fills the worker fields of [FIELD_DICTIONARY.md](../FIELD_DICTIONARY.md) §1. They capture consent (Yes/No, with an optional signed document), then submit. The Center In-charge signs it off or returns it. Every step leaves a history row and an audit row.

- **Acceptance:** `node scripts/acceptance/phase2.mjs` (needs Phase 1 done).
- **Read first:** [WORKFLOW.md](../WORKFLOW.md), [FIELD_DICTIONARY.md](../FIELD_DICTIONARY.md), [BUSINESS_RULES.md](../BUSINESS_RULES.md) BR-10..16.

| Task | What | Service |
|---|---|---|
| T-2.1 | Migrations and entities: `applications`, `application_status_history`, `documents` | core |
| T-2.2 | `domain/application-flow.ts` (transition table, pure) + UT-WF-* | core |
| T-2.3 | Application endpoints: create, list, detail, edit form, patch, transitions, history | core |
| T-2.4 | Consent document: upload, signed link, `/files` | core |
| T-2.5 | Beneficiary list and detail show the application; dashboard counts | core |
| T-2.6 | Web screens | web |

## 1. T-2.1 Migrations (core)

`node scripts/new-migration.mjs core applications`

```sql
CREATE TABLE pension_core.applications (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id                uuid NOT NULL REFERENCES pension_core.beneficiaries(id),
  center_id                     uuid NOT NULL,
  district_id                   uuid NOT NULL,
  status                        varchar(24) NOT NULL DEFAULT 'DRAFT'
                                CHECK (status IN ('DRAFT','PENDING_SIGNOFF','SUBMITTED','UNDER_VERIFICATION','RECOMMENDED','RETURNED','APPROVED','PPO_GENERATED','REJECTED')),
  version                       integer NOT NULL DEFAULT 1,
  center_changed                boolean NOT NULL DEFAULT false,
  guardian_name                 text,          -- 🔒
  category                      varchar(16),
  address                       text,          -- 🔒 (only when the worker corrects SOCH)
  contact_number                text,          -- 🔒
  contact_last4                 varchar(4),
  jan_aadhaar                   text,          -- 🔒
  jan_aadhaar_lookup            varchar(64),
  jan_aadhaar_last4             varchar(4),
  jan_aadhaar_member_id         text,          -- 🔒
  aadhaar_for_bank              text,          -- 🔒
  aadhaar_for_bank_lookup       varchar(64),
  aadhaar_for_bank_last4        varchar(4),
  bank_name                     varchar(100),
  bank_account_number           text,          -- 🔒
  bank_account_last4            varchar(4),
  ifsc                          varchar(11),
  consent                       varchar(3) CHECK (consent IN ('YES','NO')),
  consent_text_version          varchar(32),
  consent_language              varchar(2) CHECK (consent_language IN ('en','hi')),
  consent_captured_by           uuid,
  consent_captured_at           timestamptz,
  consent_document_id           uuid,
  remarks                       text,          -- 🔒
  created_by                    uuid NOT NULL,
  submitted_by                  uuid,
  submitted_at                  timestamptz,
  signed_off_by                 uuid,
  signed_off_at                 timestamptz,
  verifier_id                   uuid,          -- Phase 3
  picked_at                     timestamptz,
  recommended_by                uuid,
  recommendation                varchar(8) CHECK (recommendation IN ('APPROVE','REJECT')),
  recommended_at                timestamptz,
  decided_by                    uuid,
  decided_at                    timestamptz,
  decision_reason               text,          -- 🔒
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX applications_one_active ON pension_core.applications (beneficiary_id) WHERE status <> 'REJECTED';   -- BR-10
CREATE INDEX applications_center_status ON pension_core.applications (center_id, status);
CREATE INDEX applications_district_status ON pension_core.applications (district_id, status);
CREATE INDEX applications_status_updated ON pension_core.applications (status, updated_at DESC);
CREATE INDEX applications_jan_aadhaar ON pension_core.applications (jan_aadhaar_lookup);

CREATE TABLE pension_core.application_status_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES pension_core.applications(id),
  from_status      varchar(24),
  to_status        varchar(24) NOT NULL,
  action           varchar(32) NOT NULL,
  actor_user_id    uuid NOT NULL,
  actor_role       varchar(64) NOT NULL,
  reason           text,                       -- 🔒
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_history_app ON pension_core.application_status_history (application_id, created_at);

CREATE TABLE pension_core.documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES pension_core.applications(id),
  kind            varchar(16) NOT NULL CHECK (kind IN ('CONSENT')),
  object_key      varchar(200) NOT NULL,
  content_type    varchar(64) NOT NULL,
  size            integer NOT NULL,
  sha256          varchar(64) NOT NULL,
  original_name   text NOT NULL,               -- 🔒
  uploaded_by     uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

- `application_status_history` is append-only. Never UPDATE or DELETE it, and add a trigger like the audit one if you want the DB to enforce it.
- Add any new 🔒 key names to `DEFAULT_REDACT_KEYS`: `guardian_name`, `jan_aadhaar_member_id`, `decision_reason` and `original_name` already exist; add `bank_account_number` if missing.

## 2. T-2.2 The flow table (`src/domain/application-flow.ts`)

A pure module with no TypeORM or Express. The routes, the service and `allowed_actions` all read it.

```ts
export type Status = 'DRAFT' | 'PENDING_SIGNOFF' | 'SUBMITTED' | 'UNDER_VERIFICATION' | 'RECOMMENDED' | 'RETURNED' | 'APPROVED' | 'PPO_GENERATED' | 'REJECTED';
export type Action = 'submit' | 'signoff' | 'return_to_worker' | 'pick' | 'return' | 'recommend' | 'approve' | 'reject';
export interface Transition { id: string; from: Status[]; action: Action; to: Status | ((ctx: FlowContext) => Status); permission: PermissionCode; reasonRequired: boolean | ((input) => boolean); guard?: (app, actor, input) => FlowError | null; }
export const FLOW: readonly Transition[] = [ /* WF-01 .. WF-10 exactly as WORKFLOW.md §2 */ ];
export const decide = (app, actor, action, input, settings): { to: Status } | FlowError;  // never throws
export const allowedActions = (app, actor, perms, settings): Action[];
```

| FlowError code | HTTP | When |
|---|---|---|
| `E_TRANSITION` | 409 | The action is not allowed from the current status |
| `E_PERMISSION` | 403 | The role lacks the transition's permission |
| `E_REASON_REQUIRED` | 422 | V-015 |
| `E_INCOMPLETE` | 422 | `details.missing: string[]` (the required field names) |
| `E_CONSENT_REQUIRED` | 422 | Consent is not YES (BR-11) |
| `E_MAKER_CHECKER` | 403 | R-MC-1 |

Fields required to submit: `guardian_name`, `category`, `jan_aadhaar`, `aadhaar_for_bank`, `bank_name`, `bank_account_number`, `ifsc`, `consent`.

Tests UT-WF-001.. must cover:

- every row of WORKFLOW.md §2: allowed, wrong status, missing permission;
- reason required;
- every missing submit field;
- consent NO;
- sign-off by the submitter refused (maker-checker);
- `submit` going straight to SUBMITTED when `workflow.center_signoff_required = false`.

## 3. T-2.3 Endpoints (core)

All are scoped through the application's `center_id` / `district_id`. Out of scope is 404.

### POST `/applications` (`APPLICATION_DRAFT_CREATE`)

- Body `{ "beneficiary_id": "uuid" }`. The beneficiary must be in the caller's scope (404 otherwise).
- Response 201: the detail (below), status DRAFT.
- `center_id` and `district_id` are copied from the beneficiary.

| Error | Status | When |
|---|---|---|
| `E_ACTIVE_APPLICATION_EXISTS` | 409 | Catch the unique index violation (code 23505 on `applications_one_active`) |
| `E_BENEFICIARY_DECEASED` | 409 | ART status DIED (BR-16) |
| `E_PREVIOUSLY_REJECTED` | 409 | The beneficiary's latest application is REJECTED (BR-17, open question Q-18) |

The first history row is from `null`, to DRAFT, action `create`. Audit `core.application.created`.

### GET `/applications` (`APPLICATION_RECORD_VIEW`)

Query:

- `status` (enum), `center_id`, `district_id`, `center_changed` (boolQuery)
- `q`: UID, ART No or name through the beneficiary's lookups and name tokens (join on `beneficiaries`)
- `sort=updated_at|submitted_at`, `dir`, `...pageQuery`

Row:

```jsonc
{ "id": "uuid", "status": "DRAFT", "center_changed": false,
  "beneficiary": { "id": "uuid", "soch_uid": "...", "patient_name": "..." },
  "center": { "id": "uuid", "code": "RJ001" }, "district": { "id": "uuid", "name_en": "Ajmer" },
  "submitted_at": null, "updated_at": "ISO" }
```

### GET `/applications/:id` (`APPLICATION_RECORD_VIEW`)

```jsonc
{ "id": "uuid", "status": "DRAFT", "version": 3, "center_changed": false,
  "beneficiary": { /* the Phase 1 beneficiary detail, masked */ },
  "form": { "guardian_name": "...", "category": "OBC", "address": null, "contact_masked": null,
            "jan_aadhaar_masked": "XXXXXX7890", "jan_aadhaar_member_id_masked": null, "aadhaar_for_bank_masked": "XXXX XXXX 2346",
            "bank_name": "State Bank of India", "bank_account_masked": "XXXXXXXX9012", "ifsc": "SBIN0001234",
            "consent": "YES", "consent_text_version": "v0-placeholder", "consent_language": "hi", "consent_captured_at": "ISO", "remarks": null },
  "consent_document": { "id": "uuid", "content_type": "application/pdf", "size": 12345, "uploaded_at": "ISO" } | null,
  "stamps": { "created_by": "uuid", "created_at": "ISO", "submitted_by": null, "submitted_at": null, "signed_off_by": null, "signed_off_at": null },
  "allowed_actions": ["submit"] }
```

`allowed_actions` = `allowedActions(app, caller)`. The UI shows buttons only for these; the service still decides.

### GET `/applications/:id/edit` (`APPLICATION_DRAFT_EDIT`)

- Only in DRAFT or RETURNED; 409 `E_NOT_EDITABLE` otherwise.
- Returns `{ "version": 3, "form": { ...the same keys with UNMASKED values, e.g. "jan_aadhaar": "1234567890" } }` so the worker can correct what they typed.
- Audit `core.application.edit_opened` (add it to `AUDIT`).

### PATCH `/applications/:id` (`APPLICATION_DRAFT_EDIT`)

Body (`.strict()`, every field optional except `version`):

| Field | Rule |
|---|---|
| `version` | `z.number().int().min(1)` |
| `guardian_name` | `optional(personName)` |
| `category` | `optional(category)` |
| `address` | `optional(address)` |
| `contact_number` | `optional(mobile)` |
| `jan_aadhaar` | `optional(janAadhaarFamilyId)` |
| `jan_aadhaar_member_id` | `optional(janAadhaarMemberId)` |
| `aadhaar_for_bank` | `optional(aadhaar)` |
| `bank_name` | `optional(bankName)` |
| `bank_account_number` | `optional(bankAccountNumber)` |
| `ifsc` | `optional(ifsc)` |
| `consent` | `optional(consent)` |
| `consent_language` | `optional(z.enum(['en','hi']))` |
| `remarks` | `remarks` |

- `optional(x)` means `null` clears the field.
- SOCH fields (UID, name, age, ...) are NOT in the DTO, so sending one is 422 (R-VAL-3, BR-12).

Behaviour:

- Only in DRAFT or RETURNED (409 `E_NOT_EDITABLE`).
- `version` must equal the stored one, else 409 `E_STALE`. Increment it on save: `UPDATE ... WHERE id = $1 AND version = $2`.
- Fill every `_lookup` and `_last4` field.
- When `consent` changes:
  - `consent_text_version` = the current `consent.text` setting version;
  - `consent_captured_by` = the caller, `consent_captured_at` = now.
- Audit `core.application.updated` with `data.fields` = the changed field NAMES.

Response: the detail.

### POST `/applications/:id/transitions`

- Body `{ "action": "...", "version": 3, "reason": "..." (V-015, when required) }`. Phase 3 adds `recommendation`.
- The permission is the transition's own, checked by `decide()`. The route does `authorize(<all workflow permissions>)` as a coarse gate.

In ONE transaction (WORKFLOW.md §2, last paragraph):

1. Lock the row (`SELECT ... FOR UPDATE`).
2. `decide()`.
3. Update the status and stamps with `WHERE version = $v`.
4. Insert a history row.
5. Audit `core.application.transition` with `data: { from, to, action }`.

Response: the detail.

### GET `/applications/:id/history` (`APPLICATION_HISTORY_VIEW`)

`[{ "id", "from_status", "to_status", "action", "actor_user_id", "actor_role", "reason", "created_at" }]`, oldest first.

## 4. T-2.4 Consent document

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/applications/:id/consent-document` | `CONSENT_DOCUMENT_UPLOAD` | Only in DRAFT or RETURNED. multipart `file` ≤ 5 MB, then `guardUploads(['application/pdf','image/jpeg','image/png'])` from lib/upload-guard (PDFs with JavaScript refused). Store with `objectStore().put(objectKey('consent', id, ext), ...)`, never using the uploaded name. Replaces the previous document; delete the old object. Response `{ id, content_type, size, uploaded_at }`. Audit `core.document.uploaded`. |
| GET | `/applications/:id/consent-document` | `CONSENT_DOCUMENT_VIEW` | `{ "url": signFileUrl({ backend: '/core/api/v1/files', browser: '/api/gateway/core/files' }, { objectKey, contentType, download: false }), "expires_in": 900 }`. Audit `core.document.viewed`. |
| GET | `/files` | the signature (no login) | `verifyFileSignature(req.query)`, then stream with `fileDelivery()` headers. Rate limit per IP. |

Call `objectStore().ensureBucket()` once at boot of core-service (in `index.ts`, after the DB connects).

## 5. T-2.5 Beneficiary and dashboard

- `GET /beneficiaries` rows: `application: { id, status } | null` = the active application. `has_application=true|false` now filters.
- Beneficiary detail: `applications: [{ id, status, created_at }]`, all of them, newest first.
- `GET /dashboard/summary`: `applications.total` and `applications.by_status` (scoped).

## 6. T-2.6 Web

| Screen | Route | Gate | Content |
|---|---|---|---|
| Beneficiary detail | existing | | "Start Pension Application" button (`APPLICATION_DRAFT_CREATE`, only when there is no active application) |
| Applications | `/dashboard/applications` | `APPLICATION_RECORD_VIEW` | Status tabs (Drafts, Returned, Pending Sign-off, Submitted, All); server table |
| Application | `/dashboard/applications/[id]` | same | Header: status badge, UID, name, Center. Left: read-only SOCH card. Right: the form in sections (Identity, Bank, Consent, Remarks). Edit mode loads `/edit`. Action bar from `allowed_actions`; Return needs a reason dialog (V-015). History timeline. |
| Consent section | | | Shows the current consent text (`consent.text` setting, in the chosen language) and its version; Yes / No radio; optional upload (PDF, JPG, PNG, at most 5 MB); "View" opens the signed link |
| In-charge queue | `/dashboard/applications?status=PENDING_SIGNOFF` | `APPLICATION_WORKFLOW_SIGNOFF` | Sign Off and Return buttons |

- **Save draft:** keep the form in react-hook-form state and PATCH on "Save Draft" and before "Submit". On 409 `E_STALE`, tell the user someone else changed the application and reload it.
- **Missing fields:** `E_INCOMPLETE` lists the missing fields. Focus the first one and mark them all.
- **Validators:** `personName`, `category`, `janAadhaarFamilyId`, `aadhaar`, `bankName`, `bankAccountNumber`, `ifsc`, `consent`, `remarks`, `reason`, from `@/lib/shared/validators`.

## 7. Done when

- `node scripts/acceptance/phase2.mjs` reports 0 FAIL and 0 TODO; Phase 1 acceptance still passes.
- UT-WF covers every row and refusal.
- Docs updated: API_CORE, DATA_MODEL, AUDIT_EVENTS, TEST_PLAN, BUSINESS_RULES statuses.
