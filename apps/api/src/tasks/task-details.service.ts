import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  CreateCommentDto,
  UpdateCommentDto,
  CreateChecklistDto,
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
  CreateTimeEntryDto,
  TaskActivityType,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { TasksService, TaskPerms } from './tasks.service';
import { toCursorPage } from '../crm/shared/crm.util';

/** Comments, checklists, time entries and the activity log (FR-TASK-09, 10, 14). */
@Injectable()
export class TaskDetailsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
    private tasks: TasksService,
  ) {}

  // ---- Comments ------------------------------------------------------------

  async listComments(scope: ScopeFilter, perms: TaskPerms, taskId: string) {
    await this.tasks.requireVisible(scope, perms, taskId);
    const rows = await this.prisma.taskComment.findMany({ where: { taskId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
    const authors = await this.prisma.employee.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true, code: true } });
    const byId = new Map(authors.map((a) => [a.id, a]));
    return { items: rows.map((r) => ({ ...r, author: byId.get(r.authorId) ?? null })) };
  }

  async addComment(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, dto: CreateCommentDto) {
    const task = await this.tasks.requireVisible(scope, perms, taskId);
    const now = this.clock.now();
    const mentions = Array.from(new Set(dto.mentions ?? []));
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskComment.create({ data: { taskId, authorId: actorId, body: dto.body, mentions, createdAt: now } });
      // author and mentioned users become watchers (FR-TASK-11)
      await tx.taskWatcher.createMany({ data: [actorId, ...mentions].map((employeeId) => ({ taskId, employeeId })), skipDuplicates: true });
      await this.tasks.activity(tx, scope.companyId, taskId, actorId, TaskActivityType.COMMENT, { commentId: created.id, snippet: dto.body.slice(0, 120) }, now);
      return created;
    });
    for (const employeeId of mentions.filter((m) => m !== actorId)) {
      await this.notifications.sendNotification(employeeId, 'task_mention', 'You were mentioned', `Mentioned in a comment on "${task.title}"`, { taskId, commentId: comment.id });
    }
    await this.tasks.notifyWatchers(taskId, actorId, 'task_comment', `New comment on "${task.title}"`, { taskId, commentId: comment.id });
    return comment;
  }

  async updateComment(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, commentId: string, dto: UpdateCommentDto) {
    await this.tasks.requireVisible(scope, perms, taskId);
    const comment = await this.requireComment(taskId, commentId);
    if (comment.authorId !== actorId && !perms.canManage) throw new ForbiddenException('Only the author can edit a comment');
    return this.prisma.taskComment.update({ where: { id: commentId }, data: { body: dto.body, mentions: dto.mentions, editedAt: this.clock.now() } });
  }

  async deleteComment(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, commentId: string) {
    await this.tasks.requireVisible(scope, perms, taskId);
    const comment = await this.requireComment(taskId, commentId);
    if (comment.authorId !== actorId && !perms.canManage) throw new ForbiddenException('Only the author can delete a comment');
    return this.prisma.taskComment.update({ where: { id: commentId }, data: { deletedAt: this.clock.now() } });
  }

  // ---- Checklists ----------------------------------------------------------

  async addChecklist(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, dto: CreateChecklistDto) {
    await this.tasks.requireEditable(scope, perms, actorId, taskId);
    const position = (await this.prisma.taskChecklist.count({ where: { taskId } })) + 1;
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.taskChecklist.create({ data: { taskId, title: dto.title, position }, include: { items: true } });
      await this.tasks.activity(tx, scope.companyId, taskId, actorId, TaskActivityType.CHECKLIST, { action: 'created', checklistId: created.id, title: dto.title }, now);
      return created;
    });
  }

  async deleteChecklist(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, checklistId: string) {
    await this.tasks.requireEditable(scope, perms, actorId, taskId);
    await this.requireChecklist(taskId, checklistId);
    return this.prisma.taskChecklist.delete({ where: { id: checklistId } });
  }

  async addChecklistItem(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, checklistId: string, dto: CreateChecklistItemDto) {
    await this.tasks.requireEditable(scope, perms, actorId, taskId);
    await this.requireChecklist(taskId, checklistId);
    const position = (await this.prisma.taskChecklistItem.count({ where: { checklistId } })) + 1;
    return this.prisma.taskChecklistItem.create({ data: { checklistId, title: dto.title, position } });
  }

  async updateChecklistItem(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, checklistId: string, itemId: string, dto: UpdateChecklistItemDto) {
    await this.tasks.requireEditable(scope, perms, actorId, taskId);
    await this.requireChecklist(taskId, checklistId);
    const item = await this.prisma.taskChecklistItem.findFirst({ where: { id: itemId, checklistId } });
    if (!item) throw new NotFoundException('Checklist item not found');
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskChecklistItem.update({
        where: { id: itemId },
        data: {
          title: dto.title,
          position: dto.position,
          ...(dto.done === undefined ? {} : { done: dto.done, doneBy: dto.done ? actorId : null, doneAt: dto.done ? now : null }),
        },
      });
      if (dto.done !== undefined && dto.done !== item.done) {
        await this.tasks.activity(tx, scope.companyId, taskId, actorId, TaskActivityType.CHECKLIST, { action: dto.done ? 'item_done' : 'item_reopened', itemId, title: item.title }, now);
      }
      return updated;
    });
  }

  async deleteChecklistItem(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, checklistId: string, itemId: string) {
    await this.tasks.requireEditable(scope, perms, actorId, taskId);
    await this.requireChecklist(taskId, checklistId);
    await this.prisma.taskChecklistItem.deleteMany({ where: { id: itemId, checklistId } });
    return { deleted: true };
  }

  // ---- Time entries --------------------------------------------------------

  async listTimeEntries(scope: ScopeFilter, perms: TaskPerms, taskId: string) {
    await this.tasks.requireVisible(scope, perms, taskId);
    const rows = await this.prisma.taskTimeEntry.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } });
    const ids = Array.from(new Set(rows.map((r) => r.employeeId)));
    const people = await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    const byId = new Map(people.map((p) => [p.id, p]));
    return { items: rows.map((r) => ({ ...r, employee: byId.get(r.employeeId) ?? null })), totalS: rows.reduce((s, r) => s + r.durationS, 0) };
  }

  async addTimeEntry(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, dto: CreateTimeEntryDto) {
    const task = await this.tasks.requireVisible(scope, perms, taskId);
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    const durationS = dto.durationSeconds ?? Math.round(((endedAt as Date).getTime() - (startedAt as Date).getTime()) / 1000);
    if (!Number.isFinite(durationS) || durationS <= 0) throw new ForbiddenException('Time entry must be positive');
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.taskTimeEntry.create({ data: { taskId, employeeId: actorId, startedAt, endedAt, durationS, note: dto.note ?? null, createdAt: now } });
      await tx.task.update({ where: { id: taskId }, data: { timeSpentS: task.timeSpentS + durationS } });
      await tx.taskWatcher.createMany({ data: [{ taskId, employeeId: actorId }], skipDuplicates: true });
      await this.tasks.activity(tx, scope.companyId, taskId, actorId, TaskActivityType.TIME_LOGGED, { entryId: entry.id, durationS, note: dto.note ?? null }, now);
      return entry;
    });
  }

  async deleteTimeEntry(scope: ScopeFilter, perms: TaskPerms, actorId: string, taskId: string, entryId: string) {
    const task = await this.tasks.requireVisible(scope, perms, taskId);
    const entry = await this.prisma.taskTimeEntry.findFirst({ where: { id: entryId, taskId } });
    if (!entry) throw new NotFoundException('Time entry not found');
    if (entry.employeeId !== actorId && !perms.canManage) throw new ForbiddenException('Only the author or a manager can delete a time entry');
    return this.prisma.$transaction(async (tx) => {
      await tx.taskTimeEntry.delete({ where: { id: entryId } });
      await tx.task.update({ where: { id: taskId }, data: { timeSpentS: Math.max(0, task.timeSpentS - entry.durationS) } });
      return { deleted: true };
    });
  }

  // ---- Activities ----------------------------------------------------------

  async listActivities(scope: ScopeFilter, perms: TaskPerms, taskId: string, cursor?: string, limit = 50) {
    await this.tasks.requireVisible(scope, perms, taskId);
    const rows = await this.prisma.taskActivity.findMany({
      where: { taskId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const page = toCursorPage(rows, limit);
    const ids = Array.from(new Set(page.items.map((r) => r.actorId).filter((x): x is string => Boolean(x))));
    const people = await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
    const byId = new Map(people.map((p) => [p.id, p]));
    return { ...page, items: page.items.map((r) => ({ ...r, actor: r.actorId ? byId.get(r.actorId) ?? null : null })) };
  }

  // ---- helpers -------------------------------------------------------------

  private async requireComment(taskId: string, commentId: string) {
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId, deletedAt: null } });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private async requireChecklist(taskId: string, checklistId: string) {
    const checklist = await this.prisma.taskChecklist.findFirst({ where: { id: checklistId, taskId } });
    if (!checklist) throw new NotFoundException('Checklist not found');
    return checklist;
  }
}
