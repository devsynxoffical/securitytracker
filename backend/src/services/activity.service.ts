import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
import { AuthenticatedDevice } from '../middleware/auth.middleware.js';

export interface ActivitySampleInput {
  appName: string;
  windowTitle?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds?: number;
  isIdle?: boolean;
}

export interface IngestBatchInput {
  batchId: string;
  samples: ActivitySampleInput[];
}

export interface IngestionResult {
  batchId: string;
  accepted: number;
  duplicate: boolean;
  message?: string;
}

const MAX_SAMPLES_PER_BATCH = 100;
const MAX_APP_NAME_LENGTH = 255;
const MAX_WINDOW_TITLE_LENGTH = 512;
const MAX_DURATION_SECONDS = 86400; // 24 hours
const MAX_FUTURE_SKEW_SECONDS = 300; // 5 minutes tolerance
const MAX_PAST_LIMIT_DAYS = 30;

export class ActivityService {
  /**
   * Ingests a telemetry activity batch from an authenticated desktop agent.
   * Bound to req.authenticatedDevice (deviceId and userId are derived from database, NOT client body).
   * Idempotency is enforced by batchId uniqueness in ActivityBatch model.
   */
  static async ingestBatch(
    authenticatedDevice: AuthenticatedDevice,
    input: IngestBatchInput
  ): Promise<IngestionResult> {
    const { batchId, samples } = input;

    if (!batchId || typeof batchId !== 'string' || batchId.trim().length === 0) {
      throw ApiError.badRequest('Valid batchId string is required');
    }

    if (!Array.isArray(samples) || samples.length === 0) {
      throw ApiError.badRequest('Activity batch must contain at least one sample');
    }

    if (samples.length > MAX_SAMPLES_PER_BATCH) {
      throw ApiError.badRequest(`Batch size exceeds maximum limit of ${MAX_SAMPLES_PER_BATCH} samples`);
    }

    // 1. Check Idempotency / Duplicate Batch Submissions
    const existingBatch = await prisma.activityBatch.findUnique({
      where: { batchId },
    });

    if (existingBatch) {
      return {
        batchId,
        accepted: 0,
        duplicate: true,
        message: 'Batch has already been processed',
      };
    }

    const now = Date.now();
    const pastLimitTimestamp = now - MAX_PAST_LIMIT_DAYS * 24 * 60 * 60 * 1000;
    const futureLimitTimestamp = now + MAX_FUTURE_SKEW_SECONDS * 1000;

    const sessionRecordsToCreate: Array<{
      deviceId: string;
      userId: string;
      appName: string;
      windowTitle: string | null;
      startTime: Date;
      endTime: Date;
      durationSeconds: number;
      isIdle: boolean;
    }> = [];

    // 2. Validate and Transform Each Telemetry Sample
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const indexStr = `Sample at index ${i}`;

      if (!sample.appName || typeof sample.appName !== 'string' || sample.appName.trim().length === 0) {
        throw ApiError.badRequest(`${indexStr}: Valid non-empty appName is required`);
      }

      const cleanAppName = sample.appName.trim().substring(0, MAX_APP_NAME_LENGTH);
      const cleanWindowTitle = sample.windowTitle && typeof sample.windowTitle === 'string'
        ? sample.windowTitle.trim().substring(0, MAX_WINDOW_TITLE_LENGTH)
        : null;

      const startDate = new Date(sample.startedAt);
      const endDate = new Date(sample.endedAt);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw ApiError.badRequest(`${indexStr}: Valid startedAt and endedAt ISO timestamp strings are required`);
      }

      if (startDate.getTime() >= endDate.getTime()) {
        throw ApiError.badRequest(`${indexStr}: startedAt timestamp (${sample.startedAt}) must be strictly prior to endedAt timestamp (${sample.endedAt})`);
      }

      if (startDate.getTime() > futureLimitTimestamp) {
        throw ApiError.badRequest(`${indexStr}: Timestamp cannot be in the future beyond clock skew tolerance`);
      }

      if (startDate.getTime() < pastLimitTimestamp) {
        throw ApiError.badRequest(`${indexStr}: Timestamp is older than maximum retention limit of ${MAX_PAST_LIMIT_DAYS} days`);
      }

      const calculatedDuration = Math.round((endDate.getTime() - startDate.getTime()) / 1000);

