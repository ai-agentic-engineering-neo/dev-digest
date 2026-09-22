import { describe, it, expect } from 'vitest';
import { UsageMeter } from '../src/modules/reviews/domain/usage-meter.js';

/** The meter is the only record of spend when a run fails/cancels mid-way. */
describe('UsageMeter', () => {
  it('starts at zero tokens and $0 (no call ⇒ nothing billed)', () => {
    const m = new UsageMeter();
    expect([m.tokensIn, m.tokensOut, m.costUsd, m.calls]).toEqual([0, 0, 0, 0]);
  });

  it('sums per-response deltas; `add` works detached (passed as onUsage)', () => {
    const m = new UsageMeter();
    const onUsage = m.add;
    onUsage({ tokensIn: 100, tokensOut: 10, costUsd: 0.001 });
    onUsage({ tokensIn: 50, tokensOut: 5, costUsd: 0.0005 });
    expect(m.tokensIn).toBe(150);
    expect(m.tokensOut).toBe(15);
    expect(m.costUsd).toBeCloseTo(0.0015);
    expect(m.calls).toBe(2);
  });

  it('one unpriced response makes the cost unknown for good, tokens keep counting', () => {
    const m = new UsageMeter();
    m.add({ tokensIn: 1, tokensOut: 1, costUsd: 0.1 });
    m.add({ tokensIn: 1, tokensOut: 1, costUsd: null });
    m.add({ tokensIn: 1, tokensOut: 1, costUsd: 0.1 });
    expect(m.costUsd).toBeNull();
    expect(m.tokensIn).toBe(3);
  });
});
