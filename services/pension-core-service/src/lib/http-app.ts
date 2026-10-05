import compression from 'compression';
import cors from 'cors';
import express, { type Express, type Request, type Router } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { requireServiceToken } from './auth-middleware';
import { baseConfig } from './base-config';
import { errorHandler, notFoundHandler } from './error-middleware';
import { registerServiceName } from './internal-call';
import { createLogger } from './logger';
import { noStore } from './no-store';
import { requestIdMiddleware } from './request-id';
import { xssGuard } from './xss-guard';

/**
 * The ONE place an Express app is assembled (rule R-API-5). Each service's src/app.ts only calls this
 * with its routers, so every service gets the same security baseline in the same order:
 *
 *   trust proxy (hop count) -> no x-powered-by -> helmet -> no-store -> CORS (origin list) ->
 *   compression -> JSON body (limit) -> request id -> access log (path only) -> xss guard ->
 *   /health, /health/ready -> <mount>/internal (service token only) -> <mount> -> 404 -> error handler
 *
 * The access log prints the PATH, never the query string: list filters carry names and identifiers.
 */
export interface ServiceAppOptions {
  /** e.g. 'pension-auth-service' */
  name: string;
  /** e.g. '/auth/api/v1' */
  mount: string;
  api: Router;
  internal?: Router;
  /** Readiness details; throw to report 503. */
  ready: () => Promise<Record<string, unknown>>;
  /** Body size limit for JSON (default 1mb). Multipart uploads are limited by multer, per route. */
  jsonLimit?: string;
}

morgan.token('path', (req: Request) => req.path);

export const createServiceApp = (opts: ServiceAppOptions): Express => {
  const cfg = baseConfig();
  registerServiceName(opts.name);
  const logger = createLogger({ service: opts.name });
  const app = express();

  // Hop count, never `true` (true trusts any X-Forwarded-For and defeats the rate limits).
  app.set('trust proxy', cfg.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(noStore());
  app.use(cors({ origin: cfg.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: false }));
  app.use(compression());
  app.use(express.json({ limit: opts.jsonLimit ?? '1mb' }));
  app.use(requestIdMiddleware());
  if (cfg.NODE_ENV !== 'test') {
    app.use(
      morgan(':method :path :status :res[content-length] - :response-time ms', {
        skip: (req) => req.path.startsWith('/health'),
        stream: { write: (line) => logger.info(line.trim()) },
      }),
    );
  }
  app.use(xssGuard());

  const live = (_req: Request, res: express.Response) => {
    res.json({ status: 'ok', service: opts.name });
  };
  const ready = async (_req: Request, res: express.Response) => {
    try {
      res.json({ status: 'ready', service: opts.name, ...(await opts.ready()) });
    } catch (err) {
      res.status(503).json({ status: 'degraded', service: opts.name, error: (err as Error).message });
    }
  };
  app.get('/health', live);
  app.get('/health/ready', ready);
  app.get(`${opts.mount}/health`, live);

  if (opts.internal) app.use(`${opts.mount}/internal`, requireServiceToken(), opts.internal);
  app.use(opts.mount, opts.api);

  app.use(notFoundHandler());
  app.use(
    errorHandler({
      isProduction: cfg.NODE_ENV === 'production',
      log: (err, meta) =>
        meta.status >= 500
          ? logger.error(err.message, { ...meta, code: err.code, stack: err.stack })
          : logger.warn(err.message, { ...meta, code: err.code }),
    }),
  );
  return app;
};
