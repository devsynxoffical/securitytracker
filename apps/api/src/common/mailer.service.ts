import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional mail for the platform itself (password resets, invitations). Configured through
 * SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and MAIL_FROM. Unrelated to the
 * team mailboxes in the mail module. Never logs recipients, subjects or bodies (rule 6).
 */
export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailerSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export function readMailerSettings(get: (key: string) => string | undefined): MailerSettings | null {
  const host = get('SMTP_HOST');
  const from = get('MAIL_FROM');
  if (!host || !from) return null;
  const port = Number(get('SMTP_PORT') || 587);
  const secureRaw = get('SMTP_SECURE');
  return {
    host,
    port,
    secure: secureRaw === undefined || secureRaw === '' ? port === 465 : secureRaw === 'true',
    user: get('SMTP_USER') || undefined,
    password: get('SMTP_PASSWORD') || undefined,
    from,
  };
}

export type TransportFactory = (settings: MailerSettings) => Pick<Transporter, 'sendMail'>;
/** Injection token for tests; production uses nodemailer directly. */
export const MAIL_TRANSPORT_FACTORY = 'MAIL_TRANSPORT_FACTORY';

const defaultFactory: TransportFactory = (s) =>
  nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    requireTLS: !s.secure,
    auth: s.user ? { user: s.user, pass: s.password ?? '' } : undefined,
    connectionTimeout: 15_000,
  });

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly settings: MailerSettings | null;
  private transport: Pick<Transporter, 'sendMail'> | null = null;

  private readonly factory: TransportFactory;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(MAIL_TRANSPORT_FACTORY) factory?: TransportFactory,
  ) {
    this.factory = factory ?? defaultFactory;
    this.settings = readMailerSettings((k) => this.config.get<string>(k));
  }

  configured(): boolean {
    return this.settings !== null;
  }

  from(): string | null {
    return this.settings?.from ?? null;
  }

  /** Resolves true when accepted by the SMTP server, false when the mailer is not configured. */
  async send(mail: OutgoingMail, kind = 'transactional'): Promise<boolean> {
    if (!this.settings) return false;
    this.transport ??= this.factory(this.settings);
    try {
      await this.transport.sendMail({ from: this.settings.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text ?? mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
      this.logger.log(`Sent ${kind} mail`);
      return true;
    } catch (e) {
      this.logger.warn(`Sending ${kind} mail failed: ${(e as Error).message}`);
      throw e;
    }
  }
}
