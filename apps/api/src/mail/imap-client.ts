import { resolveEncryptionKey } from '../common/crypto.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { CryptoUtil } from '../common/crypto.util.js';

/**
 * IMAP/SMTP connector for non-Google providers (10 section 2 option D: Hostinger, GoDaddy,
 * Outlook, Zoho Mail). IMAP is read-only here: we fetch new messages by UID, never flag, move or
 * delete (rule 10). Sending goes through SMTP and the sent copy is appended to the Sent folder so
 * the provider's own clients see it too.
 */

export interface ImapSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}
export type SmtpSettings = ImapSettings;

export interface AttachmentMeta {
  partId: string;
  fileName: string;
  mime: string;
  size: number;
}

export interface ParsedMessage {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  date: Date;
  snippet: string;
  html: string | null;
  text: string | null;
  attachments: AttachmentMeta[];
}

export interface UidState {
  lastUidValidity: number | null;
  lastUid: number | null;
}

export class ImapConnectionError extends Error {
  constructor(message: string, public readonly authenticationFailed: boolean) {
    super(message);
    this.name = 'ImapConnectionError';
  }
}

// ---- pure helpers (unit tested) --------------------------------------------

export function addressesOf(value: AddressObject | AddressObject[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list
    .flatMap((a) => a.value ?? [])
    .map((v) => (v.address ?? '').trim().toLowerCase())
    .filter((a) => a.includes('@'));
}

/** `<abc@host>` -> `abc@host`; keeps ids comparable between In-Reply-To, References and Message-ID. */
export function normaliseMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^<|>$/g, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseReferences(raw: string | string[] | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : raw ? raw.split(/\s+/) : [];
  return parts.map((p) => normaliseMessageId(p)).filter((p): p is string => Boolean(p));
}

/** Fallback snippet from text or html (200 chars, whitespace collapsed). */
export function snippetOf(text: string | null | undefined, html: string | null | undefined): string {
  const source = text && text.trim().length > 0 ? text : (html ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return source.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Attachment metadata; partId is the index in the parsed attachment list, inline (cid) images excluded. */
export function attachmentMeta(attachments: ParsedMail['attachments'] | undefined): AttachmentMeta[] {
  return (attachments ?? [])
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !a.related)
    .map(({ a, i }) => ({
      partId: `att-${i}`,
      fileName: a.filename || `attachment-${i + 1}`,
      mime: a.contentType || 'application/octet-stream',
      size: a.size ?? a.content?.length ?? 0,
    }));
}

/** Reduces a mailparser result to the shape the sync and the body endpoint use. */
export function toParsedMessage(parsed: ParsedMail, fallback: { date: Date; messageId: string }): ParsedMessage {
  const text = parsed.text ?? null;
  const html = typeof parsed.html === 'string' ? parsed.html : null;
  return {
    messageId: normaliseMessageId(parsed.messageId) ?? fallback.messageId,
    inReplyTo: normaliseMessageId(parsed.inReplyTo),
    references: parseReferences(parsed.references),
    from: addressesOf(parsed.from)[0] ?? '',
    to: addressesOf(parsed.to),
    cc: addressesOf(parsed.cc),
    subject: parsed.subject?.trim() || '(no subject)',
    date: parsed.date ?? fallback.date,
    snippet: snippetOf(text, html),
    html,
    text,
    attachments: attachmentMeta(parsed.attachments),
  };
}

export async function parseRfc822(source: Buffer, fallback: { date: Date; messageId: string }): Promise<ParsedMessage> {
  const parsed = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
  return toParsedMessage(parsed, fallback);
}

/** Attachment bytes by partId (`att-<index>` as issued by attachmentMeta). */
export async function extractAttachment(source: Buffer, partId: string): Promise<{ fileName: string; mime: string; content: Buffer } | null> {
  const index = Number(partId.replace(/^att-/, ''));
  if (!Number.isInteger(index) || index < 0) return null;
  const parsed = await simpleParser(source);
  const att = parsed.attachments[index];
  if (!att) return null;
  return { fileName: att.filename || `attachment-${index + 1}`, mime: att.contentType || 'application/octet-stream', content: att.content };
}

/** Thread key candidates in priority order: In-Reply-To first, then References newest first. */
export function threadCandidates(msg: Pick<ParsedMessage, 'inReplyTo' | 'references'>): string[] {
  const out: string[] = [];
  if (msg.inReplyTo) out.push(msg.inReplyTo);
  for (const r of [...msg.references].reverse()) if (!out.includes(r)) out.push(r);
  return out;
}

/** UIDs above the stored cursor, ascending. A changed UIDVALIDITY invalidates the cursor. */
export function selectNewUids(uids: number[], state: UidState, currentUidValidity: number): number[] {
  const cursor = state.lastUidValidity === currentUidValidity ? (state.lastUid ?? 0) : 0;
  return uids.filter((u) => u > cursor).sort((a, b) => a - b);
}

export function maxUid(uids: number[], previous: number | null): number | null {
  return uids.reduce<number | null>((acc, u) => (acc === null || u > acc ? u : acc), previous);
}

/** Message-ID for outbound mail: `<uuid@domain>` so In-Reply-To chains stay resolvable. */
export function makeMessageId(fromAddress: string, random = () => Math.random().toString(36).slice(2, 12)): string {
  const domain = fromAddress.split('@')[1] || 'companyos.local';
  return `<${Date.now().toString(36)}.${random()}@${domain}>`;
}

export function angleBracketed(id: string): string {
  return id.startsWith('<') ? id : `<${id}>`;
}

// ---- IMAP --------------------------------------------------------------------

const FETCH_LIMIT = 300;
const INITIAL_DAYS = 30;

export class ImapClient {
  constructor(private readonly settings: ImapSettings) {}

  private connection(): ImapFlow {
    return new ImapFlow({
      host: this.settings.host,
      port: this.settings.port,
      secure: this.settings.secure,
      auth: { user: this.settings.username, pass: this.settings.password },
      logger: false,
      emitLogs: false,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
  }

  private async withConnection<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = this.connection();
    try {
      await client.connect();
    } catch (e) {
      throw wrapImapError(e);
    }
    try {
      return await fn(client);
    } catch (e) {
      throw wrapImapError(e);
    } finally {
      await client.logout().catch(() => client.close());
    }
  }

  /** Login + SELECT INBOX. Throws ImapConnectionError with a readable message. */
  async testConnection(): Promise<{ uidValidity: number; messages: number }> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mb = client.mailbox;
        return { uidValidity: mb ? Number(mb.uidValidity) : 0, messages: mb ? mb.exists : 0 };
      } finally {
        lock.release();
      }
    });
  }

  /** New messages since the UID cursor (or the last 30 days when there is no usable cursor). */
  async fetchNew(state: UidState, now: Date): Promise<{ uidValidity: number; uids: number[]; messages: Array<{ uid: number; source: Buffer }> }> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uidValidity = Number(client.mailbox ? client.mailbox.uidValidity : 0);
        const resumable = state.lastUidValidity === uidValidity && state.lastUid !== null;
        const found = resumable
          ? await client.search({ uid: `${(state.lastUid ?? 0) + 1}:*` }, { uid: true })
          : await client.search({ since: new Date(now.getTime() - INITIAL_DAYS * 86_400_000) }, { uid: true });
        const uids = selectNewUids(Array.isArray(found) ? found : [], state, uidValidity).slice(-FETCH_LIMIT);
        const messages: Array<{ uid: number; source: Buffer }> = [];
        if (uids.length > 0) {
          for await (const m of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
            if (m.source) messages.push({ uid: m.uid, source: Buffer.from(m.source) });
          }
        }
        return { uidValidity, uids, messages };
      } finally {
        lock.release();
      }
    });
  }

  async fetchSource(uid: number): Promise<Buffer | null> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const m = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        return m && m.source ? Buffer.from(m.source) : null;
      } finally {
        lock.release();
      }
    });
  }

  /** Looks a message up by its RFC Message-ID header (used when the UID was never stored). */
  async findUidByMessageId(messageId: string): Promise<number | null> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const found = await client.search({ header: { 'message-id': angleBracketed(messageId) } }, { uid: true });
        const uids = Array.isArray(found) ? found : [];
        return uids.length > 0 ? uids[uids.length - 1]! : null;
      } finally {
        lock.release();
      }
    });
  }

  /** Appends a sent copy to the \Sent folder (or "Sent"); returns false when no such folder exists. */
  async appendSent(raw: Buffer, sentAt: Date): Promise<boolean> {
    return this.withConnection(async (client) => {
      const folders = await client.list();
      const sent = folders.find((f) => f.specialUse === '\\Sent') ?? folders.find((f) => /^sent/i.test(f.name));
      if (!sent) return false;
      const res = await client.append(sent.path, raw, ['\\Seen'], sentAt);
      return res !== false;
    });
  }
}

