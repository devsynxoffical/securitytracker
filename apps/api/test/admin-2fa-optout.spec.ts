import { describe, it, expect, vi } from 'vitest';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { ClockService } from '../src/common/clock.service';

async function make(required: string | undefined, totpEnabled: boolean) {
  const passwordHash = await argon2.hash('Secret123!');
  const prisma: any = {
    employee: { findFirst: vi.fn().mockResolvedValue({ id: 'e1', companyId: 'c1', status: 'active', passwordHash, failedLogins: 0, lockedUntil: null, totpEnabled, role: { name: 'Super Admin', rank: 100 }, company: { settings: {} } }), update: vi.fn() },
    loginEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const config: any = { get: vi.fn((k: string) => (k === 'ADMIN_2FA_REQUIRED' ? required : undefined)) };
  const auth = new AuthService(prisma, { sign: vi.fn(() => 'temp') } as any, config, new ClockService(), { get: vi.fn(), set: vi.fn(), del: vi.fn() } as any, { send: vi.fn() } as any);
  (auth as any).createAdminSession = vi.fn().mockResolvedValue({ accessToken: 'access' });
  return { auth, prisma };
}

describe('admin 2FA operator opt-out', () => {
  it('signs in with password only when ADMIN_2FA_REQUIRED=false, and logs it', async () => {
    const { auth, prisma } = await make('false', false);
    const res: any = await auth.adminLogin({ email: 'e@x', password: 'Secret123!' }, '10.0.0.1');
    expect(res.tokens.accessToken).toBe('access');
    expect(prisma.loginEvent.create.mock.calls.at(-1)[0].data).toMatchObject({ result: 'success_no_2fa' });
  });

  it('still requires enrolment by default', async () => {
    const { auth } = await make(undefined, false);
    const res: any = await auth.adminLogin({ email: 'e@x', password: 'Secret123!' }, '10.0.0.1');
    expect(res.enrollmentRequired).toBe(true);
    expect(res.tokens).toBeUndefined();
  });

  it('never skips the password check', async () => {
    const { auth } = await make('false', false);
    await expect(auth.adminLogin({ email: 'e@x', password: 'wrong-password' }, '10.0.0.1')).rejects.toBeTruthy();
  });
});
