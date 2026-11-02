import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../src/common/clock.service';
import { CryptoUtil } from '../src/common/crypto.util';
import { GmailApiError, GmailClient, retryDelayMs, toMessageMeta, parseAddressList, buildRawMessage } from '../src/mail/gmail-client';
import { MailSyncService, toInbound, isOutbound, needsWatchRenewal } from '../src/mail/mail-sync.service';
import { MailService } from '../src/mail/mail.service';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MB = '00000000-0000-0000-0000-000000000501';

function prismaMock() {
  const table = () => ({ findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() });
  const p: any = { mailbox: table(), mailboxAssignment: table(), mailThread: table(), mailMessage: table(), securityAlert: table(), mailAudit: table() };
  p.$transaction = vi.fn((cb: any) => cb(p));
  return p;
}

function syncService(prisma: any, client: Partial<GmailClient>, configured = true) {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
  const config = new ConfigService({ ENCRYPTION_SECRET: KEY });
  const conversations: any = { ingestInbound: vi.fn().mockResolvedValue({ id: 't1' }) };
  const notifications: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  const gateway: any = { emitToUser: vi.fn() };
  const factory: any = { configured: () => configured, oauth: () => (configured ? { clientId: 'x', clientSecret: 'y', redirectUri: 'z' } : null), forRefreshToken: vi.fn().mockReturnValue(client) };
  const imapSync: any = { syncMailbox: vi.fn().mockResolvedValue({ mailboxId: MB, mode: 'incremental', fetched: 0, inbound: 0, outbound: 0, historyId: null }) };
  const svc = new MailSyncService(prisma, clock, config, conversations, notifications, gateway, factory, imapSync);
  return { svc, conversations, notifications, gateway, clock, imapSync };
}

const mailboxRow = (over: Record<string, unknown> = {}) => ({
  id: MB, companyId: 'c1', address: 'sales@acme.com', refreshTokenEnc: CryptoUtil.encryptField('rt', KEY), tokenStatus: 'ok', historyId: '100', connectedBy: 'admin-1', watchExpiresAt: null, ...over,
});

const meta = (over: Record<string, unknown> = {}) => ({
  id: 'm1', threadId: 'th1', labelIds: ['INBOX'], snippet: 'hello', internalDate: new Date('2026-11-02T09:00:00Z'), from: 'client@example.com', to: ['sales@acme.com'], cc: [], subject: 'Quote', hasAttachments: false, ...over,
});

describe('gmail-client helpers', () => {
  it('maps metadata payload to message meta', () => {
    const m = toMessageMeta({
      id: 'm1', threadId: 'th1', labelIds: ['INBOX'], snippet: 'Hi', internalDate: '1793617200000',
      payload: { headers: [{ name: 'From', value: 'Priya N <Priya@Example.com>' }, { name: 'To', value: 'a@x.com, B <b@x.com>' }, { name: 'Subject', value: 'Quote' }], parts: [{ filename: 'photo.jpg' }] },
    });
    expect(m.from).toBe('priya@example.com');
    expect(m.to).toEqual(['a@x.com', 'b@x.com']);
    expect(m.hasAttachments).toBe(true);
    expect(m.internalDate.getTime()).toBe(1793617200000);
    expect(parseAddressList(undefined)).toEqual([]);
  });

  it('backoff grows exponentially and is capped at one minute', () => {
    expect(retryDelayMs(0)).toBeLessThan(1_300);
    expect(retryDelayMs(3)).toBeGreaterThanOrEqual(8_000);
    expect(retryDelayMs(10)).toBeLessThanOrEqual(60_250);
    expect(new GmailApiError(429, 'x').isRetryable).toBe(true);
    expect(new GmailApiError(503, 'x').isRetryable).toBe(true);
    expect(new GmailApiError(401, 'x').isAuth).toBe(true);
    expect(new GmailApiError(404, 'x').isNotFound).toBe(true);
  });

  it('builds a base64url RFC 2822 message with html and text parts', () => {
    const raw = buildRawMessage({ from: 'sales@acme.com', to: ['a@x.com'], subject: 'Hi', html: '<p>Hello</p>' });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('From: sales@acme.com');
    expect(decoded).toContain('Content-Type: text/html');
    expect(decoded).toContain('multipart/alternative');
  });
});

