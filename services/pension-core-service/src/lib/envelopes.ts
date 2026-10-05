/**
 * Every JSON response has one of these two shapes (rule R-API-1, docs/API_CONVENTIONS.md):
 *   success: { success: true, data, meta? }
 *   failure: { success: false, code, message, details?, request_id? }   (written by error-middleware)
 * A route never calls res.json() with anything else.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorEnvelope {
  success: false;
  code: string;
  message: string;
  details?: unknown;
  request_id?: string;
}

export const ok = <T>(data: T, meta?: PaginationMeta): SuccessEnvelope<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

/** A page of rows plus its meta, from a `[rows, total]` pair such as getManyAndCount() returns. */
export const paged = <T>(rows: T[], total: number, page: { page: number; limit: number }): SuccessEnvelope<T[]> =>
  ok(rows, { page: page.page, limit: page.limit, total });
