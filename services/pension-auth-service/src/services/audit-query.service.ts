import { AppDataSource } from '../config/datasource';
import { AUDIT, writeAudit } from '../lib/audit';
import type { AuditListQuery } from '../dtos/audit.dto';

/** Read side of pension_audit.audit_logs (docs/API_AUTH.md §7). Only auth-service can read the table. */
export const auditQueryService = {
  async list(q: AuditListQuery) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (q.action) add('action = ?', q.action);
    if (q.outcome) add('outcome = ?', q.outcome);
    if (q.actor_user_id) add('actor_user_id = ?', q.actor_user_id);
    if (q.entity_type) add('entity_type = ?', q.entity_type);
    if (q.entity_id) add('entity_id = ?', q.entity_id);
    if (q.center_id) add('center_id = ?', q.center_id);
    if (q.from) add("created_at >= (?::date AT TIME ZONE 'Asia/Kolkata')", q.from);
    if (q.to) add("created_at < ((?::date + 1) AT TIME ZONE 'Asia/Kolkata')", q.to);
    // Only the constant fragments above are joined into SQL; every value is a $n parameter (R-DB-3).
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countSql = `SELECT count(*)::int AS n FROM pension_audit.audit_logs ${whereSql}`;
    const countRows = (await AppDataSource.query(countSql, params)) as { n: number }[];
    params.push(q.limit, (q.page - 1) * q.limit);
    const listSql = `SELECT id, chain, seq, action, outcome, actor_user_id, entity_type, entity_id, district_id, center_id, request_id,
              payload->'data' AS data, payload->>'actor_role' AS actor_role, payload->>'ip' AS ip, created_at
       FROM pension_audit.audit_logs ${whereSql}
       ORDER BY created_at DESC, seq DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = (await AppDataSource.query(listSql, params)) as Record<string, unknown>[];
    return { rows, total: countRows[0]?.n ?? 0 };
  },

  async verifyAll() {
    const chains = (await AppDataSource.query('SELECT DISTINCT chain FROM pension_audit.audit_logs ORDER BY chain')) as { chain: string }[];
    const out = [];
    for (const { chain } of chains) {
      const r = ((await AppDataSource.query('SELECT * FROM pension_audit.verify_chain($1)', [chain])) as { ok: boolean; checked: string; broken_at_seq: string | null }[])[0];
      out.push({ chain, ok: r?.ok ?? false, checked: Number(r?.checked ?? 0), broken_at_seq: r?.broken_at_seq == null ? null : Number(r.broken_at_seq) });
    }
    await writeAudit(AppDataSource, { action: AUDIT.AUDIT_CHAIN_VERIFIED, data: { chains: out.map((c) => ({ chain: c.chain, ok: c.ok })) } });
    return out;
  },
};
