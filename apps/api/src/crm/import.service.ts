import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  StartImportDto,
  ImportJobStatus,
  ImportDuplicateMode,
  CrmEntityType,
  CrmActivityType,
  ErrorCodes,
  CreateLeadSchema,
  CreateContactSchema,
  CreateAccountSchema,
  Lifecycle,
  PipelineEntity,
} from '@company-os/contracts';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { CrmActivitiesService } from './shared/activities.service';
import { CustomFieldsService } from './shared/custom-fields.service';
import { normalizeDomain, normalizeEmail, normalizeName, normalizePhone } from './shared/crm.util';

export type ImportEntity = 'lead' | 'contact' | 'account';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 50_000;
const BATCH = 500;

/** Field keys the UI can map a column to, per entity (F23). `custom.<key>` is also accepted. */
export const IMPORT_FIELDS: Record<ImportEntity, string[]> = {
  lead: ['name', 'companyName', 'phone', 'email', 'value', 'currency', 'source', 'followUpAt', 'priority'],
  contact: ['firstName', 'lastName', 'title', 'phone', 'email', 'accountName', 'lifecycle', 'city', 'country'],
  account: ['name', 'domain', 'industry', 'size', 'phone', 'website', 'lifecycle', 'city', 'country'],
};

/**
 * CSV import for leads, contacts and accounts (FR-CRM-28).
 * Step 1 `createJob` parses and stores the file with a preview. Step 2 `start` validates every row
 * with the object's Zod schema and writes in batches, running asynchronously after the request returns.
 */
