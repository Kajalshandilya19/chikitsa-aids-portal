import { z } from 'zod';

/** `?sort=<column>&dir=asc|desc` for paged lists. The column is looked up in a whitelist, never interpolated. */
export const sortQuery = {
  sort: z.string().trim().max(40).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
};

/**
 * ORDER BY body for a list: the requested column (if whitelisted) then the list's usual order as
 * the tie-breaker, so pages stay stable when many rows share a value.
 */
export const orderBy = (columns: Readonly<Record<string, string>>, sort: string | undefined, dir: 'asc' | 'desc' | undefined, fallback: string): string => {
  const col = sort ? columns[sort] : undefined;
  return col ? `${col} ${dir === 'desc' ? 'DESC' : 'ASC'}, ${fallback}` : fallback;
};
