import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pension_data: import batches and their staged rows (docs/IMPORT_PIPELINE.md).
 * The uploaded FILE is never stored; only its SHA-256, its parsed rows (encrypted) and the batch summary.
 */
export class DataInit1803000000001 implements MigrationInterface {
  name = 'DataInit1803000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE pension_data.import_batches (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind             varchar(32) NOT NULL CHECK (kind IN ('centers','soch','payments')),
        status           varchar(16) NOT NULL CHECK (status IN ('VALIDATED','REJECTED','COMMITTING','COMMITTED','FAILED','CANCELLED')),
        file_name        text NOT NULL,
        file_sha256      varchar(64) NOT NULL,
        file_type        varchar(8) NOT NULL CHECK (file_type IN ('xlsx','csv')),
        file_size        integer NOT NULL,
        row_count        integer NOT NULL DEFAULT 0,
        valid_count      integer NOT NULL DEFAULT 0,
        error_count      integer NOT NULL DEFAULT 0,
        duplicate_count  integer NOT NULL DEFAULT 0,
        create_count     integer NOT NULL DEFAULT 0,
        update_count     integer NOT NULL DEFAULT 0,
        unchanged_count  integer NOT NULL DEFAULT 0,
        header_errors    jsonb NOT NULL DEFAULT '[]',
        result           jsonb,
        uploaded_by      uuid NOT NULL,
        uploaded_at      timestamptz NOT NULL DEFAULT now(),
        committed_by     uuid,
        committed_at     timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query('CREATE INDEX import_batches_kind_idx ON pension_data.import_batches (kind, uploaded_at DESC)');

    await q.query(`
      CREATE TABLE pension_data.import_rows (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id    uuid NOT NULL REFERENCES pension_data.import_batches(id) ON DELETE CASCADE,
        row_number  integer NOT NULL,
        status      varchar(16) NOT NULL CHECK (status IN ('VALID','ERROR','DUPLICATE')),
        action      varchar(16) CHECK (action IN ('CREATE','UPDATE','UNCHANGED')),
        values      text NOT NULL,
        errors      jsonb NOT NULL DEFAULT '[]',
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT import_rows_batch_row UNIQUE (batch_id, row_number)
      )`);
    await q.query('CREATE INDEX import_rows_status_idx ON pension_data.import_rows (batch_id, status, row_number)');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS pension_data.import_rows');
    await q.query('DROP TABLE IF EXISTS pension_data.import_batches');
  }
}
