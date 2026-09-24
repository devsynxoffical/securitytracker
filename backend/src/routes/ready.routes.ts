import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';

const router = Router();

/**
 * Readiness Check: Confirms that the API process is alive AND the local SQLite database
 * connection is responsive via Prisma. Returns HTTP 503 if database connection fails.
 */
router.get('/ready', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', database: 'connected' });
  } catch (error) {
    next(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Database connection health check failed'));
  }
});

export default router;
