# Business rules

Each rule is enforced on the server. Code comments and tests cite these ids. "✓" means built and tested.

## Accounts and login (BR-A)

| Id | Rule | Where | Status |
|---|---|---|---|
| BR-A1 | A STATE-scope assignment has no district and no Center | user.service resolvePlace | ✓ |
| BR-A2 | A DISTRICT-scope assignment has a district and no Center | same | ✓ |
| BR-A3 | A CENTER-scope assignment has a Center; its district is the Center's district (moves with it) | same, master.service | ✓ |
| BR-A4 | Only active Districts and Centers can receive assignments; a deactivated Center blocks login into it and ends its sessions | same | ✓ |
| BR-A5 | Switching into a role that needs MFA requires a session that passed MFA | auth.service switchAssignment | ✓ |
| BR-A6 | Center roles log in only with the matching Center Code; a wrong Center Code is the generic "invalid credentials" error and counts as a failed attempt | auth.service login | ✓ |
| BR-A7 | 5 failed attempts lock the account for 15 minutes (PASSWORD_MAX_FAILED, LOCKOUT_MIN) | auth.service | ✓ |

## User administration (BR-U)

| Id | Rule | Status |
|---|---|---|
| BR-U1 | User ID (V-002) is unique and never changes | ✓ |
| BR-U2 | Mobile is unique (blind index) | ✓ |
| BR-U3 | A new user gets a temporary password shown ONCE, and must change it with an SMS OTP at first login | ✓ |
| BR-U4 | Only a Super Admin assigns STATE roles. Others with `USER_ASSIGNMENT_MANAGE` assign DISTRICT and CENTER roles made of delegable permissions only | ✓ |
| BR-U5 | A user holding any STATE assignment is edited, reset, deactivated or re-assigned only by a Super Admin | ✓ |
| BR-U6 | Nobody deactivates, unlocks, resets or re-assigns their own account through the admin screens | ✓ |

## Masters (BR-M)

| Id | Rule | Status |
|---|---|---|
| BR-M1 | Center Code (V-003) is unique and never changes | ✓ |
| BR-M2 | A SOCH facility code belongs to at most one Center | ✓ |
| BR-M3 | Moving a Center to another district moves its assignments; Phase 1 must also move its beneficiaries' `district_id` | ✓ (assignments) |
| BR-M4 | Deactivating a Center revokes the sessions logged into it | ✓ |

## Applications (BR-1x, from SRD §22)

| Id | Rule | Phase |
|---|---|---|
| BR-10 | One beneficiary has at most one active application (SRD §22.1) | P2 |
| BR-11 | Consent must be YES to submit (HIV/AIDS Act, research) | P2 |
| BR-12 | Workers edit only the worker-editable fields of FIELD_DICTIONARY.md; SOCH fields are read-only for everyone (SRD §22.3, §22.4) | P2 |
| BR-13 | Approval is required before a PPO (SRD §22.6) | P4 |
| BR-14 | Returned applications can be corrected and resubmitted; rejected ones cannot (SRD §12, §22.8) | P3 |
| BR-15 | The whole status history is kept forever (SRD §22.9) | P2 |
| BR-16 | A beneficiary whose ART status is DIED cannot get a new application | P2 |
| BR-17 | A beneficiary whose latest application was REJECTED cannot get a new one in the portal until a reconsideration process exists (Q-18) | P2 |
| BR-18 | Recommend needs a complete checklist; recommending APPROVE needs every item OK or NA | P3 |
| BR-19 | A verifier works only on applications they picked; another verifier may take over an item untouched for 24 hours | P3 |

## PPO (BR-P)

| Id | Rule | Phase |
|---|---|---|
| BR-P1 | A PPO number is unique across the system (DB unique index) | P4 |
| BR-P2 | In SYSTEM mode the number comes from the `ppo.number_pattern` setting and an atomic sequence (lib/sequence-counter.ts) | P4 (pattern validation ✓) |
| BR-P3 | A generated PPO is immutable; a correction needs `PPO_RECORD_CORRECT`, a reason, and is audited | P4 |

## Imports (BR-I)

| Id | Rule | Status |
|---|---|---|
| BR-I1 | A batch is committed at most once, only by a holder of the commit permission, only while VALIDATED | ✓ |
| BR-I2 | Only VALID rows are written; ERROR and DUPLICATE rows are reported and skipped | ✓ |
| BR-I3 | A SOCH re-import changes SOCH fields only and never pension fields | P1 |
| BR-I4 | Staged rows are deleted after IMPORT_STAGE_RETENTION_DAYS; unconfirmed batches older than that are cancelled | ✓ (purge job) |
