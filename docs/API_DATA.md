# pension-data-service API (Phase 0 contract)

Base path: `/data/api/v1` (port 3203). Conventions are in [API_CONVENTIONS.md](API_CONVENTIONS.md). The import pipeline and its rules are in [IMPORT_PIPELINE.md](IMPORT_PIPELINE.md).

Phase 0 ships the generic import pipeline with ONE importer, `centers` (the Center master). Phase 1 adds `soch` (beneficiaries) and Phase 5 adds `payments`. Every importer uses the same endpoints and the same statuses.

## 1. Import kinds

| `kind` | Upload permission | Commit permission | Commits into | Phase |
|---|---|---|---|---|
| `centers` | `IMPORT_CENTER_UPLOAD` | `IMPORT_CENTER_COMMIT` | auth-service `/internal/centers/upsert-batch` | 0 |
| `soch` | `IMPORT_SOCH_UPLOAD` | `IMPORT_SOCH_COMMIT` | core-service `/internal/beneficiaries/upsert-batch` | 1 |
| `payments` | `PAYMENT_FILE_IMPORT` | `PAYMENT_FILE_IMPORT` | core-service `/internal/payments/upsert-batch` | 5 |

## 2. Endpoints

| Method | Path | Permission | Request | Response `data` |
|---|---|---|---|---|
| GET | `/imports/templates/:kind` | upload permission of the kind | none | An `.xlsx` file (attachment) with the header row and one example row. |
| POST | `/imports/:kind` | upload permission | `multipart/form-data`, field `file`: `.xlsx` or `.csv`, ≤ `IMPORT_MAX_FILE_MB` | `201`, `data` = the `batch`. The file is checked, parsed, staged and validated synchronously. |
| GET | `/imports` | `IMPORT_BATCH_VIEW` or any upload permission | Query: `kind`, `status`, `page`, `limit` | A page of `batch`. |
| GET | `/imports/:id` | same | none | `data` = `batch` |
| GET | `/imports/:id/rows` | same | Query: `status` (`VALID`, `ERROR`, `DUPLICATE`), `page`, `limit` (≤ 100) | A page of `row`. |
| POST | `/imports/:id/commit` | commit permission | `{}` | `batch` (status `COMMITTED`). Only VALID rows are written. |
| POST | `/imports/:id/cancel` | upload permission | `{}` | `batch` (status `CANCELLED`). Staged rows are deleted. |

`batch`:

```jsonc
{ "id": "uuid", "kind": "centers", "status": "VALIDATED", "file_name": "centers.xlsx", "file_type": "xlsx",
  "row_count": 41, "valid_count": 40, "error_count": 1, "duplicate_count": 0,
  "create_count": 38, "update_count": 2, "unchanged_count": 0,
  "uploaded_by": "uuid", "uploaded_at": "ISO", "committed_by": null, "committed_at": null,
  "header_errors": [] }
```

`row`:

```jsonc
{ "row_number": 7,              // 1-based data row number; the header row is not counted
  "status": "ERROR",            // VALID | ERROR | DUPLICATE
  "action": "CREATE",           // CREATE | UPDATE | UNCHANGED (VALID rows only)
  "values": { "code": "RJ007", "name_en": "..." },
  "errors": [{ "field": "district_lgd_code", "rule": "V-027", "message": "Unknown district LGD code" }] }
```

Batch status flow: `VALIDATED` (or `REJECTED` when the file or its header is unusable), then either `COMMITTED` or `CANCELLED`. A batch can be committed only once, only by a user holding the commit permission, and only while `VALIDATED` with `valid_count > 0`.

## 3. File rules (all enforced server-side; the browser checks are only a convenience)

| Rule | Limit | Error code |
|---|---|---|
| Type, by content (magic bytes), not by extension | `.xlsx` (zip with `[Content_Types].xml` and `xl/workbook.xml`) or UTF-8 text CSV with no NUL bytes. `.xls`, `.xlsm` and everything else are refused. | `E_FILE_TYPE` |
| Size | ≤ `IMPORT_MAX_FILE_MB` (10) | `E_FILE_TOO_LARGE` |
| Zip bomb | ≤ 200 entries, ≤ 100 MB total uncompressed, compression ratio ≤ 100 | `E_FILE_UNSAFE` |
| Macros or external links | `vbaProject.bin` or `externalLinks/` present | `E_FILE_UNSAFE` |
| Rows | ≤ `IMPORT_MAX_ROWS` (100000) data rows; only the first worksheet is read | `E_TOO_MANY_ROWS` |
| Header | Every required column present, matched case-insensitively after trimming; unknown columns are ignored and listed in `header_errors` as warnings | `E_HEADER` (batch `REJECTED`) |
| Cell values | Formula cells are read as their cached value; a cell starting with `= + - @` is stored as text | none |

## 4. Center import columns (`kind = centers`)

| Column header | Field | Required | Rule |
|---|---|---|---|
| Center Code | `code` | yes | V-003 |
| Center Name | `name_en` | yes | V-038 |
| Center Name (Hindi) | `name_hi` | no | V-035 |
| District LGD Code | `district_lgd_code` | yes | V-027, and it must be a district in the master |
| Center Type | `center_type` | yes | V-040 |
| SOCH Facility Code | `soch_facility_code` | no | V-025 |

Duplicate `Center Code` within the file: every occurrence after the first is `DUPLICATE`. If the code already exists, the row is an `UPDATE`, or `UNCHANGED` when every value is the same.

## 5. Planned (later phases)

The contracts are in the phase guides.

| Phase | Endpoint | Guide |
|---|---|---|
| 1 | `GET /imports/columns/:kind` (column metadata for the web grid); kind `soch`; row action `REVIEW`; `review_count` | [PHASE_1 §3](phases/PHASE_1_SOCH_BENEFICIARIES.md) |
| 5 | kind `payments` | [PHASE_5 §2](phases/PHASE_5_PAYMENTS_REPORTS.md) |
| 5 | `POST /exports` (masked or sensitive Excel / CSV of a report, streamed, audited) | [PHASE_5 §5](phases/PHASE_5_PAYMENTS_REPORTS.md) |
