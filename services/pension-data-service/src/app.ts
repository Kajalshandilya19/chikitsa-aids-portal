import { Router, type Express } from 'express';
import { AppDataSource } from './config/datasource';
import { authClient } from './clients/auth.client';
import { registerPermissionResolver } from './lib/auth-middleware';
import { createServiceApp } from './lib/http-app';
import { apiRouter } from './routes/v1';

export const SERVICE_NAME = 'pension-data-service';

export const createApp = (): Express => {
  registerPermissionResolver((roleId) => authClient.rolePermissions(roleId));
  return createServiceApp({
    name: SERVICE_NAME,
    mount: '/data/api/v1',
    api: apiRouter,
    // No /internal routes yet: nothing calls data-service. Keep the mount so the guard is in place.
    internal: Router(),
    ready: async () => {
      await AppDataSource.query('SELECT 1');
      return { db: 'ok' };
    },
  });
};
