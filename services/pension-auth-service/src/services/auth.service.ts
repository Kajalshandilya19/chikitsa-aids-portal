import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';
import { UserEntity } from '../entities/user.entity';
import type { UserRoleEntity } from '../entities/user-role.entity';
import { issueAccessToken, type AuthContext } from '../lib/access-token';
import { AUDIT, writeAudit } from '../lib/audit';
import { verifyCaptcha } from '../lib/captcha';
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../lib/errors';
import { kv } from '../lib/kv';
import { maskMobile } from '../lib/mask';
import { blindIndex } from '../lib/pii';
import type { ChangePasswordInput, ForgotPasswordInput, LoginInput, LoginMfaInput, ResetPasswordInput } from '../dtos/auth.dto';
import { assignmentRepository } from '../repositories/assignment.repository';
import { userRepository } from '../repositories/user.repository';
import { assignmentView, buildContext, meView, mfaNeeded } from './context.service';
import { otpService } from './otp.service';
import { burnPasswordCheck, checkPasswordContext, hashPassword, nextPasswordHistory, verifyPassword } from './password.service';
import { sessionService, type SessionMeta } from './session.service';
import { totpService } from './totp.service';

/**
 * Login, MFA, refresh, switch, logout and the password flows (docs/API_AUTH.md §2-3, docs/BUSINESS_RULES.md BR-A*).
 *
 * Every failure that could reveal whether an account exists answers with the SAME error
 * (E_INVALID_CREDENTIALS) and the same timing (burnPasswordCheck).
 */
const INVALID = 'Invalid Center code, User ID or password.';
const invalid = () => new UnauthorizedError(INVALID, { code: 'E_INVALID_CREDENTIALS' });

// ---------------------------------------------------------------- MFA step token

const MFA_TTL_S = 300;
const MFA_MAX_TRIES = 5;
const mfaAudience = () => `${config().JWT_AUDIENCE}-mfa`;

interface MfaClaims {
  sub: string;
  asg: string;
  sel: boolean;
  jti: string;
}

const signMfaToken = (userId: string, assignmentId: string, needsSelection: boolean): string =>
  jwt.sign({ asg: assignmentId, sel: needsSelection }, config().JWT_SIGNING_KEY, {
    algorithm: 'HS256',
    subject: userId,
    issuer: config().JWT_ISSUER,
    audience: mfaAudience(),
    expiresIn: MFA_TTL_S,
    jwtid: randomUUID(),
  });

const verifyMfaToken = (token: string): MfaClaims => {
  try {
    const c = jwt.verify(token, config().JWT_SIGNING_KEY, { algorithms: ['HS256'], issuer: config().JWT_ISSUER, audience: mfaAudience() }) as jwt.JwtPayload;
    if (!c.sub || typeof c['asg'] !== 'string' || !c.jti) throw new Error('bad mfa token');
    return { sub: c.sub, asg: c['asg'] as string, sel: c['sel'] === true, jti: c.jti };
  } catch {
    throw new UnauthorizedError('Login step expired. Please log in again.', { code: 'E_MFA_EXPIRED' });
  }
};

// ---------------------------------------------------------------- helpers

const usableAssignment = async (userId: string, assignmentId: string): Promise<UserRoleEntity> => {
  const all = await assignmentRepository.forUser(userId, { onlyUsable: true });
  const a = all.find((x) => x.id === assignmentId);
  if (!a) throw new ForbiddenError('This role is no longer available to you. Log in again.', { code: 'E_NO_ROLE' });
  return a;
};

