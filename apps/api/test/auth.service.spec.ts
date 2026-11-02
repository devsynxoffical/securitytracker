import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPairSync, createSign, createHash } from 'crypto';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { ClockService } from '../src/common/clock.service';
import { ErrorCodes } from '@company-os/contracts';


function deviceKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const sign = (timestamp: string, body: Record<string, unknown>) => {
    const h = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const s = createSign('SHA256');
    s.update(`${timestamp}.${h}`);
    s.end();
    return s.sign(privateKey, 'base64');
  };
  return { pem, sign };
}

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

    const keys = deviceKeys();
    const timestamp = new Date().toISOString();
    const result = await authService.desktopLogin(
      {
        identifier: 'EMP-0001',
        password: 'Secret123!',
        device: {
          publicKey: keys.pem,
          name: 'Work PC',
          os: 'Windows 11',
          hardwareHash: 'hash123',
        },
        timestamp,
        signature: keys.sign(timestamp, { identifier: 'EMP-0001', timestamp, hardwareHash: 'hash123' }),
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

  it('rejects a login whose device signature does not match the registered key (FR-AUTH-04)', async () => {
    const passwordHash = await argon2.hash('Secret123!', { memoryCost: 65536, timeCost: 3, parallelism: 1 });
    prismaMock.employee.findFirst.mockResolvedValue({
      id: 'emp-1', companyId: 'comp-1', code: 'EMP-0001', passwordHash, status: 'active', failedLogins: 0, mustChangePassword: false,
      company: { settings: { deviceApprovalMode: 'manual', deviceLimitPerEmployee: 1 } }, role: { name: 'Employee', rank: 1 },
    });
    const registered = deviceKeys();
    const attacker = deviceKeys();
    prismaMock.device.findFirst.mockResolvedValue({ id: 'dev-1', status: 'approved', publicKey: registered.pem, appVersion: null, agentVersion: null });
    const timestamp = new Date().toISOString();
    await expect(
      authService.desktopLogin(
        { identifier: 'EMP-0001', password: 'Secret123!', device: { publicKey: attacker.pem, name: 'PC', os: 'Win', hardwareHash: 'hash123' }, timestamp, signature: attacker.sign(timestamp, { identifier: 'EMP-0001', timestamp, hardwareHash: 'hash123' }) },
        '127.0.0.1',
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_DEVICE_SIGNATURE' } });
  });
});

describe('AuthService forgotPassword delivery (F30)', () => {
  function build(mailer: any) {
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
    const prisma: any = {
      employee: { findFirst: vi.fn().mockResolvedValue({ id: 'emp-1', email: 'ann@acme.com' }) },
      loginEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const config: any = { get: vi.fn((k: string) => (k === 'ADMIN_ORIGIN' ? 'https://admin.acme.com' : k === 'NODE_ENV' ? 'production' : undefined)) };
    return { svc: new AuthService(prisma, {} as any, config, clock, undefined, mailer), prisma };
  }

  it('sends the reset link by mail when the mailer is configured and hides the token in production', async () => {
    const mailer = { configured: () => true, send: vi.fn().mockResolvedValue(true) };
    const { svc } = build(mailer);
    const r = await svc.forgotPassword({ email: 'Ann@Acme.com' } as any, '127.0.0.1');
    expect(r).toEqual({ ok: true });
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ann@acme.com', subject: 'Reset your password', text: expect.stringContaining('https://admin.acme.com/admin/reset?token=') }), 'password_reset');
  });

  it('still answers ok when the mail transport fails', async () => {
    const mailer = { configured: () => true, send: vi.fn().mockRejectedValue(new Error('EAUTH')) };
    const { svc } = build(mailer);
    await expect(svc.forgotPassword({ email: 'ann@acme.com' } as any, '127.0.0.1')).resolves.toEqual({ ok: true });
  });

  it('does not call the mailer for unknown addresses or when it is not configured', async () => {
    const mailer = { configured: () => false, send: vi.fn() };
    const { svc, prisma } = build(mailer);
    await svc.forgotPassword({ email: 'ann@acme.com' } as any, '127.0.0.1');
    prisma.employee.findFirst.mockResolvedValue(null);
    await svc.forgotPassword({ email: 'nobody@acme.com' } as any, '127.0.0.1');
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
