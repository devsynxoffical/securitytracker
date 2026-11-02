'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { http, type Page } from '../api';
import type { Person } from './crm';

// 16-tracking-admin-spec.md — types mirror the API responses

export interface TimesheetRow {
  date: string;
  trackedS: number;
  activeS: number;
  idleS: number;
  lockedS: number;
  manualS: number;
  breakS: number;
  offlineS: number;
  productiveS: number;
  neutralS: number;
  unproductiveS: number;
  activityPercent: number;
  firstStart: string | null;
  lastEnd: string | null;
  shiftCount: number;
  openShift: boolean;
  status: string | null;
  flags: string[];
}
export interface Totals {
  trackedS: number;
  activeS: number;
  idleS: number;
  lockedS: number;
  manualS: number;
  breakS: number;
  offlineS: number;
  productiveS: number;
  neutralS: number;
  unproductiveS: number;
  daysWorked: number;
  activityPercent: number;
}
export interface EmployeeRef extends Person {
  department?: { name: string } | null;
  team?: { name: string } | null;
}
export interface Timesheet {
  employee: Person;
  from: string;
  to: string;
  rows: TimesheetRow[];
  totals: Totals;
}
export interface TeamTimesheet {
  from: string;
  to: string;
  items: Array<{ employee: EmployeeRef; totals: Totals; days: number }>;
  totals: Totals;
}
export type LiveStatus = 'working' | 'on_break' | 'offline' | 'off_shift' | 'not_started';
export interface TeamActivity {
  date: string;
  summary: { employees: number; working: number; onBreak: number; offline: number; notStarted: number; trackedS: number; activityPercent: number; thresholds: { warn: number; alert: number } };
  items: Array<{
    employee: EmployeeRef;
    status: LiveStatus;
    firstStart: string | null;
    trackedS: number;
    activeS: number;
    idleS: number;
    productiveS: number;
    unproductiveS: number;
    activityPercent: number;
    level: 'ok' | 'warn' | 'alert' | 'none';
    topApp: { name: string; activeS: number; category: string } | null;
    topDomain: { domain: string; activeS: number; category: string } | null;
  }>;
}
export interface Segment {
  id: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  kind: 'active' | 'idle' | 'locked';
  processName: string;
  appName: string;
  domain: string | null;
  exception: string;
  keyCount: number;
  mouseCount: number;
}
export interface TimelineDetail {
  date: string;
  segments: Segment[];
  shifts: Array<{ id: string; startedAt: string; endedAt: string | null; state: string; breaks: Array<{ id: string; type: string; startedAt: string; endedAt: string | null }> }>;
  apps: Array<{ appName: string; processName: string; activeS: number; idleS: number }>;
}
export interface UsageItem {
  processName?: string;
  appName?: string;
  domain?: string;
  category: string;
  activeS: number;
  idleS?: number;
  employees: number;
  share: number;
}
export interface UsageReport {
  from: string;
  to: string;
  totalActiveS: number;
  items: UsageItem[];
}
export interface UncategorisedItem {
  key: string;
  label: string;
  activeS: number;
  employees: number;
}
export interface Rule {
  id: string;
  targetType: 'app' | 'domain';
  pattern: string;
  category: string;
  departmentId: string | null;
}
export interface Exclusion {
  id: string;
  targetType: 'app' | 'domain';
  pattern: string;
}
export interface ExceptionApp {
  id: string;
  processName: string;
  type: 'call' | 'meeting';
}
export interface IdleReport {
  minIdleSeconds: number;
  perEmployee: Array<{ employee: Person | null; count: number; idleS: number; longest: number }>;
  segments: Array<{ id: string; employeeId: string; startedAt: string; endedAt: string; durationS: number; processName: string; appName: string; employee: Person | null }>;
}
export interface TamperEvent {
  id: string;
  employeeId: string;
  deviceId: string;
  type: string;
  detail: Record<string, unknown>;
  occurredAt: string;
  employee: Person | null;
  device: { id: string; name: string } | null;
}
export interface ManualTime {
  id: string;
  employeeId: string;
  employee?: Person;
  date: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  decidedAt: string | null;
}
export interface TrackingSettings {
  idleThresholdSeconds: number;
  longIdleThresholdSeconds: number;
  captureWindowTitles: boolean;
  maxShiftHours: number;
  activityWarnPercent: number;
  activityAlertPercent: number;
}

