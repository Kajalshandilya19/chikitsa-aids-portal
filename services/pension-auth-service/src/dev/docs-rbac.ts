import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderRbacMatrix } from '../domain/rbac-matrix';

/** `npm run docs:rbac`: regenerates docs/RBAC_PERMISSION_MATRIX.md from src/domain/permissions.ts. */
const target = path.resolve(__dirname, '../../../../docs/RBAC_PERMISSION_MATRIX.md');
writeFileSync(target, renderRbacMatrix());
console.log(`wrote ${target}`);
