import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { ClockService } from '../src/common/clock.service';
import { ChatService } from '../src/chat/chat.service';
import { ChatGateway } from '../src/chat/chat.gateway';
import { ChatMembershipService } from '../src/chat/chat-membership.service';
import { ChatJobsService, CHAT_RETENTION_SETTING } from '../src/jobs/chat-jobs.service';
import { retentionCutoff, retentionDaysFrom } from '../src/jobs/jobs.util';
import {
  advancesCursor,
  derivedUnitChannels,
  directKey,
  parseMentions,
  typingAllowed,
  unitMembershipDiff,
  unreadCount,
  withinEditWindow,
} from '../src/chat/chat.rules';

const A = '00000000-0000-0000-0000-0000000000aa';
const B = '00000000-0000-0000-0000-0000000000bb';
const C = '00000000-0000-0000-0000-0000000000cc';
const CH = '00000000-0000-0000-0000-000000000c01';
const CO = '00000000-0000-0000-0000-000000000001';
const user = (id: string, roleId = 'r1') => ({ id, companyId: CO, code: 'EMP', email: null, roleId, roleName: 'Employee', roleRank: 1 });

// uuid v7 style ids: time-ordered when compared as strings
const M1 = '0192f000-0000-7000-8000-000000000001';
const M2 = '0192f000-0000-7000-8000-000000000002';
const M3 = '0192f000-0001-7000-8000-000000000003';

describe('chat rules (22 section 7)', () => {
  it('membership derivation follows company, department and team; inactive employees get nothing', () => {
    expect(derivedUnitChannels({ status: 'active', departmentId: 'd1', teamId: 't1' })).toEqual([
      { kind: 'company', departmentId: null, teamId: null },
      { kind: 'department', departmentId: 'd1', teamId: null },
      { kind: 'team', departmentId: null, teamId: 't1' },
    ]);
    expect(derivedUnitChannels({ status: 'active', departmentId: null, teamId: null })).toHaveLength(1);
    expect(derivedUnitChannels({ status: 'suspended', departmentId: 'd1', teamId: 't1' })).toEqual([]);
    expect(derivedUnitChannels({ status: 'disabled', departmentId: 'd1', teamId: null })).toEqual([]);
    expect(derivedUnitChannels({ status: 'active', deletedAt: new Date(), departmentId: 'd1', teamId: null })).toEqual([]);
  });

  it('membership diff joins the new unit channels and leaves the old ones when an employee moves', () => {
    const current = [
      { id: 'c-company', kind: 'company' as const, departmentId: null, teamId: null },
      { id: 'c-sales', kind: 'department' as const, departmentId: 'sales', teamId: null },
      { id: 'c-team1', kind: 'team' as const, departmentId: null, teamId: 't1' },
    ];
    const desired = [
      { id: 'c-company', kind: 'company' as const, departmentId: null, teamId: null },
      { id: 'c-ops', kind: 'department' as const, departmentId: 'ops', teamId: null },
    ];
    expect(unitMembershipDiff(current, desired)).toEqual({ join: ['c-ops'], leave: ['c-sales', 'c-team1'] });
    expect(unitMembershipDiff(current, current)).toEqual({ join: [], leave: [] });
  });

  it('direct key is the sorted pair, so both directions resolve to the same channel', () => {
    expect(directKey(A, B)).toBe(`${A}:${B}`);
    expect(directKey(B, A)).toBe(`${A}:${B}`);
    expect(directKey(C, A)).toBe(`${A}:${C}`);
  });

  it('edit window is 15 minutes inclusive', () => {
    const created = new Date('2026-11-02T10:00:00.000Z');
    expect(withinEditWindow(created, new Date('2026-11-02T10:14:59.000Z'))).toBe(true);
    expect(withinEditWindow(created, new Date('2026-11-02T10:15:00.000Z'))).toBe(true);
    expect(withinEditWindow(created, new Date('2026-11-02T10:15:01.000Z'))).toBe(false);
  });

  it('unread excludes own and deleted messages and everything up to the cursor; cursor only advances', () => {
    const msgs = [
      { id: M1, authorId: B, deletedAt: null },
      { id: M2, authorId: A, deletedAt: null },
      { id: M3, authorId: B, deletedAt: null },
      { id: '0192f000-0002-7000-8000-000000000004', authorId: B, deletedAt: new Date() },
    ];
    expect(unreadCount(msgs, null, A)).toBe(2);
    expect(unreadCount(msgs, M1, A)).toBe(1);
    expect(unreadCount(msgs, M3, A)).toBe(0);
    expect(advancesCursor(null, M1)).toBe(true);
    expect(advancesCursor(M2, M1)).toBe(false);
    expect(advancesCursor(M2, M3)).toBe(true);
  });

  it('mention parsing resolves @Firstname Lastname, longest name first, case-insensitive, once per person', () => {
    const people = [
      { id: A, firstName: 'Ann', lastName: 'Lee' },
      { id: B, firstName: 'Ann', lastName: 'Lee-Smith' },
      { id: C, firstName: 'Bob', lastName: 'Ray' },
    ];
    expect(parseMentions('hi @Ann Lee-Smith and @ann lee, also @Bob Ray @Bob Ray', people)).toEqual([B, A, C]);
    expect(parseMentions('mail ann@lee.com and @Annie Lee', people)).toEqual([]);
    expect(parseMentions('@Bob Rayner is someone else', people)).toEqual([]);
    expect(parseMentions('(@Bob Ray) ping', people)).toEqual([C]);
  });

  it('typing is accepted once per 3 seconds', () => {
    const t0 = new Date('2026-11-02T10:00:00.000Z');
    expect(typingAllowed(undefined, t0)).toBe(true);
    expect(typingAllowed(t0, new Date(t0.getTime() + 2999))).toBe(false);
    expect(typingAllowed(t0, new Date(t0.getTime() + 3000))).toBe(true);
  });

  it('retention cutoff uses chatRetentionDays from company settings with a 365 day default', () => {
    const now = new Date('2026-11-02T10:00:00.000Z');
    expect(retentionDaysFrom({}, CHAT_RETENTION_SETTING, 365)).toBe(365);
    expect(retentionDaysFrom({ chatRetentionDays: 30 }, CHAT_RETENTION_SETTING, 365)).toBe(30);
    expect(retentionDaysFrom({ chatRetentionDays: -1 }, CHAT_RETENTION_SETTING, 365)).toBe(365);
    expect(retentionCutoff(now, 365).toISOString()).toBe('2025-11-02T10:00:00.000Z');
    expect(retentionCutoff(now, 30).toISOString()).toBe('2026-10-03T10:00:00.000Z');
  });
});

