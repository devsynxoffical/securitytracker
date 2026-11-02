import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CrmEntityTypeValue, CrmActivityType } from '@company-os/contracts';
import { PrismaService } from '../../common/prisma.service';
import { CrmActivitiesService } from './activities.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Record <-> tag links shared by every CRM object (FR-CRM-24). */
@Injectable()
export class RecordTagsService {
  constructor(
    private prisma: PrismaService,
    private activities: CrmActivitiesService,
  ) {}

  async assertTagsExist(companyId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    const count = await this.prisma.tag.count({ where: { companyId, id: { in: tagIds } } });
    if (count !== new Set(tagIds).size) throw new NotFoundException('One or more tags do not exist');
  }

  /** Replaces the tag set of a record (used on create and full update). */
  async setTags(
    tx: Tx,
    companyId: string,
    entityType: CrmEntityTypeValue,
    entityId: string,
    tagIds: string[],
    actorId: string | null,
    at: Date,
  ) {
    const existing = await tx.recordTag.findMany({ where: { entityType, entityId }, select: { tagId: true } });
    const current = new Set(existing.map((e) => e.tagId));
    const wanted = new Set(tagIds);
    const toAdd = tagIds.filter((t) => !current.has(t));
    const toRemove = existing.map((e) => e.tagId).filter((t) => !wanted.has(t));

    if (toRemove.length) {
      await tx.recordTag.deleteMany({ where: { entityType, entityId, tagId: { in: toRemove } } });
    }
    if (toAdd.length) {
      await tx.recordTag.createMany({
        data: toAdd.map((tagId) => ({ companyId, entityType, entityId, tagId })),
        skipDuplicates: true,
      });
    }
    for (const tagId of toAdd) {
      await this.activities.append(tx, {
        companyId, entityType, entityId, type: CrmActivityType.TAG_ADDED, actorId, data: { tagId }, occurredAt: at,
      });
    }
    for (const tagId of toRemove) {
      await this.activities.append(tx, {
        companyId, entityType, entityId, type: CrmActivityType.TAG_REMOVED, actorId, data: { tagId }, occurredAt: at,
      });
    }
  }

  async addTag(tx: Tx, companyId: string, entityType: CrmEntityTypeValue, entityIds: string[], tagId: string, actorId: string, at: Date) {
    await tx.recordTag.createMany({
      data: entityIds.map((entityId) => ({ companyId, entityType, entityId, tagId })),
      skipDuplicates: true,
    });
    for (const entityId of entityIds) {
      await this.activities.append(tx, {
        companyId, entityType, entityId, type: CrmActivityType.TAG_ADDED, actorId, data: { tagId, bulk: true }, occurredAt: at,
      });
    }
  }

  async removeTag(tx: Tx, companyId: string, entityType: CrmEntityTypeValue, entityIds: string[], tagId: string, actorId: string, at: Date) {
    await tx.recordTag.deleteMany({ where: { entityType, entityId: { in: entityIds }, tagId } });
    for (const entityId of entityIds) {
      await this.activities.append(tx, {
        companyId, entityType, entityId, type: CrmActivityType.TAG_REMOVED, actorId, data: { tagId, bulk: true }, occurredAt: at,
      });
    }
  }

  /** Returns a map entityId -> tags for list rendering without N+1 queries. */
  async tagsFor(companyId: string, entityType: CrmEntityTypeValue, entityIds: string[]) {
    if (entityIds.length === 0) return new Map<string, Array<{ id: string; name: string; colour: string }>>();
    const links = await this.prisma.recordTag.findMany({
      where: { companyId, entityType, entityId: { in: entityIds } },
      include: { tag: { select: { id: true, name: true, colour: true } } },
    });
    const map = new Map<string, Array<{ id: string; name: string; colour: string }>>();
    for (const l of links) {
      const arr = map.get(l.entityId) ?? [];
      arr.push(l.tag);
      map.set(l.entityId, arr);
    }
    return map;
  }

  /** Ids of records of a type that carry a tag (for list filters). */
  async entityIdsWithTag(companyId: string, entityType: CrmEntityTypeValue, tagId: string): Promise<string[]> {
    const links = await this.prisma.recordTag.findMany({
      where: { companyId, entityType, tagId },
      select: { entityId: true },
    });
    return links.map((l) => l.entityId);
  }
}
