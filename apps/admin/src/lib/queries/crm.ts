'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { http, type Page } from '../api';

// ---------------------------------------------------------------------------
// Types mirrored from the API responses (subset used by the UI)
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  code?: string;
  firstName: string;
  lastName: string;
}
export interface Tag {
  id: string;
  name: string;
  colour: string;
  usageCount?: number;
}
export interface Stage {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  type: 'open' | 'won' | 'lost';
  countsAsQualified: boolean;
  countsAsMeeting: boolean;
  probability: number;
}
export interface Pipeline {
  id: string;
  name: string;
  entity: 'lead' | 'deal';
  isDefault: boolean;
  stages: Stage[];
  _count?: { leads: number; deals: number };
}
export interface Lookup {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
}
export interface CustomFieldDef {
  id: string;
  entityType: EntityType;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  position: number;
  isActive: boolean;
}
export type EntityType = 'lead' | 'contact' | 'account' | 'deal';

export interface Lead {
  id: string;
  name: string;
  companyName: string | null;
  ownerId: string | null;
  owner: Person | null;
  pipelineId: string;
  stageId: string;
  stage: { id: string; name: string; type: string; position: number };
  pipeline?: Pipeline;
  sourceId: string | null;
  value: string | number | null;
  currency: string;
  priority: string;
  followUpAt: string | null;
  doNotCall: boolean;
  isClient: boolean;
  wonAt: string | null;
  lostAt: string | null;
  convertedAt: string | null;
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
  custom: Record<string, unknown>;
  lastActivityAt: string;
  createdAt: string;
  phones: Array<{ id: string; phoneE164: string; label: string; isPrimary: boolean }>;
  emails: Array<{ id: string; emailLower: string; label: string; isPrimary: boolean }>;
  notes?: Array<{ id: string; body: string; createdAt: string; authorId: string | null }>;
  callLogs?: Array<{ id: string; direction: string; outcome: string; durationSeconds: number; notes: string | null; occurredAt: string }>;
  timeline?: Array<{ id: string; type: string; data: Record<string, unknown>; occurredAt: string }>;
}

export interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  phone: string | null;
  website: string | null;
  address: Record<string, string>;
  ownerId: string | null;
  owner: Person | null;
  lifecycle: string;
  parentAccountId: string | null;
  parentAccount?: { id: string; name: string } | null;
  childAccounts?: Array<{ id: string; name: string; lifecycle: string }>;
  custom: Record<string, unknown>;
  lastActivityAt: string;
  createdAt: string;
  tags: Tag[];
  _count?: { contacts: number; deals: number };
  contacts?: Array<{ id: string; firstName: string; lastName: string; title: string | null; lifecycle: string; emails: Array<{ emailLower: string }>; phones: Array<{ phoneE164: string }> }>;
  deals?: Array<DealSummary>;
}

export interface DealSummary {
  id: string;
  name: string;
  amount: string | number | null;
  currency: string;
  probability: number;
  expectedCloseAt?: string | null;
  wonAt: string | null;
  lostAt: string | null;
  stage: { id: string; name: string; type: string };
  owner?: Person | null;
  role?: string | null;
  isPrimary?: boolean;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  accountId: string | null;
  account: { id: string; name: string; domain?: string | null; lifecycle?: string } | null;
  ownerId: string | null;
  owner: Person | null;
  lifecycle: string;
  address: Record<string, string>;
  doNotCall: boolean;
  doNotEmail: boolean;
  custom: Record<string, unknown>;
  leadId: string | null;
  lastActivityAt: string;
  createdAt: string;
  phones: Array<{ id: string; phoneE164: string; label: string; isPrimary: boolean }>;
  emails: Array<{ id: string; emailLower: string; label: string; isPrimary: boolean }>;
  tags: Tag[];
  deals?: DealSummary[];
}

export interface Deal {
  id: string;
  name: string;
  accountId: string | null;
  account: { id: string; name: string; domain?: string | null; lifecycle?: string } | null;
  pipelineId: string;
  stageId: string;
  stage: Stage | { id: string; name: string; type: string; position: number };
  pipeline: { id: string; name: string; stages?: Stage[] };
  amount: string | number | null;
  currency: string;
  probability: number;
  expectedCloseAt: string | null;
  ownerId: string | null;
  owner: Person | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReasonId: string | null;
  lostReason?: { id: string; name: string } | null;
  custom: Record<string, unknown>;
  lastActivityAt: string;
  createdAt: string;
  tags: Tag[];
  contacts?: Array<{ contactId: string; role: string | null; isPrimary: boolean; contact: { id: string; firstName: string; lastName: string; title: string | null; emails: Array<{ emailLower: string }>; phones: Array<{ phoneE164: string }> } }>;
}

export interface BoardColumn {
  stage: Stage;
  count: number;
  total: number;
  weighted: number;
  deals: Array<Deal & { owner: Person | null }>;
}
export interface Board {
  pipeline: { id: string; name: string };
  columns: BoardColumn[];
  weightedForecast: number;
}

