import type { Express } from 'express';
import { AppDataSource } from './config/datasource';
import { authClient } from './clients/auth.client';
import { registerPermissionResolver } from './lib/auth-middleware';
import { createServiceApp } from './lib/http-app';
import { apiRouter } from './routes/v1';
import { internalRouter } from './routes/internal';

export const SERVICE_NAME = 'pension-core-service';

export const createApp = (): Express => {
  // Permissions live in auth-service; asked over /internal and cached 60 s per role by lib/auth-middleware.
  registerPermissionResolver((roleId) => authClient.rolePermissions(roleId));
  return createServiceApp({
    name: SERVICE_NAME,
    mount: '/core/api/v1',
    api: apiRouter,
    internal: internalRouter,
    ready: async () => {
      await AppDataSource.query('SELECT 1');
      return { db: 'ok' };
    },
  });
};
