import { z } from 'zod';
import { MailboxPermission } from './enums.js';

export const SendMailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1),
  html: z.string().min(1),
  replyToThreadId: z.string().optional(),
  replyToMessageId: z.string().optional(),
  attachmentFileIds: z.array(z.string().uuid()).optional(),
});
export type SendMailDto = z.infer<typeof SendMailSchema>;

export const SaveDraftSchema = z.object({
  id: z.string().optional(),
  to: z.array(z.string().email()).optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
  html: z.string().optional(),
  threadId: z.string().optional(),
});
export type SaveDraftDto = z.infer<typeof SaveDraftSchema>;

export const MailboxAssignmentSchema = z.object({
  employeeId: z.string().uuid(),
  permissions: z
    .array(
      z.enum([
        MailboxPermission.READ,
        MailboxPermission.SEND,
        MailboxPermission.REPLY,
        MailboxPermission.DRAFT,
        MailboxPermission.ATTACH,
        MailboxPermission.DOWNLOAD,
        MailboxPermission.ARCHIVE,
        MailboxPermission.MARK_READ,
      ]),
    )
    .min(1),
});
export type MailboxAssignmentDto = z.infer<typeof MailboxAssignmentSchema>;
