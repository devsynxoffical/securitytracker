import { z } from 'zod';

export const DesktopLoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  device: z.object({
    id: z.string().uuid().optional(),
    publicKey: z.string().min(1),
    name: z.string().min(1),
    os: z.string().min(1),
    hardwareHash: z.string().min(1),
    appVersion: z.string().optional(),
    agentVersion: z.string().optional(),
  }),
  timestamp: z.string().datetime(),
  signature: z.string().min(1),
});
export type DesktopLoginDto = z.infer<typeof DesktopLoginSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().uuid(),
  timestamp: z.string().datetime(),
  signature: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6).optional(),
});
export type AdminLoginDto = z.infer<typeof AdminLoginSchema>;

/** Step 1 of admin 2FA enrolment: temp token from login -> secret + otpauth URL. */
export const TwoFactorEnrollSchema = z.object({
  tempToken: z.string().min(10),
});
export type TwoFactorEnrollDto = z.infer<typeof TwoFactorEnrollSchema>;

/** Step 2 of enrolment, and the verify step of a normal 2FA login. */
export const TwoFactorCodeSchema = z.object({
  tempToken: z.string().min(10),
  totpCode: z.string().length(6),
});
export type TwoFactorCodeDto = z.infer<typeof TwoFactorCodeSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

export const AcceptConsentSchema = z.object({
  policyVersion: z.number().int().positive(),
});
export type AcceptConsentDto = z.infer<typeof AcceptConsentSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  mustChangePassword: z.boolean().optional(),
  consentRequired: z.boolean().optional(),
});
export type AuthTokensDto = z.infer<typeof AuthTokensSchema>;

/** F29 - First-run workspace setup (only valid while no employee exists). */
export const BootstrapSetupSchema = z.object({
  companyName: z.string().min(2).max(120),
  timezone: z.string().min(1).max(64).default('UTC'),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(10).max(200),
});
export type BootstrapSetupDto = z.infer<typeof BootstrapSetupSchema>;

/** F30 - Admin Panel password reset by single-use link (08 section 4). */
export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(10).max(200),
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
