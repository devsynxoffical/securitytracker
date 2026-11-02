import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClockService } from '../src/common/clock.service';
import { ConversationsService } from '../src/mail/conversations.service';
import { MailConfigService, renderPlaceholders } from '../src/mail/mail-config.service';
import { MailService } from '../src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { MailboxPermission } from '@company-os/contracts';

const MB = '00000000-0000-0000-0000-0000000000mb'.replace('mb', '01');
const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const T1 = '00000000-0000-0000-0000-000000000101';

function prismaMock() {
  const table = () => ({
    findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), createMany: vi.fn(),
    update: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0),
  });
  const p: any = {
    mailbox: table(), mailboxAssignment: table(), mailThread: table(), mailMessage: table(), mailAudit: table(), mailLabel: table(),
    mailThreadLabel: table(), mailComment: table(), mailTemplate: table(), mailThreadEvent: table(), employee: table(),
    crmContact: table(), crmContactEmail: table(), deal: table(), dealContact: table(), lead: table(), leadTimeline: table(),
  };
  p.$transaction = vi.fn((cb: any) => (typeof cb === 'function' ? cb(p) : Promise.all(cb)));
  return p;
}

function services(prisma: any) {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
  const config = new ConfigService({});
  const notifications: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  const gateway: any = { emitToUser: vi.fn() };
  const targets: any = { recordMetricEvent: vi.fn() };
  const mail = new MailService(prisma, clock, config, { get: vi.fn(), set: vi.fn() } as any, gateway, targets, { configured: () => false, oauth: () => null, forRefreshToken: vi.fn() } as any, { trigger: vi.fn().mockResolvedValue(false), setHandler: vi.fn() } as any, { settingsFor: vi.fn(), imap: vi.fn(), forMailbox: vi.fn(), verifySmtp: vi.fn(), sendSmtp: vi.fn(), encryptPassword: vi.fn() } as any);
  const conversations = new ConversationsService(prisma, clock, notifications, mail);
  const mailConfig = new MailConfigService(prisma, clock, config);
  return { clock, notifications, mail, conversations, mailConfig };
}

const grant = (prisma: any, perms: string[]) => prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: perms });

describe('ConversationsService views (FR-MAIL-13)', () => {
  it('builds the where clause per view', () => {
    const { conversations } = services(prismaMock());
    const base = { limit: 30 } as any;
    expect(conversations.viewWhere(MB, ME, { ...base, view: 'unassigned' })).toMatchObject({ mailboxId: MB, assigneeId: null, status: 'open' });
    expect(conversations.viewWhere(MB, ME, { ...base, view: 'mine' })).toMatchObject({ assigneeId: ME, status: { not: 'closed' } });
    expect(conversations.viewWhere(MB, ME, { ...base, view: 'snoozed' })).toMatchObject({ status: 'snoozed' });
    expect(conversations.viewWhere(MB, ME, { ...base, view: 'closed', labelId: T1 })).toMatchObject({ status: 'closed', labels: { some: { labelId: T1 } } });
    expect(conversations.viewWhere(MB, ME, { ...base, view: 'all', q: 'invoice' }).OR).toHaveLength(2);
  });

  it('list requires the read permission on the mailbox (denied case)', async () => {
    const prisma = prismaMock();
    const { conversations } = services(prisma);
    grant(prisma, [MailboxPermission.SEND]);
    await expect(conversations.list(MB, ME, { view: 'open', limit: 30 } as any)).rejects.toMatchObject({ status: 403 });
  });
});

describe('ConversationsService triage (FR-MAIL-11, 12, 18)', () => {
  it('assign needs triage: denied with read only, allowed with triage and notifies the assignee', async () => {
    const prisma = prismaMock();
    const { conversations, notifications } = services(prisma);
    grant(prisma, [MailboxPermission.READ]);
    await expect(conversations.assign(MB, ME, T1, OTHER)).rejects.toMatchObject({ status: 403 });

    prisma.mailboxAssignment.findUnique.mockReset();
    prisma.mailboxAssignment.findUnique
      .mockResolvedValueOnce({ permissions: [MailboxPermission.READ, MailboxPermission.TRIAGE] }) // actor
      .mockResolvedValueOnce({ permissions: [MailboxPermission.READ] }); // target has access
    prisma.mailThread.findFirst.mockResolvedValue({ id: T1, mailboxId: MB, subject: 'Quote', assigneeId: null, status: 'open' });
    prisma.mailThread.update.mockResolvedValue({ id: T1, assigneeId: OTHER });
    const res = await conversations.assign(MB, ME, T1, OTHER);
    expect(res.assigneeId).toBe(OTHER);
    expect(prisma.mailThreadEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'assigned' }) }));
    expect(notifications.sendNotification).toHaveBeenCalledWith(OTHER, expect.any(String), 'Conversation assigned', expect.stringContaining('Quote'), expect.any(Object));
  });

  it('snooze in the past is rejected; valid snooze stores snoozedUntil', async () => {
    const prisma = prismaMock();
    const { conversations } = services(prisma);
    grant(prisma, [MailboxPermission.TRIAGE]);
    prisma.mailThread.findFirst.mockResolvedValue({ id: T1, mailboxId: MB, status: 'open' });
    await expect(conversations.setStatus(MB, ME, T1, { status: 'snoozed', snoozedUntil: '2026-11-01T00:00:00.000Z' })).rejects.toMatchObject({ response: { code: 'MAIL_SNOOZE_IN_PAST' } });
    prisma.mailThread.update.mockImplementation(({ data }: any) => Promise.resolve({ id: T1, ...data }));
    const res = await conversations.setStatus(MB, ME, T1, { status: 'snoozed', snoozedUntil: '2026-11-03T09:00:00.000Z' });
    expect(res.status).toBe('snoozed');
    expect(res.snoozedUntil.toISOString()).toBe('2026-11-03T09:00:00.000Z');
    const closed = await conversations.setStatus(MB, ME, T1, { status: 'closed' });
    expect(closed.closedAt).toBeInstanceOf(Date);
  });

  it('comment needs the comment permission (denied) and notifies mentions (allowed)', async () => {
    const prisma = prismaMock();
    const { conversations, notifications } = services(prisma);
    grant(prisma, [MailboxPermission.READ, MailboxPermission.TRIAGE]);
    await expect(conversations.addComment(MB, ME, T1, { body: 'hi' })).rejects.toMatchObject({ status: 403 });
    grant(prisma, [MailboxPermission.READ, MailboxPermission.COMMENT]);
    prisma.mailThread.findFirst.mockResolvedValue({ id: T1, mailboxId: MB, subject: 'Quote' });
    prisma.mailComment.create.mockResolvedValue({ id: 'c1' });
    await conversations.addComment(MB, ME, T1, { body: 'look at this', mentions: [OTHER, ME] });
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1); // self excluded
    expect(notifications.sendNotification.mock.calls[0][0]).toBe(OTHER);
  });
});

