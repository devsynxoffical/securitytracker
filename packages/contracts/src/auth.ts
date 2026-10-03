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
