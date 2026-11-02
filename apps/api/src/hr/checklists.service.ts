import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  CreateChecklistTemplateDto,
  UpdateChecklistTemplateDto,
  StartChecklistDto,
  ErrorCodes,
  NotificationType,
  SystemRoleNames,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { assertEmployeeInScope, employeeScopeWhere, dateUtc, addDays, isoDate } from './hr.util';

export interface ChecklistItem {
  id: string;
  title: string;
  ownerRole: 'hr' | 'manager' | 'it' | 'employee';
  dueAt: string;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
}

/** Onboarding and offboarding checklists (15 FR-HR-12, F26). */
@Injectable()
export class ChecklistsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
  ) {}

  // ---- Templates

  listTemplates(companyId: string, kind?: string) {
    return this.prisma.hrChecklistTemplate.findMany({ where: { companyId, ...(kind ? { kind } : {}) }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], include: { _count: { select: { instances: true } } } });
  }

  async createTemplate(companyId: string, dto: CreateChecklistTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.hrChecklistTemplate.updateMany({ where: { companyId, kind: dto.kind }, data: { isDefault: false } });
      return tx.hrChecklistTemplate.create({ data: { companyId, name: dto.name, kind: dto.kind, items: dto.items as Prisma.InputJsonValue, isDefault: dto.isDefault } });
    });
  }

  async updateTemplate(companyId: string, id: string, dto: UpdateChecklistTemplateDto) {
    const t = await this.getTemplate(companyId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.hrChecklistTemplate.updateMany({ where: { companyId, kind: dto.kind ?? t.kind, id: { not: id } }, data: { isDefault: false } });
      return tx.hrChecklistTemplate.update({ where: { id }, data: { name: dto.name, kind: dto.kind, items: dto.items ? (dto.items as Prisma.InputJsonValue) : undefined, isDefault: dto.isDefault } });
    });
  }

  async deleteTemplate(companyId: string, id: string) {
    await this.getTemplate(companyId, id);
    return this.prisma.hrChecklistTemplate.delete({ where: { id } }); // instances keep a null template_id
  }

  private async getTemplate(companyId: string, id: string) {
    const t = await this.prisma.hrChecklistTemplate.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  // ---- Instances

  async list(scope: ScopeFilter, employeeId?: string, kind?: string, status?: string) {
    if (employeeId) assertEmployeeInScope(scope, employeeId, true);
    return this.prisma.hrChecklist.findMany({
      where: { companyId: scope.companyId, ...employeeScopeWhere(scope), ...(employeeId ? { employeeId } : {}), ...(kind ? { kind } : {}), ...(status ? { status } : {}) },
      include: { employee: { select: { id: true, code: true, firstName: true, lastName: true, joinDate: true, department: { select: { name: true } } } }, template: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async start(scope: ScopeFilter, actorId: string, dto: StartChecklistDto) {
    assertEmployeeInScope(scope, dto.employeeId);
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: scope.companyId, deletedAt: null }, select: { id: true, joinDate: true, managerId: true, firstName: true, lastName: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    const template = dto.templateId
      ? await this.getTemplate(scope.companyId, dto.templateId)
      : await this.prisma.hrChecklistTemplate.findFirst({ where: { companyId: scope.companyId, kind: dto.kind, isDefault: true } });
    if (!template) throw new NotFoundException(`No default ${dto.kind} template. Create one first.`);
    if (template.kind !== dto.kind) throw new ConflictException('Template kind does not match');
    const open = await this.prisma.hrChecklist.findFirst({ where: { employeeId: dto.employeeId, kind: dto.kind, status: 'open' } });
    if (open) throw new ConflictException(`An open ${dto.kind} checklist already exists for this employee`);

    const anchor = dto.anchorDate ? dateUtc(dto.anchorDate) : dto.kind === 'onboarding' && employee.joinDate ? employee.joinDate : dateUtc(isoDate(this.clock.now()));
    const items: ChecklistItem[] = this.buildItems(template.items, anchor);
    const checklist = await this.prisma.hrChecklist.create({
      data: { companyId: scope.companyId, employeeId: dto.employeeId, templateId: template.id, kind: dto.kind, items: items as unknown as Prisma.InputJsonValue, startedAt: this.clock.now() },
    });
    if (employee.managerId && employee.managerId !== actorId) {
      await this.notifications.sendNotification(employee.managerId, NotificationType.ANNOUNCEMENT, `${dto.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'} started`, `${employee.firstName} ${employee.lastName}: ${items.filter((i) => i.ownerRole === 'manager').length} item(s) are yours`, { checklistId: checklist.id });
    }
    return checklist;
  }

  buildItems(raw: unknown, anchor: Date): ChecklistItem[] {
    const list = Array.isArray(raw) ? (raw as Array<{ title: string; ownerRole?: string; offsetDays?: number }>) : [];
    return list.map((t) => ({
      id: randomUUID(),
      title: t.title,
      ownerRole: (t.ownerRole as ChecklistItem['ownerRole']) ?? 'hr',
      dueAt: addDays(anchor, t.offsetDays ?? 0).toISOString(),
      done: false,
      doneBy: null,
      doneAt: null,
    }));
  }

  /** Item owners: hr/it = users with hr.checklists.manage; manager = employee's manager; employee = the person. */
  async setItem(scope: ScopeFilter, actor: { id: string; roleName: string }, canManage: boolean, checklistId: string, itemId: string, done: boolean) {
    const checklist = await this.prisma.hrChecklist.findFirst({ where: { id: checklistId, companyId: scope.companyId }, include: { employee: { select: { managerId: true } } } });
    if (!checklist) throw new NotFoundException('Checklist not found');
    const items = checklist.items as unknown as ChecklistItem[];
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException({ code: ErrorCodes.CHECKLIST_ITEM_NOT_FOUND, message: 'Checklist item not found' });
    const isEmployee = checklist.employeeId === actor.id;
    const isManager = checklist.employee.managerId === actor.id;
    const allowed = canManage || (item.ownerRole === 'employee' && isEmployee) || (item.ownerRole === 'manager' && isManager);
    if (!allowed) throw new ForbiddenException('This item belongs to another role');
    const now = this.clock.now();
    const next = items.map((i) => (i.id === itemId ? { ...i, done, doneBy: done ? actor.id : null, doneAt: done ? now.toISOString() : null } : i));
    const complete = next.every((i) => i.done);
    return this.prisma.hrChecklist.update({
      where: { id: checklistId },
      data: { items: next as unknown as Prisma.InputJsonValue, status: complete ? 'completed' : 'open', completedAt: complete ? now : null },
    });
  }

  /** Items owed by the caller: own employee items, manager items of direct reports, and hr/it items when they hold hr.checklists.manage. */
  async myItems(scope: ScopeFilter, actor: { id: string; roleName: string }, canManage: boolean) {
    const reports = await this.prisma.employee.findMany({ where: { managerId: actor.id, companyId: scope.companyId }, select: { id: true } });
    const reportIds = new Set(reports.map((r) => r.id));
    const checklists = await this.prisma.hrChecklist.findMany({
      where: { companyId: scope.companyId, status: 'open', ...(canManage ? {} : { employeeId: { in: [actor.id, ...reportIds] } }) },
      include: { employee: { select: { id: true, code: true, firstName: true, lastName: true } } },
    });
    const out: Array<ChecklistItem & { checklistId: string; kind: string; employee: { id: string; code: string; firstName: string; lastName: string } }> = [];
    for (const c of checklists) {
      for (const i of c.items as unknown as ChecklistItem[]) {
        if (i.done) continue;
        const mine =
          (i.ownerRole === 'employee' && c.employeeId === actor.id) ||
          (i.ownerRole === 'manager' && reportIds.has(c.employeeId)) ||
          ((i.ownerRole === 'hr' || i.ownerRole === 'it') && (canManage || actor.roleName === SystemRoleNames.ADMIN));
        if (mine) out.push({ ...i, checklistId: c.id, kind: c.kind, employee: c.employee });
      }
    }
    out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return { items: out };
  }
}
