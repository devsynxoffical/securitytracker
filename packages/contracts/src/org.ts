import { z } from 'zod';
import { PermissionKeys, Scopes } from './permissions.js';

export const CreateEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  phone: z.string().optional(),
  roleId: z.string().guid().optional(),
  departmentId: z.string().guid().optional(),
  teamId: z.string().guid().optional(),
  managerId: z.string().guid().optional(),
  scheduleId: z.string().guid().optional(),
  joinDate: z.string().date().optional(),
});
export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().guid().optional(),
  departmentId: z.string().guid().nullable().optional(),
  teamId: z.string().guid().nullable().optional(),
  managerId: z.string().guid().nullable().optional(),
  joinDate: z.string().date().optional(),
});
export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>;

export const DisableEmployeeSchema = z.object({
  reassignmentMap: z.object({
    leadsOwnerId: z.string().guid().optional(),
    tasksAssigneeId: z.string().guid().optional(),
  }).optional(),
});
export type DisableEmployeeDto = z.infer<typeof DisableEmployeeSchema>;

/** FR-SEC-24: suspend access. The reason is stored on the audit entry and the revoked sessions. */
export const SuspendEmployeeSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type SuspendEmployeeDto = z.infer<typeof SuspendEmployeeSchema>;

export const CreateDepartmentSchema = z.object({
  name: z.string().min(1),
  managerId: z.string().guid().optional(),
});
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(1).optional(),
  managerId: z.string().guid().nullable().optional(),
});
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;

export const CreateTeamSchema = z.object({
  name: z.string().min(1),
  departmentId: z.string().guid(),
  leaderId: z.string().guid().optional(),
});
export type CreateTeamDto = z.infer<typeof CreateTeamSchema>;

export const UpdateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  departmentId: z.string().guid().optional(),
  leaderId: z.string().guid().nullable().optional(),
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
