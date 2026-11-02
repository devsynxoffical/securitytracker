import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClockService } from '../src/common/clock.service';
import { CustomFieldsService } from '../src/crm/shared/custom-fields.service';
import { CrmActivitiesService } from '../src/crm/shared/activities.service';
import { RecordTagsService } from '../src/crm/shared/tags.service';
import { AccountsService } from '../src/crm/accounts.service';
import { ContactsService } from '../src/crm/contacts.service';
import { DealsService } from '../src/crm/deals.service';
import { LeadConversionService } from '../src/crm/lead-conversion.service';
import { parseCsv, toCsv } from '../src/crm/import.service';
import { normalizeName, normalizeDomain, ownerScopeWhere } from '../src/crm/shared/crm.util';
import { ScopeFilter } from '../src/auth/guards/rbac.guard';

const COMPANY = '00000000-0000-0000-0000-000000000001';
const ME = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const UUID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const ownScope: ScopeFilter = { scope: 'own', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [ME] };
const allScope: ScopeFilter = { scope: 'all', companyId: COMPANY, employeeId: ME, allowedEmployeeIds: [] };

function prismaMock() {
  const table = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn(),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  const p: any = {
    lead: table(),
    crmAccount: table(),
    crmContact: table(),
    crmContactPhone: table(),
    crmContactEmail: table(),
    deal: table(),
    dealContact: table(),
    crmActivity: table(),
    recordTag: table(),
    tag: table(),
    customFieldDef: table(),
    pipelineStage: table(),
    pipeline: table(),
    lostReason: table(),
    leadTimeline: table(),
    employee: table(),
  };
  p.$transaction = vi.fn((cb: any) => (typeof cb === 'function' ? cb(p) : Promise.all(cb)));
  return p;
}

function services(prisma: any) {
  const clock = new ClockService();
  clock.setMockTime(new Date('2026-11-02T10:00:00.000Z'));
  const notifications: any = { sendNotification: vi.fn().mockResolvedValue({}) };
  const targets: any = { recordMetricEvent: vi.fn().mockResolvedValue({}) };
  const activities = new CrmActivitiesService(prisma, clock, targets);
  const tags = new RecordTagsService(prisma, activities);
  const customFields = new CustomFieldsService(prisma);
  const accounts = new AccountsService(prisma, clock, notifications, activities, tags, customFields);
  const contacts = new ContactsService(prisma, clock, notifications, activities, tags, customFields, accounts);
  const deals = new DealsService(prisma, clock, notifications, targets, activities, tags, customFields, accounts);
  const conversion = new LeadConversionService(prisma, clock, notifications, targets, activities, contacts, accounts, deals);
  return { clock, notifications, targets, activities, tags, customFields, accounts, contacts, deals, conversion };
}

describe('crm.util', () => {
  it('normalises company names and domains for duplicate detection', () => {
    expect(normalizeName('Acme Roofing, Inc.')).toBe('acme roofing');
    expect(normalizeName('ACME ROOFING INC')).toBe('acme roofing');
    expect(normalizeDomain('https://www.Acme.com/path')).toBe('acme.com');
    expect(normalizeDomain(undefined)).toBeNull();
  });

  it('builds owner scope: own restricts, all does not', () => {
    expect(ownerScopeWhere(ownScope)).toEqual({ ownerId: { in: [ME] } });
    expect(ownerScopeWhere(allScope)).toEqual({});
  });
});

describe('CustomFieldsService (FR-CRM-23)', () => {
  let prisma: any;
  let svc: CustomFieldsService;
  beforeEach(() => {
    prisma = prismaMock();
    svc = new CustomFieldsService(prisma);
    prisma.customFieldDef.findMany.mockResolvedValue([
      { key: 'region', label: 'Region', type: 'select', options: ['EU', 'US'], required: true },
      { key: 'seats', label: 'Seats', type: 'number', options: [], required: false },
      { key: 'renewal', label: 'Renewal', type: 'date', options: [], required: false },
    ]);
  });

  it('accepts valid values and coerces numbers', async () => {
    const out = await svc.validate(COMPANY, 'deal', { region: 'EU', seats: '12', renewal: '2026-12-01' }, { partial: false });
    expect(out).toEqual({ region: 'EU', seats: 12, renewal: '2026-12-01' });
  });

  it('rejects unknown keys, bad select options and missing required fields', async () => {
    await expect(svc.validate(COMPANY, 'deal', { colour: 'red' }, { partial: false })).rejects.toMatchObject({
      response: { code: 'CUSTOM_FIELD_INVALID' },
    });
    await expect(svc.validate(COMPANY, 'deal', { region: 'ASIA' }, { partial: false })).rejects.toThrow();
    await expect(svc.validate(COMPANY, 'deal', { seats: 3 }, { partial: false })).rejects.toThrow(); // region required
    await expect(svc.validate(COMPANY, 'deal', { seats: 3 }, { partial: true })).resolves.toEqual({ seats: 3 });
  });
});

