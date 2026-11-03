import { z } from 'zod';
import {
  CrmEntityType,
  Lifecycle,
  CrmActivityType,
  CrmActivityStatus,
  CustomFieldType,
  SavedViewVisibility,
  ImportDuplicateMode,
} from './enums.js';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export const CrmEntityTypeSchema = z.enum([
  CrmEntityType.LEAD,
  CrmEntityType.CONTACT,
  CrmEntityType.ACCOUNT,
  CrmEntityType.DEAL,
]);

export const LifecycleSchema = z.enum([
  Lifecycle.LEAD,
  Lifecycle.PROSPECT,
  Lifecycle.CUSTOMER,
  Lifecycle.CHURNED,
  Lifecycle.PARTNER,
]);

export const PhoneEntrySchema = z.object({
  phone: z.string().min(3),
  label: z.string().default('Mobile'),
  isPrimary: z.boolean().default(false),
});

export const EmailEntrySchema = z.object({
  email: z.string().email(),
  label: z.string().default('Work'),
  isPrimary: z.boolean().default(false),
});

export const AddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});
export type AddressDto = z.infer<typeof AddressSchema>;

export const CursorListQuerySchema = z.object({
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().max(200).optional(),
  ownerId: z.string().guid().optional(),
  tagId: z.string().guid().optional(),
  sort: z.string().max(60).optional(), // e.g. "lastActivityAt:desc"
});
export type CursorListQueryDto = z.infer<typeof CursorListQuerySchema>;

// ---------------------------------------------------------------------------
// Accounts (FR-CRM-18)
// ---------------------------------------------------------------------------

export const CreateAccountSchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(253).optional(),
  industry: z.string().max(100).optional(),
  size: z.string().max(50).optional(),
  phone: z.string().max(40).optional(),
  website: z.string().url().optional(),
  address: AddressSchema.optional(),
  ownerId: z.string().guid().optional(),
  lifecycle: LifecycleSchema.default(Lifecycle.PROSPECT),
  parentAccountId: z.string().guid().optional(),
  tagIds: z.array(z.string().guid()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  allowDuplicate: z.boolean().default(false),
});
export type CreateAccountDto = z.infer<typeof CreateAccountSchema>;

export const UpdateAccountSchema = CreateAccountSchema.omit({ allowDuplicate: true }).partial();
export type UpdateAccountDto = z.infer<typeof UpdateAccountSchema>;

export const AccountListQuerySchema = CursorListQuerySchema.extend({
  lifecycle: LifecycleSchema.optional(),
  industry: z.string().optional(),
});
export type AccountListQueryDto = z.infer<typeof AccountListQuerySchema>;

// ---------------------------------------------------------------------------
// Contacts (FR-CRM-17)
// ---------------------------------------------------------------------------

export const CreateContactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).default(''),
  title: z.string().max(120).optional(),
  accountId: z.string().guid().optional(),
  ownerId: z.string().guid().optional(),
  lifecycle: LifecycleSchema.default(Lifecycle.LEAD),
  phones: z.array(PhoneEntrySchema).optional(),
  emails: z.array(EmailEntrySchema).optional(),
  address: AddressSchema.optional(),
  doNotCall: z.boolean().default(false),
  doNotEmail: z.boolean().default(false),
  tagIds: z.array(z.string().guid()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  allowDuplicate: z.boolean().default(false),
});
export type CreateContactDto = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.omit({ allowDuplicate: true }).partial();
export type UpdateContactDto = z.infer<typeof UpdateContactSchema>;

export const ContactListQuerySchema = CursorListQuerySchema.extend({
  accountId: z.string().guid().optional(),
  lifecycle: LifecycleSchema.optional(),
});
export type ContactListQueryDto = z.infer<typeof ContactListQuerySchema>;

export const CheckDuplicateContactSchema = z.object({
  phones: z.array(z.string()).optional(),
  emails: z.array(z.string().email()).optional(),
});
export type CheckDuplicateContactDto = z.infer<typeof CheckDuplicateContactSchema>;

// ---------------------------------------------------------------------------
// Deals (FR-CRM-19, F22)
// ---------------------------------------------------------------------------

export const DealContactLinkSchema = z.object({
  contactId: z.string().guid(),
  role: z.string().max(60).optional(),
  isPrimary: z.boolean().default(false),
});

