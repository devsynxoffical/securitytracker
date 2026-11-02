import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateAnnouncementDto, UpdateAnnouncementDto, NotificationType, AnnouncementAudience } from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Announcements with audience targeting and read receipts (15 FR-HR-13). */
@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private notifications: NotificationsService,
  ) {}

  /** Everyone sees announcements addressed to them; publishers with announcements.send see all. */
  async list(companyId: string, viewer: { id: string; departmentId: string | null; teamId: string | null; roleId: string }, canSend: boolean, limit = 50) {
    const now = this.clock.now();
    const where: Prisma.AnnouncementWhereInput = { companyId };
    if (!canSend) {
      where.publishedAt = { lte: now };
      where.OR = [
        { audienceType: AnnouncementAudience.COMPANY },
        ...(viewer.departmentId ? [{ audienceType: AnnouncementAudience.DEPARTMENT, audienceId: viewer.departmentId }] : []),
        ...(viewer.teamId ? [{ audienceType: AnnouncementAudience.TEAM, audienceId: viewer.teamId }] : []),
        { audienceType: AnnouncementAudience.ROLE, audienceId: viewer.roleId },
      ];
    }
    const rows = await this.prisma.announcement.findMany({
      where,
      take: limit,
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      include: { _count: { select: { reads: true } }, reads: { where: { employeeId: viewer.id }, select: { readAt: true } } },
    });
    return rows.map((a) => ({ ...a, readCount: a._count.reads, readAt: a.reads[0]?.readAt ?? null, reads: undefined, _count: undefined }));
  }

  async create(companyId: string, actorId: string, dto: CreateAnnouncementDto) {
    const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : this.clock.now();
    const a = await this.prisma.announcement.create({
      data: { companyId, title: dto.title, body: dto.body, audienceType: dto.audienceType, audienceId: dto.audienceId ?? null, pinned: dto.pinned, publishedAt, createdBy: actorId },
    });
    if (publishedAt.getTime() <= this.clock.now().getTime()) await this.deliver(companyId, a.id, a.title, a.body, a.audienceType, a.audienceId);
    return a;
  }

  async update(companyId: string, id: string, dto: UpdateAnnouncementDto) {
    await this.get(companyId, id);
    return this.prisma.announcement.update({
      where: { id },
      data: { title: dto.title, body: dto.body, audienceType: dto.audienceType, audienceId: dto.audienceId, pinned: dto.pinned, publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined },
    });
  }

  async delete(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.prisma.announcement.delete({ where: { id } });
  }

  async markRead(companyId: string, id: string, employeeId: string) {
    await this.get(companyId, id);
    return this.prisma.announcementRead.upsert({
      where: { announcementId_employeeId: { announcementId: id, employeeId } },
      update: {},
      create: { announcementId: id, employeeId, readAt: this.clock.now() },
    });
  }

  async readers(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.prisma.announcementRead.findMany({ where: { announcementId: id }, orderBy: { readAt: 'desc' } });
  }

  private async get(companyId: string, id: string) {
    const a = await this.prisma.announcement.findFirst({ where: { id, companyId } });
    if (!a) throw new NotFoundException('Announcement not found');
    return a;
  }

  /** Resolves the audience to employees and sends one notification each. */
  async deliver(companyId: string, announcementId: string, title: string, body: string, audienceType: string, audienceId: string | null) {
    const where: Prisma.EmployeeWhereInput = { companyId, deletedAt: null, status: 'active' };
    if (audienceType === AnnouncementAudience.DEPARTMENT && audienceId) where.departmentId = audienceId;
    if (audienceType === AnnouncementAudience.TEAM && audienceId) where.teamId = audienceId;
    if (audienceType === AnnouncementAudience.ROLE && audienceId) where.roleId = audienceId;
    const employees = await this.prisma.employee.findMany({ where, select: { id: true } });
    for (const e of employees) {
      await this.notifications.sendNotification(e.id, NotificationType.ANNOUNCEMENT, title, body.slice(0, 280), { announcementId });
    }
    return employees.length;
  }
}
