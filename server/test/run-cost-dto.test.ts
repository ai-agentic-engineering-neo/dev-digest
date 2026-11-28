/**
 * Run cost on the PR page: the review DTO carries the usage (cost + tokens) of
 * the agent run that produced it, and a review without a completed run shows
 * no price (null), never a fake $0.
 */
import { describe, it, expect } from 'vitest';
import { reviewToDto } from '../src/modules/reviews/helpers.js';
import type { ReviewRow } from '../src/modules/reviews/repository.js';

function review(o: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: 'rev-1',
    workspaceId: 'ws-1',
    prId: 'pr-1',
    agentId: 'agent-1',
    runId: 'run-1',
    kind: 'review',
    verdict: 'comment',
    summary: 'ok',
    score: 80,
    model: 'deepseek/deepseek-v4-flash',
    createdAt: new Date('2026-11-28T09:00:00Z'),
    ...o,
  } as ReviewRow;
}

describe('reviewToDto run usage', () => {
  it('exposes cost and tokens of the run behind the review', () => {
    const dto = reviewToDto(review(), [], 'General Reviewer', {
      costUsd: 0.0017,
      tokensIn: 16181,
      tokensOut: 1214,
    });
    expect(dto.cost_usd).toBe(0.0017);
    expect(dto.tokens_in).toBe(16181);
    expect(dto.tokens_out).toBe(1214);
  });

  it('returns nulls when the run usage is unknown', () => {
    const dto = reviewToDto(review({ runId: null }), [], null, null);
    expect(dto.cost_usd).toBeNull();
    expect(dto.tokens_in).toBeNull();
    expect(dto.tokens_out).toBeNull();
  });

  it('keeps a null cost null even when tokens are known', () => {
    const dto = reviewToDto(review(), [], null, { costUsd: null, tokensIn: 10, tokensOut: 2 });
    expect(dto.cost_usd).toBeNull();
    expect(dto.tokens_in).toBe(10);
  });
});
