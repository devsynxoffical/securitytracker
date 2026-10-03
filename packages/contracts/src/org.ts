import { z } from 'zod';
import { PermissionKeys, Scopes } from './permissions.js';

export const CreateEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  scheduleId: z.string().uuid().optional(),
  joinDate: z.string().date().optional(),
});
export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  joinDate: z.string().date().optional(),
});
export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>;

export const DisableEmployeeSchema = z.object({
  reassignmentMap: z.object({
    leadsOwnerId: z.string().uuid().optional(),
    tasksAssigneeId: z.string().uuid().optional(),
  }).optional(),
});
export type DisableEmployeeDto = z.infer<typeof DisableEmployeeSchema>;

export const CreateDepartmentSchema = z.object({
  name: z.string().min(1),
  managerId: z.string().uuid().optional(),
});
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  managerId: z.string().uuid().nullable().optional(),
});
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;

export const CreateTeamSchema = z.object({
  name: z.string().min(1),
  departmentId: z.string().uuid(),
  leaderId: z.string().uuid().optional(),
});
export type CreateTeamDto = z.infer<typeof CreateTeamSchema>;

export const UpdateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  departmentId: z.string().uuid().optional(),
  leaderId: z.string().uuid().nullable().optional(),
});
export type UpdateTeamDto = z.infer<typeof UpdateTeamSchema>;

export const UpdateRolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      key: z.enum(PermissionKeys),
      scope: z.enum(Scopes),
    }),
  ),
});
export type UpdateRolePermissionsDto = z.infer<typeof UpdateRolePermissionsSchema>;
