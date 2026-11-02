import { ForbiddenException } from '@nestjs/common';
import { ScopeFilter } from '../../auth/guards/rbac.guard';

/** Digits only. Good enough for duplicate matching until a libphonenumber integration (FR-CRM-09). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|gmbh|corp|co|limited|incorporated)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeDomain(domain?: string | null): string | null {
  if (!domain) return null;
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0] || null;
}

/** Prisma `where` fragment restricting a record to owners inside the caller's scope. */
export function ownerScopeWhere(scopeFilter: ScopeFilter): Record<string, unknown> {
  if (scopeFilter.scope === 'all') return {};
  return { ownerId: { in: scopeFilter.allowedEmployeeIds } };
}

/** Throws when the caller filters by an owner outside their scope (lists must not leak). */
export function assertOwnerInScope(scopeFilter: ScopeFilter, ownerId?: string): void {
  if (!ownerId || scopeFilter.scope === 'all') return;
  if (!scopeFilter.allowedEmployeeIds.includes(ownerId)) {
    throw new ForbiddenException('Owner is outside your scope');
  }
}

export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: { field: string; direction: 'asc' | 'desc' },
): Record<string, 'asc' | 'desc'> {
  if (!sort) return { [fallback.field]: fallback.direction };
  const [field, dir] = sort.split(':');
  if (!field || !allowed.includes(field)) return { [fallback.field]: fallback.direction };
  return { [field]: dir === 'asc' ? 'asc' : 'desc' };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Trims the extra row fetched with `take + 1` and returns the cursor. */
export function toCursorPage<T extends { id: string }>(rows: T[], take: number): CursorPage<T> {
  if (rows.length > take) {
    const next = rows.pop();
    return { items: rows, nextCursor: next ? next.id : null };
  }
  return { items: rows, nextCursor: null };
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}
