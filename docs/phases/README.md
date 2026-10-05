# Phase guides

One guide per phase. Each guide is the **contract** for that phase:

- the exact tables (SQL);
- the endpoints with their request and response JSON;
- the step-by-step logic;
- the screens;
- the tests to write.

Each phase also has an **acceptance script**, written against the same contract **before** the code exists.

| Phase | Guide | Acceptance | Depends on |
|---|---|---|---|
| 0 | (built) see [../ROADMAP.md](../ROADMAP.md) | `scripts/dev.sh smoke` | |
| 0b | [PHASE_0B_ADMIN_SCREENS.md](PHASE_0B_ADMIN_SCREENS.md) | manual checks in the guide | 0 |
| 1 | [PHASE_1_SOCH_BENEFICIARIES.md](PHASE_1_SOCH_BENEFICIARIES.md) | `scripts/dev.sh acceptance 1` | 0b |
| 2 | [PHASE_2_APPLICATION.md](PHASE_2_APPLICATION.md) | `scripts/dev.sh acceptance 2` | 1 |
| 3 | [PHASE_3_VERIFICATION.md](PHASE_3_VERIFICATION.md) | `scripts/dev.sh acceptance 3` | 2 |
| 4 | [PHASE_4_PPO.md](PHASE_4_PPO.md) | `scripts/dev.sh acceptance 4` | 3 |
| 5 | [PHASE_5_PAYMENTS_REPORTS.md](PHASE_5_PAYMENTS_REPORTS.md) | `scripts/dev.sh acceptance 5` | 4 |
| 6 | [PHASE_6_HARDENING.md](PHASE_6_HARDENING.md) | checklist in the guide | 5 |

## How to work through a phase

1. **Read the guide end to end before writing code.** Write down every question; ask them in one go.
2. **Run the acceptance script with `--allow-todo`.** Every check shows TODO: that is your task list.
3. **Do the tasks in the guide's order**, one branch and one PR each (`phase<N>/<task>`).
   - Start a migration with `node scripts/new-migration.mjs <svc> <name>`.
   - Start an API module with `node scripts/scaffold-module.mjs <svc> <module>`.
4. **After each task**, run:
   - `scripts/dev.sh check`
   - `scripts/dev.sh smoke`
   - the acceptance script with `--allow-todo`

   The number of TODOs must go down, and FAIL must stay at 0.
5. **The phase is done** when the acceptance script passes WITHOUT `--allow-todo`:
   - 0 failed, 0 todo;
   - the acceptance scripts of the earlier phases still pass;
   - the guide's "Done when" list is ticked.

## Reading the acceptance output

| Line | Meaning |
|---|---|
| `PASS` | The contract holds |
| `FAIL` | The endpoint exists but behaves differently from the guide. Fix the code, not the test. If you believe the test is wrong, ask the reviewer; a test changes only together with the guide. |
| `TODO` | The route is not built yet (the service answered "route not found"), or a step was skipped because an earlier one is missing |
| `BLOCKED` | A setup flow (`scripts/lib/flows.mjs`) failed: something this phase depends on is missing |

## Changing a contract

A contract changes only in a reviewed PR that updates the guide AND the acceptance script together. Record the reason in the PR description. Never weaken a check to make it pass.
