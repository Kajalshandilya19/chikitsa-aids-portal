import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseRow } from './base';
import { CenterEntity } from './center.entity';
import { DistrictEntity } from './district.entity';
import { RoleEntity } from './role.entity';

/**
 * An assignment: user x role x place. The place must match the role's scope_level (enforced in
 * assignment.service.ts, rule BR-A3):
 *   STATE     district_id NULL,  center_id NULL
 *   DISTRICT  district_id set,   center_id NULL
 *   CENTER    district_id set,   center_id set (district_id = the center's district)
 */
@Entity({ name: 'user_roles' })
export class UserRoleEntity extends BaseRow {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: 'role_id' })
  role?: RoleEntity;

  @Column({ name: 'district_id', type: 'uuid', nullable: true })
  districtId!: string | null;

  @ManyToOne(() => DistrictEntity)
  @JoinColumn({ name: 'district_id' })
  district?: DistrictEntity | null;

  @Column({ name: 'center_id', type: 'uuid', nullable: true })
  centerId!: string | null;

  @ManyToOne(() => CenterEntity)
  @JoinColumn({ name: 'center_id' })
  center?: CenterEntity | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;
}
