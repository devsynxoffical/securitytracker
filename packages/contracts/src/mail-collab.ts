import { z } from 'zod';
import { MailConversationStatus } from './enums.js';

// 17-mail-collaboration-spec.md

export const ConversationViewSchema = z.enum(['unassigned', 'mine', 'open', 'snoozed', 'closed', 'all']);
export type ConversationView = z.infer<typeof ConversationViewSchema>;

export const ConversationListQuerySchema = z.object({
  view: ConversationViewSchema.default('open'),
  labelId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ConversationListQueryDto = z.infer<typeof ConversationListQuerySchema>;

export const AssignConversationSchema = z.object({
  assigneeId: z.string().uuid().nullable(),
});
export type AssignConversationDto = z.infer<typeof AssignConversationSchema>;

export const SetConversationStatusSchema = z
  .object({
    status: z.enum([MailConversationStatus.OPEN, MailConversationStatus.CLOSED, MailConversationStatus.SNOOZED]),
    snoozedUntil: z.string().datetime().optional(),
  })
  .refine((v) => v.status !== MailConversationStatus.SNOOZED || Boolean(v.snoozedUntil), { message: 'snoozedUntil is required when snoozing' });
export type SetConversationStatusDto = z.infer<typeof SetConversationStatusSchema>;

export const LinkConversationSchema = z.object({
  contactId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
});
export type LinkConversationDto = z.infer<typeof LinkConversationSchema>;

export const CreateMailCommentSchema = z.object({
  body: z.string().min(1).max(20000),
  mentions: z.array(z.string().uuid()).optional(),
});
export type CreateMailCommentDto = z.infer<typeof CreateMailCommentSchema>;

export const CreateMailLabelSchema = z.object({
  name: z.string().min(1).max(60),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2459C4'),
});
export type CreateMailLabelDto = z.infer<typeof CreateMailLabelSchema>;
export const UpdateMailLabelSchema = CreateMailLabelSchema.partial();
export type UpdateMailLabelDto = z.infer<typeof UpdateMailLabelSchema>;

export const CreateMailTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().max(300).default(''),
  bodyHtml: z.string().min(1).max(100000),
  shared: z.boolean().default(false),
});
export type CreateMailTemplateDto = z.infer<typeof CreateMailTemplateSchema>;
export const UpdateMailTemplateSchema = CreateMailTemplateSchema.partial();
export type UpdateMailTemplateDto = z.infer<typeof UpdateMailTemplateSchema>;

export const RenderTemplateSchema = z.object({
  threadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
});
export type RenderTemplateDto = z.infer<typeof RenderTemplateSchema>;
