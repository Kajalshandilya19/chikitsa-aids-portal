# Seed data

Seed data is defined IN CODE and loaded by `scripts/dev.sh seed` locally, or by the auth seed Job in Kubernetes. Every placeholder is marked as one, both in the data and here. Replacing a placeholder with the department's real data is an import or a setting change, never a code edit.

| # | What | Where in code | Loaded | Placeholder? |
|---|---|---|---|---|
| 1 | Permission catalogue (57) and 8 role templates | auth `src/domain/permissions.ts` | every seed (rbac sync, idempotent) | no |
| 2 | 41 Rajasthan districts with LGD codes and Hindi names | auth `src/dev/seed/districts.ts` | every seed; existing rows are kept | no (verify, Q-03) |
| 3 | Centers RJ001 to RJ041, one per district | auth `src/dev/seed/centers.ts` | only when the centers table is empty | **yes** (`is_placeholder = true`, Q-04) |
| 4 | Synthetic SOCH Excel file | data `src/dev/make-soch-fixture.ts` → `fixtures/soch-sample.xlsx` | `npm run fixture:soch` | **yes**, the column layout too (Q-01) |
| 5 | Dev users, one per role | auth `src/dev/seed/dev-users.ts` | only when `APP_ENV=local` | local only |
| 6 | Portal settings (PPO pattern, pension amount, consent text, ...) | core `src/domain/settings.ts` | defaults live in code; no rows | **yes**, see API_CORE.md §1 (Q-05, Q-06, Q-08) |

## 1a. Demo data for a walkthrough (local only)

`node scripts/seed-demo.mjs`, after `scripts/dev.sh seed`, creates its data through the real APIs and is idempotent:

- 8 Link ART Centres (RJ042..RJ049) by a committed Center import;
- a Center import left waiting for confirmation with typical row errors, and one rejected file;
- District Officers for Jaipur, Jodhpur, Udaipur, Kota and Bikaner (`dapcu.<district>`);
- a worker and an in-charge for RJ003..RJ012 (`worker.rj003`, `incharge.rj003`, ...);
- extra State users (`verifier.meena`, `approver.sharma`, `auditor.joshi`);
- one deactivated user (`worker.rj012`) and one locked user (`worker.rj011`).

These users have temporary passwords and must change them at first login (the OTP appears in `.logs/auth.log`). `scripts/dev.sh creds --reset` issues and prints them; every login is listed in [DEMO_LOGINS.md](DEMO_LOGINS.md). For a quick look, use the dev users of §5. Names and mobiles are fictitious.

## 2. Districts

- **Source:** `Chikitsa-Raj-Workspace/scripts/ihms-import/geography/data/lgd_districts.json` (LGD codes) and `hindi-names.json`.
- **Jaipur:** LGD 102 is added by hand. IHMS splits it into "Jaipur I" and "Jaipur II", which are health administration units.
- **Count:** 41 districts, the count after the December 2024 reorganisation.
- **District `code`:** the uppercase English name, e.g. `SAWAI_MADHOPUR`.

## 3. Replacing the placeholder Centers with the RSACS list

1. Log in as `stateadmin`.
2. Go to **Masters > Centers > Bulk Import** and download the template. (That screen is Phase 0b, T-0b.2. Before it exists, use `GET /data/api/v1/imports/templates/centers`, then `POST /data/api/v1/imports/centers` and `POST /imports/:id/commit`, as `scripts/seed-demo.mjs` does.)
3. Fill one row per Center:
   - Center Code
   - Center Name, and the Hindi name if available
   - District LGD Code (listed on the Districts page)
   - Center Type (ART, LAC, COE or OTHER)
   - SOCH Facility Code, as it appears in SOCH exports
4. Upload the file, check the preview (errors are listed per row), then **Confirm Import**.
5. A row whose code matches a placeholder (e.g. `RJ001`) updates it and clears the placeholder flag. Placeholders not in the list stay: deactivate them on the Centers page.
6. Users assigned to a deactivated Center cannot log in there until they are re-assigned.

## 4. SOCH fixture

The fixture is described in [SOCH_IMPORT_SPEC.md](SOCH_IMPORT_SPEC.md) §5. It has no valid Aadhaar, mobile or ABHA numbers. Regenerate it whenever `soch-columns.ts` changes.

## 5. Dev users (local only)

Every dev user's password is `DEV_USER_PASSWORD` from `env/local.env` (`scripts/dev.sh creds` prints it). Dev users are not forced to change it.

| User ID | Role | Center Code at login | Place |
|---|---|---|---|
| `superadmin` | Super Admin | none | State |
| `stateadmin` | State Admin | none | State |
| `verifier` | State Verifier | none | State |
| `approver` | State Approver | none | State |
| `auditor` | Auditor | none | State |
| `dapcu.ajmer` | District Officer | none | Ajmer (LGD 86) |
| `incharge.rj001` | Center In-charge | `RJ001` | RJ001 (Ajmer) |
| `worker.rj001` | Center Worker | `RJ001` | RJ001 (Ajmer) |
| `worker.rj002` | Center Worker | `RJ002` | RJ002 (Alwar) |

Locally `MFA_ENFORCED=false`, so State and District users log in without TOTP. To test MFA, run auth-service with `MFA_ENFORCED=true`. The first login then shows the enrolment QR.

Fictitious mobiles in the `90000000xx` range are used.

The smoke scripts change local data:

- they add Centers RJ5xx to RJ9xx and a `smoke.*` user;
- they rename RJ002.

Reset with `scripts/dev.sh reset-db` when needed.
