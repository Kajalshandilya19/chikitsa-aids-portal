# Phase 5: Payments, dashboards, reports, search, exports

**Goal:**

- Payment history per PPO, entered by hand or imported from Excel.
- The full SRD §21 dashboards.
- Filtered reports and the Admin global search (SRD §16-17).
- Excel and CSV exports that respect the filters, are masked unless the sensitive permission is held, are audited, and are never available to workers.

- **Acceptance:** `node scripts/acceptance/phase5.mjs` (needs Phases 1 to 4).
- **Read first:** SRD §15-18 and §21 in [PRODUCT_SPEC.md](../PRODUCT_SPEC.md), [SECURITY.md](../SECURITY.md) S-PII-5 and S-FILE-5, [IMPORT_PIPELINE.md](../IMPORT_PIPELINE.md) §5.

| Task | What | Service |
|---|---|---|
| T-5.1 | Migration `payments`; payment endpoints | core |
| T-5.2 | `payments` importer + core internal match/upsert | data, core |
| T-5.3 | Dashboard v2 | core |
| T-5.4 | Reports and global search | core |
| T-5.5 | Exports | data (+ core internal rows) |
| T-5.6 | Web: payments, dashboards, reports, search, export buttons | web |

## 1. T-5.1 Payments (core)

```sql
CREATE TABLE pension_core.payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppo_id           uuid NOT NULL REFERENCES pension_core.ppos(id),
  center_id        uuid NOT NULL,
  district_id      uuid NOT NULL,
  period           char(7) NOT NULL,                  -- V-034 YYYY-MM
  payment_date     date,
  amount           numeric(10,2) NOT NULL CHECK (amount > 0),
  status           varchar(10) NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','REVERSED')),
  remarks          text,                              -- 🔒
  source           varchar(8) NOT NULL CHECK (source IN ('MANUAL','IMPORT')),
  import_batch_id  uuid,
  created_by       uuid NOT NULL,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_one_per_period ON pension_core.payments (ppo_id, period) WHERE status <> 'REVERSED';
CREATE INDEX payments_center ON pension_core.payments (center_id, period);
```

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/payments` | `PAYMENT_RECORD_VIEW` | Scoped. Query `ppo_id`, `period`, `status`, `...pageQuery`. Row `{ id, ppo: { id, ppo_number }, period, payment_date, amount, status, remarks, source }` |
| POST | `/payments` | `PAYMENT_RECORD_CREATE` | `{ ppo_id, period (V-034), payment_date? (V-016), amount (V-033), status, remarks? (V-014) }`. A PPO with `payment_review = true` is 409 `E_PAYMENT_REVIEW` (beneficiary reported DIED). A second non-reversed payment for the same period is 409 `E_DUPLICATE_PAYMENT`. Audit `core.payment.recorded`. |
| PATCH | `/payments/:id` | `PAYMENT_RECORD_EDIT` | `{ status?, payment_date?, amount?, remarks? }`. A REVERSED payment cannot change (409 `E_NOT_EDITABLE`). Audit with the changed field names. |

The PPO detail gains `payments: { last_period, last_status, total_paid }`.

## 2. T-5.2 Payment import

Data-service importer `payments`, built like SOCH (IMPORT_PIPELINE.md §5):

| Header | Field | Rule |
|---|---|---|
| PPO Number * | `ppo_number` | V-037 |
| Payment Period * | `period` | V-034 |
| Payment Date | `payment_date` | V-016 (`sochDate` first) |
| Amount * | `amount` | V-033 |
| Status * | `status` | `PENDING`, `PAID`, `FAILED`, `REVERSED` |
| Remarks | `remarks` | V-014 |

- `keyField`: `ppo_number + period`. Add a `key(row)` option to the Importer type when one field is not enough.
- **Core internal routes:**
  - `POST /internal/payments/match`: `{ rows: [{ row_number, ppo_number, period, amount, status }] }` returns `[{ row_number, match: 'NEW' | 'UPDATE' | 'UNCHANGED' | 'UNKNOWN_PPO' | 'PAYMENT_REVIEW' }]`. `UNKNOWN_PPO` and `PAYMENT_REVIEW` become row errors.
  - `POST /internal/payments/upsert-batch`: `{ batch_id, actor_user_id, rows }`, with `source = 'IMPORT'`.
- **Permissions:** `PAYMENT_FILE_IMPORT` for upload and commit.

## 3. T-5.3 Dashboard v2 (`GET /dashboard/summary`, extends Phase 1)

```jsonc
{ "scope": "STATE",
  "beneficiaries": { "total": 500, "by_art_status": {...}, "by_sex": {...} },
  "applications": { "total": 42, "by_status": {...}, "pending_verification": 7, "by_category": { "OBC": 10 } },
  "ppo_generated": 12,
  "payments": { "active": 10, "inactive": 2 },          // active = a PAID payment in one of the last 3 periods
  "by_district": [ { "district_id": "uuid", "name_en": "Ajmer", "beneficiaries": 40, "applications": 5, "ppo": 2 } ],   // STATE only, else null
  "by_center": [ { "center_id": "uuid", "code": "RJ001", "beneficiaries": 12, "applications": 3, "ppo": 1 } ],          // STATE and DISTRICT, else null
  "open_review_items": 0 }
