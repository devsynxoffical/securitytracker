import type { DesktopBridge } from '../../../preload/index';

declare global {
  interface Window {
    companyos: DesktopBridge;
  }
}

/** Typed access to the preload API. The renderer has no other way to reach Node or the network. */
export const bridge: DesktopBridge = window.companyos;

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = (await bridge.api.request(method, path, body, headers)) as ApiResult<T>;
  if (!res.ok) throw Object.assign(new Error(res.error?.message ?? 'Request failed'), { api: res.error, status: res.status });
  return res.data as T;
}

export const http = {
  get: <T>(path: string) => api<T>('GET', path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => api<T>('POST', path, body, headers),
  patch: <T>(path: string, body?: unknown) => api<T>('PATCH', path, body),
  del: <T>(path: string) => api<T>('DELETE', path),
};

export function isOfflineError(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && (e as { status?: number }).status === 0);
}

export function errorStatus(e: unknown): number | undefined {
  return e && typeof e === 'object' ? (e as { status?: number }).status : undefined;
}

export function errorCode(e: unknown): string | undefined {
  return e && typeof e === 'object' ? (e as { api?: { code?: string } }).api?.code : undefined;
}

export function errorMessage(e: unknown): string {
  if (isOfflineError(e)) return 'You are offline. This will work again when the connection returns.';
  return (e as Error)?.message || 'Something went wrong';
}
