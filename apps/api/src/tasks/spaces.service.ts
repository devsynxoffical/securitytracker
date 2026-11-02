import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateSpaceDto,
  UpdateSpaceDto,
  SpaceMemberDto,
  CreateListDto,
  UpdateListDto,
  CreateStatusDto,
  UpdateStatusDto,
  ReorderStatusesDto,
  DefaultStatusDto,
  DEFAULT_TASK_STATUSES,
  TaskStatusGroup,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { spaceVisibilityWhere, statusFromGroup } from './task-scope.util';

/** Spaces, lists and statuses (FR-TASK-06, FR-TASK-07). */
@Injectable()
export class SpacesService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
  ) {}

  // ---- Spaces --------------------------------------------------------------

  async listSpaces(companyId: string, employeeId: string, canManage: boolean, includeArchived = false) {
    const spaces = await this.prisma.taskSpace.findMany({
      where: { companyId, ...(includeArchived ? {} : { archivedAt: null }), ...spaceVisibilityWhere(employeeId, canManage) },
      include: {
        members: { include: { employee: { select: { id: true, firstName: true, lastName: true, code: true } } } },
        lists: {
          where: includeArchived ? {} : { archivedAt: null },
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: { where: { archivedAt: null, deletedAt: null, parentId: null } } } } },
        },
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return spaces;
  }

  async getSpace(companyId: string, id: string, employeeId: string, canManage: boolean) {
    const space = await this.prisma.taskSpace.findFirst({
      where: { id, companyId, ...spaceVisibilityWhere(employeeId, canManage) },
      include: {
        members: { include: { employee: { select: { id: true, firstName: true, lastName: true, code: true } } } },
        lists: { where: { archivedAt: null }, orderBy: { position: 'asc' }, include: { statuses: { orderBy: { position: 'asc' } } } },
      },
    });
    if (!space) throw new NotFoundException('Space not found');
    return space;
  }

  async createSpace(companyId: string, actorId: string, dto: CreateSpaceDto) {
    const position = (await this.prisma.taskSpace.count({ where: { companyId } })) + 1;
    const memberIds = Array.from(new Set([actorId, ...(dto.memberIds ?? [])]));
    if (memberIds.length > 1) await this.assertEmployees(companyId, memberIds);
    return this.prisma.taskSpace.create({
      data: {
        companyId,
        name: dto.name,
        colour: dto.colour,
        icon: dto.icon ?? null,
        visibility: dto.visibility,
        defaultStatuses: (dto.defaultStatuses ?? DEFAULT_TASK_STATUSES) as unknown as Prisma.InputJsonValue,
        position,
        createdBy: actorId,
        members: { create: memberIds.map((employeeId) => ({ employeeId, role: employeeId === actorId ? 'admin' : 'member' })) },
      },
      include: { members: true },
    });
  }

  async updateSpace(companyId: string, id: string, dto: UpdateSpaceDto) {
    await this.requireSpace(companyId, id);
    return this.prisma.taskSpace.update({
      where: { id },
      data: {
        name: dto.name,
        colour: dto.colour,
        icon: dto.icon,
        visibility: dto.visibility,
        defaultStatuses: dto.defaultStatuses ? (dto.defaultStatuses as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async archiveSpace(companyId: string, id: string) {
    await this.requireSpace(companyId, id);
    return this.prisma.taskSpace.update({ where: { id }, data: { archivedAt: this.clock.now() } });
  }

  async addMember(companyId: string, spaceId: string, dto: SpaceMemberDto) {
    await this.requireSpace(companyId, spaceId);
    await this.assertEmployees(companyId, [dto.employeeId]);
    return this.prisma.taskSpaceMember.upsert({
      where: { spaceId_employeeId: { spaceId, employeeId: dto.employeeId } },
      update: { role: dto.role },
      create: { spaceId, employeeId: dto.employeeId, role: dto.role },
    });
  }

  async removeMember(companyId: string, spaceId: string, employeeId: string) {
    await this.requireSpace(companyId, spaceId);
    await this.prisma.taskSpaceMember.deleteMany({ where: { spaceId, employeeId } });
    return { removed: true };
  }

  // ---- Lists ---------------------------------------------------------------

  async listLists(companyId: string, employeeId: string, canManage: boolean, spaceId?: string, includeArchived = false) {
    return this.prisma.taskList.findMany({
      where: {
        companyId,
        ...(spaceId ? { spaceId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
        space: spaceVisibilityWhere(employeeId, canManage),
      },
      include: { statuses: { orderBy: { position: 'asc' } }, space: { select: { id: true, name: true, colour: true, visibility: true } } },
      orderBy: [{ spaceId: 'asc' }, { position: 'asc' }],
    });
  }

  async getList(companyId: string, id: string, employeeId: string, canManage: boolean) {
    const list = await this.prisma.taskList.findFirst({
      where: { id, companyId, space: spaceVisibilityWhere(employeeId, canManage) },
      include: { statuses: { orderBy: { position: 'asc' } }, space: { select: { id: true, name: true, colour: true, visibility: true } } },
    });
    if (!list) throw new NotFoundException('List not found');
    return list;
  }

  /** New lists copy the space's default statuses (14 rule 2). */
  async createList(companyId: string, dto: CreateListDto) {
    const space = await this.requireSpace(companyId, dto.spaceId);
    const defaults = (Array.isArray(space.defaultStatuses) && (space.defaultStatuses as unknown as DefaultStatusDto[]).length >= 2
      ? (space.defaultStatuses as unknown as DefaultStatusDto[])
      : DEFAULT_TASK_STATUSES);
    const position = (await this.prisma.taskList.count({ where: { spaceId: dto.spaceId } })) + 1;
    return this.prisma.taskList.create({
      data: {
        companyId,
        spaceId: dto.spaceId,
        name: dto.name,
        description: dto.description ?? null,
        position,
        statuses: { create: defaults.map((s, i) => ({ name: s.name, colour: s.colour ?? '#5C666E', group: s.group, position: i + 1 })) },
      },
      include: { statuses: { orderBy: { position: 'asc' } } },
    });
  }

  async updateList(companyId: string, id: string, dto: UpdateListDto) {
    await this.requireList(companyId, id);
    return this.prisma.taskList.update({ where: { id }, data: { name: dto.name, description: dto.description, position: dto.position } });
  }

  async archiveList(companyId: string, id: string) {
    await this.requireList(companyId, id);
    return this.prisma.taskList.update({ where: { id }, data: { archivedAt: this.clock.now() } });
  }

  async restoreList(companyId: string, id: string) {
    await this.requireList(companyId, id);
    return this.prisma.taskList.update({ where: { id }, data: { archivedAt: null } });
  }

  // ---- Statuses ------------------------------------------------------------

  async createStatus(companyId: string, listId: string, dto: CreateStatusDto) {
    await this.requireList(companyId, listId);
    const position = dto.position ?? (await this.prisma.taskStatus.count({ where: { listId } })) + 1;
    return this.prisma.taskStatus
      .create({ data: { listId, name: dto.name, colour: dto.colour, group: dto.group, position } })
      .catch(this.uniqueToConflict('Status'));
  }

  async updateStatus(companyId: string, listId: string, statusId: string, dto: UpdateStatusDto) {
    const status = await this.requireStatus(companyId, listId, statusId);
    const updated = await this.prisma.taskStatus
      .update({ where: { id: statusId }, data: { name: dto.name, colour: dto.colour, group: dto.group, position: dto.position } })
      .catch(this.uniqueToConflict('Status'));
    if (dto.group && dto.group !== status.group) {
      await this.assertGroupsCovered(listId);
      // tasks in this status follow the new group (14 rule 3)
      await this.prisma.task.updateMany({ where: { statusId }, data: { status: statusFromGroup(dto.group) } });
    }
    return updated;
  }

  async deleteStatus(companyId: string, listId: string, statusId: string) {
    await this.requireStatus(companyId, listId, statusId);
    const used = await this.prisma.task.count({ where: { statusId, deletedAt: null } });
    if (used > 0) throw new ConflictException('Status has tasks. Move them to another status first.');
    const deleted = await this.prisma.taskStatus.delete({ where: { id: statusId } });
    await this.assertGroupsCovered(listId).catch(async (e) => {
      // restore and rethrow so the list never loses its open/done coverage
      await this.prisma.taskStatus.create({ data: { id: deleted.id, listId, name: deleted.name, colour: deleted.colour, group: deleted.group, position: deleted.position } });
      throw e;
    });
    return deleted;
  }

  async reorderStatuses(companyId: string, listId: string, dto: ReorderStatusesDto) {
    const list = await this.requireList(companyId, listId);
    const ids = list.statuses.map((s) => s.id);
    if (ids.length !== dto.statusIds.length || dto.statusIds.some((id) => !ids.includes(id))) {
      throw new BadRequestException('statusIds must contain every status of the list exactly once');
    }
    await this.prisma.$transaction(dto.statusIds.map((id, i) => this.prisma.taskStatus.update({ where: { id }, data: { position: i + 1 } })));
    return this.prisma.taskStatus.findMany({ where: { listId }, orderBy: { position: 'asc' } });
  }

  // ---- helpers -------------------------------------------------------------

  async requireSpace(companyId: string, id: string) {
    const space = await this.prisma.taskSpace.findFirst({ where: { id, companyId } });
    if (!space) throw new NotFoundException('Space not found');
    return space;
  }

  async requireList(companyId: string, id: string) {
    const list = await this.prisma.taskList.findFirst({ where: { id, companyId }, include: { statuses: { orderBy: { position: 'asc' } } } });
    if (!list) throw new NotFoundException('List not found');
    return list;
  }

  private async requireStatus(companyId: string, listId: string, statusId: string) {
    const status = await this.prisma.taskStatus.findFirst({ where: { id: statusId, listId, list: { companyId } } });
    if (!status) throw new NotFoundException('Status not found');
    return status;
  }

  private async assertGroupsCovered(listId: string) {
    const statuses = await this.prisma.taskStatus.findMany({ where: { listId }, select: { group: true } });
    const groups = new Set(statuses.map((s) => s.group));
    if (!groups.has(TaskStatusGroup.OPEN) || !groups.has(TaskStatusGroup.DONE)) {
      throw new ConflictException('A list needs at least one open and one done status');
    }
  }

  private async assertEmployees(companyId: string, ids: string[]) {
    const count = await this.prisma.employee.count({ where: { companyId, id: { in: ids }, deletedAt: null } });
    if (count !== new Set(ids).size) throw new NotFoundException('One or more employees do not exist');
  }

  private uniqueToConflict(label: string) {
    return (e: unknown): never => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${label} with this name already exists in the list`);
      throw e;
    };
  }
}
