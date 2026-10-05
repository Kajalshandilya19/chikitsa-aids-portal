# Phase 3: Verification and approval (State Verifier and State Approver)

**Goal:** a State Verifier picks a submitted application and compares the SOCH data with what the worker entered. They fill a checklist, may reveal the identifiers (audited), then return the application or recommend approval or rejection. A State Approver, who must be a different person, approves, rejects or returns it.

- **Acceptance:** `node scripts/acceptance/phase3.mjs` (needs Phases 1 and 2).
- **Read first:** [WORKFLOW.md](../WORKFLOW.md) WF-05..WF-10, [BUSINESS_RULES.md](../BUSINESS_RULES.md) BR-14, BR-18, BR-19, R-MC-1.

| Task | What | Service |
|---|---|---|
| T-3.1 | Migration `application_reviews` | core |
| T-3.2 | Flow rows WF-05..WF-10 in `application-flow.ts` + UT-WF | core |
| T-3.3 | Queues, review, compare, unmask endpoints | core |
| T-3.4 | Web: queues, verification screen, approval screen | web |

## 1. T-3.1 Migration

```sql
CREATE TABLE pension_core.application_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL UNIQUE REFERENCES pension_core.applications(id),
  checklist       jsonb NOT NULL,     -- { identity, aadhaar, jan_aadhaar, bank, consent, completeness } each 'OK' | 'ISSUE' | 'NA'
  remarks         text,               -- 🔒
  reviewer_id     uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

## 2. T-3.2 Flow rows

These are added to the same table as Phase 2.

| Row | From | Action | To | Extra guard |
|---|---|---|---|---|
| WF-05 | SUBMITTED, or UNDER_VERIFICATION with `picked_at` older than 24 h | `pick` | UNDER_VERIFICATION | Sets `verifier_id`, `picked_at` |
| WF-06 | UNDER_VERIFICATION | `return` | RETURNED | Caller = `verifier_id`, else 403 `E_NOT_YOUR_ITEM`; reason required |
| WF-07 | UNDER_VERIFICATION | `recommend` | RECOMMENDED | Caller = `verifier_id`; a review exists with all 6 keys (else 422 `E_CHECKLIST_INCOMPLETE`); APPROVE needs every item OK or NA (else 422 `E_CHECKLIST_ISSUES`); REJECT needs a reason. Sets `recommended_by`, `recommendation`, `recommended_at`. |
| WF-08 | RECOMMENDED | `approve` | APPROVED | Caller ≠ `recommended_by` AND ≠ `submitted_by`, else 403 `E_MAKER_CHECKER`. Sets `decided_by`, `decided_at`. |
| WF-09 | RECOMMENDED | `reject` | REJECTED | Same maker-checker guard; reason required, stored in `decision_reason` |
| WF-10 | RECOMMENDED | `return` | RETURNED | Reason required |

A RETURNED application goes back to the worker (Phase 2 rows WF-02). On resubmission, `verifier_id`, `recommendation` and the review are kept for history, but the application starts again at PENDING_SIGNOFF or SUBMITTED.

The Super Admin holds both RECOMMEND and APPROVE. That makes it the natural maker-checker test: the same person must never do both (UT-WF and AT-P3).

## 3. T-3.3 Endpoints (core)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/queues/verification` | `VERIFICATION_QUEUE_VIEW` | Query `view=unassigned\|mine\|all` (default `unassigned`), `district_id`, `center_id`, `...pageQuery`. unassigned = SUBMITTED; mine = UNDER_VERIFICATION with `verifier_id` = me; all = both. Oldest `submitted_at` first. Row = the application row + `verifier_id`, `picked_at`, `waiting_days`. |
| GET | `/queues/approval` | `APPROVAL_QUEUE_VIEW` | RECOMMENDED, oldest `recommended_at` first. Row + `recommendation`, `recommended_by`, `recommended_at`. |
| GET | `/applications/:id/review` | `APPLICATION_RECORD_VIEW` | `{ checklist, remarks, reviewer_id, updated_at } \| null` |
| PUT | `/applications/:id/review` | `APPLICATION_WORKFLOW_RECOMMEND` | Body `{ checklist: { identity, aadhaar, jan_aadhaar, bank, consent, completeness }, remarks? }`. Each key is `z.enum(['OK','ISSUE','NA'])`, all 6 required, `.strict()`. Only in UNDER_VERIFICATION and only by the picker (`E_NOT_YOUR_ITEM`). Upsert. Audit `core.application.reviewed` (add it). |
| GET | `/applications/:id/compare` | `APPLICATION_RECORD_VIEW` | Rows that put the SOCH value next to the entered value, masked, with a server-side `match` computed on the blind indexes (see below). |
| POST | `/applications/:id/unmask` | `BENEFICIARY_PII_UNMASK` | Body `{ fields: [...] }` from `jan_aadhaar`, `jan_aadhaar_member_id`, `aadhaar_for_bank`, `bank_account_number`, `contact_number`. Returns those values. Audit `core.beneficiary.pii_unmasked` with `entity_type: 'application'` and the field names. Rate limit 20 per minute per user. |

`compare` response:

```jsonc
{ "rows": [
  { "field": "aadhaar", "soch": "XXXX XXXX 2346", "entered": "XXXX XXXX 2346", "match": true },
  { "field": "contact_number", "soch": "98XXXXXX21", "entered": null, "match": null },
  { "field": "address", "soch": "House 12, Ward 4", "entered": null, "match": null },
  { "field": "patient_name", "soch": "Asha Devi", "entered": null, "match": null }
] }
```

`match` is `null` when one side is empty; otherwise equality of the `_lookup` values. The plaintext is never compared outside the DB layer.

## 4. T-3.4 Web

| Screen | Route | Gate | Content |
|---|---|---|---|
| Verification Queue | `/dashboard/verification` | `VERIFICATION_QUEUE_VIEW` | Tabs Unassigned, Mine, All; "Pick" button; waiting days column (warning tone after 7 days) |
| Verify Application | `/dashboard/applications/[id]` (same page, verifier mode) | | Two columns, "From SOCH" and "Entered by Center", from `/compare`; match icons. Checklist with 6 radio groups (OK, Issue, Not Applicable) and remarks. "Show" buttons for unmask (value visible for 30 seconds). Actions: Return (reason), Recommend Approve, Recommend Reject (reason). History timeline. |
| Approval Queue | `/dashboard/approvals` | `APPROVAL_QUEUE_VIEW` | The verifier's recommendation shown as a badge; Approve, Reject (reason), Return (reason) |

The action buttons come from `allowed_actions`. If the server answers `E_MAKER_CHECKER`, show: "You recommended this application, so another approver must decide it."

## 5. Done when

- `node scripts/acceptance/phase3.mjs`: 0 FAIL, 0 TODO.
- Phases 1 and 2 still pass.
- UT-WF covers WF-05..WF-10 and every guard.
- Docs updated.
