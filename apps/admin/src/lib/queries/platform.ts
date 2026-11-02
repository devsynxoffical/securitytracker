'use client';

import { useQuery } from '@tanstack/react-query';
import { http, type Page } from '../api';
import type { Person } from './crm';

// Types mirrored from the API (security, settings, reports, targets).

export interface AuditLog {
  id: string;
  actorId: string | null;
  actor: Person | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string;
  deviceId: string | null;
  client: string;
  occurredAt: string;
}

export interface LoginEvent {
  id: string;
  employeeId: string | null;
  actor: Person | null;
  identifier: string;
  deviceId: string | null;
  ip: string;
  client: string;
  result: string;
  createdAt: string;
}

export interface SecurityAlert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'high' | 'critical' | string;
  employeeId: string | null;
  actor: Person | null;
  detail: Record<string, unknown>;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  employeeId: string;
  employee: Person;
  deviceId: string | null;
  device: { id: string; name: string; osVersion: string } | null;
  client: 'desktop' | 'admin' | string;
  ip: string;
  userAgent: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  active: boolean;
}

export interface Device {
  id: string;
  name: string;
  employeeId: string;
  employee?: Person | null;
  hardwareHash: string;
  osVersion: string;
  appVersion: string | null;
  agentVersion: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | string;
  approvedAt: string | null;
  lastSeenAt: string | null;
  releaseChannel: string;
  createdAt: string;
}

export interface RolePermission {
  permissionKey: string;
  scope: string;
}
export interface Role {
  id: string;
  name: string;
  rank: number;
  isSystem: boolean;
  permissions: RolePermission[];
  _count?: { employees: number };
}
export interface PermissionCatalog {
  permissions: readonly string[];
  scopes: readonly string[];
}

export interface Target {
  id: string;
  assigneeType: 'employee' | 'team' | 'role';
  assigneeId: string;
  metricKey: string;
  period: 'daily' | 'weekly' | 'monthly';
  value: string | number;
  weekdays: number[];
  validFrom: string;
  validTo: string | null;
  createdAt?: string;
}
export interface TargetProgress {
  targetId: string;
  metricKey: string;
  period: string;
  targetValue: number;
  currentValue: number;
  percentage: number;
  periodStart?: string;
  periodEnd?: string;
  assigneeType?: string;
}

export interface CompanySettings {
  id: string;
  name: string;
  timezone: string;
  weekStart: number;
  idleThresholdSeconds: number;
  longIdleThresholdSeconds: number;
  breakAllowanceMinutes: number;
  deviceApprovalMode: 'manual' | 'auto_first' | 'off';
  deviceLimitPerEmployee: number;
  maxShiftHours: number;
  heartbeatTimeoutMinutes: number;
  captureWindowTitles: boolean;
  adminIpAllowlist: string[];
  updatedAt: string;
}

export interface LiveAttendanceRow {
  employeeId: string;
  employee?: Person;
  status: string;
  [key: string]: unknown;
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export const pkeys = {
  audit: (p: Query) => ['audit', p] as const,
  logins: (p: Query) => ['login-events', p] as const,
  alerts: (ack?: boolean) => ['security-alerts', ack] as const,
  sessions: (p: Query) => ['sessions', p] as const,
  devices: ['devices'] as const,
  roles: ['roles'] as const,
  role: (id: string) => ['roles', id] as const,
  permissions: ['permissions'] as const,
  targets: (p: Query) => ['targets', p] as const,
  targetProgress: (id: string) => ['targets', 'progress', id] as const,
  settings: ['settings'] as const,
  report: (kind: string, p: Query) => ['reports', kind, p] as const,
  live: ['attendance', 'live'] as const,
  departments: ['departments'] as const,
  teams: ['teams'] as const,
};

export const useAuditLogs = (p: Query) => useQuery({ queryKey: pkeys.audit(p), queryFn: () => http.get<Page<AuditLog>>('/audit-logs', p) });
export const useLoginEvents = (p: Query) => useQuery({ queryKey: pkeys.logins(p), queryFn: () => http.get<Page<LoginEvent>>('/login-events', p) });
export const useSecurityAlerts = (ack?: boolean) =>
  useQuery({ queryKey: pkeys.alerts(ack), queryFn: () => http.get<SecurityAlert[]>('/security-alerts', { acknowledged: ack === undefined ? undefined : String(ack) }) });
export const useSessions = (p: Query) => useQuery({ queryKey: pkeys.sessions(p), queryFn: () => http.get<Page<Session>>('/sessions', p) });
export const useDevices = () => useQuery({ queryKey: pkeys.devices, queryFn: () => http.get<Device[]>('/devices') });
export const useRoles = () => useQuery({ queryKey: pkeys.roles, queryFn: () => http.get<Role[]>('/roles') });
export const useRole = (id: string | null) => useQuery({ queryKey: pkeys.role(id ?? ''), queryFn: () => http.get<Role>(`/roles/${id}`), enabled: Boolean(id) });
export const usePermissionCatalog = () => useQuery({ queryKey: pkeys.permissions, queryFn: () => http.get<PermissionCatalog>('/permissions'), staleTime: 300_000 });
export const useTargets = (p: Query) => useQuery({ queryKey: pkeys.targets(p), queryFn: () => http.get<Target[]>('/targets', p) });
export const useTargetProgress = (employeeId: string | null) =>
  useQuery({ queryKey: pkeys.targetProgress(employeeId ?? ''), queryFn: () => http.get<TargetProgress[]>(`/targets/employee/${employeeId}`), enabled: Boolean(employeeId) });
export const useSettings = (enabled = true) => useQuery({ queryKey: pkeys.settings, queryFn: () => http.get<CompanySettings>('/settings'), enabled });
export const useReport = <T,>(kind: string, p: Query, enabled = true) =>
  useQuery({ queryKey: pkeys.report(kind, p), queryFn: () => http.get<{ totalRecords: number; data: T[] }>(`/reports/${kind}`, p), enabled });
export const useLiveAttendance = (enabled = true) =>
  useQuery({ queryKey: pkeys.live, queryFn: () => http.get<LiveAttendanceRow[]>('/attendance/live'), enabled, refetchInterval: 30_000 });
export const useDepartments = (enabled = true) =>
  useQuery({ queryKey: pkeys.departments, queryFn: () => http.get<Array<{ id: string; name: string }>>('/departments'), enabled, staleTime: 60_000 });
export const useTeams = (enabled = true) =>
  useQuery({ queryKey: pkeys.teams, queryFn: () => http.get<Array<{ id: string; name: string; departmentId: string }>>('/teams'), enabled, staleTime: 60_000 });
