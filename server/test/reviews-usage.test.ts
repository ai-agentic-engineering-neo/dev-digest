import { describe, it, expect } from 'vitest';
import { UsageTally } from '../src/modules/reviews/usage.js';
import { RunSummary, RunTrace, PrMeta } from '@devdigest/shared';

/**
 * Run Cost Badge — the executor's running usage total. On a failed/cancelled
 * run this tally (fed per chunk by reviewer-core's `onUsage`) is what gets
 * persisted, so its null semantics decide whether the UI shows "—" or a number.
 */
describe('UsageTally', () => {
  it('no calls → tokens 0, cost null (nothing spent shows "—", not $0.00)', () => {
    const u = new UsageTally();
    expect(u.tokensIn).toBe(0);
    expect(u.tokensOut).toBe(0);
    expect(u.costUsd).toBeNull();
  });

  it('sums tokens and cost across completed chunks (partial spend)', () => {
    const u = new UsageTally();
    u.add({ tokensIn: 1000, tokensOut: 200, costUsd: 0.002 });
    u.add({ tokensIn: 500, tokensOut: 100, costUsd: 0.001 });
    expect(u.tokensIn).toBe(1500);
    expect(u.tokensOut).toBe(300);
    expect(u.costUsd).toBeCloseTo(0.003, 10);
  });

  it('one unpriced call makes the total unknown (never an under-count)', () => {
    const u = new UsageTally();
    u.add({ tokensIn: 10, tokensOut: 5, costUsd: 0.002 });
    u.add({ tokensIn: 10, tokensOut: 5, costUsd: null });
    u.add({ tokensIn: 10, tokensOut: 5, costUsd: 0.002 });
    expect(u.costUsd).toBeNull();
    expect(u.tokensIn).toBe(30);
  });
});

describe('cost fields on shared contracts', () => {
  it('RunTrace.stats.cost_usd is optional (traces stored before the feature still parse)', () => {
    const base = {
      config: { agent: 'Sec', model: 'm' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: [],
    };
    const stats = { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' };
    expect(RunTrace.parse({ ...base, stats }).stats.cost_usd).toBeUndefined();
    expect(RunTrace.parse({ ...base, stats: { ...stats, cost_usd: 0.0013 } }).stats.cost_usd).toBe(0.0013);
  });

  it('RunSummary requires cost_usd (nullable) and PrMeta accepts it', () => {
    const run = {
      run_id: 'r',
      agent_id: null,
      agent_name: null,
      provider: null,
      model: null,
      status: 'failed',
      error: 'x',
      duration_ms: 1,
      tokens_in: 0,
      tokens_out: 0,
      findings_count: 0,
      grounding: null,
      ran_at: null,
      score: null,
      blockers: null,
    };
    expect(() => RunSummary.parse({ ...run, cost_usd: null })).not.toThrow();
    expect(() => RunSummary.parse(run)).toThrow();
    const pr = {
      number: 1,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'h',
      additions: 0,
      deletions: 0,
      files_count: 0,
      status: 'needs_review',
    };
    expect(PrMeta.parse({ ...pr, cost_usd: 0.014 }).cost_usd).toBe(0.014);
  });
});
