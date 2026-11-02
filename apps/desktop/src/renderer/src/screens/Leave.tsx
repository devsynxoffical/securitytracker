import { useState } from 'react';
import { Plane, Plus } from 'lucide-react';
import { http, errorMessage } from '../lib/bridge';
import { useQuery } from '../lib/useQuery';
import { date } from '../lib/format';
import type { LeaveBalance, LeaveRequest, LeaveType, Page } from '../lib/types';
import { Badge, Button, Card, Empty, ErrorBanner, SkeletonRows, Select, Input, Textarea, Field, Modal, statusTone } from '../components/ui';

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

  const refresh = () => {
    void balances.refetch();
    void requests.refetch();
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] text-ink-2">Balances for {new Date().getFullYear()}</div>
        <Button variant="primary" disabled={!online} onClick={() => setOpen(true)}>
          <Plus size={14} /> Request leave
        </Button>
      </div>
      {error && <ErrorBanner message={error} />}
      {balances.loading ? (
        <div className="grid grid-cols-4 gap-3"><SkeletonRows rows={1} /></div>
      ) : balances.error ? (
        <ErrorBanner message={errorMessage(balances.error)} onRetry={balances.refetch} />
      ) : bal.length === 0 ? (
        <Card><Empty icon={<Plane size={26} />} title="No leave balances" body="Balances appear once HR has configured leave types for you." /></Card>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {bal.map((b) => {
            const t = b.leaveType ?? typeList.find((x) => x.id === b.leaveTypeId);
            const available = b.availableDays ?? Number(b.entitledDays) + Number(b.carriedOverDays) + Number(b.adjustmentsDays) - Number(b.usedDays) - Number(b.pendingDays);
            return (
              <div key={b.leaveTypeId} className="rounded-card border border-line bg-surface p-4 shadow-card" style={{ borderTopColor: t?.colour, borderTopWidth: 3 }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">{t?.name ?? 'Leave'}</div>
                <div className="mt-1 font-mono text-[24px] font-semibold text-ink">{Number(available)}</div>
                <div className="font-mono text-[11.5px] text-ink-3">
                  of {Number(b.entitledDays) + Number(b.carriedOverDays) + Number(b.adjustmentsDays)} · used {Number(b.usedDays)} · pending {Number(b.pendingDays)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Card title="My requests">
        {requests.loading ? (
          <SkeletonRows />
        ) : requests.error ? (
          <ErrorBanner message={errorMessage(requests.error)} onRetry={requests.refetch} />
        ) : req.length === 0 ? (
          <Empty title="No requests yet" />
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Dates</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {req.map((r) => (
                <tr key={r.id} className="border-b border-line-2">
                  <td className="px-3 py-2">{r.leaveType?.name ?? typeList.find((t) => t.id === r.leaveTypeId)?.name ?? r.type}</td>
                  <td className="px-3 py-2 font-mono">{date(r.dateFrom)} – {date(r.dateTo)}{r.halfDay ? ' (½)' : ''}</td>
                  <td className="px-3 py-2 text-right font-mono">{Number(r.days)}</td>
                  <td className="px-3 py-2"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="px-3 py-2 text-ink-2">{r.reason}{r.comment ? <span className="text-ink-3"> — {r.comment}</span> : null}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === 'pending' && (
                      <Button size="sm" variant="danger-outline" disabled={!online} onClick={() => void http.post(`/leave-requests/${r.id}/cancel`).then(refresh).catch((e) => setError(errorMessage(e)))}>Cancel</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <Modal open onClose={onClose} title="Request leave" width={460} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !typeId || !from || !reason} onClick={submit}>Submit</Button></>}>
      {error && <ErrorBanner message={error} />}
      <div className="space-y-2">
        <Field label="Type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.paid ? '' : ' (unpaid)'}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} min={from} disabled={half} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {type?.allowHalfDay && (
          <label className="flex items-center gap-2 text-[12.5px] text-ink"><input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} className="accent-[#0F6B5C]" /> Half day</label>
        )}
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
