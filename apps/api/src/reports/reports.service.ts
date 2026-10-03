import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { ScopeFilter } from '../auth/guards/rbac.guard.js';
import { ReportQueryDto } from '@company-os/contracts';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAttendanceReport(companyId: string, scopeFilter: ScopeFilter, dto: ReportQueryDto) {
    const fromDate = new Date(dto.from);
    const toDate = new Date(dto.to);

    const where: any = {
      date: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (dto.employeeId) {
      where.employeeId = dto.employeeId;
    }

    const days = await this.prisma.attendanceDay.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
            team: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: 'asc' }, { employee: { code: 'asc' } }],
    });

    const rows = days.map((d) => ({
      date: d.date.toISOString().split('T')[0],
      employeeCode: d.employee.code,
      employeeName: `${d.employee.firstName} ${d.employee.lastName}`,
      department: d.employee.department?.name || 'N/A',
      team: d.employee.team?.name || 'N/A',
      status: d.status,
      workingSeconds: d.workingSeconds,
      activeSeconds: d.activeSeconds,
      idleSeconds: d.idleSeconds,
      breakSeconds: d.breakSeconds,
      offlineSeconds: d.offlineSeconds,
      flags: d.flags.join(', '),
    }));

    if (dto.format === 'csv') {
      return this.toCsv(rows);
    }

    return { totalRecords: rows.length, data: rows };
  }

  async getProductivityReport(companyId: string, scopeFilter: ScopeFilter, dto: ReportQueryDto) {
    const fromDate = new Date(dto.from);
    const toDate = new Date(dto.to);

    const where: any = {
      date: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (dto.employeeId) {
      where.employeeId = dto.employeeId;
    }

    const summaries = await this.prisma.activityDailySummary.findMany({
      where,
      orderBy: [{ date: 'asc' }],
    });

    // Fetch employee details
    const employeeIds = Array.from(new Set(summaries.map((s) => s.employeeId)));
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, companyId },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const rows = summaries.map((s) => {
      const emp = empMap.get(s.employeeId);
      const totalActive = s.productiveS + s.neutralS + s.unproductiveS;
      const score = totalActive > 0 ? Math.round((s.productiveS / totalActive) * 100) : 0;

      return {
        date: s.date.toISOString().split('T')[0],
        employeeCode: emp?.code || s.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'N/A',
        department: emp?.department?.name || 'N/A',
        team: emp?.team?.name || 'N/A',
        trackedSeconds: s.trackedS,
        activeSeconds: s.activeS,
        idleSeconds: s.idleS,
        productiveSeconds: s.productiveS,
        neutralSeconds: s.neutralS,
        unproductiveSeconds: s.unproductiveS,
        productivityScore: score,
      };
    });

    if (dto.format === 'csv') {
      return this.toCsv(rows);
    }

    return { totalRecords: rows.length, data: rows };
  }

  async getCrmReport(companyId: string, scopeFilter: ScopeFilter, dto: ReportQueryDto) {
    const fromDate = new Date(dto.from);
    const toDate = new Date(dto.to);

    const where: any = {
      companyId,
      deletedAt: null,
      createdAt: { gte: fromDate, lte: toDate },
      ...(scopeFilter.scope !== 'all' ? { ownerId: { in: scopeFilter.allowedEmployeeIds } } : {}),
      ...(dto.employeeId ? { ownerId: dto.employeeId } : {}),
    };

    const leads = await this.prisma.lead.findMany({
      where,
      include: {
        owner: { select: { id: true, code: true, firstName: true, lastName: true } },
        stage: { select: { name: true, type: true } },
      },
    });

    const totalLeads = leads.length;
    const wonLeads = leads.filter((l) => l.stage.type === 'won').length;
    const lostLeads = leads.filter((l) => l.stage.type === 'lost').length;
    const totalRevenue = leads
      .filter((l) => l.stage.type === 'won' && l.value)
      .reduce((acc, l) => acc + Number(l.value || 0), 0);

    const rows = leads.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.companyName || '',
      owner: l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : 'Unassigned',
      stage: l.stage.name,
      stageType: l.stage.type,
      value: l.value ? Number(l.value) : 0,
      currency: l.currency,
      createdAt: l.createdAt.toISOString(),
    }));

    if (dto.format === 'csv') {
      return this.toCsv(rows);
    }

    return {
      summary: {
        totalLeads,
        wonLeads,
        lostLeads,
        conversionRate: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0,
        totalRevenue,
      },
      data: rows,
    };
  }

  async getCallsReport(companyId: string, scopeFilter: ScopeFilter, dto: ReportQueryDto) {
    const fromDate = new Date(dto.from);
    const toDate = new Date(dto.to);

    const where: any = {
      occurredAt: { gte: fromDate, lte: toDate },
      employee: {
        companyId,
        ...(scopeFilter.scope !== 'all' ? { id: { in: scopeFilter.allowedEmployeeIds } } : {}),
        ...(dto.employeeId ? { id: dto.employeeId } : {}),
      },
    };

    const calls = await this.prisma.callLog.findMany({
      where,
      include: {
        employee: { select: { code: true, firstName: true, lastName: true } },
        lead: { select: { name: true, companyName: true } },
      },
      orderBy: { occurredAt: 'desc' },
    });

    const totalCalls = calls.length;
    const connectedCalls = calls.filter((c) => c.outcome === 'Connected').length;
    const totalDurationSeconds = calls.reduce((acc, c) => acc + c.durationSeconds, 0);

    const rows = calls.map((c) => ({
      occurredAt: c.occurredAt.toISOString(),
      employeeCode: c.employee.code,
      employeeName: `${c.employee.firstName} ${c.employee.lastName}`,
      leadName: c.lead.name,
      direction: c.direction,
      outcome: c.outcome,
      durationSeconds: c.durationSeconds,
      notes: c.notes || '',
    }));

    if (dto.format === 'csv') {
      return this.toCsv(rows);
    }

    return {
      summary: {
        totalCalls,
        connectedCalls,
        connectionRate: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0,
        avgDurationSeconds: totalCalls > 0 ? Math.round(totalDurationSeconds / totalCalls) : 0,
      },
      data: rows,
    };
  }

  toCsv(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]!);
    const headerLine = headers.join(',');
    const dataLines = rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(','),
    );
    return [headerLine, ...dataLines].join('\n');
  }
}
