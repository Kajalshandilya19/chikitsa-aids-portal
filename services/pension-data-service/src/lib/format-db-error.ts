/**
 * A database constraint violation, translated for the person whose request caused it.
 *
 * Returns the status, error code and a short message for the violations we recognise, or `null`
 * for anything else, which stays the 500 it is. Reads the SQLSTATE and DETAIL that pg attaches to
 * the error (TypeORM's QueryFailedError copies them onto itself and keeps them on `driverError`)
 * and MongoDB's 11000 duplicate-key code, falling back to the message text.
 *
 * Only a column NAME ever reaches the message. DETAIL and Mongo's keyValue carry the offending
 * value ("Key (mobile)=(98…)"), which is PII for much of this system, and the constraint name
 * describes the schema; neither is echoed.
 *
 * Kept byte-identical across every service (mirror any change everywhere). Used by `errorHandler`
 * in `./error-middleware`, so a raw "duplicate key value violates unique constraint …" never
 * reaches a toast, in any environment.
 */
export interface DatabaseErrorTranslation {
  status: 400 | 409;
  code: 'E_BAD_REQUEST' | 'E_CONFLICT';
  message: string;
}

interface DriverErrorFields {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  column?: unknown;
  keyPattern?: unknown;
  driverError?: DriverErrorFields;
}

export const translateDatabaseError = (error: unknown): DatabaseErrorTranslation | null => {
  if (error == null) return null;
  const e: DriverErrorFields = typeof error === 'object' ? (error as DriverErrorFields) : { message: error };
  const pick = (k: keyof DriverErrorFields): unknown => e[k] ?? e.driverError?.[k];
  const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const code = str(pick('code'));
  const text = str(pick('message'));
  const detail = str(pick('detail'));

  // Unique violation: Postgres 23505, MongoDB 11000.
  if (code === '23505' || code === '11000' || /duplicate key value violates|E11000 duplicate key/.test(text)) {
    const keyPattern = pick('keyPattern');
    const columns =
      keyPattern && typeof keyPattern === 'object' ? humanColumns(Object.keys(keyPattern)) : detailColumns(detail);
    return conflict(
      columns ? `A record with this ${columns} already exists.` : 'A record with these details already exists.',
    );
  }

  // Exclusion violation: 23P01 (e.g. two bookings of one room over the same hours).
  if (code === '23P01' || text.includes('violates exclusion constraint')) {
    return conflict('This overlaps with an existing record.');
  }

  // Foreign key violation: 23503. Deleting a row others point at, or pointing at a row that is gone.
  if (code === '23503' || text.includes('violates foreign key constraint')) {
    return detail.includes('is still referenced') || text.startsWith('update or delete on table')
      ? conflict('This record is still in use and cannot be changed or removed.')
      : badRequest('This refers to a record that does not exist.');
  }

  // Not-null violation: 23502.
  if (code === '23502' || text.includes('violates not-null constraint')) {
    const column = humanColumns([str(pick('column')) || (/null value in column "([^"]+)"/.exec(text)?.[1] ?? '')]);
    return badRequest(column ? `The field "${column}" is required.` : 'A required field is missing.');
  }

  // Check violation: 23514.
  if (code === '23514' || text.includes('violates check constraint')) {
    return badRequest('One or more values are outside the allowed range.');
  }

  return null;
};

const conflict = (message: string): DatabaseErrorTranslation => ({ status: 409, code: 'E_CONFLICT', message });
const badRequest = (message: string): DatabaseErrorTranslation => ({ status: 400, code: 'E_BAD_REQUEST', message });

/** The columns of a Postgres `Key (facility_id, code)=(…) already exists.` DETAIL line. */
const detailColumns = (detail: string): string | null => {
  const match = /Key \(([^)]*)\)=/.exec(detail);
  return match?.[1] ? humanColumns(match[1].split(',')) : null;
};

/**
 * Column names as words: `mobile_lookup` → "mobile", (facility_id, code) → "facility id and code".
 * Null unless every entry is a plain identifier, so an expression index (`lower(name::text)`)
 * falls back to the generic message rather than showing SQL.
 */
const humanColumns = (names: string[]): string | null => {
  const cols = names.map((n) => n.trim());
  if (cols.length === 0 || !cols.every((c) => /^[a-z_][a-z0-9_]*$/i.test(c))) return null;
  return cols.map((c) => c.replace(/_lookup$/, '').replace(/_/g, ' ')).join(' and ');
};
