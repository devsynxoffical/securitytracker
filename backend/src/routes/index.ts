import { Router, Request, Response } from 'express';
import healthRoutes from './health.routes.js';
import readyRoutes from './ready.routes.js';
import v1Routes from './v1.routes.js';

const router = Router();

// Root Welcome Endpoint
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'DEVSYNX Activity Tracker API',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: '/health',
      ready: '/ready',
      apiV1: '/api/v1',
    },
  });
});

// System Diagnostics & Process Monitoring
router.use('/', healthRoutes);
router.use('/', readyRoutes);

// Versioned Business REST API Namespace
router.use('/api/v1', v1Routes);

export default router;
