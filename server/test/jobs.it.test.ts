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
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('a failing fire-and-forget job does not raise an unhandled rejection, and is persisted as failed', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const runner = new JobRunner(pg.handle.db, { retries: 0, timeoutMs: 5_000 });
      runner.register('boom', async () => {
        throw new Error('handler exploded');
      });

      // Callers in the app never await `done` — mirror that here.
      const { id } = await runner.enqueue(workspaceId, 'boom', {});
      await runner.onIdle();
      // Give Node a macrotask turn to report any unhandled rejection.
      await new Promise((r) => setTimeout(r, 50));

      expect(unhandled).toEqual([]);
      const [row] = await pg.handle.db.select().from(t.jobs).where(eq(t.jobs.id, id));
      expect(row!.status).toBe('failed');
      expect(row!.error).toBe('handler exploded');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('a caller that does await `done` still sees the rejection', async () => {
    const runner = new JobRunner(pg.handle.db, { retries: 0, timeoutMs: 5_000 });
    runner.register('boom', async () => {
      throw new Error('handler exploded');
    });
    const { done } = await runner.enqueue(workspaceId, 'boom', {});
    await expect(done).rejects.toThrow('handler exploded');
  });
});
