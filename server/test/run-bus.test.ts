import { describe, it, expect } from 'vitest';
import { RunBus } from '../src/platform/sse.js';

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
});
