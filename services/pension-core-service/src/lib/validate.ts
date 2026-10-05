import type { RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ValidationError } from './errors';

type Target = 'body' | 'query' | 'params';

const formatZodError = (err: ZodError) =>
  err.issues.map((i) => ({
    path: i.path.join('.') || '<root>',
    code: i.code,
    message: i.message,
  }));

const validateAgainst = <T>(schema: ZodType<T>, target: Target): RequestHandler => {
  return (req, _res, next) => {
    const input = (req as unknown as Record<Target, unknown>)[target];
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return next(new ValidationError(`invalid ${target}`, { details: formatZodError(parsed.error) }));
    }
    // Express 5 makes req.query a getter; reassignment throws. Use defineProperty for safety.
    if (target === 'query') {
      Object.defineProperty(req, 'query', { value: parsed.data, writable: true, configurable: true });
    } else {
      (req as unknown as Record<Target, unknown>)[target] = parsed.data;
    }
    return next();
  };
};

export const validateBody = <T>(schema: ZodType<T>): RequestHandler => validateAgainst(schema, 'body');
export const validateQuery = <T>(schema: ZodType<T>): RequestHandler => validateAgainst(schema, 'query');
export const validateParams = <T>(schema: ZodType<T>): RequestHandler => validateAgainst(schema, 'params');