@Injectable()
export class CrmImportService {
  private readonly logger = new Logger(CrmImportService.name);

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private activities: CrmActivitiesService,
    private customFields: CustomFieldsService,
  ) {}

  async createJob(companyId: string, uploaderId: string, entity: ImportEntity, fileName: string, csv: string) {
    if (Buffer.byteLength(csv, 'utf8') > MAX_BYTES) throw new BadRequestException('File exceeds 20 MB');
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new BadRequestException('CSV needs a header row and at least one data row');
    if (rows.length - 1 > MAX_ROWS) throw new BadRequestException(`CSV exceeds ${MAX_ROWS} rows`);
    const headers = rows[0]!.map((h) => h.trim());
    const preview = rows.slice(1, 21);
    const job = await this.prisma.importJob.create({
      data: {
        companyId,
        entityType: entity,
        uploaderId,
        fileName,
        headers: headers as Prisma.InputJsonValue,
        preview: preview as Prisma.InputJsonValue,
        rowCount: rows.length - 1,
        payload: csv,
        status: ImportJobStatus.MAPPING,
      },
    });
    return this.present(job, { suggestedMapping: suggestMapping(entity, headers), fields: IMPORT_FIELDS[entity] });
  }

  async getJob(companyId: string, id: string) {
    const job = await this.prisma.importJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Import job not found');
    return this.present(job, { fields: IMPORT_FIELDS[job.entityType as ImportEntity] });
  }

  /** Idempotent: a second start on a job that already left `mapping` is a 409. */
  async start(companyId: string, actorId: string, id: string, dto: StartImportDto) {
    const job = await this.prisma.importJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status !== ImportJobStatus.MAPPING) {
      throw new ConflictException({ code: ErrorCodes.IMPORT_JOB_INVALID_STATE, message: `Import is already ${job.status}` });
    }
    if (job.entityType === CrmEntityType.LEAD) {
      if (!dto.pipelineId || !dto.stageId) throw new BadRequestException('pipelineId and stageId are required for lead imports');
      const stage = await this.prisma.pipelineStage.findFirst({
        where: { id: dto.stageId, pipelineId: dto.pipelineId, pipeline: { companyId, entity: PipelineEntity.LEAD } },
      });
      if (!stage) throw new NotFoundException('Stage not found in a lead pipeline of this company');
    }
    const updated = await this.prisma.importJob.update({
      where: { id },
      data: { status: ImportJobStatus.QUEUED, mapping: dto.mapping as Prisma.InputJsonValue, options: dto as unknown as Prisma.InputJsonValue },
    });
    // Runs after the response. Failures are recorded on the job row.
    setImmediate(() => {
      this.run(updated.id, actorId).catch((e: unknown) => this.logger.error(`Import ${id} failed: ${(e as Error).message}`));
    });
    return this.present(updated, {});
  }

  async run(jobId: string, actorId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== ImportJobStatus.QUEUED) return;
    await this.prisma.importJob.update({ where: { id: jobId }, data: { status: ImportJobStatus.RUNNING } });

    const totals = { rows: job.rowCount, created: 0, updated: 0, skipped: 0, failed: 0 };
    const errors: Array<{ row: number; reason: string }> = [];
    const mapping = job.mapping as Record<string, string>;
    const options = job.options as unknown as StartImportDto;
    const rows = parseCsv(job.payload);
    const headers = rows[0]!;
    const entity = job.entityType as ImportEntity;
    const roundRobin = options.owner?.mode === 'round_robin' ? options.owner.employeeIds : null;
    let rr = 0;

    try {
      for (let start = 1; start < rows.length; start += BATCH) {
        const slice = rows.slice(start, start + BATCH);
        for (let i = 0; i < slice.length; i++) {
          const rowNumber = start + i;
          const record = toRecord(headers, slice[i]!, mapping);
          const ownerId = roundRobin ? roundRobin[rr++ % roundRobin.length]! : options.owner?.mode === 'fixed' ? options.owner.employeeId : actorId;
          try {
            const outcome = await this.importRow(job.companyId, actorId, entity, record, ownerId!, options, jobId);
            totals[outcome] += 1;
          } catch (e) {
            totals.failed += 1;
            if (errors.length < 1000) errors.push({ row: rowNumber, reason: errorMessage(e) });
          }
        }
        await this.prisma.importJob.update({ where: { id: jobId }, data: { totals: totals as unknown as Prisma.InputJsonValue } });
      }
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: ImportJobStatus.DONE, totals: totals as unknown as Prisma.InputJsonValue, errors: errors as unknown as Prisma.InputJsonValue, payload: '' },
      });
    } catch (e) {
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: { status: ImportJobStatus.FAILED, totals: totals as unknown as Prisma.InputJsonValue, errors: [...errors, { row: 0, reason: errorMessage(e) }] as unknown as Prisma.InputJsonValue },
      });
    }
  }

  private async importRow(
    companyId: string,
    actorId: string,
    entity: ImportEntity,
    record: { fields: Record<string, string>; custom: Record<string, string> },
    ownerId: string,
    options: StartImportDto,
    jobId: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const now = this.clock.now();
    const f = record.fields;
    const custom = Object.keys(record.custom).length
      ? await this.customFields.validate(companyId, entity, record.custom, { partial: true })
      : {};
    const imported = (entityType: typeof CrmEntityType[keyof typeof CrmEntityType], entityId: string, tx: Prisma.TransactionClient, updated: boolean) =>
      this.activities.append(tx, {
        companyId, entityType, entityId, type: CrmActivityType.IMPORTED, actorId, refType: 'import_job', refId: jobId,
        data: { jobId, updated }, occurredAt: now,
      });
    const tagRows = (entityType: string, entityId: string) =>
      (options.tagIds ?? []).map((tagId) => ({ companyId, entityType, entityId, tagId }));

    if (entity === 'lead') {
      const dto = CreateLeadSchema.parse({
        name: f.name,
        companyName: f.companyName || undefined,
        ownerId,
        pipelineId: options.pipelineId,
        stageId: options.stageId,
        sourceId: options.sourceId,
        value: f.value ? Number(f.value.replace(/[^0-9.]/g, '')) : undefined,
        currency: f.currency || 'USD',
        phones: f.phone ? [{ phone: f.phone, isPrimary: true }] : undefined,
        emails: f.email ? [{ email: f.email, isPrimary: true }] : undefined,
        followUpAt: f.followUpAt ? new Date(f.followUpAt).toISOString() : undefined,
        priority: f.priority?.toLowerCase() || undefined,
        allowDuplicate: true,
      });
      const existing = await this.prisma.lead.findFirst({
        where: {
          companyId, deletedAt: null,
          OR: [
            ...(f.phone ? [{ phones: { some: { phoneE164: normalizePhone(f.phone) } } }] : []),
            ...(f.email ? [{ emails: { some: { emailLower: normalizeEmail(f.email) } } }] : []),
          ],
        },
        select: { id: true },
      });
      if (existing && options.duplicateMode === ImportDuplicateMode.SKIP) return 'skipped';
      return this.prisma.$transaction(async (tx) => {
        if (existing && options.duplicateMode === ImportDuplicateMode.UPDATE) {
          await tx.lead.update({
            where: { id: existing.id },
            data: { name: dto.name, companyName: dto.companyName, value: dto.value, custom: custom as Prisma.InputJsonValue, lastActivityAt: now },
          });
          await imported(CrmEntityType.LEAD, existing.id, tx, true);
          return 'updated';
        }
        const lead = await tx.lead.create({
          data: {
            companyId, name: dto.name, companyName: dto.companyName ?? null, ownerId, pipelineId: dto.pipelineId, stageId: dto.stageId,
            sourceId: dto.sourceId ?? null, value: dto.value ?? null, currency: dto.currency, priority: dto.priority,
            followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null, custom: custom as Prisma.InputJsonValue, createdBy: actorId, lastActivityAt: now,
            phones: dto.phones ? { create: dto.phones.map((p) => ({ phoneE164: normalizePhone(p.phone), label: p.label, isPrimary: true })) } : undefined,
            emails: dto.emails ? { create: dto.emails.map((e) => ({ emailLower: normalizeEmail(e.email), label: e.label, isPrimary: true })) } : undefined,
          },
        });
        if (options.tagIds?.length) await tx.recordTag.createMany({ data: tagRows(CrmEntityType.LEAD, lead.id), skipDuplicates: true });
        await imported(CrmEntityType.LEAD, lead.id, tx, false);
        return 'created';
      });
    }

    if (entity === 'contact') {
      const dto = CreateContactSchema.parse({
        firstName: f.firstName,
        lastName: f.lastName || '',
        title: f.title || undefined,
        ownerId,
        lifecycle: f.lifecycle?.toLowerCase() || Lifecycle.LEAD,
        phones: f.phone ? [{ phone: f.phone, isPrimary: true }] : undefined,
        emails: f.email ? [{ email: f.email, isPrimary: true }] : undefined,
        address: f.city || f.country ? { city: f.city, country: f.country } : undefined,
        allowDuplicate: true,
      });
      const existing = await this.prisma.crmContact.findFirst({
        where: {
          companyId, deletedAt: null,
          OR: [
            ...(f.phone ? [{ phones: { some: { phoneE164: normalizePhone(f.phone) } } }] : []),
            ...(f.email ? [{ emails: { some: { emailLower: normalizeEmail(f.email) } } }] : []),
          ],
        },
        select: { id: true },
      });
      if (existing && options.duplicateMode === ImportDuplicateMode.SKIP) return 'skipped';
      return this.prisma.$transaction(async (tx) => {
        let accountId: string | null = null;
        if (f.accountName) {
          const acc = await tx.crmAccount.findFirst({ where: { companyId, deletedAt: null, nameNormalized: normalizeName(f.accountName) }, select: { id: true } });
          accountId = acc
            ? acc.id
            : (await tx.crmAccount.create({ data: { companyId, name: f.accountName, nameNormalized: normalizeName(f.accountName), ownerId, createdBy: actorId, lastActivityAt: now } })).id;
        }
        if (existing && options.duplicateMode === ImportDuplicateMode.UPDATE) {
          await tx.crmContact.update({
            where: { id: existing.id },
            data: { firstName: dto.firstName, lastName: dto.lastName, title: dto.title, accountId: accountId ?? undefined, custom: custom as Prisma.InputJsonValue, lastActivityAt: now },
          });
          await imported(CrmEntityType.CONTACT, existing.id, tx, true);
          return 'updated';
        }
        const contact = await tx.crmContact.create({
          data: {
            companyId, firstName: dto.firstName, lastName: dto.lastName, title: dto.title ?? null, accountId, ownerId, lifecycle: dto.lifecycle,
            address: (dto.address ?? {}) as Prisma.InputJsonValue, custom: custom as Prisma.InputJsonValue, createdBy: actorId, lastActivityAt: now,
            phones: dto.phones ? { create: dto.phones.map((p) => ({ phoneE164: normalizePhone(p.phone), label: p.label, isPrimary: true })) } : undefined,
            emails: dto.emails ? { create: dto.emails.map((e) => ({ emailLower: normalizeEmail(e.email), label: e.label, isPrimary: true })) } : undefined,
          },
        });
        if (options.tagIds?.length) await tx.recordTag.createMany({ data: tagRows(CrmEntityType.CONTACT, contact.id), skipDuplicates: true });
        await imported(CrmEntityType.CONTACT, contact.id, tx, false);
        return 'created';
      });
    }

    const dto = CreateAccountSchema.parse({
      name: f.name,
      domain: f.domain || undefined,
      industry: f.industry || undefined,
      size: f.size || undefined,
      phone: f.phone || undefined,
      website: f.website ? (f.website.startsWith('http') ? f.website : `https://${f.website}`) : undefined,
      lifecycle: f.lifecycle?.toLowerCase() || Lifecycle.PROSPECT,
      address: f.city || f.country ? { city: f.city, country: f.country } : undefined,
      ownerId,
      allowDuplicate: true,
    });
    const existing = await this.prisma.crmAccount.findFirst({
      where: { companyId, deletedAt: null, OR: [{ nameNormalized: normalizeName(dto.name) }, ...(dto.domain ? [{ domain: normalizeDomain(dto.domain) }] : [])] },
      select: { id: true },
    });
    if (existing && options.duplicateMode === ImportDuplicateMode.SKIP) return 'skipped';
    return this.prisma.$transaction(async (tx) => {
      if (existing && options.duplicateMode === ImportDuplicateMode.UPDATE) {
        await tx.crmAccount.update({
          where: { id: existing.id },
          data: { industry: dto.industry, size: dto.size, phone: dto.phone, website: dto.website, custom: custom as Prisma.InputJsonValue, lastActivityAt: now },
        });
        await imported(CrmEntityType.ACCOUNT, existing.id, tx, true);
        return 'updated';
      }
      const acc = await tx.crmAccount.create({
        data: {
          companyId, name: dto.name, nameNormalized: normalizeName(dto.name), domain: normalizeDomain(dto.domain), industry: dto.industry ?? null, size: dto.size ?? null,
          phone: dto.phone ?? null, website: dto.website ?? null, lifecycle: dto.lifecycle, address: (dto.address ?? {}) as Prisma.InputJsonValue,
          ownerId, custom: custom as Prisma.InputJsonValue, createdBy: actorId, lastActivityAt: now,
        },
      });
      if (options.tagIds?.length) await tx.recordTag.createMany({ data: tagRows(CrmEntityType.ACCOUNT, acc.id), skipDuplicates: true });
      await imported(CrmEntityType.ACCOUNT, acc.id, tx, false);
      return 'created';
    });
  }

  private present(job: { id: string; entityType: string; fileName: string; headers: unknown; preview: unknown; rowCount: number; status: string; mapping: unknown; totals: unknown; errors: unknown; createdAt: Date; updatedAt: Date }, extra: Record<string, unknown>) {
    return {
      id: job.id,
      entityType: job.entityType,
      fileName: job.fileName,
      headers: job.headers,
      preview: job.preview,
      rowCount: job.rowCount,
      status: job.status,
      mapping: job.mapping,
      totals: job.totals,
      errors: job.errors,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...extra,
    };
  }
}