const startSession = async (user: UserEntity, a: UserRoleEntity, mfaVerified: boolean, meta: SessionMeta, needsSelection: boolean) => {
  const count = (await assignmentRepository.forUser(user.id, { onlyUsable: true })).length;
  const issued = await AppDataSource.transaction(async (em) => {
    await em.getRepository(UserEntity).update({ id: user.id }, { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null });
    const s = await sessionService.start(user.id, a.id, mfaVerified, meta, em);
    await writeAudit(em, {
      action: AUDIT.LOGIN_SUCCESS,
      actorUserId: user.id,
      entityType: 'session',
      entityId: s.sessionId,
      districtId: a.districtId,
      centerId: a.centerId,
      data: { role: a.role?.code, mfa: mfaVerified },
    });
    return s;
  });
  const ctx = buildContext(user, a, issued.sessionId);
  const access = issueAccessToken(ctx);
  return {
    step: 'DONE' as const,
    access_token: access.token,
    expires_at: access.expiresAt,
    refresh_token: issued.refreshToken,
    refresh_expires_at: issued.refreshExpiresAt.toISOString(),
    must_change_password: user.mustChangePassword,
    needs_selection: needsSelection,
    user: await meView(user, a, count),
  };
};

const recordFailure = async (user: UserEntity, reason: string): Promise<void> => {
  const cfg = config();
  const failed = user.failedLoginCount + 1;
  const lock = failed >= cfg.PASSWORD_MAX_FAILED;
  await AppDataSource.getRepository(UserEntity).update(
    { id: user.id },
    { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + cfg.LOCKOUT_MIN * 60_000) : user.lockedUntil },
  );
  await writeAudit(AppDataSource, {
    action: lock ? AUDIT.LOGIN_LOCKED : AUDIT.LOGIN_FAILURE,
    outcome: 'FAILURE',
    actorUserId: null,
    entityType: 'user',
    entityId: user.id,
    data: { reason, failed_count: failed },
  });
};

