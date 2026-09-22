import PQueue from 'p-queue';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry, isTransient } from './resilience.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 */

/**
 * `signal` aborts when the attempt times out (reason: TimeoutError) or the
 * runner shuts down. Handlers forward it to anything abortable (simple-git
 * `abort`, fetch/SDK `{ signal }`) and stop at their next checkpoint.
 */
export interface JobContext {
  jobId: string;
  signal: AbortSignal;
}

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<void>;

/** Job handlers a module declares in its composition.ts, keyed by job kind. */
export type JobHandlers = Record<string, JobHandler>;

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface EnqueuedJob {
  id: string;
  /** Resolves when the job finishes (or rejects if it ultimately fails). */
  done: Promise<void>;
}

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, JobHandler>();
  private timeoutMs: number;
  private retries: number;
  /** Aborted by `shutdown()`; every running attempt's signal follows it. */
  private lifecycle = new AbortController();

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);
    if (this.lifecycle.signal.aborted) throw new Error('JobRunner is shutting down');

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;

    const done = this.queue.add(async () => {
      await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
      try {
        await withRetry(
          () =>
            withTimeout(
              (signal) => handler(payload, { jobId, signal }),
              this.timeoutMs,
              this.lifecycle.signal,
            ).then(async () => {
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries: this.retries,
            // Never retry once the runner is shutting down.
            isRetryable: (err) => !this.lifecycle.signal.aborted && isTransient(err),
            onRetry: async (attempt) => {
              await this.db
                .update(t.jobs)
                .set({ attempts: attempt })
                .where(eq(t.jobs.id, jobId));
            },
          },
        );
        await this.db
          .update(t.jobs)
          .set({ status: 'done', finishedAt: new Date() })
          .where(eq(t.jobs.id, jobId));
      } catch (err) {
        await this.db
          .update(t.jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: (err as Error).message,
          })
          .where(eq(t.jobs.id, jobId));
        throw err;
      }
    }) as Promise<void>;

    return { id: jobId, done };
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  /**
   * Graceful stop: refuse new jobs, drop queued-but-not-started ones (their
   * rows stay 'queued'), abort running handlers, then wait up to `timeoutMs`
   * for them to settle. Returns true when the runner went idle in time.
   */
  async shutdown(timeoutMs = 10_000): Promise<boolean> {
    this.queue.clear();
    this.lifecycle.abort(new Error('JobRunner shutdown'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<false>((r) => {
      timer = setTimeout(() => r(false), timeoutMs);
    });
    try {
      return await Promise.race([this.queue.onIdle().then(() => true as const), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }
}
