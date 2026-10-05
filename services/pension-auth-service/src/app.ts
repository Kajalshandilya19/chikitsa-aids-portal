import type { Express } from 'express';
import { AppDataSource } from './config/datasource';
import { registerPermissionResolver, registerSessionCheck } from './lib/auth-middleware';
import { createServiceApp } from './lib/http-app';
import { apiRouter } from './routes/v1';
import { internalRouter } from './routes/internal';
import { roleService } from './services/role.service';
import { sessionService } from './services/session.service';

export const SERVICE_NAME = 'pension-auth-service';

export const createApp = (): Express => {
  // auth-service reads permissions from its own tables and refuses tokens of revoked sessions.
  registerPermissionResolver((roleId) => roleService.permissionCodes(roleId));
  registerSessionCheck((auth) => sessionService.assertLive(auth));
  return createServiceApp({
    name: SERVICE_NAME,
    mount: '/auth/api/v1',
    api: apiRouter,
    internal: internalRouter,
    ready: async () => {
      const rows = (await AppDataSource.query('SELECT count(*)::int AS n FROM pension_auth.roles')) as { n: number }[];
      return { db: 'ok', roles: rows[0]?.n ?? 0 };
    },
  });
};
