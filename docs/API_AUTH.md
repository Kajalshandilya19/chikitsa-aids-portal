# pension-auth-service API (Phase 0 contract)

Base path: `/auth/api/v1` (port 3201). Conventions (envelopes, errors, paging, ids) are in [API_CONVENTIONS.md](API_CONVENTIONS.md). Every body field names its validation rule (`V-0xx`, [VALIDATION_RULES.md](VALIDATION_RULES.md)).

The browser never calls this service directly. It calls the web app's BFF (`/api/auth/*` and `/api/gateway/auth/*`), which holds the tokens in httpOnly cookies and forwards `Authorization: Bearer <access_token>`.

Legend: 🔓 no login needed · 🔑 login needed · 🔑* allowed while `must_change_password` is true · 🛡️ service token only (`x-service-token`).

## 1. Captcha

| Method | Path | Auth | Rate limit | Response `data` |
|---|---|---|---|---|
| GET | `/captcha` | 🔓 | 30/min per IP | `{ image: "data:image/svg+xml;base64,...", token, expires_in: 300 }` |

A token is single use and expires in 5 minutes. Answers are 1 or 2 digits.

### GET `/public/centers` 🔓 (30/min per IP)

The login screen's Center picker. Active Centers only, and only what a signboard shows: `[{ code, name_en, name_hi, district_en, district_hi }]`. No users, counts or SOCH facility codes. Cached for 5 minutes. ART Centre lists are published by NACO and RSACS, so exposing them before login reveals nothing confidential. The BFF serves it at `GET /api/auth/centers`.

## 2. Login and session

### POST `/auth/login` 🔓 (10/min per IP + user_code)

Request:

| Field | Rule | Notes |
|---|---|---|
| `center_code` | V-003, optional | Required for CENTER roles (worker, in-charge). Omit for State and District roles. |
| `user_code` | V-002 | |
| `password` | 1 to 128 chars | The policy V-006 is not checked at login. |
| `captcha_token` | string, ≤ 200 | From `GET /captcha`. |
| `captcha_answer` | 1 to 2 digits | |

Response `data` is one of three shapes, chosen by `step`:

```jsonc
// step DONE: logged in
{ "step": "DONE", "access_token": "...", "expires_at": "ISO", "refresh_token": "...", "refresh_expires_at": "ISO",
  "must_change_password": false, "needs_selection": false, "user": <Me> }

// step MFA_REQUIRED: the role needs TOTP and the user has an authenticator set up
{ "step": "MFA_REQUIRED", "mfa_token": "...", "expires_in": 300 }

// step MFA_ENROLL: the role needs TOTP and the user has none yet; show the QR / secret
{ "step": "MFA_ENROLL", "mfa_token": "...", "expires_in": 300, "otpauth_url": "otpauth://totp/...", "secret": "BASE32..." }
```

Errors:

| Code | Status | Meaning |
|---|---|---|
| `E_CAPTCHA`, `E_CAPTCHA_EXPIRED`, `E_CAPTCHA_USED` | 400 | Refresh the captcha. |
| `E_INVALID_CREDENTIALS` | 401 | Wrong Center code, User ID or password. The same message is used for every one of these, so the response never reveals which was wrong. |
| `E_ACCOUNT_LOCKED` | 423 | Too many failures. `details.retry_after_minutes`. |
| `E_ACCOUNT_INACTIVE` | 403 | |
| `E_CENTER_CODE_REQUIRED` | 400 | The account only has Center roles. |
| `E_NO_ROLE` | 403 | No active assignment. |

### POST `/auth/login/mfa` 🔓 (10/min per IP)

Request: `{ mfa_token, totp_code (V-028) }`. Response: the `DONE` shape. Five wrong codes make the `mfa_token` unusable (`E_MFA_LOCKED`), and the user must log in again. A first successful code during `MFA_ENROLL` turns MFA on for the account.

### POST `/auth/refresh` 🔓

