import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateWorkTaskDto,
  UpdateWorkTaskDto,
  SetTaskStatusDto,
  TaskListQueryDto,
  MyTasksQueryDto,
  BulkTaskActionDto,
  CreateTaskDto,
  ErrorCodes,
  MetricKey,
  NotificationType,
  TaskActivityType,
  TaskStatusGroup,
  WebSocketEvents,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TargetsService } from '../targets/targets.service';
import { parseSort, toCursorPage } from '../crm/shared/crm.util';
import { assertCanEdit, assertEmployeesInScope, groupFromLegacyStatus, statusFromGroup, taskScopeWhere } from './task-scope.util';

type Tx = Prisma.TransactionClient | PrismaService;

export interface TaskPerms {
  canManage: boolean;
  canManageSpaces: boolean;
  canAssign: boolean;
}

const SORTABLE = ['dueAt', 'createdAt', 'priority', 'title', 'position', 'updatedAt'] as const;
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3, none: 4 };

const TASK_INCLUDE = {
  assignee: { select: { id: true, code: true, firstName: true, lastName: true } },
  assignees: { include: { employee: { select: { id: true, code: true, firstName: true, lastName: true } } } },
  statusRef: true,
  list: { select: { id: true, name: true, spaceId: true, space: { select: { id: true, name: true, colour: true } } } },
  _count: { select: { subtasks: { where: { archivedAt: null, deletedAt: null } }, comments: { where: { deletedAt: null } } } },
} satisfies Prisma.TaskInclude;

