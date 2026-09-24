import { Request, Response, NextFunction } from 'express';
import { ActivityService } from '../services/activity.service.js';
import { z } from 'zod';

const sampleSchema = z.object({
  appName: z.string().min(1, 'appName cannot be empty').max(255),
  windowTitle: z.string().max(512).optional(),
  startedAt: z.string().min(1, 'startedAt is required'),
  endedAt: z.string().min(1, 'endedAt is required'),
  durationSeconds: z.number().int().nonnegative().optional(),
  isIdle: z.boolean().optional(),
});

export const ingestBatchSchema = {
  body: z
    .object({
      batchId: z.string().min(1, 'batchId is required').max(128),
      samples: z.array(sampleSchema).min(1, 'Batch must contain at least 1 sample').max(100),
    })
    // Enforce privacy boundaries by rejecting unrecognized/prohibited keys
    .strict('Prohibited payload properties detected. Only standard telemetry fields allowed.'),
};

export class ActivityController {
  static async ingestBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authenticatedDevice = req.authenticatedDevice || req.device;

      if (!authenticatedDevice) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Device authentication required',
          },
        });
        return;
      }

      const result = await ActivityService.ingestBatch(authenticatedDevice, req.body);

      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  private static parseFilters(req: Request) {
    const { employeeId, userId, deviceId, startDate, endDate, appName, isIdle, page, limit } = req.query;
    let parsedIsIdle: boolean | undefined = undefined;
    if (isIdle === 'true' || isIdle === '1') parsedIsIdle = true;
    if (isIdle === 'false' || isIdle === '0') parsedIsIdle = false;

    return {
      employeeId: employeeId ? String(employeeId) : userId ? String(userId) : undefined,
      deviceId: deviceId ? String(deviceId) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      appName: appName ? String(appName) : undefined,
      isIdle: parsedIsIdle,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    };
  }

  static async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const filters = ActivityController.parseFilters(req);
      const summary = await ActivityService.getSummary(req.user, filters);
      res.status(200).json({ status: 'success', data: summary });
    } catch (error) {
      next(error);
    }
  }

  static async getApplications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const filters = ActivityController.parseFilters(req);
      const applications = await ActivityService.getApplicationUsage(req.user, filters);
      res.status(200).json({ status: 'success', data: applications });
    } catch (error) {
      next(error);
    }
  }

  static async getDailyTrend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const filters = ActivityController.parseFilters(req);
      const trend = await ActivityService.getDailyTrend(req.user, filters);
      res.status(200).json({ status: 'success', data: trend });
    } catch (error) {
      next(error);
    }
  }

  static async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const filters = ActivityController.parseFilters(req);
      const result = await ActivityService.getSessions(req.user, filters);
      res.status(200).json({
        status: 'success',
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  static async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
      }
      const filters = ActivityController.parseFilters(req);
      const csv = await ActivityService.exportCsv(req.user, filters);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="activity_report.csv"');
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}