      if (calculatedDuration <= 0 || calculatedDuration > MAX_DURATION_SECONDS) {
        throw ApiError.badRequest(`${indexStr}: Calculated duration (${calculatedDuration}s) exceeds allowed limit (1s to ${MAX_DURATION_SECONDS}s)`);
      }

      sessionRecordsToCreate.push({
        deviceId: authenticatedDevice.id,
        userId: authenticatedDevice.userId,
        appName: cleanAppName,
        windowTitle: cleanWindowTitle,
        startTime: startDate,
        endTime: endDate,
        durationSeconds: calculatedDuration,
        isIdle: Boolean(sample.isIdle),
      });
    }

    // 3. Atomic Database Insertion (Prisma Transaction)
    await prisma.$transaction(async (tx) => {
      // Create batch idempotency record
      await tx.activityBatch.create({
        data: {
          batchId,
          deviceId: authenticatedDevice.id,
          userId: authenticatedDevice.userId,
          sampleCount: sessionRecordsToCreate.length,
        },
      });

      // Insert validated sessions
      await tx.session.createMany({
        data: sessionRecordsToCreate,
      });

      // Update device heartbeat timestamp
      await tx.device.update({
        where: { id: authenticatedDevice.id },
        data: { lastSeenAt: new Date(now) },
      });
    });

    return {
      batchId,
      accepted: sessionRecordsToCreate.length,
      duplicate: false,
    };
  }

  /**
   * Helper to build Prisma Session `where` filter clause adhering to server-side RBAC rules.
   */
  private static async buildWhereClause(
    user: { id: string; role: string; department?: string | null },
    params: ActivityFilterParams
  ) {
    let targetUserIds: string[] | undefined;

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      if (params.employeeId) {
        targetUserIds = [params.employeeId];
      }
    } else if (user.role === 'MANAGER') {
      const reports = await prisma.user.findMany({
        where: { managerId: user.id },
        select: { id: true },
      });
      const allowed = [user.id, ...reports.map((r) => r.id)];

      if (params.employeeId) {
        if (!allowed.includes(params.employeeId)) {
          throw ApiError.forbidden("Access denied: You are not authorized to view this employee's activity");
        }
        targetUserIds = [params.employeeId];
      } else {
        targetUserIds = allowed;
      }
    } else {
      // EMPLOYEE or other roles: Strictly own data
      if (params.employeeId && params.employeeId !== user.id) {
        throw ApiError.forbidden("Access denied: You are not authorized to view another employee's activity");
      }
      targetUserIds = [user.id];
    }

    const where: any = {};

    if (targetUserIds !== undefined) {
      where.userId = targetUserIds.length === 1 ? targetUserIds[0] : { in: targetUserIds };
    }

    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }

    if (params.isIdle !== undefined) {
      where.isIdle = params.isIdle;
    }

    if (params.appName) {
      where.appName = { contains: params.appName };
    }

    if (params.startDate || params.endDate) {
      where.startTime = {};
      if (params.startDate) {
        const startDateObj = new Date(`${params.startDate}T00:00:00.000Z`);
        if (isNaN(startDateObj.getTime())) {
          throw ApiError.badRequest('Invalid startDate format. Expected YYYY-MM-DD');
        }
        where.startTime.gte = startDateObj;
      }
      if (params.endDate) {
        const endDateObj = new Date(`${params.endDate}T23:59:59.999Z`);
        if (isNaN(endDateObj.getTime())) {
          throw ApiError.badRequest('Invalid endDate format. Expected YYYY-MM-DD');
        }
        where.startTime.lte = endDateObj;
      }
    }

    return where;
  }

  /**
   * Calculates high-level summary metrics (active, idle, total duration, session count).
   */
  static async getSummary(
    user: { id: string; role: string },
    params: ActivityFilterParams
  ) {
    const where = await ActivityService.buildWhereClause(user, params);

    const sessions = await prisma.session.findMany({
      where,
      select: {
        durationSeconds: true,
        isIdle: true,
      },
    });

    let activeSeconds = 0;
    let idleSeconds = 0;

    for (const s of sessions) {
      if (s.isIdle) {
        idleSeconds += s.durationSeconds;
      } else {
        activeSeconds += s.durationSeconds;
      }
    }

    return {
      activeSeconds,
      idleSeconds,
      totalTrackedSeconds: activeSeconds + idleSeconds,
      sessionCount: sessions.length,
    };
  }

  /**
   * Aggregates application-level time usage.
   */
  static async getApplicationUsage(
    user: { id: string; role: string },
    params: ActivityFilterParams
  ) {
    const where = await ActivityService.buildWhereClause(user, params);

    const sessions = await prisma.session.findMany({
      where,
      select: {
        appName: true,
        durationSeconds: true,
        isIdle: true,
      },
    });

    const appMap: Record<string, { appName: string; activeSeconds: number; idleSeconds: number; sessionCount: number }> = {};

    for (const s of sessions) {
      if (!appMap[s.appName]) {
        appMap[s.appName] = {
          appName: s.appName,
          activeSeconds: 0,
          idleSeconds: 0,
          sessionCount: 0,
        };
      }
      appMap[s.appName].sessionCount += 1;
      if (s.isIdle) {
        appMap[s.appName].idleSeconds += s.durationSeconds;
      } else {
        appMap[s.appName].activeSeconds += s.durationSeconds;
      }
    }

    const result = Object.values(appMap).sort((a, b) => b.activeSeconds - a.activeSeconds);
    return result;
  }

  /**
   * Aggregates daily activity trends.
   */
  static async getDailyTrend(
    user: { id: string; role: string },
    params: ActivityFilterParams
  ) {
    const where = await ActivityService.buildWhereClause(user, params);

    const sessions = await prisma.session.findMany({
      where,
      select: {
        startTime: true,
        durationSeconds: true,
        isIdle: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    const dailyMap: Record<string, { date: string; activeSeconds: number; idleSeconds: number; totalTrackedSeconds: number }> = {};

    for (const s of sessions) {
      const dateStr = s.startTime.toISOString().split('T')[0];
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = {
          date: dateStr,
          activeSeconds: 0,
          idleSeconds: 0,
          totalTrackedSeconds: 0,
        };
      }
      if (s.isIdle) {
        dailyMap[dateStr].idleSeconds += s.durationSeconds;
      } else {
        dailyMap[dateStr].activeSeconds += s.durationSeconds;
      }
      dailyMap[dateStr].totalTrackedSeconds += s.durationSeconds;
    }

    return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Paginated retrieval of detailed activity session records.
   */
  static async getSessions(
    user: { id: string; role: string },
    params: ActivityFilterParams
  ) {
    const where = await ActivityService.buildWhereClause(user, params);

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const skip = (page - 1) * limit;

    const [total, sessions] = await prisma.$transaction([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'desc' },
        include: {
          device: {
            select: {
              id: true,
              hostname: true,
              osType: true,
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Generates CSV report string for filtered sessions.
   */
  static async exportCsv(
    user: { id: string; role: string },
    params: ActivityFilterParams
  ): Promise<string> {
    const where = await ActivityService.buildWhereClause(user, params);

    const sessions = await prisma.session.findMany({
      where,
      take: 10000,
      orderBy: { startTime: 'desc' },
      include: {
        device: { select: { hostname: true, osType: true } },
        user: { select: { fullName: true, email: true } },
      },
    });

    const headers = ['Employee', 'Email', 'Date', 'Device', 'Application', 'Window Title', 'Start Time', 'End Time', 'Duration (Seconds)', 'Type'];
    const rows = [headers.join(',')];

    for (const s of sessions) {
      const dateStr = s.startTime.toISOString().split('T')[0];
      const employeeName = `"${(s.user?.fullName || '').replace(/"/g, '""')}"`;
      const email = `"${(s.user?.email || '').replace(/"/g, '""')}"`;
      const deviceStr = `"${(s.device?.hostname || s.deviceId).replace(/"/g, '""')}"`;
      const appName = `"${s.appName.replace(/"/g, '""')}"`;
      const windowTitle = `"${(s.windowTitle || '').replace(/"/g, '""')}"`;
      const startTime = s.startTime.toISOString();
      const endTime = s.endTime.toISOString();
      const type = s.isIdle ? 'Idle' : 'Active';

      rows.push([employeeName, email, dateStr, deviceStr, appName, windowTitle, startTime, endTime, s.durationSeconds, type].join(','));
    }

    return rows.join('\n');
  }
}

export interface ActivityFilterParams {
  employeeId?: string;
  deviceId?: string;
  startDate?: string;
  endDate?: string;
  appName?: string;
  isIdle?: boolean;
  page?: number;
  limit?: number;
}