describe('AccountsService scope (13 section 1 rule 5)', () => {
  it('own scope: list filters by owner OR related contact/deal owner', async () => {
    const prisma = prismaMock();
    const { accounts } = services(prisma);
    prisma.crmAccount.findMany.mockResolvedValue([]);
    await accounts.list(ownScope, { limit: 50 } as any);
    const where = prisma.crmAccount.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { ownerId: { in: [ME] } },
      { contacts: { some: { ownerId: { in: [ME] }, deletedAt: null } } },
      { deals: { some: { ownerId: { in: [ME] }, deletedAt: null } } },
    ]);
  });

  it('own scope: filtering by another owner is forbidden (denied case)', async () => {
    const prisma = prismaMock();
    const { accounts } = services(prisma);
    await expect(accounts.list(ownScope, { limit: 50, ownerId: OTHER } as any)).rejects.toThrow(/outside your scope/);
  });

  it('all scope: filtering by another owner is allowed (allowed case)', async () => {
    const prisma = prismaMock();
    const { accounts } = services(prisma);
    await accounts.list(allScope, { limit: 50, ownerId: OTHER } as any);
    expect(prisma.crmAccount.findMany.mock.calls[0][0].where.ownerId).toBe(OTHER);
    expect(prisma.crmAccount.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it('getById returns 404 outside scope, never 403', async () => {
    const prisma = prismaMock();
    const { accounts } = services(prisma);
    prisma.crmAccount.findFirst.mockResolvedValue(null);
    await expect(accounts.getById(UUID(5), ownScope)).rejects.toMatchObject({ status: 404 });
  });

  it('create rejects duplicate name unless allowDuplicate', async () => {
    const prisma = prismaMock();
    const { accounts } = services(prisma);
    prisma.crmAccount.findFirst.mockResolvedValue({ id: UUID(9), name: 'Acme Inc', domain: null });
    await expect(
      accounts.create(COMPANY, ME, { name: 'ACME, Inc.', lifecycle: 'prospect', allowDuplicate: false } as any),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_DUPLICATE' } });
  });
});

describe('ContactsService', () => {
  it('create flags duplicate phone/email (CONTACT_DUPLICATE)', async () => {
    const prisma = prismaMock();
    const { contacts } = services(prisma);
    prisma.crmContact.findMany.mockResolvedValue([{ id: UUID(1), firstName: 'A', lastName: 'B', account: null, owner: null }]);
    await expect(
      contacts.create(COMPANY, ME, { firstName: 'John', lastName: 'Doe', lifecycle: 'lead', phones: [{ phone: '(555) 123-4567', label: 'Mobile', isPrimary: true }], allowDuplicate: false } as any),
    ).rejects.toMatchObject({ response: { code: 'CONTACT_DUPLICATE' } });
    const where = prisma.crmContact.findMany.mock.calls[0][0].where;
    expect(where.OR[0].phones.some.phoneE164.in).toEqual(['5551234567']);
  });

  it('create writes contact, created activity and metric-free; own scope list uses ownerId filter', async () => {
    const prisma = prismaMock();
    const { contacts } = services(prisma);
    prisma.crmContact.create.mockResolvedValue({ id: UUID(2) });
    const res = await contacts.create(COMPANY, ME, { firstName: 'Jane', lastName: 'Roe', lifecycle: 'lead', allowDuplicate: false } as any);
    expect(res.id).toBe(UUID(2));
    expect(prisma.crmActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.crmActivity.create.mock.calls[0][0].data.type).toBe('created');

    await contacts.list(ownScope, { limit: 50 } as any);
    expect(prisma.crmContact.findMany.mock.calls.at(-1)[0].where.ownerId).toEqual({ in: [ME] });
  });
});

describe('DealsService stage rules (F22)', () => {
  function dealFixture(prisma: any, overrides: Record<string, unknown> = {}) {
    prisma.deal.findFirst.mockResolvedValue({
      id: UUID(3), companyId: COMPANY, ownerId: ME, pipelineId: UUID(20), stageId: UUID(21), amount: 1000, probability: 25,
      wonAt: null, lostAt: null, accountId: UUID(40), custom: {}, stage: { name: 'Discovery' }, contacts: [], ...overrides,
    });
    prisma.deal.update.mockImplementation(({ data }: any) => Promise.resolve({ id: UUID(3), ...data }));
  }

  it('moving to a lost stage without a reason is rejected', async () => {
    const prisma = prismaMock();
    const { deals } = services(prisma);
    dealFixture(prisma);
    prisma.pipelineStage.findFirst.mockResolvedValue({ id: UUID(26), name: 'Closed Lost', type: 'lost', probability: 0, countsAsQualified: false, pipeline: { entity: 'deal' } });
    await expect(deals.updateStage(UUID(3), ownScope, ME, { stageId: UUID(26) }, false)).rejects.toMatchObject({ response: { code: 'LOST_REASON_REQUIRED' } });
  });

  it('winning sets wonAt, probability from stage, marks account customer and records closings + revenue', async () => {
    const prisma = prismaMock();
    const { deals, targets } = services(prisma);
    dealFixture(prisma);
    prisma.pipelineStage.findFirst.mockResolvedValue({ id: UUID(25), name: 'Closed Won', type: 'won', probability: 100, countsAsQualified: false, pipeline: { entity: 'deal' } });
    prisma.crmAccount.findUnique.mockResolvedValue({ companyId: COMPANY, lifecycle: 'prospect' });
    const res = await deals.updateStage(UUID(3), ownScope, ME, { stageId: UUID(25) }, false);
    expect(res.wonAt).toBeInstanceOf(Date);
    expect(res.probability).toBe(100);
    expect(prisma.crmAccount.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lifecycle: 'customer' }) }));
    const keys = targets.recordMetricEvent.mock.calls.map((c: any[]) => c[2]);
    expect(keys).toEqual(expect.arrayContaining(['closings', 'revenue_won']));
  });

  it('reopening a closed deal requires crm.deals.reopen', async () => {
    const prisma = prismaMock();
    const { deals } = services(prisma);
    dealFixture(prisma, { wonAt: new Date('2026-10-01') });
    prisma.pipelineStage.findFirst.mockResolvedValue({ id: UUID(22), name: 'Proposal', type: 'open', probability: 50, countsAsQualified: false, pipeline: { entity: 'deal' } });
    await expect(deals.updateStage(UUID(3), ownScope, ME, { stageId: UUID(22) }, false)).rejects.toMatchObject({ status: 403 });
    await expect(deals.updateStage(UUID(3), ownScope, ME, { stageId: UUID(22) }, true)).resolves.toBeTruthy();
  });

  it('a lead pipeline stage cannot be used for a deal (PIPELINE_ENTITY_MISMATCH)', async () => {
    const prisma = prismaMock();
    const { deals } = services(prisma);
    prisma.pipelineStage.findFirst.mockResolvedValue({ id: UUID(11), type: 'open', probability: 0, pipeline: { entity: 'lead' } });
    await expect(deals.resolveStage(COMPANY, UUID(10), UUID(11))).rejects.toMatchObject({ response: { code: 'PIPELINE_ENTITY_MISMATCH' } });
  });

  it('board totals: amount per stage and weighted forecast from open stages only', async () => {
    const prisma = prismaMock();
    const { deals } = services(prisma);
    prisma.pipeline.findFirst.mockResolvedValue({
      id: UUID(20), name: 'Deals', stages: [
        { id: UUID(21), name: 'Discovery', type: 'open', position: 1 },
        { id: UUID(25), name: 'Won', type: 'won', position: 2 },
      ],
    });
    prisma.deal.findMany.mockResolvedValue([
      { id: UUID(1), stageId: UUID(21), amount: 1000, probability: 50 },
      { id: UUID(2), stageId: UUID(21), amount: 3000, probability: 25 },
      { id: UUID(3), stageId: UUID(25), amount: 5000, probability: 100 },
    ]);
    const board = await deals.board(allScope, UUID(20));
    expect(board.columns[0].total).toBe(4000);
    expect(board.columns[0].weighted).toBe(1250);
    expect(board.columns[1].total).toBe(5000);
    expect(board.weightedForecast).toBe(1250);
  });
});

