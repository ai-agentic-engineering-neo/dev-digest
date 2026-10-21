/**
 * JobRunner — a failing background job must never become an UNHANDLED promise
 * rejection (Node's default policy exits the process; this is exactly how a
 * `git clone` of a non-existent repo took the API down from POST /repos/:id/refresh).
 * The runner attaches its own handler to `done`, logs through the injected
 * logger, marks the jobs row failed — and `done` still rejects for a caller
 * that chooses to await it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import { JobRunner } from '../src/platform/jobs.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('JobRunner failure handling (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('a job that throws is logged + marked failed, without an unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const runner = new JobRunner(pg.handle.db, { retries: 0, timeoutMs: 5_000 });
      const logged: { obj: unknown; msg?: string }[] = [];
      runner.setLogger({ error: (obj, msg) => logged.push({ obj, msg }) });
      runner.register('explode', async () => {
        throw new Error('Repository not found');
      });

      // Fire-and-forget, exactly like ReposService.refresh / add: `done` is dropped.
      const { id } = await runner.enqueue(workspaceId, 'explode', { repo: 'acme/payments-api' });
      await runner.onIdle();
      // Let any would-be unhandled rejection propagate through the microtask queue.
      await new Promise((r) => setTimeout(r, 20));

      expect(unhandled).toHaveLength(0);
      expect(logged).toHaveLength(1);
      expect(logged[0]!.msg).toContain("job 'explode' failed");
      expect(logged[0]!.obj).toMatchObject({ jobId: id, kind: 'explode', workspaceId });

      const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, id));
      expect(row!.status).toBe('failed');
      expect(row!.error).toBe('Repository not found');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('a caller that awaits `done` still observes the failure', async () => {
    const runner = new JobRunner(pg.handle.db, { retries: 0, timeoutMs: 5_000 });
    runner.register('explode', async () => {
      throw new Error('boom');
    });
    const { done } = await runner.enqueue(workspaceId, 'explode', {});
    await expect(done).rejects.toThrow('boom');
  });

  it('a succeeding job is not reported as failed', async () => {
    const runner = new JobRunner(pg.handle.db, { retries: 0, timeoutMs: 5_000 });
    const logged: unknown[] = [];
    runner.setLogger({ error: (obj) => logged.push(obj) });
    runner.register('ok', async () => undefined);
    const { id, done } = await runner.enqueue(workspaceId, 'ok', {});
    await done;
    expect(logged).toHaveLength(0);
    const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, id));
    expect(row!.status).toBe('done');
  });
});