function prismaMock() {
  const table = () => ({
    findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), createMany: vi.fn(),
    update: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0),
  });
  const p: any = { chatChannel: table(), chatMember: table(), chatMessage: table(), employee: table(), company: table(), department: table(), team: table(), auditLog: table() };
  p.$queryRaw = vi.fn().mockResolvedValue([]);
  p.$transaction = vi.fn((cb: any) => (typeof cb === 'function' ? cb(p) : Promise.all(cb)));
  return p;
}

describe('ChatService access (FR-CHAT-04, FR-CHAT-13)', () => {
  let prisma: any;
  let permissions: any;
  let gateway: any;
  let notifications: any;
  let service: ChatService;
  const clock = new ClockService();
  const channel = { id: CH, companyId: CO, kind: 'group', name: 'Ops', departmentId: null, teamId: null, directKey: null, createdBy: B, archivedAt: null, lastMessageAt: null, createdAt: new Date('2026-11-01T00:00:00Z'), members: [{ channelId: CH, employeeId: B, joinedAt: new Date(), lastReadMessageId: null, muted: false }] };

  beforeEach(() => {
    clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
    prisma = prismaMock();
    permissions = { scopeOf: vi.fn().mockResolvedValue(null) };
    gateway = { emitToChannel: vi.fn(), emitToUser: vi.fn(), joinUser: vi.fn(), leaveUser: vi.fn() };
    notifications = { sendNotification: vi.fn().mockResolvedValue({}) };
    const membership: any = { ensureCompanyChannel: vi.fn(), syncEmployeeThrottled: vi.fn() };
    service = new ChatService(prisma, clock, permissions, notifications, gateway, membership);
    prisma.chatChannel.findFirst.mockResolvedValue(channel);
  });

  it('non-member without chat.manage is denied with CHAT_NOT_MEMBER on read and send', async () => {
    await expect(service.listMessages(user(A), CH, { limit: 50 })).rejects.toMatchObject({ response: { code: 'CHAT_NOT_MEMBER' } });
    await expect(service.sendMessage(user(A), CH, { body: 'hi' })).rejects.toMatchObject({ response: { code: 'CHAT_NOT_MEMBER' } });
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('chat.manage (all) may read a channel they are not in, and the read is audited; sending still requires membership', async () => {
    permissions.scopeOf.mockResolvedValue('all');
    prisma.chatMessage.findMany.mockResolvedValue([]);
    const res = await service.listMessages(user(A), CH, { limit: 50 });
    expect(res).toEqual({ items: [], nextCursor: null });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'chat.moderation.read', entityId: CH, actorId: A });
    await expect(service.sendMessage(user(A), CH, { body: 'hi' })).rejects.toMatchObject({ response: { code: 'CHAT_NOT_MEMBER' } });
  });

  it('member reads without an audit entry', async () => {
    await service.listMessages(user(B), CH, { limit: 50 });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('directory lists only active colleagues of the company, never the caller', async () => {
    prisma.employee.findMany.mockResolvedValue([{ id: A, firstName: 'Ann', lastName: 'Lee', code: 'E1', department: { name: 'Ops' }, team: null }]);
    const res = await service.directory(user(B), { q: 'an', limit: 50 });
    expect(res).toEqual({ items: [{ id: A, firstName: 'Ann', lastName: 'Lee', code: 'E1', department: 'Ops', team: null }], nextCursor: null });
    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: CO, status: 'active', deletedAt: null, id: { not: B } });
    expect(where.OR).toHaveLength(3);
  });

  it('archived channel rejects send; direct to self rejected', async () => {
    prisma.chatChannel.findFirst.mockResolvedValue({ ...channel, archivedAt: new Date() });
    await expect(service.sendMessage(user(B), CH, { body: 'hi' })).rejects.toMatchObject({ response: { code: 'CHAT_CHANNEL_ARCHIVED' } });
    await expect(service.createDirect(user(B), { employeeId: B })).rejects.toMatchObject({ response: { code: 'CHAT_DIRECT_SELF' } });
  });

  it('edit after 15 minutes is CHAT_EDIT_WINDOW; within the window it updates and marks edited', async () => {
    const msg = { id: M1, channelId: CH, authorId: B, body: 'old', mentions: [], recordRef: null, clientKey: null, editedAt: null, deletedAt: null, createdAt: new Date('2026-11-02T09:40:00.000Z'), channel: { companyId: CO } };
    prisma.chatMessage.findUnique.mockResolvedValue(msg);
    await expect(service.editMessage(user(B), M1, { body: 'new' })).rejects.toMatchObject({ response: { code: 'CHAT_EDIT_WINDOW' } });
    prisma.chatMessage.findUnique.mockResolvedValue({ ...msg, createdAt: new Date('2026-11-02T09:50:00.000Z') });
    prisma.employee.findMany.mockResolvedValue([{ id: B, firstName: 'Bo', lastName: 'B', status: 'active' }]);
    prisma.chatMessage.update.mockResolvedValue({ ...msg, body: 'new', editedAt: clock.now() });
    const out = await service.editMessage(user(B), M1, { body: 'new' });
    expect(out.body).toBe('new');
    expect(out.editedAt).toBe('2026-11-02T10:00:00.000Z');
    expect(gateway.emitToChannel).toHaveBeenCalledWith(CH, 'chat.message.updated', expect.objectContaining({ id: M1 }));
    await expect(service.editMessage(user(A), M1, { body: 'x' })).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });

  it('send resolves mentions from the body to channel members, notifies them, advances the author cursor and honours the Idempotency-Key', async () => {
    const members = [{ channelId: CH, employeeId: B, joinedAt: new Date(), lastReadMessageId: null, muted: false }, { channelId: CH, employeeId: A, joinedAt: new Date(), lastReadMessageId: null, muted: false }];
    prisma.chatChannel.findFirst.mockResolvedValue({ ...channel, members });
    prisma.employee.findMany.mockResolvedValue([{ id: A, firstName: 'Ann', lastName: 'Lee', status: 'active' }, { id: B, firstName: 'Bob', lastName: 'Ray', status: 'active' }]);
    prisma.chatMessage.findUnique.mockResolvedValue(null);
    prisma.chatMessage.create.mockImplementation(async ({ data }: any) => ({ ...data, editedAt: null, deletedAt: null, recordRef: null }));
    const out = await service.sendMessage(user(B), CH, { body: 'hello @Ann Lee and @Bob Ray' }, 'key-1');
    expect(out.mentions).toEqual([A]); // the author is never mentioned
    expect(notifications.sendNotification).toHaveBeenCalledWith(A, 'chat_mention', 'You were mentioned', expect.stringContaining('#Ops'), expect.objectContaining({ channelId: CH }));
    expect(prisma.chatMember.update).toHaveBeenCalledWith({ where: { channelId_employeeId: { channelId: CH, employeeId: B } }, data: { lastReadMessageId: out.id } });
    expect(prisma.chatMessage.create.mock.calls[0][0].data.clientKey).toBe('key-1');
    expect(gateway.emitToChannel).toHaveBeenCalledWith(CH, 'chat.message.created', expect.objectContaining({ id: out.id }));

    prisma.chatMessage.findUnique.mockResolvedValue({ id: out.id, channelId: CH, authorId: B, body: out.body, mentions: [A], recordRef: null, clientKey: 'key-1', editedAt: null, deletedAt: null, createdAt: clock.now() });
    const again = await service.sendMessage(user(B), CH, { body: 'hello @Ann Lee and @Bob Ray' }, 'key-1');
    expect(again.id).toBe(out.id);
    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(1);
  });
});

