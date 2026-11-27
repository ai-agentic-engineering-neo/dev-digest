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
    expect(sets.at(-1)).toMatchObject({ status: 'done' });
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
