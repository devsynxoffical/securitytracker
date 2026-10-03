import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { CreateTaskDto, UpdateTaskStatusDto, TaskStatus, WebSocketEvents, NotificationType } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
  ) {}

  async listTasks(
    scopeFilter: ScopeFilter,
    filters?: { assigneeId?: string; leadId?: string; status?: string; dueToday?: boolean },
  ) {
    const where: any = { companyId: scopeFilter.companyId, deletedAt: null };

    if (scopeFilter.scope !== 'all') {
      where.assigneeId = { in: scopeFilter.allowedEmployeeIds };
    }

    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters?.leadId) where.leadId = filters.leadId;
    if (filters?.status) where.status = filters.status;

    if (filters?.dueToday) {
      const startOfDay = new Date(this.clock.nowIso().split('T')[0]! + 'T00:00:00.000Z');
      const endOfDay = new Date(this.clock.nowIso().split('T')[0]! + 'T23:59:59.999Z');
      where.dueAt = { gte: startOfDay, lte: endOfDay };
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, code: true, firstName: true, lastName: true } },
        lead: { select: { id: true, name: true, companyName: true } },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  async createTask(companyId: string, creatorId: string, dto: CreateTaskDto) {
    const now = this.clock.now();

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          companyId,
          title: dto.title,
          description: dto.description || null,
          assigneeId: dto.assigneeId,
          creatorId,
          leadId: dto.leadId || null,
          priority: dto.priority,
          dueAt: new Date(dto.dueAt),
          status: 'todo',
        },
      });

      if (dto.leadId) {
        await tx.leadTimeline.create({
          data: {
            leadId: dto.leadId,
            actorId: creatorId,
            type: 'task',
            refId: task.id,
            data: { title: dto.title, dueAt: dto.dueAt },
            occurredAt: now,
          },
        });
      }

      // Notify assignee if not the creator
      if (dto.assigneeId !== creatorId) {
        await this.notificationsService.sendNotification(
          dto.assigneeId,
          NotificationType.TASK_ASSIGNED,
          'New Task Assigned',
          `You have been assigned task: "${dto.title}"`,
          { taskId: task.id, priority: dto.priority, dueAt: dto.dueAt },
        );
      }

      return task;
    });
  }

  async updateTaskStatus(
    id: string,
    companyId: string,
    actorId: string,
    dto: UpdateTaskStatusDto,
    scopeFilter: ScopeFilter,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!task) throw new NotFoundException('Task not found');

    if (
      scopeFilter.scope !== 'all' &&
      task.assigneeId !== actorId &&
      !scopeFilter.allowedEmployeeIds.includes(task.assigneeId)
    ) {
      throw new ForbiddenException('Cannot update status of task outside scope');
    }

    const now = this.clock.now();
    const isCompleted = dto.status === TaskStatus.DONE;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          status: dto.status,
          completedAt: isCompleted ? now : null,
        },
      });

      if (task.leadId) {
        await tx.leadTimeline.create({
          data: {
            leadId: task.leadId,
            actorId,
            type: 'task',
            refId: task.id,
            data: { title: task.title, newStatus: dto.status },
            occurredAt: now,
          },
        });
      }

      // Record Metric Event for Tasks Completed
      if (isCompleted) {
        const attendanceDate = new Date(now.toISOString().split('T')[0]! + 'T00:00:00.000Z');
        await tx.metricEvent.create({
          data: {
            employeeId: actorId,
            metricKey: 'tasks_completed',
            amount: 1,
            occurredAt: now,
            periodDate: attendanceDate,
            refType: 'task_completed',
            refId: task.id,
          },
        });
      }

      this.gateway.emitToUser(task.assigneeId, WebSocketEvents.TASK_UPDATED, {
        taskId: task.id,
        status: dto.status,
      });

      return updated;
    });
  }
}
