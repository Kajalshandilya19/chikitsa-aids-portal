import { config } from '../../config';
import { perIdentifier, perUser } from '../../lib/rate-limit';

/** Rate limits of this service (docs/SECURITY.md S-RL-1). One place, so the numbers are reviewable. */
const MIN = 60_000;

export const limits = {
  captcha: perUser({ name: 'captcha', windowMs: MIN, limit: 30 }),
  login: perIdentifier({ name: 'login', windowMs: MIN, limit: config().LOGIN_RATE_LIMIT_PER_MIN }),
  loginMfa: perUser({ name: 'login-mfa', windowMs: MIN, limit: 10 }),
  refresh: perUser({ name: 'refresh', windowMs: MIN, limit: 30 }),
  forgot: perIdentifier({ name: 'forgot', windowMs: MIN, limit: 5 }),
  reset: perIdentifier({ name: 'reset', windowMs: MIN, limit: 5 }),
  session: perUser({ name: 'session', windowMs: MIN, limit: 60 }),
  switch: perUser({ name: 'switch', windowMs: MIN, limit: 20 }),
  password: perUser({ name: 'password', windowMs: MIN, limit: 10 }),
  admin: perUser({ name: 'admin', windowMs: MIN, limit: 120 }),
};
