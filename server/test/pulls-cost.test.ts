/**
 * M1 — PR-list COST column (`modules/pulls/cost.ts`): latest-round cost =
 * sum of the newest run of each agent on the PR.
 */
import { describe, it, expect } from 'vitest';
import { latestRoundCost, type RunCostRow } from '../src/modules/pulls/cost.js';

const row = (prId: string | null, agentId: string | null, costUsd: number | null): RunCostRow => ({
  prId,
  agentId,
  costUsd,
});

describe('latestRoundCost', () => {
  it('sums the newest run of each agent and ignores older re-runs', () => {
    const m = latestRoundCost([
      row('pr1', 'sec', 0.0013), // newest Security
      row('pr1', 'perf', 0.0014), // newest Performance
      row('pr1', 'perf', 0.0012), // older Performance — ignored
      row('pr1', 'sec', 0.5), // older Security — ignored
    ]);
    expect(m.get('pr1')).toBeCloseTo(0.0027);
  });

  it('a latest run without cost (failed/unpriced) contributes nothing — no fallback to an older run', () => {
    const m = latestRoundCost([
      row('pr1', 'gen', null), // latest General failed
      row('pr1', 'sec', 0.002),
      row('pr1', 'gen', 0.9), // older General — still ignored
    ]);
    expect(m.get('pr1')).toBeCloseTo(0.002);
  });

  it('is null when no run in the round has a known cost', () => {
    const m = latestRoundCost([row('pr1', 'gen', null), row('pr1', 'sec', null)]);
    expect(m.has('pr1')).toBe(true);
    expect(m.get('pr1')).toBeNull();
  });

  it('keeps PRs separate and skips orphan runs (deleted agent / PR)', () => {
    const m = latestRoundCost([
      row('pr1', 'sec', 0.01),
      row('pr2', 'sec', 0.02),
      row('pr1', null, 5),
      row(null, 'sec', 5),
    ]);
    expect(m.get('pr1')).toBeCloseTo(0.01);
    expect(m.get('pr2')).toBeCloseTo(0.02);
  });

  it('returns an empty map for no runs (PR shows "—")', () => {
    expect(latestRoundCost([]).size).toBe(0);
  });
});
