import { describe, it, expect } from 'vitest';
import { taskLine, reviewToDto } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('reviewToDto', () => {
  function row(costUsd: number | null) {
    return {
      id: 'rev-1',
      workspaceId: 'ws-1',
      prId: 'pr-1',
      agentId: 'a1',
      runId: 'run-1',
      kind: 'review',
      verdict: 'comment',
      summary: 'ok',
      score: 80,
      model: 'gpt-4.1',
      costUsd,
      createdAt: new Date('2026-06-11T18:44:34.000Z'),
    } as never;
  }

  it('passes the run cost through to cost_usd', () => {
    const dto = reviewToDto(row(0.014), [], 'Security');
    expect(dto.cost_usd).toBe(0.014);
  });

  it('is null when the run cost is unknown', () => {
    const dto = reviewToDto(row(null), [], 'Security');
    expect(dto.cost_usd).toBeNull();
  });
});
