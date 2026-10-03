import { z } from 'zod';
import { TargetAssigneeType, TargetPeriod } from './enums.js';

export const MetricKey = {
  CALLS_TOTAL: 'calls_total',
  CALLS_CONNECTED: 'calls_connected',
  LEADS_CREATED: 'leads_created',
  LEADS_QUALIFIED: 'leads_qualified',
  MEETINGS_SCHEDULED: 'meetings_scheduled',
  CLOSINGS: 'closings',
  REVENUE_WON: 'revenue_won',
  EMAILS_SENT: 'emails_sent',
  TASKS_COMPLETED: 'tasks_completed',
  ACTIVE_HOURS: 'active_hours',
} as const;

export type MetricKeyValue = (typeof MetricKey)[keyof typeof MetricKey];

export const CreateTargetSchema = z.object({
  assigneeType: z.enum([
    TargetAssigneeType.EMPLOYEE,
    TargetAssigneeType.TEAM,
    TargetAssigneeType.ROLE,
  ]),
  assigneeId: z.string().uuid(),
  metricKey: z.enum([
    MetricKey.CALLS_TOTAL,
    MetricKey.CALLS_CONNECTED,
    MetricKey.LEADS_CREATED,
    MetricKey.LEADS_QUALIFIED,
    MetricKey.MEETINGS_SCHEDULED,
    MetricKey.CLOSINGS,
    MetricKey.REVENUE_WON,
    MetricKey.EMAILS_SENT,
    MetricKey.TASKS_COMPLETED,
    MetricKey.ACTIVE_HOURS,
  ]),
  period: z.enum([
    TargetPeriod.DAILY,
    TargetPeriod.WEEKLY,
    TargetPeriod.MONTHLY,
  ]),
  value: z.number().positive(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional().default([]),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CreateTargetDto = z.infer<typeof CreateTargetSchema>;

export const UpdateTargetSchema = z.object({
  value: z.number().positive().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});
export type UpdateTargetDto = z.infer<typeof UpdateTargetSchema>;

export const RecordMetricEventSchema = z.object({
  employeeId: z.string().uuid(),
  metricKey: z.string(),
  amount: z.number().default(1),
  occurredAt: z.string().datetime().optional(),
  periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  refType: z.string(),
  refId: z.string().uuid(),
});
export type RecordMetricEventDto = z.infer<typeof RecordMetricEventSchema>;
