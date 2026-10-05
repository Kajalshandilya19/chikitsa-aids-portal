import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** One portal setting (src/domain/settings.ts lists every key, its schema and its default). */
@Entity({ name: 'app_settings' })
export class AppSettingEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 64 })
  key!: string;

  @Column({ name: 'value', type: 'jsonb' })
  value!: unknown;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