// ---------------------------------------------------------------------------
// CSV helpers (RFC 4180: quotes, escaped quotes, newlines inside quotes)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

function toRecord(headers: string[], row: string[], mapping: Record<string, string>) {
  const fields: Record<string, string> = {};
  const custom: Record<string, string> = {};
  headers.forEach((h, i) => {
    const target = mapping[h.trim()];
    if (!target || target === 'ignore') return;
    const value = (row[i] ?? '').trim();
    if (!value) return;
    if (target.startsWith('custom.')) custom[target.slice(7)] = value;
    else fields[target] = value;
  });
  return { fields, custom };
}

function suggestMapping(entity: ImportEntity, headers: string[]): Record<string, string> {
  const aliases: Record<string, string[]> = {
    name: ['name', 'full name', 'lead name', 'company', 'company name', 'account'],
    companyName: ['company', 'company name', 'organisation', 'organization'],
    firstName: ['first name', 'firstname', 'first'],
    lastName: ['last name', 'lastname', 'surname', 'last'],
    phone: ['phone', 'mobile', 'telephone', 'phone number'],
    email: ['email', 'e-mail', 'email address'],
    title: ['title', 'job title', 'position'],
    value: ['value', 'amount', 'deal value'],
    domain: ['domain', 'website domain'],
    website: ['website', 'url'],
    industry: ['industry', 'sector'],
    size: ['size', 'employees', 'company size'],
    accountName: ['account', 'company', 'company name', 'account name'],
    lifecycle: ['lifecycle', 'stage', 'status'],
    city: ['city'],
    country: ['country'],
    source: ['source', 'lead source'],
    followUpAt: ['follow up', 'follow-up', 'follow up date'],
    priority: ['priority'],
  };
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const low = h.trim().toLowerCase();
    const match = IMPORT_FIELDS[entity].find((f) => !used.has(f) && (aliases[f] ?? [f.toLowerCase()]).includes(low));
    out[h.trim()] = match ?? 'ignore';
    if (match) used.add(match);
  }
  return out;
}

function errorMessage(e: unknown): string {
  // Duck-typed: the Zod instance from @company-os/contracts is not the same class as the API's own zod.
  const issues = (e as { issues?: Array<{ path: Array<string | number>; message: string }> } | null)?.issues;
  if (Array.isArray(issues)) return issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Unknown error';
}