describe('LeadConversionService (F21)', () => {
  function leadFixture(prisma: any, overrides: Record<string, unknown> = {}) {
    prisma.lead.findFirst.mockResolvedValue({
      id: UUID(100), companyId: COMPANY, name: 'Sarah Jenkins', ownerId: ME, stageId: UUID(11), value: 28000, currency: 'USD', doNotCall: false,
      convertedAt: null, wonAt: null, phones: [{ phoneE164: '5551234567', label: 'Mobile', isPrimary: true }], emails: [],
      pipeline: { stages: [{ id: UUID(11), type: 'open' }, { id: UUID(19), type: 'won' }] },
      notes: [{ id: UUID(50), authorId: ME, body: 'Met at trade show', createdAt: new Date('2026-10-01') }],
      callLogs: [], appointments: [], timeline: [], ...overrides,
    });
  }

  it('creates contact, new account and deal; copies history; freezes the lead into the won stage', async () => {
    const prisma = prismaMock();
    const { conversion, targets } = services(prisma);
    leadFixture(prisma);
    prisma.crmAccount.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: UUID(200) }); // no duplicate, then exists (inside tx)
    prisma.crmAccount.create.mockResolvedValue({ id: UUID(200) });
    prisma.crmContact.findMany.mockResolvedValue([]); // no duplicate contact
    prisma.crmContact.count.mockResolvedValue(1); // deal contact link check sees the new contact
    prisma.crmContact.create.mockResolvedValue({ id: UUID(300) });
    prisma.pipelineStage.findFirst.mockResolvedValue({ id: UUID(21), type: 'open', probability: 10, countsAsQualified: false, pipeline: { entity: 'deal' } });
    prisma.deal.create.mockResolvedValue({ id: UUID(400), name: 'Acme deal' });

    const res = await conversion.convert(UUID(100), ownScope, ME, {
      contact: { firstName: 'Sarah', lastName: 'Jenkins' },
      account: { mode: 'new', name: 'Apex Logistics Inc' },
      deal: { name: 'Apex - SLA', pipelineId: UUID(20), stageId: UUID(21), currency: 'USD' },
      allowDuplicate: false,
    });

    expect(res).toEqual({ contactId: UUID(300), accountId: UUID(200), dealId: UUID(400) });
    // deal amount defaulted from lead value, contact linked as primary
    expect(prisma.deal.create.mock.calls[0][0].data.amount).toBe(28000);
    expect(prisma.deal.create.mock.calls[0][0].data.contacts.create[0]).toMatchObject({ contactId: UUID(300), isPrimary: true });
    // lead frozen
    const leadUpdate = prisma.lead.update.mock.calls[0][0].data;
    expect(leadUpdate.convertedAt).toBeInstanceOf(Date);
    expect(leadUpdate.stageId).toBe(UUID(19));
    expect(leadUpdate.contactId).toBe(UUID(300));
    // history copied to contact AND deal, plus created/converted markers
    const types = prisma.crmActivity.create.mock.calls.map((c: any[]) => `${c[0].data.entityType}:${c[0].data.type}`);
    expect(types).toEqual(expect.arrayContaining(['contact:note', 'deal:note', 'lead:converted', 'account:created_from_lead', 'contact:created_from_lead', 'deal:created_from_lead']));
    expect(targets.recordMetricEvent).toHaveBeenCalledWith(COMPANY, ME, 'leads_qualified', 1, 'lead_converted', UUID(100), expect.any(Date));
  });

  it('refuses a second conversion (LEAD_ALREADY_CONVERTED)', async () => {
    const prisma = prismaMock();
    const { conversion } = services(prisma);
    leadFixture(prisma, { convertedAt: new Date('2026-10-05'), contactId: UUID(300) });
    await expect(
      conversion.convert(UUID(100), ownScope, ME, { contact: { firstName: 'S', lastName: '' }, account: { mode: 'none' }, allowDuplicate: false }),
    ).rejects.toMatchObject({ response: { code: 'LEAD_ALREADY_CONVERTED' } });
  });

  it('lead outside own scope is 404', async () => {
    const prisma = prismaMock();
    const { conversion } = services(prisma);
    prisma.lead.findFirst.mockResolvedValue(null);
    await expect(
      conversion.convert(UUID(100), ownScope, ME, { contact: { firstName: 'S', lastName: '' }, account: { mode: 'none' }, allowDuplicate: false }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.lead.findFirst.mock.calls[0][0].where.ownerId).toEqual({ in: [ME] });
  });
});

