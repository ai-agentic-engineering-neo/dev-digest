import { describe, it, expect, afterEach } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/** Minimal stand-in for the drizzle calls JobRunner makes. */
const fakeDb = {
  insert: () => ({ values: () => ({ returning: async () => [{ id: 'job-1' }] }) }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
} as unknown as Db;

describe('JobRunner', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (err: unknown) => unhandled.push(err);
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    unhandled.length = 0;
  });

  it('does not leak an unhandled rejection when a fire-and-forget job fails', async () => {
    process.on('unhandledRejection', onUnhandled);
    const jobs = new JobRunner(fakeDb, { retries: 0 });
    jobs.register('boom', async () => {
      throw new Error('repository not found');
    });

    await jobs.enqueue('ws', 'boom', {}); // caller ignores `done`, like RepoService.refresh
    await jobs.onIdle();
    await new Promise((r) => setTimeout(r, 10));

    expect(unhandled).toEqual([]);
  });

  it('still rejects `done` for callers that await it', async () => {
    const jobs = new JobRunner(fakeDb, { retries: 0 });
    jobs.register('boom', async () => {
      throw new Error('repository not found');
    });

    const { done } = await jobs.enqueue('ws', 'boom', {});
    await expect(done).rejects.toThrow('repository not found');
  });
});
