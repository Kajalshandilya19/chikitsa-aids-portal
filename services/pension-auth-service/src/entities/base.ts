import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Columns every table has. Rule R-DB-4: uuid primary key, created_at and updated_at as timestamptz.
 * Every @Column states its `type` and `name` explicitly (snake_case in the database, camelCase here).
 */
export abstract class BaseRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
