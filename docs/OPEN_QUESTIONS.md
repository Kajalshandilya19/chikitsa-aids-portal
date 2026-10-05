# Open questions for the department (RSACS)

From SRD §23 and blueprint §25, plus what the research raised. Each question has the DEFAULT we build against, so work is never blocked. Defaults are placeholders: never present them to the department as final. When an answer arrives, record it here (date, who), then change the setting, seed or code it points to.

| Id | Question | Default we built | Where it lives | Status |
|---|---|---|---|---|
| Q-01 | Exact SOCH Excel layout; frequency; is each file a full snapshot or only changes? | SRD §3 field list as headers; never delete missing beneficiaries | data `imports/soch-columns.ts` | open |
| Q-02 | SOCH identifier formats (UID, PID, ART No, Pre-ART No, Beneficiary ID) | permissive `[A-Z0-9/-]` with length bounds | validators V-021..V-025 | open |
| Q-03 | Confirm the 41-district list and LGD codes used by RSACS | LGD list from Chikitsa-Raj + Jaipur 102 | auth `dev/seed/districts.ts` | open |
| Q-04 | The Rajasthan HIV/ART Center master (codes, names, districts, SOCH facility codes) | RJ001 to RJ041 placeholders | Center import | open |
| Q-05 | PPO numbering format, sequence scope, system or manual, official PPO print layout | `RJ/HIVP/{DIST}/{YYYY}/{SEQ:6}`, per district per year, system generated, draft layout | core settings `ppo.*` | open |
| Q-06 | Consent wording (English and Hindi), digital confirmation or signed document | placeholder text v0; checkbox plus optional document upload | core setting `consent.text` | open |
| Q-07 | Category and caste list | GENERAL, EWS, OBC, MBC, SC, ST | validator V-019 | open |
| Q-08 | Pension eligibility rules and monthly amount (no public HIV pension scheme found) | no eligibility engine; amount null | core setting `pension.monthly_amount` | open |
| Q-09 | Final list of worker-editable fields; may workers correct SOCH address and contact? | SRD §8 list; address and contact correctable on the application only | FIELD_DICTIONARY.md | open |
| Q-10 | How Aadhaar and Jan Aadhaar are verified (format only, or UIDAI / Jan Aadhaar API) | format + Verhoeff only; the verifier ticks a checklist | V-007..V-009, review checklist | open |
| Q-11 | Bank and IFSC validation (format only, or an IFSC master) | format only | V-010, V-011 | open |
| Q-12 | Payment data: fields, manual or imported, from which system, reconciliation | manual entry + Excel import, fields from SRD §15 | Phase 5 | open |
| Q-13 | Integration with SJMS, Jan Soochna, DBT, e-Mitra or SSO | none | | open |
| Q-14 | Retention, archival and deletion periods; backup RPO and RTO; DR site | staged imports 7 days; everything else kept; daily encrypted backups (infra) | SECURITY.md S-RET | open |
| Q-15 | SMS gateway (eSanchar) credentials and sender id, for OTPs | `SMS_PROVIDER=log` locally; esanchar not implemented | auth `clients/sms.client.ts` | open |
| Q-16 | Hosting (state data centre, cloud), domain, TLS certificate | Kubernetes manifests, any cluster | k8s/, DEPLOYMENT.md | open |
| Q-17 | Can a worker serve more than one Center? | yes, one assignment per Center, switched in the header | auth assignments | decided (default) |
| Q-18 | Is there a reconsideration process for rejected applications? | no: REJECTED is final; a new application needs a separate approved process | WORKFLOW.md | open |
| Q-19 | Hindi and English, or Hindi first? | both; English default; user can switch | web next-intl | open |
| Q-20 | Password policy and reset process | V-006, 5 failures lock for 15 minutes, OTP reset | auth | open |
| Q-21 | Final reports and export fields | SRD §21 counters; exports masked | Phase 5 | open |
| Q-22 | Is there an internal RFP, SOW or work order that overrides the SRD? | the SRD is the source | PRODUCT_SPEC.md | open |
| Q-24 | Wording of the Privacy Policy, Terms of Use and Helpdesk pages, and the helpdesk telephone and e-mail | draft text in the web message files (`legal.*`), marked as draft on every page | web `/privacy`, `/terms`, `/helpdesk` | open |
| Q-23 | Official RSACS (or NACO) logo artwork and usage permission for the login and header | red ribbon mark with the portal name | web `components/brand.tsx` AidsLockup | open |
