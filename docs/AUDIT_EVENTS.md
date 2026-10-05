# Audit events

Source: the `AUDIT` object in [lib/audit.ts](../services/pension-auth-service/src/lib/audit.ts). Storage and integrity: [SECURITY.md](SECURITY.md) S-AUD.

Every row automatically carries:

- service (= chain), sequence number and hash;
- actor user id and role, session id;
- request id and IP;
- district and center (when known);
- time.

The `data` column lists only ids, codes, counts and FIELD NAMES (R-AUDIT-1).

| Action | Written by | When | `data` |
|---|---|---|---|
| `auth.login.success` | auth | Session started | role, mfa |
| `auth.login.failure` | auth | Unknown user, wrong password, wrong Center, inactive | reason, failed_count |
| `auth.login.locked` | auth | The failure that locks the account | failed_count |
| `auth.mfa.enrolled` / `auth.mfa.failure` | auth | First TOTP success / wrong TOTP | |
| `auth.session.logout` / `auth.session.switch` / `auth.session.replay_detected` | auth | | from, to (switch) |
| `auth.password.changed` / `reset_requested` / `reset_done` / `reset_by_admin` | auth | | |
| `auth.user.created` / `updated` / `activated` / `deactivated` / `unlocked` | auth | Admin actions | user_code, fields |
| `auth.assignment.added` / `removed` | auth | | assignment_id, role |
| `auth.role.permissions_changed` | auth | Super Admin edit | role, added[], removed[] |
| `auth.district.updated`, `auth.center.created` / `updated` / `activated` / `deactivated` / `imported` | auth | Masters | code, fields, counts |
| `auth.audit.chain_verified` | auth | GET /audit/verify | chains and results |
| `core.settings.updated` | core | PUT /settings/:key | (key in entity_id) |
| `core.beneficiary.viewed`, `core.beneficiary.pii_unmasked` | core (P1) | Detail view, unmask | fields revealed |
| `core.application.created` / `updated` / `transition` | core (P2-3) | | from, to, action, fields |
| `core.document.uploaded` / `viewed` | core (P2) | | kind |
| `core.ppo.generated` / `corrected` / `printed` | core (P4) | | ppo id, field |
| `core.payment.recorded` | core (P5) | | period, status |
| `data.import.uploaded` / `committed` / `cancelled` / `file_rejected` | data | Import pipeline | kind, counts, error code |
| `data.export.created` / `downloaded` | data (P5) | | report, filters (codes only), format, masked or not |

Planned actions that later phases add to `AUDIT` (named in the phase guides):

| Action | Phase |
|---|---|
| `core.beneficiary.imported`, `core.import_review.resolved` | 1 |
| `core.application.edit_opened` | 2 |
| `core.application.reviewed` | 3 |
| `core.search.performed` (never the query text) | 5 |

Adding an action:

1. Add it to `AUDIT` in `lib/audit.ts`. Use the shape `<service>.<entity>.<verb>`, lowercase with underscores; the database CHECK enforces it.
2. Run `scripts/sync-lib.sh`.
3. Add a row above.