describe('ChatGateway (room join requires membership)', () => {
  it('joins only chat:<channelId> rooms of the member channels plus the user room', async () => {
    const prisma = prismaMock();
    prisma.chatMember.findMany.mockResolvedValue([{ channelId: CH }]);
    const jwt: any = { verify: vi.fn().mockReturnValue({ sub: A, companyId: CO }) };
    const config: any = { get: vi.fn() };
    const gw = new ChatGateway(jwt, config, prisma);
    const client: any = { id: 's1', handshake: { auth: { token: 't' }, headers: {} }, join: vi.fn() };
    await gw.handleConnection(client);
    expect(prisma.chatMember.findMany).toHaveBeenCalledWith({ where: { employeeId: A }, select: { channelId: true } });
    expect(client.join).toHaveBeenCalledWith(`user:${A}`);
    expect(client.join).toHaveBeenCalledWith([`chat:${CH}`]);
  });

  it('accepts a token signed like AuthService does (JWT_SECRET default) and rejects another secret', async () => {
    const signer = new JwtService({ secret: 'company-os-dev-jwt-secret-key-32-chars-min' });
    const token = signer.sign({ sub: A, companyId: CO, roleId: 'r1' }, { expiresIn: '15m' });
    const prisma = prismaMock();
    prisma.chatMember.findMany.mockResolvedValue([]);
    const gw = new ChatGateway(new JwtService({}), { get: vi.fn().mockReturnValue(undefined) } as any, prisma);
    const client: any = { id: 's1', handshake: { auth: { token }, headers: {} }, join: vi.fn() };
    await gw.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith(`user:${A}`);
    const wrong = new JwtService({ secret: 'jwt_access_secret_for_dev_mode_only' }).sign({ sub: A });
    const client2: any = { id: 's2', handshake: { auth: { token: wrong }, headers: {} }, join: vi.fn() };
    await gw.handleConnection(client2);
    expect(client2.join).not.toHaveBeenCalled();
  });

  it('a bad token joins nothing', async () => {
    const prisma = prismaMock();
    const jwt: any = { verify: vi.fn(() => { throw new Error('bad'); }) };
    const gw = new ChatGateway(jwt, { get: vi.fn() } as any, prisma);
    const client: any = { id: 's1', handshake: { auth: { token: 't' }, headers: {} }, join: vi.fn() };
    await gw.handleConnection(client);
    expect(client.join).not.toHaveBeenCalled();
    expect(prisma.chatMember.findMany).not.toHaveBeenCalled();
  });
});

