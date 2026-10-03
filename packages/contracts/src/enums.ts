export const EmployeeStatus = {
  INVITED: 'invited',
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;
export type EmployeeStatusType = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

export const DeviceStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVOKED: 'revoked',
} as const;
export type DeviceStatusType = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export const ShiftState = {
  OFF_SHIFT: 'OFF_SHIFT',
  WORKING: 'WORKING',
  ON_BREAK: 'ON_BREAK',
  ENDED: 'ENDED',
} as const;
export type ShiftStateType = (typeof ShiftState)[keyof typeof ShiftState];

export const ShiftEndReason = {
  MANUAL: 'manual',
  AUTO_CLOSED: 'auto_closed',
  RECOVERED: 'recovered',
  ADMIN: 'admin',
} as const;
export type ShiftEndReasonType = (typeof ShiftEndReason)[keyof typeof ShiftEndReason];

export const ShiftEventType = {
  START: 'start',
  BREAK_START: 'break_start',
  BREAK_END: 'break_end',
  END: 'end',
} as const;
export type ShiftEventTypeValue = (typeof ShiftEventType)[keyof typeof ShiftEventType];

export const AttendanceStatus = {
  PRESENT: 'present',
  LATE: 'late',
  HALF_DAY: 'half_day',
  ABSENT: 'absent',
  ON_LEAVE: 'on_leave',
  WEEKLY_OFF: 'weekly_off',
  HOLIDAY: 'holiday',
} as const;
export type AttendanceStatusType = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const SegmentKind = {
  ACTIVE: 'active',
  IDLE: 'idle',
  LOCKED: 'locked',
} as const;
export type SegmentKindType = (typeof SegmentKind)[keyof typeof SegmentKind];

export const ActivityException = {
  NONE: 'none',
  CALL_APP: 'call_app',
  MEETING_APP: 'meeting_app',
  MIC: 'mic',
} as const;
export type ActivityExceptionType = (typeof ActivityException)[keyof typeof ActivityException];

export const SegmentClaim = {
  NONE: 'none',
  BREAK: 'break',
  AWAY_WORK: 'away_work',
} as const;
export type SegmentClaimType = (typeof SegmentClaim)[keyof typeof SegmentClaim];

export const ProductivityCategory = {
  PRODUCTIVE: 'productive',
  NEUTRAL: 'neutral',
  UNPRODUCTIVE: 'unproductive',
} as const;
export type ProductivityCategoryType = (typeof ProductivityCategory)[keyof typeof ProductivityCategory];

export const StageType = {
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
} as const;
export type StageTypeValue = (typeof StageType)[keyof typeof StageType];

export const CallDirection = {
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
} as const;
export type CallDirectionType = (typeof CallDirection)[keyof typeof CallDirection];

export const CallOutcome = {
  CONNECTED: 'Connected',
  NO_ANSWER: 'No answer',
  BUSY: 'Busy',
  VOICEMAIL: 'Voicemail',
  WRONG_NUMBER: 'Wrong number',
  DO_NOT_CALL: 'Do not call',
} as const;
export type CallOutcomeType = (typeof CallOutcome)[keyof typeof CallOutcome];

export const TaskPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;
export type TaskPriorityType = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;
export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TargetPeriod = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
} as const;
export type TargetPeriodType = (typeof TargetPeriod)[keyof typeof TargetPeriod];

export const TargetAssigneeType = {
  EMPLOYEE: 'employee',
  TEAM: 'team',
  ROLE: 'role',
} as const;
export type TargetAssigneeTypeValue = (typeof TargetAssigneeType)[keyof typeof TargetAssigneeType];

export const MailboxPermission = {
  READ: 'read',
  SEND: 'send',
  REPLY: 'reply',
  DRAFT: 'draft',
  ATTACH: 'attach',
  DOWNLOAD: 'download',
  ARCHIVE: 'archive',
  MARK_READ: 'mark_read',
} as const;
export type MailboxPermissionType = (typeof MailboxPermission)[keyof typeof MailboxPermission];
