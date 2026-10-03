import { z } from 'zod';

export const NotificationType = {
  LEAD_ASSIGNED: 'lead_assigned',
  TASK_ASSIGNED: 'task_assigned',
  TASK_DUE_SOON: 'task_due_soon',
  TASK_OVERDUE: 'task_overdue',
  FOLLOWUP_DUE: 'followup_due',
  TARGET_80_PERCENT: 'target_80_percent',
  TARGET_REACHED: 'target_reached',
  NEW_EMAIL: 'new_email',
  DEVICE_PENDING: 'device_pending',
  CORRECTION_REQUESTED: 'correction_requested',
  CORRECTION_DECIDED: 'correction_decided',
  LEAVE_REQUESTED: 'leave_requested',
  LEAVE_DECIDED: 'leave_decided',
  SHIFT_AUTO_CLOSED: 'shift_auto_closed',
  SECURITY_ALERT: 'security_alert',
  ANNOUNCEMENT: 'announcement',
} as const;

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

export const CreateNotificationSchema = z.object({
  recipientId: z.string().uuid(),
  type: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional().default({}),
});
export type CreateNotificationDto = z.infer<typeof CreateNotificationSchema>;

export const MarkNotificationsReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
});
export type MarkNotificationsReadDto = z.infer<typeof MarkNotificationsReadSchema>;
