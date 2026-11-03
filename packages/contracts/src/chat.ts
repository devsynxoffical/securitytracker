import { z } from 'zod';

/**
 * Internal chat (22-internal-chat-spec.md). DTOs for every route in section 5, the WebSocket event
 * names of FR-CHAT-05 and the notification type used for @mentions (FR-CHAT-07).
 */

export const ChatChannelKind = {
  COMPANY: 'company',
  DEPARTMENT: 'department',
  TEAM: 'team',
  GROUP: 'group',
  DIRECT: 'direct',
} as const;
export type ChatChannelKindValue = (typeof ChatChannelKind)[keyof typeof ChatChannelKind];
export const ChatChannelKindSchema = z.enum(['company', 'department', 'team', 'group', 'direct']);

/** Record types a message may link to (FR-CHAT-08); permission-checked at read time. */
export const ChatRecordRefType = {
  TASK: 'task',
  LEAD: 'lead',
  DEAL: 'deal',
  CONTACT: 'contact',
  MAIL: 'mail',
} as const;
export type ChatRecordRefTypeValue = (typeof ChatRecordRefType)[keyof typeof ChatRecordRefType];
export const ChatRecordRefSchema = z.object({
  type: z.enum(['task', 'lead', 'deal', 'contact', 'mail']),
  id: z.string().guid(),
});
export type ChatRecordRef = z.infer<typeof ChatRecordRefSchema>;

export const CHAT_MESSAGE_MAX_LENGTH = 4000;
/** Own messages may be edited for this long after creation (FR-CHAT-04). */
export const CHAT_EDIT_WINDOW_MINUTES = 15;
/** Typing broadcasts are accepted at most once per this many seconds per member and channel. */
export const CHAT_TYPING_INTERVAL_SECONDS = 3;
/** Default retention when the company settings JSON has no `chatRetentionDays`. */
export const CHAT_RETENTION_DAYS_DEFAULT = 365;

export const CreateGroupChannelSchema = z.object({
  kind: z.literal('group').default('group'),
  name: z.string().trim().min(1).max(80),
  memberIds: z.array(z.string().guid()).max(500).default([]),
});
export type CreateGroupChannelDto = z.infer<typeof CreateGroupChannelSchema>;

export const CreateDirectChannelSchema = z.object({
  employeeId: z.string().guid(),
});
export type CreateDirectChannelDto = z.infer<typeof CreateDirectChannelSchema>;

export const UpdateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.archived !== undefined, { message: 'Nothing to update' });
export type UpdateChannelDto = z.infer<typeof UpdateChannelSchema>;

export const SendMessageSchema = z.object({
  body: z.string().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  mentions: z.array(z.string().guid()).max(50).optional(),
  recordRef: ChatRecordRefSchema.nullable().optional(),
});
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const EditMessageSchema = z.object({
  body: z.string().min(1).max(CHAT_MESSAGE_MAX_LENGTH),
  mentions: z.array(z.string().guid()).max(50).optional(),
});
export type EditMessageDto = z.infer<typeof EditMessageSchema>;

export const MarkReadSchema = z.object({
  lastReadMessageId: z.string().guid(),
});
export type MarkReadDto = z.infer<typeof MarkReadSchema>;

export const ListMessagesQuerySchema = z.object({
  /** Message id; returns messages strictly older than it (newest first). */
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQueryDto = z.infer<typeof ListMessagesQuerySchema>;

export const ChatSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  channelId: z.string().guid().optional(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ChatSearchQueryDto = z.infer<typeof ChatSearchQuerySchema>;

export const ChatDirectoryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ChatDirectoryQueryDto = z.infer<typeof ChatDirectoryQuerySchema>;

export interface ChatDirectoryEntryDto {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  department: string | null;
  team: string | null;
}

export const ListChannelsQuerySchema = z.object({
  /** chat.manage only: list every channel in scope for moderation, not just memberships (FR-CHAT-13). */
  scope: z.enum(['mine', 'all']).default('mine'),
});
export type ListChannelsQueryDto = z.infer<typeof ListChannelsQuerySchema>;

/** Server to client events on namespace /ws (FR-CHAT-05). */
export const ChatWebSocketEvents = {
  MESSAGE_CREATED: 'chat.message.created',
  MESSAGE_UPDATED: 'chat.message.updated',
  MESSAGE_DELETED: 'chat.message.deleted',
  TYPING: 'chat.typing',
  READ: 'chat.read',
  /** Membership changed for the receiving user: channel list should be refetched. */
  CHANNEL_CHANGED: 'chat.channel.changed',
} as const;
export type ChatWebSocketEvent = (typeof ChatWebSocketEvents)[keyof typeof ChatWebSocketEvents];

export const ChatNotificationType = {
  MENTION: 'chat_mention',
} as const;

export interface ChatAuthorDto {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ChatRecordCardDto extends ChatRecordRef {
  title: string;
  status: string | null;
}

export interface ChatMessageDto {
  id: string;
  channelId: string;
  authorId: string;
  author: ChatAuthorDto | null;
  /** Empty string when deleted. */
  body: string;
  mentions: string[];
  recordRef: ChatRecordRef | null;
  /** Card resolved for the viewer; null when the viewer may not see the record or it is gone. */
  recordCard: ChatRecordCardDto | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ChatMemberDto {
  employeeId: string;
  firstName: string;
  lastName: string;
  status: string;
  joinedAt: string;
}

export interface ChatChannelDto {
  id: string;
  kind: ChatChannelKindValue;
  name: string;
  departmentId: string | null;
  teamId: string | null;
  createdBy: string | null;
  archivedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  /** True when the caller is a member; false only in the moderation listing. */
  isMember: boolean;
  unreadCount: number;
  lastMessage: { id: string; authorId: string; body: string; createdAt: string } | null;
  members: ChatMemberDto[];
  /** For direct channels: the other participant. */
  counterpart: ChatAuthorDto | null;
}

export interface ChatUnreadDto {
  total: number;
  channels: Array<{ channelId: string; unreadCount: number }>;
}

export interface ChatTypingPayload {
  channelId: string;
  employeeId: string;
  name: string;
  at: string;
}

export interface ChatReadPayload {
  channelId: string;
  employeeId: string;
  lastReadMessageId: string;
}

export interface ChatMessageDeletedPayload {
  channelId: string;
  id: string;
  deletedAt: string;
}
