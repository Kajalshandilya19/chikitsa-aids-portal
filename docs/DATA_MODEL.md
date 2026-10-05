# Data model

🔒 = encrypted with `piiTransformer` (R-PII-1). `_lookup` = HMAC blind index for equality search. `_last4` = plain last 4 digits for masking. Every table also has `id uuid PK`, `created_at` and `updated_at` unless stated (R-DB-4).

## 1. Built in Phase 0

### pension_auth (auth-service)

| Table | Columns (besides id, timestamps) | Notes |
|---|---|---|
| `districts` | `lgd_code` int unique, `code` unique, `name_en`, `name_hi`, `is_active` | 41 rows seeded |
| `centers` | `code` unique (V-003), `name_en`, `name_hi`, `district_id` FK, `center_type` (V-040), `soch_facility_code` unique null, `is_active`, `is_placeholder`, `created_by`, `updated_by` | |
| `users` | `user_code` unique, 🔒`full_name`, `full_name_tokens text[]` (GIN), 🔒`mobile` + `mobile_lookup` unique + `mobile_last4`, 🔒`email` + `email_lookup` unique, `password_hash` (argon2id), `previous_password_hashes text[]`, `password_changed_at`, `must_change_password`, 🔒`mfa_secret`, `mfa_enabled`, `failed_login_count`, `locked_until`, `last_login_at`, `is_active`, `created_by`, `updated_by` | Secrets are `select: false` |
| `roles` | `code` unique, `name_en`, `name_hi`, `scope_level`, `mfa_required`, `is_system`, `is_active`, `permissions_customized`, `sort_order` | 8 rows from code |
| `permissions` | `code` PK, `section`, `resource`, `action`, `label_en`, `label_hi`, `allowed_scopes text[]`, `delegable`, `sensitive`, `sort_order` | Written only by the rbac sync |
| `role_permissions` | `role_id`, `permission_code` (PK both) | |
| `user_roles` | `user_id`, `role_id`, `district_id` null, `center_id` null, `is_active`, `created_by` | Unique among active rows per (user, role, district, center) |
| `sessions` | `user_id`, `assignment_id`, `last_seen_at`, `expires_at`, `revoked_at`, `revoked_reason`, `mfa_verified`, `ip`, `user_agent` | No updated_at |
| `refresh_tokens` | `session_id` FK cascade, `token_hash` unique (SHA-256), `expires_at`, `replaced_by` | No updated_at |
| `otp_challenges` | `user_id`, `purpose` (PASSWORD_RESET, FIRST_LOGIN), `code_hash` (HMAC), `expires_at`, `attempts`, `consumed_at` | No updated_at |

### pension_audit (owned by auth-service, written by all)

| Object | Notes |
|---|---|
| `audit_logs` | `chain` (service name), `seq`, `action`, `outcome`, `actor_user_id`, `entity_type`, `entity_id`, `district_id`, `center_id`, `request_id`, `payload jsonb`, `prev_hash`, `event_hash`, `created_at`. Unique (chain, seq). Append-only trigger. |
| `append_event(chain, payload)` | SECURITY DEFINER; the only writer; EXECUTE granted to core and data |
| `verify_chain(chain)` | Recomputes the chain |

### pension_core (core-service)

| Table | Columns | Notes |
|---|---|---|
| `app_settings` | `key` PK, `value jsonb`, `updated_by` | Keys are defined in code (domain/settings.ts) |
| `sequence_counters` | PK (`counter_name`, `scope`, `period`), `last_seq` | PPO numbers (Phase 4) |

### pension_data (data-service)

| Table | Columns | Notes |
|---|---|---|
| `import_batches` | `kind`, `status`, 🔒`file_name`, `file_sha256`, `file_type`, `file_size`, `row_count`, `valid_count`, `error_count`, `duplicate_count`, `create_count`, `update_count`, `unchanged_count`, `header_errors jsonb`, `result jsonb`, `uploaded_by`, `uploaded_at`, `committed_by`, `committed_at` | The file itself is not stored |
| `import_rows` | `batch_id` FK cascade, `row_number`, `status`, `action`, 🔒`values` (JSON text), `errors jsonb` (field, rule, message; never a value) | Purged after IMPORT_STAGE_RETENTION_DAYS |

## 2. Target tables for later phases (pension_core)

These are the specification. Write a migration that matches them, and update this section if a review changes them.

### `beneficiaries` (Phase 1). SOCH-owned, read-only for users.

