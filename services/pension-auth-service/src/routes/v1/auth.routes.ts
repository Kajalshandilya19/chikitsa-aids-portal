import { Router, type Request } from 'express';
import { authenticate, authOf } from '../../lib/auth-middleware';
import { newCaptcha } from '../../lib/captcha';
import { ok } from '../../lib/envelopes';
import { validateBody } from '../../lib/validate';
import {
  changePasswordSchema,
  emptySchema,
  forgotPasswordSchema,
  loginMfaSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  switchSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type LoginMfaInput,
  type ResetPasswordInput,
} from '../../dtos/auth.dto';
import { authService } from '../../services/auth.service';
import { masterService } from '../../services/master.service';
import { limits } from './limits';

/** /captcha and /auth/* (docs/API_AUTH.md §1-3). */
export const authRouter = Router();
const meta = (req: Request) => ({ ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') });
const pending = authenticate({ allowPasswordChangePending: true });

// public: the captcha is needed before login
authRouter.get('/captcha', limits.captcha, (_req, res) => {
  res.json(ok(newCaptcha()));
});

// public: the Center picker of the login screen (active Centers: code, name, district only)
authRouter.get('/public/centers', limits.captcha, async (_req, res) => {
  res.json(ok(await masterService.loginCenters()));
});

// public: login itself (captcha + rate limit + lockout)
authRouter.post('/auth/login', limits.login, validateBody(loginSchema), async (req, res) => {
  res.json(ok(await authService.login(req.body as LoginInput, meta(req))));
});

// public: second login step; the signed mfa_token identifies the user
authRouter.post('/auth/login/mfa', limits.loginMfa, validateBody(loginMfaSchema), async (req, res) => {
  res.json(ok(await authService.loginMfa(req.body as LoginMfaInput, meta(req))));
});

// public: the opaque refresh token is the credential
authRouter.post('/auth/refresh', limits.refresh, validateBody(refreshSchema), async (req, res) => {
  res.json(ok(await authService.refresh((req.body as { refresh_token: string }).refresh_token)));
});

authRouter.post('/auth/logout', pending, validateBody(emptySchema), async (_req, res) => {
  res.json(ok(await authService.logout(authOf(res))));
});

authRouter.get('/auth/me', pending, limits.session, async (_req, res) => {
  res.json(ok(await authService.me(authOf(res))));
});

authRouter.get('/auth/options', authenticate(), limits.session, async (_req, res) => {
  res.json(ok(await authService.options(authOf(res))));
});

authRouter.post('/auth/switch', authenticate(), limits.switch, validateBody(switchSchema), async (req, res) => {
  res.json(ok(await authService.switchAssignment(authOf(res), (req.body as { assignment_id: string }).assignment_id, meta(req))));
});

authRouter.post('/auth/password/otp', pending, limits.password, validateBody(emptySchema), async (_req, res) => {
  res.json(ok(await authService.sendFirstLoginOtp(authOf(res))));
});

authRouter.post('/auth/password/change', pending, limits.password, validateBody(changePasswordSchema), async (req, res) => {
  res.json(ok(await authService.changePassword(authOf(res), req.body as ChangePasswordInput)));
});

// public: forgot password (captcha + rate limit, generic answer)
authRouter.post('/auth/password/forgot', limits.forgot, validateBody(forgotPasswordSchema), async (req, res) => {
  res.json(ok(await authService.forgotPassword(req.body as ForgotPasswordInput)));
});

// public: reset with the SMS OTP (rate limited)
authRouter.post('/auth/password/reset', limits.reset, validateBody(resetPasswordSchema), async (req, res) => {
  res.json(ok(await authService.resetPassword(req.body as ResetPasswordInput)));
});
