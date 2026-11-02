import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { toCursorPage } from '../crm/shared/crm.util';

export interface AuditQuery {
  actorId?: string;
  entityType?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface SessionsQuery {
  employeeId?: string;
  active?: boolean;
  client?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class SecurityService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  async listAuditLogs(companyId: string, filters: AuditQuery = {}) {
    const where: Prisma.AuditLogWhereInput = { companyId };
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.from || filters.to) {
      where.occurredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const take = Math.min(filters.limit ?? 50, 200);
    const rows = await this.prisma.auditLog.findMany({
      where,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const page = toCursorPage(rows, take);
    return { ...page, items: await this.attachActors(page.items) };
  }

  async listLoginEvents(companyId: string, filters: { employeeId?: string; result?: string; cursor?: string; limit?: number } = {}) {
    const employeeIds = (await this.prisma.employee.findMany({ where: { companyId }, select: { id: true } })).map((e) => e.id);
    const where: Prisma.LoginEventWhereInput = {
      OR: [{ employeeId: { in: employeeIds } }, { employeeId: null }],
    };
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.result) where.result = filters.result;
    const take = Math.min(filters.limit ?? 50, 200);
    const rows = await this.prisma.loginEvent.findMany({
      where,
      take: take + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const page = toCursorPage(rows, take);
    return { ...page, items: await this.attachActors(page.items.map((r) => ({ ...r, actorId: r.employeeId }))) };
  }

  async listSecurityAlerts(companyId: string, acknowledged?: boolean) {
    const employeeIds = (await this.prisma.employee.findMany({ where: { companyId }, select: { id: true } })).map((e) => e.id);
    const where: Prisma.SecurityAlertWhereInput = { OR: [{ employeeId: { in: employeeIds } }, { employeeId: null }] };
    if (acknowledged === true) where.acknowledgedAt = { not: null };
    if (acknowledged === false) where.acknowledgedAt = null;
    const rows = await this.prisma.securityAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    return this.attachActors(rows.map((r) => ({ ...r, actorId: r.employeeId })));
  }

  async acknowledgeAlert(id: string, adminId: string) {
    const alert = await this.prisma.securityAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Security alert not found');
    return this.prisma.securityAlert.update({
      where: { id },
      data: { acknowledgedBy: adminId, acknowledgedAt: this.clock.now() },
    });
  }

  // ---- Sessions (FR-AUTH-08) ------------------------------------------------

  private sessionScope(scope: ScopeFilter): Prisma.SessionWhereInput {
    const employee: Prisma.EmployeeWhereInput = { companyId: scope.companyId };
    if (scope.scope !== 'all') employee.id = { in: scope.allowedEmployeeIds };
    return { employee };
  }

  async listSessions(scope: ScopeFilter, q: SessionsQuery = {}) {
    if (q.employeeId && scope.scope !== 'all' && !scope.allowedEmployeeIds.includes(q.employeeId)) {
      throw new ForbiddenException('Employee is outside your scope');
    }
    const now = this.clock.now();
    const where: Prisma.SessionWhereInput = { ...this.sessionScope(scope) };
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.client) where.client = q.client;
    if (q.active === true) {
      where.revokedAt = null;
      where.expiresAt = { gt: now };
    }
    if (q.active === false) where.OR = [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }];
    const take = Math.min(q.limit ?? 50, 200);
    const rows = await this.prisma.session.findMany({
      where,
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, employeeId: true, deviceId: true, client: true, ip: true, userAgent: true,
        expiresAt: true, revokedAt: true, revokedReason: true, createdAt: true,
        employee: { select: { id: true, code: true, firstName: true, lastName: true } },
        device: { select: { id: true, name: true, osVersion: true } },
      },
    });
    const page = toCursorPage(rows, take);
    return { ...page, items: page.items.map((s) => ({ ...s, active: !s.revokedAt && s.expiresAt > now })) };
  }

  /** Revokes one session. 404 outside scope so existence is not revealed. */
  async revokeSession(scope: ScopeFilter, actorId: string, id: string) {
    const session = await this.prisma.session.findFirst({ where: { id, ...this.sessionScope(scope) } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.revokedAt) return session;
    return this.prisma.session.update({
      where: { id },
      data: { revokedAt: this.clock.now(), revokedReason: `admin:${actorId}` },
    });
  }

  async revokeAllSessions(scope: ScopeFilter, actorId: string, employeeId: string) {
    const where: Prisma.EmployeeWhereInput = { id: employeeId, companyId: scope.companyId };
    if (scope.scope !== 'all') where.id = { in: scope.allowedEmployeeIds.filter((x) => x === employeeId) };
    const employee = await this.prisma.employee.findFirst({ where, select: { id: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    const res = await this.prisma.session.updateMany({
      where: { employeeId, revokedAt: null },
      data: { revokedAt: this.clock.now(), revokedReason: `admin:${actorId}` },
    });
    return { revoked: res.count };
  }

  private async attachActors<T extends { actorId: string | null }>(rows: T[]) {
    const ids = Array.from(new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x))));
    if (ids.length === 0) return rows.map((r) => ({ ...r, actor: null }));
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, firstName: true, lastName: true },
    });
    const map = new Map(employees.map((e) => [e.id, e]));
    return rows.map((r) => ({ ...r, actor: r.actorId ? map.get(r.actorId) ?? null : null }));
  }
}
