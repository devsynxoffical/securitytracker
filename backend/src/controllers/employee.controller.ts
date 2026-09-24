import { Request, Response, NextFunction } from 'express';
import { EmployeeService } from '../services/employee.service.js';
import { z } from 'zod';

export const updateSelfServiceSchema = {
  body: z.object({
    avatarUrl: z.string().url().optional().or(z.literal('')),
    bio: z.string().max(1000).optional(),
    responsibilities: z.string().max(2000).optional(),
    currentFocus: z.string().max(1000).optional(),
    workLinksJson: z.string().optional(),
  }),
};

export const updateAdminSchema = {
  body: z.object({
    employeeId: z.string().optional(),
    jobTitle: z.string().optional(),
    department: z.string().optional(),
    managerId: z.string().uuid().nullable().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'OFFBOARDED']).optional(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
    joiningDate: z.string().optional(),
  }),
};

export const addSkillSchema = {
  body: z.object({
    name: z.string().min(1).max(50),
    proficiency: z.enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT']).optional(),
  }),
};

export const createWorkUpdateSchema = {
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    projectId: z.string().uuid().optional(),
  }),
};

export interface RequestWithFile extends Request {
  file?: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  };
}

export class EmployeeController {
  static async listEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string;
      const department = req.query.department as string;
      const status = req.query.status as string;

      const employees = await EmployeeService.listEmployees({ search, department, status });
      res.status(200).json({ status: 'success', data: employees });
    } catch (error) {
      next(error);
    }
  }

  static async getEmployeeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employee = await EmployeeService.getEmployeeById(req.params.id, req.user!);
      res.status(200).json({ status: 'success', data: employee });
    } catch (error) {
      next(error);
    }
  }

  static async updateSelfServiceProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await EmployeeService.updateSelfServiceProfile(req.params.id, req.user!, req.body);
      res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async updateAdminProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await EmployeeService.updateAdminProfile(req.params.id, req.user!, req.body);
      res.status(200).json({ status: 'success', data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async addSkill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const skill = await EmployeeService.addSkill(
        req.params.id,
        req.user!,
        req.body.name,
        req.body.proficiency
      );
      res.status(201).json({ status: 'success', data: skill });
    } catch (error) {
      next(error);
    }
  }

  static async removeSkill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await EmployeeService.removeSkill(req.params.id, req.user!, req.params.skillId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async createWorkUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fileReq = req as RequestWithFile;
      let attachment;
      if (fileReq.file) {
        attachment = {
          originalName: fileReq.file.originalname,
          mimeType: fileReq.file.mimetype,
          buffer: fileReq.file.buffer,
        };
      }

      const update = await EmployeeService.createWorkUpdate(req.params.id, req.user!, {
        ...req.body,
        attachment,
      });

      res.status(201).json({ status: 'success', data: update });
    } catch (error) {
      next(error);
    }
  }

  static async deleteWorkUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await EmployeeService.deleteWorkUpdate(req.params.updateId, req.user!);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
