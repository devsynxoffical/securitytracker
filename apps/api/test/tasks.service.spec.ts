import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClockService } from '../src/common/clock.service';
import { TasksService, TaskPerms } from '../src/tasks/tasks.service';
import { TaskDetailsService } from '../src/tasks/task-details.service';
import { SpacesService } from '../src/tasks/spaces.service';
import { statusFromGroup, groupFromLegacyStatus, taskScopeWhere, assertCanEdit } from '../src/tasks/task-scope.util';
import { ScopeFilter } from '../src/auth/guards/rbac.guard';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const own: ScopeFilter = { scope: 'own', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [ME] };
const all: ScopeFilter = { scope: 'all', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [] };
const none: TaskPerms = { canManage: false, canManageSpaces: false, canAssign: false };
const manager: TaskPerms = { canManage: true, canManageSpaces: true, canAssign: true };

function prismaMock() {
  const t = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn(),
  });
  const p: any = { task: t(), taskList: t(), taskStatus: t(), taskSpace: t(), taskSpaceMember: t(), taskAssignee: t(), taskWatcher: t(), taskChecklist: t(), taskChecklistItem: t(), taskComment: t(), taskTimeEntry: t(), taskActivity: t(), recordTag: t(), leadTimeline: t(), employee: t() };
  p.$transaction = vi.fn((cb: any) => (typeof cb === 'function' ? cb(p) : Promise.all(cb)));
  return p;
}

function services(prisma: any) {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
  const notifications: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  const gateway: any = { emitToUser: vi.fn() };
  const targets: any = { recordMetricEvent: vi.fn().mockResolvedValue({}) };
  const tasks = new TasksService(prisma, clock, notifications, gateway, targets);
  const details = new TaskDetailsService(prisma, clock, notifications, tasks);
  const spaces = new SpacesService(prisma, clock);
  return { clock, notifications, gateway, targets, tasks, details, spaces };
}

describe('task-scope.util', () => {
  it('derives coarse status from group and back (14 rule 3)', () => {
    expect(statusFromGroup('open')).toBe('todo');
    expect(statusFromGroup('active')).toBe('in_progress');
    expect(statusFromGroup('done')).toBe('done');
    expect(statusFromGroup('closed')).toBe('cancelled');
    expect(groupFromLegacyStatus('in_progress')).toBe('active');
    expect(groupFromLegacyStatus('cancelled')).toBe('closed');
  });

  it('own scope: creator, assignee or private-space member; all scope hides private spaces unless managing', () => {
    const w = taskScopeWhere(own, false) as any;
    const or = w.AND[1].OR;
    expect(or).toEqual(expect.arrayContaining([{ creatorId: { in: [ME] } }, { assigneeId: { in: [ME] } }]));
    expect(JSON.stringify(or)).toContain('"visibility":"private"');
    expect(taskScopeWhere(all, true)).toEqual({});
    expect(JSON.stringify(taskScopeWhere(all, false))).toContain('"visibility":"company"');
  });

  it('rule 7: assignee or creator can edit, others need tasks.manage', () => {
    const task = { creatorId: OTHER, assigneeId: OTHER, assignees: [{ employeeId: OTHER }] };
    expect(() => assertCanEdit(task, ME, false)).toThrow();
    expect(() => assertCanEdit(task, ME, true)).not.toThrow();
    expect(() => assertCanEdit({ ...task, creatorId: ME }, ME, false)).not.toThrow();
    expect(() => assertCanEdit({ ...task, assignees: [{ employeeId: ME }] }, ME, false)).not.toThrow();
  });
});

