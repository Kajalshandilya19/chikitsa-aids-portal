# Phase 1: SOCH import and beneficiaries

**Goal:** the State Admin uploads the SOCH Excel. Beneficiaries are created or updated and mapped to Centers. Conflicts go to a review list. Every role can then list and open the beneficiaries of its own scope, with identifiers masked. The dashboard shows real beneficiary counts.

**This document is the contract.** Where it and another doc disagree, ask the reviewer; do not pick one silently.

- **Acceptance:** `node scripts/acceptance/phase1.mjs` passes with 0 FAIL and 0 TODO.
- **Read first:** [SOCH_IMPORT_SPEC.md](../SOCH_IMPORT_SPEC.md), [IMPORT_PIPELINE.md](../IMPORT_PIPELINE.md), [HOWTO.md](../HOWTO.md) A and C, [DATA_MODEL.md](../DATA_MODEL.md) §2.

## 0. Task order

Do the tasks in this order. Each one is a separate PR (branch `phase1/<task>`).

| Task | What | Service |
|---|---|---|
| T-1.1 | Migrations and entities: `beneficiaries`, `import_review_items` | core |
| T-1.2 | Internal match and upsert endpoints | core |
| T-1.3 | Data migration: row action `REVIEW`, `review_count`; columns endpoint | data |
| T-1.4 | SOCH importer | data |
| T-1.5 | Beneficiary list, detail and unmask endpoints | core |
| T-1.6 | Import review list and resolve endpoints | core |
| T-1.7 | Dashboard summary endpoint | core |
| T-1.8 | Web: SOCH import, Beneficiaries, Beneficiary detail, Import Review, dashboard cards | web |

## 1. T-1.1 Migrations and entities (core)

Create the file with `node scripts/new-migration.mjs core beneficiaries`. It writes `src/migration/1802xxxxxxxxx-beneficiaries.ts` from the template.

```sql
CREATE TABLE pension_core.beneficiaries (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id                   uuid NOT NULL,           -- pension_auth.centers.id (no FK across schemas, R-DB-1)
  district_id                 uuid NOT NULL,
  soch_beneficiary_id         text NOT NULL,           -- 🔒
  soch_beneficiary_id_lookup  varchar(64) NOT NULL UNIQUE,
  soch_uid                    text NOT NULL,           -- 🔒
  soch_uid_lookup             varchar(64) NOT NULL UNIQUE,
  pid_number                  text,                    -- 🔒
  pid_lookup                  varchar(64) UNIQUE,
  art_number                  text,                    -- 🔒
  art_number_lookup           varchar(64),             -- NOT unique: reissued on transfer
  pre_art_number              text,                    -- 🔒
  pre_art_number_lookup       varchar(64),
  patient_name                text NOT NULL,           -- 🔒
  name_tokens                 text[] NOT NULL DEFAULT '{}',
  address                     text,                    -- 🔒
  tehsil                      varchar(150),
  contact_number              text,                    -- 🔒
  contact_last4               varchar(4),
  aadhaar                     text,                    -- 🔒
  aadhaar_lookup              varchar(64),
  aadhaar_last4               varchar(4),
  abha_number                 text,                    -- 🔒
  abha_lookup                 varchar(64),
  age                         smallint CHECK (age BETWEEN 0 AND 120),
  sex                         varchar(16) NOT NULL CHECK (sex IN ('MALE','FEMALE','TRANSGENDER')),
  art_status                  varchar(24),
  art_registration_date       date,
  last_visit_date             date,
  facility_name               varchar(150),
  facility_code               varchar(32) NOT NULL,
  soch_fingerprint            varchar(64) NOT NULL,    -- HMAC of the normalised SOCH fields (see §3)
  soch_last_batch_id          uuid,
  soch_updated_at             timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beneficiaries_center_idx   ON pension_core.beneficiaries (center_id);
CREATE INDEX beneficiaries_district_idx ON pension_core.beneficiaries (district_id);
CREATE INDEX beneficiaries_art_idx      ON pension_core.beneficiaries (art_number_lookup);
CREATE INDEX beneficiaries_preart_idx   ON pension_core.beneficiaries (pre_art_number_lookup);
CREATE INDEX beneficiaries_aadhaar_idx  ON pension_core.beneficiaries (aadhaar_lookup);
CREATE INDEX beneficiaries_names_gin    ON pension_core.beneficiaries USING gin (name_tokens);

CREATE TABLE pension_core.import_review_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL,                       -- pension_data.import_batches.id
  row_number      integer NOT NULL,
  kind            varchar(16) NOT NULL CHECK (kind IN ('UID_MERGE','KEY_CONFLICT')),
  beneficiary_id  uuid REFERENCES pension_core.beneficiaries(id),   -- the existing record the row resembles
  center_id       uuid NOT NULL,                       -- of the incoming row, for scoping the list
  district_id     uuid NOT NULL,
  payload         text NOT NULL,                       -- 🔒 the incoming normalised row (JSON)
  status          varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
  resolution      varchar(16) CHECK (resolution IN ('LINK','CREATE_NEW','IGNORE')),
  resolved_by     uuid,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_review_open_idx ON pension_core.import_review_items (status, created_at DESC);
```

