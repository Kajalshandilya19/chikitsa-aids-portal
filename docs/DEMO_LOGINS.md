# Demo logins (local only)

Who can log in to a local stack, and how. None of these accounts exist outside a developer machine: the dev users are created only when `APP_ENV=local`, and the demo users only by `scripts/seed-demo.mjs`.

**Passwords are never written in this repository.** Print them with:

```bash
scripts/dev.sh creds            # dev users, with DEV_USER_PASSWORD from env/local.env
scripts/dev.sh creds --reset    # also issue new temporary passwords to the demo users
```

`--reset` prints the temporary passwords and writes them to `.data/demo-logins.txt` (gitignored, readable only by you). Run it again whenever you lose them. It skips `worker.rj011` (locked) and `worker.rj012` (deactivated), so those two states stay visible.

## How to log in

1. Open http://localhost:3200/login.
2. Pick the tab:
   - **Center Login** for Center Workers and Center In-charges: choose the Center in the list (the code is in the table below), then the User ID.
   - **State / District Login** for everyone else: User ID only.
3. Type the password and the captcha answer (the sum in the image).
4. Locally `MFA_ENFORCED=false`, so State and District users get no TOTP step. See [SEED_DATA.md](SEED_DATA.md) §5 to test MFA.

## 1. Dev users (one per role)

Password: `DEV_USER_PASSWORD` in `env/local.env` (printed by `scripts/dev.sh creds`). Not forced to change it.

| User ID | Role | Tab | Center |
|---|---|---|---|
| `superadmin` | Super Admin | State / District | |
| `stateadmin` | State Admin | State / District | |
| `verifier` | State Verifier | State / District | |
| `approver` | State Approver | State / District | |
| `auditor` | Auditor | State / District | |
| `dapcu.ajmer` | District Officer, Ajmer | State / District | |
| `incharge.rj001` | Center In-charge | Center | RJ001 ART Centre, Ajmer |
| `worker.rj001` | Center Worker | Center | RJ001 ART Centre, Ajmer |
| `worker.rj002` | Center Worker | Center | RJ002 ART Centre, Alwar |

## 2. Demo users (`scripts/seed-demo.mjs`)

Password: a temporary one from `scripts/dev.sh creds --reset`. The first login asks for a new password and an OTP; the OTP is in `.logs/auth.log` (`SMS_PROVIDER=log`). Names and mobiles are fictitious.

| User ID | Name | Role | Tab | Center |
|---|---|---|---|---|
| `verifier.meena` | Sunita Meena | State Verifier | State / District | |
| `approver.sharma` | Rakesh Sharma | State Approver | State / District | |
| `auditor.joshi` | Pooja Joshi | Auditor | State / District | |
| `dapcu.jaipur` | Mahesh Saini | District Officer, Jaipur | State / District | |
| `dapcu.jodhpur` | Kavita Bishnoi | District Officer, Jodhpur | State / District | |
| `dapcu.udaipur` | Dinesh Rawat | District Officer, Udaipur | State / District | |
| `dapcu.kota` | Rekha Hada | District Officer, Kota | State / District | |
| `dapcu.bikaner` | Gopal Choudhary | District Officer, Bikaner | State / District | |
| `worker.rj003` .. `worker.rj010` | | Center Worker | Center | RJ003 .. RJ010 (same number as the User ID) |
| `incharge.rj003` .. `incharge.rj012` | | Center In-charge | Center | RJ003 .. RJ012 (same number as the User ID) |
| `worker.rj011` | Pushpa Yadav | Center Worker | Center | RJ011, **locked** for 15 minutes after the seed (5 wrong passwords) |
| `worker.rj012` | Neha Khatri | Center Worker | Center | RJ012, **deactivated** (login is refused) |

## 3. If a login fails

| Message | Why | Fix |
|---|---|---|
| The Center Code, User ID or password is incorrect. | wrong password, wrong tab, or wrong Center | check the tables above |
| Your account is locked after too many failed attempts. | 5 wrong passwords | wait 15 minutes, or `stateadmin` calls `POST /users/:id/unlock` |
| Your account is inactive. | `worker.rj012`, on purpose | use another user |
| Nothing in the Center list | auth-service is down | `scripts/dev.sh status`, then `scripts/dev.sh start auth` |

Running the smoke or acceptance scripts adds `smoke.*` users and RJ5xx to RJ9xx Centers. Reset with `scripts/dev.sh reset-db`, then `scripts/dev.sh seed` and `node scripts/seed-demo.mjs`.
