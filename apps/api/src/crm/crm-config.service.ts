import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateLookupDto,
  UpdateLookupDto,
  CreateTagDto,
  UpdateTagDto,
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  CreateSavedViewDto,
  UpdateSavedViewDto,
  CrmEntityTypeValue,
  SavedViewVisibility,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

/** Lead sources, lost reasons, tags, custom field definitions and saved views (FR-CRM-23 to 26). */
@Injectable()
export class CrmConfigService {
  constructor(private prisma: PrismaService) {}

  // ---- Lead sources -------------------------------------------------------

  listSources(companyId: string, includeInactive = false) {
    return this.prisma.leadSource.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { position: 'asc' },
    });
  }

  async createSource(companyId: string, dto: CreateLookupDto) {
    const position = dto.position ?? (await this.prisma.leadSource.count({ where: { companyId } })) + 1;
    return this.prisma.leadSource.create({ data: { companyId, name: dto.name, position, isActive: dto.isActive } }).catch(this.uniqueToConflict('Source'));
  }

  async updateSource(companyId: string, id: string, dto: UpdateLookupDto) {
    await this.assertExists(this.prisma.leadSource.findFirst({ where: { id, companyId } }), 'Source');
    return this.prisma.leadSource.update({ where: { id }, data: dto }).catch(this.uniqueToConflict('Source'));
  }

  async deleteSource(companyId: string, id: string) {
    await this.assertExists(this.prisma.leadSource.findFirst({ where: { id, companyId } }), 'Source');
    const used = await this.prisma.lead.count({ where: { sourceId: id } });
    if (used > 0) return this.prisma.leadSource.update({ where: { id }, data: { isActive: false } });
    return this.prisma.leadSource.delete({ where: { id } });
  }

  // ---- Lost reasons -------------------------------------------------------

  listLostReasons(companyId: string, includeInactive = false) {
    return this.prisma.lostReason.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { position: 'asc' },
    });
  }

  async createLostReason(companyId: string, dto: CreateLookupDto) {
    const position = dto.position ?? (await this.prisma.lostReason.count({ where: { companyId } })) + 1;
    return this.prisma.lostReason.create({ data: { companyId, name: dto.name, position, isActive: dto.isActive } }).catch(this.uniqueToConflict('Lost reason'));
  }

  async updateLostReason(companyId: string, id: string, dto: UpdateLookupDto) {
    await this.assertExists(this.prisma.lostReason.findFirst({ where: { id, companyId } }), 'Lost reason');
    return this.prisma.lostReason.update({ where: { id }, data: dto }).catch(this.uniqueToConflict('Lost reason'));
  }

  async deleteLostReason(companyId: string, id: string) {
    await this.assertExists(this.prisma.lostReason.findFirst({ where: { id, companyId } }), 'Lost reason');
    const used = (await this.prisma.lead.count({ where: { lostReasonId: id } })) + (await this.prisma.deal.count({ where: { lostReasonId: id } }));
    if (used > 0) return this.prisma.lostReason.update({ where: { id }, data: { isActive: false } });
    return this.prisma.lostReason.delete({ where: { id } });
  }

  // ---- Tags ---------------------------------------------------------------

  async listTags(companyId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { companyId },
      include: { _count: { select: { records: true } } },
      orderBy: { name: 'asc' },
    });
    return tags.map((t) => ({ id: t.id, name: t.name, colour: t.colour, usageCount: t._count.records }));
  }

  createTag(companyId: string, dto: CreateTagDto) {
    return this.prisma.tag.create({ data: { companyId, name: dto.name, colour: dto.colour } }).catch(this.uniqueToConflict('Tag'));
  }

  async updateTag(companyId: string, id: string, dto: UpdateTagDto) {
    await this.assertExists(this.prisma.tag.findFirst({ where: { id, companyId } }), 'Tag');
    return this.prisma.tag.update({ where: { id }, data: dto }).catch(this.uniqueToConflict('Tag'));
  }

  async deleteTag(companyId: string, id: string) {
    await this.assertExists(this.prisma.tag.findFirst({ where: { id, companyId } }), 'Tag');
    return this.prisma.tag.delete({ where: { id } }); // record_tags cascade
  }

  // ---- Custom fields ------------------------------------------------------

  listCustomFields(companyId: string, entityType?: CrmEntityTypeValue, includeInactive = false) {
    return this.prisma.customFieldDef.findMany({
      where: { companyId, ...(entityType ? { entityType } : {}), ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ entityType: 'asc' }, { position: 'asc' }],
    });
  }

  async createCustomField(companyId: string, dto: CreateCustomFieldDto) {
    const position = dto.position ?? (await this.prisma.customFieldDef.count({ where: { companyId, entityType: dto.entityType } })) + 1;
    return this.prisma.customFieldDef
      .create({
        data: {
          companyId,
          entityType: dto.entityType,
          key: dto.key,
          label: dto.label,
          type: dto.type,
          options: (dto.options ?? []) as Prisma.InputJsonValue,
          required: dto.required,
          position,
          isActive: dto.isActive,
        },
      })
      .catch(this.uniqueToConflict('Custom field'));
  }

  async updateCustomField(companyId: string, id: string, dto: UpdateCustomFieldDto) {
    await this.assertExists(this.prisma.customFieldDef.findFirst({ where: { id, companyId } }), 'Custom field');
    return this.prisma.customFieldDef.update({
      where: { id },
      data: {
        label: dto.label,
        type: dto.type,
        options: dto.options ? (dto.options as Prisma.InputJsonValue) : undefined,
        required: dto.required,
        position: dto.position,
        isActive: dto.isActive,
      },
    });
  }

  /** Definitions are deactivated, never dropped, so stored values keep their meaning. */
  async deleteCustomField(companyId: string, id: string) {
    await this.assertExists(this.prisma.customFieldDef.findFirst({ where: { id, companyId } }), 'Custom field');
    return this.prisma.customFieldDef.update({ where: { id }, data: { isActive: false } });
  }

  // ---- Saved views --------------------------------------------------------

  listViews(scope: ScopeFilter, entityType?: CrmEntityTypeValue) {
    return this.prisma.savedView.findMany({
      where: {
        companyId: scope.companyId,
        ...(entityType ? { entityType } : {}),
        OR: [
          { ownerId: scope.employeeId },
          { visibility: SavedViewVisibility.COMPANY },
          ...(scope.scope === 'all' ? [] : [{ visibility: SavedViewVisibility.TEAM, ownerId: { in: scope.allowedEmployeeIds } }]),
          ...(scope.scope === 'all' ? [{ visibility: SavedViewVisibility.TEAM }] : []),
        ],
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createView(companyId: string, ownerId: string, dto: CreateSavedViewDto, canManageCompany: boolean) {
    if (dto.visibility === SavedViewVisibility.COMPANY && !canManageCompany) {
      throw new ForbiddenException('Permission missing: crm.config.manage');
    }
    const dup = await this.prisma.savedView.findFirst({ where: { companyId, entityType: dto.entityType, name: dto.name, OR: [{ ownerId }, { visibility: SavedViewVisibility.COMPANY }] } });
    if (dup) throw new ConflictException('A view with this name already exists');
    return this.prisma.savedView.create({
      data: {
        companyId,
        ownerId,
        entityType: dto.entityType,
        name: dto.name,
        visibility: dto.visibility,
        filters: dto.filters as Prisma.InputJsonValue,
        sort: dto.sort ? (dto.sort as Prisma.InputJsonValue) : undefined,
        columns: dto.columns ? (dto.columns as Prisma.InputJsonValue) : undefined,
        isDefault: dto.isDefault,
      },
    });
  }

  async updateView(companyId: string, actorId: string, id: string, dto: UpdateSavedViewDto, canManageCompany: boolean) {
    const view = await this.assertExists(this.prisma.savedView.findFirst({ where: { id, companyId } }), 'View');
    if (view.ownerId !== actorId && !canManageCompany) throw new ForbiddenException('You can only edit your own views');
    if (dto.visibility === SavedViewVisibility.COMPANY && !canManageCompany) throw new ForbiddenException('Permission missing: crm.config.manage');
    return this.prisma.savedView.update({
      where: { id },
      data: {
        name: dto.name,
        visibility: dto.visibility,
        filters: dto.filters ? (dto.filters as Prisma.InputJsonValue) : undefined,
        sort: dto.sort ? (dto.sort as Prisma.InputJsonValue) : undefined,
        columns: dto.columns ? (dto.columns as Prisma.InputJsonValue) : undefined,
        isDefault: dto.isDefault,
      },
    });
  }

  async deleteView(companyId: string, actorId: string, id: string, canManageCompany: boolean) {
    const view = await this.assertExists(this.prisma.savedView.findFirst({ where: { id, companyId } }), 'View');
    if (view.ownerId !== actorId && !canManageCompany) throw new ForbiddenException('You can only delete your own views');
    return this.prisma.savedView.delete({ where: { id } });
  }

  // ---- helpers ------------------------------------------------------------

  private async assertExists<T>(p: Promise<T | null>, label: string): Promise<T> {
    const v = await p;
    if (!v) throw new NotFoundException(`${label} not found`);
    return v;
  }

  private uniqueToConflict(label: string) {
    return (e: unknown): never => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`${label} with this name already exists`);
      }
      throw e;
    };
  }
}
