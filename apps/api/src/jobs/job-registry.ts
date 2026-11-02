import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClockService } from '../common/clock.service';

export type JobResult = Record<string, number | string | boolean>;
export type JobHandler = () => Promise<JobResult>;

export interface JobStatus {
  name: string;
  schedule: string;
  description: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastOutcome: 'ok' | 'error' | 'skipped' | null;
  lastResult: JobResult | null;
  lastError: string | null;
  runs: number;
  running: boolean;
}

/**
 * In-memory registry of background jobs (02-architecture.md section 6).
 * Every job registers once; `run` wraps execution so a failing job never stops another,
 * records counts only (no PII, AGENTS.md rule 6) and exposes status for GET /jobs/status.
 * Scheduled runs are gated by JOBS_ENABLED=true so dev API instances and tests stay quiet.
 */
@Injectable()
export class JobRegistry {
  private readonly logger = new Logger('Jobs');
  private readonly jobs = new Map<string, { handler: JobHandler; status: JobStatus }>();

  constructor(
    private config: ConfigService,
    private clock: ClockService,
  ) {}

  get schedulingEnabled(): boolean {
    return this.config.get<string>('JOBS_ENABLED') === 'true';
  }

  register(name: string, schedule: string, description: string, handler: JobHandler): void {
    this.jobs.set(name, {
      handler,
      status: {
        name,
        schedule,
        description,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastDurationMs: null,
        lastOutcome: null,
        lastResult: null,
        lastError: null,
        runs: 0,
        running: false,
      },
    });
  }

  /** Called from @Cron methods. Skips silently when scheduling is disabled. */
  async scheduled(name: string): Promise<void> {
    if (!this.schedulingEnabled) return;
    await this.run(name);
  }

  /** Runs one job now (scheduler or manual trigger). Never throws. */
  async run(name: string): Promise<JobStatus> {
    const job = this.jobs.get(name);
    if (!job) throw new NotFoundException(`Unknown job ${name}`);
    if (job.status.running) {
      job.status.lastOutcome = 'skipped';
      return job.status;
    }
    const started = this.clock.now();
    job.status.running = true;
    job.status.lastStartedAt = started.toISOString();
    try {
      const result = await job.handler();
      job.status.lastOutcome = 'ok';
      job.status.lastResult = result;
      job.status.lastError = null;
      this.logger.log(`${name} ok ${JSON.stringify(result)}`);
    } catch (e) {
      job.status.lastOutcome = 'error';
      job.status.lastError = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`${name} failed: ${job.status.lastError}`);
    } finally {
      const finished = this.clock.now();
      job.status.running = false;
      job.status.runs += 1;
      job.status.lastFinishedAt = finished.toISOString();
      job.status.lastDurationMs = finished.getTime() - started.getTime();
    }
    return job.status;
  }

  list(): JobStatus[] {
    return Array.from(this.jobs.values()).map((j) => j.status);
  }
}