describe('ConversationsService inbound (F28, FR-MAIL-17)', () => {
  it('reopens a closed conversation, sets lastInboundAt and links the matched contact', async () => {
    const prisma = prismaMock();
    const { conversations } = services(prisma);
    prisma.mailbox.findUnique.mockResolvedValue({ id: MB, companyId: 'c1', address: 'sales@acme.com' });
    prisma.crmContactEmail.findFirst.mockResolvedValue({ contactId: 'contact-1' });
    prisma.dealContact.findMany.mockResolvedValue([{ dealId: 'deal-1' }]);
    prisma.mailThread.findUnique.mockResolvedValue({ id: T1, status: 'closed', contactId: null, dealId: null });
    prisma.mailThread.upsert.mockImplementation(({ update }: any) => Promise.resolve({ id: T1, ...update }));
    prisma.mailMessage.findFirst.mockResolvedValue(null);

    const t = await conversations.ingestInbound(MB, { gmailThreadId: 'g1', gmailMessageId: 'm1', from: 'John@Client.com', to: ['sales@acme.com'], subject: 'Re: quote', sentAt: new Date('2026-11-02T09:00:00Z') });
    expect(t.status).toBe('open');
    expect(t.lastInboundAt.toISOString()).toBe('2026-11-02T09:00:00.000Z');
    expect(t.contactId).toBe('contact-1');
    expect(t.dealId).toBe('deal-1');
    // contact matching excludes the mailbox's own address
    expect(prisma.crmContactEmail.findFirst.mock.calls[0][0].where.emailLower.in).toEqual(['john@client.com']);
    const types = prisma.mailThreadEvent.create.mock.calls.map((c: any[]) => c[0].data.type);
    expect(types).toEqual(expect.arrayContaining(['status_changed', 'linked']));
  });

  it('matchContact returns null without addresses and no deal when several are open', async () => {
    const prisma = prismaMock();
    const { conversations } = services(prisma);
    expect(await conversations.matchContact('c1', [])).toBeNull();
    prisma.crmContactEmail.findFirst.mockResolvedValue({ contactId: 'contact-1' });
    prisma.dealContact.findMany.mockResolvedValue([{ dealId: 'd1' }, { dealId: 'd2' }]);
    expect(await conversations.matchContact('c1', ['a@b.com'])).toEqual({ contactId: 'contact-1', dealId: null });
  });
});

describe('MailConfigService templates (FR-MAIL-16)', () => {
  it('renders placeholders and blanks unknown ones', () => {
    const out = renderPlaceholders('Hi {{contact.firstName}} from {{ account.name }}, {{me.firstName}} here {{nope.x}}', {
      contact: { firstName: 'Sara', lastName: 'M' }, account: { name: 'Acme' }, me: { firstName: 'Dan', lastName: 'K' },
    });
    expect(out).toBe('Hi Sara from Acme, Dan here ');
  });

  it('shared templates need mail.templates.manage; private ones belong to the author', async () => {
    const prisma = prismaMock();
    const { mailConfig } = services(prisma);
    await expect(mailConfig.createTemplate('c1', ME, { name: 'x', subject: '', bodyHtml: '<p>x</p>', shared: true }, false)).rejects.toMatchObject({ status: 403 });
    prisma.mailTemplate.create.mockResolvedValue({ id: 't1' });
    await mailConfig.createTemplate('c1', ME, { name: 'x', subject: '', bodyHtml: '<p>x</p>', shared: false }, false);
    expect(prisma.mailTemplate.create.mock.calls[0][0].data.ownerId).toBe(ME);
    prisma.mailTemplate.findFirst.mockResolvedValue({ id: 't2', ownerId: OTHER });
    await expect(mailConfig.deleteTemplate('c1', ME, 't2', false)).rejects.toMatchObject({ response: { code: 'MAIL_TEMPLATE_PRIVATE' } });
    await expect(mailConfig.deleteTemplate('c1', ME, 't2', true)).resolves.toBeUndefined();
  });
});
