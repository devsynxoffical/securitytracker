import { z } from 'zod';

export const CreateScheduleSchema = z.object({
  name: z.string().min(1),
  workdays: z.array(z.number().int().min(1).max(7)).min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  crossesMidnight: z.boolean().default(false),
  graceMinutes: z.number().int().nonnegative().default(10),
  halfDayPercent: z.number().int().min(1).max(100).default(50),
});
export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;

export const UpdateScheduleSchema = CreateScheduleSchema.partial();
export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;

export const AssignScheduleSchema = z.object({
  employeeId: z.string().guid(),
  scheduleId: z.string().guid(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional(),
});
export type AssignScheduleDto = z.infer<typeof AssignScheduleSchema>;

export const CreateHolidaySchema = z.object({
  date: z.string().date(),
  name: z.string().min(1),
});
export type CreateHolidayDto = z.infer<typeof CreateHolidaySchema>;

export const RequestCorrectionSchema = z.object({
  date: z.string().date(),
  type: z.enum(['missed_start', 'missed_end', 'wrong_break', 'system_issue']),
  requestedStart: z.string().datetime().optional(),
  requestedEnd: z.string().datetime().optional(),
  reason: z.string().min(1),
});
export type RequestCorrectionDto = z.infer<typeof RequestCorrectionSchema>;

export const DecideCorrectionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});
export type DecideCorrectionDto = z.infer<typeof DecideCorrectionSchema>;

export const RequestLeaveSchema = z.object({
  type: z.enum(['annual', 'sick', 'unpaid', 'other']),
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  reason: z.string().min(1),
});
export type RequestLeaveDto = z.infer<typeof RequestLeaveSchema>;

export const DecideLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected', 'cancelled']),
  comment: z.string().optional(),
});
export type DecideLeaveDto = z.infer<typeof DecideLeaveSchema>;

/**
 * Company shift policy (03 F3, F5; 06 section 7 settings). Stored in companies.settings and
 * delivered to the desktop app on /me as `shiftPolicy`.
 */
export const ShiftPolicySchema = z.object({
  autoStartShiftOnLogin: z.boolean().default(false),
  autoStartWindowMinutesBefore: z.number().int().min(0).max(180).default(30),
  autoEndShiftOnShutdown: z.boolean().default(false),
  countEarlyStart: z.boolean().default(true),
  endReminderMinutes: z.number().int().min(0).max(240).default(15),
  startReminderEnabled: z.boolean().default(true),
  breakReminderAtAllowance: z.boolean().default(true),
  minShiftMinutes: z.number().int().min(0).max(60).default(5),
  longIdlePrompt: z.boolean().default(true),
});
export type ShiftPolicyDto = z.infer<typeof ShiftPolicySchema>;
export const SHIFT_POLICY_DEFAULTS: ShiftPolicyDto = ShiftPolicySchema.parse({});

/** Reads the shift policy out of a company settings json, falling back to defaults per key. */
export function shiftPolicyFrom(settings: unknown): ShiftPolicyDto {
  const src = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...SHIFT_POLICY_DEFAULTS };
  for (const key of Object.keys(ShiftPolicySchema.shape) as Array<keyof ShiftPolicyDto>) {
    const parsed = ShiftPolicySchema.shape[key].safeParse(src[key]);
    if (src[key] !== undefined && parsed.success) out[key] = parsed.data;
  }
  return out as ShiftPolicyDto;
}

/** /me payload: the effective policy plus the tracking thresholds the desktop needs alongside it. */
export const MeShiftPolicySchema = ShiftPolicySchema.extend({
  breakAllowanceMinutes: z.number().int().nonnegative(),
  idleThresholdSeconds: z.number().int().positive(),
  longIdleThresholdSeconds: z.number().int().positive(),
});
export type MeShiftPolicyDto = z.infer<typeof MeShiftPolicySchema>;

/** /me payload: the employee's effective schedule resolved for today in the company timezone. */
export const MeScheduleSchema = z.object({
  scheduleId: z.string().guid(),
  name: z.string(),
  timezone: z.string(),
  workdays: z.array(z.number().int().min(1).max(7)),
  startTime: z.string(),
  endTime: z.string(),
  graceMinutes: z.number().int().nonnegative(),
  today: z.object({
    date: z.string().date(),
    isWorkday: z.boolean(),
    isHoliday: z.boolean(),
    onLeave: z.boolean(),
    scheduledStartAt: z.string().datetime().nullable(),
    scheduledEndAt: z.string().datetime().nullable(),
  }),
  next: z
    .object({ date: z.string().date(), scheduledStartAt: z.string().datetime(), scheduledEndAt: z.string().datetime() })
    .nullable(),
});
export type MeScheduleDto = z.infer<typeof MeScheduleSchema>;