type Params = Record<string, string | number | boolean | undefined>;
const k = {
  timesheet: (p: Params) => ['tracking', 'timesheet', p] as const,
  teamTimesheet: (p: Params) => ['tracking', 'timesheet', 'team', p] as const,
  teamActivity: (p: Params) => ['tracking', 'team-activity', p] as const,
  timeline: (employeeId: string, date: string) => ['tracking', 'timeline', employeeId, date] as const,
  usage: (type: string, p: Params) => ['tracking', 'usage', type, p] as const,
  usageEmployees: (p: Params) => ['tracking', 'usage', 'employees', p] as const,
  uncategorised: (p: Params) => ['tracking', 'uncategorised', p] as const,
  rules: ['tracking', 'rules'] as const,
  exclusions: ['tracking', 'exclusions'] as const,
  exceptionApps: ['tracking', 'exception-apps'] as const,
  idle: (p: Params) => ['tracking', 'idle', p] as const,
  tamper: (p: Params) => ['tracking', 'tamper', p] as const,
  manualTime: (p: Params) => ['tracking', 'manual-time', p] as const,
  settings: ['tracking', 'settings'] as const,
};
export const trackingKeys = k;

export const useTimesheet = (p: { employeeId?: string; from: string; to: string }, enabled = true) =>
  useQuery({ queryKey: k.timesheet(p), queryFn: () => http.get<Timesheet>('/tracking/timesheet', p), enabled });
export const useTeamTimesheet = (p: { from: string; to: string; departmentId?: string; teamId?: string }) =>
  useQuery({ queryKey: k.teamTimesheet(p), queryFn: () => http.get<TeamTimesheet>('/tracking/timesheet/team', p) });
export const useTeamActivity = (p: { date: string; departmentId?: string; teamId?: string }) =>
  useQuery({ queryKey: k.teamActivity(p), queryFn: () => http.get<TeamActivity>('/tracking/team-activity', p), refetchInterval: 30_000 });
export const useTimelineDetail = (employeeId: string, date: string) =>
  useQuery({ queryKey: k.timeline(employeeId, date), queryFn: () => http.get<TimelineDetail>('/tracking/timeline/detail', { employeeId, date }), enabled: Boolean(employeeId && date) });
export const useUsage = (type: 'apps' | 'domains', p: { from: string; to: string; departmentId?: string; teamId?: string; category?: string; employeeIds?: string }) =>
  useQuery({ queryKey: k.usage(type, p), queryFn: () => http.get<UsageReport>(`/tracking/reports/${type}`, p) });
export const useUsageEmployees = (p: { type: 'app' | 'domain'; key: string; from: string; to: string; departmentId?: string; teamId?: string }, enabled: boolean) =>
  useQuery({ queryKey: k.usageEmployees(p), queryFn: () => http.get<Array<{ employeeId: string; activeS: number; days: number; employee: Person | null }>>('/tracking/reports/employees', p), enabled });
export const useUncategorised = (p: { from: string; to: string; type: 'app' | 'domain' }) =>
  useQuery({ queryKey: k.uncategorised(p), queryFn: () => http.get<{ type: string; items: UncategorisedItem[] }>('/tracking/uncategorised', p) });
export const useRules = () => useQuery({ queryKey: k.rules, queryFn: () => http.get<Rule[]>('/tracking/productivity-rules') });
export const useExclusions = () => useQuery({ queryKey: k.exclusions, queryFn: () => http.get<Exclusion[]>('/tracking/exclusions') });
export const useExceptionApps = () => useQuery({ queryKey: k.exceptionApps, queryFn: () => http.get<ExceptionApp[]>('/tracking/exception-apps') });
export const useIdleReport = (p: { from: string; to: string; employeeId?: string; minIdleSeconds?: number }) =>
  useQuery({ queryKey: k.idle(p), queryFn: () => http.get<IdleReport>('/tracking/idle-report', p) });
export const useTamperEvents = (p: { from?: string; to?: string; employeeId?: string }) =>
  useQuery({ queryKey: k.tamper(p), queryFn: () => http.get<Page<TamperEvent>>('/tracking/tamper-events', { ...p, limit: 100 }) });
export const useManualTime = (p: { status?: string; employeeId?: string; from?: string; to?: string }) =>
  useQuery({ queryKey: k.manualTime(p), queryFn: () => http.get<Page<ManualTime>>('/tracking/manual-time', { ...p, limit: 100 }) });
export const useTrackingSettings = () => useQuery({ queryKey: k.settings, queryFn: () => http.get<TrackingSettings>('/tracking/settings') });

/** Mutation helper that invalidates every tracking query after success. */
export function useTrackingMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, extra: ReadonlyArray<readonly unknown[]> = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracking'] });
      extra.forEach((key) => qc.invalidateQueries({ queryKey: [...key] }));
    },
  });
}
