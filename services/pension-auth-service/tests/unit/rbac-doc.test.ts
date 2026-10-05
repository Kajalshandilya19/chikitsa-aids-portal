import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderRbacMatrix } from '../../src/domain/rbac-matrix';

test('UT-RBAC-012 docs/RBAC_PERMISSION_MATRIX.md matches the code (run `npm run docs:rbac` after changing permissions.ts)', () => {
  const doc = readFileSync(path.resolve(__dirname, '../../../../docs/RBAC_PERMISSION_MATRIX.md'), 'utf8');
  expect(doc).toBe(renderRbacMatrix());
});
