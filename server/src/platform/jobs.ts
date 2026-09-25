import PQueue from 'p-queue';
import { eq } from 'drizzle-orm';
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

export interface EnqueuedJob {
  id: string;
  /**
   * Resolves when the job finishes, rejects if it ultimately fails. Awaiting it
   * is OPTIONAL: the runner attaches its own handler (log + jobs.error), so a
   * caller that fires and forgets never leaves an unhandled rejection behind.
   */
  done: Promise<void>;
}

/** Minimal pino-compatible logger the runner reports failed jobs through. */
export type JobLogger = { error: (obj: unknown, msg?: string) => void };

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, JobHandler>();
  private timeoutMs: number;
  private retries: number;
  private logger: JobLogger | null = null;

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

  /** Where failed jobs are reported (the app's pino logger). Optional; without
   *  it a failure is only visible in the `jobs` table. */
  setLogger(logger: JobLogger | null): void {
    this.logger = logger;
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);

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
            withTimeout(handler(payload, { jobId }), this.timeoutMs).then(async () => {
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries: this.retries,
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

    // Every job failure is observed HERE, so the rejection is never "unhandled"
    // (which would kill the process under Node's default policy) even when the
    // caller — refresh, add-repo, index — does not await `done`. Attaching a
    // catch marks the rejection handled without changing `done` itself: a
    // caller that does await it still sees the rejection.
    done.catch((err: unknown) => {
      this.logger?.error(
        { err, jobId, kind, workspaceId },
        `job '${kind}' failed after retries: ${(err as Error)?.message ?? String(err)}`,
      );
    });

    return { id: jobId, done };
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
