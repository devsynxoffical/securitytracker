import { Request, Response, NextFunction } from 'express';
import { DeviceService } from '../services/device.service.js';
import { z } from 'zod';

export const registerDeviceSchema = {
  body: z.object({
    userId: z.string().uuid('Valid employee UUID is required'),
    hostname: z.string().min(1, 'Hostname is required').max(255),
    osType: z.enum(['WINDOWS', 'MACOS'], {
      invalid_type_error: 'Operating system must be WINDOWS or MACOS',
    }),
    osVersion: z.string().optional(),
  }),
};

export const updateDeviceSchema = {
  body: z.object({
    userId: z.string().uuid().optional(),
    hostname: z.string().min(1).max(255).optional(),
    osType: z.enum(['WINDOWS', 'MACOS']).optional(),
    osVersion: z.string().optional(),
  }),
};

export class DeviceController {
  static async listDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string;
      const status = req.query.status as string;
      const userId = req.query.userId as string;

      const devices = await DeviceService.listDevices(req.user!, { search, status, userId });
      res.status(200).json({ status: 'success', data: devices });
    } catch (error) {
      next(error);
    }
  }

  static async getDeviceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const device = await DeviceService.getDeviceById(req.params.id, req.user!);
      res.status(200).json({ status: 'success', data: device });
    } catch (error) {
      next(error);
    }
  }

  static async registerDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await DeviceService.registerDevice(req.user!, req.body);
      res.status(201).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async updateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await DeviceService.updateDevice(req.params.id, req.user!, req.body);
      res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async disableDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await DeviceService.disableDevice(req.params.id, req.user!);
      res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async enableDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await DeviceService.enableDevice(req.params.id, req.user!);
      res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async revokeDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await DeviceService.revokeDevice(req.params.id, req.user!);
      res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async rotateCredential(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await DeviceService.rotateCredential(req.params.id, req.user!);
      res.status(200).json({ status: 'success', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async pingDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        status: 'success',
        data: {
          deviceId: req.authenticatedDevice!.id,
          hostname: req.authenticatedDevice!.hostname,
          employeeId: req.authenticatedEmployee!.id,
          employeeEmail: req.authenticatedEmployee!.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
