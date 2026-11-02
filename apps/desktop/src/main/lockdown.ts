/**
 * Pure decisions behind the data-containment lock-down (docs/08 section 9, FR-SEC-22 / FR-SEC-25).
 * No Electron import so `pnpm test:lockdown` can compile and run this module alone.
 */

/** Store keys that survive a revocation wipe: the device identity and the server address only. */
const KEEP_ON_REVOKE = ['api.url', 'device.id', 'device.name', 'device.publicKey', 'secret:device.privateKey'];

/**
 * FR-SEC-25: keys to delete from the main-process store when the session is revoked or the account
 * suspended. Everything the server handed us (tokens, profile, chat cache, shift queue, tracker
 * config, any cached list) goes; what identifies this PC to the server stays so the next approved
 * sign-in does not re-register the device.
 */
export function wipeOnRevoke(storeKeys: string[]): string[] {
  return storeKeys.filter((k) => !KEEP_ON_REVOKE.includes(k));
}

export function isKeptOnRevoke(key: string): boolean {
  return KEEP_ON_REVOKE.includes(key);
}

/**
 * FR-SEC-22: the renderer may only navigate to the app's own document (the packaged file URL or the
 * dev server). Every other target, including other `file://` paths, is denied. Only the path part is
 * compared: hash and query changes inside the app are allowed.
 */
export function shouldAllowNavigation(url: string, appUrl: string): boolean {
  let target: URL;
  let own: URL;
  try {
    target = new URL(url);
    own = new URL(appUrl);
  } catch {
    return false;
  }
  if (target.protocol !== own.protocol) return false;
  if (target.protocol === 'file:') return target.pathname === own.pathname;
  if (target.protocol === 'http:' || target.protocol === 'https:') return target.origin === own.origin;
  return false;
}

/** Keyboard shortcuts that open DevTools; ignored in packaged builds (FR-SEC-22). */
export function isDevToolsShortcut(input: { key: string; control?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; type?: string }): boolean {
  if (input.type && input.type !== 'keyDown') return false;
  const key = input.key.toLowerCase();
  if (key === 'f12') return true;
  const mod = Boolean(input.control || input.meta);
  if (mod && input.shift && (key === 'i' || key === 'j' || key === 'c')) return true;
  if (mod && !input.shift && key === 'u') return true; // view-source
  return false;
}

/** Headers the renderer may add to a proxied request. Everything else is dropped. */
const ALLOWED_REQUEST_HEADERS = ['idempotency-key'];
export function filterRequestHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (ALLOWED_REQUEST_HEADERS.includes(k.toLowerCase()) && typeof v === 'string' && v.length <= 128) out[k] = v;
  }
  return out;
}

export type RevokeReason = 'suspended' | 'revoked';

/** Maps the API error that ended the session to what the sign-in screen tells the user (FR-SEC-25). */
export function revokeReasonFromError(error: { code?: string; message?: string } | null | undefined): RevokeReason {
  if (!error) return 'revoked';
  if (error.code === 'ACCOUNT_SUSPENDED') return 'suspended';
  if (/suspended|not active/i.test(error.message ?? '')) return 'suspended';
  return 'revoked';
}

export function revokeReasonFromSocket(payload: unknown): RevokeReason {
  const reason = typeof payload === 'object' && payload ? String((payload as { reason?: unknown }).reason ?? '') : '';
  return /suspend/i.test(reason) ? 'suspended' : 'revoked';
}
