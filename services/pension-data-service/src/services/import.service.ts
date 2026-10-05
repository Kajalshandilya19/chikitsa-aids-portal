import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { In } from 'typeorm';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';
import { ImportBatchEntity, type ImportKind, type RowIssue } from '../entities/import-batch.entity';
import { ImportRowEntity, type RowAction, type RowStatus } from '../entities/import-row.entity';
import type { Caller } from '../lib/auth-middleware';
import { AUDIT, writeAudit } from '../lib/audit';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { P } from '../lib/permission-codes';
import { guardSpreadsheet } from '../imports/file-guard';
import { parseSpreadsheet } from '../imports/parse';
import { IMPORTERS, importerFor } from '../imports/registry';
import type { AnyImporter } from '../imports/types';

/**
 * The import pipeline (docs/IMPORT_PIPELINE.md). One flow for every kind:
 *   upload  -> guard bytes -> parse -> match headers -> validate rows -> mark duplicates -> classify
 *           -> stage rows (encrypted) -> batch VALIDATED (or REJECTED for an unusable header)
 *   commit  -> VALIDATED -> COMMITTING -> importer.commit() in chunks of 500 -> COMMITTED (or FAILED)
 *   cancel  -> VALIDATED -> CANCELLED, staged rows deleted
 * The browser preview is a convenience only: everything here runs again on the server.
 */
const CHUNK = 500;
const INSERT_CHUNK = 1000;

const batches = () => AppDataSource.getRepository(ImportBatchEntity);
const rowsRepo = () => AppDataSource.getRepository(ImportRowEntity);

const normHeader = (h: string) => h.trim().replace(/\*$/, '').trim().replace(/\s+/g, ' ').toLowerCase();
const RULE_IN_MESSAGE = /\s*\((V-\d{3})\)\s*$/;

export const batchView = (b: ImportBatchEntity) => ({
  id: b.id,
  kind: b.kind,
  status: b.status,
  file_name: b.fileName,
  file_type: b.fileType,
  file_size: b.fileSize,
  row_count: b.rowCount,
  valid_count: b.validCount,
  error_count: b.errorCount,
  duplicate_count: b.duplicateCount,
  create_count: b.createCount,
  update_count: b.updateCount,
  unchanged_count: b.unchangedCount,
  header_errors: b.headerErrors,
  result: b.result,
  uploaded_by: b.uploadedBy,
  uploaded_at: b.uploadedAt,
  committed_by: b.committedBy,
  committed_at: b.committedAt,
});

/** Kinds this caller may see batches of. */
const visibleKinds = (c: Caller): ImportKind[] =>
  (Object.values(IMPORTERS) as AnyImporter[])
    .filter((imp) => c.can(P.IMPORT_BATCH_VIEW) || c.can(imp.uploadPermission) || c.can(imp.commitPermission))
    .map((imp) => imp.kind);

const loadVisible = async (c: Caller, id: string): Promise<ImportBatchEntity> => {
  const b = await batches().findOne({ where: { id } });
  if (!b || !visibleKinds(c).includes(b.kind)) throw new NotFoundError('import batch not found');
  return b;
};

interface StagedRow {
  rowNumber: number;
  status: RowStatus;
  action: RowAction | null;
  values: Record<string, unknown>;
  errors: RowIssue[];
}

