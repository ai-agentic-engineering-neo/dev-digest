import { describe, it, expect } from 'vitest';
import { RunBus, type RunBusTimer } from '../src/platform/sse.js';

/** Manual timer: records scheduled callbacks so a test can fire them at will. */
function manualTimer() {
  const pending: { fn: () => void; ms: number; unrefed: boolean }[] = [];
  const schedule: RunBusTimer = (fn, ms) => {
    const entry = { fn, ms, unrefed: false };
    pending.push(entry);
    return {
      unref() {
        entry.unrefed = true;
      },
    };
  };
  const fire = () => {
    for (const e of pending.splice(0)) e.fn();
  };
  return { schedule, pending, fire };
}

describe('RunBus cancel flag', () => {
  it('survives complete() — cancelRun completes the bus right after cancelling', () => {
    const bus = new RunBus();
    bus.cancel('r1');
    bus.complete('r1');
    expect(bus.isCancelled('r1')).toBe(true);
    expect(bus.isComplete('r1')).toBe(true);
  });

  it('is per run', () => {
    const bus = new RunBus();
    bus.cancel('r1');
    expect(bus.isCancelled('r2')).toBe(false);
  });

  it('onCancel fires when cancel() is called, and immediately for an already-cancelled run', () => {
    const bus = new RunBus();
    let fired = 0;
    const off = bus.onCancel('r1', () => fired++);
    bus.cancel('r1');
    expect(fired).toBe(1);
    off();
    bus.cancel('r1');
    expect(fired).toBe(1);

    let late = 0;
    bus.onCancel('r1', () => late++);
    expect(late).toBe(1);
  });
});

describe('RunBus lifecycle', () => {
  it('publish after complete does not reach subscribers or recreate live state', () => {
    const bus = new RunBus();
    const seen: string[] = [];
    bus.subscribe('r1', (e) => seen.push(e.msg));
    bus.publish('r1', 'info', 'one');
    bus.complete('r1');
    bus.publish('r1', 'info', 'late');
    expect(seen).toEqual(['one']);
    // A late subscriber still ends at once (no emitter re-armed by the publish).
    let done = false;
    bus.onDone('r1', () => (done = true));
    return Promise.resolve().then(() => expect(done).toBe(true));
  });

  it('evicts all state of a completed run after the TTL (timer is unref-ed)', () => {
    const timer = manualTimer();
    const bus = new RunBus({ ttlMs: 1234, schedule: timer.schedule });
    bus.publish('r1', 'info', 'one');
    bus.cancel('r1');
    bus.complete('r1');
    expect(timer.pending).toHaveLength(1);
    expect(timer.pending[0]!.ms).toBe(1234);
    expect(timer.pending[0]!.unrefed).toBe(true);
    expect(bus.has('r1')).toBe(true);
    expect(bus.buffer('r1')).toHaveLength(1);

    timer.fire();
    expect(bus.has('r1')).toBe(false);
    expect(bus.isComplete('r1')).toBe(false);
    expect(bus.isCancelled('r1')).toBe(false);
    expect(bus.buffer('r1')).toEqual([]);
  });

  it('a second complete() does not schedule a second eviction', () => {
    const timer = manualTimer();
    const bus = new RunBus({ schedule: timer.schedule });
    bus.complete('r1');
    bus.complete('r1');
    expect(timer.pending).toHaveLength(1);
  });

  it('has() is false for a run the bus never saw', () => {
    const bus = new RunBus();
    expect(bus.has('nope')).toBe(false);
    bus.publish('r1', 'info', 'x');
    expect(bus.has('r1')).toBe(true);
  });
});
