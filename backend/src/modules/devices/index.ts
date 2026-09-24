import { Router } from 'express';
import {
  DeviceController,
  registerDeviceSchema,
  updateDeviceSchema,
} from '../../controllers/device.controller.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { requireUserAuth, requireRoles, requireDeviceAuth } from '../../middleware/auth.middleware.js';

const router = Router();

// Device Authentication Test / Connectivity Verification Endpoint (Agent-Facing)
router.get('/ping', requireDeviceAuth, DeviceController.pingDevice);

// Device Listing & Details
router.get('/', requireUserAuth, DeviceController.listDevices);
router.get('/:id', requireUserAuth, DeviceController.getDeviceById);

// Administrative Device Management
router.post(
  '/',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  validateRequest(registerDeviceSchema),
  DeviceController.registerDevice
);

router.patch(
  '/:id',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  validateRequest(updateDeviceSchema),
  DeviceController.updateDevice
);

router.post(
  '/:id/disable',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  DeviceController.disableDevice
);

router.post(
  '/:id/enable',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  DeviceController.enableDevice
);

router.post(
  '/:id/revoke',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  DeviceController.revokeDevice
);

router.post(
  '/:id/rotate-credential',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  DeviceController.rotateCredential
);

export default router;
