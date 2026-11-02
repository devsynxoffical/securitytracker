import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService, CompanySettingsSchema } from '../src/settings/settings.service';

const COMPANY = '00000000-0000-0000-0000-000000000001';

describe('Company settings', () => {
  let prisma: any;
  let svc: SettingsService;
  const company = { id: COMPANY, name: 'Acme', timezone: 'UTC', weekStart: 1, settings: { idleThresholdSeconds: 240 }, updatedAt: new Date() };

  beforeEach(() => {
    prisma = {
      company: {
        findUnique: vi.fn().mockResolvedValue(company),
        update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...company, ...data, settings: data.settings })),
      },
    };
    svc = new SettingsService(prisma);
  });

  it('merges stored values over defaults on read', async () => {
    const res = await svc.get(COMPANY);
    expect(res.idleThresholdSeconds).toBe(240);
    expect(res.breakAllowanceMinutes).toBe(60);
    expect(res.deviceApprovalMode).toBe('manual');
    expect(res.timezone).toBe('UTC');
  });

  it('rejects unknown keys and out-of-range values', () => {
    expect(() => CompanySettingsSchema.strict().parse({ foo: 1 })).toThrow();
    expect(() => CompanySettingsSchema.parse({ idleThresholdSeconds: 10 })).toThrow();
    expect(() => CompanySettingsSchema.parse({ deviceApprovalMode: 'yes' })).toThrow();
    expect(() => CompanySettingsSchema.parse({ weekStart: 0 })).toThrow();
  });

  it('update writes columns and merges json keys without dropping others', async () => {
    await svc.update(COMPANY, { timezone: 'Asia/Karachi', deviceLimitPerEmployee: 2 });
    const data = prisma.company.update.mock.calls[0][0].data;
    expect(data.timezone).toBe('Asia/Karachi');
    expect(data.settings).toEqual({ idleThresholdSeconds: 240, deviceLimitPerEmployee: 2 });
  });
});