describe('CrmActivitiesService agenda (FR-CRM-22)', () => {
  it('today = planned, due within the UTC day, actor restricted by scope', async () => {
    const prisma = prismaMock();
    const { activities } = services(prisma);
    prisma.crmActivity.findMany.mockResolvedValue([]);
    await activities.agenda(ownScope, { range: 'today', limit: 100 });
    const where = prisma.crmActivity.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('planned');
    expect(where.actorId).toEqual({ in: [ME] });
    expect(where.dueAt.gte.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(where.dueAt.lt.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('filtering agenda by another owner outside scope is forbidden', async () => {
    const prisma = prismaMock();
    const { activities } = services(prisma);
    await expect(activities.agenda(ownScope, { range: 'today', limit: 100, ownerId: OTHER })).rejects.toMatchObject({ status: 403 });
  });
});

describe('CSV helpers (F23)', () => {
  it('parses quoted fields, escaped quotes, CRLF and skips blank lines', () => {
    const rows = parseCsv('﻿name,phone\r\n"Doe, John","555-1234"\r\n"Say ""hi""",\r\n\r\n');
    expect(rows).toEqual([
      ['name', 'phone'],
      ['Doe, John', '555-1234'],
      ['Say "hi"', ''],
    ]);
  });

  it('round-trips through toCsv', () => {
    const csv = toCsv([['a', 'b'], ['x,y', 'q"r']]);
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x,y', 'q"r']]);
  });
});
