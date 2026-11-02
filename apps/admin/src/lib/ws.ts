'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl, getToken } from './api';

/**
 * One socket.io connection to the API namespace `/ws` (02 section 3), authenticated with the
 * session token like the desktop app. Chat (22 FR-CHAT-05) subscribes to its events here; when the
 * socket is down the queries fall back to polling.
 */
let socket: Socket | null = null;
const listeners = new Set<(up: boolean) => void>();

function notify(up: boolean) {
  for (const l of listeners) l(up);
}

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  if (socket) {
    if ((socket.auth as { token?: string }).token !== token) {
      socket.auth = { token };
      socket.disconnect().connect();
    }
    return socket;
  }
  const base = getApiBaseUrl();
  const origin = /^https?:\/\//.test(base) ? new URL(base).origin : window.location.origin;
  socket = io(`${origin}/ws`, { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
  socket.on('connect', () => notify(true));
  socket.on('disconnect', () => notify(false));
  socket.on('connect_error', () => notify(false));
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  notify(false);
}

/** True while the realtime socket is connected; callers poll when it is not. */
export function useSocketUp(): boolean {
  const [up, setUp] = useState<boolean>(() => Boolean(getSocket()?.connected));
  useEffect(() => {
    const s = getSocket();
    setUp(Boolean(s?.connected));
    listeners.add(setUp);
    return () => {
      listeners.delete(setUp);
    };
  }, []);
  return up;
}
