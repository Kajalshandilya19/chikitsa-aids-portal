import { Column, Entity } from 'typeorm';
import { BaseRow } from './base';

/** Rajasthan district master (seeded from LGD, docs/SEED_DATA.md). Not personal data. */
@Entity({ name: 'districts' })
export class DistrictEntity extends BaseRow {
  /** V-027 */
  @Column({ name: 'lgd_code', type: 'integer', unique: true })
  lgdCode!: number;

  /** Uppercase slug of the English name, e.g. SAWAI_MADHOPUR. */
  @Column({ name: 'code', type: 'varchar', length: 32, unique: true })
  code!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150 })
  nameEn!: string;

  /** V-035 */
  @Column({ name: 'name_hi', type: 'varchar', length: 150 })
  nameHi!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
