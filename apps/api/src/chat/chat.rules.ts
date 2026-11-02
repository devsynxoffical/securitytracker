import { CHAT_EDIT_WINDOW_MINUTES, CHAT_TYPING_INTERVAL_SECONDS, ChatChannelKindValue } from '@company-os/contracts';

/** Pure chat rules (22-internal-chat-spec.md). Kept free of Prisma so they are unit testable. */

/** `direct_key` of the sorted member pair (22 section 4). */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** `direct_key` used by the single company-wide channel so the unique index guards against duplicates. */
export const COMPANY_CHANNEL_KEY = 'company';

export const UNIT_KINDS: ChatChannelKindValue[] = ['company', 'department', 'team'];

/** Only active employees take part; invited, disabled, suspended or offboarded ones are removed (FR-CHAT-10). */
export function isChatActive(employee: { status: string; deletedAt?: Date | null }): boolean {
  return employee.status === 'active' && !employee.deletedAt;
}

export interface UnitChannelTarget {
  kind: 'company' | 'department' | 'team';
  departmentId: string | null;
  teamId: string | null;
}

/** Channels an employee belongs to automatically: company, own department, own team (FR-CHAT-01). */
export function derivedUnitChannels(employee: { status: string; deletedAt?: Date | null; departmentId: string | null; teamId: string | null }): UnitChannelTarget[] {
  if (!isChatActive(employee)) return [];
  const out: UnitChannelTarget[] = [{ kind: 'company', departmentId: null, teamId: null }];
  if (employee.departmentId) out.push({ kind: 'department', departmentId: employee.departmentId, teamId: null });
  if (employee.teamId) out.push({ kind: 'team', departmentId: null, teamId: employee.teamId });
  return out;
}

export interface UnitChannelRow extends UnitChannelTarget {
  id: string;
}

export function sameUnit(a: UnitChannelTarget, b: UnitChannelTarget): boolean {
  return a.kind === b.kind && (a.departmentId ?? null) === (b.departmentId ?? null) && (a.teamId ?? null) === (b.teamId ?? null);
}

/** Which unit channels to join and which to leave so memberships follow the org units. */
export function unitMembershipDiff(current: UnitChannelRow[], desired: UnitChannelRow[]): { join: string[]; leave: string[] } {
  const join = desired.filter((d) => !current.some((c) => sameUnit(c, d))).map((d) => d.id);
  const leave = current.filter((c) => !desired.some((d) => sameUnit(c, d))).map((c) => c.id);
  return { join, leave };
}

/** Own messages can be edited within the window (FR-CHAT-04). */
export function withinEditWindow(createdAt: Date, now: Date, windowMinutes = CHAT_EDIT_WINDOW_MINUTES): boolean {
  return now.getTime() - createdAt.getTime() <= windowMinutes * 60_000;
}

export interface MentionCandidate {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Resolves `@Firstname Lastname` in a body to employee ids (FR-CHAT-07). Longer names are tried first
 * so "@Ann Lee-Smith" does not resolve to "@Ann Lee". Case-insensitive; each id appears once.
 */
export function parseMentions(body: string, candidates: MentionCandidate[]): string[] {
  const lower = body.toLowerCase();
  const sorted = [...candidates]
    .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim().toLowerCase() }))
    .filter((c) => c.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const found: string[] = [];
  const taken: Array<[number, number]> = [];
  for (const c of sorted) {
    const needle = `@${c.name}`;
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      const end = idx + needle.length;
      const next = lower[end];
      const boundary = next === undefined || !/[\p{L}\p{N}_-]/u.test(next);
      const overlaps = taken.some(([s, e]) => idx < e && end > s);
      if (boundary && !overlaps) {
        taken.push([idx, end]);
        if (!found.includes(c.id)) found.push(c.id);
      }
      from = end;
    }
  }
  return found;
}

/** Unread = messages after the cursor, excluding own and deleted ones (22 section 1). Ids are uuid v7, so string order is time order. */
export function unreadCount(messages: Array<{ id: string; authorId: string; deletedAt: Date | null }>, lastReadMessageId: string | null, selfId: string): number {
  return messages.filter((m) => m.authorId !== selfId && !m.deletedAt && (lastReadMessageId === null || m.id > lastReadMessageId)).length;
}

/** A read cursor only moves forward. */
export function advancesCursor(current: string | null, next: string): boolean {
  return current === null || next > current;
}

/** Typing broadcasts are accepted once per interval per member and channel (22 section 5). */
export function typingAllowed(lastAt: Date | undefined, now: Date, intervalSeconds = CHAT_TYPING_INTERVAL_SECONDS): boolean {
  return !lastAt || now.getTime() - lastAt.getTime() >= intervalSeconds * 1000;
}

/** Display name of a channel for a viewer: direct channels show the counterpart. */
export function channelDisplayName(channel: { kind: string; name: string }, counterpart: { firstName: string; lastName: string } | null): string {
  if (channel.kind === 'direct' && counterpart) return `${counterpart.firstName} ${counterpart.lastName}`.trim();
  return channel.name;
}
