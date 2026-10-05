# Phase 4: PPO (Pension Payment Order)

**Goal:** an approved application gets a unique PPO number, system-generated from the `ppo.number_pattern` setting or entered by hand in MANUAL mode. The PPO sheet can be viewed, printed and downloaded as PDF. A generated PPO never changes, except through an audited correction by a Super Admin.

- **Acceptance:** `node scripts/acceptance/phase4.mjs` (needs Phases 1 to 3).
- **Read first:** [BUSINESS_RULES.md](../BUSINESS_RULES.md) BR-P1..P3, `src/domain/ppo-number.ts` (already built and tested), `lib/sequence-counter.ts`, [API_CORE.md](../API_CORE.md) §1 (the settings).

| Task | What | Service |
|---|---|---|
| T-4.1 | Migration `ppos`, `ppo_corrections`; flow row WF-11 | core |
| T-4.2 | Generate (system and manual), list, detail | core |
| T-4.3 | Sheet JSON, PDF, correction | core |
| T-4.4 | Web: PPO list, PPO page with print view, PDF download, generate button on the approved application | web |

## 1. Migration

```sql
CREATE TABLE pension_core.ppos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL UNIQUE REFERENCES pension_core.applications(id),
  beneficiary_id   uuid NOT NULL REFERENCES pension_core.beneficiaries(id),
  center_id        uuid NOT NULL,
  district_id      uuid NOT NULL,
  ppo_number       varchar(40) NOT NULL UNIQUE,          -- BR-P1, V-037
  mode             varchar(8) NOT NULL CHECK (mode IN ('SYSTEM','MANUAL')),
  pattern_used     varchar(60),
  seq              bigint,
  monthly_amount   numeric(10,2),
  payment_review   boolean NOT NULL DEFAULT false,       -- set when SOCH reports the beneficiary DIED
  generated_by     uuid NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ppos_center ON pension_core.ppos (center_id);
CREATE INDEX ppos_district ON pension_core.ppos (district_id);

CREATE TABLE pension_core.ppo_corrections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppo_id         uuid NOT NULL REFERENCES pension_core.ppos(id),
  field          varchar(32) NOT NULL CHECK (field IN ('ppo_number','monthly_amount')),
  old_value      text,     -- 🔒
  new_value      text,     -- 🔒
  reason         text NOT NULL,  -- 🔒
  actor_user_id  uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

Also go back to the Phase 1 SOCH upsert. When `art_status` becomes DIED for a beneficiary with a PPO, set `payment_review = true` (WORKFLOW.md §3).

## 2. Generate

### POST `/applications/:id/ppo`

- **Permission:** `PPO_RECORD_GENERATE` in SYSTEM mode; `PPO_RECORD_MANUAL_ASSIGN` in MANUAL mode.
- **Body:** `{}` in SYSTEM mode; `{ "ppo_number": "..." }` (V-037) in MANUAL mode. A number sent in SYSTEM mode is 422; a missing number in MANUAL mode is 422.
- **Status:** the application must be APPROVED (409 `E_TRANSITION` otherwise). This is flow row **WF-11** (`generate_ppo`).

In ONE transaction:

1. Lock the application row.
2. Read the settings: `ppo.assignment_mode`, `ppo.number_pattern`, `ppo.sequence_scope`, `pension.monthly_amount`.
3. SYSTEM mode:
   - `year` = the current year in IST; `lgd` = the district's LGD code (`authClient.districts()`).
   - `scope`/`period` by `sequence_scope`: DISTRICT_YEAR → (`lgd` 3-digit, `year`); STATE_YEAR → (`''`, `year`); STATE → (`''`, `''`).
   - `seq = await nextSequence(em, '"pension_core"."sequence_counters"', 'ppo', period, scope)`.
   - `ppo_number = formatPpoNumber(pattern, { districtLgdCode: lgd, centerCode, year, seq })`.
4. Insert the `ppos` row. A unique violation (pattern changed, manual clash) is 409 `E_PPO_CONFLICT`.
5. Application status → PPO_GENERATED, plus a history row (`generate_ppo`).
6. Audit `core.ppo.generated` with `data: { ppo_id, mode }`. The PPO number is not personal, but keep it out of `data` anyway.

Response 201: the PPO detail.

### Lists and detail

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/ppo` | `PPO_RECORD_VIEW` | Scoped. Query: `q` (an exact PPO number, case-insensitive, or a UID / name through the beneficiary), `district_id`, `center_id`, `payment_review`, `...pageQuery`. Row: `{ id, ppo_number, beneficiary: { id, soch_uid, patient_name }, center: { code }, district: { name_en }, monthly_amount, payment_review, generated_at }` |
| GET | `/ppo/:id` | `PPO_RECORD_VIEW` | The row + `application_id`, `mode`, `generated_by`, `corrections: [{ field, created_at, actor_user_id }]` (old and new values are NOT listed here) |

