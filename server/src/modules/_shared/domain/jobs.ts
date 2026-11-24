/**
 * Background-job port (implemented by platform/jobs.ts JobRunner: p-queue +
 * `jobs` table). A rejected job is recorded on its row — the implementation
 * never lets it become an unhandled rejection.
 */
export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

export interface JobScheduler {
  register(kind: string, handler: JobHandler): void;
  /** Throws when no handler is registered for `kind`. */
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
}
