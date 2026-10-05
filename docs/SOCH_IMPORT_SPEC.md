# SOCH import specification (Phase 1)

SOCH is NACO's national HIV programme system. The department gives the portal an Excel export of the beneficiaries. The real export format has not been seen yet (Q-01), so everything below is the DEFAULT we build against. The code holds the column list in ONE place: [soch-columns.ts](../services/pension-data-service/src/imports/soch-columns.ts).

What the NACO material says ([PRODUCT_SPEC.md](PRODUCT_SPEC.md) research):

- The **UID** is system-generated per beneficiary. Records can later be MERGED ("UID linkage"), so a person's UID can change.
- The **ART number** is issued by the ART centre, and a NEW one is issued when the patient transfers. It is never a key.
- The **PID** is a 23-character id tied to the testing centre. Old records may not have one.
- **ART status** values: On ART, Missed (MIS), On ART LFU, Pre-ART LFU, Opted Out, Stopped, Died, Transferred Out or In, In Transit, Linked Out.
- Statuses MIS, LFU, Opted Out and Stopped can go back to On ART.

## 1. Columns

| Header (default) | Field | Required | Rule | 🔒 |
|---|---|---|---|---|
| Beneficiary ID | `soch_beneficiary_id` | yes | V-025 | 🔒 |
| UID | `soch_uid` | yes | V-021 | 🔒 |
| ART Registration Date | `art_registration_date` | | V-016 (`sochDate` first) | |
| Pre ART Number | `pre_art_number` | | V-023 | 🔒 |
| ART Registration Number | `art_number` | | V-022 | 🔒 |
| PID Number | `pid_number` | | V-024 | 🔒 |
| Patient Name | `patient_name` | yes | V-001 | 🔒 |
| Complete Address | `address` | | V-013 | 🔒 |
| Taluk/Tehsil | `tehsil` | | V-038 | |
| District | `district_name` | | informational | |
| State | `state_name` | | informational | |
| Contact Number | `contact_number` | | V-004 | 🔒 |
| Aadhaar Number | `aadhaar` | | V-007 | 🔒 |
| Age | `age` | | V-017 | |
| Sex | `sex` | yes | V-018 (`sochSex` first) | |
| ART Status | `art_status` | | V-039 (`sochArtStatus` first) | |
| Date of Last Visit | `last_visit_date` | | V-016 | |
| Facility Name | `facility_name` | | informational | |
| Facility Code | `facility_code` | yes | V-025; must map to a Center | |
| ABHA | `abha_number` | | V-026 | 🔒 |

## 2. Center mapping

`facility_code` is matched in this order:

1. against `centers.soch_facility_code`;
2. then against `centers.code`.

No match is a row error (`CENTER_UNKNOWN`). The row is also added to the review list, so an admin can fix the Center master and re-import. The beneficiary's `district_id` is ALWAYS taken from the Center; the file's District column is informational only.

## 3. Matching an existing beneficiary

| Step | Rule |
|---|---|
| 1 | Same `soch_uid` (blind index): that beneficiary |
| 2 | Else same `pid_number` (when present): that beneficiary. If its UID differs, it is a **UID change or merge**: the row becomes `import_review_items` kind `UID_MERGE`, and nothing is written until an admin resolves it (`IMPORT_REVIEW_RESOLVE`). |
| 3 | Else same `soch_beneficiary_id`: same handling as step 2 |
| 4 | Else: a NEW beneficiary |
| Conflict | Keys that point at two different beneficiaries become `KEY_CONFLICT` review items. Nothing is written. |

## 4. What a re-import may change (BR-I3)

- **It only changes the SOCH fields** of `beneficiaries` (the table in [DATA_MODEL.md](DATA_MODEL.md)). Application, consent, bank, PPO and payment data are never touched.
- **A Center change** moves the beneficiary's `center_id` and `district_id` with it:
  - an open application moves too, and is flagged `center_changed`;
  - the move is audited.
- **ART status DIED** blocks new applications and flags an existing PPO for payment review (WORKFLOW.md §3).
- **Each committed row** stores `soch_last_batch_id` and `soch_updated_at`.
- **A beneficiary missing from a later file is NOT deleted.** Q-01 asks whether files are complete snapshots or deltas.

## 5. Fixture

`npm run fixture:soch` (in pension-data-service) writes [fixtures/soch-sample.xlsx](../fixtures/soch-sample.xlsx):

- 500 synthetic valid rows across RJ001 to RJ041;
- 8 deliberate error rows: bad date, future date, unknown facility, duplicate UID, invalid Aadhaar, missing name, bad sex, bad age.

The fixture contains no valid Aadhaar, mobile or ABHA numbers (R-PII-7).