const setPassword = async (user: UserEntity, newPassword: string, action: typeof AUDIT.PASSWORD_CHANGED | typeof AUDIT.PASSWORD_RESET_DONE) => {
  await checkPasswordContext(newPassword, user.userCode, user.previousPasswordHashes ?? [], user.passwordHash);
  const hash = await hashPassword(newPassword);
  await AppDataSource.transaction(async (em) => {
    await em.getRepository(UserEntity).update(
      { id: user.id },
      {
        passwordHash: hash,
        previousPasswordHashes: nextPasswordHistory(user.passwordHash, user.previousPasswordHashes ?? []),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    );
    await sessionService.revokeAllForUser(user.id, 'PASSWORD_CHANGED', em);
    await writeAudit(em, { action, actorUserId: user.id, entityType: 'user', entityId: user.id });
  });
};

// ---------------------------------------------------------------- the service

export const authService = {
  async login(input: LoginInput, meta: SessionMeta) {
    await verifyCaptcha(input.captcha_token, input.captcha_answer);
    const user = await userRepository.byCodeWithSecrets(input.user_code);
    if (!user) {
      await burnPasswordCheck(input.password);
      await writeAudit(AppDataSource, { action: AUDIT.LOGIN_FAILURE, outcome: 'FAILURE', actorUserId: null, data: { reason: 'unknown_user' } });
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(423, `Account locked after too many failed attempts. Try again in ${minutes} minute(s) or ask your administrator to unlock it.`, {
        code: 'E_ACCOUNT_LOCKED',
        details: { retry_after_minutes: minutes },
      });
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      await recordFailure(user, 'bad_password');
      throw invalid();
    }
    if (!user.isActive) {
      await writeAudit(AppDataSource, { action: AUDIT.LOGIN_FAILURE, outcome: 'FAILURE', actorUserId: null, entityType: 'user', entityId: user.id, data: { reason: 'inactive' } });
      throw new ForbiddenError('This account is deactivated. Contact your administrator.', { code: 'E_ACCOUNT_INACTIVE' });
    }

    const all = await assignmentRepository.forUser(user.id, { onlyUsable: true });
    if (all.length === 0) throw new ForbiddenError('No active role is assigned to this account. Contact your administrator.', { code: 'E_NO_ROLE' });

    let candidates: UserRoleEntity[];
    if (input.center_code) {
      candidates = all.filter((a) => a.role?.scopeLevel === 'CENTER' && a.center?.code === input.center_code);
      if (candidates.length === 0) {
        await recordFailure(user, 'center_mismatch');
        throw invalid();
      }
    } else {
      candidates = all.filter((a) => a.role?.scopeLevel !== 'CENTER');
      if (candidates.length === 0) throw new ValidationError('Enter your Center code to log in.', { code: 'E_CENTER_CODE_REQUIRED' });
    }
    const lastId = await assignmentRepository.lastUsedAssignmentId(user.id);
    const chosen = candidates.find((a) => a.id === lastId) ?? (candidates[0] as UserRoleEntity);
    const needsSelection = candidates.length > 1;

    if (mfaNeeded(chosen)) {
      const mfaToken = signMfaToken(user.id, chosen.id, needsSelection);
      if (user.mfaEnabled && user.mfaSecret) return { step: 'MFA_REQUIRED' as const, mfa_token: mfaToken, expires_in: MFA_TTL_S };
      const secret = totpService.newSecret();
      await AppDataSource.getRepository(UserEntity).update({ id: user.id }, { mfaSecret: secret, mfaEnabled: false });
      return { step: 'MFA_ENROLL' as const, mfa_token: mfaToken, expires_in: MFA_TTL_S, otpauth_url: totpService.otpauthUrl(user.userCode, secret), secret };
    }
    return startSession(user, chosen, false, meta, needsSelection);
  },

  async loginMfa(input: LoginMfaInput, meta: SessionMeta) {
    const claims = verifyMfaToken(input.mfa_token);
    if ((await kv().incr(`mfa:tries:${claims.jti}`, MFA_TTL_S + 60)) > MFA_MAX_TRIES) {
      throw new UnauthorizedError('Too many wrong codes. Please log in again.', { code: 'E_MFA_LOCKED' });
    }
    const user = await userRepository.byIdWithSecrets(claims.sub);
    if (!user || !user.isActive || !user.mfaSecret) throw new UnauthorizedError('Login step expired. Please log in again.', { code: 'E_MFA_EXPIRED' });
    const a = await usableAssignment(user.id, claims.asg);
    if (!totpService.verify(user.mfaSecret, input.totp_code)) {
      await writeAudit(AppDataSource, { action: AUDIT.MFA_FAILURE, outcome: 'FAILURE', actorUserId: null, entityType: 'user', entityId: user.id });
      throw new UnauthorizedError('Incorrect code. Check the time on your phone and try again.', { code: 'E_MFA_INVALID' });
    }
    if (!(await kv().setOnce(`mfa:used:${claims.jti}`, MFA_TTL_S + 60))) {
      throw new UnauthorizedError('Login step already used. Please log in again.', { code: 'E_MFA_EXPIRED' });
    }
    if (!user.mfaEnabled) {
      await AppDataSource.getRepository(UserEntity).update({ id: user.id }, { mfaEnabled: true });
      user.mfaEnabled = true;
      await writeAudit(AppDataSource, { action: AUDIT.MFA_ENROLLED, actorUserId: user.id, entityType: 'user', entityId: user.id });
    }
    return startSession(user, a, true, meta, claims.sel);
  },

  async refresh(refreshToken: string) {
    const rotated = await sessionService.rotate(refreshToken);
    const user = await userRepository.byId(rotated.session.userId);
    if (!user || !user.isActive) {
      await sessionService.revoke(rotated.sessionId, 'DEACTIVATED');
      throw new UnauthorizedError('session ended, please log in again', { code: 'E_REFRESH_INVALID' });
    }
    let a: UserRoleEntity;
    try {
      a = await usableAssignment(user.id, rotated.session.assignmentId);
    } catch (err) {
      await sessionService.revoke(rotated.sessionId, 'ASSIGNMENT_REMOVED');
      throw err;
    }
    const access = issueAccessToken(buildContext(user, a, rotated.sessionId));
    return {
      access_token: access.token,
      expires_at: access.expiresAt,
      refresh_token: rotated.refreshToken,
      refresh_expires_at: rotated.refreshExpiresAt.toISOString(),
    };
  },

  async logout(auth: AuthContext) {
    await sessionService.revoke(auth.sessionId, 'LOGOUT');
    await writeAudit(AppDataSource, { action: AUDIT.LOGOUT, entityType: 'session', entityId: auth.sessionId });
    return { logged_out: true };
  },

  async me(auth: AuthContext) {
    const user = await userRepository.byId(auth.userId);
    if (!user) throw new UnauthorizedError();
    const all = await assignmentRepository.forUser(user.id, { onlyUsable: true });
    const a = all.find((x) => x.id === auth.assignmentId);
    if (!a) throw new UnauthorizedError('This role is no longer available to you. Log in again.', { code: 'E_TOKEN_INVALID' });
    return meView(user, a, all.length);
  },

  async options(auth: AuthContext) {
    const all = await assignmentRepository.forUser(auth.userId, { onlyUsable: true });
    return { current_assignment_id: auth.assignmentId, assignments: all.map(assignmentView) };
  },

  async switchAssignment(auth: AuthContext, assignmentId: string, meta: SessionMeta) {
    const user = await userRepository.byId(auth.userId);
    if (!user || !user.isActive) throw new UnauthorizedError();
    const all = await assignmentRepository.forUser(user.id, { onlyUsable: true });
    const target = all.find((a) => a.id === assignmentId);
    if (!target) throw new NotFoundError('assignment not found');
    const session = await sessionService.find(auth.sessionId);
    if (!session) throw new UnauthorizedError();
    if (mfaNeeded(target) && !session.mfaVerified) {
      throw new ForbiddenError('This role needs your authenticator code. Log out and log in again with this role.', { code: 'E_MFA_REQUIRED' });
    }
    await sessionService.revoke(auth.sessionId, 'SWITCH');
    await writeAudit(AppDataSource, {
      action: AUDIT.SESSION_SWITCH,
      entityType: 'assignment',
      entityId: target.id,
      districtId: target.districtId,
      centerId: target.centerId,
      data: { from: auth.assignmentId, to: target.id },
    });
    return startSession(user, target, session.mfaVerified, meta, false);
  },

  async sendFirstLoginOtp(auth: AuthContext) {
    const user = await userRepository.byId(auth.userId);
    if (!user) throw new UnauthorizedError();
    const r = await otpService.issue(user.id, user.mobile, 'FIRST_LOGIN');
    return { sent_to: maskMobile(user.mobile), expires_in: r.expiresIn };
  },

  async changePassword(auth: AuthContext, input: ChangePasswordInput) {
    const user = await userRepository.byIdWithSecrets(auth.userId);
    if (!user) throw new UnauthorizedError();
    if (!(await verifyPassword(user.passwordHash, input.current_password))) {
      throw new ValidationError('Current password is incorrect.', { code: 'E_PASSWORD_CURRENT' });
    }
    if (user.mustChangePassword) {
      if (!input.otp) throw new ValidationError('Enter the OTP sent to your registered mobile.', { code: 'E_OTP_REQUIRED' });
      await otpService.verify(user.id, 'FIRST_LOGIN', input.otp);
    }
    await setPassword(user, input.new_password, AUDIT.PASSWORD_CHANGED);
    return { relogin: true };
  },

  async forgotPassword(input: ForgotPasswordInput) {
    await verifyCaptcha(input.captcha_token, input.captcha_answer);
    const generic = { message: 'If the User ID and mobile number match our records, an OTP has been sent to that mobile.' };
    const user = await userRepository.byCodeWithSecrets(input.user_code);
    await writeAudit(AppDataSource, { action: AUDIT.PASSWORD_RESET_REQUESTED, actorUserId: null, entityType: 'user', entityId: user?.id ?? null });
    if (!user || !user.isActive || user.mobileLookup !== blindIndex(input.mobile)) return generic;
    try {
      await otpService.issue(user.id, user.mobile, 'PASSWORD_RESET');
    } catch (err) {
      if ((err as AppError).code !== 'E_RATE_LIMIT') throw err;
    }
    return generic;
  },

  async resetPassword(input: ResetPasswordInput) {
    const user = await userRepository.byCodeWithSecrets(input.user_code);
    if (!user || !user.isActive) throw new AppError(400, 'Invalid OTP.', { code: 'E_OTP_INVALID' });
    await otpService.verify(user.id, 'PASSWORD_RESET', input.otp);
    await setPassword(user, input.new_password, AUDIT.PASSWORD_RESET_DONE);
    return { relogin: true };
  },
};
