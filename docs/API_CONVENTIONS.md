# API conventions (all services)

## 1. Responses

```jsonc
// success
{ "success": true, "data": <payload> }
// list
{ "success": true, "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 134 } }
// failure
{ "success": false, "code": "E_PERMISSION", "message": "you do not have permission for this action", "details": { ... }, "request_id": "uuid" }
```

- `message` is safe to show to the user. It never contains personal data (R-API-3).
- `details` holds structured help: zod issues for `E_VALIDATION`, the required permissions for `E_PERMISSION`, and `retry_after_minutes` for `E_ACCOUNT_LOCKED`.
- `request_id` matches the `X-Request-Id` response header and the log lines. Ask users to send it with a bug report.
- In production a 500 says only "internal server error". The real message is in the log.

## 2. Requests

| Topic | Rule |
|---|---|
| Body | JSON, at most 1 MB (uploads: multipart, `file` field, per-route limit). Unknown keys are refused (422). |
| Ids | uuid v4 in paths: `/centers/:id` |
| Paging | `?page=1&limit=20`, limit at most 100 (V-031) |
| Sorting | `?sort=<key>&dir=asc\|desc`, where the key comes from a per-endpoint whitelist |
| Search | `?q=` (V-030), never logged |
| Dates | `YYYY-MM-DD` (IST calendar date); timestamps are ISO 8601 UTC |
| Booleans in query | `true` / `false` |
| Field names | snake_case in JSON |

## 3. Status codes and error codes

| Status | Code | When |
|---|---|---|
| 400 | `E_BAD_REQUEST` | Malformed request, or a value that refers to something unusable |
| 400 | `E_UNSAFE_INPUT` | Script or markup refused by the xss guard (`details.field`) |
| 400 | `E_CAPTCHA`, `E_CAPTCHA_EXPIRED`, `E_CAPTCHA_USED` | Captcha problems |
| 400 | `E_OTP_INVALID`, `E_OTP_EXPIRED`, `E_OTP_LOCKED` | OTP problems |
| 400 | `E_CENTER_CODE_REQUIRED`, `E_ASSIGNMENT_PLACE`, `E_ROLE_INVALID`, `E_DISTRICT_INVALID`, `E_PERMISSION_SCOPE`, `E_PERMISSION_UNKNOWN` | Domain input problems |
| 400 | `E_FILE_TYPE`, `E_FILE_UNSAFE`, `E_FILE_EMPTY`, `E_FILE_MISSING`, `E_FILE_UPLOAD`, `E_FILE_UNREADABLE` | Upload refused |
| 401 | `E_NO_TOKEN`, `E_TOKEN_INVALID`, `E_INVALID_CREDENTIALS`, `E_REFRESH_INVALID`, `E_REFRESH_REPLAY`, `E_SESSION_EXPIRED`, `E_MFA_INVALID`, `E_MFA_EXPIRED`, `E_MFA_LOCKED`, `E_SERVICE_TOKEN` | Identity problems |
| 403 | `E_PERMISSION` | The role lacks the permission (`details.required`) |
| 403 | `E_PASSWORD_CHANGE_REQUIRED` | Temporary password not yet changed |
| 403 | `E_ACCOUNT_INACTIVE`, `E_NO_ROLE`, `E_MFA_REQUIRED`, `E_ROLE_NOT_ASSIGNABLE`, `E_PROTECTED_USER`, `E_SELF_MANAGE` | Account or role rules |
| 404 | `E_NOT_FOUND` | Missing, OR outside the caller's scope (R-SCOPE-2) |
| 409 | `E_CONFLICT`, `E_IMPORT_STATE`, `E_IMPORT_EMPTY` | Duplicates, wrong state |
| 413 | `E_FILE_TOO_LARGE`, `E_BODY_TOO_LARGE` | Size limits |
| 422 | `E_VALIDATION`, `E_PASSWORD_POLICY`, `E_PASSWORD_CURRENT`, `E_OTP_REQUIRED`, `E_TOO_MANY_ROWS` | Validation |
| 423 | `E_ACCOUNT_LOCKED` | Too many failed logins |
| 429 | `E_RATE_LIMIT` | Rate limit |
| 502 / 503 | `E_UPSTREAM`, `E_SMS_UNAVAILABLE`, `E_OBJECT_STORE*` | Dependency down |
| 500 | `E_INTERNAL` | Bug |

When you add a code, add it here and map it to a friendly message in the web app's messages files.

## 4. Headers

| Header | Direction | Meaning |
|---|---|---|
| `Authorization: Bearer <access token>` | BFF to service | The user |
| `x-service-token` | service to service | Internal call (R-API-6) |
| `X-Request-Id` | both | Correlation id; incoming ids must match `^[A-Za-z0-9-]{8,64}$` |
| `X-Forwarded-For` | BFF to service | The real client IP. Services trust exactly `TRUST_PROXY_HOPS` hops, so rate limits are per user and not one shared bucket. |
| `Cache-Control: no-cache, no-store, must-revalidate` | service response | Every response (lib/no-store.ts) |
| `RateLimit-*` | service response | draft-8 rate-limit headers |
