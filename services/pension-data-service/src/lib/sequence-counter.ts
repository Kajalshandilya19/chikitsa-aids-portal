import type { EntityManager } from 'typeorm';

// Atomic sequence allocation backed by a service-local `sequence_counters` table:
//   PRIMARY KEY (counter_name, scope, period) → last_seq
// One INSERT ... ON CONFLICT DO UPDATE ... RETURNING both claims and returns the next value.
// Postgres row-locks the counter row, so concurrent callers each receive a distinct number :
// unlike the COUNT(*)+1 read-then-insert pattern this replaces, which handed the same value
// to every request that read between another request's read and commit.
//
// `counter` names the identifier family ('uhid', 'visit_no', 'admission_number', ...).
// `period` is the reset window baked into the number's prefix (YYMMDD for daily sequences,
// YYYY for yearly, '' when the sequence never resets).
// `scope` narrows the sequence to the facility code / parent row id the number format embeds
// ('' for globally-sequenced numbers). A facility-scoped counter and a generic one differ
// only by this key: same table, same statement.
//
// `table` MUST be a compile-time constant (e.g. '"patient"."sequence_counters"'): it is
// interpolated into the SQL. Never pass request-derived input.
export const nextSequence = async (
  manager: EntityManager,
  table: string,
  counter: string,
  period: string,
  scope = '',
): Promise<number> => {
  const rows = (await manager.query(
    `INSERT INTO ${table} AS c ("counter_name", "scope", "period", "last_seq")
     VALUES ($1, $2, $3, 1)
     ON CONFLICT ("counter_name", "scope", "period")
     DO UPDATE SET "last_seq" = c."last_seq" + 1, "updated_at" = now()
     RETURNING "last_seq"`,
    [counter, scope, period],
  )) as Array<{ last_seq: number | string }>;
  const row = rows[0];
  if (!row) throw new Error('sequence_counters upsert returned no row');
  return Number(row.last_seq);
};
