import { describe, it, expect } from 'vitest';
import {
  LOW_SAMPLE_THRESHOLD,
  PERF_RANGE_PRESETS,
  computeAgentMetrics,
  dailyTrend,
  dailyTrendPoints,
  emptyPerfSourceRow,
  numericDelta,
  previousPeriod,
  resolvePerfRange,
  type PerfSourceRow,
} from './perf.js';

/**
 * plans/16-agent-performance-dashboard.md — hermetic unit tests for the ONE
 * place both `ci/service.ts` (all agents) and `agents/service.ts` (one agent)
 * derive rates/averages/deltas from a `PerfSourceRow` (server/LEARNINGS.md's
 * 2026-09-23 "Codebase Patterns" entry on this file). Pure functions, zero DB
 * — following this repo's `reviews/service.test.ts`-style fake-object
 * convention isn't even needed here since nothing but plain data goes in/out.
 */

function row(overrides: Partial<PerfSourceRow> = {}): PerfSourceRow {
  return { ...emptyPerfSourceRow('agent-1'), ...overrides };
}

describe('computeAgentMetrics', () => {
  it('D1 — running/failed runs count into `runs` but NOT into the countedRuns/costedRuns denominators for avg_cost_usd/avg_latency_ms', () => {
    // 3 raw runs total; only 1 is 'done' (countedRuns), only 1 has a real
    // cost (costedRuns), only 2 have a real duration (timedRuns) — mirrors a
    // real done+failed+running mix (server/LEARNINGS.md: a failed run's
    // durationMs is NOT null, only its costUsd is).
    const r = row({
      runsLocal: 3,
      runsCi: 0,
      countedRuns: 1,
      costedRuns: 1,
      timedRuns: 2,
      totalCostUsd: 9,
      totalDurationMs: 1800,
    });
    const metrics = computeAgentMetrics(r, undefined);

    expect(metrics.runs).toBe(3); // raw total unaffected
    // Dividing by `runs` (3) instead of `costedRuns` (1) would understate
    // this to 3 — the exact D1 bug the plan names.
    expect(metrics.avg_cost_usd).toBe(9);
    expect(metrics.avg_latency_ms).toBe(900);
  });

  it('avg_cost_usd/avg_latency_ms are null (never 0) when their denominator is zero, even though runs > 0', () => {
    const r = row({ runsLocal: 2, countedRuns: 0, costedRuns: 0, timedRuns: 0 });
    const metrics = computeAgentMetrics(r, undefined);
    expect(metrics.runs).toBe(2);
    expect(metrics.avg_cost_usd).toBeNull();
    expect(metrics.avg_latency_ms).toBeNull();
  });

  it('cost_by_source buckets pass through provider/estimated/unknown sub-totals unchanged', () => {
    const r = row({ costProvider: 6, costEstimated: 2, costUnknown: null });
    const metrics = computeAgentMetrics(r, undefined);
    expect(metrics.cost_by_source).toEqual({ provider: 6, estimated: 2, unknown: null });
  });

  it('low_sample flags an agent with < 20 decisions, without corrupting the accept_rate itself', () => {
    const underThreshold = row({ accepted: 9, dismissed: 10 }); // 19 decisions
    const atThreshold = row({ accepted: 10, dismissed: 10 }); // 20 decisions

    const underMetrics = computeAgentMetrics(underThreshold, undefined);
    const atMetrics = computeAgentMetrics(atThreshold, undefined);

    expect(underThreshold.accepted + underThreshold.dismissed).toBe(LOW_SAMPLE_THRESHOLD - 1);
    expect(underMetrics.low_sample).toBe(true);
    expect(underMetrics.accept_rate).toBeCloseTo(9 / 19);

    expect(atMetrics.low_sample).toBe(false);
    expect(atMetrics.accept_rate).toBe(0.5);
  });

  it('runs_delta/accept_rate_delta/cost_delta are null (never 0) when there is no prior-period row at all', () => {
    const r = row({ runsLocal: 5, accepted: 4, dismissed: 1, totalCostUsd: 10 });
    const metrics = computeAgentMetrics(r, undefined);
    expect(metrics.runs_delta).toBeNull();
    expect(metrics.accept_rate_delta).toBeNull();
    expect(metrics.cost_delta).toBeNull();
  });

  it('deltas are computed against a real prior-period row, and individually null when only one side is known', () => {
    const current = row({ runsLocal: 5, runsCi: 0, accepted: 8, dismissed: 2, totalCostUsd: 20 });
    // Prior period: some runs, but zero decisions (accept_rate itself is
    // null for the prior period) and unknown total cost.
    const prior = row({ runsLocal: 3, runsCi: 0, accepted: 0, dismissed: 0, totalCostUsd: null });

    const metrics = computeAgentMetrics(current, prior);
    expect(metrics.runs_delta).toBe(2); // 5 - 3
    // prior accept_rate is null (zero decisions) — delta must be null, not
    // a guessed baseline of 0.
    expect(metrics.accept_rate_delta).toBeNull();
    // prior totalCostUsd is null — delta must be null too.
    expect(metrics.cost_delta).toBeNull();
  });

  it('a genuine zero-to-zero prior period still yields a real (non-null) numeric delta', () => {
    const current = row({ runsLocal: 2, totalCostUsd: 4 });
    const prior = row({ runsLocal: 0, totalCostUsd: 0 });
    const metrics = computeAgentMetrics(current, prior);
    expect(metrics.runs_delta).toBe(2);
    expect(metrics.cost_delta).toBe(4);
  });
});