Request: `{ refresh_token }`. Response: `{ access_token, expires_at, refresh_token, refresh_expires_at }`. The old refresh token is dead after this call. Presenting it again revokes the whole session (`E_REFRESH_REPLAY`). Other errors: `E_REFRESH_INVALID`, `E_SESSION_EXPIRED` (idle more than `SESSION_IDLE_MIN` or older than `REFRESH_TTL_HOURS`).

### POST `/auth/logout` 🔑*

Request: `{}`. Revokes the session of the access token. Always `{ logged_out: true }`.

### GET `/auth/me` 🔑*

`<Me>`:

```jsonc
{ "id": "uuid", "user_code": "worker.rj001", "name": "Asha Devi",
  "role": { "id": "uuid", "code": "center_worker", "name_en": "Center Worker", "name_hi": "केंद्र कार्यकर्ता", "scope": "CENTER" },
  "district": { "id": "uuid", "code": "AJMER", "name_en": "Ajmer", "name_hi": "अजमेर" } | null,
  "center": { "id": "uuid", "code": "RJ001", "name_en": "...", "name_hi": "..." } | null,
  "permissions": ["pension:..."], "must_change_password": false, "mfa_enabled": false, "assignment_count": 1 }
```

### GET `/auth/options` 🔑

The caller's active assignments: `{ current_assignment_id, assignments: [{ id, role: {...}, district, center }] }`.

### POST `/auth/switch` 🔑 (20/min per user)

Request: `{ assignment_id (V-032) }`. Ends the current session and starts one in the chosen assignment. Response: the `DONE` shape. `E_MFA_REQUIRED` (403) when the target role needs MFA and this session did not pass it: the user must log out and log in again.

## 3. Passwords

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| POST | `/auth/password/otp` | 🔑* | `{}` | `{ sent_to: "98XXXXXX21", expires_in: 600 }`. Sends a FIRST_LOGIN OTP. 3 per 10 minutes. |
| POST | `/auth/password/change` | 🔑* | `{ current_password, new_password (V-006), otp (V-029, required while must_change_password) }` | `{ relogin: true }`. Every session of the user is revoked, so the user logs in again. |
| POST | `/auth/password/forgot` | 🔓 | `{ user_code (V-002), mobile (V-004), captcha_token, captcha_answer }` | Always `{ message }`, whether or not the details match. 5/min per IP + user_code. |
| POST | `/auth/password/reset` | 🔓 | `{ user_code, otp (V-029), new_password (V-006) }` | `{ relogin: true }`. Unlocks the account. |

Password rules beyond V-006, checked by the service (error `E_PASSWORD_POLICY`, 422):

- The password must not contain the User ID.
- It must not equal any of the last 3 passwords.

## 4. Masters

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/districts` | `MASTER_DISTRICT_VIEW` | All 41 districts, no paging. Query `is_active=true\|false`. |
| PATCH | `/districts/:id` | `MASTER_DISTRICT_EDIT` | `{ name_hi? (V-035), is_active? }` |
| GET | `/centers` | `MASTER_CENTER_VIEW` | Query `q` (V-030, matches code or name), `district_id`, `is_active`, `page`, `limit`, `sort` (`code`, `name_en`, `district`), `dir`. Scoped: a District role sees only its own district, a Center role only its own Center. |
| GET | `/centers/:id` | `MASTER_CENTER_VIEW` | Scoped. |
| POST | `/centers` | `MASTER_CENTER_CREATE` | `{ code (V-003), name_en (V-038), name_hi? (V-035), district_id (V-032), center_type (V-040), soch_facility_code? (V-025) }` |
| PATCH | `/centers/:id` | `MASTER_CENTER_EDIT` | The same fields, all optional except `code`, which can never change. |
| POST | `/centers/:id/activate`, `/centers/:id/deactivate` | `MASTER_CENTER_EDIT` | Deactivating a Center blocks every login into it. |

Center row:

```jsonc
{ "id", "code", "name_en", "name_hi", "center_type", "soch_facility_code", "is_active", "is_placeholder",
  "district": { "id", "code", "name_en", "name_hi" }, "created_at", "updated_at" }
