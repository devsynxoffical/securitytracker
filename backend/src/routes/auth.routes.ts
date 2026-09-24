import { Router } from 'express';
import { AuthController, googleLoginSchema } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validate.middleware.js';
import { requireUserAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Public Google OAuth Exchange Endpoint
router.post('/google', validateRequest(googleLoginSchema), AuthController.googleLogin);

// Protected Auth Profile & Logout Endpoints
router.get('/me', requireUserAuth, AuthController.getMe);
router.post('/logout', requireUserAuth, AuthController.logout);

export default router;