describe('ChatMembershipService.syncEmployee (FR-CHAT-01, FR-CHAT-10)', () => {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));

  it('removes a suspended employee from every channel and tells their sockets', async () => {
    const prisma = prismaMock();
    const gateway: any = { emitToUser: vi.fn(), joinUser: vi.fn(), leaveUser: vi.fn() };
    prisma.employee.findUnique.mockResolvedValue({ id: A, companyId: CO, status: 'suspended', deletedAt: null, departmentId: 'd1', teamId: null });
    prisma.chatMember.findMany.mockResolvedValue([{ channelId: CH }, { channelId: 'c2' }]);
    const svc = new ChatMembershipService(prisma, clock, gateway);
    expect(await svc.syncEmployee(A)).toEqual({ joined: 0, left: 2 });
    expect(prisma.chatMember.deleteMany).toHaveBeenCalledWith({ where: { employeeId: A } });
    expect(gateway.leaveUser).toHaveBeenCalledTimes(2);
    expect(prisma.chatChannel.upsert).not.toHaveBeenCalled();
  });

  it('an active employee moving departments leaves the old department channel and joins the new one', async () => {
    const prisma = prismaMock();
    const gateway: any = { emitToUser: vi.fn(), joinUser: vi.fn(), leaveUser: vi.fn() };
    prisma.employee.findUnique.mockResolvedValue({ id: A, companyId: CO, status: 'active', deletedAt: null, departmentId: 'ops', teamId: null });
    prisma.chatChannel.findUnique.mockResolvedValue({ id: 'c-company', kind: 'company' });
    prisma.department.findFirst.mockResolvedValue({ name: 'Ops' });
    prisma.chatChannel.upsert.mockResolvedValue({ id: 'c-ops', kind: 'department' });
    prisma.chatMember.findMany.mockResolvedValue([
      { channel: { id: 'c-company', kind: 'company', departmentId: null, teamId: null } },
      { channel: { id: 'c-sales', kind: 'department', departmentId: 'sales', teamId: null } },
    ]);
    const svc = new ChatMembershipService(prisma, clock, gateway);
    expect(await svc.syncEmployee(A)).toEqual({ joined: 1, left: 1 });
    expect(prisma.chatMember.deleteMany).toHaveBeenCalledWith({ where: { employeeId: A, channelId: { in: ['c-sales'] } } });
    expect(prisma.chatMember.createMany.mock.calls[0][0].data).toEqual([{ channelId: 'c-ops', employeeId: A, joinedAt: clock.now() }]);
    expect(gateway.joinUser).toHaveBeenCalledWith(A, 'c-ops');
    expect(gateway.leaveUser).toHaveBeenCalledWith(A, 'c-sales');
  });
});

describe('chat-retention job', () => {
  it('deletes per company with its own retention and audits counts', async () => {
    const prisma = prismaMock();
    const clock = new ClockService();
    clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
    prisma.company.findMany.mockResolvedValue([{ id: 'c1', settings: {} }, { id: 'c2', settings: { chatRetentionDays: 30 } }]);
    prisma.chatMessage.deleteMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 7 });
    const registry: any = { register: vi.fn(), scheduled: vi.fn() };
    const job = new ChatJobsService(prisma, clock, registry);
    job.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith('chat-retention', expect.any(String), expect.any(String), expect.any(Function));
    expect(await job.purge()).toEqual({ companies: 2, deleted: 7 });
    expect(prisma.chatMessage.deleteMany.mock.calls[0][0].where.createdAt.lt.toISOString()).toBe('2025-11-02T10:00:00.000Z');
    expect(prisma.chatMessage.deleteMany.mock.calls[1][0].where.createdAt.lt.toISOString()).toBe('2026-10-03T10:00:00.000Z');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c2', action: 'chat.retention.purge', after: { deleted: 7, retentionDays: 30 } });
  });
});
