import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { AccountListQuerySchema, ContactListQuerySchema, DealListQuerySchema } from '@company-os/contracts';
import { AccountsService } from './accounts.service';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { toCsv } from './import.service';
import { ScopeFilter } from '../auth/guards/rbac.guard';

const EXPORT_LIMIT = 10_000;
type Row = Array<string | number | null>;

/** FR-CRM-29: CSV export with the list filters, capped at 10,000 rows. Audited by the interceptor (GET on /export is a listed read). */
@Injectable()
export class CrmExportService {
  constructor(
    private accounts: AccountsService,
    private contacts: ContactsService,
    private deals: DealsService,
  ) {}

  send(res: Response, name: string, rows: Row[]) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-export.csv"`);
    res.send(toCsv(rows));
  }

  async accountsCsv(scope: ScopeFilter, query: unknown): Promise<Row[]> {
    const out: Row[] = [['Name', 'Domain', 'Industry', 'Size', 'Phone', 'Website', 'Lifecycle', 'Owner', 'Contacts', 'Deals', 'Tags', 'Last activity']];
    let cursor: string | undefined;
    while (out.length <= EXPORT_LIMIT) {
      const page = await this.accounts.list(scope, AccountListQuerySchema.parse({ ...(query as object), cursor, limit: 200 }));
      for (const a of page.items) out.push([a.name, a.domain, a.industry, a.size, a.phone, a.website, a.lifecycle, fullName(a.owner), a._count.contacts, a._count.deals, a.tags.map((t) => t.name).join('; '), a.lastActivityAt.toISOString()]);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  async contactsCsv(scope: ScopeFilter, query: unknown): Promise<Row[]> {
    const out: Row[] = [['First name', 'Last name', 'Title', 'Email', 'Phone', 'Account', 'Lifecycle', 'Owner', 'Tags', 'Last activity']];
    let cursor: string | undefined;
    while (out.length <= EXPORT_LIMIT) {
      const page = await this.contacts.list(scope, ContactListQuerySchema.parse({ ...(query as object), cursor, limit: 200 }));
      for (const c of page.items) out.push([c.firstName, c.lastName, c.title, c.emails[0]?.emailLower ?? '', c.phones[0]?.phoneE164 ?? '', c.account?.name ?? '', c.lifecycle, fullName(c.owner), c.tags.map((t) => t.name).join('; '), c.lastActivityAt.toISOString()]);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  async dealsCsv(scope: ScopeFilter, query: unknown): Promise<Row[]> {
    const out: Row[] = [['Name', 'Account', 'Pipeline', 'Stage', 'Amount', 'Currency', 'Probability', 'Expected close', 'Owner', 'Status', 'Tags', 'Last activity']];
    let cursor: string | undefined;
    while (out.length <= EXPORT_LIMIT) {
      const page = await this.deals.list(scope, DealListQuerySchema.parse({ ...(query as object), cursor, limit: 200 }));
      for (const d of page.items) out.push([d.name, d.account?.name ?? '', d.pipeline.name, d.stage.name, d.amount === null ? null : Number(d.amount), d.currency, d.probability, d.expectedCloseAt?.toISOString() ?? '', fullName(d.owner), d.wonAt ? 'won' : d.lostAt ? 'lost' : 'open', d.tags.map((t) => t.name).join('; '), d.lastActivityAt.toISOString()]);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }
}

function fullName(o: { firstName: string; lastName: string } | null | undefined): string {
  return o ? `${o.firstName} ${o.lastName}`.trim() : '';
}