function wrapImapError(e: unknown): ImapConnectionError {
  if (e instanceof ImapConnectionError) return e;
  const err = e as Error & { authenticationFailed?: boolean; responseText?: string; code?: string };
  const auth = Boolean(err.authenticationFailed) || /AUTHENTICATIONFAILED|invalid credentials|LOGIN failed/i.test(err.responseText ?? err.message ?? '');
  const text = auth
    ? 'IMAP login failed: check the username, the password (app password for Outlook and Zoho) and that IMAP access is enabled for this mailbox.'
    : `IMAP connection failed${err.code ? ` (${err.code})` : ''}: ${err.responseText || err.message || 'unknown error'}`;
  return new ImapConnectionError(text, auth);
}

// ---- SMTP --------------------------------------------------------------------

export interface ComposeOptions {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string[];
  messageId: string;
}

/** Builds the RFC 2822 message once so SMTP and the Sent folder receive the exact same bytes. */
export async function composeRaw(opts: ComposeOptions): Promise<Buffer> {
  const composer = new MailComposer({
    from: opts.fromName ? { name: opts.fromName, address: opts.from } : opts.from,
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    html: opts.html,
    text: opts.html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    messageId: opts.messageId,
    inReplyTo: opts.inReplyTo ? angleBracketed(opts.inReplyTo) : undefined,
    references: opts.references?.length ? opts.references.map(angleBracketed).join(' ') : undefined,
  });
  return composer.compile().build();
}

