import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SetupService } from '../src/setup/setup.service';
import { DEFAULT_ROLE_DEFINITIONS } from '../src/setup/default-roles';
import { ClockService } from '../src/common/clock.service';
import { PermissionKeys, SystemRoleNames } from '@company-os/contracts';

function table() {
  return {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `${Math.random()}`, ...data })),
    upsert: vi.fn().mockImplementation(({ create, where }: any) => Promise.resolve({ id: where?.id ?? `${Math.random()}`, ...create })),
    findFirst: vi.fn().mockResolvedValue(null),
  };
}

describe('SetupService (F29)', () => {
  let prisma: any;
  let svc: SetupService;

  beforeEach(() => {
    prisma = {
      employee: table(),
      company: table(),
      role: table(),
      rolePermission: table(),
      pipeline: table(),
      leadSource: table(),
      lostReason: table(),
      tag: table(),
      taskSpace: table(),
      taskList: table(),
      leaveType: table(),
      hrChecklistTemplate: table(),
      mailLabel: table(),
      auditLog: table(),
    };
    prisma.$transaction = vi.fn((cb: any) => cb(prisma));
    svc = new SetupService(prisma, new ClockService());
  });

  it('reports needsSetup only while no employee exists', async () => {
    expect(await svc.status()).toEqual({ needsSetup: true });
    prisma.employee.count.mockResolvedValue(3);
    expect(await svc.status()).toEqual({ needsSetup: false });
  });

  it('refuses bootstrap once a workspace exists', async () => {
    prisma.employee.count.mockResolvedValue(1);
    await expect(
      svc.bootstrap({ companyName: 'Acme', timezone: 'UTC', firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'longpassword1' }, '127.0.0.1'),
    ).rejects.toMatchObject({ status: 409 });
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it('creates the company, five system roles with the default matrix, a super admin and defaults', async () => {
    const res = await svc.bootstrap({ companyName: ' Acme Roofing ', timezone: 'Europe/Berlin', firstName: 'Sara', lastName: 'Malik', email: 'Sara@Acme.com', password: 'longpassword1' }, '10.0.0.1');
    expect(res.companyId).toBeTruthy();
    expect(prisma.company.create.mock.calls[0][0].data.name).toBe('Acme Roofing');
    expect(prisma.role.upsert).toHaveBeenCalledTimes(5);
    const superAdminGrants = Object.entries(DEFAULT_ROLE_DEFINITIONS[SystemRoleNames.SUPER_ADMIN]!.permissions);
    expect(superAdminGrants.length).toBe(PermissionKeys.length);
    expect(superAdminGrants.every(([, scope]) => scope === 'all')).toBe(true);
    const admin = prisma.employee.create.mock.calls[0][0].data;
    expect(admin.email).toBe('sara@acme.com');
    expect(admin.mustChangePassword).toBe(false);
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    expect(prisma.pipeline.create).toHaveBeenCalledTimes(2);
    expect(prisma.leaveType.upsert).toHaveBeenCalledTimes(4);
    expect(prisma.hrChecklistTemplate.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
