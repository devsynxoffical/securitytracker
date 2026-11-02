'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { http, type Page } from '../api';

// ---------------------------------------------------------------------------
// Types (subset of API responses, 14-tasks-spec.md)
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  code?: string;
  firstName: string;
  lastName: string;
}
export type Priority = 'urgent' | 'high' | 'normal' | 'low' | 'none';
export type StatusGroup = 'open' | 'active' | 'done' | 'closed';
export type CoarseStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export interface TaskStatus {
  id: string;
  listId: string;
  name: string;
  colour: string;
  group: StatusGroup;
  position: number;
}
export interface TaskList {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  position: number;
  archivedAt: string | null;
  statuses?: TaskStatus[];
  space?: { id: string; name: string; colour: string; visibility: string };
  _count?: { tasks: number };
}
export interface SpaceMember {
  spaceId: string;
  employeeId: string;
  role: 'member' | 'admin';
  employee?: Person;
}
export interface Space {
  id: string;
  name: string;
  colour: string;
  icon: string | null;
  visibility: 'company' | 'private';
  defaultStatuses: Array<{ name: string; colour: string; group: StatusGroup }>;
  position: number;
  archivedAt: string | null;
  members: SpaceMember[];
  lists: TaskList[];
}
export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assignee: Person | null;
  assignees: Array<{ employeeId: string; employee: Person }>;
  creatorId: string;
  listId: string | null;
  list: { id: string; name: string; spaceId: string; space: { id: string; name: string; colour: string } } | null;
  parentId: string | null;
  parent?: { id: string; title: string } | null;
  statusId: string | null;
  statusRef: TaskStatus | null;
  status: CoarseStatus;
  priority: Priority;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  timeEstimateS: number | null;
  timeSpentS: number;
  position: number;
  archivedAt: string | null;
  custom: Record<string, unknown>;
  leadId: string | null;
  lead?: { id: string; name: string } | null;
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { subtasks: number; comments: number };
  subtasks?: Array<Task & { statusRef: TaskStatus | null }>;
  watchers?: Array<{ employeeId: string }>;
  checklists?: Checklist[];
  timeEntries?: TimeEntry[];
  tags?: Array<{ id: string; name: string; colour: string }>;
}
export interface Checklist {
  id: string;
  title: string;
  position: number;
  items: Array<{ id: string; title: string; done: boolean; doneBy: string | null; doneAt: string | null; position: number }>;
}
export interface TimeEntry {
  id: string;
  employeeId: string;
  employee?: Person | null;
  startedAt: string | null;
  endedAt: string | null;
  durationS: number;
  note: string | null;
  createdAt: string;
}
export interface Comment {
  id: string;
  authorId: string;
  author: Person | null;
  body: string;
  mentions: string[];
  editedAt: string | null;
  createdAt: string;
}
export interface TaskActivity {
  id: string;
  type: string;
  actorId: string | null;
  actor: Person | null;
  data: Record<string, unknown>;
  occurredAt: string;
}
export interface BoardColumn {
  status: TaskStatus;
  count: number;
  tasks: Task[];
}
export interface Board {
  list: { id: string; name: string };
  columns: BoardColumn[];
}
export interface WorkloadRow {
  employee: Person & { team?: { name: string } | null };
  open: number;
  inProgress: number;
  overdue: number;
  urgent: number;
  estimateS: number;
  spentS: number;
}

type ListParams = Record<string, string | number | boolean | undefined | null>;

export const taskKeys = {
  spaces: ['tasks', 'spaces'] as const,
  space: (id: string) => ['tasks', 'spaces', id] as const,
  lists: (spaceId?: string) => ['tasks', 'lists', spaceId ?? 'all'] as const,
  list: (id: string) => ['tasks', 'lists', 'detail', id] as const,
  tasks: (p: ListParams) => ['tasks', 'items', p] as const,
  task: (id: string) => ['tasks', 'items', 'detail', id] as const,
  my: (range: string) => ['tasks', 'my', range] as const,
  board: (listId: string) => ['tasks', 'board', listId] as const,
  workload: (spaceId?: string) => ['tasks', 'workload', spaceId ?? 'all'] as const,
  comments: (id: string) => ['tasks', 'comments', id] as const,
  activities: (id: string) => ['tasks', 'activities', id] as const,
  time: (id: string) => ['tasks', 'time', id] as const,
};

export const ALL_TASKS = ['tasks'] as const;

export const useSpaces = (includeArchived = false) =>
  useQuery({ queryKey: [...taskKeys.spaces, includeArchived], queryFn: () => http.get<Space[]>('/tasks/spaces', { includeArchived }) });
export const useSpace = (id: string | null) =>
  useQuery({ queryKey: taskKeys.space(id ?? ''), queryFn: () => http.get<Space>(`/tasks/spaces/${id}`), enabled: Boolean(id) });
export const useLists = (spaceId?: string) =>
  useQuery({ queryKey: taskKeys.lists(spaceId), queryFn: () => http.get<TaskList[]>('/tasks/lists', { spaceId }) });
export const useList = (id: string | null) =>
  useQuery({ queryKey: taskKeys.list(id ?? ''), queryFn: () => http.get<TaskList>(`/tasks/lists/${id}`), enabled: Boolean(id) });
export const useTasks = (p: ListParams, o?: Partial<UseQueryOptions<Page<Task>>>) =>
  useQuery({ queryKey: taskKeys.tasks(p), queryFn: () => http.get<Page<Task>>('/tasks', p), ...o });
export const useTask = (id: string | null) =>
  useQuery({ queryKey: taskKeys.task(id ?? ''), queryFn: () => http.get<Task>(`/tasks/${id}`), enabled: Boolean(id) });
export const useMyTasks = (range: string) =>
  useQuery({ queryKey: taskKeys.my(range), queryFn: () => http.get<{ items: Task[] }>('/tasks/my', { range, limit: 200 }) });
export const useTaskBoard = (listId: string | null) =>
  useQuery({ queryKey: taskKeys.board(listId ?? ''), queryFn: () => http.get<Board>('/tasks/board', { listId }), enabled: Boolean(listId) });
export const useWorkload = (spaceId?: string) =>
  useQuery({ queryKey: taskKeys.workload(spaceId), queryFn: () => http.get<{ items: WorkloadRow[]; totals: { tasks: number } }>('/tasks/workload', { spaceId }) });
export const useComments = (id: string | null) =>
  useQuery({ queryKey: taskKeys.comments(id ?? ''), queryFn: () => http.get<{ items: Comment[] }>(`/tasks/${id}/comments`), enabled: Boolean(id) });
export const useTaskActivities = (id: string | null) =>
  useQuery({ queryKey: taskKeys.activities(id ?? ''), queryFn: () => http.get<Page<TaskActivity>>(`/tasks/${id}/activities`, { limit: 100 }), enabled: Boolean(id) });
export const useTimeEntries = (id: string | null) =>
  useQuery({ queryKey: taskKeys.time(id ?? ''), queryFn: () => http.get<{ items: TimeEntry[]; totalS: number }>(`/tasks/${id}/time-entries`), enabled: Boolean(id) });

/** Mutation helper: runs fn then invalidates the given key prefixes (defaults to everything under ['tasks']). */
export function useTaskMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, invalidate: ReadonlyArray<readonly unknown[]> = [ALL_TASKS]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [...k] })),
  });
}

export const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low', 'none'];
export const GROUPS: StatusGroup[] = ['open', 'active', 'done', 'closed'];