export const CreateDealSchema = z.object({
  name: z.string().min(1).max(200),
  accountId: z.string().guid().optional(),
  contacts: z.array(DealContactLinkSchema).optional(),
  pipelineId: z.string().guid(),
  stageId: z.string().guid(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.string().datetime().optional(),
  ownerId: z.string().guid().optional(),
  tagIds: z.array(z.string().guid()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDealDto = z.infer<typeof CreateDealSchema>;

export const UpdateDealSchema = CreateDealSchema.omit({ pipelineId: true, stageId: true }).partial();
export type UpdateDealDto = z.infer<typeof UpdateDealSchema>;

export const UpdateDealStageSchema = z.object({
  stageId: z.string().guid(),
  lostReasonId: z.string().guid().optional(),
});
export type UpdateDealStageDto = z.infer<typeof UpdateDealStageSchema>;

export const DealListQuerySchema = CursorListQuerySchema.extend({
  pipelineId: z.string().guid().optional(),
  stageId: z.string().guid().optional(),
  accountId: z.string().guid().optional(),
  status: z.enum(['open', 'won', 'lost']).optional(),
});
export type DealListQueryDto = z.infer<typeof DealListQuerySchema>;

// ---------------------------------------------------------------------------
// Generic record actions (FR-CRM-30)
// ---------------------------------------------------------------------------

export const AssignRecordSchema = z.object({
  ownerId: z.string().guid(),
});
export type AssignRecordDto = z.infer<typeof AssignRecordSchema>;

export const BulkRecordActionSchema = z.object({
  ids: z.array(z.string().guid()).min(1).max(500),
  action: z.enum(['assign', 'add_tag', 'remove_tag', 'stage', 'delete']),
  ownerId: z.string().guid().optional(),
  tagId: z.string().guid().optional(),
  stageId: z.string().guid().optional(),
  lostReasonId: z.string().guid().optional(),
});
export type BulkRecordActionDto = z.infer<typeof BulkRecordActionSchema>;

// ---------------------------------------------------------------------------
// Lead conversion (FR-CRM-20, F21)
// ---------------------------------------------------------------------------

export const ConvertLeadSchema = z.object({
  contact: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).default(''),
    title: z.string().max(120).optional(),
  }),
  account: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('none') }),
      z.object({ mode: z.literal('existing'), accountId: z.string().guid() }),
      z.object({ mode: z.literal('new'), name: z.string().min(1).max(200), domain: z.string().optional() }),
    ])
    .default({ mode: 'none' }),
  deal: z
    .object({
      name: z.string().min(1).max(200),
      pipelineId: z.string().guid(),
      stageId: z.string().guid(),
      amount: z.number().nonnegative().optional(),
      currency: z.string().length(3).default('USD'),
      expectedCloseAt: z.string().datetime().optional(),
    })
    .optional(),
  ownerId: z.string().guid().optional(),
  allowDuplicate: z.boolean().default(false),
});
export type ConvertLeadDto = z.infer<typeof ConvertLeadSchema>;

// ---------------------------------------------------------------------------
// Activities (FR-CRM-21, FR-CRM-22)
// ---------------------------------------------------------------------------

export const CreateActivitySchema = z.object({
  entityType: CrmEntityTypeSchema,
  entityId: z.string().guid(),
  type: z.enum([
    CrmActivityType.NOTE,
    CrmActivityType.CALL,
    CrmActivityType.EMAIL,
    CrmActivityType.MEETING,
    CrmActivityType.TASK,
  ]),
  subject: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  status: z.enum([CrmActivityStatus.PLANNED, CrmActivityStatus.DONE, CrmActivityStatus.CANCELLED]).optional(),
  dueAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type CreateActivityDto = z.infer<typeof CreateActivitySchema>;

export const UpdateActivityStatusSchema = z.object({
  status: z.enum([CrmActivityStatus.PLANNED, CrmActivityStatus.DONE, CrmActivityStatus.CANCELLED]),
});
export type UpdateActivityStatusDto = z.infer<typeof UpdateActivityStatusSchema>;

export const ActivityListQuerySchema = z.object({
  entityType: CrmEntityTypeSchema,
  entityId: z.string().guid(),
  cursor: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  type: z.string().optional(),
});
export type ActivityListQueryDto = z.infer<typeof ActivityListQuerySchema>;

export const AgendaQuerySchema = z.object({
  range: z.enum(['today', 'overdue', 'upcoming', 'done']).default('today'),
  ownerId: z.string().guid().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type AgendaQueryDto = z.infer<typeof AgendaQuerySchema>;

// ---------------------------------------------------------------------------
// Config: sources, lost reasons, tags, custom fields (FR-CRM-23 to 25)
// ---------------------------------------------------------------------------

export const CreateLookupSchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().default(true),
});
export type CreateLookupDto = z.infer<typeof CreateLookupSchema>;
export const UpdateLookupSchema = CreateLookupSchema.partial();
export type UpdateLookupDto = z.infer<typeof UpdateLookupSchema>;

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(60),
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#5C666E'),
});
export type CreateTagDto = z.infer<typeof CreateTagSchema>;
export const UpdateTagSchema = CreateTagSchema.partial();
export type UpdateTagDto = z.infer<typeof UpdateTagSchema>;

