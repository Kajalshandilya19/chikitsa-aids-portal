# Product specification

Consolidated from the department's SRD ([reference/HIV_Pension_Portal_SRD.docx](reference/HIV_Pension_Portal_SRD.docx)) and the SRS blueprint ([reference/HIV_Pension_Portal_SRS_Blueprint.docx](reference/HIV_Pension_Portal_SRS_Blueprint.docx)).

- The SRD is the primary source. "SRD §n" points at it.
- Where the SRD says "to be finalized", the requirement has an id in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) and a documented default.
- The technology the SRD proposes (PHP, Apache, MariaDB) is **not used**. See [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. What the portal is, and is not

**It is** a pension-processing workflow layer on top of SOCH data:

- SOCH (NACO's system) stays the source of HIV programme data.
- The portal never replaces SOCH.
- It is not a citizen-facing portal.
- No beneficiary logs in. Only staff do.

**Out of scope until the department decides otherwise:**

- citizen self-registration
- a SOCH API
- DBT or payment-gateway integration
- SJMS or Jan Soochna publication
- e-Mitra or SSO login
- an eligibility or pension-amount engine
- grievance handling

The questions are Q-13 and Q-08.

## 2. Users and places

| Role | Scope | SRD | Purpose |
|---|---|---|---|
| Super Admin | State | (added) | Technical administration: State-level users, role permissions, settings |
| State Admin | State | SRD §2.1 "Admin" | RSACS administration: Centers, users below State, SOCH import, payments, reports |
| State Verifier | State | SRD §11, split by decision | Checks applications, returns them or recommends |
| State Approver | State | SRD §11, §13, split by decision | Approves or rejects, generates the PPO, records payments |
| Auditor | State | blueprint §4 | Read-only audit log and reports |
| District Officer (DAPCU) | District | (added by decision) | Read-only view of their district |
| Center In-charge | Center | (added by decision) | Signs off or returns the Center's applications before they go to the State |
| Center Worker | Center | SRD §2.2 | Fills and submits applications for the Center's beneficiaries |

Places form a hierarchy: State (Rajasthan), then 41 Districts, then HIV/ART Centers (code such as `RJ001`), then beneficiaries. Permissions per role: [RBAC_PERMISSION_MATRIX.md](RBAC_PERMISSION_MATRIX.md).

## 3. Functional requirements

`Phase` is when it is delivered ([ROADMAP.md](ROADMAP.md)). `P0 ✓` means it is built and tested.

### 3.1 Access

| Id | Requirement | Source | Phase |
|---|---|---|---|
| FR-01 | Personal staff accounts. Center roles log in with Center Code, User ID and password; State and District roles with User ID and password. A captcha is required on every login. | SRD §2.2, decision | P0 ✓ |
| FR-02 | TOTP (authenticator app) for State and District roles | blueprint §17 | P0 ✓ |
| FR-03 | Temporary password at account creation; the user must change it with an SMS OTP at first login | SRD §23.14 (default) | P0 ✓ (SMS gateway Q-15) |
| FR-04 | Forgot password with captcha and SMS OTP | SRD §23.14 | P0 ✓ (SMS gateway Q-15) |
| FR-05 | Lockout after 5 wrong passwords for 15 minutes; the admin can unlock | SRD §19 | P0 ✓ |
| FR-06 | A worker sees only their Center; a District Officer only their District; State roles everything. Enforced on the server. | SRD §2.2, §4, §19 | P0 ✓ (masters), and in every later phase |
| FR-07 | A user with several assignments picks one at login and can switch | decision | P0 ✓ |
| FR-08 | Session: 15-minute access tokens, 30-minute idle timeout, 8-hour maximum, logout | blueprint §17 | P0 ✓ |

### 3.2 Masters and administration

| Id | Requirement | Source | Phase |
|---|---|---|---|
| FR-10 | District master (41, LGD codes, Hindi names) | blueprint §5 | P0 ✓ |
| FR-11 | Center master: unique code, district, type, SOCH facility code, active flag | SRD §4 | P0 ✓ |
| FR-12 | Bulk import of the Center list from Excel or CSV | SRD §23.2 | P0 ✓ |
| FR-13 | User management: create, edit, activate or deactivate, unlock, reset password, assign roles | SRD §2 | P0 ✓ |
| FR-14 | Role permission editing by the Super Admin | decision | P0 ✓ |
| FR-15 | Portal settings: PPO format, pension amount, consent text, sign-off step | SRD §13, §23 | P0 ✓ (values are placeholders) |

### 3.3 SOCH import and beneficiaries

| Id | Requirement | Source | Phase |
|---|---|---|---|
| FR-20 | Upload a SOCH Excel file, then validate it, preview it, confirm it, and keep the batch history | SRD §3, blueprint §6.1 | P1 (pipeline P0 ✓) |
| FR-21 | Map beneficiaries to Centers by SOCH facility code | SRD §4 | P1 |
| FR-22 | Re-import updates SOCH fields only and never touches pension data | blueprint §6.1 (10) | P1 |
| FR-23 | Match on UID, then PID, then Beneficiary ID. Conflicts and merged UIDs go to a review list. | research, Q-02 | P1 |
| FR-24 | Center transfer: an open application follows the beneficiary and is flagged | research | P1 |
| FR-25 | Beneficiary list with search (UID, ART No, name, Beneficiary ID, PPO No) and application status | SRD §6 | P1 |
| FR-26 | SOCH fields are read-only for every user | SRD §8 | P1 |
| FR-27 | Identifiers are masked in lists; the full value is shown only to roles with the unmask permission, and every view is audited | SRD §19 | P1 |

### 3.4 Pension application

| Id | Requirement | Source | Phase |
|---|---|---|---|
| FR-30 | Application form with the 20 SRD fields; editable fields limited to the SRD §8 list | SRD §7, §8 | P2 |
| FR-31 | Consent Yes/No with version, language and time; Yes is required to submit | SRD §9, research | P2 |
| FR-32 | Optional consent document upload (PDF or image, private storage) | SRD §9 | P2 |
| FR-33 | Bank name, account number, IFSC (format-checked) | SRD §9 | P2 |
| FR-34 | Only one active application per beneficiary | SRD §10, §22.1 | P2 |
| FR-35 | Draft, then submit, then Center In-charge sign-off or return | SRD §10, decision | P2 |

### 3.5 Verification and approval

| Id | Requirement | Source | Phase |
|---|---|---|---|
| FR-40 | Verification queue, with SOCH and entered data side by side, checklist and history | SRD §11, blueprint §22 | P3 |
| FR-41 | Return with a reason, then correct and resubmit | SRD §11 | P3 |
| FR-42 | The Verifier recommends; the Approver approves or rejects with a reason. The recommender cannot approve the same application. | SRD §11-12, decision | P3 |
| FR-43 | A rejected application is final and keeps its reason | SRD §12 | P3 |
| FR-44 | Full status history of every application | SRD §22.9 | P2 to P3 |

### 3.6 PPO, payments, reports

| Id | Requirement | Source | Phase |
|---|---|---|---|
| FR-50 | PPO number assigned after approval, unique, immutable (a correction needs a separate permission) | SRD §13 | P4 |
| FR-51 | PPO sheet: view, print, PDF | SRD §14 | P4 |
| FR-52 | Payment history per PPO: manual entry and Excel import | SRD §15 | P5 |
| FR-53 | Admin dashboard and Worker dashboard counters | SRD §5, §21 | P5 (placeholders P0) |
| FR-54 | Admin global search and filters (gender, category, district, Center, statuses) | SRD §16, §17 | P5 |
| FR-55 | Export filtered data to Excel or CSV. Exports are masked unless the export-sensitive permission is held, and are audited. Workers cannot export. | SRD §18, §22.12 | P5 |
| FR-56 | Audit log of logins, every application action, PPO generation, data changes, imports and exports | SRD §19 | P0 ✓ (store, auth events); later phases add their events |

## 4. Non-functional requirements

| Id | Requirement | How |
|---|---|---|
| NFR-01 | Confidentiality under the HIV/AIDS Act 2017 | [SECURITY.md](SECURITY.md) |
| NFR-02 | Hindi and English UI | next-intl, every string in en.json and hi.json |
| NFR-03 | Volume: every Rajasthan ART beneficiary (estimate 60,000 to 80,000) | indexes on scope columns, server paging, imports up to 100,000 rows |
| NFR-04 | Audit is tamper-evident | hash chain plus an append-only trigger ([SECURITY.md](SECURITY.md) S-AUD) |
| NFR-05 | Backups encrypted, RPO and RTO agreed | Q-14, [DEPLOYMENT.md](DEPLOYMENT.md) |
| NFR-06 | Passes VAPT | the Chikitsa-Raj VAPT baseline is applied from Phase 0 |
