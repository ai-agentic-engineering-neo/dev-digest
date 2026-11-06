import { describe, it, expect } from 'vitest';
import { aggregateRunEstimates } from '../src/modules/agents/domain.js';

describe('aggregateRunEstimates', () => {
  it('returns [] for no samples', () => {
    expect(aggregateRunEstimates([])).toEqual([]);
  });

  it('averages only non-null costs', () => {
    const [e] = aggregateRunEstimates([
      { agentId: 'a', durationMs: 1000, costUsd: 0.2 },
      { agentId: 'a', durationMs: 3000, costUsd: null },
      { agentId: 'a', durationMs: 2000, costUsd: 0.4 },
    ]);
    expect(e).toEqual({
      agent_id: 'a',
      sample_size: 3,
      avg_duration_ms: 2000,
      avg_cost_usd: expect.closeTo(0.3, 10),
    });
  });

  it('gives null cost when all costs are null', () => {
    const [e] = aggregateRunEstimates([{ agentId: 'a', durationMs: 5, costUsd: null }]);
    expect(e!.avg_cost_usd).toBeNull();
  });

  it('rounds the mean duration', () => {
    const mk = (ds: number[]) =>
      aggregateRunEstimates(ds.map((durationMs) => ({ agentId: 'a', durationMs, costUsd: null })))[0]!
        .avg_duration_ms;
    expect(mk([1000, 1001])).toBe(1001);
    expect(mk([1, 2])).toBe(2);
  });

  it('sorts by agent_id ascending', () => {
    const out = aggregateRunEstimates([
      { agentId: 'b', durationMs: 1, costUsd: null },
      { agentId: 'a', durationMs: 1, costUsd: null },
    ]);
    expect(out.map((e) => e.agent_id)).toEqual(['a', 'b']);
  });
});