describe('MailSyncService', () => {
  it('maps history additions to ingestInbound and stores outbound without reopening', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow());
    prisma.mailThread.upsert.mockResolvedValue({ id: 'thread-db' });
    prisma.mailMessage.findFirst.mockResolvedValue(null);
    const client: Partial<GmailClient> = {
      listHistory: vi.fn().mockResolvedValue({ historyId: '120', messageIds: ['m1', 'm2'] }),
      getMessage: vi.fn().mockImplementation(async (id: string) => (id === 'm1' ? meta() : meta({ id: 'm2', from: 'sales@acme.com', to: ['client@example.com'], labelIds: ['SENT'] }))),
    };
    const { svc, conversations } = syncService(prisma, client);
    const r = await svc.incrementalSync(MB);
    expect(r).toMatchObject({ mode: 'incremental', fetched: 2, inbound: 1, outbound: 1, historyId: '120' });
    expect(conversations.ingestInbound).toHaveBeenCalledWith(MB, expect.objectContaining({ gmailMessageId: 'm1', gmailThreadId: 'th1', from: 'client@example.com' }));
    expect(prisma.mailMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.mailbox.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ historyId: '120' }) }));
  });

  it('runs an initial 30-day sync when the mailbox has no historyId', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow({ historyId: null }));
    const client: Partial<GmailClient> = {
      getProfile: vi.fn().mockResolvedValue({ emailAddress: 'sales@acme.com', historyId: '900' }),
      listMessages: vi.fn().mockResolvedValueOnce({ ids: ['a'], nextPageToken: 'p2' }).mockResolvedValueOnce({ ids: ['b'] }),
      getMessage: vi.fn().mockResolvedValue(meta()),
    };
    const { svc } = syncService(prisma, client);
    const r = await svc.syncMailbox(MB);
    expect(r.mode).toBe('initial');
    expect(r.fetched).toBe(2);
    expect((client.listMessages as any).mock.calls[0][0]).toContain('newer_than:30d');
    expect(prisma.mailbox.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ historyId: '900' }) }));
  });

  it('expired history (404) falls back to a full resync', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow());
    const client: Partial<GmailClient> = {
      listHistory: vi.fn().mockRejectedValue(new GmailApiError(404, 'history too old')),
      getProfile: vi.fn().mockResolvedValue({ emailAddress: 'sales@acme.com', historyId: '950' }),
      listMessages: vi.fn().mockResolvedValue({ ids: [] }),
    };
    const { svc } = syncService(prisma, client);
    const r = await svc.incrementalSync(MB);
    expect(r.mode).toBe('initial');
    expect(prisma.mailbox.update).toHaveBeenCalledWith(expect.objectContaining({ data: { historyId: null } }));
  });

  it('401 from Google marks the mailbox revoked and raises an alert and a notification (10 section 7)', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow());
    const client: Partial<GmailClient> = { listHistory: vi.fn().mockRejectedValue(new GmailApiError(401, 'invalid_grant')) };
    const { svc, notifications } = syncService(prisma, client);
    await expect(svc.incrementalSync(MB)).rejects.toBeInstanceOf(GmailApiError);
    expect(prisma.mailbox.update).toHaveBeenCalledWith(expect.objectContaining({ data: { tokenStatus: 'revoked' } }));
    expect(prisma.securityAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'mailbox_token_revoked', employeeId: 'admin-1' }) }));
    expect(notifications.sendNotification).toHaveBeenCalledWith('admin-1', 'security_alert', expect.any(String), expect.stringContaining('sales@acme.com'), expect.any(Object));
  });

  it('5xx marks the mailbox as error without an alert', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow());
    const client: Partial<GmailClient> = { listHistory: vi.fn().mockRejectedValue(new GmailApiError(503, 'down')) };
    const { svc } = syncService(prisma, client);
    await expect(svc.incrementalSync(MB)).rejects.toBeInstanceOf(GmailApiError);
    expect(prisma.mailbox.update).toHaveBeenCalledWith(expect.objectContaining({ data: { tokenStatus: 'error' } }));
    expect(prisma.securityAlert.create).not.toHaveBeenCalled();
  });

  it('renews only watches expiring within 24 hours', async () => {
    const now = new Date('2026-11-02T10:00:00.000Z');
    expect(needsWatchRenewal(null, now)).toBe(true);
    expect(needsWatchRenewal(new Date('2026-11-02T20:00:00Z'), now)).toBe(true);
    expect(needsWatchRenewal(new Date('2026-11-05T10:00:00Z'), now)).toBe(false);

    const prisma = prismaMock();
    prisma.mailbox.findMany.mockResolvedValue([
      { id: 'a', watchExpiresAt: new Date('2026-11-02T20:00:00Z') },
      { id: 'b', watchExpiresAt: new Date('2026-11-05T10:00:00Z') },
    ]);
    prisma.mailbox.findUnique.mockImplementation(async ({ where }: any) => mailboxRow({ id: where.id }));
    const client: Partial<GmailClient> = { watch: vi.fn().mockResolvedValue({ historyId: '1', expiration: new Date('2026-11-09T10:00:00Z') }) };
    const { svc } = syncService(prisma, client);
    const r = await svc.renewExpiringWatches();
    expect(r).toEqual({ checked: 2, renewed: 1, failed: 0 });
    expect(client.watch).toHaveBeenCalledTimes(1);
  });

  it('refuses to sync a demo mailbox', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow({ tokenStatus: 'demo' }));
    const { svc } = syncService(prisma, {});
    await expect(svc.syncMailbox(MB)).rejects.toMatchObject({ status: 422 });
  });

  it('toInbound / isOutbound helpers', () => {
    expect(toInbound(meta())).toMatchObject({ gmailThreadId: 'th1', gmailMessageId: 'm1', subject: 'Quote' });
    expect(isOutbound(meta(), 'sales@acme.com')).toBe(false);
    expect(isOutbound(meta({ from: 'SALES@acme.com' }), 'sales@acme.com')).toBe(true);
    expect(isOutbound(meta({ labelIds: ['SENT'] }), 'sales@acme.com')).toBe(true);
  });
});

describe('MailService demo refusal', () => {
  it('sendMail on a demo mailbox returns 422 with a clear message', async () => {
    const prisma = prismaMock();
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['send'] });
    prisma.mailbox.findUnique.mockResolvedValue(mailboxRow({ tokenStatus: 'demo' }));
    const clock = new ClockService();
    const mail = new MailService(prisma, clock, new ConfigService({}), { get: vi.fn() } as any, { emitToUser: vi.fn() } as any, { recordMetricEvent: vi.fn() } as any, { configured: () => false, oauth: () => null, forRefreshToken: vi.fn() } as any, { trigger: vi.fn(), setHandler: vi.fn() } as any, { settingsFor: vi.fn(), imap: vi.fn(), forMailbox: vi.fn(), verifySmtp: vi.fn(), sendSmtp: vi.fn(), encryptPassword: vi.fn() } as any);
    await expect(mail.sendMail(MB, 'emp', 'c1', { to: ['a@x.com'], subject: 'x', html: '<p>x</p>' }, '127.0.0.1')).rejects.toMatchObject({ status: 422, message: expect.stringContaining('demo') });
  });
});
