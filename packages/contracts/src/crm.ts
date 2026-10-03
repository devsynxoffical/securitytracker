import { z } from 'zod';
import { CallDirection, CallOutcome, TaskPriority, TaskStatus, StageType } from './enums.js';

export const CreateLeadSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  sourceId: z.string().uuid().optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  phones: z
    .array(
      z.object({
        phone: z.string().min(1),
        label: z.string().default('Mobile'),
        isPrimary: z.boolean().default(false),
      }),
    )
    .optional(),
  emails: z
    .array(
      z.object({
        email: z.string().email(),
        label: z.string().default('Work'),
        isPrimary: z.boolean().default(false),
      }),
    )
    .optional(),
  tags: z.array(z.string()).optional(),
  followUpAt: z.string().datetime().optional(),
  customFields: z.record(z.unknown()).optional(),
  allowDuplicate: z.boolean().default(false),
});
export type CreateLeadDto = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = CreateLeadSchema.partial();
export type UpdateLeadDto = z.infer<typeof UpdateLeadSchema>;

export const UpdateLeadStageSchema = z.object({
  stageId: z.string().uuid(),
  lostReasonId: z.string().uuid().optional(),
});
export type UpdateLeadStageDto = z.infer<typeof UpdateLeadStageSchema>;

export const AssignLeadSchema = z.object({
  ownerId: z.string().uuid(),
});
export type AssignLeadDto = z.infer<typeof AssignLeadSchema>;

export const BulkAssignLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1),
  ownerId: z.string().uuid(),
});
export type BulkAssignLeadsDto = z.infer<typeof BulkAssignLeadsSchema>;

export const AddNoteSchema = z.object({
  body: z.string().min(1),
});
export type AddNoteDto = z.infer<typeof AddNoteSchema>;

export const ScheduleAppointmentSchema = z.object({
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  notes: z.string().optional(),
});
export type ScheduleAppointmentDto = z.infer<typeof ScheduleAppointmentSchema>;

export const CheckDuplicateLeadSchema = z.object({
  phones: z.array(z.string()).optional(),
  emails: z.array(z.string().email()).optional(),
});
export type CheckDuplicateLeadDto = z.infer<typeof CheckDuplicateLeadSchema>;

export const LogCallSchema = z.object({
  leadId: z.string().uuid(),
  direction: z.enum([CallDirection.OUTBOUND, CallDirection.INBOUND]),
  outcome: z.enum([
    CallOutcome.CONNECTED,
    CallOutcome.NO_ANSWER,
    CallOutcome.BUSY,
    CallOutcome.VOICEMAIL,
    CallOutcome.WRONG_NUMBER,
    CallOutcome.DO_NOT_CALL,
  ]),
  durationSeconds: z.number().int().nonnegative(),
  notes: z.string().optional(),
  nextFollowUpAt: z.string().datetime().optional(),
  newStageId: z.string().uuid().optional(),
});
export type LogCallDto = z.infer<typeof LogCallSchema>;

export const CreateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  priority: z
    .enum([
      TaskPriority.LOW,
      TaskPriority.NORMAL,
      TaskPriority.HIGH,
      TaskPriority.URGENT,
    ])
    .default(TaskPriority.NORMAL),
  dueAt: z.string().datetime(),
});
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskStatusSchema = z.object({
  status: z.enum([
    TaskStatus.TODO,
    TaskStatus.IN_PROGRESS,
    TaskStatus.DONE,
    TaskStatus.CANCELLED,
  ]),
});
export type UpdateTaskStatusDto = z.infer<typeof UpdateTaskStatusSchema>;

export const CreatePipelineSchema = z.object({
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
});
export type CreatePipelineDto = z.infer<typeof CreatePipelineSchema>;

export const CreatePipelineStageSchema = z.object({
  name: z.string().min(1),
  position: z.number().int().nonnegative(),
  type: z.enum([StageType.OPEN, StageType.WON, StageType.LOST]).default(StageType.OPEN),
  countsAsQualified: z.boolean().default(false),
  countsAsMeeting: z.boolean().default(false),
});
export type CreatePipelineStageDto = z.infer<typeof CreatePipelineStageSchema>;
