import type { RequestHandler } from 'express';

/*
 * No response of a service is stored by the browser or an intermediary (VAPT 389/26-27/2798 retest,
 * "Improper Cache Control Header", CWE-525). Every answer is per-user data, and the services are
 * reachable from outside through the gateway too, not only via the BFF. Mounted once in app.ts
 * right after helmet; a route that streams a file sets the same value. Byte-identical in every
 * service.
 */

export const NO_STORE_CACHE_CONTROL = 'no-cache, no-store, must-revalidate';

export const noStore = (): RequestHandler => (_req, res, next) => {
  res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};
