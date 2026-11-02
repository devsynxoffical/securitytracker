import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Minimal Gmail REST client over global fetch (10 section 4). One instance per mailbox call
 * chain; the factory below carries the OAuth client configuration. No dependency on googleapis.
 */

export class GmailApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
  get isAuth() {
    return this.status === 401 || (this.status === 403 && /invalid_grant|unauthorized/i.test(this.message));
  }
  get isRetryable() {
    return this.status === 429 || this.status >= 500;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: Date;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  hasAttachments: boolean;
}

export interface GmailHistoryPage {
  historyId: string;
  messageIds: string[];
  nextPageToken?: string;
}

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** 10 section 7: exponential backoff for 429 and 5xx, capped at one minute. */
export function retryDelayMs(attempt: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt)) + Math.floor(Math.random() * 250);
}

/** Parses "Name <addr@x.com>, other@y.com" into lowercased addresses. */
export function parseAddressList(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const m = part.match(/<([^>]+)>/);
      return (m ? m[1] : part).trim().toLowerCase();
    })
    .filter((a) => a.includes('@'));
}

/** Reduces a Gmail `messages.get?format=metadata` payload to what the sync stores. */
export function toMessageMeta(raw: {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }>; parts?: Array<{ filename?: string }>; filename?: string };
}): GmailMessageMeta {
  const headers = new Map((raw.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const parts = raw.payload?.parts ?? [];
  const hasAttachments = Boolean(raw.payload?.filename) || parts.some((p) => Boolean(p.filename)) || (raw.labelIds ?? []).includes('HAS_ATTACHMENT');
  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    snippet: raw.snippet ?? '',
    internalDate: raw.internalDate ? new Date(Number(raw.internalDate)) : new Date(headers.get('date') ?? Date.now()),
    from: parseAddressList(headers.get('from'))[0] ?? '',
    to: parseAddressList(headers.get('to')),
    cc: parseAddressList(headers.get('cc')),
    subject: headers.get('subject') ?? '(no subject)',
    hasAttachments,
  };
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

export interface GmailFullMessage {
  id: string;
  threadId: string;
  payload?: GmailPart;
}

export interface GmailBody {
  html: string | null;
  text: string | null;
  attachments: Array<{ partId: string; fileName: string; mime: string; size: number; attachmentId: string }>;
}

function decodeBody(data: string | undefined): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

/** Walks a `messages.get?format=full` payload: first text/html and text/plain bodies plus attachment parts. */
export function extractGmailBody(msg: GmailFullMessage): GmailBody {
  const out: GmailBody = { html: null, text: null, attachments: [] };
  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    const mime = (part.mimeType ?? '').toLowerCase();
    if (part.filename && part.body?.attachmentId) {
      out.attachments.push({ partId: part.partId ?? String(out.attachments.length), fileName: part.filename, mime: mime || 'application/octet-stream', size: part.body.size ?? 0, attachmentId: part.body.attachmentId });
    } else if (mime === 'text/html' && out.html === null && part.body?.data) {
      out.html = decodeBody(part.body.data);
    } else if (mime === 'text/plain' && out.text === null && part.body?.data) {
      out.text = decodeBody(part.body.data);
    }
    for (const p of part.parts ?? []) walk(p);
  };
  walk(msg.payload);
  return out;
}

/** Builds an RFC 2822 message and returns the base64url string Gmail expects. */
export function buildRawMessage(opts: { from: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; inReplyTo?: string; references?: string }): string {
  const boundary = `b_${Date.now().toString(36)}`;
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(', ')}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(', ')}`] : []),
    ...(opts.bcc?.length ? [`Bcc: ${opts.bcc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`] : []),
    ...(opts.references ? [`References: ${opts.references}`] : []),
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(opts.html, 'utf8').toString('base64'),
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  pubsubTopic?: string;
}

export class GmailClient {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly oauth: GoogleOAuthConfig,
    private readonly refreshToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  // ---- OAuth -------------------------------------------------------------

  static async exchangeCode(oauth: GoogleOAuthConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: oauth.clientId, client_secret: oauth.clientSecret, redirect_uri: oauth.redirectUri, grant_type: 'authorization_code' }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) throw new GmailApiError(res.status, body.error_description || body.error || 'Token exchange failed', body);
    return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - 30_000 };
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: this.refreshToken, client_id: this.oauth.clientId, client_secret: this.oauth.clientSecret, grant_type: 'refresh_token' }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      // invalid_grant = refresh token revoked at Google (10 section 7)
      const status = body.error === 'invalid_grant' ? 401 : res.status || 500;
      throw new GmailApiError(status, body.error_description || body.error || 'Token refresh failed', body);
    }
    this.accessToken = body.access_token;
    this.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000 - 30_000;
    return this.accessToken;
  }

  private async call<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.token();
    const res = await this.fetchImpl(`${GMAIL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
    });
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
    if (!res.ok) {
      const err = new GmailApiError(res.status, body.error?.message || `Gmail API ${res.status}`, body);
      if (err.isRetryable && attempt < 3) {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
        return this.call<T>(path, init, attempt + 1);
      }
      throw err;
    }
    return body as T;
  }

  // ---- Users ---------------------------------------------------------------

  getProfile(): Promise<GmailProfile> {
    return this.call<GmailProfile>('/profile');
  }

  /** users.history.list restricted to message additions. 404 means the history id is too old. */
  async listHistory(startHistoryId: string, pageToken?: string): Promise<GmailHistoryPage> {
    const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const body = await this.call<{ historyId: string; nextPageToken?: string; history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }> }>(`/history?${params}`);
    const ids = new Set<string>();
    for (const h of body.history ?? []) for (const m of h.messagesAdded ?? []) ids.add(m.message.id);
    return { historyId: body.historyId, messageIds: [...ids], nextPageToken: body.nextPageToken };
  }

  async listMessages(q: string, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
    const params = new URLSearchParams({ q, maxResults: '100', includeSpamTrash: 'false' });
    if (pageToken) params.set('pageToken', pageToken);
    const body = await this.call<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(`/messages?${params}`);
    return { ids: (body.messages ?? []).map((m) => m.id), nextPageToken: body.nextPageToken };
  }

  async getMessage(id: string): Promise<GmailMessageMeta> {
    const params = new URLSearchParams({ format: 'metadata' });
    for (const h of ['From', 'To', 'Cc', 'Subject', 'Date']) params.append('metadataHeaders', h);
    const raw = await this.call<Parameters<typeof toMessageMeta>[0]>(`/messages/${encodeURIComponent(id)}?${params}`);
    return toMessageMeta(raw);
  }

  /** users.watch on INBOX and SENT; expiration is a ms epoch string. */
  /** Full MIME tree for the body endpoint (10 section 8b); not stored, fetched on open. */
  getMessageFull(id: string): Promise<GmailFullMessage> {
    return this.call<GmailFullMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const res = await this.call<{ data?: string; size?: number }>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    return Buffer.from(res.data ?? '', 'base64url');
  }

  async watch(): Promise<{ historyId: string; expiration: Date }> {
    if (!this.oauth.pubsubTopic) throw new GmailApiError(400, 'GMAIL_PUBSUB_TOPIC is not configured');
    const body = await this.call<{ historyId: string; expiration: string }>('/watch', {
      method: 'POST',
      body: JSON.stringify({ topicName: this.oauth.pubsubTopic, labelIds: ['INBOX', 'SENT'], labelFilterBehavior: 'INCLUDE' }),
    });
    return { historyId: body.historyId, expiration: new Date(Number(body.expiration)) };
  }

  send(raw: string, threadId?: string): Promise<{ id: string; threadId: string }> {
    return this.call<{ id: string; threadId: string }>('/messages/send', { method: 'POST', body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }) });
  }

  modifyThread(threadId: string, add: string[], remove: string[]): Promise<void> {
    return this.call<void>(`/threads/${encodeURIComponent(threadId)}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
  }
}

/** Reads the Google OAuth configuration once; `configured()` gates every real call. */
@Injectable()
export class GmailClientFactory {
  constructor(private readonly config: ConfigService) {}

  oauth(): GoogleOAuthConfig | null {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      redirectUri: this.config.get<string>('GOOGLE_REDIRECT_URI') || 'http://localhost:4000/api/v1/mail/oauth/callback',
      pubsubTopic: this.config.get<string>('GMAIL_PUBSUB_TOPIC') || undefined,
    };
  }

  configured(): boolean {
    return this.oauth() !== null;
  }

  forRefreshToken(refreshToken: string): GmailClient {
    const oauth = this.oauth();
    if (!oauth) throw new GmailApiError(503, 'Google OAuth client is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
    return new GmailClient(oauth, refreshToken);
  }
}