export const importService = {
  async upload(c: Caller, kind: string, file: { buffer: Buffer; originalname: string }) {
    const imp = importerFor(kind);
    c.require(imp.uploadPermission);
    const cfg = config();
    let type;
    try {
      type = guardSpreadsheet(file.buffer, file.originalname, cfg.IMPORT_MAX_FILE_MB * 1024 * 1024);
    } catch (err) {
      await writeAudit(AppDataSource, { action: AUDIT.IMPORT_REJECTED_FILE, outcome: 'FAILURE', entityType: 'import', data: { kind, code: (err as AppError).code } });
      throw err;
    }
    const sheet = await parseSpreadsheet(file.buffer, type, cfg.IMPORT_MAX_ROWS);
    const sha = createHash('sha256').update(file.buffer).digest('hex');

    // ---- header
    const index = new Map(sheet.headers.map((h, i) => [normHeader(h), i]));
    const headerErrors: RowIssue[] = [];
    for (const col of imp.columns) {
      if (col.required && !index.has(normHeader(col.header))) headerErrors.push({ field: col.field, rule: null, message: `Missing column "${col.header}"` });
    }
    const known = new Set(imp.columns.map((col) => normHeader(col.header)));
    const unknownHeaders = sheet.headers.filter((h) => h && !known.has(normHeader(h)));
    const warnings = unknownHeaders.map((h) => ({ field: '', rule: null, message: `Column "${h.slice(0, 60)}" is not used and was ignored` }));

    const base = {
      kind: imp.kind,
      fileName: file.originalname.slice(0, 200),
      fileSha256: sha,
      fileType: type,
      fileSize: file.buffer.length,
      uploadedBy: c.auth.userId,
    };

    if (headerErrors.length) {
      const b = await AppDataSource.transaction(async (em) => {
        const saved = await em.getRepository(ImportBatchEntity).save(em.getRepository(ImportBatchEntity).create({ ...base, status: 'REJECTED', rowCount: sheet.rows.length, headerErrors: [...headerErrors, ...warnings] }));
        await writeAudit(em, { action: AUDIT.IMPORT_REJECTED_FILE, outcome: 'FAILURE', entityType: 'import', entityId: saved.id, data: { kind, reason: 'header' } });
        return saved;
      });
      return batchView(b);
    }

    // ---- rows: schema, duplicates, classification
    const staged: StagedRow[] = [];
    const validRows: { staged: StagedRow; parsed: Record<string, unknown> }[] = [];
    const seenKeys = new Set<string>();
    for (const [excelRow, cells] of sheet.rows) {
      const raw: Record<string, string | undefined> = {};
      for (const col of imp.columns) {
        const i = index.get(normHeader(col.header));
        const v = i === undefined ? '' : (cells[i] ?? '');
        raw[col.field] = v === '' ? undefined : v;
      }
      const rowNumber = excelRow - 1;
      const missing = imp.columns.filter((col) => col.required && raw[col.field] === undefined);
      if (missing.length) {
        staged.push({ rowNumber, status: 'ERROR', action: null, values: raw, errors: missing.map((col) => ({ field: col.field, rule: null, message: `${col.header} is required` })) });
        continue;
      }
      const parsed = imp.rowSchema.safeParse(raw);
      if (!parsed.success) {
        const errors = parsed.error.issues.map((i) => {
          const m = RULE_IN_MESSAGE.exec(i.message);
          return { field: String(i.path[0] ?? ''), rule: m?.[1] ?? null, message: i.message.replace(RULE_IN_MESSAGE, '') };
        });
        staged.push({ rowNumber, status: 'ERROR', action: null, values: raw, errors });
        continue;
      }
      const key = String((parsed.data as Record<string, unknown>)[imp.keyField] ?? '');
      if (seenKeys.has(key)) {
        staged.push({ rowNumber, status: 'DUPLICATE', action: null, values: parsed.data as Record<string, unknown>, errors: [{ field: imp.keyField, rule: null, message: 'Appears earlier in this file' }] });
        continue;
      }
      seenKeys.add(key);
      const s: StagedRow = { rowNumber, status: 'VALID', action: null, values: parsed.data as Record<string, unknown>, errors: [] };
      staged.push(s);
      validRows.push({ staged: s, parsed: parsed.data as Record<string, unknown> });
    }
    const classes = validRows.length ? await imp.classify(validRows.map((v) => v.parsed)) : [];
    classes.forEach((cl, i) => {
      const s = validRows[i]!.staged;
      if (cl.errors?.length) {
        s.status = 'ERROR';
        s.errors = cl.errors;
      } else {
        s.action = cl.action ?? 'CREATE';
      }
    });

    const count = (st: RowStatus) => staged.filter((s) => s.status === st).length;
    const countAction = (a: RowAction) => staged.filter((s) => s.status === 'VALID' && s.action === a).length;

    const batch = await AppDataSource.transaction(async (em) => {
      const saved = await em.getRepository(ImportBatchEntity).save(
        em.getRepository(ImportBatchEntity).create({
          ...base,
          status: 'VALIDATED',
          rowCount: staged.length,
          validCount: count('VALID'),
          errorCount: count('ERROR'),
          duplicateCount: count('DUPLICATE'),
          createCount: countAction('CREATE'),
          updateCount: countAction('UPDATE'),
          unchangedCount: countAction('UNCHANGED'),
          headerErrors: warnings,
        }),
      );
      for (let i = 0; i < staged.length; i += INSERT_CHUNK) {
        await em.getRepository(ImportRowEntity).insert(
          staged.slice(i, i + INSERT_CHUNK).map((s) => ({
            batchId: saved.id,
            rowNumber: s.rowNumber,
            status: s.status,
            action: s.action,
            values: JSON.stringify(s.values),
            errors: s.errors,
          })),
        );
      }
      await writeAudit(em, {
        action: AUDIT.IMPORT_UPLOADED,
        entityType: 'import',
        entityId: saved.id,
        data: { kind, rows: staged.length, valid: saved.validCount, errors: saved.errorCount, duplicates: saved.duplicateCount },
      });
      return saved;
    });
    return batchView(batch);
  },

  async list(c: Caller, q: { kind?: string | undefined; status?: string | undefined; page: number; limit: number }) {
    const kinds = visibleKinds(c).filter((k) => !q.kind || k === q.kind);
    if (!kinds.length) return { rows: [], total: 0 };
    const where = { kind: In(kinds), ...(q.status ? { status: q.status as ImportBatchEntity['status'] } : {}) };
    const [rows, total] = await batches().findAndCount({ where, order: { uploadedAt: 'DESC' }, skip: (q.page - 1) * q.limit, take: q.limit });
    return { rows: rows.map(batchView), total };
  },

  async get(c: Caller, id: string) {
    return batchView(await loadVisible(c, id));
  },

  async rows(c: Caller, id: string, q: { status?: RowStatus | undefined; page: number; limit: number }) {
    await loadVisible(c, id);
    const [rows, total] = await rowsRepo().findAndCount({
      where: { batchId: id, ...(q.status ? { status: q.status } : {}) },
      order: { rowNumber: 'ASC' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    return {
      rows: rows.map((r) => ({ row_number: r.rowNumber, status: r.status, action: r.action, values: JSON.parse(r.values) as unknown, errors: r.errors })),
      total,
    };
  },

  async commit(c: Caller, id: string) {
    const b = await loadVisible(c, id);
    const imp = importerFor(b.kind);
    if (!c.can(imp.commitPermission)) throw new ForbiddenError('you do not have permission to confirm this import', { details: { required: [imp.commitPermission] } });
    if (b.validCount === 0) throw new ConflictError('This import has no valid rows to confirm.', { code: 'E_IMPORT_EMPTY' });
    // Claim the batch atomically: only one commit can ever run.
    const claimed = (await AppDataSource.query(
      "UPDATE pension_data.import_batches SET status = 'COMMITTING', updated_at = now() WHERE id = $1 AND status = 'VALIDATED' RETURNING id",
      [id],
    )) as [unknown[], number];
    if (!claimed[0]?.length) throw new ConflictError('This import is not waiting for confirmation (already confirmed, cancelled or rejected).', { code: 'E_IMPORT_STATE' });

    const totals: Record<string, number> = {};
    try {
      const valid = await rowsRepo().find({ where: { batchId: id, status: 'VALID' }, order: { rowNumber: 'ASC' } });
      const parsed = valid.map((r) => imp.rowSchema.parse(JSON.parse(r.values)) as Record<string, unknown>);
      for (let i = 0; i < parsed.length; i += CHUNK) {
        const counts = await imp.commit(parsed.slice(i, i + CHUNK), c.auth.userId);
        for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v;
      }
    } catch (err) {
      await batches().update({ id }, { status: 'FAILED', result: { ...totals, error: (err as AppError).code ?? 'E_INTERNAL' } });
      await writeAudit(AppDataSource, { action: AUDIT.IMPORT_COMMITTED, outcome: 'FAILURE', entityType: 'import', entityId: id, data: { kind: b.kind, ...totals } });
      throw err;
    }
    await AppDataSource.transaction(async (em) => {
      await em.getRepository(ImportBatchEntity).update({ id }, { status: 'COMMITTED', committedBy: c.auth.userId, committedAt: new Date(), result: totals });
      await writeAudit(em, { action: AUDIT.IMPORT_COMMITTED, entityType: 'import', entityId: id, data: { kind: b.kind, ...totals } });
    });
    return batchView(await loadVisible(c, id));
  },

  async cancel(c: Caller, id: string) {
    const b = await loadVisible(c, id);
    c.require(importerFor(b.kind).uploadPermission);
    await AppDataSource.transaction(async (em) => {
      const r = (await em.query(
        "UPDATE pension_data.import_batches SET status = 'CANCELLED', updated_at = now() WHERE id = $1 AND status = 'VALIDATED' RETURNING id",
        [id],
      )) as [unknown[], number];
      if (!r[0]?.length) throw new ConflictError('Only an import waiting for confirmation can be cancelled.', { code: 'E_IMPORT_STATE' });
      await em.query('DELETE FROM pension_data.import_rows WHERE batch_id = $1', [id]);
      await writeAudit(em, { action: AUDIT.IMPORT_CANCELLED, entityType: 'import', entityId: id, data: { kind: b.kind } });
    });
    return batchView(await loadVisible(c, id));
  },

  /**
   * An .xlsx template: sheet "Data" with the header row ONLY (an example row there would be imported
   * by anyone who forgot to delete it), and sheet "Instructions" with rules and examples per column.
   */
  async template(c: Caller, kind: string): Promise<Buffer> {
    const imp = importerFor(kind);
    c.require(imp.uploadPermission);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Pension Portal';
    const data = wb.addWorksheet('Data');
    data.addRow(imp.columns.map((col) => (col.required ? `${col.header} *` : col.header)));
    data.getRow(1).font = { bold: true };
    data.columns.forEach((col) => {
      col.width = 28;
    });
    const help = wb.addWorksheet('Instructions');
    help.addRow(['Column', 'Required', 'Rule', 'Example']);
    help.getRow(1).font = { bold: true };
    for (const col of imp.columns) help.addRow([col.header, col.required ? 'Yes' : 'No', col.hint, col.example]);
    help.addRow([]);
    help.addRow(['Fill one row per record in the "Data" sheet, from row 2. Only the first sheet is read. Save as .xlsx, or as CSV UTF-8.']);
    help.getColumn(1).width = 26;
    help.getColumn(3).width = 80;
    help.getColumn(4).width = 40;
    return Buffer.from(await wb.xlsx.writeBuffer());
  },
};
