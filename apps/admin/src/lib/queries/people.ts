'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, type Page } from '../api';

// ---------------------------------------------------------------------------
// Types (subset of API responses used by the People module, 15-hr-spec.md)
// ---------------------------------------------------------------------------

export interface PersonRef {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  department?: { name: string } | null;
  team?: { name: string } | null;
}
export interface EmployeeRow {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  joinDate: string | null;
  lastLoginAt: string | null;
  role: { id: string; name: string; rank: number };
  department: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  manager: PersonRef | null;
}
export interface Department {
  id: string;
  name: string;
  managerId: string | null;
  manager?: PersonRef | null;
  _count?: { employees: number; teams: number };
}
export interface Team {
  id: string;
  name: string;
  departmentId: string;
  leaderId: string | null;
  leader?: PersonRef | null;
  department?: { id: string; name: string };
  _count?: { employees: number };
}
export interface Role {
  id: string;
  name: string;
  rank: number;
}
export interface Schedule {
  id: string;
  name: string;
  workdays: number[];
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  graceMinutes: number;
  halfDayPercent: number;
}
export interface ScheduleAssignment {
  id: string;
  scheduleId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  schedule: Pick<Schedule, 'id' | 'name' | 'startTime' | 'endTime' | 'workdays'>;
}
export interface Holiday {
  id: string;
  date: string;
  name: string;
  isOptional: boolean;
}
export interface LeaveType {
  id: string;
  name: string;
  code: string;
  colour: string;
  paid: boolean;
  annualAllowanceDays: string | number;
  accrual: 'upfront' | 'monthly';
  carryOverMaxDays: string | number;
  requiresApproval: boolean;
  allowHalfDay: boolean;
  isActive: boolean;
  position: number;
}
export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveType: { name: string; code: string; colour: string; paid: boolean };
  year: number;
  entitledDays: number;
  carriedOverDays: number;
  adjustmentsDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
}
export interface LeaveRequest {
  id: string;
  employeeId: string;
  employee?: PersonRef;
  leaveTypeId: string | null;
  leaveType?: { id: string; name: string; code: string; colour: string; paid: boolean } | null;
  type: string;
  dateFrom: string;
  dateTo: string;
  days: string | number;
  halfDay: boolean;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
}
export interface Correction {
  id: string;
  employeeId: string;
  employee: PersonRef | null;
  date: string;
  type: string;
  requestedStart: string | null;
  requestedEnd: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  createdAt: string;
}
export interface LiveRow {
  employeeId: string;
  code: string;
  name: string;
  department: string;
  team: string;
  liveStatus: string;
  checkInAt: string | null;
  activeSeconds: number;
  breakSeconds: number;
}
export interface SheetDay {
  status: string;
  workingSeconds: number;
  activeSeconds: number;
  flags: string[];
}
export interface Sheet {
  month: string;
  dates: string[];
  holidays: Array<{ date: string; name: string; isOptional: boolean }>;
  rows: Array<{
    employee: PersonRef;
    days: Record<string, SheetDay>;
    totals: { present: number; late: number; halfDay: number; absent: number; onLeave: number; holiday: number; weeklyOff: number; workingSeconds: number; activeSeconds: number };
  }>;
}
export interface Profile {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  joinDate: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  role: Role;
  department: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  manager: PersonRef | null;
  directReports: PersonRef[];
  profile: {
    employeeId: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    nationality?: string | null;
    personalEmail?: string | null;
    address: Record<string, string>;
    emergencyContact: Record<string, string>;
    designation?: string | null;
    employmentType?: string | null;
    workLocation?: string | null;
    probationEnd?: string | null;
    custom: Record<string, unknown>;
  };
  employeeSchedules: ScheduleAssignment[];
  devices: Array<{ id: string; name: string; status: string; osVersion: string; lastSeenAt: string | null }>;
  documents: HrDocument[];
  checklists: Checklist[];
}
export interface HrDocument {
  id: string;
  employeeId: string;
  name: string;
  type: string;
  issuedAt: string | null;
  expiresAt: string | null;
  note: string | null;
  objectKey: string | null;
  createdAt: string;
}
export interface ChecklistTemplateItem {
  title: string;
  ownerRole: 'hr' | 'manager' | 'it' | 'employee';
  offsetDays: number;
}
export interface ChecklistTemplate {
  id: string;
  name: string;
  kind: 'onboarding' | 'offboarding';
  items: ChecklistTemplateItem[];
  isDefault: boolean;
  _count?: { instances: number };
}
export interface ChecklistItem {
  id: string;
  title: string;
  ownerRole: 'hr' | 'manager' | 'it' | 'employee';
  dueAt: string;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
}
export interface Checklist {
  id: string;
  employeeId: string;
  employee?: PersonRef & { joinDate?: string | null };
  template?: { name: string } | null;
  kind: 'onboarding' | 'offboarding';
  status: 'open' | 'completed';
  items: ChecklistItem[];
  startedAt: string;
  completedAt: string | null;
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  audienceType: 'company' | 'department' | 'team' | 'role';
  audienceId: string | null;
  pinned: boolean;
  publishedAt: string;
  createdBy: string | null;
  readCount: number;
  readAt: string | null;
}
export interface OrgNode {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  managerId: string | null;
  role: { name: string };
  department: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  profile: { designation: string | null } | null;
  reports: OrgNode[];
}
export interface OrgChart {
  tree: OrgNode[];
  departments: Array<{ id: string; name: string; managerId: string | null; teams: Array<{ id: string; name: string; leaderId: string | null; _count: { employees: number } }>; _count: { employees: number } }>;
  total: number;
}