From this phase, the beneficiary list and search (Phase 1 §4) also match `q` against `ppo_number`, and rows show `ppo_number`.

## 3. Sheet, PDF, correction

### GET `/ppo/:id/sheet` (`PPO_DOCUMENT_PRINT`)

The data the web print view renders. Audit `core.ppo.printed` with `data: { format: 'html' }`.

```jsonc
{ "ppo_number": "RJ/HIVP/086/2026/000001", "generated_at": "ISO", "draft_format": true,
  "beneficiary": { "patient_name": "...", "guardian_name": "...", "soch_uid": "...", "art_number": "...", "category": "OBC",
                   "address": "<application address, else SOCH address>", "district_name": "Ajmer", "center": "RJ001, ART Centre ..." },
  "bank": { "bank_name": "...", "account_masked": "XXXXXXXX9012", "ifsc": "SBIN0001234" },
  "pension": { "monthly_amount": null },
  "footer": "<ppo.print_footer setting>" }
```

`draft_format` stays `true` while `ppo.number_pattern` or `ppo.print_footer` is still a placeholder (Q-05).

### GET `/ppo/:id/pdf` (`PPO_DOCUMENT_PRINT`)

- **Library:** pdfkit (already used by SETU; add it to core with an audit check).
- **Font:** Noto Sans Devanagari for Hindi. Put it in `services/pension-core-service/assets/fonts/` with its OFL licence file, and copy `assets/` in the Dockerfile.
- **Content:** the same fields as the sheet. A diagonal "DRAFT FORMAT" watermark while `draft_format`.
- **Headers:** `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="PPO-<ppo id>.pdf"`. The file name never contains the PPO number or a name (R-PII-6).
- **Audit:** `core.ppo.printed` with `data: { format: 'pdf' }`.

### POST `/ppo/:id/correct` (`PPO_RECORD_CORRECT`, Super Admin only)

- **Body:** `{ "field": "monthly_amount" | "ppo_number", "value": "...", "reason": "..." }` (V-015 reason). `value` uses V-033 or V-037.
- **Behaviour:** one transaction. Insert the correction (old and new values 🔒), update the PPO, audit `core.ppo.corrected`.
- **Errors:** a duplicate `ppo_number` is 409 `E_PPO_CONFLICT`.

## 4. Web

| Screen | Route | Gate | Content |
|---|---|---|---|
| Application (approved) | existing | `PPO_RECORD_GENERATE` | "Generate PPO" button (or an input for the number in MANUAL mode, from `/settings`) |
| PPO list | `/dashboard/ppo` | `PPO_RECORD_VIEW` | Server table; payment review badge |
| PPO page | `/dashboard/ppo/[id]` | `PPO_RECORD_VIEW` | Details; "Print" opens `/dashboard/ppo/[id]/print`; "Download PDF" uses `api.download`; corrections list; "Correct" dialog (`PPO_RECORD_CORRECT`) |
| Print view | `/dashboard/ppo/[id]/print` | `PPO_DOCUMENT_PRINT` | A4 layout from `/sheet`, `@media print` CSS, no app chrome, DRAFT FORMAT watermark while `draft_format` |

## 5. Done when

- `node scripts/acceptance/phase4.mjs`: 0 FAIL, 0 TODO; earlier phases still pass.
- A UT test generates 100 numbers concurrently against a real DB (or a mocked `nextSequence`) and gets 100 unique values.
