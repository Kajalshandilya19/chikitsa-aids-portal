import type { z } from 'zod';
import type { RowIssue } from '../entities/import-batch.entity';
import type { RowAction } from '../entities/import-row.entity';
import type { PermissionCode } from '../lib/permission-codes';

/**
 * What an importer must provide (docs/IMPORT_PIPELINE.md §5 "Adding an importer").
 * The pipeline (services/import.service.ts) does everything else: file checks, parsing, header
 * matching, per-row validation, duplicate detection, staging, preview, commit, cancel, audit.
 */
export interface ImportColumn {
  /** Exactly as it appears in the template header row. Matching ignores case, spaces and a trailing "*". */
  header: string;
  /** Key in the row object passed to `rowSchema`. */
  field: string;
  required: boolean;
  /** Shown in the template's second sheet ("Instructions"). */
  hint: string;
  /** One example value for the template. */
  example: string;
}

export interface Classified {
  action?: RowAction;
  /** Errors that need context the row schema does not have (unknown district, code clash). */
  errors?: RowIssue[];
}

export interface Importer<Row extends Record<string, unknown>> {
  kind: 'centers' | 'soch' | 'payments';
  uploadPermission: PermissionCode;
  commitPermission: PermissionCode;
  columns: readonly ImportColumn[];
  /** Validates ONE row; built only from lib/validators.ts schemas (R-VAL-1). */
  rowSchema: z.ZodType<Row>;
  /** Field whose value must be unique within a file (duplicates after the first are DUPLICATE). */
  keyField: keyof Row & string;
  /** Called once per file with every row that passed rowSchema, in file order. Same length out. */
  classify(rows: Row[]): Promise<Classified[]>;
  /** Writes VALID rows (at most 500 per call) to the owning service. Returns counts for the batch result. */
  commit(rows: Row[], actorUserId: string): Promise<Record<string, number>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyImporter = Importer<any>;
