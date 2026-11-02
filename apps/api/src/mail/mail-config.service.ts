import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  CreateMailLabelDto,
  UpdateMailLabelDto,
  CreateMailTemplateDto,
  UpdateMailTemplateDto,
  RenderTemplateDto,
  ErrorCodes,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';

/** Labels, templates and mailbox health (FR-MAIL-15, 16, 20). */
@Injectable()
export class MailConfigService {
  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private config: ConfigService,
  ) {}

  // ---- Labels
  listLabels(companyId: string) {
    return this.prisma.mailLabel.findMany({ where: { companyId }, include: { _count: { select: { threads: true } } }, orderBy: { name: 'asc' } }).then((rows) =>
      rows.map((r) => ({ id: r.id, name: r.name, colour: r.colour, usageCount: r._count.threads })),
    );
  }
  createLabel(companyId: string, dto: CreateMailLabelDto) {
    return this.prisma.mailLabel.create({ data: { companyId, name: dto.name, colour: dto.colour } }).catch(this.uniqueToConflict('Label'));
  }
  async updateLabel(companyId: string, id: string, dto: UpdateMailLabelDto) {
    await this.assertExists(this.prisma.mailLabel.findFirst({ where: { id, companyId } }), 'Label');
    return this.prisma.mailLabel.update({ where: { id }, data: dto }).catch(this.uniqueToConflict('Label'));
  }
  async deleteLabel(companyId: string, id: string) {
    await this.assertExists(this.prisma.mailLabel.findFirst({ where: { id, companyId } }), 'Label');
    return this.prisma.mailLabel.delete({ where: { id } });
  }

  // ---- Templates (shared: ownerId null; private: ownerId = caller)
  listTemplates(companyId: string, employeeId: string) {
    return this.prisma.mailTemplate.findMany({
      where: { companyId, OR: [{ ownerId: null }, { ownerId: employeeId }] },
      orderBy: [{ ownerId: 'asc' }, { name: 'asc' }],
    });
  }
  async createTemplate(companyId: string, employeeId: string, dto: CreateMailTemplateDto, canManageShared: boolean) {
    if (dto.shared && !canManageShared) throw new ForbiddenException('Permission missing: mail.templates.manage');
    return this.prisma.mailTemplate.create({
      data: { companyId, ownerId: dto.shared ? null : employeeId, name: dto.name, subject: dto.subject, bodyHtml: dto.bodyHtml },
    });
  }
  async updateTemplate(companyId: string, employeeId: string, id: string, dto: UpdateMailTemplateDto, canManageShared: boolean) {
    const t = await this.assertExists(this.prisma.mailTemplate.findFirst({ where: { id, companyId } }), 'Template');
    this.assertTemplateEditable(t, employeeId, canManageShared);
    if (dto.shared !== undefined && dto.shared !== (t.ownerId === null) && !canManageShared) throw new ForbiddenException('Permission missing: mail.templates.manage');
    return this.prisma.mailTemplate.update({
      where: { id },
      data: { name: dto.name, subject: dto.subject, bodyHtml: dto.bodyHtml, ownerId: dto.shared === undefined ? undefined : dto.shared ? null : employeeId },
    });
  }
  async deleteTemplate(companyId: string, employeeId: string, id: string, canManageShared: boolean) {
    const t = await this.assertExists(this.prisma.mailTemplate.findFirst({ where: { id, companyId } }), 'Template');
    this.assertTemplateEditable(t, employeeId, canManageShared);
    return this.prisma.mailTemplate.delete({ where: { id } });
  }

  /** Substitutes {{contact.firstName}}, {{contact.lastName}}, {{account.name}}, {{me.firstName}}, {{me.lastName}}. */
  async renderTemplate(companyId: string, employeeId: string, id: string, dto: RenderTemplateDto) {
    const t = await this.assertExists(this.prisma.mailTemplate.findFirst({ where: { id, companyId, OR: [{ ownerId: null }, { ownerId: employeeId }] } }), 'Template');
    const me = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
    let contactId = dto.contactId ?? null;
    if (!contactId && dto.threadId) {
      const thread = await this.prisma.mailThread.findUnique({ where: { id: dto.threadId }, select: { contactId: true } });
      contactId = thread?.contactId ?? null;
    }
    const contact = contactId
      ? await this.prisma.crmContact.findFirst({ where: { id: contactId, companyId }, select: { firstName: true, lastName: true, account: { select: { name: true } } } })
      : null;
    const vars = {
      contact: { firstName: contact?.firstName ?? '', lastName: contact?.lastName ?? '' },
      account: { name: contact?.account?.name ?? '' },
      me: { firstName: me?.firstName ?? '', lastName: me?.lastName ?? '' },
    };
    return { subject: renderPlaceholders(t.subject, vars), html: renderPlaceholders(t.bodyHtml, vars) };
  }

  // ---- Mailbox health (FR-MAIL-20)
  async mailboxHealth(companyId: string) {
    const now = this.clock.now();
    const rows = await this.prisma.mailbox.findMany({
      where: { companyId },
      select: { id: true, address: true, displayName: true, provider: true, imapHost: true, smtpHost: true, username: true, tokenStatus: true, lastSyncAt: true, watchExpiresAt: true, createdAt: true, _count: { select: { assignments: true, threads: true } } },
      orderBy: { address: 'asc' },
    });
    const items = rows.map((m) => {
      const staleSync = m.lastSyncAt ? now.getTime() - m.lastSyncAt.getTime() > 15 * 60_000 : true;
      // IMAP mailboxes poll; only Gmail has a push watch that can expire.
      const watchExpired = m.provider === 'imap' ? false : m.watchExpiresAt ? m.watchExpiresAt.getTime() < now.getTime() : true;
      const health = m.tokenStatus === 'demo' ? 'demo' : m.tokenStatus === 'disconnected' ? 'disconnected' : m.tokenStatus !== 'ok' ? 'error' : staleSync || watchExpired ? 'warning' : 'ok';
      return { ...m, assignmentsCount: m._count.assignments, threadsCount: m._count.threads, staleSync, watchExpired, health };
    });
    return { items, googleConfigured: this.googleConfigured(), imapSupported: true };
  }

  googleConfigured(): boolean {
    return Boolean(this.config.get<string>('GOOGLE_CLIENT_ID') && this.config.get<string>('GOOGLE_CLIENT_SECRET'));
  }

  // ---- helpers
  private assertTemplateEditable(t: { ownerId: string | null }, employeeId: string, canManageShared: boolean) {
    if (t.ownerId === null && !canManageShared) throw new ForbiddenException({ code: ErrorCodes.MAIL_TEMPLATE_PRIVATE, message: 'Shared templates need mail.templates.manage' });
    if (t.ownerId !== null && t.ownerId !== employeeId && !canManageShared) throw new ForbiddenException({ code: ErrorCodes.MAIL_TEMPLATE_PRIVATE, message: 'This template belongs to another user' });
  }
  private async assertExists<T>(p: Promise<T | null>, label: string): Promise<T> {
    const v = await p;
    if (!v) throw new NotFoundException(`${label} not found`);
    return v;
  }
  private uniqueToConflict(label: string) {
    return (e: unknown): never => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${label} with this name already exists`);
      throw e;
    };
  }
}

export function renderPlaceholders(text: string, vars: Record<string, Record<string, string>>): string {
  return text.replace(/\{\{\s*([a-zA-Z]+)\.([a-zA-Z]+)\s*\}\}/g, (_, obj: string, key: string) => vars[obj]?.[key] ?? '');
}
