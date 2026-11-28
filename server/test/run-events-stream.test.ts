/**
 * BE-8 — the run-events stream ends and cleans up: the bus frees a completed
 * run after a fixed time, the live stream sends a heartbeat and drops its
 * subscription when the client leaves, and the service resolves the run first
 * (unknown → 404; finished and forgotten by the bus → replay of the stored log).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RunTrace } from '@devdigest/shared';
import { RunBus, RUN_BUFFER_TTL_MS, SSE_HEARTBEAT_MS, liveRunFrames } from '../src/platform/sse.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { ReviewServiceDeps } from '../src/modules/reviews/service.js';
import type { ReviewStore } from '../src/modules/reviews/ports.js';
import { NotFoundError } from '../src/platform/errors.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('RunBus buffer expiry', () => {
  it('keeps a completed run replayable, then forgets it after the TTL', () => {
    vi.useFakeTimers();
    const bus = new RunBus();
    bus.publish('run-1', 'info', 'Starting review');
    bus.complete('run-1');

    vi.advanceTimersByTime(RUN_BUFFER_TTL_MS - 1);
    expect(bus.buffer('run-1')).toHaveLength(1);
    expect(bus.isComplete('run-1')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(bus.has('run-1')).toBe(false);
    expect(bus.buffer('run-1')).toEqual([]);
    expect(bus.isComplete('run-1')).toBe(false);
  });

  it('waits for a cancelled run\'s runner to exit before starting the clock', () => {
    vi.useFakeTimers();
    const bus = new RunBus();
    bus.publish('run-1', 'info', 'Starting review');
    bus.cancel('run-1');
    bus.complete('run-1'); // cancelRun ends the stream; the runner is still in the LLM call

    vi.advanceTimersByTime(RUN_BUFFER_TTL_MS + 1);
    expect(bus.buffer('run-1')).toHaveLength(1);

    bus.clearCancelled('run-1'); // the runner exits
    vi.advanceTimersByTime(RUN_BUFFER_TTL_MS);
    expect(bus.has('run-1')).toBe(false);
  });
});

describe('liveRunFrames', () => {
  it('replays, streams live, and ends when the run completes', async () => {
    const bus = new RunBus();
    bus.publish('run-1', 'info', 'one');
    const frames = liveRunFrames(bus, 'run-1', new AbortController().signal);

    expect((await frames.next()).value).toMatchObject({ id: '1', event: 'info' });
    const next = frames.next();
    bus.publish('run-1', 'result', 'two');
    expect((await next).value).toMatchObject({ id: '2', event: 'result' });
    bus.complete('run-1');
    expect((await frames.next()).done).toBe(true);
  });

  it('sends a heartbeat while idle and unsubscribes when the client leaves', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const offDone = vi.fn();
    const bus = { subscribe: vi.fn(() => unsubscribe), onDone: vi.fn(() => offDone) };
    const client = new AbortController();
    const frames = liveRunFrames(bus, 'run-1', client.signal);

    const first = frames.next();
    await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS);
    expect((await first).value).toEqual({ comment: 'heartbeat' });

    const pending = frames.next();
    client.abort();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(offDone).toHaveBeenCalledTimes(1);
    expect((await pending).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0); // heartbeat interval cleared
  });
});

describe('ReviewService.runEventSource', () => {
  function service(
    runs: Record<string, string>,
    trace?: Pick<RunTrace, 'log'>,
    bus = new RunBus(),
  ) {
    const store = {
      getRunStatus: async (_ws: string, id: string) => (id in runs ? { status: runs[id]! } : undefined),
      getRunTrace: async () => trace as RunTrace | undefined,
    } as unknown as ReviewStore;
    return new ReviewService({ store, events: bus } as unknown as ReviewServiceDeps);
  }

  it('an unknown run is a NotFoundError', async () => {
    await expect(service({}).runEventSource('ws-1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a finished run the bus forgot replays its stored log as run events', async () => {
    const trace = { log: [{ t: '10:00:00', kind: 'info' as const, msg: 'Starting review' }] };
    const source = await service({ 'run-1': 'done' }, trace).runEventSource('ws-1', 'run-1');
    expect(source).toEqual({
      kind: 'replay',
      events: [{ runId: 'run-1', seq: 1, kind: 'info', msg: 'Starting review', t: '10:00:00' }],
    });
  });
});
