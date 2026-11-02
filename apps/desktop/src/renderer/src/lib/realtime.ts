import { useEffect, useRef, useState } from 'react';
import { bridge } from './bridge';

export interface RealtimeEvent {
  event: string;
  payload: unknown;
}

/**
 * Socket events forwarded by the main process (the renderer never holds a socket or a token).
 * `handler` is kept in a ref so callers can pass an inline closure without resubscribing.
 */
export function useRealtime(handler: (e: RealtimeEvent) => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const off = bridge.realtime.onEvent((e) => ref.current(e as RealtimeEvent));
    return () => {
      off();
    };
  }, [enabled]);
}

/** True while the main-process socket is connected; screens fall back to polling when false. */
export function useRealtimeConnected(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    void bridge.realtime
      .status()
      .then((s) => alive && setConnected(Boolean((s as { connected?: boolean })?.connected)))
      .catch(() => undefined);
    const off = bridge.realtime.onStatus((s) => setConnected(Boolean((s as { connected?: boolean })?.connected)));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return connected;
}
