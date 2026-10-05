import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { AuthContext } from './access-token';
import { NotFoundError } from './errors';

/**
 * Center / District scoping (rules R-SCOPE-1..3, docs/SECURITY.md S-SCOPE-1).
 *
 *   STATE     sees every row
 *   DISTRICT  sees rows whose district_id = the active assignment's district
 *   CENTER    sees rows whose center_id   = the active assignment's center
 *
 * EVERY query that returns or changes a scoped row (beneficiary, application, PPO, payment, document,
 * user of a center, ...) goes through `applyScope` (lists) or `assertInScope` (one row). There is no
 * other way to filter by scope, and a handler never compares ids itself.
 *
 * Fail closed: a DISTRICT caller without a district, or a CENTER caller without a center, matches
 * NOTHING (`1 = 0`), never everything.
 *
 * The column names passed in MUST be compile-time constants such as 'b.center_id'. They are placed
 * into SQL; never pass anything derived from a request.
 */
export interface ScopeColumns {
  /** e.g. 'b.district_id' */
  district: string;
  /** e.g. 'b.center_id' */
  center: string;
}

const COLUMN_REF = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

export const applyScope = <T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, auth: AuthContext, cols: ScopeColumns): SelectQueryBuilder<T> => {
  if (!COLUMN_REF.test(cols.district) || !COLUMN_REF.test(cols.center)) {
    throw new Error(`applyScope: column refs must look like "alias.column", got ${cols.district} / ${cols.center}`);
  }
  switch (auth.scope) {
    case 'STATE':
      return qb;
    case 'DISTRICT':
      return auth.districtId ? qb.andWhere(`${cols.district} = :scopeDistrictId`, { scopeDistrictId: auth.districtId }) : qb.andWhere('1 = 0');
    case 'CENTER':
      return auth.centerId ? qb.andWhere(`${cols.center} = :scopeCenterId`, { scopeCenterId: auth.centerId }) : qb.andWhere('1 = 0');
    default:
      return qb.andWhere('1 = 0');
  }
};

export interface ScopedRow {
  districtId: string | null;
  centerId: string | null;
}

export const isInScope = (auth: AuthContext, row: ScopedRow): boolean => {
  switch (auth.scope) {
    case 'STATE':
      return true;
    case 'DISTRICT':
      return !!auth.districtId && row.districtId === auth.districtId;
    case 'CENTER':
      return !!auth.centerId && row.centerId === auth.centerId;
    default:
      return false;
  }
};

/**
 * For a single row already loaded: out of scope is reported as NOT FOUND (404), exactly like a row
 * that does not exist, so a worker cannot learn that a UID exists at another Center (R-SCOPE-2).
 */
export const assertInScope = <T extends ScopedRow>(auth: AuthContext, row: T | null | undefined, what = 'record'): T => {
  if (!row || !isInScope(auth, row)) throw new NotFoundError(`${what} not found`);
  return row;
};
