import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'role_permissions' })
export class RolePermissionEntity {
  @PrimaryColumn({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_code', type: 'varchar', length: 80 })
  permissionCode!: string;
}
