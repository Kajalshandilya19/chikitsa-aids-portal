import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError, isAppError } from './errors';
import { translateDatabaseError } from './format-db-error';
import { getRequestContext } from './request-context';

export interface ErrorMiddlewareOptions {
  isProduction?: boolean;
  log?: (err: AppError, meta: { request_id?: string; status: number }) => void;
}

export const notFoundHandler = (): RequestHandler => (req, _res, next) => {
  next(new NotFoundError(`route not found: ${req.method} ${req.path}`));
};

/**
 * Describe an error that did not come from our own `AppError` hierarchy. Third-party clients throw
 * Errors with an EMPTY message (the MinIO client does it for a refused connection), so fall through
 * name and code before giving up.
 */
const describeError = (err: unknown): string => {
  if (err instanceof Error) {
    if (err.message) return err.message;
    const e = err as Error & { code?: string };
    return e.code ? `${err.name} (${e.code})` : err.name || 'internal server error';
  }
  if (typeof err === 'string' && err) return err;
  return 'internal server error';
};

const wrapUnknown = (err: unknown): AppError => {
  // A Postgres constraint violation becomes a readable 400/409 that names a column, never a value.
  const db = translateDatabaseError(err);
  if (db) return new AppError(db.status, db.message, { code: db.code, cause: err, expose: true });
  // express.json() parse failures and oversized bodies carry a status of their own.
  const status = (err as { status?: unknown; type?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new AppError(status, status === 413 ? 'request body too large' : 'malformed request body', {
      code: status === 413 ? 'E_BODY_TOO_LARGE' : 'E_BAD_REQUEST',
      expose: true,
    });
  }
  const wrapped = new AppError(500, describeError(err), { code: 'E_INTERNAL', cause: err });
  if (err instanceof Error && err.stack) wrapped.stack = err.stack;
  return wrapped;
};

/**
 * Last middleware of every app. Production answers never carry a stack, and a 500's message is
 * replaced by a generic one (the real message goes to the log only).
 */
export const errorHandler = (options: ErrorMiddlewareOptions = {}): ErrorRequestHandler => {
  const isProd = options.isProduction ?? process.env['NODE_ENV'] === 'production';
  const log = options.log;
  return (err, _req, res, _next) => {
    const appErr: AppError = isAppError(err) ? err : wrapUnknown(err);
    const requestId = getRequestContext()?.request_id;

    if (log) {
      try {
        log(appErr, { request_id: requestId, status: appErr.status });
      } catch {
        // a failing logger must not hide the original error
      }
    }

    const body: Record<string, unknown> = {
      success: false,
      code: appErr.code,
      message: appErr.expose || !isProd ? appErr.message : 'internal server error',
    };
    if (appErr.details !== undefined && (appErr.expose || !isProd)) body['details'] = appErr.details;
    if (!isProd && appErr.stack && appErr.status >= 500) body['stack'] = appErr.stack;
    if (requestId) body['request_id'] = requestId;

    if (res.headersSent) return;
    res.status(appErr.status).json(body);
  };
};
