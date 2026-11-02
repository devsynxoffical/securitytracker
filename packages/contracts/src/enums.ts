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

export const CrmEntityType = {
  LEAD: 'lead',
  CONTACT: 'contact',
  ACCOUNT: 'account',
  DEAL: 'deal',
} as const;
export type CrmEntityTypeValue = (typeof CrmEntityType)[keyof typeof CrmEntityType];

export const PipelineEntity = {
  LEAD: 'lead',
  DEAL: 'deal',
} as const;
export type PipelineEntityValue = (typeof PipelineEntity)[keyof typeof PipelineEntity];

export const Lifecycle = {
  LEAD: 'lead',
  PROSPECT: 'prospect',
  CUSTOMER: 'customer',
  CHURNED: 'churned',
  PARTNER: 'partner',
} as const;
export type LifecycleValue = (typeof Lifecycle)[keyof typeof Lifecycle];

export const LeadPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
} as const;
export type LeadPriorityValue = (typeof LeadPriority)[keyof typeof LeadPriority];

export const CrmActivityType = {
  NOTE: 'note',
  CALL: 'call',
  EMAIL: 'email',
  MEETING: 'meeting',
  TASK: 'task',
  STAGE_CHANGED: 'stage_changed',
  ASSIGNED: 'assigned',
  FIELD_CHANGED: 'field_changed',
  CONVERTED: 'converted',
  CREATED: 'created',
  CREATED_FROM_LEAD: 'created_from_lead',
  IMPORTED: 'imported',
  TAG_ADDED: 'tag_added',
  TAG_REMOVED: 'tag_removed',
} as const;
export type CrmActivityTypeValue = (typeof CrmActivityType)[keyof typeof CrmActivityType];

export const CrmActivityStatus = {
  PLANNED: 'planned',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;
export type CrmActivityStatusValue = (typeof CrmActivityStatus)[keyof typeof CrmActivityStatus];

export const CustomFieldType = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  MULTI_SELECT: 'multi_select',
  CHECKBOX: 'checkbox',
  URL: 'url',
  PHONE: 'phone',
  EMAIL: 'email',
} as const;
export type CustomFieldTypeValue = (typeof CustomFieldType)[keyof typeof CustomFieldType];

export const SavedViewVisibility = {
  PRIVATE: 'private',
  TEAM: 'team',
  COMPANY: 'company',
} as const;
export type SavedViewVisibilityValue = (typeof SavedViewVisibility)[keyof typeof SavedViewVisibility];

export const ImportJobStatus = {
  MAPPING: 'mapping',
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
} as const;
export type ImportJobStatusValue = (typeof ImportJobStatus)[keyof typeof ImportJobStatus];

export const ImportDuplicateMode = {
  SKIP: 'skip',
  UPDATE: 'update',
  CREATE: 'create',
} as const;
export type ImportDuplicateModeValue = (typeof ImportDuplicateMode)[keyof typeof ImportDuplicateMode];
