import { Router } from 'express';
import {
  EmployeeController,
  updateSelfServiceSchema,
  updateAdminSchema,
  addSkillSchema,
  createWorkUpdateSchema,
} from '../../controllers/employee.controller.js';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { requireUserAuth, requireRoles } from '../../middleware/auth.middleware.js';

const router = Router();

// Employee Directory & Profiles
router.get('/', requireUserAuth, EmployeeController.listEmployees);
router.get('/:id', requireUserAuth, EmployeeController.getEmployeeById);

// Profile Updates
router.patch('/:id', requireUserAuth, validateRequest(updateSelfServiceSchema), EmployeeController.updateSelfServiceProfile);
router.patch(
  '/:id/admin',
  requireUserAuth,
  requireRoles(['ADMIN', 'SUPER_ADMIN']),
  validateRequest(updateAdminSchema),
  EmployeeController.updateAdminProfile
);

// Skills Management
router.post('/:id/skills', requireUserAuth, validateRequest(addSkillSchema), EmployeeController.addSkill);
router.delete('/:id/skills/:skillId', requireUserAuth, EmployeeController.removeSkill);

// Work Updates
router.post('/:id/updates', requireUserAuth, validateRequest(createWorkUpdateSchema), EmployeeController.createWorkUpdate);
router.delete('/:id/updates/:updateId', requireUserAuth, EmployeeController.deleteWorkUpdate);

export default router;
