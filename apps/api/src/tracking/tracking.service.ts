import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BatchIngestSegmentsDto,
  BatchIngestResponseDto,
  TamperEventDto,
  CreateProductivityRuleDto,
  CreateTrackingExclusionDto,
  CreateActivityExceptionAppDto,
  ProductivityCategory,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

@Injectable()
export class TrackingService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  /**
   * Batch ingest of activity segments with deduplication and real-time rollups (F6, F7, FR-TRK-06).
   */
  async ingestSegments(
    employeeId: string,
    deviceId: string,
    dto: BatchIngestSegmentsDto,
  ): Promise<BatchIngestResponseDto> {
    const shift = await this.prisma.shift.findFirst({
      where: { id: dto.shiftId, employeeId },
      include: { employee: true },
    });

    if (!shift) {
      throw new BadRequestException('Invalid shift ID or shift does not belong to employee');
    }

    const accepted: string[] = [];
    const rejected: { id: string; reason: 'OUTSIDE_SHIFT' | 'OVERLAP' | 'TOO_OLD' | 'INVALID' }[] = [];

    // Load productivity rules and exclusions
    const [rules, exclusions] = await Promise.all([
      this.prisma.productivityRule.findMany({
        where: {
          companyId: shift.employee.companyId,
          OR: [
            { departmentId: null },
            { departmentId: shift.employee.departmentId || undefined },
          ],
        },
      }),
      this.prisma.trackingExclusion.findMany({
        where: { companyId: shift.employee.companyId },
      }),
    ]);

    const attendanceDate = shift.attendanceDate;
    let newActiveSeconds = 0;
    let newIdleSeconds = 0;
    let newKeyCount = 0;
    let newMouseCount = 0;

    const appDeltas: Record<string, { appName: string; category: string; activeS: number; idleS: number }> = {};
    const domainDeltas: Record<string, { category: string; activeS: number }> = {};

    for (const seg of dto.segments) {
      const start = new Date(seg.startedAt);
      const end = new Date(seg.endedAt);
      const durationS = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

      if (durationS <= 0) {
        rejected.push({ id: seg.id, reason: 'INVALID' });
        continue;
      }

      // Check if segment already exists (idempotent upsert)
      const existing = await this.prisma.activitySegment.findUnique({
        where: { id: seg.id },
      });

      if (existing) {
        accepted.push(seg.id);
        continue;
      }

      // Check exclusions
      let domain = seg.domain || null;
      if (domain && exclusions.some((e) => e.targetType === 'domain' && domain!.includes(e.pattern))) {
        domain = 'excluded';
      }

      // Determine productivity category
      const category = this.evaluateProductivityCategory(seg.processName, domain, rules);

      try {
        await this.prisma.activitySegment.create({
          data: {
            id: seg.id,
            employeeId,
            deviceId,
            shiftId: shift.id,
            startedAt: start,
            endedAt: end,
            durationS,
            kind: seg.kind,
            processName: seg.processName,
            appName: seg.appName,
            domain,
            windowTitle: seg.windowTitle || null,
            keyCount: seg.keyCount,
            mouseCount: seg.mouseCount,
            exception: seg.exception,
            claim: seg.claim,
            late: (this.clock.now().getTime() - end.getTime()) > 3600 * 1000,
          },
        });

        accepted.push(seg.id);

        if (seg.kind === 'active') {
          newActiveSeconds += durationS;
        } else if (seg.kind === 'idle') {
          newIdleSeconds += durationS;
        }
        newKeyCount += seg.keyCount;
        newMouseCount += seg.mouseCount;

        // App Rollup Delta
        const appKey = seg.processName;
        if (!appDeltas[appKey]) {
          appDeltas[appKey] = {
            appName: seg.appName,
            category,
            activeS: 0,
            idleS: 0,
          };
        }
        if (seg.kind === 'active') appDeltas[appKey]!.activeS += durationS;
        if (seg.kind === 'idle') appDeltas[appKey]!.idleS += durationS;

        // Domain Rollup Delta
        if (domain && domain !== 'excluded' && domain !== 'unknown' && seg.kind === 'active') {
          if (!domainDeltas[domain]) {
            domainDeltas[domain] = { category, activeS: 0 };
          }
          domainDeltas[domain]!.activeS += durationS;
        }
      } catch (err) {
        rejected.push({ id: seg.id, reason: 'INVALID' });
      }
    }

    // Apply Rollups to DB
    if (accepted.length > 0) {
      // 1. Update Shift Totals
      await this.prisma.shift.update({
        where: { id: shift.id },
        data: {
          activeSeconds: { increment: newActiveSeconds },
          idleSeconds: { increment: newIdleSeconds },
          lastHeartbeatAt: this.clock.now(),
        },
      });

      // 2. Update Daily App Rollups
      for (const [processName, data] of Object.entries(appDeltas)) {
        await this.prisma.activityDailyApp.upsert({
          where: {
            employeeId_date_processName: {
              employeeId,
              date: attendanceDate,
              processName,
            },
          },
          update: {
            activeS: { increment: data.activeS },
            idleS: { increment: data.idleS },
          },
          create: {
            employeeId,
            date: attendanceDate,
            appName: data.appName,
            processName,
            category: data.category,
            activeS: data.activeS,
            idleS: data.idleS,
          },
        });
      }

      // 3. Update Daily Domain Rollups
      for (const [domain, data] of Object.entries(domainDeltas)) {
        await this.prisma.activityDailyDomain.upsert({
          where: {
            employeeId_date_domain: {
              employeeId,
              date: attendanceDate,
              domain,
            },
          },
          update: {
            activeS: { increment: data.activeS },
          },
          create: {
            employeeId,
            date: attendanceDate,
            domain,
            category: data.category,
            activeS: data.activeS,
          },
        });
      }

      // 4. Update Daily Summary Rollup
      await this.prisma.activityDailySummary.upsert({
        where: {
          employeeId_date: {
            employeeId,
            date: attendanceDate,
          },
        },
        update: {
          trackedS: { increment: newActiveSeconds + newIdleSeconds },
          activeS: { increment: newActiveSeconds },
          idleS: { increment: newIdleSeconds },
          keyCount: { increment: newKeyCount },
          mouseCount: { increment: newMouseCount },
        },
        create: {
          employeeId,
          date: attendanceDate,
          trackedS: newActiveSeconds + newIdleSeconds,
          activeS: newActiveSeconds,
          idleS: newIdleSeconds,
          keyCount: newKeyCount,
          mouseCount: newMouseCount,
        },
      });
    }

    return { accepted, rejected };
  }

  /**
   * Log tamper signals (FR-TRK-12).
   */
  async recordTamperEvents(employeeId: string, deviceId: string, dto: TamperEventDto) {
    return this.prisma.tamperEvent.create({
      data: {
        employeeId,
        deviceId,
        type: dto.type,
        detail: (dto.detail as Prisma.InputJsonValue) ?? {},
        occurredAt: new Date(dto.occurredAt),
      },
    });
  }

  /**
   * Daily tracking summary list with ScopeFilter.
   */
  async getTrackingSummary(
    scopeFilter: ScopeFilter,
    filters?: { employeeId?: string; from?: string; to?: string },
  ) {
    const where: any = {};

    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (filters?.employeeId) {
      if (
        scopeFilter.scope !== 'all' &&
        !scopeFilter.allowedEmployeeIds.includes(filters.employeeId)
      ) {
        throw new ForbiddenException('Access to employee tracking data outside scope');
      }
      where.employeeId = filters.employeeId;
    }

    if (filters?.from || filters?.to) {
      where.date = {};
      if (filters.from) where.date.gte = new Date(filters.from);
      if (filters.to) where.date.lte = new Date(filters.to);
    }

    return this.prisma.activityDailySummary.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Top Applications rollup (FR-TRK-08).
   */
  async getDailyApps(
    scopeFilter: ScopeFilter,
    filters?: { employeeId?: string; date?: string },
  ) {
    const where: any = {};
    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.date) where.date = new Date(filters.date);

    return this.prisma.activityDailyApp.findMany({
      where,
      orderBy: { activeS: 'desc' },
    });
  }

  /**
   * Top Websites rollup (FR-TRK-08).
   */
  async getDailyDomains(
    scopeFilter: ScopeFilter,
    filters?: { employeeId?: string; date?: string },
  ) {
    const where: any = {};
    if (scopeFilter.scope !== 'all') {
      where.employeeId = { in: scopeFilter.allowedEmployeeIds };
    }
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.date) where.date = new Date(filters.date);

    return this.prisma.activityDailyDomain.findMany({
      where,
      orderBy: { activeS: 'desc' },
    });
  }

  /**
   * Detailed chronological segments for an employee & date (FR-TRK-08, F19).
   */
  async getTimeline(employeeId: string, date: string, scopeFilter: ScopeFilter) {
    if (
      scopeFilter.scope !== 'all' &&
      !scopeFilter.allowedEmployeeIds.includes(employeeId)
    ) {
      throw new ForbiddenException('Access to employee timeline outside scope');
    }

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    return this.prisma.activitySegment.findMany({
      where: {
        employeeId,
        startedAt: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startedAt: 'asc' },
    });
  }

  /**
   * Client tracking configuration payload (idle threshold, exceptions, exclusions).
   */
  async getTrackingConfig(companyId: string) {
    const [company, exceptions, exclusions] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.activityExceptionApp.findMany({ where: { companyId } }),
      this.prisma.trackingExclusion.findMany({ where: { companyId } }),
    ]);

    const settings = (company?.settings as any) || {};

    return {
      idleThresholdSeconds: settings.idleThresholdSeconds || 300,
      longIdlePrompt: settings.longIdlePrompt ?? true,
      captureWindowTitles: settings.captureWindowTitles ?? false,
      exceptionApps: exceptions.map((e) => ({ processName: e.processName, type: e.type })),
      exclusions: exclusions.map((e) => ({ targetType: e.targetType, pattern: e.pattern })),
    };
  }

  // -----------------------------------------------------------------
  // Productivity Rules & Exclusions Management
  // -----------------------------------------------------------------

  async listProductivityRules(companyId: string) {
    return this.prisma.productivityRule.findMany({
      where: { companyId },
      orderBy: { pattern: 'asc' },
    });
  }

  async createProductivityRule(companyId: string, dto: CreateProductivityRuleDto) {
    return this.prisma.productivityRule.create({
      data: {
        companyId,
        targetType: dto.targetType,
        pattern: dto.pattern,
        category: dto.category,
        departmentId: dto.departmentId || null,
      },
    });
  }

  async deleteProductivityRule(id: string, companyId: string) {
    const rule = await this.prisma.productivityRule.findFirst({ where: { id, companyId } });
    if (!rule) throw new NotFoundException('Rule not found');
    return this.prisma.productivityRule.delete({ where: { id } });
  }

  async listExclusions(companyId: string) {
    return this.prisma.trackingExclusion.findMany({ where: { companyId } });
  }

  async createExclusion(companyId: string, dto: CreateTrackingExclusionDto) {
    return this.prisma.trackingExclusion.create({
      data: { companyId, targetType: dto.targetType, pattern: dto.pattern },
    });
  }

  async listExceptionApps(companyId: string) {
    return this.prisma.activityExceptionApp.findMany({ where: { companyId } });
  }

  async createExceptionApp(companyId: string, dto: CreateActivityExceptionAppDto) {
    return this.prisma.activityExceptionApp.create({
      data: { companyId, processName: dto.processName, type: dto.type },
    });
  }

  private evaluateProductivityCategory(
    processName: string,
    domain: string | null,
    rules: any[],
  ): string {
    // 1. Check domain rule first
    if (domain) {
      const matchedDomainRule = rules.find(
        (r) => r.targetType === 'domain' && domain.toLowerCase().includes(r.pattern.toLowerCase()),
      );
      if (matchedDomainRule) return matchedDomainRule.category;
    }

    // 2. Check app process name rule
    const matchedAppRule = rules.find(
      (r) => r.targetType === 'app' && processName.toLowerCase().includes(r.pattern.toLowerCase()),
    );
    if (matchedAppRule) return matchedAppRule.category;

    return ProductivityCategory.NEUTRAL;
  }
}
