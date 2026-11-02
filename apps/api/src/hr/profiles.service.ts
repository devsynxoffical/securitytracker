import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UpdateProfileDto, CreateHrDocumentDto, UpdateHrDocumentDto } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';
import { CustomFieldsService } from '../crm/shared/custom-fields.service';
import { assertEmployeeInScope, dateUtc, addDays } from './hr.util';

/** Employee profiles, documents and the org chart (15 FR-HR-10, 11, 14). */
@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private customFields: CustomFieldsService,
  ) {}

  async get(scope: ScopeFilter, employeeId: string) {
    assertEmployeeInScope(scope, employeeId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: scope.companyId, deletedAt: null },
      select: {
        id: true, code: true, firstName: true, lastName: true, email: true, phone: true, status: true, joinDate: true, lastLoginAt: true, createdAt: true,
        role: { select: { id: true, name: true, rank: true } },
        department: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        manager: { select: { id: true, code: true, firstName: true, lastName: true } },
        directReports: { where: { deletedAt: null }, select: { id: true, code: true, firstName: true, lastName: true } },
        profile: true,
        employeeSchedules: { include: { schedule: { select: { id: true, name: true, startTime: true, endTime: true, workdays: true } } }, orderBy: { effectiveFrom: 'desc' } },
        devices: { select: { id: true, name: true, status: true, osVersion: true, lastSeenAt: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const [documents, checklists] = await Promise.all([
      this.prisma.hrDocument.findMany({ where: { companyId: scope.companyId, employeeId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.hrChecklist.findMany({ where: { companyId: scope.companyId, employeeId }, orderBy: { startedAt: 'desc' } }),
    ]);
    return { ...employee, profile: employee.profile ?? { employeeId, address: {}, emergencyContact: {}, custom: {} }, documents, checklists };
  }

  async update(scope: ScopeFilter, employeeId: string, dto: UpdateProfileDto) {
    assertEmployeeInScope(scope, employeeId);
    const exists = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: scope.companyId, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException('Employee not found');
    const custom = dto.customFields ? await this.customFields.validate(scope.companyId, 'employee' as never, dto.customFields, { partial: true }) : undefined;
    const existing = await this.prisma.employeeProfile.findUnique({ where: { employeeId } });
    const data = {
      dateOfBirth: dto.dateOfBirth === undefined ? undefined : dto.dateOfBirth ? dateUtc(dto.dateOfBirth) : null,
      gender: dto.gender,
      nationality: dto.nationality,
      personalEmail: dto.personalEmail,
      address: dto.address ? (dto.address as Prisma.InputJsonValue) : undefined,
      emergencyContact: dto.emergencyContact ? (dto.emergencyContact as Prisma.InputJsonValue) : undefined,
      designation: dto.designation,
      employmentType: dto.employmentType,
      workLocation: dto.workLocation,
      probationEnd: dto.probationEnd === undefined ? undefined : dto.probationEnd ? dateUtc(dto.probationEnd) : null,
      custom: custom ? ({ ...((existing?.custom as object) ?? {}), ...custom } as Prisma.InputJsonValue) : undefined,
    };
    return this.prisma.employeeProfile.upsert({ where: { employeeId }, update: data, create: { employeeId, ...data, address: data.address ?? {}, emergencyContact: data.emergencyContact ?? {}, custom: data.custom ?? {} } });
  }

  // ---- Documents

  async listDocuments(scope: ScopeFilter, employeeId: string) {
    assertEmployeeInScope(scope, employeeId);
    return this.prisma.hrDocument.findMany({ where: { companyId: scope.companyId, employeeId }, orderBy: { createdAt: 'desc' } });
  }

  async createDocument(scope: ScopeFilter, actorId: string, employeeId: string, dto: CreateHrDocumentDto) {
    assertEmployeeInScope(scope, employeeId);
    return this.prisma.hrDocument.create({
      data: {
        companyId: scope.companyId,
        employeeId,
        name: dto.name,
        type: dto.type,
        issuedAt: dto.issuedAt ? dateUtc(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? dateUtc(dto.expiresAt) : null,
        note: dto.note ?? null,
        objectKey: dto.objectKey ?? null,
        uploadedBy: actorId,
      },
    });
  }

  async updateDocument(scope: ScopeFilter, employeeId: string, id: string, dto: UpdateHrDocumentDto) {
    await this.getDocument(scope, employeeId, id);
    return this.prisma.hrDocument.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        issuedAt: dto.issuedAt === undefined ? undefined : dto.issuedAt ? dateUtc(dto.issuedAt) : null,
        expiresAt: dto.expiresAt === undefined ? undefined : dto.expiresAt ? dateUtc(dto.expiresAt) : null,
        note: dto.note,
        objectKey: dto.objectKey,
      },
    });
  }

  async deleteDocument(scope: ScopeFilter, employeeId: string, id: string) {
    await this.getDocument(scope, employeeId, id);
    return this.prisma.hrDocument.delete({ where: { id } });
  }

  private async getDocument(scope: ScopeFilter, employeeId: string, id: string) {
    assertEmployeeInScope(scope, employeeId);
    const doc = await this.prisma.hrDocument.findFirst({ where: { id, employeeId, companyId: scope.companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /** Documents expiring within 30 days (reminder source for FR-HR-11). */
  async expiring(scope: ScopeFilter, days = 30) {
    const now = this.clock.now();
    const until = addDays(now, days);
    return this.prisma.hrDocument.findMany({
      where: { companyId: scope.companyId, expiresAt: { gte: now, lte: until }, ...(scope.scope === 'all' ? {} : { employeeId: { in: scope.allowedEmployeeIds } }) },
      orderBy: { expiresAt: 'asc' },
    });
  }

  // ---- Org chart (FR-HR-14)

  async orgChart(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, deletedAt: null, status: { not: 'disabled' } },
      select: { id: true, code: true, firstName: true, lastName: true, managerId: true, role: { select: { name: true } }, department: { select: { id: true, name: true } }, team: { select: { id: true, name: true } }, profile: { select: { designation: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const departments = await this.prisma.department.findMany({
      where: { companyId },
      select: { id: true, name: true, managerId: true, teams: { select: { id: true, name: true, leaderId: true, _count: { select: { employees: true } } } }, _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    type Node = (typeof employees)[number] & { reports: Node[] };
    const byId = new Map<string, Node>(employees.map((e) => [e.id, { ...e, reports: [] }]));
    const roots: Node[] = [];
    for (const node of byId.values()) {
      const parent = node.managerId ? byId.get(node.managerId) : undefined;
      if (parent && parent.id !== node.id) parent.reports.push(node);
      else roots.push(node);
    }
    return { tree: roots, departments, total: employees.length };
  }
}
