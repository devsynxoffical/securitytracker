import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import {
  ChatAuthorDto,
  ChatChannelDto,
  ChatMemberDto,
  ChatMessageDto,
  ChatNotificationType,
  ChatRecordCardDto,
  ChatRecordRef,
  ChatSearchQueryDto,
  ChatUnreadDto,
  ChatWebSocketEvents,
  CreateDirectChannelDto,
  CreateGroupChannelDto,
  EditMessageDto,
  ErrorCodes,
  ListChannelsQueryDto,
  ListMessagesQueryDto,
  MarkReadDto,
  PermissionKey,
  Scope,
  SendMessageDto,
  UpdateChannelDto,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { PermissionsService } from '../auth/permissions.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { toCursorPage } from '../crm/shared/crm.util';
import { ChatGateway } from './chat.gateway';
import { ChatMembershipService } from './chat-membership.service';
import { advancesCursor, channelDisplayName, directKey, parseMentions, typingAllowed, withinEditWindow } from './chat.rules';

type ChannelRow = Prisma.ChatChannelGetPayload<{ include: { members: true } }>;
type MessageRow = Prisma.ChatMessageGetPayload<object>;
type EmployeeLite = { id: string; firstName: string; lastName: string; status: string };

const RECORD_PERMISSION: Record<ChatRecordRef['type'], PermissionKey> = {
  task: 'tasks.view',
  lead: 'crm.leads.view',
  deal: 'crm.deals.view',
  contact: 'crm.contacts.view',
  mail: 'mail.use',
};

/** Channels, messages, cursors, mentions and moderation (22-internal-chat-spec.md sections 2 to 5). */
@Injectable()
export class ChatService {
  private readonly typingAt = new Map<string, Date>();

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private permissions: PermissionsService,
    private notifications: NotificationsService,
    private gateway: ChatGateway,
    private membership: ChatMembershipService,
  ) {}

  // ------------------------------------------------------------------ access

  private notMember(): never {
    throw new ForbiddenException({ code: ErrorCodes.CHAT_NOT_MEMBER, message: 'You are not a member of this channel' });
  }

  private async loadChannel(user: AuthenticatedUser, channelId: string): Promise<ChannelRow> {
    const channel = await this.prisma.chatChannel.findFirst({ where: { id: channelId, companyId: user.companyId }, include: { members: true } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  /** Channel the caller is a member of; everything else is CHAT_NOT_MEMBER (403). */
  private async memberChannel(user: AuthenticatedUser, channelId: string): Promise<ChannelRow> {
    const channel = await this.loadChannel(user, channelId);
    if (!channel.members.some((m) => m.employeeId === user.id)) this.notMember();
    return channel;
  }

  /** Employees a chat.manage holder may moderate; null = whole company, [] = nobody. */
  private async moderationScope(user: AuthenticatedUser): Promise<string[] | null> {
    const scope = await this.permissions.scopeOf(user, 'chat.manage');
    return this.employeesInScope(user, scope);
  }

  private async employeesInScope(user: AuthenticatedUser, scope: Scope | null): Promise<string[] | null> {
    if (scope === null) return [];
    if (scope === 'all') return null;
    if (scope === 'own') return [user.id];
    if (scope === 'team') {
      const teams = await this.prisma.team.findMany({ where: { leaderId: user.id, companyId: user.companyId }, select: { id: true } });
      const members = await this.prisma.employee.findMany({ where: { companyId: user.companyId, teamId: { in: teams.map((t) => t.id) } }, select: { id: true } });
      return Array.from(new Set([user.id, ...members.map((m) => m.id)]));
    }
    const depts = await this.prisma.department.findMany({ where: { managerId: user.id, companyId: user.companyId }, select: { id: true } });
    const members = await this.prisma.employee.findMany({ where: { companyId: user.companyId, departmentId: { in: depts.map((d) => d.id) } }, select: { id: true } });
    return Array.from(new Set([user.id, ...members.map((m) => m.id)]));
  }

  /** FR-CHAT-13: a channel is in moderation scope when every member is in the manager's scope. */
  private channelInScope(channel: ChannelRow, scopeIds: string[] | null): boolean {
    if (scopeIds === null) return true;
    if (scopeIds.length === 0) return false;
    if (channel.kind === 'company') return false;
    return channel.members.every((m) => scopeIds.includes(m.employeeId));
  }

  private async canModerate(user: AuthenticatedUser, channel: ChannelRow): Promise<boolean> {
    return this.channelInScope(channel, await this.moderationScope(user));
  }

  /** Member, or chat.manage moderator; a moderator reading a channel they are not in is audited (FR-CHAT-13). */
  private async readableChannel(user: AuthenticatedUser, channelId: string): Promise<{ channel: ChannelRow; isMember: boolean }> {
    const channel = await this.loadChannel(user, channelId);
    const isMember = channel.members.some((m) => m.employeeId === user.id);
    if (isMember) return { channel, isMember };
    if (!(await this.canModerate(user, channel))) this.notMember();
    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'chat.moderation.read',
        entityType: 'chat_channel',
        entityId: channel.id,
        before: Prisma.JsonNull,
        after: { kind: channel.kind, members: channel.members.length },
        ip: 'server',
        client: 'admin',
        occurredAt: this.clock.now(),
      },
    });
    return { channel, isMember };
  }

  // ------------------------------------------------------------------ channels

  async listChannels(user: AuthenticatedUser, query: ListChannelsQueryDto): Promise<ChatChannelDto[]> {
    await this.membership.ensureCompanyChannel(user.companyId);
    await this.membership.syncEmployeeThrottled(user.id);

    let channels: ChannelRow[];
    if (query.scope === 'all') {
      const scopeIds = await this.moderationScope(user);
      if (scopeIds !== null && scopeIds.length === 0) throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: 'chat.manage is required' });
      const all = await this.prisma.chatChannel.findMany({ where: { companyId: user.companyId }, include: { members: true } });
      channels = all.filter((c) => c.members.some((m) => m.employeeId === user.id) || this.channelInScope(c, scopeIds));
    } else {
      channels = await this.prisma.chatChannel.findMany({ where: { companyId: user.companyId, members: { some: { employeeId: user.id } } }, include: { members: true } });
    }
    if (channels.length === 0) return [];

    const ids = channels.map((c) => c.id);
    const [employees, lastMessages, unread] = await Promise.all([
      this.employeesById(Array.from(new Set(channels.flatMap((c) => c.members.map((m) => m.employeeId))))),
      this.prisma.chatMessage.findMany({ where: { channelId: { in: ids }, deletedAt: null }, orderBy: { id: 'desc' }, distinct: ['channelId'], select: { id: true, channelId: true, authorId: true, body: true, createdAt: true } }),
      this.unreadByChannel(user.id),
    ]);
    const lastByChannel = new Map(lastMessages.map((m) => [m.channelId, m]));

    return channels
      .map((c) => this.toChannelDto(c, user.id, employees, lastByChannel.get(c.id) ?? null, unread.get(c.id) ?? 0))
      .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
  }

  async createGroup(user: AuthenticatedUser, dto: CreateGroupChannelDto): Promise<ChatChannelDto> {
    const wanted = Array.from(new Set([user.id, ...dto.memberIds]));
    const employees = await this.prisma.employee.findMany({ where: { id: { in: wanted }, companyId: user.companyId, status: 'active', deletedAt: null }, select: { id: true } });
    const memberIds = employees.map((e) => e.id);
    if (!memberIds.includes(user.id)) this.notMember();
    const now = this.clock.now();
    const channel = await this.prisma.chatChannel.create({
      data: { companyId: user.companyId, kind: 'group', name: dto.name, createdBy: user.id, createdAt: now, members: { create: memberIds.map((employeeId) => ({ employeeId, joinedAt: now })) } },
      include: { members: true },
    });
    for (const id of memberIds) {
      this.gateway.joinUser(id, channel.id);
      this.gateway.emitToUser(id, ChatWebSocketEvents.CHANNEL_CHANGED, { channelId: channel.id, reason: 'created' });
    }
    return this.toChannelDto(channel, user.id, await this.employeesById(memberIds), null, 0);
  }

  async createDirect(user: AuthenticatedUser, dto: CreateDirectChannelDto): Promise<ChatChannelDto> {
    if (dto.employeeId === user.id) throw new UnprocessableEntityException({ code: ErrorCodes.CHAT_DIRECT_SELF, message: 'A direct channel needs another employee' });
    const other = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, status: 'active', deletedAt: null }, select: { id: true } });
    if (!other) throw new NotFoundException('Employee not found or not active');
    const key = directKey(user.id, other.id);
    let channel = await this.prisma.chatChannel.findUnique({ where: { companyId_directKey: { companyId: user.companyId, directKey: key } }, include: { members: true } });
    if (!channel) {
      const now = this.clock.now();
      channel = await this.prisma.chatChannel.create({
        data: { companyId: user.companyId, kind: 'direct', name: '', directKey: key, createdBy: user.id, createdAt: now, members: { create: [user.id, other.id].map((employeeId) => ({ employeeId, joinedAt: now })) } },
        include: { members: true },
      });
      for (const id of [user.id, other.id]) {
        this.gateway.joinUser(id, channel.id);
        this.gateway.emitToUser(id, ChatWebSocketEvents.CHANNEL_CHANGED, { channelId: channel.id, reason: 'created' });
      }
    }
    const unread = await this.unreadByChannel(user.id);
    return this.toChannelDto(channel, user.id, await this.employeesById([user.id, other.id]), await this.lastMessageOf(channel.id), unread.get(channel.id) ?? 0);
  }

  async updateChannel(user: AuthenticatedUser, channelId: string, dto: UpdateChannelDto): Promise<ChatChannelDto> {
    const channel = await this.loadChannel(user, channelId);
    if (channel.kind !== 'group') throw new UnprocessableEntityException({ code: ErrorCodes.UNPROCESSABLE_ENTITY, message: 'Only group channels can be renamed or archived' });
    if (channel.createdBy !== user.id && !(await this.canModerate(user, channel))) {
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: 'Only the creator or chat.manage may change this channel' });
    }
    const updated = await this.prisma.chatChannel.update({
      where: { id: channel.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.archived !== undefined ? { archivedAt: dto.archived ? this.clock.now() : null } : {}),
      },
      include: { members: true },
    });
    for (const m of updated.members) this.gateway.emitToUser(m.employeeId, ChatWebSocketEvents.CHANNEL_CHANGED, { channelId: channel.id, reason: 'updated' });
    const unread = await this.unreadByChannel(user.id);
    return this.toChannelDto(updated, user.id, await this.employeesById(updated.members.map((m) => m.employeeId)), await this.lastMessageOf(channel.id), unread.get(channel.id) ?? 0);
  }

  async addMember(user: AuthenticatedUser, channelId: string, employeeId: string): Promise<ChatChannelDto> {
    const channel = await this.groupChannelManagedBy(user, channelId);
    const target = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, status: 'active', deletedAt: null }, select: { id: true } });
    if (!target) throw new NotFoundException('Employee not found or not active');
    await this.prisma.chatMember.createMany({ data: [{ channelId, employeeId, joinedAt: this.clock.now() }], skipDuplicates: true });
    this.gateway.joinUser(employeeId, channelId);
    this.gateway.emitToUser(employeeId, ChatWebSocketEvents.CHANNEL_CHANGED, { channelId, reason: 'added' });
    return this.channelDto(user, channelId);
  }

  async removeMember(user: AuthenticatedUser, channelId: string, employeeId: string): Promise<ChatChannelDto> {
    const channel = await this.groupChannelManagedBy(user, channelId);
    if (!channel.members.some((m) => m.employeeId === employeeId)) throw new NotFoundException('Not a member');
    await this.prisma.chatMember.deleteMany({ where: { channelId, employeeId } });
    this.gateway.leaveUser(employeeId, channelId);
    this.gateway.emitToUser(employeeId, ChatWebSocketEvents.CHANNEL_CHANGED, { channelId, reason: 'removed' });
    return this.channelDto(user, channelId);
  }

  async leave(user: AuthenticatedUser, channelId: string): Promise<{ left: true }> {
    const channel = await this.memberChannel(user, channelId);
    if (channel.kind !== 'group') throw new UnprocessableEntityException({ code: ErrorCodes.UNPROCESSABLE_ENTITY, message: 'Only group channels can be left' });
    await this.prisma.chatMember.deleteMany({ where: { channelId, employeeId: user.id } });
    this.gateway.leaveUser(user.id, channelId);
    return { left: true };
  }

  private async groupChannelManagedBy(user: AuthenticatedUser, channelId: string): Promise<ChannelRow> {
    const channel = await this.loadChannel(user, channelId);
    if (channel.kind !== 'group') throw new UnprocessableEntityException({ code: ErrorCodes.UNPROCESSABLE_ENTITY, message: 'Members can only be changed on group channels' });
    if (channel.createdBy !== user.id && !(await this.canModerate(user, channel))) {
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: 'Only the creator or chat.manage may change members' });
    }
    return channel;
  }

  private async channelDto(user: AuthenticatedUser, channelId: string): Promise<ChatChannelDto> {
    const channel = await this.loadChannel(user, channelId);
    const unread = await this.unreadByChannel(user.id);
    return this.toChannelDto(channel, user.id, await this.employeesById(channel.members.map((m) => m.employeeId)), await this.lastMessageOf(channelId), unread.get(channelId) ?? 0);
  }

  // ------------------------------------------------------------------ messages

  async listMessages(user: AuthenticatedUser, channelId: string, query: ListMessagesQueryDto) {
    await this.readableChannel(user, channelId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { channelId, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = toCursorPage(rows, query.limit);
    return { items: await this.toMessageDtos(user, page.items), nextCursor: page.nextCursor };
  }

  async sendMessage(user: AuthenticatedUser, channelId: string, dto: SendMessageDto, idempotencyKey?: string): Promise<ChatMessageDto> {
    const channel = await this.memberChannel(user, channelId);
    if (channel.archivedAt) throw new UnprocessableEntityException({ code: ErrorCodes.CHAT_CHANNEL_ARCHIVED, message: 'This channel is archived' });

    const clientKey = idempotencyKey?.trim() || null;
    if (clientKey) {
      const existing = await this.prisma.chatMessage.findUnique({ where: { authorId_clientKey: { authorId: user.id, clientKey } } });
      if (existing && existing.channelId === channelId) return (await this.toMessageDtos(user, [existing]))[0]!;
    }

    const members = await this.employeesById(channel.members.map((m) => m.employeeId));
    const mentions = this.resolveMentions(dto.body, dto.mentions, members, user.id);
    const now = this.clock.now();
    const id = uuidv7();
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: { id, channelId, authorId: user.id, body: dto.body, mentions, recordRef: dto.recordRef ? (dto.recordRef as Prisma.InputJsonValue) : Prisma.JsonNull, clientKey, createdAt: now },
      });
      await tx.chatChannel.update({ where: { id: channelId }, data: { lastMessageAt: now } });
      await tx.chatMember.update({ where: { channelId_employeeId: { channelId, employeeId: user.id } }, data: { lastReadMessageId: id } });
      return created;
    });

    const [dtoOut] = await this.toMessageDtos(user, [message]);
    this.gateway.emitToChannel(channelId, ChatWebSocketEvents.MESSAGE_CREATED, { ...dtoOut, recordCard: null });
    await this.notifyMentions(user, channel, message, mentions, members);
    return dtoOut!;
  }

  async editMessage(user: AuthenticatedUser, messageId: string, dto: EditMessageDto): Promise<ChatMessageDto> {
    const message = await this.ownMessage(user, messageId);
    if (!withinEditWindow(message.createdAt, this.clock.now())) {
      throw new UnprocessableEntityException({ code: ErrorCodes.CHAT_EDIT_WINDOW, message: 'Messages can be edited for 15 minutes' });
    }
    const channel = await this.memberChannel(user, message.channelId);
    const members = await this.employeesById(channel.members.map((m) => m.employeeId));
    const mentions = this.resolveMentions(dto.body, dto.mentions, members, user.id);
    const updated = await this.prisma.chatMessage.update({ where: { id: messageId }, data: { body: dto.body, mentions, editedAt: this.clock.now() } });
    const [out] = await this.toMessageDtos(user, [updated]);
    this.gateway.emitToChannel(message.channelId, ChatWebSocketEvents.MESSAGE_UPDATED, { ...out, recordCard: null });
    await this.notifyMentions(user, channel, updated, mentions.filter((m) => !message.mentions.includes(m)), members);
    return out!;
  }

  async deleteMessage(user: AuthenticatedUser, messageId: string): Promise<{ id: string; deletedAt: string }> {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, include: { channel: { include: { members: true } } } });
    if (!message || message.channel.companyId !== user.companyId || message.deletedAt) throw new NotFoundException('Message not found');
    const isOwn = message.authorId === user.id && message.channel.members.some((m) => m.employeeId === user.id);
    if (!isOwn && !(await this.canModerate(user, message.channel))) {
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: 'Only the author or chat.manage may delete this message' });
    }
    const deletedAt = this.clock.now();
    await this.prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt, body: '', mentions: [], recordRef: Prisma.JsonNull } });
    this.gateway.emitToChannel(message.channelId, ChatWebSocketEvents.MESSAGE_DELETED, { channelId: message.channelId, id: messageId, deletedAt: deletedAt.toISOString() });
    return { id: messageId, deletedAt: deletedAt.toISOString() };
  }

  private async ownMessage(user: AuthenticatedUser, messageId: string): Promise<MessageRow> {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, include: { channel: { select: { companyId: true } } } });
    if (!message || message.channel.companyId !== user.companyId || message.deletedAt) throw new NotFoundException('Message not found');
    if (message.authorId !== user.id) throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: 'Only the author may edit a message' });
    return message;
  }

  // ------------------------------------------------------------------ cursors, typing, unread

  async markRead(user: AuthenticatedUser, channelId: string, dto: MarkReadDto) {
    const channel = await this.memberChannel(user, channelId);
    const target = await this.prisma.chatMessage.findFirst({ where: { id: dto.lastReadMessageId, channelId }, select: { id: true } });
    if (!target) throw new NotFoundException('Message not found in this channel');
    const member = channel.members.find((m) => m.employeeId === user.id)!;
    if (advancesCursor(member.lastReadMessageId, target.id)) {
      await this.prisma.chatMember.update({ where: { channelId_employeeId: { channelId, employeeId: user.id } }, data: { lastReadMessageId: target.id } });
      this.gateway.emitToChannel(channelId, ChatWebSocketEvents.READ, { channelId, employeeId: user.id, lastReadMessageId: target.id });
    }
    const unread = await this.unreadByChannel(user.id);
    return { channelId, lastReadMessageId: advancesCursor(member.lastReadMessageId, target.id) ? target.id : member.lastReadMessageId, unreadCount: unread.get(channelId) ?? 0 };
  }

  async typing(user: AuthenticatedUser, channelId: string): Promise<{ broadcast: boolean }> {
    await this.memberChannel(user, channelId);
    const key = `${user.id}:${channelId}`;
    const now = this.clock.now();
    if (!typingAllowed(this.typingAt.get(key), now)) {
      throw new HttpException({ code: ErrorCodes.TOO_MANY_REQUESTS, message: 'Typing is broadcast at most every 3 seconds' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.typingAt.set(key, now);
    const [me] = await this.employeesById([user.id]);
    this.gateway.emitToChannel(channelId, ChatWebSocketEvents.TYPING, { channelId, employeeId: user.id, name: me ? `${me.firstName} ${me.lastName}`.trim() : user.code, at: now.toISOString() });
    return { broadcast: true };
  }

  async unread(user: AuthenticatedUser): Promise<ChatUnreadDto> {
    const perChannel = await this.unreadByChannel(user.id);
    const channels = Array.from(perChannel.entries()).map(([channelId, unreadCount]) => ({ channelId, unreadCount }));
    return { total: channels.reduce((s, c) => s + c.unreadCount, 0), channels };
  }

  /** One query for every membership: messages after the cursor, not own, not deleted. */
  private async unreadByChannel(employeeId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ channel_id: string; unread: number }>>(Prisma.sql`
      SELECT m.channel_id, COUNT(*)::int AS unread
      FROM chat_messages m
      JOIN chat_members cm ON cm.channel_id = m.channel_id AND cm.employee_id = ${employeeId}::uuid
      WHERE m.author_id <> ${employeeId}::uuid
        AND m.deleted_at IS NULL
        AND (cm.last_read_message_id IS NULL OR m.id > cm.last_read_message_id)
      GROUP BY m.channel_id`);
    return new Map(rows.map((r) => [r.channel_id, Number(r.unread)]));
  }

  // ------------------------------------------------------------------ search

  async search(user: AuthenticatedUser, query: ChatSearchQueryDto) {
    let channelIds: string[];
    if (query.channelId) {
      await this.readableChannel(user, query.channelId);
      channelIds = [query.channelId];
    } else {
      const memberships = await this.prisma.chatMember.findMany({ where: { employeeId: user.id }, select: { channelId: true } });
      channelIds = memberships.map((m) => m.channelId);
    }
    if (channelIds.length === 0) return { items: [], nextCursor: null };
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT m.id FROM chat_messages m
      WHERE m.channel_id = ANY(${channelIds}::uuid[])
        AND m.deleted_at IS NULL
        AND m.search @@ plainto_tsquery('simple', ${query.q})
        ${query.cursor ? Prisma.sql`AND m.id < ${query.cursor}::uuid` : Prisma.empty}
      ORDER BY m.id DESC
      LIMIT ${query.limit + 1}`);
    const page = toCursorPage(ids, query.limit);
    const rows = await this.prisma.chatMessage.findMany({ where: { id: { in: page.items.map((r) => r.id) } }, orderBy: { id: 'desc' } });
    return { items: await this.toMessageDtos(user, rows), nextCursor: page.nextCursor };
  }

  // ------------------------------------------------------------------ mapping helpers

  private resolveMentions(body: string, explicit: string[] | undefined, members: EmployeeLite[], authorId: string): string[] {
    const memberIds = new Set(members.map((m) => m.id));
    const parsed = parseMentions(body, members);
    return Array.from(new Set([...parsed, ...(explicit ?? [])])).filter((id) => memberIds.has(id) && id !== authorId);
  }

  private async notifyMentions(user: AuthenticatedUser, channel: ChannelRow, message: MessageRow, mentions: string[], members: EmployeeLite[]) {
    if (mentions.length === 0) return;
    const author = members.find((m) => m.id === user.id);
    const authorName = author ? `${author.firstName} ${author.lastName}`.trim() : user.code;
    const where = channel.kind === 'direct' ? 'a direct message' : `#${channel.name}`;
    for (const employeeId of mentions) {
      await this.notifications.sendNotification(employeeId, ChatNotificationType.MENTION, 'You were mentioned', `${authorName} mentioned you in ${where}`, { channelId: channel.id, messageId: message.id });
    }
  }

  private async employeesById(ids: string[]): Promise<EmployeeLite[]> {
    if (ids.length === 0) return [];
    return this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, status: true } });
  }

  private async lastMessageOf(channelId: string) {
    return this.prisma.chatMessage.findFirst({ where: { channelId, deletedAt: null }, orderBy: { id: 'desc' }, select: { id: true, channelId: true, authorId: true, body: true, createdAt: true } });
  }

  private toChannelDto(channel: ChannelRow, viewerId: string, employees: EmployeeLite[], last: { id: string; authorId: string; body: string; createdAt: Date } | null, unreadCount: number): ChatChannelDto {
    const byId = new Map(employees.map((e) => [e.id, e]));
    const members: ChatMemberDto[] = channel.members
      .map((m) => ({ m, e: byId.get(m.employeeId) }))
      .filter((x) => x.e)
      .map(({ m, e }) => ({ employeeId: m.employeeId, firstName: e!.firstName, lastName: e!.lastName, status: e!.status, joinedAt: m.joinedAt.toISOString() }));
    const other = channel.kind === 'direct' ? members.find((m) => m.employeeId !== viewerId) : undefined;
    const counterpart: ChatAuthorDto | null = other ? { id: other.employeeId, firstName: other.firstName, lastName: other.lastName } : null;
    return {
      id: channel.id,
      kind: channel.kind as ChatChannelDto['kind'],
      name: channelDisplayName(channel, counterpart),
      departmentId: channel.departmentId,
      teamId: channel.teamId,
      createdBy: channel.createdBy,
      archivedAt: channel.archivedAt?.toISOString() ?? null,
      lastMessageAt: channel.lastMessageAt?.toISOString() ?? null,
      createdAt: channel.createdAt.toISOString(),
      isMember: channel.members.some((m) => m.employeeId === viewerId),
      unreadCount,
      lastMessage: last ? { id: last.id, authorId: last.authorId, body: last.body, createdAt: last.createdAt.toISOString() } : null,
      members,
      counterpart,
    };
  }

  private async toMessageDtos(user: AuthenticatedUser, rows: MessageRow[]): Promise<ChatMessageDto[]> {
    if (rows.length === 0) return [];
    const authors = await this.employeesById(Array.from(new Set(rows.map((r) => r.authorId))));
    const byId = new Map(authors.map((a) => [a.id, a]));
    const cards = await this.resolveRecordCards(user, rows.map((r) => r.recordRef as ChatRecordRef | null));
    return rows.map((r, i) => {
      const a = byId.get(r.authorId);
      return {
        id: r.id,
        channelId: r.channelId,
        authorId: r.authorId,
        author: a ? { id: a.id, firstName: a.firstName, lastName: a.lastName } : null,
        body: r.deletedAt ? '' : r.body,
        mentions: r.mentions,
        recordRef: r.deletedAt ? null : ((r.recordRef as ChatRecordRef | null) ?? null),
        recordCard: r.deletedAt ? null : cards[i]!,
        editedAt: r.editedAt?.toISOString() ?? null,
        deletedAt: r.deletedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * FR-CHAT-08: a linked record renders as a card only when the viewer holds the record's view
   * permission and the record is inside their scope; otherwise the card is omitted.
   */
  private async resolveRecordCards(user: AuthenticatedUser, refs: Array<ChatRecordRef | null>): Promise<Array<ChatRecordCardDto | null>> {
    const out: Array<ChatRecordCardDto | null> = refs.map(() => null);
    const byType = new Map<ChatRecordRef['type'], Set<string>>();
    refs.forEach((ref) => {
      if (!ref || !ref.type || !ref.id || !(ref.type in RECORD_PERMISSION)) return;
      if (!byType.has(ref.type)) byType.set(ref.type, new Set());
      byType.get(ref.type)!.add(ref.id);
    });
    if (byType.size === 0) return out;

    const cards = new Map<string, ChatRecordCardDto>();
    for (const [type, idSet] of byType) {
      const scope = await this.permissions.scopeOf(user, RECORD_PERMISSION[type]);
      if (scope === null) continue;
      const allowed = await this.employeesInScope(user, scope);
      const ids = Array.from(idSet);
      const visible = (ownerId: string | null) => allowed === null || (ownerId !== null && allowed.includes(ownerId));
      if (type === 'task') {
        const rows = await this.prisma.task.findMany({ where: { id: { in: ids }, companyId: user.companyId, deletedAt: null }, select: { id: true, title: true, status: true, assigneeId: true } });
        rows.filter((r) => visible(r.assigneeId)).forEach((r) => cards.set(`task:${r.id}`, { type, id: r.id, title: r.title, status: r.status }));
      } else if (type === 'lead') {
        const rows = await this.prisma.lead.findMany({ where: { id: { in: ids }, companyId: user.companyId, deletedAt: null }, select: { id: true, name: true, ownerId: true, stage: { select: { name: true } } } });
        rows.filter((r) => visible(r.ownerId)).forEach((r) => cards.set(`lead:${r.id}`, { type, id: r.id, title: r.name, status: r.stage?.name ?? null }));
      } else if (type === 'deal') {
        const rows = await this.prisma.deal.findMany({ where: { id: { in: ids }, companyId: user.companyId, deletedAt: null }, select: { id: true, name: true, ownerId: true, stage: { select: { name: true } } } });
        rows.filter((r) => visible(r.ownerId)).forEach((r) => cards.set(`deal:${r.id}`, { type, id: r.id, title: r.name, status: r.stage?.name ?? null }));
      } else if (type === 'contact') {
        const rows = await this.prisma.crmContact.findMany({ where: { id: { in: ids }, companyId: user.companyId, deletedAt: null }, select: { id: true, firstName: true, lastName: true, title: true, ownerId: true } });
        rows.filter((r) => visible(r.ownerId)).forEach((r) => cards.set(`contact:${r.id}`, { type, id: r.id, title: `${r.firstName} ${r.lastName}`.trim(), status: r.title }));
      } else if (type === 'mail') {
        const assignments = await this.prisma.mailboxAssignment.findMany({ where: { employeeId: user.id }, select: { mailboxId: true } });
        const mailboxIds = assignments.map((a) => a.mailboxId);
        const rows = await this.prisma.mailThread.findMany({ where: { id: { in: ids }, mailbox: { companyId: user.companyId }, ...(allowed === null ? {} : { mailboxId: { in: mailboxIds } }) }, select: { id: true, subject: true, status: true } });
        rows.forEach((r) => cards.set(`mail:${r.id}`, { type, id: r.id, title: r.subject, status: r.status }));
      }
    }
    refs.forEach((ref, i) => {
      if (ref) out[i] = cards.get(`${ref.type}:${ref.id}`) ?? null;
    });
    return out;
  }
}
