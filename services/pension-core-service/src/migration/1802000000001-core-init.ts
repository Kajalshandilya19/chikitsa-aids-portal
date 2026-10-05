import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pension_core, Phase 0: portal settings and the sequence counters used later for PPO numbers.
 * Phase 1 adds beneficiaries; Phase 2 applications; see docs/DATA_MODEL.md for the full target model.
 * Rule R-DB-5: never edit this file after it has run anywhere; add a new migration.
 */
export class CoreInit1802000000001 implements MigrationInterface {
  name = 'CoreInit1802000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE pension_core.app_settings (
        key         varchar(64) PRIMARY KEY CHECK (key ~ '^[a-z_]+\\.[a-z_]+$'),
        value       jsonb NOT NULL,
        updated_by  uuid,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE pension_core.sequence_counters (
        counter_name  varchar(64) NOT NULL,
        scope         varchar(64) NOT NULL DEFAULT '',
        period        varchar(16) NOT NULL DEFAULT '',
        last_seq      bigint NOT NULL DEFAULT 0,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (counter_name, scope, period)
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS pension_core.sequence_counters');
    await q.query('DROP TABLE IF EXISTS pension_core.app_settings');
  }
}
