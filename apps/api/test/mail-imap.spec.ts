import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../src/common/clock.service';
import { CryptoUtil } from '../src/common/crypto.util';
import {
  ImapClientFactory,
  ImapConnectionError,
  angleBracketed,
  attachmentMeta,
  composeRaw,
  extractAttachment,
  makeMessageId,
  maxUid,
  normaliseMessageId,
  parseReferences,
  parseRfc822,
  selectNewUids,
  snippetOf,
  threadCandidates,
} from '../src/mail/imap-client';
import { ImapSyncService } from '../src/mail/imap-sync.service';
import { MailSyncService } from '../src/mail/mail-sync.service';
import { MailService, publicMailbox } from '../src/mail/mail.service';
import { extractGmailBody } from '../src/mail/gmail-client';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const MB = '00000000-0000-0000-0000-000000000601';

function mime(opts: { from: string; to: string; subject: string; messageId: string; inReplyTo?: string; references?: string; html?: string; attachment?: { name: string; body: string } }): Buffer {
  const boundary = 'b1';
  const lines = [
    `From: Jane <${opts.from}>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Date: Mon, 02 Nov 2026 09:15:00 +0000`,
    `Message-ID: <${opts.messageId}>`,
    ...(opts.inReplyTo ? [`In-Reply-To: <${opts.inReplyTo}>`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    opts.html ?? '<p>Hello <b>there</b>, see attached.</p><script>alert(1)</script>',
    ...(opts.attachment
      ? [`--${boundary}`, `Content-Type: text/plain; name="${opts.attachment.name}"`, `Content-Disposition: attachment; filename="${opts.attachment.name}"`, 'Content-Transfer-Encoding: base64', '', Buffer.from(opts.attachment.body).toString('base64')]
      : []),
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'));
}

function prismaMock() {
  const table = () => ({ findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() });
  const p: any = { mailbox: table(), mailboxAssignment: table(), mailThread: table(), mailMessage: table(), securityAlert: table(), mailAudit: table(), lead: table(), leadTimeline: table(), employee: table() };
  p.$transaction = vi.fn((cb: any) => cb(p));
  return p;
}

const imapRow = (over: Record<string, unknown> = {}) => ({
  id: MB,
  companyId: 'c1',
  address: 'hello@acme.com',
  displayName: 'Hello',
  provider: 'imap',
  refreshTokenEnc: null,
  imapHost: 'imap.hostinger.com',
  imapPort: 993,
  imapSecure: true,
  smtpHost: 'smtp.hostinger.com',
  smtpPort: 465,
  smtpSecure: true,
  username: 'hello@acme.com',
  passwordEnc: CryptoUtil.encryptField('secret-pw', KEY),
  tokenStatus: 'ok',
  historyId: null,
  lastUidValidity: 7,
  lastUid: 40,
  connectedBy: 'admin-1',
  watchExpiresAt: null,
  ...over,
});

describe('imap-client pure helpers', () => {
  it('normalises message ids and references', () => {
    expect(normaliseMessageId(' <abc@x.com> ')).toBe('abc@x.com');
    expect(normaliseMessageId('')).toBeNull();
    expect(parseReferences('<a@x> <b@x>\n <c@x>')).toEqual(['a@x', 'b@x', 'c@x']);
    expect(parseReferences(['<a@x>', 'b@x'])).toEqual(['a@x', 'b@x']);
  });

  it('threadCandidates prefers In-Reply-To, then References newest first', () => {
    expect(threadCandidates({ inReplyTo: 'c@x', references: ['a@x', 'b@x', 'c@x'] })).toEqual(['c@x', 'b@x', 'a@x']);
    expect(threadCandidates({ inReplyTo: null, references: [] })).toEqual([]);
  });

  it('selectNewUids honours the cursor and resets on a UIDVALIDITY change', () => {
    expect(selectNewUids([38, 41, 40, 45], { lastUidValidity: 7, lastUid: 40 }, 7)).toEqual([41, 45]);
    expect(selectNewUids([38, 41], { lastUidValidity: 7, lastUid: 40 }, 8)).toEqual([38, 41]);
    expect(selectNewUids([3, 1], { lastUidValidity: null, lastUid: null }, 1)).toEqual([1, 3]);
    expect(maxUid([], 40)).toBe(40);
    expect(maxUid([41, 45], 40)).toBe(45);
    expect(maxUid([], null)).toBeNull();
  });

  it('snippetOf strips html and collapses whitespace', () => {
    expect(snippetOf(null, '<style>p{}</style><p>Hi   <b>there</b></p>')).toBe('Hi there');
    expect(snippetOf('  plain\n text ', '<p>x</p>')).toBe('plain text');
  });

  it('parseRfc822 extracts addresses, threading headers, html and attachment metadata', async () => {
    const src = mime({ from: 'Jane@Customer.com', to: 'hello@acme.com', subject: 'Quote', messageId: 'm1@customer.com', inReplyTo: 'm0@acme.com', references: '<m0@acme.com>', attachment: { name: 'quote.txt', body: 'price 100' } });
    const parsed = await parseRfc822(src, { date: new Date('2026-11-02T00:00:00Z'), messageId: 'fallback' });
    expect(parsed.from).toBe('jane@customer.com');
    expect(parsed.to).toEqual(['hello@acme.com']);
    expect(parsed.messageId).toBe('m1@customer.com');
    expect(parsed.inReplyTo).toBe('m0@acme.com');
    expect(parsed.references).toEqual(['m0@acme.com']);
    expect(parsed.subject).toBe('Quote');
    expect(parsed.date.toISOString()).toBe('2026-11-02T09:15:00.000Z');
    expect(parsed.html).toContain('<b>there</b>');
    expect(parsed.snippet).toBe('Hello there , see attached. alert(1)');
    expect(parsed.attachments).toEqual([{ partId: 'att-0', fileName: 'quote.txt', mime: 'text/plain', size: 9 }]);
    const file = await extractAttachment(src, 'att-0');
    expect(file?.content.toString()).toBe('price 100');
    expect(await extractAttachment(src, 'att-9')).toBeNull();
  });

  it('attachmentMeta skips inline (cid) images', () => {
    const list: any = [
      { filename: 'logo.png', contentType: 'image/png', size: 10, related: true },
      { filename: undefined, contentType: 'application/pdf', size: 20, related: false },
    ];
    expect(attachmentMeta(list)).toEqual([{ partId: 'att-1', fileName: 'attachment-2', mime: 'application/pdf', size: 20 }]);
  });

  it('composeRaw writes threading headers and both body parts', async () => {
    const id = makeMessageId('hello@acme.com');
    expect(id).toMatch(/^<.+@acme\.com>$/);
    expect(angleBracketed('x@y')).toBe('<x@y>');
    expect(angleBracketed('<x@y>')).toBe('<x@y>');
    const raw = (await composeRaw({ from: 'hello@acme.com', fromName: 'Hello', to: ['jane@customer.com'], subject: 'Re: Quote', html: '<p>Thanks <b>Jane</b></p>', inReplyTo: 'm1@customer.com', references: ['m0@acme.com', 'm1@customer.com'], messageId: id })).toString();
    expect(raw).toContain(`Message-ID: ${id}`);
    expect(raw).toContain('In-Reply-To: <m1@customer.com>');
    expect(raw).toContain('References: <m0@acme.com> <m1@customer.com>');
    expect(raw).toContain('From: Hello <hello@acme.com>');
    expect(raw).toContain('text/html');
    expect(raw).toContain('Thanks Jane');
  });

  it('ImapClientFactory decrypts stored credentials and refuses incomplete rows', () => {
    const f = new ImapClientFactory(new ConfigService({ ENCRYPTION_SECRET: KEY }));
    const s = f.settingsFor(imapRow() as any);
    expect(s.imap).toEqual({ host: 'imap.hostinger.com', port: 993, secure: true, username: 'hello@acme.com', password: 'secret-pw' });
    expect(s.smtp.host).toBe('smtp.hostinger.com');
    expect(() => f.settingsFor(imapRow({ passwordEnc: null }) as any)).toThrow(ImapConnectionError);
    expect(CryptoUtil.decryptField(f.encryptPassword('pw'), KEY)).toBe('pw');
  });

  it('extractGmailBody walks parts for html, text and attachments', () => {
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    const body = extractGmailBody({
      id: 'g1',
      threadId: 't1',
      payload: {
        mimeType: 'multipart/mixed',
        parts: [
          { partId: '0', mimeType: 'multipart/alternative', parts: [{ partId: '0.0', mimeType: 'text/plain', body: { data: b64('hi') } }, { partId: '0.1', mimeType: 'text/html', body: { data: b64('<p>hi</p>') } }] },
          { partId: '1', mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'AT1', size: 99 } },
        ],
      },
    });
    expect(body).toEqual({ html: '<p>hi</p>', text: 'hi', attachments: [{ partId: '1', fileName: 'a.pdf', mime: 'application/pdf', size: 99, attachmentId: 'AT1' }] });
  });
});

function imapSyncService(prisma: any, client: Record<string, any>) {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
  const conversations: any = { ingestInbound: vi.fn().mockResolvedValue({ id: 't1' }) };
  const notifications: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  const gateway: any = { emitToUser: vi.fn() };
  const factory: any = { forMailbox: vi.fn().mockReturnValue(client) };
  const svc = new ImapSyncService(prisma, clock, conversations, notifications, gateway, factory);
  return { svc, conversations, notifications, gateway, clock, factory };
}

describe('ImapSyncService', () => {
  it('fetches new UIDs, threads replies onto existing conversations and advances the cursor', async () => {
    const prisma = prismaMock();
    prisma.mailMessage.findFirst.mockImplementation(async (args: any) => (args.where.gmailMessageId?.in?.includes('m0@acme.com') ? { thread: { gmailThreadId: 'm0@acme.com' } } : null));
    prisma.mailbox.update.mockResolvedValue({});
    const reply = mime({ from: 'jane@customer.com', to: 'hello@acme.com', subject: 'Re: Quote', messageId: 'm1@customer.com', inReplyTo: 'm0@acme.com' });
    const fresh = mime({ from: 'bob@other.com', to: 'hello@acme.com', subject: 'New', messageId: 'n1@other.com' });
    const client = { fetchNew: vi.fn().mockResolvedValue({ uidValidity: 7, uids: [41, 42, 43], messages: [{ uid: 41, source: reply }, { uid: 42, source: fresh }] }) };
    const { svc, conversations, gateway } = imapSyncService(prisma, client);
    prisma.mailboxAssignment.findMany.mockResolvedValue([{ employeeId: 'e1' }]);

    const r = await svc.syncMailbox(imapRow() as any);
    expect(client.fetchNew).toHaveBeenCalledWith({ lastUidValidity: 7, lastUid: 40 }, expect.any(Date));
    expect(r).toMatchObject({ mode: 'incremental', fetched: 2, inbound: 2, outbound: 0, historyId: '7:43' });
    expect(conversations.ingestInbound).toHaveBeenNthCalledWith(1, MB, expect.objectContaining({ gmailThreadId: 'm0@acme.com', gmailMessageId: 'm1@customer.com', uid: 41 }));
    expect(conversations.ingestInbound).toHaveBeenNthCalledWith(2, MB, expect.objectContaining({ gmailThreadId: 'n1@other.com', gmailMessageId: 'n1@other.com', uid: 42, hasAttachments: false }));
    expect(prisma.mailbox.update).toHaveBeenCalledWith({ where: { id: MB }, data: expect.objectContaining({ lastUidValidity: 7, lastUid: 43, tokenStatus: 'ok' }) });
    await new Promise((r) => setImmediate(r));
    expect(gateway.emitToUser).toHaveBeenCalled();
  });

  it('stores mail sent from another client as outbound without reopening the conversation', async () => {
    const prisma = prismaMock();
    prisma.mailThread.upsert.mockResolvedValue({ id: 'th' });
    prisma.mailMessage.findFirst.mockResolvedValue(null);
    prisma.mailbox.update.mockResolvedValue({});
    const own = mime({ from: 'hello@acme.com', to: 'jane@customer.com', subject: 'Quote', messageId: 'm0@acme.com' });
    const client = { fetchNew: vi.fn().mockResolvedValue({ uidValidity: 7, uids: [41], messages: [{ uid: 41, source: own }] }) };
    const { svc, conversations } = imapSyncService(prisma, client);
    const r = await svc.syncMailbox(imapRow() as any);
    expect(r).toMatchObject({ inbound: 0, outbound: 1 });
    expect(conversations.ingestInbound).not.toHaveBeenCalled();
    expect(prisma.mailThread.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ unread: false, gmailThreadId: 'm0@acme.com' }) }));
    expect(prisma.mailMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ uid: 41, gmailMessageId: 'm0@acme.com' }) }));
  });

  it('marks the mailbox revoked and alerts the admin when the login is rejected', async () => {
    const prisma = prismaMock();
    prisma.mailbox.update.mockResolvedValue({});
    const client = { fetchNew: vi.fn().mockRejectedValue(new ImapConnectionError('IMAP login failed', true)) };
    const { svc, notifications } = imapSyncService(prisma, client);
    await expect(svc.syncMailbox(imapRow() as any)).rejects.toBeInstanceOf(ImapConnectionError);
    expect(prisma.mailbox.update).toHaveBeenCalledWith({ where: { id: MB }, data: { tokenStatus: 'revoked' } });
    expect(prisma.securityAlert.create).toHaveBeenCalled();
    expect(notifications.sendNotification).toHaveBeenCalledWith('admin-1', expect.anything(), 'Mailbox disconnected', expect.stringContaining('hello@acme.com'), { mailboxId: MB });
  });

  it('a transient error marks the mailbox error without an alert', async () => {
    const prisma = prismaMock();
    prisma.mailbox.update.mockResolvedValue({});
    const client = { fetchNew: vi.fn().mockRejectedValue(new ImapConnectionError('ECONNRESET', false)) };
    const { svc, notifications } = imapSyncService(prisma, client);
    await expect(svc.syncMailbox(imapRow() as any)).rejects.toBeTruthy();
    expect(prisma.mailbox.update).toHaveBeenCalledWith({ where: { id: MB }, data: { tokenStatus: 'error' } });
    expect(notifications.sendNotification).not.toHaveBeenCalled();
  });
});

