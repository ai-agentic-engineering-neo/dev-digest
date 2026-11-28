import { describe, it, expect, vi } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/** Stub Db: records every `.update().set()` payload; insert returns a fixed id. */
function fakeDb() {
  const sets: Array<Record<string, unknown>> = [];
  const db = {
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'job-1' }] }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        sets.push(v);
        return { where: async () => undefined };
      },
    }),
  };
  return { db: db as unknown as Db, sets };
}

describe('JobRunner', () => {
  it('resolves done with ok:true and marks the job done', async () => {
    const { db, sets } = fakeDb();
    const runner = new JobRunner(db, { retries: 0 });
    runner.register('k', async () => {});
    const job = await runner.enqueue('ws', 'k', {});
    await expect(job.done).resolves.toEqual({ ok: true });
    expect(sets.at(-1)).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('records the real attempt count after a retried success and after a failure', async () => {
    const retryable = Object.assign(new Error('boom'), { status: 503 });

    const a = fakeDb();
    const retried = new JobRunner(a.db, { retries: 2 });
    let calls = 0;
    retried.register('k', async () => {
      calls += 1;
      if (calls < 3) throw retryable;
    });
    await (await retried.enqueue('ws', 'k', {})).done;
    expect(a.sets.at(-1)).toMatchObject({ status: 'done', attempts: 3 });

    const b = fakeDb();
    const failing = new JobRunner(b.db, { retries: 0 });
    failing.register('k', async () => {
      throw new Error('nope');
    });
    await (await failing.enqueue('ws', 'k', {})).done;
    expect(b.sets.at(-1)).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('reapStaleJobs marks queued/running jobs failed and returns the count', async () => {
    const sets: Array<Record<string, unknown>> = [];
    const db = {
      update: () => ({
        set: (v: Record<string, unknown>) => {
          sets.push(v);
          return { where: () => ({ returning: async () => [{ id: 'a' }, { id: 'b' }] }) };
        },
      }),
    } as unknown as Db;
    await expect(new JobRunner(db).reapStaleJobs()).resolves.toBe(2);
    expect(sets[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('restart') });
  });

  it('a throwing handler leaves done resolved (never rejects) and records the failure', async () => {
    const { db, sets } = fakeDb();
    const log = { error: vi.fn() };
    const runner = new JobRunner(db, { retries: 0 });
    runner.setLogger(log);
    runner.register('k', async () => {
      throw new Error('clone failed');
    });
    const job = await runner.enqueue('ws', 'k', {});
    const outcome = await job.done;
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error.message).toBe('clone failed');
    expect(sets.at(-1)).toMatchObject({ status: 'failed', error: 'clone failed' });
    expect(log.error).toHaveBeenCalled();
  });
});
