import { Router } from 'express';
import { requireDeviceAuth, requireUserAuth } from '../../middleware/auth.middleware.js';
import { telemetryRateLimiter } from '../../middleware/rate-limit.middleware.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { ActivityController, ingestBatchSchema } from '../../controllers/activity.controller.js';

const router = Router();

/**
 * Desktop Agent Telemetry Batch Ingestion Endpoint.
 * Authenticated via requireDeviceAuth (X-Device-Token & X-Device-ID matching database SHA-256 hash).
 * Performs payload validation, idempotency duplicate checking, and session storage.
 */
router.post(
  '/batches',
  telemetryRateLimiter,
  requireDeviceAuth,
  validateRequest(ingestBatchSchema),
  ActivityController.ingestBatch
);

/**
 * Activity Reporting & Analytics Endpoints (Dashboard Users).
 * Protected by requireUserAuth. Enforces server-side RBAC scoping (Admin, Manager, Employee).
 */
router.get('/summary', requireUserAuth, ActivityController.getSummary);
router.get('/applications', requireUserAuth, ActivityController.getApplications);
router.get('/daily', requireUserAuth, ActivityController.getDailyTrend);
router.get('/sessions', requireUserAuth, ActivityController.getSessions);
router.get('/export', requireUserAuth, ActivityController.exportCsv);
router.get('/', requireUserAuth, ActivityController.getSessions);

export default router;