export interface Activity {
  id: string;
  entityType: EntityType;
  entityId: string;
  entityName?: string | null;
  type: string;
  actorId: string | null;
  subject: string | null;
  body: string | null;
  status: 'planned' | 'done' | 'cancelled' | null;
  dueAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  data: Record<string, unknown>;
  occurredAt: string;
}

export interface Employee {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  role?: { id: string; name: string };
  department?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null;
}

export interface Dashboard {
  kpis: {
    pipelineValue: number;
    weightedForecast: number;
    openDeals: number;
    wonThisMonth: number;
    revenueThisMonth: number;
    winRate: number;
    dealsCreatedThisMonth: number;
    activitiesToday: number;
    overdueActivities: number;
    openLeads: number;
    leadsConvertedThisMonth: number;
  };
  byStage: Array<{ stageId: string; name: string; count: number; total: number }>;
  leaderboard: Array<{ owner: Person | null; won: number; revenue: number }>;
  recentActivities: Activity[];
}

export interface SearchResult {
  leads: Array<{ id: string; name: string; companyName: string | null; convertedAt: string | null; stage: { name: string; type: string } }>;
  contacts: Array<{ id: string; firstName: string; lastName: string; title: string | null; account: { id: string; name: string } | null }>;
  accounts: Array<{ id: string; name: string; domain: string | null; lifecycle: string }>;
  deals: Array<{ id: string; name: string; amount: string | null; currency: string; stage: { name: string; type: string }; account: { name: string } | null }>;
}

export interface ImportJob {
  id: string;
  entityType: 'lead' | 'contact' | 'account';
  fileName: string;
  headers: string[];
  preview: string[][];
  rowCount: number;
  status: 'mapping' | 'queued' | 'running' | 'done' | 'failed';
  mapping: Record<string, string>;
  totals: { rows?: number; created?: number; updated?: number; skipped?: number; failed?: number };
  errors: Array<{ row: number; reason: string }>;
  suggestedMapping?: Record<string, string>;
  fields?: string[];
}

type ListParams = Record<string, string | number | boolean | undefined | null>;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const keys = {
  pipelines: (entity?: string) => ['pipelines', entity ?? 'all'] as const,
  sources: ['crm', 'sources'] as const,
  lostReasons: ['crm', 'lost-reasons'] as const,
  tags: ['crm', 'tags'] as const,
  customFields: (entity?: string) => ['crm', 'custom-fields', entity ?? 'all'] as const,
  employees: ['employees'] as const,
  leads: (p: ListParams) => ['leads', p] as const,
  lead: (id: string) => ['leads', 'detail', id] as const,
  contacts: (p: ListParams) => ['contacts', p] as const,
  contact: (id: string) => ['contacts', 'detail', id] as const,
  accounts: (p: ListParams) => ['accounts', p] as const,
  account: (id: string) => ['accounts', 'detail', id] as const,
  deals: (p: ListParams) => ['deals', p] as const,
  deal: (id: string) => ['deals', 'detail', id] as const,
  board: (pipelineId: string, ownerId?: string) => ['deals', 'board', pipelineId, ownerId ?? ''] as const,
  activities: (entityType: string, entityId: string) => ['activities', entityType, entityId] as const,
  agenda: (range: string, ownerId?: string) => ['activities', 'agenda', range, ownerId ?? ''] as const,
  dashboard: ['crm', 'dashboard'] as const,
  search: (q: string) => ['crm', 'search', q] as const,
  importJob: (id: string) => ['crm', 'import', id] as const,
};

function opt<T>(o?: Partial<UseQueryOptions<T>>) {
  return o ?? {};
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const usePipelines = (entity?: 'lead' | 'deal') =>
  useQuery({ queryKey: keys.pipelines(entity), queryFn: () => http.get<Pipeline[]>('/pipelines', { entity }) });
export const useSources = (includeInactive = false) =>
  useQuery({ queryKey: [...keys.sources, includeInactive], queryFn: () => http.get<Lookup[]>('/crm/config/sources', { includeInactive }) });
export const useLostReasons = (includeInactive = false) =>
  useQuery({ queryKey: [...keys.lostReasons, includeInactive], queryFn: () => http.get<Lookup[]>('/crm/config/lost-reasons', { includeInactive }) });
export const useTags = () => useQuery({ queryKey: keys.tags, queryFn: () => http.get<Tag[]>('/crm/config/tags') });
export const useCustomFields = (entityType?: EntityType, includeInactive = false) =>
  useQuery({
    queryKey: [...keys.customFields(entityType), includeInactive],
    queryFn: () => http.get<CustomFieldDef[]>('/crm/config/custom-fields', { entityType, includeInactive }),
  });
export const useEmployees = () =>
  useQuery({ queryKey: keys.employees, queryFn: () => http.get<Employee[]>('/employees', { status: 'active' }), staleTime: 60_000 });

export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: ReadonlyArray<readonly unknown[]>) => prefixes.forEach((p) => qc.invalidateQueries({ queryKey: [...p] }));
}