function transportFor(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    requireTLS: !s.secure,
    auth: { user: s.username, pass: s.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

export async function verifySmtp(s: SmtpSettings): Promise<void> {
  const t = transportFor(s);
  try {
    await t.verify();
  } catch (e) {
    const err = e as Error & { responseCode?: number; code?: string };
    const auth = err.responseCode === 535 || err.code === 'EAUTH';
    throw new ImapConnectionError(
      auth ? 'SMTP login failed: the server rejected the username or password.' : `SMTP connection failed${err.code ? ` (${err.code})` : ''}: ${err.message}`,
      auth,
    );
  } finally {
    t.close();
  }
}

export async function sendSmtp(s: SmtpSettings, raw: Buffer, envelope: { from: string; to: string[] }): Promise<void> {
  const t = transportFor(s);
  try {
    await t.sendMail({ raw, envelope });
  } finally {
    t.close();
  }
}

// ---- factory -----------------------------------------------------------------

export interface ImapMailboxRow {
  address: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  username: string | null;
  passwordEnc: string | null;
}

/** Decrypts the stored credentials and hands out clients; nothing here logs secrets. */
@Injectable()
export class ImapClientFactory {
  constructor(private readonly config: ConfigService) {}

  private key(): string {
    return resolveEncryptionKey(this.config.get<string>('ENCRYPTION_SECRET') || this.config.get<string>('ENCRYPTION_KEY'));
  }

  encryptPassword(password: string): string {
    return CryptoUtil.encryptField(password, this.key());
  }

  settingsFor(row: ImapMailboxRow): { imap: ImapSettings; smtp: SmtpSettings } {
    if (!row.imapHost || !row.smtpHost || !row.username || !row.passwordEnc) {
      throw new ImapConnectionError(`Mailbox ${row.address} has no IMAP/SMTP credentials stored. Reconnect it under Mail > Mailboxes.`, true);
    }
    const password = CryptoUtil.decryptField(row.passwordEnc, this.key());
    return {
      imap: { host: row.imapHost, port: row.imapPort ?? 993, secure: row.imapSecure, username: row.username, password },
      smtp: { host: row.smtpHost, port: row.smtpPort ?? 465, secure: row.smtpSecure, username: row.username, password },
    };
  }

  imap(settings: ImapSettings): ImapClient {
    return new ImapClient(settings);
  }

  forMailbox(row: ImapMailboxRow): ImapClient {
    return this.imap(this.settingsFor(row).imap);
  }

  verifySmtp = verifySmtp;
  sendSmtp = sendSmtp;
}