Entities: `src/entities/beneficiary.entity.ts` and `import-review-item.entity.ts`.

- Every 🔒 column gets `transformer: piiTransformer` (R-PII-1).
- Add the new key names to `DEFAULT_REDACT_KEYS` if any are missing. All of them are already there except `name_tokens`, which needs no redaction, and `payload`, which must be added.
- Then run `scripts/sync-lib.sh`.

**Check:** after `scripts/dev.sh migrate`, `\d pension_core.beneficiaries` matches the SQL above. `npm run migration:revert` and `migration:run` both work.

## 2. T-1.2 Internal endpoints (core)

Both are mounted in `src/routes/internal/` and take the service token only. DTOs are `.strict()` and built from validators.

### POST `/internal/beneficiaries/match`

Data-service calls this during upload (classify), with at most 1000 rows per call.

Request:

```jsonc
{ "rows": [ { "row_number": 1, "soch_uid": "RJUID0000001", "pid_number": "PID000...", "soch_beneficiary_id": "B0000001",
              "center_id": "uuid", "fingerprint": "hex64" } ] }
```

Response `data`, in the same order:

```jsonc
[ { "row_number": 1, "match": "NEW" | "UPDATE" | "UNCHANGED" | "UID_MERGE" | "KEY_CONFLICT",
    "beneficiary_id": "uuid" | null, "center_changed": false } ]
```

Algorithm. Implement it as a pure function in `src/domain/soch-match.ts`, fed by one repository query that loads every candidate by lookup in one round trip:

1. Compute `uidL = blindIndex(soch_uid)`, `pidL = pid ? blindIndex(pid) : null`, `bidL = blindIndex(soch_beneficiary_id)`.
2. `byUid` = the beneficiary with `soch_uid_lookup = uidL`.
3. `byPid` = the one with `pid_lookup = pidL` (if `pidL`). `byBid` = the one with `soch_beneficiary_id_lookup = bidL`.
4. Take the distinct non-null set of `{ byUid, byPid, byBid }`.
   - If it has more than 1 member: `KEY_CONFLICT`, with `beneficiary_id` = byUid ?? byPid ?? byBid.
   - If `byUid` exists: `UNCHANGED` if `fingerprint` equals the stored one AND `center_id` is the same, else `UPDATE`. `center_changed` = the centers differ.
   - Else if `byPid` or `byBid` exists: `UID_MERGE`, with `beneficiary_id` = that record. The UID changed, so a person must decide.
   - Else: `NEW`.

### POST `/internal/beneficiaries/upsert-batch`

Data-service calls this on commit, with at most 500 rows.

Request:

```jsonc
{ "batch_id": "uuid", "actor_user_id": "uuid",
  "rows": [ { "row_number": 1, "center_id": "uuid", "district_id": "uuid", "fingerprint": "hex64",
              "soch_beneficiary_id": "...", "soch_uid": "...", "art_registration_date": "2015-06-30" | null,
              "pre_art_number": null, "art_number": "...", "pid_number": "...", "patient_name": "...",
              "address": "...", "tehsil": "...", "contact_number": null, "aadhaar": null, "age": 45,
              "sex": "FEMALE", "art_status": "ON_ART", "last_visit_date": "2025-08-14",
              "facility_name": "...", "facility_code": "RJ001", "abha_number": null } ] }
```