describe('MailSyncService provider dispatch', () => {
  function build(prisma: any, configured: boolean) {
    const clock = new ClockService();
    const imapSync: any = { syncMailbox: vi.fn().mockResolvedValue({ mailboxId: MB, mode: 'incremental', fetched: 1, inbound: 1, outbound: 0, historyId: '7:41' }) };
    const factory: any = { configured: () => configured, forRefreshToken: vi.fn() };
    const svc = new MailSyncService(prisma, clock, new ConfigService({ ENCRYPTION_SECRET: KEY }), { ingestInbound: vi.fn() } as any, { sendNotification: vi.fn() } as any, { emitToUser: vi.fn() } as any, factory, imapSync);
    return { svc, imapSync, factory };
  }

  it('routes IMAP mailboxes to ImapSyncService even without Google credentials', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(imapRow());
    const { svc, imapSync, factory } = build(prisma, false);
    const r = await svc.syncMailbox(MB);
    expect(imapSync.syncMailbox).toHaveBeenCalledWith(expect.objectContaining({ id: MB, provider: 'imap' }));
    expect(factory.forRefreshToken).not.toHaveBeenCalled();
    expect(r.inbound).toBe(1);
    expect(await svc.canSync(MB)).toBe(true);
  });

  it('skips Gmail mailboxes while Google is not configured instead of failing', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(imapRow({ provider: 'gmail', refreshTokenEnc: CryptoUtil.encryptField('rt', KEY), historyId: '5' }));
    const { svc, imapSync } = build(prisma, false);
    expect(await svc.syncMailbox(MB)).toMatchObject({ mode: 'skipped', historyId: '5' });
    expect(imapSync.syncMailbox).not.toHaveBeenCalled();
    expect(await svc.canSync(MB)).toBe(false);
  });

  it('refuses disconnected mailboxes', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(imapRow({ tokenStatus: 'disconnected' }));
    const { svc } = build(prisma, true);
    await expect(svc.syncMailbox(MB)).rejects.toMatchObject({ status: 422 });
    expect(await svc.canSync(MB)).toBe(false);
  });
});

