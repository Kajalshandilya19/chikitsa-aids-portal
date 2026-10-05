import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithContext } from './request-context';

/**
 * One id per request, echoed in `X-Request-Id` and in every log line and error body, so a user's
 * screenshot of an error can be matched to the log. An incoming id (from the BFF) is kept only when
 * it looks like an id: anything else could inject text into the logs.
 */
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export const requestIdMiddleware = (): RequestHandler => (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  runWithContext({ request_id: requestId, ip: req.ip ?? undefined }, () => next());
};
