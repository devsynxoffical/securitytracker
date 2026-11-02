'use client';

import { useEffect } from 'react';
import { Eye } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePresence, presenceHeartbeat } from '@/lib/queries/mail';
import { Avatar } from '@/components/ui';
import { fullName } from '@/lib/format';

const HEARTBEAT_MS = 20_000;

/**
 * Collision warning (FR-MAIL-19): heartbeat every 20 s while the conversation is open,
 * `left` on close, and an amber banner listing the other employees viewing it.
 */
export function PresenceBanner({ mailboxId, threadId }: { mailboxId: string; threadId: string }) {
  const { me } = useAuth();
  const presence = usePresence(mailboxId, threadId, HEARTBEAT_MS);

  useEffect(() => {
    let alive = true;
    const beat = () => { if (alive && document.visibilityState !== 'hidden') void presenceHeartbeat(mailboxId, threadId, 'viewing').catch(() => undefined); };
    beat();
    const t = window.setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    const leave = () => { void presenceHeartbeat(mailboxId, threadId, 'left').catch(() => undefined); };
    window.addEventListener('pagehide', leave);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [mailboxId, threadId]);

  const others = (presence.data?.viewers ?? []).filter((v) => v.employeeId !== me?.id);
  if (!others.length) return null;
  const names = others.map((v) => fullName(v));
  const label = names.length === 1 ? `${names[0]} is also viewing this conversation` : names.length === 2 ? `${names[0]} and ${names[1]} are also viewing this conversation` : `${names[0]} and ${names.length - 1} others are also viewing this conversation`;
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg bg-amber-soft px-3 py-2 text-[13px] text-amber-text">
      <Eye size={15} />
      <span className="flex -space-x-1.5">
        {others.slice(0, 4).map((v) => <Avatar key={v.employeeId} name={fullName(v)} size={20} className="ring-2 ring-amber-soft" />)}
      </span>
      <span className="font-medium">{label}.</span>
      <span className="text-amber-text/80">Coordinate before replying to avoid a double answer.</span>
    </div>
  );
}
