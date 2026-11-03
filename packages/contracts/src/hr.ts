import { z } from 'zod';
import { LeaveAccrual, EmploymentType, ChecklistKind, AnnouncementAudience } from './enums.js';

// 15-hr-spec.md

// ---- Leave types and balances (FR-HR-01, 02)
export const CreateLeaveTypeSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, 'code must be upper snake case'),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6B46C1'),
  paid: z.boolean().default(true),
  annualAllowanceDays: z.number().nonnegative().default(0),
  accrual: z.enum([LeaveAccrual.UPFRONT, LeaveAccrual.MONTHLY]).default(LeaveAccrual.UPFRONT),
  carryOverMaxDays: z.number().nonnegative().default(0),
  requiresApproval: z.boolean().default(true),
  allowHalfDay: z.boolean().default(true),
  isActive: z.boolean().default(true),
  position: z.number().int().nonnegative().optional(),
});
export type CreateLeaveTypeDto = z.infer<typeof CreateLeaveTypeSchema>;
export const UpdateLeaveTypeSchema = CreateLeaveTypeSchema.partial();
export type UpdateLeaveTypeDto = z.infer<typeof UpdateLeaveTypeSchema>;

export const AdjustLeaveBalanceSchema = z.object({
  employeeId: z.string().guid(),
  leaveTypeId: z.string().guid(),
  year: z.number().int().min(2000).max(2100),
  days: z.number(), // positive adds, negative removes
  reason: z.string().min(1).max(500),
});
export type AdjustLeaveBalanceDto = z.infer<typeof AdjustLeaveBalanceSchema>;

export const LeaveBalanceQuerySchema = z.object({
  employeeId: z.string().guid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type LeaveBalanceQueryDto = z.infer<typeof LeaveBalanceQuerySchema>;

// ---- Leave requests (FR-HR-03), replaces RequestLeaveSchema for new clients
export const CreateLeaveRequestSchema = z.object({
  employeeId: z.string().guid().optional(), // managers may file for staff in scope
  leaveTypeId: z.string().guid(),
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  halfDay: z.boolean().default(false),
  reason: z.string().min(1).max(1000),
});
export type CreateLeaveRequestDto = z.infer<typeof CreateLeaveRequestSchema>;

export const LeaveRequestQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  employeeId: z.string().guid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type LeaveRequestQueryDto = z.infer<typeof LeaveRequestQuerySchema>;

export const LeaveCalendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  departmentId: z.string().guid().optional(),
  teamId: z.string().guid().optional(),
});
export type LeaveCalendarQueryDto = z.infer<typeof LeaveCalendarQuerySchema>;

// ---- Holidays (FR-HR-05)
export const UpdateHolidaySchema = z.object({
  date: z.string().date().optional(),
  name: z.string().min(1).optional(),
  isOptional: z.boolean().optional(),
});
export type UpdateHolidayDto = z.infer<typeof UpdateHolidaySchema>;
export const ImportHolidaysSchema = z.object({
  holidays: z.array(z.object({ date: z.string().date(), name: z.string().min(1), isOptional: z.boolean().default(false) })).min(1).max(100),
});
export type ImportHolidaysDto = z.infer<typeof ImportHolidaysSchema>;

// ---- Schedule assignment (FR-HR-06)
export const UpdateScheduleAssignmentSchema = z.object({
  scheduleId: z.string().guid().optional(),
  effectiveFrom: z.string().date().optional(),
  effectiveTo: z.string().date().nullable().optional(),
});
export type UpdateScheduleAssignmentDto = z.infer<typeof UpdateScheduleAssignmentSchema>;

export const AttendanceSheetQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  departmentId: z.string().guid().optional(),
  teamId: z.string().guid().optional(),
  employeeId: z.string().guid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type AttendanceSheetQueryDto = z.infer<typeof AttendanceSheetQuerySchema>;

// ---- Profiles and documents (FR-HR-10, 11)
export const UpdateProfileSchema = z.object({
  dateOfBirth: z.string().date().nullable().optional(),
  gender: z.string().max(30).nullable().optional(),
  nationality: z.string().max(60).nullable().optional(),
  personalEmail: z.string().email().nullable().optional(),
  address: z
    .object({ line1: z.string().optional(), line2: z.string().optional(), city: z.string().optional(), state: z.string().optional(), postalCode: z.string().optional(), country: z.string().optional() })
    .optional(),
  emergencyContact: z.object({ name: z.string().optional(), relation: z.string().optional(), phone: z.string().optional() }).optional(),
  designation: z.string().max(100).nullable().optional(),
  employmentType: z.enum([EmploymentType.FULL_TIME, EmploymentType.PART_TIME, EmploymentType.CONTRACT, EmploymentType.INTERN]).nullable().optional(),
  workLocation: z.string().max(100).nullable().optional(),
  probationEnd: z.string().date().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

export const CreateHrDocumentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  issuedAt: z.string().date().optional(),
  expiresAt: z.string().date().optional(),
  note: z.string().max(1000).optional(),
  objectKey: z.string().max(500).optional(),
});
export type CreateHrDocumentDto = z.infer<typeof CreateHrDocumentSchema>;
export const UpdateHrDocumentSchema = CreateHrDocumentSchema.partial();
export type UpdateHrDocumentDto = z.infer<typeof UpdateHrDocumentSchema>;

// ---- Checklists (FR-HR-12)
export const ChecklistTemplateItemSchema = z.object({
  title: z.string().min(1).max(200),
  ownerRole: z.enum(['hr', 'manager', 'it', 'employee']).default('hr'),
  offsetDays: z.number().int().min(-60).max(365).default(0),
});
export const CreateChecklistTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum([ChecklistKind.ONBOARDING, ChecklistKind.OFFBOARDING]),
  items: z.array(ChecklistTemplateItemSchema).min(1).max(100),
  isDefault: z.boolean().default(false),
});
export type CreateChecklistTemplateDto = z.infer<typeof CreateChecklistTemplateSchema>;
export const UpdateChecklistTemplateSchema = CreateChecklistTemplateSchema.partial();
export type UpdateChecklistTemplateDto = z.infer<typeof UpdateChecklistTemplateSchema>;

export const StartChecklistSchema = z.object({
  employeeId: z.string().guid(),
  templateId: z.string().guid().optional(), // default template of the kind when omitted
  kind: z.enum([ChecklistKind.ONBOARDING, ChecklistKind.OFFBOARDING]),
  anchorDate: z.string().date().optional(), // join date or last day; defaults to today
});
export type StartChecklistDto = z.infer<typeof StartChecklistSchema>;

export const UpdateChecklistItemStateSchema = z.object({ done: z.boolean() });
export type UpdateChecklistItemStateDto = z.infer<typeof UpdateChecklistItemStateSchema>;

// ---- Announcements (FR-HR-13)
export const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  audienceType: z.enum([AnnouncementAudience.COMPANY, AnnouncementAudience.DEPARTMENT, AnnouncementAudience.TEAM, AnnouncementAudience.ROLE]).default(AnnouncementAudience.COMPANY),
  audienceId: z.string().guid().optional(),
  pinned: z.boolean().default(false),
  publishedAt: z.string().datetime().optional(), // omit = now
});
export type CreateAnnouncementDto = z.infer<typeof CreateAnnouncementSchema>;
export const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial();
export type UpdateAnnouncementDto = z.infer<typeof UpdateAnnouncementSchema>;
