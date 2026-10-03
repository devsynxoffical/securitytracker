import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { ClockService } from '../src/common/clock.service';
import { ErrorCodes } from '@company-os/contracts';

describe('AuthService (Unit)', () => {
  let authService: AuthService;
  let prismaMock: any;
  let jwtMock: any;
  let configMock: any;
  let clockService: ClockService;

  beforeEach(() => {
    clockService = new ClockService();
    prismaMock = {
      employee: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      device: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      session: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      policyVersion: {
        findFirst: vi.fn(),
      },
      consentRecord: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      loginEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((cb) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
    };

    jwtMock = {
      sign: vi.fn(() => 'mock-jwt-token'),
    };

    configMock = {
      get: vi.fn((key: string) => {
        if (key === 'ENCRYPTION_SECRET') return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        return 'test-secret';
      }),
    };

    authService = new AuthService(
      prismaMock,
      jwtMock,
      configMock,
      clockService,
    );
  });

  it('should return DEVICE_PENDING on first login when approval mode is manual', async () => {
    const passwordHash = await argon2.hash('Secret123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    prismaMock.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      companyId: 'comp-1',
      code: 'EMP-0001',
      passwordHash,
      status: 'active',
      failedLogins: 0,
      mustChangePassword: false,
      company: { settings: { deviceApprovalMode: 'manual', deviceLimitPerEmployee: 1 } },
      role: { name: 'Employee', rank: 1 },
    });

    prismaMock.device.findFirst.mockResolvedValue(null);
    prismaMock.device.count.mockResolvedValue(0);
    prismaMock.device.create.mockResolvedValue({
      id: 'dev-1',
      status: 'pending',
    });

    const result = await authService.desktopLogin(
      {
        identifier: 'EMP-0001',
        password: 'Secret123!',
        device: {
          publicKey: 'mock-pubkey',
          name: 'Work PC',
          os: 'Windows 11',
          hardwareHash: 'hash123',
        },
        timestamp: new Date().toISOString(),
        signature: 'mock-sig',
      },
      '127.0.0.1',
    );

    expect(result).toEqual({
      status: 'DEVICE_PENDING',
      deviceId: 'dev-1',
      message: 'Device is pending admin approval',
    });
  });

  it('should reject login with INVALID_CREDENTIALS when password does not match', async () => {
    const passwordHash = await argon2.hash('CorrectPassword123!', {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    prismaMock.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      companyId: 'comp-1',
      code: 'EMP-0001',
      passwordHash,
      status: 'active',
      failedLogins: 0,
      company: { settings: {} },
    });

    await expect(
      authService.desktopLogin(
        {
          identifier: 'EMP-0001',
          password: 'WrongPassword!',
          device: {
            publicKey: 'mock-pubkey',
            name: 'Work PC',
            os: 'Windows 11',
            hardwareHash: 'hash123',
          },
          timestamp: new Date().toISOString(),
          signature: 'mock-sig',
        },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
  });
});
