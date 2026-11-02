import { z } from 'zod';
import { ProductivityCategory } from './enums.js';

// 16-tracking-admin-spec.md

export const TimesheetQuerySchema = z.object({
  employeeId: z.string().uuid().optional(), // defaults to caller
  from: z.string().date(),
  to: z.string().date(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type TimesheetQueryDto = z.infer<typeof TimesheetQuerySchema>;

export const TeamTimesheetQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type TeamTimesheetQueryDto = z.infer<typeof TeamTimesheetQuerySchema>;

export const TeamActivityQuerySchema = z.object({
  date: z.string().date(),
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
});
export type TeamActivityQueryDto = z.infer<typeof TeamActivityQuerySchema>;

export const UsageReportQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  employeeIds: z.string().optional(), // comma separated uuids
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  category: z.enum([ProductivityCategory.PRODUCTIVE, ProductivityCategory.NEUTRAL, ProductivityCategory.UNPRODUCTIVE]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type UsageReportQueryDto = z.infer<typeof UsageReportQuerySchema>;

export const UncategorisedQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  type: z.enum(['app', 'domain']).default('app'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type UncategorisedQueryDto = z.infer<typeof UncategorisedQuerySchema>;

export const CategoriseSchema = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(['app', 'domain']),
        pattern: z.string().min(1).max(200),
        category: z.enum([ProductivityCategory.PRODUCTIVE, ProductivityCategory.NEUTRAL, ProductivityCategory.UNPRODUCTIVE]),
        departmentId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type CategoriseDto = z.infer<typeof CategoriseSchema>;

export const UpdateProductivityRuleSchema = z.object({
  pattern: z.string().min(1).max(200).optional(),
  category: z.enum([ProductivityCategory.PRODUCTIVE, ProductivityCategory.NEUTRAL, ProductivityCategory.UNPRODUCTIVE]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});
export type UpdateProductivityRuleDto = z.infer<typeof UpdateProductivityRuleSchema>;

export const IdleReportQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  employeeId: z.string().uuid().optional(),
  minIdleSeconds: z.coerce.number().int().min(60).default(900),
});
export type IdleReportQueryDto = z.infer<typeof IdleReportQuerySchema>;

export const TamperQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  employeeId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TamperQueryDto = z.infer<typeof TamperQuerySchema>;

// ---- Manual time (FR-TRK-17, F27)
export const CreateManualTimeSchema = z.object({
  employeeId: z.string().uuid().optional(), // defaults to caller
  date: z.string().date(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  reason: z.string().min(3).max(500),
});
export type CreateManualTimeDto = z.infer<typeof CreateManualTimeSchema>;

export const DecideManualTimeSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().max(500).optional(),
});
export type DecideManualTimeDto = z.infer<typeof DecideManualTimeSchema>;

export const ManualTimeQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  employeeId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ManualTimeQueryDto = z.infer<typeof ManualTimeQuerySchema>;

// ---- Settings (FR-TRK-24), stored in company.settings
export const TrackingSettingsSchema = z.object({
  idleThresholdSeconds: z.number().int().min(60).max(3600).default(300),
  longIdleThresholdSeconds: z.number().int().min(300).max(14400).default(1800),
  captureWindowTitles: z.boolean().default(false),
  maxShiftHours: z.number().int().min(4).max(24).default(16),
  activityWarnPercent: z.number().int().min(0).max(100).default(50),
  activityAlertPercent: z.number().int().min(0).max(100).default(30),
});
export type TrackingSettingsDto = z.infer<typeof TrackingSettingsSchema>;
export const UpdateTrackingSettingsSchema = TrackingSettingsSchema.partial();
export type UpdateTrackingSettingsDto = z.infer<typeof UpdateTrackingSettingsSchema>;
