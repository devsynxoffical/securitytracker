import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Liveness Check: Confirms that the Node.js Express API process is responsive.
 * Used by load balancers and orchestrators to check process liveness.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
