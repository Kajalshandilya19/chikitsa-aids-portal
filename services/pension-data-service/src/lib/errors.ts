/**
 * The only error types a route, service or repository may throw on purpose (rule R-API-3).
 * `message` is shown to the user when `expose` is true (default for every status below 500), so it
 * must be a plain sentence with NO personal data in it: never a name, mobile, Aadhaar, UID or ART No.
 * `code` is stable and documented in docs/API_CONVENTIONS.md; the web app switches on it.
 */
export interface AppErrorOptions {
  code?: string;
  details?: unknown;
  cause?: unknown;
  expose?: boolean;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;
  public readonly expose: boolean;

  constructor(status: number, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = options.code ?? 'E_INTERNAL';
    this.details = options.details;
    this.expose = options.expose ?? status < 500;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'bad request', options: AppErrorOptions = {}) {
    super(400, message, { code: 'E_BAD_REQUEST', ...options });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'validation failed', options: AppErrorOptions = {}) {
    super(422, message, { code: 'E_VALIDATION', ...options });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'login required', options: AppErrorOptions = {}) {
    super(401, message, { code: 'E_UNAUTHORIZED', ...options });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'you do not have permission for this action', options: AppErrorOptions = {}) {
    super(403, message, { code: 'E_PERMISSION', ...options });
  }
}

/**
 * Also used for records that exist but are outside the caller's District or Center (rule R-SCOPE-2):
 * answering 403 there would confirm that the record exists.
 */
export class NotFoundError extends AppError {
  constructor(message = 'not found', options: AppErrorOptions = {}) {
    super(404, message, { code: 'E_NOT_FOUND', ...options });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'conflict', options: AppErrorOptions = {}) {
    super(409, message, { code: 'E_CONFLICT', ...options });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'too many requests, please wait a minute and try again', options: AppErrorOptions = {}) {
    super(429, message, { code: 'E_RATE_LIMIT', ...options });
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
