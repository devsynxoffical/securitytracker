import { useState } from 'react';
import { Plane, Plus, CalendarDays } from 'lucide-react';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { date } from '../lib/format';
import type { LeaveBalance, LeaveRequest, LeaveType, Page } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, Skeleton, SkeletonRows, Select, Input, Textarea, Field, Modal, statusTone, PageHeader, Table, Th, Td, Checkbox, Progress } from '../components/ui';

function items<T>(x: T[] | Page<T> | { balances?: T[] } | undefined): T[] {
  if (Array.isArray(x)) return x;
  if (x && 'items' in x && Array.isArray(x.items)) return x.items;
  if (x && 'balances' in x && Array.isArray(x.balances)) return x.balances;
  return [];
}

/** F25: balances, request form, my requests (cancel while pending). */
export function LeaveScreen({ online, meId }: { online: boolean; meId: string }) {
  const types = useQuery(() => http.get<LeaveType[]>('/hr/leave-types'), []);
  const balances = useQuery(() => http.get<LeaveBalance[] | { balances: LeaveBalance[] }>(`/hr/leave-balances?employeeId=${meId}`), [meId]);
  const requests = useQuery(() => http.get<Page<LeaveRequest> | LeaveRequest[]>(`/leave-requests?employeeId=${meId}&limit=50`), [meId]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeList = items(types.data);
  const bal = items(balances.data);
  const req = items(requests.data);
  const year = new Date().getFullYear();

  const refresh = () => {
    void balances.refetch();
    void requests.refetch();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leave"
        subtitle={`Your balances for ${year} and the requests you have made.`}
        actions={
          <Button variant="primary" disabled={!online} icon={<Plus size={14} />} onClick={() => setOpen(true)} title={online ? undefined : 'Requests need a connection'}>
            Request leave
          </Button>
        }
      />
      {error && <ErrorBanner message={error} />}
      {balances.loading ? (
        <div className="grid grid-cols-4 gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[112px]" />
          ))}
        </div>
      ) : balances.error ? (
        <ErrorBanner message={errorMessage(balances.error)} onRetry={balances.refetch} />
      ) : bal.length === 0 ? (
        <Card>
          <Empty compact icon={<Plane size={18} />} title="No leave balances yet" body="Balances appear once HR has configured leave types and entitlements for you." />
        </Card>
      ) : (
        <div className="grid grid-cols-4 gap-3.5">
          {bal.map((b) => {
            const t = b.leaveType ?? typeList.find((x) => x.id === b.leaveTypeId);
            const entitled = Number(b.entitledDays) + Number(b.carriedOverDays) + Number(b.adjustmentsDays);
            const available = Number(b.availableDays ?? entitled - Number(b.usedDays) - Number(b.pendingDays));
            const usedPct = entitled ? ((Number(b.usedDays) + Number(b.pendingDays)) / entitled) * 100 : 0;
            return (
              <div key={b.leaveTypeId} className="rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t?.colour ?? 'var(--pri)' }} />
                  <span className="truncate text-xs font-semibold text-ink-3">{t?.name ?? 'Leave'}</span>
                  {t && !t.paid && <Badge tone="gray">unpaid</Badge>}
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-semibold text-ink">{available}</span>
                  <span className="text-xs text-ink-3">of {entitled} days</span>
                </div>
                <div className="mt-2.5">
                  <Progress value={usedPct} tone={usedPct >= 90 ? 'amber' : 'primary'} size={4} />
                </div>
                <div className="mt-1.5 font-mono text-2xs tracking-normal text-ink-3">
                  used {Number(b.usedDays)} · pending {Number(b.pendingDays)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Card title="My requests" subtitle={req.length ? `${req.length} request${req.length === 1 ? '' : 's'}` : undefined} padded={false}>
        {requests.loading ? (
          <div className="p-4"><SkeletonRows /></div>
        ) : requests.error ? (
          <div className="p-4"><ErrorBanner message={errorMessage(requests.error)} onRetry={requests.refetch} /></div>
        ) : req.length === 0 ? (
          <Empty icon={<CalendarDays size={22} />} title="No requests yet" body="Request a day off and it will show here with its approval status." action={online ? <Button size="sm" icon={<Plus size={13} />} onClick={() => setOpen(true)}>Request leave</Button> : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th right>Days</Th>
                <Th>Status</Th>
                <Th>Reason</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {req.map((r) => {
                const t = r.leaveType ?? typeList.find((x) => x.id === r.leaveTypeId);
                return (
                  <tr key={r.id} className="group transition hover:bg-surface-2">
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: t?.colour ?? 'var(--gray-bar)' }} />
                        {t?.name ?? r.type}
                      </span>
                    </Td>
                    <Td mono>
                      {date(r.dateFrom)} – {date(r.dateTo)}
                      {r.halfDay ? ' (½)' : ''}
                    </Td>
                    <Td right mono>{Number(r.days)}</Td>
                    <Td>
                      <Badge tone={statusTone(r.status)} dot>{r.status}</Badge>
                    </Td>
                    <Td className="max-w-[320px] text-ink-2">
                      <span className="line-clamp-1">
                        {r.reason}
                        {r.comment ? <span className="text-ink-3"> — {r.comment}</span> : null}
                      </span>
                    </Td>
                    <Td right>
                      {r.status === 'pending' && (
                        <Button size="sm" variant="danger-outline" className="row-actions" disabled={!online} onClick={() => void http.post(`/leave-requests/${r.id}/cancel`).then(refresh).catch((e) => setError(errorMessage(e)))}>
                          Cancel
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {open && <RequestModal types={typeList.filter((t) => t.isActive)} onClose={() => setOpen(false)} onDone={() => { setOpen(false); refresh(); }} />}
    </div>
  );
}

function RequestModal({ types, onClose, onDone }: { types: LeaveType[]; onClose: () => void; onDone: () => void }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const type = types.find((t) => t.id === typeId);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await http.post('/leave-requests', { leaveTypeId: typeId, dateFrom: from, dateTo: half ? from : to || from, halfDay: half, reason });
      onDone();
    } catch (e) {
      const code = (e as { api?: { code?: string } }).api?.code;
      setError(code === 'LEAVE_BALANCE_EXCEEDED' ? 'Not enough balance for this request.' : code === 'LEAVE_OVERLAP' ? 'You already have a request covering these dates.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Request leave" subtitle="Your manager is notified and decides on the request." width={460} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !typeId || !from || !reason} loading={busy} onClick={submit}>Submit request</Button></>}>
      {error && <ErrorBanner message={error} className="mb-3" />}
      <div className="space-y-3">
        <Field label="Type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.paid ? '' : ' (unpaid)'}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} disabled={half} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {type?.allowHalfDay && <Checkbox checked={half} onChange={(e) => setHalf(e.target.checked)} label="Half day" />}
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short note for your manager" /></Field>
      </div>
    </Modal>
  );
}
