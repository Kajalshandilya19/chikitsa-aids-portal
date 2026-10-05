# Application workflow (built in Phases 2 and 3)

The status machine of a pension application. The service will implement it as ONE table in `pension-core-service/src/domain/application-flow.ts`, holding `(from, action) -> to`, the permission, and whether a reason is required. Routes and the UI read that table; nobody hard-codes a transition anywhere else.

## 1. Statuses

| Status | Meaning | Who can edit the form |
|---|---|---|
| `DRAFT` | Started by the worker, not submitted | Worker |
| `PENDING_SIGNOFF` | Submitted by the worker, waiting for the Center In-charge | nobody |
| `SUBMITTED` | Signed off, waiting in the State verification queue | nobody |
| `UNDER_VERIFICATION` | Picked by a State Verifier | nobody |
| `RECOMMENDED` | Verifier recommended approval or rejection, waiting for the Approver | nobody |
| `RETURNED` | Sent back for correction (by the In-charge, Verifier or Approver) | Worker |
| `APPROVED` | Approved, waiting for the PPO | nobody |
| `PPO_GENERATED` | PPO number assigned; payments can be recorded | nobody (PPO correction is separate) |
| `REJECTED` | Final | nobody |

"Active" means any status except `REJECTED` (BR-11). This is enforced by a partial unique index on `beneficiary_id` where the status is not `REJECTED`.

## 2. Transitions

```
DRAFT ──submit──▶ PENDING_SIGNOFF ──signoff──▶ SUBMITTED ──pick──▶ UNDER_VERIFICATION ──recommend──▶ RECOMMENDED ──approve──▶ APPROVED ──generate_ppo──▶ PPO_GENERATED
  ▲                    │ return_to_worker                               │ return                         │ return / reject
  │                    ▼                                                ▼                                ▼
  └──────resubmit── RETURNED ◀──────────────────────────────────────────┘                             REJECTED
```

| Id | From | Action | To | Permission | Reason required | Extra rule |
|---|---|---|---|---|---|---|
| WF-01 | DRAFT | `submit` | PENDING_SIGNOFF, or SUBMITTED when the setting `workflow.center_signoff_required` is false | `APPLICATION_WORKFLOW_SUBMIT` | no | Every required field is filled; consent = YES (BR-11) |
| WF-02 | RETURNED | `submit` | as WF-01 | `APPLICATION_WORKFLOW_SUBMIT` | no | as WF-01 |
| WF-03 | PENDING_SIGNOFF | `signoff` | SUBMITTED | `APPLICATION_WORKFLOW_SIGNOFF` | no | The signer is not the submitter (R-MC-1) |
| WF-04 | PENDING_SIGNOFF | `return_to_worker` | RETURNED | `APPLICATION_WORKFLOW_RETURN_TO_WORKER` | yes (V-015) | |
| WF-05 | SUBMITTED, or UNDER_VERIFICATION picked more than 24 hours ago (takeover, BR-19) | `pick` | UNDER_VERIFICATION | `APPLICATION_WORKFLOW_PICK` | no | Sets `verifier_id` = the caller, `picked_at` = now |
| WF-06 | UNDER_VERIFICATION | `return` | RETURNED | `APPLICATION_WORKFLOW_RETURN` | yes | Only the verifier who picked it (BR-19) |
| WF-07 | UNDER_VERIFICATION | `recommend` | RECOMMENDED | `APPLICATION_WORKFLOW_RECOMMEND` | yes when recommending rejection | Only the picker (BR-19); checklist complete (BR-18); body `{ recommendation: APPROVE \| REJECT }` |
| WF-08 | RECOMMENDED | `approve` | APPROVED | `APPLICATION_WORKFLOW_APPROVE` | no | The approver is not the recommender (R-MC-1) |
| WF-09 | RECOMMENDED | `reject` | REJECTED | `APPLICATION_WORKFLOW_REJECT` | yes | The approver is not the recommender |
| WF-10 | RECOMMENDED | `return` | RETURNED | `APPLICATION_WORKFLOW_RETURN` | yes | |
| WF-11 | APPROVED | `generate_ppo` | PPO_GENERATED | `PPO_RECORD_GENERATE` (or `_MANUAL_ASSIGN` in MANUAL mode) | no | BR-P1..P3 |

Every transition, in ONE transaction:

1. checks the application is in scope (`assertInScope`), the from-status matches, and the permission is held;
2. updates the status with `WHERE status = <from>`. If 0 rows change, answer 409 E_CONFLICT; another user acted first;
3. inserts a row in `application_status_history` (from, to, action, actor, role, reason, at);
4. writes the audit event `core.application.transition`.

## 3. Business events that are not transitions

| Event | Effect |
|---|---|
| SOCH re-import moves the beneficiary to another Center | Open application: `center_id` and `district_id` follow; flag `center_changed = true`; the history row records the move (FR-24) |
| SOCH re-import sets ART status DIED | No new application can be created; an existing PPO is flagged `payment_review = true`; nothing is cancelled automatically (research note) |
| SOCH UID conflict or merge | The beneficiary goes to the import review list (`IMPORT_REVIEW_RESOLVE`) and nothing is overwritten (FR-23) |
