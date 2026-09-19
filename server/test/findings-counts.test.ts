/**
 * PR-list FINDINGS column reducer (`modules/pulls/findings-counts.ts`) — pure
 * grouping/summing over already-fetched `findings ⋈ reviews` rows, unit-tested
 * without a DB. Counts each agent's LATEST review only (mirrors the SCORE
 * column's "latest review" rule, generalized across agents, so a re-run
 * replaces its agent's contribution instead of piling on top of it). Rows
 * must arrive newest-review-first per PR, same convention as the score and
 * cost reducers.
 */
import { describe, it, expect } from 'vitest';
import { findingsCountsByPr } from '../src/modules/pulls/findings-counts.js';

describe('findingsCountsByPr', () => {
  it('counts severities for a single review', () => {
    const result = findingsCountsByPr([
      { prId: 'pr1', agentId: 'a1', reviewId: 'rev1', severity: 'CRITICAL' },
      { prId: 'pr1', agentId: 'a1', reviewId: 'rev1', severity: 'WARNING' },
      { prId: 'pr1', agentId: 'a1', reviewId: 'rev1', severity: 'WARNING' },
    ]);
    expect(result.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 2 });
  });

  it('sums across different agents (each agent contributes its latest review)', () => {
    const result = findingsCountsByPr([
      { prId: 'pr1', agentId: 'security', reviewId: 'rev2', severity: 'CRITICAL' },
      { prId: 'pr1', agentId: 'perf', reviewId: 'rev1', severity: 'WARNING' },
    ]);
    expect(result.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 1 });
  });

  it('ignores an older review from an agent once a newer one from that agent is seen', () => {
    // Rows newest-first: rev2 (agent a1's latest) appears before rev1 (stale).
    const result = findingsCountsByPr([
      { prId: 'pr1', agentId: 'a1', reviewId: 'rev2', severity: 'CRITICAL' },
      { prId: 'pr1', agentId: 'a1', reviewId: 'rev1', severity: 'SUGGESTION' },
    ]);
    expect(result.get('pr1')).toEqual({ CRITICAL: 1 });
  });

  it('treats a null agentId review as its own independent group', () => {
    const result = findingsCountsByPr([
      { prId: 'pr1', agentId: null, reviewId: 'rev1', severity: 'WARNING' },
      { prId: 'pr1', agentId: null, reviewId: 'rev2', severity: 'SUGGESTION' },
    ]);
    expect(result.get('pr1')).toEqual({ WARNING: 1, SUGGESTION: 1 });
  });

  it('keeps PRs independent', () => {
    const result = findingsCountsByPr([
      { prId: 'pr1', agentId: 'a1', reviewId: 'rev1', severity: 'CRITICAL' },
      { prId: 'pr2', agentId: 'a1', reviewId: 'rev2', severity: 'WARNING' },
    ]);
    expect(result.get('pr1')).toEqual({ CRITICAL: 1 });
    expect(result.get('pr2')).toEqual({ WARNING: 1 });
  });

  it('a PR with no findings rows is absent from the map', () => {
    expect(findingsCountsByPr([]).has('pr1')).toBe(false);
  });
});
