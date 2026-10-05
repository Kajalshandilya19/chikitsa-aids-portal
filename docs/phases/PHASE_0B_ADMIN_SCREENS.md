# Phase 0b: admin screens (web only)

**Goal:** the State Admin and Super Admin manage Districts, Centers, Users, Roles, Imports and the Audit Log from the web app. Every API these screens need is already built and covered by `scripts/dev.sh smoke`; this phase is web work only.

**This document is the contract.** Where it and another doc disagree, ask the reviewer; do not pick one silently.

- **Read first:** [UI_GUIDELINES.md](../UI_GUIDELINES.md) (all of it), [web/pension-web/README.md](../../web/pension-web/README.md), [HOWTO.md](../HOWTO.md) F, [API_AUTH.md](../API_AUTH.md) §4 to §7, [API_DATA.md](../API_DATA.md) §1 to §4.
- **Already there:** the shell (sidebar, header, access guard), Profile, an empty Dashboard; the generic components `ServerDataTable`, `useServerTable`, `FilterCombobox`, `BulkUploadSheet`, `ConfirmDialog`/`useConfirm`, `ToneBadge`, `ActiveBadge`, `useMasters`; `config/audit-actions.ts`; and the message namespaces `districts`, `centers`, `users`, `roles`, `imports`, `audit` in both `en.json` and `hi.json`. Reuse the keys; add new ones to both files.
- **Not allowed:** new API endpoints, changes to services, or browser storage (R-PII-5).

## 0. Task order

One PR per task (branch `phase0b/<task>`). After each, `npm run typecheck && npm run lint && npm run build` in `web/pension-web` and the manual checks of the task.

| Task | Screen | Route | Nav (`config/nav.ts`) | Page type |
|---|---|---|---|---|
| T-0b.1 | Districts | `/dashboard/masters/districts` | group `masters`, `P.MASTER_DISTRICT_VIEW` | List, inline edit dialog |
| T-0b.2 | Centers | `/dashboard/masters/centers` | group `masters`, `P.MASTER_CENTER_VIEW` | List + form dialog + import sheet |
| T-0b.3 | Users | `/dashboard/users` | group `administration`, `P.USER_ACCOUNT_VIEW` | List + form dialogs |
| T-0b.4 | Roles, Role detail | `/dashboard/roles`, `/dashboard/roles/[id]` | group `administration`, `P.ROLE_CATALOGUE_VIEW` | List, Detail |
| T-0b.5 | Imports | `/dashboard/imports` | group `administration`, `P.IMPORT_BATCH_VIEW` or `P.IMPORT_CENTER_UPLOAD` | List + drawer |
| T-0b.6 | Audit Log | `/dashboard/audit` | group `administration`, `P.AUDIT_LOG_VIEW` | List + verify button |

The nav groups are collapsible groups (`items: [...]`), as in Chikitsa-Raj. Use `IconBuildingHospital`-style tabler icons in their `*Filled` variant where one exists (UI_GUIDELINES §8). Add the group labels `nav.items.masters` and `nav.items.administration` to both message files.

## 1. T-0b.1 Districts

- `GET /auth/api/v1/districts` (all 41; no paging). Columns: LGD Code, Name, Hindi Name, Code, Status (`ActiveBadge`).
- Search box filters on the client (41 rows).
- Row action **Edit** (only with `P.MASTER_DISTRICT_EDIT`): dialog for `name_hi` and `is_active`, `PATCH /districts/:id`.
- Check: `auditor` sees the list without the Edit action; a District Officer gets the 403 panel.

## 2. T-0b.2 Centers

- `GET /auth/api/v1/centers` through `useServerTable`, filters: search (`q`), District (`FilterCombobox` over `useMasters().districts`, only with `P.MASTER_DISTRICT_VIEW`), Status (`is_active`). Sortable by the `sort` keys API_AUTH §4 lists.
- Columns: Code, Name (Hindi below in small text), District, Type, SOCH Facility Code, Status (`ActiveBadge`, plus a neutral "Placeholder" `ToneBadge` when `is_placeholder`), actions.
- **Add Center** (`P.MASTER_CENTER_CREATE`) and **Edit** (`P.MASTER_CENTER_EDIT`): one dialog, fields in this order: Center Code (create only), Center Name, Center Name (Hindi), District, Center Type, SOCH Facility Code. Schema from `@/lib/shared/validators`, using the V-rules API_AUTH §4 names for each field.
- **Activate / Deactivate** (`P.MASTER_CENTER_EDIT`) through `useConfirm`.
- **Bulk Import** (`P.IMPORT_CENTER_UPLOAD`): `BulkUploadSheet` with the columns of API_DATA §4, template from `GET /data/api/v1/imports/templates/centers`, upload to `POST /data/api/v1/imports/centers`, row errors on the grid cells, then Confirm (`POST /imports/:id/commit`, `P.IMPORT_CENTER_COMMIT`) or Cancel (`POST /imports/:id/cancel`).
- Check: the import of [SEED_DATA.md](../SEED_DATA.md) §3 works end to end.

