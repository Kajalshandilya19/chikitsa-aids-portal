import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pension_audit: the append-only, hash-chained audit log shared by all services (docs/SECURITY.md S-AUD-1..4).
 *
 *   audit_logs        one row per event; (chain, seq) unique; event_hash links to the previous row of the chain
 *   append_event()    SECURITY DEFINER: the ONLY way to write. Core and data get EXECUTE on it, nothing else.
 *   verify_chain()    recomputes every hash of a chain; used by GET /audit/verify
 *   forbid_change()   trigger: UPDATE, DELETE and TRUNCATE raise an error, even for the owner
 *
 * One chain per service (chain = service name) so services never wait on each other's lock.
 */
const ROLE_NAME = /^[a-z_][a-z0-9_]{1,62}$/;

export class AuditLog1801000000002 implements MigrationInterface {
  name = 'AuditLog1801000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE pension_audit.audit_logs (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        chain          varchar(64) NOT NULL,
        seq            bigint NOT NULL,
        action         varchar(80) NOT NULL,
        outcome        varchar(8) NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE')),
        actor_user_id  uuid,
        entity_type    varchar(64),
        entity_id      varchar(64),
        district_id    uuid,
        center_id      uuid,
        request_id     varchar(64),
        payload        jsonb NOT NULL,
        prev_hash      varchar(64),
        event_hash     varchar(64) NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT audit_logs_chain_seq UNIQUE (chain, seq)
      )`);
    await q.query('CREATE INDEX audit_logs_created_idx ON pension_audit.audit_logs (created_at DESC)');
    await q.query('CREATE INDEX audit_logs_action_idx ON pension_audit.audit_logs (action, created_at DESC)');
    await q.query('CREATE INDEX audit_logs_actor_idx ON pension_audit.audit_logs (actor_user_id, created_at DESC)');
    await q.query('CREATE INDEX audit_logs_entity_idx ON pension_audit.audit_logs (entity_type, entity_id)');
    await q.query('CREATE INDEX audit_logs_center_idx ON pension_audit.audit_logs (center_id, created_at DESC)');

    await q.query(`
      CREATE FUNCTION pension_audit.forbid_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'pension_audit.audit_logs is append-only';
      END $$`);
    await q.query(`
      CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON pension_audit.audit_logs
      FOR EACH ROW EXECUTE FUNCTION pension_audit.forbid_change()`);
    await q.query(`
      CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON pension_audit.audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION pension_audit.forbid_change()`);

    await q.query(`
      CREATE FUNCTION pension_audit.append_event(p_chain text, p_payload jsonb) RETURNS uuid
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pension_audit, pg_temp AS $$
      DECLARE
        v_prev text;
        v_seq  bigint;
        v_hash text;
        v_id   uuid;
      BEGIN
        IF p_chain IS NULL OR p_chain !~ '^[a-z0-9-]{3,64}$' THEN
          RAISE EXCEPTION 'append_event: invalid chain';
        END IF;
        IF p_payload->>'action' IS NULL OR p_payload->>'action' !~ '^[a-z_]+\\.[a-z_]+\\.[a-z_]+$' THEN
          RAISE EXCEPTION 'append_event: invalid action';
        END IF;
        PERFORM pg_advisory_xact_lock(hashtext('pension_audit:' || p_chain));
        SELECT event_hash, seq INTO v_prev, v_seq FROM audit_logs WHERE chain = p_chain ORDER BY seq DESC LIMIT 1;
        v_seq  := COALESCE(v_seq, 0) + 1;
        v_hash := encode(sha256(convert_to(COALESCE(v_prev, '') || '|' || v_seq::text || '|' || p_payload::text, 'UTF8')), 'hex');
        INSERT INTO audit_logs (chain, seq, action, outcome, actor_user_id, entity_type, entity_id, district_id, center_id, request_id, payload, prev_hash, event_hash)
        VALUES (
          p_chain, v_seq, p_payload->>'action', COALESCE(p_payload->>'outcome', 'SUCCESS'),
          NULLIF(p_payload->>'actor_user_id', '')::uuid,
          LEFT(p_payload->>'entity_type', 64), LEFT(p_payload->>'entity_id', 64),
          NULLIF(p_payload->>'district_id', '')::uuid, NULLIF(p_payload->>'center_id', '')::uuid,
          LEFT(p_payload->>'request_id', 64), p_payload, v_prev, v_hash
        )
        RETURNING id INTO v_id;
        RETURN v_id;
      END $$`);

    await q.query(`
      CREATE FUNCTION pension_audit.verify_chain(p_chain text)
      RETURNS TABLE (ok boolean, checked bigint, broken_at_seq bigint)
      LANGUAGE plpgsql STABLE SET search_path = pension_audit, pg_temp AS $$
      DECLARE
        r       record;
        v_prev  text := NULL;
        v_count bigint := 0;
        v_exp   text;
      BEGIN
        FOR r IN SELECT seq, payload, prev_hash, event_hash FROM audit_logs WHERE chain = p_chain ORDER BY seq LOOP
          v_count := v_count + 1;
          v_exp := encode(sha256(convert_to(COALESCE(v_prev, '') || '|' || r.seq::text || '|' || r.payload::text, 'UTF8')), 'hex');
          IF r.seq <> v_count OR r.prev_hash IS DISTINCT FROM v_prev OR r.event_hash <> v_exp THEN
            RETURN QUERY SELECT false, v_count, r.seq;
            RETURN;
          END IF;
          v_prev := r.event_hash;
        END LOOP;
        RETURN QUERY SELECT true, v_count, NULL::bigint;
      END $$`);

    await q.query('REVOKE ALL ON FUNCTION pension_audit.append_event(text, jsonb) FROM PUBLIC');
    await q.query('REVOKE ALL ON FUNCTION pension_audit.verify_chain(text) FROM PUBLIC');
    for (const role of [process.env['CORE_DB_USER'] ?? 'pension_core_svc', process.env['DATA_DB_USER'] ?? 'pension_data_svc']) {
      if (!ROLE_NAME.test(role)) throw new Error(`invalid role name ${role}`);
      const exists = (await q.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])) as unknown[];
      if (exists.length) await q.query(`GRANT EXECUTE ON FUNCTION pension_audit.append_event(text, jsonb) TO ${role}`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP FUNCTION IF EXISTS pension_audit.verify_chain(text)');
    await q.query('DROP FUNCTION IF EXISTS pension_audit.append_event(text, jsonb)');
    await q.query('DROP TABLE IF EXISTS pension_audit.audit_logs');
    await q.query('DROP FUNCTION IF EXISTS pension_audit.forbid_change()');
  }
}
