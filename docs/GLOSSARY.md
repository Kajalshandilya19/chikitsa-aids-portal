# Glossary

| Term | Meaning |
|---|---|
| **NACO** | National AIDS Control Organisation (Government of India) |
| **NACP** | National AIDS Control Programme |
| **RSACS** | Rajasthan State AIDS Control Society: implements NACP in Rajasthan; the department this portal is for |
| **SACS** | State AIDS Control Society (any state) |
| **DAPCU** | District AIDS Prevention and Control Unit: the district-level office (our District Officer role) |
| **SOCH** | "Strengthening Overall Care for HIV": NACO's national software for HIV programme records. The source of beneficiary data for this portal. |
| **PLHIV** | People Living with HIV |
| **ART** | Antiretroviral Therapy, the HIV treatment |
| **ART Centre** | A facility that provides ART; our "Center". **LAC** = Link ART Centre (smaller, linked to an ART Centre). **COE** = Centre of Excellence |
| **ICTC** | Integrated Counselling and Testing Centre, where HIV testing happens; the PID comes from here |
| **UID (SOCH)** | System-generated unique id of a beneficiary in SOCH. Can change when records are merged ("UID linkage"). Not the Aadhaar UID. |
| **PID** | Patient id from the testing centre (about 23 characters) |
| **ART No. / ART Registration Number** | Number given by the ART Centre. A new one is given on transfer, so it is never a key. |
| **Pre-ART No.** | Number given before ART starts |
| **LFU** | Lost to Follow-Up: no visit for 90 days or more after the due date (On ART LFU); 28 days for Pre-ART |
| **MIS** | Missed: did not come for medicines by the due date (becomes LFU after 90 days) |
| **Opted Out / Stopped / Died / Transferred Out / In / In Transit / Linked Out** | Other ART statuses; see V-039 and SOCH_IMPORT_SPEC.md |
| **Aadhaar** | 12-digit national identity number (last digit is a Verhoeff check digit) |
| **Jan Aadhaar** | Rajasthan's family identity card: 10-digit family id, 11-digit member id |
| **ABHA** | Ayushman Bharat Health Account number (14 digits) |
| **IFSC** | 11-character bank branch code |
| **PPO** | Pension Payment Order: the approved pension's reference number and document |
| **DBT** | Direct Benefit Transfer (government payments straight to bank accounts); not integrated (Q-13) |
| **SJE / SJMS** | Rajasthan Social Justice and Empowerment Department / its pension system; not integrated (Q-13) |
| **Jan Soochna** | Rajasthan's public information portal; not integrated (Q-13) |
| **LGD code** | Local Government Directory code of a district (national master) |
| **VAPT** | Vulnerability Assessment and Penetration Testing (by a CERT-In empanelled auditor) |
| **Maker-checker** | One person prepares, a different person approves (R-MC-1) |
| **Scope** | What part of the state a user may see: STATE, DISTRICT or CENTER (lib/scope.ts) |
| **Assignment** | A user × role × place; a user may have several and switches between them |
| **Blind index / `_lookup`** | HMAC of a value, stored next to its encrypted form, so we can search for equality without decrypting |
| **BFF** | Backend for Frontend: the Next.js server routes that hold the session cookies and call the services |
| **Placeholder** | Data or a setting we invented so we can build, waiting for the department's real value (OPEN_QUESTIONS.md) |