```

Every count respects scope. Use one SQL query per block with `GROUP BY`, never one query per district.

## 4. T-5.4 Reports and search (core)

### GET `/reports/:report` (`REPORT_RECORD_VIEW`)

`report` is one of `beneficiaries`, `applications`, `ppo`, `payments`, `center_performance`.

- **Query (`.strict()`):** `district_id`, `center_id`, `sex`, `category`, `art_status`, `status` (application), `ppo` (`generated` | `none`), `period_from`, `period_to` (V-034), `...pageQuery`. Each report accepts only the filters that make sense for it; anything else is 422.
- **Rows:** masked (the same shapes as the lists).
- **`center_performance`** rows: `{ center: { id, code, name_en }, district, beneficiaries, applications, submitted, approved, rejected, ppo, avg_days_to_ppo }`.
- **Scope:** always applied.

### GET `/search?q=` (any of `BENEFICIARY_RECORD_VIEW`, `APPLICATION_RECORD_VIEW`)

Response: `{ beneficiaries: [...≤10], applications: [...≤10], ppo: [...≤10] }`, scoped.

`q` is matched against:

- the UID, ART No, Pre-ART No, PID and Beneficiary ID lookups;
- the PPO number;
- `applications.jan_aadhaar_lookup`, when `q` is 10 digits;
- `aadhaar_lookup` / `aadhaar_for_bank_lookup`, when `q` passes V-007;
- name tokens.

Audit `core.search.performed` with `data: { kinds_matched }`, never the query text.

## 5. T-5.5 Exports

### POST `/data/api/v1/exports`

- **Permission:** `REPORT_FILE_EXPORT`. When `sensitive` is true, also `REPORT_FILE_EXPORT_SENSITIVE` (403 otherwise). Workers hold neither (UT-RBAC-006).
- **Body (`.strict()`):** `{ report, format: 'xlsx' | 'csv', filters: { ...same as /reports }, sensitive: false }`.
- **Rows:** data-service calls core `POST /internal/reports/:report/rows` with `{ scope: { scope, district_id, center_id }, filters, sensitive, page, limit: 1000 }` and pages until done.
  - The scope comes from the caller's VERIFIED token in data-service. Core trusts it because the call carries a service token (R-API-6). Core applies it exactly like `applyScope`.
- **Size limit:** at most 100,000 rows. Beyond that, 422 `E_EXPORT_TOO_LARGE` ("narrow the filters").
- **File content:**
  - header row = the column labels, then the rows;
  - every cell passes the formula guard (a leading `= + - @ \t \r` gets a `'` prefix);
  - masked values unless `sensitive`.
- **Response:** the file is streamed directly.
  - `Content-Disposition: attachment; filename="<report>-<YYYYMMDD>.<ext>"`. Never a person's name.
  - Content-Type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` or `text/csv; charset=utf-8` with a BOM, so Excel opens it as UTF-8.
- **Audit:** `data.export.created` with `data: { report, format, sensitive, rows, filters }`. `filters` holds ids and enum values only.
- **Rate limit:** 5 per minute per user.

## 6. T-5.6 Web

| Screen | Route | Gate |
|---|---|---|
| Payments | `/dashboard/payments` | `PAYMENT_RECORD_VIEW`: list; Record Payment dialog (`PAYMENT_RECORD_CREATE`); Import (`PAYMENT_FILE_IMPORT`, BulkUploadSheet with `/imports/columns/payments`) |
| PPO page | existing | Payments tab |
| Dashboard | `/dashboard` | KPI row + district table (STATE) + Center table (STATE / DISTRICT). Charts are optional; if added, follow the `dataviz` guidance and keep them accessible. |
| Reports | `/dashboard/reports` | `REPORT_RECORD_VIEW`: report picker, filters, server table; Export menu (`REPORT_FILE_EXPORT`); a "Include full identifiers" checkbox shown only with `REPORT_FILE_EXPORT_SENSITIVE`, with a warning text |
| Global search | header search box | Results grouped by kind; Enter opens the first result |

## 7. Done when

- `node scripts/acceptance/phase5.mjs`: 0 FAIL, 0 TODO; earlier phases still pass.
- Every dashboard number is checked against SQL at State, District and Center scope (UT or smoke).
