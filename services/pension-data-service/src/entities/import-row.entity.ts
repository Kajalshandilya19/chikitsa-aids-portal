import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { piiTransformer } from '../lib/pii';
import type { RowIssue } from './import-batch.entity';

export type RowStatus = 'VALID' | 'ERROR' | 'DUPLICATE';
export type RowAction = 'CREATE' | 'UPDATE' | 'UNCHANGED';

/** One data row of an uploaded file, as parsed. Deleted on cancel and by the retention purge. */
@Entity({ name: 'import_rows' })
export class ImportRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId!: string;

  /** 1-based data row number; the header row is not counted. */
  @Column({ name: 'row_number', type: 'integer' })
  rowNumber!: number;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  status!: RowStatus;

  @Column({ name: 'action', type: 'varchar', length: 16, nullable: true })
  action!: RowAction | null;

  /** 🔒 JSON of the row's field values (SOCH rows are personal data) */
  @Column({ name: 'values', type: 'text', transformer: piiTransformer })
  values!: string;

  /** field names, rule ids and generic messages only: never a value */
  @Column({ name: 'errors', type: 'jsonb', default: () => "'[]'" })
  errors!: RowIssue[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