/** Generic mutation helper: runs fn, then invalidates the given key prefixes. */
export function useCrmMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, invalidate: ReadonlyArray<readonly unknown[]>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [...k] })),
  });
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const useLeads = (p: ListParams) => useQuery({ queryKey: keys.leads(p), queryFn: () => http.get<Page<Lead>>('/leads', p) });
export const useLead = (id: string | null) =>
  useQuery({ queryKey: keys.lead(id ?? ''), queryFn: () => http.get<Lead>(`/leads/${id}`), enabled: Boolean(id) });

// ---------------------------------------------------------------------------
// Contacts / accounts / deals
// ---------------------------------------------------------------------------

export const useContacts = (p: ListParams) => useQuery({ queryKey: keys.contacts(p), queryFn: () => http.get<Page<Contact>>('/crm/contacts', p) });
export const useContact = (id: string | null) =>
  useQuery({ queryKey: keys.contact(id ?? ''), queryFn: () => http.get<Contact>(`/crm/contacts/${id}`), enabled: Boolean(id) });

export const useAccounts = (p: ListParams) => useQuery({ queryKey: keys.accounts(p), queryFn: () => http.get<Page<Account>>('/crm/accounts', p) });
export const useAccount = (id: string | null) =>
  useQuery({ queryKey: keys.account(id ?? ''), queryFn: () => http.get<Account>(`/crm/accounts/${id}`), enabled: Boolean(id) });

export const useDeals = (p: ListParams, o?: Partial<UseQueryOptions<Page<Deal>>>) =>
  useQuery({ queryKey: keys.deals(p), queryFn: () => http.get<Page<Deal>>('/crm/deals', p), ...opt(o) });
export const useDeal = (id: string | null) =>
  useQuery({ queryKey: keys.deal(id ?? ''), queryFn: () => http.get<Deal>(`/crm/deals/${id}`), enabled: Boolean(id) });
export const useBoard = (pipelineId: string | null, ownerId?: string) =>
  useQuery({
    queryKey: keys.board(pipelineId ?? '', ownerId),
    queryFn: () => http.get<Board>('/crm/deals/board', { pipelineId, ownerId }),
    enabled: Boolean(pipelineId),
  });

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const useActivities = (entityType: EntityType, entityId: string | null) =>
  useQuery({
    queryKey: keys.activities(entityType, entityId ?? ''),
    queryFn: () => http.get<Page<Activity>>('/crm/activities', { entityType, entityId, limit: 100 }),
    enabled: Boolean(entityId),
  });
export const useAgenda = (range: string, ownerId?: string) =>
  useQuery({ queryKey: keys.agenda(range, ownerId), queryFn: () => http.get<{ items: Activity[] }>('/crm/activities/agenda', { range, ownerId }) });

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => http.get<Dashboard>('/crm/dashboard') });
export const useSearch = (q: string) =>
  useQuery({ queryKey: keys.search(q), queryFn: () => http.get<SearchResult>('/crm/search', { q, limit: 5 }), enabled: q.trim().length >= 2 });
export const useImportJob = (id: string | null, poll: boolean) =>
  useQuery({
    queryKey: keys.importJob(id ?? ''),
    queryFn: () => http.get<ImportJob>(`/crm/import/${id}`),
    enabled: Boolean(id),
    refetchInterval: poll ? 1500 : false,
  });

// ---------------------------------------------------------------------------
// Saved views (FR-CRM-26), CRM-side mail threads (FR-MAIL-17), typed activities
// ---------------------------------------------------------------------------

export interface SavedView {
  id: string;
  entityType: EntityType;
  name: string;
  ownerId: string;
  visibility: 'private' | 'team' | 'company';
  filters: Record<string, unknown>;
  sort?: { field: string; direction: 'asc' | 'desc' } | null;
  columns?: string[] | null;
  isDefault: boolean;
}

export interface CrmThread {
  id: string;
  mailbox: { id: string; address: string; displayName: string };
  subject: string;
  snippet: string | null;
  lastMessageAt: string;
  status: string;
  assigneeId: string | null;
  canRead: boolean;
}

export const viewKeys = {
  views: (entityType: EntityType) => ['crm', 'views', entityType] as const,
  threads: (entityType: 'contact' | 'deal', id: string) => ['crm', 'threads', entityType, id] as const,
  activitiesOfType: (entityType: string, entityId: string, type: string) => ['activities', entityType, entityId, type] as const,
};

export const useViews = (entityType: EntityType) =>
  useQuery({ queryKey: viewKeys.views(entityType), queryFn: () => http.get<SavedView[]>('/crm/views', { entityType }), staleTime: 60_000 });

export const useRecordThreads = (entityType: 'contact' | 'deal', id: string | null) =>
  useQuery({
    queryKey: viewKeys.threads(entityType, id ?? ''),
    queryFn: () => http.get<CrmThread[]>(`/crm/${entityType}s/${id}/threads`),
    enabled: Boolean(id),
  });

export const useActivitiesOfType = (entityType: EntityType, entityId: string | null, type: string) =>
  useQuery({
    queryKey: viewKeys.activitiesOfType(entityType, entityId ?? '', type),
    queryFn: () => http.get<Page<Activity>>('/crm/activities', { entityType, entityId, type, limit: 100 }),
    enabled: Boolean(entityId),
  });
