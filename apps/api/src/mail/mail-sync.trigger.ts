import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { MailSyncService } from './mail-sync.service.js';

export const DEMO_TOKEN_STATUS = 'demo';
/** Injection token so this file never imports the sync service at runtime (avoids an import cycle). */
export const MAIL_SYNC_TOKEN = 'MAIL_SYNC_SERVICE';

/**
 * Lets MailService trigger a sync without importing JobsModule or MailSyncService (both of which
 * depend on this module). JobsModule registers the queue-backed handler on start; otherwise the
 * sync runs inline when Google is configured.
 */
@Injectable()
export class MailSyncTrigger {
  private handler: ((mailboxId: string) => Promise<boolean>) | null = null;

  constructor(private readonly moduleRef: ModuleRef) {}

  setHandler(fn: (mailboxId: string) => Promise<boolean>) {
    this.handler = fn;
  }

  /** Returns true when queued, false when run inline (or skipped because Google is not configured). */
  async trigger(mailboxId: string): Promise<boolean> {
    if (this.handler && (await this.handler(mailboxId))) return true;
    const sync = this.moduleRef.get<MailSyncService>(MAIL_SYNC_TOKEN, { strict: false });
    if (!sync?.configured()) return false;
    sync.syncMailbox(mailboxId).catch(() => undefined);
    return false;
  }
}