describe('numericDelta', () => {
  it('returns the numeric difference when both sides are known', () => {
    expect(numericDelta(10, 4)).toBe(6);
    expect(numericDelta(0, 0)).toBe(0);
  });

  it('returns null (never 0) unless BOTH sides are known — null-is-not-zero', () => {
    expect(numericDelta(null, 4)).toBeNull();
    expect(numericDelta(10, null)).toBeNull();
    expect(numericDelta(null, null)).toBeNull();
  });
});

describe('resolvePerfRange', () => {
  it('resolves a preset `{ days }` range to [now - days, now) with rangeDays echoed back', () => {
    const before = Date.now();
    const resolved = resolvePerfRange({ days: 7 });
    const after = Date.now();

    expect(resolved.rangeDays).toBe(7);
    expect(resolved.to.getTime()).toBeGreaterThanOrEqual(before);
    expect(resolved.to.getTime()).toBeLessThanOrEqual(after);
    expect(resolved.to.getTime() - resolved.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('an out-of-list days value defensively falls back to 30, never NaN/undefined', () => {
    const resolved = resolvePerfRange({ days: 999 });
    expect(resolved.rangeDays).toBe(30);
    expect(resolved.to.getTime() - resolved.from.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('every declared preset resolves to itself', () => {
    for (const days of PERF_RANGE_PRESETS) {
      expect(resolvePerfRange({ days }).rangeDays).toBe(days);
    }
  });

  it('a custom `{ from, to }` range passes through untouched with rangeDays null (D12/AC-43)', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-15T00:00:00Z');
    const resolved = resolvePerfRange({ from, to });
    expect(resolved).toEqual({ from, to, rangeDays: null });
  });
});

describe('previousPeriod', () => {
  it('returns the immediately-preceding, equal-length window', () => {
    const from = new Date('2026-02-01T00:00:00Z');
    const to = new Date('2026-02-08T00:00:00Z'); // 7-day span
    const prev = previousPeriod(from, to);
    expect(prev.to).toEqual(from);
    expect(prev.from).toEqual(new Date('2026-01-25T00:00:00Z'));
    expect(prev.to.getTime() - prev.from.getTime()).toBe(to.getTime() - from.getTime());
  });
});

describe('dailyTrend / dailyTrendPoints', () => {
  const from = new Date('2026-03-01T00:00:00Z');
  const to = new Date('2026-03-04T00:00:00Z');

  it('zero-fills every day in [from,to] inclusive, oldest to newest, even with sparse input', () => {
    const runsByDay = [
      { day: '2026-03-01', count: 2 },
      { day: '2026-03-03', count: 5 },
    ];
    expect(dailyTrend(runsByDay, from, to)).toEqual([2, 0, 5, 0]);
  });

  it('dailyTrendPoints labels each bucket with its ISO date', () => {
    const runsByDay = [{ day: '2026-03-02', count: 1 }];
    expect(dailyTrendPoints(runsByDay, from, to)).toEqual([
      { label: '2026-03-01', value: 0 },
      { label: '2026-03-02', value: 1 },
      { label: '2026-03-03', value: 0 },
      { label: '2026-03-04', value: 0 },
    ]);
  });
});

describe('emptyPerfSourceRow', () => {
  it('is all honest zeros/nulls, never a fabricated non-zero figure', () => {
    const empty = emptyPerfSourceRow('agent-x');
    const metrics = computeAgentMetrics(empty, undefined);
    expect(metrics.runs).toBe(0);
    expect(metrics.accept_rate).toBeNull();
    expect(metrics.avg_cost_usd).toBeNull();
    expect(metrics.avg_latency_ms).toBeNull();
    expect(metrics.low_sample).toBe(true); // 0 decisions < 20
  });
});
