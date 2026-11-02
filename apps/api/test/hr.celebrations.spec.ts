import { describe, it, expect, vi } from 'vitest';
import { nextOccurrence, CelebrationsService } from '../src/hr/celebrations.service';
import { ClockService } from '../src/common/clock.service';

const d = (s: string) => new Date(s + 'T00:00:00.000Z');

describe('nextOccurrence (FR-HR-16)', () => {
  it('returns today with 0 days when the anniversary is today', () => {
    const n = nextOccurrence(d('1990-11-02'), d('2026-11-02'));
    expect(n.inDays).toBe(0);
    expect(n.years).toBe(36);
  });

  it('rolls an earlier date in the year to next year', () => {
    const n = nextOccurrence(d('1990-03-15'), d('2026-11-02'));
    expect(n.date.toISOString().slice(0, 10)).toBe('2027-03-15');
    expect(n.years).toBe(37);
  });

  it('maps 29 February to 28 February in non-leap years', () => {
    const n = nextOccurrence(d('1992-02-29'), d('2027-01-10'));
    expect(n.date.toISOString().slice(0, 10)).toBe('2027-02-28');
    const leap = nextOccurrence(d('1992-02-29'), d('2028-01-10'));
    expect(leap.date.toISOString().slice(0, 10)).toBe('2028-02-29');
  });
});

describe('CelebrationsService', () => {
  it('lists birthdays and anniversaries within the window, in scope, sorted, skipping the join year', async () => {
    const clock = new ClockService();
    clock.setMockTime(d('2026-11-02'));
    const prisma: any = {
      employee: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', firstName: 'Ann', lastName: 'Zed', code: 'E1', joinDate: d('2026-11-05'), department: { name: 'Sales' }, profile: { dateOfBirth: d('1990-11-10') } },
          { id: 'b', firstName: 'Bob', lastName: 'Yu', code: 'E2', joinDate: d('2020-11-03'), department: null, profile: null },
          { id: 'c', firstName: 'Cy', lastName: 'Xi', code: 'E3', joinDate: null, department: null, profile: { dateOfBirth: d('1985-12-25') } },
        ]),
      },
    };
    const svc = new CelebrationsService(prisma, clock);
    const items = await svc.upcoming({ scope: 'own', companyId: 'c1', employeeId: 'me', allowedEmployeeIds: ['me'] }, 14);
    expect(prisma.employee.findMany.mock.calls[0][0].where.id).toEqual({ in: ['me'] });
    expect(items.map((i) => `${i.kind}:${i.employeeId}:${i.inDays}`)).toEqual(['anniversary:b:1', 'birthday:a:8']);
    expect(items[0]!.years).toBe(6);
  });
});