## 3. T-0b.3 Users

- `GET /auth/api/v1/users`, filters as API_AUTH §5 lists them: search (`q`, sent only in the BFF API query string, never in the page URL, because it may be a mobile number), Role (`role_code`), District, Center. The list API has no sort: do not offer sorting.
- Columns: User ID, Name, Mobile (masked as sent), E-mail (masked), Assignments (role · place, one line each), Status (active, inactive, locked), Last Login, actions.
- **Add User** (`P.USER_ACCOUNT_CREATE`): User ID, Full Name, Mobile, E-mail, first assignment (Role, then District or Center depending on the role's scope). On success show the temporary password ONCE in a dialog with a copy button; never store it.
- **Edit** (`P.USER_ACCOUNT_EDIT`): never pre-fill mobile or e-mail (only masked values exist); blank keeps the current value.
- **Assignments** (`P.USER_ASSIGNMENT_MANAGE`), **Reset Password** (`P.USER_ACCOUNT_PASSWORD_RESET`, shows the temporary password once), **Unlock** and **Activate / Deactivate** (both `P.USER_ACCOUNT_ACTIVATE`).
- Roles offered in the forms are only those `canAssignRole` allows (the API refuses the rest; read [RBAC_PERMISSION_MATRIX.md](../RBAC_PERMISSION_MATRIX.md)).
- Check: `stateadmin` creates a worker for RJ003; `worker.rj011` shows Locked and Unlock clears it.

## 4. T-0b.4 Roles

- List: `GET /auth/api/v1/roles`. Columns: Name, Scope (`scope_level`), MFA Required, Permissions (`permission_count`).
- Detail: `GET /roles/:id` and `GET /permissions`. Permissions grouped by module, each a `Switch`. Save with `PUT /roles/:id/permissions` only with `P.ROLE_PERMISSIONS_EDIT`; otherwise read-only. Disable a permission whose `allowed_scopes` does not include the role's scope (the API refuses it).
- Check: as `auditor` the switches are disabled; as `superadmin` a change is saved and appears in the Audit Log.

## 5. T-0b.5 Imports

- `GET /data/api/v1/imports`, filters: Kind, Status. Columns: File, Kind, Status (`ToneBadge`), Counts (create / update / error), Uploaded By, Uploaded At.
- A row opens a drawer: summary, then the rows (`GET /imports/:id/rows`, 100 per page) with action, values and errors. A `VALIDATED` batch shows Confirm and Cancel, gated by the kind's commit permission (`P.IMPORT_CENTER_COMMIT`, `P.IMPORT_SOCH_COMMIT`).
- Check: the pending batch from `scripts/seed-demo.mjs` shows its 4 row errors.

## 6. T-0b.6 Audit Log

- `GET /auth/api/v1/audit`, filters: Action (`config/audit-actions.ts`), Outcome, From and To dates (native date input, `pastDate` V-016). Columns: Time, Actor Role, Action, Entity, Outcome, Chain.
- **Verify Integrity** (`P.AUDIT_CHAIN_VERIFY`): `GET /audit/verify`, one line per chain, OK or `broken_at_seq`.
- Check: after T-0b.4's role change, the event is listed; Verify shows all chains OK.

## 7. Done when

- [ ] All six screens are in the sidebar for `superadmin`, and each shows the 403 panel to a role without its permission (TEST_PLAN MT-04).
- [ ] Every string is in `en.json` and `hi.json`; no em dashes; labels in Title Case.
- [ ] No personal data in any URL, title or tooltip; masked values shown as sent.
- [ ] `scripts/dev.sh check` passes; `scripts/dev.sh smoke` still passes.
- [ ] The phone layout (360px wide) works for every list: the table scrolls horizontally inside its card, the page never does.
