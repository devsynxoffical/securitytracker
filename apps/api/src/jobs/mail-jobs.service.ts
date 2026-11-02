import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../common/prisma.service';
import { ClockService } from '../common/clock.service';
import { ConversationsService } from '../mail/conversations.service';
import { MailSyncService } from '../mail/mail-sync.service';
import { MailSyncTrigger } from '../mail/mail-sync.trigger';
import { JobRegistry, JobResult } from './job-registry';

export const GMAIL_SYNC_QUEUE = 'gmail-sync';

/**
 * mail-unsnooze (17 F28), gmail-watch-renew (10 section 4.2) and the event-driven gmail-sync queue.
 * The queue is the only BullMQ user (02 D3): the push webhook and the fallback cron enqueue
 * `{mailboxId}` jobs, deduplicated by jobId; the worker runs only when WORKER_ENABLED=true.
 */
@Injectable()
export class MailJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs:mail');
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private prisma: PrismaService,
    private clock: ClockService,
    private config: ConfigService,
    private conversations: ConversationsService,
    private registry: JobRegistry,
    private mailSync: MailSyncService,
    private syncTrigger: MailSyncTrigger,
  ) {}

  onModuleInit() {
    this.registry.register('mail-unsnooze', '* * * * *', 'Reopens snoozed conversations whose time has come', () => this.unsnooze());
    this.registry.register('gmail-watch-renew', '0 3 * * *', 'Renews Gmail watch for connected mailboxes expiring within 24 h', () => this.watchRenew());
    // The API's push webhook and OAuth callback hand syncs to the queue when one is available.
    this.syncTrigger.setHandler((mailboxId) => this.enqueueSync(mailboxId));
    this.registry.register('gmail-sync', '*/2 * * * *', 'Fallback: enqueues an incremental sync for every healthy mailbox', () => this.enqueueAll());
    if (this.config.get<string>('WORKER_ENABLED') === 'true') this.startWorker();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  @Cron('* * * * *', { timeZone: 'UTC' })
  scheduledUnsnooze() {
    return this.registry.scheduled('mail-unsnooze');
  }

  @Cron('0 3 * * *', { timeZone: 'UTC' })
  scheduledWatchRenew() {
    return this.registry.scheduled('gmail-watch-renew');
  }

  @Cron('*/2 * * * *', { timeZone: 'UTC' })
  scheduledSync() {
    return this.registry.scheduled('gmail-sync');
  }

  async unsnooze(): Promise<JobResult> {
    const r = await this.conversations.unsnoozeDue();
    return { reopened: r.reopened };
  }

  /** 10 section 4.2: renews users.watch for healthy mailboxes whose watch expires within 24 h. */
  async watchRenew(): Promise<JobResult> {
    if (!this.mailSync.configured()) return { renewed: 0, skipped: true, reason: 'google_not_configured' };
    const r = await this.mailSync.renewExpiringWatches();
    return { ...r };
  }

  /** Called by the push webhook path or the fallback cron. Deduplicates by mailbox id. */
  async enqueueSync(mailboxId: string): Promise<boolean> {
    const queue = this.getQueue();
    if (!queue) return false;
    await queue.add('sync', { mailboxId }, { jobId: `sync:${mailboxId}`, removeOnComplete: 100, removeOnFail: 100, attempts: 3, backoff: { type: 'exponential', delay: 5_000 } });
    return true;
  }

  async enqueueAll(): Promise<JobResult> {
    const mailboxes = await this.prisma.mailbox.findMany({ where: { tokenStatus: 'ok' }, select: { id: true } });
    let enqueued = 0;
    for (const m of mailboxes) if (await this.enqueueSync(m.id)) enqueued += 1;
    return { mailboxes: mailboxes.length, enqueued, queueAvailable: this.getQueue() !== null };
  }

  private connection() {
    const url = new URL(this.config.get<string>('REDIS_URL') || 'redis://localhost:6379');
    return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, lazyConnect: true, maxRetriesPerRequest: null as null, enableOfflineQueue: false };
  }

  private getQueue(): Queue | null {
    if (this.config.get<string>('REDIS_URL') === undefined && this.config.get<string>('WORKER_ENABLED') !== 'true' && this.config.get<string>('JOBS_ENABLED') !== 'true') {
      return null; // no Redis configured in a plain dev API: the queue is optional
    }
    if (!this.queue) {
      this.queue = new Queue(GMAIL_SYNC_QUEUE, { connection: this.connection() });
      this.queue.on('error', (e) => this.logger.warn(`queue unavailable: ${e.message}`));
    }
    return this.queue;
  }

  /** Worker: incremental history sync per mailbox (initial sync when no historyId yet). */
  private startWorker() {
    this.worker = new Worker(
      GMAIL_SYNC_QUEUE,
      async (job) => {
        const mailboxId = String(job.data.mailboxId);
        if (!this.mailSync.configured()) return { mailboxId, skipped: true, reason: 'google_not_configured' };
        const r = await this.mailSync.syncMailbox(mailboxId);
        return { mailboxId, mode: r.mode, fetched: r.fetched, inbound: r.inbound, outbound: r.outbound };
      },
      { connection: this.connection(), concurrency: 2 },
    );
    this.worker.on('error', (e) => this.logger.warn(`worker error: ${e.message}`));
    this.logger.log('gmail-sync worker started');
  }
}