Response `data`: `{ "created": 0, "updated": 0, "unchanged": 0, "review_items": 0, "center_moves": 0 }`.

Rules. Do everything in ONE transaction per call, with one audit row `core.beneficiary.imported` (add it to `AUDIT` in lib/audit.ts) carrying the counts.

1. Re-run the match for the rows **inside the transaction**. The data may have changed since upload.
2. **NEW:** insert, filling every `_lookup`, `_last4` and `name_tokens` field.
3. **UPDATE:** overwrite the SOCH columns ONLY, the ones in the request (BR-I3), and set `soch_fingerprint`, `soch_last_batch_id` and `soch_updated_at`.
   - When `center_changed`, also update `center_id` and `district_id`, and count a center move. From Phase 2, also move the open application and flag it (WORKFLOW.md §3); leave a `// Phase 2:` comment there now.
4. **UNCHANGED:** set `soch_last_batch_id` only.
5. **UID_MERGE / KEY_CONFLICT:** insert an `import_review_items` row (status OPEN, payload = the row JSON). Nothing else changes.
6. **Cross-check `center_id`** with `authClient.centers()`. It must exist, be active, and have `district_id` = the sent district. Anything else is a 400 for the whole call: data-service validated it, so a mismatch is a bug.

## 3. T-1.3 / T-1.4 SOCH importer (data)

### Migration (data)

Create it with `node scripts/new-migration.mjs data review-action`:

```sql
ALTER TABLE pension_data.import_rows DROP CONSTRAINT import_rows_action_check;
ALTER TABLE pension_data.import_rows ADD CONSTRAINT import_rows_action_check CHECK (action IN ('CREATE','UPDATE','UNCHANGED','REVIEW'));
ALTER TABLE pension_data.import_batches ADD COLUMN review_count integer NOT NULL DEFAULT 0;
```

Before writing it, check the real constraint name with `\d pension_data.import_rows`.

Then update:

- `RowAction`;
- `batchView` (`review_count`);
- the counting in `import.service.ts`. `REVIEW` rows are VALID rows, and they are sent to commit.

### Columns endpoint (data)

`GET /imports/columns/:kind` → `data: [{ header, field, required, hint }]`.

- Same guard as the template endpoint.
- The web BulkUploadSheet reads its column config from here, so the SOCH column list exists in ONE place.

### `src/imports/importers/soch.importer.ts`

- `columns`: `SOCH_COLUMNS`.
- `rowSchema`: `.strict()`, one entry per SOCH column:

| Field | Schema |
|---|---|
| `soch_beneficiary_id` | `sochBeneficiaryId` |
| `soch_uid` | `sochUid` |
| `art_registration_date`, `last_visit_date` | `optional(z.preprocess(sochDate-if-string, pastDate))` |
| `pre_art_number` | `optional(preArtNumber)` |
| `art_number` | `optional(artNumber)` |
| `pid_number` | `optional(pidNumber)` |
| `patient_name` | `personName` |
| `address` | `optional(address)` |
| `tehsil` | `optional(englishLabel)` |
| `district_name`, `state_name`, `facility_name` | `optional(englishLabel)` (informational) |
| `contact_number` | `optional(mobile)` |
| `aadhaar` | `optional(aadhaar)` |
| `age` | `optional(age)` |
| `sex` | `z.preprocess(v => sochSex(String(v)) ?? v, sex)` |
| `art_status` | `optional(z.preprocess(v => sochArtStatus(String(v)) ?? v, artStatus))` |
| `facility_code` | `sochBeneficiaryId` |
| `abha_number` | `optional(abhaNumber)` |

- `keyField`: `soch_uid`.
- **`classify(rows)`:**
  1. **Centers.** Load them once (`authClient.centers()`). Map `facility_code`: first against `soch_facility_code`, then against `code`.
     - No match: error `{ field: 'facility_code', rule: 'BR-I5', message: 'Unknown facility code' }`.
     - Inactive Center: error `{ ..., message: 'The Center of this facility code is inactive' }`.
  2. **Fingerprint.** Compute it with `blindIndex(canonical)`, where `canonical` = `JSON.stringify` of the row's SOCH fields in `SOCH_COLUMNS` order, after parsing, with `null` for empty values. Put the helper in `src/imports/soch-fingerprint.ts`.
  3. **Match.** Call core `/internal/beneficiaries/match` in chunks of 1000 and map the result:

| Core `match` | Row action |
|---|---|
| `NEW` | `CREATE` |
| `UPDATE` | `UPDATE` |
| `UNCHANGED` | `UNCHANGED` |
| `UID_MERGE`, `KEY_CONFLICT` | `REVIEW` |

  4. Store `center_id`, `district_id` and `fingerprint` INTO the staged row values. Commit needs them, and they are not personal data.
- **`commit(rows, actor)`:** core `/internal/beneficiaries/upsert-batch`, with the batch id and the rows.
  - The pipeline passes rows only. Extend the `Importer.commit` signature to `(rows, actorUserId, batchId)` and update `centersImporter` accordingly.
- **Register it** in `registry.ts`. Add a `coreClient` in `src/clients/core.client.ts`.
- **Business rule.** Add BR-I5 to BUSINESS_RULES.md: "a SOCH row must map to an active Center".

### Tests

| Test | Proves |
|---|---|
| UT-IMP-S01 | Row schema maps `M` / `TG` / `On ART` / `30-06-2015` |
| UT-IMP-S02 | Every one of the 8 fixture error rows fails for its own reason |
| UT-IMP-S03 | The fingerprint is stable across key order and whitespace |
| UT-CORE-M01..M06 | One test per match outcome, plus `center_changed` |

## 4. T-1.5 Beneficiary endpoints (core)

Every endpoint: `...guard, authorize(...), validate...`. Scope comes from `applyScope` / `assertInScope` with `{ district: 'b.district_id', center: 'b.center_id' }`.

### GET `/beneficiaries` (`BENEFICIARY_RECORD_VIEW`)

Query (`.strict()`):

- `q` (searchText)
- `center_id`, `district_id` (uuid, a filter INSIDE the scope)
- `art_status`, `sex`
- `has_application` (boolQuery; ignored until Phase 2)
- `sort`: `soch_updated_at` | `age` | `art_registration_date`, with `dir`
- `...pageQuery`

How `q` searches:

- `h = blindIndex(q.toUpperCase())` is matched against `soch_uid_lookup`, `art_number_lookup`, `pre_art_number_lookup`, `pid_lookup` and `soch_beneficiary_id_lookup`.
- **OR** `name_tokens @> nameSearchTokens(q)`.
- **OR** (Phase 4) the PPO number.

Row:

```jsonc
{ "id": "uuid", "soch_uid": "RJUID0000001", "art_number": "ART/RJ001/2015/0001", "patient_name": "Asha Devi",
  "age": 45, "sex": "FEMALE", "art_status": "ON_ART", "last_visit_date": "2025-08-14",
  "center": { "id": "uuid", "code": "RJ001" }, "district": { "id": "uuid", "name_en": "Ajmer" },
  "application": null, "ppo_number": null }
```

- UID, ART number and name are shown in full to a scoped user: the worker needs them to recognise the person.
- Aadhaar, contact and ABHA are NOT in the list at all.
- Center codes and district names come from `authClient.centers()` / `districts()` (cached), never from a join across schemas.

### GET `/beneficiaries/:id` (`BENEFICIARY_RECORD_VIEW`, scoped, 404 out of scope)

Response: the list row, plus these fields:

```jsonc
{ "soch_beneficiary_id": "B0000001", "pre_art_number": "...", "pid_number": "...", "address": "...", "tehsil": "...",
  "contact_masked": "98XXXXXX21", "aadhaar_masked": "XXXX XXXX 2346", "abha_masked": "XXXXXXXXXX1234",
  "art_registration_date": "2015-06-30", "facility_name": "...", "facility_code": "RJ001",
  "soch_updated_at": "ISO", "applications": [] }
```

Audit `core.beneficiary.viewed` (add it to the `AUDIT` list if missing; it already exists).

### POST `/beneficiaries/:id/unmask` (`BENEFICIARY_PII_UNMASK`, scoped)

- Body: `{ "fields": ["aadhaar", "contact_number", "abha_number"] }`, a `.strict()` `z.array(z.enum([...])).min(1)`.
- Response: `{ "aadhaar": "234123412346" | null, ... }`, only the requested fields.
- Audit `core.beneficiary.pii_unmasked` with `data: { fields }`.
- Rate limit: `perUser({ name: 'unmask', windowMs: 60_000, limit: 20 })`.

