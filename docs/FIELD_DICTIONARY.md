# Field dictionary

Every field of the pension application (SRD §7) and the SOCH data (SRD §3): where it comes from, where it is stored, which rule validates it, whether it is personal data, and who may change it. "Q-09" marks the editability the department still has to confirm; the defaults below are what we build.

Legend: **SOCH** = imported, read-only for every user (BR-12). **W** = the Center Worker enters or edits it, in DRAFT or RETURNED only. **Sys** = set by the system. 🔒 = encrypted, masked in lists.

## 1. Pension application form (SRD §7)

| # | Field (SRD) | Source | Stored as | Rule | PII | Editable by |
|---|---|---|---|---|---|---|
| 1 | Date of ART Registration | SOCH | `beneficiaries.art_registration_date` | V-016 | | nobody |
| 2 | UID No. | SOCH | 🔒`beneficiaries.soch_uid` | V-021 | 🔒 | nobody |
| 3 | ART No. | SOCH | 🔒`beneficiaries.art_number` | V-022 | 🔒 | nobody |
| 4 | Name of Patient | SOCH | 🔒`beneficiaries.patient_name` | V-001 | 🔒 | nobody |
| 5 | Father/Husband/Guardian Name | W | 🔒`applications.guardian_name` | V-001 | 🔒 | W |
| 6 | Category/Caste | W | `applications.category` | V-019 | (sensitive, filterable) | W |
| 7 | Complete Address | SOCH, W may correct | 🔒`applications.address` (when corrected) | V-013 | 🔒 | W (Q-09) |
| 8 | Contact Number | SOCH, W may correct | 🔒`applications.contact_number` | V-004 | 🔒 | W (Q-09) |
| 9 | Age | SOCH | `beneficiaries.age` | V-017 | | nobody |
| 10 | Sex | SOCH | `beneficiaries.sex` | V-018 | | nobody |
| 11 | District | Master, from the Center | `beneficiaries.district_id` | | | nobody |
| 12 | Jan Aadhaar No. | W | 🔒`applications.jan_aadhaar` (+ optional member id) | V-008 (V-009) | 🔒 | W |
| 13 | Aadhaar Card No. to link with Bank | W | 🔒`applications.aadhaar_for_bank` | V-007 | 🔒 | W |
| 14 | Status in ART Care | SOCH | `beneficiaries.art_status` | V-039 | | nobody |
| 15 | Date of Last Visit | SOCH | `beneficiaries.last_visit_date` | V-016 | | nobody |
| 16 | Name of Bank | W | `applications.bank_name` | V-012 | | W |
| 17 | Bank Account Number | W | 🔒`applications.bank_account_number` | V-011 | 🔒 | W |
| 18 | IFSC Code | W | `applications.ifsc` | V-010 | | W |
| 19 | Consent (Y/N) | W | `applications.consent` + version, language, who, when | V-020 | | W; YES required to submit (BR-11) |
| 20 | Remarks | W | 🔒`applications.remarks` | V-014 | 🔒 | W |

Masking in lists (R-PII-3):

| Field | Masked as |
|---|---|
| Aadhaar | `XXXX XXXX 1234` |
| Jan Aadhaar | `XXXXXX7890` |
| Account | `XXXXXXXX4321` |
| Mobile | `98XXXXXX21` |

Names are shown in Center-scoped lists. State roles see names in queues. Exports follow FR-55.

## 2. SOCH import columns (SRD §3)

The column list is in [SOCH_IMPORT_SPEC.md](SOCH_IMPORT_SPEC.md) and in code, [soch-columns.ts](../services/pension-data-service/src/imports/soch-columns.ts). Each column names its rule there.

## 3. Staff and masters (Phase 0, built)

| Field | Stored as | Rule | PII |
|---|---|---|---|
| User ID | `users.user_code` | V-002 | |
| Full name | 🔒`users.full_name` | V-001 | 🔒 |
| Mobile | 🔒`users.mobile` + lookup + last4 | V-004 | 🔒 |
| Email | 🔒`users.email` + lookup | V-005 | 🔒 |
| Password | `users.password_hash` (argon2id) | V-006 | secret |
| Center Code / Name / Hindi / Type / SOCH Facility Code | `centers.*` | V-003, V-038, V-035, V-040, V-025 | |
| District LGD code / Hindi name | `districts.*` | V-027, V-035 | |
