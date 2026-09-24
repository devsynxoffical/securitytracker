import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { z } from 'zod';

export const googleLoginSchema = {
  body: z.object({
    idToken: z.string().min(1, 'Google ID Token is required'),
  }),
};

export class AuthController {
  static async googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.authenticateGoogleUser(req.body);
      res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.resolveUserContext(req.user!.id);
      res.status(200).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
