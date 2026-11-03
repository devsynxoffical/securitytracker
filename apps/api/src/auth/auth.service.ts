import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  DesktopLoginDto,
  AdminLoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  AcceptConsentDto,
  AuthTokensDto,
  ErrorCodes,
  TwoFactorEnrollDto,
  TwoFactorCodeDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { resolveExportPolicy } from './guards/export-policy.guard';
import { ClockService } from '../common/clock.service';
import { CryptoUtil, resolveEncryptionKey } from '../common/crypto.util';
import { RedisService } from '../common/redis.service';
import { MailerService } from '../common/mailer.service';
import { buildMeShiftPolicy, loadMeSchedule } from '../attendance/schedule-info';

const RESET_TTL_SECONDS = 30 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Fallback single-use reset tokens when Redis is not configured (single-instance only). */
  private readonly resetTokens = new Map<string, { employeeId: string; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private clock: ClockService,
    @Optional() private redis?: RedisService,
    @Optional() private mailer?: MailerService,
  ) {}

  /**
   * F30 - Password reset request. Always succeeds so email addresses cannot be enumerated.
   * There is no mailer yet: outside production the reset URL is returned for the operator.
   */
  async forgotPassword(dto: ForgotPasswordDto, ip: string): Promise<{ ok: true; devResetUrl?: string }> {
    const employee = await this.prisma.employee.findFirst({
      where: { email: dto.email.trim().toLowerCase(), status: { not: 'disabled' }, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!employee) return { ok: true };

    const raw = uuidv4() + uuidv4().replace(/-/g, '');
    const key = CryptoUtil.sha256(raw);
    const expiresAt = this.clock.now().getTime() + RESET_TTL_SECONDS * 1000;
    await this.storeResetToken(key, employee.id, expiresAt);
    await this.logLoginEvent(employee.id, employee.email ?? '', null, ip, 'admin', 'password_reset_requested');
    this.logger.log(`Password reset requested for employee ${employee.id}`);

    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const adminOrigin = this.configService.get<string>('ADMIN_ORIGIN') || 'http://localhost:3000';
    const resetUrl = `${adminOrigin}/admin/reset?token=${raw}`;
    if (this.mailer?.configured() && employee.email) {
      // F30: the link goes by mail when SMTP_* is configured; the token itself is never logged.
      await this.mailer.send(passwordResetMail(employee.email, resetUrl, RESET_TTL_SECONDS), 'password_reset').catch((e: Error) => {
        this.logger.warn(`Password reset mail failed for employee ${employee.id}: ${e.message}`);
      });
    }
    return isProd ? { ok: true } : { ok: true, devResetUrl: resetUrl };
  }

  /** F30 - Consumes a single-use token and sets the new password; all sessions of the account are revoked. */
  async resetPassword(dto: ResetPasswordDto, ip: string): Promise<{ ok: true }> {
    const key = CryptoUtil.sha256(dto.token);
    const employeeId = await this.consumeResetToken(key);
    if (!employeeId) {
      throw new UnauthorizedException({ code: ErrorCodes.UNAUTHORIZED, message: 'This reset link is invalid or has expired.' });
    }
    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
    const now = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.employee.update({ where: { id: employeeId }, data: { passwordHash, mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
      this.prisma.session.updateMany({ where: { employeeId, revokedAt: null }, data: { revokedAt: now, revokedReason: 'password_reset' } }),
    ]);
    await this.logLoginEvent(employeeId, '', null, ip, 'admin', 'password_reset');
    return { ok: true };
  }

  private async storeResetToken(key: string, employeeId: string, expiresAt: number): Promise<void> {
    const client = this.redisClient();
    if (client) {
      await client.set(`pwreset:${key}`, employeeId, 'EX', RESET_TTL_SECONDS);
      return;
    }
    this.resetTokens.set(key, { employeeId, expiresAt });
  }

  private async consumeResetToken(key: string): Promise<string | null> {
    const client = this.redisClient();
    if (client) {
      const id = await client.getdel(`pwreset:${key}`);
      return id || null;
    }
    const entry = this.resetTokens.get(key);
    this.resetTokens.delete(key);
    if (!entry || entry.expiresAt < this.clock.now().getTime()) return null;
    return entry.employeeId;
  }

  private redisClient() {
    if (!this.redis || !this.configService.get<string>('REDIS_URL')) return null;
    try {
      return this.redis.getClient();
    } catch {
      return null;
    }
  }

  /**
   * Desktop employee login with hardware device registration & signature verification (F2, F3).
   */
  async desktopLogin(
    dto: DesktopLoginDto,
    ip: string,
    userAgent?: string,
  ): Promise<AuthTokensDto | { status: string; deviceId: string; message: string }> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        OR: [{ code: dto.identifier }, { email: dto.identifier }],
      },
      include: { company: true, role: true },
    });

    if (!employee) {
      await this.logLoginEvent(null, dto.identifier, null, ip, 'desktop', 'bad_password');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    // Check account disabled
    if (employee.status === 'disabled') {
      await this.logLoginEvent(employee.id, dto.identifier, null, ip, 'desktop', 'disabled');
      throw new ForbiddenException({
        code: ErrorCodes.ACCOUNT_DISABLED,
        message: 'Account is disabled',
      });
    }

    // FR-SEC-25: sign-in is refused while suspended
    if (employee.status === 'suspended') {
      await this.logLoginEvent(employee.id, dto.identifier, null, ip, 'desktop', 'suspended');
      throw new ForbiddenException({
        code: ErrorCodes.ACCOUNT_SUSPENDED,
        message: 'Your access was suspended. Contact your administrator.',
      });
    }

    // Check lockout
    if (employee.lockedUntil && employee.lockedUntil > this.clock.now()) {
      await this.logLoginEvent(employee.id, dto.identifier, null, ip, 'desktop', 'locked');
      throw new ForbiddenException({
        code: ErrorCodes.ACCOUNT_LOCKED,
        message: `Account is locked until ${employee.lockedUntil.toISOString()}`,
      });
    }

    // Verify Password with Argon2id
    const passwordValid = await argon2.verify(employee.passwordHash, dto.password);
    if (!passwordValid) {
      const failedCount = employee.failedLogins + 1;
      const isLockout = failedCount >= 5;
      const lockedUntil = isLockout ? new Date(this.clock.now().getTime() + 15 * 60 * 1000) : null;

      await this.prisma.employee.update({
        where: { id: employee.id },
        data: {
          failedLogins: isLockout ? 0 : failedCount,
          lockedUntil,
        },
      });

      await this.logLoginEvent(employee.id, dto.identifier, null, ip, 'desktop', 'bad_password');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    // Reset failed logins
    if (employee.failedLogins > 0) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: { failedLogins: 0, lockedUntil: null },
      });
    }

    // 3. Device Registration & Verification
    let device = dto.device.id
      ? await this.prisma.device.findUnique({ where: { id: dto.device.id } })
      : await this.prisma.device.findFirst({
          where: {
            employeeId: employee.id,
            hardwareHash: dto.device.hardwareHash,
          },
        });

    if (!device) {
      // First contact: the key is self-asserted, the signature proves the client holds it.
      this.assertDeviceSignature(dto.device.publicKey, dto.timestamp, { identifier: dto.identifier, timestamp: dto.timestamp, hardwareHash: dto.device.hardwareHash }, dto.signature);
      // Check company device limits
      const approvedDevicesCount = await this.prisma.device.count({
        where: { employeeId: employee.id, status: 'approved' },
      });

      const approvalMode = (employee.company.settings as any)?.deviceApprovalMode || 'manual';
      const maxDevices = (employee.company.settings as any)?.deviceLimitPerEmployee || 1;

      const autoApprove = approvalMode === 'auto_first_device' && approvedDevicesCount === 0;

      if (approvedDevicesCount >= maxDevices && !autoApprove) {
        throw new ForbiddenException({
          code: ErrorCodes.DEVICE_LIMIT_REACHED,
          message: 'Approved device limit reached. Revoke an old device or request admin authorization.',
        });
      }

      device = await this.prisma.device.create({
        data: {
          companyId: employee.companyId,
          employeeId: employee.id,
          name: dto.device.name,
          publicKey: dto.device.publicKey,
          hardwareHash: dto.device.hardwareHash,
          osVersion: dto.device.os,
          appVersion: dto.device.appVersion || null,
          agentVersion: dto.device.agentVersion || null,
          status: autoApprove ? 'approved' : 'pending',
          approvedAt: autoApprove ? this.clock.now() : null,
          lastSeenAt: this.clock.now(),
        },
      });
    } else {
      // FR-AUTH-04: an existing device must prove possession of its registered private key.
      this.assertDeviceSignature(device.publicKey, dto.timestamp, { identifier: dto.identifier, timestamp: dto.timestamp, hardwareHash: dto.device.hardwareHash }, dto.signature);
      // Update device versions & last seen
      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          appVersion: dto.device.appVersion || device.appVersion,
          agentVersion: dto.device.agentVersion || device.agentVersion,
          lastSeenAt: this.clock.now(),
        },
      });
    }

    if (device.status === 'pending') {
      await this.logLoginEvent(employee.id, dto.identifier, device.id, ip, 'desktop', 'device_pending');
      return {
        status: 'DEVICE_PENDING',
        deviceId: device.id,
        message: 'Device is pending admin approval',
      };
    }

    if (device.status === 'revoked' || device.status === 'rejected') {
      await this.logLoginEvent(employee.id, dto.identifier, device.id, ip, 'desktop', 'device_revoked');
      throw new ForbiddenException({
        code: ErrorCodes.DEVICE_REVOKED,
        message: 'This device authorization has been revoked',
      });
    }

    // Check Monitoring Consent status
    const latestPolicy = await this.prisma.policyVersion.findFirst({
      orderBy: { version: 'desc' },
    });
    let consentRequired = false;
    if (latestPolicy) {
      const consentRecord = await this.prisma.consentRecord.findFirst({
        where: { employeeId: employee.id, policyVersion: latestPolicy.version },
      });
      consentRequired = !consentRecord;
    }

    // 4. Issue Session and Tokens
    const familyId = uuidv4();
    const rawRefreshToken = uuidv4() + uuidv4();
    const refreshTokenHash = CryptoUtil.sha256(rawRefreshToken);
    const expiresAt = new Date(this.clock.now().getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await this.prisma.session.create({
      data: {
        employeeId: employee.id,
        deviceId: device.id,
        familyId,
        refreshTokenHash,
        client: 'desktop',
        ip,
        userAgent,
        expiresAt,
      },
    });

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { lastLoginAt: this.clock.now() },
    });

    await this.logLoginEvent(employee.id, dto.identifier, device.id, ip, 'desktop', 'success');

    const accessToken = this.generateAccessToken(employee, session.id, device.id);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes
      mustChangePassword: employee.mustChangePassword,
      consentRequired,
    };
  }

  /**
   * Admin web panel login with mandatory TOTP 2FA.
   */
  async adminLogin(
    dto: AdminLoginDto,
    ip: string,
    userAgent?: string,
  ): Promise<{
    tokens?: AuthTokensDto;
    requires2fa?: boolean;
    enrollmentRequired?: boolean;
    tempToken?: string;
  }> {
    const employee = await this.prisma.employee.findFirst({
      where: { email: dto.email },
      include: { company: true, role: true },
    });

    if (!employee || employee.status === 'disabled') {
      await this.logLoginEvent(null, dto.email, null, ip, 'admin', 'bad_password');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    // FR-SEC-24/25: suspended accounts cannot open an admin session either
    if (employee.status === 'suspended') {
      await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', 'suspended');
      throw new ForbiddenException({
        code: ErrorCodes.ACCOUNT_SUSPENDED,
        message: 'Your access was suspended. Contact your administrator.',
      });
    }

    // Password verification
    const passwordValid = await argon2.verify(employee.passwordHash, dto.password);
    if (!passwordValid) {
      await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', 'bad_password');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    // Operator opt-out (08 section 2): ADMIN_2FA_REQUIRED=false on the server lets admins sign in with
    // email and password only. Default is required. Every such sign-in is logged as `success_no_2fa`.
    if (this.configService.get<string>('ADMIN_2FA_REQUIRED') === 'false') {
      await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', 'success_no_2fa');
      return { tokens: await this.createAdminSession(employee, ip, userAgent) };
    }

    // Check TOTP Enrolment
    if (!employee.totpEnabled) {
      const tempToken = this.jwtService.sign(
        { sub: employee.id, temp: true, purpose: '2fa_enroll' },
        { expiresIn: '15m' },
      );
      return {
        enrollmentRequired: true,
        tempToken,
      };
    }

    // Verify TOTP Code
    if (!dto.totpCode) {
      const tempToken = this.jwtService.sign(
        { sub: employee.id, temp: true, purpose: '2fa_verify' },
        { expiresIn: '5m' },
      );
      return {
        requires2fa: true,
        tempToken,
      };
    }

    const secretKeyHex = this.encryptionKey();
    const totpSecret = CryptoUtil.decryptField(employee.totpSecretEnc!, secretKeyHex);

    const isValidTotp = CryptoUtil.verifyTotp(totpSecret, dto.totpCode);
    if (!isValidTotp) {
      await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', '2fa_failed');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_TWO_FACTOR_CODE,
        message: 'Invalid two-factor authentication code',
      });
    }
    await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', 'success');

    return { tokens: await this.createAdminSession(employee, ip, userAgent) };
  }

  /**
   * Admin 2FA enrolment step 1 (FR-AUTH-07): generates a secret, stores it encrypted with
   * totpEnabled still false, and returns the otpauth URL for the authenticator app.
   */
  async startTwoFactorEnrollment(dto: TwoFactorEnrollDto) {
    const employee = await this.employeeFromTempToken(dto.tempToken, '2fa_enroll');
    const secret = CryptoUtil.generateTotpSecret();
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { totpSecretEnc: CryptoUtil.encryptField(secret, this.encryptionKey()) },
    });
    return {
      secret,
      otpauthUrl: CryptoUtil.totpUri(secret, employee.email ?? employee.code, employee.company.name),
      tempToken: dto.tempToken,
    };
  }

  /** Enrolment step 2: first valid code enables 2FA and opens the admin session. */
  async confirmTwoFactorEnrollment(dto: TwoFactorCodeDto, ip: string, userAgent?: string) {
    const employee = await this.employeeFromTempToken(dto.tempToken, '2fa_enroll');
    if (!employee.totpSecretEnc) {
      throw new UnauthorizedException({ code: ErrorCodes.TWO_FACTOR_REQUIRED, message: 'Start enrolment first' });
    }
    this.assertTotp(employee, dto.totpCode);
    await this.prisma.employee.update({ where: { id: employee.id }, data: { totpEnabled: true } });
    await this.logLoginEvent(employee.id, employee.email ?? employee.code, null, ip, 'admin', 'success');
    return { tokens: await this.createAdminSession(employee, ip, userAgent) };
  }

  /** Second step of a normal admin login when the first call carried no code. */
  async verifyTwoFactor(dto: TwoFactorCodeDto, ip: string, userAgent?: string) {
    const employee = await this.employeeFromTempToken(dto.tempToken, '2fa_verify');
    if (!employee.totpEnabled || !employee.totpSecretEnc) {
      throw new UnauthorizedException({ code: ErrorCodes.TWO_FACTOR_REQUIRED, message: '2FA is not enrolled' });
    }
    try {
      this.assertTotp(employee, dto.totpCode);
    } catch (e) {
      await this.logLoginEvent(employee.id, employee.email ?? employee.code, null, ip, 'admin', '2fa_failed');
      throw e;
    }
    await this.logLoginEvent(employee.id, employee.email ?? employee.code, null, ip, 'admin', 'success');
    return { tokens: await this.createAdminSession(employee, ip, userAgent) };
  }

  /**
   * 08 section 2: signature = sign(deviceKey, timestamp + sha256(body)) with a 2 minute
   * timestamp tolerance. The body is the canonical JSON the client signed.
   */
  private assertDeviceSignature(publicKey: string, timestamp: string, body: Record<string, unknown>, signature: string): void {
    const skew = Math.abs(this.clock.now().getTime() - new Date(timestamp).getTime());
    if (!Number.isFinite(skew) || skew > 2 * 60 * 1000) {
      throw new UnauthorizedException({ code: ErrorCodes.INVALID_DEVICE_SIGNATURE, message: 'Request timestamp outside the allowed window' });
    }
    const payload = `${timestamp}.${CryptoUtil.sha256(JSON.stringify(body))}`;
    if (!CryptoUtil.verifyDeviceSignature(publicKey, payload, signature)) {
      throw new UnauthorizedException({ code: ErrorCodes.INVALID_DEVICE_SIGNATURE, message: 'Device signature is invalid' });
    }
  }

  private encryptionKey(): string {
    return resolveEncryptionKey(this.configService.get<string>('ENCRYPTION_SECRET'));
  }

  private assertTotp(employee: { totpSecretEnc: string | null }, code: string): void {
    const secret = CryptoUtil.decryptField(employee.totpSecretEnc!, this.encryptionKey());
    if (!CryptoUtil.verifyTotp(secret, code)) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_TWO_FACTOR_CODE,
        message: 'Invalid two-factor authentication code',
      });
    }
  }

  private async employeeFromTempToken(tempToken: string, purpose: '2fa_enroll' | '2fa_verify') {
    let payload: { sub?: string; temp?: boolean; purpose?: string };
    try {
      payload = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException({ code: ErrorCodes.UNAUTHORIZED, message: 'Temporary token is invalid or expired' });
    }
    if (!payload.temp || payload.purpose !== purpose || !payload.sub) {
      throw new UnauthorizedException({ code: ErrorCodes.UNAUTHORIZED, message: 'Temporary token is not valid for this step' });
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: payload.sub, status: { notIn: ['disabled', 'suspended'] }, deletedAt: null },
      include: { company: true, role: true },
    });
    if (!employee) throw new UnauthorizedException({ code: ErrorCodes.ACCOUNT_DISABLED, message: 'Account unavailable' });
    return employee;
  }

  private async createAdminSession(
    employee: Prisma.EmployeeGetPayload<{ include: { company: true; role: true } }>,
    ip: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const familyId = uuidv4();
    const rawRefreshToken = uuidv4() + uuidv4();
    const refreshTokenHash = CryptoUtil.sha256(rawRefreshToken);
    const expiresAt = new Date(this.clock.now().getTime() + 12 * 60 * 60 * 1000); // 12 hours absolute

    const session = await this.prisma.session.create({
      data: {
        employeeId: employee.id,
        deviceId: null,
        familyId,
        refreshTokenHash,
        client: 'admin',
        ip,
        userAgent,
        expiresAt,
      },
    });

    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { lastLoginAt: this.clock.now() },
    });

    const accessToken = this.generateAccessToken(employee, session.id, null);
    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
      mustChangePassword: employee.mustChangePassword,
    };
  }

  /**
   * Rotating token refresh with reuse detection (F3, FR-AUTH-09).
   */
  async refreshTokens(
    dto: RefreshTokenDto,
    ip: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const tokenHash = CryptoUtil.sha256(dto.refreshToken);

    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash },
      include: { employee: { include: { role: true } } },
    });

    if (!session) {
      // Possible reuse of old already-rotated refresh token! Revoke family if found
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_REUSE_DETECTED,
        message: 'Invalid or reused refresh token',
      });
    }

    if (session.revokedAt || session.expiresAt < this.clock.now()) {
      throw new UnauthorizedException({
        code: ErrorCodes.SESSION_REVOKED,
        message: 'Session has expired or been revoked',
      });
    }

    // FR-AUTH-04: desktop refreshes are bound to the device that opened the session.
    if (session.client === 'desktop') {
      if (!session.deviceId || session.deviceId !== dto.deviceId) {
        throw new UnauthorizedException({ code: ErrorCodes.INVALID_DEVICE_SIGNATURE, message: 'Refresh token is bound to another device' });
      }
      const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
      if (!device || device.status !== 'approved') {
        throw new UnauthorizedException({ code: ErrorCodes.DEVICE_REVOKED, message: 'Device is not approved' });
      }
      this.assertDeviceSignature(device.publicKey, dto.timestamp, { refreshToken: dto.refreshToken, deviceId: dto.deviceId, timestamp: dto.timestamp }, dto.signature);
    }

    // Rotate refresh token
    const newRawRefreshToken = uuidv4() + uuidv4();
    const newRefreshTokenHash = CryptoUtil.sha256(newRawRefreshToken);

    const updatedSession = await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        ip,
        userAgent,
      },
    });

    const accessToken = this.generateAccessToken(
      session.employee,
      updatedSession.id,
      session.deviceId,
    );

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
    };
  }

  /**
   * Password change with mandatory session revocation on other devices (F4).
   */
  async changePassword(
    employeeId: string,
    currentSessionId: string | undefined,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const isValid = await argon2.verify(employee.passwordHash, dto.currentPassword);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await argon2.hash(dto.newPassword, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: employeeId },
        data: { passwordHash: newHash, mustChangePassword: false },
      }),
      // Revoke all other sessions
      this.prisma.session.updateMany({
        where: {
          employeeId,
          id: currentSessionId ? { not: currentSessionId } : undefined,
          revokedAt: null,
        },
        data: {
          revokedAt: this.clock.now(),
          revokedReason: 'password_changed',
        },
      }),
    ]);
  }

  /**
   * Records monitoring consent (F2).
   */
  async acceptConsent(
    employeeId: string,
    dto: AcceptConsentDto,
    ip: string,
    deviceId?: string | null,
  ): Promise<void> {
    await this.prisma.consentRecord.create({
      data: {
        employeeId,
        policyVersion: dto.policyVersion,
        deviceId: deviceId || null,
        ip,
        acceptedAt: this.clock.now(),
      },
    });
  }

  /**
   * Profile and active shift details for current user (GET /me).
   */
  async getMe(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        role: {
          include: { permissions: true },
        },
        department: true,
        team: true,
        permissionOverrides: true,
        company: { select: { timezone: true, settings: true } },
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');

    const timezone = employee.company.timezone || 'UTC';
    const schedule = await loadMeSchedule(this.prisma, employeeId, employee.companyId, timezone, this.clock.now());
    const shiftPolicy = buildMeShiftPolicy(employee.company.settings);

    // Get open shift if any
    const openShift = await this.prisma.shift.findFirst({
      where: {
        employeeId,
        state: { in: ['WORKING', 'ON_BREAK'] },
      },
      include: {
        breaks: {
          where: { endedAt: null },
        },
      },
    });

    return {
      id: employee.id,
      companyId: employee.companyId,
      code: employee.code,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone,
      role: {
        id: employee.role.id,
        name: employee.role.name,
        rank: employee.role.rank,
        permissions: employee.role.permissions.map((p) => ({
          key: p.permissionKey,
          scope: p.scope,
        })),
      },
      overrides: employee.permissionOverrides,
      department: employee.department,
      team: employee.team,
      openShift: openShift
        ? {
            id: openShift.id,
            state: openShift.state,
            attendanceDate: openShift.attendanceDate,
            startedAt: openShift.startedAt,
            activeSeconds: openShift.activeSeconds,
            breakSeconds: openShift.breakSeconds,
            idleSeconds: openShift.idleSeconds,
            currentBreak: openShift.breaks[0] || null,
          }
        : null,
      schedule,
      shiftPolicy,
      /** FR-SEC-21: lets every client hide export controls without the settings permission. */
      dataExportPolicy: resolveExportPolicy(employee.company.settings),
    };
  }

  private generateAccessToken(employee: any, sessionId: string, deviceId: string | null): string {
    const payload = {
      sub: employee.id,
      company: employee.companyId,
      session: sessionId,
      device: deviceId,
      role: employee.role.name,
      roleRank: employee.role.rank,
    };

    return this.jwtService.sign(payload, {
      expiresIn: '15m',
    });
  }

  private async logLoginEvent(
    employeeId: string | null,
    identifier: string,
    deviceId: string | null,
    ip: string,
    client: string,
    result: string,
  ) {
    try {
      await this.prisma.loginEvent.create({
        data: {
          employeeId,
          identifier,
          deviceId,
          ip,
          client,
          result,
          createdAt: this.clock.now(),
        },
      });
    } catch (e) {
      console.error('Failed to record login event:', e);
    }
  }
}

/** Plain transactional template; no personal data beyond the recipient address. */
export function passwordResetMail(to: string, resetUrl: string, ttlSeconds: number): { to: string; subject: string; html: string; text: string } {
  const minutes = Math.round(ttlSeconds / 60);
  return {
    to,
    subject: 'Reset your password',
    text: `We received a request to reset your password.\n\nOpen this link within ${minutes} minutes to choose a new one:\n${resetUrl}\n\nIf you did not ask for this, you can ignore this message; your password stays unchanged.`,
    html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Choose a new password</a> (the link is valid for ${minutes} minutes).</p><p>If you did not ask for this, you can ignore this message; your password stays unchanged.</p>`,
  };
}
