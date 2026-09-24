import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError } from '../src/platform/resilience.js';
import { JobRunner, type JobContext } from '../src/platform/jobs.js';
import { RunBus } from '../src/platform/sse.js';
import type { Db } from '../src/db/client.js';

/** Just enough of Drizzle for JobRunner's insert/update bookkeeping. */
function fakeDb(): { db: Db; updates: Record<string, unknown>[] } {
  const updates: Record<string, unknown>[] = [];
  let n = 0;
  const db = {
    insert: () => ({ values: () => ({ returning: async () => [{ id: `job-${++n}` }] }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          updates.push(v);
        },
      }),
    }),
  } as unknown as Db;
  return { db, updates };
}

/** Resolves when `signal` aborts; never otherwise. */
const untilAborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));

describe('withTimeout (abortable form)', () => {
  it('aborts the work with a TimeoutError reason when the timeout hits', async () => {
    let seen: AbortSignal | undefined;
    await expect(
      withTimeout((signal) => {
        seen = signal;
        return untilAborted(signal);
      }, 20),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(seen?.aborted).toBe(true);
    expect(seen?.reason).toBeInstanceOf(TimeoutError);
  });

  it('follows a parent signal (shutdown) and still returns results in time', async () => {
    const parent = new AbortController();
    const p = withTimeout((signal) => untilAborted(signal), 10_000, parent.signal);
    parent.abort(new Error('bye'));
    await expect(p).rejects.toThrow('bye');
    await expect(withTimeout(async () => 42, 1_000)).resolves.toBe(42);
  });
});

describe('JobRunner abort + shutdown', () => {
  it('hands each attempt a signal that aborts when the job times out', async () => {
    const { db, updates } = fakeDb();
    const jobs = new JobRunner(db, { timeoutMs: 20, retries: 0 });
    let ctx: JobContext | undefined;
    jobs.register('slow', (_p, c) => {
      ctx = c;
      return untilAborted(c.signal);
    });
    const { done } = await jobs.enqueue('ws', 'slow', {});
    await expect(done).rejects.toBeInstanceOf(TimeoutError);
    expect(ctx?.signal.aborted).toBe(true);
    expect(updates.at(-1)).toMatchObject({ status: 'failed' });
  });

  it('shutdown aborts running handlers, waits for idle and refuses new jobs', async () => {
    const { db } = fakeDb();
    const jobs = new JobRunner(db, { timeoutMs: 60_000, retries: 3 });
    let calls = 0;
    jobs.register('long', (_p, c) => {
      calls++;
      return untilAborted(c.signal);
    });
    const { done } = await jobs.enqueue('ws', 'long', {});
    done.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 10));
    await expect(jobs.shutdown(1_000)).resolves.toBe(true);
    await expect(done).rejects.toThrow('JobRunner shutdown');
    expect(calls).toBe(1); // not retried after shutdown
    await expect(jobs.enqueue('ws', 'long', {})).rejects.toThrow(/shutting down/);
  });
});

describe('RunBus shutdown', () => {
  it('cancelAll signals live runs; whenIdle resolves when they complete; completeAll ends streams', async () => {
    const bus = new RunBus();
    bus.publish('r1', 'info', 'working');
    bus.publish('r2', 'info', 'working');
    bus.complete('r2');
    const aborted: string[] = [];
    bus.onCancel('r1', () => {
      aborted.push('r1');
      queueMicrotask(() => bus.complete('r1'));
    });
    expect(bus.cancelAll()).toEqual(['r1']);
    expect(aborted).toEqual(['r1']);
    await expect(bus.whenIdle(1_000)).resolves.toBe(true);

    bus.subscribe('orphan', () => undefined);
    let ended = false;
    bus.onDone('orphan', () => (ended = true));
    await expect(bus.whenIdle(10)).resolves.toBe(false);
    bus.completeAll();
    expect(ended).toBe(true);
    expect(bus.liveRunIds()).toEqual([]);
  });
});
