import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { piiTransformer } from '../lib/pii';

export type ImportKind = 'centers' | 'soch' | 'payments';
export type BatchStatus = 'VALIDATED' | 'REJECTED' | 'COMMITTING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';

export interface RowIssue {
  field: string;
  rule: string | null;
  message: string;
}

/** One uploaded file (docs/IMPORT_PIPELINE.md §2). */
@Entity({ name: 'import_batches' })
export class ImportBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'kind', type: 'varchar', length: 32 })
  kind!: ImportKind;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status!: BatchStatus;

  /** 🔒 the uploaded name can contain a person's name */
  @Column({ name: 'file_name', type: 'text', transformer: piiTransformer })
  fileName!: string;

  @Column({ name: 'file_sha256', type: 'varchar', length: 64 })
  fileSha256!: string;

  @Column({ name: 'file_type', type: 'varchar', length: 8 })
  fileType!: 'xlsx' | 'csv';

  @Column({ name: 'file_size', type: 'integer' })
  fileSize!: number;

  @Column({ name: 'row_count', type: 'integer', default: 0 })
  rowCount!: number;

  @Column({ name: 'valid_count', type: 'integer', default: 0 })
  validCount!: number;

  @Column({ name: 'error_count', type: 'integer', default: 0 })
  errorCount!: number;

  @Column({ name: 'duplicate_count', type: 'integer', default: 0 })
  duplicateCount!: number;

  @Column({ name: 'create_count', type: 'integer', default: 0 })
  createCount!: number;

  @Column({ name: 'update_count', type: 'integer', default: 0 })
  updateCount!: number;

  @Column({ name: 'unchanged_count', type: 'integer', default: 0 })
  unchangedCount!: number;

  @Column({ name: 'header_errors', type: 'jsonb', default: () => "'[]'" })
  headerErrors!: RowIssue[];

  @Column({ name: 'result', type: 'jsonb', nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;

  @Column({ name: 'committed_by', type: 'uuid', nullable: true })
  committedBy!: string | null;

  @Column({ name: 'committed_at', type: 'timestamptz', nullable: true })
  committedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
