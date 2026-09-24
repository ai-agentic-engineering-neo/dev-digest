import { describe, it, expect } from 'vitest';
import { callersDigest, hotFiles, rankNote, taskLine } from '../src/modules/reviews/domain/prompt.js';
import { finalStatusEvent, runEnding, RunCancelledError } from '../src/modules/reviews/domain/run.js';
import { referencedIds, withRunContext, type StoredReview } from '../src/modules/reviews/domain/review.js';

/**
 * Pure domain rules of the reviews module (no doubles). The key task-line
 * invariant: our trusted instruction always tells the model to review the whole
 * diff and never withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' };

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

describe('prompt enrichment', () => {
  it('callersDigest groups callers by file and is undefined when empty', () => {
    expect(callersDigest([])).toBeUndefined();
    const text = callersDigest([
      { file: 'a.ts', symbol: 'f', signature: 'f(x)' },
      { file: 'b.ts', symbol: 'g', signature: 'g()' },
      { file: 'a.ts', symbol: 'h', signature: 'h(y)' },
    ]);
    expect(text).toBe('### a.ts\n- `f` — f(x)\n- `h` — h(y)\n### b.ts\n- `g` — g()');
  });

  it('hot files are the top 5%; the note is empty when none is hot', () => {
    const hot = hotFiles([{ percentile: 94.9 }, { percentile: 95 }, { percentile: 99 }]);
    expect(hot).toHaveLength(2);
    expect(rankNote(2, 5)).toContain('2 of 5 changed file(s)');
    expect(rankNote(0, 5)).toBe('');
  });
});

describe('run lifecycle', () => {
  it('an error while cancelled is a cancel, not a failure', () => {
    const abort = Object.assign(new Error('Request was aborted.'), { name: 'AbortError' });
    expect(runEnding(abort, true)).toEqual({ status: 'cancelled', note: 'Cancelled by user' });
    expect(runEnding(new RunCancelledError(), false).status).toBe('cancelled');
    expect(runEnding(new Error('boom'), false)).toEqual({ status: 'failed', note: 'boom' });
  });

  it('finalStatusEvent: result for done, info (never error) otherwise', () => {
    const at = new Date('2026-09-22T10:11:12');
    expect(finalStatusEvent('r', 'done', null, at)).toMatchObject({ kind: 'result', msg: 'Run finished', t: '10:11:12' });
    expect(finalStatusEvent('r', 'failed', 'x', at)).toMatchObject({
      kind: 'info',
      msg: 'Run failed: x',
      data: { status: 'failed', error: 'x' },
    });
  });
});

describe('review read model', () => {
  const stored: StoredReview = {
    id: 'rv',
    pr_id: 'pr',
    agent_id: 'ag',
    run_id: 'run',
    kind: 'review',
    verdict: 'approve',
    summary: 's',
    score: 90,
    model: 'm',
    created_at: '2026-09-22T00:00:00.000Z',
    findings: [],
  };

  it('attaches the agent name, and usage keys only when the run exists', () => {
    const withUsage = withRunContext(stored, 'Sec', { tokensIn: 1, tokensOut: 2, costUsd: 0.5 });
    expect(withUsage).toMatchObject({ agent_name: 'Sec', tokens_in: 1, tokens_out: 2, cost_usd: 0.5 });
    const without = withRunContext(stored, undefined, undefined);
    expect(without.agent_name).toBeNull();
    expect('cost_usd' in without).toBe(false);
  });

  it('referencedIds dedupes agents and skips missing ids', () => {
    const ids = referencedIds([stored, { ...stored, id: 'rv2', run_id: null }, { ...stored, agent_id: null }]);
    expect(ids).toEqual({ agentIds: ['ag'], runIds: ['run', 'run'] });
  });
});