## 5. T-1.6 Import review (core)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/import-review` | `IMPORT_REVIEW_RESOLVE` | Query: `status` (default OPEN), `kind`, `...pageQuery`. Row: `{ id, kind, status, row_number, batch_id, created_at, incoming: { soch_uid, patient_name, facility_code, center_code }, existing: { id, soch_uid, patient_name, center_code } \| null }` |
| POST | `/import-review/:id/resolve` | `IMPORT_REVIEW_RESOLVE` | Body `{ "action": "LINK" \| "CREATE_NEW" \| "IGNORE" }`, `.strict()` |

What each action does:

| Action | Effect |
|---|---|
| `LINK` | Update the existing beneficiary from the payload, including the new UID: this is a merge. Refused (409) if the new UID already belongs to another beneficiary. |
| `CREATE_NEW` | Insert the payload as a new beneficiary. 409 if any unique key would clash. |
| `IGNORE` | Status IGNORED. |

Every action is one transaction and writes the audit row `core.import_review.resolved` (add it).

## 6. T-1.7 Dashboard summary (core)

`GET /dashboard/summary` needs any of the `DASHBOARD_*_VIEW` permissions. It is scoped.

```jsonc
{ "scope": "STATE", "beneficiaries": { "total": 500, "by_art_status": { "ON_ART": 300 }, "by_sex": { "FEMALE": 220 } },
  "applications": { "total": 0, "by_status": {} }, "ppo_generated": 0, "open_review_items": 3 }
```

`open_review_items` is counted only when the caller holds `IMPORT_REVIEW_RESOLVE`; otherwise it is `null`.

## 7. T-1.8 Web

Follow [UI_GUIDELINES.md](../UI_GUIDELINES.md) and `web/pension-web/README.md`.

| Screen | Route | Gate | Content |
|---|---|---|---|
| SOCH Import | `/dashboard/imports` (new "SOCH" tab or button) | `IMPORT_SOCH_UPLOAD` | BulkUploadSheet with columns from `GET /data/.../imports/columns/soch`. After upload: counts card (create, update, unchanged, review, errors, duplicates), error rows in the grid, Confirm Import (`IMPORT_SOCH_COMMIT`), Cancel |
| Beneficiaries | `/dashboard/beneficiaries` | `BENEFICIARY_RECORD_VIEW` | Server table: UID, ART No, Name, Age, Sex, ART Status (tone badge), Center, Last Visit, Application status. Filters: search, district (State roles), Center (State and District roles), ART status, sex |
| Beneficiary detail | `/dashboard/beneficiaries/[id]` | same | Read-only "SOCH Data" card with a lock icon and the text "From SOCH, cannot be edited". Masked Aadhaar, contact and ABHA with a "Show" button (only if `BENEFICIARY_PII_UNMASK`), which calls unmask, shows the value for 30 seconds, then hides it again. Applications section (empty until Phase 2). |
| Import Review | `/dashboard/imports/review` | `IMPORT_REVIEW_RESOLVE` | Table of OPEN items: incoming vs existing side by side; actions Link / Create New / Ignore, each with a confirm dialog |
| Dashboard | `/dashboard` | existing | Replace the "Available in Phase 1" cards with real counts from `/dashboard/summary` |

- Add nav items: Beneficiaries, and Import Review under Administration.
- Add ART status labels to both message files: `artStatus.ON_ART` and so on.

## 8. Definition of done for the phase

- `node scripts/acceptance/phase1.mjs` reports 0 FAIL and 0 TODO.
- `scripts/dev.sh check` passes, and both smoke scripts still pass.
- Docs updated:
  - API_CORE.md (move the Phase 1 rows to "built")
  - API_DATA.md (`soch` kind, columns endpoint)
  - DATA_MODEL.md (move the tables to §1)
  - AUDIT_EVENTS.md
  - BUSINESS_RULES.md (BR-I5)
  - TEST_PLAN.md
- Manually checked as stateadmin, worker.rj001 (sees only RJ001), dapcu.ajmer (only Ajmer) and auditor (read only).
