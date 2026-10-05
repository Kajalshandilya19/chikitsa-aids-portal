# Import pipeline (pension-data-service)

One pipeline for every spreadsheet import. Phase 0 ships it with the `centers` importer; Phase 1 adds `soch`, Phase 5 `payments`. API: [API_DATA.md](API_DATA.md).

## 1. Flow

```
browser: BulkUploadSheet (parse with exceljs/papaparse, preview, let the user fix cells)  ← convenience only
   │  multipart POST /data/api/v1/imports/<kind>   (file rebuilt from the grid)
   ▼
data-service
 1. multer: memory storage, 1 file, ≤ IMPORT_MAX_FILE_MB
 2. guardSpreadsheet()  bytes decide the type; xlsx zip checks; csv UTF-8 checks     (imports/file-guard.ts)
 3. parseSpreadsheet()  first sheet, header row, strings, empty rows skipped          (imports/parse.ts)
 4. header match        required columns present? (else batch REJECTED)               (services/import.service.ts)
 5. per row             required → importer.rowSchema (validators) → duplicate key in file
 6. classify            importer.classify(): CREATE / UPDATE / UNCHANGED, or context errors (unknown district…)
 7. stage               batch + rows in ONE transaction, row values encrypted; audit data.import.uploaded
   │  GET /imports/:id, /imports/:id/rows?status=ERROR   → the UI marks the cells
   ▼
 8. commit              VALIDATED → COMMITTING (atomic claim) → importer.commit() per 500 rows → COMMITTED / FAILED
 9. cancel              VALIDATED → CANCELLED, staged rows deleted
10. purge (CronJob)     staged rows older than IMPORT_STAGE_RETENTION_DAYS deleted
```

## 2. Batch and row statuses

| Batch status | Meaning |
|---|---|
| `VALIDATED` | Parsed and staged; waiting for confirmation (it may still contain ERROR rows) |
| `REJECTED` | Header unusable (missing required columns); nothing staged |
| `COMMITTING` | Commit running (only one can run) |
| `COMMITTED` | Valid rows written; `result` holds the counts |
| `FAILED` | Commit stopped on an error; `result.error` holds the code; partial counts kept |
| `CANCELLED` | Cancelled by the user or by the purge job |

| Row status | Meaning |
|---|---|
| `VALID` | Passed every check; `action` is CREATE, UPDATE or UNCHANGED |
| `ERROR` | `errors[]` lists `{ field, rule, message }` |
| `DUPLICATE` | Same key as an earlier row in the same file |

## 3. Parsing rules

- Only the FIRST worksheet is read. The header is row 1.
- `row_number` = spreadsheet row - 1. Row 2 in Excel is `row_number` 1, so the UI can map rows back.
- Headers are matched case-insensitively, after trimming and collapsing spaces. A trailing `*` (the template marks required columns with it) is ignored.
- Unknown columns are ignored and listed as warnings in `header_errors`.
- Cell to text:
  - dates become `YYYY-MM-DD`;
  - a formula becomes its cached result (never evaluated);
  - rich text is flattened;
  - numbers keep their plain decimal form.
- Every cell is trimmed, and an empty cell is "missing".
- CSV must be UTF-8 (Excel: "CSV UTF-8"). The delimiter is detected; quoted commas are kept.

## 4. Security (S-FILE-*)

- The file's bytes decide its type. The name's extension must agree with them.
- `.xls`, `.xlsm` and any other type are refused.
- The zip directory is checked before parsing:
  - at most 200 entries;
  - at most 100 MB uncompressed;
  - compression ratio at most 100;
  - no zip64;
  - no `vbaProject.bin`, `externalLinks/`, `activeX/` or `embeddings/`.
- The uploaded file is never stored. Only its SHA-256, its parsed rows (encrypted) and the batch summary are kept.
- Row errors contain field names, rule ids and generic messages, never the cell value.
- Commit re-parses the staged values with the importer's row schema and the owning service validates again. The browser preview is never trusted.

## 5. Adding an importer (example: SOCH in Phase 1)

1. **Columns.** Define them in `src/imports/<kind>-columns.ts` (SOCH: already in `soch-columns.ts`). Give each one a header, a field, required, a hint, an example and a rule.
2. **Importer file.** Create `src/imports/importers/<kind>.importer.ts` implementing `Importer<Row>` from `imports/types.ts`:
   - `rowSchema`: a `.strict()` zod object built ONLY from `lib/validators.ts`. Map SOCH spellings with `z.preprocess` (`sochSex`, `sochArtStatus`, `sochDate`).
   - `keyField`: the in-file uniqueness key.
   - `classify(rows)`: fetch what you need ONCE through a client (masters from auth, existing beneficiaries' blind indexes from core), then return CREATE / UPDATE / UNCHANGED or `errors`.
   - `commit(rows, actor)`: call the owning service's `/internal/.../upsert-batch` with at most 500 rows.
3. **Registry and kinds.** Register it in `src/imports/registry.ts`. Add the kind to the `kind` CHECK constraint of `import_batches` (new migration) and to the `ImportKind` type.
4. **Permissions.** Use existing `P.*` codes, or add new ones ([HOWTO.md](HOWTO.md) "Add a permission").
5. **Owning service.** Add the internal upsert route there, with its own `.strict()` DTO. It must validate again and write in one transaction with an audit row.
6. **Tests.** Unit-test the row schema and the classify rules (UT-IMP-*). Add smoke steps to `scripts/smoke-data.mjs` (IT-IMP-*).
7. **Docs.** Add the kind to [API_DATA.md](API_DATA.md) §1 and write its column table.
