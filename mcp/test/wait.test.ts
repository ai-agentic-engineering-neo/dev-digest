import { describe, it, expect } from 'vitest';
import { waitForRun } from '../src/wait.js';
import { ApiError } from '../src/api/client.js';
import { fakeClock, runFindings } from './helpers.js';
import type { RunFindings } from '@devdigest/shared';

const rf = (s: string) => runFindings(s) as unknown as RunFindings;

describe('waitForRun', () => {
  it('finishes after polls and reports progress each running poll', async () => {
    const clock = fakeClock();
    const seq = ['running', 'running', 'running', 'done'];
    const progress: number[] = [];
    const out = await waitForRun({
      fetchRun: async () => rf(seq.shift()!),
      intervalMs: 1000, maxWaitMs: 60_000, ...clock,
      onProgress: (s) => void progress.push(s),
    });
    expect(out.kind).toBe('finished');
    expect(progress).toEqual([0, 1, 2]);
  });

  it('times out at the max wait', async () => {
    const out = await waitForRun({ fetchRun: async () => rf('running'), intervalMs: 1000, maxWaitMs: 5000, ...fakeClock() });
    expect(out.kind).toBe('timeout');
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    let n = 0;
    const out = await waitForRun({
      fetchRun: async () => {
        if (++n === 2) ac.abort();
        return rf('running');
      },
      intervalMs: 1000, maxWaitMs: 60_000, signal: ac.signal, ...fakeClock(),
    });
    expect(out.kind).toBe('aborted');
  });

  it('backs off on 429 then finishes', async () => {
    const clock = fakeClock();
    let n = 0;
    const out = await waitForRun({
      fetchRun: async () => {
        if (++n === 1) throw new ApiError('api', 'rate', 429, undefined, 7);
        return rf('done');
      },
      intervalMs: 1000, maxWaitMs: 60_000, ...clock,
    });
    expect(out.kind).toBe('finished');
    expect(clock.now()).toBe(7000);
  });

  it('rethrows other errors', async () => {
    await expect(
      waitForRun({ fetchRun: async () => { throw new ApiError('api', 'x', 500); }, intervalMs: 1, maxWaitMs: 5, ...fakeClock() }),
    ).rejects.toThrow('x');
  });

  it('429 without retry-after backs off 10s and times out after the max wait', async () => {
    const clock = fakeClock();
    let n = 0;
    const out = await waitForRun({
      fetchRun: async () => {
        n++;
        throw new ApiError('api', 'rate', 429);
      },
      intervalMs: 1000, maxWaitMs: 15_000, ...clock,
    });
    expect(out.kind).toBe('timeout');
    expect(n).toBe(3);
    // 0s → 429 → sleep 10s → 429 → sleep clamped to the 5s left → final poll at the deadline.
    expect(clock.now()).toBe(15_000);
  });

  it('an abort during a failing fetch returns aborted instead of throwing', async () => {
    const ac = new AbortController();
    const out = await waitForRun({
      fetchRun: async () => {
        ac.abort();
        throw new Error('aborted fetch');
      },
      intervalMs: 1000, maxWaitMs: 60_000, signal: ac.signal, ...fakeClock(),
    });
    expect(out.kind).toBe('aborted');
  });
});