// ---------------------------------------------------------------------------
// Query keys and hooks
// ---------------------------------------------------------------------------

export const pk = {
  employees: (p?: Record<string, unknown>) => ['people', 'employees', p ?? {}] as const,
  profile: (id: string | null) => ['people', 'profile', id] as const,
  departments: ['people', 'departments'] as const,
  teams: ['people', 'teams'] as const,
  roles: ['people', 'roles'] as const,
  schedules: ['people', 'schedules'] as const,
  assignments: (id: string | null) => ['people', 'assignments', id] as const,
  holidays: (year?: number) => ['people', 'holidays', year ?? 'all'] as const,
  live: ['people', 'live'] as const,
  sheet: (p: Record<string, unknown>) => ['people', 'sheet', p] as const,
  corrections: (status?: string) => ['people', 'corrections', status ?? 'all'] as const,
  leaveTypes: (inactive: boolean) => ['people', 'leave-types', inactive] as const,
  balances: (p: Record<string, unknown>) => ['people', 'balances', p] as const,
  leaveRequests: (p: Record<string, unknown>) => ['people', 'leave-requests', p] as const,
  leaveCalendar: (p: Record<string, unknown>) => ['people', 'leave-calendar', p] as const,
  outToday: ['people', 'out-today'] as const,
  templates: ['people', 'checklist-templates'] as const,
  checklists: (p: Record<string, unknown>) => ['people', 'checklists', p] as const,
  myItems: ['people', 'checklists', 'my-items'] as const,
  announcements: ['people', 'announcements'] as const,
  orgChart: ['people', 'org-chart'] as const,
};

