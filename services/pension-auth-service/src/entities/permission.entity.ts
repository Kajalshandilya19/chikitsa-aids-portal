import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ScopeLevel } from '../lib/permission-codes';

/** Permission catalogue row. Written ONLY by the rbac sync from src/domain/permissions.ts. */
@Entity({ name: 'permissions' })
export class PermissionEntity {
  @PrimaryColumn({ name: 'code', type: 'varchar', length: 80 })
  code!: string;

  @Column({ name: 'section', type: 'varchar', length: 32 })
  section!: string;

  @Column({ name: 'resource', type: 'varchar', length: 32 })
  resource!: string;

  @Column({ name: 'action', type: 'varchar', length: 32 })
  action!: string;

  @Column({ name: 'label_en', type: 'varchar', length: 200 })
  labelEn!: string;

  @Column({ name: 'label_hi', type: 'varchar', length: 200 })
  labelHi!: string;

  /** Role scope levels that may hold this permission. */
  @Column({ name: 'allowed_scopes', type: 'text', array: true })
  allowedScopes!: ScopeLevel[];

  /** false: only a super admin may grant it. */
  @Column({ name: 'delegable', type: 'boolean', default: true })
  delegable!: boolean;

  /** Grants access to unmasked personal data or full exports. Shown with a warning in the role editor. */
  @Column({ name: 'sensitive', type: 'boolean', default: false })
  sensitive!: boolean;

  @Column({ name: 'sort_order', type: 'integer' })
  sortOrder!: number;
}