describe('MailService IMAP mailboxes', () => {
  function build(prisma: any, imapFactory: Record<string, any>, gmailConfigured = false) {
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
    const trigger = { trigger: vi.fn().mockResolvedValue(false), setHandler: vi.fn() };
    const targets = { recordMetricEvent: vi.fn() };
    const gmail = { configured: () => gmailConfigured, oauth: () => null, forRefreshToken: vi.fn() };
    const svc = new MailService(prisma, clock, new ConfigService({ ENCRYPTION_SECRET: KEY }), { getClient: vi.fn() } as any, { emitToUser: vi.fn() } as any, targets as any, gmail as any, trigger as any, imapFactory as any);
    return { svc, trigger, targets, clock };
  }
  const realFactory = () => new ImapClientFactory(new ConfigService({ ENCRYPTION_SECRET: KEY }));
  const dto = { address: 'Hello@Acme.com', displayName: 'Hello', imapHost: 'imap.hostinger.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.hostinger.com', smtpPort: 465, smtpSecure: true, username: 'hello@acme.com', password: 'secret-pw' };

  it('publicMailbox never exposes stored credentials', () => {
    const row = publicMailbox(imapRow({ refreshTokenEnc: 'enc' }));
    expect(row).not.toHaveProperty('passwordEnc');
    expect(row).not.toHaveProperty('refreshTokenEnc');
    expect(row).toHaveProperty('imapHost', 'imap.hostinger.com');
  });

  it('testImap reports both legs separately', async () => {
    const factory = { imap: vi.fn().mockReturnValue({ testConnection: vi.fn().mockResolvedValue({ uidValidity: 1, messages: 12 }) }), verifySmtp: vi.fn().mockRejectedValue(new ImapConnectionError('SMTP login failed', true)) };
    const { svc } = build(prismaMock(), factory);
    expect(await svc.testImap(dto)).toEqual({ imap: { ok: true, messages: 12 }, smtp: { ok: false, error: 'SMTP login failed' } });
  });

  it('connectImap stores encrypted credentials, grants the admin every permission and triggers a sync', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(null);
    prisma.mailbox.create.mockImplementation(async (args: any) => ({ id: MB, ...args.data }));
    const factory = realFactory();
    vi.spyOn(factory, 'imap').mockReturnValue({ testConnection: vi.fn().mockResolvedValue({ uidValidity: 1, messages: 0 }) } as any);
    factory.verifySmtp = vi.fn().mockResolvedValue(undefined);
    const { svc, trigger } = build(prisma, factory);
    const out: any = await svc.connectImap('c1', 'admin-1', dto, '127.0.0.1');
    const created = prisma.mailbox.create.mock.calls[0][0].data;
    expect(created.address).toBe('hello@acme.com');
    expect(created.provider).toBe('imap');
    expect(CryptoUtil.decryptField(created.passwordEnc, KEY)).toBe('secret-pw');
    expect(out).not.toHaveProperty('passwordEnc');
    expect(prisma.mailboxAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ employeeId: 'admin-1', permissions: expect.arrayContaining(['read', 'send', 'triage']) }) }));
    expect(prisma.mailAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'connect', subject: 'hello@acme.com' }) });
    expect(trigger.trigger).toHaveBeenCalledWith(MB);
  });

  it('connectImap refuses when the connection test fails and stores nothing', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue(null);
    const factory = { imap: vi.fn().mockReturnValue({ testConnection: vi.fn().mockRejectedValue(new ImapConnectionError('IMAP login failed: check the username', true)) }), verifySmtp: vi.fn().mockResolvedValue(undefined), encryptPassword: vi.fn() };
    const { svc } = build(prisma, factory);
    await expect(svc.connectImap('c1', 'admin-1', dto, '127.0.0.1')).rejects.toMatchObject({ status: 422, message: expect.stringContaining('IMAP login failed') });
    expect(prisma.mailbox.create).not.toHaveBeenCalled();
  });

  it('connectImap refuses an address that already belongs to a connected mailbox', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findUnique.mockResolvedValue({ id: 'other', companyId: 'c1', tokenStatus: 'ok' });
    const { svc } = build(prisma, realFactory());
    await expect(svc.connectImap('c1', 'admin-1', dto, '127.0.0.1')).rejects.toMatchObject({ status: 422 });
  });

  it('disconnectMailbox wipes credentials and keeps the row', async () => {
    const prisma = prismaMock();
    prisma.mailbox.findFirst.mockResolvedValue(imapRow());
    prisma.mailbox.update.mockResolvedValue(imapRow({ passwordEnc: null, tokenStatus: 'disconnected' }));
    const { svc } = build(prisma, realFactory());
    const out: any = await svc.disconnectMailbox('c1', 'admin-1', MB, '127.0.0.1');
    expect(prisma.mailbox.update).toHaveBeenCalledWith({ where: { id: MB }, data: { refreshTokenEnc: null, passwordEnc: null, tokenStatus: 'disconnected', watchExpiresAt: null } });
    expect(out.tokenStatus).toBe('disconnected');
    expect(out).not.toHaveProperty('passwordEnc');
    expect(prisma.mailAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'disconnect' }) });
  });

  it('sendMail over SMTP threads the reply, appends to Sent and records the Message-ID', async () => {
    const prisma = prismaMock();
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['reply', 'send'] });
    prisma.mailbox.findUnique.mockResolvedValue(imapRow());
    prisma.mailThread.findFirst.mockResolvedValue({ gmailThreadId: 'm0@acme.com', messages: [{ gmailMessageId: 'm0@acme.com' }, { gmailMessageId: 'm1@customer.com' }] });
    prisma.mailThread.upsert.mockResolvedValue({ id: 'th' });
    prisma.mailMessage.create.mockImplementation(async (a: any) => ({ id: 'msg', ...a.data }));
    const appendSent = vi.fn().mockResolvedValue(true);
    const factory = realFactory();
    vi.spyOn(factory, 'imap').mockReturnValue({ appendSent } as any);
    const sendSmtp = vi.fn().mockResolvedValue(undefined);
    factory.sendSmtp = sendSmtp;
    const { svc, targets } = build(prisma, factory);

    const msg: any = await svc.sendMail(MB, 'emp-1', 'c1', { to: ['jane@customer.com'], subject: 'Re: Quote', html: '<p>Thanks</p>', replyToThreadId: 'm0@acme.com' } as any, '127.0.0.1');
    expect(sendSmtp).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.hostinger.com', password: 'secret-pw' }), expect.any(Buffer), { from: 'hello@acme.com', to: ['jane@customer.com'] });
    const raw = sendSmtp.mock.calls[0][1].toString();
    expect(raw).toContain('In-Reply-To: <m1@customer.com>');
    expect(raw).toContain('References: <m0@acme.com> <m1@customer.com>');
    expect(appendSent).toHaveBeenCalledWith(expect.any(Buffer), expect.any(Date));
    expect(msg.gmailMessageId).toMatch(/@acme\.com$/);
    expect(prisma.mailThread.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { mailboxId_gmailThreadId: { mailboxId: MB, gmailThreadId: 'm0@acme.com' } } }));
    expect(prisma.mailAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'reply' }) });
    expect(targets.recordMetricEvent).toHaveBeenCalled();
  });

  it('sendMail surfaces an SMTP rejection as 422 and stores nothing', async () => {
    const prisma = prismaMock();
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['send'] });
    prisma.mailbox.findUnique.mockResolvedValue(imapRow());
    const factory = realFactory();
    factory.sendSmtp = vi.fn().mockRejectedValue(new Error('550 relay denied'));
    const { svc } = build(prisma, factory);
    await expect(svc.sendMail(MB, 'emp-1', 'c1', { to: ['x@y.com'], subject: 's', html: '<p>x</p>' } as any, '127.0.0.1')).rejects.toMatchObject({ status: 422, message: expect.stringContaining('550 relay denied') });
    expect(prisma.mailMessage.create).not.toHaveBeenCalled();
  });

  it('getMessageBody fetches the IMAP source, sanitises the html and audits the open', async () => {
    const prisma = prismaMock();
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['read', 'download'] });
    const source = mime({ from: 'jane@customer.com', to: 'hello@acme.com', subject: 'Quote', messageId: 'm1@customer.com', html: '<p>Hi</p><img src="https://t.example/p.gif"><script>x()</script>', attachment: { name: 'quote.txt', body: 'price' } });
    prisma.mailMessage.findFirst.mockResolvedValue({ id: 'msg', uid: null, gmailMessageId: 'm1@customer.com', snippet: 'Hi', sentAt: new Date(), thread: { subject: 'Quote', mailbox: imapRow() } });
    const client = { findUidByMessageId: vi.fn().mockResolvedValue(41), fetchSource: vi.fn().mockResolvedValue(source) };
    const factory = { forMailbox: vi.fn().mockReturnValue(client) };
    const { svc } = build(prisma, factory);
    const body = await svc.getMessageBody(MB, 'emp-1', 'msg', false, '127.0.0.1');
    expect(client.fetchSource).toHaveBeenCalledWith(41);
    expect(prisma.mailMessage.update).toHaveBeenCalledWith({ where: { id: 'msg' }, data: { uid: 41 } });
    expect(body.html).not.toContain('<script');
    expect(body.html).toContain('data-blocked-src="https://t.example/p.gif"');
    expect(body.remoteImagesBlocked).toBe(1);
    expect(body.attachments).toEqual([{ partId: 'att-0', fileName: 'quote.txt', mime: 'text/plain', size: 5 }]);
    expect(prisma.mailAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'open', gmailMessageId: 'm1@customer.com' }) });

    const file = await svc.getAttachment(MB, 'emp-1', 'msg', 'att-0', '127.0.0.1');
    expect(file.content.toString()).toBe('price');
    expect(prisma.mailAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'download_attachment', subject: 'quote.txt' }) });

    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['read'] });
    await expect(svc.getAttachment(MB, 'emp-1', 'msg', 'att-0', '127.0.0.1')).rejects.toMatchObject({ status: 403 });
  });

  it('getMessageBody on a demo mailbox returns the snippet as text and never contacts a server', async () => {
    const prisma = prismaMock();
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['read'] });
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['read', 'download'] });
    prisma.mailMessage.findFirst.mockResolvedValue({ id: 'msg', uid: null, gmailMessageId: 'demo-1', snippet: 'Synthetic', sentAt: new Date(), thread: { subject: 'Demo', mailbox: imapRow({ tokenStatus: 'demo', provider: 'gmail' }) } });
    const factory = { forMailbox: vi.fn() };
    const { svc } = build(prisma, factory);
    const body = await svc.getMessageBody(MB, 'emp-1', 'msg', false, '127.0.0.1');
    expect(body).toMatchObject({ html: '', text: 'Synthetic', attachments: [] });
    expect(factory.forMailbox).not.toHaveBeenCalled();
    await expect(svc.getAttachment(MB, 'emp-1', 'msg', 'att-0', '127.0.0.1')).rejects.toMatchObject({ status: 422 });
  });

  it('getMessageBody denies without the read permission', async () => {
    const prisma = prismaMock();
    prisma.mailboxAssignment.findUnique.mockResolvedValue({ permissions: ['send'] });
    const { svc } = build(prisma, {});
    await expect(svc.getMessageBody(MB, 'emp-1', 'msg', false, '127.0.0.1')).rejects.toMatchObject({ status: 403 });
  });
});
