export const WebSocketEvents = {
  SESSION_REVOKED: 'session.revoked',
  CONFIG_UPDATED: 'config.updated',
  NOTIFICATION_NEW: 'notification.new',
  MAIL_NEW: 'mail.new',
  TARGET_PROGRESS: 'target.progress',
  LEAD_ASSIGNED: 'lead.assigned',
  TASK_UPDATED: 'task.updated',
  DEVICE_APPROVED: 'device.approved',
  LIVE_ATTENDANCE: 'live.attendance',
  UPDATE_AVAILABLE: 'update.available',
} as const;

export type WebSocketEventType = (typeof WebSocketEvents)[keyof typeof WebSocketEvents];

export interface SessionRevokedPayload {
  reason: string;
}

export interface ConfigUpdatedPayload {
  version: number;
}

export interface NotificationNewPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface MailNewPayload {
  mailboxId: string;
  threadId: string;
}

export interface TargetProgressPayload {
  targetId: string;
  employeeId: string;
  value: number;
  percentage: number;
}

export interface LeadAssignedPayload {
  leadId: string;
  assignedTo: string;
}

export interface TaskUpdatedPayload {
  taskId: string;
  status: string;
}

export interface DeviceApprovedPayload {
  deviceId: string;
}

export interface LiveAttendancePayload {
  employeeId: string;
  status: string;
  checkInAt?: string;
  activeSeconds: number;
}

export interface UpdateAvailablePayload {
  version: string;
  mandatory: boolean;
}