/** Core task lifecycle (F24, FR-TASK-08, 11, 13, 15, 16). */
@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private targets: TargetsService,
  ) {}

  // ---- Queries -------------------------------------------------------------

  async list(scope: ScopeFilter, perms: TaskPerms, q: TaskListQueryDto & { leadId?: string; status?: string; dueToday?: boolean }) {
    const where: Prisma.TaskWhereInput = {
      companyId: scope.companyId,
      deletedAt: null,
      ...(q.includeArchived ? {} : { archivedAt: null }),
      ...(q.parentId ? { parentId: q.parentId } : q.includeSubtasks ? {} : { parentId: null }),
    };
    const and: Prisma.TaskWhereInput[] = [taskScopeWhere(scope, perms.canManageSpaces)];
    if (q.listId) where.listId = q.listId;
    if (q.spaceId) where.list = { spaceId: q.spaceId };
    if (q.assigneeId) {
      assertEmployeesInScope(scope, [q.assigneeId]);
      and.push({ OR: [{ assigneeId: q.assigneeId }, { assignees: { some: { employeeId: q.assigneeId } } }] });
    }
    if (q.statusId) where.statusId = q.statusId;
    if (q.group) where.OR = [{ statusRef: { group: q.group } }, { statusId: null, status: statusFromGroup(q.group) }];
    if (q.status) where.status = q.status; // legacy desktop filter
    if (q.leadId) where.leadId = q.leadId;
    if (q.priority) where.priority = q.priority;
    if (q.dueFrom || q.dueTo) where.dueAt = { ...(q.dueFrom ? { gte: new Date(q.dueFrom) } : {}), ...(q.dueTo ? { lte: new Date(q.dueTo) } : {}) };
    if (q.dueToday) {
      const { start, end } = this.today();
      where.dueAt = { gte: start, lt: end };
    }
    if (q.tagId) {
      const links = await this.prisma.recordTag.findMany({ where: { companyId: scope.companyId, entityType: 'task', tagId: q.tagId }, select: { entityId: true } });
      where.id = { in: links.map((l) => l.entityId) };
    }
    if (q.search) and.push({ OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { description: { contains: q.search, mode: 'insensitive' } }] });
    where.AND = and;

    const rows = await this.prisma.task.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: [parseSort(q.sort, SORTABLE, { field: 'dueAt', direction: 'asc' }), { id: 'desc' }],
      include: TASK_INCLUDE,
    });
    return toCursorPage(rows, q.limit);
  }

  /** FR-TASK-13: caller's own tasks grouped by due date. */
  async my(scope: ScopeFilter, employeeId: string, q: MyTasksQueryDto) {
    const { start, end } = this.today();
    const mine: Prisma.TaskWhereInput = {
      companyId: scope.companyId,
      deletedAt: null,
      archivedAt: null,
      OR: [{ assigneeId: employeeId }, { assignees: { some: { employeeId } } }],
    };
    const open: Prisma.TaskWhereInput = { status: { in: ['todo', 'in_progress'] } };
    let where: Prisma.TaskWhereInput;
    switch (q.range) {
      case 'today':
        where = { ...mine, ...open, dueAt: { gte: start, lt: end } };
        break;
      case 'overdue':
        where = { ...mine, ...open, dueAt: { lt: start } };
        break;
      case 'upcoming':
        where = { ...mine, ...open, dueAt: { gte: end } };
        break;
      case 'nodate':
        where = { ...mine, ...open, dueAt: null };
        break;
      default:
        where = { ...mine, status: 'done' };
    }
    const items = await this.prisma.task.findMany({
      where,
      take: q.limit,
      orderBy: q.range === 'done' ? { completedAt: 'desc' } : [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      include: TASK_INCLUDE,
    });
    return { items };
  }

  /** FR-TASK-13: open tasks and estimates per assignee. */
  async workload(scope: ScopeFilter, perms: TaskPerms, spaceId?: string) {
    const now = this.clock.now();
    const tasks = await this.prisma.task.findMany({
      where: {
        companyId: scope.companyId,
        deletedAt: null,
        archivedAt: null,
        status: { in: ['todo', 'in_progress'] },
        ...(spaceId ? { list: { spaceId } } : {}),
        AND: [taskScopeWhere(scope, perms.canManageSpaces)],
      },
      select: { id: true, dueAt: true, timeEstimateS: true, timeSpentS: true, priority: true, status: true, assignees: { select: { employeeId: true } }, assigneeId: true },
      take: 5000,
    });
    const byEmployee = new Map<string, { open: number; inProgress: number; overdue: number; urgent: number; estimateS: number; spentS: number }>();
    for (const t of tasks) {
      const ids = new Set([t.assigneeId, ...t.assignees.map((a) => a.employeeId)]);
      for (const id of ids) {
        const row = byEmployee.get(id) ?? { open: 0, inProgress: 0, overdue: 0, urgent: 0, estimateS: 0, spentS: 0 };
        row.open += 1;
        if (t.status === 'in_progress') row.inProgress += 1;
        if (t.dueAt && t.dueAt < now) row.overdue += 1;
        if (t.priority === 'urgent') row.urgent += 1;
        row.estimateS += t.timeEstimateS ?? 0;
        row.spentS += t.timeSpentS;
        byEmployee.set(id, row);
      }
    }
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: Array.from(byEmployee.keys()) } },
      select: { id: true, code: true, firstName: true, lastName: true, team: { select: { name: true } } },
    });
    return {
      items: employees
        .map((e) => ({ employee: e, ...byEmployee.get(e.id)! }))
        .sort((a, b) => b.open - a.open),
      totals: { tasks: tasks.length },
    };
  }

  /** Board for one list: statuses as columns (FR-TASK-12). */
  async board(scope: ScopeFilter, perms: TaskPerms, listId: string) {
    const list = await this.prisma.taskList.findFirst({ where: { id: listId, companyId: scope.companyId }, include: { statuses: { orderBy: { position: 'asc' } } } });
    if (!list) throw new NotFoundException('List not found');
    const tasks = await this.prisma.task.findMany({
      where: { companyId: scope.companyId, listId, deletedAt: null, archivedAt: null, parentId: null, AND: [taskScopeWhere(scope, perms.canManageSpaces)] },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: TASK_INCLUDE,
      take: 2000,
    });
    return {
      list: { id: list.id, name: list.name },
      columns: list.statuses.map((status) => {
        const items = tasks.filter((t) => t.statusId === status.id);
        return { status, count: items.length, tasks: items };
      }),
    };
  }

  async getById(scope: ScopeFilter, perms: TaskPerms, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, companyId: scope.companyId, deletedAt: null, AND: [taskScopeWhere(scope, perms.canManageSpaces)] },
      include: {
        ...TASK_INCLUDE,
        parent: { select: { id: true, title: true } },
        subtasks: { where: { deletedAt: null, archivedAt: null }, orderBy: { position: 'asc' }, include: { statusRef: true, assignee: { select: { id: true, firstName: true, lastName: true } } } },
        watchers: true,
        checklists: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } },
        timeEntries: { orderBy: { createdAt: 'desc' } },
        lead: { select: { id: true, name: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    const tags = await this.prisma.recordTag.findMany({ where: { entityType: 'task', entityId: id }, include: { tag: true } });
    return { ...task, tags: tags.map((t) => t.tag) };
  }

  // ---- Mutations -----------------------------------------------------------

  async create(scope: ScopeFilter, actorId: string, perms: TaskPerms, dto: CreateWorkTaskDto) {
    const list = await this.prisma.taskList.findFirst({ where: { id: dto.listId, companyId: scope.companyId, archivedAt: null }, include: { statuses: { orderBy: { position: 'asc' } } } });
    if (!list) throw new NotFoundException('List not found');
    const status = dto.statusId ? list.statuses.find((s) => s.id === dto.statusId) : list.statuses.find((s) => s.group === TaskStatusGroup.OPEN) ?? list.statuses[0];
    if (!status) throw new UnprocessableEntityException({ code: ErrorCodes.TASK_STATUS_NOT_IN_LIST, message: 'Status does not belong to this list' });

    if (dto.parentId) {
      const parent = await this.prisma.task.findFirst({ where: { id: dto.parentId, companyId: scope.companyId, deletedAt: null }, select: { parentId: true, listId: true } });
      if (!parent) throw new NotFoundException('Parent task not found');
      if (parent.parentId) throw new UnprocessableEntityException({ code: ErrorCodes.TASK_SUBTASK_DEPTH, message: 'Subtasks cannot have subtasks' });
      if (parent.listId !== dto.listId) throw new BadRequestException('A subtask must be in the same list as its parent');
    }

    const assigneeIds = Array.from(new Set(dto.assigneeIds?.length ? dto.assigneeIds : [actorId]));
    if (assigneeIds.some((id) => id !== actorId)) {
      if (!perms.canAssign) throw new ForbiddenException('Permission missing: tasks.assign');
      assertEmployeesInScope(scope, assigneeIds);
    }
    const now = this.clock.now();
    const position = now.getTime();

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          companyId: scope.companyId,
          title: dto.title,
          description: dto.description ?? null,
          assigneeId: assigneeIds[0]!,
          creatorId: actorId,
          listId: dto.listId,
          parentId: dto.parentId ?? null,
          statusId: status.id,
          status: statusFromGroup(status.group),
          priority: dto.priority,
          startAt: dto.startAt ? new Date(dto.startAt) : null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          timeEstimateS: dto.timeEstimateSeconds ?? null,
          position,
          custom: (dto.customFields ?? {}) as Prisma.InputJsonValue,
          leadId: dto.leadId ?? null,
          contactId: dto.contactId ?? null,
          accountId: dto.accountId ?? null,
          dealId: dto.dealId ?? null,
          assignees: { create: assigneeIds.map((employeeId) => ({ employeeId, assignedBy: actorId, assignedAt: now })) },
          watchers: { create: Array.from(new Set([actorId, ...assigneeIds])).map((employeeId) => ({ employeeId })) },
        },
        include: TASK_INCLUDE,
      });
      if (dto.tagIds?.length) {
        await tx.recordTag.createMany({ data: dto.tagIds.map((tagId) => ({ companyId: scope.companyId, entityType: 'task', entityId: created.id, tagId })), skipDuplicates: true });
      }
      await this.activity(tx, scope.companyId, created.id, actorId, TaskActivityType.CREATED, { title: dto.title, assigneeIds, statusId: status.id }, now);
      if (dto.parentId) await this.activity(tx, scope.companyId, dto.parentId, actorId, TaskActivityType.SUBTASK_ADDED, { subtaskId: created.id, title: dto.title }, now);
      return created;
    });

    for (const employeeId of assigneeIds.filter((id) => id !== actorId)) {
      await this.notifications.sendNotification(employeeId, NotificationType.TASK_ASSIGNED, 'New task assigned', `You have been assigned "${dto.title}"`, { taskId: task.id, priority: dto.priority, dueAt: dto.dueAt ?? null });
    }
    return task;
  }

  /** Legacy desktop/CRM create body (CreateTaskSchema): no list, coarse status only. */
  async createLegacy(scope: ScopeFilter, actorId: string, perms: TaskPerms, dto: CreateTaskDto) {
    if (dto.assigneeId !== actorId) {
      if (!perms.canAssign) throw new ForbiddenException('Permission missing: tasks.assign');
      assertEmployeesInScope(scope, [dto.assigneeId]);
    }
    const now = this.clock.now();
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          companyId: scope.companyId,
          title: dto.title,
          description: dto.description ?? null,
          assigneeId: dto.assigneeId,
          creatorId: actorId,
          leadId: dto.leadId ?? null,
          priority: dto.priority,
          dueAt: new Date(dto.dueAt),
          status: 'todo',
          position: now.getTime(),
          assignees: { create: [{ employeeId: dto.assigneeId, assignedBy: actorId, assignedAt: now }] },
          watchers: { create: Array.from(new Set([actorId, dto.assigneeId])).map((employeeId) => ({ employeeId })) },
        },
        include: TASK_INCLUDE,
      });
      if (dto.leadId) {
        await tx.leadTimeline.create({ data: { leadId: dto.leadId, actorId, type: 'task', refId: created.id, data: { title: dto.title, dueAt: dto.dueAt }, occurredAt: now } });
      }
      await this.activity(tx, scope.companyId, created.id, actorId, TaskActivityType.CREATED, { title: dto.title, assigneeIds: [dto.assigneeId], legacy: true }, now);
      return created;
    });
    if (dto.assigneeId !== actorId) {
      await this.notifications.sendNotification(dto.assigneeId, NotificationType.TASK_ASSIGNED, 'New task assigned', `You have been assigned "${dto.title}"`, { taskId: task.id, priority: dto.priority, dueAt: dto.dueAt });
    }
    return task;
  }

  async update(scope: ScopeFilter, actorId: string, perms: TaskPerms, id: string, dto: UpdateWorkTaskDto) {
    const task = await this.requireEditable(scope, perms, actorId, id);
    const now = this.clock.now();
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (k: string, from: unknown, to: unknown) => {
      if (to !== undefined && to !== from) changes[k] = { from, to };
    };
    track('title', task.title, dto.title);
    track('priority', task.priority, dto.priority);
    track('dueAt', task.dueAt?.toISOString() ?? null, dto.dueAt);
    track('startAt', task.startAt?.toISOString() ?? null, dto.startAt);
    track('timeEstimateS', task.timeEstimateS, dto.timeEstimateSeconds);

    // Move to another list: status becomes the first status of the same group in the target list.
    let statusId: string | undefined;
    let status: string | undefined;
    if (dto.listId && dto.listId !== task.listId) {
      const target = await this.prisma.taskList.findFirst({ where: { id: dto.listId, companyId: scope.companyId, archivedAt: null }, include: { statuses: { orderBy: { position: 'asc' } } } });
      if (!target) throw new NotFoundException('Target list not found');
      if (task.parentId) throw new BadRequestException('Move the parent task instead of a subtask');
      const group = task.statusRef?.group ?? groupFromLegacyStatus(task.status);
      const next = target.statuses.find((s) => s.group === group) ?? target.statuses[0];
      if (!next) throw new UnprocessableEntityException({ code: ErrorCodes.TASK_STATUS_NOT_IN_LIST, message: 'Target list has no statuses' });
      statusId = next.id;
      status = statusFromGroup(next.group);
      changes.listId = { from: task.listId, to: dto.listId };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          priority: dto.priority,
          startAt: dto.startAt === undefined ? undefined : dto.startAt ? new Date(dto.startAt) : null,
          dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
          timeEstimateS: dto.timeEstimateSeconds,
          position: dto.position,
          custom: dto.customFields ? ({ ...(task.custom as object), ...dto.customFields } as Prisma.InputJsonValue) : undefined,
          leadId: dto.leadId,
          contactId: dto.contactId,
          accountId: dto.accountId,
          dealId: dto.dealId,
          listId: dto.listId,
          statusId,
          status,
        },
        include: TASK_INCLUDE,
      });
      if (statusId) {
        // subtasks follow their parent into the new list
        await tx.task.updateMany({ where: { parentId: id }, data: { listId: dto.listId, statusId, status } });
      }
      if (dto.tagIds) {
        await tx.recordTag.deleteMany({ where: { entityType: 'task', entityId: id } });
        if (dto.tagIds.length) await tx.recordTag.createMany({ data: dto.tagIds.map((tagId) => ({ companyId: scope.companyId, entityType: 'task', entityId: id, tagId })), skipDuplicates: true });
      }
      if (Object.keys(changes).length) {
        await this.activity(tx, scope.companyId, id, actorId, changes.listId ? TaskActivityType.MOVED : TaskActivityType.FIELD_CHANGED, { changes }, now);
      }
      return updated;
    });
  }

  /** Status move (F24). Accepts the new statusId or the legacy coarse `status`. */
  async setStatus(scope: ScopeFilter, actorId: string, perms: TaskPerms, id: string, dto: SetTaskStatusDto) {
    const task = await this.requireEditable(scope, perms, actorId, id);
    const now = this.clock.now();
    let nextStatusId: string | null = task.statusId;
    let nextGroup: string;

    if (dto.statusId) {
      const status = await this.prisma.taskStatus.findFirst({ where: { id: dto.statusId, listId: task.listId ?? undefined } });
      if (!status || !task.listId) throw new UnprocessableEntityException({ code: ErrorCodes.TASK_STATUS_NOT_IN_LIST, message: 'Status does not belong to the task list' });
      nextStatusId = status.id;
      nextGroup = status.group;
    } else if (dto.status) {
      nextGroup = groupFromLegacyStatus(dto.status);
      if (task.listId) {
        const status = await this.prisma.taskStatus.findFirst({ where: { listId: task.listId, group: nextGroup }, orderBy: { position: 'asc' } });
        nextStatusId = status?.id ?? task.statusId;
      }
    } else {
      throw new BadRequestException('statusId or status is required');
    }

    const coarse = statusFromGroup(nextGroup);
    const completing = nextGroup === TaskStatusGroup.DONE;
    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.task.update({
        where: { id },
        data: { statusId: nextStatusId, status: coarse, completedAt: completing ? task.completedAt ?? now : null },
        include: TASK_INCLUDE,
      });
      await this.activity(tx, scope.companyId, id, actorId, TaskActivityType.STATUS_CHANGED, { fromStatusId: task.statusId, from: task.status, toStatusId: nextStatusId, to: coarse }, now);
      if (task.leadId) {
        await tx.leadTimeline.create({ data: { leadId: task.leadId, actorId, type: 'task', refId: id, data: { title: task.title, newStatus: coarse }, occurredAt: now } });
      }
      return res;
    });

    if (completing && !task.completedAt) {
      await this.targets.recordMetricEvent(scope.companyId, actorId, MetricKey.TASKS_COMPLETED, 1, 'task_completed', id, now);
    }
    await this.notifyWatchers(task.id, actorId, 'task_status', `"${task.title}" is now ${coarse.replace('_', ' ')}`, { taskId: id, status: coarse });
    this.gateway.emitToUser(task.assigneeId, WebSocketEvents.TASK_UPDATED, { taskId: id, status: coarse });
    return updated;
  }

  async addAssignees(scope: ScopeFilter, actorId: string, perms: TaskPerms, id: string, employeeIds: string[]) {
    const task = await this.requireEditable(scope, perms, actorId, id);
    if (employeeIds.some((e) => e !== actorId) && !perms.canAssign) throw new ForbiddenException('Permission missing: tasks.assign');
    assertEmployeesInScope(scope, employeeIds);
    const now = this.clock.now();
    const existing = new Set(task.assignees.map((a) => a.employeeId));
    const added = employeeIds.filter((e) => !existing.has(e));
    await this.prisma.$transaction(async (tx) => {
      if (added.length) {
        await tx.taskAssignee.createMany({ data: added.map((employeeId) => ({ taskId: id, employeeId, assignedBy: actorId, assignedAt: now })), skipDuplicates: true });
        await tx.taskWatcher.createMany({ data: added.map((employeeId) => ({ taskId: id, employeeId })), skipDuplicates: true });
        await this.activity(tx, scope.companyId, id, actorId, TaskActivityType.ASSIGNED, { employeeIds: added }, now);
      }
    });
    for (const employeeId of added.filter((e) => e !== actorId)) {
      await this.notifications.sendNotification(employeeId, NotificationType.TASK_ASSIGNED, 'Task assigned', `You have been assigned "${task.title}"`, { taskId: id });
    }
    return this.getById(scope, perms, id);
  }

  async removeAssignee(scope: ScopeFilter, actorId: string, perms: TaskPerms, id: string, employeeId: string) {
    const task = await this.requireEditable(scope, perms, actorId, id);
    const remaining = task.assignees.map((a) => a.employeeId).filter((e) => e !== employeeId);
    if (remaining.length === 0) throw new BadRequestException('A task needs at least one assignee');
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id, employeeId } });
      if (task.assigneeId === employeeId) await tx.task.update({ where: { id }, data: { assigneeId: remaining[0]! } });
      await this.activity(tx, scope.companyId, id, actorId, TaskActivityType.UNASSIGNED, { employeeId }, now);
    });
    return this.getById(scope, perms, id);
  }

  async archive(scope: ScopeFilter, actorId: string, perms: TaskPerms, id: string, restore = false) {
    const task = await this.prisma.task.findFirst({ where: { id, companyId: scope.companyId, deletedAt: null, AND: [taskScopeWhere(scope, perms.canManageSpaces)] } });
    if (!task) throw new NotFoundException('Task not found');
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.task.update({ where: { id }, data: { archivedAt: restore ? null : now } });
      await tx.task.updateMany({ where: { parentId: id }, data: { archivedAt: restore ? null : now } });
      await this.activity(tx, scope.companyId, id, actorId, restore ? TaskActivityType.RESTORED : TaskActivityType.ARCHIVED, {}, now);
      return res;
    });
  }

  /** FR-TASK-15. Controller requires tasks.manage; every id must be in scope. */
  async bulk(scope: ScopeFilter, actorId: string, perms: TaskPerms, dto: BulkTaskActionDto) {
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: dto.ids }, companyId: scope.companyId, deletedAt: null, AND: [taskScopeWhere(scope, perms.canManageSpaces)] },
      select: { id: true, listId: true, assignees: { select: { employeeId: true } }, assigneeId: true, creatorId: true },
    });
    if (tasks.length !== dto.ids.length) throw new NotFoundException('One or more tasks were not found');
    const ids = tasks.map((t) => t.id);
    const now = this.clock.now();

    switch (dto.action) {
      case 'status': {
        if (!dto.statusId) throw new BadRequestException('statusId is required');
        for (const id of ids) await this.setStatus(scope, actorId, perms, id, { statusId: dto.statusId });
        return { count: ids.length };
      }
      case 'assign': {
        if (!dto.employeeId) throw new BadRequestException('employeeId is required');
        for (const id of ids) await this.addAssignees(scope, actorId, perms, id, [dto.employeeId]);
        return { count: ids.length };
      }
      case 'unassign': {
        if (!dto.employeeId) throw new BadRequestException('employeeId is required');
        for (const t of tasks) {
          if (t.assignees.length > 1 && t.assignees.some((a) => a.employeeId === dto.employeeId)) await this.removeAssignee(scope, actorId, perms, t.id, dto.employeeId);
        }
        return { count: ids.length };
      }
      case 'move': {
        if (!dto.listId) throw new BadRequestException('listId is required');
        for (const id of ids) await this.update(scope, actorId, perms, id, { listId: dto.listId });
        return { count: ids.length };
      }
      case 'archive':
      case 'restore': {
        for (const id of ids) await this.archive(scope, actorId, perms, id, dto.action === 'restore');
        return { count: ids.length };
      }
      default:
        break;
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.action === 'priority') {
        if (!dto.priority) throw new BadRequestException('priority is required');
        await tx.task.updateMany({ where: { id: { in: ids } }, data: { priority: dto.priority } });
        for (const id of ids) await this.activity(tx, scope.companyId, id, actorId, TaskActivityType.FIELD_CHANGED, { changes: { priority: { to: dto.priority } }, bulk: true }, now);
      } else if (dto.action === 'due') {
        if (dto.dueAt === undefined) throw new BadRequestException('dueAt is required (null clears)');
        await tx.task.updateMany({ where: { id: { in: ids } }, data: { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } });
        for (const id of ids) await this.activity(tx, scope.companyId, id, actorId, TaskActivityType.FIELD_CHANGED, { changes: { dueAt: { to: dto.dueAt } }, bulk: true }, now);
      } else if (dto.action === 'add_tag') {
        if (!dto.tagId) throw new BadRequestException('tagId is required');
        await tx.recordTag.createMany({ data: ids.map((entityId) => ({ companyId: scope.companyId, entityType: 'task', entityId, tagId: dto.tagId! })), skipDuplicates: true });
      } else if (dto.action === 'remove_tag') {
        if (!dto.tagId) throw new BadRequestException('tagId is required');
        await tx.recordTag.deleteMany({ where: { entityType: 'task', entityId: { in: ids }, tagId: dto.tagId } });
      }
    });
    return { count: ids.length };
  }

  // ---- shared helpers (also used by TaskDetailsService) ---------------------

  async requireEditable(scope: ScopeFilter, perms: TaskPerms, actorId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, companyId: scope.companyId, deletedAt: null, AND: [taskScopeWhere(scope, perms.canManageSpaces)] },
      include: { assignees: { select: { employeeId: true } }, statusRef: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    assertCanEdit(task, actorId, perms.canManage);
    return task;
  }

  async requireVisible(scope: ScopeFilter, perms: TaskPerms, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, companyId: scope.companyId, deletedAt: null, AND: [taskScopeWhere(scope, perms.canManageSpaces)] },
      include: { assignees: { select: { employeeId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  activity(tx: Tx, companyId: string, taskId: string, actorId: string | null, type: string, data: Record<string, unknown>, at: Date) {
    return tx.taskActivity.create({ data: { companyId, taskId, actorId, type, data: data as Prisma.InputJsonValue, occurredAt: at } });
  }

  /** FR-TASK-11: notify every watcher except the actor. */
  async notifyWatchers(taskId: string, actorId: string, type: string, body: string, data: Record<string, unknown>) {
    const watchers = await this.prisma.taskWatcher.findMany({ where: { taskId, employeeId: { not: actorId } }, select: { employeeId: true } });
    for (const w of watchers) await this.notifications.sendNotification(w.employeeId, type, 'Task update', body, data);
  }

  private today() {
    const now = this.clock.now();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { start, end: new Date(start.getTime() + 86_400_000) };
  }

  static priorityRank(p: string): number {
    return PRIORITY_ORDER[p] ?? 9;
  }
}
