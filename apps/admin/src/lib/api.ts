'use client';

/** Typed fetch client. Token lives in memory + sessionStorage only. */

const TOKEN_KEY = 'companyos.admin.token';
const API_URL_KEY = 'companyos.admin.apiUrl';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export function getToken(): string | null {
  if (token) return token;
  if (typeof window !== 'undefined') {
    try {
      token = window.sessionStorage.getItem(TOKEN_KEY);
    } catch {
      token = null;
    }
  }
  return token;
}

export function setToken(value: string | null) {
  token = value;
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(TOKEN_KEY, value);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: memory only */
  }
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const override = window.sessionStorage.getItem(API_URL_KEY);
      if (override) return normalizeApiBaseUrl(override);
    } catch {
      /* ignore */
    }
  }
  // The build-time value is normalised too: `https://host/` given as a hosting variable must still reach /api/v1.
  return normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL || '') || '/api/v1';
}

export function setApiBaseUrl(url: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const normalized = url ? normalizeApiBaseUrl(url) : '';
    if (normalized) window.sessionStorage.setItem(API_URL_KEY, normalized);
    else window.sessionStorage.removeItem(API_URL_KEY);
  } catch {
    /* ignore */
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query): string {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function api<T>(path: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  headers['X-Client-Type'] = 'admin';
  const t = getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;

  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });

  if (res.status === 401) {
    setToken(null);
    onUnauthorized?.();
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: Record<string, unknown> }; message?: string } = {};
    if (type.includes('application/json')) body = await res.json().catch(() => ({}));
    const msg = body.error?.message || body.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, body.error?.code || 'ERROR', msg, body.error?.details);
  }
  if (init.raw) return (await res.text()) as unknown as T;
  if (type.includes('application/json')) return (await res.json()) as T;
  return undefined as T;
}

export const http = {
  get: <T>(path: string, params?: Query) => api<T>(`${path}${qs(params)}`),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
  text: (path: string, params?: Query) => api<string>(`${path}${qs(params)}`, { raw: true }),
};

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Accepts what people actually type in "API server": `api.company.com`, `https://x.up.railway.app/`
 * or a full `.../api/v1`, and returns the API base. A relative value (`/api/v1`) is kept as is.
 * Without this, `https://host/` produced requests to `//admin/auth/login`.
 */
export function normalizeApiBaseUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (!u) return '';
  if (u.startsWith('/')) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!/\/api\/v1$/i.test(u)) u = `${u}/api/v1`;
  return u;
}

