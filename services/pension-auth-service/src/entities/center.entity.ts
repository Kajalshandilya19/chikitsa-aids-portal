import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRow } from './base';
import { DistrictEntity } from './district.entity';

/** HIV / ART Center master. A Center belongs to exactly one District. Not personal data. */
@Entity({ name: 'centers' })
export class CenterEntity extends BaseRow {
  /** V-003, e.g. RJ001. Unique, uppercase, typed by workers at login. */
  @Column({ name: 'code', type: 'varchar', length: 16, unique: true })
  code!: string;

  /** V-038 */
  @Column({ name: 'name_en', type: 'varchar', length: 150 })
  nameEn!: string;

  /** V-035, optional */
  @Column({ name: 'name_hi', type: 'varchar', length: 150, nullable: true })
  nameHi!: string | null;

  @Column({ name: 'district_id', type: 'uuid' })
  districtId!: string;

  @ManyToOne(() => DistrictEntity)
  @JoinColumn({ name: 'district_id' })
  district?: DistrictEntity;

  /** V-040 */
  @Column({ name: 'center_type', type: 'varchar', length: 16, default: 'ART' })
  centerType!: 'ART' | 'LAC' | 'COE' | 'OTHER';

  /** The "Facility Code" in SOCH exports; maps SOCH rows to this Center during import. */
  @Column({ name: 'soch_facility_code', type: 'varchar', length: 32, nullable: true, unique: true })
  sochFacilityCode!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** true for the seeded placeholder list (docs/SEED_DATA.md); the real RSACS list replaces it. */
  @Column({ name: 'is_placeholder', type: 'boolean', default: false })
  isPlaceholder!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
