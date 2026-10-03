import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportsService } from '../src/reports/reports.service';

describe('ReportsService (Unit)', () => {
  let reportsService: ReportsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      attendanceDay: {
        findMany: vi.fn(),
      },
      activityDailySummary: {
        findMany: vi.fn(),
      },
      lead: {
        findMany: vi.fn(),
      },
      callLog: {
        findMany: vi.fn(),
      },
      employee: {
        findMany: vi.fn(),
      },
    };

    reportsService = new ReportsService(prismaMock);
  });

  it('should generate attendance report and format as JSON', async () => {
    prismaMock.attendanceDay.findMany.mockResolvedValue([
      {
        date: new Date('2026-10-01'),
        status: 'present',
        workingSeconds: 28800,
        activeSeconds: 25000,
        idleSeconds: 3800,
        breakSeconds: 3600,
        offlineSeconds: 0,
        flags: [],
        employee: {
          id: 'emp-1',
          code: 'EMP-0001',
          firstName: 'John',
          lastName: 'Doe',
          department: { name: 'Sales' },
          team: { name: 'Direct Sales' },
        },
      },
    ]);

    const report = await reportsService.getAttendanceReport(
      'comp-1',
      { scope: 'all', companyId: 'comp-1', employeeId: 'admin-1', allowedEmployeeIds: [] },
      { from: '2026-10-01', to: '2026-10-02', format: 'json' },
    );

    expect(report).toHaveProperty('totalRecords', 1);
    expect((report as any).data[0].employeeCode).toBe('EMP-0001');
  });

  it('should export CSV format correctly', async () => {
    const csv = reportsService.toCsv([
      { code: 'EMP-0001', name: 'John Doe', status: 'present' },
      { code: 'EMP-0002', name: 'Jane "Sales" Smith', status: 'late' },
    ]);

    expect(csv).toContain('code,name,status');
    expect(csv).toContain('"EMP-0001","John Doe","present"');
    expect(csv).toContain('"EMP-0002","Jane ""Sales"" Smith","late"');
  });
});
