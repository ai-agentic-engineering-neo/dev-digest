import { describe, it, expect } from 'vitest';
import { normalizeAgentIds, taskLine } from '../src/modules/reviews/helpers.js';

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

/**
 * Multi-agent selection. The invariants that matter: the user's pick order is
 * the run order, and one agent is never run twice in a single request (that
 * would be duplicate runs and double the spend).
 */
describe('normalizeAgentIds', () => {
  it('keeps the caller order — run order is the order the user picked', () => {
    expect(normalizeAgentIds(['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('collapses duplicates to the first occurrence', () => {
    expect(normalizeAgentIds(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('drops blank and whitespace-only ids, trimming the rest', () => {
    expect(normalizeAgentIds([' a ', '', '   ', 'b'])).toEqual(['a', 'b']);
  });

  it('returns an empty array when nothing usable is left (the 400 case)', () => {
    expect(normalizeAgentIds([])).toEqual([]);
    expect(normalizeAgentIds(['', '  '])).toEqual([]);
  });
});
