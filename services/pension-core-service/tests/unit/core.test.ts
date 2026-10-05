import request from 'supertest';
import { formatPpoNumber, ppoPatternProblems } from '../../src/domain/ppo-number';
import { SETTINGS, SETTING_BY_KEY } from '../../src/domain/settings';
import { issueAccessToken, type AuthContext } from '../../src/lib/access-token';
import { registerPermissionResolver } from '../../src/lib/auth-middleware';
import { getServiceToken } from '../../src/lib/internal-call';
import { useMemoryKvForTests } from '../../src/lib/kv';
import { P } from '../../src/lib/permission-codes';
import { ppoNumber } from '../../src/lib/validators';

jest.mock('../../src/config/datasource', () => ({ AppDataSource: { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createServiceApp } = require('../../src/lib/http-app') as typeof import('../../src/lib/http-app');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { apiRouter } = require('../../src/routes/v1') as typeof import('../../src/routes/v1');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { internalRouter } = require('../../src/routes/internal') as typeof import('../../src/routes/internal');

const auth = (over: Partial<AuthContext> = {}): AuthContext => ({
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  userCode: 'worker.rj001',
  name: 'Test',
  assignmentId: '33333333-3333-4333-8333-333333333333',
  roleId: '44444444-4444-4444-8444-444444444444',
  roleCode: 'center_worker',
  scope: 'CENTER',
  districtId: 'd1',
  centerId: 'c1',
  centerCode: 'RJ001',
  mustChangePassword: false,
  ...over,
});

describe('PPO number pattern (BR-P1..P3)', () => {
  test('UT-PPO-001 the placeholder default is valid and formats as expected', () => {
    const pattern = SETTING_BY_KEY.get('ppo.number_pattern')!.default as string;
    expect(ppoPatternProblems(pattern)).toEqual([]);
    const n = formatPpoNumber(pattern, { districtLgdCode: 86, centerCode: 'RJ001', year: 2026, seq: 1 });
    expect(n).toBe('RJ/HIVP/086/2026/000001');
    expect(ppoNumber.safeParse(n).success).toBe(true);
  });

  test('UT-PPO-002 patterns without exactly one {SEQ:n}, with unknown tokens or lowercase text are refused', () => {
    expect(ppoPatternProblems('RJ/{YYYY}')).not.toEqual([]);
    expect(ppoPatternProblems('RJ/{SEQ:6}/{SEQ:6}')).not.toEqual([]);
    expect(ppoPatternProblems('RJ/{NAME}/{SEQ:6}')).not.toEqual([]);
    expect(ppoPatternProblems('rj/{SEQ:6}')).not.toEqual([]);
    expect(ppoPatternProblems('RJ-{CENTER}-{YY}-{SEQ:5}')).toEqual([]);
  });
});

describe('settings registry', () => {
  test('UT-SET-001 every default satisfies its own schema', () => {
    for (const s of SETTINGS) expect({ key: s.key, ok: (s.schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(s.default).success }).toEqual({ key: s.key, ok: true });
  });

  test('UT-SET-002 placeholders point at an open question', () => {
    for (const s of SETTINGS.filter((x) => x.placeholder)) expect('question' in s && /^Q-\d{2}$/.test(String(s.question))).toBe(true);
  });
});

describe('HTTP baseline (lib/http-app, lib/auth-middleware)', () => {
  beforeAll(() => {
    useMemoryKvForTests();
    registerPermissionResolver(async (roleId) => (roleId === 'admin-role' ? [P.MASTER_SETTINGS_VIEW] : [P.DASHBOARD_CENTER_VIEW]));
  });
  const app = () => createServiceApp({ name: 'pension-core-service', mount: '/core/api/v1', api: apiRouter, internal: internalRouter, ready: async () => ({ db: 'ok' }) });
  const bearer = (a: AuthContext) => `Bearer ${issueAccessToken(a).token}`;

  test('UT-HTTP-001 health is public; unknown routes answer the error envelope', async () => {
    await request(app()).get('/health').expect(200);
    const r = await request(app()).get('/core/api/v1/nope').set('authorization', bearer(auth()));
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ success: false, code: 'E_NOT_FOUND' });
    expect(r.headers['cache-control']).toContain('no-store');
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  test('UT-HTTP-002 no token is 401, a token without the permission is 403, with it 200', async () => {
    await request(app()).get('/core/api/v1/settings').expect(401);
    const denied = await request(app()).get('/core/api/v1/settings').set('authorization', bearer(auth()));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('E_PERMISSION');
  });

  test('UT-HTTP-003 /context echoes the verified scope and permissions', async () => {
    const r = await request(app()).get('/core/api/v1/context').set('authorization', bearer(auth()));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ scope: 'CENTER', center_code: 'RJ001', permissions: [P.DASHBOARD_CENTER_VIEW] });
  });

  test('UT-HTTP-004 a user whose password must change is refused everywhere here', async () => {
    const r = await request(app()).get('/core/api/v1/context').set('authorization', bearer(auth({ mustChangePassword: true })));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('E_PASSWORD_CHANGE_REQUIRED');
  });

  test('UT-HTTP-005 internal routes need a service token; a user token does not count', async () => {
    const userTry = await request(app()).get('/core/api/v1/internal/anything').set('x-service-token', issueAccessToken(auth()).token);
    expect(userTry.status).toBe(401);
    const svc = await request(app()).get('/core/api/v1/internal/anything').set('x-service-token', getServiceToken());
    expect(svc.status).toBe(404);
  });

  test('UT-HTTP-006 script markup in a query string is refused', async () => {
    const r = await request(app()).get('/core/api/v1/context?q=%3Cscript%3E').set('authorization', bearer(auth()));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('E_UNSAFE_INPUT');
  });
});
