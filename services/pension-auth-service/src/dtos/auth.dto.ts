import { z } from 'zod';
import { captchaAnswer, centerCode, loginPassword, mobile, otpCode, password, totpCode, userCode, uuid } from '../lib/validators';

/**
 * Request bodies of /auth/*. Every object is `.strict()`: an unknown key is a 422, never silently
 * ignored (rule R-VAL-3). Field rules come from lib/validators.ts only (rule R-VAL-1).
 */
const captcha = {
  captcha_token: z.string().min(10).max(200),
  captcha_answer: captchaAnswer,
};

export const loginSchema = z
  .object({
    center_code: centerCode.optional(),
    user_code: userCode,
    password: loginPassword,
    ...captcha,
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const loginMfaSchema = z.object({ mfa_token: z.string().min(20).max(2000), totp_code: totpCode }).strict();
export type LoginMfaInput = z.infer<typeof loginMfaSchema>;

export const refreshSchema = z.object({ refresh_token: z.string().min(20).max(200) }).strict();

export const switchSchema = z.object({ assignment_id: uuid }).strict();

export const changePasswordSchema = z
  .object({
    current_password: loginPassword,
    new_password: password,
    otp: otpCode.optional(),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ user_code: userCode, mobile, ...captcha }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ user_code: userCode, otp: otpCode, new_password: password }).strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const emptySchema = z.object({}).strict();
