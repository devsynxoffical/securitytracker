import { z } from 'zod';
import { TaskPriority, TaskStatusGroup, SpaceVisibility } from './enums.js';

// 14-tasks-spec.md

export const TaskPrioritySchema = z.enum([
  TaskPriority.URGENT,
  TaskPriority.HIGH,
  TaskPriority.NORMAL,
  TaskPriority.LOW,
  TaskPriority.NONE,
]);

export const TaskStatusGroupSchema = z.enum([
  TaskStatusGroup.OPEN,
  TaskStatusGroup.ACTIVE,
  TaskStatusGroup.DONE,
  TaskStatusGroup.CLOSED,
]);

export const DefaultStatusSchema = z.object({
  name: z.string().min(1).max(60),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5C666E'),
  group: TaskStatusGroupSchema,
});
export type DefaultStatusDto = z.infer<typeof DefaultStatusSchema>;

export const DEFAULT_TASK_STATUSES: DefaultStatusDto[] = [
  { name: 'To do', colour: '#5C666E', group: TaskStatusGroup.OPEN },
  { name: 'In progress', colour: '#2459C4', group: TaskStatusGroup.ACTIVE },
  { name: 'In review', colour: '#6B46C1', group: TaskStatusGroup.ACTIVE },
  { name: 'Done', colour: '#1E8E5A', group: TaskStatusGroup.DONE },
  { name: 'Cancelled', colour: '#8A939B', group: TaskStatusGroup.CLOSED },
];

// ---- Spaces (FR-TASK-06)
export const CreateSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0F6B5C'),
  icon: z.string().max(40).optional(),
  visibility: z.enum([SpaceVisibility.COMPANY, SpaceVisibility.PRIVATE]).default(SpaceVisibility.COMPANY),
  memberIds: z.array(z.string().guid()).optional(),
  defaultStatuses: z.array(DefaultStatusSchema).min(2).optional(),
});
export type CreateSpaceDto = z.infer<typeof CreateSpaceSchema>;
export const UpdateSpaceSchema = CreateSpaceSchema.omit({ memberIds: true }).partial();
export type UpdateSpaceDto = z.infer<typeof UpdateSpaceSchema>;

export const SpaceMemberSchema = z.object({
  employeeId: z.string().guid(),
  role: z.enum(['member', 'admin']).default('member'),
});
export type SpaceMemberDto = z.infer<typeof SpaceMemberSchema>;

// ---- Lists and statuses (FR-TASK-07)
export const CreateListSchema = z.object({
  spaceId: z.string().guid(),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
});
export type CreateListDto = z.infer<typeof CreateListSchema>;
export const UpdateListSchema = CreateListSchema.omit({ spaceId: true }).partial().extend({
  position: z.number().int().nonnegative().optional(),
});
export type UpdateListDto = z.infer<typeof UpdateListSchema>;

export const CreateStatusSchema = DefaultStatusSchema.extend({
  position: z.number().int().nonnegative().optional(),
});
export type CreateStatusDto = z.infer<typeof CreateStatusSchema>;
export const UpdateStatusSchema = CreateStatusSchema.partial();
export type UpdateStatusDto = z.infer<typeof UpdateStatusSchema>;
export const ReorderStatusesSchema = z.object({ statusIds: z.array(z.string().guid()).min(1) });
export type ReorderStatusesDto = z.infer<typeof ReorderStatusesSchema>;

// ---- Tasks (FR-TASK-08)
export const CreateWorkTaskSchema = z.object({
  listId: z.string().guid(),
  parentId: z.string().guid().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(50000).optional(),
  statusId: z.string().guid().optional(),
  priority: TaskPrioritySchema.default(TaskPriority.NORMAL),
  assigneeIds: z.array(z.string().guid()).optional(),
  startAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  timeEstimateSeconds: z.number().int().nonnegative().optional(),
  tagIds: z.array(z.string().guid()).optional(),
  leadId: z.string().guid().optional(),
  contactId: z.string().guid().optional(),
  accountId: z.string().guid().optional(),
  dealId: z.string().guid().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type CreateWorkTaskDto = z.infer<typeof CreateWorkTaskSchema>;

export const UpdateWorkTaskSchema = CreateWorkTaskSchema.omit({ listId: true, parentId: true, assigneeIds: true, statusId: true })
  .partial()
  .extend({
    listId: z.string().guid().optional(), // move
    position: z.number().nonnegative().optional(),
  });
export type UpdateWorkTaskDto = z.infer<typeof UpdateWorkTaskSchema>;

export const SetTaskStatusSchema = z.object({
  statusId: z.string().guid().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(), // legacy desktop body
});
export type SetTaskStatusDto = z.infer<typeof SetTaskStatusSchema>;

export const AddAssigneesSchema = z.object({ employeeIds: z.array(z.string().guid()).min(1) });
export type AddAssigneesDto = z.infer<typeof AddAssigneesSchema>;

export const TaskListQuerySchema = z.object({
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  listId: z.string().guid().optional(),
  spaceId: z.string().guid().optional(),
  assigneeId: z.string().guid().optional(),
  statusId: z.string().guid().optional(),
  group: TaskStatusGroupSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  tagId: z.string().guid().optional(),
  search: z.string().max(200).optional(),
  parentId: z.string().guid().optional(),
  includeArchived: z.coerce.boolean().default(false),
  includeSubtasks: z.coerce.boolean().default(false),
  sort: z.string().max(60).optional(),
});
export type TaskListQueryDto = z.infer<typeof TaskListQuerySchema>;

export const MyTasksQuerySchema = z.object({
  range: z.enum(['today', 'overdue', 'upcoming', 'nodate', 'done']).default('today'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type MyTasksQueryDto = z.infer<typeof MyTasksQuerySchema>;

// ---- Comments, checklists, time (FR-TASK-09, 10, 14)
export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(20000),
  mentions: z.array(z.string().guid()).optional(),
});
export type CreateCommentDto = z.infer<typeof CreateCommentSchema>;
export const UpdateCommentSchema = CreateCommentSchema.partial();
export type UpdateCommentDto = z.infer<typeof UpdateCommentSchema>;

export const CreateChecklistSchema = z.object({ title: z.string().min(1).max(200) });
export type CreateChecklistDto = z.infer<typeof CreateChecklistSchema>;
export const CreateChecklistItemSchema = z.object({ title: z.string().min(1).max(300) });
export type CreateChecklistItemDto = z.infer<typeof CreateChecklistItemSchema>;
export const UpdateChecklistItemSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  done: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
});
export type UpdateChecklistItemDto = z.infer<typeof UpdateChecklistItemSchema>;

export const CreateTimeEntrySchema = z
  .object({
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    durationSeconds: z.number().int().positive().optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.durationSeconds !== undefined || (v.startedAt && v.endedAt), {
    message: 'Provide durationSeconds or startedAt and endedAt',
  });
export type CreateTimeEntryDto = z.infer<typeof CreateTimeEntrySchema>;

// ---- Bulk (FR-TASK-15)
export const BulkTaskActionSchema = z.object({
  ids: z.array(z.string().guid()).min(1).max(500),
  action: z.enum(['status', 'assign', 'unassign', 'priority', 'due', 'move', 'add_tag', 'remove_tag', 'archive', 'restore']),
  statusId: z.string().guid().optional(),
  employeeId: z.string().guid().optional(),
  priority: TaskPrioritySchema.optional(),
  dueAt: z.string().datetime().nullable().optional(),
  listId: z.string().guid().optional(),
  tagId: z.string().guid().optional(),
});
export type BulkTaskActionDto = z.infer<typeof BulkTaskActionSchema>;
