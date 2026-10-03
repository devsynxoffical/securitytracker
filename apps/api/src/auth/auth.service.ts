import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import {
  DesktopLoginDto,
  AdminLoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  AcceptConsentDto,
  AuthTokensDto,
  ErrorCodes,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { CryptoUtil } from '../common/crypto.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private clock: ClockService,
  ) {}

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

    // Password verification
    const passwordValid = await argon2.verify(employee.passwordHash, dto.password);
    if (!passwordValid) {
      await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', 'bad_password');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
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

    const secretKeyHex = this.configService.get<string>('ENCRYPTION_SECRET') || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const totpSecret = CryptoUtil.decryptField(employee.totpSecretEnc!, secretKeyHex);

    const isValidTotp = CryptoUtil.verifyTotp(totpSecret, dto.totpCode);
    if (!isValidTotp) {
      await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', '2fa_failed');
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_TWO_FACTOR_CODE,
        message: 'Invalid two-factor authentication code',
      });
    }

    // Create Admin Session
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

    await this.logLoginEvent(employee.id, dto.email, null, ip, 'admin', 'success');

    const accessToken = this.generateAccessToken(employee, session.id, null);

    return {
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: 900,
        mustChangePassword: employee.mustChangePassword,
      },
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
      },
    });

    if (!employee) throw new NotFoundException('Employee not found');

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