describe('TasksService', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = prismaMock();
  });

  it('create: first open status, derived status, assignees + watchers, metric-free, notifies other assignees', async () => {
    const { tasks, notifications } = services(prisma);
    prisma.taskList.findFirst.mockResolvedValue({ id: U(31), statuses: [{ id: U(41), group: 'open' }, { id: U(44), group: 'done' }] });
    prisma.task.create.mockImplementation(({ data }: any) => Promise.resolve({ id: U(100), ...data }));
    const res = await tasks.create(all, ME, manager, { listId: U(31), title: 'Write spec', priority: 'high', assigneeIds: [OTHER, ME] });
    expect(res.statusId).toBe(U(41));
    expect(res.status).toBe('todo');
    expect(res.assigneeId).toBe(OTHER);
    expect(prisma.task.create.mock.calls[0][0].data.watchers.create).toHaveLength(2);
    expect(prisma.taskActivity.create.mock.calls[0][0].data.type).toBe('created');
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
    expect(notifications.sendNotification.mock.calls[0][0]).toBe(OTHER);
  });

  it('create: assigning someone else needs tasks.assign (denied), self is fine (allowed)', async () => {
    const { tasks } = services(prisma);
    prisma.taskList.findFirst.mockResolvedValue({ id: U(31), statuses: [{ id: U(41), group: 'open' }] });
    prisma.task.create.mockImplementation(({ data }: any) => Promise.resolve({ id: U(100), ...data }));
    await expect(tasks.create(own, ME, none, { listId: U(31), title: 'x', priority: 'normal', assigneeIds: [OTHER] })).rejects.toMatchObject({ status: 403 });
    await expect(tasks.create(own, ME, none, { listId: U(31), title: 'x', priority: 'normal' })).resolves.toMatchObject({ assigneeId: ME });
  });

  it('create: subtask depth guard', async () => {
    const { tasks } = services(prisma);
    prisma.taskList.findFirst.mockResolvedValue({ id: U(31), statuses: [{ id: U(41), group: 'open' }] });
    prisma.task.findFirst.mockResolvedValue({ parentId: U(1), listId: U(31) }); // parent is itself a subtask
    await expect(tasks.create(all, ME, manager, { listId: U(31), parentId: U(2), title: 'x', priority: 'normal' })).rejects.toMatchObject({ response: { code: 'TASK_SUBTASK_DEPTH' } });
  });

  it('setStatus: done sets completed_at once and records tasks_completed once', async () => {
    const { tasks, targets } = services(prisma);
    const task = { id: U(100), companyId: COMPANY, title: 'T', listId: U(31), statusId: U(41), status: 'todo', completedAt: null, creatorId: ME, assigneeId: ME, assignees: [{ employeeId: ME }], statusRef: { group: 'open' }, leadId: null };
    prisma.task.findFirst.mockResolvedValue(task);
    prisma.taskStatus.findFirst.mockResolvedValue({ id: U(44), group: 'done', listId: U(31) });
    prisma.task.update.mockImplementation(({ data }: any) => Promise.resolve({ ...task, ...data }));
    const res = await tasks.setStatus(own, ME, none, U(100), { statusId: U(44) });
    expect(res.status).toBe('done');
    expect(res.completedAt).toBeInstanceOf(Date);
    expect(targets.recordMetricEvent).toHaveBeenCalledWith(COMPANY, ME, 'tasks_completed', 1, 'task_completed', U(100), expect.any(Date));

    // already completed before: no second metric
    targets.recordMetricEvent.mockClear();
    prisma.task.findFirst.mockResolvedValue({ ...task, completedAt: new Date('2026-10-01') });
    await tasks.setStatus(own, ME, none, U(100), { statusId: U(44) });
    expect(targets.recordMetricEvent).not.toHaveBeenCalled();
  });

  it('setStatus: legacy body {status} maps to the first status of that group; status outside list rejected', async () => {
    const { tasks } = services(prisma);
    const task = { id: U(100), companyId: COMPANY, title: 'T', listId: U(31), statusId: U(41), status: 'todo', completedAt: null, creatorId: ME, assigneeId: ME, assignees: [], statusRef: { group: 'open' }, leadId: null };
    prisma.task.findFirst.mockResolvedValue(task);
    prisma.taskStatus.findFirst.mockResolvedValueOnce({ id: U(42), group: 'active' });
    prisma.task.update.mockImplementation(({ data }: any) => Promise.resolve({ ...task, ...data }));
    const res = await tasks.setStatus(own, ME, none, U(100), { status: 'in_progress' });
    expect(res.statusId).toBe(U(42));
    expect(res.status).toBe('in_progress');

    prisma.taskStatus.findFirst.mockResolvedValueOnce(null);
    await expect(tasks.setStatus(own, ME, none, U(100), { statusId: U(99) })).rejects.toMatchObject({ response: { code: 'TASK_STATUS_NOT_IN_LIST' } });
  });

  it('setStatus: non-assignee without tasks.manage is denied; manager allowed', async () => {
    const { tasks } = services(prisma);
    const task = { id: U(100), companyId: COMPANY, title: 'T', listId: U(31), statusId: U(41), status: 'todo', completedAt: null, creatorId: OTHER, assigneeId: OTHER, assignees: [{ employeeId: OTHER }], statusRef: { group: 'open' }, leadId: null };
    prisma.task.findFirst.mockResolvedValue(task);
    prisma.taskStatus.findFirst.mockResolvedValue({ id: U(42), group: 'active', listId: U(31) });
    prisma.task.update.mockImplementation(({ data }: any) => Promise.resolve({ ...task, ...data }));
    await expect(tasks.setStatus(all, ME, none, U(100), { statusId: U(42) })).rejects.toMatchObject({ status: 403 });
    await expect(tasks.setStatus(all, ME, manager, U(100), { statusId: U(42) })).resolves.toMatchObject({ status: 'in_progress' });
  });

  it('getById: task outside own scope is 404 and the where clause carries the scope OR', async () => {
    const { tasks } = services(prisma);
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(tasks.getById(own, none, U(5))).rejects.toMatchObject({ status: 404 });
    const where = prisma.task.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where.AND)).toContain(ME);
  });

  it('bulk: rejects when an id is outside scope; archive sets archived_at on task and subtasks', async () => {
    const { tasks } = services(prisma);
    prisma.task.findMany.mockResolvedValue([{ id: U(1), listId: U(31), assignees: [], assigneeId: ME, creatorId: ME }]);
    await expect(tasks.bulk(own, ME, manager, { ids: [U(1), U(2)], action: 'archive' })).rejects.toMatchObject({ status: 404 });

    prisma.task.findFirst.mockResolvedValue({ id: U(1) });
    prisma.task.update.mockResolvedValue({ id: U(1), archivedAt: new Date() });
    const res = await tasks.bulk(own, ME, manager, { ids: [U(1)], action: 'archive' });
    expect(res.count).toBe(1);
    expect(prisma.task.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { parentId: U(1) } }));
    expect(prisma.taskActivity.create.mock.calls.at(-1)[0].data.type).toBe('archived');
  });

  it('my: today = open tasks assigned to me due within the UTC day', async () => {
    const { tasks } = services(prisma);
    await tasks.my(own, ME, { range: 'today', limit: 100 });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.dueAt.gte.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(where.status).toEqual({ in: ['todo', 'in_progress'] });
    expect(JSON.stringify(where.OR)).toContain(ME);
  });
});

