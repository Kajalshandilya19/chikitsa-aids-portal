import { Column, Entity } from 'typeorm';
import type { ScopeLevel } from '../lib/permission-codes';
import { BaseRow } from './base';

/** A role (8 system roles, seeded from src/domain/permissions.ts ROLE_TEMPLATES). */
@Entity({ name: 'roles' })
export class RoleEntity extends BaseRow {
  @Column({ name: 'code', type: 'varchar', length: 64, unique: true })
  code!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150 })
  nameEn!: string;

  @Column({ name: 'name_hi', type: 'varchar', length: 150 })
  nameHi!: string;

  /** The level an assignment of this role is made at: STATE (no district/center), DISTRICT, CENTER. */
  @Column({ name: 'scope_level', type: 'varchar', length: 16 })
  scopeLevel!: ScopeLevel;

  /** TOTP required at login (STATE and DISTRICT roles). */
  @Column({ name: 'mfa_required', type: 'boolean', default: false })
  mfaRequired!: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: true })
  isSystem!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** Set when a super admin edits the permissions; rbac sync then keeps the edit. */
  @Column({ name: 'permissions_customized', type: 'boolean', default: false })
  permissionsCustomized!: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;
}
