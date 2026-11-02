export interface Me {
  id: string;
  companyId: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: { id: string; name: string; rank: number; permissions: Array<{ key: string; scope: string }> };
  department?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null;
  consentRequired?: boolean;
  policyVersion?: number;
  mustChangePassword?: boolean;
  /** Optional: older servers do not send a schedule. null = no schedule assigned. */
  schedule?: Schedule | null;
  /** Optional: older servers do not send a policy; every policy-driven behaviour is then off. */
  shiftPolicy?: ShiftPolicy;
}

export interface ScheduleToday {
  date: string;
  isWorkday: boolean;
  isHoliday: boolean;
  onLeave: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

export interface Schedule {
  scheduleId: string;
  name: string;
  timezone: string;
  workdays: number[];
  startTime: string;
  endTime: string;
  graceMinutes: number;
  today: ScheduleToday;
  next: { date: string; scheduledStartAt: string; scheduledEndAt: string } | null;
}

export interface ShiftPolicy {
  autoStartShiftOnLogin: boolean;
  autoStartWindowMinutesBefore: number;
  autoEndShiftOnShutdown: boolean;
  countEarlyStart: boolean;
  endReminderMinutes: number;
  startReminderEnabled: boolean;
  breakReminderAtAllowance: boolean;
  minShiftMinutes: number;
  longIdlePrompt: boolean;
  breakAllowanceMinutes: number;
  idleThresholdSeconds: number;
  longIdleThresholdSeconds: number;
}

export interface ShiftClosure {
  startedAt: string | null;
  endedAt: string;
  reason: string;
  date: string | null;
}

export interface ReminderView {
  startBanner: boolean;
  endBanner: boolean;
  endModal: boolean;
  endSnoozes: number;
  breakBanner: boolean;
  scheduledEndAt: string | null;
  breakAllowanceMinutes: number;
}

/** Decided in the main process (AnchoredClock); the renderer only shows the confirm dialog. */
export interface StartContext {
  outsideSchedule: boolean;
  reason: 'not_workday' | 'holiday' | 'on_leave' | 'too_early' | 'after_end' | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

export type ShiftNotice = { kind: 'autoStarted'; at: string } | { kind: 'closedByServer'; closure: ShiftClosure } | { kind: 'reminder'; reminder: 'start' | 'end' | 'break' };

export interface ShiftSnapshot {
  state: 'OFF_SHIFT' | 'WORKING' | 'ON_BREAK';
  shiftId: string | null;
  startedAt: string | null;
  currentBreakType: string | null;
  breakStartedAt: string | null;
  durationSeconds: number;
  breakSeconds: number;
  activeSeconds: number;
  idleSeconds: number;
  pendingEvents: number;
  queuedSegments: number;
  lastSyncAt: string | null;
  online: boolean;
  anchored: boolean;
  /** All optional below: a main process built before the schedule feature omits them. */
  lastClosure?: ShiftClosure | null;
  reminder?: ReminderView | null;
  scheduleToday?: ScheduleToday | null;
  schedule?: Schedule | null;
  policy?: Pick<ShiftPolicy, 'autoStartShiftOnLogin' | 'autoStartWindowMinutesBefore' | 'autoEndShiftOnShutdown' | 'breakAllowanceMinutes'> | null;
  tracker: {
    source: 'agent' | 'dev' | 'none';
    connected: boolean;
    tracking: boolean;
    paused: boolean;
    queueSize: number;
    queuePercent: number;
    extensionConnected: boolean;
    currentApp: { processName: string; appName: string; domain: string | null } | null;
  } | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  statusId?: string | null;
  statusRef?: { id: string; name: string; colour: string; group: string } | null;
  priority: string;
  dueAt: string | null;
  startAt?: string | null;
  listId?: string | null;
  list?: { id: string; name: string; space?: { id: string; name: string; colour: string } } | null;
  assignees?: Array<{ employee: { id: string; firstName: string; lastName: string } }>;
  lead?: { id: string; name: string } | null;
  timeEstimateS?: number | null;
  timeSpentS?: number;
  completedAt?: string | null;
}

export interface TaskComment {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
  author?: { firstName: string; lastName: string } | null;
}

export interface Lead {
  id: string;
  name: string;
  companyName: string | null;
  value: string | number | null;
  currency: string;
  followUpAt: string | null;
  doNotCall: boolean;
  isClient: boolean;
  convertedAt?: string | null;
  priority?: string;
  stage: { id: string; name: string; type: string; position: number };
  pipeline?: { id: string; name: string; stages?: Stage[] };
  owner?: { id: string; firstName: string; lastName: string } | null;
  phones: Array<{ phoneE164: string; label: string; isPrimary: boolean }>;
  emails: Array<{ emailLower: string; label: string; isPrimary: boolean }>;
  notes?: Array<{ id: string; body: string; createdAt: string }>;
  callLogs?: Array<{ id: string; direction: string; outcome: string; durationSeconds: number; notes: string | null; occurredAt: string }>;
  appointments?: Array<{ id: string; title: string; startsAt: string; endsAt: string; status: string }>;
  timeline?: Array<{ id: string; type: string; data: Record<string, unknown>; occurredAt: string }>;
}

export interface Stage {
  id: string;
  name: string;
  type: 'open' | 'won' | 'lost';
  position: number;
}
export interface Pipeline {
  id: string;
  name: string;
  entity: 'lead' | 'deal';
  isDefault: boolean;
  stages: Stage[];
}

export interface Mailbox {
  id: string;
  address: string;
  displayName: string;
  tokenStatus: string;
  permissions?: string[];
}
export interface Conversation {
  id: string;
  subject: string;
  snippet: string | null;
  participants: Array<{ name?: string; email: string }> | unknown;
  lastMessageAt: string;
  unread: boolean;
  status: string;
  assigneeId: string | null;
  labels?: Array<{ label: { id: string; name: string; colour: string } }>;
}
export interface ThreadDetail {
  id: string;
  subject: string;
  messages: Array<{ id: string; fromAddr: string; toAddrs: string[]; sentAt: string; snippet: string | null; gmailMessageId: string }>;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  colour: string;
  paid: boolean;
  allowHalfDay: boolean;
  isActive: boolean;
}
export interface LeaveBalance {
  leaveTypeId: string;
  leaveType?: LeaveType;
  year: number;
  entitledDays: string | number;
  carriedOverDays: string | number;
  usedDays: string | number;
  pendingDays: string | number;
  adjustmentsDays: string | number;
  availableDays?: string | number;
}
export interface LeaveRequest {
  id: string;
  leaveTypeId: string | null;
  leaveType?: { name: string; colour: string } | null;
  type: string;
  dateFrom: string;
  dateTo: string;
  days: string | number;
  halfDay: boolean;
  reason: string;
  status: string;
  comment: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string;
  read?: boolean;
  readAt?: string | null;
}

export interface TargetProgress {
  targetId?: string;
  metricKey: string;
  period: string;
  value: number;
  targetValue: number;
  percent?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  dueAt: string | null;
  entityType: string;
  entityId: string;
  entityName?: string | null;
}

export interface TrackingSummary {
  trackedS?: number;
  activeS?: number;
  idleS?: number;
  productiveS?: number;
  neutralS?: number;
  unproductiveS?: number;
  days?: Array<{ date: string; trackedS: number; activeS: number; idleS: number; productiveS: number; neutralS: number; unproductiveS: number }>;
  [key: string]: unknown;
}

// ---- Internal chat (docs/22 section 5; shapes mirror packages/contracts chat.ts DTOs) ----------------

export type ChatChannelKind = 'company' | 'department' | 'team' | 'group' | 'direct';

export interface ChatAuthor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ChatMember {
  employeeId: string;
  firstName: string;
  lastName: string;
  status: string;
  joinedAt: string;
}

export interface ChatRecordRef {
  type: 'task' | 'lead' | 'deal' | 'contact' | 'mail';
  id: string;
}

export interface ChatRecordCard extends ChatRecordRef {
  title: string;
  status: string | null;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  author: ChatAuthor | null;
  /** Empty when deleted. */
  body: string;
  mentions: string[];
  recordRef: ChatRecordRef | null;
  recordCard: ChatRecordCard | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  /** Renderer only: optimistic send not yet confirmed / failed. */
  pending?: boolean;
  failed?: boolean;
}

export interface ChatChannel {
  id: string;
  kind: ChatChannelKind;
  name: string;
  departmentId: string | null;
  teamId: string | null;
  createdBy: string | null;
  archivedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  isMember: boolean;
  unreadCount: number;
  lastMessage: { id: string; authorId: string; body: string; createdAt: string } | null;
  members?: ChatMember[];
  counterpart: ChatAuthor | null;
}

export interface ChatUnread {
  total: number;
  channels: Array<{ channelId: string; unreadCount: number }>;
}

export interface ChatTypingPayload {
  channelId: string;
  employeeId: string;
  name: string;
  at: string;
}

export interface ChatReadPayload {
  channelId: string;
  employeeId: string;
  lastReadMessageId: string;
}

export interface ChatMessageDeletedPayload {
  channelId: string;
  id: string;
  deletedAt: string;
}

/** Directory row as GET /employees returns it (subset the chat picker needs). */
export interface DirectoryEmployee {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  status: string;
  department?: { id: string; name: string } | null;
  role?: { id: string; name: string } | null;
}