| Column | Type | Notes |
|---|---|---|
| `center_id`, `district_id` | uuid | From the Center that matches the SOCH facility code. Indexed together. |
| 🔒`soch_beneficiary_id` + `soch_beneficiary_id_lookup` | text, varchar(64) unique | V-025 |
| 🔒`soch_uid` + `soch_uid_lookup` | text, varchar(64) unique | V-021; match key 1 |
| 🔒`pid_number` + `pid_lookup` | | V-024; match key 2 |
| 🔒`art_number` + `art_number_lookup` | | V-022; NOT unique (changes on transfer) |
| 🔒`pre_art_number` + `pre_art_number_lookup` | | V-023 |
| 🔒`patient_name` + `name_tokens text[]` (GIN) | | V-001 |
| 🔒`address`, `tehsil` | text, varchar(150) | |
| 🔒`contact_number` + `contact_last4` | | V-004 |
| 🔒`aadhaar` + `aadhaar_lookup` + `aadhaar_last4` | | V-007 |
| 🔒`abha_number` + `abha_lookup` | | V-026 |
| `age` smallint, `sex` varchar(16), `art_status` varchar(24) | | V-017, V-018, V-039; plain so they can be filtered |
| `art_registration_date`, `last_visit_date` | date | V-016 |
| `facility_name`, `facility_code` | varchar | As in SOCH |
| `soch_last_batch_id`, `soch_updated_at` | | Last import that touched the row |

### `applications` (Phase 2)

| Column | Notes |
|---|---|
| `beneficiary_id`, `center_id`, `district_id` | Scope columns copied from the beneficiary; partial unique index `(beneficiary_id) WHERE status <> 'REJECTED'` (BR-10) |
| `status` | [WORKFLOW.md](WORKFLOW.md) |
| 🔒`guardian_name` | V-001 |
| `category` | V-019 (plain, filterable) |
| 🔒`address`, 🔒`contact_number` + `contact_last4` | Only if the worker corrects the SOCH value (Q-09) |
| 🔒`jan_aadhaar` + `jan_aadhaar_lookup` + `jan_aadhaar_last4`, 🔒`jan_aadhaar_member_id` | V-008, V-009 |
| 🔒`aadhaar_for_bank` + `aadhaar_for_bank_lookup` + `aadhaar_for_bank_last4` | V-007 |
| `bank_name`, 🔒`bank_account_number` + `bank_account_last4`, `ifsc` | V-012, V-011, V-010 |
| `consent`, `consent_text_version`, `consent_language`, `consent_captured_by`, `consent_captured_at`, `consent_document_id` | V-020; BR-11 |
| 🔒`remarks` | V-014 |
| `center_changed` bool | FR-24 |
| `created_by`, `submitted_by/at`, `signed_off_by/at`, `verifier_id`, `picked_at`, `recommended_by/at`, `recommendation`, `decided_by/at`, 🔒`decision_reason` | Workflow stamps |
| `version` int | Optimistic locking for edits |

### Other planned tables

| Table | Phase | Columns |
|---|---|---|
| `application_status_history` | 2 | `application_id`, `from_status`, `to_status`, `action`, `actor_user_id`, `actor_role`, 🔒`reason`, `created_at` (append-only) |
| `application_reviews` | 3 | `application_id` unique, `checklist jsonb` (identity, aadhaar, jan_aadhaar, bank, consent, completeness: each `OK`/`ISSUE`/`NA`), 🔒`remarks`, `reviewer_id` |
| `documents` | 2 | `application_id`, `kind` (CONSENT), `object_key`, `content_type`, `size`, `sha256`, 🔒`original_name`, `uploaded_by` |
| `ppos` | 4 | `application_id` unique, `beneficiary_id`, `ppo_number` unique (V-037), `mode`, `pattern_used`, `seq`, `generated_by/at`, `monthly_amount numeric(10,2)` null, `payment_review` bool |
| `ppo_corrections` | 4 | `ppo_id`, `field`, 🔒`old_value`, 🔒`new_value`, 🔒`reason`, `actor_user_id` |
| `payments` | 5 | `ppo_id`, `period` (V-034), `payment_date`, `amount numeric(10,2)` (V-033), `status` (PENDING, PAID, FAILED, REVERSED), 🔒`remarks`, `source` (MANUAL, IMPORT), `import_batch_id`; unique (`ppo_id`, `period`) where status is not REVERSED |
| `import_review_items` | 1 | `batch_id`, `kind` (UID_MERGE, KEY_CONFLICT, CENTER_UNKNOWN), `beneficiary_id` null, 🔒`payload`, `status` (OPEN, RESOLVED, IGNORED), `resolved_by/at` |
