import { describe, it, expect } from 'vitest';
import type { RunTrace } from '@devdigest/shared';
import { reviewToDto } from '../src/modules/reviews/helpers.js';
import { withRunCost } from '../src/modules/reviews/repository/run.repo.js';

/**
 * M1 run cost — hermetic coverage of the two pure mappings that carry the
 * stored `agent_runs.cost_usd` into API responses.
 */

const trace = (stats: Partial<RunTrace['stats']> = {}): RunTrace =>
  ({
    config: { agent: 'Security Reviewer', model: 'deepseek/deepseek-v4-flash', source: 'local' },
    stats: { duration_ms: 8200, tokens_in: 15000, tokens_out: 1200, findings: 3, grounding: '3/3 passed', ...stats },
    prompt_assembly: { system: '', skills: null, memory: null, specs: null, user: '' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    log: [],
  }) as RunTrace;

describe('withRunCost (GET /runs/:id/trace)', () => {
  it('takes the cost from agent_runs (source of truth)', () => {
    expect(withRunCost(trace({ cost_usd: 0.5 }), 0.06).stats.cost_usd).toBe(0.06);
  });

  it('keeps a pre-M1 trace renderable: no stored cost → null', () => {
    const out = withRunCost(trace(), null);
    expect(out.stats.cost_usd).toBeNull();
    expect(out.stats.tokens_in).toBe(15000);
  });

  it('falls back to the trace stats when the run row has no cost', () => {
    expect(withRunCost(trace({ cost_usd: 0.01 }), undefined).stats.cost_usd).toBe(0.01);
  });

  it('keeps a real zero (free model) as 0, not null', () => {
    expect(withRunCost(trace(), 0).stats.cost_usd).toBe(0);
  });

  it('does not mutate the stored trace', () => {
    const stored = trace();
    withRunCost(stored, 0.06);
    expect(stored.stats.cost_usd).toBeUndefined();
  });
});

describe('reviewToDto run usage (GET /pulls/:id/reviews)', () => {
  const review = {
    id: 'rv1',
    prId: 'pr1',
    agentId: null,
    runId: 'run1',
    kind: 'review',
    verdict: 'comment',
    summary: null,
    score: 80,
    model: 'gpt-4.1',
    createdAt: new Date('2026-06-01T09:14:02Z'),
  } as never;

  it('carries cost + tokens of the review run', () => {
    const dto = reviewToDto(review, [], null, { costUsd: 0.014, tokensIn: 8200, tokensOut: 1300 });
    expect(dto).toMatchObject({ cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 });
  });

  it('nulls everything when the run is unknown', () => {
    const dto = reviewToDto(review, [], null, null);
    expect(dto).toMatchObject({ cost_usd: null, tokens_in: null, tokens_out: null });
  });
});