export const CustomFieldTypeSchema = z.enum([
  CustomFieldType.TEXT,
  CustomFieldType.NUMBER,
  CustomFieldType.DATE,
  CustomFieldType.SELECT,
  CustomFieldType.MULTI_SELECT,
  CustomFieldType.CHECKBOX,
  CustomFieldType.URL,
  CustomFieldType.PHONE,
  CustomFieldType.EMAIL,
]);

export const CreateCustomFieldSchema = z.object({
  entityType: CrmEntityTypeSchema,
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, 'key must be snake_case'),
  label: z.string().min(1).max(100),
  type: CustomFieldTypeSchema,
  options: z.array(z.string().min(1).max(100)).optional(),
  required: z.boolean().default(false),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().default(true),
});
export type CreateCustomFieldDto = z.infer<typeof CreateCustomFieldSchema>;
export const UpdateCustomFieldSchema = CreateCustomFieldSchema.omit({ entityType: true, key: true }).partial();
export type UpdateCustomFieldDto = z.infer<typeof UpdateCustomFieldSchema>;

// ---------------------------------------------------------------------------
// Saved views (FR-CRM-26)
// ---------------------------------------------------------------------------

export const CreateSavedViewSchema = z.object({
  entityType: CrmEntityTypeSchema,
  name: z.string().min(1).max(100),
  visibility: z
    .enum([SavedViewVisibility.PRIVATE, SavedViewVisibility.TEAM, SavedViewVisibility.COMPANY])
    .default(SavedViewVisibility.PRIVATE),
  filters: z.record(z.string(), z.unknown()).default({}),
  sort: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
  columns: z.array(z.string()).optional(),
  isDefault: z.boolean().default(false),
});
export type CreateSavedViewDto = z.infer<typeof CreateSavedViewSchema>;
export const UpdateSavedViewSchema = CreateSavedViewSchema.omit({ entityType: true }).partial();
export type UpdateSavedViewDto = z.infer<typeof UpdateSavedViewSchema>;

// ---------------------------------------------------------------------------
// Import (FR-CRM-28, F23)
// ---------------------------------------------------------------------------

export const ImportEntitySchema = z.enum([CrmEntityType.LEAD, CrmEntityType.CONTACT, CrmEntityType.ACCOUNT]);

export const StartImportSchema = z.object({
  mapping: z.record(z.string(), z.string()), // csv column -> field key, "custom.<key>" or "ignore"
  duplicateMode: z
    .enum([ImportDuplicateMode.SKIP, ImportDuplicateMode.UPDATE, ImportDuplicateMode.CREATE])
    .default(ImportDuplicateMode.SKIP),
  owner: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('fixed'), employeeId: z.string().guid() }),
      z.object({ mode: z.literal('round_robin'), employeeIds: z.array(z.string().guid()).min(1) }),
    ])
    .optional(),
  tagIds: z.array(z.string().guid()).optional(),
  sourceId: z.string().guid().optional(),
  pipelineId: z.string().guid().optional(),
  stageId: z.string().guid().optional(),
});
export type StartImportDto = z.infer<typeof StartImportSchema>;

export const ImportTotalsSchema = z.object({
  rows: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
});
export type ImportTotals = z.infer<typeof ImportTotalsSchema>;

// ---------------------------------------------------------------------------
// Search (FR-CRM-32)
// ---------------------------------------------------------------------------

export const CrmSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type CrmSearchQueryDto = z.infer<typeof CrmSearchQuerySchema>;