describe('TaskDetailsService', () => {
  it('time entry adds to time_spent_s and logs activity; comment with mention notifies and adds watchers', async () => {
    const prisma = prismaMock();
    const { details, notifications } = services(prisma);
    prisma.task.findFirst.mockResolvedValue({ id: U(1), title: 'T', timeSpentS: 600, assignees: [] });
    prisma.taskTimeEntry.create.mockResolvedValue({ id: U(9), durationS: 1800 });
    await details.addTimeEntry(own, none, ME, U(1), { durationSeconds: 1800 });
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: U(1) }, data: { timeSpentS: 2400 } });
    expect(prisma.taskActivity.create.mock.calls[0][0].data.type).toBe('time_logged');

    prisma.taskComment.create.mockResolvedValue({ id: U(10) });
    prisma.taskWatcher.findMany.mockResolvedValue([]);
    await details.addComment(own, none, ME, U(1), { body: 'ping @other', mentions: [OTHER] });
    expect(prisma.taskWatcher.createMany.mock.calls.at(-1)[0].data).toEqual(expect.arrayContaining([{ taskId: U(1), employeeId: OTHER }]));
    expect(notifications.sendNotification).toHaveBeenCalledWith(OTHER, 'task_mention', expect.any(String), expect.any(String), expect.objectContaining({ taskId: U(1) }));
  });
});

describe('SpacesService', () => {
  it('createList copies the space default statuses in order', async () => {
    const prisma = prismaMock();
    const { spaces } = services(prisma);
    prisma.taskSpace.findFirst.mockResolvedValue({ id: U(30), defaultStatuses: [{ name: 'Backlog', colour: '#111111', group: 'open' }, { name: 'Shipped', colour: '#222222', group: 'done' }] });
    prisma.taskList.create.mockImplementation(({ data }: any) => Promise.resolve({ id: U(31), ...data }));
    await spaces.createList(COMPANY, { spaceId: U(30), name: 'Sprint 1' });
    const created = prisma.taskList.create.mock.calls[0][0].data.statuses.create;
    expect(created.map((s: any) => [s.name, s.group, s.position])).toEqual([['Backlog', 'open', 1], ['Shipped', 'done', 2]]);
  });

  it('deleteStatus refuses when tasks still use it', async () => {
    const prisma = prismaMock();
    const { spaces } = services(prisma);
    prisma.taskStatus.findFirst.mockResolvedValue({ id: U(41), listId: U(31), group: 'open' });
    prisma.task.count.mockResolvedValue(3);
    await expect(spaces.deleteStatus(COMPANY, U(31), U(41))).rejects.toMatchObject({ status: 409 });
  });
});
