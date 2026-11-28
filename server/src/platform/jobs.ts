import PQueue from 'p-queue';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry } from './resilience.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 */

export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export type JobOutcome = { ok: true } | { ok: false; error: Error };

/** Minimal logger shape (satisfied by the Fastify/pino logger). */
export interface JobLogger {
  error(obj: object, msg?: string): void;
}

export interface EnqueuedJob {
  id: string;
  /**
   * Resolves when the job finishes. NEVER rejects: a failure is recorded in the
   * `jobs` row and logged, and surfaces here as `{ ok: false, error }` for a
   * caller that wants the outcome. Fire-and-forget callers need no `.catch`.
   */
  done: Promise<JobOutcome>;
}

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, JobHandler>();
  private timeoutMs: number;
  private retries: number;
  private log: JobLogger | undefined;

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  /** Late-bound because the container is built before/independently of the app logger. */
  setLogger(log: JobLogger): void {
    this.log = log;
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;

    const done: Promise<JobOutcome> = this.queue.add(async (): Promise<JobOutcome> => {
      await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
      // Real attempt count: one per handler invocation, whether the job then
      // succeeds, is retried, or fails for good.
      let attempts = 0;
      try {
        await withRetry(
          () => {
            attempts += 1;
            return withTimeout(handler(payload, { jobId }), this.timeoutMs);
          },
          { retries: this.retries },
        );
        await this.db
          .update(t.jobs)
          .set({ status: 'done', attempts, finishedAt: new Date() })
          .where(eq(t.jobs.id, jobId));
        return { ok: true };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.log?.error({ jobId, kind, err: error.message }, 'job failed');
        await this.db
          .update(t.jobs)
          .set({ status: 'failed', attempts, finishedAt: new Date(), error: error.message })
          .where(eq(t.jobs.id, jobId));
        return { ok: false, error };
      }
    }).catch((err: unknown): JobOutcome => {
      // Bookkeeping writes themselves failed (e.g. DB down); still never reject.
      const error = err instanceof Error ? err : new Error(String(err));
      this.log?.error({ jobId, kind, err: error.message }, 'job bookkeeping failed');
      return { ok: false, error };
    }) as Promise<JobOutcome>;

    return { id: jobId, done };
  }

  /**
   * On boot: a job still 'queued' or 'running' belongs to a process that died
   * (the queue is in memory), so it will never run. Mark it failed so the table
   * tells the truth. Assumes a single API instance per DB. Returns the count.
   * Only jobs scheduled before this call are reaped, so a job enqueued by this
   * process afterwards is never touched.
   */
  async reapStaleJobs(): Promise<number> {
    const rows = await this.db
      .update(t.jobs)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        error: 'interrupted by a server restart',
      })
      .where(
        and(inArray(t.jobs.status, ['queued', 'running']), lt(t.jobs.scheduledAt, new Date())),
      )
      .returning({ id: t.jobs.id });
    return rows.length;
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