```

## 5. Users and assignments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users` | `USER_ACCOUNT_VIEW` | Query `q` (name words, a User ID prefix, or an exact 10-digit mobile), `role_code`, `district_id`, `center_id`, `is_active`, `page`, `limit`. District roles see the users assigned in their district. |
| GET | `/users/:id` | `USER_ACCOUNT_VIEW` | Includes `assignments`. |
| POST | `/users` | `USER_ACCOUNT_CREATE` | `{ user_code, full_name (V-001), mobile (V-004), email? (V-005), assignment: { role_id, district_id?, center_id? } }`. Response `{ user, temporary_password }`. **The temporary password is shown once** and must be changed at first login, with an OTP. |
| PATCH | `/users/:id` | `USER_ACCOUNT_EDIT` | `{ full_name?, mobile?, email? }` |
| POST | `/users/:id/activate`, `/deactivate`, `/unlock` | `USER_ACCOUNT_ACTIVATE` | Deactivating revokes every session. A user cannot deactivate their own account. |
| POST | `/users/:id/password-reset` | `USER_ACCOUNT_PASSWORD_RESET` | `{ temporary_password }`, shown once. |
| GET | `/users/:id/assignments` | `USER_ACCOUNT_VIEW` | |
| POST | `/users/:id/assignments` | `USER_ASSIGNMENT_MANAGE` | `{ role_id, district_id?, center_id? }`, rules BR-A1 to A4. |
| DELETE | `/users/:id/assignments/:assignmentId` | `USER_ASSIGNMENT_MANAGE` | Soft delete (`is_active = false`) and revoke the sessions that use it. |

User row (list): `{ id, user_code, full_name, mobile_masked, email_masked, is_active, is_locked, mfa_enabled, last_login_at, assignments: [{ id, role_code, role_name_en, scope, district_name_en, center_code }] }`.

Rules:

- A user with any STATE assignment can only be edited, reset, deactivated or re-assigned by a Super Admin (BR-U5).
- Other actors can only assign DISTRICT or CENTER roles whose permissions they hold themselves (BR-U4).

## 6. Roles and permissions

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/roles` | `ROLE_CATALOGUE_VIEW` or `USER_ASSIGNMENT_MANAGE` | `[{ id, code, name_en, name_hi, scope_level, mfa_required, permission_count, permissions_customized, assignable }]`. `assignable` says whether the caller can hand the role out. |
| GET | `/roles/:id` | `ROLE_CATALOGUE_VIEW` | Includes `permissions: string[]`. |
| PUT | `/roles/:id/permissions` | `ROLE_PERMISSIONS_EDIT` | `{ permissions: string[] }`. Each code must exist and be allowed at the role's scope (`E_PERMISSION_SCOPE`). |
| GET | `/permissions` | `ROLE_CATALOGUE_VIEW` | `[{ code, section, resource, action, label_en, label_hi, allowed_scopes, delegable, sensitive }]` |

## 7. Audit

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/audit` | `AUDIT_LOG_VIEW` | Query `action`, `outcome`, `actor_user_id`, `entity_type`, `entity_id`, `center_id`, `from`, `to` (YYYY-MM-DD), `page`, `limit`. Newest first. |
| GET | `/audit/verify` | `AUDIT_CHAIN_VERIFY` | `[{ chain, ok, checked, broken_at_seq }]` |

## 8. Internal (🛡️ service token only)

| Method | Path | Used by |
|---|---|---|
| GET | `/internal/roles/:id/permissions` | core, data: `authorize()` permission resolver |
| GET | `/internal/districts` | core, data: name lookups (cached) |
| GET | `/internal/centers` | core, data: code to id, SOCH facility code mapping (cached) |
| POST | `/internal/centers/upsert-batch` | data: Center import commit. `{ actor_user_id, rows: [{ code, name_en, name_hi?, district_lgd_code, center_type, soch_facility_code? }] }`, at most 500 rows. Response `{ created, updated, unchanged }`. |
