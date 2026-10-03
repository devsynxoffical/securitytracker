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
  employeeId: z.string().uuid(),
  scheduleId: z.string().uuid(),
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
