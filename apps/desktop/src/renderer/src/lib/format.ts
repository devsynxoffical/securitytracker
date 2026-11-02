export function hms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function hm(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function time(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${date(iso)} ${time(iso)}`;
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (Math.abs(m) < 1) return 'just now';
  if (Math.abs(m) < 60) return m > 0 ? `${m} min ago` : `in ${-m} min`;
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return h > 0 ? `${h} h ago` : `in ${-h} h`;
  return date(iso);
}

export function money(amount: number | string | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat([], { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount));
}

export function fullName(p: { firstName?: string; lastName?: string } | null | undefined): string {
  return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isToday(iso: string | null | undefined): boolean {
  return Boolean(iso) && new Date(iso!).toDateString() === new Date().toDateString();
}