export const useEmployeesList = (p?: { status?: string }) => useQuery({ queryKey: pk.employees(p), queryFn: () => http.get<EmployeeRow[]>('/employees', p) });
export const useProfile = (id: string | null) => useQuery({ queryKey: pk.profile(id), queryFn: () => http.get<Profile>(`/hr/profiles/${id}`), enabled: Boolean(id) });
export const useDepartments = () => useQuery({ queryKey: pk.departments, queryFn: () => http.get<Department[]>('/departments') });
export const useTeams = () => useQuery({ queryKey: pk.teams, queryFn: () => http.get<Team[]>('/teams') });
export const useRoles = () => useQuery({ queryKey: pk.roles, queryFn: () => http.get<Role[]>('/roles') });
export const useSchedules = () => useQuery({ queryKey: pk.schedules, queryFn: () => http.get<Schedule[]>('/schedules') });
export const useAssignments = (employeeId: string | null) => useQuery({ queryKey: pk.assignments(employeeId), queryFn: () => http.get<ScheduleAssignment[]>(`/employees/${employeeId}/schedules`), enabled: Boolean(employeeId) });
export const useHolidays = (year?: number) => useQuery({ queryKey: pk.holidays(year), queryFn: () => http.get<Holiday[]>('/holidays', year ? { year } : undefined) });
export const useLive = () => useQuery({ queryKey: pk.live, queryFn: () => http.get<LiveRow[]>('/attendance/live'), refetchInterval: 15_000 });
export const useSheet = (p: { month: string; departmentId?: string; teamId?: string; employeeId?: string }) => useQuery({ queryKey: pk.sheet(p), queryFn: () => http.get<Sheet>('/attendance/sheet', p) });
export const useCorrections = (status?: string) => useQuery({ queryKey: pk.corrections(status), queryFn: () => http.get<Correction[]>('/attendance/corrections', status ? { status } : undefined) });
export const useLeaveTypes = (includeInactive = false) => useQuery({ queryKey: pk.leaveTypes(includeInactive), queryFn: () => http.get<LeaveType[]>('/hr/leave-types', includeInactive ? { includeInactive: true } : undefined) });
export const useBalances = (p: { employeeId?: string; year?: number }) => useQuery({ queryKey: pk.balances(p), queryFn: () => http.get<{ year: number; items: LeaveBalance[]; employees: PersonRef[] }>('/hr/leave-balances', p) });
export const useLeaveRequests = (p: { status?: string; employeeId?: string; from?: string; to?: string; cursor?: string; limit?: number }) =>
  useQuery({ queryKey: pk.leaveRequests(p), queryFn: () => http.get<Page<LeaveRequest>>('/leave-requests', p) });
export const useLeaveCalendar = (p: { month: string; departmentId?: string; teamId?: string }) =>
  useQuery({ queryKey: pk.leaveCalendar(p), queryFn: () => http.get<{ month: string; requests: LeaveRequest[]; holidays: Holiday[] }>('/hr/leave-calendar', p) });
export const useOutToday = () => useQuery({ queryKey: pk.outToday, queryFn: () => http.get<{ date: string; items: LeaveRequest[]; upcomingThisWeek: number }>('/hr/out-today') });
export const useTemplates = () => useQuery({ queryKey: pk.templates, queryFn: () => http.get<ChecklistTemplate[]>('/hr/checklist-templates') });
export const useChecklists = (p: { employeeId?: string; kind?: string; status?: string }) => useQuery({ queryKey: pk.checklists(p), queryFn: () => http.get<Checklist[]>('/hr/checklists', p) });
export const useMyItems = () => useQuery({ queryKey: pk.myItems, queryFn: () => http.get<{ items: Array<ChecklistItem & { checklistId: string; kind: string; employee: PersonRef }> }>('/hr/checklists/my-items') });
export const useAnnouncements = () => useQuery({ queryKey: pk.announcements, queryFn: () => http.get<Announcement[]>('/hr/announcements') });
export const useOrgChart = () => useQuery({ queryKey: pk.orgChart, queryFn: () => http.get<OrgChart>('/hr/org-chart') });

/** Mutation helper that invalidates the given key prefixes on success. */
export function usePeopleMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, invalidate: ReadonlyArray<readonly unknown[]>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [...k] })),
  });
}

export const PEOPLE_ALL = [['people']] as const;

// ---------------------------------------------------------------------------
// Additions for the design pass (activity summary, employee update)
// ---------------------------------------------------------------------------

export interface ActivityDaySummary {
  id: string;
  employeeId: string;
  date: string;
  trackedS: number;
  activeS: number;
  idleS: number;
  productiveS: number;
  neutralS: number;
  unproductiveS: number;
  keyCount: number;
  mouseCount: number;
  lockedS?: number;
  longIdleCount?: number;
}

export const useActivitySummary = (p: { employeeId: string | null; from: string; to: string }) =>
  useQuery({
    queryKey: ['people', 'activity-summary', p] as const,
    queryFn: () => http.get<ActivityDaySummary[]>('/tracking/summary', { employeeId: p.employeeId, from: p.from, to: p.to }),
    enabled: Boolean(p.employeeId),
  });
