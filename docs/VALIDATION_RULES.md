# Validation rules

Source of truth: [lib/validators.ts](../services/pension-auth-service/src/lib/validators.ts). It is byte-identical in every service and in the web app (`src/lib/shared/validators.ts`). Tests: `tests/unit/validators.test.ts` in auth-service (UT-VAL-*).

**How to use (R-VAL-1):** build every DTO and every form field from these exports. Never write a regex or a length for a user-typed field anywhere else. Normalisation happens inside the schema, so the parsed value is the value to store.

| Id | Export | Accepts | Normalises | Accepted | Refused |
|---|---|---|---|---|---|
| V-001 | `personName` | 2-100 chars; letters of any script, space, `.`, `'`, `-` | trims, collapses spaces | `Asha Devi`, `आशा देवी`, `D'Souza` | `A`, `Asha2`, `<b>x</b>` |
| V-002 | `userCode` | 4-32 chars `[a-z0-9._-]`, letter first | lowercase | `worker.rj001` | `abc`, `1worker`, `a b` |
| V-003 | `centerCode` | 3-16 chars `[A-Z0-9-]`, letter first | uppercase | `RJ001` | `001`, `RJ 001` |
| V-004 | `mobile` | 10 digits starting 6-9 | removes spaces, `-`, `( )`, `+91`, `91`, leading `0` | `+91 98765 43210` → `9876543210` | `5876543210` |
| V-005 | `email` | valid email, ≤ 254 | lowercase | `a@b.org` | `not-an-email` |
| V-006 | `password` | 10-64 chars; upper, lower, digit, symbol; no leading/trailing space; plus (service) not containing the User ID and not one of the last 3 | none | `Strong@Pass1` | `Short@1a`, `NoDigits@Here` |
| V-007 | `aadhaar` | 12 digits, first 2-9, Verhoeff check digit, not all one digit | removes spaces and `-` | `2341 2341 2346` | `234123412345`, `1234…` |
| V-008 | `janAadhaarFamilyId` | exactly 10 digits | removes spaces and `-` | `1234567890` | 9 digits |
| V-009 | `janAadhaarMemberId` | exactly 11 digits | same | `12345678901` | 10 digits |
| V-010 | `ifsc` | `^[A-Z]{4}0[A-Z0-9]{6}$` | uppercase | `SBIN0001234` | `SBIN1001234` |
| V-011 | `bankAccountNumber` | 9-18 digits, not all zeros | removes spaces and `-` | `123456789012` | `000000000` |
| V-012 | `bankName` | 2-100; letters, digits, space, `. & ( ) ' -` | collapses spaces | `Bank of Baroda (Rajasthan)` | `X` |
| V-013 | `address` | 5-300; letters, digits, space, newline, `, . - / # ( ) ' :` | trims | `House 12, Ward 4` | `House <12>`, `a; DROP` |
| V-014 | `remarks` | 0-500, no `<` `>` | trims, empty → null | `Documents verified` | `a < b` |
| V-015 | `reason` | 10-500, no `<` `>` | trims | `Passbook copy is not readable` | `too short` |
| V-016 | `pastDate` | `YYYY-MM-DD`, real date, 1990-01-01 to today (IST) | trims | `2015-06-30` | `2015-02-30`, future |
| V-017 | `age` | whole number 0-120 | string → number | `45` | `121`, `4.5` |
| V-018 | `sex` | `MALE`, `FEMALE`, `TRANSGENDER` | (SOCH mapping in data-service) | `FEMALE` | `M` (direct) |
| V-019 | `category` | `GENERAL`, `EWS`, `OBC`, `MBC`, `SC`, `ST` (placeholder list, Q-07) | | `MBC` | `OTHER` |
| V-020 | `consent` | `YES`, `NO` | | `YES` | `Y` |
| V-021 | `sochUid` | 4-30 `[A-Z0-9/-]` (placeholder, Q-02) | uppercase | `RJUID0000123` | `AB` |
| V-022 | `artNumber` | 3-30 `[A-Z0-9/-]` | uppercase | `ART/RJ001/2015/0001` | `ART 12` |
| V-023 | `preArtNumber` | 3-30 `[A-Z0-9/-]` | uppercase | | |
| V-024 | `pidNumber` | 5-30 `[A-Z0-9/-]` | uppercase | | |
| V-025 | `sochBeneficiaryId` (also SOCH facility code) | 1-30 `[A-Z0-9/-]` | uppercase | | |
| V-026 | `abhaNumber` | 14 digits | removes spaces and `-` | `12-3456-7890-1234` | `1234` |
| V-027 | `lgdCode` | whole number 1-99999 | string → number | `86` | `0` |
| V-028 | `totpCode` | 6 digits | trims | `123456` | `12345` |
| V-029 | `otpCode` | 6 digits | trims | `000001` | |
| V-030 | `searchText` | 1-100, no `<` `>` | trims, collapses | `asha` | `<img>` |
| V-031 | `pageQuery` | page 1-10000 (default 1), limit 1-100 (default 20) | string → number | | `limit=500` |
| V-032 | `uuid` | uuid | | | `not-a-uuid` |
| V-033 | `amountRupees` | > 0, ≤ 1,00,000, ≤ 2 decimals | string → number | `1500.50` | `0`, `10.123` |
| V-034 | `paymentPeriod` | `YYYY-MM` | | `2026-09` | `2026-13` |
| V-035 | `hindiText` | 1-150; Devanagari, digits, space, `. , ( ) ' -` | collapses spaces | `अजमेर` | `Ajmer` |
| V-036 | `pincode` | 6 digits, not starting 0 | | `305001` | `012345` |
| V-037 | `ppoNumber` | 6-40 `[A-Z0-9/-]` | uppercase | `RJ/HIVP/086/2026/000001` | |
| V-038 | `englishLabel` | 2-150; English letters, digits, space, `. , ( ) ' / & -` | collapses spaces | `ART Centre, JLN Hospital (Ajmer)` | `केंद्र` |
| V-039 | `artStatus` | `ON_ART`, `MISSED`, `ON_ART_LFU`, `PRE_ART_LFU`, `OPTED_OUT`, `STOPPED`, `DIED`, `TRANSFERRED_OUT`, `TRANSFERRED_IN`, `IN_TRANSIT`, `LINKED_OUT` | (SOCH mapping in data-service) | | `LOST` |
| V-040 | `centerType` | `ART`, `LAC`, `COE`, `OTHER` | | `LAC` | `PHC` |
| V-041 | `captchaAnswer` | 1 or 2 digits | trims | `12` | `123`, `ab` |

Helpers: `optional(schema)` (empty string or undefined becomes null) and `boolQuery` (`true`/`false` in a query string).

Every message ends with `(V-0xx)`. The data-service import strips it into the `rule` field of a row error, and the web app can show it next to the message.

## Adding a rule

1. Add the schema to `services/pension-auth-service/src/lib/validators.ts` with the next id in its JSDoc and in every message.
2. Add a row above.
3. Add a `UT-VAL-0xx` test in `tests/unit/validators.test.ts` with at least one accepted and one refused value.
4. Run `scripts/sync-lib.sh`, then `scripts/dev.sh check`.
